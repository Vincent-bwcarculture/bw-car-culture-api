// server/utils/s3Upload.js
import { s3, s3Config, getS3Key, normalizeS3Key } from '../config/s3.js';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { ErrorResponse } from './errorResponse.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const UPLOAD_PATH = process.env.FILE_UPLOAD_PATH || './public/uploads';
const PUBLIC_URL = process.env.PUBLIC_URL || '';

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
    console.log(`Created directory: ${dirPath}`);
  }
};

/**
 * Upload to S3 with normalized key to prevent path issues
 * UPDATED: Improved error handling and logging
 */
const uploadToS3 = async (buffer, key, mimetype) => {
  // Check if S3 is configured properly
  if (!s3 || !s3Config.enabled) {
    console.warn('S3 is not configured, skipping S3 upload attempt');
    throw new Error('S3 is not properly configured');
  }

  // Normalize the key to prevent duplicate segments
  const normalizedKey = normalizeS3Key(key);

  const params = {
    Bucket: s3Config.bucket,
    Key: normalizedKey,
    Body: buffer,
    ContentType: mimetype,
    // ACL: 'public-read'
  };

  try {
    console.log(`Attempting to upload to S3 bucket ${s3Config.bucket}, key: ${normalizedKey}`);
    const result = await s3.upload(params).promise();
    console.log(`Successfully uploaded to S3: ${result.Location}`);
    return {
      url: result.Location,
      key: result.Key,
      bucket: result.Bucket
    };
  } catch (error) {
    console.error('S3 upload error details:', error.code, error.message);
    // Log more error details for debugging
    if (error.code === 'CredentialsError') {
      console.error('AWS credentials issue. Check your AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
    } else if (error.code === 'NetworkingError') {
      console.error('Network error connecting to S3. Check your internet connection and AWS_REGION');
    } else if (error.code === 'NoSuchBucket') {
      console.error(`Bucket ${s3Config.bucket} does not exist or you don't have access to it`);
    }
    throw error; // Re-throw instead of returning null to prevent silent fallback
  }
};

/**
 * Process and upload an image file
 * UPDATED: Removed fallback to local storage, ensure S3 upload works
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

    // Generate filename
    const ext = MIME_TYPES[file.mimetype] || 'jpg';
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
    
    // Upload to S3 - no fallback
    console.log('Uploading to S3...');
    
    // Upload main image
    const mainKey = getS3Key(folder, filename);
    const mainResult = await uploadToS3(mainImageBuffer, mainKey, file.mimetype);
    
    // Upload thumbnail
    const thumbnailKey = getS3Key(`${folder}-thumbnails`, filename);
    const thumbnailResult = await uploadToS3(thumbnailBuffer, thumbnailKey, file.mimetype);
    
    console.log(`Images uploaded successfully to S3: ${mainResult.url}`);
    
    // Clean up temporary file if needed
    if (file.path && file.path.includes('uploads/tmp')) {
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.warn(`Warning: Could not remove temporary file ${file.path}:`, err);
      }
    }
    
    return {
      url: mainResult.url,
      key: mainResult.key,
      thumbnail: thumbnailResult.url,
      thumbnailKey: thumbnailResult.key,
      size: file.size || imageBuffer.length,
      mimetype: file.mimetype,
      storage: 's3'
    };
  } catch (error) {
    console.error('Image upload error:', error);
    throw new Error(`Failed to upload image to S3: ${error.message}`);
  }
};

// Export with both names for backward compatibility
export const uploadImageToS3 = uploadImage;

/**
 * Upload multiple images with improved error handling
 * UPDATED: Removed fallback to local storage, ensure S3 upload works
 */
// In uploadMultipleImagesToS3 function, add better error logging
export const uploadMultipleImagesToS3 = async (files, type, options = {}) => {
  if (!files || files.length === 0) {
    console.error('No files provided to uploadMultipleImagesToS3');
    throw new Error('No files provided for upload');
  }

  console.log(`🔄 Attempting to upload ${files.length} files to S3 folder: ${type}`);
  
  // Verify S3 is properly configured before attempting uploads
  if (!s3Config.enabled || !s3) {
    console.error('S3 is not properly configured. Check your AWS credentials and settings.');
    throw new Error('S3 configuration is missing or invalid');
  }
  
  try {
    // Process files one by one with proper error handling
    const results = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const file = files[i];
        console.log(`Processing file ${i+1}/${files.length}: ${file.originalname || 'unnamed'} (${file.size} bytes)`);
        
        // Get file buffer
        let buffer;
        if (file.buffer) {
          buffer = file.buffer;
        } else if (file.path) {
          buffer = fs.readFileSync(file.path);
        } else {
          throw new Error('Invalid file - missing buffer or path');
        }
        
        // Generate filename and prepare image
        const ext = file.mimetype?.split('/')[1] || 'jpg';
        const filename = `${Date.now()}-${i+1}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        
        // Process image for optimization
        const mainImageBuffer = await sharp(buffer)
          .resize(1200, 800, { fit: 'inside' })
          .toBuffer();
          
        const thumbnailBuffer = await sharp(buffer)
          .resize(300, 200, { fit: 'cover' })
          .toBuffer();
        
        // Upload main image to S3 - with more detailed error handling
        const mainKey = getS3Key(type, filename);
        console.log(`Uploading main image to S3: ${mainKey}`);
        
        let mainResult = null;
        try {
          const params = {
            Bucket: s3Config.bucket,
            Key: mainKey,
            Body: mainImageBuffer,
            ContentType: file.mimetype,
            // Remove ACL: 'public-read'
          };
          
          const uploadResult = await s3.upload(params).promise();
          mainResult = {
            url: uploadResult.Location,
            key: uploadResult.Key
          };
          console.log(`✅ Successfully uploaded main image to S3: ${uploadResult.Location}`);
        } catch (uploadError) {
          console.error(`❌ S3 upload error for main image:`, uploadError);
          console.error(`Error code: ${uploadError.code}, message: ${uploadError.message}`);
          throw uploadError; // Re-throw to stop the process
        }
        
        // Upload thumbnail to S3
        const thumbnailKey = getS3Key(`${type}-thumbnails`, filename);
        console.log(`Uploading thumbnail to S3: ${thumbnailKey}`);
        
        let thumbnailResult = null;
        try {
          const params = {
            Bucket: s3Config.bucket,
            Key: thumbnailKey,
            Body: thumbnailBuffer,
            ContentType: file.mimetype,
          // Remove ACL: 'public-read'
          };
          
          const uploadResult = await s3.upload(params).promise();
          thumbnailResult = {
            url: uploadResult.Location,
            key: uploadResult.Key
          };
          console.log(`✅ Successfully uploaded thumbnail to S3: ${uploadResult.Location}`);
        } catch (uploadError) {
          console.error(`❌ S3 upload error for thumbnail:`, uploadError);
          console.error(`Error code: ${uploadError.code}, message: ${uploadError.message}`);
          throw uploadError; // Re-throw to stop the process
        }
        
        results.push({
          url: mainResult.url,
          key: mainResult.key,
          thumbnail: thumbnailResult.url,
          thumbnailKey: thumbnailResult.key,
          size: file.size,
          mimetype: file.mimetype,
          isPrimary: false // This will be set later based on primaryImage
        });
      } catch (fileError) {
        console.error(`❌ Error processing file ${i+1}:`, fileError);
        throw new Error(`Failed to process file ${i+1}: ${fileError.message}`);
      }
    }

    if (results.length === 0) {
      throw new Error('Failed to upload any images to S3');
    }

    console.log(`✅ Successfully uploaded ${results.length} images to S3`);
    return results;
  } catch (error) {
    console.error('❌ Multiple image upload error:', error);
    throw error;
  }
};

// Add this export for backward compatibility with providerRequestRoutes.js
export const uploadMultipleToS3 = uploadMultipleImagesToS3;

/**
 * Delete image from S3
 */
export const deleteFromS3 = async (key) => {
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