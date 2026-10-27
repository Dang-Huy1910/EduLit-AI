import { expect, test, type Page } from '@playwright/test';
import type { CatalogMaterial, CatalogPrompt, CatalogRubric, ClassroomDetail, Term } from '../../src/features/catalog/types';

const promptId = '11111111-1111-4111-8111-111111111111';
const assignmentId = '22222222-2222-4222-8222-222222222222';
const classroomId = '33333333-3333-4333-8333-333333333333';
const rubricId = '44444444-4444-4444-8444-444444444444';
const termId = '77777777-7777-4777-8777-777777777777';
const term: Term = {
  id: termId,
  code: 'HK1',
  name: 'Học kỳ I',
  academicYear: '2026-2027',
  startsOn: '2026-08-15',
  endsOn: '2027-01-10',
  status: 'ACTIVE',
  isCurrent: true,
};
const material: CatalogMaterial = {
  id: '55555555-5555-4555-8555-555555555555',
  title: 'Ngữ liệu kiểm thử',
  author: 'Tác giả',
  sourceInfo: '',
  content: 'Ngữ liệu về trách nhiệm của tuổi trẻ.',
  excerpt: 'Ngữ liệu về trách nhiệm của tuổi trẻ.',
  gradeLevel: 11,
  status: 'READY',
  missing: [],
  version: 1,
  chunks: [],
  updatedAt: '2026-10-19T01:00:00Z',
};
const prompt: CatalogPrompt = {
  id: promptId,
  title: 'Đề nguồn kiểm thử',
  writingTask: 'Viết bài nghị luận về trách nhiệm của tuổi trẻ.',
  extraGuidance: '',
  genre: 'NLXH',
  gradeLevel: 11,
  status: 'READY',
  ready: true,
  missing: [],
  materialCount: 1,
  materials: [material],
  updatedAt: '2026-10-19T01:00:00Z',
};
const rubric: CatalogRubric = {
  id: rubricId,
  title: 'Barem kiểm thử',
  shortTitle: 'Barem',
  description: '',
  status: 'READY',
  version: 1,
  maxScore: 4,
  scoreStep: 0.25,
  criteriaCount: 1,
  criteria: [{ id: 'C1', name: 'Nội dung', weight: 4 }],
  updatedAt: '2026-10-19T01:00:00Z',
};
const classroom: ClassroomDetail = {
  id: classroomId,
  code: '11A14',
  name: 'Lớp 11A14',
  subject: 'Ngữ văn',
  gradeLevel: 11,
  academicYear: term.academicYear,
  termId: term.id,
  termName: term.name,
  termStatus: term.status,
  readOnly: false,
  archived: false,
  joinCode: 'AB12CD',
  joinEnabled: true,
  studentCount: 1,
  members: [{
    userId: '66666666-6666-4666-8666-666666666666',
    loginId: 'hs.a',
    displayName: 'Học sinh A',
    role: 'STUDENT',
    status: 'ACTIVE',
    email: 'hs.a@example.test',
    joinedAt: '2026-09-01T01:00:00Z',
  }],
};

async function chooseDelete(page: Page, triggerName: string, dialogName: string, confirm: boolean) {
  const dialog = page.getByRole('dialog', { name: dialogName, exact: true });
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: triggerName, exact: true }).click();
  await dialog.getByRole('button', { name: confirm ? 'Xóa' : 'Hủy', exact: true }).click();
  if (!confirm) await expect(dialog).toBeHidden();
}

async function mockTeacher(page: Page, options: { status?: string; deleteFails?: boolean; wholeClass?: boolean; deletedPrompt?: boolean } = {}) {
  const assignment = {
    id: assignmentId, code: 'EDU-TEST', title: 'Bài tập kiểm thử', extraInstructions: '',
    status: options.status || 'DRAFT', dueAt: null, publishedAt: null,
    classroomId, classroomName: classroom.name, classroomCode: classroom.code,
    termId: classroom.termId, classroomReadOnly: classroom.readOnly, updatedAt: '2026-10-19T01:00:00Z',
    sourcePromptId: promptId, sourcePromptTitle: prompt.title, sourcePrompt: { ...prompt, status: options.deletedPrompt ? 'DELETED' : prompt.status },
    rubricId, assignmentRubric: rubric, maxScore: 4, scoreStep: 0.25, recipientCount: 1,
    publishedRevisionId: options.status === 'PUBLISHED' ? 'revision' : null,
    assignToWholeClass: options.wholeClass ?? true,
    recipientStudentIds: [classroom.members[0].userId],
    publishedWritingTask: prompt.writingTask, publishedMaterials: [material],
  };
  const state = { assignmentDeleted: false, promptDeleted: options.deletedPrompt || false, deleteRequests: 0 };
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path === '/api/auth/me') return route.fulfill({ json: {
      id: 'teacher', loginId: 'teacher', displayName: 'Giáo viên kiểm thử', email: 'gv@example.test', role: 'TEACHER', emailVerified: true,
    } });
    if (method === 'DELETE') {
      state.deleteRequests++;
      if (options.deleteFails) return route.fulfill({ status: 500, json: { error: { code: 'INTERNAL', message: 'Không xóa được mục này.' } } });
      if (path === `/api/teacher/assignments/${assignmentId}`) state.assignmentDeleted = true;
      else if (path === `/api/teacher/prompts/${promptId}`) state.promptDeleted = true;
      else return route.fulfill({ status: 404, json: {} });
      expect(route.request().headers()['x-edulit-csrf']).toBe('1');
      return route.fulfill({ status: 204 });
    }
    const responses: Record<string, unknown> = {
      '/api/terms': { items: [term] },
      '/api/teacher/topics': { items: [] },
      '/api/teacher/prompts': { items: state.promptDeleted ? [] : [prompt] },
      '/api/teacher/materials': { items: [material] },
      '/api/teacher/rubrics': { items: [rubric] },
      '/api/teacher/classrooms': { items: [classroom] },
      '/api/teacher/assignments': { items: state.assignmentDeleted ? [] : [assignment] },
      [`/api/teacher/materials/${material.id}`]: material,
      [`/api/teacher/rubrics/${rubricId}`]: rubric,
      [`/api/teacher/classrooms/${classroomId}`]: classroom,
    };
    if (!state.promptDeleted) responses[`/api/teacher/prompts/${promptId}`] = prompt;
    if (!state.assignmentDeleted) responses[`/api/teacher/assignments/${assignmentId}`] = assignment;
    return path in responses
      ? route.fulfill({ json: responses[path] })
      : route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
  });
  return state;
}

for (const status of ['DRAFT', 'PUBLISHED']) {
  test(`teacher can cancel or confirm deletion of a ${status} assignment`, async ({ page }) => {
    const state = await mockTeacher(page, { status });
    await page.goto('/assignments');
    await chooseDelete(page, 'Xóa bài tập Bài tập kiểm thử', 'Xóa bài tập này?', false);
    await expect(page.getByRole('heading', { name: 'Bài tập kiểm thử', exact: true })).toBeVisible();
    expect(state.deleteRequests).toBe(0);
    await chooseDelete(page, 'Xóa bài tập Bài tập kiểm thử', 'Xóa bài tập này?', true);
    await expect(page.getByRole('heading', { name: 'Bài tập kiểm thử', exact: true })).toHaveCount(0);
    expect(state.deleteRequests).toBe(1);
    await page.reload();
    await expect(page.getByRole('button', { name: /Tất cả \(0\)/ })).toBeVisible();
  });
}

test('failed deletion keeps the assignment and reports the error', async ({ page }) => {
  await mockTeacher(page, { deleteFails: true });
  await page.goto('/assignments');
  const button = page.getByRole('button', { name: 'Xóa bài tập Bài tập kiểm thử', exact: true });
  await chooseDelete(page, 'Xóa bài tập Bài tập kiểm thử', 'Xóa bài tập này?', true);
  await expect(page.getByText('Không xóa được mục này.', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Bài tập kiểm thử', exact: true })).toBeVisible();
  await expect(button).toBeEnabled();
});

test('catalog removes import dates and allows source prompt deletion', async ({ page }) => {
  const state = await mockTeacher(page);
  await page.goto('/materials');
  const button = page.getByRole('button', { name: `Xóa đề nguồn ${prompt.title}`, exact: true });
  await expect(button).toBeVisible();
  await expect(page.locator('main')).not.toContainText('19/10/2026');
  await chooseDelete(page, `Xóa đề nguồn ${prompt.title}`, 'Xóa đề nguồn khỏi kho?', false);
  expect(state.deleteRequests).toBe(0);
  await chooseDelete(page, `Xóa đề nguồn ${prompt.title}`, 'Xóa đề nguồn khỏi kho?', true);
  await expect(page.getByRole('heading', { name: prompt.title, exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: material.title, exact: true }).first()).toBeVisible();
  await page.reload();
  await expect(button).toHaveCount(0);
});

test('recipient list only appears in selected-students mode', async ({ page }) => {
  await mockTeacher(page);
  await page.goto(`/assignments/new?promptId=${promptId}&classroomId=${classroomId}`);
  const wholeClass = page.getByRole('radio', { name: 'Giao toàn lớp', exact: true });
  const selected = page.getByRole('radio', { name: 'Giao các học sinh được chọn', exact: true });
  const member = page.getByRole('checkbox', { name: 'Học sinh A (hs.a)', exact: true });
  await expect(wholeClass).toBeChecked();
  await expect(member).toHaveCount(0);
  await selected.check();
  await expect(member).toBeVisible();
  await wholeClass.check();
  await expect(member).toHaveCount(0);
});

for (const wholeClass of [true, false]) {
  test(`published assignment keeps recipient mode ${wholeClass ? 'whole class' : 'selected'} after source deletion`, async ({ page }) => {
    await mockTeacher(page, { status: 'PUBLISHED', wholeClass, deletedPrompt: true });
    await page.goto(`/assignments/${assignmentId}?tab=details`);
    const radio = page.getByRole('radio', { name: wholeClass ? 'Giao toàn lớp' : 'Giao các học sinh được chọn', exact: true });
    await expect(radio).toBeChecked();
    // Lớp đang hoạt động: bài giao toàn lớp khoá chế độ; bài giao chọn học sinh vẫn thêm được người nhận.
    if (wholeClass) await expect(radio).toBeDisabled();
    else await expect(radio).toBeEnabled();
    const member = page.getByRole('checkbox', { name: 'Học sinh A (hs.a)', exact: true });
    if (wholeClass) await expect(member).toHaveCount(0);
    else await expect(member).toBeDisabled();
    await expect(page.locator('main')).not.toContainText('Không tìm thấy đề nguồn');
  });
}
