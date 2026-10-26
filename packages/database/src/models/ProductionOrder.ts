import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const productionAssignmentSchema = new Schema(
  {
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    assignedOperator: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value) && value >= 1,
        message: 'Jumlah penugasan harus berupa bilangan bulat positif.',
      },
    },
    sourceTransfer: {
      type: Schema.Types.ObjectId,
      ref: 'ProductionTransfer',
      default: null,
    },
    assignedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: 2000,
    },
  },
  {
    _id: true,
  },
);

const productionOrderStepSchema = new Schema(
  {
    process: {
      type: Schema.Types.ObjectId,
      ref: 'ProductionProcess',
      required: true,
    },
    processName: {
      type: String,
      required: true,
      trim: true,
    },
    processCode: {
      type: String,
      required: true,
      trim: true,
    },
    sequence: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value) && value >= 1,
        message: 'Urutan proses harus berupa bilangan bulat positif.',
      },
    },
    dependsOn: {
      type: [
        {
          type: Schema.Types.ObjectId,
        },
      ],
      default: [],
    },
    status: {
      type: String,
      enum: [
        'planned',
        'in_progress',
        'partially_completed',
        'completed',
        'cancelled',
      ],
      default: 'planned',
      required: true,
    },

    // Satu proses hanya boleh dimiliki satu operator.
    // Kepemilikan dikunci saat operator berhasil melakukan Start.
    ownerOperator: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    claimedAt: {
      type: Date,
      default: null,
    },

    // Penugasan jumlah barang untuk operator.
    assignments: {
      type: [productionAssignmentSchema],
      default: [],
    },

    // Ringkasan hasil proses; hasil rinci dicatat di ProductionResult.
    quantityProcessed: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value) && value >= 0,
        message: 'Jumlah diproses harus berupa bilangan bulat nonnegatif.',
      },
    },
    quantityGood: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value) && value >= 0,
        message: 'Jumlah barang baik harus berupa bilangan bulat nonnegatif.',
      },
    },
    quantityScrap: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value) && value >= 0,
        message: 'Jumlah barang rusak harus berupa bilangan bulat nonnegatif.',
      },
    },

    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: 5000,
    },
  },
  {
    _id: true,
  },
);

const productionOrderSchema = new Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 100,
    },

    batch: {
      type: Schema.Types.ObjectId,
      ref: 'ProductionBatch',
      required: true,
      index: true,
    },

    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value) && value >= 1,
        message: 'Jumlah Production Order harus berupa bilangan bulat positif.',
      },
    },
    status: {
      type: String,
      enum: [
        'draft',
        'planned',
        'in_progress',
        'partially_completed',
        'completed',
        'cancelled',
      ],
      default: 'planned',
      required: true,
      index: true,
    },
    steps: {
      type: [productionOrderStepSchema],
      default: [],
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: 5000,
    },
  },
  {
    timestamps: true,
  },
);

productionOrderSchema.index({ status: 1, createdAt: -1 });
productionOrderSchema.index({ batch: 1, status: 1 });
productionOrderSchema.index({ product: 1, status: 1 });

export type ProductionOrderAssignment = InferSchemaType<
  typeof productionAssignmentSchema
>;

export type ProductionOrderStep = InferSchemaType<
  typeof productionOrderStepSchema
>;

export type ProductionOrder = InferSchemaType<typeof productionOrderSchema>;

export const ProductionOrderModel: Model<ProductionOrder> =
  (mongoose.models.ProductionOrder as Model<ProductionOrder> | undefined) ??
  mongoose.model<ProductionOrder>('ProductionOrder', productionOrderSchema);
