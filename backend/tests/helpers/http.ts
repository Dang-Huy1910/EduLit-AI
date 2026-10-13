import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import argon2 from "argon2";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { sha256Bytes } from "../../src/core/hash.js";
import { FakeSocraticAi } from "../../src/infrastructure/ai/fake-socratic.adapter.js";
import { loadHttpConfig, type HttpConfig } from "../../src/http/config.js";
import { createHttpApp } from "../../src/http/create-http-app.js";
import type { EduLitPrisma } from "../../src/infrastructure/database/prisma.client.js";
import { withTestPrisma } from "./db.js";

export const TEST_ORIGIN = "http://localhost:3000";
export const TEST_PASSWORD = "test-password-http";

export type HttpClient = {
  app: NestExpressApplication;
  prisma: EduLitPrisma;
  ai: FakeSocraticAi;
  baseUrl: string;
  config: HttpConfig;
};

export async function withHttpApp(
  fn: (client: HttpClient) => Promise<void>,
  options: { ai?: FakeSocraticAi; extraEnv?: NodeJS.ProcessEnv } = {},
): Promise<void> {
  await withTestPrisma(async (prisma) => {
    const ai = options.ai ?? new FakeSocraticAi();
    const config = loadHttpConfig({
      NODE_ENV: "test",
      APP_ORIGIN: TEST_ORIGIN,
      SESSION_COOKIE_NAME: "edulit_session",
      SESSION_TTL_SECONDS: "3600",
      COOKIE_SECURE: "false",
      LOGIN_MAX_ATTEMPTS: "5",
      LOGIN_WINDOW_SECONDS: "900",
      PORT: "4000",
      ...options.extraEnv,
    });
    const app = await createHttpApp({
      prisma,
      ai,
      config,
      shutdown: async () => {},
      logger: false,
      enableShutdownHooks: false,
    });
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}/api`;
    try {
      await fn({ app, prisma, ai, baseUrl, config });
    } finally {
      await app.close();
    }
  });
}

export type JsonResponse = {
  status: number;
  json: unknown;
  headers: Headers;
  setCookie: string[];
};

export async function apiRequest(
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    origin?: string | null;
    cookie?: string;
    headers?: Record<string, string>;
    json?: boolean;
  } = {},
): Promise<JsonResponse> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { ...options.headers };
  if (options.origin !== null) {
    headers.origin = options.origin ?? TEST_ORIGIN;
  }
  let body: string | undefined;
  if (options.body !== undefined) {
    if (options.json === false) {
      body = String(options.body);
    } else {
      headers["content-type"] = headers["content-type"] ?? "application/json";
      body = JSON.stringify(options.body);
    }
  }
  if (options.cookie) {
    headers.cookie = options.cookie;
  }
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body });
  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = text;
    }
  }
  const setCookie =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : headerAll(response.headers, "set-cookie");
  return { status: response.status, json, headers: response.headers, setCookie };
}

export function sessionCookie(setCookie: string[], name = "edulit_session"): string {
  const line = setCookie.find((item) => item.startsWith(`${name}=`));
  if (!line) {
    throw new Error("missing session cookie");
  }
  return line.split(";", 1)[0] ?? line;
}

export function errorCode(json: unknown): string | undefined {
  if (!json || typeof json !== "object") {
    return undefined;
  }
  const error = (json as { error?: { code?: unknown } }).error;
  return error && typeof error.code === "string" ? error.code : undefined;
}

export async function createUserWithPassword(
  prisma: EduLitPrisma,
  data: { loginId: string; displayName: string; role: "STUDENT" | "TEACHER"; status?: "ACTIVE" | "INACTIVE" },
) {
  const passwordHash = await argon2.hash(TEST_PASSWORD, { type: argon2.argon2id });
  return prisma.user.create({
    data: {
      loginId: data.loginId,
      displayName: data.displayName,
      role: data.role,
      status: data.status ?? "ACTIVE",
      passwordHash,
    },
  });
}

export async function loginCookie(
  client: HttpClient,
  loginId: string,
  password = TEST_PASSWORD,
): Promise<string> {
  const response = await apiRequest(client.baseUrl, "/auth/login", {
    method: "POST",
    body: { loginId, password },
  });
  if (response.status !== 200) {
    throw new Error(`login failed ${response.status} ${JSON.stringify(response.json)}`);
  }
  return sessionCookie(response.setCookie, client.config.sessionCookieName);
}

export async function insertSession(
  prisma: EduLitPrisma,
  userId: string,
  overrides: { expiresAt?: Date; revokedAt?: Date | null } = {},
): Promise<{ rawToken: string; cookie: string }> {
  const rawToken = randomBytes(32).toString("base64url");
  const created = await prisma.authSession.create({
    data: {
      userId,
      tokenHash: sha256Bytes(rawToken),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: overrides.revokedAt ?? null,
    },
  });
  if (overrides.expiresAt) {
    const expiresAt = overrides.expiresAt;
    const createdAt =
      expiresAt.getTime() <= Date.now() ? new Date(expiresAt.getTime() - 1000) : created.createdAt;
    await prisma.authSession.update({
      where: { id: created.id },
      data: { createdAt, expiresAt },
    });
  }
  return { rawToken, cookie: `edulit_session=${rawToken}` };
}

function headerAll(headers: Headers, name: string): string[] {
  const value = headers.get(name);
  return value ? [value] : [];
}
