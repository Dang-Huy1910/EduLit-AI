import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const fixture = (name: string) => path.resolve(__dirname, 'fixtures/ocr', name);

function requiredPassword(): string {
  const password = process.env.E2E_PASSWORD || process.env.DEV_SEED_PASSWORD;
  if (!password) {
    throw new Error('Set E2E_PASSWORD or DEV_SEED_PASSWORD for browser tests. Do not hardcode seed passwords.');
  }
  return password;
}

async function login(page: Page, loginId: string, password: string) {
  await page.goto('/login');
  await page.getByTestId('login-id').fill(loginId);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL('**/assignments');
}

test.describe('Full student/teacher pipeline', () => {
  test('teacher creates a new assignment and student completes five steps', async ({ page }) => {
    test.setTimeout(180_000);
    const password = requiredPassword();
    const stamp = Date.now();
    const title = `E2E pipeline ${stamp}`;

    await login(page, 'dang.loan', password);
    await page.getByTestId('create-assignment').click();
    await page.waitForURL('**/assignments/new');
    await page.getByTestId('assignment-title').fill(title);
    await page.getByTestId('assignment-instructions').fill('Viết nghị luận về bản lĩnh người trẻ trước áp lực thành tích.');
    await page.getByTestId('assignment-material').fill('Ngữ liệu nhập tay cho kiểm thử pipeline. Không phải trích dẫn tác phẩm.');
    await page.getByTestId('assignment-save').click();
    await page.waitForURL(/\/assignments\/[0-9a-f-]{36}$/);
    const assignmentId = page.url().split('/assignments/')[1] ?? '';
    expect(assignmentId).toMatch(/^[0-9a-f-]{36}$/);
    await page.getByTestId('assignment-publish').click();
    await expect(page.getByTestId('assignment-code')).toBeVisible();
    const code = (await page.getByTestId('assignment-code').innerText()).trim();
    expect(code.length).toBeGreaterThan(3);
    await page.getByTestId('logout-button').click();
    await page.waitForURL('**/login');

    await login(page, 'bui.hamy', password);
    await page.getByTestId('assignment-code-input').fill(code);
    await page.getByTestId('assignment-code-open').click();
    await page.waitForURL(new RegExp(`/assignments/${assignmentId}$`));
    await expect(page.getByTestId('assignment-reading')).toBeVisible();
    await page.getByTestId('mark-read').click();
    await expect(page.getByTestId('continue-socratic')).toBeVisible();
    await page.getByTestId('continue-socratic').click();
    await page.waitForURL(/\/socratic/);
    await expect(page.getByTestId('socratic-messages')).toBeVisible();
    await page.getByRole('button', { name: 'Thêm ý' }).first().click();
    await page.getByPlaceholder('Nhập ý tưởng mới...').fill(`Luận điểm pipeline ${stamp}`);
    await page.getByRole('button', { name: 'Thêm', exact: true }).click();
    await page.getByTestId('outline-save').click();
    await expect(page.getByTestId('outline-save')).toBeDisabled();
    await page.getByTestId('continue-to-write').click();
    await page.waitForURL(/\/submit/);

    await page.getByTestId('upload-page-input').setInputFiles(fixture('nlxh-p1.png'));
    await expect(page.getByText('Trang 1')).toBeVisible();
    await page.getByTestId('upload-page-input').setInputFiles(fixture('nlxh-p2.png'));
    await expect(page.getByText('Trang 2')).toBeVisible();
    const reorder = page.waitForResponse((response) => response.url().includes('/pages/order') && response.request().method() === 'PUT' && response.ok());
    await page.getByTestId('page-move-next').first().click();
    await reorder;
    await page.locator('article').nth(0).getByTestId('mask-header').click();
    await expect(page.locator('article').nth(0).getByText('1 vùng che')).toBeVisible();
    await page.locator('article').nth(1).getByTestId('mask-header').click();
    await expect(page.locator('article').nth(1).getByText('1 vùng che')).toBeVisible();
    await page.getByTestId('privacy-submit').click();
    await expect(page.getByText('Đang chờ giáo viên duyệt ảnh')).toBeVisible();
    await page.getByTestId('logout-button').click();
    await page.waitForURL('**/login');

    await login(page, 'dang.loan', password);
    await page.goto(`/reports/${assignmentId}`);
    await page.getByTestId('privacy-approve').click();
    await page.getByTestId('run-ocr').click();
    await expect(page.getByTestId('ocr-confirm')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('logout-button').click();
    await page.waitForURL('**/login');

    await login(page, 'bui.hamy', password);
    await page.goto(`/assignments/${assignmentId}/ocr`);
    await page.getByTestId('report-ocr-issue').first().click();
    await page.getByTestId('logout-button').click();
    await page.waitForURL('**/login');

    await login(page, 'dang.loan', password);
    await page.goto(`/reports/${assignmentId}`);
    await page.getByTestId('ocr-confirm').click();
    await page.getByTestId('grade-ai').click();
    await expect(page.getByTestId('publish-assessment')).toBeVisible({ timeout: 30_000 });
    await page.getByTestId('logout-button').click();
    await page.waitForURL('**/login');

    await login(page, 'bui.hamy', password);
    await page.goto(`/assignments/${assignmentId}/result`);
    await expect(page.getByTestId('result-pending')).toBeVisible();
    await expect(page.getByTestId('official-score')).toHaveCount(0);
    await page.getByTestId('logout-button').click();
    await page.waitForURL('**/login');

    await login(page, 'dang.loan', password);
    await page.goto(`/reports/${assignmentId}`);
    await page.getByTestId('publish-assessment').click();
    await expect(page.getByText('Đã công bố')).toBeVisible();
    await page.getByTestId('logout-button').click();
    await page.waitForURL('**/login');

    await login(page, 'bui.hamy', password);
    await page.goto(`/assignments/${assignmentId}/result`);
    await expect(page.getByTestId('official-score')).toBeVisible();
    await page.goto('/profile');
    await expect(page.getByTestId('student-profile')).toBeVisible();
    await expect(page.getByTestId('student-profile')).toContainText('Ý chí giúp người', { timeout: 20_000 });
  });
});
