// server/utils/imageUpload.js
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { s3, s3Config, getS3Key } from '../config/s3.js';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const UPLOAD_PATH = process.env.FILE_UPLOAD_PATH || './public/uploads';
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:5000';

// Make upload path absolute if it's relative
const uploadPath = UPLOAD_PATH.startsWith('.')
  ? path.join(__dirname, '..', '..', UPLOAD_PATH.slice(2))
  : UPLOAD_PATH;

const MIME_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

/**
 * Ensure directory exists
 */
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

/**
 * Upload image to S3
 */
const uploadToS3 = async (buffer, key, mimetype) => {
  if (!s3 || !s3Config.enabled) {
    throw new Error('S3 is not configured');
  }

  const params = {
    Bucket: s3Config.bucket,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
    // No ACL parameter
  };

  try {
    const result = await s3.upload(params).promise();
    return {
      url: result.Location,
      key: result.Key,
      bucket: result.Bucket
    };
  } catch (error) {
    console.error('S3 upload error:', error);
    throw new Error(`Failed to upload to S3: ${error.message}`);
  }
};

/**
 * Delete image from S3
 */
const deleteFromS3 = async (key) => {
  if (!s3 || !s3Config.enabled) {
    console.log('S3 is not configured, skipping S3 deletion');
    return;
  }

  const params = {
    Bucket: s3Config.bucket,
    Key: key
  };

  try {
    await s3.deleteObject(params).promise();
    console.log(`Successfully deleted from S3: ${key}`);
  } catch (error) {
    console.error('S3 deletion error:', error);
    throw new Error(`Failed to delete from S3: ${error.message}`);
  }
};

/**
 * Process and upload an image file
 */
export const uploadImage = async (file, folder = 'listings') => {
  try {
    // Validate file
    if (!file) {
      throw new Error('No file provided');
    }
    
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      throw new Error(`Invalid file type: ${file.mimetype}`);
    }
    
    if (!MIME_TYPES[file.mimetype]) {
      throw new Error(`Unsupported image type: ${file.mimetype}`);
    }

    // Generate filename
    const ext = MIME_TYPES[file.mimetype];
    const filename = `${uuidv4()}.${ext}`;
    
    // Get image data - handle both buffer and file path
    let imageBuffer;
    
    if (file.buffer) {
      imageBuffer = file.buffer;
    } else if (file.path) {
      try {
        imageBuffer = fs.readFileSync(file.path);
      } catch (err) {
        console.error(`Error reading file from path ${file.path}:`, err);
        throw new Error(`Failed to read file from path: ${err.message}`);
      }
    } else if (file.data) {
      imageBuffer = file.data;
    } else {
      throw new Error('Invalid file buffer - no buffer, path, or data property');
    }
    
    // Process images
    const mainImageBuffer = await sharp(imageBuffer)
      .resize(1200, 800, { fit: 'inside' })
      .toBuffer();
      
    const thumbnailBuffer = await sharp(imageBuffer)
      .resize(300, 200, { fit: 'cover' })
      .toBuffer();
    
    // Try S3 upload first if configured
    if (s3Config.enabled) {
      try {
        console.log('Uploading to S3...');
        
        // Upload main image
        const mainKey = getS3Key(folder, filename);
        const mainResult = await uploadToS3(mainImageBuffer, mainKey, file.mimetype);
        
        // Upload thumbnail
        const thumbnailKey = getS3Key(`${folder}-thumbnails`, filename);
        const thumbnailResult = await uploadToS3(thumbnailBuffer, thumbnailKey, file.mimetype);
        
        console.log(`Images uploaded successfully to S3: ${mainResult.url}`);
        
        return {
          url: mainResult.url,
          key: mainResult.key,
          thumbnail: thumbnailResult.url,
          thumbnailKey: thumbnailResult.key,
          size: file.size || imageBuffer.length,
          mimetype: file.mimetype,
          storage: 's3'
        };
      } catch (s3Error) {
        console.error('S3 upload failed, falling back to local storage:', s3Error);
        // Continue to local storage fallback
      }
    }
    
    // Local storage (development or S3 failure fallback)
    console.log('Using local storage for images...');
    
    // Ensure upload directories exist
    const uploadDir = path.join(uploadPath, folder);
    const thumbnailDir = path.join(uploadPath, folder, 'thumbnails');
    ensureDirectoryExists(uploadDir);
    ensureDirectoryExists(thumbnailDir);
    
    // Save files locally
    const mainImagePath = path.join(uploadDir, filename);
    const thumbnailPath = path.join(thumbnailDir, filename);
    
    fs.writeFileSync(mainImagePath, mainImageBuffer);
    fs.writeFileSync(thumbnailPath, thumbnailBuffer);
    
    // Return local URLs
    const mainUrl = `/uploads/${folder}/${filename}`;
    const thumbnailUrl = `/uploads/${folder}/thumbnails/${filename}`;
    
    console.log(`Images saved locally: ${mainUrl}`);
    
    // Clean up temporary file if needed
    if (file.path && file.path.includes('uploads/tmp')) {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.warn(`Warning: Could not remove temporary file ${file.path}:`, err);
      }
    }
    
    return {
      url: mainUrl,
      key: filename,
      thumbnail: thumbnailUrl,
      thumbnailKey: filename,
      size: file.size || imageBuffer.length,
      mimetype: file.mimetype,
      storage: 'local'
    };
  } catch (error) {
    console.error('Image upload error:', error);
    throw new Error(`Failed to upload image: ${error.message}`);
  }
};

/**
 * Delete image files
 */
export const deleteImage = async (keyOrUrl) => {
  try {
    if (!keyOrUrl) return;
    
    // Check if it's an S3 key
    if (keyOrUrl.includes('/') && !keyOrUrl.startsWith('/')) {
      // Likely an S3 key
      if (s3Config.enabled) {
        await deleteFromS3(keyOrUrl);
      }
      return;
    }
    
    // Handle local file deletion
    const url = keyOrUrl;
    
    // Extract filename from URL
    const urlParts = url.split('/');
    const filename = urlParts[urlParts.length - 1];
    const folder = urlParts[urlParts.length - 2];
    
    if (!filename) return;
    
    // Build file paths
    const mainFilePath = path.join(uploadPath, folder, filename);
    const thumbnailFilePath = path.join(uploadPath, folder, 'thumbnails', filename);
    
    // Delete files if they exist
    if (fs.existsSync(mainFilePath)) {
      fs.unlinkSync(mainFilePath);
    }
    
    if (fs.existsSync(thumbnailFilePath)) {
      fs.unlinkSync(thumbnailFilePath);
    }
    
    console.log(`Successfully deleted image: ${filename}`);
  } catch (error) {
    console.error('Image deletion error:', error);
    // Don't throw here to prevent cascading failures
  }
};

/**
 * Get presigned URL for direct S3 upload (only if S3 is configured)
 */
export const getPresignedUploadUrl = async (fileName, fileType, folder = 'general') => {
  if (!s3 || !s3Config.enabled) {
    throw new Error('S3 is not configured');
  }

  const key = getS3Key(folder, fileName);
  const params = {
    Bucket: s3Config.bucket,
    Key: key,
    ContentType: fileType,
    Expires: 300 // 5 minutes
  };

  try {
    const url = await s3.getSignedUrlPromise('putObject', params);
    return {
      url,
      key,
      bucket: s3Config.bucket
    };
  } catch (error) {
    console.error('Presigned URL error:', error);
    throw new Error(`Failed to generate presigned URL: ${error.message}`);
  }
};