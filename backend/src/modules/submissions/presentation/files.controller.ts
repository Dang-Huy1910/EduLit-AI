import { Controller, Get, Inject, Param, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { PRISMA } from "../../../infrastructure/database/database.provider.js";
import type { EduLitPrisma } from "../../../infrastructure/database/prisma.client.js";
import type { PrivateStoragePort } from "../../../infrastructure/storage/private-storage.port.js";
import { PRIVATE_STORAGE } from "../../../http/config.js";
import { CurrentUser, type AuthUser } from "../../../http/auth-user.js";
import { SessionAuthGuard } from "../../../http/session.guard.js";
import { getPrivateFileForActor } from "../application/ocr-workflow.js";

@Controller("files") @UseGuards(SessionAuthGuard)
export class PrivateFilesController {
  constructor(@Inject(PRISMA) private readonly prisma: EduLitPrisma, @Inject(PRIVATE_STORAGE) private readonly storage: PrivateStoragePort) {}
  @Get(":fileId") async stream(@CurrentUser() user: AuthUser, @Param("fileId") fileId: string, @Res() response: Response) {
    const page = await getPrivateFileForActor(this.prisma, user, fileId); const file = await this.storage.read(fileId);
    response.setHeader("Content-Type", page.derivativeFileId === fileId ? "image/jpeg" : file.mimeType);
    response.setHeader("Cache-Control", "private, no-store"); response.send(file.data);
  }
}
