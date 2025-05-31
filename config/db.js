// server/config/db.js - Complete with Analytics Integration
import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    console.log('Attempting to connect to MongoDB...');
    console.log('Database Name:', process.env.MONGODB_NAME);

    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: process.env.MONGODB_NAME // Explicitly set database name
    });

    // Log success and available collections
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    const collections = await conn.connection.db.listCollections().toArray();
    console.log('Available collections:', collections.map(col => col.name));

    // Initialize analytics database after main connection
    try {
      console.log('🔧 Setting up analytics database...');
      const { initializeAnalyticsDatabase } = await import('./analyticsDatabase.js');
      const analyticsResult = await initializeAnalyticsDatabase();
      console.log('✅ Analytics database setup completed:', analyticsResult);
    } catch (analyticsError) {
      console.error('⚠️ Analytics database setup failed (continuing without analytics):', analyticsError);
      // Don't fail the entire connection if analytics setup fails
    }

  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Enhanced connection verification with analytics
async function verifyDbConnection() {
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    const requiredCollections = ['listings', 'users', 'dealers'];
    
    const missingCollections = requiredCollections.filter(
      collection => !collections.find(c => c.name === collection)
    );

    if (missingCollections.length > 0) {
      console.warn('Missing main collections:', missingCollections);
    }

    // Verify analytics database
    let analyticsHealth = null;
    try {
      const { verifyAnalyticsHealth } = await import('./analyticsDatabase.js');
      analyticsHealth = await verifyAnalyticsHealth();
      console.log('📊 Analytics database health:', analyticsHealth.status);
    } catch (error) {
      console.warn('⚠️ Analytics health check failed:', error.message);
    }

    return {
      connected: true,
      collections: collections.map(c => c.name),
      missing: missingCollections,
      analytics: analyticsHealth
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message
    };
  }
}

// Enhanced health check for entire database system
const healthCheck = async () => {
  try {
    // Check main database connection
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Database not connected');
    }

    // Verify collections and analytics
    const verification = await verifyDbConnection();
    
    return {
      status: 'healthy',
      database: verification,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

// Graceful shutdown handling
const handleAppTermination = async () => {
  try {
    console.log('Closing database connections...');
    await mongoose.connection.close();
    console.log('Database connections closed.');
  } catch (error) {
    console.error('Error closing database connections:', error);
  }
};

// Export enhanced database object
const db = {
  connect: connectDB,
  healthCheck,
  verifyDbConnection,
  handleAppTermination
};

export { db };
export default connectDB;