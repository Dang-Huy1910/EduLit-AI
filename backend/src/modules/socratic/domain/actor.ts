export type StudentActor = {
  userId: string;
  role: "STUDENT";
};

export function isStudentActor(value: unknown): value is StudentActor {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  return typeof row.userId === "string" && row.userId.length > 0 && row.role === "STUDENT";
}
