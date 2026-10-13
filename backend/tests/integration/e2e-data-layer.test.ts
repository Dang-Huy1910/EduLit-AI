import assert from "node:assert/strict";
import { test } from "node:test";
import { offsetsForQuote } from "../../src/core/utf16.js";
import { createAssignment } from "../../src/modules/assignments/application/create-assignment.js";
import { startSocraticSession } from "../../src/modules/socratic/application/start-session.js";
import { appendChatMessage } from "../../src/modules/socratic/application/append-message.js";
import { submitAssignment } from "../../src/modules/assessment/application/submit-assignment.js";
import { saveAssessment } from "../../src/modules/assessment/application/save-assessment.js";
import { saveObservationsAndRefreshProfile } from "../../src/modules/writing-profile/application/save-observations.js";
import { getProfileContextForSession } from "../../src/modules/writing-profile/application/query-profile-context.js";
import {
  SAMPLE_EVALUATIONS,
  SAMPLE_RUBRIC,
  createStudent,
  createTeacher,
  withTestPrisma,
} from "../helpers/db.js";

test("end-to-end data layer: assignment to profile context without calling Gemini", async () => {
  await withTestPrisma(async (prisma) => {
    const teacher = await createTeacher(prisma, "loan");
    const student = await createStudent(prisma, "hamy", "Bùi Hà My");
    const assignment = await createAssignment(prisma, {
      teacherId: teacher.id,
      code: "E2E-NLXH",
      title: "Kiên định",
      instructions: "Viết nghị luận",
      genre: "NLXH",
      gradeLevel: 12,
      learningMaterialText: "Ngữ liệu nhập tay",
      rubric: SAMPLE_RUBRIC,
      maxScore: "10.00",
      scoreStep: "0.25",
      status: "PUBLISHED",
    });
    const session = await startSocraticSession(prisma, {
      studentId: student.id,
      assignmentId: assignment.id,
    });
    await appendChatMessage(prisma, {
      sessionId: session.id,
      role: "USER",
      content: "Em chưa biết mở bài.",
    });
    await appendChatMessage(prisma, {
      sessionId: session.id,
      role: "ASSISTANT",
      content: "Em muốn nhấn ý nào trước?",
    });
    const text = "Người trẻ kiên định khi chịu khó ôn tập, không dựa vào văn mẫu.";
    const submission = await submitAssignment(prisma, {
      studentId: student.id,
      assignmentId: assignment.id,
      text,
      socraticSessionId: session.id,
    });
    const assessment = await saveAssessment(prisma, {
      submissionId: submission.id,
      detailedEvaluations: SAMPLE_EVALUATIONS,
      totalScore: "7.50",
      promptVersion: "fixture-v1",
      modelName: "mock/assessment",
      status: "PUBLISHED",
    });
    assert.equal(assessment.modelName, "mock/assessment");
    const quote = "không dựa vào văn mẫu";
    const { start, end } = offsetsForQuote(text, quote);
    await saveObservationsAndRefreshProfile(prisma, {
      studentId: student.id,
      assessmentId: assessment.id,
      observations: [
        {
          kind: "STYLE",
          featureKey: "avoids-template",
          description: "Tránh văn mẫu",
          genre: "NLXH",
          evidenceQuote: quote,
          evidenceStart: start,
          evidenceEnd: end,
          status: "SUPPORTED",
        },
      ],
    });
    const context = await getProfileContextForSession(prisma, student.id);
    assert.equal(context.studentId, student.id);
    assert.ok(context.profile);
    assert.equal(context.recentObservations.length, 1);
    assert.equal(context.recentObservations[0]?.evidenceQuote, quote);
    assert.equal(text.slice(start, end), quote);
    const messages = await prisma.chatMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { sequence: "asc" },
    });
    assert.equal(messages.length, 2);
    assert.equal(messages[0]?.sequence, 1);
  });
});
