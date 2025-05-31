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

// CORS with ALL standard headers allowed
const setCORSHeaders = (res, origin) => {
  const allowedOrigins = [
    'https://bw-car-culture.vercel.app',
    'https://bw-car-culture-mt6puwxf-katso-vincents-projects.vercel.app',
    'https://bw-car-culture-1g2voo80m-katso-vincents-projects.vercel.app',
    'http://localhost:3000'
  ];
  
  // Allow any origin that includes 'bw-car-culture' for Vercel deployments
  const isAllowed = allowedOrigins.includes(origin) || 
                   (origin && origin.includes('bw-car-culture') && origin.includes('vercel.app'));
  
  const allowOrigin = isAllowed ? origin : '*';
  
  // Include ALL standard headers that frontend might send
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With, Cache-Control, Pragma, Expires, If-Modified-Since, If-None-Match');
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

  console.log(`${req.method} ${req.url} from: ${origin}`);

  try {
    // GET listings endpoint - this is what your frontend needs
    if (req.method === 'GET' && req.url.startsWith('/listings')) {
      const db = await connectDB();
      if (db) {
        try {
          const listingsCollection = db.collection('listings');
          
          // Parse query parameters for pagination
          const url = new URL(req.url, `https://${req.headers.host}`);
          const page = parseInt(url.searchParams.get('page')) || 1;
          const limit = parseInt(url.searchParams.get('limit')) || 100;
          const skip = (page - 1) * limit;
          
          const listings = await listingsCollection.find({})
            .skip(skip)
            .limit(limit)
            .toArray();
          
          const total = await listingsCollection.countDocuments();
          
          return res.status(200).json({
            success: true,
            data: listings,
            total: total,
            page: page,
            limit: limit,
            pages: Math.ceil(total / limit),
            message: 'Listings retrieved successfully'
          });
        } catch (dbError) {
          console.error('Database error:', dbError);
          return res.status(500).json({
            success: false,
            message: 'Error fetching listings',
            error: dbError.message
          });
        }
      } else {
        return res.status(500).json({
          success: false,
          message: 'Database connection failed'
        });
      }
    }

    // Handle analytics endpoints (prevent errors)
    if (req.url.includes('/analytics')) {
      return res.status(200).json({
        success: true,
        message: 'Analytics endpoint working'
      });
    }

    // Test database connection
    if (req.url.includes('/test-db')) {
      const db = await connectDB();
      if (db) {
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        
        let listingsData = null;
        try {
          const listingsCollection = db.collection('listings');
          const listingsCount = await listingsCollection.countDocuments();
          const sampleListings = await listingsCollection.find({}).limit(3).toArray();
          listingsData = { listingsCount, sampleListings };
        } catch (e) {
          console.log('Listings error:', e.message);
        }
        
        return res.status(200).json({
          success: true,
          message: 'Database connected successfully!',
          database: process.env.MONGODB_NAME || 'i3wcarculture',
          collections: collectionNames,
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
            password,
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
      message: 'BW Car Culture API',
      timestamp: new Date().toISOString(),
      origin: origin,
      endpoints: {
        'listings': 'GET /listings?page=1&limit=100',
        'test-db': 'GET /test-db',
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
