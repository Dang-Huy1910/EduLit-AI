import { Inject, Injectable } from "@nestjs/common";
import { ApiHttpException, ERROR_MESSAGES } from "../../http/api-error.js";
import { HTTP_CONFIG, type HttpConfig } from "../../http/config.js";

type Bucket = {
  count: number;
  resetAt: number;
};

@Injectable()
export class LoginRateLimiter {
  private readonly hits = new Map<string, Bucket>();

  constructor(@Inject(HTTP_CONFIG) private readonly config: HttpConfig) {}

  assertAllowed(loginId: string): void {
    const bucket = this.hits.get(normalize(loginId));
    if (!bucket) {
      return;
    }
    if (Date.now() >= bucket.resetAt) {
      this.hits.delete(normalize(loginId));
      return;
    }
    if (bucket.count >= this.config.loginMaxAttempts) {
      throw new ApiHttpException(429, "AUTH_RATE_LIMIT", ERROR_MESSAGES.AUTH_RATE_LIMIT);
    }
  }

  recordFailure(loginId: string): void {
    const key = normalize(loginId);
    const now = Date.now();
    const windowMs = this.config.loginWindowSeconds * 1000;
    const bucket = this.hits.get(key);
    if (!bucket || now >= bucket.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    bucket.count += 1;
  }

  reset(loginId: string): void {
    this.hits.delete(normalize(loginId));
  }
}

function normalize(loginId: string): string {
  return loginId.trim().toLowerCase();
}
