CREATE TABLE "assignment_progress" (
  "student_id" UUID NOT NULL,
  "assignment_id" UUID NOT NULL,
  "read_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "assignment_progress_pkey" PRIMARY KEY ("student_id", "assignment_id")
);

CREATE INDEX "assignment_progress_assignment_id_idx" ON "assignment_progress"("assignment_id");

ALTER TABLE "assignment_progress"
  ADD CONSTRAINT "assignment_progress_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "assignment_progress"
  ADD CONSTRAINT "assignment_progress_assignment_id_fkey"
  FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
