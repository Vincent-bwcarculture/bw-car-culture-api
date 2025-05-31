// scripts/fixListingReferences.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars from parent directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function fixListingReferences() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('Connected to MongoDB');
    console.log(`Database: ${mongoose.connection.db.databaseName}`);
    
    // Get dealers directly from collection (bypass any model issues)
    const dealersCollection = mongoose.connection.db.collection('dealers');
    const dealers = await dealersCollection.find().toArray();
    
    console.log(`Found ${dealers.length} dealers directly from collection`);
    
    if (dealers.length === 0) {
      console.log('No dealers found. Checking with different casing...');
      
      // Try different casing options
      const casings = ['Dealers', 'DEALERS', 'dealer', 'Dealer'];
      
      for (const casing of casings) {
        try {
          const altCollection = mongoose.connection.db.collection(casing);
          const altDealers = await altCollection.find().toArray();
          
          if (altDealers.length > 0) {
            console.log(`Found ${altDealers.length} dealers in collection '${casing}'`);
            dealers.push(...altDealers);
          }
        } catch (err) {
          // Collection might not exist
        }
      }
    }
    
    if (dealers.length === 0) {
      console.log('Still no dealers found. Cannot proceed with fix.');
      return;
    }
    
    // Get all listings directly from collection
    const listingsCollection = mongoose.connection.db.collection('listings');
    const listings = await listingsCollection.find().toArray();
    
    console.log(`Found ${listings.length} listings`);
    
    // Update references
    let updatedCount = 0;
    const defaultDealer = dealers[0]; // Use the first dealer as default
    
    for (const listing of listings) {
      // Check if listing needs to be updated
      const needsUpdate = !listing.dealerId || 
        !listing.dealer || 
        !dealers.some(d => d._id.toString() === listing.dealerId.toString());
      
      if (needsUpdate) {
        const update = {
          dealerId: defaultDealer._id,
          dealer: {
            name: defaultDealer.businessName || 'Unknown',
            businessName: defaultDealer.businessName || 'Unknown',
            contact: defaultDealer.contact || { phone: 'N/A', email: 'N/A' },
            location: defaultDealer.location || { city: 'Unknown', country: 'Unknown' },
            verification: {
              isVerified: defaultDealer.verification?.status === 'verified',
              verifiedAt: defaultDealer.verification?.verifiedAt || null
            },
            logo: defaultDealer.profile?.logo || null
          }
        };
        
        await listingsCollection.updateOne(
          { _id: listing._id },
          { $set: update }
        );
        
        updatedCount++;
        console.log(`Updated listing ${listing._id}`);
      }
    }
    
    console.log(`\nUpdated ${updatedCount} listings to reference dealer ${defaultDealer._id}`);
    
  } catch (error) {
    console.error('Error fixing listing references:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

fixListingReferences();