import assert from "node:assert/strict";
import { test } from "node:test";
import { DomainError, VersionConflictError } from "../../src/core/errors.js";
import { offsetsForQuote } from "../../src/core/utf16.js";
import { createAssignment } from "../../src/modules/assignments/application/create-assignment.js";
import { startSocraticSession } from "../../src/modules/socratic/application/start-session.js";
import { appendChatMessage } from "../../src/modules/socratic/application/append-message.js";
import { submitAssignment } from "../../src/modules/assessment/application/submit-assignment.js";
import { publishAssessment, saveAssessment } from "../../src/modules/assessment/application/save-assessment.js";
import { saveObservationsAndRefreshProfile } from "../../src/modules/writing-profile/application/save-observations.js";
import { getProfileContextForSession } from "../../src/modules/writing-profile/application/query-profile-context.js";
import {
  SAMPLE_EVALUATIONS,
  SAMPLE_RUBRIC,
  createStudent,
  createTeacher,
  withTestPrisma,
} from "../helpers/db.js";

test("changing an assignment does not mutate stored session or submission snapshots", async () => {
  await withTestPrisma(async (prisma) => {
    const teacher = await createTeacher(prisma);
    const student = await createStudent(prisma, "hs-snap", "My");
    const assignment = await createAssignment(prisma, {
      teacherId: teacher.id,
      code: "SNAP-1",
      title: "Đề bản A",
      instructions: "Hướng dẫn A",
      genre: "NLXH",
      gradeLevel: 12,
      learningMaterialText: "Học liệu A",
      rubric: SAMPLE_RUBRIC,
      maxScore: "10.00",
      scoreStep: "0.25",
      status: "DRAFT",
    });
    const session = await startSocraticSession(prisma, {
      studentId: student.id,
      assignmentId: assignment.id,
    });
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: { title: "Đề bản B", instructions: "Hướng dẫn B", status: "PUBLISHED", publishedAt: new Date() },
    });
    const sessionAfter = await prisma.socraticSession.findUniqueOrThrow({ where: { id: session.id } });
    const snapshot = sessionAfter.contextSnapshot as { title: string; instructions: string };
    assert.equal(snapshot.title, "Đề bản A");
    assert.equal(snapshot.instructions, "Hướng dẫn A");

    const submission = await submitAssignment(prisma, {
      studentId: student.id,
      assignmentId: assignment.id,
      text: "Bài viết đã nộp.",
      socraticSessionId: session.id,
    });
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: { title: "Đề bản C", instructions: "Hướng dẫn C" },
    });
    const submissionAfter = await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } });
    const assignmentSnapshot = submissionAfter.assignmentSnapshot as { title: string };
    assert.equal(assignmentSnapshot.title, "Đề bản A");
    const live = await prisma.assignment.findUniqueOrThrow({ where: { id: assignment.id } });
    assert.equal(live.title, "Đề bản C");
  });
});

test("rejects session/student mismatch, bad rubric snapshot, unpublished assessment and bad evidence", async () => {
  await withTestPrisma(async (prisma) => {
    const teacher = await createTeacher(prisma);
    const studentA = await createStudent(prisma, "hs-a", "A");
    const studentB = await createStudent(prisma, "hs-b", "B");
    const assignment = await createAssignment(prisma, {
      teacherId: teacher.id,
      code: "OWN-1",
      title: "Đề",
      instructions: "x",
      genre: "NLXH",
      gradeLevel: 10,
      learningMaterialText: "x",
      rubric: SAMPLE_RUBRIC,
      maxScore: "10.00",
      scoreStep: "0.25",
      status: "PUBLISHED",
    });
    const sessionA = await startSocraticSession(prisma, {
      studentId: studentA.id,
      assignmentId: assignment.id,
    });
    await assert.rejects(
      () =>
        submitAssignment(prisma, {
          studentId: studentB.id,
          assignmentId: assignment.id,
          text: "Bài của B.",
          socraticSessionId: sessionA.id,
        }),
      DomainError,
    );

    const submission = await submitAssignment(prisma, {
      studentId: studentA.id,
      assignmentId: assignment.id,
      text: "Bài của A có câu dẫn chứng này.",
    });
    await assert.rejects(
      () =>
        saveAssessment(prisma, {
          submissionId: submission.id,
          rubricSnapshot: {
            criteria: [
              { criterionId: "ZX", name: "Khác", weight: "10.00" },
            ],
          },
          detailedEvaluations: [{ criterionId: "ZX", awardedScore: "1.00" }],
          totalScore: "1.00",
          promptVersion: "p1",
        }),
      (error: unknown) => error instanceof DomainError && error.code === "SNAPSHOT_MISMATCH",
    );

    const draft = await saveAssessment(prisma, {
      submissionId: submission.id,
      detailedEvaluations: SAMPLE_EVALUATIONS,
      totalScore: "7.50",
      promptVersion: "p1",
      status: "AI_DRAFT",
    });
    const quote = "câu dẫn chứng này";
    const { start, end } = offsetsForQuote(submission.text, quote);
    await assert.rejects(
      () =>
        saveObservationsAndRefreshProfile(prisma, {
          studentId: studentA.id,
          assessmentId: draft.id,
          observations: [
            {
              kind: "STRENGTH",
              featureKey: "evidence",
              description: "Có dẫn chứng",
              genre: "NLXH",
              evidenceQuote: quote,
              evidenceStart: start,
              evidenceEnd: end,
            },
          ],
        }),
      (error: unknown) => error instanceof DomainError && error.code === "OBSERVATION_STATUS",
    );

    await publishAssessment(prisma, draft.id);
    await assert.rejects(
      () =>
        saveObservationsAndRefreshProfile(prisma, {
          studentId: studentB.id,
          assessmentId: draft.id,
          observations: [
            {
              kind: "STRENGTH",
              featureKey: "evidence",
              description: "Sai học sinh",
              genre: "NLXH",
              evidenceQuote: quote,
              evidenceStart: start,
              evidenceEnd: end,
            },
          ],
        }),
      DomainError,
    );
    await assert.rejects(
      () =>
        saveObservationsAndRefreshProfile(prisma, {
          studentId: studentA.id,
          assessmentId: draft.id,
          observations: [
            {
              kind: "STRENGTH",
              featureKey: "evidence",
              description: "Quote sai",
              genre: "NLXH",
              evidenceQuote: "không có trong bài",
              evidenceStart: start,
              evidenceEnd: end,
            },
          ],
        }),
      DomainError,
    );
  });
});

test("retrying the same observation does not inflate support count; invalid input rolls back", async () => {
  await withTestPrisma(async (prisma) => {
    const teacher = await createTeacher(prisma);
    const student = await createStudent(prisma, "hs-retry", "Retry");
    const assignment = await createAssignment(prisma, {
      teacherId: teacher.id,
      code: "RETRY",
      title: "Đề",
      instructions: "x",
      genre: "NLXH",
      gradeLevel: 12,
      learningMaterialText: "x",
      rubric: SAMPLE_RUBRIC,
      maxScore: "10.00",
      scoreStep: "0.25",
      status: "PUBLISHED",
    });
    const text = "Câu có bằng chứng thật.";
    const submission = await submitAssignment(prisma, {
      studentId: student.id,
      assignmentId: assignment.id,
      text,
    });
    const assessment = await saveAssessment(prisma, {
      submissionId: submission.id,
      detailedEvaluations: SAMPLE_EVALUATIONS,
      totalScore: "7.50",
      promptVersion: "p1",
      status: "PUBLISHED",
    });
    const quote = "bằng chứng thật";
    const { start, end } = offsetsForQuote(text, quote);
    const valid = {
      kind: "STRENGTH" as const,
      featureKey: "concrete-evidence",
      description: "Có bằng chứng cụ thể",
      genre: "NLXH",
      evidenceQuote: quote,
      evidenceStart: start,
      evidenceEnd: end,
      status: "SUPPORTED" as const,
    };
    await assert.rejects(() =>
      saveObservationsAndRefreshProfile(prisma, {
        studentId: student.id,
        assessmentId: assessment.id,
        observations: [
          valid,
          {
            ...valid,
            featureKey: "bad",
            evidenceQuote: "sai hoàn toàn",
            evidenceStart: 0,
            evidenceEnd: 3,
          },
        ],
      }),
    );
    assert.equal(await prisma.writingObservation.count(), 0);
    assert.equal(await prisma.writingProfile.count(), 0);

    const first = await saveObservationsAndRefreshProfile(prisma, {
      studentId: student.id,
      assessmentId: assessment.id,
      observations: [valid],
    });
    const second = await saveObservationsAndRefreshProfile(prisma, {
      studentId: student.id,
      assessmentId: assessment.id,
      observations: [valid],
      expectedProfileVersion: first.version,
    });
    assert.equal(await prisma.writingObservation.count(), 1);
    const summary = second.summary as { supportCountByFeature: Record<string, number> };
    assert.equal(summary.supportCountByFeature["concrete-evidence"], 1);
    await assert.rejects(
      () =>
        saveObservationsAndRefreshProfile(prisma, {
          studentId: student.id,
          assessmentId: assessment.id,
          observations: [valid],
          expectedProfileVersion: first.version,
        }),
      VersionConflictError,
    );
  });
});

test("profile query hides other students and invalidated observations", async () => {
  await withTestPrisma(async (prisma) => {
    const teacher = await createTeacher(prisma);
    const studentA = await createStudent(prisma, "hs-qa", "A");
    const studentB = await createStudent(prisma, "hs-qb", "B");
    const assignment = await createAssignment(prisma, {
      teacherId: teacher.id,
      code: "Q1",
      title: "Đề",
      instructions: "x",
      genre: "NLXH",
      gradeLevel: 12,
      learningMaterialText: "x",
      rubric: SAMPLE_RUBRIC,
      maxScore: "10.00",
      scoreStep: "0.25",
      status: "PUBLISHED",
    });
    const textA = "Em viết đoạn văn của A.";
    const textB = "Em viết đoạn văn của B.";
    const subA = await submitAssignment(prisma, {
      studentId: studentA.id,
      assignmentId: assignment.id,
      text: textA,
    });
    const otherAssignment = await createAssignment(prisma, {
      teacherId: teacher.id,
      code: "Q2",
      title: "Đề 2",
      instructions: "x",
      genre: "NLXH",
      gradeLevel: 12,
      learningMaterialText: "x",
      rubric: SAMPLE_RUBRIC,
      maxScore: "10.00",
      scoreStep: "0.25",
      status: "PUBLISHED",
    });
    const subB = await submitAssignment(prisma, {
      studentId: studentB.id,
      assignmentId: otherAssignment.id,
      text: textB,
    });
    const assA = await saveAssessment(prisma, {
      submissionId: subA.id,
      detailedEvaluations: SAMPLE_EVALUATIONS,
      totalScore: "7.50",
      promptVersion: "p1",
      status: "PUBLISHED",
    });
    const assB = await saveAssessment(prisma, {
      submissionId: subB.id,
      detailedEvaluations: SAMPLE_EVALUATIONS,
      totalScore: "7.50",
      promptVersion: "p1",
      status: "PUBLISHED",
    });
    const quoteA = "đoạn văn của A";
    const quoteB = "đoạn văn của B";
    const offA = offsetsForQuote(textA, quoteA);
    const offB = offsetsForQuote(textB, quoteB);
    await saveObservationsAndRefreshProfile(prisma, {
      studentId: studentA.id,
      assessmentId: assA.id,
      observations: [
        {
          kind: "WEAKNESS",
          featureKey: "keep",
          description: "Giữ",
          genre: "NLXH",
          evidenceQuote: quoteA,
          evidenceStart: offA.start,
          evidenceEnd: offA.end,
        },
        {
          kind: "STYLE",
          featureKey: "drop",
          description: "Bỏ",
          genre: "NLXH",
          evidenceQuote: quoteA,
          evidenceStart: offA.start,
          evidenceEnd: offA.end,
        },
      ],
    });
    await prisma.writingObservation.updateMany({
      where: { studentId: studentA.id, featureKey: "drop" },
      data: { status: "INVALIDATED" },
    });
    const { refreshWritingProfile } = await import(
      "../../src/modules/writing-profile/application/save-observations.js"
    );
    await refreshWritingProfile(prisma, studentA.id);
    await saveObservationsAndRefreshProfile(prisma, {
      studentId: studentB.id,
      assessmentId: assB.id,
      observations: [
        {
          kind: "STRENGTH",
          featureKey: "other",
          description: "Của B",
          genre: "NLXH",
          evidenceQuote: quoteB,
          evidenceStart: offB.start,
          evidenceEnd: offB.end,
        },
      ],
    });

    const context = await getProfileContextForSession(prisma, studentA.id, 10);
    assert.ok(context.recentObservations.every((item) => item.featureKey !== "other"));
    assert.ok(context.recentObservations.every((item) => item.featureKey !== "drop"));
    assert.equal(context.recentObservations.length, 1);
    assert.equal(context.recentObservations[0]?.featureKey, "keep");
    const ids = context.profile?.observationIds ?? [];
    assert.equal(ids.length, 1);
  });
});

test("appendChatMessage assigns stable increasing sequence", async () => {
  await withTestPrisma(async (prisma) => {
    const teacher = await createTeacher(prisma);
    const student = await createStudent(prisma, "hs-chat", "Chat");
    const assignment = await createAssignment(prisma, {
      teacherId: teacher.id,
      code: "CHAT",
      title: "Đề",
      instructions: "x",
      genre: "NLXH",
      gradeLevel: 12,
      learningMaterialText: "x",
      rubric: SAMPLE_RUBRIC,
      maxScore: "10.00",
      scoreStep: "0.25",
    });
    const session = await startSocraticSession(prisma, {
      studentId: student.id,
      assignmentId: assignment.id,
    });
    const first = await appendChatMessage(prisma, {
      sessionId: session.id,
      role: "USER",
      content: "Câu hỏi 1",
    });
    const second = await appendChatMessage(prisma, {
      sessionId: session.id,
      role: "ASSISTANT",
      content: "Câu hỏi gợi mở",
    });
    assert.equal(first.sequence, 1);
    assert.equal(second.sequence, 2);
  });
});
