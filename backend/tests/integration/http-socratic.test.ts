import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { DomainError } from "../../src/core/errors.js";
import { fakeProviderError } from "../../src/infrastructure/ai/fake-socratic.adapter.js";
import { createAssignment } from "../../src/modules/assignments/application/create-assignment.js";
import { submitAssignment } from "../../src/modules/assessment/application/submit-assignment.js";
import { SAMPLE_RUBRIC } from "../helpers/db.js";
import {
  apiRequest,
  createUserWithPassword,
  errorCode,
  loginCookie,
  withHttpApp,
  type HttpClient,
} from "../helpers/http.js";

const SAMPLE_OUTLINE = {
  sections: [{ id: "open", title: "Mở bài", points: ["Đặt vấn đề"] }],
};

async function publishedSetup(client: HttpClient, code = `SOC-${randomUUID().slice(0, 8)}`) {
  const teacher = await createUserWithPassword(client.prisma, {
    loginId: `gv-${randomUUID()}`,
    displayName: "Giáo viên",
    role: "TEACHER",
  });
  const student = await createUserWithPassword(client.prisma, {
    loginId: `hs-${randomUUID()}`,
    displayName: "Học sinh",
    role: "STUDENT",
  });
  const assignment = await createAssignment(client.prisma, {
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
  const cookie = await loginCookie(client, student.loginId);
  return { teacher, student, assignment, cookie };
}

test("open/resume, save outline, send turn, and replay the same requestId", async () => {
  await withHttpApp(async (client) => {
    const setup = await publishedSetup(client);
    const opened = await apiRequest(
      client.baseUrl,
      `/assignments/${setup.assignment.id}/socratic-sessions`,
      { method: "POST", body: {}, cookie: setup.cookie },
    );
    assert.equal(opened.status, 200);
    const session = opened.json as {
      sessionId: string;
      resumed: boolean;
      lastSequence: number;
      outlineRevision: number;
      snapshot: { title: string };
    };
    assert.equal(session.resumed, false);
    assert.equal(session.lastSequence, 0);
    assert.equal(session.snapshot.title, "Bản lĩnh");

    const resumed = await apiRequest(
      client.baseUrl,
      `/assignments/${setup.assignment.id}/socratic-sessions`,
      { method: "POST", body: {}, cookie: setup.cookie },
    );
    assert.equal((resumed.json as { resumed: boolean }).resumed, true);
    assert.equal((resumed.json as { sessionId: string }).sessionId, session.sessionId);

    const saved = await apiRequest(client.baseUrl, `/socratic-sessions/${session.sessionId}/outline`, {
      method: "PUT",
      body: { outline: SAMPLE_OUTLINE, expectedOutlineRevision: session.outlineRevision },
      cookie: setup.cookie,
    });
    assert.equal(saved.status, 200);
    assert.equal((saved.json as { outlineRevision: number }).outlineRevision, 2);

    const requestId = randomUUID();
    const turn = await apiRequest(client.baseUrl, `/socratic-sessions/${session.sessionId}/turns`, {
      method: "POST",
      body: { requestId, expectedLastSequence: 0, message: "Em chưa biết mở bài." },
      cookie: setup.cookie,
    });
    assert.equal(turn.status, 200);
    const turnBody = turn.json as {
      lastSequence: number;
      responseMode: string;
      userMessage: { content: string; requestId: string };
      assistantMessage: { content: string };
    };
    assert.equal(turnBody.lastSequence, 2);
    assert.equal(turnBody.userMessage.requestId, requestId);
    assert.equal(client.ai.calls.length, 1);

    const replay = await apiRequest(client.baseUrl, `/socratic-sessions/${session.sessionId}/turns`, {
      method: "POST",
      body: { requestId, expectedLastSequence: 0, message: "Em chưa biết mở bài." },
      cookie: setup.cookie,
    });
    assert.equal(replay.status, 200);
    assert.equal((replay.json as { responseMode: string }).responseMode, "replay");
    assert.equal(client.ai.calls.length, 1);
    const stored = await client.prisma.chatMessage.count({ where: { sessionId: session.sessionId } });
    assert.equal(stored, 2);

    const conflictKey = await apiRequest(client.baseUrl, `/socratic-sessions/${session.sessionId}/turns`, {
      method: "POST",
      body: { requestId, expectedLastSequence: 2, message: "Nội dung khác." },
      cookie: setup.cookie,
    });
    assert.equal(conflictKey.status, 409);
    assert.equal(errorCode(conflictKey.json), "REQUEST_ID_CONFLICT");
  });
});

test("revision/sequence conflict, foreign session, closed and submitted sessions", async () => {
  await withHttpApp(async (client) => {
    const setup = await publishedSetup(client);
    const other = await createUserWithPassword(client.prisma, {
      loginId: `hs-other-${randomUUID()}`,
      displayName: "Khác",
      role: "STUDENT",
    });
    const otherCookie = await loginCookie(client, other.loginId);
    const opened = await apiRequest(
      client.baseUrl,
      `/assignments/${setup.assignment.id}/socratic-sessions`,
      { method: "POST", body: {}, cookie: setup.cookie },
    );
    const sessionId = (opened.json as { sessionId: string }).sessionId;
    const revision = (opened.json as { outlineRevision: number }).outlineRevision;

    const stale = await apiRequest(client.baseUrl, `/socratic-sessions/${sessionId}/outline`, {
      method: "PUT",
      body: { outline: SAMPLE_OUTLINE, expectedOutlineRevision: revision + 5 },
      cookie: setup.cookie,
    });
    assert.equal(stale.status, 409);
    assert.equal(errorCode(stale.json), "OUTLINE_VERSION");

    const foreign = await apiRequest(client.baseUrl, `/socratic-sessions/${sessionId}`, {
      cookie: otherCookie,
    });
    assert.equal(foreign.status, 404);
    assert.equal(errorCode(foreign.json), "NOT_FOUND");

    const sequence = await apiRequest(client.baseUrl, `/socratic-sessions/${sessionId}/turns`, {
      method: "POST",
      body: { requestId: randomUUID(), expectedLastSequence: 9, message: "Em hỏi." },
      cookie: setup.cookie,
    });
    assert.equal(sequence.status, 409);
    assert.equal(errorCode(sequence.json), "TURN_CONFLICT");

    await client.prisma.assignment.update({
      where: { id: setup.assignment.id },
      data: { status: "CLOSED" },
    });
    const closedOpen = await apiRequest(
      client.baseUrl,
      `/assignments/${setup.assignment.id}/socratic-sessions`,
      { method: "POST", body: {}, cookie: setup.cookie },
    );
    assert.equal(closedOpen.status, 409);
    assert.equal(errorCode(closedOpen.json), "SESSION_ASSIGNMENT");

    const closedGet = await apiRequest(client.baseUrl, `/socratic-sessions/${sessionId}`, {
      cookie: setup.cookie,
    });
    assert.equal(closedGet.status, 200);
    const closedTurn = await apiRequest(client.baseUrl, `/socratic-sessions/${sessionId}/turns`, {
      method: "POST",
      body: { requestId: randomUUID(), expectedLastSequence: 0, message: "Em hỏi." },
      cookie: setup.cookie,
    });
    assert.equal(closedTurn.status, 409);
    assert.equal(errorCode(closedTurn.json), "SESSION_CLOSED");

    const setup2 = await publishedSetup(client, `SUB-${randomUUID().slice(0, 8)}`);
    const opened2 = await apiRequest(
      client.baseUrl,
      `/assignments/${setup2.assignment.id}/socratic-sessions`,
      { method: "POST", body: {}, cookie: setup2.cookie },
    );
    const session2 = (opened2.json as { sessionId: string }).sessionId;
    await submitAssignment(client.prisma, {
      studentId: setup2.student.id,
      assignmentId: setup2.assignment.id,
      text: "Bài đã nộp.",
      socraticSessionId: session2,
    });
    const submittedTurn = await apiRequest(client.baseUrl, `/socratic-sessions/${session2}/turns`, {
      method: "POST",
      body: { requestId: randomUUID(), expectedLastSequence: 0, message: "Em hỏi." },
      cookie: setup2.cookie,
    });
    assert.equal(submittedTurn.status, 409);
    assert.equal(errorCode(submittedTurn.json), "SESSION_SUBMITTED");
  });
});

test("invalid input does not persist and provider errors map to HTTP", async () => {
  await withHttpApp(async (client) => {
    const setup = await publishedSetup(client);
    const opened = await apiRequest(
      client.baseUrl,
      `/assignments/${setup.assignment.id}/socratic-sessions`,
      { method: "POST", body: {}, cookie: setup.cookie },
    );
    const sessionId = (opened.json as { sessionId: string }).sessionId;

    const badOutline = await apiRequest(client.baseUrl, `/socratic-sessions/${sessionId}/outline`, {
      method: "PUT",
      body: { outline: { sections: "nope" }, expectedOutlineRevision: 1 },
      cookie: setup.cookie,
    });
    assert.equal(badOutline.status, 400);
    const unchanged = await client.prisma.socraticSession.findUniqueOrThrow({ where: { id: sessionId } });
    assert.equal(unchanged.outlineRevision, 1);

    client.ai.nextError = fakeProviderError("RATE_LIMITED", "gemini rate limited");
    const rate = await apiRequest(client.baseUrl, `/socratic-sessions/${sessionId}/turns`, {
      method: "POST",
      body: { requestId: randomUUID(), expectedLastSequence: 0, message: "Em hỏi." },
      cookie: setup.cookie,
    });
    assert.equal(rate.status, 429);
    assert.equal(errorCode(rate.json), "RATE_LIMITED");

    client.ai.nextError = fakeProviderError("MODEL_UNAVAILABLE", "down");
    const unavailable = await apiRequest(client.baseUrl, `/socratic-sessions/${sessionId}/turns`, {
      method: "POST",
      body: { requestId: randomUUID(), expectedLastSequence: 0, message: "Em hỏi." },
      cookie: setup.cookie,
    });
    assert.equal(unavailable.status, 503);

    client.ai.nextError = fakeProviderError("AI_TIMEOUT", "timeout");
    const timeout = await apiRequest(client.baseUrl, `/socratic-sessions/${sessionId}/turns`, {
      method: "POST",
      body: { requestId: randomUUID(), expectedLastSequence: 0, message: "Em hỏi." },
      cookie: setup.cookie,
    });
    assert.equal(timeout.status, 504);

    client.ai.nextError = new DomainError("AI_NOT_CONFIGURED", "missing key");
    const missing = await apiRequest(client.baseUrl, `/socratic-sessions/${sessionId}/turns`, {
      method: "POST",
      body: { requestId: randomUUID(), expectedLastSequence: 0, message: "Em hỏi." },
      cookie: setup.cookie,
    });
    assert.equal(missing.status, 503);

    const messages = await client.prisma.chatMessage.count({ where: { sessionId } });
    assert.equal(messages, 0);
  });
});

