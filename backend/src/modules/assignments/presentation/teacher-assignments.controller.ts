import { Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { PRISMA } from "../../../infrastructure/database/database.provider.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import { CurrentUser, TeacherGuard, type AuthUser } from "../../../http/auth-user.js";
import { SessionAuthGuard } from "../../../http/session.guard.js";
import { TypedBody } from "../../../http/dto-validation.js";
import { closeTeacherAssignment, createTeacherAssignment, getTeacherAssignment, listTeacherAssignments, publishTeacherAssignment, updateTeacherDraft } from "../application/teacher-assignments.js";
import { AssignmentDraftDto, UpdateAssignmentDraftDto } from "./teacher-assignments.dto.js";

@Controller("teacher/assignments")
@UseGuards(SessionAuthGuard, TeacherGuard)
export class TeacherAssignmentsController {
  constructor(@Inject(PRISMA) private readonly prisma: EduLitPrisma) {}
  @Get() list(@CurrentUser() user: AuthUser) { return listTeacherAssignments(this.prisma, user.id); }
  @Post() create(@CurrentUser() user: AuthUser, @TypedBody(AssignmentDraftDto) body: AssignmentDraftDto) { return createTeacherAssignment(this.prisma, user.id, body); }
  @Get(":assignmentId") detail(@CurrentUser() user: AuthUser, @Param("assignmentId", new ParseUUIDPipe({ version: "4" })) assignmentId: string) { return getTeacherAssignment(this.prisma, user.id, assignmentId); }
  @Patch(":assignmentId") update(@CurrentUser() user: AuthUser, @Param("assignmentId", new ParseUUIDPipe({ version: "4" })) assignmentId: string, @TypedBody(UpdateAssignmentDraftDto) body: UpdateAssignmentDraftDto) {
    return updateTeacherDraft(this.prisma, user.id, assignmentId, body.expectedUpdatedAt, body);
  }
  @Post(":assignmentId/publish") publish(@CurrentUser() user: AuthUser, @Param("assignmentId", new ParseUUIDPipe({ version: "4" })) assignmentId: string) { return publishTeacherAssignment(this.prisma, user.id, assignmentId); }
  @Post(":assignmentId/close") close(@CurrentUser() user: AuthUser, @Param("assignmentId", new ParseUUIDPipe({ version: "4" })) assignmentId: string) { return closeTeacherAssignment(this.prisma, user.id, assignmentId); }
}
