import { createParamDecorator, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { StudentActor } from "../modules/socratic/domain/actor.js";
import { ApiHttpException, ERROR_MESSAGES } from "./api-error.js";

export type AuthUser = {
  id: string;
  loginId: string;
  displayName: string;
  role: "TEACHER" | "STUDENT";
  status: "ACTIVE" | "INACTIVE";
};

export type AuthedRequest = Request & {
  authUser?: AuthUser;
};

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!request.authUser) {
    throw new ApiHttpException(401, "AUTH_INVALID", ERROR_MESSAGES.AUTH_INVALID);
  }
  return request.authUser;
});

export function toPublicUser(user: AuthUser): {
  id: string;
  loginId: string;
  displayName: string;
  role: "TEACHER" | "STUDENT";
} {
  return {
    id: user.id,
    loginId: user.loginId,
    displayName: user.displayName,
    role: user.role,
  };
}

export function studentActorFrom(user: AuthUser): StudentActor {
  if (user.role !== "STUDENT" || user.status !== "ACTIVE") {
    throw new ApiHttpException(403, "FORBIDDEN_ROLE", ERROR_MESSAGES.FORBIDDEN_ROLE);
  }
  return { userId: user.id, role: "STUDENT" };
}

@Injectable()
export class StudentGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const user = request.authUser;
    if (!user) {
      throw new ApiHttpException(401, "AUTH_INVALID", ERROR_MESSAGES.AUTH_INVALID);
    }
    if (user.status !== "ACTIVE") {
      throw new ApiHttpException(403, "ACCOUNT_INACTIVE", ERROR_MESSAGES.ACCOUNT_INACTIVE);
    }
    if (user.role !== "STUDENT") {
      throw new ApiHttpException(403, "FORBIDDEN_ROLE", ERROR_MESSAGES.FORBIDDEN_ROLE);
    }
    return true;
  }
}
