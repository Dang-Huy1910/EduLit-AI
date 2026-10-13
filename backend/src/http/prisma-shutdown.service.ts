import { Inject, Injectable } from "@nestjs/common";
import type { OnApplicationShutdown } from "@nestjs/common";
import { HttpAdapterHost } from "@nestjs/core";
import type { Server } from "node:http";

export const PRISMA_SHUTDOWN = "PRISMA_SHUTDOWN";

@Injectable()
export class PrismaShutdownService implements OnApplicationShutdown {
  constructor(
    @Inject(PRISMA_SHUTDOWN) private readonly shutdown: () => Promise<void>,
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    const server = this.adapterHost.httpAdapter.getHttpServer() as Server;
    if (typeof server.closeAllConnections === "function") {
      server.closeAllConnections();
    }
    await this.shutdown();
  }
}
