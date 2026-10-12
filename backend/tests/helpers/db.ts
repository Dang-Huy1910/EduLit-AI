import { randomUUID } from "node:crypto";
import { Prisma } from "../../src/generated/prisma/client.js";
import { requireTestDatabaseUrl } from "../../src/infrastructure/database/env.js";
import {
  createPrismaHandle,
  disconnectPrismaHandle,
  type EduLitPrisma,
} from "../../src/infrastructure/database/prisma.client.js";

const TEST_LOCK_KEY = 872341;

export async function withTestPrisma<T>(fn: (prisma: EduLitPrisma) => Promise<T>): Promise<T> {
  const url = requireTestDatabaseUrl();
  const handle = createPrismaHandle(url);
  try {
    await handle.prisma.$executeRaw(Prisma.sql`SELECT pg_advisory_lock(${TEST_LOCK_KEY})`);
    try {
      await truncateBusinessTables(handle.prisma);
      return await fn(handle.prisma);
    } finally {
      await handle.prisma.$executeRaw(Prisma.sql`SELECT pg_advisory_unlock(${TEST_LOCK_KEY})`);
    }
  } finally {
    await disconnectPrismaHandle(handle);
  }
}

export async function truncateBusinessTables(prisma: EduLitPrisma): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      writing_observations,
      writing_profiles,
      assessments,
      chat_messages,
      submissions,
      socratic_sessions,
      auth_sessions,
      assignments,
      users
    CASCADE
  `);
}

export async function createTeacher(prisma: EduLitPrisma, loginId = `teacher-${randomUUID()}`) {
  return prisma.user.create({
    data: {
      loginId,
      displayName: "Giáo viên thử",
      passwordHash: "test-hash",
      role: "TEACHER",
      status: "ACTIVE",
    },
  });
}

export async function createStudent(prisma: EduLitPrisma, loginId: string, displayName: string) {
  return prisma.user.create({
    data: {
      loginId,
      displayName,
      passwordHash: "test-hash",
      role: "STUDENT",
      status: "ACTIVE",
    },
  });
}

export const SAMPLE_RUBRIC = {
  criteria: [
    { criterionId: "C1", name: "Bố cục", weight: "4.00" },
    { criterionId: "C2", name: "Luận điểm", weight: "6.00" },
  ],
};

export const SAMPLE_EVALUATIONS = [
  { criterionId: "C1", awardedScore: "3.00" },
  { criterionId: "C2", awardedScore: "4.50" },
];
