import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { apiRequest, createUserWithPassword, errorCode, loginCookie, withHttpApp } from "../helpers/http.js";

const assignmentBody = {
  title: "Trách nhiệm với cộng đồng",
  instructions: "Viết bài nghị luận có luận điểm và dẫn chứng.",
  genre: "NLXH",
  gradeLevel: 12,
  learningMaterialText: "Một cộng đồng mạnh khi mỗi người chủ động góp phần.",
  rubric: { criteria: [
    { criterionId: "C1", name: "Luận điểm", weight: "5.00", descriptor: "Luận điểm rõ." },
    { criterionId: "C2", name: "Dẫn chứng", weight: "5.00", descriptor: "Dẫn chứng phù hợp." },
  ] },
  maxScore: "10.00",
  scoreStep: "0.25",
};

test("teacher owns draft CRUD/publish/close while students can open only the published code", async () => {
  await withHttpApp(async (client) => {
    const teacher = await createUserWithPassword(client.prisma, { loginId: `gv-${randomUUID()}`, displayName: "Giáo viên", role: "TEACHER" });
    const otherTeacher = await createUserWithPassword(client.prisma, { loginId: `gv-other-${randomUUID()}`, displayName: "Giáo viên khác", role: "TEACHER" });
    const student = await createUserWithPassword(client.prisma, { loginId: `hs-${randomUUID()}`, displayName: "Học sinh", role: "STUDENT" });
    const teacherCookie = await loginCookie(client, teacher.loginId);
    const otherCookie = await loginCookie(client, otherTeacher.loginId);
    const studentCookie = await loginCookie(client, student.loginId);

    const created = await apiRequest(client.baseUrl, "/teacher/assignments", { method: "POST", body: assignmentBody, cookie: teacherCookie });
    assert.equal(created.status, 201);
    const draft = created.json as { id: string; code: string; status: string; updatedAt: string };
    assert.equal(draft.status, "DRAFT");
    assert.match(draft.code, /^EDU-/);

    const forbidden = await apiRequest(client.baseUrl, `/teacher/assignments/${draft.id}`, { cookie: otherCookie });
    assert.equal(forbidden.status, 404);
    const studentDetail = await apiRequest(client.baseUrl, `/assignments/code/${draft.code}`, { cookie: studentCookie });
    assert.equal(studentDetail.status, 404);

    const edited = await apiRequest(client.baseUrl, `/teacher/assignments/${draft.id}`, {
      method: "PATCH", cookie: teacherCookie,
      body: { ...assignmentBody, title: "Trách nhiệm của người trẻ", expectedUpdatedAt: draft.updatedAt },
    });
    assert.equal(edited.status, 200);
    const updated = edited.json as { title: string; updatedAt: string };
    assert.equal(updated.title, "Trách nhiệm của người trẻ");
    const stale = await apiRequest(client.baseUrl, `/teacher/assignments/${draft.id}`, {
      method: "PATCH", cookie: teacherCookie,
      body: { ...assignmentBody, expectedUpdatedAt: draft.updatedAt },
    });
    assert.equal(stale.status, 409);

    const published = await apiRequest(client.baseUrl, `/teacher/assignments/${draft.id}/publish`, { method: "POST", body: {}, cookie: teacherCookie });
    assert.equal(published.status, 201);
    assert.equal((published.json as { status: string }).status, "PUBLISHED");
    const opened = await apiRequest(client.baseUrl, `/assignments/code/${draft.code}`, { cookie: studentCookie });
    assert.equal(opened.status, 200);
    const read = await apiRequest(client.baseUrl, `/assignments/${draft.id}/read`, { method: "POST", body: {}, cookie: studentCookie });
    assert.equal(read.status, 200);
    const progress = await client.prisma.assignmentProgress.findUnique({ where: { studentId_assignmentId: { studentId: student.id, assignmentId: draft.id } } });
    assert.ok(progress?.readAt);

    const closed = await apiRequest(client.baseUrl, `/teacher/assignments/${draft.id}/close`, { method: "POST", body: {}, cookie: teacherCookie });
    assert.equal(closed.status, 201);
    const reopened = await apiRequest(client.baseUrl, `/assignments/code/${draft.code}`, { cookie: studentCookie });
    assert.equal(reopened.status, 404);
    assert.equal(errorCode(reopened.json), "NOT_FOUND");
  });
});
