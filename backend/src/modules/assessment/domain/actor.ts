export type AssessmentActor = {
  userId: string;
  role: "STUDENT" | "TEACHER";
};

export function isAssessmentActor(value: unknown): value is AssessmentActor {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.userId === "string" &&
    row.userId.length > 0 &&
    (row.role === "STUDENT" || row.role === "TEACHER")
  );
}
