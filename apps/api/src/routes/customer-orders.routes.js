import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { CustomerOrderModel, ProductModel, FinishedGoodsInventoryModel, StockMovementModel, mongoose, } from '@fahrul-store/database';
import { authenticate, requireAdmin } from '../middlewares/auth.middleware.js';
import { generatePackagingCode } from '../utils/generate-packaging-code.js';
import { generateOrderNumber } from '../utils/generate-order-number.js';
import { normalizeProductName, parseBigCartelCsv, } from '../utils/big-cartel-csv.js';
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
    fileFilter: (_req, file, callback) => {
        const isCsv = file.mimetype === 'text/csv' ||
            file.originalname.toLowerCase().endsWith('.csv');
        if (!isCsv) {
            callback(new Error('File harus berupa CSV'));
            return;
        }
        callback(null, true);
    },
});
function parseCustomerOrderDate(value) {
    const normalized = value.trim();
    if (!normalized) {
        throw new Error('Order date kosong');
    }
    const isoWibMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)\s+WIB$/i);
    if (isoWibMatch) {
        const year = Number(isoWibMatch[1]);
        const month = Number(isoWibMatch[2]);
        const day = Number(isoWibMatch[3]);
        let hour = Number(isoWibMatch[4]);
        const minute = Number(isoWibMatch[5]);
        const second = Number(isoWibMatch[6] ?? 0);
        const period = isoWibMatch[7]?.toUpperCase();
        if (period === 'PM' && hour !== 12) {
            hour += 12;
        }
        if (period === 'AM' && hour === 12) {
            hour = 0;
        }
        const utcTimestamp = Date.UTC(year, month - 1, day, hour - 7, minute, second);
        const date = new Date(utcTimestamp);
        if (Number.isNaN(date.getTime())) {
            throw new Error(`Order date tidak valid: "${value}"`);
        }
        return date;
    }
    const nativeDate = new Date(normalized);
    if (!Number.isNaN(nativeDate.getTime())) {
        return nativeDate;
    }
    const usMatch = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
    if (usMatch) {
        const month = Number(usMatch[1]);
        const day = Number(usMatch[2]);
        const year = Number(usMatch[3]);
        let hour = Number(usMatch[4] ?? 0);
        const minute = Number(usMatch[5] ?? 0);
        const second = Number(usMatch[6] ?? 0);
        const period = usMatch[7]?.toUpperCase();
        if (period === 'PM' && hour !== 12) {
            hour += 12;
        }
        if (period === 'AM' && hour === 12) {
            hour = 0;
        }
        const date = new Date(year, month - 1, day, hour, minute, second);
        if (!Number.isNaN(date.getTime())) {
            return date;
        }
    }
    throw new Error(`Format Order date tidak valid: "${value}"`);
}
function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}
const router = Router();
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
        .array(z.object({
        product: z.string().trim().min(1),
        quantity: z.number().int().min(1),
        price: z.number().min(0),
    }))
        .min(1),
});
const fulfillmentItemSchema = z.object({
    itemId: z.string().trim().min(1, 'Item ID wajib diisi'),
    quantity: z.number().int().min(1, 'Quantity minimal 1'),
});
const fulfillmentSchema = z.object({
    items: z
        .array(fulfillmentItemSchema)
        .min(1, 'Minimal satu item harus dipenuhi'),
});
const allocationSchema = z.object({
    items: z
        .array(z.object({
        itemId: z.string().min(1, 'Item ID wajib diisi'),
        quantity: z
            .number()
            .int()
            .min(0, 'Allocation quantity tidak boleh negatif'),
    }))
        .min(1, 'Minimal satu item harus dialokasikan'),
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
    }
    catch (error) {
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
                message: 'File CSV wajib diupload',
            });
        }
        const csv = req.file.buffer.toString('utf-8');
        const orders = parseBigCartelCsv(csv);
        if (orders.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'CSV tidak memiliki data order',
            });
        }
        const products = await ProductModel.find({})
            .select('_id name version body')
            .lean();
        const productMap = new Map(products.map((product) => [normalizeProductName(product.name), product]));
        const productsByVersion = new Map();
        for (const product of products) {
            const normalizedVersion = normalizeProductName(product.version);
            const existing = productsByVersion.get(normalizedVersion) ?? [];
            existing.push(product);
            productsByVersion.set(normalizedVersion, existing);
        }
        function normalizeBodyForMatching(value) {
            return value
                .toLowerCase()
                .replace(/\([^)]*\)/g, (match) => ` ${match} `)
                .replace(/[()]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }
        function extractCsvBody(productName, productOptionName) {
            let value = productOptionName.trim();
            const forMatch = value.match(/^.+?\s+for\s+(.+)$/i);
            if (forMatch?.[1]) {
                value = forMatch[1].trim();
            }
            value = value.replace(/^[A-Z]+\d+\s+/i, '');
            return value.trim();
        }
        function findMatchingProduct(productName, productOptionName) {
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
                const exactValues = [item.productOptionName, item.productName].filter(Boolean);
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
                    product = findMatchingProduct(item.productName, item.productOptionName);
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
            const valid = order.orderNumber.length > 0 &&
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
                    ...unmatchedItems.map((item) => `Product tidak ditemukan: ${item.productOptionName || item.productName}`),
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
    }
    catch (error) {
        console.error('Customer order CSV preview error:', error);
        return res.status(400).json({
            success: false,
            message: error instanceof Error ? error.message : 'Gagal memproses CSV',
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
                message: 'File CSV wajib diupload',
            });
        }
        const fulfillmentDueDate = typeof req.body.fulfillmentDueDate === 'string'
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
        const csv = req.file.buffer.toString('utf-8');
        const orders = parseBigCartelCsv(csv);
        if (orders.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'CSV tidak memiliki data order',
            });
        }
        const products = await ProductModel.find({})
            .select('_id name version body')
            .lean();
        const productMap = new Map(products.map((product) => [normalizeProductName(product.name), product]));
        const productsByVersion = new Map();
        for (const product of products) {
            const normalizedVersion = normalizeProductName(product.version);
            const existing = productsByVersion.get(normalizedVersion) ?? [];
            existing.push(product);
            productsByVersion.set(normalizedVersion, existing);
        }
        function normalizeBodyForMatching(value) {
            return value
                .toLowerCase()
                .replace(/\([^)]*\)/g, (match) => ` ${match} `)
                .replace(/[()]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }
        function extractCsvBody(productName, productOptionName) {
            let value = productOptionName.trim();
            const forMatch = value.match(/^.+?\s+for\s+(.+)$/i);
            if (forMatch?.[1]) {
                value = forMatch[1].trim();
            }
            value = value.replace(/^[A-Z]+\d+\s+/i, '');
            return value.trim();
        }
        function findMatchingProduct(productName, productOptionName) {
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
        const preparedOrders = [];
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
                const exactValues = [item.productOptionName, item.productName].filter(Boolean);
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
                    product = findMatchingProduct(item.productName, item.productOptionName);
                }
                if (!product) {
                    return res.status(400).json({
                        success: false,
                        message: `Product tidak ditemukan untuk order ${order.orderNumber}: ` +
                            `${item.productOptionName || item.productName}`,
                    });
                }
                items.push({
                    product: product._id,
                    productName: product.name,
                    productOptionName: item.productOptionName,
                    quantity: item.quantity,
                    fulfilledQuantity: 0,
                    allocatedQuantity: 0,
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
        let createdOrders = [];
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
                createdOrders = await CustomerOrderModel.insertMany(ordersWithPackagingCode, {
                    ordered: true,
                    session,
                });
            });
        }
        finally {
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
    }
    catch (error) {
        console.error('Customer order CSV import error:', error);
        return res.status(500).json({
            success: false,
            message: error instanceof Error
                ? error.message
                : 'Gagal mengimport customer order',
        });
    }
});
/**
 * POST /api/customer-orders/:id/allocate
 */
router.post('/:id/allocate', async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const { id } = req.params;
        const parsed = allocationSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: parsed.error.issues[0]?.message ?? 'Data allocation tidak valid',
            });
        }
        session.startTransaction();
        const order = await CustomerOrderModel.findById(id).session(session);
        if (!order) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: 'Customer order tidak ditemukan',
            });
        }
        if (order.status === 'cancelled') {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: 'Customer order yang sudah cancelled tidak dapat dialokasikan',
            });
        }
        if (order.status === 'fulfilled') {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: 'Customer order sudah fully fulfilled',
            });
        }
        const itemIds = parsed.data.items.map((item) => item.itemId);
        if (new Set(itemIds).size !== itemIds.length) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: 'Item yang sama tidak boleh dikirim lebih dari satu kali',
            });
        }
        for (const requestItem of parsed.data.items) {
            const orderItem = order.items.find((item) => item._id.toString() === requestItem.itemId);
            if (!orderItem) {
                await session.abortTransaction();
                return res.status(400).json({
                    success: false,
                    message: `Order item tidak ditemukan: ${requestItem.itemId}`,
                });
            }
            const remainingToFulfill = orderItem.quantity - orderItem.fulfilledQuantity;
            const maxAllocation = remainingToFulfill;
            if (requestItem.quantity > maxAllocation) {
                await session.abortTransaction();
                return res.status(400).json({
                    success: false,
                    message: `Allocation quantity untuk ${orderItem.productName} ` +
                        `melebihi remaining quantity (${maxAllocation})`,
                });
            }
            const currentAllocation = orderItem.allocatedQuantity ?? 0;
            const allocationDelta = requestItem.quantity - currentAllocation;
            if (allocationDelta === 0) {
                continue;
            }
            const inventory = await FinishedGoodsInventoryModel.findOne({
                product: orderItem.product,
            }).session(session);
            if (!inventory) {
                await session.abortTransaction();
                return res.status(400).json({
                    success: false,
                    message: `Inventory ${orderItem.productName} tidak ditemukan`,
                });
            }
            if (allocationDelta > 0) {
                const updatedInventory = await FinishedGoodsInventoryModel.findOneAndUpdate({
                    _id: inventory._id,
                    $expr: {
                        $gte: [
                            {
                                $subtract: [
                                    '$quantity',
                                    {
                                        $ifNull: ['$allocatedQuantity', 0],
                                    },
                                ],
                            },
                            allocationDelta,
                        ],
                    },
                }, {
                    $inc: {
                        allocatedQuantity: allocationDelta,
                    },
                }, {
                    new: true,
                    session,
                });
                if (!updatedInventory) {
                    await session.abortTransaction();
                    return res.status(400).json({
                        success: false,
                        message: `Stok ${orderItem.productName} tidak cukup untuk allocation. ` +
                            `Available stock: ${Math.max(inventory.quantity - (inventory.allocatedQuantity ?? 0), 0)}`,
                    });
                }
            }
            else {
                const releaseQuantity = Math.abs(allocationDelta);
                const updatedInventory = await FinishedGoodsInventoryModel.findOneAndUpdate({
                    _id: inventory._id,
                    allocatedQuantity: {
                        $gte: releaseQuantity,
                    },
                }, {
                    $inc: {
                        allocatedQuantity: -releaseQuantity,
                    },
                }, {
                    new: true,
                    session,
                });
                if (!updatedInventory) {
                    await session.abortTransaction();
                    return res.status(400).json({
                        success: false,
                        message: `Allocated stock ${orderItem.productName} tidak valid`,
                    });
                }
            }
            orderItem.allocatedQuantity = requestItem.quantity;
        }
        await order.save({
            session,
        });
        await session.commitTransaction();
        await order.populate({
            path: 'items.product',
            select: '_id name version body',
        });
        return res.json({
            success: true,
            message: 'Stock berhasil dialokasikan',
            data: order,
        });
    }
    catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        console.error('Customer order allocation error:', error);
        return res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : 'Gagal melakukan allocation',
        });
    }
    finally {
        await session.endSession();
    }
});
/**
 * POST /api/customer-orders/:id/fulfill
 */
router.post('/:id/fulfill', async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const { id } = req.params;
        const parsed = fulfillmentSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({
                success: false,
                message: parsed.error.issues[0]?.message ?? 'Data fulfillment tidak valid',
            });
        }
        session.startTransaction();
        const order = await CustomerOrderModel.findById(id).session(session);
        if (!order) {
            await session.abortTransaction();
            return res.status(404).json({
                success: false,
                message: 'Customer order tidak ditemukan',
            });
        }
        if (order.status === 'cancelled') {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: 'Customer order yang sudah cancelled tidak dapat dipenuhi',
            });
        }
        if (order.status === 'fulfilled') {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: 'Customer order sudah fully fulfilled',
            });
        }
        const itemIds = parsed.data.items.map((item) => item.itemId);
        if (new Set(itemIds).size !== itemIds.length) {
            await session.abortTransaction();
            return res.status(400).json({
                success: false,
                message: 'Item yang sama tidak boleh dikirim lebih dari satu kali',
            });
        }
        const fulfillmentItems = [];
        /*
         * ==========================================
         * VALIDATE FULFILLMENT REQUEST
         * ==========================================
         */
        for (const requestItem of parsed.data.items) {
            const orderItem = order.items.find((item) => item._id.toString() === requestItem.itemId);
            if (!orderItem) {
                await session.abortTransaction();
                return res.status(400).json({
                    success: false,
                    message: `Order item tidak ditemukan: ${requestItem.itemId}`,
                });
            }
            const fulfilledQuantity = orderItem.fulfilledQuantity ?? 0;
            const allocatedQuantity = orderItem.allocatedQuantity ?? 0;
            const remainingQuantity = orderItem.quantity - fulfilledQuantity;
            /*
             * Item sudah selesai.
             */
            if (remainingQuantity <= 0) {
                await session.abortTransaction();
                return res.status(400).json({
                    success: false,
                    message: `Item ${orderItem.productName} sudah fully fulfilled`,
                });
            }
            /*
             * Request tidak boleh melebihi
             * remaining quantity.
             */
            if (requestItem.quantity > remainingQuantity) {
                await session.abortTransaction();
                return res.status(400).json({
                    success: false,
                    message: `Fulfill quantity untuk ${orderItem.productName} ` +
                        `melebihi remaining quantity (${remainingQuantity})`,
                });
            }
            /*
             * Request tidak boleh melebihi
             * allocated quantity pada order item.
             */
            if (requestItem.quantity > allocatedQuantity) {
                await session.abortTransaction();
                return res.status(400).json({
                    success: false,
                    message: `Fulfill quantity untuk ${orderItem.productName} ` +
                        `melebihi allocated quantity (${allocatedQuantity})`,
                });
            }
            /*
             * Ambil finished goods inventory.
             */
            const inventory = await FinishedGoodsInventoryModel.findOne({
                product: orderItem.product,
            }).session(session);
            if (!inventory) {
                await session.abortTransaction();
                return res.status(400).json({
                    success: false,
                    message: `Inventory untuk ${orderItem.productName} tidak ditemukan`,
                });
            }
            const physicalQuantity = inventory.quantity ?? 0;
            const inventoryAllocatedQuantity = inventory.allocatedQuantity ?? 0;
            /*
             * Physical stock harus cukup.
             */
            if (requestItem.quantity > physicalQuantity) {
                await session.abortTransaction();
                return res.status(400).json({
                    success: false,
                    message: `Stok fisik ${orderItem.productName} tidak cukup. ` +
                        `Tersedia: ${physicalQuantity}`,
                });
            }
            /*
             * Allocated stock harus cukup.
             */
            if (requestItem.quantity > inventoryAllocatedQuantity) {
                await session.abortTransaction();
                return res.status(400).json({
                    success: false,
                    message: `Allocated stock untuk ${orderItem.productName} tidak cukup. ` +
                        `Tersedia: ${inventoryAllocatedQuantity}`,
                });
            }
            fulfillmentItems.push({
                orderItem,
                quantity: requestItem.quantity,
            });
        }
        /*
         * ==========================================
         * EXECUTE FULFILLMENT
         * ==========================================
         */
        for (const fulfillmentItem of fulfillmentItems) {
            const { orderItem, quantity } = fulfillmentItem;
            /*
             * Kurangi physical stock
             * dan allocated stock.
             */
            const inventory = await FinishedGoodsInventoryModel.findOneAndUpdate({
                product: orderItem.product,
                quantity: {
                    $gte: quantity,
                },
                allocatedQuantity: {
                    $gte: quantity,
                },
            }, {
                $inc: {
                    quantity: -quantity,
                    allocatedQuantity: -quantity,
                },
            }, {
                new: true,
                session,
            });
            if (!inventory) {
                throw new Error(`Stock atau allocated stock ${orderItem.productName} tidak cukup`);
            }
            /*
             * Stock movement OUT.
             */
            await StockMovementModel.create([
                {
                    product: orderItem.product,
                    type: 'OUT',
                    quantity,
                    referenceType: 'customer_order',
                    referenceId: order._id,
                    referenceItemId: orderItem._id,
                },
            ], {
                session,
            });
            /*
             * Update fulfilled quantity.
             */
            orderItem.fulfilledQuantity =
                (orderItem.fulfilledQuantity ?? 0) + quantity;
            /*
             * Setelah fulfillment,
             * allocated quantity berkurang.
             */
            orderItem.allocatedQuantity =
                (orderItem.allocatedQuantity ?? 0) - quantity;
        }
        /*
         * ==========================================
         * CALCULATE ORDER STATUS
         * ==========================================
         */
        const fulfillmentStatus = order.items.map((item) => ({
            itemId: item._id.toString(),
            productName: item.productName,
            quantity: item.quantity,
            fulfilledQuantity: item.fulfilledQuantity ?? 0,
            allocatedQuantity: item.allocatedQuantity ?? 0,
            isFulfilled: (item.fulfilledQuantity ?? 0) >= item.quantity,
        }));
        const allFulfilled = order.items.length > 0 &&
            order.items.every((item) => (item.fulfilledQuantity ?? 0) >= item.quantity);
        console.log('\n========================================');
        console.log('CUSTOMER ORDER FULFILLMENT STATUS');
        console.log('========================================');
        console.log(JSON.stringify({
            orderId: order._id.toString(),
            orderNumber: order.orderNumber,
            previousStatus: order.status,
            items: fulfillmentStatus,
            allFulfilled,
        }, null, 2));
        /*
         * Hanya ada 2 status aktif:
         *
         * pending
         * fulfilled
         *
         * Tidak menggunakan partial.
         */
        if (allFulfilled) {
            order.status = 'fulfilled';
        }
        else {
            order.status = 'pending';
        }
        /*
         * ==========================================
         * SAVE ORDER
         * ==========================================
         */
        await order.save({
            session,
        });
        console.log('\nCUSTOMER ORDER SAVED');
        console.log(JSON.stringify({
            orderId: order._id.toString(),
            orderNumber: order.orderNumber,
            status: order.status,
            items: order.items.map((item) => ({
                itemId: item._id.toString(),
                productName: item.productName,
                quantity: item.quantity,
                fulfilledQuantity: item.fulfilledQuantity ?? 0,
                allocatedQuantity: item.allocatedQuantity ?? 0,
            })),
        }, null, 2));
        /*
         * ==========================================
         * COMMIT TRANSACTION
         * ==========================================
         */
        await session.commitTransaction();
        /*
         * Populate setelah transaction selesai.
         */
        await order.populate({
            path: 'items.product',
            select: '_id name version body',
        });
        /*
         * ==========================================
         * RESPONSE
         * ==========================================
         */
        return res.json({
            success: true,
            message: 'Customer order berhasil di-fulfill',
            data: order,
        });
    }
    catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        console.error('Customer order fulfillment error:', error);
        return res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : 'Gagal melakukan fulfillment',
        });
    }
    finally {
        await session.endSession();
    }
});
/**
 * GET /api/customer-orders/:id
 */
router.get('/:id', async (req, res) => {
    try {
        const order = await CustomerOrderModel.findById(req.params.id).populate('items.product', 'name version body');
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
    }
    catch (error) {
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
 * - allocatedQuantity
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
        const productMap = new Map(products.map((product) => [product._id.toString(), product]));
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
                allocatedQuantity: 0,
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
        const [order] = await CustomerOrderModel.create([
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
        ], {
            session,
        });
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
    }
    catch (error) {
        if (session.inTransaction()) {
            await session.abortTransaction();
        }
        console.error('POST /api/customer-orders error:', error);
        return res.status(500).json({
            success: false,
            message: error instanceof Error
                ? error.message
                : 'Gagal membuat customer order.',
        });
    }
    finally {
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
        order.items.splice(0, order.items.length, ...data.items.map((item) => ({
            product: item.product,
            productName: item.productName,
            productOptionName: item.productOptionName,
            quantity: item.quantity,
            fulfilledQuantity: item.fulfilledQuantity ?? 0,
            allocatedQuantity: 0,
            price: item.price,
            total: item.total,
        })));
        await order.save();
        await order.populate('items.product', 'name version body');
        return res.json({
            success: true,
            message: 'Customer order berhasil diperbarui.',
            data: order,
        });
    }
    catch (error) {
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
    }
    catch (error) {
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
    }
    catch (error) {
        console.error('PATCH /api/customer-orders/:id/status error:', error);
        return res.status(500).json({
            success: false,
            message: 'Gagal memperbarui status customer order.',
        });
    }
});
export default router;
//# sourceMappingURL=customer-orders.routes.js.map