import {
  createPrismaHandle,
  disconnectPrismaHandle,
  type EduLitPrisma,
  type PrismaHandle,
} from "./prisma.client.js";

export const PRISMA = Symbol("EduLitPrisma");

/**
 * NestJS-shaped provider for later API/worker wiring.
 * Register as: { provide: PRISMA, useFactory: createPrismaClientFactory }
 * Do not treat this as a running Nest application.
 */
export function createPrismaClientFactory(): EduLitPrisma {
  return createPrismaHandle().prisma;
}

export function createDatabaseProviders() {
  let handle: PrismaHandle | undefined;
  return [
    {
      provide: PRISMA,
      useFactory: (): EduLitPrisma => {
        handle = createPrismaHandle();
        return handle.prisma;
      },
    },
    {
      provide: "PRISMA_SHUTDOWN",
      useFactory: () => async () => {
        if (handle) {
          await disconnectPrismaHandle(handle);
        }
      },
    },
  ];
}
