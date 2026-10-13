import { Type } from "class-transformer";
import { IsInt, IsNotEmpty, IsObject, IsString, MaxLength, Min } from "class-validator";
import { SOCRATIC_MAX_STUDENT_MESSAGE_CHARS } from "../../../infrastructure/ai/ai-config.js";

export class SaveOutlineDto {
  @IsObject()
  outline!: Record<string, unknown>;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  expectedOutlineRevision!: number;
}

export class SendTurnDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  requestId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedLastSequence!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(SOCRATIC_MAX_STUDENT_MESSAGE_CHARS)
  message!: string;
}
