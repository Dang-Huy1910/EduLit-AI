import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "../../src/generated/prisma/client.js";
import { createAssignment } from "../../src/modules/assignments/application/create-assignment.js";
import { createStudent, createTeacher, SAMPLE_RUBRIC, withTestPrisma } from "../helpers/db.js";

test("unique loginId and session tokenHash are enforced", async () => {
  await withTestPrisma(async (prisma) => {
    const teacher = await createTeacher(prisma);
    await assert.rejects(
      () =>
        prisma.user.create({
          data: {
            loginId: teacher.loginId,
            displayName: "Khác",
            passwordHash: "x",
            role: "TEACHER",
          },
        }),
      (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
    );

    await prisma.authSession.create({
      data: {
        userId: teacher.id,
        tokenHash: "hash-one",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await assert.rejects(
      () =>
        prisma.authSession.create({
          data: {
            userId: teacher.id,
            tokenHash: "hash-one",
            expiresAt: new Date(Date.now() + 120_000),
          },
        }),
      (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
    );
  });
});

test("CHECK constraints reject invalid grade, scores, offsets and version", async () => {
  await withTestPrisma(async (prisma) => {
    const teacher = await createTeacher(prisma);
    await assert.rejects(() =>
      prisma.assignment.create({
        data: {
          teacherId: teacher.id,
          code: "BAD-GRADE",
          title: "x",
          instructions: "x",
          genre: "NLXH",
          gradeLevel: 9,
          learningMaterialText: "x",
          rubric: SAMPLE_RUBRIC,
          maxScore: "10",
          scoreStep: "0.25",
        },
      }),
    );
    await assert.rejects(() =>
      prisma.assignment.create({
        data: {
          teacherId: teacher.id,
          code: "BAD-SCORE",
          title: "x",
          instructions: "x",
          genre: "NLXH",
          gradeLevel: 12,
          learningMaterialText: "x",
          rubric: SAMPLE_RUBRIC,
          maxScore: "0",
          scoreStep: "0.25",
        },
      }),
    );

    const assignment = await createAssignment(prisma, {
      teacherId: teacher.id,
      code: "OK-1",
      title: "Đề hợp lệ",
      instructions: "Làm bài",
      genre: "NLXH",
      gradeLevel: 12,
      learningMaterialText: "Ngữ liệu",
      rubric: SAMPLE_RUBRIC,
      maxScore: "10.00",
      scoreStep: "0.25",
      status: "PUBLISHED",
    });
    const student = await createStudent(prisma, "hs-1", "Học sinh");
    const submission = await prisma.submission.create({
      data: {
        studentId: student.id,
        assignmentId: assignment.id,
        text: "Bài viết.",
        contentHash: "abc",
        assignmentSnapshot: { rubric: SAMPLE_RUBRIC, maxScore: "10.00", scoreStep: "0.25" },
        submittedAt: new Date(),
      },
    });
    const assessment = await prisma.assessment.create({
      data: {
        submissionId: submission.id,
        studentId: student.id,
        rubricSnapshot: SAMPLE_RUBRIC,
        detailedEvaluations: [],
        totalScore: "1.00",
        maxScore: "10.00",
        status: "PUBLISHED",
        promptVersion: "t",
        assessedAt: new Date(),
        publishedAt: new Date(),
      },
    });
    await assert.rejects(() =>
      prisma.writingObservation.create({
        data: {
          studentId: student.id,
          assessmentId: assessment.id,
          kind: "WEAKNESS",
          featureKey: "x",
          description: "x",
          genre: "NLXH",
          evidenceQuote: "Bài",
          evidenceStart: 3,
          evidenceEnd: 1,
          observedAt: new Date(),
        },
      }),
    );
    await assert.rejects(() =>
      prisma.writingProfile.create({
        data: {
          studentId: student.id,
          declaredGoals: { items: [] },
          summary: {},
          observationIds: [],
          version: 0,
        },
      }),
    );
  });
});

test("foreign keys restrict deleting a teacher that still owns an assignment", async () => {
  await withTestPrisma(async (prisma) => {
    const teacher = await createTeacher(prisma);
    await createAssignment(prisma, {
      teacherId: teacher.id,
      code: "OWNED",
      title: "Đề",
      instructions: "x",
      genre: "NLXH",
      gradeLevel: 11,
      learningMaterialText: "x",
      rubric: SAMPLE_RUBRIC,
      maxScore: "10.00",
      scoreStep: "0.25",
    });
    await assert.rejects(() => prisma.user.delete({ where: { id: teacher.id } }));
  });
});

test("duplicate (student, assignment) submission and (session, sequence) are rejected", async () => {
  await withTestPrisma(async (prisma) => {
    const teacher = await createTeacher(prisma);
    const student = await createStudent(prisma, "hs-dup", "A");
    const assignment = await createAssignment(prisma, {
      teacherId: teacher.id,
      code: "DUP",
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
    const payload = {
      studentId: student.id,
      assignmentId: assignment.id,
      text: "Một bài.",
      contentHash: "h",
      assignmentSnapshot: {},
      submittedAt: new Date(),
    };
    await prisma.submission.create({ data: payload });
    await assert.rejects(
      () => prisma.submission.create({ data: payload }),
      (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
    );

    const session = await prisma.socraticSession.create({
      data: {
        studentId: student.id,
        assignmentId: assignment.id,
        contextSnapshot: {},
        outline: {},
      },
    });
    await prisma.chatMessage.create({
      data: { sessionId: session.id, sequence: 1, role: "USER", content: "câu hỏi" },
    });
    await assert.rejects(
      () =>
        prisma.chatMessage.create({
          data: { sessionId: session.id, sequence: 1, role: "ASSISTANT", content: "trả lời" },
        }),
      (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002",
    );
  });
});
