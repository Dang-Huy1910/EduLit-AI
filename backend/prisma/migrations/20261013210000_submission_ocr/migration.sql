CREATE TYPE "submission_source" AS ENUM ('LEGACY_TEXT', 'IMAGE_OCR');
CREATE TYPE "submission_draft_status" AS ENUM ('DRAFT', 'AWAITING_PRIVACY_REVIEW', 'PRIVACY_RETURNED', 'PRIVACY_APPROVED', 'OCR_PROCESSING', 'OCR_FAILED', 'OCR_REVIEW', 'CONFIRMED');
CREATE TYPE "ocr_revision_status" AS ENUM ('COMPLETED', 'CONFIRMED', 'SUPERSEDED');
CREATE TYPE "ocr_issue_status" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

ALTER TABLE "submissions" ADD COLUMN "source" "submission_source" NOT NULL DEFAULT 'LEGACY_TEXT';
ALTER TABLE "submissions" ADD COLUMN "source_draft_id" UUID;
CREATE UNIQUE INDEX "submissions_source_draft_id_key" ON "submissions"("source_draft_id");

CREATE TABLE "submission_drafts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "student_id" UUID NOT NULL, "assignment_id" UUID NOT NULL, "assignment_snapshot" JSONB NOT NULL,
  "status" "submission_draft_status" NOT NULL DEFAULT 'DRAFT', "revision" INTEGER NOT NULL DEFAULT 1,
  "privacy_reviewed_by_id" UUID, "privacy_reviewed_at" TIMESTAMPTZ(6), "privacy_return_reason" TEXT,
  "ocr_attempts" INTEGER NOT NULL DEFAULT 0, "ocr_lease_until" TIMESTAMPTZ(6), "ocr_lease_token" TEXT, "ocr_error_code" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "submission_drafts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "submission_drafts_student_id_assignment_id_key" UNIQUE ("student_id", "assignment_id"),
  CONSTRAINT "submission_drafts_revision_positive" CHECK ("revision" >= 1)
);
CREATE INDEX "submission_drafts_assignment_id_status_idx" ON "submission_drafts"("assignment_id", "status");

CREATE TABLE "submission_draft_pages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "draft_id" UUID NOT NULL, "page_index" INTEGER NOT NULL,
  "original_file_id" TEXT NOT NULL, "derivative_file_id" TEXT NOT NULL, "mime_type" TEXT NOT NULL, "content_hash" TEXT NOT NULL,
  "masks" JSONB NOT NULL DEFAULT '[]', "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "submission_draft_pages_pkey" PRIMARY KEY ("id"), CONSTRAINT "submission_draft_pages_draft_id_page_index_key" UNIQUE ("draft_id", "page_index"),
  CONSTRAINT "submission_draft_pages_index_positive" CHECK ("page_index" >= 0)
);
CREATE INDEX "submission_draft_pages_draft_id_idx" ON "submission_draft_pages"("draft_id");

CREATE TABLE "ocr_revisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "draft_id" UUID NOT NULL, "source_revision" INTEGER NOT NULL, "revision" INTEGER NOT NULL,
  "status" "ocr_revision_status" NOT NULL DEFAULT 'COMPLETED', "raw_pages" JSONB NOT NULL, "corrected_text" TEXT NOT NULL,
  "provider" TEXT, "model_name" TEXT, "prompt_version" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "ocr_revisions_pkey" PRIMARY KEY ("id"), CONSTRAINT "ocr_revisions_draft_id_revision_key" UNIQUE ("draft_id", "revision")
);
CREATE INDEX "ocr_revisions_draft_id_source_revision_idx" ON "ocr_revisions"("draft_id", "source_revision");

CREATE TABLE "ocr_issues" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "ocr_revision_id" UUID NOT NULL, "reporter_id" UUID NOT NULL, "page_id" UUID,
  "segment_id" TEXT, "reported_text" TEXT NOT NULL, "note" TEXT, "status" "ocr_issue_status" NOT NULL DEFAULT 'OPEN',
  "resolved_by_id" UUID, "resolved_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ocr_issues_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ocr_issues_ocr_revision_id_status_idx" ON "ocr_issues"("ocr_revision_id", "status");

ALTER TABLE "submissions" ADD CONSTRAINT "submissions_source_draft_id_fkey" FOREIGN KEY ("source_draft_id") REFERENCES "submission_drafts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "submission_drafts" ADD CONSTRAINT "submission_drafts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "submission_drafts" ADD CONSTRAINT "submission_drafts_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "submission_drafts" ADD CONSTRAINT "submission_drafts_privacy_reviewed_by_id_fkey" FOREIGN KEY ("privacy_reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "submission_draft_pages" ADD CONSTRAINT "submission_draft_pages_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "submission_drafts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ocr_revisions" ADD CONSTRAINT "ocr_revisions_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "submission_drafts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ocr_issues" ADD CONSTRAINT "ocr_issues_ocr_revision_id_fkey" FOREIGN KEY ("ocr_revision_id") REFERENCES "ocr_revisions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
