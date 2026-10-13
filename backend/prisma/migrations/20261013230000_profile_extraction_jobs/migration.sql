CREATE TYPE "profile_extraction_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "profile_extraction_jobs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "assessment_id" UUID NOT NULL,
  "status" "profile_extraction_status" NOT NULL DEFAULT 'PENDING', "attempts" INTEGER NOT NULL DEFAULT 0,
  "lease_until" TIMESTAMPTZ(6), "lease_token" TEXT, "error_code" TEXT, "no_observations" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "profile_extraction_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "profile_extraction_jobs_assessment_id_key" UNIQUE ("assessment_id"),
  CONSTRAINT "profile_extraction_jobs_attempts_nonnegative" CHECK ("attempts" >= 0)
);
CREATE INDEX "profile_extraction_jobs_status_lease_until_idx" ON "profile_extraction_jobs"("status", "lease_until");
ALTER TABLE "profile_extraction_jobs" ADD CONSTRAINT "profile_extraction_jobs_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
