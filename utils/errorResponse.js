// server/utils/errorResponse.js
export class ErrorResponse extends Error {
  constructor(message, statusCode, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad Request', errors = null) {
    return new ErrorResponse(message, 400, errors);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ErrorResponse(message, 401);
  }

  static forbidden(message = 'Forbidden') {
    return new ErrorResponse(message, 403);
  }

  static notFound(message = 'Not Found') {
    return new ErrorResponse(message, 404);
  }

  static tooManyRequests(message = 'Too Many Requests') {
    return new ErrorResponse(message, 429);
  }

  static internal(message = 'Internal Server Error') {
    return new ErrorResponse(message, 500);
  }
}