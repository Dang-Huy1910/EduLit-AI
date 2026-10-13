import type { AssignmentSnapshot } from "../../assignments/domain/rubric.js";

export type ScoringSnapshot = Pick<
  AssignmentSnapshot,
  | "code"
  | "title"
  | "instructions"
  | "genre"
  | "gradeLevel"
  | "learningMaterialText"
  | "rubric"
  | "maxScore"
  | "scoreStep"
>;

export type ScoringInput = {
  submissionText: string;
  assignmentSnapshot: ScoringSnapshot;
};

export function scoringSnapshotFrom(snapshot: AssignmentSnapshot): ScoringSnapshot {
  return {
    code: snapshot.code,
    title: snapshot.title,
    instructions: snapshot.instructions,
    genre: snapshot.genre,
    gradeLevel: snapshot.gradeLevel,
    learningMaterialText: snapshot.learningMaterialText,
    rubric: snapshot.rubric,
    maxScore: snapshot.maxScore,
    scoreStep: snapshot.scoreStep,
  };
}
