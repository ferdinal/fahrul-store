import { CounterModel, mongoose } from '@fahrul-store/database';

const ORDER_COUNTER_ID = 'customer_order';

export async function generateOrderNumber(
  session?: mongoose.ClientSession,
): Promise<string> {
  const options = {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
    ...(session ? { session } : {}),
  };

  const counter = await CounterModel.findOneAndUpdate(
    {
      _id: ORDER_COUNTER_ID,
    },
    {
      $inc: {
        sequence: 1,
      },
    },
    options,
  );

  if (!counter) {
    throw new Error('Failed to generate order number.');
  }

  return `CO-${String(counter.sequence).padStart(6, '0')}`;
}
