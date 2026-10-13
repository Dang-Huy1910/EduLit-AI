import { expect, test, type Page } from '@playwright/test';

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

async function outlineValues(page: Page): Promise<string[]> {
  return page.locator('[data-testid="outline-canvas"] input').evaluateAll((els) =>
    els.map((el) => (el as HTMLInputElement).value),
  );
}

test.describe('Socratic integration', () => {
  test('chat and outline survive refresh; retry does not duplicate; logout isolates students', async ({ page, context, browser }) => {
    const password = requiredPassword();
    const marker = `Ý e2e ${Date.now()}`;

    await login(page, 'bui.hamy', password);
    await expect(page.getByTestId('assignment-card-VAN12-NLXH-SOC')).toBeVisible();
    await page.getByTestId('assignment-code-input').fill('VAN12-NLXH-SOC');
    await page.getByTestId('assignment-code-open').click();
    await page.waitForURL(/\/assignments\/.+\/socratic/);
    await expect(page.getByTestId('socratic-messages')).toBeVisible();

    await page.getByTestId('socratic-input').fill(marker);
    await page.getByTestId('socratic-send').click();
    await expect(page.getByTestId('socratic-messages')).toContainText(marker, { timeout: 30_000 });
    await expect(page.getByTestId('socratic-messages')).toContainText('Em đang đi đúng hướng', { timeout: 30_000 });

    const outlinePoint = `Luận điểm e2e ${Date.now()}`;
    await page.getByRole('button', { name: 'Thêm ý' }).first().click();
    await page.getByPlaceholder('Nhập ý tưởng mới...').fill(outlinePoint);
    await page.getByRole('button', { name: 'Thêm', exact: true }).click();
    await expect.poll(async () => (await outlineValues(page)).includes(outlinePoint)).toBe(true);
    await page.getByTestId('outline-save').click();
    await expect(page.getByTestId('outline-save')).toBeDisabled();

    await page.reload();
    await expect(page.getByTestId('socratic-messages')).toContainText(marker);
    await expect.poll(async () => (await outlineValues(page)).includes(outlinePoint)).toBe(true);

    let dropped = false;
    await page.route('**/socratic-sessions/**/turns', async (route) => {
      if (!dropped && route.request().method() === 'POST') {
        dropped = true;
        await route.abort('timedout');
        return;
      }
      await route.continue();
    });
    const retryMessage = `Retry e2e ${Date.now()}`;
    await page.getByTestId('socratic-input').fill(retryMessage);
    await page.getByTestId('socratic-send').click();
    await expect(page.getByTestId('socratic-error')).toBeVisible();
    await page.getByTestId('socratic-error').getByRole('button', { name: 'Gửi lại' }).click();
    await expect(page.getByTestId('socratic-messages')).toContainText(retryMessage, { timeout: 30_000 });
    const count = await page.getByTestId('socratic-messages').getByText(retryMessage).count();
    expect(count).toBe(1);

    const second = await context.newPage();
    await second.goto(page.url());
    await expect(second.getByTestId('outline-canvas')).toBeVisible();
    await second.getByRole('button', { name: 'Thêm ý' }).first().click();
    await second.getByPlaceholder('Nhập ý tưởng mới...').fill('Bản tab 2 giữ draft');
    await second.getByRole('button', { name: 'Thêm', exact: true }).click();
    await expect.poll(async () => (await outlineValues(second)).includes('Bản tab 2 giữ draft')).toBe(true);
    await page.getByRole('button', { name: 'Thêm ý' }).first().click();
    await page.getByPlaceholder('Nhập ý tưởng mới...').fill('Bản tab 1 đã lưu');
    await page.getByRole('button', { name: 'Thêm', exact: true }).click();
    await expect.poll(async () => (await outlineValues(page)).includes('Bản tab 1 đã lưu')).toBe(true);
    await page.getByTestId('outline-save').click();
    await expect(page.getByTestId('outline-save')).toBeDisabled();
    await second.getByTestId('outline-save').click();
    await expect(second.getByTestId('outline-conflict')).toBeVisible();
    await expect.poll(async () => (await outlineValues(second)).includes('Bản tab 2 giữ draft')).toBe(true);
    await second.close();

    await page.getByTestId('logout-button').click();
    await page.waitForURL('**/login');

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await login(otherPage, 'nguyen.an', password);
    await expect(otherPage.getByTestId('assignment-card-VAN12-NLXH-SOC')).toBeVisible();
    await otherPage.getByTestId('assignment-code-input').fill('VAN12-NLXH-SOC');
    await otherPage.getByTestId('assignment-code-open').click();
    await otherPage.waitForURL(/\/assignments\/.+\/socratic/);
    await expect(otherPage.getByTestId('socratic-messages')).not.toContainText(marker);
    await expect.poll(async () => (await outlineValues(otherPage)).includes(outlinePoint)).toBe(false);
    await other.close();
  });
});
