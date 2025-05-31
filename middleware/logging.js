// server/middleware/logging.js

/**
 * Enhanced request logging middleware
 * Logs detailed information about incoming requests and their responses
 */
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Log request details
  console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Headers:', {
    'user-agent': req.headers['user-agent'],
    'content-type': req.headers['content-type'],
    'authorization': req.headers.authorization ? 'Bearer [TOKEN]' : 'No token',
    'content-length': req.headers['content-length'] || 'Not specified'
  });

  // Enhanced S3 monitoring for uploads
  if (req.url.includes('/images/upload') || 
      (req.url.includes('/listings') && req.method === 'POST') ||
      (req.url.includes('/upload/multiple'))) {
    console.log('🔍 S3 Upload Monitoring: Request contains file upload');
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Content-Length:', req.headers['content-length']);
    console.log('Origin:', req.headers.origin || 'Not specified');
  }

  // Log request body if present (excluding sensitive data)
  if (req.body && Object.keys(req.body).length > 0) {
    const sanitizedBody = { ...req.body };
    
    // Redact sensitive information
    if (sanitizedBody.password) sanitizedBody.password = '[REDACTED]';
    if (sanitizedBody.token) sanitizedBody.token = '[REDACTED]';
    if (sanitizedBody.jwt) sanitizedBody.jwt = '[REDACTED]';
    
    // For listing data, log important fields but not the entire object
    if (sanitizedBody.listingData) {
      try {
        const listingData = typeof sanitizedBody.listingData === 'string'
          ? JSON.parse(sanitizedBody.listingData)
          : sanitizedBody.listingData;
          
        sanitizedBody.listingData = {
          title: listingData.title,
          price: listingData.price,
          category: listingData.category,
          imageCount: listingData.images?.length || 0
        };
      } catch (e) {
        sanitizedBody.listingData = '[PARSING_ERROR]';
      }
    }
    
    console.log('Body:', sanitizedBody);
  }

  // Log files if present
  if (req.files) {
    if (Array.isArray(req.files)) {
      console.log('Files:', req.files.map(f => ({
        filename: f.originalname,
        size: f.size,
        mimetype: f.mimetype
      })));
    } else {
      // Handle non-array files object (e.g., when using multer's fields naming)
      console.log('Files:', Object.keys(req.files).map(fieldName => ({
        field: fieldName,
        count: req.files[fieldName].length,
        files: req.files[fieldName].map(f => ({
          filename: f.originalname,
          size: f.size,
          mimetype: f.mimetype
        }))
      })));
    }
  }

  // Capture response data
  const oldSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - startTime;

    // Log response details
    console.log(`Response Time: ${duration}ms`);
    console.log('Status:', res.statusCode);

    // Log response data (excluding sensitive info)
    if (data) {
      try {
        const responseData = JSON.parse(data);
        
        // Redact sensitive information
        if (responseData.token) responseData.token = '[REDACTED]';
        if (responseData.jwt) responseData.jwt = '[REDACTED]';
        
        // Enhanced logging for S3 uploads
        if (req.url.includes('/images/upload') || 
            (req.url.includes('/listings') && req.method === 'POST') ||
            (req.url.includes('/upload/multiple'))) {
          console.log('🔍 S3 Upload Result:', {
            success: responseData.success,
            count: responseData.count,
            imageCount: responseData.data?.length || 0
          });
          
          // Log first image URL for verification
          if (responseData.success && responseData.data && responseData.data.length > 0) {
            console.log('First Image URL:', responseData.data[0]?.url);
            console.log('Is S3 URL:', responseData.data[0]?.url?.includes('s3.amazonaws.com') ? 'Yes' : 'No');
          }
        } else {
          // For non-upload endpoints, log a summary of the response
          console.log('Response Data:', {
            success: responseData.success,
            dataType: responseData.data ? typeof responseData.data : null,
            dataLength: Array.isArray(responseData.data) ? responseData.data.length : null,
            message: responseData.message,
            error: responseData.error
          });
        }
      } catch (e) {
        // If data isn't JSON, just log length
        console.log('Response Size:', data.length);
        console.log('Response Type:', typeof data);
        
        // Try to show a preview for HTML or text
        if (typeof data === 'string') {
          console.log('Preview:', data.length > 100 ? data.substring(0, 100) + '...' : data);
        }
      }
    }

    console.log(`[${new Date().toISOString()}] Request completed in ${duration}ms\n`);
    oldSend.apply(res, arguments);
  };

  next();
};

/**
 * Enhanced error logging middleware
 * Logs detailed information about errors that occur during request processing
 */
export const errorLogger = (err, req, res, next) => {
  console.error('\n[ERROR]', {
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
    error: {
      name: err.name,
      message: err.message,
      code: err.code,
      statusCode: err.statusCode || 500,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    },
    user: req.user ? {
      id: req.user.id,
      role: req.user.role
    } : 'Not authenticated'
  });

  // Special logging for S3 errors
  if (err.code && (
      err.code.includes('S3') || 
      err.code === 'CredentialsError' || 
      err.code === 'NoSuchBucket' || 
      err.code === 'AccessDenied')) {
    console.error('\n🔴 AWS S3 ERROR:', {
      code: err.code,
      message: err.message,
      region: process.env.AWS_REGION,
      bucket: process.env.AWS_S3_BUCKET,
      requestPath: req.path,
      hasCredentials: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
    });
    console.error('S3 troubleshooting tips:');
    console.error('1. Verify your AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are correct');
    console.error('2. Check that your IAM user has S3 permissions (s3:PutObject, s3:GetObject, s3:DeleteObject)');
    console.error('3. Verify your AWS_S3_BUCKET exists and is accessible');
    console.error('4. Check your AWS_REGION matches the bucket region');
  }

  // Database connection errors
  if (err.name === 'MongooseError' || err.name === 'MongoError') {
    console.error('Database Error Details:', {
      database: process.env.MONGODB_URI?.split('/').pop() || 'Unknown DB',
      error: err.message,
      code: err.code,
      collection: err.collection
    });
  }

  next(err);
};

/**
 * Request size logger middleware
 * Logs warnings for large requests that might impact performance
 */
export const requestSizeLogger = (req, res, next) => {
  const contentLength = req.headers['content-length'];
  if (contentLength) {
    const sizeInMB = (parseInt(contentLength) / (1024 * 1024)).toFixed(2);
    if (sizeInMB > 1) { // Log if request is larger than 1MB
      console.log(`Large request detected: ${sizeInMB}MB`);
      
      // Additional size warnings for very large requests
      if (sizeInMB > 10) {
        console.warn(`⚠️ Very large request (${sizeInMB}MB) might cause performance issues`);
      }
    }
  }
  next();
};

/**
 * API performance monitoring middleware
 * Logs requests that exceed performance thresholds
 */
export const performanceMonitor = (req, res, next) => {
  const startTime = Date.now();
  
  // Add property to track when response is finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const slowThreshold = 1000; // 1 second
    
    if (duration > slowThreshold) {
      console.warn(`⚠️ SLOW REQUEST: ${req.method} ${req.url} took ${duration}ms`);
      console.warn('Request details:', {
        method: req.method,
        path: req.url,
        contentType: req.headers['content-type'],
        contentLength: req.headers['content-length'],
        user: req.user ? `${req.user.id} (${req.user.role})` : 'Not authenticated'
      });
    }
  });
  
  next();
};

// Optional compatibility export for CommonJS style imports
export default {
  requestLogger,
  errorLogger,
  requestSizeLogger,
  performanceMonitor
};