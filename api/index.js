// Enhanced CORS for specific frontend domain
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
    
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    isConnected = true;
    
    return client.db(process.env.MONGODB_NAME || 'i3wcarculture');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    return null;
  }
};

// Enhanced CORS with specific frontend domain
const setCORSHeaders = (res, origin) => {
  const allowedOrigins = [
    'https://bw-car-culture.vercel.app',
    'https://bw-car-culture-1g2voo80m-katso-vincents-projects.vercel.app',
    'http://localhost:3000'
  ];
  
  const allowOrigin = allowedOrigins.includes(origin) ? origin : 'https://bw-car-culture.vercel.app';
  
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
};

export default async function handler(req, res) {
  const origin = req.headers.origin;
  setCORSHeaders(res, origin);
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  console.log(`${req.method} ${req.url} from origin: ${origin}`);

  try {
    // Test database connection
    if (req.url.includes('/test-db') || req.url.includes('/database')) {
      const db = await connectDB();
      
      if (db) {
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        
        // Get sample data
        let userData = null;
        try {
          const usersCollection = db.collection('users');
          const userCount = await usersCollection.countDocuments();
          const sampleUsers = await usersCollection.find({}).limit(3).toArray();
          userData = { userCount, sampleUsers };
        } catch (e) {
          console.log('Users collection error:', e.message);
        }

        let listingsData = null;
        try {
          const listingsCollection = db.collection('listings');
          const listingsCount = await listingsCollection.countDocuments();
          const sampleListings = await listingsCollection.find({}).limit(10).toArray();
          listingsData = { listingsCount, sampleListings };
        } catch (e) {
          console.log('Listings collection error:', e.message);
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
      } else {
        return res.status(500).json({
          success: false,
          message: 'Could not connect to database'
        });
      }
    }

    // Get all listings for frontend
    if (req.url.includes('/listings') || req.url.includes('/cars')) {
      const db = await connectDB();
      if (db) {
        const listingsCollection = db.collection('listings');
        const listings = await listingsCollection.find({}).limit(50).toArray();
        
        return res.status(200).json({
          success: true,
          data: listings,
          total: listings.length,
          message: 'Listings retrieved successfully'
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
      console.log('Registration attempt:', { fullName, email, origin });
      
      const db = await connectDB();
      if (db) {
        try {
          const usersCollection = db.collection('users');
          
          const existingUser = await usersCollection.findOne({ email });
          if (existingUser) {
            return res.status(400).json({
              success: false,
              message: 'User already exists with this email'
            });
          }
          
          const newUser = {
            fullName,
            email,
            password, // Hash in production
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
      origin: origin,
      endpoints: {
        'test-database': 'GET /test-db',
        'listings': 'GET /listings',
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
