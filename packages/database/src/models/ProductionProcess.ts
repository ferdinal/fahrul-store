import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const productionProcessSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },

    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

export type ProductionProcess = InferSchemaType<typeof productionProcessSchema>;

export const ProductionProcessModel: Model<ProductionProcess> =
  (mongoose.models.ProductionProcess as Model<ProductionProcess> | undefined) ??
  mongoose.model<ProductionProcess>(
    'ProductionProcess',
    productionProcessSchema,
  );
