-- Metadata for Socratic turns: outline optimistic version and replay key.
-- Existing chat_messages keep request_id NULL (seed/legacy). PostgreSQL UNIQUE
-- allows multiple NULLs, so seed rows remain valid.

ALTER TABLE "socratic_sessions"
  ADD COLUMN "outline_revision" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "socratic_sessions"
  ADD CONSTRAINT "socratic_sessions_outline_revision_positive"
  CHECK ("outline_revision" >= 1);

ALTER TABLE "chat_messages"
  ADD COLUMN "request_id" TEXT;

CREATE UNIQUE INDEX "chat_messages_session_id_request_id_role_key"
  ON "chat_messages"("session_id", "request_id", "role");
