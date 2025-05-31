// server/middleware/security.js
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';

export const configureSecurityMiddleware = (app) => {
  // Set security headers
  app.use(helmet({
    // Allow multipart forms to work properly by disabling contentSecurityPolicy
    // You can re-enable it for other routes if needed
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'", 'fonts.gstatic.com'],
        connectSrc: ["'self'", 'http://localhost:5000', 'http://localhost:3000'],
        frameSrc: ["'self'", 'https://www.youtube.com'],
        mediaSrc: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  });
  app.use('/api/', limiter);

  // Sanitize data
  app.use(mongoSanitize());

  // Prevent XSS attacks
  app.use(xss());

  // CORS configuration with improved multipart form support
  app.use((req, res, next) => {
    // Default CORS headers
    res.setHeader('Access-Control-Allow-Origin', process.env.CLIENT_URL || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    // If this is a multipart/form-data request, ensure correct CORS headers
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    next();
  });

  // Add security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  // Prevent parameter pollution
  app.use((req, res, next) => {
    if (req.query) {
      for (let key in req.query) {
        if (Array.isArray(req.query[key])) {
          req.query[key] = req.query[key][0];
        }
      }
    }
    next();
  });
};