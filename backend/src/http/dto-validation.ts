import { Body, type PipeTransform, type Type } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ApiHttpException, ERROR_MESSAGES } from "./api-error.js";

export class DtoValidationPipe implements PipeTransform {
  constructor(private readonly dto: Type<object>) {}

  async transform(value: unknown): Promise<object> {
    if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new ApiHttpException(400, "VALIDATION", ERROR_MESSAGES.VALIDATION);
    }
    const instance = plainToInstance(this.dto, value);
    const errors = await validate(instance as object, {
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: false,
    });
    if (errors.length > 0) {
      throw new ApiHttpException(400, "VALIDATION", ERROR_MESSAGES.VALIDATION);
    }
    return instance as object;
  }
}

export function TypedBody(dto: Type<object>): ParameterDecorator {
  return Body(new DtoValidationPipe(dto));
}
