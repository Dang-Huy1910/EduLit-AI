import assert from "node:assert/strict";
import { test } from "node:test";
import { DomainError } from "../../src/core/errors.js";
import { offsetsForQuote } from "../../src/core/utf16.js";
import { createAssignment } from "../../src/modules/assignments/application/create-assignment.js";
import { startSocraticSession } from "../../src/modules/socratic/application/start-session.js";
import { submitAssignment } from "../../src/modules/assessment/application/submit-assignment.js";
import { saveAssessment } from "../../src/modules/assessment/application/save-assessment.js";
import {
  saveObservationsAndRefreshProfile,
  setObservationStatus,
} from "../../src/modules/writing-profile/application/save-observations.js";
import { getProfileContextForSession } from "../../src/modules/writing-profile/application/query-profile-context.js";
import type { ProfileSummary } from "../../src/modules/writing-profile/domain/profile.js";
import {
  SAMPLE_EVALUATIONS,
  SAMPLE_RUBRIC,
  createStudent,
  createTeacher,
  withTestPrisma,
} from "../helpers/db.js";

const NEW_RUBRIC = {
  criteria: [
    { criterionId: "NEW", name: "Tiêu chí mới", weight: "10.00" },
  ],
};

test("concurrent first profile writes for two assessments both succeed", async () => {
  await withTestPrisma(async (prisma) => {
    const teacher = await createTeacher(prisma);
    const student = await createStudent(prisma, "hs-conc", "Concurrent");
    const first = await createPublishedWork(prisma, teacher.id, student.id, "CONC-1", "Bài một có bằng chứng alpha.");
    const second = await createPublishedWork(prisma, teacher.id, student.id, "CONC-2", "Bài hai có bằng chứng beta.");
    const quote1 = "bằng chứng alpha";
    const quote2 = "bằng chứng beta";
    const off1 = offsetsForQuote(first.text, quote1);
    const off2 = offsetsForQuote(second.text, quote2);

    const [profileA, profileB] = await Promise.all([
      saveObservationsAndRefreshProfile(prisma, {
        studentId: student.id,
        assessmentId: first.assessmentId,
        observations: [
          {
            kind: "STRENGTH",
            featureKey: "alpha",
            description: "Alpha",
            genre: "NLXH",
            evidenceQuote: quote1,
            evidenceStart: off1.start,
            evidenceEnd: off1.end,
            status: "SUPPORTED",
          },
        ],
      }),
      saveObservationsAndRefreshProfile(prisma, {
        studentId: student.id,
        assessmentId: second.assessmentId,
        observations: [
          {
            kind: "WEAKNESS",
            featureKey: "beta",
            description: "Beta",
            genre: "NLXH",
            evidenceQuote: quote2,
            evidenceStart: off2.start,
            evidenceEnd: off2.end,
            status: "PROVISIONAL",
          },
        ],
      }),
    ]);

    assert.equal(await prisma.writingObservation.count({ where: { studentId: student.id } }), 2);
    assert.equal(await prisma.writingProfile.count({ where: { studentId: student.id } }), 1);
    const latest = profileA.version > profileB.version ? profileA : profileB;
    const summary = latest.summary as ProfileSummary;
    assert.equal(summary.sourceAssessmentIds.length, 2);
    assert.ok(summary.sourceAssessmentIds.includes(first.assessmentId));
    assert.ok(summary.sourceAssessmentIds.includes(second.assessmentId));
  });
});

test("extraction retry does not revive INVALIDATED or RESOLVED observations", async () => {
  await withTestPrisma(async (prisma) => {
    const teacher = await createTeacher(prisma);
    const student = await createStudent(prisma, "hs-term", "Terminal");
    const work = await createPublishedWork(prisma, teacher.id, student.id, "TERM-1", "Câu có bằng chứng thật.");
    const quote = "bằng chứng thật";
    const { start, end } = offsetsForQuote(work.text, quote);
    const payload = {
      kind: "WEAKNESS" as const,
      featureKey: "concrete-evidence",
      description: "Cần luyện dẫn chứng",
      genre: "NLXH",
      evidenceQuote: quote,
      evidenceStart: start,
      evidenceEnd: end,
      status: "SUPPORTED" as const,
    };
    await saveObservationsAndRefreshProfile(prisma, {
      studentId: student.id,
      assessmentId: work.assessmentId,
      observations: [payload],
    });
    const observation = await prisma.writingObservation.findFirstOrThrow({
      where: { studentId: student.id, featureKey: "concrete-evidence" },
    });

    await setObservationStatus(prisma, {
      studentId: student.id,
      observationId: observation.id,
      status: "INVALIDATED",
    });
    await saveObservationsAndRefreshProfile(prisma, {
      studentId: student.id,
      assessmentId: work.assessmentId,
      observations: [payload],
    });
    const afterInvalid = await prisma.writingObservation.findUniqueOrThrow({
      where: { id: observation.id },
    });
    assert.equal(afterInvalid.status, "INVALIDATED");

    await setObservationStatus(prisma, {
      studentId: student.id,
      observationId: observation.id,
      status: "RESOLVED",
    });
    await saveObservationsAndRefreshProfile(prisma, {
      studentId: student.id,
      assessmentId: work.assessmentId,
      observations: [{ ...payload, status: "SUPPORTED" }],
    });
    const afterResolved = await prisma.writingObservation.findUniqueOrThrow({
      where: { id: observation.id },
    });
    assert.equal(afterResolved.status, "RESOLVED");
    const context = await getProfileContextForSession(prisma, student.id);
    assert.equal(context.recentObservations.length, 0);
    assert.equal((context.profile?.summary as ProfileSummary).practiceNeeds.length, 0);
    assert.equal((context.profile?.summary as ProfileSummary).resolvedItems.length, 1);
  });
});

test("resolving a weakness removes it from current practice needs", async () => {
  await withTestPrisma(async (prisma) => {
    const teacher = await createTeacher(prisma);
    const student = await createStudent(prisma, "hs-res", "Resolved");
    const work = await createPublishedWork(prisma, teacher.id, student.id, "RES-1", "Em còn câu ghép thiếu vế.");
    const quote = "câu ghép thiếu vế";
    const { start, end } = offsetsForQuote(work.text, quote);
    const profile = await saveObservationsAndRefreshProfile(prisma, {
      studentId: student.id,
      assessmentId: work.assessmentId,
      observations: [
        {
          kind: "WEAKNESS",
          featureKey: "compound-sentence-gap",
          description: "Câu ghép thiếu vế",
          genre: "NLXH",
          evidenceQuote: quote,
          evidenceStart: start,
          evidenceEnd: end,
          status: "PROVISIONAL",
        },
      ],
    });
    assert.deepEqual((profile.summary as ProfileSummary).practiceNeeds, ["Câu ghép thiếu vế"]);
    const observation = await prisma.writingObservation.findFirstOrThrow({
      where: { studentId: student.id },
    });
    const updated = await setObservationStatus(prisma, {
      studentId: student.id,
      observationId: observation.id,
      status: "RESOLVED",
      expectedProfileVersion: profile.version,
    });
    const summary = updated.summary as ProfileSummary;
    assert.deepEqual(summary.practiceNeeds, []);
    assert.equal(summary.resolvedItems[0]?.featureKey, "compound-sentence-gap");
    const context = await getProfileContextForSession(prisma, student.id);
    assert.equal(context.recentObservations.length, 0);
  });
});

test("submit through a session keeps the frozen session rubric after the assignment changes", async () => {
  await withTestPrisma(async (prisma) => {
    const teacher = await createTeacher(prisma);
    const student = await createStudent(prisma, "hs-rubric", "Snap");
    const assignment = await createAssignment(prisma, {
      teacherId: teacher.id,
      code: "RUBRIC-SWAP",
      title: "Đề C1",
      instructions: "Theo C1",
      genre: "NLXH",
      gradeLevel: 12,
      learningMaterialText: "A",
      rubric: SAMPLE_RUBRIC,
      maxScore: "10.00",
      scoreStep: "0.25",
      status: "PUBLISHED",
    });
    const session = await startSocraticSession(prisma, {
      studentId: student.id,
      assignmentId: assignment.id,
    });
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: {
        rubric: NEW_RUBRIC,
        title: "Đề NEW",
        instructions: "Theo NEW",
      },
    });
    const submission = await submitAssignment(prisma, {
      studentId: student.id,
      assignmentId: assignment.id,
      text: "Bài viết theo phiên cũ.",
      socraticSessionId: session.id,
    });
    const snapshot = submission.assignmentSnapshot as {
      title: string;
      rubric: { criteria: Array<{ criterionId: string }> };
    };
    assert.equal(snapshot.title, "Đề C1");
    assert.deepEqual(
      snapshot.rubric.criteria.map((item) => item.criterionId),
      ["C1", "C2"],
    );
  });
});

test("CLOSED assignments reject submit; past dueAt on PUBLISHED does not", async () => {
  await withTestPrisma(async (prisma) => {
    const teacher = await createTeacher(prisma);
    const student = await createStudent(prisma, "hs-closed", "Closed");
    const assignment = await createAssignment(prisma, {
      teacherId: teacher.id,
      code: "CLOSED-1",
      title: "Đề",
      instructions: "x",
      genre: "NLXH",
      gradeLevel: 12,
      learningMaterialText: "x",
      rubric: SAMPLE_RUBRIC,
      maxScore: "10.00",
      scoreStep: "0.25",
      status: "PUBLISHED",
      dueAt: new Date("2020-01-01T00:00:00.000Z"),
    });
    await submitAssignment(prisma, {
      studentId: student.id,
      assignmentId: assignment.id,
      text: "Nộp khi quá hạn vẫn được vì dueAt chỉ là thông tin MVP.",
    });
    await prisma.submission.deleteMany({ where: { assignmentId: assignment.id } });
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: { status: "CLOSED" },
    });
    await assert.rejects(
      () =>
        submitAssignment(prisma, {
          studentId: student.id,
          assignmentId: assignment.id,
          text: "Nộp đề đã đóng.",
        }),
      (error: unknown) => error instanceof DomainError && error.code === "SUBMISSION_ASSIGNMENT",
    );
  });
});

test("accepted rubric remains valid after round-trip through the database", async () => {
  await withTestPrisma(async (prisma) => {
    const teacher = await createTeacher(prisma);
    const student = await createStudent(prisma, "hs-dec", "Decimal");
    const assignment = await createAssignment(prisma, {
      teacherId: teacher.id,
      code: "DEC-1",
      title: "Đề 1 điểm",
      instructions: "x",
      genre: "NLXH",
      gradeLevel: 12,
      learningMaterialText: "x",
      rubric: {
        criteria: [
          { criterionId: "C1", name: "A", weight: "0.25" },
          { criterionId: "C2", name: "B", weight: "0.75" },
        ],
      },
      maxScore: "1.00",
      scoreStep: "0.25",
      status: "PUBLISHED",
    });
    const stored = await prisma.assignment.findUniqueOrThrow({ where: { id: assignment.id } });
    const session = await startSocraticSession(prisma, {
      studentId: student.id,
      assignmentId: stored.id,
    });
    assert.ok(session.id);
    await assert.rejects(
      () =>
        createAssignment(prisma, {
          teacherId: teacher.id,
          code: "DEC-BAD",
          title: "Làm tròn",
          instructions: "x",
          genre: "NLXH",
          gradeLevel: 12,
          learningMaterialText: "x",
          rubric: {
            criteria: [
              { criterionId: "C1", name: "A", weight: "0.005" },
              { criterionId: "C2", name: "B", weight: "0.005" },
            ],
          },
          maxScore: "0.01",
          scoreStep: "0.005",
        }),
      (error: unknown) => error instanceof DomainError && error.code === "DECIMAL_SCALE",
    );
  });
});

async function createPublishedWork(
  prisma: Parameters<typeof createAssignment>[0],
  teacherId: string,
  studentId: string,
  code: string,
  text: string,
) {
  const assignment = await createAssignment(prisma, {
    teacherId,
    code,
    title: code,
    instructions: "x",
    genre: "NLXH",
    gradeLevel: 12,
    learningMaterialText: "x",
    rubric: SAMPLE_RUBRIC,
    maxScore: "10.00",
    scoreStep: "0.25",
    status: "PUBLISHED",
  });
  const submission = await submitAssignment(prisma, {
    studentId,
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
  return { assignmentId: assignment.id, assessmentId: assessment.id, text };
}
