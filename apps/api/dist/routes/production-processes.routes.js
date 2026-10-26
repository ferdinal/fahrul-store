import { Router } from 'express';
import { z } from 'zod';
import { ProductionProcessModel } from '@fahrul-store/database';
import { authenticate, requireAdmin } from '../middlewares/auth.middleware.js';
const router = Router();
router.use(authenticate, requireAdmin);
// =========================
// Validation
// =========================
const productionProcessSchema = z.object({
    name: z.string().trim().min(1, 'Name wajib diisi'),
    code: z.string().trim().min(1, 'Code wajib diisi'),
    description: z.string().trim().optional(),
    active: z.boolean().optional(),
});
// =========================
// GET ALL
// =========================
router.get('/', async (_req, res) => {
    try {
        const processes = await ProductionProcessModel.find()
            .sort({ createdAt: -1 })
            .lean();
        res.json({
            success: true,
            data: processes,
        });
    }
    catch (error) {
        console.error('GET /api/production-processes error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal mengambil production processes',
        });
    }
});
// =========================
// GET BY ID
// =========================
router.get('/:id', async (req, res) => {
    try {
        const process = await ProductionProcessModel.findById(req.params.id).lean();
        if (!process) {
            res.status(404).json({
                success: false,
                message: 'Production process tidak ditemukan',
            });
            return;
        }
        res.json({
            success: true,
            data: process,
        });
    }
    catch (error) {
        console.error('GET /api/production-processes/:id error:', error);
        res.status(400).json({
            success: false,
            message: 'ID production process tidak valid',
        });
    }
});
// =========================
// CREATE
// =========================
router.post('/', async (req, res) => {
    try {
        const result = productionProcessSchema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({
                success: false,
                message: result.error.issues[0]?.message,
            });
            return;
        }
        const { name, code, description, active } = result.data;
        const process = await ProductionProcessModel.create({
            name,
            code,
            description: description ?? '',
            active: active ?? true,
        });
        res.status(201).json({
            success: true,
            message: 'Production process berhasil dibuat',
            data: process,
        });
    }
    catch (error) {
        console.error('POST /api/production-processes error:', error);
        res.status(500).json({
            success: false,
            message: 'Gagal membuat production process',
        });
    }
});
// =========================
// UPDATE
// =========================
router.put('/:id', async (req, res) => {
    try {
        const result = productionProcessSchema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({
                success: false,
                message: result.error.issues[0]?.message,
            });
            return;
        }
        const process = await ProductionProcessModel.findByIdAndUpdate(req.params.id, {
            name: result.data.name,
            code: result.data.code,
            description: result.data.description ?? '',
            active: result.data.active ?? true,
        }, {
            new: true,
            runValidators: true,
        });
        if (!process) {
            res.status(404).json({
                success: false,
                message: 'Production process tidak ditemukan',
            });
            return;
        }
        res.json({
            success: true,
            message: 'Production process berhasil diperbarui',
            data: process,
        });
    }
    catch (error) {
        console.error('PUT /api/production-processes/:id error:', error);
        res.status(400).json({
            success: false,
            message: 'Gagal memperbarui production process',
        });
    }
});
// =========================
// DELETE
// =========================
router.delete('/:id', async (req, res) => {
    try {
        const process = await ProductionProcessModel.findByIdAndDelete(req.params.id);
        if (!process) {
            res.status(404).json({
                success: false,
                message: 'Production process tidak ditemukan',
            });
            return;
        }
        res.json({
            success: true,
            message: 'Production process berhasil dihapus',
            data: null,
        });
    }
    catch (error) {
        console.error('DELETE /api/production-processes/:id error:', error);
        res.status(400).json({
            success: false,
            message: 'ID production process tidak valid',
        });
    }
});
export default router;
//# sourceMappingURL=production-processes.routes.js.map