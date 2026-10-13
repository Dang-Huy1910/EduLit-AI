import { Type } from "class-transformer";
import { IsArray, IsIn, IsInt, IsISO8601, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, Min, ValidateNested } from "class-validator";

class RubricCriterionDto {
  @IsString() @IsNotEmpty() @MaxLength(80) criterionId!: string;
  @IsString() @IsNotEmpty() @MaxLength(160) name!: string;
  @IsString() @IsNotEmpty() @MaxLength(24) weight!: string;
  @IsOptional() @IsString() @MaxLength(2000) descriptor?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(300, { each: true }) requiredElements?: string[];
}

class RubricDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => RubricCriterionDto) criteria!: RubricCriterionDto[];
}

export class AssignmentDraftDto {
  @IsOptional() @IsString() @MaxLength(32) code?: string;
  @IsString() @IsNotEmpty() @MaxLength(300) title!: string;
  @IsString() @IsNotEmpty() @MaxLength(10000) instructions!: string;
  @IsIn(["NLXH", "NLVH"]) genre!: "NLXH" | "NLVH";
  @Type(() => Number) @IsInt() @Min(10) gradeLevel!: number;
  @IsString() @IsNotEmpty() @MaxLength(60000) learningMaterialText!: string;
  @ValidateNested() @Type(() => RubricDto) rubric!: RubricDto;
  @IsOptional() @IsString() @MaxLength(24) maxScore?: string;
  @IsOptional() @IsString() @MaxLength(24) scoreStep?: string;
  @IsOptional() @IsISO8601() dueAt?: string | null;
}

export class UpdateAssignmentDraftDto extends AssignmentDraftDto {
  @IsISO8601() expectedUpdatedAt!: string;
}
