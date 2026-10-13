import { Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Post, Put, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import "multer";
import { PRISMA } from "../../../infrastructure/database/database.provider.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { PrivateStoragePort } from "../../../infrastructure/storage/private-storage.port.js";
import { PRIVATE_STORAGE, HTTP_CONFIG, type HttpConfig } from "../../../http/config.js";
import { CurrentUser, StudentGuard, type AuthUser } from "../../../http/auth-user.js";
import { SessionAuthGuard } from "../../../http/session.guard.js";
import { TypedBody } from "../../../http/dto-validation.js";
import { DomainError } from "../../../core/errors.js";
import { deleteDraftPage, getStudentDraft, openSubmissionDraft, reorderDraftPages, reportOcrIssue, requestPrivacyReview, updatePageMasks, uploadDraftPage } from "../application/ocr-workflow.js";
import { MasksDto, OcrIssueDto, OpenDraftDto, PageOrderDto, RevisionDto } from "./submission-drafts.dto.js";

@Controller("submission-drafts") @UseGuards(SessionAuthGuard, StudentGuard)
export class SubmissionDraftsController {
  constructor(@Inject(PRISMA) private readonly prisma: EduLitPrisma, @Inject(PRIVATE_STORAGE) private readonly storage: PrivateStoragePort, @Inject(HTTP_CONFIG) private readonly config: HttpConfig) {}
  @Post() open(@CurrentUser() user: AuthUser, @TypedBody(OpenDraftDto) body: OpenDraftDto) { return openSubmissionDraft(this.prisma, user.id, body.assignmentId); }
  @Get(":draftId") get(@CurrentUser() user: AuthUser, @Param("draftId", new ParseUUIDPipe({ version: "4" })) draftId: string) { return getStudentDraft(this.prisma, user.id, draftId); }
  @Post(":draftId/pages") @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 25 * 1024 * 1024, files: 1 } }))
  upload(@CurrentUser() user: AuthUser, @Param("draftId", new ParseUUIDPipe({ version: "4" })) draftId: string, @UploadedFile() file: Express.Multer.File | undefined, @TypedBody(RevisionDto) body: RevisionDto) {
    if (!file) throw new DomainError("UPLOAD_MEDIA", "an image file is required"); if (file.size > this.config.uploadMaxBytes) throw new DomainError("UPLOAD_LIMIT", "upload exceeds configured per-page limit");
    return uploadDraftPage(this.prisma, this.storage, { studentId: user.id, draftId, expectedRevision: body.expectedRevision, data: file.buffer, mimeType: file.mimetype, originalName: file.originalname, maxBytes: this.config.uploadMaxBytes, maxTotalBytes: this.config.uploadMaxTotalBytes, maxPixels: this.config.uploadMaxPixels });
  }
  @Delete(":draftId/pages/:pageId") removePage(@CurrentUser() user: AuthUser, @Param("draftId", new ParseUUIDPipe({ version: "4" })) draftId: string, @Param("pageId", new ParseUUIDPipe({ version: "4" })) pageId: string, @TypedBody(RevisionDto) body: RevisionDto) { return deleteDraftPage(this.prisma, this.storage, { studentId: user.id, draftId, pageId, expectedRevision: body.expectedRevision }); }
  @Put(":draftId/pages/order") reorder(@CurrentUser() user: AuthUser, @Param("draftId", new ParseUUIDPipe({ version: "4" })) draftId: string, @TypedBody(PageOrderDto) body: PageOrderDto) { return reorderDraftPages(this.prisma, { studentId: user.id, draftId, expectedRevision: body.expectedRevision, pageIds: body.pageIds }); }
  @Put(":draftId/pages/:pageId/masks") masks(@CurrentUser() user: AuthUser, @Param("draftId", new ParseUUIDPipe({ version: "4" })) draftId: string, @Param("pageId", new ParseUUIDPipe({ version: "4" })) pageId: string, @TypedBody(MasksDto) body: MasksDto) { return updatePageMasks(this.prisma, this.storage, { studentId: user.id, draftId, pageId, expectedRevision: body.expectedRevision, masks: body.masks }); }
  @Post(":draftId/privacy-review") requestReview(@CurrentUser() user: AuthUser, @Param("draftId", new ParseUUIDPipe({ version: "4" })) draftId: string, @TypedBody(RevisionDto) body: RevisionDto) { return requestPrivacyReview(this.prisma, user.id, draftId, body.expectedRevision); }
  @Post(":draftId/ocr-issues") issue(@CurrentUser() user: AuthUser, @Param("draftId", new ParseUUIDPipe({ version: "4" })) draftId: string, @TypedBody(OcrIssueDto) body: OcrIssueDto) { return reportOcrIssue(this.prisma, user.id, { draftId, ...body }); }
}
