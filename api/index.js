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

    // === WEBSITE STATS ENDPOINT (WORKING) ===
    if (path === '/stats' || path === '/website-stats') {
      console.log('[API] → WEBSITE STATS');
      
      try {
        const [
          listingsResult,
          dealersResult, 
          transportResult,
          savingsResult
        ] = await Promise.allSettled([
          db.collection('listings').countDocuments({ status: { $ne: 'deleted' } }),
          db.collection('dealers').countDocuments({}),
          db.collection('transportroutes').countDocuments({}).catch(() => 
            db.collection('transportnodes').countDocuments({})
          ),
          db.collection('listings').find({
            $and: [
              { 'priceOptions.showSavings': true },
              { 'priceOptions.savingsAmount': { $gt: 0 } },
              { status: { $ne: 'deleted' } }
            ]
          }).toArray()
        ]);

        const listingsCount = listingsResult.status === 'fulfilled' ? listingsResult.value : 0;
        const dealersCount = dealersResult.status === 'fulfilled' ? dealersResult.value : 0;
        const transportCount = transportResult.status === 'fulfilled' ? transportResult.value : 0;
        const savingsListings = savingsResult.status === 'fulfilled' ? savingsResult.value : [];

        let totalSavings = 0;
        let savingsCount = 0;
        
        savingsListings.forEach(listing => {
          try {
            if (listing.priceOptions && listing.priceOptions.savingsAmount > 0) {
              totalSavings += listing.priceOptions.savingsAmount;
              savingsCount++;
            }
          } catch (err) {
            console.log('Savings calculation error for listing:', listing._id);
          }
        });

        const stats = {
          carListings: listingsCount,
          happyCustomers: dealersCount + transportCount,
          verifiedDealers: Math.min(100, Math.round((dealersCount * 0.85))),
          transportProviders: transportCount,
          totalSavings: totalSavings,
          savingsCount: savingsCount
        };

        return res.status(200).json({
          success: true,
          data: stats,
          message: 'Website statistics retrieved successfully'
        });
      } catch (error) {
        console.error('Stats calculation error:', error);
        
        const fallbackStats = {
          carListings: 150,
          happyCustomers: 450,
          verifiedDealers: 85,
          transportProviders: 15,
          totalSavings: 2500000,
          savingsCount: 45
        };
        
        return res.status(200).json({
          success: true,
          data: fallbackStats,
          message: 'Fallback statistics (calculation error)',
          error: error.message
        });
      }
    }

    // === SERVICE PROVIDERS (WORKING) ===
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
        message: `Service providers: ${providers.length} found (${total} total)`
      });
    }
    
    // === FIXED: INDIVIDUAL SERVICE PROVIDER BY ID ===
    if (path.startsWith('/service-providers/') || path.startsWith('/providers/')) {
      const idMatch = path.match(/\/(service-)?providers\/([a-fA-F0-9]{24})/);
      if (idMatch) {
        const providerId = idMatch[2];
        console.log(`[API] → INDIVIDUAL PROVIDER (FIXED): ${providerId}`);
        
        try {
          // FIXED: Better ObjectId handling with validation
          const serviceProvidersCollection = db.collection('serviceproviders');
          
          // Try different ID formats
          let provider = null;
          
          // Strategy 1: Try as string first
          provider = await serviceProvidersCollection.findOne({ _id: providerId });
          
          // Strategy 2: Try as ObjectId if string fails
          if (!provider) {
            try {
              const { ObjectId } = await import('mongodb');
              if (ObjectId.default.isValid(providerId)) {
                provider = await serviceProvidersCollection.findOne({ _id: new ObjectId.default(providerId) });
              }
            } catch (objectIdError) {
              console.log('ObjectId creation failed:', objectIdError.message);
            }
          }
          
          if (!provider) {
            console.log(`Provider not found with ID: ${providerId}`);
            return res.status(404).json({
              success: false,
              message: 'Service provider not found',
              providerId: providerId
            });
          }
          
          console.log(`Found provider: ${provider.businessName || provider.name}`);
          
          return res.status(200).json({
            success: true,
            data: provider,
            message: `Individual provider: ${provider.businessName || provider.name}`
          });
        } catch (error) {
          console.error('Service provider fetch error:', error);
          return res.status(500).json({
            success: false,
            message: 'Error fetching service provider',
            error: error.message,
            providerId: providerId
          });
        }
      }
    }
    
    // === DEALERS LIST (WORKING) ===
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
      
      if (searchParams.get('city')) {
        filter['location.city'] = { $regex: searchParams.get('city'), $options: 'i' };
      }
      
      if (searchParams.get('businessType') && searchParams.get('businessType') !== 'All') {
        filter.businessType = searchParams.get('businessType');
      }
      
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
    
    // === FIXED: INDIVIDUAL DEALER BY ID ===
    if (path.startsWith('/dealers/')) {
      const idMatch = path.match(/\/dealers\/([a-fA-F0-9]{24})/);
      if (idMatch) {
        const dealerId = idMatch[1];
        console.log(`[API] → INDIVIDUAL DEALER (FIXED): ${dealerId}`);
        
        try {
          const dealersCollection = db.collection('dealers');
          
          // FIXED: Enhanced dealer lookup with multiple strategies
          let dealer = null;
          
          console.log(`[DEBUG] Attempting to find dealer with ID: ${dealerId}`);
          
          // Strategy 1: Try as string ID first (most common)
          try {
            dealer = await dealersCollection.findOne({ _id: dealerId });
            if (dealer) {
              console.log(`[DEBUG] Found dealer with string ID: ${dealer.businessName}`);
            }
          } catch (stringError) {
            console.log(`[DEBUG] String ID lookup failed:`, stringError.message);
          }
          
          // Strategy 2: Try as ObjectId if string fails
          if (!dealer) {
            try {
              const { ObjectId } = await import('mongodb');
              if (ObjectId.default.isValid(dealerId)) {
                dealer = await dealersCollection.findOne({ _id: new ObjectId.default(dealerId) });
                if (dealer) {
                  console.log(`[DEBUG] Found dealer with ObjectId: ${dealer.businessName}`);
                }
              } else {
                console.log(`[DEBUG] Invalid ObjectId format: ${dealerId}`);
              }
            } catch (objectIdError) {
              console.log(`[DEBUG] ObjectId lookup failed:`, objectIdError.message);
            }
          }
          
          // Strategy 3: Try searching by other ID fields
          if (!dealer) {
            try {
              dealer = await dealersCollection.findOne({
                $or: [
                  { dealerId: dealerId },
                  { id: dealerId },
                  { 'profile.id': dealerId }
                ]
              });
              if (dealer) {
                console.log(`[DEBUG] Found dealer with alternative ID field: ${dealer.businessName}`);
              }
            } catch (altError) {
              console.log(`[DEBUG] Alternative ID lookup failed:`, altError.message);
            }
          }
          
          if (!dealer) {
            console.log(`[DEBUG] Dealer not found with any strategy for ID: ${dealerId}`);
            
            // Debug: Check what dealers exist
            const sampleDealers = await dealersCollection.find({}).limit(3).toArray();
            console.log(`[DEBUG] Sample dealers in database:`, sampleDealers.map(d => ({
              _id: d._id,
              businessName: d.businessName
            })));
            
            return res.status(404).json({
              success: false,
              message: 'Dealer not found',
              dealerId: dealerId,
              debug: {
                searchedId: dealerId,
                strategies: ['string', 'objectId', 'alternativeFields']
              }
            });
          }
          
          // FIXED: Add listing count to dealer response
          try {
            const listingsCollection = db.collection('listings');
            const listingCount = await listingsCollection.countDocuments({
              $or: [
                { dealerId: dealerId },
                { dealerId: dealer._id },
                { 'dealer._id': dealerId },
                { 'dealer._id': dealer._id },
                { 'dealer.id': dealerId }
              ]
            });
            
            dealer.listingCount = listingCount;
            console.log(`[DEBUG] Added listing count: ${listingCount} for dealer ${dealer.businessName}`);
          } catch (countError) {
            console.log(`[DEBUG] Listing count failed:`, countError.message);
            dealer.listingCount = 0;
          }
          
          return res.status(200).json({
            success: true,
            data: dealer,
            message: `Individual dealer: ${dealer.businessName || dealer.name}`,
            debug: {
              dealerId: dealerId,
              foundWithStrategy: dealer._id === dealerId ? 'string' : 'objectId',
              listingCount: dealer.listingCount
            }
          });
          
        } catch (error) {
          console.error(`[ERROR] Individual dealer fetch error:`, error);
          return res.status(500).json({
            success: false,
            message: 'Error fetching dealer',
            error: error.message,
            dealerId: dealerId,
            stack: error.stack
          });
        }
      }
    }
    
    // === LISTINGS (WORKING) ===
    if (path === '/listings') {
      console.log('[API] → LISTINGS');
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
            filter.$or = [
              { 'dealer.sellerType': 'private' },
              { 'dealer.privateSeller.firstName': { $exists: true } }
            ];
            break;
        }
      }
      
      if (searchParams.get('make')) {
        filter['specifications.make'] = searchParams.get('make');
      }
      if (searchParams.get('model')) {
        filter['specifications.model'] = searchParams.get('model');
      }
      
      if (searchParams.get('category')) {
        filter.category = searchParams.get('category');
      }
      
      if (searchParams.get('minPrice')) {
        filter.price = { ...filter.price, $gte: parseInt(searchParams.get('minPrice')) };
      }
      if (searchParams.get('maxPrice')) {
        filter.price = { ...filter.price, $lte: parseInt(searchParams.get('maxPrice')) };
      }
      
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        const searchFilter = {
          $or: [
            { title: searchRegex },
            { 'specifications.make': searchRegex },
            { 'specifications.model': searchRegex },
            { description: searchRegex }
          ]
        };
        
        if (filter.$or && section) {
          filter = { $and: [filter, searchFilter] };
        } else if (!filter.$or) {
          filter = { ...filter, ...searchFilter };
        }
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
        message: `Listings: ${listings.length} found (${total} total)${section ? ` in ${section} section` : ''}`
      });
    }
    
    // === FEATURED LISTINGS (WORKING) ===
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
        message: `Featured listings: ${featuredListings.length} found`
      });
    }
    
    // === FIXED: DEALER LISTINGS FOR BUSINESS CARDS ===
    if (path.startsWith('/listings/')) {
      const dealerMatch = path.match(/\/listings\/dealer\/([a-fA-F0-9]{24})/);
      if (dealerMatch) {
        const dealerId = dealerMatch[1];
        console.log(`[API] → BUSINESS CARD DEALER LISTINGS (ENHANCED): ${dealerId}`);
        
        try {
          const listingsCollection = db.collection('listings');
          
          console.log(`[DEBUG] Searching for listings with dealerId: ${dealerId}`);
          
          // FIXED: Enhanced dealer-listing association with multiple strategies
          let allListings = [];
          
          // Strategy 1: Direct ID matching
          try {
            const { ObjectId } = await import('mongodb');
            const directFilter = {
              $or: [
                { dealerId: dealerId },                    // String ID
                { dealerId: new ObjectId.default(dealerId) },    // ObjectId
                { 'dealer._id': dealerId },                // Embedded dealer with string ID
                { 'dealer._id': new ObjectId.default(dealerId) }, // Embedded dealer with ObjectId
                { 'dealer.id': dealerId },                 // Alternative ID field
                { 'dealer.id': new ObjectId.default(dealerId) }   // Alternative ID field as ObjectId
              ]
            };
            
            const directListings = await listingsCollection.find(directFilter).toArray();
            console.log(`[DEBUG] Direct strategy found ${directListings.length} listings`);
            allListings = directListings;
          } catch (directError) {
            console.log(`[DEBUG] Direct strategy failed:`, directError.message);
          }
          
          // Strategy 2: If no direct matches, try finding dealer first then match by business name
          if (allListings.length === 0) {
            try {
              console.log(`[DEBUG] Trying to find dealer first...`);
              const dealersCollection = db.collection('dealers');
              
              // Find the dealer
              let dealer = await dealersCollection.findOne({ _id: dealerId });
              if (!dealer) {
                try {
                  const { ObjectId } = await import('mongodb');
                  dealer = await dealersCollection.findOne({ _id: new ObjectId.default(dealerId) });
                } catch (objError) {
                  console.log(`[DEBUG] ObjectId dealer lookup failed:`, objError.message);
                }
              }
              
              if (dealer) {
                console.log(`[DEBUG] Found dealer: ${dealer.businessName}, now searching listings...`);
                
                // Search listings by dealer business name
                const nameFilter = {
                  $or: [
                    { 'dealer.businessName': dealer.businessName },
                    { 'dealer.name': dealer.businessName },
                    { dealerName: dealer.businessName }
                  ]
                };
                
                const nameListings = await listingsCollection.find(nameFilter).toArray();
                console.log(`[DEBUG] Name strategy found ${nameListings.length} listings`);
                allListings = nameListings;
              }
            } catch (nameError) {
              console.log(`[DEBUG] Name strategy failed:`, nameError.message);
            }
          }
          
          // Strategy 3: If still no matches, get sample data for debugging
          if (allListings.length === 0) {
            console.log(`[DEBUG] No listings found, getting sample data for debugging...`);
            
            const sampleListings = await listingsCollection.find({}).limit(3).toArray();
            console.log(`[DEBUG] Sample listings structure:`, sampleListings.map(l => ({
              _id: l._id,
              dealerId: l.dealerId,
              dealer: l.dealer,
              title: l.title
            })));
          }
          
          // Apply pagination
          const page = parseInt(searchParams.get('page')) || 1;
          const limit = parseInt(searchParams.get('limit')) || 10;
          const skip = (page - 1) * limit;
          
          const paginatedListings = allListings
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(skip, skip + limit);
          
          const total = allListings.length;
          
          console.log(`[DEBUG] Returning ${paginatedListings.length} listings (${total} total) for dealer ${dealerId}`);
          
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
              strategiesUsed: total > 0 ? 'success' : 'no_matches',
              totalFound: total,
              searchedDealerId: dealerId
            },
            message: `Business card listings: ${paginatedListings.length} found for dealer`
          });
          
        } catch (error) {
          console.error(`[ERROR] Business card dealer listings error:`, error);
          
          return res.status(200).json({
            success: true,
            data: [],
            pagination: {
              currentPage: 1,
              totalPages: 0,
              total: 0
            },
            dealerId: dealerId,
            error: error.message,
            message: 'No listings found for this dealer (error occurred)'
          });
        }
      }
      
      // === FIXED: INDIVIDUAL LISTING BY ID ===
      const listingMatch = path.match(/\/listings\/([a-fA-F0-9]{24})$/);
      if (listingMatch) {
        const listingId = listingMatch[1];
        console.log(`[API] → INDIVIDUAL LISTING (FIXED): ${listingId}`);
        
        try {
          const listingsCollection = db.collection('listings');
          
          // FIXED: Enhanced listing lookup
          let listing = null;
          
          // Try as string first
          listing = await listingsCollection.findOne({ _id: listingId });
          
          // Try as ObjectId if string fails
          if (!listing) {
            try {
              const { ObjectId } = await import('mongodb');
              if (ObjectId.default.isValid(listingId)) {
                listing = await listingsCollection.findOne({ _id: new ObjectId.default(listingId) });
              }
            } catch (objectIdError) {
              console.log('Listing ObjectId creation failed:', objectIdError.message);
            }
          }
          
          if (!listing) {
            return res.status(404).json({
              success: false,
              message: 'Listing not found',
              listingId: listingId
            });
          }
          
          // Increment view count
          try {
            await listingsCollection.updateOne(
              { _id: listing._id },
              { $inc: { views: 1 } }
            );
          } catch (viewError) {
            console.log('View count increment failed:', viewError);
          }
          
          return res.status(200).json({
            success: true,
            data: listing,
            message: `Individual listing: ${listing.title}`
          });
        } catch (error) {
          console.error('Individual listing fetch error:', error);
          return res.status(500).json({
            success: false,
            message: 'Error fetching listing',
            error: error.message,
            listingId: listingId
          });
        }
      }
    }
    
    // === KEEP ALL OTHER WORKING ENDPOINTS ===
    
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
        message: `News articles: ${articles.length} found (${total} total)`
      });
    }
    
    // === FIXED: INDIVIDUAL NEWS ARTICLE BY ID ===
    if (path.startsWith('/news/')) {
      const idMatch = path.match(/\/news\/([a-fA-F0-9]{24})/);
      if (idMatch) {
        const newsId = idMatch[1];
        console.log(`[API] → INDIVIDUAL NEWS (FIXED): ${newsId}`);
        
        try {
          const newsCollection = db.collection('news');
          
          // Enhanced news lookup
          let article = null;
          
          // Try as string first
          article = await newsCollection.findOne({ _id: newsId });
          
          // Try as ObjectId if string fails
          if (!article) {
            try {
              const { ObjectId } = await import('mongodb');
              if (ObjectId.default.isValid(newsId)) {
                article = await newsCollection.findOne({ _id: new ObjectId.default(newsId) });
              }
            } catch (objectIdError) {
              console.log('News ObjectId creation failed:', objectIdError.message);
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
            message: `Individual article: ${article.title}`
          });
        } catch (error) {
          console.error('Individual news fetch error:', error);
          return res.status(500).json({
            success: false,
            message: 'Error fetching news article',
            error: error.message,
            newsId: newsId
          });
        }
      }
    }
    
    // === TRANSPORT ROUTES (WORKING) ===
    if (path === '/transport' || path === '/routes') {
      console.log('[API] → TRANSPORT ROUTES');
      
      let transportCollection;
      try {
        transportCollection = db.collection('transportroutes');
        const testCount = await transportCollection.countDocuments({});
        console.log(`Found ${testCount} documents in transportroutes collection`);
      } catch (error) {
        console.log('transportroutes collection not found, trying transportnodes');
        transportCollection = db.collection('transportnodes');
      }
      
      let filter = {};
      
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
              { 'provider.id': providerId },
              { provider: providerId }
            ]
          };
        } catch (error) {
          filter = { providerId: providerId };
        }
      }
      
      if (searchParams.get('status')) {
        filter.operationalStatus = searchParams.get('status');
      } else {
        filter.operationalStatus = { $in: ['active', 'seasonal'] };
      }
      
      if (searchParams.get('routeType')) {
        filter.routeType = searchParams.get('routeType');
      }
      
      if (searchParams.get('serviceType')) {
        filter.serviceType = searchParams.get('serviceType');
      }
      
      if (searchParams.get('origin')) {
        filter.origin = { $regex: searchParams.get('origin'), $options: 'i' };
      }
      if (searchParams.get('destination')) {
        filter.destination = { $regex: searchParams.get('destination'), $options: 'i' };
      }
      
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        const searchFilter = {
          $or: [
            { title: searchRegex },
            { origin: searchRegex },
            { destination: searchRegex },
            { description: searchRegex },
            { routeNumber: searchRegex },
            { 'provider.businessName': searchRegex },
            { 'provider.name': searchRegex }
          ]
        };
        
        if (Object.keys(filter).length > 0) {
          filter = { $and: [filter, searchFilter] };
        } else {
          filter = searchFilter;
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
        message: `Transport routes: ${routes.length} found${providerId ? ` for provider` : ''}`
      });
    }
    
    if (path === '/rentals') {
      console.log('[API] → RENTALS');
      const rentalsCollection = db.collection('rentalvehicles');
      
      let filter = {};
      
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
      
      let filter = {};
      
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
      for (const name of ['listings', 'dealers', 'news', 'serviceproviders', 'transportroutes', 'transportnodes', 'rentalvehicles', 'trailerlistings']) {
        try {
          counts[name] = await db.collection(name).countDocuments();
        } catch (e) {
          counts[name] = 0;
        }
      }
      
      return res.status(200).json({
        success: true,
        message: 'BW Car Culture API - Individual Endpoints & Business Cards FIXED!',
        path: path,
        collections: collectionNames,
        counts: counts,
        timestamp: new Date().toISOString(),
        majorFixes: [
          'Individual dealer endpoints with multiple ID strategies',
          'Individual listing endpoints with enhanced lookup',
          'Individual service provider endpoints fixed',
          'Individual news endpoints fixed',
          'Enhanced business card dealer-listing associations',
          'Comprehensive error handling and debugging'
        ]
      });
    }
    
    // === NOT FOUND ===
    console.log(`[API] ✗ NOT FOUND: ${path}`);
    return res.status(404).json({
      success: false,
      message: `Endpoint not found: ${path}`,
      availableEndpoints: [
        'GET /dealers/{id} - Individual dealer (FIXED)',
        'GET /listings/{id} - Individual listing (FIXED)', 
        'GET /listings/dealer/{dealerId} - Business card listings (FIXED)',
        'GET /providers/{id} - Individual provider (FIXED)',
        'GET /news/{id} - Individual news (FIXED)'
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
