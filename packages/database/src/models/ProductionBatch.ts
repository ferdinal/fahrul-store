import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const productionBatchSchema = new Schema(
  {
    batchNumber: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ['planned', 'in_progress', 'completed', 'cancelled'],
      default: 'planned',
    },

    plannedStartDate: {
      type: Date,
      default: null,
    },

    plannedEndDate: {
      type: Date,
      default: null,
    },

    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
  },
);

export type ProductionBatch = InferSchemaType<typeof productionBatchSchema>;

export const ProductionBatchModel: Model<ProductionBatch> =
  (mongoose.models.ProductionBatch as Model<ProductionBatch> | undefined) ??
  mongoose.model<ProductionBatch>('ProductionBatch', productionBatchSchema);
