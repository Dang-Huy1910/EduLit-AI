import { expect, test, type APIRequestContext, type APIResponse, type Browser, type BrowserContext, type Page } from '@playwright/test';
import type { TeacherAssignment, ClassroomDetail, Term } from '../../src/features/catalog/types';
import type { TeacherAssessmentDetail } from '../../src/features/assessment/types';
import type { SubmissionPayload } from '../../src/features/submission/types';

const mutationHeaders = { Origin: process.env.E2E_BASE_URL || 'http://localhost:3000', 'X-Edulit-CSRF': '1' };

async function payload<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), `${response.status()} ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<T>;
}

async function teacherContext(browser: Browser, baseURL: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL });
  await payload(await context.request.post('/api/auth/login', { headers: mutationHeaders, data: {
    loginId: process.env.BOOTSTRAP_TEACHER_LOGIN_ID || 'dang.loan',
    password: process.env.BOOTSTRAP_TEACHER_PASSWORD || 'DanPhuong@2024',
  } }));
  return context;
}

async function register(context: BrowserContext, suffix: string) {
  const response = await payload<{ user: { id: string; displayName: string } }>(await context.request.post('/api/auth/register', { headers: mutationHeaders, data: {
    loginId: `f2.${suffix}`, email: `f2.${suffix}@example.test`, displayName: `Học sinh F2 ${suffix}`,
    password: 'hoc-sinh-kiem-thu-15',
  } }));
  return response.user;
}

async function fixture(api: APIRequestContext, suffix: string) {
  const { items: terms } = await payload<{ items: Term[] }>(await api.get('/api/terms'));
  const term = terms.find((row) => row.status === 'ACTIVE');
  expect(term, 'Cần kỳ học ACTIVE từ seed 0013').toBeTruthy();
  const classroom = await payload<ClassroomDetail>(await api.post('/api/teacher/classrooms', { headers: mutationHeaders, data: {
    termId: term!.id, code: `F2-${suffix}`, name: `Lớp F2 ${suffix}`, gradeLevel: 11,
  } }));
  const material = await payload<{ id: string }>(await api.post('/api/teacher/materials', { headers: mutationHeaders, data: {
    title: 'Ngữ liệu F2', content: 'Trách nhiệm của tuổi trẻ với cộng đồng và cuộc sống.', gradeLevel: 11,
  } }));
  const prompt = await payload<{ id: string }>(await api.post('/api/teacher/prompts', { headers: mutationHeaders, data: {
    title: 'Đề F2', writingTask: 'Viết bài nghị luận về trách nhiệm của tuổi trẻ với cộng đồng.', genre: 'NLXH', gradeLevel: 11, materialIds: [material.id],
  } }));
  const assignment = await payload<TeacherAssignment>(await api.post('/api/teacher/assignments', { headers: mutationHeaders, data: {
    sourcePromptId: prompt.id, classroomId: classroom.id, title: `Bài tập F2 ${suffix}`, assignToWholeClass: true,
    dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), latePolicy: 'ALLOW_LATE', maxRevisions: 0,
    assignmentRubric: { title: 'Barem F2', maxScore: 10, scoreStep: .25, gradeLevel: 11,
      criteria: [{ id: 'C1', name: 'Nội dung', weight: 10, guideNote: 'Lập luận có dẫn chứng.' }] },
  } }));
  return { assignment, classroom };
}

async function submitRound(studentPage: Page, student: BrowserContext, assignmentId: string) {
  if (!studentPage.url().includes(`/assignments/${assignmentId}/submit`)) {
    await studentPage.goto(`/assignments/${assignmentId}/submit`);
  }
  const image = await studentPage.screenshot({ type: 'png' });
  await studentPage.locator('input[type=file]').first().setInputFiles({ name: 'bai-viet.png', mimeType: 'image/png', buffer: image });
  const submitButton = studentPage.getByRole('button', { name: 'Xác nhận Nộp & Chuyển sang Đối chiếu OCR', exact: true });
  await expect(submitButton).toBeEnabled();
  await submitButton.click();
  await expect(studentPage).toHaveURL(/\/ocr$/, { timeout: 30_000 });
  await expect.poll(async () => {
    const data = await payload<SubmissionPayload>(await student.request.get(`/api/assignments/${assignmentId}/ocr`));
    return data.status;
  }, { timeout: 45_000 }).toBe('review');
  const ocr = await payload<SubmissionPayload>(await student.request.get(`/api/assignments/${assignmentId}/ocr`));
  await payload(await student.request.post(`/api/assignments/${assignmentId}/ocr/confirm`, { headers: mutationHeaders, data: { expectedRevision: ocr.expectedRevision } }));
}

async function publishCurrent(teacher: BrowserContext, assignmentId: string, studentId: string, raiseToMax: boolean) {
  const detailPath = `/api/teacher/assignments/${assignmentId}/students/${studentId}/assessment`;
  await expect.poll(async () => (await payload<TeacherAssessmentDetail>(await teacher.request.get(detailPath))).assessment.status, { timeout: 45_000 }).toMatch(/^(awaiting_review|new_version_review)$/);
  let detail = await payload<TeacherAssessmentDetail>(await teacher.request.get(detailPath));
  let result = detail.assessment.currentResult!;
  if (raiseToMax) {
    const evaluations = detail.assessment.working?.evaluations ?? [];
    expect(evaluations.length).toBeGreaterThan(0);
    detail = await payload<TeacherAssessmentDetail>(await teacher.request.patch(detailPath, { headers: mutationHeaders, data: {
      resultId: result.id,
      transcriptionRevisionId: result.transcriptionRevisionId,
      expectedVersion: result.version,
      evaluations: evaluations.map((item) => ({
        criterionId: item.criterionId,
        awardedScore: item.maxScore,
        comment: item.comment,
        strengths: item.strengths,
        weaknesses: item.weaknesses,
      })),
    } }));
    result = detail.assessment.currentResult!;
  }
  await payload(await teacher.request.post(`${detailPath}/publish`, { headers: mutationHeaders, data: {
    resultId: result.id, transcriptionRevisionId: result.transcriptionRevisionId, expectedVersion: result.version,
  } }));
}

test('giáo viên bật viết lại, học sinh nộp bản 2 và thấy so sánh sau khi công bố', async ({ browser, baseURL }) => {
  test.setTimeout(240_000);
  const web = baseURL!;
  const suffix = `${Date.now()}`;
  const teacher = await teacherContext(browser, web);
  const student = await browser.newContext({ baseURL: web });
  try {
    const { assignment, classroom } = await fixture(teacher.request, suffix);
    const user = await register(student, suffix);
    await payload(await student.request.post('/api/student/classrooms/join', { headers: mutationHeaders, data: { code: classroom.joinCode } }));
    await payload(await teacher.request.post(`/api/teacher/assignments/${assignment.id}/publish`, { headers: mutationHeaders, data: {} }));

    const teacherPage = await teacher.newPage();
    await teacherPage.goto(`/assignments/${assignment.id}`);
    const rewrite = teacherPage.getByRole('combobox', { name: 'Cho phép viết lại sau khi có điểm' });
    await expect(rewrite).toBeVisible();
    await rewrite.selectOption('1');
    await teacherPage.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await expect.poll(async () => (await payload<TeacherAssignment>(await teacher.request.get(`/api/teacher/assignments/${assignment.id}`))).maxRevisions).toBe(1);
    await expect(teacherPage.getByText('Đã lưu thay đổi. Học sinh thấy thông tin mới ngay.')).toBeVisible();

    const studentPage = await student.newPage();
    await submitRound(studentPage, student, assignment.id);
    await publishCurrent(teacher, assignment.id, user.id, false);

    await studentPage.goto(`/assignments/${assignment.id}/result`);
    await studentPage.getByRole('button', { name: 'Viết lại bản 2', exact: true }).click();
    await expect(studentPage).toHaveURL(new RegExp(`/assignments/${assignment.id}/submit$`), { timeout: 30_000 });
    await expect(studentPage.getByText('Bản 2', { exact: true })).toBeVisible();
    await expect(studentPage.getByText('Điểm bản trước vẫn giữ cho tới khi bản mới được công bố.')).toBeVisible();

    await submitRound(studentPage, student, assignment.id);
    await publishCurrent(teacher, assignment.id, user.id, true);

    await studentPage.goto(`/assignments/${assignment.id}/result`);
    const roundSelect = studentPage.getByLabel('Chọn bản');
    await expect(roundSelect.locator('option')).toHaveText(['Bản 1', 'Bản 2 (đang công bố)']);
    await expect(roundSelect).toHaveValue('2');
    const comparison = studentPage.getByRole('region', { name: 'So với bản trước' });
    await expect(comparison).toBeVisible();
    await expect(comparison).toContainText('tăng');
    await studentPage.getByRole('link', { name: 'In phiếu', exact: true }).click();
    await expect(studentPage).toHaveURL(/\/result\/print$/, { timeout: 30_000 });
    await expect(studentPage.locator('.feedback-sheet')).toContainText('Bản 2');
    await expect(studentPage.locator('.feedback-sheet')).toContainText(/Điểm bản 1\s*\d+\.\d{2} điểm/);

    await teacherPage.goto(`/reports/${assignment.id}`);
    await teacherPage.getByLabel('Lọc trạng thái').selectOption('revised');
    await teacherPage.getByPlaceholder('Tìm theo tên hoặc mã HS...').fill(user.displayName);
    const row = teacherPage.locator('tbody tr').filter({ has: teacherPage.getByText(user.displayName, { exact: true }) });
    await expect(row).toContainText('Bản 2');
    await expect(row).toContainText(/Bản 1: .+ → hiện tại:/);

    await teacherPage.goto(`/assignments/${assignment.id}`);
    await teacherPage.getByRole('combobox', { name: 'Cho phép viết lại sau khi có điểm' }).selectOption('0');
    await teacherPage.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await expect(teacherPage.getByRole('group', { name: 'Cho phép viết lại sau khi có điểm' }).getByRole('alert')).toContainText('Không thể giảm số lượt dưới số bản viết lại học sinh đã bắt đầu.');
  } finally {
    await teacher.close();
    await student.close();
  }
});
