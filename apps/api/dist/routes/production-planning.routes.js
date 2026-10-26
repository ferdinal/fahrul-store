import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { ProductionOrderModel, User } from '@fahrul-store/database';
import { authenticate, } from '../middlewares/auth.middleware.js';
const router = Router();
const assignmentSchema = z
    .object({
    stepId: z.string().refine(Types.ObjectId.isValid, {
        message: 'Step ID tidak valid.',
    }),
    operatorIds: z
        .array(z.string().refine(Types.ObjectId.isValid, {
        message: 'Operator ID tidak valid.',
    }))
        .min(1, 'Pilih minimal satu Operator.')
        .max(50),
    unitRanges: z
        .array(z
        .object({
        start: z.number().int().min(1),
        end: z.number().int().min(1),
    })
        .strict())
        .min(1, 'Rentang unit wajib diisi.')
        .refine((ranges) => {
        const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
        for (let i = 0; i < sorted.length; i += 1) {
            const current = sorted[i];
            const previous = sorted[i - 1];
            if (!current || current.end < current.start) {
                return false;
            }
            if (previous && current.start <= previous.end) {
                return false;
            }
        }
        return true;
    }, {
        message: 'Rentang harus valid dan tidak boleh saling tumpang tindih.',
    }),
})
    .strict();
function hasPlanningAccess(req) {
    return req.user?.role === 'admin' || req.user?.role === 'admin-produksi';
}
function mergeRanges(ranges) {
    const sorted = ranges
        .filter((range) => Number.isInteger(range.start) &&
        Number.isInteger(range.end) &&
        range.start >= 1 &&
        range.end >= range.start)
        .map((range) => ({ ...range }))
        .sort((a, b) => a.start - b.start || a.end - b.end);
    const merged = [];
    for (const range of sorted) {
        const previous = merged[merged.length - 1];
        if (!previous || range.start > previous.end + 1) {
            merged.push(range);
        }
        else {
            previous.end = Math.max(previous.end, range.end);
        }
    }
    return merged;
}
function rangesOverlap(first, second) {
    return first.some((a) => second.some((b) => a.start <= b.end && b.start <= a.end));
}
function rangesAreInside(candidate, allowed) {
    const mergedAllowed = mergeRanges(allowed);
    return candidate.every((range) => mergedAllowed.some((allowedRange) => range.start >= allowedRange.start && range.end <= allowedRange.end));
}
router.use(authenticate);
router.use((req, res, next) => {
    if (!hasPlanningAccess(req)) {
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
        res.json({
            success: true,
            data: operators,
        });
    }
    catch (error) {
        console.error('Failed to fetch operators:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil daftar Operator.',
        });
    }
});
// GET /api/production-planning/unassigned-orders
router.get('/unassigned-orders', async (_req, res) => {
    try {
        const orders = await ProductionOrderModel.find({
            status: { $nin: ['completed', 'cancelled'] },
        })
            .populate('product')
            .populate('batch')
            .lean();
        const data = orders.flatMap((order) => {
            const steps = Array.isArray(order.steps) ? order.steps : [];
            const initialStep = steps.find((step) => !step.dependsOn || step.dependsOn.length === 0);
            if (!initialStep) {
                return [];
            }
            const assignments = initialStep.assignments ?? [];
            const assignedRanges = mergeRanges(assignments.flatMap((assignment) => assignment.unitRanges ?? []));
            const remainingRanges = [];
            let nextStart = 1;
            for (const range of assignedRanges) {
                if (nextStart < range.start) {
                    remainingRanges.push({
                        start: nextStart,
                        end: range.start - 1,
                    });
                }
                nextStart = Math.max(nextStart, range.end + 1);
            }
            if (nextStart <= order.quantity) {
                remainingRanges.push({
                    start: nextStart,
                    end: order.quantity,
                });
            }
            if (remainingRanges.length === 0 ||
                initialStep.ownerOperator ||
                !['planned', 'partially_completed'].includes(initialStep.status)) {
                return [];
            }
            return [
                {
                    _id: String(order._id),
                    orderNumber: order.orderNumber,
                    quantity: order.quantity,
                    status: order.status,
                    product: order.product,
                    batch: order.batch,
                    remainingRanges,
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
        res.json({
            success: true,
            data,
        });
    }
    catch (error) {
        console.error('Failed to fetch unassigned orders:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil Production Order.',
        });
    }
});
// POST /api/production-planning/orders/:orderId/assignments
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
        const { stepId, unitRanges } = parsed.data;
        const operatorIds = [...new Set(parsed.data.operatorIds)];
        const authReq = req;
        const assignedBy = authReq.user?.userId;
        if (!assignedBy || !Types.ObjectId.isValid(assignedBy)) {
            res.status(401).json({
                success: false,
                message: 'User yang membuat assignment tidak valid.',
            });
            return;
        }
        const operators = await User.find({
            _id: {
                $in: operatorIds.map((id) => new Types.ObjectId(id)),
            },
            role: 'operator',
        })
            .select('_id')
            .lean();
        if (operators.length !== operatorIds.length) {
            res.status(400).json({
                success: false,
                message: 'Satu atau lebih penerima tidak ditemukan atau bukan Operator.',
            });
            return;
        }
        const order = await ProductionOrderModel.findById(orderId);
        if (!order) {
            res.status(404).json({
                success: false,
                message: 'Production Order tidak ditemukan.',
            });
            return;
        }
        const step = order.steps.find((item) => String(item._id) === stepId);
        if (!step) {
            res.status(404).json({
                success: false,
                message: 'Production step tidak ditemukan.',
            });
            return;
        }
        const stepData = step;
        const isInitialStep = !stepData.dependsOn || stepData.dependsOn.length === 0;
        if (!isInitialStep) {
            res.status(400).json({
                success: false,
                message: 'Assignment awal hanya boleh diberikan untuk proses pertama.',
            });
            return;
        }
        if (stepData.ownerOperator) {
            res.status(409).json({
                success: false,
                message: 'Proses sudah diklaim Operator dan tidak menerima assignment awal baru.',
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
        for (const range of unitRanges) {
            if (range.end < range.start) {
                res.status(400).json({
                    success: false,
                    message: 'Akhir rentang harus >= awal rentang.',
                });
                return;
            }
            if (range.end > order.quantity) {
                res.status(400).json({
                    success: false,
                    message: `Rentang unit maksimal adalah ${order.quantity}.`,
                });
                return;
            }
        }
        const existingAssignments = stepData.assignments ?? [];
        const existingRanges = existingAssignments.flatMap((assignment) => assignment.unitRanges ?? []);
        if (rangesOverlap(unitRanges, existingRanges)) {
            res.status(409).json({
                success: false,
                message: 'Sebagian unit sudah ditugaskan. Pilih rentang unit yang masih tersedia.',
            });
            return;
        }
        const normalizedRanges = mergeRanges(unitRanges);
        if (!rangesAreInside(normalizedRanges, [{ start: 1, end: order.quantity }])) {
            res.status(400).json({
                success: false,
                message: 'Rentang unit tidak valid.',
            });
            return;
        }
        // Assignment disimpan pada step.assignments,
        // sesuai schema dan workflow Operator.
        stepData.assignments.push({
            assignedBy: new Types.ObjectId(assignedBy),
            assignedOperators: operatorIds.map((id) => new Types.ObjectId(id)),
            unitRanges: normalizedRanges,
            assignedAt: new Date(),
        });
        await order.save();
        res.status(201).json({
            success: true,
            message: 'Assignment berhasil dibuat.',
            data: {
                orderId: String(order._id),
                stepId: String(step._id),
                operatorIds,
                unitRanges: normalizedRanges,
            },
        });
    }
    catch (error) {
        console.error('Failed to assign production order:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal melakukan assignment.',
        });
    }
});
export default router;
//# sourceMappingURL=production-planning.routes.js.map