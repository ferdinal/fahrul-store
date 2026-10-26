import { Router, type Router as ExpressRouter } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';

import {
  ProductionLotModel,
  ProductionOrderModel,
  ProductionTransferModel,
  User,
} from '@fahrul-store/database';

import {
  authenticate,
  requireRole,
  type AuthRequest,
} from '../middlewares/auth.middleware.js';

type AnyRecord = Record<string, any>;

type TransferResponseData = {
  duplicate: boolean;
  transfers: unknown[];
};

const router: ExpressRouter = Router();

router.use(authenticate, requireRole('operator'));

const oid = (value: string) => new mongoose.Types.ObjectId(value);

const transferSchema = z
  .object({
    targetOperatorIds: z
      .array(z.string().refine(mongoose.isValidObjectId))
      .min(1)
      .max(50)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        'Operator penerima tidak boleh duplikat.',
      ),
    sourceLotId: z.string().refine(mongoose.isValidObjectId),
    quantity: z.number().int().positive().safe(),
    idempotencyKey: z.string().trim().min(1).max(150),
    notes: z.string().trim().max(2000).optional().default(''),
  })
  .strict();

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

function serializeStep(step: AnyRecord) {
  return {
    _id: step._id,
    process: step.process,
    processName: step.processName,
    processCode: step.processCode,
    sequence: step.sequence,
    dependsOn: step.dependsOn ?? [],
    status: step.status,
    assignments: step.assignments ?? [],
    ownerOperator: step.ownerOperator ?? null,
    claimedAt: step.claimedAt ?? null,
    startedAt: step.startedAt ?? null,
    completedAt: step.completedAt ?? null,
    quantityProcessed: step.quantityProcessed ?? 0,
    quantityGood: step.quantityGood ?? 0,
    quantityScrap: step.quantityScrap ?? 0,
  };
}

function serializeOrder(order: AnyRecord) {
  return {
    _id: order._id,
    orderNumber: order.orderNumber,
    quantity: order.quantity,
    product: order.product,
    batch: order.batch,
    status: order.status,
    steps: (order.steps ?? []).map((step: AnyRecord) => serializeStep(step)),
  };
}

function isAssigned(step: AnyRecord, operatorId: string) {
  return (step.assignments ?? []).some(
    (assignment: AnyRecord) =>
      String(assignment.assignedOperator ?? '') === operatorId,
  );
}

// Penugasan admin berada pada Production Order (umumnya melalui proses pertama).
// Karena operator memilih proses dari daftar proses PO, akses tidak dibatasi
// hanya pada step yang memiliki assignment tersendiri.
function isOrderAssigned(order: AnyRecord, operatorId: string) {
  return (order.steps ?? []).some((step: AnyRecord) =>
    isAssigned(step, operatorId),
  );
}

function stepInputLotQuery(orderId: unknown, step: AnyRecord) {
  const dependencies = (step.dependsOn ?? []).map(String);

  if (!dependencies.length) {
    return {
      productionOrder: orderId,
      sourceStepId: null,
      status: 'active',
      availableQuantity: { $gt: 0 },
    };
  }

  return {
    productionOrder: orderId,
    sourceStepId: { $in: dependencies.map(oid) },
    sourceResult: { $ne: null },
    status: 'active',
    availableQuantity: { $gt: 0 },
  };
}

// GET /available
// Mengirim semua proses dari setiap Production Order yang ditugaskan kepada
// operator. Proses yang belum siap tetap ditampilkan dengan canStart=false,
// agar operator melihat alur proses produk secara utuh.
router.get('/available', async (req: AuthRequest, res) => {
  const operatorId = req.user?.userId;

  if (!operatorId || !mongoose.isValidObjectId(operatorId)) {
    return res.status(401).json({
      success: false,
      message: 'Operator tidak valid.',
    });
  }

  try {
    const orders = (await ProductionOrderModel.find({
      status: { $nin: ['cancelled', 'completed'] },
      'steps.assignments.assignedOperator': oid(operatorId),
    })
      .populate('product', 'name')
      .populate('batch', 'batchNumber')
      .lean()) as AnyRecord[];

    const data: AnyRecord[] = [];

    for (const order of orders) {
      const steps = (order.steps ?? []) as AnyRecord[];
      if (!isOrderAssigned(order, operatorId)) continue;

      for (const step of steps) {
        const lots = (await ProductionLotModel.find(
          stepInputLotQuery(order._id, step),
        )
          .select(
            '_id lotCode availableQuantity quantity sourceStepId status sourceResult',
          )
          .lean()) as AnyRecord[];

        const availableQuantity = lots.reduce(
          (sum, lot) => sum + Number(lot.availableQuantity ?? 0),
          0,
        );
        let canStart = true;
        let blockedReason = '';

        if (step.ownerOperator != null) {
          canStart = false;
          blockedReason =
            String(step.ownerOperator) === operatorId
              ? 'Proses sudah menjadi tanggung jawab Anda.'
              : 'Proses sudah diambil operator lain.';
        } else if (!['planned', 'partially_completed'].includes(step.status)) {
          canStart = false;
          blockedReason =
            step.status === 'completed'
              ? 'Proses sudah selesai.'
              : step.status === 'cancelled'
                ? 'Proses dibatalkan.'
                : 'Status proses belum dapat dimulai.';
        } else {
          for (const dependencyId of (step.dependsOn ?? []).map(String)) {
            const dependencyStep = steps.find(
              (item: AnyRecord) => String(item._id) === dependencyId,
            );
            if (!dependencyStep || dependencyStep.status !== 'completed') {
              canStart = false;
              blockedReason = 'Menunggu proses sebelumnya selesai.';
              break;
            }
            const dependencyLot = await ProductionLotModel.exists({
              productionOrder: order._id,
              sourceStepId: oid(dependencyId),
              sourceResult: { $ne: null },
              status: 'active',
              availableQuantity: { $gt: 0 },
            });
            if (!dependencyLot) {
              canStart = false;
              blockedReason = 'Output proses sebelumnya belum tersedia.';
              break;
            }
          }
          if (canStart && availableQuantity < 1) {
            canStart = false;
            blockedReason = 'Belum ada stok input yang tersedia.';
          }
        }

        data.push({
          order: serializeOrder(order),
          step: serializeStep(step),
          inputLots: lots,
          availableQuantity,
          canStart,
          blockedReason,
        });
      }
    }

    data.sort((a, b) => {
      const orderCompare = String(a.order.orderNumber).localeCompare(
        String(b.order.orderNumber),
      );
      return (
        orderCompare ||
        Number(a.step.sequence ?? 0) - Number(b.step.sequence ?? 0)
      );
    });

    return res.json({ success: true, data });
  } catch (error) {
    console.error('GET operator-work/available:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil daftar proses Production Order.',
    });
  }
});

// GET /mine
router.get('/mine', async (req: AuthRequest, res) => {
  const operatorId = req.user?.userId;
  if (!operatorId || !mongoose.isValidObjectId(operatorId)) {
    return res
      .status(401)
      .json({ success: false, message: 'Operator tidak valid.' });
  }

  try {
    const orders = (await ProductionOrderModel.find({
      'steps.ownerOperator': oid(operatorId),
      status: { $nin: ['cancelled'] },
    })
      .populate('product', 'name')
      .populate('batch', 'batchNumber')
      .lean()) as AnyRecord[];

    const data: AnyRecord[] = [];
    for (const order of orders) {
      for (const step of (order.steps ?? []) as AnyRecord[]) {
        if (String(step.ownerOperator ?? '') !== operatorId) continue;

        const inputLots = (await ProductionLotModel.find(
          stepInputLotQuery(order._id, step),
        )
          .select('_id lotCode availableQuantity quantity sourceStepId status')
          .lean()) as AnyRecord[];
        const outputLots = (await ProductionLotModel.find({
          productionOrder: order._id,
          sourceStepId: step._id,
          sourceResult: { $ne: null },
          status: 'active',
          availableQuantity: { $gt: 0 },
        })
          .select(
            '_id lotCode availableQuantity quantity sourceStepId status sourceResult',
          )
          .lean()) as AnyRecord[];

        data.push({
          order: serializeOrder(order),
          step: serializeStep(step),
          inputLots,
          availableQuantity: inputLots.reduce(
            (sum, lot) => sum + Number(lot.availableQuantity ?? 0),
            0,
          ),
          outputLots,
          outputAvailableQuantity: outputLots.reduce(
            (sum, lot) => sum + Number(lot.availableQuantity ?? 0),
            0,
          ),
        });
      }
    }

    return res.json({ success: true, data });
  } catch (error) {
    console.error('GET operator-work/mine:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil proses milik Operator.',
    });
  }
});

// POST /orders/:orderId/steps/:stepId/start
router.post(
  '/orders/:orderId/steps/:stepId/start',
  async (req: AuthRequest, res) => {
    const orderId = String(req.params.orderId ?? '');
    const stepId = String(req.params.stepId ?? '');
    const operatorId = req.user?.userId;

    if (
      !mongoose.isValidObjectId(orderId) ||
      !mongoose.isValidObjectId(stepId)
    ) {
      return res.status(400).json({
        success: false,
        message: 'ID Production Order atau step tidak valid.',
      });
    }

    if (!operatorId || !mongoose.isValidObjectId(operatorId)) {
      return res.status(401).json({
        success: false,
        message: 'Operator tidak valid.',
      });
    }

    try {
      const order = (await ProductionOrderModel.findById(
        orderId,
      ).lean()) as AnyRecord | null;

      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Production Order tidak ditemukan.',
        });
      }

      const step = (order.steps ?? []).find(
        (item: AnyRecord) => String(item._id) === stepId,
      ) as AnyRecord | undefined;

      if (!step) {
        return res.status(404).json({
          success: false,
          message: 'Step tidak ditemukan.',
        });
      }

      if (String(step.ownerOperator ?? '') === operatorId) {
        return res.status(409).json({
          success: false,
          message:
            'Proses sudah diklaim oleh akun ini. Lanjutkan dari tab Pekerjaan saya; proses tidak perlu dipilih ulang.',
        });
      }

      if (step.ownerOperator != null) {
        return res.status(409).json({
          success: false,
          message: 'Proses sudah dimiliki Operator lain.',
        });
      }

      if (!['planned', 'partially_completed'].includes(step.status)) {
        return res.status(409).json({
          success: false,
          message: 'Status proses tidak dapat dimulai.',
        });
      }

      if (!isOrderAssigned(order, operatorId)) {
        return res.status(403).json({
          success: false,
          message: 'Production Order ini tidak ditugaskan kepada Anda.',
        });
      }

      // Klaim hanya mengunci step yang dipilih. Operator boleh mengambil proses
      // lebih awal meskipun lot input/dependency belum tersedia; pencatatan hasil
      // tetap memerlukan lot input aktif.

      const now = new Date();

      // PENTING: jangan gunakan positional operator `steps.$` di sini.
      // Query juga memeriksa assignment pada array `steps`, sehingga positional
      // `$` dapat terikat ke elemen array yang berbeda dari stepId yang dipilih.
      // `arrayFilters` memastikan hanya elemen dengan _id == stepId yang diubah.
      const claimed = (await ProductionOrderModel.findOneAndUpdate(
        {
          _id: oid(orderId),
          status: { $nin: ['cancelled', 'completed'] },
          'steps._id': oid(stepId),
          'steps.assignments.assignedOperator': oid(operatorId),
        },
        {
          $set: {
            'steps.$[target].ownerOperator': oid(operatorId),
            'steps.$[target].claimedAt': now,
            'steps.$[target].startedAt': now,
            'steps.$[target].status': 'in_progress',
            status: 'in_progress',
            startedAt: now,
          },
        },
        {
          new: true,
          runValidators: true,
          arrayFilters: [
            {
              'target._id': oid(stepId),
              'target.ownerOperator': null,
              'target.status': { $in: ['planned', 'partially_completed'] },
            },
          ],
        },
      ).lean()) as AnyRecord | null;

      if (!claimed) {
        return res.status(409).json({
          success: false,
          message:
            'Proses telah diambil operator lain atau datanya berubah. Muat ulang pekerjaan.',
        });
      }

      const claimedStep = (claimed.steps ?? []).find(
        (item: AnyRecord) => String(item._id) === stepId,
      );

      return res.json({
        success: true,
        message: 'Proses berhasil dimulai.',
        data: {
          orderId,
          step: claimedStep ? serializeStep(claimedStep) : null,
        },
      });
    } catch (error) {
      console.error('POST operator-work/start:', error);

      return res.status(500).json({
        success: false,
        message: 'Gagal memulai proses.',
      });
    }
  },
);

// POST /orders/:orderId/steps/:sourceStepId/assignments
// Transfer kuantitas dilakukan dalam satu transaksi; proses tujuan dipilih penerima.
router.post(
  '/orders/:orderId/steps/:sourceStepId/assignments',
  async (req: AuthRequest, res) => {
    const orderId = String(req.params.orderId ?? '');
    const sourceStepId = String(req.params.sourceStepId ?? '');
    const operatorId = req.user?.userId;

    if (
      !mongoose.isValidObjectId(orderId) ||
      !mongoose.isValidObjectId(sourceStepId)
    ) {
      return res.status(400).json({
        success: false,
        message: 'ID Production Order atau step sumber tidak valid.',
      });
    }

    if (!operatorId || !mongoose.isValidObjectId(operatorId)) {
      return res.status(401).json({
        success: false,
        message: 'Operator tidak valid.',
      });
    }

    const parsed = transferSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Data transfer tidak valid.',
        errors: parsed.error.issues,
      });
    }

    const input = parsed.data;
    const session = await mongoose.startSession();

    try {
      // Gunakan holder object karena TypeScript tidak selalu melacak assignment
      // yang terjadi di dalam callback withTransaction.
      const responseHolder: { value: TransferResponseData | null } = {
        value: null,
      };

      await session.withTransaction(async () => {
        const transferKeys = input.targetOperatorIds.map(
          (recipientId) => `${input.idempotencyKey}-${recipientId}`,
        );
        const duplicates = await ProductionTransferModel.find({
          productionOrder: oid(orderId),
          idempotencyKey: { $in: transferKeys },
        })
          .session(session)
          .lean();

        if (duplicates.length > 0) {
          if (duplicates.length !== input.targetOperatorIds.length) {
            throw httpError(
              409,
              'Ditemukan transfer sebagian dengan idempotency key yang sama. Muat ulang data sebelum mencoba lagi.',
            );
          }
          responseHolder.value = { duplicate: true, transfers: duplicates };
          return;
        }

        const order = (await ProductionOrderModel.findById(orderId).session(
          session,
        )) as AnyRecord | null;

        if (!order) {
          throw httpError(404, 'Production Order tidak ditemukan.');
        }

        const steps: AnyRecord[] = order.steps ?? [];

        const sourceStep = steps.find(
          (step) => String(step._id) === sourceStepId,
        );

        if (!sourceStep) {
          throw httpError(404, 'Step sumber tidak ditemukan.');
        }

        if (String(sourceStep.ownerOperator ?? '') !== operatorId) {
          throw httpError(
            403,
            'Hanya pemilik proses sumber yang dapat mentransfer barang.',
          );
        }

        if (
          !['completed', 'partially_completed'].includes(
            String(sourceStep.status),
          )
        ) {
          throw httpError(
            409,
            'Catat hasil baik terlebih dahulu sebelum hasilnya dapat ditransfer.',
          );
        }

        const hasNextProcess = steps.some(
          (step) =>
            (step.dependsOn ?? []).some(
              (dependencyId: unknown) => String(dependencyId) === sourceStepId,
            ) && !['cancelled'].includes(String(step.status)),
        );
        if (!hasNextProcess) {
          throw httpError(
            409,
            'Proses sumber tidak memiliki proses lanjutan yang menerima transfer.',
          );
        }

        if (input.targetOperatorIds.includes(operatorId)) {
          throw httpError(
            400,
            'Operator tidak dapat menjadi penerima transfer untuk dirinya sendiri.',
          );
        }

        const recipients = await User.find({
          _id: { $in: input.targetOperatorIds.map(oid) },
          role: 'operator',
        })
          .select('_id username email')
          .session(session)
          .lean();

        if (recipients.length !== input.targetOperatorIds.length) {
          throw httpError(
            400,
            'Satu atau beberapa Operator penerima tidak valid.',
          );
        }

        if (input.quantity < recipients.length) {
          throw httpError(
            400,
            'Jumlah transfer harus minimal satu unit untuk setiap operator penerima.',
          );
        }

        // Transfer hanya boleh mengambil output baik yang benar-benar dihasilkan
        // oleh proses sumber; root lot/input dependency tidak boleh ditransfer.
        const sourceLot = await ProductionLotModel.findOne({
          _id: oid(input.sourceLotId),
          productionOrder: order._id,
          sourceStepId: sourceStep._id,
          sourceResult: { $ne: null },
          status: 'active',
          availableQuantity: { $gt: 0 },
        }).session(session);

        if (!sourceLot) {
          throw httpError(
            404,
            'Lot sumber aktif tidak ditemukan, bukan lot input/keluaran proses ini, atau bukan milik Production Order ini.',
          );
        }

        const decremented = await ProductionLotModel.updateOne(
          {
            _id: sourceLot._id,
            availableQuantity: { $gte: input.quantity },
            status: 'active',
          },
          { $inc: { availableQuantity: -input.quantity } },
          { session },
        );

        if (decremented.modifiedCount !== 1) {
          throw httpError(
            409,
            'Jumlah tersedia pada lot sumber tidak mencukupi. Muat ulang data lot.',
          );
        }

        // Total kuantitas dikurangi dari lot sumber satu kali, lalu dibagi
        // rata ke penerima. Sisa pembagian diberikan ke penerima lebih awal.
        const baseQuantity = Math.floor(input.quantity / recipients.length);
        let remainder = input.quantity % recipients.length;
        const createdTransfers: AnyRecord[] = [];

        for (const recipientId of input.targetOperatorIds) {
          const recipient = recipients.find(
            (item: AnyRecord) => String(item._id) === recipientId,
          );
          if (!recipient) {
            throw httpError(400, 'Operator penerima tidak valid.');
          }

          const recipientQuantity = baseQuantity + (remainder > 0 ? 1 : 0);
          if (remainder > 0) remainder -= 1;
          const recipientKey = `${input.idempotencyKey}-${recipientId}`;
          const safeKey = recipientKey
            .replace(/[^a-zA-Z0-9_-]/g, '-')
            .slice(0, 150);

          const targetLot = new ProductionLotModel({
            productionOrder: order._id,
            product: order.product,
            lotCode:
              `${String(order.orderNumber).replace(/[^a-zA-Z0-9_-]/g, '-')}-T-${safeKey}`.slice(
                0,
                190,
              ),
            parentLot: sourceLot._id,
            sourceStepId: sourceStep._id,
            // Lot transfer tetap merujuk hasil produksi yang menghasilkan output asli.
            sourceResult: sourceLot.sourceResult,
            quantity: recipientQuantity,
            availableQuantity: recipientQuantity,
            status: 'active',
            notes: input.notes,
          });
          await targetLot.save({ session });

          const transfer = new ProductionTransferModel({
            productionOrder: order._id,
            sourceStepId: sourceStep._id,
            targetStepId: null,
            sourceLot: sourceLot._id,
            targetLot: targetLot._id,
            quantity: recipientQuantity,
            transferredBy: oid(operatorId),
            assignedOperator: oid(recipientId),
            idempotencyKey: recipientKey,
            notes: input.notes,
            transferredAt: new Date(),
          });
          await transfer.save({ session });
          createdTransfers.push({
            transfer,
            targetLot,
            targetStep: null,
            assignedOperator: recipient,
          });
        }

        responseHolder.value = {
          duplicate: false,
          transfers: createdTransfers,
        };
      });

      // Baca hasil setelah transaksi selesai.
      const result = responseHolder.value as TransferResponseData | null;

      if (!result) {
        throw new Error('Transaksi selesai tanpa menghasilkan data transfer.');
      }

      if (result.duplicate) {
        return res.status(200).json({
          success: true,
          message: 'Transfer untuk operator terpilih sudah pernah dicatat.',
          data: result.transfers,
        });
      }

      return res.status(201).json({
        success: true,
        message: 'Transfer barang berhasil dibagi ke operator terpilih.',
        data: result.transfers,
      });
    } catch (error) {
      const err = error as Error & {
        status?: number;
        code?: number;
      };

      if (err.code === 11000) {
        const duplicate = await ProductionTransferModel.find({
          productionOrder: oid(orderId),
          idempotencyKey: {
            $in: input.targetOperatorIds.map(
              (id) => `${input.idempotencyKey}-${id}`,
            ),
          },
        }).lean();

        if (duplicate.length === input.targetOperatorIds.length) {
          return res.status(200).json({
            success: true,
            message: 'Transfer untuk operator terpilih sudah pernah dicatat.',
            data: duplicate,
          });
        }
      }

      const status = err.status ?? 500;

      if (status === 500) {
        console.error('POST operator-work/transfer:', error);
      }

      return res.status(status).json({
        success: false,
        message: err.message || 'Gagal mentransfer barang.',
      });
    } finally {
      await session.endSession();
    }
  },
);

// GET /incoming-transfers
// Transfer yang sudah diterima operator tetapi proses tujuannya belum dipilih.
router.get('/incoming-transfers', async (req: AuthRequest, res) => {
  const operatorId = req.user?.userId;
  if (!operatorId || !mongoose.isValidObjectId(operatorId)) {
    return res
      .status(401)
      .json({ success: false, message: 'Operator tidak valid.' });
  }

  try {
    const transfers = (await ProductionTransferModel.find({
      assignedOperator: oid(operatorId),
      targetStepId: null,
    })
      .sort({ transferredAt: -1 })
      .lean()) as AnyRecord[];

    const data: AnyRecord[] = [];
    for (const transfer of transfers) {
      const order = (await ProductionOrderModel.findById(
        transfer.productionOrder,
      )
        .populate('product', 'name')
        .populate('batch', 'batchNumber')
        .lean()) as AnyRecord | null;
      if (!order) continue;

      const steps: AnyRecord[] = order.steps ?? [];
      const sourceStep = steps.find(
        (step) => String(step._id) === String(transfer.sourceStepId),
      );
      if (
        !sourceStep ||
        !['completed', 'partially_completed'].includes(
          String(sourceStep.status),
        )
      )
        continue;
      const transferLot = (await ProductionLotModel.findOne({
        _id: transfer.targetLot,
        productionOrder: order._id,
        sourceStepId: sourceStep._id,
        sourceResult: { $ne: null },
        status: 'active',
        availableQuantity: { $gt: 0 },
      }).lean()) as AnyRecord | null;
      // Sembunyikan transfer lama yang dibuat dari input/root lot, bukan hasil proses.
      if (!transferLot) continue;
      const eligibleSteps: AnyRecord[] = [];

      for (const step of steps) {
        if (String(step._id) === String(transfer.sourceStepId)) continue;
        if (!['planned', 'partially_completed'].includes(step.status)) continue;
        // Proses yang sudah diklaim siapa pun tidak boleh dipilih ulang.
        // Proses milik operator sendiri tetap dikelola dari tab Pekerjaan saya.
        if (step.ownerOperator != null) continue;
        if (
          (step.assignments ?? []).some(
            (assignment: AnyRecord) =>
              String(assignment.assignedOperator ?? '') !== operatorId,
          )
        )
          continue;
        if (
          !(step.dependsOn ?? []).some(
            (id: unknown) => String(id) === String(transfer.sourceStepId),
          )
        )
          continue;
        if (
          (step.assignments ?? []).some(
            (assignment: AnyRecord) =>
              String(assignment.sourceTransfer ?? '') === String(transfer._id),
          )
        )
          continue;

        const dependencyIds = (step.dependsOn ?? []).map(String);
        let allDependenciesAvailable = true;
        for (const dependencyId of dependencyIds) {
          const dependencyStep = steps.find(
            (item) => String(item._id) === dependencyId,
          );
          if (!dependencyStep || dependencyStep.status !== 'completed') {
            allDependenciesAvailable = false;
            break;
          }
          const dependencyLot = await ProductionLotModel.exists({
            productionOrder: order._id,
            sourceStepId: oid(dependencyId),
            sourceResult: { $ne: null },
            status: 'active',
            availableQuantity: { $gt: 0 },
          });
          if (!dependencyLot) {
            allDependenciesAvailable = false;
            break;
          }
        }
        if (allDependenciesAvailable) eligibleSteps.push(serializeStep(step));
      }

      data.push({
        transfer,
        order: serializeOrder(order),
        sourceStep: sourceStep ? serializeStep(sourceStep) : null,
        eligibleSteps,
      });
    }

    return res.json({ success: true, data });
  } catch (error) {
    console.error('GET operator-work/incoming-transfers:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Gagal mengambil transfer masuk.' });
  }
});

const selectProcessesSchema = z
  .object({
    stepIds: z
      .array(z.string().refine(mongoose.isValidObjectId))
      .min(1)
      .max(20),
  })
  .strict();

// POST /transfers/:transferId/select-processes
// Penerima menentukan proses setelah transfer masuk. Kuantitas lot tidak digandakan;
// semua proses terpilih merujuk ke lot transfer yang sama dan stoknya tetap dibatasi atomik.
router.post(
  '/transfers/:transferId/select-processes',
  async (req: AuthRequest, res) => {
    const transferId = String(req.params.transferId ?? '');
    const operatorId = req.user?.userId;
    if (!mongoose.isValidObjectId(transferId)) {
      return res
        .status(400)
        .json({ success: false, message: 'ID transfer tidak valid.' });
    }
    if (!operatorId || !mongoose.isValidObjectId(operatorId)) {
      return res
        .status(401)
        .json({ success: false, message: 'Operator tidak valid.' });
    }

    const parsed = selectProcessesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Pilih minimal satu proses yang valid.',
        errors: parsed.error.issues,
      });
    }
    const uniqueStepIds = [...new Set(parsed.data.stepIds)];
    const session = await mongoose.startSession();
    try {
      let responseData: AnyRecord | null = null;
      await session.withTransaction(async () => {
        const transfer = (await ProductionTransferModel.findOne({
          _id: oid(transferId),
          assignedOperator: oid(operatorId),
          targetStepId: null,
        }).session(session)) as AnyRecord | null;
        if (!transfer)
          throw httpError(
            404,
            'Transfer masuk tidak ditemukan atau sudah dipilih prosesnya.',
          );

        const order = (await ProductionOrderModel.findById(
          transfer.productionOrder,
        ).session(session)) as AnyRecord | null;
        if (!order) throw httpError(404, 'Production Order tidak ditemukan.');
        const steps: AnyRecord[] = order.steps ?? [];
        const sourceStepId = String(transfer.sourceStepId);
        const selectedSteps: AnyRecord[] = [];

        const sourceStep = steps.find(
          (step) => String(step._id) === sourceStepId,
        );
        if (
          !sourceStep ||
          !['completed', 'partially_completed'].includes(
            String(sourceStep.status),
          )
        ) {
          throw httpError(
            409,
            'Proses sumber harus memiliki hasil yang sudah dicatat sebelum transfer dipilih.',
          );
        }
        const targetLot = await ProductionLotModel.findOne({
          _id: transfer.targetLot,
          productionOrder: order._id,
          sourceStepId: sourceStep._id,
          sourceResult: { $ne: null },
          status: 'active',
          availableQuantity: { $gt: 0 },
        }).session(session);
        if (!targetLot)
          throw httpError(
            409,
            'Lot transfer tidak memiliki kuantitas tersedia.',
          );

        for (const stepId of uniqueStepIds) {
          const step = steps.find((item) => String(item._id) === stepId);
          if (!step)
            throw httpError(
              404,
              `Proses ${stepId} tidak ditemukan pada Production Order.`,
            );
          if (!['planned', 'partially_completed'].includes(step.status))
            throw httpError(
              409,
              `Proses ${step.processName ?? stepId} tidak dapat dipilih karena statusnya ${step.status}.`,
            );
          if (step.ownerOperator != null)
            throw httpError(
              409,
              `Proses ${step.processName ?? stepId} sudah diklaim dan tidak dapat dipilih ulang.`,
            );
          if (
            (step.assignments ?? []).some(
              (assignment: AnyRecord) =>
                String(assignment.assignedOperator ?? '') !== operatorId,
            )
          )
            throw httpError(
              409,
              `Proses ${step.processName ?? stepId} sudah ditugaskan ke operator lain.`,
            );
          if (
            !(step.dependsOn ?? []).some(
              (id: unknown) => String(id) === sourceStepId,
            )
          )
            throw httpError(
              400,
              `Proses ${step.processName ?? stepId} tidak bergantung pada proses sumber transfer.`,
            );

          const existingTransferAssignment = (step.assignments ?? []).some(
            (assignment: AnyRecord) =>
              String(assignment.sourceTransfer ?? '') === transferId,
          );
          if (existingTransferAssignment)
            throw httpError(
              409,
              `Transfer ini sudah ditautkan ke proses ${step.processName ?? stepId}.`,
            );

          for (const dependencyId of (step.dependsOn ?? []).map(String)) {
            const dependencyStep = steps.find(
              (item) => String(item._id) === dependencyId,
            );
            if (!dependencyStep || dependencyStep.status !== 'completed') {
              throw httpError(
                409,
                `Dependensi proses ${step.processName ?? stepId} belum selesai.`,
              );
            }
            const dependencyLot = await ProductionLotModel.exists({
              productionOrder: order._id,
              sourceStepId: oid(dependencyId),
              sourceResult: { $ne: null },
              status: 'active',
              availableQuantity: { $gt: 0 },
            }).session(session);
            if (!dependencyLot)
              throw httpError(
                409,
                `Dependensi proses ${step.processName ?? stepId} belum memiliki kuantitas tersedia.`,
              );
          }
          selectedSteps.push(step);
        }

        for (const step of selectedSteps) {
          step.assignments = step.assignments ?? [];
          const alreadyAssigned = step.assignments.some(
            (assignment: AnyRecord) =>
              String(assignment.assignedOperator ?? '') === operatorId,
          );
          if (!alreadyAssigned) {
            step.assignments.push({
              assignedBy: transfer.transferredBy,
              assignedOperator: oid(operatorId),
              quantity: Number(transfer.quantity),
              sourceTransfer: transfer._id,
              assignedAt: new Date(),
              notes: transfer.notes ?? '',
            });
          }
        }

        // targetStepId menjadi referensi proses utama; assignment tiap proses tetap
        // menyimpan sourceTransfer yang sama. Stok fisik tetap satu lot bersama.
        const firstSelectedStep = selectedSteps[0];

        if (!firstSelectedStep) {
          throw httpError(400, 'Pilih minimal satu proses.');
        }

        transfer.targetStepId = firstSelectedStep._id;
        await order.save({ session });
        await transfer.save({ session });
        responseData = {
          transfer,
          selectedSteps: selectedSteps.map(serializeStep),
          orderId: order._id,
          quantity: Number(transfer.quantity),
        };
      });

      return res.json({
        success: true,
        message: 'Proses pilihan berhasil disimpan.',
        data: responseData,
      });
    } catch (error) {
      const err = error as Error & { status?: number };
      if ((err.status ?? 500) === 500)
        console.error('POST operator-work/select-processes:', error);
      return res.status(err.status ?? 500).json({
        success: false,
        message: err.message || 'Gagal memilih proses.',
      });
    } finally {
      await session.endSession();
    }
  },
);

// GET /operators
router.get('/operators', async (_req: AuthRequest, res) => {
  try {
    const operators = await User.find({ role: 'operator' })
      .select('_id username email role')
      .sort({ username: 1 })
      .lean();

    return res.json({ success: true, data: operators });
  } catch (error) {
    console.error('GET operator-work/operators:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil daftar Operator.',
    });
  }
});

export default router;
