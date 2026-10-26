import { Router, type Router as ExpressRouter } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';

import { CustomerOrderModel, ProductModel, User } from '@fahrul-store/database';

import {
  authenticate,
  requireRole,
  type AuthRequest,
} from '../middlewares/auth.middleware.js';

import { generatePackagingCode } from '../utils/generate-packaging-code.js';
import { generateOrderNumber } from '../utils/generate-order-number.js';

const router: ExpressRouter = Router();

/**
 * =========================================================
 * AUTH
 * =========================================================
 *
 * Hanya reseller/user yang boleh menggunakan endpoint ini.
 */
router.use(authenticate, requireRole('user'));

/**
 * =========================================================
 * CONSTANTS
 * =========================================================
 */

const customerOrderSources = [
  'Big cartel',
  'Shopee internasional',
  'Shopee Indonesia',
  'Tiktok',
  'Etsy',
  'Complain',
  'Additional Order',
] as const;

type CustomerOrderSource = (typeof customerOrderSources)[number];

/**
 * =========================================================
 * SCHEMA
 * =========================================================
 *
 * Frontend reseller hanya mengirim:
 *
 * {
 *   orderDate,
 *   orderBy,
 *   shippingMethod,
 *   items: [
 *     {
 *       product,
 *       quantity,
 *       price
 *     }
 *   ]
 * }
 *
 * Buyer TIDAK dikirim frontend.
 * Buyer diambil dari user yang sedang login.
 */

const createMyCustomerOrderSchema = z.object({
  orderDate: z.string().trim().min(1, 'Order date wajib diisi.'),

  orderBy: z.enum(customerOrderSources, {
    error: 'Order By tidak valid.',
  }),

  shippingMethod: z.enum(['regular', 'express'], {
    error: 'Shipping method tidak valid.',
  }),

  items: z
    .array(
      z.object({
        product: z.string().trim().min(1, 'Product wajib diisi.'),

        quantity: z.number().int().min(1, 'Quantity minimal 1.'),

        price: z.number().min(0, 'Price minimal 0.'),
      }),
    )
    .min(1, 'Minimal 1 product.'),
});

/**
 * =========================================================
 * DATE HELPER
 * =========================================================
 *
 * Untuk reseller orderDate dari frontend biasanya:
 *
 * YYYY-MM-DD
 *
 * Kita jadikan awal hari.
 */
function parseOrderDate(value: string): Date {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error('Order date kosong.');
  }

  /**
   * YYYY-MM-DD
   */
  const dateOnlyMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);

    const month = Number(dateOnlyMatch[2]);

    const day = Number(dateOnlyMatch[3]);

    const date = new Date(year, month - 1, day, 0, 0, 0, 0);

    if (Number.isNaN(date.getTime())) {
      throw new Error(`Order date tidak valid: "${value}"`);
    }

    return date;
  }

  /**
   * Fallback untuk ISO date.
   */
  const nativeDate = new Date(normalized);

  if (!Number.isNaN(nativeDate.getTime())) {
    return nativeDate;
  }

  throw new Error(`Format order date tidak valid: "${value}"`);
}

/**
 * =========================================================
 * DATE HELPER
 * =========================================================
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);

  result.setDate(result.getDate() + days);

  return result;
}

/**
 * =========================================================
 * GET /api/my-customer-orders
 *
 * Hanya order milik reseller yang sedang login.
 * =========================================================
 */
router.get('/', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized.',
      });
    }

    /**
     * Ambil user berdasarkan JWT.
     *
     * JWT hanya menyimpan userId + role.
     */
    const user = await User.findById(req.user.userId)
      .select('_id username email role')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User tidak ditemukan.',
      });
    }

    if (!user.email) {
      return res.status(400).json({
        success: false,
        message: 'Email reseller tidak tersedia.',
      });
    }

    /**
     * Hanya tampilkan order yang
     * buyer.email = email reseller.
     */
    const orders = await CustomerOrderModel.find({
      'buyer.email': user.email,
    })
      .populate('items.product', 'name version body')
      .sort({
        orderDate: -1,
      });

    return res.json({
      success: true,
      data: orders,
    });
  } catch (error) {
    console.error('GET /api/my-customer-orders error:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil customer orders reseller.',
    });
  }
});

/**
 * =========================================================
 * GET /api/my-customer-orders/:id
 *
 * Reseller hanya boleh melihat order miliknya sendiri.
 * =========================================================
 */
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized.',
      });
    }

    const user = await User.findById(req.user.userId)
      .select('_id username email role')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User tidak ditemukan.',
      });
    }

    if (!user.email) {
      return res.status(400).json({
        success: false,
        message: 'Email reseller tidak tersedia.',
      });
    }

    const order = await CustomerOrderModel.findOne({
      _id: req.params.id,
      'buyer.email': user.email,
    }).populate('items.product', 'name version body');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Customer order tidak ditemukan.',
      });
    }

    return res.json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error('GET /api/my-customer-orders/:id error:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil customer order.',
    });
  }
});

/**
 * =========================================================
 * POST /api/my-customer-orders
 *
 * CREATE CUSTOMER ORDER RESELLER
 *
 * Backend otomatis:
 * - Buyer
 * - Order Number
 * - Packaging Code
 * - Fulfillment Due Date
 * - Subtotal
 * - Total
 * - Status
 * - Allocated Quantity
 * - Fulfilled Quantity
 * =========================================================
 */
router.post('/', async (req: AuthRequest, res) => {
  const session = await mongoose.startSession();

  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized.',
      });
    }

    /**
     * =====================================================
     * VALIDATE REQUEST
     * =====================================================
     */
    const parsed = createMyCustomerOrderSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Data customer order tidak valid.',
        errors: parsed.error.flatten(),
      });
    }

    const data = parsed.data;

    /**
     * =====================================================
     * GET LOGGED-IN RESELLER
     * =====================================================
     */
    const user = await User.findById(req.user.userId)
      .select('_id username email role')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User tidak ditemukan.',
      });
    }

    if (user.role !== 'user') {
      return res.status(403).json({
        success: false,
        message: 'Endpoint ini hanya untuk reseller.',
      });
    }

    if (!user.email) {
      return res.status(400).json({
        success: false,
        message: 'Email reseller tidak tersedia.',
      });
    }

    /**
     * =====================================================
     * BUYER
     * =====================================================
     *
     * Karena User model kita memiliki username + email,
     * username digunakan sebagai firstName.
     *
     * Yang penting:
     * buyer tidak bisa dimanipulasi dari frontend.
     */
    const buyerName = user.username?.trim() ?? '';

    const buyerEmail = user.email.trim();

    if (!buyerName) {
      return res.status(400).json({
        success: false,
        message: 'Username reseller tidak tersedia.',
      });
    }

    if (!buyerEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email reseller tidak tersedia.',
      });
    }

    /**
     * =====================================================
     * ORDER DATE
     * =====================================================
     */
    const orderDate = parseOrderDate(data.orderDate);

    /**
     * =====================================================
     * FULFILLMENT DUE DATE
     * =====================================================
     *
     * Sama seperti manual Customer Order:
     * 7 hari dari Order Date.
     */
    const fulfillmentDueDate = addDays(orderDate, 7);

    /**
     * =====================================================
     * VALIDATE PRODUCTS
     * =====================================================
     */
    const productIds = data.items.map((item) => item.product);

    const uniqueProductIds = [...new Set(productIds)];

    const products = await ProductModel.find({
      _id: {
        $in: uniqueProductIds,
      },
    })
      .select('_id name version body')
      .lean();

    const productMap = new Map(
      products.map((product) => [product._id.toString(), product]),
    );

    /**
     * Pastikan semua product
     * benar-benar ada.
     */
    for (const item of data.items) {
      const product = productMap.get(item.product);

      if (!product) {
        return res.status(400).json({
          success: false,
          message: `Product ${item.product} tidak ditemukan.`,
        });
      }
    }

    /**
     * =====================================================
     * GENERATE ORDER ITEMS
     * =====================================================
     */
    const items = data.items.map((item) => {
      const product = productMap.get(item.product);

      if (!product) {
        throw new Error(`Product ${item.product} tidak ditemukan.`);
      }

      const total = item.quantity * item.price;

      return {
        product: new mongoose.Types.ObjectId(product._id),

        productName: product.name,

        productOptionName: product.version || product.body || product.name,

        quantity: item.quantity,

        allocatedQuantity: 0,

        fulfilledQuantity: 0,

        price: item.price,

        total,
      };
    });

    /**
     * =====================================================
     * CALCULATE TOTAL
     * =====================================================
     */
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);

    const shippingCost = 0;
    const tax = 0;
    const discount = 0;

    const total = subtotal + shippingCost + tax - discount;

    /**
     * =====================================================
     * TRANSACTION
     * =====================================================
     */
    session.startTransaction();

    /**
     * =====================================================
     * GENERATE ORDER NUMBER
     *
     * Contoh:
     * CO-000001
     * CO-000002
     * =====================================================
     */
    const orderNumber = await generateOrderNumber(session);

    /**
     * =====================================================
     * GENERATE PACKAGING CODE
     *
     * Contoh:
     * A-0001
     * A-0002
     * ...
     * =====================================================
     */
    const packagingCode = await generatePackagingCode(session);

    /**
     * =====================================================
     * CREATE ORDER
     * =====================================================
     */
    const [order] = await CustomerOrderModel.create(
      [
        {
          orderNumber,

          /**
           * WAJIB berasal dari request
           * yang sudah divalidasi enum.
           */
          orderBy: data.orderBy,

          packagingCode,

          buyer: {
            firstName: buyerName,

            lastName: '',

            email: buyerEmail,

            phone: '',
          },

          orderDate,

          fulfillmentDueDate,

          status: 'pending',

          paymentStatus: '',

          shippingStatus: '',

          shippingMethod: data.shippingMethod,

          shippingAddress: {
            address1: '',
            address2: '',
            city: '',
            state: '',
            zip: '',
            country: '',
          },

          currency: 'USD',

          subtotal,

          shippingCost,

          tax,

          discount,

          total,

          note: '',

          items,
        },
      ],
      {
        session,
      },
    );

    if (!order) {
      throw new Error('Failed to create customer order.');
    }

    /**
     * =====================================================
     * COMMIT
     * =====================================================
     */
    await session.commitTransaction();

    /**
     * Populate setelah transaction selesai.
     */
    await order.populate('items.product', 'name version body');

    /**
     * =====================================================
     * RESPONSE
     * =====================================================
     */
    return res.status(201).json({
      success: true,
      message: 'Customer order berhasil dibuat.',
      data: order,
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    console.error('POST /api/my-customer-orders error:', error);

    return res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'Gagal membuat customer order.',
    });
  } finally {
    await session.endSession();
  }
});

export default router;
