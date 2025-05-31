// scripts/fixDealerListings.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars from parent directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Connect to MongoDB
console.log('Attempting to connect to MongoDB...');
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('MongoDB connected successfully');
  runFix();
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Simplified models for the script
const Listing = mongoose.model('Listing', new mongoose.Schema({}, { strict: false }));
const Dealer = mongoose.model('Dealer', new mongoose.Schema({}, { strict: false }));

// The fix function
async function runFix() {
  try {
    console.log('Starting dealer-listing relationship fix...');
    
    // Get all dealers
    const dealers = await Dealer.find();
    console.log(`Found ${dealers.length} dealers`);
    
    if (dealers.length === 0) {
      console.log('No dealers found! Please add dealers first.');
      process.exit(0);
    }
    
    // Get all listings
    const listings = await Listing.find();
    console.log(`Found ${listings.length} listings to check`);
    
    // Use first dealer as default if needed
    const defaultDealer = dealers[0];
    console.log(`Using ${defaultDealer.businessName} as default dealer if needed`);
    
    let updatedCount = 0;
    let errors = 0;
    
    // Update each listing to ensure dealer reference
    for (const listing of listings) {
      try {
        // Check if listing has a valid dealerId that matches a dealer
        let needsUpdate = false;
        let targetDealer = null;
        
        if (!listing.dealerId) {
          console.log(`Listing ${listing._id} has no dealerId`);
          needsUpdate = true;
          targetDealer = defaultDealer;
        } else {
          // Try to find matching dealer
          const matchingDealer = dealers.find(d => 
            d._id.toString() === listing.dealerId.toString()
          );
          
          if (!matchingDealer) {
            console.log(`Listing ${listing._id} has invalid dealerId: ${listing.dealerId}`);
            needsUpdate = true;
            targetDealer = defaultDealer;
          }
        }
        
        if (needsUpdate && targetDealer) {
          // Update the listing with correct dealer info
          const updates = {
            dealerId: targetDealer._id,
            dealer: {
              name: targetDealer.user?.name || 'Unknown',
              businessName: targetDealer.businessName || 'Unknown Dealer',
              contact: {
                phone: targetDealer.contact?.phone || 'N/A',
                email: targetDealer.contact?.email || 'N/A',
                website: targetDealer.contact?.website || null
              },
              location: {
                city: targetDealer.location?.city || 'Unknown',
                state: targetDealer.location?.state || null,
                country: targetDealer.location?.country || 'Unknown'
              },
              verification: {
                isVerified: targetDealer.verification?.status === 'verified',
                verifiedAt: targetDealer.verification?.verifiedAt || null
              },
              logo: targetDealer.profile?.logo || null
            }
          };
          
          // Update the listing
          await Listing.updateOne({ _id: listing._id }, { $set: updates });
          console.log(`✅ Updated listing ${listing._id}`);
          updatedCount++;
        } else {
          console.log(`✓ Listing ${listing._id} already has valid dealerId`);
        }
      } catch (err) {
        console.error(`Error updating listing ${listing._id}:`, err);
        errors++;
      }
    }
    
    console.log('\n===== FIX COMPLETED =====');
    console.log(`Total listings: ${listings.length}`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Errors: ${errors}`);
    console.log('=========================\n');
    
  } catch (err) {
    console.error('Error running fix:', err);
  } finally {
    // Close connection
    mongoose.connection.close();
    console.log('Done - DB connection closed');
  }
}