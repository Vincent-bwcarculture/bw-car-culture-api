// Native MongoDB driver (no mongoose conflicts)
let MongoClient;
let client;
let isConnected = false;

const connectDB = async () => {
  if (isConnected && client) {
    return client.db(process.env.MONGODB_NAME || 'i3wcarculture');
  }

  try {
    if (!MongoClient) {
      const mongodb = await import('mongodb');
      MongoClient = mongodb.MongoClient;
    }
    
    client = new MongoClient(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    await client.connect();
    isConnected = true;
    
    console.log('✅ MongoDB connected successfully');
    return client.db(process.env.MONGODB_NAME || 'i3wcarculture');
    
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    isConnected = false;
    return null;
  }
};

// CORS helper
const setCORSHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

export default async function handler(req, res) {
  setCORSHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Test database connection
    if (req.url.includes('/test-db') || req.url.includes('/database')) {
      const db = await connectDB();
      
      if (db) {
        try {
          // Get all collections
          const collections = await db.listCollections().toArray();
          const collectionNames = collections.map(c => c.name);
          
          // Try to get some data from users collection
          let userData = null;
          try {
            const usersCollection = db.collection('users');
            const userCount = await usersCollection.countDocuments();
            const sampleUsers = await usersCollection.find({}).limit(3).toArray();
            userData = { userCount, sampleUsers };
          } catch (userError) {
            console.log('No users collection or error accessing it:', userError.message);
          }

          // Try to get listings data
          let listingsData = null;
          try {
            const listingsCollection = db.collection('listings');
            const listingsCount = await listingsCollection.countDocuments();
            const sampleListings = await listingsCollection.find({}).limit(3).toArray();
            listingsData = { listingsCount, sampleListings };
          } catch (listingsError) {
            console.log('No listings collection or error accessing it:', listingsError.message);
          }
          
          return res.status(200).json({
            success: true,
            message: 'Database connected successfully!',
            database: process.env.MONGODB_NAME || 'i3wcarculture',
            collections: collectionNames,
            totalCollections: collectionNames.length,
            userData,
            listingsData,
            timestamp: new Date().toISOString()
          });
          
        } catch (dbError) {
          return res.status(200).json({
            success: true,
            message: 'Database connected but error reading data',
            error: dbError.message,
            timestamp: new Date().toISOString()
          });
        }
      } else {
        return res.status(500).json({
          success: false,
          message: 'Could not connect to database',
          timestamp: new Date().toISOString()
        });
      }
    }

    // Get specific collection data
    if (req.url.includes('/users')) {
      const db = await connectDB();
      if (db) {
        const usersCollection = db.collection('users');
        const users = await usersCollection.find({}).toArray();
        
        return res.status(200).json({
          success: true,
          collection: 'users',
          count: users.length,
          data: users,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Get listings
    if (req.url.includes('/listings')) {
      const db = await connectDB();
      if (db) {
        const listingsCollection = db.collection('listings');
        const listings = await listingsCollection.find({}).limit(10).toArray();
        
        return res.status(200).json({
          success: true,
          collection: 'listings',
          count: listings.length,
          data: listings,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Admin registration
    if (req.method === 'POST' && req.url.includes('/auth/register')) {
      let body = {};
      try {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const rawBody = Buffer.concat(chunks).toString();
        body = JSON.parse(rawBody);
      } catch (e) {
        console.log('Body parse error:', e);
      }

      const { fullName, email, password } = body;
      
      const db = await connectDB();
      if (db) {
        try {
          const usersCollection = db.collection('users');
          
          // Check if user exists
          const existingUser = await usersCollection.findOne({ email });
          if (existingUser) {
            return res.status(400).json({
              success: false,
              message: 'User already exists with this email'
            });
          }
          
          // Insert new user
          const newUser = {
            fullName,
            email,
            password, // Should hash in production
            role: 'admin',
            createdAt: new Date()
          };
          
          const result = await usersCollection.insertOne(newUser);
          
          return res.status(201).json({
            success: true,
            message: 'Admin registered successfully!',
            user: {
              id: result.insertedId,
              fullName,
              email,
              role: 'admin'
            }
          });
          
        } catch (dbError) {
          return res.status(500).json({
            success: false,
            message: 'Database error during registration',
            error: dbError.message
          });
        }
      }
    }

    // Default response
    return res.status(200).json({
      status: 'success',
      message: 'BW Car Culture API with Native MongoDB',
      timestamp: new Date().toISOString(),
      endpoints: {
        'test-database': 'GET /test-db',
        'view-users': 'GET /users', 
        'view-listings': 'GET /listings',
        'register': 'POST /auth/register'
      }
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
}
