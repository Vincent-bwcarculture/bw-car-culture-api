// server/middleware/errorHandler.js
const errorHandler = (err, req, res, next) => {
    console.error(err.stack);
  
    res.status(err.status || 500).json({
      success: false,
      error: {
        message: err.message || 'Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
      }
    });
  };
  
  export default errorHandler;