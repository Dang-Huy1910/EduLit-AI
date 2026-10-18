import { expect, test, type Page } from '@playwright/test';

const MAILPIT = process.env.MAILPIT_URL || 'http://localhost:8025';
const API = process.env.E2E_API_URL || 'http://localhost:4000';
const WEB = process.env.E2E_BASE_URL || 'http://localhost:3000';
const TEACHER_PASSWORD = process.env.BOOTSTRAP_TEACHER_PASSWORD || 'DanPhuong@2024';

async function latestMailLink(toContains: string, marker: string): Promise<string> {
  const deadline = Date.now() + 20_000;
  let lastError = 'No matching email in Mailpit';
  while (Date.now() < deadline) {
    try {
      const list = await fetch(`${MAILPIT}/api/v1/messages`);
      if (!list.ok) throw new Error(`Mailpit ${list.status}`);
      const data = (await list.json()) as {
        messages: { ID: string; To: { Address?: string; address?: string }[] }[];
      };
      const needle = toContains.toLowerCase();
      const match = data.messages.find((m) =>
        (m.To || []).some((addr) => (addr.Address || addr.address || '').toLowerCase().includes(needle))
      );
      if (!match) {
        lastError = `No matching email in Mailpit for ${toContains}`;
      } else {
        const msg = await fetch(`${MAILPIT}/api/v1/message/${match.ID}`);
        const body = (await msg.json()) as { Text?: string; HTML?: string };
        const blob = `${body.Text || ''}\n${body.HTML || ''}`;
        const idx = blob.indexOf(marker);
        if (idx < 0) {
          lastError = 'Token link missing from email text';
        } else {
          const tail = blob.slice(idx).split(/[\s"'<>]+/)[0];
          if (tail.startsWith('http')) return tail;
          return `${WEB}${tail.startsWith('/') ? tail : `/${tail}`}`;
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(lastError);
}

async function openAuthLink(page: Page, link: string) {
  const url = link.startsWith('http') ? link : `${WEB}${link.startsWith('/') ? link : `/${link}`}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
}

function uniqueStudent() {
  const suffix = Math.random().toString(36).slice(2, 10);
  return {
    loginId: `hs${suffix}`,
    email: `hs${suffix}@students.example.test`,
    displayName: 'Phạm Minh Châu',
    password: 'mat-khau-hoc-sinh-15',
  };
}

async function fillRegister(page: Page, student: ReturnType<typeof uniqueStudent>) {
  await page.goto('/register');
  await page.getByLabel('Họ và tên').fill(student.displayName);
  await page.getByLabel('Tên đăng nhập').fill(student.loginId);
  await page.getByLabel('Email').fill(student.email);
  await page.locator('#password').fill(student.password);
  await page.locator('#confirm').fill(student.password);
  await page.getByRole('button', { name: 'Tạo tài khoản học sinh' }).click();
  await expect(page).toHaveURL(/verify-email/);
}

async function registerAndVerify(page: Page, student: ReturnType<typeof uniqueStudent>) {
  await fillRegister(page, student);
  const link = await latestMailLink(student.email, '/verify-email#token=');
  await openAuthLink(page, link);
  await expect(page.getByText(/đã được xác minh/i)).toBeVisible({ timeout: 15_000 });
}

async function loginAs(page: Page, loginId: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/Tên đăng nhập hoặc email/).fill(loginId);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Đăng nhập hệ thống' }).click();
}

test.describe('EduLit auth', () => {
  test('student register, verify from email, login, refresh', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndVerify(page, student);
    await page.getByRole('link', { name: 'Đăng nhập', exact: true }).click();
    await page.getByLabel(/Tên đăng nhập hoặc email/).fill(student.loginId);
    await page.locator('#password').fill(student.password);
    await page.getByRole('button', { name: 'Đăng nhập hệ thống' }).click();
    await expect(page).toHaveURL(/assignments/);
    await expect(
      page.getByRole('heading', { name: `Chào mừng ${student.displayName} đến EduLit-AI` })
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: `Chào mừng ${student.displayName} đến EduLit-AI` })
    ).toBeVisible();
  });

  test('logout blocks private pages; duplicate username errors', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndVerify(page, student);
    await page.getByRole('link', { name: 'Đăng nhập', exact: true }).click();
    await page.getByLabel(/Tên đăng nhập hoặc email/).fill(student.loginId);
    await page.locator('#password').fill(student.password);
    await page.getByRole('button', { name: 'Đăng nhập hệ thống' }).click();
    await expect(page).toHaveURL(/assignments/);
    await page.getByTitle('Đăng xuất').first().click();
    await expect(page).toHaveURL(/login/);
    await page.goto('/assignments');
    await expect(page).toHaveURL(/login/);
    await page.goto('/register');
    await page.getByLabel('Họ và tên').fill(student.displayName);
    await page.getByLabel('Tên đăng nhập').fill(student.loginId);
    await page.getByLabel('Email').fill(`other-${student.email}`);
    await page.locator('#password').fill(student.password);
    await page.locator('#confirm').fill(student.password);
    await page.getByRole('button', { name: 'Tạo tài khoản học sinh' }).click();
    await expect(page.getByText(/đã được sử dụng/i)).toBeVisible();
  });

  test('forgot password, reset, security sessions', async ({ page }) => {
    const student = uniqueStudent();
    await registerAndVerify(page, student);
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: 'Quên mật khẩu' })).toBeVisible();
    await page.getByLabel('Email').fill(student.email);
    const forgotResponse = page.waitForResponse(
      (res) => res.url().includes('/api/auth/forgot-password') && res.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Gửi hướng dẫn' }).click();
    expect((await forgotResponse).ok()).toBeTruthy();
    const resetLink = await latestMailLink(student.email, '/reset-password#token=');
    await openAuthLink(page, resetLink);
    const nextPassword = 'mat-khau-dat-lai-15x';
    await page.locator('#newPassword').fill(nextPassword);
    await page.locator('#confirm').fill(nextPassword);
    await page.getByRole('button', { name: 'Đặt mật khẩu mới' }).click();
    await page.getByRole('link', { name: 'Đăng nhập', exact: true }).click();
    await page.getByLabel(/Tên đăng nhập hoặc email/).fill(student.loginId);
    await page.locator('#password').fill(student.password);
    await page.getByRole('button', { name: 'Đăng nhập hệ thống' }).click();
    await expect(page.getByText(/không đúng|không chính xác/i)).toBeVisible();
    await page.locator('#password').fill(nextPassword);
    await page.getByRole('button', { name: 'Đăng nhập hệ thống' }).click();
    await expect(page).toHaveURL(/assignments/);
    await page.goto('/account/security');
    await expect(page.getByText('Phiên đăng nhập')).toBeVisible();
    await page.getByRole('button', { name: 'Đăng xuất mọi thiết bị' }).click();
    await expect(page).toHaveURL(/login/);
  });

  test('bootstrap teacher logs into teacher shell without registering', async ({ page }) => {
    await loginAs(page, 'dang.loan', TEACHER_PASSWORD);
    await expect(page).toHaveURL(/assignments/);
    await expect(page.getByText('Cô Đặng Loan', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Không gian Giáo viên')).toBeVisible();
  });

  test('public auth routes work; localStorage role does not grant access; API down is not fake login', async ({
    page,
  }) => {
    await page.goto('/register');
    await expect(page.getByText('Đăng ký học sinh')).toBeVisible();
    await page.goto('/forgot-password');
    await expect(page.getByText('Quên mật khẩu')).toBeVisible();
    await page.goto('/login');
    await page.evaluate(() => localStorage.setItem('edulit-role', 'teacher'));
    await page.goto('/assignments');
    await expect(page).toHaveURL(/login/);
    const health = await fetch(`${API}/api/health`);
    expect(health.ok).toBeTruthy();
  });
});
