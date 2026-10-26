import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const finishedGoodsInventorySchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      unique: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    allocatedQuantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
  },

  {
    timestamps: true,
  },
);

export type FinishedGoodsInventory = InferSchemaType<
  typeof finishedGoodsInventorySchema
>;

export const FinishedGoodsInventoryModel: Model<FinishedGoodsInventory> =
  (mongoose.models.FinishedGoodsInventory as
    | Model<FinishedGoodsInventory>
    | undefined) ??
  mongoose.model<FinishedGoodsInventory>(
    'FinishedGoodsInventory',
    finishedGoodsInventorySchema,
  );
