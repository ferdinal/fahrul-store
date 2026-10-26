import {
  Router,
  type Router as ExpressRouter,
  type Response,
  type NextFunction,
} from 'express';

import {
  CustomerOrderModel,
  FinishedGoodsInventoryModel,
  ProductModel,
  ProductionOrderModel,
} from '@fahrul-store/database';

import {
  authenticate,
  type AuthRequest,
} from '../middlewares/auth.middleware.js';

const router: ExpressRouter = Router();

/**
 * Admin dan Admin Produksi boleh mengakses Production Requirements.
 * Role operator dan user tetap tidak memiliki akses.
 */
function requireProductionPlanningAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  if (req.user.role !== 'admin' && req.user.role !== 'admin-produksi') {
    return res.status(403).json({
      success: false,
      message: 'Production planning access required',
    });
  }

  next();
}

router.use(authenticate, requireProductionPlanningAccess);

/**
 * GET /api/production-requirements
 *
 * Menghitung kebutuhan produksi berdasarkan:
 *
 * Demand:
 *   Customer Order quantity - fulfilledQuantity
 *
 * Supply:
 *   Finished Goods physical stock
 *   + Production Order planned
 *   + Production Order in_progress
 *
 * Production Need:
 *   max(Demand - Supply, 0)
 */
router.get('/', async (_req, res) => {
  try {
    /**
     * ============================================================
     * 1. CUSTOMER ORDER DEMAND
     * ============================================================
     *
     * Status fulfilled/cancelled tidak lagi membutuhkan produksi.
     *
     * Status lama seperti "partial" tetap kita ikutkan supaya
     * data lama tidak hilang dari perhitungan.
     */
    const demandRows = await CustomerOrderModel.aggregate([
      {
        $match: {
          status: {
            $nin: ['fulfilled', 'cancelled'],
          },
        },
      },
      {
        $unwind: '$items',
      },
      {
        $project: {
          product: '$items.product',
          orderedQuantity: '$items.quantity',
          fulfilledQuantity: {
            $ifNull: ['$items.fulfilledQuantity', 0],
          },
        },
      },
      {
        $project: {
          product: 1,
          demandQuantity: {
            $max: [
              {
                $subtract: ['$orderedQuantity', '$fulfilledQuantity'],
              },
              0,
            ],
          },
        },
      },
      {
        $group: {
          _id: '$product',
          demandQuantity: {
            $sum: '$demandQuantity',
          },
        },
      },
    ]);

    /**
     * ============================================================
     * 2. PRODUCTION SUPPLY
     * ============================================================
     *
     * planned + in_progress dihitung sebagai supply.
     *
     * completed TIDAK dihitung karena quantity-nya sudah masuk
     * Finished Goods Inventory.
     */
    const productionRows = await ProductionOrderModel.aggregate([
      {
        $match: {
          status: {
            $in: ['planned', 'in_progress'],
          },
        },
      },
      {
        $group: {
          _id: '$product',
          plannedQuantity: {
            $sum: {
              $cond: [
                {
                  $eq: ['$status', 'planned'],
                },
                '$quantity',
                0,
              ],
            },
          },
          inProgressQuantity: {
            $sum: {
              $cond: [
                {
                  $eq: ['$status', 'in_progress'],
                },
                '$quantity',
                0,
              ],
            },
          },
        },
      },
    ]);

    /**
     * ============================================================
     * 3. FINISHED GOODS INVENTORY
     * ============================================================
     */
    const inventoryRows = await FinishedGoodsInventoryModel.find()
      .select('product quantity allocatedQuantity')
      .lean();

    /**
     * ============================================================
     * 4. BUILD MAP
     * ============================================================
     */
    const demandMap = new Map<string, number>();

    for (const row of demandRows) {
      demandMap.set(row._id.toString(), row.demandQuantity ?? 0);
    }

    const productionMap = new Map<
      string,
      {
        plannedQuantity: number;
        inProgressQuantity: number;
      }
    >();

    for (const row of productionRows) {
      productionMap.set(row._id.toString(), {
        plannedQuantity: row.plannedQuantity ?? 0,
        inProgressQuantity: row.inProgressQuantity ?? 0,
      });
    }

    const inventoryMap = new Map<
      string,
      {
        quantity: number;
        allocatedQuantity: number;
        availableQuantity: number;
      }
    >();

    for (const inventory of inventoryRows) {
      const physicalQuantity = inventory.quantity ?? 0;
      const allocatedQuantity = inventory.allocatedQuantity ?? 0;

      inventoryMap.set(inventory.product.toString(), {
        quantity: physicalQuantity,
        allocatedQuantity,
        availableQuantity: Math.max(physicalQuantity - allocatedQuantity, 0),
      });
    }

    /**
     * ============================================================
     * 5. COLLECT ALL PRODUCTS
     * ============================================================
     *
     * Product bisa muncul hanya di:
     * - customer order
     * - inventory
     * - production order
     *
     * Kita gabungkan semuanya.
     */
    const productIds = new Set<string>();

    for (const row of demandRows) {
      productIds.add(row._id.toString());
    }

    for (const row of productionRows) {
      productIds.add(row._id.toString());
    }

    for (const inventory of inventoryRows) {
      productIds.add(inventory.product.toString());
    }

    /**
     * ============================================================
     * 6. LOAD PRODUCT DATA
     * ============================================================
     */
    const products = await ProductModel.find({
      _id: {
        $in: Array.from(productIds),
      },
    })
      .select('_id name version body')
      .lean();

    /**
     * ============================================================
     * 7. BUILD RESULT
     * ============================================================
     */
    const data = products
      .map((product) => {
        const productId = product._id.toString();

        const demand = demandMap.get(productId) ?? 0;
        const inventory = inventoryMap.get(productId);

        const physicalStock = inventory?.quantity ?? 0;
        const allocatedStock = inventory?.allocatedQuantity ?? 0;

        const availableStock =
          inventory?.availableQuantity ??
          Math.max(physicalStock - allocatedStock, 0);

        const production = productionMap.get(productId);

        const plannedProduction = production?.plannedQuantity ?? 0;

        const inProgressProduction = production?.inProgressQuantity ?? 0;

        /**
         * Physical stock sudah mencakup allocated + available.
         * Jadi jangan menjumlahkan allocated + available lagi.
         */
        const totalSupply =
          physicalStock + plannedProduction + inProgressProduction;

        const productionNeed = Math.max(demand - totalSupply, 0);

        return {
          product: {
            _id: product._id,
            name: product.name,
            version: product.version,
            body: product.body,
          },

          demandQuantity: demand,

          inventory: {
            physicalQuantity: physicalStock,
            allocatedQuantity: allocatedStock,
            availableQuantity: availableStock,
          },

          production: {
            plannedQuantity: plannedProduction,
            inProgressQuantity: inProgressProduction,
            totalQuantity: plannedProduction + inProgressProduction,
          },

          totalSupply,
          productionNeed,
        };
      })
      /**
       * Product tanpa demand dan tanpa production need tidak perlu
       * muncul di halaman planning.
       *
       * Tapi product yang sedang production tetap ditampilkan.
       */
      .filter(
        (item) => item.demandQuantity > 0 || item.production.totalQuantity > 0,
      )
      .sort((a, b) => b.productionNeed - a.productionNeed);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Production requirements error:', error);

    return res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'Gagal menghitung production requirement',
    });
  }
});

export default router;
