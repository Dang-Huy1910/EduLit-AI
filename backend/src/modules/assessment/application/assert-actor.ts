import { DomainError } from "../../../core/errors.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import { isAssessmentActor, type AssessmentActor } from "../domain/actor.js";

export type ActiveUser = {
  id: string;
  role: "STUDENT" | "TEACHER";
  status: "ACTIVE";
};

export async function assertActiveActor(
  prisma: EduLitPrisma,
  actor: AssessmentActor,
  expectedRole?: "STUDENT" | "TEACHER",
): Promise<ActiveUser> {
  if (!isAssessmentActor(actor)) {
    throw new DomainError("ACTOR_INVALID", "actor must be an authenticated user with userId and role");
  }
  const user = await prisma.user.findUnique({ where: { id: actor.userId } });
  if (!user) {
    throw new DomainError("ACTOR_INVALID", "authenticated user does not exist");
  }
  if (user.role !== actor.role) {
    throw new DomainError("ACTOR_FORBIDDEN", "actor role does not match the authenticated user");
  }
  if (expectedRole && user.role !== expectedRole) {
    throw new DomainError("ACTOR_FORBIDDEN", `only ${expectedRole} actors may perform this action`);
  }
  if (user.status !== "ACTIVE") {
    throw new DomainError("ACTOR_INACTIVE", "account is INACTIVE");
  }
  return { id: user.id, role: user.role, status: "ACTIVE" };
}
