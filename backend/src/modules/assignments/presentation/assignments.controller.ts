import { Controller, Get, Inject, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { PRISMA } from "../../../infrastructure/database/database.provider.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import { CurrentUser, StudentGuard, type AuthUser } from "../../../http/auth-user.js";
import { SessionAuthGuard } from "../../../http/session.guard.js";
import {
  getPublishedAssignmentForStudent,
  listPublishedAssignmentsForStudent,
} from "../application/query-student-assignments.js";

@Controller("assignments")
@UseGuards(SessionAuthGuard, StudentGuard)
export class AssignmentsController {
  constructor(@Inject(PRISMA) private readonly prisma: EduLitPrisma) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return listPublishedAssignmentsForStudent(this.prisma, user.id);
  }

  @Get(":assignmentId")
  detail(
    @CurrentUser() user: AuthUser,
    @Param("assignmentId", new ParseUUIDPipe({ version: "4" })) assignmentId: string,
  ) {
    return getPublishedAssignmentForStudent(this.prisma, user.id, assignmentId);
  }
}
