import "dotenv/config";
import { databaseNameFromUrl } from "../../core/sanitize.js";

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  return url;
}

export function requireTestDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error("DATABASE_URL_TEST is required; refusing to fall back to DATABASE_URL");
  }
  const name = databaseNameFromUrl(url);
  if (!name.includes("_test")) {
    throw new Error(
      `Refusing to mutate database "${name}"; DATABASE_URL_TEST name must contain "_test"`,
    );
  }
  return url;
}

export function optionalShadowDatabaseUrl(): string | undefined {
  return process.env.SHADOW_DATABASE_URL;
}
