import { ErrorCode } from './error-codes';

export class ApiError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /**
   * Serializes the error into a plain object suitable for API responses.
   */
  toJSON(): {
    code: ErrorCode;
    message: string;
    statusCode: number;
    details?: Record<string, unknown>;
  } {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      ...(this.details ? { details: this.details } : {}),
    };
  }

  // ------ Factory methods for common errors ------

  static badRequest(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ): ApiError {
    return new ApiError(code, message, 400, details);
  }

  static unauthorized(
    message = 'Authentication required',
    code: ErrorCode = ErrorCode.AUTH_UNAUTHORIZED,
  ): ApiError {
    return new ApiError(code, message, 401);
  }

  static forbidden(
    message = 'Insufficient permissions',
    code: ErrorCode = ErrorCode.AUTH_FORBIDDEN,
  ): ApiError {
    return new ApiError(code, message, 403);
  }

  static notFound(
    code: ErrorCode = ErrorCode.RESOURCE_NOT_FOUND,
    message = 'Resource not found',
  ): ApiError {
    return new ApiError(code, message, 404);
  }

  static conflict(
    code: ErrorCode = ErrorCode.CONFLICT,
    message: string,
    details?: Record<string, unknown>,
  ): ApiError {
    return new ApiError(code, message, 409, details);
  }

  static validationError(
    message: string,
    details?: Record<string, unknown>,
  ): ApiError {
    return new ApiError(ErrorCode.VALIDATION_ERROR, message, 422, details);
  }

  static rateLimited(message = 'Too many requests'): ApiError {
    return new ApiError(ErrorCode.RATE_LIMIT_EXCEEDED, message, 429);
  }

  static internal(message = 'Internal server error'): ApiError {
    return new ApiError(ErrorCode.INTERNAL_SERVER_ERROR, message, 500);
  }

  static serviceUnavailable(message = 'Service temporarily unavailable'): ApiError {
    return new ApiError(ErrorCode.SERVICE_UNAVAILABLE, message, 503);
  }
}
