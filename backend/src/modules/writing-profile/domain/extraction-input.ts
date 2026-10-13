export type ExtractionInput = {
  submissionText: string;
  contentHash: string;
  genre: string;
  gradeLevel: number;
  assignmentTitle: string;
  assignmentInstructions: string;
  publishedFeedback: {
    totalScore: string;
    maxScore: string;
    detailedEvaluations: unknown;
  };
};

export function assertExtractionInputIsolated(input: ExtractionInput): void {
  const allowed = new Set([
    "submissionText",
    "contentHash",
    "genre",
    "gradeLevel",
    "assignmentTitle",
    "assignmentInstructions",
    "publishedFeedback",
  ]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) {
      throw new Error(`extraction input must not include ${key}`);
    }
  }
}
