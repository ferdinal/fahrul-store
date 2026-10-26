import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const productWorkflowSchema = new Schema(
  {
    process: {
      type: Schema.Types.ObjectId,
      ref: 'ProductionProcess',
      required: true,
    },

    sequence: {
      type: Number,
      required: true,
      min: 1,
    },

    // Referensi ke sequence proses yang menjadi prasyarat.
    // undefined dipertahankan agar workflow lama bisa dikenali.
    dependsOn: {
      type: [Number],
      default: undefined,
      validate: {
        validator: (values: number[] | undefined) =>
          values === undefined ||
          values.every((value) => Number.isInteger(value) && value >= 1),
        message: 'dependsOn harus berisi nomor sequence yang valid.',
      },
    },
  },
  { _id: false },
);

const productSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    version: {
      type: String,
      required: true,
      trim: true,
    },

    body: {
      type: String,
      trim: true,
      default: '',
    },

    workflow: {
      type: [productWorkflowSchema],
      default: [],
    },
  },
  { timestamps: true },
);

export type Product = InferSchemaType<typeof productSchema>;

export const ProductModel: Model<Product> =
  (mongoose.models.Product as Model<Product> | undefined) ??
  mongoose.model<Product>('Product', productSchema);
