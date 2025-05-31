// restore-images.js
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';

// Database connection info
const mongoURI = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_NAME;

// Original image mappings based on the diagnostic output we saw
const ORIGINAL_IMAGES = {
  'BMW M4 Competition Capital Motors Certified Pre Owned': [
    'http://localhost:5000/uploads/listings/2ae82f83-2723-46b2-ac46-47e89e1f1273.jpg',
    'http://localhost:5000/uploads/listings/f00e82f0-d729-4e20-8a2d-2b65227f1839.jpg',
    'http://localhost:5000/uploads/listings/18820735-7220-4628-8275-65766bb9b817.jpg',
    'http://localhost:5000/uploads/listings/6b46746c-a5b5-4f48-b260-b5b93f697bc9.jpg',
    'http://localhost:5000/uploads/listings/6b41a75b-88bd-4087-aa92-c7d9de6ba643.jpg'
  ],
  'BMW M3 Competition xDrive': [
    'http://localhost:5000/uploads/listings/97bdcafb-dc44-498d-8312-671d14d4ef96.jpg',
    'http://localhost:5000/uploads/listings/0175a7ef-6b91-4cf1-9600-bb4340eb0b4b.jpg',
    'http://localhost:5000/uploads/listings/f3dfcc68-4cf0-4191-8dca-517a45601c6c.jpg',
    'http://localhost:5000/uploads/listings/e965dc9d-f1ac-4ae9-b9de-089f1ed3d6f8.jpg',
    'http://localhost:5000/uploads/listings/5c36e32f-d1be-4991-a66f-018013282421.jpg',
    'http://localhost:5000/uploads/listings/306e7148-d738-49a0-a3fa-8cf05d9de596.jpg', 
    'http://localhost:5000/uploads/listings/741d1677-2409-47da-997c-20ff2d58a867.jpg',
    'http://localhost:5000/uploads/listings/59a92da2-3897-4520-8648-8a7978279132.jpg',
    'http://localhost:5000/uploads/listings/04f2e836-efd9-4ccf-b612-ee1cd17e91de.jpg'
  ],
  '2023 Toyota Hilux': [
    'http://localhost:5000/uploads/listings/9404d31d-3292-4252-96c5-d15b79cf2907.jpg',
    'http://localhost:5000/uploads/listings/f6df91e0-98c1-4e24-b5dc-7990c9d8a80f.jpg',
    'http://localhost:5000/uploads/listings/5f8e36fb-6161-4e42-869e-05844afd6a6e.jpg',
    'http://localhost:5000/uploads/listings/64df7a7f-f1b1-43fc-8c98-feb93c82d60d.jpg'
  ],
  'Ford Ranger Wildtrak V6': [
    '/uploads/listings/f28c8c8f-f713f269.jpg'
  ],
  '2024 Mitsubishi Triton': [
    'http://localhost:5000/uploads/listings/8cf495d2-fdb7-4bf6-ad44-c14857cb4b7e.jpg',
    'http://localhost:5000/uploads/listings/b8d127b0-99e5-4dea-9861-41f839da423a.jpg',
    'http://localhost:5000/uploads/listings/5c35cdae-df1a-4974-8181-36624e1f7a6d.jpg',
    'http://localhost:5000/uploads/listings/76247bc1-c940-4ae8-98ef-4cfa59d0efaf.jpg'
  ],
  '2025 Mazda BT-50': [
    'http://localhost:5000/uploads/listings/5b264a98-1d64-488d-9a11-9faf49a693c7.jpg',
    'http://localhost:5000/uploads/listings/777041f6-abc3-4a56-b5cd-276cd235274c.jpg',
    'http://localhost:5000/uploads/listings/eee21471-b92d-4494-98b8-ff0746c5ff38.jpg'
  ],
  '2025 Toyota Hilux Legend 55': [
    'http://localhost:5000/uploads/listings/0ba8c948-4e07-417c-b6ff-4ed741066025.jpg',
    'http://localhost:5000/uploads/listings/62b450b7-c443-4d8e-b6a1-22f30c25b957.jpg',
    'http://localhost:5000/uploads/listings/71e420fa-cc28-4b74-a622-88db4e4e038a.jpg',
    'http://localhost:5000/uploads/listings/75531913-7db3-4190-bccb-ee8a4ec0db54.jpg',
    'http://localhost:5000/uploads/listings/d5f77a83-8603-4b63-973f-d36dcd3e6d8f.jpg',
    'http://localhost:5000/uploads/listings/d1c186d0-1377-4fbe-a401-c7808bfc6e25.jpg',
    'http://localhost:5000/uploads/listings/822d0bb8-435b-44cd-a5a3-43e839317611.jpg',
    'http://localhost:5000/uploads/listings/1fcfc975-bd81-4936-be4f-a8e7ec9acc27.jpg'
  ],
  '2025 Audi A6 Avant': [
    '/uploads/listings/c0292c41-bf38-40da-9830-e262c0e629da.jpg',
    '/uploads/listings/fcce6523-df83-49c0-b604-9b48c0dbcd59.jpg',
    '/uploads/listings/bd9304e0-d608-4f84-b5a1-94217b97c438.jpg',
    '/uploads/listings/9c0aedb4-91e0-41ce-8f3c-418ac41e947a.jpg',
    '/uploads/listings/30e12fbe-e177-4329-9ed6-9e822060a6f7.jpg'
  ]
};

// Function to create image objects from URLs
function createImageObjects(urls) {
  return urls.map((url, index) => {
    return {
      url: url,
      thumbnail: url.replace('/listings/', '/listings/thumbnails/'),
      isPrimary: index === 0
    };
  });
}

async function restoreOriginalImages() {
  try {
    // Connect to MongoDB
    console.log(`🔌 Connecting to MongoDB (database: ${dbName})...`);
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: dbName
    });
    console.log('✅ MongoDB connected.');

    // Define model
    const Listing = mongoose.model('Listing', new mongoose.Schema({
      title: String,
      images: Array,
    }), 'listings');

    // Fetch all listings
    const listings = await Listing.find();
    console.log(`📦 Found ${listings.length} listings.`);

    // Update each listing with its original images
    for (const listing of listings) {
      const originalUrls = ORIGINAL_IMAGES[listing.title];
      
      if (originalUrls) {
        // Create image objects from the original URLs
        const imageObjects = createImageObjects(originalUrls);
        
        // Update the listing with original images
        listing.images = imageObjects;
        await listing.save();
        
        console.log(`✅ Restored ${imageObjects.length} original images for: ${listing.title}`);
      } else {
        console.warn(`⚠️ No original image data found for: "${listing.title}"`);
      }
    }

    console.log('🎉 Finished restoring original images.');
  } catch (error) {
    console.error('❌ Error restoring images:', error);
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected.');
  }
}

// Run the restoration
restoreOriginalImages();