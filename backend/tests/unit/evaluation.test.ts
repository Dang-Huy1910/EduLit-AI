import assert from "node:assert/strict";
import { test } from "node:test";
import { DomainError } from "../../src/core/errors.js";
import { uniqueOffsetsForQuote } from "../../src/core/utf16.js";
import { validateAssessmentScores } from "../../src/modules/assessment/domain/evaluation.js";
import { parseAssessmentModelOutput } from "../../src/modules/assessment/application/validate-assessment-output.js";
import type { AssignmentSnapshot } from "../../src/modules/assignments/domain/rubric.js";

const rubric = {
  criteria: [
    { criterionId: "C1", name: "Bố cục", weight: "4.00" },
    { criterionId: "C2", name: "Luận điểm", weight: "6.00" },
  ],
};

test("accepts scores that follow scoreStep and sum to totalScore", () => {
  const result = validateAssessmentScores({
    rubric,
    maxScore: "10.00",
    scoreStep: "0.25",
    evaluations: [
      { criterionId: "C1", awardedScore: "3.25" },
      { criterionId: "C2", awardedScore: "5.00" },
    ],
    totalScore: "8.25",
  });
  assert.equal(result.totalScore, "8.25");
});

test("rejects out-of-range, wrong total, unknown criterion and mismatched snapshot totals", () => {
  assert.throws(
    () =>
      validateAssessmentScores({
        rubric,
        maxScore: "10.00",
        scoreStep: "0.25",
        evaluations: [
          { criterionId: "C1", awardedScore: "5.00" },
          { criterionId: "C2", awardedScore: "1.00" },
        ],
        totalScore: "6.00",
      }),
    DomainError,
  );
  assert.throws(
    () =>
      validateAssessmentScores({
        rubric,
        maxScore: "10.00",
        scoreStep: "0.25",
        evaluations: [
          { criterionId: "C1", awardedScore: "2.00" },
          { criterionId: "C2", awardedScore: "2.00" },
        ],
        totalScore: "5.00",
      }),
    (error: unknown) => error instanceof DomainError && error.code === "EVALUATION_TOTAL",
  );
  assert.throws(
    () =>
      validateAssessmentScores({
        rubric,
        maxScore: "10.00",
        scoreStep: "0.25",
        evaluations: [
          { criterionId: "C1", awardedScore: "2.00" },
          { criterionId: "CX", awardedScore: "2.00" },
        ],
        totalScore: "4.00",
      }),
    DomainError,
  );
});

const snapshot: AssignmentSnapshot = {
  assignmentId: "a1",
  code: "T",
  title: "Đề",
  instructions: "Viết",
  genre: "NLXH",
  gradeLevel: 12,
  learningMaterialText: "Ngữ liệu",
  rubric,
  maxScore: "10.00",
  scoreStep: "0.25",
  status: "PUBLISHED",
  publishedAt: null,
  dueAt: null,
  snapshottedAt: "2026-10-13T00:00:00.000Z",
};

test("keeps evidence and missingElements and checks UTF-16 quotes", () => {
  const text = "Kiên định không phải là bảo thủ 👍.";
  const quote = "không phải là bảo thủ";
  const { start, end } = uniqueOffsetsForQuote(text, quote);
  const result = validateAssessmentScores({
    rubric,
    maxScore: "10.00",
    scoreStep: "0.25",
    evaluations: [
      {
        criterionId: "C1",
        awardedScore: "3.00",
        comment: "Có phân biệt",
        strengths: ["Có câu chốt"],
        weaknesses: [],
        evidence: [{ quote, start, end }],
        missingElements: [],
      },
      {
        criterionId: "C2",
        awardedScore: "0.00",
        comment: "Thiếu dẫn chứng lớp",
        strengths: [],
        weaknesses: ["Thiếu dẫn chứng"],
        evidence: [],
        missingElements: ["dẫn chứng từ tình huống lớp học"],
      },
    ],
    totalScore: "3.00",
    submissionText: text,
    requireEvidenceContract: true,
  });
  assert.equal(result.evaluations[0]?.evidence?.[0]?.quote, quote);
  assert.deepEqual(result.evaluations[1]?.missingElements, ["dẫn chứng từ tình huống lớp học"]);
});

test("rejects invented quote, mismatched offsets, and combining-mark / emoji coordinate errors", () => {
  const text = "Cảm ơn 👍 rất rõ.";
  assert.throws(
    () =>
      validateAssessmentScores({
        rubric,
        maxScore: "10.00",
        scoreStep: "0.25",
        evaluations: [
          {
            criterionId: "C1",
            awardedScore: "1.00",
            comment: "x",
            strengths: [],
            weaknesses: [],
            evidence: [{ quote: "không có trong bài", start: 0, end: 4 }],
            missingElements: [],
          },
          {
            criterionId: "C2",
            awardedScore: "0.00",
            comment: "x",
            strengths: [],
            weaknesses: [],
            evidence: [],
            missingElements: ["ý"],
          },
        ],
        totalScore: "1.00",
        submissionText: text,
        requireEvidenceContract: true,
      }),
    (error: unknown) => error instanceof DomainError && error.code === "EVIDENCE_QUOTE_MISMATCH",
  );
  const thumbs = "👍";
  const start = text.indexOf(thumbs);
  assert.equal(thumbs.length, 2);
  assert.throws(
    () =>
      validateAssessmentScores({
        rubric,
        maxScore: "10.00",
        scoreStep: "0.25",
        evaluations: [
          {
            criterionId: "C1",
            awardedScore: "1.00",
            comment: "x",
            strengths: [],
            weaknesses: [],
            evidence: [{ quote: thumbs, start, end: start + 1 }],
            missingElements: [],
          },
          {
            criterionId: "C2",
            awardedScore: "0.00",
            comment: "x",
            strengths: [],
            weaknesses: [],
            evidence: [],
            missingElements: ["ý"],
          },
        ],
        totalScore: "1.00",
        submissionText: text,
        requireEvidenceContract: true,
      }),
    DomainError,
  );
});

test("absent element may have empty evidence; positive score without evidence is rejected", () => {
  const text = "Chỉ có nhận định chung.";
  assert.throws(
    () =>
      validateAssessmentScores({
        rubric,
        maxScore: "10.00",
        scoreStep: "0.25",
        evaluations: [
          {
            criterionId: "C1",
            awardedScore: "2.00",
            comment: "Có bố cục",
            strengths: ["x"],
            weaknesses: [],
            evidence: [],
            missingElements: [],
          },
          {
            criterionId: "C2",
            awardedScore: "0.00",
            comment: "Thiếu",
            strengths: [],
            weaknesses: [],
            evidence: [],
            missingElements: ["dẫn chứng"],
          },
        ],
        totalScore: "2.00",
        submissionText: text,
        requireEvidenceContract: true,
      }),
    (error: unknown) => error instanceof DomainError && error.code === "EVALUATION_EVIDENCE",
  );
});

test("repeated quote is not auto-resolved to the first occurrence", () => {
  const text = "kiên định rồi lại kiên định.";
  const quote = "kiên định";
  assert.throws(() => uniqueOffsetsForQuote(text, quote), (error: unknown) => {
    return error instanceof DomainError && error.code === "EVIDENCE_QUOTE_AMBIGUOUS";
  });
  const second = text.lastIndexOf(quote);
  const result = validateAssessmentScores({
    rubric,
    maxScore: "10.00",
    scoreStep: "0.25",
    evaluations: [
      {
        criterionId: "C1",
        awardedScore: "1.00",
        comment: "Lặp ý",
        strengths: [],
        weaknesses: ["Lặp"],
        evidence: [{ quote, start: second, end: second + quote.length }],
        missingElements: [],
      },
      {
        criterionId: "C2",
        awardedScore: "0.00",
        comment: "Thiếu",
        strengths: [],
        weaknesses: [],
        evidence: [],
        missingElements: ["dẫn chứng"],
      },
    ],
    totalScore: "1.00",
    submissionText: text,
    requireEvidenceContract: true,
  });
  assert.equal(result.evaluations[0]?.evidence?.[0]?.start, second);
});

test("schema rejects truncated objects and status-like extra fields from the model", () => {
  assert.throws(
    () => parseAssessmentModelOutput({ detailedEvaluations: [] }, snapshot, "abc"),
    (error: unknown) => error instanceof DomainError && error.code === "AI_INVALID_OUTPUT",
  );
  assert.throws(
    () =>
      parseAssessmentModelOutput(
        {
          detailedEvaluations: [
            {
              criterionId: "C1",
              awardedScore: "1.00",
              comment: "x",
              strengths: [],
              weaknesses: [],
              evidence: [{ quote: "abc", start: 0, end: 3 }],
              missingElements: [],
              status: "PUBLISHED",
            },
            {
              criterionId: "C2",
              awardedScore: "0.00",
              comment: "x",
              strengths: [],
              weaknesses: [],
              evidence: [],
              missingElements: ["ý"],
            },
          ],
          totalScore: "1.00",
        },
        snapshot,
        "abc",
      ),
    (error: unknown) => error instanceof DomainError && error.code === "AI_INVALID_OUTPUT",
  );
});
