import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../../generated/prisma/client.js";
import { requireDatabaseUrl } from "./env.js";

export type EduLitPrisma = PrismaClient;

export type PrismaHandle = {
  prisma: EduLitPrisma;
  pool: Pool;
};

export function createPrismaHandle(connectionString = requireDatabaseUrl()): PrismaHandle {
  const pool = new Pool({ connectionString, max: 10 });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  return { prisma, pool };
}

export async function disconnectPrismaHandle(handle: PrismaHandle): Promise<void> {
  await handle.prisma.$disconnect();
  await handle.pool.end();
}
