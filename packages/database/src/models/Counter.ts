import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const counterSchema = new Schema(
  {
    _id: {
      type: String,
      required: true,
    },

    sequence: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  },
);

export type Counter = InferSchemaType<typeof counterSchema>;

export const CounterModel: Model<Counter> =
  (mongoose.models.Counter as Model<Counter> | undefined) ??
  mongoose.model<Counter>('Counter', counterSchema);
