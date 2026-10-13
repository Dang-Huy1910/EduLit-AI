ALTER TABLE "assessments" ADD COLUMN "ai_detailed_evaluations" JSONB;
ALTER TABLE "assessments" ADD COLUMN "ai_total_score" DECIMAL(8,2);
ALTER TABLE "assessments" ADD COLUMN "reviewed_by_id" UUID;
ALTER TABLE "assessments" ADD COLUMN "reviewed_at" TIMESTAMPTZ(6);
ALTER TABLE "assessments" ADD COLUMN "review_reason" TEXT;
ALTER TABLE "assessments" ADD COLUMN "review_revision" INTEGER NOT NULL DEFAULT 0;

UPDATE "assessments"
SET "ai_detailed_evaluations" = "detailed_evaluations", "ai_total_score" = "total_score"
WHERE "ai_detailed_evaluations" IS NULL;

ALTER TABLE "assessments" ADD CONSTRAINT "assessments_review_revision_nonnegative" CHECK ("review_revision" >= 0);
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
