import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { DomainError } from "../../src/core/errors.js";
import { offsetsForQuote } from "../../src/core/utf16.js";
import { FakeSocraticAi, fakeProviderError } from "../../src/infrastructure/ai/fake-socratic.adapter.js";
import { createAssignment } from "../../src/modules/assignments/application/create-assignment.js";
import { submitAssignment } from "../../src/modules/assessment/application/submit-assignment.js";
import { saveAssessment } from "../../src/modules/assessment/application/save-assessment.js";
import {
  saveObservationsAndRefreshProfile,
  setObservationStatus,
} from "../../src/modules/writing-profile/application/save-observations.js";
import { openOrResumeSocraticSession } from "../../src/modules/socratic/application/open-or-resume-session.js";
import { getSocraticSession } from "../../src/modules/socratic/application/get-socratic-session.js";
import { saveStudentOutline } from "../../src/modules/socratic/application/save-student-outline.js";
import { sendSocraticTurn } from "../../src/modules/socratic/application/send-socratic-turn.js";
import {
  SAMPLE_EVALUATIONS,
  SAMPLE_RUBRIC,
  createStudent,
  createTeacher,
  withTestPrisma,
} from "../helpers/db.js";
import type { EduLitPrisma } from "../../src/infrastructure/database/prisma.client.js";
import type { StudentActor } from "../../src/modules/socratic/domain/actor.js";
import {
  createPrismaHandle,
  disconnectPrismaHandle,
} from "../../src/infrastructure/database/prisma.client.js";
import { requireTestDatabaseUrl } from "../../src/infrastructure/database/env.js";

async function publishedFixture(
  prisma: EduLitPrisma,
  code: string,
  studentLogin = `hs-${randomUUID()}`,
) {
  const teacher = await createTeacher(prisma);
  const student = await createStudent(prisma, studentLogin, "Học sinh thử");
  const assignment = await createAssignment(prisma, {
    teacherId: teacher.id,
    code,
    title: "Bản lĩnh",
    instructions: "Viết nghị luận về bản lĩnh người trẻ.",
    genre: "NLXH",
    gradeLevel: 12,
    learningMaterialText: "Ngữ liệu: thành tích cần đi cùng sự trung thực.",
    rubric: SAMPLE_RUBRIC,
    maxScore: "10.00",
    scoreStep: "0.25",
    status: "PUBLISHED",
  });
  const actor: StudentActor = { userId: student.id, role: "STUDENT" };
  return { teacher, student, assignment, actor };
}

test("open/resume concurrently reuse one session and freeze snapshot", async () => {
  await withTestPrisma(async (prisma) => {
    const { assignment, actor } = await publishedFixture(prisma, "SOC-OPEN");
    const [first, second] = await Promise.all([
      openOrResumeSocraticSession(prisma, { actor, assignmentId: assignment.id }),
      openOrResumeSocraticSession(prisma, { actor, assignmentId: assignment.id }),
    ]);
    assert.equal(first.sessionId, second.sessionId);
    const count = await prisma.socraticSession.count({
      where: { studentId: actor.userId, assignmentId: assignment.id },
    });
    assert.equal(count, 1);
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: { title: "Đề đã sửa", instructions: "Hướng dẫn mới" },
    });
    const resumed = await openOrResumeSocraticSession(prisma, {
      actor,
      assignmentId: assignment.id,
    });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.snapshot.title, "Bản lĩnh");
    assert.equal(resumed.snapshot.instructions, "Viết nghị luận về bản lĩnh người trẻ.");
  });
});

test("wrong actor, foreign session, closed/completed/submitted are blocked without calling the provider", async () => {
  await withTestPrisma(async (prisma) => {
    const fake = new FakeSocraticAi();
    const setup = await publishedFixture(prisma, "SOC-AUTH");
    const other = await createStudent(prisma, `hs-other-${randomUUID()}`, "Khác");
    const opened = await openOrResumeSocraticSession(prisma, {
      actor: setup.actor,
      assignmentId: setup.assignment.id,
    });

    await assert.rejects(
      () =>
        sendSocraticTurn(prisma, fake, {
          actor: { userId: other.id, role: "STUDENT" },
          sessionId: opened.sessionId,
          requestId: randomUUID(),
          expectedLastSequence: 0,
          message: "Em hỏi.",
        }),
      (error: unknown) => error instanceof DomainError && error.code === "SESSION_OWNERSHIP",
    );

    await prisma.user.update({ where: { id: setup.student.id }, data: { status: "INACTIVE" } });
    await assert.rejects(
      () =>
        sendSocraticTurn(prisma, fake, {
          actor: setup.actor,
          sessionId: opened.sessionId,
          requestId: randomUUID(),
          expectedLastSequence: 0,
          message: "Em hỏi.",
        }),
      (error: unknown) => error instanceof DomainError && error.code === "ACTOR_INACTIVE",
    );
    await prisma.user.update({ where: { id: setup.student.id }, data: { status: "ACTIVE" } });

    await prisma.socraticSession.update({
      where: { id: opened.sessionId },
      data: { status: "COMPLETED" },
    });
    await assert.rejects(
      () =>
        sendSocraticTurn(prisma, fake, {
          actor: setup.actor,
          sessionId: opened.sessionId,
          requestId: randomUUID(),
          expectedLastSequence: 0,
          message: "Em hỏi.",
        }),
      (error: unknown) => error instanceof DomainError && error.code === "SESSION_COMPLETED",
    );
    const readable = await getSocraticSession(prisma, {
      actor: setup.actor,
      sessionId: opened.sessionId,
    });
    assert.equal(readable.status, "COMPLETED");

    const live = await publishedFixture(prisma, "SOC-CLOSE");
    const liveSession = await openOrResumeSocraticSession(prisma, {
      actor: live.actor,
      assignmentId: live.assignment.id,
    });
    await prisma.assignment.update({
      where: { id: live.assignment.id },
      data: { status: "CLOSED" },
    });
    await assert.rejects(
      () =>
        sendSocraticTurn(prisma, fake, {
          actor: live.actor,
          sessionId: liveSession.sessionId,
          requestId: randomUUID(),
          expectedLastSequence: 0,
          message: "Em hỏi.",
        }),
      (error: unknown) => error instanceof DomainError && error.code === "SESSION_CLOSED",
    );

    const submitSetup = await publishedFixture(prisma, "SOC-SUB");
    const submitSession = await openOrResumeSocraticSession(prisma, {
      actor: submitSetup.actor,
      assignmentId: submitSetup.assignment.id,
    });
    await submitAssignment(prisma, {
      studentId: submitSetup.student.id,
      assignmentId: submitSetup.assignment.id,
      text: "Bài đã nộp.",
      socraticSessionId: submitSession.sessionId,
    });
    await assert.rejects(
      () =>
        sendSocraticTurn(prisma, fake, {
          actor: submitSetup.actor,
          sessionId: submitSession.sessionId,
          requestId: randomUUID(),
          expectedLastSequence: 0,
          message: "Em hỏi.",
        }),
      (error: unknown) => error instanceof DomainError && error.code === "SESSION_SUBMITTED",
    );
    assert.equal(fake.calls.length, 0);
  });
});

test("reads the owning student's current genre observations and ignores RESOLVED", async () => {
  await withTestPrisma(async (prisma) => {
    const fake = new FakeSocraticAi();
    const owner = await publishedFixture(prisma, "SOC-PROF-A");
    const coaching = await createAssignment(prisma, {
      teacherId: owner.teacher.id,
      code: "SOC-PROF-B",
      title: "Đề coaching",
      instructions: "Lập dàn ý",
      genre: "NLXH",
      gradeLevel: 12,
      learningMaterialText: "Ngữ liệu coaching",
      rubric: SAMPLE_RUBRIC,
      maxScore: "10.00",
      scoreStep: "0.25",
      status: "PUBLISHED",
    });
    const text = "Người trẻ kiên định khi chịu khó ôn tập, không dựa vào văn mẫu.";
    const submission = await submitAssignment(prisma, {
      studentId: owner.student.id,
      assignmentId: owner.assignment.id,
      text,
    });
    const assessment = await saveAssessment(prisma, {
      submissionId: submission.id,
      detailedEvaluations: SAMPLE_EVALUATIONS,
      totalScore: "7.50",
      promptVersion: "fixture-v1",
      status: "PUBLISHED",
    });
    const quote = "không dựa vào văn mẫu";
    const { start, end } = offsetsForQuote(text, quote);
    await saveObservationsAndRefreshProfile(prisma, {
      studentId: owner.student.id,
      assessmentId: assessment.id,
      observations: [
        {
          kind: "STYLE",
          featureKey: "avoids-template",
          description: "Có ý thức tránh văn mẫu",
          genre: "NLXH",
          evidenceQuote: quote,
          evidenceStart: start,
          evidenceEnd: end,
          status: "SUPPORTED",
        },
      ],
    });

    const session = await openOrResumeSocraticSession(prisma, {
      actor: owner.actor,
      assignmentId: coaching.id,
    });
    await sendSocraticTurn(prisma, fake, {
      actor: owner.actor,
      sessionId: session.sessionId,
      requestId: randomUUID(),
      expectedLastSequence: 0,
      message: "Em chưa biết mở bài.",
    });
    assert.match(fake.calls[0]?.userPayload ?? "", /tránh văn mẫu/);

    const rows = await prisma.writingObservation.findMany({
      where: { studentId: owner.student.id },
    });
    const observation = rows[0];
    assert.ok(observation);
    await setObservationStatus(prisma, {
      studentId: owner.student.id,
      observationId: observation.id,
      status: "RESOLVED",
    });
    await sendSocraticTurn(prisma, fake, {
      actor: owner.actor,
      sessionId: session.sessionId,
      requestId: randomUUID(),
      expectedLastSequence: 2,
      message: "Em muốn hỏi tiếp.",
    });
    assert.doesNotMatch(fake.calls[1]?.userPayload ?? "", /tránh văn mẫu/);
  });
});

test("invalid model output uses fallback; provider errors do not persist messages", async () => {
  await withTestPrisma(async (prisma) => {
    const { assignment, actor } = await publishedFixture(prisma, "SOC-OUT");
    const session = await openOrResumeSocraticSession(prisma, { actor, assignmentId: assignment.id });
    const fake = new FakeSocraticAi();
    fake.nextOutput = {
      replySentences: ["Câu một. Câu hai. Câu ba. Câu bốn. Câu năm vẫn dài."],
      focusCriterionIds: [],
    };
    const fallbackTurn = await sendSocraticTurn(prisma, fake, {
      actor,
      sessionId: session.sessionId,
      requestId: randomUUID(),
      expectedLastSequence: 0,
      message: "Hãy viết hộ em mở bài hoàn chỉnh.",
    });
    assert.equal(fallbackTurn.responseMode, "fallback");
    assert.doesNotMatch(fallbackTurn.assistantMessage.content, /Câu năm/);

    const timeoutFake = new FakeSocraticAi();
    timeoutFake.nextError = fakeProviderError("AI_TIMEOUT", "timed out");
    await assert.rejects(
      () =>
        sendSocraticTurn(prisma, timeoutFake, {
          actor,
          sessionId: session.sessionId,
          requestId: randomUUID(),
          expectedLastSequence: 2,
          message: "Em hỏi tiếp.",
        }),
      (error: unknown) => error instanceof DomainError && error.code === "AI_TIMEOUT",
    );
    const messages = await prisma.chatMessage.findMany({ where: { sessionId: session.sessionId } });
    assert.equal(messages.length, 2);
  });
});

test("replay after a new prisma handle; different payload with same key is rejected", async () => {
  await withTestPrisma(async (prisma) => {
    const { assignment, actor } = await publishedFixture(prisma, "SOC-REPLAY");
    const session = await openOrResumeSocraticSession(prisma, { actor, assignmentId: assignment.id });
    const requestId = randomUUID();
    const fake = new FakeSocraticAi();
    const first = await sendSocraticTurn(prisma, fake, {
      actor,
      sessionId: session.sessionId,
      requestId,
      expectedLastSequence: 0,
      message: "Em chưa biết mở bài.",
    });
    const handle = createPrismaHandle(requireTestDatabaseUrl());
    try {
      const replayFake = new FakeSocraticAi();
      const replayed = await sendSocraticTurn(handle.prisma, replayFake, {
        actor,
        sessionId: session.sessionId,
        requestId,
        expectedLastSequence: 0,
        message: "Em chưa biết mở bài.",
      });
      assert.equal(replayed.responseMode, "replay");
      assert.equal(replayed.userMessage.id, first.userMessage.id);
      assert.equal(replayed.assistantMessage.id, first.assistantMessage.id);
      assert.equal(replayFake.calls.length, 0);
      await assert.rejects(
        () =>
          sendSocraticTurn(handle.prisma, replayFake, {
            actor,
            sessionId: session.sessionId,
            requestId,
            expectedLastSequence: 0,
            message: "Câu hỏi khác cùng key.",
          }),
        (error: unknown) => error instanceof DomainError && error.code === "REQUEST_ID_CONFLICT",
      );
    } finally {
      await disconnectPrismaHandle(handle);
    }
    const count = await prisma.chatMessage.count({ where: { sessionId: session.sessionId } });
    assert.equal(count, 2);
  });
});

test("concurrent turns, duplicate request keys, and outline change during generation", async () => {
  await withTestPrisma(async (prisma) => {
    const { assignment, actor } = await publishedFixture(prisma, "SOC-RACE");
    const session = await openOrResumeSocraticSession(prisma, { actor, assignmentId: assignment.id });

    const fakeA = new FakeSocraticAi();
    const fakeB = new FakeSocraticAi();
    const raced = await Promise.allSettled([
      sendSocraticTurn(prisma, fakeA, {
        actor,
        sessionId: session.sessionId,
        requestId: randomUUID(),
        expectedLastSequence: 0,
        message: "Lượt A",
      }),
      sendSocraticTurn(prisma, fakeB, {
        actor,
        sessionId: session.sessionId,
        requestId: randomUUID(),
        expectedLastSequence: 0,
        message: "Lượt B",
      }),
    ]);
    const fulfilled = raced.filter((item) => item.status === "fulfilled");
    const rejected = raced.filter((item) => item.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    if (rejected[0]?.status === "rejected") {
      assert.equal((rejected[0].reason as DomainError).code, "TURN_CONFLICT");
    }
    const afterRace = await getSocraticSession(prisma, { actor, sessionId: session.sessionId });
    assert.equal(afterRace.messages.length, 2);

    const dupFake = new FakeSocraticAi();
    const dupId = randomUUID();
    const duplicates = await Promise.all([
      sendSocraticTurn(prisma, dupFake, {
        actor,
        sessionId: session.sessionId,
        requestId: dupId,
        expectedLastSequence: afterRace.lastSequence,
        message: "Cùng một câu hỏi",
      }),
      sendSocraticTurn(prisma, dupFake, {
        actor,
        sessionId: session.sessionId,
        requestId: dupId,
        expectedLastSequence: afterRace.lastSequence,
        message: "Cùng một câu hỏi",
      }),
    ]);
    assert.equal(duplicates[0]?.userMessage.id, duplicates[1]?.userMessage.id);
    const afterDup = await getSocraticSession(prisma, { actor, sessionId: session.sessionId });
    assert.equal(afterDup.messages.length, 4);

    const holdFake = new FakeSocraticAi();
    let release!: () => void;
    holdFake.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inflight = sendSocraticTurn(prisma, holdFake, {
      actor,
      sessionId: session.sessionId,
      requestId: randomUUID(),
      expectedLastSequence: afterDup.lastSequence,
      message: "Em hỏi trong lúc sửa dàn ý.",
    });
    const waitStart = Date.now();
    while (holdFake.calls.length === 0 && Date.now() - waitStart < 2000) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(holdFake.calls.length, 1);
    await saveStudentOutline(prisma, {
      actor,
      sessionId: session.sessionId,
      expectedOutlineRevision: afterDup.outlineRevision,
      outline: { sections: [{ id: "open", title: "Mở bài", points: ["Đặt vấn đề"] }] },
    });
    release();
    await assert.rejects(
      () => inflight,
      (error: unknown) => error instanceof DomainError && error.code === "TURN_CONFLICT",
    );
    const finalMessages = await prisma.chatMessage.count({ where: { sessionId: session.sessionId } });
    assert.equal(finalMessages, 4);
  });
});
