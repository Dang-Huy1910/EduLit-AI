import { Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { PRISMA } from "../../../infrastructure/database/database.provider.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import { CurrentUser, StudentGuard, type AuthUser } from "../../../http/auth-user.js";
import { SessionAuthGuard } from "../../../http/session.guard.js";
import { ApiHttpException, ERROR_MESSAGES } from "../../../http/api-error.js";
import {
  getPublishedAssignmentForStudent,
  listPublishedAssignmentsForStudent,
} from "../application/query-student-assignments.js";
import { markAssignmentRead } from "../application/teacher-assignments.js";

@Controller("assignments")
@UseGuards(SessionAuthGuard, StudentGuard)
export class AssignmentsController {
  constructor(@Inject(PRISMA) private readonly prisma: EduLitPrisma) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return listPublishedAssignmentsForStudent(this.prisma, user.id);
  }

  @Get("code/:code")
  async byCode(@CurrentUser() user: AuthUser, @Param("code") code: string) {
    const assignment = await this.prisma.assignment.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!assignment || assignment.status !== "PUBLISHED") {
      throw new ApiHttpException(404, "NOT_FOUND", ERROR_MESSAGES.NOT_FOUND);
    }
    return getPublishedAssignmentForStudent(this.prisma, user.id, assignment.id);
  }

  @Get(":assignmentId")
  detail(
    @CurrentUser() user: AuthUser,
    @Param("assignmentId", new ParseUUIDPipe({ version: "4" })) assignmentId: string,
  ) {
    return getPublishedAssignmentForStudent(this.prisma, user.id, assignmentId);
  }

  @Post(":assignmentId/read")
  @HttpCode(200)
  markRead(@CurrentUser() user: AuthUser, @Param("assignmentId", new ParseUUIDPipe({ version: "4" })) assignmentId: string) {
    return markAssignmentRead(this.prisma, user.id, assignmentId);
  }
}
