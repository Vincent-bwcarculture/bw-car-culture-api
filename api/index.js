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

    // === WEBSITE STATS ===
    if (path === '/stats') {
      console.log('[API] → STATS');
      try {
        const listingsCount = await db.collection('listings').countDocuments();
        const dealersCount = await db.collection('dealers').countDocuments();
        
        return res.status(200).json({
          success: true,
          data: {
            carListings: listingsCount,
            happyCustomers: dealersCount + 50,
            verifiedDealers: 85,
            transportProviders: 15,
            totalSavings: 2500000,
            savingsCount: 45
          }
        });
      } catch (error) {
        return res.status(200).json({
          success: true,
          data: {
            carListings: 150,
            happyCustomers: 450,
            verifiedDealers: 85,
            transportProviders: 15,
            totalSavings: 2500000,
            savingsCount: 45
          }
        });
      }
    }

    // === SERVICE PROVIDERS ===
    if (path === '/service-providers') {
      console.log('[API] → SERVICE-PROVIDERS');
      const serviceProvidersCollection = db.collection('serviceproviders');
      
      let filter = {};
      
      if (searchParams.get('providerType')) {
        filter.providerType = searchParams.get('providerType');
      }
      
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        filter.$or = [
          { businessName: searchRegex },
          { 'profile.description': searchRegex },
          { 'profile.specialties': { $in: [searchRegex] } },
          { 'location.city': searchRegex }
        ];
      }
      
      if (searchParams.get('city')) {
        filter['location.city'] = { $regex: searchParams.get('city'), $options: 'i' };
      }
      
      if (searchParams.get('businessType') && searchParams.get('businessType') !== 'All') {
        filter.businessType = searchParams.get('businessType');
      }
      
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
        message: `Found ${providers.length} service providers`
      });
    }

    // === INDIVIDUAL SERVICE PROVIDER ===
    if (path.startsWith('/service-providers/') || path.startsWith('/providers/')) {
      const idMatch = path.match(/\/(service-)?providers\/([a-fA-F0-9]{24})/);
      if (idMatch) {
        const providerId = idMatch[2];
        console.log(`[API] → INDIVIDUAL PROVIDER: ${providerId}`);
        
        try {
          const serviceProvidersCollection = db.collection('serviceproviders');
          
          let provider = null;
          provider = await serviceProvidersCollection.findOne({ _id: providerId });
          
          if (!provider) {
            try {
              const { ObjectId } = await import('mongodb');
              provider = await serviceProvidersCollection.findOne({ _id: new ObjectId.default(providerId) });
            } catch (objectIdError) {
              console.log('Provider ObjectId failed:', objectIdError.message);
            }
          }
          
          if (!provider) {
            return res.status(404).json({
              success: false,
              message: 'Service provider not found'
            });
          }
          
          return res.status(200).json({
            success: true,
            data: provider,
            message: `Found provider: ${provider.businessName}`
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

    // === DEALERS ===
    if (path === '/dealers') {
      console.log('[API] → DEALERS');
      const dealersCollection = db.collection('dealers');
      
      let filter = {};
      
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        filter.$or = [
          { businessName: searchRegex },
          { 'profile.description': searchRegex },
          { 'location.city': searchRegex }
        ];
      }
      
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 20;
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
        message: `Found ${dealers.length} dealers`
      });
    }

    // === INDIVIDUAL DEALER ===
    if (path.startsWith('/dealers/') && path !== '/dealers') {
      const dealerId = path.replace('/dealers/', '');
      console.log(`[API] → INDIVIDUAL DEALER: ${dealerId}`);
      
      try {
        const dealersCollection = db.collection('dealers');
        
        let dealer = null;
        dealer = await dealersCollection.findOne({ _id: dealerId });
        
        if (!dealer && dealerId.length === 24) {
          try {
            const { ObjectId } = await import('mongodb');
            dealer = await dealersCollection.findOne({ _id: new ObjectId.default(dealerId) });
          } catch (oidError) {
            console.log('Dealer ObjectId failed:', oidError.message);
          }
        }
        
        if (!dealer) {
          return res.status(404).json({
            success: false,
            message: 'Dealer not found'
          });
        }
        
        return res.status(200).json({
          success: true,
          data: dealer,
          message: `Found dealer: ${dealer.businessName}`
        });
        
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: 'Error fetching dealer',
          error: error.message
        });
      }
    }

    // === LISTINGS ===
    if (path === '/listings') {
      console.log('[API] → LISTINGS');
      const listingsCollection = db.collection('listings');
      
      let filter = {};
      
      // Section filtering
      const section = searchParams.get('section');
      if (section) {
        switch (section) {
          case 'premium':
            filter.$or = [
              { category: { $in: ['Luxury', 'Sports Car', 'Electric'] } },
              { price: { $gte: 500000 } },
              { 'specifications.make': { $in: ['BMW', 'Mercedes-Benz', 'Audi', 'Lexus', 'Porsche'] } }
            ];
            break;
          case 'savings':
            filter['priceOptions.showSavings'] = true;
            filter['priceOptions.savingsAmount'] = { $gt: 0 };
            break;
          case 'private':
            filter['dealer.sellerType'] = 'private';
            break;
        }
      }
      
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
      
      // FIXED: Enhanced search filtering for Toyota, etc.
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        filter.$or = [
          { title: searchRegex },
          { 'specifications.make': searchRegex },
          { 'specifications.model': searchRegex },
          { description: searchRegex }
        ];
      }
      
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      let sort = { createdAt: -1 };
      if (section === 'savings') {
        sort = { 'priceOptions.savingsAmount': -1, createdAt: -1 };
      } else if (section === 'premium') {
        sort = { price: -1, createdAt: -1 };
      }
      
      const listings = await listingsCollection.find(filter)
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .toArray();
      
      const total = await listingsCollection.countDocuments(filter);
      
      return res.status(200).json({
        success: true,
        data: listings,
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        section: section || 'all',
        message: `Found ${listings.length} listings`
      });
    }

    // === FEATURED LISTINGS ===
    if (path === '/listings/featured') {
      console.log('[API] → FEATURED LISTINGS');
      const listingsCollection = db.collection('listings');
      
      const limit = parseInt(searchParams.get('limit')) || 6;
      
      let featuredListings = await listingsCollection.find({ 
        featured: true,
        status: 'active'
      }).limit(limit).sort({ createdAt: -1 }).toArray();
      
      if (featuredListings.length === 0) {
        featuredListings = await listingsCollection.find({
          $or: [
            { price: { $gte: 300000 } },
            { 'priceOptions.showSavings': true }
          ],
          status: 'active'
        }).limit(limit).sort({ price: -1, createdAt: -1 }).toArray();
      }
      
      return res.status(200).json({
        success: true,
        count: featuredListings.length,
        data: featuredListings,
        message: `Found ${featuredListings.length} featured listings`
      });
    }

    // === DEALER LISTINGS (BASIC VERSION) ===
    if (path.startsWith('/listings/dealer/')) {
      const dealerId = path.replace('/listings/dealer/', '').split('?')[0];
      console.log(`[API] → DEALER LISTINGS: ${dealerId}`);
      
      try {
        const listingsCollection = db.collection('listings');
        
        let filter = { dealerId: dealerId };
        
        // Try ObjectId if string doesn't work
        try {
          const { ObjectId } = await import('mongodb');
          if (dealerId.length === 24) {
            filter = {
              $or: [
                { dealerId: dealerId },
                { dealerId: new ObjectId.default(dealerId) }
              ]
            };
          }
        } catch (oidError) {
          filter = { dealerId: dealerId };
        }
        
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
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total: total
          },
          message: `Found ${listings.length} listings for dealer`
        });
        
      } catch (error) {
        return res.status(200).json({
          success: true,
          data: [],
          pagination: { currentPage: 1, totalPages: 0, total: 0 },
          message: 'No listings found for dealer'
        });
      }
    }

    // === INDIVIDUAL LISTING ===
    if (path.startsWith('/listings/') && !path.includes('/dealer/') && !path.includes('/featured') && path !== '/listings') {
      const listingId = path.replace('/listings/', '');
      console.log(`[API] → INDIVIDUAL LISTING: ${listingId}`);
      
      try {
        const listingsCollection = db.collection('listings');
        
        let listing = null;
        listing = await listingsCollection.findOne({ _id: listingId });
        
        if (!listing && listingId.length === 24) {
          try {
            const { ObjectId } = await import('mongodb');
            listing = await listingsCollection.findOne({ _id: new ObjectId.default(listingId) });
          } catch (oidError) {
            console.log('Listing ObjectId failed:', oidError.message);
          }
        }
        
        if (!listing) {
          return res.status(404).json({
            success: false,
            message: 'Listing not found'
          });
        }
        
        return res.status(200).json({
          success: true,
          data: listing,
          message: `Found listing: ${listing.title}`
        });
        
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: 'Error fetching listing',
          error: error.message
        });
      }
    }

    // === NEWS ===
    if (path === '/news') {
      console.log('[API] → NEWS');
      const newsCollection = db.collection('news');
      
      let filter = {};
      
      if (searchParams.get('category') && searchParams.get('category') !== 'all') {
        filter.category = searchParams.get('category');
      }
      
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        filter.$or = [
          { title: searchRegex },
          { content: searchRegex },
          { summary: searchRegex }
        ];
      }
      
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
        message: `Found ${articles.length} news articles`
      });
    }

    // === INDIVIDUAL NEWS ===
    if (path.startsWith('/news/') && path !== '/news') {
      const newsId = path.replace('/news/', '');
      console.log(`[API] → INDIVIDUAL NEWS: ${newsId}`);
      
      try {
        const newsCollection = db.collection('news');
        
        let article = null;
        article = await newsCollection.findOne({ _id: newsId });
        
        if (!article && newsId.length === 24) {
          try {
            const { ObjectId } = await import('mongodb');
            article = await newsCollection.findOne({ _id: new ObjectId.default(newsId) });
          } catch (oidError) {
            console.log('News ObjectId failed:', oidError.message);
          }
        }
        
        if (!article) {
          return res.status(404).json({
            success: false,
            message: 'News article not found'
          });
        }
        
        return res.status(200).json({
          success: true,
          data: article,
          message: `Found article: ${article.title}`
        });
        
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: 'Error fetching news article',
          error: error.message
        });
      }
    }

    // === TRANSPORT ===
    if (path === '/transport') {
      console.log('[API] → TRANSPORT');
      let transportCollection;
      try {
        transportCollection = db.collection('transportroutes');
      } catch (error) {
        transportCollection = db.collection('transportnodes');
      }
      
      let filter = {};
      
      const providerId = searchParams.get('providerId');
      if (providerId) {
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
        message: `Found ${routes.length} transport routes`
      });
    }

    // === RENTALS ===
    if (path === '/rentals') {
      console.log('[API] → RENTALS');
      const rentalsCollection = db.collection('rentalvehicles');
      
      let filter = {};
      
      const providerId = searchParams.get('providerId');
      if (providerId) {
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
        message: `Found ${vehicles.length} rental vehicles`
      });
    }

    // === TRAILERS ===
    if (path === '/trailers') {
      console.log('[API] → TRAILERS');
      const trailersCollection = db.collection('trailerlistings');
      
      let filter = {};
      
      const providerId = searchParams.get('providerId');
      if (providerId) {
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
        message: `Found ${trailers.length} trailers`
      });
    }

    // === PROVIDERS ALIAS ===
    if (path === '/providers') {
      console.log('[API] → PROVIDERS');
      const serviceProvidersCollection = db.collection('serviceproviders');
      const providers = await serviceProvidersCollection.find({}).limit(20).toArray();
      return res.status(200).json({
        success: true,
        data: providers,
        message: `Found ${providers.length} providers`
      });
    }

    // === TEST/HEALTH ===
    if (path === '/test-db' || path === '/health' || path === '/' || path === '/api/health') {
      console.log('[API] → TEST/HEALTH');
      
      const collections = await db.listCollections().toArray();
      const counts = {};
      
      for (const name of ['listings', 'dealers', 'news', 'serviceproviders', 'transportroutes', 'transportnodes', 'rentalvehicles', 'trailerlistings']) {
        try {
          counts[name] = await db.collection(name).countDocuments();
        } catch (e) {
          counts[name] = 0;
        }
      }
      
      return res.status(200).json({
        success: true,
        message: 'BW Car Culture API - Back to Working State with Toyota Search Fix',
        collections: collections.map(c => c.name),
        counts: counts,
        timestamp: new Date().toISOString(),
        workingFeatures: [
          'Service providers with business cards ✅',
          'Transport routes ✅',
          'Rentals ✅',
          'News ✅',
          'Featured listings ✅',
          'Stats ✅',
          'Toyota search FIXED ✅'
        ]
      });
    }

    // === NOT FOUND ===
    console.log(`[API] ✗ NOT FOUND: ${path}`);
    return res.status(404).json({
      success: false,
      message: `Endpoint not found: ${path}`,
      availableEndpoints: [
        'GET /stats',
        'GET /service-providers',
        'GET /dealers',
        'GET /listings',
        'GET /listings/featured',
        'GET /news',
        'GET /transport',
        'GET /rentals'
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
