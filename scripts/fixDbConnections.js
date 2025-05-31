// scripts/fixDbConnections.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars from parent directory
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function diagnoseAndFix() {
  try {
    console.log('===== DATABASE CONNECTION DIAGNOSTICS =====');
    console.log('MongoDB URI:', process.env.MONGODB_URI);
    console.log('Database Name:', process.env.MONGODB_NAME || 'Not specified');
    
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('Connected to MongoDB successfully!');
    console.log('Database Name:', mongoose.connection.name);
    
    // List all collections
    console.log('\n=== COLLECTIONS IN DATABASE ===');
    const collections = await mongoose.connection.db.listCollections().toArray();
    
    if (collections.length === 0) {
      console.log('No collections found in this database.');
    } else {
      collections.forEach(collection => {
        console.log(`- ${collection.name}`);
      });
    }
    
    // Try different casing for the dealer collection
    const collectionNames = ['dealers', 'Dealers', 'DEALERS', 'dealer', 'Dealer'];
    
    for (const name of collectionNames) {
      try {
        const count = await mongoose.connection.db.collection(name).countDocuments();
        console.log(`\nCollection '${name}' exists with ${count} documents`);
        
        if (count > 0) {
          const sample = await mongoose.connection.db.collection(name).findOne();
          console.log(`Sample document from '${name}':`, JSON.stringify(sample, null, 2).substring(0, 500) + '...');
          
          console.log('\n=== FIXING LISTINGS ===');
          // Use this collection to update listings
          const dealerId = sample._id;
          const dealerName = sample.businessName || 'Unknown Dealer';
          console.log(`Using dealer: ${dealerName} with ID: ${dealerId}`);
          
          // Update all listings to reference this dealer
          const ListingCollection = mongoose.model('Listing', new mongoose.Schema({}, { strict: false }));
          const listings = await ListingCollection.find();
          console.log(`Found ${listings.length} listings to update`);
          
          let updatedCount = 0;
          
          for (const listing of listings) {
            try {
              await ListingCollection.updateOne(
                { _id: listing._id },
                { 
                  $set: { 
                    dealerId: dealerId,
                    dealer: {
                      name: sample.businessName || 'Unknown Dealer',
                      businessName: sample.businessName || 'Unknown Dealer',
                      contact: sample.contact || { phone: 'N/A', email: 'N/A' },
                      location: sample.location || { city: 'Unknown', country: 'Unknown' },
                      verification: {
                        isVerified: sample.verification?.status === 'verified',
                        verifiedAt: sample.verification?.verifiedAt || null
                      },
                      logo: sample.profile?.logo || null
                    }
                  } 
                }
              );
              updatedCount++;
            } catch (err) {
              console.error(`Error updating listing ${listing._id}:`, err.message);
            }
          }
          
          console.log(`Updated ${updatedCount} listings to reference dealer ${dealerId}`);
          break;
        }
      } catch (err) {
        console.log(`Collection '${name}' doesn't exist or error:`, err.message);
      }
    }
    
    // Check listings
    try {
      const listingCount = await mongoose.connection.db.collection('listings').countDocuments();
      console.log(`\nListing collection exists with ${listingCount} documents`);
      
      if (listingCount > 0) {
        const sampleListing = await mongoose.connection.db.collection('listings').findOne();
        console.log('Sample listing:', JSON.stringify({
          id: sampleListing._id,
          title: sampleListing.title,
          dealerId: sampleListing.dealerId,
          hasDealer: !!sampleListing.dealer
        }, null, 2));
      }
    } catch (err) {
      console.log(`Could not access listings collection:`, err.message);
    }
    
  } catch (error) {
    console.error('Error during diagnostics:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  }
}

diagnoseAndFix();