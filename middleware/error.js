// server/middleware/error.js
import { ErrorResponse } from '../utils/errorResponse.js';

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error for debugging
  if (process.env.NODE_ENV === 'development') {
    console.error('Error Stack:', err.stack);
  }

  // Log error details
  console.error({
    name: err.name,
    code: err.code,
    message: err.message,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    error = new ErrorResponse(
      'Resource not found',
      404
    );
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    error = new ErrorResponse(
      `Duplicate field value entered: ${field}`,
      400
    );
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(val => val.message);
    error = new ErrorResponse(
      'Invalid input data',
      400,
      messages
    );
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = new ErrorResponse(
      'Invalid token',
      401
    );
  }

  if (err.name === 'TokenExpiredError') {
    error = new ErrorResponse(
      'Token expired',
      401
    );
  }

  // Default error
  res.status(error.statusCode || 500).json({
    success: false,
    error: {
      message: error.message || 'Server Error',
      code: error.statusCode || 500,
      errors: error.errors || null,
      ...(process.env.NODE_ENV === 'development' && {
        stack: err.stack,
        details: err
      })
    }
  });
};

// server/middleware/error.js




export default errorHandler;