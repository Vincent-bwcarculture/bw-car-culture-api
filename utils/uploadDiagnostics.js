// server/utils/uploadDiagnostics.js
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Debug middleware to diagnose image upload issues
 */
export const debugImageUpload = (req, res, next) => {
  console.log('\n=== DEBUG IMAGE UPLOAD ===');
  console.log('Request method:', req.method);
  console.log('Request path:', req.path);
  console.log('Content-Type:', req.headers['content-type']);
  
  // Check for file objects
  console.log('req.file exists:', !!req.file);
  console.log('req.files exists:', !!req.files);
  
  if (req.file) {
    console.log('Single file details:', {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      encoding: req.file.encoding,
      mimetype: req.file.mimetype,
      size: req.file.size,
      destination: req.file.destination,
      filename: req.file.filename,
      path: req.file.path,
      buffer: req.file.buffer ? 'Buffer exists' : 'No buffer'
    });
  }
  
  if (req.files) {
    console.log('Files count:', Array.isArray(req.files) ? req.files.length : Object.keys(req.files).length);
    
    if (Array.isArray(req.files)) {
      req.files.forEach((file, i) => {
        console.log(`File ${i} details:`, {
          fieldname: file.fieldname,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          destination: file.destination,
          filename: file.filename,
          path: file.path
        });
      });
    } else {
      // Handle non-array files object
      Object.keys(req.files).forEach(field => {
        const files = Array.isArray(req.files[field]) ? req.files[field] : [req.files[field]];
        files.forEach((file, i) => {
          console.log(`File ${field}[${i}] details:`, file);
        });
      });
    }
  }
  
  console.log('===========================\n');
  next();
};

/**
 * Verify and ensure all required directories exist
 */
export const ensureUploadDirectories = () => {
  console.log('Ensuring upload directories exist...');
  
  // Define paths - check both possible locations
  const uploadPaths = [
    // Server root uploads
    path.join(__dirname, '../../uploads/listings'),
    path.join(__dirname, '../../uploads/listings/thumbnails'),
    path.join(__dirname, '../../uploads/dealers'),
    path.join(__dirname, '../../uploads/dealers/thumbnails'),
    
    // Public folder uploads
    path.join(__dirname, '../../public/uploads/listings'),
    path.join(__dirname, '../../public/uploads/listings/thumbnails'),
    path.join(__dirname, '../../public/uploads/dealers'),
    path.join(__dirname, '../../public/uploads/dealers/thumbnails'),
    
    // Default fallback directory
    path.join(__dirname, '../../public/images/placeholders')
  ];
  
  // Create each directory if it doesn't exist
  uploadPaths.forEach(dirPath => {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`Created directory: ${dirPath}`);
      } else {
        console.log(`Directory already exists: ${dirPath}`);
      }
      
      // Test write permissions
      const testFile = path.join(dirPath, '.test-write');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      console.log(`Directory is writable: ${dirPath}`);
    } catch (err) {
      console.error(`Error creating or writing to directory ${dirPath}:`, err);
    }
  });
  
  console.log('Upload directories verified');
};

export default { debugImageUpload, ensureUploadDirectories };