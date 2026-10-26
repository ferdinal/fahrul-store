import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { ProductionOrderModel, ProductionResultModel, User, } from '@fahrul-store/database';
import { authenticate, requireRole, } from '../middlewares/auth.middleware.js';
const router = Router();
router.use(authenticate, requireRole('operator'));
// ============================================================
// VALIDATION
// ============================================================
const objectIdSchema = z.string().refine(mongoose.isValidObjectId, {
    message: 'ID tidak valid.',
});
const unitRangesSchema = z
    .array(z
    .object({
    start: z.number().int().min(1),
    end: z.number().int().min(1),
})
    .strict()
    .refine((range) => range.end >= range.start, {
    message: 'Rentang akhir tidak boleh lebih kecil dari awal.',
}))
    .min(1)
    .refine((ranges) => {
    const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
    for (let index = 1; index < sorted.length; index += 1) {
        const current = sorted[index];
        const previous = sorted[index - 1];
        if (current !== undefined &&
            previous !== undefined &&
            current.start <= previous.end) {
            return false;
        }
    }
    return true;
}, {
    message: 'Rentang unit tidak boleh tumpang tindih.',
});
const assignmentSchema = z
    .object({
    targetStepId: objectIdSchema,
    operatorIds: z.array(objectIdSchema).min(1).max(50),
    unitRanges: unitRangesSchema,
})
    .strict();
// ============================================================
// RANGE HELPERS
// ============================================================
function mergeRanges(ranges) {
    const sorted = ranges
        .filter((range) => Number.isInteger(range.start) &&
        Number.isInteger(range.end) &&
        range.start >= 1 &&
        range.end >= range.start)
        .map((range) => ({
        start: range.start,
        end: range.end,
    }))
        .sort((a, b) => a.start - b.start || a.end - b.end);
    const merged = [];
    for (const range of sorted) {
        const last = merged[merged.length - 1];
        if (last === undefined || range.start > last.end + 1) {
            merged.push({ ...range });
            continue;
        }
        last.end = Math.max(last.end, range.end);
    }
    return merged;
}
function intersectRanges(first, second) {
    const a = mergeRanges(first);
    const b = mergeRanges(second);
    const result = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        const rangeA = a[i];
        const rangeB = b[j];
        if (rangeA === undefined || rangeB === undefined) {
            break;
        }
        const start = Math.max(rangeA.start, rangeB.start);
        const end = Math.min(rangeA.end, rangeB.end);
        if (start <= end) {
            result.push({ start, end });
        }
        if (rangeA.end < rangeB.end) {
            i += 1;
        }
        else {
            j += 1;
        }
    }
    return mergeRanges(result);
}
function countRanges(ranges) {
    return mergeRanges(ranges).reduce((total, range) => total + range.end - range.start + 1, 0);
}
function rangesOverlap(first, second) {
    return intersectRanges(first, second).length > 0;
}
function isSubsetOfRanges(candidate, allowed) {
    return (countRanges(candidate) === countRanges(intersectRanges(candidate, allowed)));
}
function rangesWithinQuantity(ranges, quantity) {
    return ranges.every((range) => Number.isInteger(range.start) &&
        Number.isInteger(range.end) &&
        range.start >= 1 &&
        range.end >= range.start &&
        range.end <= quantity);
}
// ============================================================
// RESULT HELPERS
// ============================================================
function getGoodRanges(results, stepId) {
    const matchingResults = results.filter((result) => {
        const resultStepId = result.stepId ?? result.productionStep ?? result.step;
        return resultStepId != null && String(resultStepId) === stepId;
    });
    const ranges = matchingResults.flatMap((result) => {
        const allocations = Array.isArray(result.allocations)
            ? result.allocations
            : [];
        return allocations.flatMap((allocation) => Array.isArray(allocation.goodRanges) ? allocation.goodRanges : []);
    });
    return mergeRanges(ranges);
}
function getEligibleRanges(step, results, rootRanges) {
    const dependencies = Array.isArray(step.dependsOn)
        ? step.dependsOn.map(String)
        : [];
    if (dependencies.length === 0) {
        return rootRanges;
    }
    let eligible = rootRanges;
    for (const dependencyId of dependencies) {
        eligible = intersectRanges(eligible, getGoodRanges(results, dependencyId));
        if (eligible.length === 0) {
            return [];
        }
    }
    return eligible;
}
// ============================================================
// SERIALIZATION
// ============================================================
function serializeStep(step) {
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
function serializeOrder(order) {
    return {
        _id: order._id,
        orderNumber: order.orderNumber,
        quantity: order.quantity,
        product: order.product,
        batch: order.batch,
        status: order.status,
    };
}
function createHttpError(status, message) {
    return Object.assign(new Error(message), { status });
}
function isOperatorAssigned(step, operatorId) {
    const assignments = Array.isArray(step.assignments) ? step.assignments : [];
    return assignments.some((assignment) => {
        const operators = Array.isArray(assignment.assignedOperators)
            ? assignment.assignedOperators
            : [];
        return operators.some((id) => String(id) === operatorId);
    });
}
function getAssignedRanges(step, operatorId) {
    const assignments = Array.isArray(step.assignments) ? step.assignments : [];
    return mergeRanges(assignments
        .filter((assignment) => {
        const operators = Array.isArray(assignment.assignedOperators)
            ? assignment.assignedOperators
            : [];
        return operators.some((id) => String(id) === operatorId);
    })
        .flatMap((assignment) => Array.isArray(assignment.unitRanges) ? assignment.unitRanges : []));
}
async function getResultsForOrders(orderIds) {
    return (await ProductionResultModel.find({
        productionOrder: { $in: orderIds },
    }).lean());
}
async function getResultsForOrder(orderId) {
    return (await ProductionResultModel.find({
        productionOrder: orderId,
    }).lean());
}
// ============================================================
// GET /api/operator-work/available
// ============================================================
router.get('/available', async (req, res) => {
    try {
        const operatorId = req.user?.userId;
        if (!operatorId || !mongoose.isValidObjectId(operatorId)) {
            return res.status(401).json({
                success: false,
                message: 'Operator tidak valid.',
            });
        }
        const operatorObjectId = new mongoose.Types.ObjectId(operatorId);
        const orders = (await ProductionOrderModel.find({
            status: { $ne: 'cancelled' },
            'steps.assignments.assignedOperators': operatorObjectId,
        })
            .populate('product', 'name')
            .populate('batch', 'batchNumber')
            .lean());
        if (orders.length === 0) {
            return res.json({
                success: true,
                data: [],
            });
        }
        const results = await getResultsForOrders(orders.map((order) => order._id));
        const data = orders.flatMap((order) => {
            const steps = Array.isArray(order.steps) ? order.steps : [];
            const rootRanges = [{ start: 1, end: order.quantity }];
            return steps
                .filter((step) => {
                if (step.ownerOperator != null ||
                    !['planned', 'partially_completed'].includes(step.status)) {
                    return false;
                }
                if (!isOperatorAssigned(step, operatorId)) {
                    return false;
                }
                const eligibleRanges = getEligibleRanges(step, results, rootRanges);
                const assignedRanges = getAssignedRanges(step, operatorId);
                return rangesOverlap(assignedRanges, eligibleRanges);
            })
                .map((step) => {
                const eligibleRanges = getEligibleRanges(step, results, rootRanges);
                const assignedRanges = getAssignedRanges(step, operatorId);
                return {
                    order: serializeOrder(order),
                    step: serializeStep(step),
                    assignedRanges,
                    eligibleRanges,
                    availableRanges: intersectRanges(assignedRanges, eligibleRanges),
                };
            });
        });
        return res.json({
            success: true,
            data,
        });
    }
    catch (error) {
        console.error('GET /api/operator-work/available:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal mengambil pekerjaan tersedia.',
        });
    }
});
// ============================================================
// GET /api/operator-work/mine
// ============================================================
router.get('/mine', async (req, res) => {
    try {
        const operatorId = req.user?.userId;
        if (!operatorId || !mongoose.isValidObjectId(operatorId)) {
            return res.status(401).json({
                success: false,
                message: 'Operator tidak valid.',
            });
        }
        const orders = (await ProductionOrderModel.find({
            'steps.ownerOperator': new mongoose.Types.ObjectId(operatorId),
        })
            .populate('product', 'name')
            .populate('batch', 'batchNumber')
            .lean());
        const data = orders.flatMap((order) => {
            const steps = Array.isArray(order.steps) ? order.steps : [];
            return steps
                .filter((step) => String(step.ownerOperator ?? '') === operatorId)
                .map((step) => ({
                order: serializeOrder(order),
                step: serializeStep(step),
            }));
        });
        return res.json({
            success: true,
            data,
        });
    }
    catch (error) {
        console.error('GET /api/operator-work/mine:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal mengambil proses milik Operator.',
        });
    }
});
// ============================================================
// POST /api/operator-work/orders/:orderId/steps/:stepId/start
// ============================================================
router.post('/orders/:orderId/steps/:stepId/start', async (req, res) => {
    const orderId = String(req.params.orderId ?? '');
    const stepId = String(req.params.stepId ?? '');
    const operatorId = req.user?.userId;
    if (!mongoose.isValidObjectId(orderId) ||
        !mongoose.isValidObjectId(stepId)) {
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
        const order = (await ProductionOrderModel.findById(orderId).lean());
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Production Order tidak ditemukan.',
            });
        }
        const steps = Array.isArray(order.steps) ? order.steps : [];
        const step = steps.find((item) => String(item._id) === stepId);
        if (!step) {
            return res.status(404).json({
                success: false,
                message: 'Step tidak ditemukan.',
            });
        }
        if (String(step.ownerOperator ?? '') === operatorId) {
            return res.json({
                success: true,
                message: 'Proses sudah dimiliki Operator ini.',
                data: {
                    orderId,
                    stepId,
                    ownerOperator: operatorId,
                },
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
        if (!isOperatorAssigned(step, operatorId)) {
            return res.status(403).json({
                success: false,
                message: 'Operator tidak ditugaskan pada proses ini.',
            });
        }
        const results = await getResultsForOrder(orderId);
        const eligibleRanges = getEligibleRanges(step, results, [
            { start: 1, end: order.quantity },
        ]);
        const assignedRanges = getAssignedRanges(step, operatorId);
        const availableRanges = intersectRanges(assignedRanges, eligibleRanges);
        if (availableRanges.length === 0) {
            return res.status(409).json({
                success: false,
                message: 'Belum ada unit yang memenuhi dependensi proses.',
            });
        }
        const now = new Date();
        // Syarat ownerOperator: null mencegah dua Operator menang
        // mengklaim step yang sama pada saat bersamaan.
        const claimed = (await ProductionOrderModel.findOneAndUpdate({
            _id: orderId,
            steps: {
                $elemMatch: {
                    _id: new mongoose.Types.ObjectId(stepId),
                    ownerOperator: null,
                    status: {
                        $in: ['planned', 'partially_completed'],
                    },
                    assignments: {
                        $elemMatch: {
                            assignedOperators: new mongoose.Types.ObjectId(operatorId),
                        },
                    },
                },
            },
        }, {
            $set: {
                'steps.$.ownerOperator': new mongoose.Types.ObjectId(operatorId),
                'steps.$.claimedAt': now,
                'steps.$.startedAt': now,
                'steps.$.status': 'in_progress',
                status: 'in_progress',
            },
        }, {
            new: true,
            runValidators: true,
        }).lean());
        if (!claimed) {
            const latestOrder = (await ProductionOrderModel.findById(orderId).lean());
            const latestSteps = Array.isArray(latestOrder?.steps)
                ? latestOrder.steps
                : [];
            const latestStep = latestSteps.find((item) => String(item._id) === stepId);
            if (latestStep?.ownerOperator != null &&
                String(latestStep.ownerOperator) !== operatorId) {
                return res.status(409).json({
                    success: false,
                    message: 'Operator lain lebih dahulu memulai proses ini.',
                });
            }
            return res.status(409).json({
                success: false,
                message: 'Proses sudah berubah. Muat ulang pekerjaan.',
            });
        }
        const claimedSteps = Array.isArray(claimed.steps)
            ? claimed.steps
            : [];
        const claimedStep = claimedSteps.find((item) => String(item._id) === stepId);
        return res.json({
            success: true,
            message: 'Proses berhasil dimulai.',
            data: {
                orderId,
                step: claimedStep ? serializeStep(claimedStep) : null,
            },
        });
    }
    catch (error) {
        console.error('POST operator start:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal memulai proses.',
        });
    }
});
// ============================================================
// POST /api/operator-work/orders/:orderId/steps/:sourceStepId/assignments
// ============================================================
router.post('/orders/:orderId/steps/:sourceStepId/assignments', async (req, res) => {
    const orderId = String(req.params.orderId ?? '');
    const sourceStepId = String(req.params.sourceStepId ?? '');
    const operatorId = req.user?.userId;
    if (!mongoose.isValidObjectId(orderId) ||
        !mongoose.isValidObjectId(sourceStepId)) {
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
    const parsed = assignmentSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            message: 'Data penugasan tidak valid.',
            errors: parsed.error.flatten(),
        });
    }
    const { targetStepId, operatorIds, unitRanges } = parsed.data;
    const uniqueOperatorIds = [...new Set(operatorIds)];
    const session = await mongoose.startSession();
    try {
        let responseData = null;
        await session.withTransaction(async () => {
            const order = (await ProductionOrderModel.findById(orderId).session(session));
            if (!order) {
                throw createHttpError(404, 'Production Order tidak ditemukan.');
            }
            const steps = Array.isArray(order.steps)
                ? order.steps
                : [];
            const sourceStep = steps.find((step) => String(step._id) === sourceStepId);
            const targetStep = steps.find((step) => String(step._id) === targetStepId);
            if (!sourceStep || !targetStep) {
                throw createHttpError(404, 'Step sumber atau target tidak ditemukan.');
            }
            if (String(sourceStep.ownerOperator ?? '') !== operatorId) {
                throw createHttpError(403, 'Hanya pemilik proses sumber yang dapat menugaskan pekerjaan lanjutan.');
            }
            if (!['partially_completed', 'completed'].includes(sourceStep.status)) {
                throw createHttpError(409, 'Proses sumber harus menghasilkan unit terlebih dahulu.');
            }
            const dependencies = Array.isArray(targetStep.dependsOn)
                ? targetStep.dependsOn.map(String)
                : [];
            if (!dependencies.includes(sourceStepId)) {
                throw createHttpError(400, 'Step target tidak bergantung pada step sumber ini.');
            }
            if (targetStep.status === 'cancelled' ||
                targetStep.status === 'completed') {
                throw createHttpError(409, 'Step target tidak menerima penugasan baru.');
            }
            if (!rangesWithinQuantity(unitRanges, order.quantity)) {
                throw createHttpError(400, 'Rentang unit berada di luar jumlah Production Order.');
            }
            if (targetStep.ownerOperator != null) {
                const ownerId = String(targetStep.ownerOperator);
                if (uniqueOperatorIds.length !== 1 ||
                    uniqueOperatorIds[0] !== ownerId) {
                    throw createHttpError(409, 'Penugasan tambahan hanya boleh diberikan kepada pemilik proses saat ini.');
                }
            }
            const recipientIds = uniqueOperatorIds.map((id) => new mongoose.Types.ObjectId(id));
            const recipients = await User.find({
                _id: { $in: recipientIds },
                role: 'operator',
            })
                .select('_id username email')
                .session(session)
                .lean();
            if (recipients.length !== uniqueOperatorIds.length) {
                throw createHttpError(400, 'Semua penerima harus merupakan akun Operator yang valid.');
            }
            const results = (await ProductionResultModel.find({
                productionOrder: orderId,
            })
                .session(session)
                .lean());
            const eligibleRanges = getEligibleRanges(targetStep, results, [
                { start: 1, end: order.quantity },
            ]);
            if (!isSubsetOfRanges(unitRanges, eligibleRanges)) {
                throw createHttpError(400, 'Sebagian unit belum memenuhi semua dependensi proses.');
            }
            const existingAssignments = Array.isArray(targetStep.assignments)
                ? targetStep.assignments
                : [];
            const previouslyAssignedRanges = existingAssignments.flatMap((assignment) => Array.isArray(assignment.unitRanges) ? assignment.unitRanges : []);
            if (rangesOverlap(unitRanges, previouslyAssignedRanges)) {
                throw createHttpError(409, 'Sebagian unit sudah pernah ditugaskan pada proses target.');
            }
            targetStep.assignments = existingAssignments;
            targetStep.assignments.push({
                assignedBy: new mongoose.Types.ObjectId(operatorId),
                assignedOperators: recipientIds,
                unitRanges,
                assignedAt: new Date(),
            });
            await order.save({ session });
            responseData = {
                orderId,
                sourceStepId,
                targetStep: serializeStep(targetStep),
                recipients: recipients.map((recipient) => ({
                    _id: recipient._id,
                    username: recipient.username,
                    email: recipient.email,
                })),
                assignedQuantity: countRanges(unitRanges),
            };
        });
        return res.status(201).json({
            success: true,
            message: 'Penugasan berhasil dibuat.',
            data: responseData,
        });
    }
    catch (error) {
        const err = error;
        const status = err.status ?? 500;
        if (status === 500) {
            console.error('POST operator assignment:', error);
        }
        return res.status(status).json({
            success: false,
            message: err.message || 'Gagal membuat penugasan.',
        });
    }
    finally {
        await session.endSession();
    }
});
export default router;
//# sourceMappingURL=operator-work.routes.js.map