import "dotenv/config";
import path from "node:path";
import argon2 from "argon2";
import { createPrismaHandle, disconnectPrismaHandle } from "../src/infrastructure/database/prisma.client.js";
import { LocalPrivateStorage } from "../src/infrastructure/storage/local-private-storage.js";
import { seedDemoDatabase } from "./seed-demo-logic.js";

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("seed:demo refuses production");
  }
  const password = process.env.DEV_SEED_PASSWORD;
  if (!password) {
    throw new Error("DEV_SEED_PASSWORD is required to seed demo data");
  }
  const handle = createPrismaHandle();
  const storageRoot = path.resolve(process.env.LOCAL_STORAGE_PATH?.trim() || "var/uploads");
  try {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await seedDemoDatabase(handle.prisma, passwordHash, new LocalPrivateStorage(storageRoot));
    console.log("demo seed completed (additive namespace DEMO-*)");
  } finally {
    await disconnectPrismaHandle(handle);
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : "demo seed failed";
  console.error(message);
  process.exit(1);
}
