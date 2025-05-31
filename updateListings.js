// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

// Import dependencies
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name (for ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate required environment variables
const mongoURI = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_NAME;

if (!mongoURI) {
  console.error('❌ MONGODB_URI is not defined in the environment. Check your .env file.');
  process.exit(1);
}

if (!dbName) {
  console.error('❌ MONGODB_NAME is not defined in the environment. Check your .env file.');
  process.exit(1);
}

// List of actual image files from your screenshot
// These are the files we actually have on the server
const ACTUAL_IMAGE_FILES = [
  // First row of images
  '388fa44f-aaab-44bf-89c5-10b3809270d6.jpg',
  '354f7b58-6bff-4e56-a1aa-a324696e1e109.jpg',
  '3823a836-1e0a-483c-b446-e8cb52c7236c.jpg',
  '4778ea15-6ca3-429d-aede-0707bef5590f.jpg',
  '6974b0aa-09bc-408c-93c6-1fcec4c8fdd9.jpg',
  '7455d4e8-4ab9-4d78-a435-0bb17c428c0c.jpg',
  '7639cd0e-28d7-4b79-9620-9cb81f33bcde.jpg',
  
  // Second row of images
  '23937e67-abf3-4345-9ce5-0449ee8b9b3f.jpg',
  '63938e8e-0bb0-43c0-afc4-db687ff99584.jpg',
  '78101f50-a0b4-4f49-93f7-3add2f327882.jpg',
  '88086bb8-5a65-431f-b501-c42d5d5897fa.jpg',
  '08158405-89c0-4ee0-a507-097b98328d3d.jpg',
  '48122712-3729-4e31-b435-f16aa48e360a.jpg',
  '63239280-e56b-48ca-abc7-8cf1c9ee02aa.jpg'
  
  // Add more files as needed from your screenshot
];

async function updateListingsWithActualFiles() {
  try {
    // Connect to MongoDB
    console.log(`🔌 Connecting to MongoDB (database: ${dbName})...`);
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: dbName
    });
    console.log('✅ MongoDB connected.');

    // Define simple model
    const Listing = mongoose.model('Listing', new mongoose.Schema({
      title: String,
      images: Array,
    }), 'listings');

    // Fetch all listings
    const listings = await Listing.find().lean();
    console.log(`📦 Found ${listings.length} listings.`);

    // Check if we have enough image files for all listings
    if (ACTUAL_IMAGE_FILES.length < listings.length) {
      console.warn(`⚠️ Not enough image files (${ACTUAL_IMAGE_FILES.length}) for all listings (${listings.length})`);
    }

    // Update each listing with an actual image file
    for (let i = 0; i < listings.length; i++) {
      const listing = listings[i];
      
      // Get the corresponding image file, or use the first one if we run out
      const imageFile = ACTUAL_IMAGE_FILES[i % ACTUAL_IMAGE_FILES.length];
      
      console.log(`🔄 Updating "${listing.title}" with image: ${imageFile}`);
      
      // Update the listing with the actual image file
      await Listing.updateOne(
        { _id: listing._id },
        { 
          $set: { 
            images: [
              {
                url: `/uploads/listings/${imageFile}`,
                thumbnail: `/uploads/listings/thumbnails/${imageFile}`,
                isPrimary: true,
              }
            ]
          }
        }
      );
    }
    
    console.log('✅ All listings updated with actual image files.');
  } catch (error) {
    console.error('❌ Error updating listings:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected.');
  }
}

// Run the script
updateListingsWithActualFiles();