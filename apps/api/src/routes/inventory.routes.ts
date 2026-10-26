import mongoose from 'mongoose';
import { Router, type Router as ExpressRouter } from 'express';

import {
  FinishedGoodsInventoryModel,
  StockMovementModel,
} from '@fahrul-store/database';

import { authenticate, requireAdmin } from '../middlewares/auth.middleware.js';

const router: ExpressRouter = Router();

router.use(authenticate, requireAdmin);

/**
 * GET /api/inventory
 * Menampilkan seluruh finished goods inventory.
 */
router.get('/', async (_req, res) => {
  try {
    const inventory = await FinishedGoodsInventoryModel.find()
      .populate('product', 'name version body')
      .sort({ updatedAt: -1 });

    return res.json({ success: true, data: inventory });
  } catch (error) {
    console.error('GET /api/inventory error:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil inventory.',
    });
  }
});

/**
 * POST /api/inventory/transfer
 * Memindahkan stok dari satu produk ke produk lain.
 * Membutuhkan MongoDB replica set (MongoDB Atlas mendukung transaksi).
 */
router.post('/transfer', async (req, res) => {
  const { sourceProductId, destinationProductId, quantity } = req.body ?? {};

  if (
    !mongoose.isValidObjectId(sourceProductId) ||
    !mongoose.isValidObjectId(destinationProductId)
  ) {
    return res.status(400).json({
      success: false,
      message: 'Source product atau destination product ID tidak valid.',
    });
  }

  if (String(sourceProductId) === String(destinationProductId)) {
    return res.status(400).json({
      success: false,
      message: 'Produk asal dan tujuan tidak boleh sama.',
    });
  }

  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Quantity transfer harus berupa bilangan bulat lebih dari 0.',
    });
  }

  const session = await mongoose.startSession();
  const transferId = new mongoose.Types.ObjectId();

  try {
    let result:
      | {
          transferId: string;
          source: { productId: string; quantity: number };
          destination: { productId: string; quantity: number };
        }
      | undefined;

    await session.withTransaction(async () => {
      // Product model sudah terdaftar karena inventory menggunakan ref Product.
      const ProductModel = mongoose.model('Product');
      const [sourceProductExists, destinationProductExists] = await Promise.all(
        [
          ProductModel.exists({ _id: sourceProductId }).session(session),
          ProductModel.exists({ _id: destinationProductId }).session(session),
        ],
      );

      if (!sourceProductExists || !destinationProductExists) {
        const error = new Error('Produk asal atau tujuan tidak ditemukan.');
        (error as Error & { statusCode?: number }).statusCode = 404;
        throw error;
      }

      const sourceInventory = await FinishedGoodsInventoryModel.findOne({
        product: sourceProductId,
      }).session(session);

      const sourceQuantity = sourceInventory?.quantity ?? 0;
      const sourceAllocated = sourceInventory?.allocatedQuantity ?? 0;
      const sourceAvailable = Math.max(sourceQuantity - sourceAllocated, 0);

      if (!sourceInventory || sourceAvailable < quantity) {
        const error = new Error(
          `Stok tersedia tidak cukup. Stok fisik: ${sourceQuantity}, dialokasikan: ${sourceAllocated}, tersedia untuk transfer: ${sourceAvailable}.`,
        );
        (error as Error & { statusCode?: number }).statusCode = 400;
        throw error;
      }

      // Pastikan dokumen tujuan ada; jika belum ada, buat dengan stok 0.
      let destinationInventory = await FinishedGoodsInventoryModel.findOne({
        product: destinationProductId,
      }).session(session);

      if (!destinationInventory) {
        destinationInventory = new FinishedGoodsInventoryModel({
          product: destinationProductId,
          quantity: 0,
          allocatedQuantity: 0,
        });
        await destinationInventory.save({ session });
      }

      sourceInventory.quantity = sourceQuantity - quantity;
      destinationInventory.quantity =
        (destinationInventory.quantity ?? 0) + quantity;

      await sourceInventory.save({ session });
      await destinationInventory.save({ session });

      await StockMovementModel.create(
        [
          {
            product: sourceProductId,
            type: 'OUT',
            quantity,
            referenceType: 'stock_transfer',
            referenceId: transferId,
            referenceItemId: sourceProductId,
            idempotencyKey: `stock-transfer:${transferId.toString()}:OUT`,
          },
          {
            product: destinationProductId,
            type: 'IN',
            quantity,
            referenceType: 'stock_transfer',
            referenceId: transferId,
            referenceItemId: destinationProductId,
            idempotencyKey: `stock-transfer:${transferId.toString()}:IN`,
          },
        ],
        { session, ordered: true },
      );

      result = {
        transferId: transferId.toString(),
        source: {
          productId: String(sourceProductId),
          quantity: sourceInventory.quantity,
        },
        destination: {
          productId: String(destinationProductId),
          quantity: destinationInventory.quantity,
        },
      };
    });

    return res.status(200).json({
      success: true,
      message: 'Transfer stock berhasil.',
      data: result,
    });
  } catch (error) {
    const statusCode =
      typeof error === 'object' && error !== null && 'statusCode' in error
        ? Number((error as { statusCode?: unknown }).statusCode) || 500
        : 500;

    if (statusCode >= 500) {
      console.error('POST /api/inventory/transfer error:', error);
    }

    return res.status(statusCode).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'Gagal melakukan transfer stock.',
    });
  } finally {
    await session.endSession();
  }
});

/**
 * GET /api/inventory/:productId/movements
 * Diletakkan sebelum GET /:productId untuk menjaga urutan route yang jelas.
 */
router.get('/:productId/movements', async (req, res) => {
  try {
    const { productId } = req.params;

    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Product ID tidak valid.',
      });
    }

    const movements = await StockMovementModel.find({ product: productId })
      .populate('product', 'name version body')
      .sort({ createdAt: -1 });

    return res.json({ success: true, data: movements });
  } catch (error) {
    console.error('GET /api/inventory/:productId/movements error:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil stock movement.',
    });
  }
});

/**
 * GET /api/inventory/:productId
 * Jika inventory belum ada, stok dikembalikan sebagai 0.
 */
router.get('/:productId', async (req, res) => {
  try {
    const { productId } = req.params;

    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Product ID tidak valid.',
      });
    }

    const inventory = await FinishedGoodsInventoryModel.findOne({
      product: productId,
    }).populate('product', 'name version body');

    if (!inventory) {
      return res.json({
        success: true,
        data: { product: productId, quantity: 0, allocatedQuantity: 0 },
      });
    }

    return res.json({ success: true, data: inventory });
  } catch (error) {
    console.error('GET /api/inventory/:productId error:', error);
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil inventory.',
    });
  }
});

export default router;
