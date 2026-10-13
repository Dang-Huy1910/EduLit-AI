import { Inject, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { ApiHttpException, ERROR_MESSAGES } from "./api-error.js";
import { HTTP_CONFIG, type HttpConfig } from "./config.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class OriginGuard implements CanActivate {
  constructor(@Inject(HTTP_CONFIG) private readonly config: HttpConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const method = (request.method ?? "GET").toUpperCase();
    if (SAFE_METHODS.has(method)) {
      return true;
    }

    const originHeader = request.headers.origin;
    const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
    if (!origin || origin === "null" || origin !== this.config.appOrigin) {
      throw new ApiHttpException(403, "CSRF_ORIGIN", ERROR_MESSAGES.CSRF_ORIGIN);
    }

    const contentTypeHeader = request.headers["content-type"];
    const contentType = Array.isArray(contentTypeHeader) ? contentTypeHeader[0] : contentTypeHeader;
    if (!contentType || !contentType.toLowerCase().startsWith("application/json")) {
      throw new ApiHttpException(400, "JSON_REQUIRED", ERROR_MESSAGES.JSON_REQUIRED);
    }
    return true;
  }
}
