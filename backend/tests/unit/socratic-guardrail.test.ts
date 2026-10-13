import assert from "node:assert/strict";
import { test } from "node:test";
import { inspectSocraticOutput } from "../../src/modules/socratic/application/guardrails/validate-socratic-output.js";
import { fallbackSocraticOutput, writeForStudentRefusalOutput } from "../../src/modules/socratic/application/guardrails/fallback.js";
import { splitSentences } from "../../src/modules/socratic/application/guardrails/sentences.js";
import { looksLikeWriteForStudentRequest } from "../../src/modules/socratic/application/guardrails/write-for-student.js";
import type { AssignmentSnapshot } from "../../src/modules/assignments/domain/rubric.js";

const snapshot: AssignmentSnapshot = {
  assignmentId: "a",
  code: "T",
  title: "Đề",
  instructions: "Viết nghị luận",
  genre: "NLXH",
  gradeLevel: 12,
  learningMaterialText: "Ngữ liệu ngắn",
  rubric: {
    criteria: [
      { criterionId: "C1", name: "Bố cục", weight: "4.00" },
      { criterionId: "C2", name: "Luận điểm", weight: "6.00" },
    ],
  },
  maxScore: "10.00",
  scoreStep: "0.25",
  status: "PUBLISHED",
  publishedAt: null,
  dueAt: null,
  snapshottedAt: "2026-10-13T00:00:00.000Z",
};

test("counts real sentences even when packed into one array item", () => {
  const packed =
    "Câu một. Câu hai. Câu ba. Câu bốn. Câu năm vẫn còn tiếp.";
  assert.equal(splitSentences(packed).length, 5);
  const result = inspectSocraticOutput(
    { replySentences: [packed], focusCriterionIds: [] },
    snapshot,
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failure.code, "SENTENCE_COUNT");
  }
});

test("rejects missing final question, unknown ids, invented source refs and sample essays", () => {
  assert.equal(
    inspectSocraticOutput(
      { replySentences: ["Em hãy nêu một ý."], focusCriterionIds: [] },
      snapshot,
    ).ok,
    false,
  );
  assert.equal(
    inspectSocraticOutput(
      { replySentences: ["Em muốn bắt đầu từ ý nào?"], focusCriterionIds: ["C99"] },
      snapshot,
    ).ok,
    false,
  );
  assert.equal(
    inspectSocraticOutput(
      {
        replySentences: ["Em thấy chi tiết nào đáng viết trước?"],
        focusCriterionIds: [],
        sourceRefs: [{ kind: "rubricCriterion", criterionId: "C99" }],
      },
      snapshot,
    ).ok,
    false,
  );
  const sample = inspectSocraticOutput(
    {
      replySentences: [
        "Mở bài: Trong cuộc sống hiện đại, người trẻ phải kiên định trước mọi thử thách để vươn lên.",
        "Em có muốn chép đoạn này không?",
      ],
      focusCriterionIds: [],
    },
    snapshot,
  );
  assert.equal(sample.ok, false);
});

test("accepts a short socratic reply and provides a valid fallback", () => {
  const ok = inspectSocraticOutput(
    {
      replySentences: [
        "Em đang đi đúng hướng khi tự đặt vấn đề.",
        "Em muốn làm rõ luận điểm nào trước?",
      ],
      focusCriterionIds: ["C2"],
      sourceRefs: [{ kind: "learningMaterial" }],
    },
    snapshot,
  );
  assert.equal(ok.ok, true);
  const fallback = fallbackSocraticOutput(snapshot);
  const checked = inspectSocraticOutput(fallback, snapshot);
  assert.equal(checked.ok, true);
});

test("rejects unlabeled sample openings and accepts negated bài mẫu refusals", () => {
  const unlabeled = inspectSocraticOutput(
    {
      replySentences: [
        "Trong cuộc sống, ý chí và lòng kiên định là ngọn lửa soi đường cho con người vượt qua nghịch cảnh.",
        "Nhờ giữ vững niềm tin và bền bỉ theo đuổi mục tiêu, người trẻ có thể biến khó khăn thành cơ hội để trưởng thành.",
        "Em có muốn dùng hai câu trên làm phần mở bài không?",
      ],
      focusCriterionIds: [],
    },
    snapshot,
    { studentMessage: "Viết giúp em một mở bài để em chép vào bài văn." },
  );
  assert.equal(unlabeled.ok, false);
  if (!unlabeled.ok) {
    assert.equal(unlabeled.failure.code, "WRITE_FOR_STUDENT");
  }

  const unlabeledWithoutRequest = inspectSocraticOutput(
    {
      replySentences: [
        "Trong cuộc sống, ý chí và lòng kiên định là ngọn lửa soi đường cho con người vượt qua nghịch cảnh.",
        "Nhờ giữ vững niềm tin và bền bỉ theo đuổi mục tiêu, người trẻ có thể biến khó khăn thành cơ hội để trưởng thành.",
        "Em có muốn dùng hai câu trên làm phần mở bài không?",
      ],
      focusCriterionIds: [],
    },
    snapshot,
  );
  assert.equal(unlabeledWithoutRequest.ok, false);

  const refusal = inspectSocraticOutput(
    {
      replySentences: [
        "Thầy/Cô không cung cấp bài mẫu cho em.",
        "Em muốn tự phát triển ý nào trước?",
      ],
      focusCriterionIds: [],
    },
    snapshot,
    { studentMessage: "Viết giúp em một mở bài để em chép vào bài văn." },
  );
  assert.equal(refusal.ok, true);
  const canned = writeForStudentRefusalOutput(snapshot);
  assert.equal(inspectSocraticOutput(canned, snapshot).ok, true);
  assert.equal(
    looksLikeWriteForStudentRequest("Viết giúp em một mở bài để em chép vào bài văn."),
    true,
  );
  assert.equal(looksLikeWriteForStudentRequest("Em chưa biết nên mở bài bằng nhận định nào."), false);
});

test("schema validation is more than JSON.parse", () => {
  const result = inspectSocraticOutput({ replySentences: "không phải mảng" }, snapshot);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failure.code, "SCHEMA");
  }
});
