// server/utils/s3Delete.js
import { s3, s3Config, normalizeS3Key } from '../config/s3.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Check if an object exists in S3
 */
export const checkS3ObjectExists = async (key) => {
  if (!s3 || !s3Config.enabled) {
    return false;
  }

  try {
    // Normalize key to prevent path issues
    const normalizedKey = normalizeS3Key(key);
    
    const params = {
      Bucket: s3Config.bucket,
      Key: normalizedKey
    };

    await s3.headObject(params).promise();
    return true;
  } catch (error) {
    if (error.code === 'NotFound') {
      return false;
    }
    console.error('Error checking if object exists in S3:', error);
    return false;
  }
};

/**
 * Delete an object from S3
 */
export const deleteFromS3 = async (keyOrUrl) => {
  if (!s3 || !s3Config.enabled) {
    console.log('S3 is not configured, skipping S3 deletion');
    return;
  }

  try {
    // Handle both keys and URLs
    let key = keyOrUrl;
    
    // If it's a URL, extract the key
    if (keyOrUrl.startsWith('http')) {
      const baseUrl = `https://${s3Config.bucket}.s3.${s3Config.region}.amazonaws.com/`;
      if (keyOrUrl.startsWith(baseUrl)) {
        key = keyOrUrl.substring(baseUrl.length);
      } else {
        // Try to extract key from URL path
        const urlParts = new URL(keyOrUrl);
        const pathParts = urlParts.pathname.split('/');
        // Remove first empty string from split
        if (pathParts[0] === '') pathParts.shift();
        key = pathParts.join('/');
      }
    }
    
    // Make sure we have a valid key
    if (!key) {
      console.error('Invalid S3 key or URL:', keyOrUrl);
      return;
    }
    
    // Normalize key to prevent path issues
    const normalizedKey = normalizeS3Key(key);

    const params = {
      Bucket: s3Config.bucket,
      Key: normalizedKey
    };

    console.log(`Attempting to delete from S3: ${normalizedKey}`);
    await s3.deleteObject(params).promise();
    console.log(`Successfully deleted from S3: ${normalizedKey}`);
  } catch (error) {
    console.error('S3 deletion error:', error);
    // Don't throw here to prevent cascading failures
  }
};

/**
 * Delete multiple objects from S3 in a single request
 * This is the function that was missing and causing the error
 */
export const deleteMultipleFromS3 = async (keysOrUrls) => {
  if (!s3 || !s3Config.enabled) {
    console.log('S3 is not configured, skipping S3 deletion');
    return;
  }

  if (!keysOrUrls || keysOrUrls.length === 0) {
    console.log('No keys provided for deletion');
    return;
  }

  try {
    // Process the array of keys or URLs
    const objects = keysOrUrls.map(keyOrUrl => {
      // Handle both keys and URLs
      let key = keyOrUrl;
      
      // If it's a URL, extract the key
      if (typeof keyOrUrl === 'string' && keyOrUrl.startsWith('http')) {
        const baseUrl = `https://${s3Config.bucket}.s3.${s3Config.region}.amazonaws.com/`;
        if (keyOrUrl.startsWith(baseUrl)) {
          key = keyOrUrl.substring(baseUrl.length);
        } else {
          try {
            // Try to extract key from URL path
            const urlParts = new URL(keyOrUrl);
            const pathParts = urlParts.pathname.split('/');
            // Remove first empty string from split
            if (pathParts[0] === '') pathParts.shift();
            key = pathParts.join('/');
          } catch (error) {
            console.warn(`Could not parse URL: ${keyOrUrl}`);
            key = keyOrUrl;
          }
        }
      }
      
      // Handle object format with key property
      if (typeof keyOrUrl === 'object' && keyOrUrl !== null) {
        key = keyOrUrl.key || keyOrUrl.url || keyOrUrl;
      }
      
      // Make sure we have a valid key
      if (!key) {
        console.warn('Invalid S3 key or URL:', keyOrUrl);
        return null;
      }
      
      // Normalize key to prevent path issues
      return { Key: normalizeS3Key(key) };
    }).filter(obj => obj !== null);

    // If no valid objects, return early
    if (objects.length === 0) {
      console.log('No valid keys to delete');
      return;
    }

    const params = {
      Bucket: s3Config.bucket,
      Delete: {
        Objects: objects,
        Quiet: false
      }
    };

    console.log(`Attempting to delete ${objects.length} objects from S3`);
    const result = await s3.deleteObjects(params).promise();
    console.log(`Successfully deleted ${result.Deleted?.length || 0} objects from S3`);
    
    // Log any errors
    if (result.Errors && result.Errors.length > 0) {
      console.warn(`Failed to delete ${result.Errors.length} objects:`, result.Errors);
    }
    
    return result;
  } catch (error) {
    console.error('S3 multiple deletion error:', error);
    // Don't throw here to prevent cascading failures
  }
};

/**
 * Delete image with its thumbnail
 */
export const deleteImageWithThumbnail = async (keyOrUrl) => {
  if (!keyOrUrl) return;

  try {
    // Delete main image
    await deleteFromS3(keyOrUrl);
    
    // Try to determine thumbnail key
    let thumbnailKey = null;
    
    if (keyOrUrl.includes('/listings/')) {
      // For listings, replace /listings/ with /listings/thumbnails/
      thumbnailKey = keyOrUrl.replace('/listings/', '/listings/thumbnails/');
    } else if (keyOrUrl.includes('/images/listings/')) {
      // For S3 paths
      thumbnailKey = keyOrUrl.replace('/images/listings/', '/images/listings/thumbnails/');
    } else if (keyOrUrl.includes('/news/')) {
      thumbnailKey = keyOrUrl.replace('/news/', '/news/thumbnails/');
    } else if (keyOrUrl.includes('/images/news/')) {
      thumbnailKey = keyOrUrl.replace('/images/news/', '/images/news/thumbnails/');
    } else if (keyOrUrl.includes('/dealers/')) {
      thumbnailKey = keyOrUrl.replace('/dealers/', '/dealers/thumbnails/');
    } else if (keyOrUrl.includes('/images/dealers/')) {
      thumbnailKey = keyOrUrl.replace('/images/dealers/', '/images/dealers/thumbnails/');
    }
    
    if (thumbnailKey) {
      await deleteFromS3(thumbnailKey);
    }
  } catch (error) {
    console.error('Error deleting image with thumbnail:', error);
  }
};

/**
 * Delete multiple images with their thumbnails
 */
export const deleteMultipleImagesWithThumbnails = async (keysOrUrls) => {
  if (!keysOrUrls || keysOrUrls.length === 0) return;

  const allKeys = [];
  
  // Build a list of all keys to delete (main images and thumbnails)
  keysOrUrls.forEach(keyOrUrl => {
    if (!keyOrUrl) return;
    
    // Add the main image key
    allKeys.push(keyOrUrl);
    
    // Try to determine thumbnail key and add it
    let thumbnailKey = null;
    
    if (keyOrUrl.includes('/listings/')) {
      thumbnailKey = keyOrUrl.replace('/listings/', '/listings/thumbnails/');
    } else if (keyOrUrl.includes('/images/listings/')) {
      thumbnailKey = keyOrUrl.replace('/images/listings/', '/images/listings/thumbnails/');
    } else if (keyOrUrl.includes('/news/')) {
      thumbnailKey = keyOrUrl.replace('/news/', '/news/thumbnails/');
    } else if (keyOrUrl.includes('/images/news/')) {
      thumbnailKey = keyOrUrl.replace('/images/news/', '/images/news/thumbnails/');
    } else if (keyOrUrl.includes('/dealers/')) {
      thumbnailKey = keyOrUrl.replace('/dealers/', '/dealers/thumbnails/');
    } else if (keyOrUrl.includes('/images/dealers/')) {
      thumbnailKey = keyOrUrl.replace('/images/dealers/', '/images/dealers/thumbnails/');
    }
    
    if (thumbnailKey) {
      allKeys.push(thumbnailKey);
    }
  });
  
  // Delete all keys in one batch operation
  await deleteMultipleFromS3(allKeys);
};

/**
 * Delete local image files
 */
export const deleteLocalImage = (url) => {
  try {
    if (!url) return;
    
    // Extract path from URL
    let filePath = url;
    if (url.startsWith('http')) {
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
      console.log(`Deleted file from server path: ${serverPath}`);
    }
    
    // Try to delete from public path
    if (fs.existsSync(publicPath)) {
      fs.unlinkSync(publicPath);
      console.log(`Deleted file from public path: ${publicPath}`);
    }
    
    // Try to determine and delete thumbnail
    const urlParts = filePath.split('/');
    const filename = urlParts.pop();
    const folderPath = urlParts.join('/');
    
    const thumbnailPath = path.join(folderPath, 'thumbnails', filename);
    const serverThumbPath = path.join(__dirname, '../..', thumbnailPath);
    const publicThumbPath = path.join(__dirname, '../../public', thumbnailPath);
    
    if (fs.existsSync(serverThumbPath)) {
      fs.unlinkSync(serverThumbPath);
      console.log(`Deleted thumbnail from server path: ${serverThumbPath}`);
    }
    
    if (fs.existsSync(publicThumbPath)) {
      fs.unlinkSync(publicThumbPath);
      console.log(`Deleted thumbnail from public path: ${publicThumbPath}`);
    }
    
    return true;
  } catch (error) {
    console.error('Error deleting local image file:', error);
    return false;
  }
};
