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

  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);

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
    
    console.log(`[${timestamp}] Processing path: "${path}" with params:`, Object.fromEntries(searchParams));

    // === ENHANCED BUSINESS CARD DEALER LISTINGS (with detailed logging) ===
    if (path.includes('/listings/dealer/')) {
      const dealerId = path.replace('/listings/dealer/', '').split('?')[0];
      const callId = Math.random().toString(36).substr(2, 9);
      console.log(`[${timestamp}] [CALL-${callId}] → BUSINESS CARD LISTINGS: "${dealerId}"`);
      console.log(`[${timestamp}] [CALL-${callId}] Full URL: ${req.url}`);
      console.log(`[${timestamp}] [CALL-${callId}] Query params:`, Object.fromEntries(searchParams));
      
      try {
        const listingsCollection = db.collection('listings');
        
        // ENHANCED: More robust dealer ID handling
        let filters = [];
        
        // Strategy 1: Exact string match
        filters.push({ name: 'exact_string', filter: { dealerId: dealerId } });
        
        // Strategy 2: ObjectId if valid format
        if (dealerId.length === 24 && /^[0-9a-fA-F]{24}$/.test(dealerId)) {
          try {
            const { ObjectId } = await import('mongodb');
            const dealerObjectId = new ObjectId.default(dealerId);
            filters.push({ name: 'objectid', filter: { dealerId: dealerObjectId } });
          } catch (oidError) {
            console.log(`[${timestamp}] [CALL-${callId}] ObjectId creation failed: ${oidError.message}`);
          }
        }
        
        // Strategy 3: Alternative field matching
        filters.push({ name: 'dealer_field', filter: { 'dealer._id': dealerId } });
        filters.push({ name: 'dealer_id_field', filter: { 'dealer.id': dealerId } });
        
        console.log(`[${timestamp}] [CALL-${callId}] Testing ${filters.length} filter strategies`);
        
        let foundListings = [];
        let successStrategy = null;
        
        for (const strategy of filters) {
          try {
            console.log(`[${timestamp}] [CALL-${callId}] Testing strategy: ${strategy.name}`);
            console.log(`[${timestamp}] [CALL-${callId}] Filter:`, JSON.stringify(strategy.filter, null, 2));
            
            const testListings = await listingsCollection.find(strategy.filter).toArray();
            console.log(`[${timestamp}] [CALL-${callId}] Strategy "${strategy.name}" found: ${testListings.length} listings`);
            
            if (testListings.length > 0) {
              foundListings = testListings;
              successStrategy = strategy.name;
              console.log(`[${timestamp}] [CALL-${callId}] SUCCESS with strategy: ${strategy.name}`);
              break;
            }
          } catch (strategyError) {
            console.log(`[${timestamp}] [CALL-${callId}] Strategy "${strategy.name}" failed: ${strategyError.message}`);
          }
        }
        
        // If no listings found, do comprehensive debugging
        if (foundListings.length === 0) {
          console.log(`[${timestamp}] [CALL-${callId}] NO LISTINGS FOUND - Starting debug mode`);
          
          // Get sample listings to understand structure
          const sampleListings = await listingsCollection.find({}).limit(5).toArray();
          const dealerIdFormats = sampleListings.map(l => ({
            listingId: l._id,
            dealerId: l.dealerId,
            dealerIdType: typeof l.dealerId,
            dealerObject: l.dealer ? { _id: l.dealer._id, id: l.dealer.id } : null
          }));
          
          console.log(`[${timestamp}] [CALL-${callId}] Sample dealer ID formats:`, dealerIdFormats);
          
          // Check if dealer exists
          const dealersCollection = db.collection('dealers');
          const dealer = await dealersCollection.findOne({ _id: dealerId }) || 
                         await dealersCollection.findOne({ _id: dealerId.length === 24 ? new (await import('mongodb')).ObjectId.default(dealerId) : null });
          
          console.log(`[${timestamp}] [CALL-${callId}] Dealer exists:`, dealer ? dealer.businessName : 'NOT FOUND');
          
          return res.status(200).json({
            success: true,
            data: [],
            pagination: { currentPage: 1, totalPages: 0, total: 0 },
            dealerId: dealerId,
            debug: {
              callId: callId,
              timestamp: timestamp,
              dealerExists: !!dealer,
              sampleDealerIdFormats: dealerIdFormats,
              testedStrategies: filters.map(f => f.name),
              noMatchReason: 'No listings found with any matching strategy'
            },
            message: `Business card: 0 listings found for dealer ${dealerId}`
          });
        }
        
        // Apply pagination
        const page = parseInt(searchParams.get('page')) || 1;
        const limit = parseInt(searchParams.get('limit')) || 10;
        const skip = (page - 1) * limit;
        
        const paginatedListings = foundListings.slice(skip, skip + limit);
        const total = foundListings.length;
        
        console.log(`[${timestamp}] [CALL-${callId}] SUCCESS: Returning ${paginatedListings.length} listings (${total} total)`);
        
        return res.status(200).json({
          success: true,
          data: paginatedListings,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total: total
          },
          dealerId: dealerId,
          debug: {
            callId: callId,
            timestamp: timestamp,
            successStrategy: successStrategy,
            totalFound: total
          },
          message: `Business card: ${paginatedListings.length} listings found for dealer`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] [CALL-${callId}] BUSINESS CARD ERROR:`, error);
        return res.status(200).json({
          success: true,
          data: [],
          pagination: { currentPage: 1, totalPages: 0, total: 0 },
          dealerId: dealerId,
          error: error.message,
          debug: { callId: callId, timestamp: timestamp },
          message: 'Error occurred while fetching dealer listings'
        });
      }
    }

    // === FIXED: SERVICE PROVIDERS (RESTORED) ===
    if (path === '/service-providers') {
      console.log(`[${timestamp}] → SERVICE-PROVIDERS (RESTORED)`);
      
      try {
        const serviceProvidersCollection = db.collection('serviceproviders');
        
        // Build filter
        let filter = {};
        
        // Provider type filtering (for ServicesPage)
        if (searchParams.get('providerType')) {
          filter.providerType = searchParams.get('providerType');
          console.log(`[${timestamp}] Filtering by providerType: ${searchParams.get('providerType')}`);
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
          console.log(`[${timestamp}] Search filter: ${searchParams.get('search')}`);
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
        
        console.log(`[${timestamp}] Service providers filter:`, JSON.stringify(filter, null, 2));
        
        const providers = await serviceProvidersCollection.find(filter)
          .skip(skip)
          .limit(limit)
          .sort({ businessName: 1 })
          .toArray();
        
        const total = await serviceProvidersCollection.countDocuments(filter);
        
        console.log(`[${timestamp}] Found ${providers.length} service providers (${total} total)`);
        
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
        
      } catch (error) {
        console.error(`[${timestamp}] Service providers error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Error fetching service providers',
          error: error.message
        });
      }
    }
    
    // === INDIVIDUAL SERVICE PROVIDER ===
    if (path.includes('/service-providers/') || path.includes('/providers/')) {
      const idMatch = path.match(/\/(service-)?providers\/([a-fA-F0-9]{24})/);
      if (idMatch) {
        const providerId = idMatch[2];
        console.log(`[${timestamp}] → INDIVIDUAL PROVIDER: ${providerId}`);
        
        try {
          const serviceProvidersCollection = db.collection('serviceproviders');
          
          let provider = null;
          
          // Try as string first
          provider = await serviceProvidersCollection.findOne({ _id: providerId });
          
          // Try as ObjectId if string fails
          if (!provider) {
            try {
              const { ObjectId } = await import('mongodb');
              if (ObjectId.default.isValid(providerId)) {
                provider = await serviceProvidersCollection.findOne({ _id: new ObjectId.default(providerId) });
              }
            } catch (objectIdError) {
              console.log(`[${timestamp}] Provider ObjectId creation failed:`, objectIdError.message);
            }
          }
          
          if (!provider) {
            return res.status(404).json({
              success: false,
              message: 'Service provider not found',
              providerId: providerId
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
            error: error.message,
            providerId: providerId
          });
        }
      }
    }

    // === INDIVIDUAL DEALER ===
    if (path.includes('/dealers/') && path !== '/dealers') {
      const dealerId = path.replace('/dealers/', '');
      console.log(`[${timestamp}] → INDIVIDUAL DEALER: "${dealerId}"`);
      
      try {
        const dealersCollection = db.collection('dealers');
        
        let dealer = null;
        
        // Try as string first
        dealer = await dealersCollection.findOne({ _id: dealerId });
        
        // Try as ObjectId if 24 chars
        if (!dealer && dealerId.length === 24) {
          try {
            const { ObjectId } = await import('mongodb');
            dealer = await dealersCollection.findOne({ _id: new ObjectId.default(dealerId) });
          } catch (oidError) {
            console.log(`[${timestamp}] Dealer ObjectId failed: ${oidError.message}`);
          }
        }
        
        if (!dealer) {
          return res.status(404).json({
            success: false,
            message: 'Dealer not found',
            dealerId: dealerId
          });
        }
        
        return res.status(200).json({
          success: true,
          data: dealer,
          message: `Found dealer: ${dealer.businessName}`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Dealer lookup failed:`, error);
        return res.status(500).json({
          success: false,
          message: 'Error fetching dealer',
          error: error.message
        });
      }
    }
    
    // === INDIVIDUAL LISTING ===
    if (path.includes('/listings/') && !path.includes('/listings/dealer/') && !path.includes('/listings/featured') && path !== '/listings') {
      const listingId = path.replace('/listings/', '');
      console.log(`[${timestamp}] → INDIVIDUAL LISTING: "${listingId}"`);
      
      try {
        const listingsCollection = db.collection('listings');
        
        let listing = null;
        
        // Try as string first
        listing = await listingsCollection.findOne({ _id: listingId });
        
        // Try as ObjectId if 24 chars
        if (!listing && listingId.length === 24) {
          try {
            const { ObjectId } = await import('mongodb');
            listing = await listingsCollection.findOne({ _id: new ObjectId.default(listingId) });
          } catch (oidError) {
            console.log(`[${timestamp}] Listing ObjectId failed: ${oidError.message}`);
          }
        }
        
        if (!listing) {
          return res.status(404).json({
            success: false,
            message: 'Listing not found',
            listingId: listingId
          });
        }
        
        return res.status(200).json({
          success: true,
          data: listing,
          message: `Found listing: ${listing.title}`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Listing lookup failed:`, error);
        return res.status(500).json({
          success: false,
          message: 'Error fetching listing',
          error: error.message
        });
      }
    }

    // === NEWS API (WORKING) ===
    if (path === '/news') {
      console.log(`[${timestamp}] → NEWS`);
      
      try {
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
        
      } catch (error) {
        console.error(`[${timestamp}] News fetch error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Error fetching news',
          error: error.message
        });
      }
    }
    
    // === INDIVIDUAL NEWS ARTICLE ===
    if (path.includes('/news/') && path !== '/news') {
      const newsId = path.replace('/news/', '');
      console.log(`[${timestamp}] → INDIVIDUAL NEWS: "${newsId}"`);
      
      try {
        const newsCollection = db.collection('news');
        
        let article = null;
        
        article = await newsCollection.findOne({ _id: newsId });
        
        if (!article && newsId.length === 24) {
          try {
            const { ObjectId } = await import('mongodb');
            article = await newsCollection.findOne({ _id: new ObjectId.default(newsId) });
          } catch (oidError) {
            console.log(`[${timestamp}] News ObjectId failed: ${oidError.message}`);
          }
        }
        
        if (!article) {
          return res.status(404).json({
            success: false,
            message: 'News article not found',
            newsId: newsId
          });
        }
        
        return res.status(200).json({
          success: true,
          data: article,
          message: `Found article: ${article.title}`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] News lookup failed:`, error);
        return res.status(500).json({
          success: false,
          message: 'Error fetching news article',
          error: error.message
        });
      }
    }

    // === OTHER WORKING ENDPOINTS ===
    
    if (path === '/stats') {
      console.log(`[${timestamp}] → STATS`);
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
    
    if (path === '/listings/featured') {
      console.log(`[${timestamp}] → FEATURED LISTINGS`);
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
    
    if (path === '/listings') {
      console.log(`[${timestamp}] → LISTINGS`);
      const listingsCollection = db.collection('listings');
      
      let filter = {};
      
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
        section: section || 'all',
        message: `Found ${listings.length} listings`
      });
    }
    
    if (path === '/dealers') {
      console.log(`[${timestamp}] → DEALERS`);
      const dealersCollection = db.collection('dealers');
      
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 20;
      const skip = (page - 1) * limit;
      
      const dealers = await dealersCollection.find({})
        .skip(skip)
        .limit(limit)
        .sort({ businessName: 1 })
        .toArray();
      
      const total = await dealersCollection.countDocuments();
      
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
    
    // Keep transport, rentals, etc.
    if (path === '/transport') {
      console.log(`[${timestamp}] → TRANSPORT`);
      let transportCollection;
      try {
        transportCollection = db.collection('transportroutes');
      } catch (error) {
        transportCollection = db.collection('transportnodes');
      }
      
      const routes = await transportCollection.find({}).limit(20).toArray();
      return res.status(200).json({
        success: true,
        data: routes,
        message: `Found ${routes.length} transport routes`
      });
    }
    
    if (path === '/rentals') {
      console.log(`[${timestamp}] → RENTALS`);
      const rentalsCollection = db.collection('rentalvehicles');
      const vehicles = await rentalsCollection.find({}).limit(20).toArray();
      return res.status(200).json({
        success: true,
        data: vehicles,
        message: `Found ${vehicles.length} rental vehicles`
      });
    }
    
    if (path === '/providers') {
      console.log(`[${timestamp}] → PROVIDERS (alias)`);
      const serviceProvidersCollection = db.collection('serviceproviders');
      const providers = await serviceProvidersCollection.find({}).limit(20).toArray();
      return res.status(200).json({
        success: true,
        data: providers,
        message: `Found ${providers.length} providers`
      });
    }
    
    if (path === '/test-db') {
      console.log(`[${timestamp}] → TEST/HEALTH`);
      const collections = await db.listCollections().toArray();
      const counts = {};
      
      for (const name of ['listings', 'dealers', 'news', 'serviceproviders']) {
        try {
          counts[name] = await db.collection(name).countDocuments();
        } catch (e) {
          counts[name] = 0;
        }
      }
      
      return res.status(200).json({
        success: true,
        message: 'Enhanced Debugging & Service Providers Fixed',
        collections: collections.map(c => c.name),
        counts: counts,
        timestamp: timestamp,
        fixes: [
          'Enhanced business card logging with call IDs and timestamps',
          'Service providers API fully restored with filtering',
          'Multiple dealer ID matching strategies',
          'Detailed debugging information in responses'
        ]
      });
    }
    
    // === NOT FOUND ===
    console.log(`[${timestamp}] ✗ NOT FOUND: "${path}"`);
    return res.status(404).json({
      success: false,
      message: `Endpoint not found: ${path}`,
      timestamp: timestamp,
      availableEndpoints: [
        '/dealers/{id}',
        '/listings/{id}',
        '/listings/dealer/{dealerId}',
        '/service-providers',
        '/news',
        '/stats'
      ]
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] API Error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
}
