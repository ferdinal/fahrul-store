import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import multer from 'multer';
import { parseProductExcel } from '../utils/product-excel.js';
import { ProductModel, ProductionOrderModel, ProductionProcessModel, } from '@fahrul-store/database';
import { authenticate, requireAdmin, } from '../middlewares/auth.middleware.js';
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024,
    },
});
const router = Router();
/**
 * Workflow item validation
 */
const workflowItemSchema = z.object({
    process: z.string().trim().min(1, 'Process wajib diisi'),
    sequence: z.number().int().min(1, 'Sequence minimal 1'),
});
/**
 * Product validation
 */
const productSchema = z.object({
    version: z.string().trim().min(1, 'Version wajib diisi'),
    body: z.string().trim().optional().default(''),
    workflow: z.array(workflowItemSchema).optional().default([]),
});
/**
 * Product workflow validation
 */
const productWorkflowSchema = z.object({
    workflow: z.array(workflowItemSchema).default([]),
});
/**
 * =========================================================
 * GET /api/products
 *
 * Accessible by:
 * - admin
 * - user / reseller
 * =========================================================
 */
router.get('/', authenticate, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized',
            });
        }
        if (req.user.role !== 'admin' && req.user.role !== 'user') {
            return res.status(403).json({
                success: false,
                message: 'Access denied.',
            });
        }
        const products = await ProductModel.find()
            .populate('workflow.process')
            .sort({ createdAt: -1 })
            .lean();
        return res.json({
            success: true,
            data: products,
        });
    }
    catch (error) {
        console.error('Get products error:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal mengambil products.',
        });
    }
});
/**
 * =========================================================
 * POST /api/products/import
 *
 * Admin only
 * =========================================================
 */
router.post('/import', authenticate, requireAdmin, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'File Excel wajib diupload',
            });
        }
        const fileName = req.file.originalname.toLowerCase();
        const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
        if (!isExcel) {
            return res.status(400).json({
                success: false,
                message: 'File harus berformat .xlsx atau .xls',
            });
        }
        const rows = parseProductExcel(req.file.buffer);
        if (rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Excel tidak memiliki data product',
            });
        }
        let created = 0;
        let skipped = 0;
        let failed = 0;
        const errors = [];
        const seen = new Set();
        for (const row of rows) {
            try {
                if (!row.version) {
                    failed += 1;
                    errors.push({
                        rowNumber: row.rowNumber,
                        message: 'VERSI wajib diisi',
                    });
                    continue;
                }
                const key = `${row.version}::${row.body}`.toLowerCase();
                if (seen.has(key)) {
                    skipped += 1;
                    continue;
                }
                seen.add(key);
                const existing = await ProductModel.findOne({
                    version: row.version,
                    body: row.body,
                });
                if (existing) {
                    skipped += 1;
                    continue;
                }
                const name = `${row.version} ${row.body}`.trim();
                await ProductModel.create({
                    name,
                    version: row.version,
                    body: row.body,
                    workflow: [],
                });
                created += 1;
            }
            catch (error) {
                failed += 1;
                errors.push({
                    rowNumber: row.rowNumber,
                    message: error instanceof Error ? error.message : 'Gagal membuat product',
                });
            }
        }
        return res.json({
            success: true,
            message: 'Master product berhasil diimport',
            data: {
                total: rows.length,
                created,
                skipped,
                failed,
                errors,
            },
        });
    }
    catch (error) {
        console.error('Product Excel import error:', error);
        return res.status(500).json({
            success: false,
            message: error instanceof Error
                ? error.message
                : 'Gagal mengimport master product',
        });
    }
});
/**
 * =========================================================
 * GET /api/products/:id
 *
 * Accessible by:
 * - admin
 * - user / reseller
 * =========================================================
 */
router.get('/:id', authenticate, async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized',
            });
        }
        if (req.user.role !== 'admin' && req.user.role !== 'user') {
            return res.status(403).json({
                success: false,
                message: 'Access denied.',
            });
        }
        const product = await ProductModel.findById(req.params.id)
            .populate('workflow.process')
            .lean();
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product tidak ditemukan.',
            });
        }
        return res.json({
            success: true,
            data: product,
        });
    }
    catch (error) {
        console.error('Get product error:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal mengambil product.',
        });
    }
});
/**
 * =========================================================
 * POST /api/products
 *
 * Admin only
 * =========================================================
 */
router.post('/', authenticate, requireAdmin, async (req, res) => {
    try {
        const result = productSchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.error.issues[0]?.message ?? 'Data product tidak valid.',
            });
        }
        const { version, body, workflow = [] } = result.data;
        /**
         * Product name is generated automatically
         */
        const name = `${version} ${body}`.trim();
        const product = await ProductModel.create({
            name,
            version,
            body,
            workflow,
        });
        /**
         * Populate workflow.process
         */
        await product.populate('workflow.process');
        return res.status(201).json({
            success: true,
            message: 'Product berhasil dibuat.',
            data: product,
        });
    }
    catch (error) {
        console.error('Create product error:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal membuat product.',
        });
    }
});
/**
 * =========================================================
 * PUT /api/products/:id/workflow
 *
 * Admin only
 *
 * Update product workflow and sync workflow
 * to planned Production Orders that do not
 * have steps yet.
 * =========================================================
 */
router.put('/:id/workflow', authenticate, requireAdmin, async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const result = productWorkflowSchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.error.issues[0]?.message ?? 'Data workflow tidak valid.',
            });
        }
        session.startTransaction();
        // =========================================================
        // 1. UPDATE WORKFLOW PRODUCT
        // =========================================================
        const product = await ProductModel.findByIdAndUpdate(req.params.id, {
            workflow: result.data.workflow,
        }, {
            new: true,
            runValidators: true,
            session,
        });
        if (!product) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: 'Product tidak ditemukan.',
            });
        }
        console.log('[Workflow] Product:', product._id.toString());
        console.log('[Workflow] Workflow:', product.workflow);
        // =========================================================
        // 2. AMBIL PRODUCTION PROCESS
        // =========================================================
        const processIds = product.workflow.map((workflow) => workflow.process);
        const processes = processIds.length > 0
            ? await ProductionProcessModel.find({
                _id: {
                    $in: processIds,
                },
            }).session(session)
            : [];
        console.log('[Workflow] Processes found:', processes.length);
        // Map process berdasarkan ID
        const processMap = new Map(processes.map((process) => [process._id.toString(), process]));
        // =========================================================
        // 3. VALIDASI SEMUA PROCESS ADA
        // =========================================================
        for (const workflow of product.workflow) {
            const process = processMap.get(workflow.process.toString());
            if (!process) {
                throw new Error(`Production process ${workflow.process.toString()} tidak ditemukan.`);
            }
        }
        // =========================================================
        // 4. BUILD PRODUCTION ORDER STEPS
        // =========================================================
        const steps = product.workflow
            .map((workflow) => {
            const process = processMap.get(workflow.process.toString());
            if (!process) {
                throw new Error(`Production process ${workflow.process.toString()} tidak ditemukan.`);
            }
            return {
                process: process._id,
                processName: process.name,
                processCode: process.code,
                sequence: workflow.sequence,
                status: 'planned',
                startedAt: null,
                completedAt: null,
                notes: '',
            };
        })
            .sort((a, b) => a.sequence - b.sequence);
        console.log('[Workflow] Generated steps:', steps);
        // =========================================================
        // 5. CARI PRODUCTION ORDER
        // =========================================================
        const productionOrders = await ProductionOrderModel.find({
            product: product._id,
            status: 'planned',
        }).session(session);
        console.log('[Workflow] Production orders found:', productionOrders.length);
        // =========================================================
        // 6. UPDATE PRODUCTION ORDER YANG BELUM PUNYA STEPS
        // =========================================================
        let syncedProductionOrders = 0;
        for (const productionOrder of productionOrders) {
            console.log('[Workflow] Checking Production Order:', productionOrder.orderNumber, 'steps:', productionOrder.steps?.length ?? 0);
            // Jangan overwrite Production Order
            // yang sudah punya workflow/steps.
            if (productionOrder.steps.length > 0) {
                console.log('[Workflow] Skip because steps already exist:', productionOrder.orderNumber);
                continue;
            }
            productionOrder.set('steps', steps.map((step) => ({
                process: step.process,
                processName: step.processName,
                processCode: step.processCode,
                sequence: step.sequence,
                status: 'planned',
                startedAt: null,
                completedAt: null,
                notes: '',
            })));
            await productionOrder.save({
                session,
            });
            syncedProductionOrders++;
            console.log('[Workflow] Synced:', productionOrder.orderNumber);
        }
        // =========================================================
        // 7. COMMIT TRANSACTION
        // =========================================================
        await session.commitTransaction();
        // =========================================================
        // 8. POPULATE SETELAH COMMIT
        // =========================================================
        const updatedProduct = await ProductModel.findById(product._id).populate('workflow.process');
        // =========================================================
        // 9. RESPONSE
        // =========================================================
        return res.json({
            success: true,
            message: 'Workflow product berhasil diperbarui.',
            data: updatedProduct,
            syncedProductionOrders,
        });
    }
    catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        console.error('Update product workflow error:', error);
        return res.status(500).json({
            success: false,
            message: error instanceof Error
                ? error.message
                : 'Gagal memperbarui workflow product.',
        });
    }
    finally {
        await session.endSession();
    }
});
/**
 * =========================================================
 * PUT /api/products/:id
 *
 * Admin only
 * =========================================================
 */
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const result = productSchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.error.issues[0]?.message ?? 'Data product tidak valid.',
            });
        }
        const { version, body, workflow = [] } = result.data;
        /**
         * Product name is generated automatically
         */
        const name = `${version} ${body}`.trim();
        const product = await ProductModel.findByIdAndUpdate(req.params.id, {
            name,
            version,
            body,
            workflow,
        }, {
            new: true,
            runValidators: true,
        }).populate('workflow.process');
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product tidak ditemukan.',
            });
        }
        return res.json({
            success: true,
            message: 'Product berhasil diperbarui.',
            data: product,
        });
    }
    catch (error) {
        console.error('Update product error:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal memperbarui product.',
        });
    }
});
/**
 * =========================================================
 * DELETE /api/products/:id
 *
 * Admin only
 * =========================================================
 */
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
    try {
        const product = await ProductModel.findByIdAndDelete(req.params.id);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product tidak ditemukan.',
            });
        }
        return res.json({
            success: true,
            message: 'Product berhasil dihapus.',
            data: null,
        });
    }
    catch (error) {
        console.error('Delete product error:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal menghapus product.',
        });
    }
});
export default router;
//# sourceMappingURL=products.routes.js.map