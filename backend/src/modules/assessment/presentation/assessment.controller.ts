import { Controller, Get, Inject, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { PRISMA } from "../../../infrastructure/database/database.provider.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { AssessmentAiPort } from "../../../infrastructure/ai/assessment-ai.port.js";
import type { WritingObservationAiPort } from "../../../infrastructure/ai/writing-observation-ai.port.js";
import { ASSESSMENT_AI, WRITING_PROFILE_AI } from "../../../http/config.js";
import { CurrentUser, StudentGuard, TeacherGuard, type AuthUser } from "../../../http/auth-user.js";
import { SessionAuthGuard } from "../../../http/session.guard.js";
import { TypedBody } from "../../../http/dto-validation.js";
import { DomainError } from "../../../core/errors.js";
import { assessSubmission } from "../application/assess-submission.js";
import { getSubmission } from "../application/get-submission.js";
import { publishReviewedAssessment } from "../application/publish-reviewed-assessment.js";
import { reviewAssessment } from "../application/review-assessment.js";
import { toTeacherAssessmentView } from "../application/serialize-assessment.js";
import { getOwnWritingProfile } from "../../writing-profile/application/get-own-writing-profile.js";
import { getProfileExtractionJob, processProfileExtraction } from "../../writing-profile/application/process-profile-extraction.js";
import { reviewObservationStatus } from "../../writing-profile/application/review-observation-status.js";
import { ReviewAssessmentDto, ReviewObservationDto } from "./assessment.dto.js";

@Controller("teacher") @UseGuards(SessionAuthGuard, TeacherGuard)
export class TeacherAssessmentsController {
  constructor(@Inject(PRISMA) private readonly prisma: EduLitPrisma, @Inject(ASSESSMENT_AI) private readonly ai: AssessmentAiPort, @Inject(WRITING_PROFILE_AI) private readonly profileAi: WritingObservationAiPort) {}
  @Get("assignments/:assignmentId/submissions") async list(@CurrentUser() user: AuthUser, @Param("assignmentId", new ParseUUIDPipe({ version: "4" })) assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({ where: { id: assignmentId } });
    if (!assignment || assignment.teacherId !== user.id) throw new DomainError("ASSIGNMENT_OWNERSHIP", "assignment is not owned by this teacher");
    const rows = await this.prisma.submission.findMany({ where: { assignmentId }, include: { assessment: true, sourceDraft: true, student: { select: { displayName: true, loginId: true } } }, orderBy: { submittedAt: "desc" } });
    return rows.map((row) => ({ id: row.id, studentId: row.studentId, student: row.student, source: row.source, submittedAt: row.submittedAt.toISOString(), ocrStatus: row.sourceDraft?.status ?? null, assessment: row.assessment ? toTeacherAssessmentView(row.assessment) : null }));
  }
  @Get("submissions/:submissionId") detail(@CurrentUser() user: AuthUser, @Param("submissionId", new ParseUUIDPipe({ version: "4" })) submissionId: string) { return getSubmission(this.prisma, { userId: user.id, role: "TEACHER" }, { submissionId }); }
  @Post("submissions/:submissionId/assess") async assess(@CurrentUser() user: AuthUser, @Param("submissionId", new ParseUUIDPipe({ version: "4" })) submissionId: string) { const result = await assessSubmission(this.prisma, this.ai, { userId: user.id, role: "TEACHER" }, { submissionId }); return { assessment: result.assessment, replayed: result.replayed }; }
  @Post("assessments/:assessmentId/review") review(@CurrentUser() user: AuthUser, @Param("assessmentId", new ParseUUIDPipe({ version: "4" })) assessmentId: string, @TypedBody(ReviewAssessmentDto) body: ReviewAssessmentDto) { return reviewAssessment(this.prisma, { userId: user.id, role: "TEACHER" }, { assessmentId, ...body }); }
  @Post("assessments/:assessmentId/publish") async publish(@CurrentUser() user: AuthUser, @Param("assessmentId", new ParseUUIDPipe({ version: "4" })) assessmentId: string) { const result = await publishReviewedAssessment(this.prisma, { userId: user.id, role: "TEACHER" }, { assessmentId }); void processProfileExtraction(this.prisma, this.profileAi, { userId: user.id, role: "TEACHER" }, assessmentId).catch(() => undefined); return result; }
  @Get("assessments/:assessmentId/profile-extraction") job(@CurrentUser() user: AuthUser, @Param("assessmentId", new ParseUUIDPipe({ version: "4" })) assessmentId: string) { return getProfileExtractionJob(this.prisma, user.id, assessmentId); }
  @Post("assessments/:assessmentId/profile-extraction/retry") retryProfile(@CurrentUser() user: AuthUser, @Param("assessmentId", new ParseUUIDPipe({ version: "4" })) assessmentId: string) { return processProfileExtraction(this.prisma, this.profileAi, { userId: user.id, role: "TEACHER" }, assessmentId); }
  @Post("observations/:observationId/review") reviewObservation(@CurrentUser() user: AuthUser, @Param("observationId", new ParseUUIDPipe({ version: "4" })) observationId: string, @TypedBody(ReviewObservationDto) body: ReviewObservationDto) { return reviewObservationStatus(this.prisma, { userId: user.id, role: "TEACHER" }, { observationId, ...body }); }
}

@Controller("submissions") @UseGuards(SessionAuthGuard, StudentGuard)
export class StudentSubmissionsController {
  constructor(@Inject(PRISMA) private readonly prisma: EduLitPrisma) {}
  @Get(":submissionId") detail(@CurrentUser() user: AuthUser, @Param("submissionId", new ParseUUIDPipe({ version: "4" })) submissionId: string) { return getSubmission(this.prisma, { userId: user.id, role: "STUDENT" }, { submissionId }); }
}

@Controller("profile") @UseGuards(SessionAuthGuard, StudentGuard)
export class StudentProfileController {
  constructor(@Inject(PRISMA) private readonly prisma: EduLitPrisma) {}
  @Get() own(@CurrentUser() user: AuthUser) { return getOwnWritingProfile(this.prisma, { userId: user.id, role: "STUDENT" }); }
}
