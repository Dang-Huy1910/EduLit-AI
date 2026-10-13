import { Controller, Get, Inject, Param, ParseUUIDPipe, Post, UseGuards } from "@nestjs/common";
import { PRISMA } from "../../../infrastructure/database/database.provider.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { PrivateStoragePort } from "../../../infrastructure/storage/private-storage.port.js";
import type { VisionTranscriptionPort } from "../../../infrastructure/vision/vision-transcription.port.js";
import { PRIVATE_STORAGE, VISION_AI } from "../../../http/config.js";
import { CurrentUser, TeacherGuard, type AuthUser } from "../../../http/auth-user.js";
import { SessionAuthGuard } from "../../../http/session.guard.js";
import { TypedBody } from "../../../http/dto-validation.js";
import { confirmOcrSubmission, correctOcrText, listTeacherSubmissionDrafts, reviewPrivacy, runOcr } from "../application/ocr-workflow.js";
import { ConfirmOcrDto, CorrectOcrDto, PrivacyReviewDto } from "./submission-drafts.dto.js";

@Controller("teacher") @UseGuards(SessionAuthGuard, TeacherGuard)
export class TeacherOcrController {
  constructor(@Inject(PRISMA) private readonly prisma: EduLitPrisma, @Inject(PRIVATE_STORAGE) private readonly storage: PrivateStoragePort, @Inject(VISION_AI) private readonly vision: VisionTranscriptionPort) {}
  @Get("assignments/:assignmentId/submission-drafts") list(@CurrentUser() user: AuthUser, @Param("assignmentId", new ParseUUIDPipe({ version: "4" })) assignmentId: string) { return listTeacherSubmissionDrafts(this.prisma, user.id, assignmentId); }
  @Post("submission-drafts/:draftId/privacy-review") privacy(@CurrentUser() user: AuthUser, @Param("draftId", new ParseUUIDPipe({ version: "4" })) draftId: string, @TypedBody(PrivacyReviewDto) body: PrivacyReviewDto) { return reviewPrivacy(this.prisma, user.id, draftId, body.approve, body.reason); }
  @Post("submission-drafts/:draftId/ocr") ocr(@CurrentUser() user: AuthUser, @Param("draftId", new ParseUUIDPipe({ version: "4" })) draftId: string) { return runOcr(this.prisma, this.storage, this.vision, user.id, draftId); }
  @Post("submission-drafts/:draftId/ocr/correct") correct(@CurrentUser() user: AuthUser, @Param("draftId", new ParseUUIDPipe({ version: "4" })) draftId: string, @TypedBody(CorrectOcrDto) body: CorrectOcrDto) { return correctOcrText(this.prisma, user.id, { draftId, ...body }); }
  @Post("submission-drafts/:draftId/ocr/confirm") confirm(@CurrentUser() user: AuthUser, @Param("draftId", new ParseUUIDPipe({ version: "4" })) draftId: string, @TypedBody(ConfirmOcrDto) body: ConfirmOcrDto) { return confirmOcrSubmission(this.prisma, user.id, { draftId, ...body }); }
}
