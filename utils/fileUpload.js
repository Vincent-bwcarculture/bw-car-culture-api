// src/utils/fileUpload.js
import sharp from 'sharp';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const UPLOAD_PATH = process.env.FILE_UPLOAD_PATH || './uploads';
const PUBLIC_URL = process.env.PUBLIC_URL || '';

// Make upload path absolute if it's relative
const uploadPath = UPLOAD_PATH.startsWith('.') 
  ? path.join(__dirname, '..', '..', UPLOAD_PATH.slice(2)) 
  : UPLOAD_PATH;

// Ensure the base upload directory exists
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
  console.log(`Created base upload directory: ${uploadPath}`);
}

// Add multer configuration for disk storage
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Determine folder based on request URL to ensure consistent placement
    let folder = 'tmp';
    
    if (req.originalUrl.includes('/listings')) {
      folder = 'listings';
    } else if (req.originalUrl.includes('/news')) {
      folder = 'news';
    } else if (req.originalUrl.includes('/dealers')) {
      folder = 'dealers';
    } else if (req.body.folder) {
      folder = req.body.folder;
    } else if (req.query.folder) {
      folder = req.query.folder;
    }
    
    const dirPath = path.join(uploadPath, folder);
    
    // Ensure directory exists
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Created directory for uploads: ${dirPath}`);
    }
    
    console.log(`File will be uploaded to: ${dirPath}`);
    cb(null, dirPath);
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname) || '.jpg'; // Ensure we have an extension
    const newFilename = `${uniqueId}${ext}`;
    console.log(`Generated filename: ${newFilename} for original: ${file.originalname}`);
    cb(null, newFilename);
  }
});

// Configure memory storage for processing
const memoryStorage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    console.warn(`Rejected file upload: ${file.originalname} (${file.mimetype})`);
    cb(new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG and WebP are allowed.`), false);
  }
};

// Export the multer middleware - two versions
export const upload = multer({
  storage: diskStorage, // Use disk storage as default for more reliable operation
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

export const memoryUpload = multer({
  storage: memoryStorage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

class FileUploadService {
  constructor() {
    this.ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    this.MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    
    this.IMAGE_SIZES = {
      thumbnail: { width: 300, height: 200 },
      medium: { width: 800, height: 600 },
      large: { width: 1600, height: 1200 }
    };
  }

  /**
   * Ensure directory exists
   */
  ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Created directory: ${dirPath}`);
    }
  }

  /**
   * Upload multiple images with local storage
   */
  async uploadImages(files, folder = 'listings', onProgress) {
    try {
      // Validate files
      this.validateFiles(files);

      // Ensure destination folders exist
      const folderPath = path.join(uploadPath, folder);
      const thumbPath = path.join(folderPath, 'thumbnails');
      
      this.ensureDirectoryExists(folderPath);
      this.ensureDirectoryExists(thumbPath);

      const uploadPromises = files.map(async (file, index) => {
        // Generate unique filename
        const uniqueId = uuidv4();
        const ext = path.extname(file.originalname) || '.jpg';
        const filename = `${uniqueId}${ext}`;
        
        // Ensure folder and subfolders exist
        const mediumPath = path.join(folderPath, 'medium');
        const largePath = path.join(folderPath, 'large');
        
        [mediumPath, largePath].forEach(dir => {
          this.ensureDirectoryExists(dir);
        });
        
        // Get file buffer - handle different file sources
        let buffer;
        
        try {
          if (file.buffer) {
            // File has a buffer (memory storage)
            buffer = file.buffer;
            console.log(`Using buffer from file.buffer (${buffer.length} bytes)`);
          } else if (file.path) {
            // File has a path (disk storage)
            buffer = await fs.promises.readFile(file.path);
            console.log(`Read buffer from file.path: ${file.path} (${buffer.length} bytes)`);
          } else if (file.data) {
            // Some implementations might use .data
            buffer = file.data;
            console.log(`Using buffer from file.data (${buffer.length} bytes)`);
          } else {
            console.error('No valid source for image data:', {
              hasBuffer: !!file.buffer,
              hasPath: !!file.path,
              hasData: !!file.data,
              size: file.size,
              filename: file.originalname
            });
            throw new Error('Invalid file buffer - no buffer, path, or data property');
          }
        } catch (err) {
          console.error(`Error reading file data for ${file.originalname}:`, err);
          throw new Error(`Failed to read file data: ${err.message}`);
        }

        // Process images for different sizes
        const processed = await this.processImage(buffer);
        
        // Save to disk
        await Promise.all([
          fs.promises.writeFile(path.join(folderPath, filename), processed.original),
          fs.promises.writeFile(path.join(thumbPath, filename), processed.thumbnail),
          fs.promises.writeFile(path.join(mediumPath, filename), processed.medium),
          fs.promises.writeFile(path.join(largePath, filename), processed.large),
        ]);
        
        // Calculate progress
        if (onProgress) {
          const progress = ((index + 1) / files.length) * 100;
          onProgress(Math.round(progress));
        }

        return {
          original: `${PUBLIC_URL}/uploads/${folder}/${filename}`,
          thumbnail: `${PUBLIC_URL}/uploads/${folder}/thumbnails/${filename}`,
          medium: `${PUBLIC_URL}/uploads/${folder}/medium/${filename}`,
          large: `${PUBLIC_URL}/uploads/${folder}/large/${filename}`
        };
      });

      return await Promise.all(uploadPromises);
    } catch (error) {
      console.error('File upload error:', error);
      throw new Error(`File upload failed: ${error.message}`);
    }
  }

  /**
   * Process a single image that's already been uploaded by multer
   */
  async processUploadedImage(file, folder = 'default') {
    try {
      if (!file) {
        throw new Error('No file provided');
      }
      
      // Extract file info
      const filename = file.filename || (file.path ? path.basename(file.path) : null);
      
      if (!filename) {
        throw new Error('File has no filename or path');
      }
      
      // Ensure directories exist
      const folderPath = path.join(uploadPath, folder);
      const thumbPath = path.join(folderPath, 'thumbnails');
      this.ensureDirectoryExists(thumbPath);
      
      // Get the source of the image data
      let sourcePath;
      if (file.path) {
        sourcePath = file.path;
      } else {
        throw new Error('File has no path property');
      }
      
      // Generate thumbnail
      await sharp(sourcePath)
        .resize(300, 200, { fit: 'cover' })
        .toFile(path.join(thumbPath, filename));
      
      return {
        url: `${PUBLIC_URL}/uploads/${folder}/${filename}`,
        thumbnail: `${PUBLIC_URL}/uploads/${folder}/thumbnails/${filename}`
      };
    } catch (error) {
      console.error('Image processing error:', error);
      throw new Error(`Image processing failed: ${error.message}`);
    }
  }

  /**
   * Process an image into different sizes
   */
  async processImage(buffer) {
    try {
      if (!buffer || buffer.length === 0) {
        throw new Error('Empty image buffer provided');
      }
      
      const processed = {
        original: await this.optimizeImage(buffer),
        thumbnail: await this.resizeImage(buffer, this.IMAGE_SIZES.thumbnail),
        medium: await this.resizeImage(buffer, this.IMAGE_SIZES.medium),
        large: await this.resizeImage(buffer, this.IMAGE_SIZES.large)
      };

      return processed;
    } catch (error) {
      console.error('Error processing image:', error);
      throw new Error(`Image processing failed: ${error.message}`);
    }
  }

  /**
   * Optimize an image
   */
  async optimizeImage(buffer) {
    try {
      return await sharp(buffer)
        .webp({ quality: 85 })
        .toBuffer();
    } catch (error) {
      console.error('Error optimizing image:', error);
      // If optimization fails, return the original buffer
      return buffer;
    }
  }

  /**
   * Resize an image
   */
  async resizeImage(buffer, size) {
    return sharp(buffer)
      .resize(size.width, size.height, {
        fit: 'cover',
        position: 'center'
      })
      .webp({ quality: 80 })
      .toBuffer();
  }

  /**
   * Validate files
   */
  validateFiles(files) {
    if (!files || files.length === 0) {
      throw new Error('No files provided');
    }

    files.forEach(file => {
      const mimetype = file.mimetype || file.type;
      if (!this.ALLOWED_TYPES.includes(mimetype)) {
        throw new Error(`Invalid file type: ${mimetype}`);
      }

      const size = file.size;
      if (size > this.MAX_FILE_SIZE) {
        throw new Error(`File too large: ${file.originalname || file.name}`);
      }
    });
  }

  /**
   * Delete a file
   */
  async deleteFile(fileUrl) {
    try {
      if (!fileUrl) return;
      
      // Extract file path from URL
      const urlObj = new URL(fileUrl);
      const filePath = urlObj.pathname;
      
      // Extract folder and filename
      const parts = filePath.split('/');
      const filename = parts.pop();
      const folder = parts[parts.length - 1];
      
      // Build full paths for all versions
      const originalPath = path.join(uploadPath, folder, filename);
      const thumbnailPath = path.join(uploadPath, folder, 'thumbnails', filename);
      const mediumPath = path.join(uploadPath, folder, 'medium', filename);
      const largePath = path.join(uploadPath, folder, 'large', filename);
      
      // Delete files if they exist
      [originalPath, thumbnailPath, mediumPath, largePath].forEach(filePath => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
      
      return true;
    } catch (error) {
      console.error('File deletion error:', error);
      return false;
    }
  }
}

export const fileUploadService = new FileUploadService();

// Add this helper function to upload a single image file with better error handling
export const uploadImage = async (file, folder = 'listings', imageType = 'default') => {
  try {
    console.log(`BEGIN processing image upload for file: ${file.originalname || 'unnamed'}`);
    
    // Validate file
    if (!file) {
      throw new Error('No file provided');
    }
    
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      throw new Error(`Invalid file type: ${file.mimetype}`);
    }
    
    // Define paths - both in uploads and public/uploads
    const uploadDirs = [
      path.join(uploadPath, folder),  // Original path
      path.join(__dirname, '../../public/uploads', folder)  // Additional path in public
    ];
    
    // Get file extension
    const getExtension = (mimetype) => {
      const types = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp'
      };
      return types[mimetype] || 'jpg';
    };

    const ext = getExtension(file.mimetype);
    const filename = `${uuidv4()}.${ext}`;
    
    // Make sure directories exist
    uploadDirs.forEach(dir => {
      const thumbDir = path.join(dir, 'thumbnails');
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
      }
      if (!fs.existsSync(thumbDir)) {
        fs.mkdirSync(thumbDir, { recursive: true });
        console.log(`Created thumbnails directory: ${thumbDir}`);
      }
    });
    
    // Get buffer from file - handle different file object formats
    let imageBuffer;
    if (file.buffer) {
      // For multer memoryStorage
      imageBuffer = file.buffer;
      console.log(`Using buffer from file.buffer (${imageBuffer.length} bytes)`);
    } else if (file.path) {
      // For multer diskStorage
      try {
        imageBuffer = fs.readFileSync(file.path);
        console.log(`Read buffer from file.path: ${file.path} (${imageBuffer.length} bytes)`);
      } catch (err) {
        console.error(`Error reading file from path ${file.path}:`, err);
        throw new Error(`Failed to read file from path: ${err.message}`);
      }
    } else {
      console.error('No valid source for image data:', file);
      throw new Error('Invalid file buffer - no buffer or path property');
    }
    
    if (!imageBuffer || imageBuffer.length === 0) {
      throw new Error(`Empty image data for file: ${file.originalname || 'unnamed'}`);
    }
    
    console.log(`Processing image: ${file.originalname || 'unnamed'}, size: ${imageBuffer.length} bytes`);
    
    // Process main image
    const mainImageBuffer = await sharp(imageBuffer)
      .resize(1200, 800, { fit: 'inside' })
      .toBuffer();
      
    // Process thumbnail
    const thumbnailBuffer = await sharp(imageBuffer)
      .resize(300, 200, { fit: 'cover' })
      .toBuffer();
    
    // IMPORTANT: Save to BOTH possible locations
    const savedPaths = [];
    
    for (const dir of uploadDirs) {
      try {
        const mainPath = path.join(dir, filename);
        const thumbPath = path.join(dir, 'thumbnails', filename);
        
        // Write files
        fs.writeFileSync(mainPath, mainImageBuffer);
        fs.writeFileSync(thumbPath, thumbnailBuffer);
        
        savedPaths.push({
          main: mainPath,
          thumb: thumbPath
        });
        
        console.log(`Saved image to ${mainPath}`);
      } catch (err) {
        console.error(`Error saving to directory ${dir}:`, err);
        // Continue to try other directories
      }
    }
    
    if (savedPaths.length === 0) {
      throw new Error('Failed to save image to any directory');
    }
    
    // Generate URLs using relative paths (not absolute paths with domain)
    const mainUrl = `/uploads/${folder}/${filename}`;
    const thumbnailUrl = `/uploads/${folder}/thumbnails/${filename}`;
    
    console.log(`Image processing complete. URLs: Main=${mainUrl}, Thumbnail=${thumbnailUrl}`);
    
    return {
      url: mainUrl,
      thumbnail: thumbnailUrl
    };
  } catch (error) {
    console.error('Image upload error:', error);
    throw new Error(`Failed to upload image: ${error.message}`);
  }
};

export const uploadFile = uploadImage;
export const deleteFile = (fileUrl) => fileUploadService.deleteFile(fileUrl)