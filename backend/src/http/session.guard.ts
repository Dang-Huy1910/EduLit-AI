import { Inject, Injectable } from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { HTTP_CONFIG, type HttpConfig } from "./config.js";
import type { AuthedRequest } from "./auth-user.js";
import { AuthService } from "../modules/identity/auth.service.js";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(HTTP_CONFIG) private readonly config: HttpConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const rawToken = request.cookies?.[this.config.sessionCookieName];
    request.authUser = await this.authService.authenticate(rawToken);
    return true;
  }
}
