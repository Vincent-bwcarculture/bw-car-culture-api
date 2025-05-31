// server/scripts/resetDealerMetrics.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Dealer from '../models/Dealer.js';
import Listing from '../models/Listing.js';

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
  console.log('Connected to MongoDB. Resetting dealer metrics...');
  
  try {
    // Get all dealers
    const dealers = await Dealer.find();
    console.log(`Found ${dealers.length} dealers to update`);
    
    // Update each dealer's metrics
    for (const dealer of dealers) {
      // Count total listings
      const totalListings = await Listing.countDocuments({ dealerId: dealer._id });
      
      // Count active listings
      const activeSales = await Listing.countDocuments({ 
        dealerId: dealer._id,
        status: 'active' 
      });
      
      // Update metrics
      dealer.metrics = {
        ...dealer.metrics,
        totalListings,
        activeSales
      };
      
      // Save the updated dealer
      await dealer.save();
      
      console.log(`Updated dealer ${dealer.businessName}: ${totalListings} total listings, ${activeSales} active sales`);
    }
    
    console.log('All dealer metrics have been reset successfully!');
    
    // Close the connection
    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Error resetting dealer metrics:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
});