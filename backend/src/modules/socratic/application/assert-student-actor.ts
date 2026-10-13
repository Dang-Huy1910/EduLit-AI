import { DomainError } from "../../../core/errors.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import { isStudentActor, type StudentActor } from "../domain/actor.js";

export async function assertActiveStudentActor(
  prisma: EduLitPrisma,
  actor: StudentActor,
): Promise<{ id: string; role: "STUDENT"; status: "ACTIVE" }> {
  if (!isStudentActor(actor)) {
    throw new DomainError("ACTOR_INVALID", "actor must be an authenticated STUDENT with userId");
  }
  const user = await prisma.user.findUnique({ where: { id: actor.userId } });
  if (!user) {
    throw new DomainError("ACTOR_INVALID", "authenticated user does not exist");
  }
  if (user.role !== "STUDENT") {
    throw new DomainError("ACTOR_FORBIDDEN", "only STUDENT actors may use socratic coaching");
  }
  if (user.status !== "ACTIVE") {
    throw new DomainError("ACTOR_INACTIVE", "student account is INACTIVE");
  }
  return { id: user.id, role: "STUDENT", status: "ACTIVE" };
}
