export const HTTP_CONFIG = Symbol("HttpConfig");
export const SOCRATIC_AI = Symbol("SocraticAi");
export const ASSESSMENT_AI = Symbol("AssessmentAi");
export const WRITING_PROFILE_AI = Symbol("WritingProfileAi");
export const VISION_AI = Symbol("VisionAi");
export const PRIVATE_STORAGE = Symbol("PrivateStorage");

export type HttpConfig = {
  port: number;
  appOrigin: string;
  sessionCookieName: string;
  sessionTtlSeconds: number;
  cookieSecure: boolean;
  jsonBodyLimit: string;
  loginMaxAttempts: number;
  loginWindowSeconds: number;
  nodeEnv: string;
  allowDemoLogin: boolean;
  demoSeedPassword: string;
  localStoragePath: string;
  uploadMaxBytes: number;
  uploadMaxTotalBytes: number;
  uploadMaxPixels: number;
};

const DEFAULT_ORIGIN = "http://localhost:3000";
const DEFAULT_COOKIE = "edulit_session";
const DEFAULT_TTL = 60 * 60 * 24 * 7;
const DEFAULT_BODY_LIMIT = "64kb";

export function loadHttpConfig(env: NodeJS.ProcessEnv = process.env): HttpConfig {
  const appOrigin = stripTrailingSlash((env.APP_ORIGIN ?? DEFAULT_ORIGIN).trim());
  if (!appOrigin) {
    throw new Error("APP_ORIGIN is required");
  }
  try {
    const parsed = new URL(appOrigin);
    if (parsed.origin !== appOrigin) {
      throw new Error("APP_ORIGIN must be an exact origin without path");
    }
  } catch {
    throw new Error("APP_ORIGIN must be an absolute origin such as http://localhost:3000");
  }

  const port = parsePositiveInt(env.PORT, 4000, "PORT");
  const sessionTtlSeconds = parsePositiveInt(env.SESSION_TTL_SECONDS, DEFAULT_TTL, "SESSION_TTL_SECONDS");
  const loginMaxAttempts = parsePositiveInt(env.LOGIN_MAX_ATTEMPTS, 8, "LOGIN_MAX_ATTEMPTS");
  const loginWindowSeconds = parsePositiveInt(env.LOGIN_WINDOW_SECONDS, 900, "LOGIN_WINDOW_SECONDS");
  const nodeEnv = env.NODE_ENV?.trim() || "development";
  const cookieSecure =
    env.COOKIE_SECURE === "true" || (nodeEnv === "production" && env.COOKIE_SECURE !== "false");
  const allowDemoLogin =
    env.ALLOW_DEMO_LOGIN === "true" ||
    ((nodeEnv === "development" || nodeEnv === "test") && env.ALLOW_DEMO_LOGIN !== "false");

  return {
    port,
    appOrigin,
    sessionCookieName: (env.SESSION_COOKIE_NAME ?? DEFAULT_COOKIE).trim() || DEFAULT_COOKIE,
    sessionTtlSeconds,
    cookieSecure,
    jsonBodyLimit: (env.JSON_BODY_LIMIT ?? DEFAULT_BODY_LIMIT).trim() || DEFAULT_BODY_LIMIT,
    loginMaxAttempts,
    loginWindowSeconds,
    nodeEnv,
    allowDemoLogin,
    demoSeedPassword: env.DEV_SEED_PASSWORD ?? "",
    localStoragePath: (env.LOCAL_STORAGE_PATH ?? "var/uploads").trim() || "var/uploads",
    uploadMaxBytes: parsePositiveInt(env.UPLOAD_MAX_BYTES, 10 * 1024 * 1024, "UPLOAD_MAX_BYTES"),
    uploadMaxTotalBytes: parsePositiveInt(env.UPLOAD_MAX_TOTAL_BYTES, 40 * 1024 * 1024, "UPLOAD_MAX_TOTAL_BYTES"),
    uploadMaxPixels: parsePositiveInt(env.UPLOAD_MAX_PIXELS, 25_000_000, "UPLOAD_MAX_PIXELS"),
  };
}

export function cookieBaseOptions(config: HttpConfig): {
  httpOnly: true;
  path: "/";
  sameSite: "lax";
  secure: boolean;
} {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: config.cookieSecure,
  };
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function parsePositiveInt(raw: string | undefined, fallback: number, field: string): number {
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return parsed;
}
