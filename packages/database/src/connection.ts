import mongoose from 'mongoose';

let isConnected = false;

export async function connectDatabase() {
  if (isConnected) {
    return;
  }

  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MONGODB_URI is not defined');
  }

  await mongoose.connect(mongoUri);

  isConnected = true;

  console.log('MongoDB connected');
}

export { mongoose };
