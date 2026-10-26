import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const stockMovementSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },

    type: {
      type: String,
      enum: ['IN', 'OUT'],
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    referenceType: {
      type: String,
      enum: ['production_order', 'customer_order', 'stock_transfer'],
      required: true,
    },

    referenceId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    referenceItemId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    // Kunci unik untuk mencegah pencatatan stok ganda.
    // Digunakan terutama untuk hasil produksi parsial.
    idempotencyKey: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Customer Order dapat memiliki banyak item.
stockMovementSchema.index(
  {
    referenceType: 1,
    referenceId: 1,
    referenceItemId: 1,
    type: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      referenceItemId: { $type: 'objectId' },
    },
  },
);

// Setiap event hasil produksi hanya boleh mencatat stok satu kali.
stockMovementSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: 'string' },
    },
  },
);

export type StockMovement = InferSchemaType<typeof stockMovementSchema>;

export const StockMovementModel: Model<StockMovement> =
  (mongoose.models.StockMovement as Model<StockMovement> | undefined) ??
  mongoose.model<StockMovement>('StockMovement', stockMovementSchema);
