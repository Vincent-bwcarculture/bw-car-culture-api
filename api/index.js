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
    const searchParams = url.searchParams;
    
    console.log(`[API] Processing: ${path}`);

    // === EXACT MATCHES WITH FILTERING (FROM STEP 3) ===
    
    if (path === '/service-providers') {
      console.log('[API] → SERVICE-PROVIDERS');
      const serviceProvidersCollection = db.collection('serviceproviders');
      
      // Build filter
      let filter = {};
      
      // Provider type filtering (for ServicesPage)
      if (searchParams.get('providerType')) {
        filter.providerType = searchParams.get('providerType');
        console.log(`[API] Filtering by providerType: ${searchParams.get('providerType')}`);
      }
      
      // Search filtering
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        filter.$or = [
          { businessName: searchRegex },
          { 'profile.description': searchRegex },
          { 'profile.specialties': { $in: [searchRegex] } },
          { 'location.city': searchRegex }
        ];
        console.log(`[API] Search filter: ${searchParams.get('search')}`);
      }
      
      // City filtering
      if (searchParams.get('city')) {
        filter['location.city'] = { $regex: searchParams.get('city'), $options: 'i' };
      }
      
      // Business type filtering  
      if (searchParams.get('businessType') && searchParams.get('businessType') !== 'All') {
        filter.businessType = searchParams.get('businessType');
      }
      
      // Pagination
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 12;
      const skip = (page - 1) * limit;
      
      const providers = await serviceProvidersCollection.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ businessName: 1 })
        .toArray();
      
      const total = await serviceProvidersCollection.countDocuments(filter);
      
      return res.status(200).json({
        success: true,
        data: providers,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          total: total
        },
        message: `Service providers: ${providers.length} found (${total} total)`
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
      
      // Build filter
      let filter = {};
      
      // Search filtering
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        filter.$or = [
          { businessName: searchRegex },
          { 'profile.description': searchRegex },
          { 'location.city': searchRegex }
        ];
        console.log(`[API] Dealer search: ${searchParams.get('search')}`);
      }
      
      // City filtering
      if (searchParams.get('city')) {
        filter['location.city'] = { $regex: searchParams.get('city'), $options: 'i' };
      }
      
      // Business type filtering
      if (searchParams.get('businessType') && searchParams.get('businessType') !== 'All') {
        filter.businessType = searchParams.get('businessType');
      }
      
      // Pagination
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 9;
      const skip = (page - 1) * limit;
      
      const dealers = await dealersCollection.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ businessName: 1 })
        .toArray();
      
      const total = await dealersCollection.countDocuments(filter);
      
      return res.status(200).json({
        success: true,
        data: dealers,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          total: total
        },
        message: `Dealers: ${dealers.length} found (${total} total)`
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
      
      // Build filter
      let filter = {};
      
      // Make/Model filtering
      if (searchParams.get('make')) {
        filter['specifications.make'] = searchParams.get('make');
      }
      if (searchParams.get('model')) {
        filter['specifications.model'] = searchParams.get('model');
      }
      
      // Category filtering
      if (searchParams.get('category')) {
        filter.category = searchParams.get('category');
      }
      
      // Price range filtering
      if (searchParams.get('minPrice')) {
        filter.price = { ...filter.price, $gte: parseInt(searchParams.get('minPrice')) };
      }
      if (searchParams.get('maxPrice')) {
        filter.price = { ...filter.price, $lte: parseInt(searchParams.get('maxPrice')) };
      }
      
      // Search filtering
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        filter.$or = [
          { title: searchRegex },
          { 'specifications.make': searchRegex },
          { 'specifications.model': searchRegex },
          { description: searchRegex }
        ];
        console.log(`[API] Listings search: ${searchParams.get('search')}`);
      }
      
      // Pagination
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
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
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        message: `Listings: ${listings.length} found (${total} total)`
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
          
          // Pagination for dealer listings
          const page = parseInt(searchParams.get('page')) || 1;
          const limit = parseInt(searchParams.get('limit')) || 12;
          const skip = (page - 1) * limit;
          
          const listings = await listingsCollection.find(filter)
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 })
            .toArray();
          
          const total = await listingsCollection.countDocuments(filter);
          
          return res.status(200).json({
            success: true,
            data: listings,
            pagination: {
              currentPage: page,
              totalPages: Math.ceil(total / limit),
              total: total
            },
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
      
      // Build filter
      let filter = {};
      
      // Category filtering
      if (searchParams.get('category') && searchParams.get('category') !== 'all') {
        filter.category = searchParams.get('category');
      }
      
      // Search filtering
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        filter.$or = [
          { title: searchRegex },
          { content: searchRegex },
          { summary: searchRegex }
        ];
        console.log(`[API] News search: ${searchParams.get('search')}`);
      }
      
      // Pagination
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      const articles = await newsCollection.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ publishedAt: -1, createdAt: -1 })
        .toArray();
      
      const total = await newsCollection.countDocuments(filter);
      
      return res.status(200).json({
        success: true,
        data: articles,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          total: total
        },
        message: `News articles: ${articles.length} found (${total} total)`
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
      
      // Build filter (for BusinessGallery providerId filtering)
      let filter = {};
      
      // Provider ID filtering (for business cards)
      const providerId = searchParams.get('providerId');
      if (providerId) {
        console.log(`[API] Filtering transport by providerId: ${providerId}`);
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
      
      // Search filtering
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        const searchFilter = {
          $or: [
            { origin: searchRegex },
            { destination: searchRegex },
            { title: searchRegex },
            { description: searchRegex }
          ]
        };
        
        if (Object.keys(filter).length > 0) {
          filter = { $and: [filter, searchFilter] };
        } else {
          filter = searchFilter;
        }
      }
      
      // Pagination
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      const routes = await transportCollection.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .toArray();
      
      const total = await transportCollection.countDocuments(filter);
      
      return res.status(200).json({
        success: true,
        data: routes,
        routes: routes,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        message: `Transport routes: ${routes.length} found${providerId ? ` for provider` : ''}`
      });
    }
    
    if (path === '/rentals') {
      console.log('[API] → RENTALS');
      const rentalsCollection = db.collection('rentalvehicles');
      
      // Build filter (for BusinessGallery providerId filtering)
      let filter = {};
      
      // Provider ID filtering (for business cards)
      const providerId = searchParams.get('providerId');
      if (providerId) {
        console.log(`[API] Filtering rentals by providerId: ${providerId}`);
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
      
      // Search filtering
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        const searchFilter = {
          $or: [
            { name: searchRegex },
            { 'specifications.make': searchRegex },
            { 'specifications.model': searchRegex },
            { description: searchRegex }
          ]
        };
        
        if (Object.keys(filter).length > 0) {
          filter = { $and: [filter, searchFilter] };
        } else {
          filter = searchFilter;
        }
      }
      
      // Pagination
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      const vehicles = await rentalsCollection.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .toArray();
      
      const total = await rentalsCollection.countDocuments(filter);
      
      return res.status(200).json({
        success: true,
        data: vehicles,
        vehicles: vehicles,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        message: `Rental vehicles: ${vehicles.length} found${providerId ? ` for provider` : ''}`
      });
    }
    
    if (path === '/trailers') {
      console.log('[API] → TRAILERS');
      const trailersCollection = db.collection('trailerlistings');
      
      // Build filter (for BusinessGallery providerId filtering)
      let filter = {};
      
      // Provider ID filtering (for business cards)
      const providerId = searchParams.get('providerId');
      if (providerId) {
        console.log(`[API] Filtering trailers by providerId: ${providerId}`);
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
      
      // Search filtering
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        const searchFilter = {
          $or: [
            { title: searchRegex },
            { description: searchRegex },
            { type: searchRegex }
          ]
        };
        
        if (Object.keys(filter).length > 0) {
          filter = { $and: [filter, searchFilter] };
        } else {
          filter = searchFilter;
        }
      }
      
      // Pagination
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      const trailers = await trailersCollection.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .toArray();
      
      const total = await trailersCollection.countDocuments(filter);
      
      return res.status(200).json({
        success: true,
        data: trailers,
        trailers: trailers,
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        message: `Trailers: ${trailers.length} found${providerId ? ` for provider` : ''}`
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
          '/service-providers?providerType=workshop&search=BMW',
          '/dealers?search=capital&city=gaborone',
          '/listings?make=toyota&minPrice=100000',
          '/news?category=automotive&search=bmw',
          '/transport?providerId=123',
          '/rentals?providerId=123',
          '/trailers?providerId=123'
        ]
      });
    }
    
    // === NOT FOUND ===
    console.log(`[API] ✗ NOT FOUND: ${path}`);
    return res.status(404).json({
      success: false,
      message: `Endpoint not found: ${path}`,
      availableEndpoints: [
        '/service-providers?providerType=workshop',
        '/dealers?search=name',
        '/listings?make=toyota&model=camry',
        '/news?category=automotive',
        '/transport?providerId=123',
        '/rentals?providerId=123',
        '/trailers?providerId=123'
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
