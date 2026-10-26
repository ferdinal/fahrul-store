import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const productionLotSchema = new Schema(
  {
    productionOrder: {
      type: Schema.Types.ObjectId,
      ref: 'ProductionOrder',
      required: true,
      index: true,
    },

    product: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },

    lotCode: {
      type: String,
      required: true,
      trim: true,
    },

    // Lot induk apabila lot ini berasal dari pemecahan lot lain.
    parentLot: {
      type: Schema.Types.ObjectId,
      ref: 'ProductionLot',
      default: null,
    },

    // Step produksi yang menghasilkan lot ini.
    sourceStepId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    // Hasil produksi yang menghasilkan lot ini.
    sourceResult: {
      type: Schema.Types.ObjectId,
      ref: 'ProductionResult',
      default: null,
    },

    // Jumlah awal unit yang diwakili lot.
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value) && value >= 1,
        message: 'Quantity lot harus berupa bilangan bulat positif.',
      },
    },

    // Jumlah yang masih tersedia untuk diproses atau ditransfer.
    // Saat membuat lot baru, isi dengan nilai quantity.
    availableQuantity: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value) && value >= 0,
        message:
          'Available quantity harus berupa bilangan bulat nol atau lebih.',
      },
    },

    status: {
      type: String,
      enum: ['active', 'scrap', 'finished'],
      default: 'active',
      required: true,
    },

    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true },
);

// Kode lot unik dalam satu Production Order.
productionLotSchema.index({ productionOrder: 1, lotCode: 1 }, { unique: true });

productionLotSchema.index({
  productionOrder: 1,
  status: 1,
});

productionLotSchema.index({
  productionOrder: 1,
  sourceStepId: 1,
});

productionLotSchema.pre('validate', function () {
  if (
    Number.isSafeInteger(this.quantity) &&
    Number.isSafeInteger(this.availableQuantity) &&
    this.availableQuantity > this.quantity
  ) {
    this.invalidate(
      'availableQuantity',
      'Jumlah tersedia tidak boleh melebihi quantity lot.',
    );
  }
});

export type ProductionLot = InferSchemaType<typeof productionLotSchema>;

export const ProductionLotModel: Model<ProductionLot> =
  (mongoose.models.ProductionLot as Model<ProductionLot> | undefined) ??
  mongoose.model<ProductionLot>('ProductionLot', productionLotSchema);
