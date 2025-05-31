// server/scripts/fixListings.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars from parent directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Import models
import Listing from '../models/Listing.js';
import Dealer from '../models/Dealer.js';
import User from '../models/User.js';

// Connect to database
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: process.env.MONGODB_NAME
    });
    console.log(`MongoDB Connected: ${mongoose.connection.host}`);
  } catch (err) {
    console.error('Database connection error:', err);
    process.exit(1);
  }
};

// Migration script to fix listings
const fixListings = async () => {
  try {
    console.log('Starting migration to fix listings...');
    
    // 1. Get all listings
    const listings = await Listing.find({});
    console.log(`Found ${listings.length} listings to process`);
    
    let fixedCount = 0;
    let errorCount = 0;
    
    // 2. Process each listing
    for (const listing of listings) {
      try {
        console.log(`Processing listing: ${listing._id} - ${listing.title}`);
        
        // Check if dealerId is a reference to a User instead of a Dealer
        let dealerId = listing.dealerId;
        let dealer = null;
        
        // If dealer already exists, just make sure it's a valid reference
        if (dealerId) {
          try {
            dealer = await Dealer.findById(dealerId);
          } catch (err) {
            console.log(`Invalid dealerId format on listing: ${listing._id}`);
          }
          
          // If couldn't find dealer with this ID, it might be a User reference
          if (!dealer) {
            try {
              // Check if it's a User reference
              const user = await User.findById(dealerId);
              
              if (user) {
                console.log(`DealerId refers to a User (${user.name}). Finding associated dealer...`);
                // Find dealer associated with this user
                dealer = await Dealer.findOne({ user: user._id });
                
                if (dealer) {
                  console.log(`Found dealer ${dealer.businessName} for user ${user.name}`);
                  dealerId = dealer._id;
                }
              }
            } catch (err) {
              console.log(`Error checking if dealerId is a User reference: ${err.message}`);
            }
          }
        }
        
        // If we couldn't find a dealer, find any active dealer to assign
        if (!dealer) {
          console.log(`No valid dealer found for listing ${listing._id}. Finding any active dealer...`);
          dealer = await Dealer.findOne({ status: 'active' });
          
          if (dealer) {
            console.log(`Assigning listing to dealer: ${dealer.businessName}`);
            dealerId = dealer._id;
          } else {
            console.log(`No active dealers found! Cannot fix this listing.`);
            errorCount++;
            continue;
          }
        }
        
        // 3. Update listing with correct dealer information
        const updates = {
          dealerId: dealerId,
          dealer: {
            name: dealer.user?.name || 'Unknown',
            businessName: dealer.businessName || 'Unknown Dealer',
            contact: {
              phone: dealer.contact?.phone || 'N/A',
              email: dealer.contact?.email || 'N/A',
              website: dealer.contact?.website || null
            },
            location: {
              city: dealer.location?.city || 'Unknown',
              state: dealer.location?.state || null,
              country: dealer.location?.country || 'Unknown'
            },
            verification: {
              isVerified: dealer.verification?.status === 'verified',
              verifiedAt: dealer.verification?.verifiedAt || null
            },
            logo: dealer.profile?.logo || null
          }
        };
        
        // 4. Update image paths if needed
        if (listing.images && listing.images.length > 0) {
          const updatedImages = listing.images.map(img => {
            // Keep the existing data
            const imgData = typeof img === 'object' ? {...img} : { url: img };
            
            // Make sure thumbnail is set
            if (!imgData.thumbnail && imgData.url) {
              imgData.thumbnail = imgData.url.replace('/listings/', '/listings/thumbnails/');
            }
            
            return imgData;
          });
          
          updates.images = updatedImages;
        }
        
        // Save the updated listing
        await Listing.findByIdAndUpdate(listing._id, updates);
        console.log(`✅ Successfully updated listing: ${listing._id}`);
        fixedCount++;
        
      } catch (err) {
        console.error(`Error fixing listing ${listing._id}:`, err);
        errorCount++;
      }
    }
    
    console.log('\n========== MIGRATION SUMMARY ==========');
    console.log(`Total listings processed: ${listings.length}`);
    console.log(`Successfully fixed: ${fixedCount}`);
    console.log(`Errors: ${errorCount}`);
    console.log('======================================\n');
    
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
};

// Run the migration
connectDB()
  .then(() => fixListings())
  .then(() => {
    console.log('Migration completed');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });