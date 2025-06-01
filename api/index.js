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

  console.log(`[API] ${req.method} ${req.url}`);

  try {
    const db = await connectDB();
    if (!db) {
      return res.status(500).json({
        success: false,
        message: 'Database connection failed'
      });
    }

    const url = new URL(req.url, `https://${req.headers.host}`);
    const path = url.pathname;
    
    console.log(`[API] Processing: ${path}`);

    // === EXACT MATCHES FIRST ===
    
    if (path === '/service-providers') {
      console.log('[API] → SERVICE-PROVIDERS');
      const serviceProvidersCollection = db.collection('serviceproviders');
      const providers = await serviceProvidersCollection.find({}).limit(20).toArray();
      return res.status(200).json({
        success: true,
        data: providers,
        message: `Service providers: ${providers.length} found`
      });
    }
    
    // Individual service provider by ID
    if (path.startsWith('/service-providers/') || path.startsWith('/providers/')) {
      const idMatch = path.match(/\/(service-)?providers\/([a-fA-F0-9]{24})/);
      if (idMatch) {
        const providerId = idMatch[2];
        console.log(`[API] → INDIVIDUAL PROVIDER: ${providerId}`);
        
        try {
          const { ObjectId } = await import('mongodb');
          const serviceProvidersCollection = db.collection('serviceproviders');
          const provider = await serviceProvidersCollection.findOne({ _id: new ObjectId.default(providerId) });
          
          if (!provider) {
            return res.status(404).json({
              success: false,
              message: 'Service provider not found'
            });
          }
          
          return res.status(200).json({
            success: true,
            data: provider,
            message: `Individual provider: ${provider.businessName || provider.name}`
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            message: 'Error fetching service provider',
            error: error.message
          });
        }
      }
    }
    
    if (path === '/dealers') {
      console.log('[API] → DEALERS');
      const dealersCollection = db.collection('dealers');
      const dealers = await dealersCollection.find({}).limit(20).toArray();
      return res.status(200).json({
        success: true,
        data: dealers,
        message: `Dealers: ${dealers.length} found`
      });
    }
    
    // Individual dealer by ID
    if (path.startsWith('/dealers/')) {
      const idMatch = path.match(/\/dealers\/([a-fA-F0-9]{24})/);
      if (idMatch) {
        const dealerId = idMatch[1];
        console.log(`[API] → INDIVIDUAL DEALER: ${dealerId}`);
        
        try {
          const { ObjectId } = await import('mongodb');
          const dealersCollection = db.collection('dealers');
          const dealer = await dealersCollection.findOne({ _id: new ObjectId.default(dealerId) });
          
          if (!dealer) {
            return res.status(404).json({
              success: false,
              message: 'Dealer not found'
            });
          }
          
          return res.status(200).json({
            success: true,
            data: dealer,
            message: `Individual dealer: ${dealer.businessName || dealer.name}`
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            message: 'Error fetching dealer',
            error: error.message
          });
        }
      }
    }
    
    if (path === '/listings') {
      console.log('[API] → LISTINGS');
      const listingsCollection = db.collection('listings');
      const listings = await listingsCollection.find({}).limit(20).sort({ createdAt: -1 }).toArray();
      return res.status(200).json({
        success: true,
        data: listings,
        message: `Listings: ${listings.length} found`
      });
    }
    
    // Individual listing by ID and dealer listings
    if (path.startsWith('/listings/')) {
      // Handle dealer-specific listings first
      const dealerMatch = path.match(/\/listings\/dealer\/([a-fA-F0-9]{24})/);
      if (dealerMatch) {
        const dealerId = dealerMatch[1];
        console.log(`[API] → DEALER LISTINGS: ${dealerId}`);
        
        try {
          const { ObjectId } = await import('mongodb');
          const listingsCollection = db.collection('listings');
          
          const filter = {
            $or: [
              { dealerId: dealerId },
              { dealerId: new ObjectId.default(dealerId) },
              { 'dealer._id': dealerId },
              { 'dealer.id': dealerId }
            ]
          };
          
          const listings = await listingsCollection.find(filter).limit(20).toArray();
          
          return res.status(200).json({
            success: true,
            data: listings,
            message: `Dealer listings: ${listings.length} found for dealer`
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            message: 'Error fetching dealer listings',
            error: error.message
          });
        }
      }
      
      // Individual listing by ID
      const listingMatch = path.match(/\/listings\/([a-fA-F0-9]{24})$/);
      if (listingMatch) {
        const listingId = listingMatch[1];
        console.log(`[API] → INDIVIDUAL LISTING: ${listingId}`);
        
        try {
          const { ObjectId } = await import('mongodb');
          const listingsCollection = db.collection('listings');
          const listing = await listingsCollection.findOne({ _id: new ObjectId.default(listingId) });
          
          if (!listing) {
            return res.status(404).json({
              success: false,
              message: 'Listing not found'
            });
          }
          
          return res.status(200).json({
            success: true,
            data: listing,
            message: `Individual listing: ${listing.title}`
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            message: 'Error fetching listing',
            error: error.message
          });
        }
      }
    }
    
    if (path === '/news') {
      console.log('[API] → NEWS');
      const newsCollection = db.collection('news');
      const articles = await newsCollection.find({}).limit(20).sort({ publishedAt: -1 }).toArray();
      return res.status(200).json({
        success: true,
        data: articles,
        message: `News articles: ${articles.length} found`
      });
    }
    
    // Individual news article by ID
    if (path.startsWith('/news/')) {
      const idMatch = path.match(/\/news\/([a-fA-F0-9]{24})/);
      if (idMatch) {
        const newsId = idMatch[1];
        console.log(`[API] → INDIVIDUAL NEWS: ${newsId}`);
        
        try {
          const { ObjectId } = await import('mongodb');
          const newsCollection = db.collection('news');
          const article = await newsCollection.findOne({ _id: new ObjectId.default(newsId) });
          
          if (!article) {
            return res.status(404).json({
              success: false,
              message: 'News article not found'
            });
          }
          
          return res.status(200).json({
            success: true,
            data: article,
            message: `Individual article: ${article.title}`
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            message: 'Error fetching news article',
            error: error.message
          });
        }
      }
    }
    
    if (path === '/transport') {
      console.log('[API] → TRANSPORT');
      const transportCollection = db.collection('transportnodes');
      const routes = await transportCollection.find({}).limit(20).toArray();
      return res.status(200).json({
        success: true,
        data: routes,
        message: `Transport routes: ${routes.length} found`
      });
    }
    
    if (path === '/rentals') {
      console.log('[API] → RENTALS');
      const rentalsCollection = db.collection('rentalvehicles');
      const vehicles = await rentalsCollection.find({}).limit(20).toArray();
      return res.status(200).json({
        success: true,
        data: vehicles,
        message: `Rental vehicles: ${vehicles.length} found`
      });
    }
    
    if (path === '/trailers') {
      console.log('[API] → TRAILERS');
      const trailersCollection = db.collection('trailerlistings');
      const trailers = await trailersCollection.find({}).limit(20).toArray();
      return res.status(200).json({
        success: true,
        data: trailers,
        message: `Trailers: ${trailers.length} found`
      });
    }
    
    if (path === '/providers') {
      console.log('[API] → PROVIDERS (alias for service-providers)');
      const serviceProvidersCollection = db.collection('serviceproviders');
      const providers = await serviceProvidersCollection.find({}).limit(20).toArray();
      return res.status(200).json({
        success: true,
        data: providers,
        message: `Providers: ${providers.length} found`
      });
    }
    
    // === ANALYTICS ===
    if (path.includes('analytics')) {
      console.log('[API] → ANALYTICS');
      return res.status(200).json({
        success: true,
        message: 'Analytics endpoint working'
      });
    }
    
    // === AUTH REGISTER ===
    if (path.includes('auth/register') && req.method === 'POST') {
      console.log('[API] → AUTH REGISTER');
      
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
    
    // === TEST/HEALTH ===
    if (path === '/test-db' || path === '/health' || path === '/' || path === '/api/health') {
      console.log('[API] → TEST/HEALTH');
      
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
        path: path,
        collections: collectionNames,
        counts: counts,
        timestamp: new Date().toISOString(),
        endpoints: [
          '/service-providers',
          '/service-providers/{id}',
          '/dealers',
          '/dealers/{id}',
          '/listings',
          '/listings/{id}',
          '/listings/dealer/{dealerId}',
          '/news',
          '/news/{id}',
          '/transport',
          '/rentals',
          '/trailers'
        ]
      });
    }
    
    // === NOT FOUND ===
    console.log(`[API] ✗ NOT FOUND: ${path}`);
    return res.status(404).json({
      success: false,
      message: `Endpoint not found: ${path}`,
      availableEndpoints: [
        '/service-providers',
        '/service-providers/{id}',
        '/dealers',
        '/dealers/{id}',
        '/listings',
        '/listings/{id}',
        '/listings/dealer/{dealerId}',
        '/news',
        '/news/{id}',
        '/transport',
        '/rentals',
        '/trailers'
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
