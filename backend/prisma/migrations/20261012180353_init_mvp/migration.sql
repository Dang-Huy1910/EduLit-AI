-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('TEACHER', 'STUDENT');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "assignment_status" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "socratic_session_status" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "chat_message_role" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "assessment_status" AS ENUM ('AI_DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "observation_kind" AS ENUM ('STRENGTH', 'WEAKNESS', 'STYLE');

-- CreateEnum
CREATE TYPE "observation_status" AS ENUM ('PROVISIONAL', 'SUPPORTED', 'RESOLVED', 'INVALIDATED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "login_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "teacher_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "grade_level" INTEGER NOT NULL,
    "learning_material_text" TEXT NOT NULL,
    "rubric" JSONB NOT NULL,
    "max_score" DECIMAL(8,2) NOT NULL,
    "score_step" DECIMAL(8,2) NOT NULL,
    "status" "assignment_status" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMPTZ(6),
    "due_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "socratic_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "context_snapshot" JSONB NOT NULL,
    "outline" JSONB NOT NULL,
    "status" "socratic_session_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "socratic_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "role" "chat_message_role" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "socratic_session_id" UUID,
    "text" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "assignment_snapshot" JSONB NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "submission_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "rubric_snapshot" JSONB NOT NULL,
    "detailed_evaluations" JSONB NOT NULL,
    "total_score" DECIMAL(8,2) NOT NULL,
    "max_score" DECIMAL(8,2) NOT NULL,
    "status" "assessment_status" NOT NULL DEFAULT 'AI_DRAFT',
    "model_name" TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    "prompt_version" TEXT NOT NULL,
    "assessed_at" TIMESTAMPTZ(6) NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "writing_observations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "kind" "observation_kind" NOT NULL,
    "feature_key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "evidence_quote" TEXT NOT NULL,
    "evidence_start" INTEGER NOT NULL,
    "evidence_end" INTEGER NOT NULL,
    "status" "observation_status" NOT NULL DEFAULT 'PROVISIONAL',
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "writing_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "writing_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "student_id" UUID NOT NULL,
    "declared_goals" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "observation_ids" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "writing_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_login_id_key" ON "users"("login_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_code_key" ON "assignments"("code");

-- CreateIndex
CREATE INDEX "assignments_teacher_id_idx" ON "assignments"("teacher_id");

-- CreateIndex
CREATE INDEX "assignments_status_idx" ON "assignments"("status");

-- CreateIndex
CREATE INDEX "socratic_sessions_assignment_id_idx" ON "socratic_sessions"("assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "socratic_sessions_student_id_assignment_id_key" ON "socratic_sessions"("student_id", "assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "socratic_sessions_id_student_id_assignment_id_key" ON "socratic_sessions"("id", "student_id", "assignment_id");

-- CreateIndex
CREATE INDEX "chat_messages_session_id_idx" ON "chat_messages"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_session_id_sequence_key" ON "chat_messages"("session_id", "sequence");

-- CreateIndex
CREATE INDEX "submissions_assignment_id_idx" ON "submissions"("assignment_id");

-- CreateIndex
CREATE INDEX "submissions_socratic_session_id_idx" ON "submissions"("socratic_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_student_id_assignment_id_key" ON "submissions"("student_id", "assignment_id");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_id_student_id_key" ON "submissions"("id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessments_submission_id_key" ON "assessments"("submission_id");

-- CreateIndex
CREATE INDEX "assessments_student_id_idx" ON "assessments"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessments_id_student_id_key" ON "assessments"("id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessments_submission_id_student_id_key" ON "assessments"("submission_id", "student_id");

-- CreateIndex
CREATE INDEX "writing_observations_student_id_observed_at_idx" ON "writing_observations"("student_id", "observed_at");

-- CreateIndex
CREATE INDEX "writing_observations_assessment_id_idx" ON "writing_observations"("assessment_id");

-- CreateIndex
CREATE UNIQUE INDEX "writing_observations_student_id_assessment_id_feature_key_key" ON "writing_observations"("student_id", "assessment_id", "feature_key");

-- CreateIndex
CREATE UNIQUE INDEX "writing_profiles_student_id_key" ON "writing_profiles"("student_id");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "socratic_sessions" ADD CONSTRAINT "socratic_sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "socratic_sessions" ADD CONSTRAINT "socratic_sessions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "socratic_sessions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_socratic_session_id_student_id_assignment_id_fkey" FOREIGN KEY ("socratic_session_id", "student_id", "assignment_id") REFERENCES "socratic_sessions"("id", "student_id", "assignment_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_submission_id_student_id_fkey" FOREIGN KEY ("submission_id", "student_id") REFERENCES "submissions"("id", "student_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "writing_observations" ADD CONSTRAINT "writing_observations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "writing_observations" ADD CONSTRAINT "writing_observations_assessment_id_student_id_fkey" FOREIGN KEY ("assessment_id", "student_id") REFERENCES "assessments"("id", "student_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "writing_profiles" ADD CONSTRAINT "writing_profiles_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Simple CHECKs that Prisma schema cannot express in 7.10
ALTER TABLE "auth_sessions"
  ADD CONSTRAINT "auth_sessions_expiry_after_create"
  CHECK ("expires_at" > "created_at");

ALTER TABLE "assignments"
  ADD CONSTRAINT "assignments_grade_level_check"
  CHECK ("grade_level" >= 10 AND "grade_level" <= 12);

ALTER TABLE "assignments"
  ADD CONSTRAINT "assignments_max_score_positive"
  CHECK ("max_score" > 0);

ALTER TABLE "assignments"
  ADD CONSTRAINT "assignments_score_step_positive"
  CHECK ("score_step" > 0);

ALTER TABLE "assignments"
  ADD CONSTRAINT "assignments_published_at_required"
  CHECK ("status" <> 'PUBLISHED' OR "published_at" IS NOT NULL);

ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_sequence_nonneg"
  CHECK ("sequence" >= 0);

ALTER TABLE "assessments"
  ADD CONSTRAINT "assessments_total_score_nonneg"
  CHECK ("total_score" >= 0);

ALTER TABLE "assessments"
  ADD CONSTRAINT "assessments_max_score_positive"
  CHECK ("max_score" > 0);

ALTER TABLE "assessments"
  ADD CONSTRAINT "assessments_published_at_required"
  CHECK ("status" <> 'PUBLISHED' OR "published_at" IS NOT NULL);

ALTER TABLE "writing_observations"
  ADD CONSTRAINT "writing_observations_offsets_check"
  CHECK ("evidence_start" >= 0 AND "evidence_end" > "evidence_start");

ALTER TABLE "writing_profiles"
  ADD CONSTRAINT "writing_profiles_version_positive"
  CHECK ("version" >= 1);
