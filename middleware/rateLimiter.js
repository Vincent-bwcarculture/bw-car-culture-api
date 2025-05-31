// server/middleware/rateLimiter.js
import rateLimit from 'express-rate-limit';

export const rateLimiter = (maxAttempts = 5, windowMinutes = 15) => {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000, // Convert minutes to milliseconds
    max: maxAttempts,
    message: {
      success: false,
      message: `Too many requests from this IP. Please try again after ${windowMinutes} minutes`
    },
    standardHeaders: true,
    legacyHeaders: false
  });
};

// Basic rate limiter for general routes
export const basicLimiter = rateLimiter(100, 15); // 100 requests per 15 minutes

// Stricter limiter for auth routes
export const authLimiter = rateLimiter(5, 15); // 5 attempts per 15 minutes

// Very strict limiter for sensitive routes
export const strictLimiter = rateLimiter(3, 60); // 3 attempts per hour