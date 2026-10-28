import { expect, test, type APIRequestContext, type APIResponse, type Browser, type BrowserContext } from '@playwright/test';
import type { TeacherAssignment, ClassroomDetail, Term, TeacherDocument } from '../../src/features/catalog/types';
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
    loginId: `f1.${suffix}`, email: `f1.${suffix}@example.test`, displayName: `Học sinh F1 ${suffix}`,
    password: 'hoc-sinh-kiem-thu-15',
  } }));
  return response.user;
}
async function studentContext(browser: Browser, baseURL: string) {
  return browser.newContext({ baseURL });
}
async function fixture(api: APIRequestContext, suffix: string) {
  const { items: terms } = await payload<{ items: Term[] }>(await api.get('/api/terms'));
  const term = terms.find((row) => row.status === 'ACTIVE');
  expect(term, 'Cần kỳ học ACTIVE từ seed 0013').toBeTruthy();
  const classroom = await payload<ClassroomDetail>(await api.post('/api/teacher/classrooms', { headers: mutationHeaders, data: {
    termId: term!.id, code: `F1-${suffix}`, name: `Lớp F1 ${suffix}`, gradeLevel: 11,
  } }));
  const material = await payload<{ id: string }>(await api.post('/api/teacher/materials', { headers: mutationHeaders, data: {
    title: 'Ngữ liệu F1', content: 'Trách nhiệm của tuổi trẻ với cộng đồng và cuộc sống.', gradeLevel: 11,
  } }));
  const prompt = await payload<{ id: string }>(await api.post('/api/teacher/prompts', { headers: mutationHeaders, data: {
    title: 'Đề F1', writingTask: 'Viết bài nghị luận về trách nhiệm của tuổi trẻ với cộng đồng.', genre: 'NLXH', gradeLevel: 11, materialIds: [material.id],
  } }));
  const assignment = await payload<TeacherAssignment>(await api.post('/api/teacher/assignments', { headers: mutationHeaders, data: {
    sourcePromptId: prompt.id, classroomId: classroom.id, title: `Bài tập F1 ${suffix}`, assignToWholeClass: true,
    dueAt: new Date(Date.now() - 86_400_000).toISOString(), latePolicy: 'CLOSE_AT_DUE',
    assignmentRubric: { title: 'Barem F1', maxScore: 10, scoreStep: .25, gradeLevel: 11,
      criteria: [{ id: 'C1', name: 'Nội dung', weight: 10, guideNote: 'Lập luận có dẫn chứng.' }] },
  } }));
  return { assignment, classroom };
}

test('bài đã khoá → giáo viên gia hạn → học sinh nộp; Excel và phiếu chỉ lấy kết quả công bố', async ({ browser, baseURL }) => {
  test.setTimeout(180_000);
  const web = baseURL!;
  const suffix = `${Date.now()}`;
  const teacher = await teacherContext(browser, web);
  const student = await studentContext(browser, web);
  const unsubmitted = await studentContext(browser, web);
  try {
    const { assignment, classroom } = await fixture(teacher.request, suffix);
    const user = await register(student, suffix);
    const skippedUser = await register(unsubmitted, `${suffix}b`);
    for (const context of [student, unsubmitted]) await payload(await context.request.post('/api/student/classrooms/join', { headers: mutationHeaders, data: { code: classroom.joinCode } }));
    await payload(await teacher.request.post(`/api/teacher/assignments/${assignment.id}/publish`, { headers: mutationHeaders, data: {} }));
    const studentPage = await student.newPage();
    await studentPage.goto('/assignments');
    const card = studentPage.locator('.glass-card').filter({ has: studentPage.getByRole('heading', { name: assignment.title, exact: true }) });
    await expect(card).toContainText('Đã khoá');
    await studentPage.goto(`/assignments/${assignment.id}/submit`);
    await expect(studentPage.getByText('Đã khoá', { exact: true })).toBeVisible();
    await expect(studentPage.getByRole('button', { name: /Chọn.*ảnh|Tải.*ảnh/ }).first()).toBeDisabled();
    await expect(studentPage.getByRole('button', { name: 'Tạo lượt nộp ảnh mới', exact: true })).toBeDisabled();
    const blocked = await student.request.post(`/api/assignments/${assignment.id}/submission/new-attempt`, { headers: mutationHeaders, data: {} });
    expect(blocked.status()).toBe(409);
    expect((await blocked.json()).error.code).toBe('SUBMISSION_CLOSED');

    const teacherPage = await teacher.newPage();
    await teacherPage.goto(`/reports/${assignment.id}`);
    await teacherPage.getByRole('button', { name: `Gia hạn cho ${user.displayName}`, exact: true }).click();
    await teacherPage.getByRole('button', { name: '+3 ngày', exact: true }).click();
    await teacherPage.getByRole('button', { name: 'Lưu hạn mới', exact: true }).click();
    await expect(teacherPage.getByRole('dialog', { name: 'Gia hạn cho học sinh' })).toBeHidden();
    await expect(teacherPage.getByText('Đã được gia hạn', { exact: true })).toBeVisible();
    await studentPage.reload();
    await expect(studentPage.getByText(/đã được gia hạn/)).toBeVisible();
    const image = await studentPage.screenshot({ type: 'png' });
    await studentPage.locator('input[type=file]').first().setInputFiles({ name: 'bai-viet.png', mimeType: 'image/png', buffer: image });
    const submitButton = studentPage.getByRole('button', { name: 'Xác nhận Nộp & Chuyển sang Đối chiếu OCR', exact: true });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();
    await expect(studentPage).toHaveURL(/\/ocr$/);
    await expect.poll(async () => {
      const data = await payload<SubmissionPayload>(await student.request.get(`/api/assignments/${assignment.id}/ocr`));
      return data.status;
    }, { timeout: 30_000 }).toBe('review');
    const ocr = await payload<SubmissionPayload>(await student.request.get(`/api/assignments/${assignment.id}/ocr`));
    await payload(await student.request.post(`/api/assignments/${assignment.id}/ocr/confirm`, { headers: mutationHeaders, data: { expectedRevision: ocr.expectedRevision } }));
    const detailPath = `/api/teacher/assignments/${assignment.id}/students/${user.id}/assessment`;
    await expect.poll(async () => (await payload<TeacherAssessmentDetail>(await teacher.request.get(detailPath))).assessment.status, { timeout: 30_000 }).toBe('awaiting_review');
    const detail = await payload<TeacherAssessmentDetail>(await teacher.request.get(detailPath));
    const result = detail.assessment.currentResult!;
    await payload(await teacher.request.post(`${detailPath}/publish`, { headers: mutationHeaders, data: { resultId: result.id, transcriptionRevisionId: result.transcriptionRevisionId, expectedVersion: result.version } }));

    const publishedDetail = await payload<TeacherAssessmentDetail>(await teacher.request.get(detailPath));
    await payload(await teacher.request.patch(detailPath, { headers: mutationHeaders, data: {
      resultId: publishedDetail.assessment.currentResult!.id, transcriptionRevisionId: publishedDetail.assessment.currentResult!.transcriptionRevisionId,
      expectedVersion: publishedDetail.assessment.currentResult!.version, overallComment: 'Nhận xét đang rà soát không được in F1',
    } }));
    await teacherPage.reload();
    await teacherPage.getByRole('button', { name: 'Gỡ gia hạn', exact: true }).click();
    await expect(teacherPage.getByText('Đã được gia hạn', { exact: true })).toHaveCount(0);
    await teacherPage.getByLabel('Lọc trạng thái').selectOption('late');
    await teacherPage.getByPlaceholder('Tìm theo tên hoặc mã HS...').fill(user.displayName);
    await expect(teacherPage.locator('tbody tr').filter({ has: teacherPage.getByText(user.displayName, { exact: true }) })).toContainText('Nộp muộn');
    const exportRequest = teacherPage.waitForRequest((request) => request.url().includes('/export.xlsx'));
    const downloadPromise = teacherPage.waitForEvent('download');
    await teacherPage.getByRole('button', { name: 'Xuất Excel', exact: true }).click();
    const [download, request] = await Promise.all([downloadPromise, exportRequest]);
    expect(new URL(request.url()).searchParams.get('search')).toBe(user.displayName);
    expect(new URL(request.url()).searchParams.get('status')).toBe('late');
    expect(new URL(request.url()).searchParams.has('page')).toBe(false);
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
    expect(await download.failure()).toBeNull();
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).subarray(0, 2).toString()).toBe('PK');
    await teacherPage.getByRole('link', { name: 'In phiếu cả lớp', exact: true }).click();
    await expect(teacherPage).toHaveURL(new RegExp(`/reports/${assignment.id}/print$`), { timeout: 30_000 });
    await expect(teacherPage.locator('.feedback-sheet')).toHaveCount(1);
    await expect(teacherPage.locator('.feedback-sheet')).toContainText(user.displayName);
    await expect(teacherPage.locator('.feedback-sheet')).not.toContainText('Nhận xét đang rà soát không được in F1');
    await expect(teacherPage.locator('.print-skipped')).toContainText(skippedUser.displayName);
    await teacherPage.emulateMedia({ media: 'print' });
    await expect(teacherPage.locator('.print-controls')).toBeHidden();
    expect(await teacherPage.locator('.feedback-sheet').evaluate((element) => getComputedStyle(element).breakAfter)).toBe('page');
    await studentPage.goto(`/assignments/${assignment.id}/result`);
    await studentPage.getByRole('link', { name: 'In phiếu', exact: true }).click();
    await expect(studentPage).toHaveURL(/\/result\/print$/, { timeout: 30_000 });
    await expect(studentPage.locator('.feedback-sheet')).toContainText(classroom.name);
  } finally {
    await teacher.close(); await student.close(); await unsubmitted.close();
  }
});

/** A PDF with an image and no text layer, generated without extra packages. */
function scanPdf(jpeg: Buffer, width: number, height: number): Buffer {
  const image = Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, Buffer.from('\nendstream')]);
  const commands = 'q 400 0 0 600 0 0 cm /Im1 Do Q';
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 600] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>'),
    image, Buffer.from(`<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`),
  ];
  const parts = [Buffer.from('%PDF-1.4\n')];
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.concat(parts).length); parts.push(Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from('\nendobj\n')); });
  const xref = Buffer.concat(parts).length;
  parts.push(Buffer.from(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));
  return Buffer.concat(parts);
}

test('PDF scan: chủ động OCR, rà soát Markdown rồi phân tích', async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  const teacher = await teacherContext(browser, baseURL!);
  try {
    const page = await teacher.newPage();
    await page.setViewportSize({ width: 400, height: 600 });
    await page.setContent('<h1>Đề thi Ngữ văn</h1><p>Viết bài nghị luận về trách nhiệm của tuổi trẻ.</p>');
    const jpeg = await page.screenshot({ type: 'jpeg' });
    const doc = await payload<TeacherDocument>(await teacher.request.post('/api/teacher/documents', { headers: mutationHeaders, multipart: {
      file: { name: 'f1-scan.pdf', mimeType: 'application/pdf', buffer: scanPdf(jpeg, 400, 600) }, intent: 'MIXED', gradeLevel: '11', genre: 'NLXH',
    } }));
    expect(doc.status).toBe('NEEDS_OCR');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/materials?importId=${doc.id}`);
    const recognize = page.getByRole('button', { name: 'Nhận dạng chữ bằng AI', exact: true });
    await expect(recognize).toBeVisible();
    await expect(page.getByRole('button', { name: 'Phân tích', exact: true })).toBeDisabled();
    await recognize.click();
    await expect(page.getByLabel('Nội dung chữ')).toHaveValue(/<!-- Trang 1 -->/, { timeout: 30_000 });
    const converted = await payload<TeacherDocument>(await teacher.request.get(`/api/teacher/documents/${doc.id}`));
    expect(converted.ocrStatus).toBe('DONE');
    expect(converted.status).toBe('CONVERTED');
    await expect(page.getByText(converted.conversionWarning, { exact: true })).toBeVisible();
    await page.getByLabel('Nội dung chữ').fill(`${converted.markdown}\n\nGiáo viên đã rà soát.`);
    await page.getByRole('button', { name: 'Phân tích', exact: true }).click();
    await expect.poll(async () => (await payload<TeacherDocument>(await teacher.request.get(`/api/teacher/documents/${doc.id}`))).status, { timeout: 30_000 }).toBe('REVIEW');
  } finally { await teacher.close(); }
});
