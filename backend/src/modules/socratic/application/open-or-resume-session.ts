import { randomUUID } from "node:crypto";
import { Prisma } from "../../../generated/prisma/client.js";
import { DomainError } from "../../../core/errors.js";
import type { SocraticAiPort } from "../../../infrastructure/ai/socratic-ai.port.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import { buildAssignmentSnapshot } from "../../assignments/domain/snapshot.js";
import { emptyOutline, isBlankOutline } from "../domain/outline.js";
import { socraticMessageId } from "../domain/message-ids.js";
import { SCAFFOLD_INIT_REQUEST_ID } from "../domain/output.js";
import type { StudentActor } from "../domain/actor.js";
import { assertActiveStudentActor } from "./assert-student-actor.js";
import { fallbackScaffold, generateScaffold } from "./generate-scaffold.js";
import { getSocraticSession, type SocraticSessionView } from "./get-socratic-session.js";
import { persistScaffoldInit } from "./persist-scaffold.js";
import { loadOwnedSession, lockStudentThenAssignment } from "./session-access.js";

export type OpenOrResumeSocraticSessionInput = {
  actor: StudentActor;
  assignmentId: string;
  ai?: SocraticAiPort;
};

export async function openOrResumeSocraticSession(
  prisma: EduLitPrisma,
  input: OpenOrResumeSocraticSessionInput,
): Promise<SocraticSessionView & { resumed: boolean }> {
  const actor = await assertActiveStudentActor(prisma, input.actor);
  const assignment = await prisma.assignment.findUnique({ where: { id: input.assignmentId } });
  if (!assignment) {
    throw new DomainError("SESSION_ASSIGNMENT", "assignment not found");
  }

  const existing = await prisma.socraticSession.findUnique({
    where: {
      studentId_assignmentId: { studentId: actor.id, assignmentId: assignment.id },
    },
  });
  if (existing) {
    if (input.ai) {
      await maybeAttachScaffold(prisma, input.ai, actor.id, existing.id);
    }
    const view = await getSocraticSession(prisma, { actor: input.actor, sessionId: existing.id });
    return { ...view, resumed: true };
  }
  if (assignment.status !== "PUBLISHED") {
    throw new DomainError("SESSION_ASSIGNMENT", "only PUBLISHED assignments can open a socratic session");
  }

  const contextSnapshot = buildAssignmentSnapshot(assignment, new Date());
  const scaffold = input.ai ? await generateScaffold(input.ai, contextSnapshot) : null;
  const sessionId = randomUUID();
  try {
    await prisma.$transaction(async (tx) => {
      await lockStudentThenAssignment(tx, actor.id, assignment.id);
      const current = await tx.assignment.findUniqueOrThrow({ where: { id: assignment.id } });
      if (current.status !== "PUBLISHED") {
        throw new DomainError("SESSION_ASSIGNMENT", "assignment closed while the session scaffold was generated");
      }
      if (current.updatedAt.getTime() !== assignment.updatedAt.getTime()) {
        throw new DomainError("TURN_CONFLICT", "assignment changed while the session scaffold was generated");
      }
      const submitted = await tx.submission.findUnique({
        where: { studentId_assignmentId: { studentId: actor.id, assignmentId: assignment.id } },
      });
      if (submitted) throw new DomainError("SESSION_SUBMITTED", "submitted assignments do not accept a socratic session");
      await tx.socraticSession.create({
        data: {
          id: sessionId,
          studentId: actor.id,
          assignmentId: assignment.id,
          contextSnapshot: contextSnapshot as Prisma.InputJsonValue,
          outline: (scaffold?.outline ?? emptyOutline()) as Prisma.InputJsonValue,
          outlineRevision: scaffold ? 2 : 1,
          status: "ACTIVE",
          ...(scaffold ? {
            messages: { create: [{
              id: socraticMessageId(sessionId, SCAFFOLD_INIT_REQUEST_ID, "ASSISTANT"),
              sequence: 1,
              role: "ASSISTANT",
              content: scaffold.welcomeText,
              requestId: SCAFFOLD_INIT_REQUEST_ID,
              provider: scaffold.provider,
              modelName: scaffold.modelName,
              promptVersion: scaffold.promptVersion,
              responseMode: scaffold.responseMode,
            }] },
          } : {}),
        },
      });
    });
    const view = await getSocraticSession(prisma, { actor: input.actor, sessionId });
    return { ...view, resumed: false };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const raced = await prisma.socraticSession.findUnique({
        where: {
          studentId_assignmentId: { studentId: actor.id, assignmentId: assignment.id },
        },
      });
      if (!raced) {
        throw error;
      }
      if (input.ai) {
        await maybeAttachScaffold(prisma, input.ai, actor.id, raced.id);
      }
      const view = await getSocraticSession(prisma, { actor: input.actor, sessionId: raced.id });
      return { ...view, resumed: true };
    }
    throw error;
  }
}

async function maybeAttachScaffold(
  prisma: EduLitPrisma,
  ai: SocraticAiPort,
  studentId: string,
  sessionId: string,
): Promise<void> {
  const loaded = await loadOwnedSession(prisma, studentId, sessionId);
  if (loaded.status !== "ACTIVE" || loaded.hasSubmission || loaded.assignmentStatus === "CLOSED") {
    return;
  }
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId: loaded.id },
    orderBy: { sequence: "asc" },
    take: 1,
  });
  if (messages.length > 0) return;
  const blank = isBlankOutline(loaded.outline);
  if (!blank) {
    const scaffold = fallbackScaffold(loaded.snapshot);
    await persistScaffoldInit(prisma, {
      sessionId: loaded.id,
      studentId,
      assignmentId: loaded.assignmentId,
      outline: loaded.outline,
      welcomeText: scaffold.welcomeText,
      expectedOutlineRevision: loaded.outlineRevision,
      provider: scaffold.provider,
      modelName: scaffold.modelName,
      promptVersion: scaffold.promptVersion,
      responseMode: scaffold.responseMode,
    });
    return;
  }
  if (blank && messages.length === 0) {
    const scaffold = await generateScaffold(ai, loaded.snapshot);
    await persistScaffoldInit(prisma, {
      sessionId: loaded.id,
      studentId,
      assignmentId: loaded.assignmentId,
      outline: scaffold.outline,
      welcomeText: scaffold.welcomeText,
      expectedOutlineRevision: loaded.outlineRevision,
      provider: scaffold.provider,
      modelName: scaffold.modelName,
      promptVersion: scaffold.promptVersion,
      responseMode: scaffold.responseMode,
    });
  }
}
