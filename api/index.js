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

  console.log(`[DEBUG] ${req.method} ${req.url} from: ${origin}`);

  try {
    const db = await connectDB();
    if (!db) {
      return res.status(500).json({
        success: false,
        message: 'Database connection failed'
      });
    }

    const url = new URL(req.url, `https://${req.headers.host}`);
    const pathname = url.pathname;
    const searchParams = url.searchParams;
    
    console.log(`[DEBUG] Pathname: ${pathname}`);

    // === SPECIFIC ENDPOINT MATCHING ===
    
    // LISTINGS
    if (pathname === '/listings' || pathname.startsWith('/listings/') || pathname.startsWith('/api/listings')) {
      console.log('[DEBUG] Matched LISTINGS endpoint');
      
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      const listingsCollection = db.collection('listings');
      
      // Handle dealer-specific listings
      const dealerMatch = pathname.match(/\/listings\/dealer\/([a-fA-F0-9]{24})/);
      if (dealerMatch) {
        const dealerId = dealerMatch[1];
        console.log(`[DEBUG] Fetching listings for dealer: ${dealerId}`);
        
        try {
          const { ObjectId } = await import('mongodb');
          const filter = {
            $or: [
              { dealerId: dealerId },
              { dealerId: new ObjectId.default(dealerId) },
              { 'dealer._id': dealerId },
              { 'dealer.id': dealerId }
            ]
          };
          
          const listings = await listingsCollection.find(filter).limit(limit).toArray();
          const total = await listingsCollection.countDocuments(filter);
          
          return res.status(200).json({
            success: true,
            data: listings,
            total,
            message: `Found ${listings.length} listings for dealer`
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching dealer listings', error: error.message });
        }
      }
      
      // Regular listings
      const listings = await listingsCollection.find({}).skip(skip).limit(limit).sort({ createdAt: -1 }).toArray();
      const total = await listingsCollection.countDocuments();
      
      return res.status(200).json({
        success: true,
        data: listings,
        total,
        message: `Found ${listings.length} listings`
      });
    }
    
    // SERVICE PROVIDERS
    if (pathname === '/service-providers' || pathname.startsWith('/service-providers/') || 
        pathname === '/api/service-providers' || pathname.startsWith('/api/service-providers/')) {
      console.log('[DEBUG] Matched SERVICE-PROVIDERS endpoint');
      
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      const serviceProvidersCollection = db.collection('serviceproviders');
      const providers = await serviceProvidersCollection.find({}).skip(skip).limit(limit).toArray();
      const total = await serviceProvidersCollection.countDocuments();
      
      return res.status(200).json({
        success: true,
        data: providers,
        total,
        message: `Found ${providers.length} service providers`
      });
    }
    
    // TRANSPORT
    if (pathname === '/transport' || pathname.startsWith('/transport/') || 
        pathname === '/api/transport' || pathname.startsWith('/api/transport/')) {
      console.log('[DEBUG] Matched TRANSPORT endpoint');
      
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      const providerId = searchParams.get('providerId');
      
      const transportCollection = db.collection('transportnodes');
      
      let filter = {};
      if (providerId) {
        console.log(`[DEBUG] Filtering transport by providerId: ${providerId}`);
        try {
          const { ObjectId } = await import('mongodb');
          filter = {
            $or: [
              { providerId: providerId },
              { providerId: new ObjectId.default(providerId) },
              { 'provider._id': providerId },
              { provider: providerId }
            ]
          };
        } catch (error) {
          filter = { providerId: providerId };
        }
      }
      
      const routes = await transportCollection.find(filter).skip(skip).limit(limit).toArray();
      const total = await transportCollection.countDocuments(filter);
      
      return res.status(200).json({
        success: true,
        data: routes,
        routes: routes,
        total,
        message: `Found ${routes.length} transport routes`
      });
    }
    
    // RENTALS
    if (pathname === '/rentals' || pathname.startsWith('/rentals/') || 
        pathname === '/api/rentals' || pathname.startsWith('/api/rentals/')) {
      console.log('[DEBUG] Matched RENTALS endpoint');
      
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      const providerId = searchParams.get('providerId');
      
      const rentalsCollection = db.collection('rentalvehicles');
      
      let filter = {};
      if (providerId) {
        console.log(`[DEBUG] Filtering rentals by providerId: ${providerId}`);
        try {
          const { ObjectId } = await import('mongodb');
          filter = {
            $or: [
              { providerId: providerId },
              { providerId: new ObjectId.default(providerId) },
              { 'provider._id': providerId },
              { provider: providerId }
            ]
          };
        } catch (error) {
          filter = { providerId: providerId };
        }
      }
      
      const vehicles = await rentalsCollection.find(filter).skip(skip).limit(limit).toArray();
      const total = await rentalsCollection.countDocuments(filter);
      
      return res.status(200).json({
        success: true,
        data: vehicles,
        vehicles: vehicles,
        total,
        message: `Found ${vehicles.length} rental vehicles`
      });
    }
    
    // TRAILERS
    if (pathname === '/trailers' || pathname.startsWith('/trailers/') || 
        pathname === '/api/trailers' || pathname.startsWith('/api/trailers/')) {
      console.log('[DEBUG] Matched TRAILERS endpoint');
      
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      const providerId = searchParams.get('providerId');
      
      const trailersCollection = db.collection('trailerlistings');
      
      let filter = {};
      if (providerId) {
        console.log(`[DEBUG] Filtering trailers by providerId: ${providerId}`);
        try {
          const { ObjectId } = await import('mongodb');
          filter = {
            $or: [
              { providerId: providerId },
              { providerId: new ObjectId.default(providerId) },
              { 'provider._id': providerId },
              { provider: providerId }
            ]
          };
        } catch (error) {
          filter = { providerId: providerId };
        }
      }
      
      const trailers = await trailersCollection.find(filter).skip(skip).limit(limit).toArray();
      const total = await trailersCollection.countDocuments(filter);
      
      return res.status(200).json({
        success: true,
        data: trailers,
        trailers: trailers,
        total,
        message: `Found ${trailers.length} trailers`
      });
    }
    
    // DEALERS
    if (pathname === '/dealers' || pathname.startsWith('/dealers/') || 
        pathname === '/api/dealers' || pathname.startsWith('/api/dealers/')) {
      console.log('[DEBUG] Matched DEALERS endpoint');
      
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      const dealersCollection = db.collection('dealers');
      const dealers = await dealersCollection.find({}).skip(skip).limit(limit).toArray();
      const total = await dealersCollection.countDocuments();
      
      return res.status(200).json({
        success: true,
        data: dealers,
        total,
        message: `Found ${dealers.length} dealers`
      });
    }
    
    // NEWS
    if (pathname === '/news' || pathname.startsWith('/news/') || 
        pathname === '/api/news' || pathname.startsWith('/api/news/')) {
      console.log('[DEBUG] Matched NEWS endpoint');
      
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      const newsCollection = db.collection('news');
      const articles = await newsCollection.find({}).skip(skip).limit(limit).sort({ publishedAt: -1 }).toArray();
      const total = await newsCollection.countDocuments();
      
      return res.status(200).json({
        success: true,
        data: articles,
        total,
        message: `Found ${articles.length} news articles`
      });
    }
    
    // ANALYTICS
    if (pathname.includes('/analytics')) {
      console.log('[DEBUG] Matched ANALYTICS endpoint');
      return res.status(200).json({
        success: true,
        message: 'Analytics endpoint working'
      });
    }
    
    // AUTH REGISTER
    if (pathname.includes('/auth/register') && req.method === 'POST') {
      console.log('[DEBUG] Matched AUTH REGISTER endpoint');
      
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
    
    // TEST/HEALTH
    if (pathname === '/test-db' || pathname === '/health' || pathname === '/' || pathname === '/api/health') {
      console.log('[DEBUG] Matched TEST/HEALTH endpoint');
      
      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);
      
      const counts = {};
      for (const name of ['listings', 'dealers', 'news', 'serviceproviders', 'transportnodes', 'rentalvehicles', 'trailerlistings']) {
        try {
          counts[name] = await db.collection(name).countDocuments();
        } catch (e) {
          counts[name] = 0;
        }
      }
      
      return res.status(200).json({
        success: true,
        message: 'BW Car Culture API working!',
        pathname: pathname,
        collections: collectionNames,
        counts: counts,
        timestamp: new Date().toISOString()
      });
    }
    
    // DEFAULT - NOT FOUND
    console.log(`[DEBUG] NO MATCH FOUND for pathname: ${pathname}`);
    return res.status(404).json({
      success: false,
      message: `Endpoint not found: ${pathname}`,
      pathname: pathname,
      availableEndpoints: [
        '/listings',
        '/service-providers',
        '/transport', 
        '/rentals',
        '/trailers',
        '/dealers',
        '/news'
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
