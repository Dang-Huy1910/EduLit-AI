import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import { apiRequest, createUserWithPassword, errorCode, loginCookie, withHttpApp } from "../helpers/http.js";

const assignmentBody = {
  title: "Nộp bài ảnh riêng tư",
  instructions: "Viết bài nghị luận có luận điểm và dẫn chứng.",
  genre: "NLXH",
  gradeLevel: 12,
  learningMaterialText: "Mỗi người đóng góp một phần cho cộng đồng.",
  rubric: { criteria: [
    { criterionId: "C1", name: "Luận điểm", weight: "5.00", descriptor: "Luận điểm rõ." },
    { criterionId: "C2", name: "Dẫn chứng", weight: "5.00", descriptor: "Dẫn chứng phù hợp." },
  ] },
  maxScore: "10.00",
  scoreStep: "0.25",
};

test("private image OCR uses a masked derivative and only teacher confirmation creates Submission", async () => {
  await withHttpApp(async (client) => {
    const teacher = await createUserWithPassword(client.prisma, { loginId: `gv-ocr-${randomUUID()}`, displayName: "Giáo viên", role: "TEACHER" });
    const otherTeacher = await createUserWithPassword(client.prisma, { loginId: `gv-ocr-other-${randomUUID()}`, displayName: "Giáo viên khác", role: "TEACHER" });
    const student = await createUserWithPassword(client.prisma, { loginId: `hs-ocr-${randomUUID()}`, displayName: "Học sinh", role: "STUDENT" });
    const otherStudent = await createUserWithPassword(client.prisma, { loginId: `hs-ocr-other-${randomUUID()}`, displayName: "Học sinh khác", role: "STUDENT" });
    const teacherCookie = await loginCookie(client, teacher.loginId);
    const otherTeacherCookie = await loginCookie(client, otherTeacher.loginId);
    const studentCookie = await loginCookie(client, student.loginId);
    const otherStudentCookie = await loginCookie(client, otherStudent.loginId);

    const created = await apiRequest(client.baseUrl, "/teacher/assignments", { method: "POST", body: assignmentBody, cookie: teacherCookie });
    const assignment = created.json as { id: string };
    assert.equal(created.status, 201);
    assert.equal((await apiRequest(client.baseUrl, `/teacher/assignments/${assignment.id}/publish`, { method: "POST", body: {}, cookie: teacherCookie })).status, 201);

    const opened = await apiRequest(client.baseUrl, "/submission-drafts", { method: "POST", body: { assignmentId: assignment.id }, cookie: studentCookie });
    assert.equal(opened.status, 201, JSON.stringify(opened.json));
    const draft = opened.json as { id: string; revision: number };
    const image = await sharp({ create: { width: 120, height: 80, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
    const blockedForm = new FormData(); blockedForm.set("expectedRevision", "1"); blockedForm.set("file", new Blob([image], { type: "image/png" }), "page.png");
    const blocked = await apiRequest(client.baseUrl, `/submission-drafts/${draft.id}/pages`, { method: "POST", body: blockedForm, cookie: studentCookie, origin: "http://attacker.invalid" });
    assert.equal(blocked.status, 403);

    const uploadForm = new FormData(); uploadForm.set("expectedRevision", "1"); uploadForm.set("file", new Blob([image], { type: "image/png" }), "page.png");
    const uploaded = await apiRequest(client.baseUrl, `/submission-drafts/${draft.id}/pages`, { method: "POST", body: uploadForm, cookie: studentCookie });
    assert.equal(uploaded.status, 201);
    const uploadedDraft = uploaded.json as { revision: number; pages: Array<{ id: string; derivativeUrl: string }> };
    assert.equal(uploadedDraft.revision, 2);
    const page = uploadedDraft.pages[0]!;

    const masked = await apiRequest(client.baseUrl, `/submission-drafts/${draft.id}/pages/${page.id}/masks`, { method: "PUT", body: { expectedRevision: 2, masks: [{ x: 0, y: 0, width: 1, height: 0.25 }] }, cookie: studentCookie });
    assert.equal(masked.status, 200);
    const maskedDraft = masked.json as { revision: number; pages: Array<{ id: string; derivativeUrl: string }> };
    assert.equal(maskedDraft.revision, 3);
    const derivativeResponse = await fetch(`${client.baseUrl.replace(/\/api$/, "")}${maskedDraft.pages[0]!.derivativeUrl}`, { headers: { cookie: studentCookie } });
    assert.equal(derivativeResponse.status, 200);
    const derivativeRaw = await sharp(Buffer.from(await derivativeResponse.arrayBuffer())).raw().toBuffer();
    assert.ok(derivativeRaw[0]! < 8 && derivativeRaw[1]! < 8 && derivativeRaw[2]! < 8, "mask must be burned into derivative pixels");

    const privacy = await apiRequest(client.baseUrl, `/submission-drafts/${draft.id}/privacy-review`, { method: "POST", body: { expectedRevision: 3 }, cookie: studentCookie });
    assert.equal(privacy.status, 201);
    const foreignReview = await apiRequest(client.baseUrl, `/teacher/submission-drafts/${draft.id}/privacy-review`, { method: "POST", body: { approve: true }, cookie: otherTeacherCookie });
    assert.equal(foreignReview.status, 404);
    const approved = await apiRequest(client.baseUrl, `/teacher/submission-drafts/${draft.id}/privacy-review`, { method: "POST", body: { approve: true }, cookie: teacherCookie });
    assert.equal(approved.status, 201);

    const storedPage = await client.prisma.submissionDraftPage.findUniqueOrThrow({ where: { id: page.id } });
    client.vision.register(storedPage.contentHash, { pages: [{ pageId: page.id, segments: [{ id: "s1", text: "Bản chép nguyên văn 🙂", needsReview: false }] }] });
    const ocr = await apiRequest(client.baseUrl, `/teacher/submission-drafts/${draft.id}/ocr`, { method: "POST", body: {}, cookie: teacherCookie });
    assert.equal(ocr.status, 201);
    const ocrDraft = ocr.json as { status: string; ocr: { id: string; revision: number; correctedText: string } };
    assert.equal(ocrDraft.status, "OCR_REVIEW");
    assert.equal(ocrDraft.ocr.correctedText, "Bản chép nguyên văn 🙂");
    const issue = await apiRequest(client.baseUrl, `/submission-drafts/${draft.id}/ocr-issues`, { method: "POST", body: { ocrRevisionId: ocrDraft.ocr.id, pageId: page.id, segmentId: "s1", reportedText: "nguyên văn", note: "kiểm tra lại" }, cookie: studentCookie });
    assert.equal(issue.status, 201);
    const correction = await apiRequest(client.baseUrl, `/teacher/submission-drafts/${draft.id}/ocr/correct`, { method: "POST", body: { expectedOcrRevision: 1, correctedText: "Bản cuối giữ nguyên 🙂", reason: "Đối chiếu ảnh" }, cookie: teacherCookie });
    assert.equal(correction.status, 201);
    const confirmed = await apiRequest(client.baseUrl, `/teacher/submission-drafts/${draft.id}/ocr/confirm`, { method: "POST", body: { expectedOcrRevision: 2 }, cookie: teacherCookie });
    assert.equal(confirmed.status, 201);
    assert.equal((confirmed.json as { source: string; text: string }).source, "IMAGE_OCR");
    assert.equal((confirmed.json as { text: string }).text, "Bản cuối giữ nguyên 🙂");

    const submission = confirmed.json as { id: string };
    const graded = await apiRequest(client.baseUrl, `/teacher/submissions/${submission.id}/assess`, { method: "POST", body: {}, cookie: teacherCookie });
    assert.equal(graded.status, 201);
    const assessment = (graded.json as { assessment: { id: string; detailedEvaluations: Array<{ criterionId: string; awardedScore: string; comment: string; strengths: string[]; weaknesses: string[]; evidence: Array<{ quote: string; start: number; end: number }>; missingElements: string[] }> } }).assessment;
    const pending = await apiRequest(client.baseUrl, `/submissions/${submission.id}`, { cookie: studentCookie });
    assert.equal((pending.json as { assessment: { status: string } }).assessment.status, "PENDING");
    const reviewedEvaluations = assessment.detailedEvaluations.map((evaluation, index) => index === 0 ? { ...evaluation, awardedScore: "2.25", comment: "Giáo viên điều chỉnh sau khi đối chiếu ảnh." } : evaluation);
    const reviewed = await apiRequest(client.baseUrl, `/teacher/assessments/${assessment.id}/review`, { method: "POST", body: { expectedReviewRevision: 0, detailedEvaluations: reviewedEvaluations, totalScore: "4.75", reason: "Đối chiếu bản chép đã xác nhận" }, cookie: teacherCookie });
    assert.equal(reviewed.status, 201);
    assert.equal((reviewed.json as { aiTotalScore: string; totalScore: string; reviewRevision: number }).aiTotalScore, "5.00");
    assert.equal((reviewed.json as { totalScore: string }).totalScore, "4.75");
    const publishedAssessment = await apiRequest(client.baseUrl, `/teacher/assessments/${assessment.id}/publish`, { method: "POST", body: {}, cookie: teacherCookie });
    assert.equal(publishedAssessment.status, 201);
    const result = await apiRequest(client.baseUrl, `/submissions/${submission.id}`, { cookie: studentCookie });
    assert.equal((result.json as { assessment: { status: string; totalScore: string } }).assessment.status, "PUBLISHED");
    assert.equal((result.json as { assessment: { totalScore: string } }).assessment.totalScore, "4.75");
    type ProfilePayload = { profile: { version: number } | null; observations: Array<{ id: string }> };
    let profile: ProfilePayload | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await apiRequest(client.baseUrl, "/profile", { cookie: studentCookie });
      profile = response.json as ProfilePayload;
      if (profile?.observations.length) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(profile?.observations.length, "published assessment should enqueue and complete profile extraction");
    const profileJob = await apiRequest(client.baseUrl, `/teacher/assessments/${assessment.id}/profile-extraction`, { cookie: teacherCookie });
    assert.equal((profileJob.json as { status: string }).status, "COMPLETED");
    const resolvedProfile = profile as ProfilePayload;
    const reviewedObservation = await apiRequest(client.baseUrl, `/teacher/observations/${resolvedProfile.observations[0]!.id}/review`, { method: "POST", body: { status: "SUPPORTED", expectedProfileVersion: resolvedProfile.profile!.version }, cookie: teacherCookie });
    assert.equal(reviewedObservation.status, 201);

    const lockedPage = await client.prisma.submissionDraftPage.findUniqueOrThrow({ where: { id: page.id } });
    const forbiddenFile = await apiRequest(client.baseUrl, `/files/${lockedPage.originalFileId}`, { cookie: otherStudentCookie });
    assert.equal(forbiddenFile.status, 404);
    assert.equal(errorCode(forbiddenFile.json), "NOT_FOUND");
  });
});
