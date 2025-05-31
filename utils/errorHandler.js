// server/utils/errorHandler.js
export class AppError extends Error {
    constructor(message, statusCode = 500, errors = null) {
      super(message);
      this.statusCode = statusCode;
      this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
      this.errors = errors;
      this.isOperational = true;
  
      Error.captureStackTrace(this, this.constructor);
    }
  
    static badRequest(message = 'Bad Request', errors = null) {
      return new AppError(message, 400, errors);
    }
  
    static unauthorized(message = 'Unauthorized') {
      return new AppError(message, 401);
    }
  
    static forbidden(message = 'Forbidden') {
      return new AppError(message, 403);
    }
  
    static notFound(message = 'Not Found') {
      return new AppError(message, 404);
    }
  
    static validationError(errors) {
      return new AppError('Validation Error', 422, errors);
    }
  }
  
  // Error middleware for Express
  export const errorMiddleware = (err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';
  
    if (process.env.NODE_ENV === 'development') {
      return res.status(err.statusCode).json({
        status: err.status,
        error: err,
        message: err.message,
        stack: err.stack
      });
    }
  
    // Production error response
    if (err.isOperational) {
      return res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
        ...(err.errors && { errors: err.errors })
      });
    }
  
    // Log unexpected errors
    console.error('ERROR 💥', err);
  
    // Send generic error message
    return res.status(500).json({
      status: 'error',
      message: 'Something went wrong'
    });
  };
  
  // Async handler wrapper
  export const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };