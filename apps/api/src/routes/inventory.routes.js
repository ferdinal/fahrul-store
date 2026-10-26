import { Router } from 'express';
import { FinishedGoodsInventoryModel, StockMovementModel, } from '@fahrul-store/database';
import { authenticate, requireAdmin } from '../middlewares/auth.middleware.js';
const router = Router();
router.use(authenticate, requireAdmin);
/**
 * GET /api/inventory
 *
 * Menampilkan seluruh finished goods inventory.
 */
router.get('/', async (_req, res) => {
    try {
        const inventory = await FinishedGoodsInventoryModel.find()
            .populate('product', 'name version body')
            .sort({
            updatedAt: -1,
        });
        const data = inventory.map((item) => {
            const allocatedQuantity = item.allocatedQuantity ?? 0;
            const availableQuantity = Math.max(item.quantity - allocatedQuantity, 0);
            return {
                ...item.toObject(),
                allocatedQuantity,
                availableQuantity,
            };
        });
        return res.json({
            success: true,
            data,
        });
    }
    catch (error) {
        console.error('GET /api/inventory error:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal mengambil inventory.',
        });
    }
});
/**
 * GET /api/inventory/:productId
 *
 * Menampilkan inventory berdasarkan product.
 */
router.get('/:productId', async (req, res) => {
    try {
        const inventory = await FinishedGoodsInventoryModel.findOne({
            product: req.params.productId,
        }).populate('product', 'name version body');
        if (!inventory) {
            return res.status(404).json({
                success: false,
                message: 'Inventory product tidak ditemukan.',
            });
        }
        const allocatedQuantity = inventory.allocatedQuantity ?? 0;
        const availableQuantity = Math.max(inventory.quantity - allocatedQuantity, 0);
        return res.json({
            success: true,
            data: {
                ...inventory.toObject(),
                allocatedQuantity,
                availableQuantity,
            },
        });
    }
    catch (error) {
        console.error('GET /api/inventory/:productId error:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal mengambil inventory.',
        });
    }
});
/**
 * GET /api/inventory/:productId/movements
 *
 * Menampilkan history stock movement product.
 */
router.get('/:productId/movements', async (req, res) => {
    try {
        const movements = await StockMovementModel.find({
            product: req.params.productId,
        })
            .populate('product', 'name version body')
            .sort({
            createdAt: -1,
        });
        return res.json({
            success: true,
            data: movements,
        });
    }
    catch (error) {
        console.error('GET /api/inventory/:productId/movements error:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal mengambil stock movement.',
        });
    }
});
export default router;
//# sourceMappingURL=inventory.routes.js.map