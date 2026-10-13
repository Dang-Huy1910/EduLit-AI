import { randomBytes } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import argon2 from "argon2";
import { sha256Bytes } from "../../core/hash.js";
import { PRISMA } from "../../infrastructure/database/database.provider.js";
import type { EduLitPrisma } from "../../infrastructure/database/prisma.client.js";
import { ApiHttpException, ERROR_MESSAGES } from "../../http/api-error.js";
import { HTTP_CONFIG, type HttpConfig } from "../../http/config.js";
import type { AuthUser } from "../../http/auth-user.js";
import { LoginRateLimiter } from "./login-rate-limiter.js";

const TOKEN_BYTES = 32;
const DEMO_LOGIN_IDS = ["dang.loan", "bui.hamy", "nguyen.an"] as const;

@Injectable()
export class AuthService {
  constructor(
    @Inject(PRISMA) private readonly prisma: EduLitPrisma,
    @Inject(HTTP_CONFIG) private readonly config: HttpConfig,
    @Inject(LoginRateLimiter) private readonly rateLimiter: LoginRateLimiter,
  ) {}

  demoLoginEnabled(): boolean {
    return this.config.allowDemoLogin && this.config.demoSeedPassword.length > 0;
  }

  async listDemoAccounts(): Promise<ReturnType<typeof toAuthUser>[]> {
    if (!this.demoLoginEnabled()) {
      throw new ApiHttpException(404, "NOT_FOUND", ERROR_MESSAGES.NOT_FOUND);
    }
    const users = await this.prisma.user.findMany({
      where: { loginId: { in: [...DEMO_LOGIN_IDS] }, status: "ACTIVE" },
      select: {
        id: true,
        loginId: true,
        displayName: true,
        role: true,
        status: true,
      },
    });
    const order = new Map<string, number>(DEMO_LOGIN_IDS.map((id, index) => [id, index]));
    return users
      .sort((a, b) => (order.get(a.loginId) ?? 99) - (order.get(b.loginId) ?? 99))
      .map(toAuthUser);
  }

  async demoLogin(loginId: string): Promise<{ user: AuthUser; rawToken: string; expiresAt: Date }> {
    if (!this.demoLoginEnabled()) {
      throw new ApiHttpException(404, "NOT_FOUND", ERROR_MESSAGES.NOT_FOUND);
    }
    const normalized = loginId.trim();
    if (!DEMO_LOGIN_IDS.includes(normalized as (typeof DEMO_LOGIN_IDS)[number])) {
      throw new ApiHttpException(401, "AUTH_CREDENTIALS", ERROR_MESSAGES.AUTH_CREDENTIALS);
    }
    return this.login(normalized, this.config.demoSeedPassword);
  }

  async login(loginId: string, password: string): Promise<{ user: AuthUser; rawToken: string; expiresAt: Date }> {
    this.rateLimiter.assertAllowed(loginId);
    const user = await this.prisma.user.findUnique({
      where: { loginId },
      select: {
        id: true,
        loginId: true,
        displayName: true,
        role: true,
        status: true,
        passwordHash: true,
      },
    });
    const passwordOk = user ? await verifyPassword(user.passwordHash, password) : false;
    if (!user || !passwordOk) {
      this.rateLimiter.recordFailure(loginId);
      throw new ApiHttpException(401, "AUTH_CREDENTIALS", ERROR_MESSAGES.AUTH_CREDENTIALS);
    }
    if (user.status !== "ACTIVE") {
      throw new ApiHttpException(403, "ACCOUNT_INACTIVE", ERROR_MESSAGES.ACCOUNT_INACTIVE);
    }
    this.rateLimiter.reset(loginId);

    const rawToken = randomBytes(TOKEN_BYTES).toString("base64url");
    const expiresAt = new Date(Date.now() + this.config.sessionTtlSeconds * 1000);
    await this.prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash: sha256Bytes(rawToken),
        expiresAt,
      },
    });
    return {
      user: toAuthUser(user),
      rawToken,
      expiresAt,
    };
  }

  async authenticate(rawToken: string | undefined): Promise<AuthUser> {
    if (!rawToken) {
      throw new ApiHttpException(401, "AUTH_INVALID", ERROR_MESSAGES.AUTH_INVALID);
    }
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: sha256Bytes(rawToken) },
      include: {
        user: {
          select: {
            id: true,
            loginId: true,
            displayName: true,
            role: true,
            status: true,
          },
        },
      },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw new ApiHttpException(401, "AUTH_INVALID", ERROR_MESSAGES.AUTH_INVALID);
    }
    if (session.user.status !== "ACTIVE") {
      throw new ApiHttpException(403, "ACCOUNT_INACTIVE", ERROR_MESSAGES.ACCOUNT_INACTIVE);
    }
    return toAuthUser(session.user);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) {
      return;
    }
    await this.prisma.authSession.updateMany({
      where: {
        tokenHash: sha256Bytes(rawToken),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }
}

async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}

function toAuthUser(user: {
  id: string;
  loginId: string;
  displayName: string;
  role: "TEACHER" | "STUDENT";
  status: "ACTIVE" | "INACTIVE";
}): AuthUser {
  return {
    id: user.id,
    loginId: user.loginId,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
  };
}
