// server/middleware/async.js
// Async handler to wrap async route handlers and handle errors
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
  
  export default asyncHandler;