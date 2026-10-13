import { Catch, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { DomainError, isDomainError } from "../core/errors.js";
import { sanitizeErrorMessage } from "../core/sanitize.js";

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export class ApiHttpException extends HttpException {
  readonly errorCode: string;

  constructor(status: number, code: string, message: string) {
    super({ error: { code, message } } satisfies ApiErrorBody, status);
    this.errorCode = code;
  }
}

export const ERROR_MESSAGES = {
  VALIDATION: "Dữ liệu gửi lên không hợp lệ.",
  JSON_REQUIRED: "Yêu cầu phải gửi JSON.",
  CSRF_ORIGIN: "Yêu cầu bị từ chối vì nguồn gốc không hợp lệ.",
  AUTH_INVALID: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
  AUTH_CREDENTIALS: "Tên đăng nhập hoặc mật khẩu không đúng.",
  AUTH_RATE_LIMIT: "Quá nhiều lần đăng nhập không thành công. Vui lòng thử lại sau.",
  FORBIDDEN_ROLE: "Tài khoản không có quyền thực hiện thao tác này.",
  ACCOUNT_INACTIVE: "Tài khoản đã bị vô hiệu hóa.",
  NOT_FOUND: "Không tìm thấy tài nguyên.",
  CONFLICT: "Dữ liệu đã thay đổi. Vui lòng tải lại rồi thử lại.",
  OUTLINE_VERSION: "Dàn ý đã được lưu từ thiết bị khác. Hãy đối chiếu bản đang sửa trước khi lưu lại.",
  TURN_CONFLICT: "Có lượt chat mới hơn. Hãy tải lại lịch sử trước khi gửi.",
  REQUEST_ID_CONFLICT: "Mã lượt chat đã được dùng với nội dung khác.",
  CONTEXT_TOO_LARGE: "Ngữ liệu hoặc dàn ý vượt giới hạn xử lý.",
  RATE_LIMITED: "Hệ thống đang giới hạn tần suất. Vui lòng thử lại sau.",
  PROVIDER_UNAVAILABLE: "Trợ lý AI tạm thời không khả dụng.",
  PROVIDER_TIMEOUT: "Trợ lý AI phản hồi quá chậm. Vui lòng thử lại.",
  SESSION_CLOSED: "Đề đã đóng, không nhận lượt chat hoặc dàn ý mới.",
  SESSION_COMPLETED: "Phiên Socratic đã kết thúc, chỉ xem được lịch sử.",
  SESSION_SUBMITTED: "Bài đã nộp, không nhận lượt chat hoặc dàn ý mới.",
  INTERNAL: "Đã xảy ra lỗi. Vui lòng thử lại sau.",
} as const;

export function mapDomainError(error: DomainError): ApiHttpException {
  switch (error.code) {
    case "ACTOR_INVALID":
      return new ApiHttpException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", ERROR_MESSAGES.AUTH_INVALID);
    case "ACTOR_FORBIDDEN":
      return new ApiHttpException(HttpStatus.FORBIDDEN, "FORBIDDEN_ROLE", ERROR_MESSAGES.FORBIDDEN_ROLE);
    case "ACTOR_INACTIVE":
      return new ApiHttpException(HttpStatus.FORBIDDEN, "ACCOUNT_INACTIVE", ERROR_MESSAGES.ACCOUNT_INACTIVE);
    case "SESSION_NOT_FOUND":
    case "SESSION_OWNERSHIP":
      return new ApiHttpException(HttpStatus.NOT_FOUND, "NOT_FOUND", ERROR_MESSAGES.NOT_FOUND);
    case "SESSION_ASSIGNMENT":
    case "ASSIGNMENT_STATUS":
    case "ASSIGNMENT_CONFLICT":
      return new ApiHttpException(HttpStatus.CONFLICT, "SESSION_ASSIGNMENT", ERROR_MESSAGES.CONFLICT);
    case "ASSIGNMENT_NOT_FOUND":
    case "ASSIGNMENT_OWNERSHIP":
    case "DRAFT_NOT_FOUND":
    case "PAGE_NOT_FOUND":
    case "OCR_NOT_FOUND":
    case "FILE_NOT_FOUND":
    case "ASSESSMENT_MISSING":
    case "SUBMISSION_NOT_FOUND":
    case "ASSESSMENT_OWNERSHIP":
      return new ApiHttpException(HttpStatus.NOT_FOUND, "NOT_FOUND", ERROR_MESSAGES.NOT_FOUND);
    case "SESSION_COMPLETED":
      return new ApiHttpException(HttpStatus.CONFLICT, "SESSION_COMPLETED", ERROR_MESSAGES.SESSION_COMPLETED);
    case "SESSION_CLOSED":
      return new ApiHttpException(HttpStatus.CONFLICT, "SESSION_CLOSED", ERROR_MESSAGES.SESSION_CLOSED);
    case "SESSION_SUBMITTED":
      return new ApiHttpException(HttpStatus.CONFLICT, "SESSION_SUBMITTED", ERROR_MESSAGES.SESSION_SUBMITTED);
    case "TURN_CONFLICT":
      return new ApiHttpException(HttpStatus.CONFLICT, "TURN_CONFLICT", ERROR_MESSAGES.TURN_CONFLICT);
    case "REQUEST_ID_CONFLICT":
      return new ApiHttpException(HttpStatus.CONFLICT, "REQUEST_ID_CONFLICT", ERROR_MESSAGES.REQUEST_ID_CONFLICT);
    case "DRAFT_CONFLICT":
    case "OCR_CONFLICT":
    case "ASSESSMENT_UNIQUE":
    case "SUBMISSION_CONFLICT":
      return new ApiHttpException(HttpStatus.CONFLICT, error.code, ERROR_MESSAGES.CONFLICT);
    case "OUTLINE_VERSION":
      return new ApiHttpException(HttpStatus.CONFLICT, "OUTLINE_VERSION", ERROR_MESSAGES.OUTLINE_VERSION);
    case "OUTLINE_INVALID":
    case "CHAT_CONTENT":
    case "SESSION_SNAPSHOT":
    case "ASSIGNMENT_INPUT":
    case "ASSIGNMENT_CODE":
    case "GRADE_LEVEL":
    case "RUBRIC_SHAPE":
    case "RUBRIC_CRITERION":
    case "RUBRIC_WEIGHT":
    case "RUBRIC_WEIGHT_SUM":
    case "DRAFT_STATUS":
    case "PAGE_ORDER":
    case "MASK_INVALID":
    case "PRIVACY_REASON":
    case "OCR_ISSUE":
    case "OCR_TEXT":
    case "SUBMISSION_ASSIGNMENT":
    case "SUBMISSION_UNCONFIRMED":
    case "ASSESSMENT_STATUS":
    case "ASSESSMENT_REVIEW_REASON":
    case "EVALUATION_SHAPE":
    case "EVALUATION_CRITERION":
    case "EVALUATION_SCORE_RANGE":
    case "EVALUATION_SCORE_STEP":
    case "EVALUATION_TOTAL":
      return new ApiHttpException(HttpStatus.BAD_REQUEST, error.code, ERROR_MESSAGES.VALIDATION);
    case "UPLOAD_MEDIA":
      return new ApiHttpException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UPLOAD_MEDIA", ERROR_MESSAGES.VALIDATION);
    case "UPLOAD_LIMIT":
      return new ApiHttpException(HttpStatus.PAYLOAD_TOO_LARGE, "UPLOAD_LIMIT", ERROR_MESSAGES.VALIDATION);
    case "CONTEXT_TOO_LARGE":
      return new ApiHttpException(HttpStatus.PAYLOAD_TOO_LARGE, "CONTEXT_TOO_LARGE", ERROR_MESSAGES.CONTEXT_TOO_LARGE);
    case "RATE_LIMITED":
      return new ApiHttpException(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMITED", ERROR_MESSAGES.RATE_LIMITED);
    case "AI_NOT_CONFIGURED":
    case "MODEL_UNAVAILABLE":
    case "OCR_FIXTURE_MISSING":
      return new ApiHttpException(HttpStatus.SERVICE_UNAVAILABLE, "PROVIDER_UNAVAILABLE", ERROR_MESSAGES.PROVIDER_UNAVAILABLE);
    case "AI_TIMEOUT":
      return new ApiHttpException(HttpStatus.GATEWAY_TIMEOUT, "PROVIDER_TIMEOUT", ERROR_MESSAGES.PROVIDER_TIMEOUT);
    default:
      return new ApiHttpException(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL", ERROR_MESSAGES.INTERNAL);
  }
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("Http");

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const mapped = this.map(exception);
    if (mapped.getStatus() >= 500) {
      this.logger.error(sanitizeErrorMessage(exception));
    }
    response.status(mapped.getStatus()).json(mapped.getResponse());
  }

  private map(exception: unknown): ApiHttpException {
    if (exception instanceof ApiHttpException) {
      return exception;
    }
    if (isDomainError(exception)) {
      return mapDomainError(exception);
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
        return new ApiHttpException(status, "PAYLOAD_TOO_LARGE", ERROR_MESSAGES.VALIDATION);
      }
      if (status === HttpStatus.BAD_REQUEST) {
        return new ApiHttpException(status, "VALIDATION", ERROR_MESSAGES.VALIDATION);
      }
      const body = exception.getResponse();
      if (isApiErrorBody(body)) {
        return new ApiHttpException(status, body.error.code, body.error.message);
      }
      return new ApiHttpException(status, "HTTP_ERROR", ERROR_MESSAGES.INTERNAL);
    }
    if (isPayloadTooLarge(exception)) {
      return new ApiHttpException(HttpStatus.PAYLOAD_TOO_LARGE, "PAYLOAD_TOO_LARGE", ERROR_MESSAGES.VALIDATION);
    }
    if (exception instanceof SyntaxError) {
      return new ApiHttpException(HttpStatus.BAD_REQUEST, "VALIDATION", ERROR_MESSAGES.VALIDATION);
    }
    return new ApiHttpException(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL", ERROR_MESSAGES.INTERNAL);
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (!value || typeof value !== "object") {
    return false;
  }
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== "object") {
    return false;
  }
  const row = error as { code?: unknown; message?: unknown };
  return typeof row.code === "string" && typeof row.message === "string";
}

function isPayloadTooLarge(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const row = error as { type?: unknown; status?: unknown; statusCode?: unknown };
  return row.type === "entity.too.large" || row.status === 413 || row.statusCode === 413;
}
