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

test("open with AI writes a suggested outline and welcome once; resume does not regenerate", async () => {
  await withTestPrisma(async (prisma) => {
    const fake = new FakeSocraticAi();
    const { assignment, actor } = await publishedFixture(prisma, "SOC-SCAFFOLD");
    const opened = await openOrResumeSocraticSession(prisma, {
      actor,
      assignmentId: assignment.id,
      ai: fake,
    });
    assert.equal(opened.resumed, false);
    assert.equal(opened.lastSequence, 1);
    assert.equal(opened.messages[0]?.role, "ASSISTANT");
    assert.match(opened.messages[0]?.content ?? "", /dàn ý gợi ý/i);
    assert.ok(opened.outline.sections.length >= 3);
    assert.ok((opened.outline.sections[0]?.points.length ?? 0) > 0);
    assert.equal(fake.outlineCalls.length, 1);

    const resumed = await openOrResumeSocraticSession(prisma, {
      actor,
      assignmentId: assignment.id,
      ai: fake,
    });
    assert.equal(resumed.resumed, true);
    assert.equal(resumed.lastSequence, 1);
    assert.equal(fake.outlineCalls.length, 1);

    const legacy = await publishedFixture(prisma, "SOC-LEGACY");
    const empty = await openOrResumeSocraticSession(prisma, {
      actor: legacy.actor,
      assignmentId: legacy.assignment.id,
    });
    assert.equal(empty.lastSequence, 0);
    assert.equal(empty.outline.sections.length, 0);
    const filled = await openOrResumeSocraticSession(prisma, {
      actor: legacy.actor,
      assignmentId: legacy.assignment.id,
      ai: fake,
    });
    assert.equal(filled.resumed, true);
    assert.equal(filled.lastSequence, 1);
    assert.ok(filled.outline.sections.length >= 3);
  });
});

test("concurrent AI opens coalesce into one scaffold request", async () => {
  await withTestPrisma(async (prisma) => {
    const fake = new FakeSocraticAi();
    const { assignment, actor } = await publishedFixture(prisma, "SOC-SCAFFOLD-SINGLE-FLIGHT");
    let releaseProvider!: () => void;
    fake.hold = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });

    const first = openOrResumeSocraticSession(prisma, { actor, assignmentId: assignment.id, ai: fake });
    for (let attempt = 0; attempt < 20 && fake.outlineCalls.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(fake.outlineCalls.length, 1);

    const second = openOrResumeSocraticSession(prisma, { actor, assignmentId: assignment.id, ai: fake });
    releaseProvider();
    const [opened, resumed] = await Promise.all([first, second]);

    assert.equal(opened.sessionId, resumed.sessionId);
    assert.equal(opened.resumed, false);
    assert.equal(resumed.resumed, true);
    assert.equal(fake.outlineCalls.length, 1);
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
      message: "Em chưa biết nên mở bài bằng nhận định nào.",
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

test("write-for-student requests skip the provider and persist the approved refusal", async () => {
  await withTestPrisma(async (prisma) => {
    const { assignment, actor } = await publishedFixture(prisma, "SOC-WRITE");
    const session = await openOrResumeSocraticSession(prisma, { actor, assignmentId: assignment.id });
    const fake = new FakeSocraticAi();
    fake.nextOutput = {
      replySentences: [
        "Trong cuộc sống, ý chí và lòng kiên định là ngọn lửa soi đường cho con người vượt qua nghịch cảnh.",
        "Nhờ giữ vững niềm tin và bền bỉ theo đuổi mục tiêu, người trẻ có thể biến khó khăn thành cơ hội để trưởng thành.",
        "Em có muốn dùng hai câu trên làm phần mở bài không?",
      ],
      focusCriterionIds: [],
    };
    const turn = await sendSocraticTurn(prisma, fake, {
      actor,
      sessionId: session.sessionId,
      requestId: randomUUID(),
      expectedLastSequence: 0,
      message: "Viết giúp em một mở bài để em chép vào bài văn.",
    });
    assert.equal(fake.calls.length, 0);
    assert.equal(turn.responseMode, "fallback");
    assert.match(turn.assistantMessage.content, /không cung cấp bài mẫu/);
    assert.doesNotMatch(turn.assistantMessage.content, /ngọn lửa soi đường/);
  });
});

test("unlabeled sample output is replaced with fallback for an ordinary question", async () => {
  await withTestPrisma(async (prisma) => {
    const { assignment, actor } = await publishedFixture(prisma, "SOC-SAMPLE");
    const session = await openOrResumeSocraticSession(prisma, { actor, assignmentId: assignment.id });
    const fake = new FakeSocraticAi();
    fake.nextOutput = {
      replySentences: [
        "Trong cuộc sống, ý chí và lòng kiên định là ngọn lửa soi đường cho con người vượt qua nghịch cảnh.",
        "Nhờ giữ vững niềm tin và bền bỉ theo đuổi mục tiêu, người trẻ có thể biến khó khăn thành cơ hội để trưởng thành.",
        "Em có muốn dùng hai câu trên làm phần mở bài không?",
      ],
      focusCriterionIds: [],
    };
    const turn = await sendSocraticTurn(prisma, fake, {
      actor,
      sessionId: session.sessionId,
      requestId: randomUUID(),
      expectedLastSequence: 0,
      message: "Em chưa biết nên mở bài bằng nhận định nào.",
    });
    assert.equal(fake.calls.length, 1);
    assert.equal(turn.responseMode, "fallback");
    assert.doesNotMatch(turn.assistantMessage.content, /ngọn lửa soi đường/);
  });
});

test("deactivating the student during generation prevents persist", async () => {
  await withTestPrisma(async (prisma) => {
    const { assignment, actor, student } = await publishedFixture(prisma, "SOC-INACTIVE");
    const session = await openOrResumeSocraticSession(prisma, { actor, assignmentId: assignment.id });
    const holdFake = new FakeSocraticAi();
    let release!: () => void;
    holdFake.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inflight = sendSocraticTurn(prisma, holdFake, {
      actor,
      sessionId: session.sessionId,
      requestId: randomUUID(),
      expectedLastSequence: 0,
      message: "Em chưa biết mở bài.",
    });
    const waitStart = Date.now();
    while (holdFake.calls.length === 0 && Date.now() - waitStart < 2000) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(holdFake.calls.length, 1);
    await prisma.user.update({ where: { id: student.id }, data: { status: "INACTIVE" } });
    release();
    await assert.rejects(
      () => inflight,
      (error: unknown) => error instanceof DomainError && error.code === "ACTOR_INACTIVE",
    );
    const count = await prisma.chatMessage.count({ where: { sessionId: session.sessionId } });
    assert.equal(count, 0);
  });
});

test("duplicate in-flight requestId returns replay mode for the committed pair", async () => {
  await withTestPrisma(async (prisma) => {
    const { assignment, actor } = await publishedFixture(prisma, "SOC-DUP-MODE");
    const session = await openOrResumeSocraticSession(prisma, { actor, assignmentId: assignment.id });
    const requestId = randomUUID();
    const message = "Em chưa biết nên mở bài bằng nhận định nào.";

    const fakeA = new FakeSocraticAi();
    fakeA.nextOutput = {
      replySentences: ["Câu một. Câu hai. Câu ba. Câu bốn. Câu năm vẫn dài."],
      focusCriterionIds: [],
    };
    let releaseA!: () => void;
    fakeA.hold = new Promise<void>((resolve) => {
      releaseA = resolve;
    });

    const fakeB = new FakeSocraticAi();
    fakeB.nextOutput = {
      replySentences: [
        "Em đang đi đúng hướng khi tự đặt vấn đề.",
        "Em muốn làm rõ luận điểm nào trước?",
      ],
      focusCriterionIds: [],
    };
    fakeB.usage = { totalTokenCount: 88 };
    let releaseB!: () => void;
    fakeB.hold = new Promise<void>((resolve) => {
      releaseB = resolve;
    });

    const pendingA = sendSocraticTurn(prisma, fakeA, {
      actor,
      sessionId: session.sessionId,
      requestId,
      expectedLastSequence: 0,
      message,
    });
    const pendingB = sendSocraticTurn(prisma, fakeB, {
      actor,
      sessionId: session.sessionId,
      requestId,
      expectedLastSequence: 0,
      message,
    });
    const waitStart = Date.now();
    while ((fakeA.calls.length === 0 || fakeB.calls.length === 0) && Date.now() - waitStart < 2000) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(fakeA.calls.length, 1);
    assert.equal(fakeB.calls.length, 1);
    releaseA();
    const first = await pendingA;
    releaseB();
    const second = await pendingB;
    assert.equal(first.responseMode, "fallback");
    assert.equal(second.responseMode, "replay");
    assert.equal(second.assistantMessage.content, first.assistantMessage.content);
    assert.equal(second.userMessage.id, first.userMessage.id);
    assert.equal(second.usage, undefined);
    assert.match(first.assistantMessage.content, /chưa dùng được câu trả lời/);
    const count = await prisma.chatMessage.count({ where: { sessionId: session.sessionId } });
    assert.equal(count, 2);
  });
});

test("sends rubric descriptors through the fake adapter payload", async () => {
  await withTestPrisma(async (prisma) => {
    const teacher = await createTeacher(prisma);
    const student = await createStudent(prisma, `hs-${randomUUID()}`, "Học sinh thử");
    const assignment = await createAssignment(prisma, {
      teacherId: teacher.id,
      code: "SOC-RUBRIC",
      title: "Bản lĩnh",
      instructions: "Viết nghị luận về bản lĩnh người trẻ.",
      genre: "NLXH",
      gradeLevel: 12,
      learningMaterialText: "Ngữ liệu: thành tích cần đi cùng sự trung thực.",
      rubric: {
        criteria: [
          {
            criterionId: "C1",
            name: "Bố cục",
            weight: "4.00",
            descriptor: "Mở–thân–kết mạch lạc.",
            requiredElements: ["phân biệt kiên định với bảo thủ"],
          },
          {
            criterionId: "C2",
            name: "Luận điểm",
            weight: "6.00",
            descriptor: "Luận điểm rõ.",
            requiredElements: ["dẫn chứng từ tình huống lớp học"],
          },
        ],
      },
      maxScore: "10.00",
      scoreStep: "0.25",
      status: "PUBLISHED",
    });
    const actor: StudentActor = { userId: student.id, role: "STUDENT" };
    const session = await openOrResumeSocraticSession(prisma, { actor, assignmentId: assignment.id });
    const fake = new FakeSocraticAi();
    await sendSocraticTurn(prisma, fake, {
      actor,
      sessionId: session.sessionId,
      requestId: randomUUID(),
      expectedLastSequence: 0,
      message: "Em chưa biết mở bài.",
    });
    assert.match(fake.calls[0]?.userPayload ?? "", /phân biệt kiên định với bảo thủ/);
    assert.match(fake.calls[0]?.userPayload ?? "", /dẫn chứng từ tình huống lớp học/);
  });
});
