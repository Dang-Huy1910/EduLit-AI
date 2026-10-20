import { expect, test, type Page } from '@playwright/test';
import type { StudentAssignment } from '../../src/features/catalog/types';
import type { StudentAssessmentResponse } from '../../src/features/assessment/types';

type AssessmentResult = NonNullable<StudentAssessmentResponse['assessment']['result']>;

const student = {
  id: 'ui-student',
  loginId: 'ui-student',
  email: 'ui-student@example.test',
  displayName: 'Học sinh kiểm thử',
  role: 'STUDENT',
  emailVerified: true,
};

function assignment(id: string, maxScore = 4): StudentAssignment {
  return {
    id,
    code: `EDU-${id.toUpperCase()}`,
    title: `Bài tập ${id}`,
    status: 'PUBLISHED',
    dueAt: null,
    writingTask: 'Viết bài nghị luận về trách nhiệm của tuổi trẻ.',
    rubric: { maxScore },
  };
}

function publishedResult(totalScore: number, maxScore: number): AssessmentResult {
  return {
    resultId: 'result',
    publishedAt: '2026-10-20T01:00:00Z',
    assignmentTitle: 'Bài tập',
    rubricTitle: 'Barem được giao',
    evaluations: [],
    overallComment: 'Nhận xét đã công bố.',
    improvementGuidance: [],
    totalScore,
    maxScore,
    scoreStep: 0.25,
    scoreScale10: totalScore / maxScore * 10,
  };
}

function assessment(
  item: StudentAssignment,
  { status = 'published', submitted = true, result = null, canViewResult = Boolean(result) }: {
    status?: string;
    submitted?: boolean;
    result?: AssessmentResult | null;
    canViewResult?: boolean;
  } = {}
): StudentAssessmentResponse {
  return {
    assignment: {
      ...item,
      revisionId: `revision-${item.id}`,
      writingTask: item.writingTask || '',
      extraInstructions: '',
    },
    student: { id: student.id, displayName: student.displayName, loginId: student.loginId },
    submissionId: submitted ? item.id : null,
    attemptId: submitted ? item.id : null,
    status: submitted ? 'confirmed' : 'draft',
    officialSubmittedAt: submitted ? '2026-10-20T01:00:00Z' : null,
    ocrSubmittedAt: null,
    confirmedAt: null,
    canReopenTranscription: false,
    pages: [],
    transcriptionPages: [],
    assessment: { status, jobStatus: null, jobError: null, canViewResult, result },
  };
}

async function mockStudent(
  page: Page,
  items: StudentAssignment[],
  assessments: Record<string, StudentAssessmentResponse>
) {
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/me') return route.fulfill({ json: student });
    if (path === '/api/assignments') return route.fulfill({ json: { items } });
    const id = /^\/api\/assignments\/([^/]+)\/assessment$/.exec(path)?.[1];
    if (id && assessments[id]) return route.fulfill({ json: assessments[id] });
    return route.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
  });
}

function assignmentCard(page: Page, item: StudentAssignment) {
  return page.locator('main .glass-card').filter({
    has: page.getByRole('heading', { name: item.title, exact: true }),
  });
}

test('unpublished submissions show their status without fabricated scores or comments', async ({ page }) => {
  const states = [
    ['awaiting_review', 'Chờ giáo viên công bố'],
    ['queued', 'Đang chờ chấm bài'],
    ['grading', 'Hệ thống đang chấm bài'],
    ['failed', 'Lượt chấm gặp lỗi'],
  ];
  const items = states.map(([status]) => assignment(status));
  const assessments = Object.fromEntries(items.map((item, index) => [
    item.id,
    assessment(item, {
      status: states[index][0],
      // Even an unexpected payload must respect canViewResult.
      result: publishedResult(3.6, 4),
      canViewResult: false,
    }),
  ]));
  await mockStudent(page, items, assessments);
  await page.goto('/assignments?tab=submitted');
  for (let i = 0; i < items.length; i++) {
    const card = assignmentCard(page, items[i]);
    await expect(card).toContainText(states[i][1]);
    await expect(card).not.toContainText('3.60');
    await expect(card).not.toContainText('9.0đ');
    await expect(card).not.toContainText('Nhận xét đã công bố.');
    await expect(card.getByRole('link', { name: /Theo dõi bài nộp/ })).toBeVisible();
  }
  await expect(page.getByText('Điểm trung bình', { exact: true }).locator('..')).toContainText('—');
});

test('published scores retain their rubric scale and averages use scale 10, including zero and older published results', async ({ page }) => {
  const items = [assignment('ten', 10), assignment('four', 4), assignment('zero', 5)];
  const assessments = {
    ten: assessment(items[0], { result: publishedResult(8, 10) }),
    four: assessment(items[1], { status: 'new_version_review', result: publishedResult(3, 4) }),
    zero: assessment(items[2], { result: publishedResult(0, 5) }),
  };
  await mockStudent(page, items, assessments);
  await page.goto('/assignments?tab=submitted');
  await expect(assignmentCard(page, items[0])).toContainText('8.00 / 10.00đ');
  await expect(assignmentCard(page, items[1])).toContainText('3.00 / 4.00đ');
  await expect(assignmentCard(page, items[2])).toContainText('0.00 / 5.00đ');
  await expect(page.getByText('Điểm trung bình', { exact: true }).locator('..')).toContainText('5.17 / 10đ');
  await expect(page.locator('main')).not.toContainText('Xuất sắc');
});

test('assignment tabs follow sidebar navigation and browser back/forward', async ({ page }) => {
  const items = [assignment('todo', 10), assignment('submitted')];
  await mockStudent(page, items, {
    todo: assessment(items[0], { status: 'none', submitted: false }),
    submitted: assessment(items[1], { status: 'awaiting_review' }),
  });
  await page.goto('/assignments?tab=submitted');
  await expect(assignmentCard(page, items[1])).toBeVisible();
  await page.locator('aside a[href="/assignments"]').click();
  await expect(page).toHaveURL(/\/assignments$/);
  await expect(assignmentCard(page, items[0])).toBeVisible();
  await expect(assignmentCard(page, items[0])).toContainText('Thang 10.00 điểm');
  await page.getByRole('button', { name: /Đã nộp & Lịch sử chấm/ }).click();
  await expect(page).toHaveURL(/tab=submitted/);
  await expect(assignmentCard(page, items[1])).toBeVisible();
  await page.goBack();
  await expect(assignmentCard(page, items[0])).toBeVisible();
  await page.goForward();
  await expect(assignmentCard(page, items[1])).toBeVisible();
});

for (const lateResult of ['unauthorized', 'network-error', 'old-user'] as const) {
  test(`login survives a late session check: ${lateResult}`, async ({ page }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/api/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/me') {
        await gate;
        if (lateResult === 'network-error') return route.abort('failed');
        if (lateResult === 'old-user') {
          return route.fulfill({ json: { ...student, id: 'old-user', displayName: 'Phiên cũ', role: 'TEACHER' } });
        }
        return route.fulfill({ status: 401, json: { error: { code: 'AUTH_INVALID' } } });
      }
      if (path === '/api/auth/login') return route.fulfill({ json: { user: student } });
      if (path === '/api/assignments') return route.fulfill({ json: { items: [] } });
      return route.fulfill({ status: 404, json: {} });
    });
    const meRequested = page.waitForRequest(/\/api\/auth\/me$/);
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await meRequested;
    await page.locator('#loginId').fill(student.loginId);
    await page.locator('#password').fill('test-password');
    await page.getByRole('button', { name: /Đăng nhập hệ thống/ }).click();
    await expect(page).toHaveURL(/\/assignments$/);
    const completed = lateResult === 'network-error'
      ? page.waitForEvent('requestfailed', { predicate: (request) => request.url().endsWith('/api/auth/me') })
      : page.waitForResponse(/\/api\/auth\/me$/).then((response) => response.finished());
    release();
    await completed;
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page).toHaveURL(/\/assignments$/);
    await expect(page.locator('main')).toContainText(`Học sinh ${student.displayName}`);
    await expect(page.getByText('Không kết nối được máy chủ', { exact: true })).toHaveCount(0);
  });
}

for (const path of ['/login', '/register', '/forgot-password']) {
  test(`mobile ${path} shows the form in the first viewport`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/**', (route) => route.fulfill({
      status: 401,
      json: { error: { code: 'AUTH_INVALID' } },
    }));
    await page.goto(path);
    const firstInput = page.locator('form input').first();
    await expect(firstInput).toBeVisible();
    const bounds = await firstInput.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
}
