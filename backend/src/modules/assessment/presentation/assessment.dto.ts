import { Type } from "class-transformer";
import { IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from "class-validator";

class EvidenceDto { @IsString() @MaxLength(2000) quote!: string; @Type(() => Number) @IsInt() @Min(0) start!: number; @Type(() => Number) @IsInt() @Min(0) end!: number; }
class EvaluationDto {
  @IsString() @IsNotEmpty() @MaxLength(80) criterionId!: string;
  @IsString() @IsNotEmpty() @MaxLength(24) awardedScore!: string;
  @IsString() @MaxLength(4000) comment!: string;
  @IsArray() @IsString({ each: true }) @MaxLength(500, { each: true }) strengths!: string[];
  @IsArray() @IsString({ each: true }) @MaxLength(500, { each: true }) weaknesses!: string[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => EvidenceDto) evidence!: EvidenceDto[];
  @IsArray() @IsString({ each: true }) @MaxLength(500, { each: true }) missingElements!: string[];
}
export class ReviewAssessmentDto {
  @Type(() => Number) @IsInt() @Min(0) expectedReviewRevision!: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => EvaluationDto) detailedEvaluations!: EvaluationDto[];
  @IsString() @IsNotEmpty() @MaxLength(24) totalScore!: string;
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}
export class AssignmentIdDto { @IsUUID("4") assignmentId!: string; }
export class ReviewObservationDto { @IsIn(["SUPPORTED", "RESOLVED", "INVALIDATED"]) status!: "SUPPORTED" | "RESOLVED" | "INVALIDATED"; @Type(() => Number) @IsInt() @Min(0) expectedProfileVersion!: number; }
