import { Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { cookieBaseOptions, HTTP_CONFIG, type HttpConfig } from "../../http/config.js";
import { CurrentUser, toPublicUser, type AuthUser, type AuthedRequest } from "../../http/auth-user.js";
import { SessionAuthGuard } from "../../http/session.guard.js";
import { TypedBody } from "../../http/dto-validation.js";
import { AuthService } from "./auth.service.js";
import { DemoLoginDto, EmptyJsonDto, LoginDto } from "./dto.js";

@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(HTTP_CONFIG) private readonly config: HttpConfig,
  ) {}

  @Post("login")
  @HttpCode(200)
  async login(
    @TypedBody(LoginDto) body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: ReturnType<typeof toPublicUser> }> {
    const result = await this.authService.login(body.loginId.trim(), body.password);
    response.cookie(this.config.sessionCookieName, result.rawToken, {
      ...cookieBaseOptions(this.config),
      maxAge: this.config.sessionTtlSeconds * 1000,
      expires: result.expiresAt,
    });
    return { user: toPublicUser(result.user) };
  }

  @Get("demo-accounts")
  async listDemoAccounts() {
    const users = await this.authService.listDemoAccounts();
    return { accounts: users.map((user) => toPublicUser(user)) };
  }

  @Post("demo-login")
  @HttpCode(200)
  async demoLogin(
    @TypedBody(DemoLoginDto) body: DemoLoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: ReturnType<typeof toPublicUser> }> {
    const result = await this.authService.demoLogin(body.loginId);
    response.cookie(this.config.sessionCookieName, result.rawToken, {
      ...cookieBaseOptions(this.config),
      maxAge: this.config.sessionTtlSeconds * 1000,
      expires: result.expiresAt,
    });
    return { user: toPublicUser(result.user) };
  }

  @Get("me")
  @UseGuards(SessionAuthGuard)
  me(@CurrentUser() user: AuthUser): ReturnType<typeof toPublicUser> {
    return toPublicUser(user);
  }

  @Post("logout")
  @HttpCode(200)
  async logout(
    @Req() request: AuthedRequest,
    @TypedBody(EmptyJsonDto) _body: EmptyJsonDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Record<string, never>> {
    const rawToken = request.cookies?.[this.config.sessionCookieName];
    await this.authService.logout(rawToken);
    response.clearCookie(this.config.sessionCookieName, cookieBaseOptions(this.config));
    return {};
  }
}
