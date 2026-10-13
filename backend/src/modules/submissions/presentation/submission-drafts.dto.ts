import { Type } from "class-transformer";
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from "class-validator";

export class OpenDraftDto { @IsUUID("4") assignmentId!: string; }
export class RevisionDto { @Type(() => Number) @IsInt() @Min(1) expectedRevision!: number; }
export class PageOrderDto extends RevisionDto { @IsArray() @IsUUID("4", { each: true }) pageIds!: string[]; }
class MaskDto { @Type(() => Number) @IsNumber() x!: number; @Type(() => Number) @IsNumber() y!: number; @Type(() => Number) @IsNumber() width!: number; @Type(() => Number) @IsNumber() height!: number; }
export class MasksDto extends RevisionDto { @IsArray() @ValidateNested({ each: true }) @Type(() => MaskDto) masks!: MaskDto[]; }
export class PrivacyReviewDto { @IsBoolean() approve!: boolean; @IsOptional() @IsString() @MaxLength(2000) reason?: string; }
export class OcrIssueDto { @IsUUID("4") ocrRevisionId!: string; @IsOptional() @IsUUID("4") pageId?: string; @IsOptional() @IsString() @MaxLength(200) segmentId?: string; @IsString() @IsNotEmpty() @MaxLength(5000) reportedText!: string; @IsOptional() @IsString() @MaxLength(2000) note?: string; }
export class CorrectOcrDto { @Type(() => Number) @IsInt() @Min(1) expectedOcrRevision!: number; @IsString() @MaxLength(60000) correctedText!: string; @IsOptional() @IsString() @MaxLength(2000) reason?: string; }
export class ConfirmOcrDto { @Type(() => Number) @IsInt() @Min(1) expectedOcrRevision!: number; }
