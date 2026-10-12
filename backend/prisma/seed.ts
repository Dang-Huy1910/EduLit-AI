import "dotenv/config";
import argon2 from "argon2";
import { createPrismaHandle, disconnectPrismaHandle } from "../src/infrastructure/database/prisma.client.js";
import { seedDatabase } from "./seed-logic.js";

async function main(): Promise<void> {
  const password = process.env.DEV_SEED_PASSWORD;
  if (!password) {
    throw new Error("DEV_SEED_PASSWORD is required to seed");
  }
  const handle = createPrismaHandle();
  try {
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await seedDatabase(handle.prisma, passwordHash);
    console.log("seed completed for synthetic teacher and two students");
  } finally {
    await disconnectPrismaHandle(handle);
  }
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : "seed failed";
  console.error(message);
  process.exit(1);
}
