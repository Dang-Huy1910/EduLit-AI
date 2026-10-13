import { Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import { PRISMA } from "../../../infrastructure/database/database.provider.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import { ApiHttpException, ERROR_MESSAGES } from "../../../http/api-error.js";
import { CurrentUser, StudentGuard, studentActorFrom, type AuthUser } from "../../../http/auth-user.js";
import { SessionAuthGuard } from "../../../http/session.guard.js";
import { TypedBody } from "../../../http/dto-validation.js";
import { EmptyJsonDto } from "../../identity/dto.js";
import { loadAssignmentStatus } from "../../assignments/application/query-student-assignments.js";
import { SocraticFacade } from "./socratic.facade.js";
import { SaveOutlineDto, SendTurnDto } from "./socratic.dto.js";
import {
  serializeOutlineResult,
  serializeSocraticSession,
  serializeTurnResult,
} from "./serialize-session.js";

const uuidPipe = new ParseUUIDPipe({ version: "4" });

@Controller()
@UseGuards(SessionAuthGuard, StudentGuard)
export class SocraticController {
  constructor(
    @Inject(PRISMA) private readonly prisma: EduLitPrisma,
    @Inject(SocraticFacade) private readonly socratic: SocraticFacade,
  ) {}

  @Post("assignments/:assignmentId/socratic-sessions")
  @HttpCode(200)
  async openOrResume(
    @CurrentUser() user: AuthUser,
    @Param("assignmentId", uuidPipe) assignmentId: string,
    @TypedBody(EmptyJsonDto) _body: EmptyJsonDto,
  ) {
    const assignment = await loadAssignmentStatus(this.prisma, assignmentId);
    if (!assignment || assignment.status === "DRAFT") {
      throw new ApiHttpException(404, "NOT_FOUND", ERROR_MESSAGES.NOT_FOUND);
    }
    if (assignment.status === "CLOSED") {
      throw new ApiHttpException(409, "SESSION_ASSIGNMENT", ERROR_MESSAGES.SESSION_CLOSED);
    }
    const view = await this.socratic.services.openOrResumeSocraticSession(
      studentActorFrom(user),
      assignmentId,
    );
    return serializeSocraticSession(view, { resumed: view.resumed });
  }

  @Get("socratic-sessions/:sessionId")
  async getSession(
    @CurrentUser() user: AuthUser,
    @Param("sessionId", uuidPipe) sessionId: string,
  ) {
    const view = await this.socratic.services.getSocraticSession(studentActorFrom(user), sessionId);
    return serializeSocraticSession(view);
  }

  @Put("socratic-sessions/:sessionId/outline")
  async saveOutline(
    @CurrentUser() user: AuthUser,
    @Param("sessionId", uuidPipe) sessionId: string,
    @TypedBody(SaveOutlineDto) body: SaveOutlineDto,
  ) {
    const result = await this.socratic.services.saveStudentOutline(
      studentActorFrom(user),
      sessionId,
      body.outline,
      body.expectedOutlineRevision,
    );
    return serializeOutlineResult(result);
  }

  @Post("socratic-sessions/:sessionId/turns")
  @HttpCode(200)
  async sendTurn(
    @CurrentUser() user: AuthUser,
    @Param("sessionId", uuidPipe) sessionId: string,
    @TypedBody(SendTurnDto) body: SendTurnDto,
  ) {
    const result = await this.socratic.services.sendSocraticTurn(
      studentActorFrom(user),
      sessionId,
      body.requestId,
      body.expectedLastSequence,
      body.message,
    );
    return serializeTurnResult(result);
  }
}
