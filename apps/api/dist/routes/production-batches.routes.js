import { Router, } from 'express';
import mongoose, {} from 'mongoose';
import { z } from 'zod';
import { ProductModel, ProductionBatchModel, ProductionOrderModel, } from '@fahrul-store/database';
import { buildProductionSteps, WorkflowValidationError, } from '../utils/build-production-steps.js';
import { authenticate, requireAdmin, } from '../middlewares/auth.middleware.js';
const router = Router();
const productionBatchSchema = z.object({
    status: z
        .enum(['planned', 'in_progress', 'completed', 'cancelled'])
        .optional(),
    plannedStartDate: z.string().optional().nullable(),
    plannedEndDate: z.string().optional().nullable(),
    notes: z.string().trim().optional(),
});
const productionBatchFromRequirementsSchema = z.object({
    plannedStartDate: z.string().optional().nullable(),
    plannedEndDate: z.string().optional().nullable(),
    notes: z.string().trim().optional(),
    items: z
        .array(z.object({
        product: z.string().trim().min(1, 'Product wajib diisi'),
        quantity: z.number().int().min(1, 'Quantity minimal 1'),
    }))
        .min(1, 'Minimal satu product harus dipilih.'),
});
/**
 * Admin Produksi boleh melihat daftar batch dan membuat batch
 * dari Production Requirements.
 *
 * Operasi manajemen batch lainnya tetap khusus admin.
 */
function requireProductionPlanningAccess(req, res, next) {
    const authReq = req;
    const role = authReq.user?.role;
    if (role !== 'admin' && role !== 'admin-produksi') {
        res.status(403).json({
            success: false,
            message: 'Akses ditolak. Khusus admin atau admin-produksi.',
        });
        return;
    }
    next();
}
router.use(authenticate);
/**
 * Generate batch number.
 *
 * Format: PB-YYYYMMDD-001
 */
async function generateBatchNumber(session) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const prefix = `PB-${year}${month}${day}-`;
    const query = ProductionBatchModel.findOne({
        batchNumber: {
            $regex: `^${prefix}\\d+$`,
        },
    })
        .sort({ batchNumber: -1 })
        .lean();
    if (session) {
        query.session(session);
    }
    const lastBatch = await query;
    let nextNumber = 1;
    if (lastBatch) {
        const lastSequence = Number(lastBatch.batchNumber.replace(prefix, ''));
        if (!Number.isNaN(lastSequence)) {
            nextNumber = lastSequence + 1;
        }
    }
    return `${prefix}${String(nextNumber).padStart(3, '0')}`;
}
/**
 * Generate production order number.
 *
 * Format: PO-YYYYMMDD-001
 */
async function generateOrderNumber(session) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const prefix = `PO-${year}${month}${day}-`;
    const query = ProductionOrderModel.findOne({
        orderNumber: {
            $regex: `^${prefix}\\d+$`,
        },
    })
        .sort({ orderNumber: -1 })
        .lean();
    if (session) {
        query.session(session);
    }
    const lastOrder = await query;
    let nextNumber = 1;
    if (lastOrder) {
        const lastSequence = Number(lastOrder.orderNumber.replace(prefix, ''));
        if (!Number.isNaN(lastSequence)) {
            nextNumber = lastSequence + 1;
        }
    }
    return `${prefix}${String(nextNumber).padStart(3, '0')}`;
}
/**
 * GET /api/production-batches
 *
 * Admin dan Admin Produksi boleh melihat daftar batch.
 */
router.get('/', requireProductionPlanningAccess, async (_req, res) => {
    try {
        const batches = await ProductionBatchModel.find()
            .sort({ createdAt: -1 })
            .lean();
        return res.json({
            success: true,
            data: batches,
        });
    }
    catch (error) {
        console.error('Get production batches error:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal mengambil production batches.',
        });
    }
});
/**
 * GET /api/production-batches/:id
 *
 * Khusus admin.
 */
router.get('/:id', requireAdmin, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: 'ID production batch tidak valid.',
            });
        }
        const batch = await ProductionBatchModel.findById(req.params.id).lean();
        if (!batch) {
            return res.status(404).json({
                success: false,
                message: 'Production batch tidak ditemukan.',
            });
        }
        return res.json({
            success: true,
            data: batch,
        });
    }
    catch (error) {
        console.error('Get production batch error:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal mengambil production batch.',
        });
    }
});
/**
 * POST /api/production-batches/from-requirements
 *
 * Admin dan Admin Produksi boleh membuat satu Production Batch
 * dan beberapa Production Order dalam satu transaction.
 */
router.post('/from-requirements', requireProductionPlanningAccess, async (req, res) => {
    const result = productionBatchFromRequirementsSchema.safeParse(req.body);
    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: result.error.issues[0]?.message ??
                'Data production batch tidak valid.',
        });
    }
    const { plannedStartDate, plannedEndDate, notes, items } = result.data;
    // Validasi ID produk sebelum memulai transaction.
    for (const item of items) {
        if (!mongoose.isValidObjectId(item.product)) {
            return res.status(400).json({
                success: false,
                message: `ID product ${item.product} tidak valid.`,
            });
        }
    }
    // Validasi tanggal.
    if (plannedStartDate && Number.isNaN(Date.parse(plannedStartDate))) {
        return res.status(400).json({
            success: false,
            message: 'Tanggal mulai produksi tidak valid.',
        });
    }
    if (plannedEndDate && Number.isNaN(Date.parse(plannedEndDate))) {
        return res.status(400).json({
            success: false,
            message: 'Tanggal selesai produksi tidak valid.',
        });
    }
    if (plannedStartDate &&
        plannedEndDate &&
        new Date(plannedEndDate) < new Date(plannedStartDate)) {
        return res.status(400).json({
            success: false,
            message: 'Tanggal selesai tidak boleh sebelum tanggal mulai.',
        });
    }
    const session = await mongoose.startSession();
    try {
        let createdBatch = null;
        const createdOrders = [];
        await session.withTransaction(async () => {
            /**
             * 1. Buat Production Batch.
             */
            const batchNumber = await generateBatchNumber(session);
            const batchResult = await ProductionBatchModel.create([
                {
                    batchNumber,
                    status: 'planned',
                    plannedStartDate: plannedStartDate
                        ? new Date(plannedStartDate)
                        : null,
                    plannedEndDate: plannedEndDate ? new Date(plannedEndDate) : null,
                    notes: notes ?? '',
                },
            ], { session });
            const batch = batchResult[0];
            if (!batch) {
                throw new Error('Production batch gagal dibuat.');
            }
            createdBatch = batch;
            /**
             * 2. Buat Production Order untuk setiap produk.
             */
            for (const item of items) {
                /**
                 * Ambil Product beserta workflow dan prosesnya.
                 * dependsOn tetap berupa nomor sequence dari Product.
                 */
                const productData = await ProductModel.findById(item.product)
                    .populate('workflow.process')
                    .session(session)
                    .lean();
                if (!productData) {
                    throw new Error(`Product ${item.product} tidak ditemukan.`);
                }
                /**
                 * Ubah workflow menjadi Production Steps.
                 *
                 * Helper menangani validasi sequence, dependensi,
                 * dependensi melingkar, dan inisialisasi hasil step.
                 */
                const steps = buildProductionSteps(productData.workflow ?? []);
                /**
                 * 3. Generate Production Order number.
                 */
                const orderNumber = await generateOrderNumber(session);
                /**
                 * 4. Simpan Production Order.
                 */
                const orderResult = await ProductionOrderModel.create([
                    {
                        orderNumber,
                        batch: batch._id,
                        product: productData._id,
                        quantity: item.quantity,
                        status: 'planned',
                        // Hasil akhir belum dihitung.
                        finalGoodQuantity: 0,
                        shortfallQuantity: 0,
                        steps,
                        notes: '',
                    },
                ], { session });
                const order = orderResult[0];
                if (!order) {
                    throw new Error(`Production Order untuk ${productData.name} gagal dibuat.`);
                }
                createdOrders.push(order);
            }
        });
        /**
         * Transaction berhasil commit.
         * Populate data untuk respons.
         */
        for (const order of createdOrders) {
            await order.populate([{ path: 'batch' }, { path: 'product' }]);
        }
        return res.status(201).json({
            success: true,
            message: 'Production batch dan production orders berhasil dibuat.',
            data: {
                batch: createdBatch,
                orders: createdOrders,
            },
        });
    }
    catch (error) {
        console.error('Create production batch from requirements error:', error);
        if (error instanceof WorkflowValidationError) {
            return res.status(400).json({
                success: false,
                message: error.message,
            });
        }
        return res.status(500).json({
            success: false,
            message: error instanceof Error
                ? error.message
                : 'Gagal membuat production batch dan production orders.',
        });
    }
    finally {
        await session.endSession();
    }
});
/**
 * POST /api/production-batches
 *
 * Khusus admin.
 */
router.post('/', requireAdmin, async (req, res) => {
    try {
        const result = productionBatchSchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.error.issues[0]?.message ??
                    'Data production batch tidak valid.',
            });
        }
        const { status, plannedStartDate, plannedEndDate, notes } = result.data;
        if (plannedStartDate && Number.isNaN(Date.parse(plannedStartDate))) {
            return res.status(400).json({
                success: false,
                message: 'Tanggal mulai produksi tidak valid.',
            });
        }
        if (plannedEndDate && Number.isNaN(Date.parse(plannedEndDate))) {
            return res.status(400).json({
                success: false,
                message: 'Tanggal selesai produksi tidak valid.',
            });
        }
        if (plannedStartDate &&
            plannedEndDate &&
            new Date(plannedEndDate) < new Date(plannedStartDate)) {
            return res.status(400).json({
                success: false,
                message: 'Tanggal selesai tidak boleh sebelum tanggal mulai.',
            });
        }
        const batchNumber = await generateBatchNumber();
        const batch = await ProductionBatchModel.create({
            batchNumber,
            status,
            plannedStartDate: plannedStartDate ? new Date(plannedStartDate) : null,
            plannedEndDate: plannedEndDate ? new Date(plannedEndDate) : null,
            notes,
        });
        return res.status(201).json({
            success: true,
            message: 'Production batch berhasil dibuat.',
            data: batch,
        });
    }
    catch (error) {
        console.error('Create production batch error:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal membuat production batch.',
        });
    }
});
/**
 * PUT /api/production-batches/:id
 *
 * Khusus admin.
 */
router.put('/:id', requireAdmin, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: 'ID production batch tidak valid.',
            });
        }
        const result = productionBatchSchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.error.issues[0]?.message ??
                    'Data production batch tidak valid.',
            });
        }
        const { status, plannedStartDate, plannedEndDate, notes } = result.data;
        if (plannedStartDate && Number.isNaN(Date.parse(plannedStartDate))) {
            return res.status(400).json({
                success: false,
                message: 'Tanggal mulai produksi tidak valid.',
            });
        }
        if (plannedEndDate && Number.isNaN(Date.parse(plannedEndDate))) {
            return res.status(400).json({
                success: false,
                message: 'Tanggal selesai produksi tidak valid.',
            });
        }
        if (plannedStartDate &&
            plannedEndDate &&
            new Date(plannedEndDate) < new Date(plannedStartDate)) {
            return res.status(400).json({
                success: false,
                message: 'Tanggal selesai tidak boleh sebelum tanggal mulai.',
            });
        }
        const batch = await ProductionBatchModel.findByIdAndUpdate(req.params.id, {
            status,
            plannedStartDate: plannedStartDate ? new Date(plannedStartDate) : null,
            plannedEndDate: plannedEndDate ? new Date(plannedEndDate) : null,
            notes,
        }, {
            new: true,
            runValidators: true,
        });
        if (!batch) {
            return res.status(404).json({
                success: false,
                message: 'Production batch tidak ditemukan.',
            });
        }
        return res.json({
            success: true,
            message: 'Production batch berhasil diperbarui.',
            data: batch,
        });
    }
    catch (error) {
        console.error('Update production batch error:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal memperbarui production batch.',
        });
    }
});
/**
 * DELETE /api/production-batches/:id
 *
 * Khusus admin.
 */
router.delete('/:id', requireAdmin, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: 'ID production batch tidak valid.',
            });
        }
        const batch = await ProductionBatchModel.findById(req.params.id);
        if (!batch) {
            return res.status(404).json({
                success: false,
                message: 'Production batch tidak ditemukan.',
            });
        }
        // Jangan menghapus batch jika masih memiliki Production Order.
        const existingOrder = await ProductionOrderModel.exists({
            batch: batch._id,
        });
        if (existingOrder) {
            return res.status(409).json({
                success: false,
                message: 'Production batch tidak bisa dihapus karena masih memiliki Production Order.',
            });
        }
        await batch.deleteOne();
        return res.json({
            success: true,
            message: 'Production batch berhasil dihapus.',
            data: null,
        });
    }
    catch (error) {
        console.error('Delete production batch error:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal menghapus production batch.',
        });
    }
});
export default router;
//# sourceMappingURL=production-batches.routes.js.map