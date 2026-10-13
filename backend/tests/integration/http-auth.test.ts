import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { createAssignment } from "../../src/modules/assignments/application/create-assignment.js";
import {
  apiRequest,
  createUserWithPassword,
  errorCode,
  insertSession,
  loginCookie,
  sessionCookie,
  TEST_ORIGIN,
  TEST_PASSWORD,
  withHttpApp,
} from "../helpers/http.js";
import { SAMPLE_RUBRIC } from "../helpers/db.js";

test("login sets host-only HttpOnly Lax cookie and /me returns the user", async () => {
  await withHttpApp(async (client) => {
    const user = await createUserWithPassword(client.prisma, {
      loginId: `hs-${randomUUID()}`,
      displayName: "Học sinh thử",
      role: "STUDENT",
    });
    const login = await apiRequest(client.baseUrl, "/auth/login", {
      method: "POST",
      body: { loginId: user.loginId, password: TEST_PASSWORD },
    });
    assert.equal(login.status, 200);
    const cookieLine = login.setCookie.find((item) => item.startsWith("edulit_session="));
    assert.ok(cookieLine);
    assert.match(cookieLine ?? "", /HttpOnly/i);
    assert.match(cookieLine ?? "", /SameSite=Lax/i);
    assert.match(cookieLine ?? "", /Path=\//i);
    assert.doesNotMatch(cookieLine ?? "", /Domain=/i);
    assert.doesNotMatch(cookieLine ?? "", /Secure/i);
    const body = login.json as { user: { id: string; loginId: string; role: string } };
    assert.equal(body.user.id, user.id);
    assert.equal(body.user.loginId, user.loginId);
    assert.equal(body.user.role, "STUDENT");
    assert.equal((body.user as { passwordHash?: unknown }).passwordHash, undefined);

    const me = await apiRequest(client.baseUrl, "/auth/me", {
      cookie: sessionCookie(login.setCookie),
    });
    assert.equal(me.status, 200);
    assert.equal((me.json as { id: string }).id, user.id);
  });
});

test("wrong password is generic, extra actor fields are rejected, expired/revoked/inactive are blocked", async () => {
  await withHttpApp(async (client) => {
    const user = await createUserWithPassword(client.prisma, {
      loginId: `hs-${randomUUID()}`,
      displayName: "Học sinh thử",
      role: "STUDENT",
    });
    const wrong = await apiRequest(client.baseUrl, "/auth/login", {
      method: "POST",
      body: { loginId: user.loginId, password: "sai-mat-khau" },
    });
    assert.equal(wrong.status, 401);
    assert.equal(errorCode(wrong.json), "AUTH_CREDENTIALS");

    const extra = await apiRequest(client.baseUrl, "/auth/login", {
      method: "POST",
      body: { loginId: user.loginId, password: TEST_PASSWORD, role: "TEACHER", studentId: user.id },
    });
    assert.equal(extra.status, 400);
    assert.equal(errorCode(extra.json), "VALIDATION");

    const expired = await insertSession(client.prisma, user.id, {
      expiresAt: new Date(Date.now() - 1000),
    });
    const expiredMe = await apiRequest(client.baseUrl, "/auth/me", { cookie: expired.cookie });
    assert.equal(expiredMe.status, 401);
    assert.equal(errorCode(expiredMe.json), "AUTH_INVALID");

    const revoked = await insertSession(client.prisma, user.id, { revokedAt: new Date() });
    const revokedMe = await apiRequest(client.baseUrl, "/auth/me", { cookie: revoked.cookie });
    assert.equal(revokedMe.status, 401);

    const inactive = await createUserWithPassword(client.prisma, {
      loginId: `hs-inact-${randomUUID()}`,
      displayName: "Inactive",
      role: "STUDENT",
      status: "INACTIVE",
    });
    const inactiveLogin = await apiRequest(client.baseUrl, "/auth/login", {
      method: "POST",
      body: { loginId: inactive.loginId, password: TEST_PASSWORD },
    });
    assert.equal(inactiveLogin.status, 403);
    assert.equal(errorCode(inactiveLogin.json), "ACCOUNT_INACTIVE");

    const live = await insertSession(client.prisma, inactive.id);
    const inactiveMe = await apiRequest(client.baseUrl, "/auth/me", { cookie: live.cookie });
    assert.equal(inactiveMe.status, 403);
    assert.equal(errorCode(inactiveMe.json), "ACCOUNT_INACTIVE");
  });
});

test("logout revokes the session and clears the cookie", async () => {
  await withHttpApp(async (client) => {
    const user = await createUserWithPassword(client.prisma, {
      loginId: `hs-${randomUUID()}`,
      displayName: "Học sinh thử",
      role: "STUDENT",
    });
    const cookie = await loginCookie(client, user.loginId);
    const logout = await apiRequest(client.baseUrl, "/auth/logout", {
      method: "POST",
      body: {},
      cookie,
    });
    assert.equal(logout.status, 200);
    const clear = logout.setCookie.find((item) => item.startsWith("edulit_session="));
    assert.ok(clear);
    assert.match(clear ?? "", /edulit_session=;/i);
    const me = await apiRequest(client.baseUrl, "/auth/me", { cookie });
    assert.equal(me.status, 401);
    const sessions = await client.prisma.authSession.findMany({ where: { userId: user.id } });
    assert.ok(sessions.every((row) => row.revokedAt !== null));
  });
});

test("CORS allows APP_ORIGIN and mutations reject missing or wrong Origin", async () => {
  await withHttpApp(async (client) => {
    const preflight = await apiRequest(client.baseUrl, "/auth/login", {
      method: "OPTIONS",
      origin: TEST_ORIGIN,
      headers: {
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      },
    });
    assert.ok(preflight.status === 204 || preflight.status === 200);
    assert.equal(preflight.headers.get("access-control-allow-origin"), TEST_ORIGIN);
    assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");

    const missing = await apiRequest(client.baseUrl, "/auth/login", {
      method: "POST",
      body: { loginId: "x", password: "y" },
      origin: null,
    });
    assert.equal(missing.status, 403);
    assert.equal(errorCode(missing.json), "CSRF_ORIGIN");

    const wrong = await apiRequest(client.baseUrl, "/auth/login", {
      method: "POST",
      body: { loginId: "x", password: "y" },
      origin: "http://evil.example",
    });
    assert.equal(wrong.status, 403);
    assert.equal(errorCode(wrong.json), "CSRF_ORIGIN");

    const notJson = await apiRequest(client.baseUrl, "/auth/login", {
      method: "POST",
      body: "loginId=x&password=y",
      json: false,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    assert.equal(notJson.status, 400);
    assert.equal(errorCode(notJson.json), "JSON_REQUIRED");
  });
});

test("student assignment APIs require a student session and hide unpublished work", async () => {
  await withHttpApp(async (client) => {
    const teacher = await createUserWithPassword(client.prisma, {
      loginId: `gv-${randomUUID()}`,
      displayName: "Giáo viên",
      role: "TEACHER",
    });
    const student = await createUserWithPassword(client.prisma, {
      loginId: `hs-${randomUUID()}`,
      displayName: "Học sinh",
      role: "STUDENT",
    });
    const other = await createUserWithPassword(client.prisma, {
      loginId: `hs-other-${randomUUID()}`,
      displayName: "Học sinh khác",
      role: "STUDENT",
    });
    const published = await createAssignment(client.prisma, {
      teacherId: teacher.id,
      code: `PUB-${randomUUID().slice(0, 8)}`,
      title: "Đề công bố",
      instructions: "Viết nghị luận.",
      genre: "NLXH",
      gradeLevel: 12,
      learningMaterialText: "Ngữ liệu.",
      rubric: SAMPLE_RUBRIC,
      maxScore: "10.00",
      scoreStep: "0.25",
      status: "PUBLISHED",
    });
    const draft = await createAssignment(client.prisma, {
      teacherId: teacher.id,
      code: `DRAFT-${randomUUID().slice(0, 8)}`,
      title: "Đề nháp",
      instructions: "Nháp.",
      genre: "NLXH",
      gradeLevel: 12,
      learningMaterialText: "Ngữ liệu nháp.",
      rubric: SAMPLE_RUBRIC,
      maxScore: "10.00",
      scoreStep: "0.25",
      status: "DRAFT",
    });

    const unauth = await apiRequest(client.baseUrl, "/assignments");
    assert.equal(unauth.status, 401);

    const teacherCookie = await loginCookie(client, teacher.loginId);
    const teacherList = await apiRequest(client.baseUrl, "/assignments", { cookie: teacherCookie });
    assert.equal(teacherList.status, 403);
    assert.equal(errorCode(teacherList.json), "FORBIDDEN_ROLE");

    const studentCookie = await loginCookie(client, student.loginId);
    const list = await apiRequest(client.baseUrl, "/assignments", { cookie: studentCookie });
    assert.equal(list.status, 200);
    const items = list.json as Array<{ id: string; code: string }>;
    assert.ok(items.some((item) => item.id === published.id));
    assert.ok(!items.some((item) => item.id === draft.id));

    const draftGet = await apiRequest(client.baseUrl, `/assignments/${draft.id}`, {
      cookie: studentCookie,
    });
    assert.equal(draftGet.status, 404);

    const spoof = await apiRequest(client.baseUrl, `/assignments/${published.id}/socratic-sessions`, {
      method: "POST",
      body: { actor: { userId: other.id, role: "STUDENT" }, studentId: other.id },
      cookie: studentCookie,
    });
    assert.equal(spoof.status, 400);
    assert.equal(errorCode(spoof.json), "VALIDATION");
  });
});

test("demo login issues a session for seed accounts and is disabled in production", async () => {
  await withHttpApp(
    async (client) => {
      const student = await createUserWithPassword(client.prisma, {
        loginId: "bui.hamy",
        displayName: "Bùi Hà My",
        role: "STUDENT",
      });
      const listed = await apiRequest(client.baseUrl, "/auth/demo-accounts");
      assert.equal(listed.status, 200);
      const accounts = (listed.json as { accounts: Array<{ loginId: string }> }).accounts;
      assert.ok(accounts.some((item) => item.loginId === "bui.hamy"));

      const demo = await apiRequest(client.baseUrl, "/auth/demo-login", {
        method: "POST",
        body: { loginId: "bui.hamy" },
      });
      assert.equal(demo.status, 200);
      const cookie = sessionCookie(demo.setCookie);
      const me = await apiRequest(client.baseUrl, "/auth/me", { cookie });
      assert.equal(me.status, 200);
      assert.equal((me.json as { id: string }).id, student.id);

      const unknown = await apiRequest(client.baseUrl, "/auth/demo-login", {
        method: "POST",
        body: { loginId: "khong.ton.tai" },
      });
      assert.equal(unknown.status, 401);
    },
    { extraEnv: { DEV_SEED_PASSWORD: TEST_PASSWORD } },
  );

  await withHttpApp(
    async (client) => {
      const blocked = await apiRequest(client.baseUrl, "/auth/demo-login", {
        method: "POST",
        body: { loginId: "bui.hamy" },
      });
      assert.equal(blocked.status, 404);
    },
    { extraEnv: { NODE_ENV: "production", COOKIE_SECURE: "false", DEV_SEED_PASSWORD: TEST_PASSWORD } },
  );
});

test("login rate limit trips after repeated failures in-process", async () => {
  await withHttpApp(async (client) => {
    const user = await createUserWithPassword(client.prisma, {
      loginId: `hs-${randomUUID()}`,
      displayName: "Học sinh",
      role: "STUDENT",
    });
    for (let i = 0; i < 5; i += 1) {
      const failed = await apiRequest(client.baseUrl, "/auth/login", {
        method: "POST",
        body: { loginId: user.loginId, password: "sai" },
      });
      assert.equal(failed.status, 401);
    }
    const limited = await apiRequest(client.baseUrl, "/auth/login", {
      method: "POST",
      body: { loginId: user.loginId, password: "sai" },
    });
    assert.equal(limited.status, 429);
    assert.equal(errorCode(limited.json), "AUTH_RATE_LIMIT");
  });
});
