import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const productionTransferSchema = new Schema(
  {
    productionOrder: {
      type: Schema.Types.ObjectId,
      ref: 'ProductionOrder',
      required: true,
      index: true,
    },

    // Step yang menyerahkan kuantitas.
    sourceStepId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    // Step penerima kuantitas.
    targetStepId: {
      type: Schema.Types.ObjectId,
      default: null,
    },

    // Lot sumber yang saldonya dikurangi.
    sourceLot: {
      type: Schema.Types.ObjectId,
      ref: 'ProductionLot',
      required: true,
    },

    // Lot tujuan yang mewakili kuantitas hasil transfer.
    targetLot: {
      type: Schema.Types.ObjectId,
      ref: 'ProductionLot',
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: (value: number) => Number.isSafeInteger(value) && value >= 1,
        message: 'Quantity transfer harus berupa bilangan bulat positif.',
      },
    },

    // Operator pemilik proses sumber yang melakukan transfer.
    transferredBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Operator yang ditugaskan menerima pekerjaan.
    assignedOperator: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // Kunci idempotensi untuk mencegah transfer tercatat dua kali.
    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: 2000,
    },

    transferredAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// Satu permintaan transfer tidak boleh diproses dua kali.
productionTransferSchema.index(
  { productionOrder: 1, idempotencyKey: 1 },
  { unique: true },
);

productionTransferSchema.index({
  productionOrder: 1,
  sourceStepId: 1,
  transferredAt: -1,
});

productionTransferSchema.index({
  productionOrder: 1,
  targetStepId: 1,
  transferredAt: -1,
});

export type ProductionTransfer = InferSchemaType<
  typeof productionTransferSchema
>;

export const ProductionTransferModel: Model<ProductionTransfer> =
  (mongoose.models.ProductionTransfer as
    | Model<ProductionTransfer>
    | undefined) ??
  mongoose.model<ProductionTransfer>(
    'ProductionTransfer',
    productionTransferSchema,
  );
