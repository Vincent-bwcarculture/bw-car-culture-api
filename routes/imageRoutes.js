// server/routes/imageRoutes.js
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { s3Config, s3, normalizeS3Key } from '../config/s3.js';
import { uploadImageToS3, uploadMultipleImagesToS3 } from '../utils/s3Upload.js';
import { deleteFromS3, deleteImageWithThumbnail } from '../utils/s3Delete.js';

const router = express.Router();

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log(`Created uploads directory: ${uploadsDir}`);
}

// Create listings subdirectory
const listingsDir = path.join(uploadsDir, 'listings');
if (!fs.existsSync(listingsDir)) {
  fs.mkdirSync(listingsDir, { recursive: true });
  console.log(`Created listings directory: ${listingsDir}`);
}

// Create thumbnails directories
const listingsThumbnailsDir = path.join(listingsDir, 'thumbnails');
if (!fs.existsSync(listingsThumbnailsDir)) {
  fs.mkdirSync(listingsThumbnailsDir, { recursive: true });
  console.log(`Created listings thumbnails directory: ${listingsThumbnailsDir}`);
}

// Create public uploads directories if they don't exist
const publicUploadsDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(publicUploadsDir)) {
  fs.mkdirSync(publicUploadsDir, { recursive: true });
  console.log(`Created public uploads directory: ${publicUploadsDir}`);
}

const publicListingsDir = path.join(publicUploadsDir, 'listings');
if (!fs.existsSync(publicListingsDir)) {
  fs.mkdirSync(publicListingsDir, { recursive: true });
  console.log(`Created public listings directory: ${publicListingsDir}`);
}

const publicListingsThumbnailsDir = path.join(publicListingsDir, 'thumbnails');
if (!fs.existsSync(publicListingsThumbnailsDir)) {
  fs.mkdirSync(publicListingsThumbnailsDir, { recursive: true });
  console.log(`Created public listings thumbnails directory: ${publicListingsThumbnailsDir}`);
}

// Configure multer to use memory storage for S3 uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      console.warn(`Rejected file: ${file.originalname} (${file.mimetype}) - not an image`);
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Configure disk storage as fallback
const diskStorage = multer.diskStorage({
  destination: function(req, file, cb) {
    // Determine the correct folder based on request
    let folderPath = path.join(uploadsDir, 'default');
    
    if (req.body && req.body.folder) {
      folderPath = path.join(uploadsDir, req.body.folder);
    }
    
    // Ensure the folder exists
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    
    cb(null, folderPath);
  },
  filename: function(req, file, cb) {
    // Create a unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const diskUpload = multer({
  storage: diskStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    // Same filter as memory storage
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'), false);
    }
    
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error('Invalid file type. Only JPEG, PNG, WebP and GIF are allowed.'), false);
    }
    
    cb(null, true);
  }
});

// Debug middleware for all image routes
router.use((req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('\n=== IMAGE REQUEST DEBUG ===');
    console.log(`Route: ${req.method} ${req.originalUrl}`);
    console.log('Headers:');
    console.log('  Content-Type:', req.headers['content-type']);
    console.log('  Content-Length:', req.headers['content-length']);
    console.log('  Authorization:', req.headers.authorization ? 'Bearer [TOKEN]' : 'None');
    
    // Keep the original json and send methods for logging
    const originalJson = res.json;
    res.json = function(data) {
      console.log('Response data:', {
        success: data.success,
        status: res.statusCode,
        message: data.message || 'No message',
        data: data.data ? 'Present' : 'None',
      });
      console.log('=== END IMAGE REQUEST ===\n');
      return originalJson.call(this, data);
    };
  }
  next();
});

// CORS middleware specifically for image upload routes
router.use((req, res, next) => {
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

// OPTIMIZED: Direct S3 image proxy handler
router.get('/direct-s3-image/:key(*)', async (req, res) => {
  try {
    // Extract S3 key from request
    const s3Key = req.params.key;
    
    if (!s3Key) {
      return res.status(400).send('No S3 key provided');
    }
    
    // Clean up problematic paths with multiple "images/" segments
    const normalizedKey = s3Key.replace(/images\/images\//g, 'images/');
    
    // Set caching headers for production
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
    
    if (s3Config.enabled && s3) {
      try {
        // Get the object from S3
        const params = {
          Bucket: s3Config.bucket,
          Key: normalizedKey
        };
        
        const s3Object = await s3.getObject(params).promise();
        
        // Set appropriate headers
        res.setHeader('Content-Type', s3Object.ContentType);
        if (s3Object.ETag) {
          res.setHeader('ETag', s3Object.ETag);
        }
        
        // Send the image directly
        return res.send(s3Object.Body);
      } catch (s3Error) {
        if (process.env.NODE_ENV === 'development') {
          console.error(`S3 object fetch error for ${normalizedKey}:`, s3Error.code);
        }
        // Fall through to local path check
      }
    }
    
    // Try local file paths as fallback
    const filename = normalizedKey.split('/').pop();
    const localPaths = [
      path.join(__dirname, '../../public/uploads/listings', filename),
      path.join(__dirname, '../../uploads/listings', filename)
    ];
    
    for (const localPath of localPaths) {
      if (fs.existsSync(localPath)) {
        return res.sendFile(localPath);
      }
    }
    
    // Final fallback
    return res.sendFile(path.join(__dirname, '../../public/images/placeholders/car.jpg'));
  } catch (error) {
    console.error('Direct S3 image error:', error);
    res.status(500).send('Error processing image');
  }
});

// OPTIMIZED: S3 proxy middleware - Enhanced version with caching
router.get('/s3-proxy/:key(*)', async (req, res) => {
  try {
    // Extract S3 key from request
    let s3Key = req.params.key;
    
    if (!s3Key) {
      return res.status(400).json({ error: 'No S3 key provided' });
    }
    
    // Clean up problematic paths with multiple "images/" segments
    if (s3Key.includes('images/images/')) {
      s3Key = normalizeS3Key(s3Key);
      if (process.env.NODE_ENV === 'development') {
        console.log(`Fixed duplicate image paths: ${s3Key}`);
      }
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`S3 proxy request for key: ${s3Key}`);
    }
    
    // Set caching headers for better performance
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year cache, immutable
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // If S3 is configured, try to retrieve from S3
    if (s3Config.enabled && s3) {
      const params = {
        Bucket: s3Config.bucket,
        Key: s3Key
      };
      
      try {
        if (process.env.NODE_ENV === 'development') {
          console.log(`Attempting to retrieve from S3: ${s3Config.bucket}/${s3Key}`);
        }
        
        // Get the object from S3
        const s3Object = await s3.getObject(params).promise();
        
        // Set appropriate headers
        res.setHeader('Content-Type', s3Object.ContentType);
        if (s3Object.ETag) {
          res.setHeader('ETag', s3Object.ETag);
        }
        
        // Send the image data directly (no redirects)
        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ S3 object retrieved successfully: ${s3Key}`);
        }
        return res.send(s3Object.Body);
      } catch (s3Error) {
        if (process.env.NODE_ENV === 'development') {
          console.error(`S3 object fetch error for ${s3Key}:`, s3Error.code);
        }
        // Continue to fallbacks without redirects
      }
    }
    
    // Local filesystem fallbacks - try multiple path variations
    if (process.env.NODE_ENV === 'development') {
      console.log('Trying local filesystem fallbacks...');
    }
    
    // Extract path components
    const keyParts = s3Key.split('/');
    const filename = keyParts[keyParts.length - 1];
    
    // Try different possible paths for the file
    const possiblePaths = [
      // Direct path as provided
      path.join(__dirname, '../../public/uploads', s3Key.replace(/^images\//, '')),
      path.join(__dirname, '../../uploads', s3Key.replace(/^images\//, '')),
      
      // Try with just the filename in various folders
      path.join(__dirname, '../../public/uploads/listings', filename),
      path.join(__dirname, '../../uploads/listings', filename),
      path.join(__dirname, '../../public/uploads/listings/thumbnails', filename),
      path.join(__dirname, '../../uploads/listings/thumbnails', filename),
      path.join(__dirname, '../../public/images/placeholders', filename)
    ];
    
    for (const localPath of possiblePaths) {
      if (fs.existsSync(localPath)) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ Found local file at ${localPath}`);
        }
        return res.sendFile(localPath);
      }
    }
    
    // FIXED: If we've tried everything and still can't find the image, 
    // directly serve a placeholder instead of redirecting
    if (process.env.NODE_ENV === 'development') {
      console.log(`❌ Image not found, serving default placeholder for: ${s3Key}`);
    }
    
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day for placeholders
    return res.sendFile(path.join(__dirname, '../../public/images/placeholders/car.jpg'));
    
  } catch (error) {
    console.error('S3 proxy error:', error);
    // FIXED: Send placeholder image directly to avoid redirects
    return res.sendFile(path.join(__dirname, '../../public/images/placeholders/car.jpg'));
  }
});

// FIXED: Direct fallback for listing images - CRITICAL FIX
router.get('/listings/:filename(*)', (req, res) => {
  const filename = req.params.filename;
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔄 Direct access to image: ${filename}`);
  }
  
  // Try to find the file in various locations
  const possiblePaths = [
    path.join(__dirname, '../../public/uploads/listings', filename),
    path.join(__dirname, '../../uploads/listings', filename),
    path.join(__dirname, '../../public/uploads/listings/thumbnails', filename),
    path.join(__dirname, '../../uploads/listings/thumbnails', filename),
  ];
  
  // Try local paths first
  for (const localPath of possiblePaths) {
    if (fs.existsSync(localPath)) {
      // Set appropriate cache headers for production
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year
      return res.sendFile(localPath);
    }
  }
  
  // If S3 is enabled, try to get from S3
  if (s3Config.enabled && s3) {
    try {
      // Try to find in S3 by key pattern
      const s3Key = `images/listings/${filename}`;
      
      // Return redirect to S3 proxy endpoint
      return res.redirect(`/api/images/s3-proxy/${s3Key}`);
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error redirecting to S3:', error);
      }
    }
  }
  
  // Directly serve placeholder without redirection
  res.setHeader('Cache-Control', 'public, max-age=86400'); // 1 day for placeholders
  res.sendFile(path.join(__dirname, '../../public/images/placeholders/car.jpg'));
});

// Test endpoint to verify routes are working
router.get('/test', (req, res) => {
  res.status(200).json({ 
    success: true,
    message: 'Image routes are working',
    endpoints: [
      'GET /api/images/test',
      'GET /api/images/health',
      'POST /api/images/upload',
      'POST /api/images/upload/multiple',
      'DELETE /api/images/delete',
      'DELETE /api/images/delete-multiple',
      'POST /api/images/diagnose',
      'GET /api/images/s3-config',
      'GET /api/images/s3-proxy/:key',
      'GET /api/images/direct-s3-image/:key'
    ]
  });
});

// Upload single image to S3
router.post('/upload', protect, upload.single('image'), async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log('Upload single image request received');
    }
    
    if (!req.file) {
      console.error('No file in request body');
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('File details:', {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer ? 'Present' : 'Missing'
      });
    }

    const folder = req.body.folder || 'default';
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`Uploading single image to S3 folder: ${folder}`);
    }
    
    let result;
    
    // OPTIMIZED: More robust S3 upload implementation with proper fallback
    try {
      // Try S3 first if enabled
      if (s3Config.enabled && s3) {
        result = await uploadImageToS3(req.file, folder, {
          optimization: {
            quality: 85,
            format: 'webp'
          },
          createThumbnail: true
        });
        if (process.env.NODE_ENV === 'development') {
          console.log('Successfully uploaded to S3');
        }
      } else {
        throw new Error('S3 not enabled, using local storage');
      }
    } catch (s3Error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('S3 upload failed, falling back to local storage:', s3Error.message);
      }
      
      // Fallback to local disk storage
      // Create a filename with timestamp to avoid collisions
      const timestamp = Date.now();
      const ext = req.file.mimetype.split('/')[1] || 'jpg';
      const filename = `${timestamp}-${req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}.${ext}`;
      
      // Ensure directory exists - both in uploads and public/uploads
      const serverUploadDir = path.join(__dirname, '../../uploads', folder);
      const serverThumbnailDir = path.join(serverUploadDir, 'thumbnails');
      const publicUploadDir = path.join(__dirname, '../../public/uploads', folder);
      const publicThumbnailDir = path.join(publicUploadDir, 'thumbnails');
      
      // Create all directories if they don't exist
      [serverUploadDir, serverThumbnailDir, publicUploadDir, publicThumbnailDir].forEach(dir => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      });
      
      // Write file to both locations to ensure availability
      const serverFilePath = path.join(serverUploadDir, filename);
      const publicFilePath = path.join(publicUploadDir, filename);
      const serverThumbPath = path.join(serverThumbnailDir, filename);
      const publicThumbPath = path.join(publicThumbnailDir, filename);
      
      try {
        // Write to both locations
        fs.writeFileSync(serverFilePath, req.file.buffer);
        fs.writeFileSync(publicFilePath, req.file.buffer);
        fs.writeFileSync(serverThumbPath, req.file.buffer); // Simple copy for thumbnail
        fs.writeFileSync(publicThumbPath, req.file.buffer); // Simple copy for thumbnail
        
        result = {
          url: `/uploads/${folder}/${filename}`,
          key: `${folder}/${filename}`,
          thumbnail: `/uploads/${folder}/thumbnails/${filename}`,
          thumbnailKey: `${folder}/thumbnails/${filename}`,
          size: req.file.size,
          mimetype: req.file.mimetype
        };
      } catch (fsError) {
        console.error('Error writing files locally:', fsError);
        return res.status(500).json({
          success: false,
          message: 'Failed to save images locally',
          error: fsError.message
        });
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`Successfully processed image:`, {
        url: result.url,
        thumbnail: result.thumbnail,
        size: result.size
      });
    }

    res.status(200).json({
      success: true,
      data: {
        url: result.url,
        key: result.key,
        thumbnail: result.thumbnail,
        filename: result.filename,
        size: result.size,
        mimetype: result.mimetype
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error uploading file', 
      error: error.message 
    });
  }
});

// OPTIMIZED: Upload multiple images route - Made more robust and direct
router.post('/upload/multiple', protect, (req, res) => {
  console.log('\n===== S3 MULTIPLE IMAGE UPLOAD =====');
  console.log('Content-Type:', req.headers['content-type']);
  console.log('S3 Enabled:', s3Config.enabled ? 'Yes' : 'No');
  console.log('S3 Bucket:', s3Config.bucket);
  
  // Apply multer middleware directly inside this handler for better control
  upload.array('images', 10)(req, res, async (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
    
    try {
      console.log('Upload multiple request processing');
      console.log(`Files received: ${req.files ? req.files.length : 'none'}`);
      
      // Check if we have files
      if (!req.files || req.files.length === 0) {
        console.error('No files in request');
        return res.status(400).json({ 
          success: false, 
          message: 'No files uploaded'
        });
      }
      
      // Print details of each file
      req.files.forEach((file, index) => {
        console.log(`File ${index + 1}:`, {
          name: file.originalname,
          type: file.mimetype,
          size: file.size,
          buffer: file.buffer ? `${file.buffer.length} bytes` : 'Missing'
        });
      });
      
      const folder = req.body.folder || 'default';
      console.log(`Target folder: ${folder}`);
      
      // Verify S3 is properly configured
      if (!s3Config.enabled || !s3) {
        console.error('S3 is not properly configured. Check your AWS credentials and settings.');
        return res.status(500).json({
          success: false,
          message: 'S3 configuration is missing or invalid. Check server logs.'
        });
      }
      
      // Upload directly to S3 - no fallback to local storage
      console.log(`Uploading ${req.files.length} files to S3 bucket: ${s3Config.bucket}`);
      
      let results;
      try {
        results = await uploadMultipleImagesToS3(req.files, folder, {
          optimization: {
            quality: 85,
            format: 'webp'
          },
          createThumbnail: true
        });
        
        // Normalize S3 URLs to prevent path issues
        results = results.map(result => {
          // Clean up any problematic paths with duplicate segments
          if (result.url && result.url.includes('/images/images/')) {
            result.url = result.url.replace(/\/images\/images\//g, '/images/');
          }
          if (result.key && result.key.includes('images/images/')) {
            result.key = result.key.replace(/images\/images\//g, 'images/');
          }
          if (result.thumbnail && result.thumbnail.includes('/images/images/')) {
            result.thumbnail = result.thumbnail.replace(/\/images\/images\//g, '/images/');
          }
          return result;
        });
        
        console.log(`✅ Successfully uploaded ${results.length} images to S3`);
        console.log(`First image URL: ${results[0]?.url}`);
        console.log(`Is S3 URL: ${results[0]?.url.includes('s3.amazonaws.com') ? 'Yes' : 'No'}`);
      } catch (s3Error) {
        console.error('❌ S3 upload failed with error:', s3Error.message);
        console.error('Error code:', s3Error.code);
        
        // Provide helpful error messages based on common issues
        let errorMessage = 'Failed to upload to S3';
        
        if (s3Error.code === 'CredentialsError') {
          errorMessage = 'AWS credentials are invalid. Check your AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.';
        } else if (s3Error.code === 'NetworkingError') {
          errorMessage = 'Network error connecting to S3. Check your internet connection and AWS_REGION.';
        } else if (s3Error.code === 'NoSuchBucket') {
          errorMessage = `Bucket '${s3Config.bucket}' does not exist or you don't have access to it.`;
        } else if (s3Error.code === 'AccessDenied') {
          errorMessage = 'Access denied to S3 bucket. Check your IAM permissions.';
        }
        
        return res.status(500).json({
          success: false,
          message: errorMessage,
          error: s3Error.message
        });
      }
      
      if (!results || results.length === 0) {
        console.error('No results returned from S3 upload');
        return res.status(500).json({
          success: false,
          message: 'Failed to upload images to S3. No results returned.'
        });
      }
      
      console.log(`Returning ${results.length} processed images`);
      
      // Set appropriate cache headers
      res.setHeader('Cache-Control', 'private, no-cache');
      
      return res.status(200).json({
        success: true,
        count: results.length,
        data: results
      });
    } catch (error) {
      console.error('Multiple upload processing error:', error);
      return res.status(500).json({ 
        success: false, 
        message: `Error processing uploaded files: ${error.message}`, 
        error: error.message
      });
    } finally {
      console.log('===== S3 UPLOAD REQUEST COMPLETE =====\n');
    }
  });
});

// Delete image with improved error handling
router.delete('/delete', protect, async (req, res) => {
  try {
    const { url, withThumbnail } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        message: 'No URL provided'
      });
    }
    
    // If S3 is configured, use it
    let deletionSuccess = false;
    
    if (s3Config.enabled && s3) {
      try {
        if (withThumbnail) {
          await deleteImageWithThumbnail(url);
        } else {
          await deleteFromS3(url);
        }
        deletionSuccess = true;
      } catch (s3Error) {
        if (process.env.NODE_ENV === 'development') {
          console.error('S3 deletion error:', s3Error);
        }
        // Continue to local file check
      }
    }
    
    // For local storage, try to delete the file from both locations
    if (!deletionSuccess) {
      try {
        // Try to extract the path from the URL
        let filePath = url;
        
        // If it's a URL, extract the path portion
        if (url.startsWith('http://') || url.startsWith('https://')) {
          const urlObj = new URL(url);
          filePath = urlObj.pathname;
        }
        
        // Make sure filePath starts with a slash
        if (!filePath.startsWith('/')) {
          filePath = '/' + filePath;
        }
        
        // Try both server and public paths
        const serverPath = path.join(__dirname, '../..', filePath);
        const publicPath = path.join(__dirname, '../../public', filePath);
        
        // Try to delete from server path
        if (fs.existsSync(serverPath)) {
          fs.unlinkSync(serverPath);
          deletionSuccess = true;
          if (process.env.NODE_ENV === 'development') {
            console.log(`Deleted file from server path: ${serverPath}`);
          }
        }
        
        // Try to delete from public path
        if (fs.existsSync(publicPath)) {
          fs.unlinkSync(publicPath);
          deletionSuccess = true;
          if (process.env.NODE_ENV === 'development') {
            console.log(`Deleted file from public path: ${publicPath}`);
          }
        }
        
        // Handle thumbnail if requested
        if (withThumbnail) {
          // Extract directory and filename
          let thumbnailPath = '';
          if (filePath.includes('/uploads/')) {
            const filePathParts = filePath.split('/');
            const filename = filePathParts.pop();
            filePathParts.push('thumbnails');
            filePathParts.push(filename);
            thumbnailPath = filePathParts.join('/');
            
            // Try to delete thumbnail from server path
            const serverThumbPath = path.join(__dirname, '../..', thumbnailPath);
            const publicThumbPath = path.join(__dirname, '../../public', thumbnailPath);
            
            if (fs.existsSync(serverThumbPath)) {
              fs.unlinkSync(serverThumbPath);
              if (process.env.NODE_ENV === 'development') {
                console.log(`Deleted thumbnail from server path: ${serverThumbPath}`);
              }
            }
            
            if (fs.existsSync(publicThumbPath)) {
              fs.unlinkSync(publicThumbPath);
              if (process.env.NODE_ENV === 'development') {
                console.log(`Deleted thumbnail from public path: ${publicThumbPath}`);
              }
            }
          }
        }
      } catch (fsError) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Error deleting local file:', fsError);
        }
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting file',
      error: error.message
    });
  }
});

// Get S3 configuration
router.get('/s3-config', protect, (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      bucket: s3Config.bucket,
      region: s3Config.region,
      baseUrl: s3Config.baseUrl,
      enabled: !!s3Config.bucket
    }
  });
});

// Health check endpoint with detailed diagnostics
// Health check endpoint with detailed diagnostics
router.get('/health', (req, res) => {
  // Check all critical directories exist
  const directories = {
    'uploads': path.join(__dirname, '../../uploads'),
    'uploads/listings': path.join(__dirname, '../../uploads/listings'),
    'uploads/listings/thumbnails': path.join(__dirname, '../../uploads/listings/thumbnails'),
    'public/uploads': path.join(__dirname, '../../public/uploads'),
    'public/uploads/listings': path.join(__dirname, '../../public/uploads/listings'),
    'public/uploads/listings/thumbnails': path.join(__dirname, '../../public/uploads/listings/thumbnails'),
    'public/images/placeholders': path.join(__dirname, '../../public/images/placeholders')
  };
  
  const directoryStatus = {};
  for (const [name, dir] of Object.entries(directories)) {
    directoryStatus[name] = {
      exists: fs.existsSync(dir),
      writable: false
    };
    
    // Test write permissions if directory exists
    if (directoryStatus[name].exists) {
      try {
        const testFile = path.join(dir, '.test-health-check');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        directoryStatus[name].writable = true;
      } catch (err) {
        // Directory exists but is not writable
      }
    }
  }
  
  // Test a placeholder image
  const placeholderPath = path.join(__dirname, '../../public/images/placeholders/car.jpg');
  const placeholderStatus = {
    exists: fs.existsSync(placeholderPath),
    size: 0
  };
  
  if (placeholderStatus.exists) {
    try {
      const stats = fs.statSync(placeholderPath);
      placeholderStatus.size = stats.size;
    } catch (err) {
      // Cannot stat file
    }
  }
  
  // Check S3 configuration
  const s3Status = {
    configured: !!s3Config.bucket,
    bucket: s3Config.bucket,
    region: s3Config.region,
    baseUrl: s3Config.baseUrl,
    enabled: s3Config.enabled
  };
  
  // Perform S3 connection test if configured
  let s3ConnectionResult = "Not attempted";
  if (s3Config.enabled && s3) {
    try {
      // Simple test - try to list buckets
      s3.listBuckets({}, (err, data) => {
        if (err) {
          s3ConnectionResult = `Error: ${err.code}`;
        } else {
          s3ConnectionResult = "Success";
        }
      });
    } catch (error) {
      s3ConnectionResult = `Error: ${error.message}`;
    }
  }
  
  res.status(200).json({ 
    success: true, 
    message: 'Image upload service is healthy',
    timestamp: new Date().toISOString(),
    s3: {
      ...s3Status,
      connectionTest: s3ConnectionResult
    },
    directories: directoryStatus,
    placeholders: placeholderStatus,
    environment: process.env.NODE_ENV || 'development'
  });
});

// ENHANCED: Diagnose image handling issues
router.post('/diagnose', protect, upload.single('image'), async (req, res) => {
  try {
    // This endpoint is useful for debugging image upload issues
    const diagnostics = {
      file: req.file ? {
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        hasBuffer: !!req.file.buffer,
        bufferLength: req.file.buffer ? req.file.buffer.length : 0
      } : 'No file uploaded',
      headers: {
        contentType: req.headers['content-type'],
        contentLength: req.headers['content-length']
      },
      body: {
        folder: req.body.folder || 'No folder specified',
        hasOtherKeys: Object.keys(req.body).filter(k => k !== 'folder')
      },
      s3Config: {
        enabled: s3Config.enabled,
        bucket: s3Config.bucket
      },
      directories: {
        uploadsExists: fs.existsSync(path.join(__dirname, '../../uploads')),
        listingsExists: fs.existsSync(path.join(__dirname, '../../uploads/listings')),
        publicUploadsExists: fs.existsSync(path.join(__dirname, '../../public/uploads'))
      }
    };
    
    // Try uploading to both S3 and local
    if (req.file) {
      try {
        // Create test directories just to be sure
        const testDir = path.join(__dirname, '../../uploads/test');
        const testPublicDir = path.join(__dirname, '../../public/uploads/test');
        
        if (!fs.existsSync(testDir)) {
          fs.mkdirSync(testDir, { recursive: true });
        }
        
        if (!fs.existsSync(testPublicDir)) {
          fs.mkdirSync(testPublicDir, { recursive: true });
        }
        
        // Write to local path
        const localPath = path.join(testDir, `test-${Date.now()}.jpg`);
        fs.writeFileSync(localPath, req.file.buffer);
        diagnostics.localWrite = {
          success: true,
          path: localPath
        };
        
        // Try uploading to S3 if configured
        if (s3Config.enabled && s3) {
          try {
            const result = await uploadImageToS3(req.file, 'test');
            diagnostics.s3Upload = {
              success: true,
              result
            };
          } catch (s3Error) {
            diagnostics.s3Upload = {
              success: false,
              error: s3Error.message
            };
          }
        }
      } catch (writeError) {
        diagnostics.localWrite = {
          success: false,
          error: writeError.message
        };
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'Image diagnostics complete',
      diagnostics
    });
  } catch (error) {
    console.error('Diagnostics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error running diagnostics',
      error: error.message
    });
  }
});

// ENHANCED: Batch delete multiple images
router.delete('/delete-multiple', protect, async (req, res) => {
  try {
    const { urls = [] } = req.body;
    
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No URLs provided for deletion'
      });
    }
    
    // Process each URL with proper error handling
    const results = await Promise.all(urls.map(async (url) => {
      try {
        // For S3 configured system
        if (s3Config.enabled && s3) {
          try {
            await deleteImageWithThumbnail(url);
            return { url, success: true };
          } catch (s3Error) {
            // Fall through to local file handling
          }
        }
        
        // Local file handling
        let filePath = url;
        
        // If it's a URL, extract the path portion
        if (url.startsWith('http://') || url.startsWith('https://')) {
          const urlObj = new URL(url);
          filePath = urlObj.pathname;
        }
        
        // Make sure filePath starts with a slash
        if (!filePath.startsWith('/')) {
          filePath = '/' + filePath;
        }
        
        // Try both server and public paths
        const serverPath = path.join(__dirname, '../..', filePath);
        const publicPath = path.join(__dirname, '../../public', filePath);
        
        let fileDeleted = false;
        
        // Try to delete from server path
        if (fs.existsSync(serverPath)) {
          fs.unlinkSync(serverPath);
          fileDeleted = true;
        }
        
        // Try to delete from public path
        if (fs.existsSync(publicPath)) {
          fs.unlinkSync(publicPath);
          fileDeleted = true;
        }
        
        // Try to delete thumbnail if it exists
        let thumbnailPath = '';
        if (filePath.includes('/uploads/')) {
          const filePathParts = filePath.split('/');
          const filename = filePathParts.pop();
          filePathParts.push('thumbnails');
          filePathParts.push(filename);
          thumbnailPath = filePathParts.join('/');
          
          // Try to delete thumbnail from server and public paths
          const serverThumbPath = path.join(__dirname, '../..', thumbnailPath);
          const publicThumbPath = path.join(__dirname, '../../public', thumbnailPath);
          
          if (fs.existsSync(serverThumbPath)) {
            fs.unlinkSync(serverThumbPath);
          }
          
          if (fs.existsSync(publicThumbPath)) {
            fs.unlinkSync(publicThumbPath);
          }
        }
        
        return { url, success: fileDeleted };
      } catch (error) {
        return { url, success: false, error: error.message };
      }
    }));
    
    // Count successes and failures
    const successes = results.filter(r => r.success).length;
    const failures = results.length - successes;
    
    res.status(200).json({
      success: true,
      message: `Processed ${results.length} images: ${successes} deleted, ${failures} failed`,
      results
    });
  } catch (error) {
    console.error('Batch delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing batch delete',
      error: error.message
    });
  }
});

// ENHANCED: Simple image test endpoint
router.get('/view-test', (req, res) => {
  // Create a simple HTML page with image loading tests
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Image Loading Test</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        .test-image { margin: 20px 0; border: 1px solid #ccc; }
        .test-image img { max-width: 100%; }
        .success { color: green; }
        .error { color: red; }
        .test-label { font-weight: bold; margin-bottom: 5px; }
      </style>
    </head>
    <body>
      <h1>Image Loading Test</h1>
      <p>This page tests loading images from different paths.</p>
      
      <div class="test-image">
        <div class="test-label">Test 1: Direct placeholder from public directory</div>
        <img src="/images/placeholders/car.jpg" 
             onerror="this.parentNode.innerHTML += '<p class=\\'error\\'>Error loading image</p>'"
             onload="this.parentNode.innerHTML += '<p class=\\'success\\'>Image loaded successfully</p>'" />
      </div>
      
      <div class="test-image">
        <div class="test-label">Test 2: Image from uploads/listings directory</div>
        <img src="/uploads/listings/test-image.jpg" 
             onerror="this.parentNode.innerHTML += '<p class=\\'error\\'>Error loading image</p>'"
             onload="this.parentNode.innerHTML += '<p class=\\'success\\'>Image loaded successfully</p>'" />
      </div>
      
      <div class="test-image">
        <div class="test-label">Test 3: Image via S3 proxy</div>
        <img src="/api/images/s3-proxy/images/listings/test-image.jpg" 
             onerror="this.parentNode.innerHTML += '<p class=\\'error\\'>Error loading image</p>'"
             onload="this.parentNode.innerHTML += '<p class=\\'success\\'>Image loaded successfully</p>'" />
      </div>
      
      <h2>Server Information</h2>
      <pre>${JSON.stringify({
        nodeEnv: process.env.NODE_ENV || 'not set',
        s3Enabled: s3Config.enabled,
        s3Bucket: s3Config.bucket,
        publicDir: fs.existsSync(path.join(__dirname, '../../public')) ? 'exists' : 'missing'
      }, null, 2)}</pre>
    </body>
    </html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// ENHANCED: Fallback upload handler for production
router.post('/upload-fallback', protect, (req, res) => {
  console.log('🔄 Using fallback upload handler');
  
  // Use disk storage for more reliability
  diskUpload.array('images', 10)(req, res, async (err) => {
    if (err) {
      console.error('Multer disk upload error:', err);
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
    
    try {
      // Check if we have files
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'No files uploaded'
        });
      }
      
      const folder = req.body.folder || 'default';
      
      // Process files that were saved to disk
      const results = await Promise.all(req.files.map(async (file, index) => {
        try {
          // Extract paths
          const srcPath = file.path;
          const filename = path.basename(srcPath);
          
          // Ensure public directory exists
          const publicDir = path.join(__dirname, '../../public/uploads', folder);
          const publicThumbDir = path.join(publicDir, 'thumbnails');
          
          if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
          }
          
          if (!fs.existsSync(publicThumbDir)) {
            fs.mkdirSync(publicThumbDir, { recursive: true });
          }
          
          // Copy to public directory for web access
          const publicPath = path.join(publicDir, filename);
          const publicThumbPath = path.join(publicThumbDir, filename);
          
          fs.copyFileSync(srcPath, publicPath);
          fs.copyFileSync(srcPath, publicThumbPath);
          
          // Return image information
          return {
            url: `/uploads/${folder}/${filename}`,
            key: `${folder}/${filename}`,
            thumbnail: `/uploads/${folder}/thumbnails/${filename}`,
            thumbnailKey: `${folder}/thumbnails/${filename}`,
            filename,
            size: file.size,
            mimetype: file.mimetype,
            isPrimary: index === 0
          };
        } catch (fileError) {
          console.error(`Error processing file ${file.originalname}:`, fileError);
          
          // Return partial information even if processing fails
          return {
            url: file.path.replace(path.join(__dirname, '../..'), ''),
            key: file.filename,
            size: file.size,
            mimetype: file.mimetype,
            error: fileError.message
          };
        }
      }));
      
      return res.status(200).json({
        success: true,
        count: results.length,
        data: results,
        mode: 'fallback-disk'
      });
    } catch (error) {
      console.error('Fallback upload error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error processing uploaded files',
        error: error.message
      });
    }
  });
});

// Export the router
export default router;