import { Router, type Router as ExpressRouter } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';

import { ProductionOrderModel, User } from '@fahrul-store/database';
import {
  authenticate,
  type AuthRequest,
} from '../middlewares/auth.middleware.js';

const router = Router() as ExpressRouter;

type AssignmentLike = {
  assignedOperator?: Types.ObjectId | string | null;
  quantity?: number;
  assignedAt?: Date;
};

type StepLike = {
  _id: Types.ObjectId;
  process: unknown;
  processName: string;
  processCode: string;
  sequence: number;
  dependsOn: Types.ObjectId[];
  status: string;
  assignments: AssignmentLike[];
  ownerOperator?: Types.ObjectId | null;
};

const assignmentSchema = z
  .object({
    stepId: z.string().refine(Types.ObjectId.isValid, {
      message: 'Step ID tidak valid.',
    }),
    assignments: z
      .array(
        z
          .object({
            operatorId: z.string().refine(Types.ObjectId.isValid, {
              message: 'Operator ID tidak valid.',
            }),
            quantity: z.number().int().positive().safe(),
          })
          .strict(),
      )
      .min(1, 'Pilih minimal satu Operator untuk tim produksi.')
      .max(50)
      .refine(
        (items) =>
          new Set(items.map((item) => item.operatorId)).size === items.length,
        {
          message:
            'Operator yang sama tidak boleh dimasukkan lebih dari satu kali.',
        },
      ),
  })
  .strict();

function hasPlanningAccess(req: AuthRequest): boolean {
  return req.user?.role === 'admin' || req.user?.role === 'admin-produksi';
}

function getAssignedQuantity(assignments: AssignmentLike[] = []): number {
  // Beberapa Operator adalah satu tim yang menerima kuantitas PO yang sama.
  // Karena itu kuantitas tim dihitung satu kali, bukan dijumlahkan per anggota.
  return assignments.reduce(
    (maximum, assignment) =>
      Math.max(maximum, Math.max(0, Number(assignment.quantity ?? 0))),
    0,
  );
}

router.use(authenticate);

router.use((req, res, next) => {
  if (!hasPlanningAccess(req as AuthRequest)) {
    res.status(403).json({
      success: false,
      message: 'Akses khusus admin dan admin-produksi.',
    });
    return;
  }
  next();
});

// GET /api/production-planning/operators
router.get('/operators', async (_req, res) => {
  try {
    const operators = await User.find({ role: 'operator' })
      .select('_id username email role')
      .sort({ username: 1 })
      .lean();

    res.json({ success: true, data: operators });
  } catch (error) {
    console.error('Failed to fetch operators:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil daftar Operator.',
    });
  }
});

// GET /api/production-planning/unassigned-orders
// Menampilkan sisa kuantitas untuk assignment proses pertama.
router.get('/unassigned-orders', async (_req, res) => {
  try {
    const orders = await ProductionOrderModel.find({
      status: { $nin: ['completed', 'cancelled'] },
    })
      .populate('product')
      .populate('batch')
      .lean();

    const data = orders.flatMap((order: any) => {
      const steps = Array.isArray(order.steps) ? order.steps : [];
      const initialStep = steps.find(
        (step: any) => !step.dependsOn || step.dependsOn.length === 0,
      );

      if (!initialStep) return [];

      const assignments: AssignmentLike[] = Array.isArray(
        initialStep.assignments,
      )
        ? initialStep.assignments
        : [];
      const assignedQuantity = getAssignedQuantity(assignments);
      const remainingQuantity = Math.max(
        0,
        Number(order.quantity ?? 0) - assignedQuantity,
      );

      if (
        remainingQuantity < 1 ||
        initialStep.ownerOperator ||
        !['planned', 'partially_completed'].includes(initialStep.status)
      ) {
        return [];
      }

      return [
        {
          _id: String(order._id),
          orderNumber: order.orderNumber,
          quantity: Number(order.quantity ?? 0),
          assignedQuantity,
          remainingQuantity,
          status: order.status,
          product: order.product,
          batch: order.batch,
          assignments: assignments.map((assignment) => ({
            assignedOperator: assignment.assignedOperator
              ? String(assignment.assignedOperator)
              : null,
            quantity: Number(assignment.quantity ?? 0),
            assignedAt: assignment.assignedAt ?? null,
          })),
          step: {
            _id: String(initialStep._id),
            process: initialStep.process,
            processName: initialStep.processName,
            processCode: initialStep.processCode,
            status: initialStep.status,
          },
        },
      ];
    });

    res.json({ success: true, data });
  } catch (error) {
    console.error('Failed to fetch unassigned orders:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil Production Order.',
    });
  }
});

// POST /api/production-planning/orders/:orderId/assignments
// Body: { stepId, assignments: [{ operatorId, quantity }] }
router.post('/orders/:orderId/assignments', async (req, res) => {
  try {
    const orderId = String(req.params.orderId ?? '');

    if (!Types.ObjectId.isValid(orderId)) {
      res.status(400).json({
        success: false,
        message: 'Production Order ID tidak valid.',
      });
      return;
    }

    const parsed = assignmentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'Data assignment tidak valid.',
        errors: parsed.error.flatten(),
      });
      return;
    }

    const { stepId, assignments: requestedAssignments } = parsed.data;
    const operatorIds = requestedAssignments.map(
      (assignment) => assignment.operatorId,
    );
    const teamQuantity = requestedAssignments[0]?.quantity ?? 0;
    const quantitiesAreConsistent = requestedAssignments.every(
      (assignment) => assignment.quantity === teamQuantity,
    );

    if (!quantitiesAreConsistent) {
      res.status(400).json({
        success: false,
        message: 'Semua anggota tim harus menerima kuantitas PO yang sama.',
      });
      return;
    }

    const authReq = req as AuthRequest;
    const assignedBy = authReq.user?.userId;
    if (!assignedBy || !Types.ObjectId.isValid(assignedBy)) {
      res.status(401).json({
        success: false,
        message: 'User yang membuat assignment tidak valid.',
      });
      return;
    }

    const operators = await User.find({
      _id: { $in: operatorIds.map((id) => new Types.ObjectId(id)) },
      role: 'operator',
    })
      .select('_id username email')
      .lean();

    if (operators.length !== operatorIds.length) {
      res.status(400).json({
        success: false,
        message:
          'Satu atau lebih penerima tidak ditemukan atau bukan Operator.',
      });
      return;
    }

    const order = await ProductionOrderModel.findById(orderId);
    if (!order) {
      res
        .status(404)
        .json({ success: false, message: 'Production Order tidak ditemukan.' });
      return;
    }

    const step = order.steps.find((item) => String(item._id) === stepId);
    if (!step) {
      res
        .status(404)
        .json({ success: false, message: 'Production step tidak ditemukan.' });
      return;
    }

    const stepData = step as unknown as StepLike;
    const isInitialStep =
      !stepData.dependsOn || stepData.dependsOn.length === 0;
    if (!isInitialStep) {
      res.status(400).json({
        success: false,
        message:
          'Assignment awal hanya boleh diberikan untuk proses pertama. Proses berikutnya menerima transfer dari Operator.',
      });
      return;
    }

    if (stepData.ownerOperator) {
      res.status(409).json({
        success: false,
        message:
          'Proses sudah diklaim Operator dan tidak menerima assignment awal baru.',
      });
      return;
    }

    if (!['planned', 'partially_completed'].includes(stepData.status)) {
      res.status(409).json({
        success: false,
        message: 'Status proses tidak memungkinkan assignment.',
      });
      return;
    }

    const existingAssignments = stepData.assignments ?? [];
    const assignedQuantity = getAssignedQuantity(existingAssignments);
    const remainingQuantity = Math.max(
      0,
      Number(order.quantity ?? 0) - assignedQuantity,
    );

    if (teamQuantity !== remainingQuantity) {
      res.status(409).json({
        success: false,
        message: `Tim harus menerima seluruh kuantitas yang tersisa (${remainingQuantity} unit). Muat ulang data lalu coba lagi.`,
        data: { assignedQuantity, remainingQuantity, teamQuantity },
      });
      return;
    }

    const now = new Date();
    for (const assignment of requestedAssignments) {
      stepData.assignments.push({
        assignedBy: new Types.ObjectId(assignedBy),
        assignedOperator: new Types.ObjectId(assignment.operatorId),
        quantity: assignment.quantity,
        assignedAt: now,
      } as any);
    }

    await order.save();

    res.status(201).json({
      success: true,
      message: 'Assignment berhasil dibuat.',
      data: {
        orderId: String(order._id),
        stepId: String(step._id),
        assignments: requestedAssignments.map((assignment) => ({
          operatorId: assignment.operatorId,
          quantity: assignment.quantity,
        })),
        assignedQuantity: assignedQuantity + teamQuantity,
        remainingQuantity: remainingQuantity - teamQuantity,
      },
    });
  } catch (error) {
    console.error('Failed to assign production order:', error);
    res.status(500).json({
      success: false,
      message: 'Gagal melakukan assignment.',
    });
  }
});

export default router;
