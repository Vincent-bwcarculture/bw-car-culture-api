// server.js - Complete with Analytics Integration
import './env.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CRITICAL: Force load environment variables from server directory FIRST
const serverEnvPath = path.join(__dirname, '.env');  // <-- Check server/.env first
if (fs.existsSync(serverEnvPath)) {
  console.log(`🔑 Loading environment variables from server dir: ${serverEnvPath}`);
  dotenv.config({ path: serverEnvPath });
} else {
  // Try parent directory as fallback
  const rootEnvPath = path.join(__dirname, '../.env');
  if (fs.existsSync(rootEnvPath)) {
    console.log(`🔑 Loading environment variables from root: ${rootEnvPath}`);
    dotenv.config({ path: rootEnvPath });
  } else {
    console.warn('❌ No .env file found in server or project root!');
    dotenv.config(); // Try default .env in process.cwd()
  }
}

// IMMEDIATELY verify if AWS credentials were loaded
console.log('=== AWS S3 Configuration Check ===');
console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? '✅ Set' : '❌ Missing');
console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '✅ Set' : '❌ Missing');
console.log('AWS_REGION:', process.env.AWS_REGION || '❌ Missing');
console.log('AWS_S3_BUCKET:', process.env.AWS_S3_BUCKET || '❌ Missing');
console.log('================================\n');

// Set HARD FALLBACK for AWS variables if they're not loaded from .env
// This ensures they're available throughout the application regardless of .env loading
if (!process.env.AWS_ACCESS_KEY_ID) {
  console.warn('⚠️ AWS_ACCESS_KEY_ID not found in .env, using fallback value');
  process.env.AWS_ACCESS_KEY_ID = 'AKIA...[your-actual-key-here]';
}

if (!process.env.AWS_SECRET_ACCESS_KEY) {
  console.warn('⚠️ AWS_SECRET_ACCESS_KEY not found in .env, using fallback value');
  process.env.AWS_SECRET_ACCESS_KEY = '[your-actual-secret-here]';
}

if (!process.env.AWS_REGION) {
  console.warn('⚠️ AWS_REGION not found in .env, using fallback value');
  process.env.AWS_REGION = 'us-east-1';
}

if (!process.env.AWS_S3_BUCKET) {
  console.warn('⚠️ AWS_S3_BUCKET not found in .env, using fallback value');
  process.env.AWS_S3_BUCKET = 'i3wcarculture-images';
}

// Log environment variables right after setting fallbacks
console.log('=== Post-Fallback Environment Check ===');
console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? '✅ Set' : '❌ Still Missing');
console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '✅ Set' : '❌ Still Missing');
console.log('AWS_REGION:', process.env.AWS_REGION);
console.log('AWS_S3_BUCKET:', process.env.AWS_S3_BUCKET);
console.log('====================================\n');

// NOW import everything else - AFTER environment variables are guaranteed to be set
import { requestLogger, errorLogger, requestSizeLogger } from './middleware/logging.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import multer from 'multer';
import { db } from './config/database.js';
import { errorMiddleware } from './utils/errorHandler.js';

// ANALYTICS IMPORTS - ADDED FOR ANALYTICS INTEGRATION
import analyticsRoutes from './routes/analyticsRoutes.js';
import { 
  initializeSession, 
  trackPageView, 
  trackAPIUsage, 
  trackErrors, 
  scheduleCleanup 
} from './middleware/analytics.js';
import analyticsService from './services/analyticsService.js';
// Import analytics models to ensure they're registered with MongoDB
import './models/Analytics.js';

// Import analytics middleware and services
import { trackPageView as analyticsTrackPageView, initializeSession as analyticsInitializeSession, trackErrors as analyticsTrackErrors } from './middleware/analytics.js';
import scheduledTasks from '../client/src/utils/scheduledTasks.js';

// Import routes
import listingRoutes from './routes/listingRoutes.js';
import authRoutes from './routes/authRoutes.js';
import imageRoutes from './routes/imageRoutes.js';
import newsRoutes from './routes/newsRoutes.js';
import dealerRoutes from './routes/dealerRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import serviceProviderRoutes from './routes/serviceProviderRoutes.js';
import rentalVehicleRoutes from './routes/rentalVehicleRoutes.js';
import trailerListingRoutes from './routes/trailerListingRoutes.js';
import transportRouteRoutes from './routes/transportRouteRoutes.js';
import videoRoutes from './routes/videoRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import providerRequestRoutes from './routes/providerRequestRoutes.js';
import ministryRequestRoutes from './routes/ministryRequestRoutes.js';
import feedbackRoutes from './routes/feedbackRoutes.js';

import { ensureUploadDirectories } from './utils/uploadDiagnostics.js';

// AWS S3 imports - AFTER environment variables are set
import { s3Config, s3, normalizeS3Key, isS3Configured, testS3Connection } from './config/s3.js';
import { uploadMultipleImagesToS3 } from './utils/s3Upload.js';
import { checkS3ObjectExists } from './utils/s3Delete.js';

// AWS SDK Version warning
if (process.env.NODE_ENV === 'production') {
  console.warn(`
=================================================================
⚠️  IMPORTANT: AWS SDK WARNING ⚠️
The AWS SDK for JavaScript (v2) is in maintenance mode.
Consider upgrading to AWS SDK for JavaScript (v3) before deploying
to production for better performance and ongoing support.
See: https://aws.amazon.com/blogs/developer/modular-aws-sdk-for-javascript-is-now-generally-available/
=================================================================
`);
}

// Validate essential environment variables
const requiredEnvVars = ['NODE_ENV', 'PORT', 'MONGODB_URI', 'JWT_SECRET'];
const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars);
  console.error('Please ensure all required variables are set in your .env file');
  process.exit(1);
}

// Configure rate limiters
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many auth attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/auth/me'
});

const app = express();

// Enhanced CORS configuration with special handling for multipart/form-data
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like Postman, mobile apps)
    if (!origin) return callback(null, true);
    
    // In development, allow all origins
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    // In production, check against allowed origins
    const allowedOrigins = [
      process.env.CLIENT_URL,
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5000',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:5000'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true); // For now, allow all origins to test
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'X-Requested-With', 'Content-Length', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range', 'Content-Length'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400
};

// Apply CORS
app.use(cors(corsOptions));

// Add specific handling for multipart/form-data
app.use((req, res, next) => {
  // Handle all Content-Type headers to prevent issues with multipart/form-data
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Special handling for OPTIONS requests (preflight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Handle preflight requests for all routes
app.options('*', cors(corsOptions));

// Security configuration
const securityConfig = {
  helmetOptions: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'https:', s3Config.baseUrl],
        fontSrc: ["'self'", 'fonts.gstatic.com'],
        connectSrc: ["'self'", 'http://localhost:5000', 'http://localhost:3000', s3Config.baseUrl],
        frameSrc: ["'self'", 'https://www.youtube.com'], // Allow YouTube iframes
        mediaSrc: ["'self'", s3Config.baseUrl],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: false
  }
};

// Apply security middleware
app.use(helmet(securityConfig.helmetOptions));
app.use(compression());

// Create uploads directory for test uploads if it doesn't exist
const testUploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(testUploadsDir)) {
  fs.mkdirSync(testUploadsDir, { recursive: true });
  console.log(`Created test uploads directory: ${testUploadsDir}`);
}

// Create uploads/listings directory if it doesn't exist
const listingsDir = path.join(testUploadsDir, 'listings');
if (!fs.existsSync(listingsDir)) {
  fs.mkdirSync(listingsDir, { recursive: true });
  console.log(`Created listings directory: ${listingsDir}`);
}

// Create uploads/listings/thumbnails directory if it doesn't exist
const listingsThumbnailsDir = path.join(testUploadsDir, 'listings', 'thumbnails');
if (!fs.existsSync(listingsThumbnailsDir)) {
  fs.mkdirSync(listingsThumbnailsDir, { recursive: true });
  console.log(`Created listings thumbnails directory: ${listingsThumbnailsDir}`);
}

// Ensure all necessary upload directories exist
const uploadDirs = [
  'public/uploads', 
  'public/uploads/listings',
  'public/uploads/listings/thumbnails',
  'public/uploads/news',
  'public/uploads/news/thumbnails',
  'public/uploads/news/gallery',
  'public/uploads/news/gallery/thumbnails',
  'public/uploads/default',
  'public/uploads/default/thumbnails',
  'public/images/logos', 
  'public/images/avatars',
  'public/images/placeholders',
  'uploads',
  'uploads/default',
  'uploads/default/thumbnails',
  'uploads/news',
  'uploads/news/thumbnails',
  'uploads/news/gallery',
  'uploads/news/gallery/thumbnails',
  'uploads/listings',
  'uploads/listings/thumbnails',
  'public/uploads/dealers',
  'public/uploads/dealers/thumbnails',
  'uploads/dealers',
  'uploads/dealers/thumbnails',
  // New directories for service providers
  'public/uploads/providers',
  'uploads/providers',
  'public/uploads/rentals',
  'uploads/rentals',
  'public/uploads/rentals/thumbnails',
  'uploads/rentals/thumbnails',
  'public/uploads/trailers',
  'uploads/trailers',
  'public/uploads/trailers/thumbnails',
  'uploads/trailers/thumbnails',
  'public/uploads/transport',
  'uploads/transport',
  'public/uploads/transport/thumbnails',
  'uploads/transport/thumbnails',
  // New directories for videos
  'public/uploads/videos',
  'uploads/videos',
  'public/uploads/videos/thumbnails',
  'uploads/videos/thumbnails',
  // New directories for provider and ministry requests
  'public/uploads/provider-requests',
  'uploads/provider-requests',
  'public/uploads/ministry-requests',
  'uploads/ministry-requests'
];

uploadDirs.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Created directory: ${dirPath}`);
    } catch (error) {
      console.error(`Failed to create directory ${dir}:`, error);
    }
  }
});

// Create placeholder images if they don't exist
const placeholderImages = [
  { 
    path: 'public/images/placeholders/default.jpg',
    source: 'public/images/default-placeholder.png'
  },
  { 
    path: 'public/images/placeholders/dealer-logo.jpg',
    source: 'public/images/default-placeholder.png'
  },
  { 
    path: 'public/images/placeholders/dealer-banner.jpg',
    source: 'public/images/default-placeholder.png'
  },
  { 
    path: 'public/images/placeholders/car.jpg',
    source: 'public/images/default-placeholder.png'
  },
  // New placeholders for rental vehicles, trailers, and transport
  { 
    path: 'public/images/placeholders/rental.jpg',
    source: 'public/images/default-placeholder.png'
  },
  { 
    path: 'public/images/placeholders/trailer.jpg',
    source: 'public/images/default-placeholder.png'
  },
  { 
    path: 'public/images/placeholders/transport.jpg',
    source: 'public/images/default-placeholder.png'
  },
  // New placeholder for video thumbnails
  { 
    path: 'public/images/placeholders/video.jpg',
    source: 'public/images/default-placeholder.png'
  }
];

// Ensure placeholders directory exists
const placeholdersDir = path.join(__dirname, 'public/images/placeholders');
if (!fs.existsSync(placeholdersDir)) {
  fs.mkdirSync(placeholdersDir, { recursive: true });
}

// Create placeholder images
placeholderImages.forEach(img => {
  const placeholderPath = path.join(__dirname, img.path);
  if (!fs.existsSync(placeholderPath)) {
    try {
      // Copy from an existing image if available
      const sourceImage = path.join(__dirname, img.source);
      if (fs.existsSync(sourceImage)) {
        fs.copyFileSync(sourceImage, placeholderPath);
        console.log(`Created placeholder image: ${img.path}`);
      }
    } catch (err) {
      console.log(`Placeholder image creation failed for ${img.path}:`, err);
    }
  }
});

// MIDDLEWARE CONFIGURATION
app.use((req, res, next) => {
  // Check if it's a multipart request
  if (req.headers['content-type']?.includes('multipart/form-data')) {
    console.log('Detected multipart/form-data request, skipping body parsing middleware');
    return next();
  }
  
  // For non-multipart requests, apply standard parsers
  express.json({ limit: '10mb' })(req, res, (err) => {
    if (err) {
      console.error('JSON parsing error:', err);
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid JSON in request body' 
      });
    }
    
    express.urlencoded({ extended: true, limit: '10mb' })(req, res, (err) => {
      if (err) {
        console.error('URL-encoded parsing error:', err);
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid URL-encoded data in request body' 
        });
      }
      
      next();
    });
  });
});

// Add middleware to detect and correct duplicate '/api' paths
app.use((req, res, next) => {
  // Check if the request URL contains duplicate '/api' paths
  if (req.originalUrl.includes('/api/api/')) {
    console.error(`⚠️ Request URL has duplicate 'api' path: ${req.originalUrl}`);
    // Correct the URL by removing duplicate '/api'
    const correctedUrl = req.originalUrl.replace('/api/api/', '/api/');
    console.log(`Redirecting to corrected URL: ${correctedUrl}`);
    return res.redirect(correctedUrl);
  }
  next();
});

// Set environment variables if not already set
if (!process.env.FILE_UPLOAD_PATH) {
  process.env.FILE_UPLOAD_PATH = './public/uploads';
}

if (!process.env.PUBLIC_URL) {
  process.env.PUBLIC_URL = `http://localhost:${process.env.PORT || 5000}`;
}

// ============================================
// ANALYTICS MIDDLEWARE INTEGRATION - ADDED
// ============================================
console.log('🔧 Setting up analytics middleware...');

// Initialize analytics sessions for all requests
app.use(initializeSession);

// Track page views for non-API routes
app.use(trackPageView);

// Track API usage for all API routes
app.use(trackAPIUsage);

console.log('✅ Analytics middleware configured successfully');

// PRODUCTION-READY S3 EMERGENCY HANDLER
app.post('/api/images/upload/multiple', (req, res) => {
  console.log('🚀 PRODUCTION S3 HANDLER for /api/images/upload/multiple');
  
  // Use memory storage to temporarily hold files
  const storage = multer.memoryStorage();
  const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
  }).array('images', 10);
  
  upload(req, res, async function(err) {
    if (err) {
      console.error('❌ Upload error:', err);
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
    
    // Check if files were uploaded
    if (!req.files || req.files.length === 0) {
      console.error('❌ No files in request');
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }
    
    // Log success
    console.log(`✅ Received ${req.files.length} files, processing for S3 upload`);
    
    try {
      // CRITICAL: Verify s3Config is available and AWS credentials are set
      if (!s3Config || !s3) {
        throw new Error('S3 configuration is missing or invalid. Check AWS credentials.');
      }

      if (!s3Config.enabled) {
        throw new Error('S3 is not enabled in configuration. Check AWS credentials.');
      }

      const folder = req.body.folder || 'listings';
      
      // Import the upload function directly
      const { uploadMultipleImagesToS3 } = await import('./utils/s3Upload.js');
      
      const results = await uploadMultipleImagesToS3(req.files, folder, {
        optimization: {
          quality: 85,
          format: 'webp'
        },
        createThumbnail: true
      });
      
      // Normalize results to prevent path issues
      const normalizedResults = results.map(result => {
        if (result.url && result.url.includes('/images/images/')) {
          result.url = result.url.replace(/\/images\/images\//g, '/images/');
        }
        if (result.key && result.key.includes('images/images/')) {
          result.key = result.key.replace(/images\/images\//g, 'images/');
        }
        if (result.thumbnail && result.thumbnail.url && result.thumbnail.url.includes('/images/images/')) {
          result.thumbnail.url = result.thumbnail.url.replace(/\/images\/images\//g, '/images/');
        }
        return result;
      });
      
      console.log(`✅ Successfully uploaded ${normalizedResults.length} images to S3`);
      
      // Format response data
      const responseData = normalizedResults.map(result => ({
        url: result.url || '',
        key: result.key || '',
        thumbnail: result.thumbnail?.url || result.thumbnail || null,
        thumbnailKey: result.thumbnailKey || null,
        filename: result.filename || '',
        size: result.size || 0,
        mimetype: result.mimetype || 'image/jpeg'
      }));
      
      // Send successful response
      return res.status(200).json({
        success: true,
        count: responseData.length,
        data: responseData
      });
    } catch (uploadError) {
      console.error('❌ S3 upload error:', uploadError);
      
      // Create fallback URLs
      console.log('Creating fallback URLs for local storage');
      const fallbackResults = req.files.map((file, index) => {
        const timestamp = Date.now();
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const filename = `${timestamp}-${index}-${safeName}`;
        
        return {
          url: `/uploads/listings/${filename}`,
          key: `listings/${filename}`,
          thumbnail: `/uploads/listings/thumbnails/${filename}`,
          size: file.size,
          mimetype: file.mimetype,
          isFallback: true
        };
      });
      
      return res.status(200).json({
        success: true,
        count: fallbackResults.length,
        data: fallbackResults,
        warning: 'Using fallback local storage URLs - S3 upload failed'
      });
    }
  });
});

// GET handler for redirects
app.get('/api/images/upload/multiple', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Image upload endpoint is working. Please use POST method to upload files.'
  });
});

console.log('🚀 PRODUCTION S3 UPLOAD HANDLER REGISTERED');

// Now setup standard static serving
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '1d',
  fallthrough: true,
  index: false,
  etag: true
}));

app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'), {
  maxAge: '1d',
  fallthrough: true,
  index: false,
  etag: true
}));

// Additional static paths for news images
app.use('/uploads/news', express.static(path.join(__dirname, 'uploads/news')));
app.use('/uploads/news', express.static(path.join(__dirname, 'public/uploads/news')));
app.use('/uploads/news/gallery', express.static(path.join(__dirname, 'uploads/news/gallery')));
app.use('/uploads/news/gallery', express.static(path.join(__dirname, 'public/uploads/news/gallery')));

// Additional static paths for service provider images
app.use('/uploads/providers', express.static(path.join(__dirname, 'uploads/providers')));
app.use('/uploads/providers', express.static(path.join(__dirname, 'public/uploads/providers')));
app.use('/uploads/rentals', express.static(path.join(__dirname, 'uploads/rentals')));
app.use('/uploads/rentals', express.static(path.join(__dirname, 'public/uploads/rentals')));
app.use('/uploads/trailers', express.static(path.join(__dirname, 'uploads/trailers')));
app.use('/uploads/trailers', express.static(path.join(__dirname, 'public/uploads/trailers')));
app.use('/uploads/transport', express.static(path.join(__dirname, 'uploads/transport')));
app.use('/uploads/transport', express.static(path.join(__dirname, 'public/uploads/transport')));

// Additional static paths for videos
app.use('/uploads/videos', express.static(path.join(__dirname, 'uploads/videos')));
app.use('/uploads/videos', express.static(path.join(__dirname, 'public/uploads/videos')));

// General static file serving
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d',
  index: false
}));

// Enhanced request logging
if (process.env.NODE_ENV === 'development') {
  // Add mongoose debug logging in development
  mongoose.set('debug', true);
  
  app.use(requestLogger);
  app.use(requestSizeLogger);
}

// TEST ROUTES
app.post('/api/test-upload', (req, res) => {
  console.log('Received test upload request');
  console.log('Headers:', {
    'content-type': req.headers['content-type'],
    'content-length': req.headers['content-length']
  });
  
  const diskStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + '-' + file.originalname);
    }
  });
  
  const diskUpload = multer({ storage: diskStorage }).single('file');
  
  diskUpload(req, res, (err) => {
    if (err) {
      console.error('Multer error during test:', err);
      return res.status(400).json({
        success: false,
        message: 'Upload test failed',
        error: err.message
      });
    }
    
    if (!req.file) {
      console.warn('No file received in test upload');
      return res.status(400).json({
        success: false,
        message: 'No file received'
      });
    }
    
    console.log('Test upload successful:', req.file);
    return res.status(200).json({
      success: true,
      message: 'Test upload successful',
      file: {
        filename: req.file.filename,
        path: req.file.path,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  });
});

// Simple file upload test with memory storage
app.post('/api/test-upload-memory', (req, res) => {
  console.log('Received test memory upload request');
  
  const memStorage = multer.memoryStorage();
  const memUpload = multer({ 
    storage: memStorage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB
  }).single('file');
  
  memUpload(req, res, (err) => {
    if (err) {
      console.error('Multer memory error:', err);
      return res.status(400).json({
        success: false,
        message: 'Memory upload test failed',
        error: err.message
      });
    }
    
    if (!req.file) {
      console.warn('No file received in memory test');
      return res.status(400).json({
        success: false,
        message: 'No file received in memory storage test'
      });
    }
    
    console.log('Memory test upload successful:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      buffer: req.file.buffer ? 'Present' : 'Missing'
    });
    
    return res.status(200).json({
      success: true,
      message: 'Memory test upload successful',
      file: {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      }
    });
  });
});

// API ROUTES
app.use('/api/stats', statsRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/inventory', inventoryRoutes);

// IMPORTANT: Register imageRoutes AFTER the direct emergency handler
app.use('/api/images', imageRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/dealers', dealerRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/providers', serviceProviderRoutes);
app.use('/api/rentals', rentalVehicleRoutes);
app.use('/api/trailers', trailerListingRoutes);
app.use('/api/transport', transportRouteRoutes);
app.use('/api/provider-requests', providerRequestRoutes);
app.use('/api/ministry-requests', ministryRequestRoutes);

// ============================================
// ANALYTICS ROUTES INTEGRATION - ADDED
// ============================================
app.use('/api/analytics', analyticsRoutes);
console.log('📊 Analytics routes registered: /api/analytics');

// Apply rate limiting AFTER auth routes so login isn't affected
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api', apiLimiter);

// Add a test endpoint to verify server is working
app.get('/test', (req, res) => {
  res.status(200).json({ 
    status: 'success', 
    message: 'Server is working correctly',
    routes: {
      news: '/api/news',
      auth: '/api/auth',
      listings: '/api/listings',
      images: '/api/images',
      dealers: '/api/dealers',
      providers: '/api/providers',
      rentals: '/api/rentals',
      trailers: '/api/trailers',
      transport: '/api/transport',
      videos: '/api/videos',
      providerRequests: '/api/provider-requests',
      ministryRequests: '/api/ministry-requests',
      analytics: '/api/analytics' // ADDED ANALYTICS ROUTE
    }
  });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const dbHealth = await db.healthCheck();
    
    // Check for AWS credentials again here - to verify they're still available
    const awsCredentialsAvailable = !!process.env.AWS_ACCESS_KEY_ID && 
                                  !!process.env.AWS_SECRET_ACCESS_KEY;
    
    res.status(200).json({
      status: 'success',
      message: 'Server is running',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      database: dbHealth ? 'connected' : 'disconnected',
      s3: {
        configured: !!s3Config.bucket,
        bucket: s3Config.bucket,
        region: s3Config.region,
        baseUrl: s3Config.baseUrl,
        enabled: s3Config.enabled,
        credentialsAvailable: awsCredentialsAvailable
      },
      analytics: {
        enabled: true,
        routes: ['/api/analytics/dashboard', '/api/analytics/realtime', '/api/analytics/traffic']
      },
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(200).json({
      status: 'warning',
      message: 'Server running with warnings',
      error: error.message
    });
  }
});

// S3 Specific health check endpoint
app.get('/api/health/s3', async (req, res) => {
  try {
    // First check if AWS credentials are available
    const configStatus = isS3Configured();
    
    if (!configStatus.hasCredentials) {
      return res.status(200).json({
        status: 'error',
        message: 'AWS credentials are missing',
        details: configStatus
      });
    }
    
    // Test connection to S3
    const connectionTest = await testS3Connection();
    
    return res.status(200).json({
      status: connectionTest.success ? 'success' : 'error',
      message: connectionTest.message,
      s3: {
        ...configStatus,
        ...connectionTest
      }
    });
  } catch (error) {
    console.error('S3 health check error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Error checking S3 health',
      error: error.message
    });
  }
});

// DIRECT ROUTE FOR LISTING IMAGES - CRITICAL FIX
app.get('/uploads/listings/:filename(*)', (req, res) => {
  const filename = req.params.filename;
  console.log(`🔄 Direct access to listing image: ${filename}`);
  
  // Try to find the file in various locations
  const possiblePaths = [
    path.join(__dirname, 'public/uploads/listings', filename),
    path.join(__dirname, 'uploads/listings', filename)
  ];
  
  // Try local paths first
  for (const localPath of possiblePaths) {
    if (fs.existsSync(localPath)) {
      return res.sendFile(localPath);
    }
  }
  
  // If not found and S3 is enabled, try S3 proxy
  if (s3Config && s3Config.enabled) {
    try {
      const s3Key = `images/listings/${filename}`;
      return res.redirect(`/api/images/s3-proxy/${s3Key}`);
    } catch (err) {
      console.error('S3 proxy redirect error:', err);
    }
  }
  
  // Fallback to placeholder
  return res.sendFile(path.join(__dirname, 'public/images/placeholders/car.jpg'));
});

// Additional routes to handle problematic image paths
app.get('/uploads/listings/images/:filename(*)', (req, res) => {
  console.log(`Intercepted duplicate path image URL: /uploads/listings/images/${req.params.filename}`);
  return res.redirect(`/uploads/listings/${req.params.filename}`);
});

app.get('/uploads/images/images/:path(*)', (req, res) => {
  console.log(`Intercepted deeply nested image path: ${req.path}`);
  const normalizedPath = `/uploads/images/${req.params.path}`;
  return res.redirect(normalizedPath);
});

// Fix for duplicate image paths in dynamic requests
app.get('*/images/images/*', (req, res, next) => {
  console.log(`⚠️ Fixing duplicate 'images' path: ${req.path}`);
  const correctedPath = req.path.replace(/\/images\/images\//g, '/images/');
  if (correctedPath !== req.path) {
    return res.redirect(correctedPath);
  }
  next();
});

// Add catch-all handler for any missing images to prevent 404s
app.use('/images/*', (req, res) => {
  console.log(`Image not found: ${req.path}, serving default placeholder`);
  res.sendFile(path.join(__dirname, 'public/images/placeholders/default.jpg'));
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.originalUrl} not found`
  });
});

app.use(errorLogger);

// Enhanced error middleware for better debugging
const enhancedErrorMiddleware = (err, req, res, next) => {
  // Log the original error but provide better formatting
  console.error('\n=== API ERROR ===');
  console.error(`Path: ${req.path}`);
  console.error(`Method: ${req.method}`);
  console.error(`Status: ${err.statusCode || 500}`);
  console.error(`Message: ${err.message}`);
  
  // Special handling for S3 errors
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
  
  // Log the stack trace in development mode
  if (process.env.NODE_ENV === 'development') {
    console.error('Stack trace:');
    console.error(err.stack);
  }
  
  console.error('=================\n');
  
  // Forward to the original error middleware
  next(err);
};

// Apply enhanced error middleware before standard error middleware
app.use(enhancedErrorMiddleware);

// ============================================
// ANALYTICS ERROR TRACKING - ADDED
// ============================================
app.use(trackErrors);

app.use(errorMiddleware);

const shutdownConfig = {
  timeout: 10000,
  signals: ['SIGTERM', 'SIGINT', 'SIGUSR2'],
  cleanup: async (signal) => {
    console.log(`\n${signal} signal received: closing HTTP server`);
    
    // ENHANCED: Stop analytics scheduled tasks
    try {
      if (analyticsService && typeof analyticsService.stopScheduledTasks === 'function') {
        analyticsService.stopScheduledTasks();
        console.log('✅ Analytics scheduled tasks stopped');
      }
    } catch (error) {
      console.error('❌ Error stopping analytics tasks:', error);
    }
    
    // Stop other scheduled tasks
    if (typeof scheduledTasks !== 'undefined' && scheduledTasks.stopAll) {
      scheduledTasks.stopAll();
    }
    
    await db.handleAppTermination();
    process.exit(0);
  }
};

shutdownConfig.signals.forEach(signal => {
  process.on(signal, () => {
    shutdownConfig.cleanup(signal);
    setTimeout(() => {
      console.log('Forcing shutdown');
      process.exit(1);
    }, shutdownConfig.timeout);
  });
});

const PORT = process.env.PORT || 5000;

// ============================================
// ENHANCED SERVER STARTUP WITH ANALYTICS
// ============================================
const startServer = async () => {
  try {
    // Connect to database first
    await db.connect();
    
    // Initialize analytics service
    console.log('🔧 Initializing analytics service...');
    try {
      await analyticsService.initialize();
      console.log('✅ Analytics service initialized successfully');
    } catch (analyticsError) {
      console.error('⚠️ Analytics service initialization failed (continuing without analytics):', analyticsError);
      // Don't fail the entire server if analytics fails
    }
    
    // Start analytics cleanup scheduler
    try {
      scheduleCleanup();
      console.log('✅ Analytics cleanup scheduler started');
    } catch (cleanupError) {
      console.error('⚠️ Analytics cleanup scheduler failed:', cleanupError);
    }
    
    // Ensure upload and news directories exist
    ensureUploadDirectories();
    
    app.listen(PORT, () => {
      console.log(`
        ===========================================
        🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}
        📁 File upload limit: ${app.get('json limit') || '10MB'}
        🔒 Security: Enabled
        🗄️  Database: Connected to ${process.env.MONGODB_URI}
        📂 File storage: ${s3Config.enabled ? `AWS S3 (Bucket: ${s3Config.bucket})` : 'Local storage'}
        🌐 API URL: ${process.env.PUBLIC_URL || `http://localhost:${PORT}`}/api
        🖥️  Client URL: ${process.env.CLIENT_URL || 'http://localhost:3000'}
        🚀 S3 EMERGENCY UPLOAD HANDLER REGISTERED
        📈 ANALYTICS SYSTEM ENABLED ✅
        ⏰ ANALYTICS CLEANUP SCHEDULED ✅
        📊 Analytics API: /api/analytics
        🔍 Analytics Health: /api/analytics/health
        👨‍💼 Admin Dashboard: /admin/analytics
        ===========================================
      `);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// For serverless deployment (Vercel)
export default app;