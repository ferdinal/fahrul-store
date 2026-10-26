import { Router, type Router as ExpressRouter } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import {
  FinishedGoodsInventoryModel,
  ProductModel,
  ProductionBatchModel,
  ProductionLotModel,
  ProductionOrderModel,
  ProductionResultModel,
  StockMovementModel,
} from '@fahrul-store/database';
import {
  buildProductionSteps,
  WorkflowValidationError,
} from '../utils/build-production-steps.js';
import {
  authenticate,
  requireAdmin,
  type AuthRequest,
} from '../middlewares/auth.middleware.js';

const router: ExpressRouter = Router();
router.use(authenticate);
router.use((req, res, next) => {
  // Operator hanya boleh mengakses endpoint pencatatan hasil dan finalisasi PO.
  // Endpoint admin lainnya tetap dilindungi requireAdmin.
  const isOperatorProductionAction =
    req.method === 'POST' &&
    /^\/[^/]+\/steps\/[^/]+\/(?:results|complete-step|complete-production)\/?$/.test(
      req.path,
    );
  if (isOperatorProductionAction) return next();
  return requireAdmin(req, res, next);
});
type AnyRecord = Record<string, any>;
const productionOrderSchema = z.object({
  batch: z.string().trim().min(1),
  product: z.string().trim().min(1),
  quantity: z.number().int().positive().safe(),
  status: z
    .enum(['planned', 'in_progress', 'completed', 'cancelled'])
    .optional(),
  notes: z.string().trim().optional(),
});
const updateProductionOrderSchema = productionOrderSchema;
const updateStepStatusSchema = z.object({
  status: z.enum(['planned', 'in_progress', 'completed', 'cancelled']),
  notes: z.string().trim().optional(),
});
const productionResultSchema = z
  .object({
    idempotencyKey: z.string().trim().min(1).max(200),
    notes: z.string().trim().max(2000).optional().default(''),
    completeStep: z.boolean().optional().default(false),
    allocations: z
      .array(
        z
          .object({
            inputLot: z.string().trim().optional(),
            quantityProcessed: z.number().int().positive().safe(),
            goodQuantity: z.number().int().min(0).safe(),
            scrapQuantity: z.number().int().min(0).safe(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((input, ctx) => {
    input.allocations.forEach((a, index) => {
      if (a.goodQuantity + a.scrapQuantity !== a.quantityProcessed)
        ctx.addIssue({
          code: 'custom',
          path: ['allocations', index],
          message:
            'goodQuantity + scrapQuantity harus sama dengan quantityProcessed.',
        });
    });
  });
function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}
function eligibleInputLotFilter(orderId: unknown, step: AnyRecord) {
  const dependencies = (step.dependsOn ?? []) as unknown[];
  const filter: AnyRecord = {
    productionOrder: orderId,
    status: 'active',
    availableQuantity: { $gt: 0 },
  };
  if (dependencies.length === 0) {
    filter.sourceStepId = null;
  } else {
    filter.sourceStepId = { $in: dependencies };
    filter.sourceResult = { $ne: null };
  }
  return filter;
}
function isValidId(value: string) {
  return mongoose.isValidObjectId(value);
}
function sanitizeLotCode(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 180);
}
async function generateOrderNumber(): Promise<string> {
  const now = new Date();
  const prefix = `PO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-`;
  const last = await ProductionOrderModel.findOne({
    orderNumber: { $regex: `^${prefix}\\d+$` },
  })
    .sort({ orderNumber: -1 })
    .lean();
  const sequence = last
    ? Number(String(last.orderNumber).replace(prefix, '')) + 1
    : 1;
  return `${prefix}${String(Number.isFinite(sequence) ? sequence : 1).padStart(3, '0')}`;
}
async function createRootLot(
  order: AnyRecord,
  session: mongoose.ClientSession,
) {
  const lotCode = sanitizeLotCode(`${order.orderNumber}-ROOT`);
  let lot = await ProductionLotModel.findOne({
    productionOrder: order._id,
    lotCode,
  }).session(session);
  if (!lot) {
    lot = new ProductionLotModel({
      productionOrder: order._id,
      product: order.product,
      lotCode,
      parentLot: null,
      sourceStepId: null,
      sourceResult: null,
      quantity: order.quantity,
      availableQuantity: order.quantity,
      status: 'active',
      notes: '',
    });
    await lot.save({ session });
  }
  return lot;
}
function isFinalStep(steps: AnyRecord[], stepId: string) {
  return !steps.some((step) =>
    (step.dependsOn ?? []).some(
      (dependency: unknown) => String(dependency) === stepId,
    ),
  );
}

router.get('/', async (_req, res) => {
  try {
    const orders = await ProductionOrderModel.find()
      .populate('batch')
      .populate('product')
      .sort({ createdAt: -1 })
      .lean();
    return res.json({ success: true, data: orders });
  } catch (error) {
    console.error('Get production orders:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Gagal mengambil production orders.' });
  }
});
router.get('/:id', async (req, res) => {
  const id = String(req.params.id ?? '');
  if (!isValidId(id))
    return res
      .status(400)
      .json({ success: false, message: 'ID production order tidak valid.' });
  try {
    const order = await ProductionOrderModel.findById(id)
      .populate('batch')
      .populate('product')
      .lean();
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Production order tidak ditemukan.' });
    return res.json({ success: true, data: order });
  } catch (error) {
    console.error('Get production order:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Gagal mengambil production order.' });
  }
});

router.post('/', async (req, res) => {
  const parsed = productionOrderSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      success: false,
      message:
        parsed.error.issues[0]?.message ?? 'Data production order tidak valid.',
    });
  const { batch, product, quantity, status, notes } = parsed.data;
  if (!isValidId(batch) || !isValidId(product))
    return res
      .status(400)
      .json({ success: false, message: 'ID batch atau product tidak valid.' });
  if (status && status !== 'planned')
    return res.status(400).json({
      success: false,
      message: 'Production Order baru harus berstatus planned.',
    });
  try {
    const [batchData, productData] = await Promise.all([
      ProductionBatchModel.findById(batch).lean(),
      ProductModel.findById(product)
        .populate<{ workflow: AnyRecord[] }>('workflow.process')
        .lean(),
    ]);
    if (!batchData)
      return res
        .status(404)
        .json({ success: false, message: 'Production batch tidak ditemukan.' });
    if (['completed', 'cancelled'].includes(String(batchData.status)))
      return res.status(400).json({
        success: false,
        message:
          'Production Order tidak bisa dibuat untuk batch yang sudah selesai atau dibatalkan.',
      });
    if (!productData)
      return res
        .status(404)
        .json({ success: false, message: 'Product tidak ditemukan.' });
    const orderNumber = await generateOrderNumber();
    const workflow = (productData.workflow ?? []) as unknown as Parameters<
      typeof buildProductionSteps
    >[0];

    const steps = buildProductionSteps(workflow);
    const session = await mongoose.startSession();
    let order: AnyRecord;
    try {
      await session.withTransaction(async () => {
        const docs = await ProductionOrderModel.create(
          [
            {
              orderNumber,
              batch,
              product,
              quantity,
              status: 'planned',
              steps,
              notes: notes ?? '',
            },
          ],
          { session },
        );
        order = docs[0] as AnyRecord;
        await createRootLot(order, session);
      });
    } finally {
      await session.endSession();
    }
    await order!.populate([{ path: 'batch' }, { path: 'product' }]);
    return res.status(201).json({
      success: true,
      message: 'Production order berhasil dibuat.',
      data: order!,
    });
  } catch (error) {
    if (error instanceof WorkflowValidationError)
      return res.status(400).json({ success: false, message: error.message });
    console.error('Create production order:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Gagal membuat production order.' });
  }
});

router.put('/:id', async (req, res) => {
  const orderId = String(req.params.id ?? '');
  if (!isValidId(orderId))
    return res
      .status(400)
      .json({ success: false, message: 'ID production order tidak valid.' });
  const parsed = updateProductionOrderSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      success: false,
      message:
        parsed.error.issues[0]?.message ?? 'Data production order tidak valid.',
    });
  const { batch, product, quantity, status, notes } = parsed.data;
  if (!isValidId(batch) || !isValidId(product))
    return res
      .status(400)
      .json({ success: false, message: 'ID batch atau product tidak valid.' });
  if (status && status !== 'planned')
    return res.status(400).json({
      success: false,
      message:
        'Status produksi tidak dapat diubah melalui endpoint edit order.',
    });
  try {
    const order = await ProductionOrderModel.findById(orderId);
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Production order tidak ditemukan.' });
    if (
      order.status !== 'planned' ||
      order.steps.some(
        (step: AnyRecord) =>
          step.quantityProcessed > 0 ||
          ['in_progress', 'partially_completed', 'completed'].includes(
            step.status,
          ),
      )
    )
      return res.status(409).json({
        success: false,
        message:
          'Production Order tidak bisa diedit setelah proses produksi dimulai.',
      });
    const [batchData, productData] = await Promise.all([
      ProductionBatchModel.findById(batch).lean(),
      ProductModel.findById(product)
        .populate<{ workflow: AnyRecord[] }>('workflow.process')
        .lean(),
    ]);
    if (!batchData)
      return res
        .status(404)
        .json({ success: false, message: 'Production batch tidak ditemukan.' });
    if (['completed', 'cancelled'].includes(String(batchData.status)))
      return res.status(400).json({
        success: false,
        message:
          'Production Order tidak bisa dipindahkan ke batch yang sudah selesai atau dibatalkan.',
      });
    if (!productData)
      return res
        .status(404)
        .json({ success: false, message: 'Product tidak ditemukan.' });
    const existingLots = await ProductionLotModel.countDocuments({
      productionOrder: order._id,
    });
    if (existingLots > 1)
      return res.status(409).json({
        success: false,
        message: 'Order memiliki lot tambahan dan tidak dapat diedit.',
      });
    order.batch = new mongoose.Types.ObjectId(batch) as any;
    order.product = new mongoose.Types.ObjectId(product) as any;
    order.quantity = quantity;
    order.status = 'planned';
    const workflow = (productData.workflow ?? []) as unknown as Parameters<
      typeof buildProductionSteps
    >[0];

    order.steps = buildProductionSteps(workflow) as typeof order.steps;
    if (notes !== undefined) order.notes = notes;
    await order.save();
    await ProductionLotModel.updateOne(
      { productionOrder: order._id, sourceStepId: null },
      {
        $set: { product: order.product, quantity, availableQuantity: quantity },
      },
    );
    await order.populate([{ path: 'batch' }, { path: 'product' }]);
    return res.json({
      success: true,
      message: 'Production order berhasil diperbarui.',
      data: order,
    });
  } catch (error) {
    if (error instanceof WorkflowValidationError)
      return res.status(400).json({ success: false, message: error.message });
    console.error('Update production order:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Gagal memperbarui production order.' });
  }
});

router.patch('/:id/steps/:stepId', async (req, res) => {
  const orderId = String(req.params.id ?? ''),
    stepId = String(req.params.stepId ?? '');
  if (!isValidId(orderId) || !isValidId(stepId))
    return res.status(400).json({
      success: false,
      message: 'ID production order atau step tidak valid.',
    });
  const parsed = updateStepStatusSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      success: false,
      message:
        parsed.error.issues[0]?.message ?? 'Data production step tidak valid.',
    });
  const { status, notes } = parsed.data;
  try {
    const order = await ProductionOrderModel.findById(orderId);
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Production order tidak ditemukan.' });
    if (['completed', 'cancelled'].includes(order.status))
      return res.status(409).json({
        success: false,
        message:
          'Production Order yang sudah selesai atau dibatalkan tidak bisa diubah.',
      });
    const step = order.steps.find(
      (item: AnyRecord) => String(item._id) === stepId,
    ) as AnyRecord | undefined;
    if (!step)
      return res
        .status(404)
        .json({ success: false, message: 'Production step tidak ditemukan.' });
    if (status === 'completed')
      return res.status(409).json({
        success: false,
        message: 'Step harus diselesaikan melalui pencatatan hasil produksi.',
      });
    if (status === 'planned' && step.quantityProcessed > 0)
      return res.status(409).json({
        success: false,
        message:
          'Step yang sudah memiliki hasil inspeksi tidak bisa dikembalikan ke planned.',
      });
    if (status === 'in_progress') {
      if (step.status === 'cancelled')
        return res.status(409).json({
          success: false,
          message: 'Step yang dibatalkan tidak bisa dimulai kembali.',
        });
      const available = await ProductionLotModel.aggregate([
        {
          $match: {
            productionOrder: order._id,
            ...(step.dependsOn.length
              ? { sourceStepId: { $in: step.dependsOn } }
              : { sourceStepId: null }),
            status: 'active',
            availableQuantity: { $gt: 0 },
          },
        },
        { $group: { _id: null, quantity: { $sum: '$availableQuantity' } } },
      ]);
      if (Number(available[0]?.quantity ?? 0) < 1)
        return res.status(409).json({
          success: false,
          message: 'Belum ada barang tersedia dari proses sebelumnya.',
        });
      step.startedAt ??= new Date();
    }
    if (status === 'planned') {
      step.startedAt = null;
      step.completedAt = null;
    }
    if (status === 'cancelled') {
      if (step.quantityProcessed > 0)
        return res.status(409).json({
          success: false,
          message:
            'Step yang sudah memiliki hasil inspeksi tidak bisa dibatalkan.',
        });
      step.completedAt = null;
    }
    step.status = status;
    if (notes !== undefined) step.notes = notes;
    order.status = order.steps.every((s: AnyRecord) => s.status === 'cancelled')
      ? 'cancelled'
      : order.steps.some((s: AnyRecord) =>
            ['in_progress', 'partially_completed', 'completed'].includes(
              s.status,
            ),
          )
        ? 'in_progress'
        : 'planned';
    await order.save();
    await order.populate([{ path: 'batch' }, { path: 'product' }]);
    return res.json({
      success: true,
      message: 'Status production step berhasil diperbarui.',
      data: order,
    });
  } catch (error) {
    console.error('Update production step:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Gagal memperbarui production step.' });
  }
});

/**
 * POST /:id/steps/:stepId/complete-step
 * Menandai proses selesai tanpa membuat hasil/lot baru.
 * Hanya boleh bila proses sudah pernah mencatat hasil dan seluruh input eligible habis.
 */
router.post(
  '/:id/steps/:stepId/complete-step',
  async (req: AuthRequest, res) => {
    const orderId = String(req.params.id ?? '');
    const stepId = String(req.params.stepId ?? '');
    if (!isValidId(orderId) || !isValidId(stepId)) {
      return res.status(400).json({
        success: false,
        message: 'ID production order atau step tidak valid.',
      });
    }
    if (!req.user?.userId || !isValidId(req.user.userId)) {
      return res.status(401).json({
        success: false,
        message: 'Akun pengguna tidak valid.',
      });
    }
    const actorRole = String((req.user as AnyRecord).role ?? '');
    if (!['operator', 'admin', 'admin-produksi'].includes(actorRole)) {
      return res.status(403).json({
        success: false,
        message: 'Tidak memiliki izin menyelesaikan proses.',
      });
    }

    const session = await mongoose.startSession();
    try {
      let responseData: AnyRecord | null = null;
      await session.withTransaction(async () => {
        const order = (await ProductionOrderModel.findById(orderId).session(
          session,
        )) as AnyRecord | null;
        if (!order) throw httpError(404, 'Production Order tidak ditemukan.');
        if (['completed', 'cancelled'].includes(String(order.status))) {
          throw httpError(
            409,
            'Production Order sudah selesai atau dibatalkan.',
          );
        }
        const step: AnyRecord | undefined = (order.steps ?? []).find(
          (item: AnyRecord) => String(item._id) === stepId,
        );
        if (!step)
          throw httpError(404, 'Proses tidak ditemukan pada Production Order.');
        if (step.status === 'cancelled') {
          throw httpError(
            409,
            'Proses yang dibatalkan tidak dapat diselesaikan.',
          );
        }
        if (
          actorRole === 'operator' &&
          String(step.ownerOperator ?? '') !== String(req.user!.userId)
        ) {
          throw httpError(
            403,
            'Operator hanya dapat menyelesaikan proses yang dimilikinya.',
          );
        }

        const remainingInputLot = await ProductionLotModel.findOne(
          eligibleInputLotFilter(order._id, step),
        )
          .session(session)
          .lean();
        if (remainingInputLot) {
          throw httpError(
            409,
            `Proses belum dapat diselesaikan: lot input ${String((remainingInputLot as AnyRecord).lotCode)} masih memiliki ${Number((remainingInputLot as AnyRecord).availableQuantity ?? 0)} unit. Catat sisa input terlebih dahulu.`,
          );
        }
        if (Number(step.quantityProcessed ?? 0) <= 0) {
          throw httpError(
            409,
            'Proses belum memiliki hasil produksi. Catat hasil terlebih dahulu.',
          );
        }
        if (step.status === 'completed') {
          responseData = {
            orderId: order._id,
            stepId: step._id,
            status: step.status,
          };
          return;
        }

        step.status = 'completed';
        step.completedAt = new Date();
        order.status = 'in_progress';
        await order.save({ session });
        responseData = {
          orderId: order._id,
          orderNumber: order.orderNumber,
          stepId: step._id,
          processName: step.processName,
          status: step.status,
          quantityProcessed: Number(step.quantityProcessed ?? 0),
          quantityGood: Number(step.quantityGood ?? 0),
          quantityScrap: Number(step.quantityScrap ?? 0),
        };
      });
      return res.json({
        success: true,
        message: 'Proses ditandai selesai tanpa mencatat hasil baru.',
        data: responseData,
      });
    } catch (error) {
      const err = error as Error & { status?: number };
      const status = err.status ?? 500;
      if (status === 500) console.error('Gagal menyelesaikan proses:', error);
      return res.status(status).json({
        success: false,
        message: err.message || 'Gagal menyelesaikan proses.',
      });
    } finally {
      await session.endSession();
    }
  },
);

router.post('/:id/steps/:stepId/results', async (req: AuthRequest, res) => {
  const orderId = String(req.params.id ?? ''),
    stepId = String(req.params.stepId ?? '');
  if (!isValidId(orderId) || !isValidId(stepId))
    return res.status(400).json({
      success: false,
      message: 'ID production order atau step tidak valid.',
    });
  if (!req.user?.userId || !isValidId(req.user.userId))
    return res
      .status(401)
      .json({ success: false, message: 'Akun pengguna tidak valid.' });
  const actorRole = String((req.user as AnyRecord).role ?? '');
  if (!['operator', 'admin', 'admin-produksi'].includes(actorRole)) {
    return res.status(403).json({
      success: false,
      message: 'Tidak memiliki izin mencatat hasil produksi.',
    });
  }
  const parsed = productionResultSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({
      success: false,
      message: 'Data hasil produksi tidak valid.',
      errors: parsed.error.issues,
    });
  const input = parsed.data;
  for (const a of input.allocations)
    if (a.inputLot && !isValidId(a.inputLot))
      return res
        .status(400)
        .json({ success: false, message: 'Input lot ID tidak valid.' });
  const previous = (await ProductionResultModel.findOne({
    idempotencyKey: input.idempotencyKey,
  }).lean()) as AnyRecord | null;
  if (previous)
    return String(previous.productionOrder) === orderId &&
      String(previous.stepId) === stepId
      ? res.status(200).json({
          success: true,
          message: 'Hasil produksi sudah pernah dicatat.',
          data: previous,
        })
      : res.status(409).json({
          success: false,
          message: 'Idempotency key sudah digunakan oleh event lain.',
        });
  const session = await mongoose.startSession();
  try {
    let resultResponse: AnyRecord | null = null;
    await session.withTransaction(async () => {
      const order = (await ProductionOrderModel.findById(orderId).session(
        session,
      )) as AnyRecord | null;
      if (!order) throw httpError(404, 'Production Order tidak ditemukan.');
      if (['completed', 'cancelled'].includes(order.status))
        throw httpError(409, 'Production Order sudah selesai atau dibatalkan.');
      const step: AnyRecord | undefined = order.steps.find(
        (s: AnyRecord) => String(s._id) === stepId,
      );
      if (!step) throw httpError(404, 'Production Step tidak ditemukan.');
      if (step.status === 'cancelled')
        throw httpError(
          409,
          'Step yang dibatalkan tidak dapat menerima hasil.',
        );
      // Data lama mungkin telanjur berstatus completed meskipun masih ada input.
      // Izinkan pencatatan lanjutan hanya jika stok input eligible memang tersisa.
      if (step.status === 'completed') {
        const remainingInputLot = await ProductionLotModel.findOne(
          eligibleInputLotFilter(order._id, step),
        )
          .session(session)
          .lean();
        if (!remainingInputLot)
          throw httpError(
            409,
            'Step sudah selesai dan tidak memiliki input tersisa.',
          );
      }
      if (
        actorRole === 'operator' &&
        String(step.ownerOperator ?? '') !== String(req.user!.userId)
      ) {
        throw httpError(
          403,
          'Operator hanya dapat mencatat hasil pada proses yang sudah diklaim sendiri.',
        );
      }
      if (
        step.ownerOperator != null &&
        String(step.ownerOperator) !== String(req.user!.userId) &&
        actorRole === 'operator'
      ) {
        throw httpError(403, 'Proses ini dimiliki operator lain.');
      }
      for (const depId of step.dependsOn ?? []) {
        const dep = order.steps.find(
          (s: AnyRecord) => String(s._id) === String(depId),
        );
        if (!dep || !['completed', 'partially_completed'].includes(dep.status))
          throw httpError(
            409,
            'Semua proses sebelumnya harus selesai sebelum hasil proses ini dicatat.',
          );
      }
      const allocations: AnyRecord[] = [];
      const seenLots = new Set<string>();
      let inspectedQuantity = 0,
        goodQuantity = 0,
        scrapQuantity = 0;
      for (const [index, a] of input.allocations.entries()) {
        const inputLot = a.inputLot
          ? await ProductionLotModel.findOne({
              _id: a.inputLot,
              productionOrder: order._id,
              product: order.product,
              status: 'active',
            }).session(session)
          : step.dependsOn.length === 0
            ? await ProductionLotModel.findOne({
                productionOrder: order._id,
                sourceStepId: null,
                status: 'active',
              }).session(session)
            : null;
        if (!inputLot)
          throw httpError(400, 'Input lot wajib valid untuk step ini.');
        const lotKey = String(inputLot._id);
        if (seenLots.has(lotKey))
          throw httpError(
            400,
            'Input lot yang sama tidak boleh muncul lebih dari sekali; gabungkan quantity dalam satu allocation.',
          );
        seenLots.add(lotKey);
        if (step.dependsOn.length === 0 && inputLot.sourceStepId != null)
          throw httpError(400, 'Step pertama harus menggunakan root lot.');
        if (
          step.dependsOn.length > 0 &&
          (!(step.dependsOn ?? []).some(
            (id: unknown) => String(id) === String(inputLot.sourceStepId),
          ) ||
            inputLot.sourceResult == null)
        )
          throw httpError(
            400,
            'Input lot bukan keluaran produksi yang valid dari dependency step yang sesuai.',
          );
        const consumed = await ProductionLotModel.updateOne(
          {
            _id: inputLot._id,
            availableQuantity: { $gte: a.quantityProcessed },
            status: 'active',
          },
          { $inc: { availableQuantity: -a.quantityProcessed } },
          { session },
        );
        if (consumed.modifiedCount !== 1)
          throw httpError(409, `Stok lot ${inputLot.lotCode} tidak mencukupi.`);
        const prefix = sanitizeLotCode(
          `${order.orderNumber}-S${step.sequence}-${input.idempotencyKey}-A${index}`,
        );
        let goodLotId: mongoose.Types.ObjectId | null = null,
          scrapLotId: mongoose.Types.ObjectId | null = null;
        if (a.goodQuantity > 0) {
          const lot = new ProductionLotModel({
            productionOrder: order._id,
            product: order.product,
            lotCode: `${prefix}-G`,
            parentLot: inputLot._id,
            sourceStepId: step._id,
            sourceResult: null,
            quantity: a.goodQuantity,
            availableQuantity: a.goodQuantity,
            status: 'active',
            notes: input.notes,
          });
          await lot.save({ session });
          goodLotId = lot._id;
        }
        if (a.scrapQuantity > 0) {
          const lot = new ProductionLotModel({
            productionOrder: order._id,
            product: order.product,
            lotCode: `${prefix}-X`,
            parentLot: inputLot._id,
            sourceStepId: step._id,
            sourceResult: null,
            quantity: a.scrapQuantity,
            availableQuantity: 0,
            status: 'scrap',
            notes: input.notes,
          });
          await lot.save({ session });
          scrapLotId = lot._id;
        }
        allocations.push({
          inputLot: inputLot._id,
          quantityProcessed: a.quantityProcessed,
          goodQuantity: a.goodQuantity,
          scrapQuantity: a.scrapQuantity,
          goodLot: goodLotId,
          scrapLot: scrapLotId,
        });
        inspectedQuantity += a.quantityProcessed;
        goodQuantity += a.goodQuantity;
        scrapQuantity += a.scrapQuantity;
      }
      // Jangan izinkan tombol Selesai proses menutup proses bila masih ada
      // input aktif yang belum diproses. Transaksi akan rollback bila ditolak.
      if (input.completeStep) {
        const remainingInputLot = await ProductionLotModel.findOne(
          eligibleInputLotFilter(order._id, step),
        )
          .session(session)
          .lean();
        if (remainingInputLot) {
          throw httpError(
            409,
            `Proses belum bisa diselesaikan karena lot input ${remainingInputLot.lotCode} masih memiliki ${Number(remainingInputLot.availableQuantity ?? 0)} unit belum diproses. Pencatatan ini dibatalkan dan tidak disimpan. Gunakan Simpan hasil untuk menyimpan hasil parsial, lanjutkan memproses sisa input, lalu pilih Selesai proses saat seluruh input sudah habis diproses.`,
          );
        }
      }

      const productionResult = new ProductionResultModel({
        productionOrder: order._id,
        stepId: step._id,
        sequence: step.sequence,
        process: step.process,
        operator: new mongoose.Types.ObjectId(req.user!.userId),
        inspectedQuantity,
        goodQuantity,
        scrapQuantity,
        allocations,
        notes: input.notes,
        recordedAt: new Date(),
        idempotencyKey: input.idempotencyKey,
      });
      await productionResult.save({ session });
      const outputIds = allocations.flatMap((a) =>
        [a.goodLot, a.scrapLot].filter(Boolean),
      );
      if (outputIds.length)
        await ProductionLotModel.updateMany(
          { _id: { $in: outputIds } },
          { $set: { sourceResult: productionResult._id } },
          { session },
        );
      step.quantityProcessed =
        Number(step.quantityProcessed ?? 0) + inspectedQuantity;
      step.quantityGood = Number(step.quantityGood ?? 0) + goodQuantity;
      step.quantityScrap = Number(step.quantityScrap ?? 0) + scrapQuantity;
      step.startedAt ??= new Date();
      if (input.completeStep) {
        step.status = 'completed';
        step.completedAt = new Date();
      } else {
        step.status = 'partially_completed';
        step.completedAt = null;
      }
      // Mencatat hasil proses tidak otomatis menyelesaikan PO atau menambah inventori.
      // Inventori barang jadi hanya bertambah melalui endpoint Selesai produksi.
      order.status = 'in_progress';
      await order.save({ session });
      resultResponse = { result: productionResult, productionOrder: order };
    });
    return res.status(201).json({
      success: true,
      message: 'Hasil produksi berhasil dicatat.',
      data: resultResponse,
    });
  } catch (error) {
    const err = error as Error & { status?: number; code?: number };
    if (err.code === 11000) {
      const duplicate = (await ProductionResultModel.findOne({
        idempotencyKey: input.idempotencyKey,
      }).lean()) as AnyRecord | null;
      if (
        duplicate &&
        String(duplicate.productionOrder) === orderId &&
        String(duplicate.stepId) === stepId
      )
        return res.status(200).json({
          success: true,
          message: 'Hasil produksi sudah pernah dicatat.',
          data: duplicate,
        });
      return res.status(409).json({
        success: false,
        message: 'Terjadi konflik idempotency key atau lotCode.',
      });
    }
    const status = err.status ?? 500;
    if (status === 500) console.error('Gagal mencatat hasil produksi:', error);
    return res.status(status).json({
      success: false,
      message: err.message || 'Gagal mencatat hasil produksi.',
    });
  } finally {
    await session.endSession();
  }
});

/**
 * POST /:id/steps/:stepId/complete-production
 * Finalisasi Production Order setelah semua proses terminal selesai.
 * Barang baik dari lot proses terakhir masuk ke inventori tepat satu kali.
 */
router.post(
  '/:id/steps/:stepId/complete-production',
  async (req: AuthRequest, res) => {
    const orderId = String(req.params.id ?? '');
    const stepId = String(req.params.stepId ?? '');
    if (!isValidId(orderId) || !isValidId(stepId)) {
      return res.status(400).json({
        success: false,
        message: 'ID production order atau step tidak valid.',
      });
    }
    if (!req.user?.userId || !isValidId(req.user.userId)) {
      return res
        .status(401)
        .json({ success: false, message: 'Akun pengguna tidak valid.' });
    }
    const actorRole = String((req.user as AnyRecord).role ?? '');
    if (!['operator', 'admin', 'admin-produksi'].includes(actorRole)) {
      return res.status(403).json({
        success: false,
        message: 'Tidak memiliki izin menyelesaikan produksi.',
      });
    }

    const session = await mongoose.startSession();
    try {
      let responseData: AnyRecord | null = null;
      let alreadyCompleted = false;
      await session.withTransaction(async () => {
        const order = (await ProductionOrderModel.findById(orderId).session(
          session,
        )) as AnyRecord | null;
        if (!order) throw httpError(404, 'Production Order tidak ditemukan.');
        const steps: AnyRecord[] = order.steps ?? [];
        const selectedStep = steps.find((step) => String(step._id) === stepId);
        if (!selectedStep)
          throw httpError(404, 'Proses tidak ditemukan pada Production Order.');
        if (
          actorRole === 'operator' &&
          String(selectedStep.ownerOperator ?? '') !== String(req.user!.userId)
        ) {
          throw httpError(
            403,
            'Operator hanya dapat menyelesaikan produksi dari proses yang dimilikinya.',
          );
        }
        if (order.status === 'completed') {
          alreadyCompleted = true;
          responseData = {
            orderId: order._id,
            orderNumber: order.orderNumber,
            finalGoodQuantity: Number(order.finalGoodQuantity ?? 0),
            status: order.status,
          };
          return;
        }
        if (order.status === 'cancelled')
          throw httpError(
            409,
            'Production Order yang dibatalkan tidak dapat diselesaikan.',
          );
        if (!steps.length)
          throw httpError(409, 'Production Order tidak memiliki proses.');
        if (
          !steps.every((step) =>
            ['completed', 'cancelled'].includes(String(step.status)),
          )
        ) {
          throw httpError(
            409,
            'Semua proses wajib selesai atau dibatalkan sebelum produksi difinalisasi.',
          );
        }
        // Lindungi finalisasi PO dari step yang telanjur completed padahal
        // masih ada input aktif yang belum diproses.
        for (const step of steps) {
          if (step.status !== 'completed') continue;
          const remainingInputLot = await ProductionLotModel.findOne(
            eligibleInputLotFilter(order._id, step),
          )
            .session(session)
            .lean();
          if (remainingInputLot) {
            throw httpError(
              409,
              `Produksi belum dapat difinalisasi: proses urutan ${step.sequence ?? '-'} masih memiliki ${Number(remainingInputLot.availableQuantity ?? 0)} unit input yang belum diproses.`,
            );
          }
        }

        if (!steps.some((step) => step.status === 'completed')) {
          throw httpError(
            409,
            'Tidak ada proses selesai yang dapat menghasilkan barang jadi.',
          );
        }

        const terminalStepIds = steps
          .filter(
            (step) =>
              isFinalStep(steps, String(step._id)) &&
              step.status === 'completed',
          )
          .map((step) => step._id);
        const finalLots = terminalStepIds.length
          ? await ProductionLotModel.find({
              productionOrder: order._id,
              sourceStepId: { $in: terminalStepIds },
              sourceResult: { $ne: null },
              status: 'active',
              availableQuantity: { $gt: 0 },
            }).session(session)
          : [];
        const finalGoodQuantity = finalLots.reduce(
          (sum: number, lot: AnyRecord) =>
            sum + Number(lot.availableQuantity ?? 0),
          0,
        );
        // Idempotensi inventori ditentukan oleh StockMovement, bukan oleh
        // order.finalGoodQuantity. Field kuantitas akhir adalah hasil produksi,
        // bukan penanda bahwa inventori sudah pernah ditambah.
        const finalMovementKey = `production-order-final:${String(order._id)}`;
        const existingFinalMovement = await StockMovementModel.findOne({
          idempotencyKey: finalMovementKey,
        })
          .session(session)
          .lean();
        const quantityToAdd = existingFinalMovement ? 0 : finalGoodQuantity;

        if (quantityToAdd > 0) {
          await FinishedGoodsInventoryModel.updateOne(
            { product: order.product },
            {
              $inc: { quantity: quantityToAdd },
              $setOnInsert: { allocatedQuantity: 0 },
            },
            { upsert: true, session, setDefaultsOnInsert: true },
          );
          await StockMovementModel.create(
            [
              {
                product: order.product,
                type: 'IN',
                quantity: quantityToAdd,
                referenceType: 'production_order',
                referenceId: order._id,
                referenceItemId: null,
                idempotencyKey: finalMovementKey,
              },
            ],
            { session },
          );
        }
        if (finalLots.length > 0) {
          await ProductionLotModel.updateMany(
            {
              _id: { $in: finalLots.map((lot: AnyRecord) => lot._id) },
              status: 'active',
            },
            { $set: { status: 'finished', availableQuantity: 0 } },
            { session },
          );
        }

        order.finalGoodQuantity = finalGoodQuantity;
        order.shortfallQuantity = Math.max(
          0,
          Number(order.quantity ?? 0) - finalGoodQuantity,
        );
        order.status = 'completed';
        order.completedAt = new Date();
        await order.save({ session });
        responseData = {
          orderId: order._id,
          orderNumber: order.orderNumber,
          finalGoodQuantity,
          shortfallQuantity: order.shortfallQuantity,
          status: order.status,
        };
      });
      return res.json({
        success: true,
        message: alreadyCompleted
          ? 'Produksi sudah pernah diselesaikan; inventori tidak ditambah ulang.'
          : 'Produksi selesai dan barang baik sudah dimasukkan ke inventori.',
        data: responseData,
      });
    } catch (error) {
      const err = error as Error & { status?: number; code?: number };
      if (err.code === 11000) {
        return res.status(409).json({
          success: false,
          message:
            'Finalisasi terdeteksi duplikat. Muat ulang data sebelum mencoba lagi.',
        });
      }
      const status = err.status ?? 500;
      if (status === 500) console.error('Complete production order:', error);
      return res.status(status).json({
        success: false,
        message: err.message || 'Gagal menyelesaikan produksi.',
      });
    } finally {
      await session.endSession();
    }
  },
);

router.delete('/:id', async (req, res) => {
  const id = String(req.params.id ?? '');
  if (!isValidId(id))
    return res
      .status(400)
      .json({ success: false, message: 'ID production order tidak valid.' });
  try {
    const order = await ProductionOrderModel.findById(id);
    if (!order)
      return res
        .status(404)
        .json({ success: false, message: 'Production order tidak ditemukan.' });
    const activity = order.steps.some(
      (s: AnyRecord) =>
        s.quantityProcessed > 0 ||
        ['in_progress', 'partially_completed', 'completed'].includes(s.status),
    );
    if (order.status !== 'planned' || activity)
      return res.status(409).json({
        success: false,
        message:
          'Production Order tidak bisa dihapus setelah produksi dimulai.',
      });
    await ProductionLotModel.deleteMany({
      productionOrder: order._id,
      sourceStepId: null,
    });
    await order.deleteOne();
    return res.json({
      success: true,
      message: 'Production order berhasil dihapus.',
      data: null,
    });
  } catch (error) {
    console.error('Delete production order:', error);
    return res
      .status(500)
      .json({ success: false, message: 'Gagal menghapus production order.' });
  }
});
export default router;
