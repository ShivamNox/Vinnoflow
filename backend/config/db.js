// config/db.js
import mongoose from 'mongoose';

let _connected = false;

export async function connectDB(uri) {
  if (!uri) return { ok: false, error: 'No URI provided' };
  try {
    if (_connected) {
      if (mongoose.connection.readyState === 1) return { ok: true };
      await mongoose.disconnect();
    }
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    _connected = true;
    console.log('[db] MongoDB connected:', mongoose.connection.host);
    return { ok: true };
  } catch (err) {
    _connected = false;
    console.error('[db] MongoDB connect failed:', err.message);
    return { ok: false, error: err.message };
  }
}

export function isConnected() {
  return mongoose.connection.readyState === 1;
}

export default connectDB;
