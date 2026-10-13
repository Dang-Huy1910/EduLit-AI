import { Inject, Injectable } from "@nestjs/common";
import { PRISMA } from "../../../infrastructure/database/database.provider.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { SocraticAiPort } from "../../../infrastructure/ai/socratic-ai.port.js";
import { SOCRATIC_AI } from "../../../http/config.js";
import { createSocraticServices } from "../application/create-socratic-services.js";

@Injectable()
export class SocraticFacade {
  readonly services: ReturnType<typeof createSocraticServices>;

  constructor(
    @Inject(PRISMA) prisma: EduLitPrisma,
    @Inject(SOCRATIC_AI) ai: SocraticAiPort,
  ) {
    this.services = createSocraticServices(prisma, ai);
  }
}
