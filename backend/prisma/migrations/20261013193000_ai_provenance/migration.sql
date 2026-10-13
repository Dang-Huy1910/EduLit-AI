-- Keep historical source unknown rather than inventing the currently configured model.
ALTER TABLE "assessments"
  ALTER COLUMN "model_name" DROP DEFAULT,
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "response_mode" TEXT;

ALTER TABLE "chat_messages"
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "model_name" TEXT,
  ADD COLUMN "prompt_version" TEXT,
  ADD COLUMN "response_mode" TEXT;

ALTER TABLE "writing_observations"
  ADD COLUMN "provider" TEXT,
  ADD COLUMN "model_name" TEXT,
  ADD COLUMN "prompt_version" TEXT;
