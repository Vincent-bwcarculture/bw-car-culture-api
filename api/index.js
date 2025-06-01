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

// CORS headers
const setCORSHeaders = (res, origin) => {
  const allowedOrigins = [
    'https://bw-car-culture.vercel.app',
    'https://bw-car-culture-mt6puwxf-katso-vincents-projects.vercel.app',
    'http://localhost:3000'
  ];
  
  const isAllowed = allowedOrigins.includes(origin) || 
                   (origin && origin.includes('bw-car-culture') && origin.includes('vercel.app'));
  
  const allowOrigin = isAllowed ? origin : '*';
  
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With, Cache-Control');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
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

    // Clean up the path - remove leading slash and api prefix
    let path = req.url.replace(/^\/+/, ''); // Remove leading slashes
    if (path.startsWith('api/')) {
      path = path.substring(4); // Remove 'api/' prefix
    }
    
    console.log('Processing path:', path);

    // === LISTINGS API ===
    if (path === 'listings' || path.startsWith('listings/') || path.startsWith('listings?')) {
      const url = new URL(req.url, `https://${req.headers.host}`);
      const page = parseInt(url.searchParams.get('page')) || 1;
      const limit = parseInt(url.searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      const listingsCollection = db.collection('listings');
      
      const listings = await listingsCollection.find({})
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .toArray();
      
      const total = await listingsCollection.countDocuments();
      
      return res.status(200).json({
        success: true,
        data: listings,
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        message: `Found ${listings.length} listings`
      });
    }

    // === SERVICE PROVIDERS API ===
    if (path === 'service-providers' || path.startsWith('service-providers/') || path.startsWith('service-providers?') ||
        path === 'providers' || path.startsWith('providers/') || path.startsWith('providers?')) {
      
      const url = new URL(req.url, `https://${req.headers.host}`);
      const page = parseInt(url.searchParams.get('page')) || 1;
      const limit = parseInt(url.searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      const serviceProvidersCollection = db.collection('serviceproviders');
      
      const providers = await serviceProvidersCollection.find({})
        .skip(skip)
        .limit(limit)
        .sort({ businessName: 1 })
        .toArray();
      
      const total = await serviceProvidersCollection.countDocuments();
      
      return res.status(200).json({
        success: true,
        data: providers,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        message: `Found ${providers.length} service providers`
      });
    }

    // === TRANSPORT API ===
    if (path === 'transport' || path.startsWith('transport/') || path.startsWith('transport?')) {
      const url = new URL(req.url, `https://${req.headers.host}`);
      const page = parseInt(url.searchParams.get('page')) || 1;
      const limit = parseInt(url.searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      const transportCollection = db.collection('transportnodes');
      
      const routes = await transportCollection.find({})
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .toArray();
      
      const total = await transportCollection.countDocuments();
      
      return res.status(200).json({
        success: true,
        data: routes,
        routes: routes,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        message: `Found ${routes.length} transport routes`
      });
    }

    // === RENTAL VEHICLES API ===
    if (path === 'rentals' || path.startsWith('rentals/') || path.startsWith('rentals?') ||
        path === 'rental-vehicles' || path.startsWith('rental-vehicles/')) {
      
      const url = new URL(req.url, `https://${req.headers.host}`);
      const page = parseInt(url.searchParams.get('page')) || 1;
      const limit = parseInt(url.searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      const rentalsCollection = db.collection('rentalvehicles');
      
      const vehicles = await rentalsCollection.find({})
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .toArray();
      
      const total = await rentalsCollection.countDocuments();
      
      return res.status(200).json({
        success: true,
        data: vehicles,
        vehicles: vehicles,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        message: `Found ${vehicles.length} rental vehicles`
      });
    }

    // === NEWS API ===
    if (path === 'news' || path.startsWith('news/') || path.startsWith('news?')) {
      const url = new URL(req.url, `https://${req.headers.host}`);
      const page = parseInt(url.searchParams.get('page')) || 1;
      const limit = parseInt(url.searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      const newsCollection = db.collection('news');
      
      const articles = await newsCollection.find({})
        .skip(skip)
        .limit(limit)
        .sort({ publishedAt: -1, createdAt: -1 })
        .toArray();
      
      const total = await newsCollection.countDocuments();
      
      return res.status(200).json({
        success: true,
        data: articles,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        message: `Found ${articles.length} news articles`
      });
    }

    // === DEALERS API ===
    if (path === 'dealers' || path.startsWith('dealers/') || path.startsWith('dealers?')) {
      const url = new URL(req.url, `https://${req.headers.host}`);
      const page = parseInt(url.searchParams.get('page')) || 1;
      const limit = parseInt(url.searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      const dealersCollection = db.collection('dealers');
      
      const dealers = await dealersCollection.find({})
        .skip(skip)
        .limit(limit)
        .sort({ businessName: 1 })
        .toArray();
      
      const total = await dealersCollection.countDocuments();
      
      return res.status(200).json({
        success: true,
        data: dealers,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        message: `Found ${dealers.length} dealers`
      });
    }

    // === ANALYTICS API ===
    if (path.startsWith('analytics')) {
      return res.status(200).json({
        success: true,
        message: 'Analytics endpoint working'
      });
    }

    // === AUTH API ===
    if (path.startsWith('auth/register') && req.method === 'POST') {
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
    }

    // === TEST ENDPOINT ===
    if (path === 'test-db' || path === 'health' || path === '') {
      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);
      
      // Get counts for each collection
      const counts = {};
      for (const name of ['listings', 'dealers', 'news', 'serviceproviders', 'transportnodes', 'rentalvehicles']) {
        try {
          counts[name] = await db.collection(name).countDocuments();
        } catch (e) {
          counts[name] = 0;
        }
      }
      
      return res.status(200).json({
        success: true,
        message: 'BW Car Culture API working!',
        path: path,
        originalUrl: req.url,
        collections: collectionNames,
        counts: counts,
        timestamp: new Date().toISOString(),
        availableEndpoints: [
          'GET /listings',
          'GET /dealers', 
          'GET /news',
          'GET /service-providers',
          'GET /transport',
          'GET /rentals'
        ]
      });
    }

    // === DEFAULT RESPONSE ===
    return res.status(404).json({
      success: false,
      message: `Endpoint not found: ${path}`,
      availableEndpoints: [
        'GET /listings',
        'GET /dealers',
        'GET /news', 
        'GET /service-providers',
        'GET /transport',
        'GET /rentals',
        'POST /auth/register'
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
