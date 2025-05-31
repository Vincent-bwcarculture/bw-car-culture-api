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
  
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With, Cache-Control, Pragma, Expires, If-Modified-Since, If-None-Match');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
};

// Helper function to parse query parameters and handle pagination
const parseQueryParams = (req) => {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const page = parseInt(url.searchParams.get('page')) || 1;
  const limit = Math.min(parseInt(url.searchParams.get('limit')) || 50, 100); // Max 100 items
  const skip = (page - 1) * limit;
  const search = url.searchParams.get('search') || '';
  const category = url.searchParams.get('category') || '';
  const status = url.searchParams.get('status') || '';
  
  return { page, limit, skip, search, category, status };
};

// Helper function to build search filter
const buildSearchFilter = (search, searchFields) => {
  if (!search) return {};
  
  const searchRegex = { $regex: search, $options: 'i' };
  return {
    $or: searchFields.map(field => ({ [field]: searchRegex }))
  };
};

export default async function handler(req, res) {
  const origin = req.headers.origin;
  setCORSHeaders(res, origin);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  console.log(`${req.method} ${req.url} from: ${origin}`);

  try {
    const db = await connectDB();
    if (!db) {
      return res.status(500).json({
        success: false,
        message: 'Database connection failed'
      });
    }

    // === LISTINGS API (Cars) ===
    if (req.method === 'GET' && req.url.startsWith('/listings')) {
      try {
        const { page, limit, skip, search, category, status } = parseQueryParams(req);
        const listingsCollection = db.collection('listings');
        
        // Build filter
        let filter = {};
        if (search) {
          filter = buildSearchFilter(search, ['title', 'make', 'model', 'description']);
        }
        if (category) filter.category = category;
        if (status) filter.status = status;
        
        const listings = await listingsCollection.find(filter)
          .skip(skip)
          .limit(limit)
          .sort({ createdAt: -1 })
          .toArray();
        
        const total = await listingsCollection.countDocuments(filter);
        
        return res.status(200).json({
          success: true,
          data: listings,
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
          message: 'Listings retrieved successfully'
        });
      } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching listings', error: error.message });
      }
    }

    // === NEWS API ===
    if (req.method === 'GET' && req.url.startsWith('/news')) {
      try {
        const { page, limit, skip, search, category, status } = parseQueryParams(req);
        const newsCollection = db.collection('news');
        
        let filter = {};
        if (search) {
          filter = buildSearchFilter(search, ['title', 'content', 'summary']);
        }
        if (category) filter.category = category;
        if (status) filter.status = status;
        
        const news = await newsCollection.find(filter)
          .skip(skip)
          .limit(limit)
          .sort({ publishedAt: -1, createdAt: -1 })
          .toArray();
        
        const total = await newsCollection.countDocuments(filter);
        
        return res.status(200).json({
          success: true,
          data: news,
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
          message: 'News articles retrieved successfully'
        });
      } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching news', error: error.message });
      }
    }

    // === DEALERS API ===
    if (req.method === 'GET' && req.url.startsWith('/dealers')) {
      try {
        const { page, limit, skip, search, category, status } = parseQueryParams(req);
        const dealersCollection = db.collection('dealers');
        
        let filter = {};
        if (search) {
          filter = buildSearchFilter(search, ['name', 'description', 'location', 'city']);
        }
        if (status) filter.status = status;
        
        const dealers = await dealersCollection.find(filter)
          .skip(skip)
          .limit(limit)
          .sort({ name: 1 })
          .toArray();
        
        const total = await dealersCollection.countDocuments(filter);
        
        return res.status(200).json({
          success: true,
          data: dealers,
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
          message: 'Dealers retrieved successfully'
        });
      } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching dealers', error: error.message });
      }
    }

    // === SERVICE PROVIDERS API ===
    if (req.method === 'GET' && req.url.startsWith('/service-providers')) {
      try {
        const { page, limit, skip, search, category } = parseQueryParams(req);
        const serviceProvidersCollection = db.collection('serviceproviders');
        
        let filter = {};
        if (search) {
          filter = buildSearchFilter(search, ['name', 'services', 'description', 'location']);
        }
        if (category) filter.category = category;
        
        const serviceProviders = await serviceProvidersCollection.find(filter)
          .skip(skip)
          .limit(limit)
          .sort({ name: 1 })
          .toArray();
        
        const total = await serviceProvidersCollection.countDocuments(filter);
        
        return res.status(200).json({
          success: true,
          data: serviceProviders,
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
          message: 'Service providers retrieved successfully'
        });
      } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching service providers', error: error.message });
      }
    }

    // === VIDEOS API ===
    if (req.method === 'GET' && req.url.startsWith('/videos')) {
      try {
        const { page, limit, skip, search, category } = parseQueryParams(req);
        const videosCollection = db.collection('videos');
        
        let filter = {};
        if (search) {
          filter = buildSearchFilter(search, ['title', 'description', 'tags']);
        }
        if (category) filter.category = category;
        
        const videos = await videosCollection.find(filter)
          .skip(skip)
          .limit(limit)
          .sort({ createdAt: -1 })
          .toArray();
        
        const total = await videosCollection.countDocuments(filter);
        
        return res.status(200).json({
          success: true,
          data: videos,
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
          message: 'Videos retrieved successfully'
        });
      } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching videos', error: error.message });
      }
    }

    // === RENTAL VEHICLES API ===
    if (req.method === 'GET' && req.url.startsWith('/rental-vehicles')) {
      try {
        const { page, limit, skip, search, category } = parseQueryParams(req);
        const rentalVehiclesCollection = db.collection('rentalvehicles');
        
        let filter = {};
        if (search) {
          filter = buildSearchFilter(search, ['make', 'model', 'description', 'location']);
        }
        if (category) filter.category = category;
        
        const rentalVehicles = await rentalVehiclesCollection.find(filter)
          .skip(skip)
          .limit(limit)
          .sort({ createdAt: -1 })
          .toArray();
        
        const total = await rentalVehiclesCollection.countDocuments(filter);
        
        return res.status(200).json({
          success: true,
          data: rentalVehicles,
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
          message: 'Rental vehicles retrieved successfully'
        });
      } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching rental vehicles', error: error.message });
      }
    }

    // === TRAILER LISTINGS API ===
    if (req.method === 'GET' && req.url.startsWith('/trailer-listings')) {
      try {
        const { page, limit, skip, search } = parseQueryParams(req);
        const trailerListingsCollection = db.collection('trailerlistings');
        
        let filter = {};
        if (search) {
          filter = buildSearchFilter(search, ['title', 'description', 'type']);
        }
        
        const trailerListings = await trailerListingsCollection.find(filter)
          .skip(skip)
          .limit(limit)
          .sort({ createdAt: -1 })
          .toArray();
        
        const total = await trailerListingsCollection.countDocuments(filter);
        
        return res.status(200).json({
          success: true,
          data: trailerListings,
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
          message: 'Trailer listings retrieved successfully'
        });
      } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching trailer listings', error: error.message });
      }
    }

    // === USERS API ===
    if (req.method === 'GET' && req.url.startsWith('/users')) {
      try {
        const { page, limit, skip, search } = parseQueryParams(req);
        const usersCollection = db.collection('users');
        
        let filter = {};
        if (search) {
          filter = buildSearchFilter(search, ['fullName', 'email', 'role']);
        }
        
        // Don't return password field
        const users = await usersCollection.find(filter, { projection: { password: 0 } })
          .skip(skip)
          .limit(limit)
          .sort({ createdAt: -1 })
          .toArray();
        
        const total = await usersCollection.countDocuments(filter);
        
        return res.status(200).json({
          success: true,
          data: users,
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
          message: 'Users retrieved successfully'
        });
      } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching users', error: error.message });
      }
    }

    // === ANALYTICS API ===
    if (req.method === 'GET' && req.url.startsWith('/analytics')) {
      try {
        if (req.url.includes('/sessions')) {
          const sessionsCollection = db.collection('analyticssessions');
          const sessions = await sessionsCollection.find({}).limit(100).sort({ timestamp: -1 }).toArray();
          const total = await sessionsCollection.countDocuments();
          
          return res.status(200).json({
            success: true,
            data: sessions,
            total,
            message: 'Analytics sessions retrieved successfully'
          });
        }
        
        if (req.url.includes('/pageviews')) {
          const pageviewsCollection = db.collection('analyticspageviews');
          const pageviews = await pageviewsCollection.find({}).limit(100).sort({ timestamp: -1 }).toArray();
          const total = await pageviewsCollection.countDocuments();
          
          return res.status(200).json({
            success: true,
            data: pageviews,
            total,
            message: 'Analytics pageviews retrieved successfully'
          });
        }
        
        if (req.url.includes('/metrics')) {
          const metricsCollection = db.collection('analyticsmetrics');
          const metrics = await metricsCollection.find({}).limit(50).sort({ date: -1 }).toArray();
          const total = await metricsCollection.countDocuments();
          
          return res.status(200).json({
            success: true,
            data: metrics,
            total,
            message: 'Analytics metrics retrieved successfully'
          });
        }
        
        // Default analytics response
        return res.status(200).json({
          success: true,
          message: 'Analytics endpoint working',
          endpoints: ['/analytics/sessions', '/analytics/pageviews', '/analytics/metrics']
        });
      } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching analytics', error: error.message });
      }
    }

    // === BUSINESS METRICS API ===
    if (req.method === 'GET' && req.url.startsWith('/business-metrics')) {
      try {
        const businessMetricsCollection = db.collection('businessmetrics');
        const metrics = await businessMetricsCollection.find({})
          .limit(50)
          .sort({ date: -1 })
          .toArray();
        
        const total = await businessMetricsCollection.countDocuments();
        
        return res.status(200).json({
          success: true,
          data: metrics,
          total,
          message: 'Business metrics retrieved successfully'
        });
      } catch (error) {
        return res.status(500).json({ success: false, message: 'Error fetching business metrics', error: error.message });
      }
    }

    // === DATABASE TEST API ===
    if (req.url.includes('/test-db')) {
      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);
      
      // Get sample data from each major collection
      const sampleData = {};
      for (const collectionName of ['listings', 'news', 'dealers', 'users', 'videos']) {
        try {
          const collection = db.collection(collectionName);
          const count = await collection.countDocuments();
          const sample = await collection.find({}).limit(2).toArray();
          sampleData[collectionName] = { count, sample };
        } catch (e) {
          sampleData[collectionName] = { error: e.message };
        }
      }
      
      return res.status(200).json({
        success: true,
        message: 'Database connected successfully!',
        database: process.env.MONGODB_NAME || 'i3wcarculture',
        collections: collectionNames,
        totalCollections: collectionNames.length,
        sampleData,
        timestamp: new Date().toISOString()
      });
    }

    // === ADMIN REGISTRATION ===
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

    // === DEFAULT RESPONSE WITH ALL AVAILABLE ENDPOINTS ===
    return res.status(200).json({
      status: 'success',
      message: 'BW Car Culture Complete API',
      timestamp: new Date().toISOString(),
      origin: origin,
      endpoints: {
        // Core Collections
        'listings': 'GET /listings?page=1&limit=50&search=&category=&status=',
        'news': 'GET /news?page=1&limit=50&search=&category=&status=',
        'dealers': 'GET /dealers?page=1&limit=50&search=&status=',
        'service-providers': 'GET /service-providers?page=1&limit=50&search=&category=',
        'videos': 'GET /videos?page=1&limit=50&search=&category=',
        'rental-vehicles': 'GET /rental-vehicles?page=1&limit=50&search=&category=',
        'trailer-listings': 'GET /trailer-listings?page=1&limit=50&search=',
        'users': 'GET /users?page=1&limit=50&search=',
        
        // Analytics
        'analytics-sessions': 'GET /analytics/sessions',
        'analytics-pageviews': 'GET /analytics/pageviews',
        'analytics-metrics': 'GET /analytics/metrics',
        'business-metrics': 'GET /business-metrics',
        
        // Authentication
        'register': 'POST /auth/register',
        
        // Development
        'test-database': 'GET /test-db'
      },
      features: [
        'Pagination support on all endpoints',
        'Search functionality',
        'Category and status filtering',
        'CORS enabled for frontend',
        'Real-time database connection'
      ]
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
