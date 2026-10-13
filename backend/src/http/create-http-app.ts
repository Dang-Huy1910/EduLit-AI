import "reflect-metadata";
import { Logger, Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { json, type RequestHandler } from "express";
import { PRISMA } from "../infrastructure/database/database.provider.js";
import type { EduLitPrisma } from "../infrastructure/database/prisma.client.js";
import type { SocraticAiPort } from "../infrastructure/ai/socratic-ai.port.js";
import type { AssessmentAiPort } from "../infrastructure/ai/assessment-ai.port.js";
import type { WritingObservationAiPort } from "../infrastructure/ai/writing-observation-ai.port.js";
import type { PrivateStoragePort } from "../infrastructure/storage/private-storage.port.js";
import type { VisionTranscriptionPort } from "../infrastructure/vision/vision-transcription.port.js";
import { AuthController } from "../modules/identity/auth.controller.js";
import { AuthService } from "../modules/identity/auth.service.js";
import { LoginRateLimiter } from "../modules/identity/login-rate-limiter.js";
import { AssignmentsController } from "../modules/assignments/presentation/assignments.controller.js";
import { TeacherAssignmentsController } from "../modules/assignments/presentation/teacher-assignments.controller.js";
import { SocraticController } from "../modules/socratic/presentation/socratic.controller.js";
import { SocraticFacade } from "../modules/socratic/presentation/socratic.facade.js";
import { PrivateFilesController } from "../modules/submissions/presentation/files.controller.js";
import { SubmissionDraftsController } from "../modules/submissions/presentation/submission-drafts.controller.js";
import { TeacherOcrController } from "../modules/submissions/presentation/teacher-ocr.controller.js";
import { StudentSubmissionsController, TeacherAssessmentsController } from "../modules/assessment/presentation/assessment.controller.js";
import { ApiExceptionFilter, ApiHttpException, ERROR_MESSAGES } from "./api-error.js";
import { ASSESSMENT_AI, HTTP_CONFIG, PRIVATE_STORAGE, SOCRATIC_AI, VISION_AI, WRITING_PROFILE_AI, type HttpConfig } from "./config.js";
import { OriginGuard } from "./origin.guard.js";
import { SessionAuthGuard } from "./session.guard.js";
import { StudentGuard, TeacherGuard } from "./auth-user.js";
import { PrismaShutdownService, PRISMA_SHUTDOWN } from "./prisma-shutdown.service.js";

export type HttpAppDeps = {
  prisma: EduLitPrisma;
  ai: SocraticAiPort;
  assessmentAi: AssessmentAiPort;
  writingProfileAi: WritingObservationAiPort;
  vision: VisionTranscriptionPort;
  storage: PrivateStoragePort;
  config: HttpConfig;
  shutdown: () => Promise<void>;
  logger?: false | Logger | Array<"error" | "warn" | "log">;
  enableShutdownHooks?: boolean;
};

function resolveCookieParser(): RequestHandler {
  const imported = cookieParser as unknown as { default?: typeof cookieParser } & typeof cookieParser;
  const factory = imported.default ?? imported;
  return factory();
}

export async function createHttpApp(deps: HttpAppDeps): Promise<NestExpressApplication> {
  @Module({
    controllers: [AuthController, AssignmentsController, TeacherAssignmentsController, SocraticController, SubmissionDraftsController, TeacherOcrController, PrivateFilesController, TeacherAssessmentsController, StudentSubmissionsController],
    providers: [
      { provide: PRISMA, useValue: deps.prisma },
      { provide: SOCRATIC_AI, useValue: deps.ai },
      { provide: ASSESSMENT_AI, useValue: deps.assessmentAi },
      { provide: WRITING_PROFILE_AI, useValue: deps.writingProfileAi },
      { provide: VISION_AI, useValue: deps.vision },
      { provide: PRIVATE_STORAGE, useValue: deps.storage },
      { provide: HTTP_CONFIG, useValue: deps.config },
      { provide: PRISMA_SHUTDOWN, useValue: deps.shutdown },
      PrismaShutdownService,
      OriginGuard,
      SessionAuthGuard,
      StudentGuard,
      TeacherGuard,
      LoginRateLimiter,
      AuthService,
      SocraticFacade,
    ],
  })
  class AppModule {}

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: deps.logger === undefined ? ["error", "warn", "log"] : deps.logger,
  });

  app.setGlobalPrefix("api");
  app.use(resolveCookieParser());
  app.use(
    json({
      limit: deps.config.jsonBodyLimit,
      type: "application/json",
    }),
  );
  app.enableCors({
    origin: deps.config.appOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    maxAge: 600,
  });
  app.useGlobalGuards(app.get(OriginGuard));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      exceptionFactory: () => new ApiHttpException(400, "VALIDATION", ERROR_MESSAGES.VALIDATION),
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  if (deps.enableShutdownHooks !== false) {
    app.enableShutdownHooks();
  }
  return app;
}
