import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import { DomainError } from "../../src/core/errors.js";
import { renderOcrFixturePng } from "../../src/infrastructure/vision/ocr-fixtures.js";
import { apiRequest, createUserWithPassword, errorCode, loginCookie, withHttpApp } from "../helpers/http.js";

const rubric2 = {
  criteria: [
    { criterionId: "C1", name: "Luận điểm", weight: "5.00", descriptor: "Luận điểm rõ." },
    { criterionId: "C2", name: "Dẫn chứng", weight: "5.00", descriptor: "Dẫn chứng phù hợp." },
  ],
};

function assignmentBody(title: string) {
  return {
    title,
    instructions: "Viết bài nghị luận có luận điểm và dẫn chứng.",
    genre: "NLXH" as const,
    gradeLevel: 12,
    learningMaterialText: "Mỗi người đóng góp một phần cho cộng đồng.",
    rubric: rubric2,
    maxScore: "10.00",
    scoreStep: "0.25",
  };
}

async function publishAssignment(baseUrl: string, cookie: string, title: string) {
  const created = await apiRequest(baseUrl, "/teacher/assignments", { method: "POST", body: assignmentBody(title), cookie });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  const assignment = created.json as { id: string; code: string };
  const published = await apiRequest(baseUrl, `/teacher/assignments/${assignment.id}/publish`, { method: "POST", body: {}, cookie });
  assert.equal(published.status, 201, JSON.stringify(published.json));
  return assignment;
}

async function waitJob(baseUrl: string, cookie: string, assessmentId: string, status: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await apiRequest(baseUrl, `/teacher/assessments/${assessmentId}/profile-extraction`, { cookie });
    if (response.status === 200 && (response.json as { status?: string }).status === status) {
      return response.json as { status: string; noObservations?: boolean; attempts: number; observations: unknown[] };
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`profile job did not reach ${status}`);
}

test("student progress uses server state and hides AI_DRAFT scores", async () => {
  await withHttpApp(async (client) => {
    const teacher = await createUserWithPassword(client.prisma, { loginId: `gv-prog-${randomUUID()}`, displayName: "Giáo viên", role: "TEACHER" });
    const student = await createUserWithPassword(client.prisma, { loginId: `hs-prog-${randomUUID()}`, displayName: "Học sinh", role: "STUDENT" });
    const teacherCookie = await loginCookie(client, teacher.loginId);
    const studentCookie = await loginCookie(client, student.loginId);
    const assignment = await publishAssignment(client.baseUrl, teacherCookie, "Tiến độ năm bước");

    const unread = await apiRequest(client.baseUrl, `/assignments/${assignment.id}/progress`, { cookie: studentCookie });
    assert.equal(unread.status, 200);
    const unreadView = unread.json as { steps: Record<string, string>; assessment: unknown };
    assert.equal(unreadView.steps.reading, "not_started");
    assert.equal(unreadView.assessment, null);

    const marked = await apiRequest(client.baseUrl, `/assignments/${assignment.id}/read`, { method: "POST", body: {}, cookie: studentCookie });
    assert.equal(marked.status, 200);
    const afterRead = await apiRequest(client.baseUrl, `/assignments/${assignment.id}/progress`, { cookie: studentCookie });
    assert.equal((afterRead.json as { steps: { reading: string } }).steps.reading, "complete");
  });
});

test("CLOSED assignment is hidden unless the student already participated", async () => {
  await withHttpApp(async (client) => {
    const teacher = await createUserWithPassword(client.prisma, { loginId: `gv-closed-${randomUUID()}`, displayName: "Giáo viên", role: "TEACHER" });
    const owner = await createUserWithPassword(client.prisma, { loginId: `hs-closed-own-${randomUUID()}`, displayName: "Học sinh đã đọc", role: "STUDENT" });
    const stranger = await createUserWithPassword(client.prisma, { loginId: `hs-closed-new-${randomUUID()}`, displayName: "Học sinh mới", role: "STUDENT" });
    const teacherCookie = await loginCookie(client, teacher.loginId);
    const ownerCookie = await loginCookie(client, owner.loginId);
    const strangerCookie = await loginCookie(client, stranger.loginId);
    const assignment = await publishAssignment(client.baseUrl, teacherCookie, "Đề sẽ đóng");
    assert.equal((await apiRequest(client.baseUrl, `/assignments/${assignment.id}/read`, { method: "POST", body: {}, cookie: ownerCookie })).status, 200);
    assert.equal((await apiRequest(client.baseUrl, `/teacher/assignments/${assignment.id}/close`, { method: "POST", body: {}, cookie: teacherCookie })).status, 201);

    const owned = await apiRequest(client.baseUrl, `/assignments/${assignment.id}`, { cookie: ownerCookie });
    assert.equal(owned.status, 200);
    assert.equal((owned.json as { status: string }).status, "CLOSED");
    const ownedProgress = await apiRequest(client.baseUrl, `/assignments/${assignment.id}/progress`, { cookie: ownerCookie });
    assert.equal(ownedProgress.status, 200);

    const hidden = await apiRequest(client.baseUrl, `/assignments/${assignment.id}`, { cookie: strangerCookie });
    assert.equal(hidden.status, 404);
    const hiddenProgress = await apiRequest(client.baseUrl, `/assignments/${assignment.id}/progress`, { cookie: strangerCookie });
    assert.equal(hiddenProgress.status, 404);
    const newSession = await apiRequest(client.baseUrl, `/assignments/${assignment.id}/socratic-sessions`, { method: "POST", body: {}, cookie: strangerCookie });
    assert.equal(newSession.status, 409);
  });
});

test("mock OCR matches fixture sourceHash and rejects unknown images", async () => {
  await withHttpApp(async (client) => {
    const teacher = await createUserWithPassword(client.prisma, { loginId: `gv-fix-${randomUUID()}`, displayName: "Giáo viên", role: "TEACHER" });
    const student = await createUserWithPassword(client.prisma, { loginId: `hs-fix-${randomUUID()}`, displayName: "Học sinh", role: "STUDENT" });
    const teacherCookie = await loginCookie(client, teacher.loginId);
    const studentCookie = await loginCookie(client, student.loginId);
    const assignment = await publishAssignment(client.baseUrl, teacherCookie, "OCR fixture catalog");

    const opened = await apiRequest(client.baseUrl, "/submission-drafts", { method: "POST", body: { assignmentId: assignment.id }, cookie: studentCookie });
    assert.equal(opened.status, 201);
    const draft = opened.json as { id: string; revision: number };
    const page1 = await renderOcrFixturePng("nlxh-p1");
    const page2 = await renderOcrFixturePng("nlxh-p2");
    const form1 = new FormData();
    form1.set("expectedRevision", String(draft.revision));
    form1.set("file", new Blob([page1], { type: "image/png" }), "p1.png");
    const uploaded1 = await apiRequest(client.baseUrl, `/submission-drafts/${draft.id}/pages`, { method: "POST", body: form1, cookie: studentCookie });
    assert.equal(uploaded1.status, 201);
    const after1 = uploaded1.json as { revision: number; pages: Array<{ id: string }> };
    const form2 = new FormData();
    form2.set("expectedRevision", String(after1.revision));
    form2.set("file", new Blob([page2], { type: "image/png" }), "p2.png");
    const uploaded2 = await apiRequest(client.baseUrl, `/submission-drafts/${draft.id}/pages`, { method: "POST", body: form2, cookie: studentCookie });
    assert.equal(uploaded2.status, 201);
    const after2 = uploaded2.json as { revision: number; pages: Array<{ id: string }> };
    assert.equal(after2.pages.length, 2);
    const reversed = [...after2.pages].reverse().map((page) => page.id);
    const reordered = await apiRequest(client.baseUrl, `/submission-drafts/${draft.id}/pages/order`, {
      method: "PUT",
      body: { expectedRevision: after2.revision, pageIds: reversed },
      cookie: studentCookie,
    });
    assert.equal(reordered.status, 200);
    const ordered = reordered.json as { revision: number; pages: Array<{ id: string }> };
    const masked = await apiRequest(client.baseUrl, `/submission-drafts/${draft.id}/pages/${ordered.pages[0]!.id}/masks`, {
      method: "PUT",
      body: { expectedRevision: ordered.revision, masks: [{ x: 0, y: 0, width: 1, height: 0.18 }] },
      cookie: studentCookie,
    });
    assert.equal(masked.status, 200);
    const maskedDraft = masked.json as { revision: number };
    const privacy = await apiRequest(client.baseUrl, `/submission-drafts/${draft.id}/privacy-review`, { method: "POST", body: { expectedRevision: maskedDraft.revision }, cookie: studentCookie });
    assert.equal(privacy.status, 201);
    const approved = await apiRequest(client.baseUrl, `/teacher/submission-drafts/${draft.id}/privacy-review`, { method: "POST", body: { approve: true }, cookie: teacherCookie });
    assert.equal(approved.status, 201);
    const ocr = await apiRequest(client.baseUrl, `/teacher/submission-drafts/${draft.id}/ocr`, { method: "POST", body: {}, cookie: teacherCookie });
    assert.equal(ocr.status, 201, JSON.stringify(ocr.json));
    const ocrDraft = ocr.json as { status: string; ocr: { correctedText: string } };
    assert.equal(ocrDraft.status, "OCR_REVIEW");
    assert.match(ocrDraft.ocr.correctedText, /Ý chí giúp người trẻ/);
    assert.match(ocrDraft.ocr.correctedText, /không sao chép văn mẫu/);
    assert.equal(client.vision.calls.length, 1);
    assert.ok(client.vision.calls[0]?.pages.every((page) => page.sourceHash && page.sourceHash !== page.contentHash));
  });
});

test("unknown mock image fails OCR without inventing text", async () => {
  await withHttpApp(async (client) => {
    const teacher = await createUserWithPassword(client.prisma, { loginId: `gv-unk-${randomUUID()}`, displayName: "Giáo viên", role: "TEACHER" });
    const student = await createUserWithPassword(client.prisma, { loginId: `hs-unk-${randomUUID()}`, displayName: "Học sinh", role: "STUDENT" });
    const teacherCookie = await loginCookie(client, teacher.loginId);
    const studentCookie = await loginCookie(client, student.loginId);
    const assignment = await publishAssignment(client.baseUrl, teacherCookie, "Ảnh lạ");
    const opened = await apiRequest(client.baseUrl, "/submission-drafts", { method: "POST", body: { assignmentId: assignment.id }, cookie: studentCookie });
    const draft = opened.json as { id: string; revision: number };
    const blank = await sharp({ create: { width: 120, height: 80, channels: 3, background: { r: 200, g: 10, b: 10 } } }).png().toBuffer();
    const form = new FormData();
    form.set("expectedRevision", String(draft.revision));
    form.set("file", new Blob([blank], { type: "image/png" }), "blank.png");
    const uploaded = await apiRequest(client.baseUrl, `/submission-drafts/${draft.id}/pages`, { method: "POST", body: form, cookie: studentCookie });
    const page = (uploaded.json as { pages: Array<{ id: string }>; revision: number });
    await apiRequest(client.baseUrl, `/submission-drafts/${draft.id}/pages/${page.pages[0]!.id}/masks`, {
      method: "PUT",
      body: { expectedRevision: page.revision, masks: [{ x: 0, y: 0, width: 1, height: 0.18 }] },
      cookie: studentCookie,
    });
    const afterMask = await apiRequest(client.baseUrl, `/submission-drafts/${draft.id}`, { cookie: studentCookie });
    const revision = (afterMask.json as { revision: number }).revision;
    await apiRequest(client.baseUrl, `/submission-drafts/${draft.id}/privacy-review`, { method: "POST", body: { expectedRevision: revision }, cookie: studentCookie });
    await apiRequest(client.baseUrl, `/teacher/submission-drafts/${draft.id}/privacy-review`, { method: "POST", body: { approve: true }, cookie: teacherCookie });
    const ocr = await apiRequest(client.baseUrl, `/teacher/submission-drafts/${draft.id}/ocr`, { method: "POST", body: {}, cookie: teacherCookie });
    assert.equal(ocr.status, 503);
    assert.equal(errorCode(ocr.json), "PROVIDER_UNAVAILABLE");
    const failed = await apiRequest(client.baseUrl, `/submission-drafts/${draft.id}`, { cookie: studentCookie });
    assert.equal((failed.json as { status: string }).status, "OCR_FAILED");
  });
});

test("profile extraction fail/retry/empty and Socratic uses observations while grader does not", async () => {
  await withHttpApp(async (client) => {
    const teacher = await createUserWithPassword(client.prisma, { loginId: `gv-prof-${randomUUID()}`, displayName: "Giáo viên", role: "TEACHER" });
    const student = await createUserWithPassword(client.prisma, { loginId: `hs-prof-${randomUUID()}`, displayName: "Học sinh", role: "STUDENT" });
    const teacherCookie = await loginCookie(client, teacher.loginId);
    const studentCookie = await loginCookie(client, student.loginId);
    const first = await publishAssignment(client.baseUrl, teacherCookie, "NLXH nguồn profile");
    const next = await publishAssignment(client.baseUrl, teacherCookie, "NLXH đề sau cùng genre");

    client.writingProfileAi.nextError = new DomainError("AI_TIMEOUT", "injected timeout");
    const submission = await confirmFixtureEssay(client.baseUrl, teacherCookie, studentCookie, first.id, "nlxh-p1");
    const graded = await apiRequest(client.baseUrl, `/teacher/submissions/${submission.id}/assess`, { method: "POST", body: {}, cookie: teacherCookie });
    assert.equal(graded.status, 201);
    const assessment = (graded.json as { assessment: { id: string } }).assessment;
    const published = await apiRequest(client.baseUrl, `/teacher/assessments/${assessment.id}/publish`, { method: "POST", body: {}, cookie: teacherCookie });
    assert.equal(published.status, 201);
    const failedJob = await waitJob(client.baseUrl, teacherCookie, assessment.id, "FAILED");
    assert.equal(failedJob.status, "FAILED");
    const studentAfterFail = await apiRequest(client.baseUrl, `/submissions/${submission.id}`, { cookie: studentCookie });
    assert.equal((studentAfterFail.json as { assessment: { status: string } }).assessment.status, "PUBLISHED");

    const callsBeforeRetry = client.writingProfileAi.calls.length;
    const retried = await apiRequest(client.baseUrl, `/teacher/assessments/${assessment.id}/profile-extraction/retry`, { method: "POST", body: {}, cookie: teacherCookie });
    assert.equal(retried.status, 201);
    const completed = await waitJob(client.baseUrl, teacherCookie, assessment.id, "COMPLETED");
    assert.equal(completed.status, "COMPLETED");
    assert.equal(completed.noObservations, false);
    assert.ok(client.writingProfileAi.calls.length > callsBeforeRetry);
    const profile = await apiRequest(client.baseUrl, "/profile", { cookie: studentCookie });
    const observations = (profile.json as { observations: Array<{ evidenceQuote: string }> }).observations;
    assert.ok(observations.length > 0);
    const quote = observations[0]!.evidenceQuote;

    const opened = await apiRequest(client.baseUrl, `/assignments/${next.id}/socratic-sessions`, { method: "POST", body: {}, cookie: studentCookie });
    assert.equal(opened.status, 200, JSON.stringify(opened.json));
    const session = opened.json as { sessionId: string; lastSequence: number };
    const turn = await apiRequest(client.baseUrl, `/socratic-sessions/${session.sessionId}/turns`, {
      method: "POST",
      body: { requestId: randomUUID(), expectedLastSequence: session.lastSequence, message: "Em muốn làm rõ luận điểm nào trước?" },
      cookie: studentCookie,
    });
    assert.equal(turn.status, 200, JSON.stringify(turn.json));
    const socraticPayload = client.ai.calls.at(-1)?.userPayload ?? "";
    assert.match(socraticPayload, /Observation còn hiệu lực/);
    assert.match(socraticPayload, new RegExp(quote.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const nextSubmission = await confirmFixtureEssay(client.baseUrl, teacherCookie, studentCookie, next.id, "nlxh-p2");
    const nextGraded = await apiRequest(client.baseUrl, `/teacher/submissions/${nextSubmission.id}/assess`, { method: "POST", body: {}, cookie: teacherCookie });
    assert.equal(nextGraded.status, 201);
    const scoringCall = client.assessmentAi.calls.at(-1);
    assert.ok(scoringCall);
    assert.deepEqual(Object.keys(scoringCall.scoringInput).sort(), ["assignmentSnapshot", "submissionText"]);
    assert.doesNotMatch(scoringCall.userPayload, /Observation còn hiệu lực/);

    client.writingProfileAi.nextOutput = { observations: [] };
    const emptyAssignment = await publishAssignment(client.baseUrl, teacherCookie, "NLXH empty observations");
    const emptySubmission = await confirmFixtureEssay(client.baseUrl, teacherCookie, studentCookie, emptyAssignment.id, "nlxh-p1");
    const emptyGraded = await apiRequest(client.baseUrl, `/teacher/submissions/${emptySubmission.id}/assess`, { method: "POST", body: {}, cookie: teacherCookie });
    const emptyAssessment = (emptyGraded.json as { assessment: { id: string } }).assessment;
    assert.equal((await apiRequest(client.baseUrl, `/teacher/assessments/${emptyAssessment.id}/publish`, { method: "POST", body: {}, cookie: teacherCookie })).status, 201);
    const emptyJob = await waitJob(client.baseUrl, teacherCookie, emptyAssessment.id, "COMPLETED");
    assert.equal(emptyJob.noObservations, true);
    const callsAfterEmpty = client.writingProfileAi.calls.length;
    const emptyRetry = await apiRequest(client.baseUrl, `/teacher/assessments/${emptyAssessment.id}/profile-extraction/retry`, { method: "POST", body: {}, cookie: teacherCookie });
    assert.equal(emptyRetry.status, 201);
    assert.equal(client.writingProfileAi.calls.length, callsAfterEmpty);
  });
});

async function confirmFixtureEssay(
  baseUrl: string,
  teacherCookie: string,
  studentCookie: string,
  assignmentId: string,
  fixtureId: "nlxh-p1" | "nlxh-p2",
) {
  const opened = await apiRequest(baseUrl, "/submission-drafts", { method: "POST", body: { assignmentId }, cookie: studentCookie });
  const draft = opened.json as { id: string; revision: number };
  const png = await renderOcrFixturePng(fixtureId);
  const form = new FormData();
  form.set("expectedRevision", String(draft.revision));
  form.set("file", new Blob([png], { type: "image/png" }), `${fixtureId}.png`);
  const uploaded = await apiRequest(baseUrl, `/submission-drafts/${draft.id}/pages`, { method: "POST", body: form, cookie: studentCookie });
  const page = uploaded.json as { revision: number; pages: Array<{ id: string }> };
  const masked = await apiRequest(baseUrl, `/submission-drafts/${draft.id}/pages/${page.pages[0]!.id}/masks`, {
    method: "PUT",
    body: { expectedRevision: page.revision, masks: [{ x: 0, y: 0, width: 1, height: 0.18 }] },
    cookie: studentCookie,
  });
  const maskedDraft = masked.json as { revision: number };
  await apiRequest(baseUrl, `/submission-drafts/${draft.id}/privacy-review`, { method: "POST", body: { expectedRevision: maskedDraft.revision }, cookie: studentCookie });
  await apiRequest(baseUrl, `/teacher/submission-drafts/${draft.id}/privacy-review`, { method: "POST", body: { approve: true }, cookie: teacherCookie });
  const ocr = await apiRequest(baseUrl, `/teacher/submission-drafts/${draft.id}/ocr`, { method: "POST", body: {}, cookie: teacherCookie });
  assert.equal(ocr.status, 201, JSON.stringify(ocr.json));
  const ocrDraft = ocr.json as { ocr: { revision: number } };
  const confirmed = await apiRequest(baseUrl, `/teacher/submission-drafts/${draft.id}/ocr/confirm`, {
    method: "POST",
    body: { expectedOcrRevision: ocrDraft.ocr.revision },
    cookie: teacherCookie,
  });
  assert.equal(confirmed.status, 201, JSON.stringify(confirmed.json));
  return confirmed.json as { id: string };
}
