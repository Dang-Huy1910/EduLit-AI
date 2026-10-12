export class DomainError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export class VersionConflictError extends DomainError {
  constructor(message = "Writing profile version conflict") {
    super("VERSION_CONFLICT", message);
    this.name = "VersionConflictError";
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
