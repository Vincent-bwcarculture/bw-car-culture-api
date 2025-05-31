// server/scripts/cleanupOrphanedListings.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Listing from '../models/Listing.js';
import Dealer from '../models/Dealer.js';
import { deleteImage } from '../utils/imageUpload.js';

// Load environment variables
dotenv.config();

// Connect to the database
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  dbName: process.env.MONGODB_NAME
});

const db = mongoose.connection;

db.on('error', console.error.bind(console, 'Connection error:'));
db.once('open', async () => {
  console.log('Connected to MongoDB. Starting cleanup...');
  
  try {
    // Get all listings
    const allListings = await Listing.find();
    console.log(`Found ${allListings.length} total listings`);
    
    // Get all dealer IDs
    const dealerIds = (await Dealer.find().select('_id')).map(dealer => 
      dealer._id.toString()
    );
    console.log(`Found ${dealerIds.length} dealers in the system`);
    
    // Find listings with no associated dealer
    const orphanedListings = allListings.filter(listing => 
      !dealerIds.includes(listing.dealerId?.toString())
    );
    
    console.log(`Found ${orphanedListings.length} orphaned listings to delete`);
    
    if (orphanedListings.length === 0) {
      console.log('No orphaned listings found. Database is clean!');
      process.exit(0);
    }
    
    // Ask for confirmation
    console.log("\nWARNING: This will permanently delete all orphaned listings!");
    console.log("Press CTRL+C to cancel or wait 5 seconds to continue...");
    
    // Wait 5 seconds before proceeding
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Delete all orphaned listings
    let deletedCount = 0;
    let errorCount = 0;
    
    for (const listing of orphanedListings) {
      try {
        console.log(`Deleting listing: ${listing._id} - ${listing.title}`);
        
        // Delete images first
        if (listing.images && listing.images.length > 0) {
          for (const image of listing.images) {
            const imageUrl = typeof image === 'string' ? image : image.url;
            if (imageUrl) {
              try {
                await deleteImage(imageUrl);
                // Try to delete thumbnail too
                const thumbnailUrl = imageUrl.replace('/listings/', '/listings/thumbnails/');
                await deleteImage(thumbnailUrl);
              } catch (error) {
                console.warn(`Failed to delete image: ${imageUrl}`, error.message);
                // Continue deletion process
              }
            }
          }
        }
        
        // Delete the listing
        await Listing.findByIdAndDelete(listing._id);
        deletedCount++;
      } catch (error) {
        console.error(`Error deleting listing ${listing._id}: ${error.message}`);
        errorCount++;
      }
    }
    
    console.log(`\nCleanup completed!`);
    console.log(`Successfully deleted: ${deletedCount} listings`);
    if (errorCount > 0) {
      console.log(`Failed to delete: ${errorCount} listings`);
    }
    
    // Close the connection
    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Error during cleanup process:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
});