import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { FinishedGoodsInventoryModel, ProductModel, ProductionBatchModel, ProductionLotModel, ProductionOrderModel, ProductionResultModel, StockMovementModel, } from '@fahrul-store/database';
import { buildProductionSteps, WorkflowValidationError, } from '../utils/build-production-steps.js';
import { authenticate, requireAdmin, } from '../middlewares/auth.middleware.js';
const router = Router();
const productionOrderSchema = z.object({
    batch: z.string().trim().min(1, 'Batch wajib diisi'),
    product: z.string().trim().min(1, 'Product wajib diisi'),
    quantity: z.number().int().min(1, 'Quantity minimal 1'),
    status: z
        .enum(['planned', 'in_progress', 'completed', 'cancelled'])
        .optional(),
    notes: z.string().trim().optional(),
});
const updateProductionOrderSchema = z.object({
    batch: z.string().trim().min(1, 'Batch wajib diisi'),
    product: z.string().trim().min(1, 'Product wajib diisi'),
    quantity: z.number().int().min(1, 'Quantity minimal 1'),
    status: z
        .enum(['planned', 'in_progress', 'completed', 'cancelled'])
        .optional(),
    notes: z.string().trim().optional(),
});
const updateStepStatusSchema = z.object({
    status: z.enum(['planned', 'in_progress', 'completed', 'cancelled']),
    notes: z.string().trim().optional(),
});
const rangeSchema = z
    .object({
    start: z.number().int().min(1),
    end: z.number().int().min(1),
})
    .refine((range) => range.end >= range.start, {
    message: 'Range end harus lebih besar atau sama dengan start.',
});
const productionResultSchema = z.object({
    idempotencyKey: z.string().trim().min(1).max(200),
    notes: z.string().trim().max(2000).optional().default(''),
    allocations: z
        .array(z.object({
        inputLot: z.string().trim().optional(),
        processedRanges: z.array(rangeSchema).min(1),
        goodRanges: z.array(rangeSchema).default([]),
        scrapRanges: z.array(rangeSchema).default([]),
    }))
        .min(1),
});
router.use(authenticate, requireAdmin);
function httpError(status, message) {
    return Object.assign(new Error(message), { status });
}
function isValidId(value) {
    return mongoose.isValidObjectId(value);
}
async function generateOrderNumber() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const prefix = `PO-${year}${month}${day}-`;
    const lastOrder = await ProductionOrderModel.findOne({
        orderNumber: {
            $regex: `^${prefix}\\d+$`,
        },
    })
        .sort({ orderNumber: -1 })
        .lean();
    let nextNumber = 1;
    if (lastOrder) {
        const lastSequence = Number(lastOrder.orderNumber.replace(prefix, ''));
        if (!Number.isNaN(lastSequence)) {
            nextNumber = lastSequence + 1;
        }
    }
    return `${prefix}${String(nextNumber).padStart(3, '0')}`;
}
function mergeRanges(ranges) {
    if (ranges.length === 0) {
        return [];
    }
    const sorted = ranges
        .map(({ start, end }) => ({ start, end }))
        .sort((a, b) => a.start - b.start);
    const merged = [{ ...sorted[0] }];
    for (const range of sorted.slice(1)) {
        const last = merged[merged.length - 1];
        if (range.start <= last.end + 1) {
            last.end = Math.max(last.end, range.end);
        }
        else {
            merged.push({ ...range });
        }
    }
    return merged;
}
function hasOverlappingRanges(ranges) {
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    for (let index = 1; index < sorted.length; index++) {
        if (sorted[index].start <= sorted[index - 1].end) {
            return true;
        }
    }
    return false;
}
function rangeCount(ranges) {
    return mergeRanges(ranges).reduce((total, range) => total + range.end - range.start + 1, 0);
}
function intersectRanges(first, second) {
    const a = mergeRanges(first);
    const b = mergeRanges(second);
    const result = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        const start = Math.max(a[i].start, b[j].start);
        const end = Math.min(a[i].end, b[j].end);
        if (start <= end) {
            result.push({ start, end });
        }
        if (a[i].end < b[j].end) {
            i++;
        }
        else {
            j++;
        }
    }
    return result;
}
function isSubsetOfRanges(candidate, allowed) {
    return (rangeCount(intersectRanges(candidate, allowed)) === rangeCount(candidate));
}
function sameRanges(first, second) {
    return isSubsetOfRanges(first, second) && isSubsetOfRanges(second, first);
}
function getResultRanges(results, stepId, field) {
    return mergeRanges(results
        .filter((result) => String(result.stepId) === stepId)
        .flatMap((result) => result.allocations.flatMap((allocation) => allocation[field] ?? [])));
}
function getEligibleRanges(step, results, rootRanges) {
    const dependencies = (step.dependsOn ?? []).map(String);
    if (dependencies.length === 0) {
        return rootRanges;
    }
    let eligible = rootRanges;
    for (const dependencyId of dependencies) {
        const dependencyGoodRanges = getResultRanges(results, dependencyId, 'goodRanges');
        eligible = intersectRanges(eligible, dependencyGoodRanges);
    }
    return eligible;
}
function getFinalGoodRanges(steps, results) {
    const referencedStepIds = new Set(steps.flatMap((step) => (step.dependsOn ?? []).map(String)));
    const terminalSteps = steps.filter((step) => !referencedStepIds.has(String(step._id)));
    if (terminalSteps.length === 0) {
        return [];
    }
    let finalRanges = getResultRanges(results, String(terminalSteps[0]._id), 'goodRanges');
    for (const step of terminalSteps.slice(1)) {
        finalRanges = intersectRanges(finalRanges, getResultRanges(results, String(step._id), 'goodRanges'));
    }
    return finalRanges;
}
function sanitizeLotCode(value) {
    return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}
async function findOrCreateRootLot(order, session) {
    const lotCode = sanitizeLotCode(`${order.orderNumber}-ROOT`);
    let rootLot = await ProductionLotModel.findOne({
        productionOrder: order._id,
        lotCode,
    }).session(session);
    if (!rootLot) {
        rootLot = new ProductionLotModel({
            productionOrder: order._id,
            product: order.product,
            lotCode,
            parentLot: null,
            sourceStepId: null,
            sourceResult: null,
            quantity: order.quantity,
            status: 'active',
            unitRanges: [{ start: 1, end: order.quantity }],
        });
        await rootLot.save({ session });
    }
    return rootLot;
}
/**
 * GET /api/production-orders
 */
router.get('/', async (_req, res) => {
    try {
        const orders = await ProductionOrderModel.find()
            .populate('batch')
            .populate('product')
            .sort({ createdAt: -1 })
            .lean();
        return res.json({
            success: true,
            data: orders,
        });
    }
    catch (error) {
        console.error('Get production orders error:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal mengambil production orders.',
        });
    }
});
/**
 * GET /api/production-orders/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const orderId = String(req.params.id ?? '');
        if (!isValidId(orderId)) {
            return res.status(400).json({
                success: false,
                message: 'ID production order tidak valid.',
            });
        }
        const order = await ProductionOrderModel.findById(orderId)
            .populate('batch')
            .populate('product')
            .lean();
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Production order tidak ditemukan.',
            });
        }
        return res.json({
            success: true,
            data: order,
        });
    }
    catch (error) {
        console.error('Get production order error:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal mengambil production order.',
        });
    }
});
/**
 * POST /api/production-orders
 */
router.post('/', async (req, res) => {
    try {
        const result = productionOrderSchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.error.issues[0]?.message ??
                    'Data production order tidak valid.',
            });
        }
        const { batch, product, quantity, status, notes } = result.data;
        if (!isValidId(batch) || !isValidId(product)) {
            return res.status(400).json({
                success: false,
                message: 'ID batch atau product tidak valid.',
            });
        }
        if (status && status !== 'planned') {
            return res.status(400).json({
                success: false,
                message: 'Production Order baru harus berstatus planned.',
            });
        }
        const [batchData, productData] = await Promise.all([
            ProductionBatchModel.findById(batch).lean(),
            ProductModel.findById(product)
                .populate('workflow.process')
                .lean(),
        ]);
        if (!batchData) {
            return res.status(404).json({
                success: false,
                message: 'Production batch tidak ditemukan.',
            });
        }
        if (batchData.status === 'completed' || batchData.status === 'cancelled') {
            return res.status(400).json({
                success: false,
                message: 'Production Order tidak bisa dibuat untuk batch yang sudah selesai atau dibatalkan.',
            });
        }
        if (!productData) {
            return res.status(404).json({
                success: false,
                message: 'Product tidak ditemukan.',
            });
        }
        const steps = buildProductionSteps(productData.workflow ?? []);
        const orderNumber = await generateOrderNumber();
        const order = await ProductionOrderModel.create({
            orderNumber,
            batch,
            product,
            quantity,
            status: 'planned',
            finalGoodQuantity: 0,
            shortfallQuantity: 0,
            steps,
            notes: notes ?? '',
        });
        await order.populate([{ path: 'batch' }, { path: 'product' }]);
        return res.status(201).json({
            success: true,
            message: 'Production order berhasil dibuat.',
            data: order,
        });
    }
    catch (error) {
        if (error instanceof WorkflowValidationError) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
        console.error('Create production order error:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal membuat production order.',
        });
    }
});
/**
 * PUT /api/production-orders/:id
 */
router.put('/:id', async (req, res) => {
    try {
        const orderId = String(req.params.id ?? '');
        if (!isValidId(orderId)) {
            return res.status(400).json({
                success: false,
                message: 'ID production order tidak valid.',
            });
        }
        const result = updateProductionOrderSchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.error.issues[0]?.message ??
                    'Data production order tidak valid.',
            });
        }
        const { batch, product, quantity, status, notes } = result.data;
        if (!isValidId(batch) || !isValidId(product)) {
            return res.status(400).json({
                success: false,
                message: 'ID batch atau product tidak valid.',
            });
        }
        if (status && status !== 'planned') {
            return res.status(400).json({
                success: false,
                message: 'Status produksi tidak dapat diubah melalui endpoint edit order.',
            });
        }
        const order = await ProductionOrderModel.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Production order tidak ditemukan.',
            });
        }
        if (order.status !== 'planned' ||
            order.steps.some((step) => step.quantityProcessed > 0 ||
                step.status === 'in_progress' ||
                step.status === 'partially_completed' ||
                step.status === 'completed')) {
            return res.status(409).json({
                success: false,
                message: 'Production Order tidak bisa diedit setelah proses produksi dimulai.',
            });
        }
        const [batchData, productData] = await Promise.all([
            ProductionBatchModel.findById(batch).lean(),
            ProductModel.findById(product)
                .populate('workflow.process')
                .lean(),
        ]);
        if (!batchData) {
            return res.status(404).json({
                success: false,
                message: 'Production batch tidak ditemukan.',
            });
        }
        if (batchData.status === 'completed' || batchData.status === 'cancelled') {
            return res.status(400).json({
                success: false,
                message: 'Production Order tidak bisa dipindahkan ke batch yang sudah selesai atau dibatalkan.',
            });
        }
        if (!productData) {
            return res.status(404).json({
                success: false,
                message: 'Product tidak ditemukan.',
            });
        }
        const steps = buildProductionSteps(productData.workflow ?? []);
        order.batch = new mongoose.Types.ObjectId(batch);
        order.product = new mongoose.Types.ObjectId(product);
        order.quantity = quantity;
        order.status = 'planned';
        order.steps = steps;
        order.finalGoodQuantity = 0;
        order.shortfallQuantity = 0;
        if (notes !== undefined) {
            order.notes = notes;
        }
        await order.save();
        await order.populate([{ path: 'batch' }, { path: 'product' }]);
        return res.json({
            success: true,
            message: 'Production order berhasil diperbarui.',
            data: order,
        });
    }
    catch (error) {
        if (error instanceof WorkflowValidationError) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
        console.error('Update production order error:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal memperbarui production order.',
        });
    }
});
/**
 * PATCH /api/production-orders/:id/steps/:stepId
 */
router.patch('/:id/steps/:stepId', async (req, res) => {
    try {
        const orderId = String(req.params.id ?? '');
        const stepId = String(req.params.stepId ?? '');
        if (!isValidId(orderId) || !isValidId(stepId)) {
            return res.status(400).json({
                success: false,
                message: 'ID production order atau step tidak valid.',
            });
        }
        const result = updateStepStatusSchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.error.issues[0]?.message ??
                    'Data production step tidak valid.',
            });
        }
        const { status, notes } = result.data;
        const order = await ProductionOrderModel.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Production order tidak ditemukan.',
            });
        }
        if (order.status === 'completed' || order.status === 'cancelled') {
            return res.status(409).json({
                success: false,
                message: 'Production Order yang sudah selesai atau dibatalkan tidak bisa diubah.',
            });
        }
        const step = order.steps.find((item) => String(item._id) === stepId);
        if (!step) {
            return res.status(404).json({
                success: false,
                message: 'Production step tidak ditemukan.',
            });
        }
        if (status === 'completed') {
            return res.status(409).json({
                success: false,
                message: 'Step harus diselesaikan melalui pencatatan hasil produksi.',
            });
        }
        if (status === 'planned' && step.quantityProcessed > 0) {
            return res.status(409).json({
                success: false,
                message: 'Step yang sudah memiliki hasil inspeksi tidak bisa dikembalikan ke planned.',
            });
        }
        if (status === 'in_progress') {
            const dependencySteps = step.dependsOn.map((dependencyId) => order.steps.find((candidate) => String(candidate._id) === String(dependencyId)));
            if (dependencySteps.some((dependency) => !dependency)) {
                return res.status(400).json({
                    success: false,
                    message: 'Workflow tidak valid: ada step prasyarat yang tidak ditemukan.',
                });
            }
            const unfinishedDependency = dependencySteps.find((dependency) => dependency.status !== 'completed');
            if (unfinishedDependency) {
                return res.status(409).json({
                    success: false,
                    message: `Step prasyarat "${unfinishedDependency.processName}" belum selesai.`,
                });
            }
            if (step.status === 'cancelled') {
                return res.status(409).json({
                    success: false,
                    message: 'Step yang dibatalkan tidak bisa dimulai kembali.',
                });
            }
            step.startedAt ??= new Date();
            step.completedAt = null;
        }
        if (status === 'planned') {
            step.startedAt = null;
            step.completedAt = null;
        }
        if (status === 'cancelled') {
            if (step.quantityProcessed > 0) {
                return res.status(409).json({
                    success: false,
                    message: 'Step yang sudah memiliki hasil inspeksi tidak bisa dibatalkan.',
                });
            }
            step.completedAt = null;
        }
        step.status = status;
        if (notes !== undefined) {
            step.notes = notes;
        }
        const hasActiveStep = order.steps.some((item) => item.status === 'in_progress' ||
            item.status === 'partially_completed' ||
            item.status === 'completed');
        const allStepsCancelled = order.steps.length > 0 &&
            order.steps.every((item) => item.status === 'cancelled');
        if (allStepsCancelled) {
            order.status = 'cancelled';
        }
        else if (hasActiveStep) {
            order.status = 'in_progress';
        }
        else {
            order.status = 'planned';
        }
        await order.save();
        await order.populate([{ path: 'batch' }, { path: 'product' }]);
        return res.json({
            success: true,
            message: 'Status production step berhasil diperbarui.',
            data: order,
        });
    }
    catch (error) {
        console.error('Update production step error:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal memperbarui production step.',
        });
    }
});
/**
 * POST /api/production-orders/:id/steps/:stepId/results
 *
 * Mencatat hasil inspeksi step dengan range identitas unit.
 */
router.post('/:id/steps/:stepId/results', async (req, res) => {
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
            message: 'Operator tidak valid.',
        });
    }
    const parsed = productionResultSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({
            success: false,
            message: 'Data hasil produksi tidak valid.',
            errors: parsed.error.issues,
        });
    }
    const input = parsed.data;
    for (const allocation of input.allocations) {
        if (allocation.inputLot !== undefined && !isValidId(allocation.inputLot)) {
            return res.status(400).json({
                success: false,
                message: 'Input lot ID tidak valid.',
            });
        }
    }
    const existing = await ProductionResultModel.findOne({
        idempotencyKey: input.idempotencyKey,
    }).lean();
    if (existing) {
        if (String(existing.productionOrder) === orderId &&
            String(existing.stepId) === stepId) {
            return res.status(200).json({
                success: true,
                message: 'Hasil produksi sudah pernah dicatat.',
                data: existing,
            });
        }
        return res.status(409).json({
            success: false,
            message: 'Idempotency key sudah digunakan oleh event lain.',
        });
    }
    const session = await mongoose.startSession();
    try {
        let createdResult;
        let updatedOrder;
        let rootLotId;
        await session.withTransaction(async () => {
            const order = await ProductionOrderModel.findById(orderId).session(session);
            if (!order) {
                throw httpError(404, 'Production Order tidak ditemukan.');
            }
            if (order.status === 'completed' || order.status === 'cancelled') {
                throw httpError(409, 'Production Order sudah selesai atau dibatalkan.');
            }
            if (!Number.isInteger(order.quantity) || order.quantity < 1) {
                throw httpError(409, 'Quantity Production Order harus berupa bilangan bulat positif.');
            }
            const step = order.steps.find((item) => String(item._id) === stepId);
            if (!step) {
                throw httpError(404, 'Production Step tidak ditemukan.');
            }
            if (step.status === 'completed' || step.status === 'cancelled') {
                throw httpError(409, 'Step sudah selesai atau dibatalkan.');
            }
            for (const dependencyId of step.dependsOn) {
                const dependency = order.steps.find((candidate) => String(candidate._id) === String(dependencyId));
                if (!dependency) {
                    throw httpError(409, 'Workflow memiliki dependency yang tidak valid.');
                }
                if (dependency.status === 'cancelled') {
                    throw httpError(409, 'Dependency step dibatalkan.');
                }
            }
            const rootLot = await findOrCreateRootLot({
                _id: order._id,
                orderNumber: order.orderNumber,
                product: order.product,
                quantity: order.quantity,
            }, session);
            rootLotId = String(rootLot._id);
            const rootRanges = rootLot.unitRanges.map((range) => ({
                start: range.start,
                end: range.end,
            }));
            let priorResults = (await ProductionResultModel.find({
                productionOrder: order._id,
            })
                .session(session)
                .lean());
            const eligibleRanges = getEligibleRanges(step, priorResults, rootRanges);
            if (eligibleRanges.length === 0) {
                throw httpError(409, 'Belum ada unit yang memenuhi syarat untuk step ini.');
            }
            const previouslyProcessedRanges = getResultRanges(priorResults, stepId, 'processedRanges');
            const allocations = [];
            const allSubmittedRanges = [];
            let inspectedQuantity = 0;
            let goodQuantity = 0;
            let scrapQuantity = 0;
            for (const [index, allocation] of input.allocations.entries()) {
                const processedRanges = allocation.processedRanges;
                const goodRanges = allocation.goodRanges;
                const scrapRanges = allocation.scrapRanges;
                if (hasOverlappingRanges(processedRanges) ||
                    hasOverlappingRanges(goodRanges) ||
                    hasOverlappingRanges(scrapRanges)) {
                    throw httpError(400, 'Range dalam satu allocation tidak boleh overlap.');
                }
                if (!isSubsetOfRanges(goodRanges, processedRanges) ||
                    !isSubsetOfRanges(scrapRanges, processedRanges) ||
                    !sameRanges(mergeRanges([...goodRanges, ...scrapRanges]), processedRanges) ||
                    rangeCount(goodRanges) + rangeCount(scrapRanges) !==
                        rangeCount(processedRanges)) {
                    throw httpError(400, 'Good dan scrap harus membagi processed range tanpa overlap atau sisa.');
                }
                if (!isSubsetOfRanges(processedRanges, eligibleRanges)) {
                    throw httpError(400, 'Ada unit yang belum lolos semua dependency workflow.');
                }
                if (rangeCount(intersectRanges(processedRanges, previouslyProcessedRanges)) > 0) {
                    throw httpError(409, 'Unit yang sama sudah pernah diproses pada step ini.');
                }
                if (rangeCount(intersectRanges(processedRanges, allSubmittedRanges)) > 0) {
                    throw httpError(400, 'Unit yang sama tidak boleh muncul di beberapa allocation.');
                }
                let inputLot;
                if (allocation.inputLot) {
                    inputLot = await ProductionLotModel.findOne({
                        _id: allocation.inputLot,
                        productionOrder: order._id,
                        product: order.product,
                    }).session(session);
                }
                else if (step.dependsOn.length === 0) {
                    inputLot = rootLot;
                }
                else {
                    throw httpError(400, 'Input lot wajib diisi untuk step yang memiliki dependency.');
                }
                if (!inputLot) {
                    throw httpError(400, 'Input lot tidak ditemukan atau bukan milik Production Order ini.');
                }
                if (inputLot.status === 'scrap') {
                    throw httpError(400, 'Lot scrap tidak boleh diproses kembali.');
                }
                const inputLotRanges = inputLot.unitRanges.map((range) => ({
                    start: range.start,
                    end: range.end,
                }));
                if (!isSubsetOfRanges(processedRanges, inputLotRanges)) {
                    throw httpError(400, 'Processed range berada di luar unit range input lot.');
                }
                allSubmittedRanges.push(...processedRanges);
                const allocationProcessed = rangeCount(processedRanges);
                const allocationGood = rangeCount(goodRanges);
                const allocationScrap = rangeCount(scrapRanges);
                inspectedQuantity += allocationProcessed;
                goodQuantity += allocationGood;
                scrapQuantity += allocationScrap;
                const lotPrefix = sanitizeLotCode(`${order.orderNumber}-S${step.sequence}-${input.idempotencyKey}-A${index}`);
                let goodLotId = null;
                let scrapLotId = null;
                if (goodRanges.length > 0) {
                    const goodLot = new ProductionLotModel({
                        productionOrder: order._id,
                        product: order.product,
                        lotCode: `${lotPrefix}-G`,
                        parentLot: inputLot._id,
                        sourceStepId: step._id,
                        sourceResult: null,
                        quantity: allocationGood,
                        status: 'active',
                        unitRanges: goodRanges,
                        notes: input.notes,
                    });
                    await goodLot.save({ session });
                    goodLotId = goodLot._id;
                }
                if (scrapRanges.length > 0) {
                    const scrapLot = new ProductionLotModel({
                        productionOrder: order._id,
                        product: order.product,
                        lotCode: `${lotPrefix}-X`,
                        parentLot: inputLot._id,
                        sourceStepId: step._id,
                        sourceResult: null,
                        quantity: allocationScrap,
                        status: 'scrap',
                        unitRanges: scrapRanges,
                        notes: input.notes,
                    });
                    await scrapLot.save({ session });
                    scrapLotId = scrapLot._id;
                }
                allocations.push({
                    inputLot: inputLot._id,
                    quantityProcessed: allocationProcessed,
                    goodQuantity: allocationGood,
                    scrapQuantity: allocationScrap,
                    processedRanges,
                    goodRanges,
                    scrapRanges,
                    goodLot: goodLotId,
                    scrapLot: scrapLotId,
                });
            }
            step.startedAt ??= new Date();
            const productionResult = new ProductionResultModel({
                productionOrder: order._id,
                stepId: step._id,
                sequence: step.sequence,
                process: step.process,
                operator: new mongoose.Types.ObjectId(req.user.userId),
                inspectedQuantity,
                goodQuantity,
                scrapQuantity,
                allocations,
                notes: input.notes,
                recordedAt: new Date(),
                idempotencyKey: input.idempotencyKey,
            });
            await productionResult.save({ session });
            const outputLotIds = allocations.flatMap((allocation) => [allocation.goodLot, allocation.scrapLot].filter((id) => id !== null));
            if (outputLotIds.length > 0) {
                await ProductionLotModel.updateMany({ _id: { $in: outputLotIds } }, { $set: { sourceResult: productionResult._id } }, { session });
            }
            priorResults = (await ProductionResultModel.find({
                productionOrder: order._id,
            })
                .session(session)
                .lean());
            for (let pass = 0; pass < order.steps.length; pass++) {
                for (const currentStep of order.steps) {
                    if (currentStep.status === 'cancelled') {
                        continue;
                    }
                    const currentId = String(currentStep._id);
                    const dependencySteps = currentStep.dependsOn.map((dependencyId) => order.steps.find((candidate) => String(candidate._id) === String(dependencyId)));
                    const dependenciesCompleted = dependencySteps.every((dependency) => dependency?.status === 'completed');
                    const currentProcessed = getResultRanges(priorResults, currentId, 'processedRanges');
                    const currentGood = getResultRanges(priorResults, currentId, 'goodRanges');
                    const currentScrap = getResultRanges(priorResults, currentId, 'scrapRanges');
                    const currentEligible = getEligibleRanges(currentStep, priorResults, rootRanges);
                    currentStep.quantityProcessed = rangeCount(currentProcessed);
                    currentStep.quantityGood = rangeCount(currentGood);
                    currentStep.quantityScrap = rangeCount(currentScrap);
                    const fullyProcessed = sameRanges(currentProcessed, currentEligible);
                    if (dependenciesCompleted && fullyProcessed) {
                        currentStep.status = 'completed';
                        currentStep.completedAt ??= new Date();
                    }
                    else if (rangeCount(currentProcessed) > 0) {
                        currentStep.status = 'partially_completed';
                        currentStep.completedAt = null;
                    }
                    else if (currentStep.startedAt) {
                        currentStep.status = 'in_progress';
                        currentStep.completedAt = null;
                    }
                }
            }
            const allStepsCompleted = order.steps.length > 0 &&
                order.steps.every((currentStep) => currentStep.status === 'completed');
            if (allStepsCompleted) {
                const finalGoodRanges = getFinalGoodRanges(order.steps, priorResults);
                const finalGoodQuantity = rangeCount(finalGoodRanges);
                order.finalGoodQuantity = finalGoodQuantity;
                order.shortfallQuantity = Math.max(0, order.quantity - finalGoodQuantity);
                order.status = 'completed';
                if (finalGoodQuantity > 0) {
                    await FinishedGoodsInventoryModel.updateOne({ product: order.product }, {
                        $inc: { quantity: finalGoodQuantity },
                        $setOnInsert: { allocatedQuantity: 0 },
                    }, {
                        upsert: true,
                        session,
                        setDefaultsOnInsert: true,
                    });
                    await StockMovementModel.create([
                        {
                            product: order.product,
                            type: 'IN',
                            quantity: finalGoodQuantity,
                            referenceType: 'production_order',
                            referenceId: order._id,
                            referenceItemId: null,
                            idempotencyKey: `production-order-final:${order._id}`,
                        },
                    ], { session });
                }
            }
            else {
                order.status = 'in_progress';
            }
            await order.save({ session });
            createdResult = productionResult;
            updatedOrder = order;
        });
        return res.status(201).json({
            success: true,
            message: 'Hasil produksi berhasil dicatat.',
            data: {
                result: createdResult,
                productionOrder: updatedOrder,
                rootLotId,
            },
        });
    }
    catch (error) {
        const mongoError = error;
        if (mongoError.code === 11000) {
            const duplicate = await ProductionResultModel.findOne({
                idempotencyKey: input.idempotencyKey,
            }).lean();
            if (duplicate &&
                String(duplicate.productionOrder) === orderId &&
                String(duplicate.stepId) === stepId) {
                return res.status(200).json({
                    success: true,
                    message: 'Hasil produksi sudah pernah dicatat.',
                    data: duplicate,
                });
            }
            return res.status(409).json({
                success: false,
                message: 'Terjadi konflik data unik atau idempotency key.',
            });
        }
        const status = mongoError.status ?? 500;
        if (status === 500) {
            console.error('Gagal mencatat hasil produksi:', error);
        }
        return res.status(status).json({
            success: false,
            message: status === 500 ? 'Gagal mencatat hasil produksi.' : mongoError.message,
        });
    }
    finally {
        await session.endSession();
    }
});
/**
 * DELETE /api/production-orders/:id
 */
router.delete('/:id', async (req, res) => {
    try {
        const orderId = String(req.params.id ?? '');
        if (!isValidId(orderId)) {
            return res.status(400).json({
                success: false,
                message: 'ID production order tidak valid.',
            });
        }
        const order = await ProductionOrderModel.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Production order tidak ditemukan.',
            });
        }
        const hasProductionActivity = order.steps.some((step) => step.quantityProcessed > 0 ||
            step.status === 'in_progress' ||
            step.status === 'partially_completed' ||
            step.status === 'completed');
        if (order.status !== 'planned' || hasProductionActivity) {
            return res.status(409).json({
                success: false,
                message: 'Production Order tidak bisa dihapus setelah produksi dimulai.',
            });
        }
        await order.deleteOne();
        return res.json({
            success: true,
            message: 'Production order berhasil dihapus.',
            data: null,
        });
    }
    catch (error) {
        console.error('Delete production order error:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal menghapus production order.',
        });
    }
});
export default router;
//# sourceMappingURL=production-orders.routes.js.map