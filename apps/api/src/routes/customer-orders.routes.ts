import { Router, type Router as ExpressRouter } from 'express';
import multer from 'multer';
import { z } from 'zod';

import {
  CustomerOrderModel,
  ProductModel,
  FinishedGoodsInventoryModel,
  StockMovementModel,
  mongoose,
} from '@fahrul-store/database';

import { authenticate, requireAdmin } from '../middlewares/auth.middleware.js';

import { generatePackagingCode } from '../utils/generate-packaging-code.js';
import { generateOrderNumber } from '../utils/generate-order-number.js';

import {
  normalizeProductName,
  parseBigCartelFile,
} from '../utils/big-cartel-csv.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, callback) => {
    const filename = file.originalname.toLowerCase();
    const isSupportedFile =
      filename.endsWith('.csv') ||
      filename.endsWith('.xlsx') ||
      filename.endsWith('.xls');

    if (!isSupportedFile) {
      callback(new Error('File harus berupa CSV, XLSX, atau XLS'));
      return;
    }

    callback(null, true);
  },
});

function parseCustomerOrderDate(value: string): Date {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error('Order date kosong');
  }

  // Format Big Cartel: 22-Oct-2026 7:03 PM WIB
  const monthNameWibMatch = normalized.match(
    /^(\d{1,2})[-\s]([A-Za-z]{3,9})[-\s](\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)\s+WIB$/i,
  );

  if (monthNameWibMatch) {
    const day = Number(monthNameWibMatch[1]);
    const monthName = monthNameWibMatch[2]?.toLowerCase();

    if (!monthName) {
      throw new Error(`Order date tidak valid: "${value}"`);
    }

    const year = Number(monthNameWibMatch[3]);
    let hour = Number(monthNameWibMatch[4]);
    const minute = Number(monthNameWibMatch[5]);
    const second = Number(monthNameWibMatch[6] ?? 0);
    const period = monthNameWibMatch[7]?.toUpperCase();

    const months: Record<string, number> = {
      jan: 0,
      january: 0,
      feb: 1,
      february: 1,
      mar: 2,
      march: 2,
      apr: 3,
      april: 3,
      may: 4,
      jun: 5,
      june: 5,
      jul: 6,
      july: 6,
      aug: 7,
      august: 7,
      sep: 8,
      sept: 8,
      september: 8,
      oct: 9,
      october: 9,
      nov: 10,
      november: 10,
      dec: 11,
      december: 11,
    };

    const month = months[monthName];

    if (
      month === undefined ||
      day < 1 ||
      day > 31 ||
      hour < 1 ||
      hour > 12 ||
      minute < 0 ||
      minute > 59 ||
      second < 0 ||
      second > 59 ||
      !period
    ) {
      throw new Error(`Order date tidak valid: "${value}"`);
    }

    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;

    const date = new Date(Date.UTC(year, month, day, hour - 7, minute, second));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month ||
      date.getUTCDate() !== day
    ) {
      throw new Error(`Order date tidak valid: "${value}"`);
    }

    return date;
  }

  // Format Big Cartel: 2026-10-22 7:03 PM WIB
  const isoWibMatch = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)\s+WIB$/i,
  );

  if (isoWibMatch) {
    const year = Number(isoWibMatch[1]);
    const month = Number(isoWibMatch[2]);
    const day = Number(isoWibMatch[3]);

    let hour = Number(isoWibMatch[4]);
    const minute = Number(isoWibMatch[5]);
    const second = Number(isoWibMatch[6] ?? 0);
    const period = isoWibMatch[7]?.toUpperCase();

    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31 ||
      hour < 1 ||
      hour > 12 ||
      minute < 0 ||
      minute > 59 ||
      second < 0 ||
      second > 59 ||
      !period
    ) {
      throw new Error(`Order date tidak valid: "${value}"`);
    }

    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;

    const date = new Date(
      Date.UTC(year, month - 1, day, hour - 7, minute, second),
    );

    const checkDate = new Date(Date.UTC(year, month - 1, day));

    if (
      checkDate.getUTCFullYear() !== year ||
      checkDate.getUTCMonth() !== month - 1 ||
      checkDate.getUTCDate() !== day
    ) {
      throw new Error(`Order date tidak valid: "${value}"`);
    }

    return date;
  }

  // Format Big Cartel: 10/22/26 7:03 PM WIB (MM/DD/YY)
  const numericDateWibMatch = normalized.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)\s+WIB$/i,
  );

  if (numericDateWibMatch) {
    const month = Number(numericDateWibMatch[1]);
    const day = Number(numericDateWibMatch[2]);
    let year = Number(numericDateWibMatch[3]);
    let hour = Number(numericDateWibMatch[4]);
    const minute = Number(numericDateWibMatch[5]);
    const second = Number(numericDateWibMatch[6] ?? 0);
    const period = numericDateWibMatch[7]?.toUpperCase();

    // Ubah tahun 2 digit menjadi 4 digit.
    if (year < 100) {
      year += year <= 49 ? 2000 : 1900;
    }

    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31 ||
      hour < 1 ||
      hour > 12 ||
      minute < 0 ||
      minute > 59 ||
      second < 0 ||
      second > 59 ||
      !period
    ) {
      throw new Error(`Order date tidak valid: "${value}"`);
    }

    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;

    const checkDate = new Date(Date.UTC(year, month - 1, day));

    if (
      checkDate.getUTCFullYear() !== year ||
      checkDate.getUTCMonth() !== month - 1 ||
      checkDate.getUTCDate() !== day
    ) {
      throw new Error(`Order date tidak valid: "${value}"`);
    }

    // WIB = UTC+7.
    return new Date(Date.UTC(year, month - 1, day, hour - 7, minute, second));
  }

  // Coba parsing native untuk format tanggal lain.
  const nativeDate = new Date(normalized);

  if (!Number.isNaN(nativeDate.getTime())) {
    return nativeDate;
  }

  // Format US: MM/DD/YYYY atau MM/DD/YYYY 7:03 PM
  const usMatch = normalized.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i,
  );

  if (usMatch) {
    const month = Number(usMatch[1]);
    const day = Number(usMatch[2]);
    const year = Number(usMatch[3]);

    let hour = Number(usMatch[4] ?? 0);
    const minute = Number(usMatch[5] ?? 0);
    const second = Number(usMatch[6] ?? 0);
    const period = usMatch[7]?.toUpperCase();

    if (
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31 ||
      hour < 0 ||
      hour > 12 ||
      minute < 0 ||
      minute > 59 ||
      second < 0 ||
      second > 59
    ) {
      throw new Error(`Order date tidak valid: "${value}"`);
    }

    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;

    const date = new Date(year, month - 1, day, hour, minute, second);

    if (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    ) {
      return date;
    }
  }

  throw new Error(`Format Order date tidak valid: "${value}"`);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);

  result.setDate(result.getDate() + days);

  return result;
}

const router: ExpressRouter = Router();

type PreparedCustomerOrder = {
  orderNumber: string;

  buyer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };

  orderDate: Date;
  fulfillmentDueDate: Date;
  orderBy: string;

  status: 'pending' | 'partial' | 'fulfilled' | 'cancelled';

  paymentStatus: string;
  shippingStatus: string;
  shippingMethod: string;

  shippingAddress: {
    address1: string;
    address2: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };

  currency: string;

  subtotal: number;
  shippingCost: number;
  tax: number;
  discount: number;
  total: number;

  note: string;

  items: Array<{
    product: mongoose.Types.ObjectId;
    productName: string;
    productOptionName: string;
    quantity: number;
    fulfilledQuantity: number;
    price: number;
    total: number;
  }>;
};

router.use(authenticate, requireAdmin);

/**
 * Existing Customer Order Item Schema
 *
 * Dipakai untuk PUT/edit dan CSV import.
 */
const customerOrderItemSchema = z.object({
  product: z.string().trim().min(1, 'Product wajib diisi'),

  productName: z.string().trim().min(1, 'Product name wajib diisi'),

  productOptionName: z
    .string()
    .trim()
    .min(1, 'Product option name wajib diisi'),

  quantity: z.number().int().min(1, 'Quantity minimal 1'),

  fulfilledQuantity: z
    .number()
    .int()
    .min(0, 'Fulfilled quantity minimal 0')
    .optional(),

  price: z.number().min(0, 'Price minimal 0'),

  total: z.number().min(0, 'Total minimal 0'),
});

/**
 * Existing schema
 *
 * Tetap dipakai untuk PUT.
 */
const customerOrderSchema = z.object({
  orderNumber: z.string().trim().min(1, 'Order number wajib diisi'),

  orderBy: z.string().trim().min(1, 'Order By wajib diisi').optional(),

  buyer: z.object({
    firstName: z.string().trim().optional(),
    lastName: z.string().trim().optional(),
    email: z.string().trim().optional(),
    phone: z.string().trim().optional(),
  }),

  orderDate: z.string().min(1, 'Order date wajib diisi'),

  fulfillmentDueDate: z.string().min(1, 'Fulfillment due date wajib diisi'),

  status: z.enum(['pending', 'partial', 'fulfilled', 'cancelled']).optional(),

  paymentStatus: z.string().trim().optional(),

  shippingStatus: z.string().trim().optional(),

  shippingMethod: z.string().trim().optional(),

  shippingAddress: z.object({
    address1: z.string().trim().optional(),
    address2: z.string().trim().optional(),
    city: z.string().trim().optional(),
    state: z.string().trim().optional(),
    zip: z.string().trim().optional(),
    country: z.string().trim().optional(),
  }),

  currency: z.string().trim().optional(),

  subtotal: z.number().min(0).optional(),

  shippingCost: z.number().min(0).optional(),

  tax: z.number().min(0).optional(),

  discount: z.number().min(0).optional(),

  total: z.number().min(0).optional(),

  note: z.string().trim().optional(),

  items: z.array(customerOrderItemSchema).min(1, 'Minimal 1 item'),
});

/**
 * Schema khusus CREATE MANUAL
 *
 * Frontend hanya mengirim:
 * - orderDate
 * - shippingMethod
 * - product
 * - quantity
 * - price
 *
 * Buyer diambil dari user login.
 * Order number dibuat backend.
 * Fulfillment due date dibuat backend.
 * Packaging code dibuat backend.
 */
const createCustomerOrderItemSchema = z.object({
  product: z.string().trim().min(1, 'Product wajib diisi'),

  quantity: z.number().int().min(1, 'Quantity minimal 1'),

  price: z.number().min(0, 'Price minimal 0'),
});

// const createCustomerOrderSchema = z.object({
//   orderDate: z.string().min(1, 'Order date wajib diisi'),

//   shippingMethod: z.enum(['regular', 'express']),

//   items: z.array(createCustomerOrderItemSchema).min(1, 'Minimal 1 product'),
// });
const createCustomerOrderSchema = z.object({
  buyer: z.object({
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().default(''),
    email: z.string().trim().min(1),
    phone: z.string().trim().default(''),
  }),

  orderDate: z.string().trim().min(1),

  orderBy: z.string().trim().min(1, 'Order By wajib dipilih.'),

  shippingMethod: z.enum(['regular', 'express']),

  items: z
    .array(
      z.object({
        product: z.string().trim().min(1),

        quantity: z.number().int().min(1),

        price: z.number().min(0),
      }),
    )
    .min(1),
});

const fulfillmentItemSchema = z.object({
  itemId: z.string().trim().min(1, 'Item ID wajib diisi'),

  // Jumlah fulfillment akhir; 0 diperbolehkan untuk mengembalikan semua unit.
  quantity: z.number().int().min(0, 'Fulfillment quantity tidak boleh negatif'),
});

const fulfillmentSchema = z.object({
  items: z
    .array(fulfillmentItemSchema)
    .min(1, 'Minimal satu item harus dipenuhi'),
});

/**
 * GET /api/customer-orders
 */
router.get('/', async (_req, res) => {
  try {
    const orders = await CustomerOrderModel.find()
      .populate('items.product', 'name version body')
      .sort({
        orderDate: -1,
      });

    return res.json({
      success: true,
      data: orders,
    });
  } catch (error) {
    console.error('GET /api/customer-orders error:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil customer orders.',
    });
  }
});

/**
 * POST /api/customer-orders/import/preview
 */
router.post('/import/preview', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'File CSV atau Excel wajib diupload',
      });
    }

    const orders = parseBigCartelFile(req.file.buffer, req.file.originalname);

    if (orders.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'File tidak memiliki data order',
      });
    }

    const products = await ProductModel.find({})
      .select('_id name version body')
      .lean();

    const productMap = new Map(
      products.map((product) => [normalizeProductName(product.name), product]),
    );

    const productsByVersion = new Map<string, typeof products>();

    for (const product of products) {
      const normalizedVersion = normalizeProductName(product.version);

      const existing = productsByVersion.get(normalizedVersion) ?? [];

      existing.push(product);

      productsByVersion.set(normalizedVersion, existing);
    }

    function normalizeBodyForMatching(value: string): string {
      return value
        .toLowerCase()
        .replace(/\([^)]*\)/g, (match) => ` ${match} `)
        .replace(/[()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function extractCsvBody(
      productName: string,
      productOptionName: string,
    ): string {
      let value = productOptionName.trim();

      const forMatch = value.match(/^.+?\s+for\s+(.+)$/i);

      if (forMatch?.[1]) {
        value = forMatch[1].trim();
      }

      value = value.replace(/^[A-Z]+\d+\s+/i, '');

      return value.trim();
    }

    function findMatchingProduct(
      productName: string,
      productOptionName: string,
    ) {
      const version = productName.trim();

      if (!version) {
        return null;
      }

      const normalizedVersion = normalizeProductName(version);

      const candidates = productsByVersion.get(normalizedVersion) ?? [];

      if (candidates.length === 0) {
        return null;
      }

      if (candidates.length === 1) {
        return candidates[0];
      }

      const csvBody = extractCsvBody(productName, productOptionName);

      if (!csvBody) {
        return null;
      }

      const normalizedCsvBody = normalizeBodyForMatching(csvBody);

      const matches = candidates.filter((candidate) => {
        const normalizedMasterBody = normalizeBodyForMatching(candidate.body);

        return normalizedMasterBody === normalizedCsvBody;
      });

      if (matches.length !== 1) {
        return null;
      }

      return matches[0];
    }

    const preview = orders.map((order) => {
      const items = order.items.map((item) => {
        const exactValues = [item.productOptionName, item.productName].filter(
          Boolean,
        );

        let product = null;

        for (const value of exactValues) {
          const normalized = normalizeProductName(value);

          const exactProduct = productMap.get(normalized);

          if (exactProduct) {
            product = exactProduct;

            break;
          }
        }

        if (!product) {
          product = findMatchingProduct(
            item.productName,
            item.productOptionName,
          );
        }

        return {
          productName: item.productName,

          productOptionName: item.productOptionName,

          quantity: item.quantity,

          price: item.price,

          total: item.total,

          matched: Boolean(product),

          product: product
            ? {
                _id: product._id,
                name: product.name,
                version: product.version,
                body: product.body,
              }
            : null,
        };
      });

      const unmatchedItems = items.filter((item) => !item.matched);

      const valid =
        order.orderNumber.length > 0 &&
        items.length > 0 &&
        unmatchedItems.length === 0;

      return {
        orderNumber: order.orderNumber,

        buyer: order.buyer,

        orderDate: order.orderDate,

        paymentStatus: order.paymentStatus,

        shippingStatus: order.shippingStatus,

        shippingMethod: order.shippingMethod,

        shippingAddress: order.shippingAddress,

        currency: order.currency,

        subtotal: order.subtotal,

        shippingCost: order.shippingCost,

        tax: order.tax,

        discount: order.discount,

        total: order.total,

        note: order.note,

        items,

        valid,

        errors: [
          ...(order.orderNumber.length === 0 ? ['Order number kosong'] : []),

          ...(items.length === 0 ? ['Order tidak memiliki item'] : []),

          ...unmatchedItems.map(
            (item) =>
              `Product tidak ditemukan: ${
                item.productOptionName || item.productName
              }`,
          ),
        ],
      };
    });

    const validOrders = preview.filter((order) => order.valid);

    const invalidOrders = preview.filter((order) => !order.valid);

    return res.json({
      success: true,

      data: {
        summary: {
          totalOrders: preview.length,

          validOrders: validOrders.length,

          invalidOrders: invalidOrders.length,
        },

        orders: preview,
      },
    });
  } catch (error) {
    console.error('Customer order import preview error:', error);

    return res.status(400).json({
      success: false,
      message:
        error instanceof Error ? error.message : 'Gagal memproses file import',
    });
  }
});

/**
 * POST /api/customer-orders/import
 */
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    console.log('========== CUSTOMER ORDER IMPORT ==========');

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'File CSV atau Excel wajib diupload',
      });
    }

    const fulfillmentDueDate =
      typeof req.body.fulfillmentDueDate === 'string'
        ? req.body.fulfillmentDueDate.trim()
        : '';

    if (!fulfillmentDueDate) {
      return res.status(400).json({
        success: false,
        message: 'Fulfillment Due Date wajib diisi',
      });
    }

    const parsedFulfillmentDueDate = new Date(`${fulfillmentDueDate}T00:00:00`);

    if (Number.isNaN(parsedFulfillmentDueDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Fulfillment Due Date tidak valid',
      });
    }

    // Frontend mengirim nomor order yang masih tersisa dan valid di preview.
    // Jangan proses seluruh CSV lagi, karena order yang dihapus dari preview
    // masih ada di file CSV asli.
    const rawOrderNumbers = req.body.orderNumbersToImport;
    let orderNumbersToImport: string[] = [];

    if (Array.isArray(rawOrderNumbers)) {
      orderNumbersToImport = rawOrderNumbers
        .flatMap((value) => {
          if (typeof value !== 'string') return [];
          try {
            const parsed: unknown = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [value];
          } catch {
            return [value];
          }
        })
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean);
    } else if (typeof rawOrderNumbers === 'string') {
      try {
        const parsed: unknown = JSON.parse(rawOrderNumbers);
        if (Array.isArray(parsed)) {
          orderNumbersToImport = parsed
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean);
        }
      } catch {
        // Fallback untuk client yang mengirim nomor order satu per satu
        // dalam satu string dipisahkan koma.
        orderNumbersToImport = rawOrderNumbers
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
      }
    }

    orderNumbersToImport = [...new Set(orderNumbersToImport)];

    if (orderNumbersToImport.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          'Daftar order untuk diimport kosong. Silakan preview ulang dan pilih order valid.',
      });
    }

    const parsedOrders = parseBigCartelFile(
      req.file.buffer,
      req.file.originalname,
    );

    if (parsedOrders.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'File tidak memiliki data order',
      });
    }

    const selectedOrderNumbers = new Set(orderNumbersToImport);
    const orders = parsedOrders.filter((order) =>
      selectedOrderNumbers.has(order.orderNumber),
    );

    if (orders.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          'Tidak ada order dari daftar preview yang ditemukan di file CSV. Silakan preview ulang.',
      });
    }

    const missingOrderNumbers = orderNumbersToImport.filter(
      (orderNumber) =>
        !parsedOrders.some((order) => order.orderNumber === orderNumber),
    );

    if (missingOrderNumbers.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Order berikut tidak ditemukan di file CSV: ${missingOrderNumbers.join(', ')}`,
      });
    }

    const products = await ProductModel.find({})
      .select('_id name version body')
      .lean();

    const productMap = new Map(
      products.map((product) => [normalizeProductName(product.name), product]),
    );

    const productsByVersion = new Map<string, typeof products>();

    for (const product of products) {
      const normalizedVersion = normalizeProductName(product.version);

      const existing = productsByVersion.get(normalizedVersion) ?? [];

      existing.push(product);

      productsByVersion.set(normalizedVersion, existing);
    }

    function normalizeBodyForMatching(value: string): string {
      return value
        .toLowerCase()
        .replace(/\([^)]*\)/g, (match) => ` ${match} `)
        .replace(/[()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function extractCsvBody(
      productName: string,
      productOptionName: string,
    ): string {
      let value = productOptionName.trim();

      const forMatch = value.match(/^.+?\s+for\s+(.+)$/i);

      if (forMatch?.[1]) {
        value = forMatch[1].trim();
      }

      value = value.replace(/^[A-Z]+\d+\s+/i, '');

      return value.trim();
    }

    function findMatchingProduct(
      productName: string,
      productOptionName: string,
    ) {
      const version = productName.trim();

      if (!version) {
        return null;
      }

      const normalizedVersion = normalizeProductName(version);

      const candidates = productsByVersion.get(normalizedVersion) ?? [];

      if (candidates.length === 0) {
        return null;
      }

      if (candidates.length === 1) {
        return candidates[0];
      }

      const csvBody = extractCsvBody(productName, productOptionName);

      if (!csvBody) {
        return null;
      }

      const normalizedCsvBody = normalizeBodyForMatching(csvBody);

      const matches = candidates.filter((candidate) => {
        const normalizedMasterBody = normalizeBodyForMatching(candidate.body);

        return normalizedMasterBody === normalizedCsvBody;
      });

      if (matches.length !== 1) {
        return null;
      }

      return matches[0];
    }

    const preparedOrders: PreparedCustomerOrder[] = [];

    for (const order of orders) {
      if (!order.orderNumber) {
        return res.status(400).json({
          success: false,
          message: 'Ada order dengan order number kosong',
        });
      }

      if (order.items.length === 0) {
        return res.status(400).json({
          success: false,
          message: `Order ${order.orderNumber} tidak memiliki item`,
        });
      }

      const existingOrder = await CustomerOrderModel.findOne({
        orderNumber: order.orderNumber,
      })
        .select('_id orderNumber')
        .lean();

      if (existingOrder) {
        return res.status(409).json({
          success: false,
          message: `Order ${order.orderNumber} sudah ada`,
        });
      }

      const items = [];

      for (const item of order.items) {
        const exactValues = [item.productOptionName, item.productName].filter(
          Boolean,
        );

        let product = null;

        for (const value of exactValues) {
          const normalized = normalizeProductName(value);

          const exactProduct = productMap.get(normalized);

          if (exactProduct) {
            product = exactProduct;

            break;
          }
        }

        if (!product) {
          product = findMatchingProduct(
            item.productName,
            item.productOptionName,
          );
        }

        if (!product) {
          return res.status(400).json({
            success: false,
            message:
              `Product tidak ditemukan untuk order ${order.orderNumber}: ` +
              `${item.productOptionName || item.productName}`,
          });
        }

        // Beberapa baris CSV dapat tidak memiliki option name.
        // Schema CustomerOrder mewajibkan productOptionName, jadi gunakan
        // fallback yang stabil agar item tetap valid.
        const productOptionName =
          String(item.productOptionName ?? '').trim() ||
          String(item.productName ?? '').trim() ||
          String(product.version ?? '').trim() ||
          String(product.body ?? '').trim() ||
          product.name;

        items.push({
          product: product._id,

          productName: product.name,

          productOptionName,

          quantity: item.quantity,

          fulfilledQuantity: 0,

          price: item.price,

          total: item.total,
        });
      }

      console.log('RAW ORDER DATE:', JSON.stringify(order.orderDate));

      preparedOrders.push({
        orderNumber: order.orderNumber,
        orderBy: 'Big cartel',

        buyer: {
          firstName: order.buyer.firstName,

          lastName: order.buyer.lastName,

          email: order.buyer.email,

          phone: order.buyer.phone,
        },

        orderDate: parseCustomerOrderDate(order.orderDate),

        fulfillmentDueDate: parsedFulfillmentDueDate,

        status: 'pending',

        paymentStatus: order.paymentStatus,

        shippingStatus: order.shippingStatus,

        shippingMethod: order.shippingMethod,

        shippingAddress: {
          address1: order.shippingAddress.address1,

          address2: order.shippingAddress.address2,

          city: order.shippingAddress.city,

          state: order.shippingAddress.state,

          zip: order.shippingAddress.zip,

          country: order.shippingAddress.country,
        },

        currency: order.currency,

        subtotal: order.subtotal,

        shippingCost: order.shippingCost,

        tax: order.tax,

        discount: order.discount,

        total: order.total,

        note: order.note,

        items,
      });
    }

    const session = await mongoose.startSession();

    let createdOrders: Awaited<
      ReturnType<typeof CustomerOrderModel.insertMany>
    > = [];

    try {
      await session.withTransaction(async () => {
        const ordersWithPackagingCode = [];

        for (const preparedOrder of preparedOrders) {
          const packagingCode = await generatePackagingCode(session);

          ordersWithPackagingCode.push({
            ...preparedOrder,

            packagingCode,
          });
        }

        createdOrders = await CustomerOrderModel.insertMany(
          ordersWithPackagingCode,
          {
            ordered: true,
            session,
          },
        );
      });
    } finally {
      await session.endSession();
    }

    return res.json({
      success: true,

      message: 'Customer order berhasil diimport',

      data: {
        total: orders.length,

        created: createdOrders.length,

        skipped: 0,

        failed: 0,

        orders: createdOrders.map((order) => ({
          _id: order._id,

          orderNumber: order.orderNumber,

          packagingCode: order.packagingCode,
        })),
      },
    });
  } catch (error) {
    console.error('Customer order import error:', error);

    return res.status(500).json({
      success: false,

      message:
        error instanceof Error
          ? error.message
          : 'Gagal mengimport customer order',
    });
  }
});

/**
 * POST /api/customer-orders/:id/fulfill
 *
 * quantity pada request adalah TOTAL fulfillment yang diinginkan,
 * bukan delta. Contoh: fulfilled 8 -> quantity 5 akan mengembalikan 3 unit
 * ke finished goods inventory.
 */
router.post('/:id/fulfill', async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { id } = req.params;
    const parsed = fulfillmentSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message:
          parsed.error.issues[0]?.message ?? 'Data fulfillment tidak valid',
      });
    }

    session.startTransaction();

    const order = await CustomerOrderModel.findById(id).session(session);
    if (!order) {
      await session.abortTransaction();
      return res
        .status(404)
        .json({ success: false, message: 'Customer order tidak ditemukan' });
    }

    if (order.status === 'cancelled') {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Customer order cancelled tidak dapat diubah fulfillment-nya',
      });
    }

    if (['delivered', 'completed'].includes(order.status)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message:
          'Order yang sudah delivered/completed tidak dapat diubah fulfillment-nya',
      });
    }

    const requestedIds = parsed.data.items.map((item) => item.itemId);
    if (new Set(requestedIds).size !== requestedIds.length) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Item yang sama tidak boleh dikirim lebih dari satu kali',
      });
    }

    const updates: Array<{
      orderItem: (typeof order.items)[number];
      targetQuantity: number;
      delta: number;
    }> = [];

    // Validate seluruh item sebelum mengubah stok apa pun.
    for (const requestItem of parsed.data.items) {
      const orderItem = order.items.find(
        (item) => item._id.toString() === requestItem.itemId,
      );
      if (!orderItem) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Order item tidak ditemukan: ${requestItem.itemId}`,
        });
      }

      if (requestItem.quantity > orderItem.quantity) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Fulfillment ${orderItem.productName} tidak boleh melebihi jumlah order (${orderItem.quantity})`,
        });
      }

      const currentQuantity = orderItem.fulfilledQuantity ?? 0;
      const delta = requestItem.quantity - currentQuantity;

      if (delta > 0) {
        const inventory = await FinishedGoodsInventoryModel.findOne({
          product: orderItem.product,
        }).session(session);
        const availableStock = inventory?.quantity ?? 0;
        if (!inventory || availableStock < delta) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Stok tersedia untuk ${orderItem.productName} tidak cukup. Dibutuhkan tambahan ${delta}, tersedia ${availableStock}.`,
          });
        }
      }

      updates.push({ orderItem, targetQuantity: requestItem.quantity, delta });
    }

    // Terapkan selisih. Kenaikan mengeluarkan stok; penurunan mengembalikan stok.
    for (const update of updates) {
      const { orderItem, targetQuantity, delta } = update;
      if (delta > 0) {
        const inventory = await FinishedGoodsInventoryModel.findOneAndUpdate(
          { product: orderItem.product, quantity: { $gte: delta } },
          { $inc: { quantity: -delta } },
          { new: true, session },
        );
        if (!inventory) {
          throw new Error(
            `Stok ${orderItem.productName} berubah atau tidak cukup. Refresh data lalu coba lagi.`,
          );
        }

        await StockMovementModel.create(
          [
            {
              product: orderItem.product,
              type: 'OUT',
              quantity: delta,
              referenceType: 'customer_order',
              referenceId: order._id,
              referenceItemId: orderItem._id,
            },
          ],
          { session },
        );
      } else if (delta < 0) {
        const restoreQuantity = Math.abs(delta);
        await FinishedGoodsInventoryModel.findOneAndUpdate(
          { product: orderItem.product },
          { $inc: { quantity: restoreQuantity } },
          { new: true, upsert: true, session, setDefaultsOnInsert: true },
        );

        await StockMovementModel.create(
          [
            {
              product: orderItem.product,
              type: 'IN',
              quantity: restoreQuantity,
              referenceType: 'customer_order',
              referenceId: order._id,
              referenceItemId: orderItem._id,
            },
          ],
          { session },
        );
      }

      orderItem.fulfilledQuantity = targetQuantity;
    }

    const allFulfilled =
      order.items.length > 0 &&
      order.items.every(
        (item) => (item.fulfilledQuantity ?? 0) >= item.quantity,
      );
    order.status = allFulfilled ? 'fulfilled' : 'pending';

    await order.save({ session });
    await session.commitTransaction();

    await order.populate({
      path: 'items.product',
      select: '_id name version body',
    });
    return res.json({
      success: true,
      message: 'Fulfillment berhasil diperbarui dan stok disesuaikan.',
      data: order,
    });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    console.error('Customer order fulfillment update error:', error);
    return res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'Gagal memperbarui fulfillment',
    });
  } finally {
    await session.endSession();
  }
});

/**
 * GET /api/customer-orders/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const order = await CustomerOrderModel.findById(req.params.id).populate(
      'items.product',
      'name version body',
    );

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
    console.error('GET /api/customer-orders/:id error:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil customer order.',
    });
  }
});

/**
 * POST /api/customer-orders
 *
 * MANUAL CREATE
 *
 * Frontend hanya mengirim:
 *
 * {
 *   orderDate,
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
 * Backend otomatis:
 * - Order Number
 * - Packaging Code
 * - Buyer
 * - Fulfillment Due Date
 * - subtotal
 * - total
 * - status
 * - fulfilledQuantity
 */
router.post('/', async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const parsed = createCustomerOrderSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Data customer order tidak valid.',
        errors: parsed.error.flatten(),
      });
    }

    const data = parsed.data;

    /**
     * Buyer dikirim dari frontend berdasarkan
     * user yang sedang login.
     */
    const buyerName = data.buyer.firstName.trim();
    const buyerEmail = data.buyer.email.trim();
    const buyerPhone = data.buyer.phone?.trim() ?? '';

    if (!buyerName) {
      return res.status(400).json({
        success: false,
        message: 'Nama buyer tidak tersedia.',
      });
    }

    if (!buyerEmail) {
      return res.status(400).json({
        success: false,
        message: 'Email buyer tidak tersedia.',
      });
    }

    /**
     * Parse Order Date.
     */
    const orderDate = parseCustomerOrderDate(data.orderDate);

    /**
     * Fulfillment Due Date otomatis
     * 7 hari setelah Order Date.
     */
    const fulfillmentDueDate = addDays(orderDate, 7);

    /**
     * Pastikan semua product
     * benar-benar tersedia.
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
     * Generate data item.
     *
     * productName dan version diambil
     * dari database, bukan dari frontend.
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

        fulfilledQuantity: 0,

        price: item.price,

        total,
      };
    });

    /**
     * Hitung subtotal.
     */
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);

    /**
     * Untuk manual order:
     *
     * shippingCost = 0
     * tax = 0
     * discount = 0
     *
     * sehingga total = subtotal.
     */
    const shippingCost = 0;
    const tax = 0;
    const discount = 0;

    const total = subtotal + shippingCost + tax - discount;

    /**
     * Mulai transaction.
     */
    session.startTransaction();

    /**
     * Generate Order Number
     *
     * CO-000001
     * CO-000002
     * CO-000003
     */
    const orderNumber = await generateOrderNumber(session);

    /**
     * Satu Customer Order
     * mendapatkan satu Packaging Code.
     */
    const packagingCode = await generatePackagingCode(session);

    const [order] = await CustomerOrderModel.create(
      [
        {
          orderNumber,

          orderBy: data.orderBy,

          packagingCode,

          buyer: {
            firstName: buyerName,

            lastName: '',

            email: buyerEmail,

            phone: buyerPhone,
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

    await session.commitTransaction();

    await order.populate('items.product', 'name version body');

    return res.status(201).json({
      success: true,

      message: 'Customer order berhasil dibuat.',

      data: order,
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    console.error('POST /api/customer-orders error:', error);

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

/**
 * PUT /api/customer-orders/:id
 *
 * Packaging code TIDAK diubah.
 */
router.put('/:id', async (req, res) => {
  try {
    const parsed = customerOrderSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Data customer order tidak valid.',
        errors: parsed.error.flatten(),
      });
    }

    const data = parsed.data;

    const order = await CustomerOrderModel.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Customer order tidak ditemukan.',
      });
    }

    const duplicateOrder = await CustomerOrderModel.findOne({
      orderNumber: data.orderNumber,

      _id: {
        $ne: order._id,
      },
    });

    if (duplicateOrder) {
      return res.status(409).json({
        success: false,
        message: 'Order number sudah digunakan order lain.',
      });
    }

    for (const item of data.items) {
      const product = await ProductModel.findById(item.product);

      if (!product) {
        return res.status(400).json({
          success: false,
          message: `Product ${item.product} tidak ditemukan.`,
        });
      }
    }

    order.orderNumber = data.orderNumber;
    order.orderBy = data.orderBy ?? order.orderBy;

    // Jika sudah ada fulfillment, product dan quantity tidak boleh diubah
    // melalui PUT karena perubahan tersebut harus disertai penyesuaian stok.
    const hasFulfilledUnits = order.items.some(
      (item) => (item.fulfilledQuantity ?? 0) > 0,
    );

    if (hasFulfilledUnits) {
      const currentItems = order.items.map((item) => ({
        product: item.product.toString(),
        quantity: item.quantity,
      }));
      const incomingItems = data.items.map((item) => ({
        product: item.product,
        quantity: item.quantity,
      }));

      if (JSON.stringify(currentItems) !== JSON.stringify(incomingItems)) {
        return res.status(400).json({
          success: false,
          message:
            'Product dan quantity tidak dapat diubah karena order sudah memiliki fulfillment. Ubah field lainnya saja.',
        });
      }
    }

    order.buyer = {
      firstName: data.buyer.firstName ?? '',

      lastName: data.buyer.lastName ?? '',

      email: data.buyer.email ?? '',

      phone: data.buyer.phone ?? '',
    };

    order.orderDate = new Date(data.orderDate);

    order.fulfillmentDueDate = new Date(data.fulfillmentDueDate);

    order.status = data.status ?? order.status;

    order.paymentStatus = data.paymentStatus ?? '';

    order.shippingStatus = data.shippingStatus ?? '';

    order.shippingMethod = data.shippingMethod ?? '';

    order.shippingAddress = {
      address1: data.shippingAddress.address1 ?? '',

      address2: data.shippingAddress.address2 ?? '',

      city: data.shippingAddress.city ?? '',

      state: data.shippingAddress.state ?? '',

      zip: data.shippingAddress.zip ?? '',

      country: data.shippingAddress.country ?? '',
    };

    order.currency = data.currency ?? 'USD';

    order.subtotal = data.subtotal ?? 0;

    order.shippingCost = data.shippingCost ?? 0;

    order.tax = data.tax ?? 0;

    order.discount = data.discount ?? 0;

    order.total = data.total ?? 0;

    order.note = data.note ?? '';

    order.items.splice(
      0,
      order.items.length,
      ...data.items.map((item) => ({
        product: item.product,

        productName: item.productName,

        productOptionName: item.productOptionName,

        quantity: item.quantity,

        fulfilledQuantity: item.fulfilledQuantity ?? 0,

        price: item.price,

        total: item.total,
      })),
    );

    await order.save();

    await order.populate('items.product', 'name version body');

    return res.json({
      success: true,
      message: 'Customer order berhasil diperbarui.',
      data: order,
    });
  } catch (error) {
    console.error('PUT /api/customer-orders/:id error:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal memperbarui customer order.',
    });
  }
});

/**
 * DELETE /api/customer-orders/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const order = await CustomerOrderModel.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Customer order tidak ditemukan.',
      });
    }

    await order.deleteOne();

    return res.json({
      success: true,
      message: 'Customer order berhasil dihapus.',
    });
  } catch (error) {
    console.error('DELETE /api/customer-orders/:id error:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal menghapus customer order.',
    });
  }
});

/**
 * PATCH /api/customer-orders/:id/status
 *
 * Admin mengubah status:
 * fulfilled -> delivered -> completed
 *
 * Completion Notes opsional, disimpan saat completed.
 */
const updateCustomerOrderStatusSchema = z.object({
  status: z.enum(['delivered', 'completed']),
  completionNotes: z.string().trim().optional(),
});

router.patch('/:id/status', async (req, res) => {
  try {
    const parsed = updateCustomerOrderStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Data perubahan status tidak valid.',
        errors: parsed.error.flatten(),
      });
    }

    const { status, completionNotes } = parsed.data;

    const order = await CustomerOrderModel.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Customer order tidak ditemukan.',
      });
    }

    // Completed adalah status final.
    if (order.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Customer order yang sudah completed tidak dapat diubah lagi.',
      });
    }

    // Hanya order fulfilled yang bisa menjadi delivered.
    if (status === 'delivered' && order.status !== 'fulfilled') {
      return res.status(400).json({
        success: false,
        message: 'Order harus berstatus fulfilled sebelum menjadi delivered.',
      });
    }

    // Hanya order delivered yang bisa menjadi completed.
    if (status === 'completed' && order.status !== 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Order harus berstatus delivered sebelum menjadi completed.',
      });
    }

    order.status = status;

    if (status === 'completed') {
      order.set('completionNotes', completionNotes ?? '');
      order.set('completedAt', new Date());
    }

    await order.save();

    await order.populate('items.product', 'name version body');

    return res.json({
      success: true,
      message: `Customer order berhasil diubah menjadi ${status}.`,
      data: order,
    });
  } catch (error) {
    console.error('PATCH /api/customer-orders/:id/status error:', error);

    return res.status(500).json({
      success: false,
      message: 'Gagal memperbarui status customer order.',
    });
  }
});

export default router;
