import type { WritingObservationModelOutput } from "../../src/modules/writing-profile/domain/output.js";

export function observationOutputForText(
  text: string,
  overrides: Partial<WritingObservationModelOutput["observations"][number]> = {},
): WritingObservationModelOutput {
  const end = Math.min(18, text.length);
  const quote = text.slice(0, end);
  return {
    observations: [
      {
        traitId: "WORD_CHOICE",
        kind: "STYLE",
        description: "Bài có cụm từ cụ thể có thể quan sát trong đoạn nguồn.",
        evidence: { quote, start: 0, end },
        ...overrides,
      },
    ],
  };
}
