import { Prisma } from "../generated/prisma/client.js";
import { DomainError } from "./errors.js";

export type DecimalInput = Prisma.Decimal | string | number;

/** Matches PostgreSQL numeric(8, 2) used for scores. */
export const SCORE_NUMERIC_SCALE = 2;
const SCORE_NUMERIC_ABS_LIMIT = 1_000_000;

export function decimal(value: DecimalInput): Prisma.Decimal {
  try {
    return new Prisma.Decimal(value);
  } catch {
    throw new DomainError("DECIMAL_INVALID", "Invalid decimal value");
  }
}

export function decimalString(value: DecimalInput, places = SCORE_NUMERIC_SCALE): string {
  return assertExactScoreScale(value, "value").toFixed(places);
}

export function assertExactScoreScale(value: DecimalInput, field: string): Prisma.Decimal {
  const parsed = decimal(value);
  if (!parsed.isFinite()) {
    throw new DomainError("DECIMAL_SCALE", `${field} must be a finite decimal`);
  }
  if (parsed.abs().gte(SCORE_NUMERIC_ABS_LIMIT)) {
    throw new DomainError("DECIMAL_SCALE", `${field} exceeds numeric(8,2) range`);
  }
  const stored = parsed.toFixed(SCORE_NUMERIC_SCALE);
  if (!parsed.eq(stored)) {
    throw new DomainError(
      "DECIMAL_SCALE",
      `${field} must already fit ${SCORE_NUMERIC_SCALE} decimal places; values are not rounded on save`,
    );
  }
  return new Prisma.Decimal(stored);
}

export function assertPositiveDecimal(value: DecimalInput, field: string): Prisma.Decimal {
  const parsed = assertExactScoreScale(value, field);
  if (parsed.lte(0)) {
    throw new DomainError("DECIMAL_RANGE", `${field} must be a positive decimal`);
  }
  return parsed;
}

export function assertNonNegativeDecimal(value: DecimalInput, field: string): Prisma.Decimal {
  const parsed = assertExactScoreScale(value, field);
  if (parsed.lt(0)) {
    throw new DomainError("DECIMAL_RANGE", `${field} must be a non-negative decimal`);
  }
  return parsed;
}

export function isMultipleOfStep(value: Prisma.Decimal, step: Prisma.Decimal): boolean {
  if (step.lte(0)) {
    return false;
  }
  return value.mod(step).eq(0);
}
