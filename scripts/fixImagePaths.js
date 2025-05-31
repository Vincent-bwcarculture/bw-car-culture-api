// fixImagePaths.js - Save this in a scripts directory
// Usage: node scripts/fixImagePaths.js

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import Listing model (update path as needed)
import Listing from '../models/Listing.js';

// Get database connection string from environment variables
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_NAME = process.env.MONGODB_NAME;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not defined in environment variables');
  process.exit(1);
}

// Configure directories to check for images
const UPLOAD_DIRECTORIES = [
  path.join(__dirname, '../uploads/listings'),
  path.join(__dirname, '../public/uploads/listings')
];

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  dbName: MONGODB_NAME
}).then(() => {
  console.log('Connected to MongoDB');
  fixImagePaths();
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Main function to fix image paths
async function fixImagePaths() {
  console.log('Starting image path migration...');

  try {
    // Get all listings with images
    const listings = await Listing.find({ images: { $exists: true, $ne: [] } });
    console.log(`Found ${listings.length} listings with images`);

    // Get list of actual files in upload directories
    const actualFiles = new Map();
    for (const dir of UPLOAD_DIRECTORIES) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          // Store the full path including directory
          actualFiles.set(file, path.join(dir, file));
        });
      }
    }
    console.log(`Found ${actualFiles.size} actual image files on disk`);

    let updatedCount = 0;
    let errorCount = 0;
    
    // Process each listing
    for (const listing of listings) {
      try {
        // Check if images array is valid
        if (!Array.isArray(listing.images)) {
          console.log(`Listing ${listing._id}: images field is not an array, skipping`);
          continue;
        }

        let imagesChanged = false;
        const newImages = [];

        // Process each image in the listing
        for (const image of listing.images) {
          // Handle various image formats
          let imageUrl = '';
          
          if (typeof image === 'string') {
            imageUrl = image;
          } else if (image && image.url) {
            imageUrl = image.url;
          } else {
            // Skip invalid image entries
            console.log(`Listing ${listing._id}: invalid image format, skipping`, image);
            continue;
          }

          // Extract filename from URL
          const filename = imageUrl.split('/').pop();
          
          // Skip if no filename could be extracted
          if (!filename) {
            console.log(`Listing ${listing._id}: could not extract filename from ${imageUrl}`);
            continue;
          }

          // Check if the file exists in our actual files map
          if (actualFiles.has(filename)) {
            // Image exists, create a standardized path
            const newUrl = `/uploads/listings/${filename}`;
            const newThumbnailUrl = `/uploads/listings/thumbnails/${filename}`;
            
            // Create new image object with correct paths
            if (typeof image === 'string') {
              // If original was a string, replace with object format
              newImages.push({
                url: newUrl,
                thumbnail: newThumbnailUrl,
                isPrimary: newImages.length === 0 // First image is primary
              });
            } else {
              // Keep original object structure but update paths
              newImages.push({
                ...image,
                url: newUrl,
                thumbnail: newThumbnailUrl
              });
            }
            
            imagesChanged = true;
          } else {
            console.log(`Listing ${listing._id}: File ${filename} not found on disk`);
            
            // For images without matching files, maintain the entry but standardize path
            // This preserves the data structure even if the file is missing
            if (typeof image === 'string') {
              newImages.push({
                url: `/uploads/listings/${filename}`,
                thumbnail: `/uploads/listings/thumbnails/${filename}`,
                isPrimary: newImages.length === 0
              });
              imagesChanged = true;
            } else {
              // Keep the original object but standardize paths
              const newImage = { ...image };
              
              // Clean up URL if needed (remove domain, fix path)
              if (image.url) {
                newImage.url = `/uploads/listings/${filename}`;
              }
              
              // Clean up thumbnail if needed
              if (image.thumbnail) {
                const thumbnailFilename = image.thumbnail.split('/').pop();
                newImage.thumbnail = `/uploads/listings/thumbnails/${thumbnailFilename || filename}`;
              }
              
              newImages.push(newImage);
              imagesChanged = true;
            }
          }
        }

        // Update the listing if changes were made
        if (imagesChanged) {
          listing.images = newImages;
          await listing.save();
          updatedCount++;
          console.log(`Updated listing ${listing._id} images`);
        }
      } catch (err) {
        console.error(`Error processing listing ${listing._id}:`, err);
        errorCount++;
      }
    }

    console.log(`
    ======= Migration Complete =======
    Total listings processed: ${listings.length}
    Successfully updated: ${updatedCount}
    Errors: ${errorCount}
    =================================
    `);

  } catch (err) {
    console.error('Error during migration:', err);
  } finally {
    // Close database connection
    mongoose.connection.close();
    console.log('Database connection closed');
  }
}