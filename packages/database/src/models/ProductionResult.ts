import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const productionResultAllocationSchema = new Schema(
  {
    inputLot: {
      type: Schema.Types.ObjectId,
      ref: 'ProductionLot',
      required: true,
    },

    quantityProcessed: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value) && value >= 1,
        message: 'Jumlah diproses harus berupa bilangan bulat positif.',
      },
    },

    goodQuantity: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value) && value >= 0,
        message:
          'Jumlah produk baik harus berupa bilangan bulat nol atau lebih.',
      },
    },

    scrapQuantity: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value) && value >= 0,
        message:
          'Jumlah produk rusak harus berupa bilangan bulat nol atau lebih.',
      },
    },

    // Lot keluaran untuk produk baik.
    goodLot: {
      type: Schema.Types.ObjectId,
      ref: 'ProductionLot',
      default: null,
    },

    // Lot keluaran untuk produk rusak.
    scrapLot: {
      type: Schema.Types.ObjectId,
      ref: 'ProductionLot',
      default: null,
    },
  },
  { _id: false },
);

const productionResultSchema = new Schema(
  {
    productionOrder: {
      type: Schema.Types.ObjectId,
      ref: 'ProductionOrder',
      required: true,
      index: true,
    },

    // ID subdokumen step di dalam ProductionOrder.
    stepId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    sequence: {
      type: Number,
      required: true,
      min: 1,
    },

    process: {
      type: Schema.Types.ObjectId,
      ref: 'ProductionProcess',
      required: true,
    },

    // Operator yang mencatat hasil proses.
    operator: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    inspectedQuantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value) && value >= 1,
        message: 'Jumlah inspeksi harus berupa bilangan bulat positif.',
      },
    },

    goodQuantity: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value) && value >= 0,
        message:
          'Jumlah produk baik harus berupa bilangan bulat nol atau lebih.',
      },
    },

    scrapQuantity: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value) && value >= 0,
        message:
          'Jumlah produk rusak harus berupa bilangan bulat nol atau lebih.',
      },
    },

    allocations: {
      type: [productionResultAllocationSchema],
      required: true,
      validate: {
        validator: (value: unknown[]) =>
          Array.isArray(value) && value.length > 0,
        message: 'Hasil produksi harus memiliki minimal satu alokasi lot.',
      },
    },

    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: 2000,
    },

    recordedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },

    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
  },
  { timestamps: true },
);

// Pastikan jumlah baik + rusak sama dengan jumlah yang diproses.
productionResultSchema.pre('validate', function () {
  if (
    Number.isSafeInteger(this.inspectedQuantity) &&
    Number.isSafeInteger(this.goodQuantity) &&
    Number.isSafeInteger(this.scrapQuantity) &&
    this.goodQuantity + this.scrapQuantity !== this.inspectedQuantity
  ) {
    this.invalidate(
      'goodQuantity',
      'Jumlah produk baik + rusak harus sama dengan jumlah inspeksi.',
    );
  }

  const allocations = this.allocations ?? [];

  let totalProcessed = 0;
  let totalGood = 0;
  let totalScrap = 0;

  for (const allocation of allocations) {
    const processed = allocation.quantityProcessed;
    const good = allocation.goodQuantity;
    const scrap = allocation.scrapQuantity;

    if (
      Number.isSafeInteger(processed) &&
      Number.isSafeInteger(good) &&
      Number.isSafeInteger(scrap) &&
      good + scrap !== processed
    ) {
      this.invalidate(
        'allocations',
        'Pada setiap alokasi, jumlah baik + rusak harus sama dengan jumlah diproses.',
      );
      break;
    }

    if (
      Number.isSafeInteger(processed) &&
      Number.isSafeInteger(good) &&
      Number.isSafeInteger(scrap)
    ) {
      totalProcessed += processed;
      totalGood += good;
      totalScrap += scrap;
    }
  }

  if (allocations.length > 0) {
    if (totalProcessed !== this.inspectedQuantity) {
      this.invalidate(
        'inspectedQuantity',
        'Jumlah inspeksi harus sama dengan total jumlah diproses seluruh alokasi.',
      );
    }

    if (totalGood !== this.goodQuantity) {
      this.invalidate(
        'goodQuantity',
        'Jumlah produk baik harus sama dengan total alokasi.',
      );
    }

    if (totalScrap !== this.scrapQuantity) {
      this.invalidate(
        'scrapQuantity',
        'Jumlah produk rusak harus sama dengan total alokasi.',
      );
    }
  }
});

// Satu idempotency key hanya boleh menghasilkan satu pencatatan.
productionResultSchema.index({ idempotencyKey: 1 }, { unique: true });

productionResultSchema.index({
  productionOrder: 1,
  stepId: 1,
  recordedAt: -1,
});

export type ProductionResult = InferSchemaType<typeof productionResultSchema>;

export const ProductionResultModel: Model<ProductionResult> =
  (mongoose.models.ProductionResult as Model<ProductionResult> | undefined) ??
  mongoose.model<ProductionResult>('ProductionResult', productionResultSchema);
