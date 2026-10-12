import { Prisma } from "../generated/prisma/client.js";

export type DecimalInput = Prisma.Decimal | string | number;

export function decimal(value: DecimalInput): Prisma.Decimal {
  try {
    return new Prisma.Decimal(value);
  } catch {
    throw new Error("Invalid decimal value");
  }
}

export function decimalString(value: DecimalInput, places = 2): string {
  return decimal(value).toFixed(places);
}

export function assertPositiveDecimal(value: DecimalInput, field: string): Prisma.Decimal {
  const parsed = decimal(value);
  if (!parsed.isFinite() || parsed.lte(0)) {
    throw new Error(`${field} must be a positive decimal`);
  }
  return parsed;
}

export function isMultipleOfStep(value: Prisma.Decimal, step: Prisma.Decimal): boolean {
  if (step.lte(0)) {
    return false;
  }
  return value.mod(step).eq(0);
}
