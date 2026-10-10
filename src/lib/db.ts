import mongoose from "mongoose";
import { env } from "./env";

type Cached = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };

const globalForMongoose = globalThis as unknown as { __nouba_mongoose?: Cached };
const cached: Cached = globalForMongoose.__nouba_mongoose ?? { conn: null, promise: null };
globalForMongoose.__nouba_mongoose = cached;

export async function db(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(env.mongodbUri(), { bufferCommands: false });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
