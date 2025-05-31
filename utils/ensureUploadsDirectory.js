// server/utils/ensureUploadsDirectory.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Ensures that all required upload directories exist
 */
export const ensureUploadsDirectory = () => {
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

export default ensureUploadsDirectory;