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

    // === AUTHENTICATION ENDPOINTS ===
    
    // Login endpoint
    if (path === '/auth/login' && req.method === 'POST') {
      console.log('[API] → AUTH LOGIN');
      
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
        return res.status(400).json({
          success: false,
          message: 'Invalid request body'
        });
      }

      const { email, password } = body;
      
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Please provide email and password'
        });
      }

      const usersCollection = db.collection('users');
      const user = await usersCollection.findOne({ email });
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }
      
      // Simple password check (in production, use bcrypt)
      if (user.password !== password) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }
      
      // Generate a simple token (in production, use JWT)
      const token = `token_${user._id}_${Date.now()}`;
      
      return res.status(200).json({
        success: true,
        token,
        user: {
          id: user._id,
          name: user.name || user.fullName,
          email: user.email,
          role: user.role || 'user'
        }
      });
    }
    
    // Get current user (auth/me)
    if (path === '/auth/me' && req.method === 'GET') {
      console.log('[API] → AUTH ME');
      
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          message: 'No token provided'
        });
      }
      
      const token = authHeader.substring(7);
      
      // Simple token validation (extract user ID)
      const tokenParts = token.split('_');
      if (tokenParts.length < 2) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
      }
      
      const userId = tokenParts[1];
      
      try {
        const { ObjectId } = await import('mongodb');
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ _id: new ObjectId.default(userId) });
        
        if (!user) {
          return res.status(401).json({
            success: false,
            message: 'User not found'
          });
        }
        
        return res.status(200).json({
          success: true,
          data: {
            id: user._id,
            name: user.name || user.fullName,
            email: user.email,
            role: user.role || 'user'
          }
        });
      } catch (error) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token format'
        });
      }
    }

    // === ENHANCED DEALERS ENDPOINT ===
    
    if (path === '/dealers') {
      console.log('[API] → DEALERS');
      const dealersCollection = db.collection('dealers');
      
      // Build filter
      let filter = {};
      
      // Seller type filtering (dealership vs private)
      if (searchParams.get('sellerType')) {
        filter.sellerType = searchParams.get('sellerType');
        console.log(`[API] Filtering by sellerType: ${searchParams.get('sellerType')}`);
      }
      
      // Search filtering
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        filter.$or = [
          { businessName: searchRegex },
          { 'profile.description': searchRegex },
          { 'location.city': searchRegex },
          { 'privateSeller.firstName': searchRegex },
          { 'privateSeller.lastName': searchRegex }
        ];
        console.log(`[API] Dealer search: ${searchParams.get('search')}`);
      }
      
      // Business type filtering (only for dealerships)
      if (searchParams.get('businessType') && searchParams.get('businessType') !== 'all') {
        filter.$and = [
          { sellerType: 'dealership' },
          { businessType: searchParams.get('businessType') }
        ];
      }
      
      // Subscription status filtering
      if (searchParams.get('subscriptionStatus') && searchParams.get('subscriptionStatus') !== 'all') {
        filter['subscription.status'] = searchParams.get('subscriptionStatus');
      }
      
      // Status filtering
      if (searchParams.get('status') && searchParams.get('status') !== 'all') {
        filter.status = searchParams.get('status');
      }
      
      // City filtering
      if (searchParams.get('city')) {
        filter['location.city'] = { $regex: searchParams.get('city'), $options: 'i' };
      }
      
      // Pagination
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      // Sort
      let sort = { createdAt: -1 };
      if (searchParams.get('sort')) {
        switch (searchParams.get('sort')) {
          case 'businessName':
            sort = { businessName: 1 };
            break;
          case '-createdAt':
            sort = { createdAt: -1 };
            break;
          case 'createdAt':
            sort = { createdAt: 1 };
            break;
        }
      }
      
      const dealers = await dealersCollection.find(filter)
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .toArray();
      
      const total = await dealersCollection.countDocuments(filter);
      
      // Calculate listing counts for each dealer
      const listingsCollection = db.collection('listings');
      for (const dealer of dealers) {
        try {
          const listingCount = await listingsCollection.countDocuments({
            $or: [
              { dealerId: dealer._id.toString() },
              { 'dealer.id': dealer._id.toString() },
              { 'dealer._id': dealer._id.toString() }
            ]
          });
          dealer.listingCount = listingCount;
        } catch (error) {
          dealer.listingCount = 0;
        }
      }
      
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
    
    // Get all dealers for dropdown (simplified)
    if (path === '/dealers/all') {
      console.log('[API] → DEALERS ALL');
      const dealersCollection = db.collection('dealers');
      
      const dealers = await dealersCollection.find({ status: 'active' })
        .select('businessName profile.logo verification.status sellerType privateSeller businessType')
        .sort({ businessName: 1 })
        .toArray();
      
      // Process dealers for dropdown format
      const processedDealers = dealers.map(dealer => ({
        _id: dealer._id,
        businessName: dealer.businessName,
        name: dealer.businessName,
        logo: dealer.profile?.logo,
        sellerType: dealer.sellerType || 'dealership',
        businessType: dealer.businessType,
        privateSeller: dealer.privateSeller,
        verification: {
          isVerified: dealer.verification?.status === 'verified'
        },
        displayName: dealer.sellerType === 'private' && dealer.privateSeller
          ? `${dealer.privateSeller.firstName} ${dealer.privateSeller.lastName}`
          : dealer.businessName
      }));
      
      return res.status(200).json({
        success: true,
        count: processedDealers.length,
        data: processedDealers
      });
    }

    // === ENHANCED LISTINGS ENDPOINT ===
    
    if (path === '/listings') {
      console.log('[API] → LISTINGS');
      const listingsCollection = db.collection('listings');
      
      // Build filter
      let filter = {};
      
      // Default to active listings for public
      filter.status = 'active';
      
      // Location-based filtering
      if (searchParams.get('location')) {
        const locationRegex = { $regex: searchParams.get('location'), $options: 'i' };
        filter.$or = [
          { 'location.city': locationRegex },
          { 'location.state': locationRegex },
          { 'location.country': locationRegex },
          { 'dealer.location.city': locationRegex },
          { 'dealer.location.state': locationRegex }
        ];
      }
      
      // City-specific filtering
      if (searchParams.get('city')) {
        const cityRegex = { $regex: searchParams.get('city'), $options: 'i' };
        if (filter.$or) {
          filter.$or.push(
            { 'location.city': cityRegex },
            { 'dealer.location.city': cityRegex }
          );
        } else {
          filter.$or = [
            { 'location.city': cityRegex },
            { 'dealer.location.city': cityRegex }
          ];
        }
      }
      
      // Savings-based filtering
      if (searchParams.get('hasSavings') === 'true') {
        filter['priceOptions.showSavings'] = true;
        filter['priceOptions.savingsAmount'] = { $gt: 0 };
      }
      
      if (searchParams.get('minSavings')) {
        filter['priceOptions.savingsAmount'] = { 
          ...(filter['priceOptions.savingsAmount'] || {}),
          $gte: Number(searchParams.get('minSavings')) 
        };
      }
      
      if (searchParams.get('exclusiveOnly') === 'true') {
        filter['priceOptions.exclusiveDeal'] = true;
      }
      
      // Price range filtering
      if (searchParams.get('minPrice') || searchParams.get('maxPrice')) {
        filter.price = {};
        if (searchParams.get('minPrice')) filter.price.$gte = Number(searchParams.get('minPrice'));
        if (searchParams.get('maxPrice')) filter.price.$lte = Number(searchParams.get('maxPrice'));
      }
      
      // Make/Model filtering
      if (searchParams.get('make')) {
        filter['specifications.make'] = { $regex: searchParams.get('make'), $options: 'i' };
      }
      if (searchParams.get('model')) {
        filter['specifications.model'] = { $regex: searchParams.get('model'), $options: 'i' };
      }
      
      // Year range filtering
      if (searchParams.get('minYear') || searchParams.get('maxYear')) {
        filter['specifications.year'] = {};
        if (searchParams.get('minYear')) filter['specifications.year'].$gte = Number(searchParams.get('minYear'));
        if (searchParams.get('maxYear')) filter['specifications.year'].$lte = Number(searchParams.get('maxYear'));
      }
      
      // Category filtering
      if (searchParams.get('category')) {
        filter.category = { $regex: searchParams.get('category'), $options: 'i' };
      }
      
      // Condition filtering
      if (searchParams.get('condition')) {
        filter.condition = searchParams.get('condition');
      }
      
      // Text search
      if (searchParams.get('search')) {
        filter.$text = { $search: searchParams.get('search') };
      }
      
      // Pagination
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      // Sort - prioritize savings if requested
      let sort = { createdAt: -1 };
      if (searchParams.get('sort')) {
        const sortBy = searchParams.get('sort').split(',').join(' ');
        if (sortBy.includes('priceOptions.savingsAmount')) {
          sort = { 'priceOptions.savingsAmount': -1, createdAt: -1 };
        } else {
          sort = { [sortBy.replace('-', '')]: sortBy.startsWith('-') ? -1 : 1 };
        }
      } else if (filter['priceOptions.showSavings'] || filter['priceOptions.savingsAmount']) {
        sort = { 'priceOptions.savingsAmount': -1, createdAt: -1 };
      }
      
      const listings = await listingsCollection.find(filter)
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .toArray();
      
      const total = await listingsCollection.countDocuments(filter);
      
      return res.status(200).json({
        success: true,
        count: listings.length,
        total,
        pagination: {
          next: skip + limit < total ? { page: page + 1, limit } : null,
          prev: skip > 0 ? { page: page - 1, limit } : null
        },
        data: listings
      });
    }
    
    // Featured listings
    if (path === '/listings/featured') {
      console.log('[API] → FEATURED LISTINGS');
      const listingsCollection = db.collection('listings');
      
      const limit = parseInt(searchParams.get('limit')) || 6;
      
      const listings = await listingsCollection.find({ 
        featured: true, 
        status: 'active' 
      })
      .limit(limit)
      .sort({ createdAt: -1 })
      .toArray();
      
      return res.status(200).json({
        success: true,
        count: listings.length,
        data: listings
      });
    }
    
    // Listings with savings
    if (path === '/listings/savings') {
      console.log('[API] → LISTINGS WITH SAVINGS');
      const listingsCollection = db.collection('listings');
      
      const limit = parseInt(searchParams.get('limit')) || 10;
      const page = parseInt(searchParams.get('page')) || 1;
      const skip = (page - 1) * limit;
      
      const query = {
        'priceOptions.showSavings': true,
        'priceOptions.savingsAmount': { $gt: 0 },
        status: 'active'
      };
      
      // Optional filters
      if (searchParams.get('minSavings')) {
        query['priceOptions.savingsAmount'] = { 
          ...query['priceOptions.savingsAmount'],
          $gte: Number(searchParams.get('minSavings')) 
        };
      }
      
      if (searchParams.get('minPercentage')) {
        query['priceOptions.savingsPercentage'] = { $gte: Number(searchParams.get('minPercentage')) };
      }
      
      if (searchParams.get('exclusiveOnly') === 'true') {
        query['priceOptions.exclusiveDeal'] = true;
      }
      
      const total = await listingsCollection.countDocuments(query);
      
      const listings = await listingsCollection.find(query)
        .sort({ 'priceOptions.savingsAmount': -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
      
      return res.status(200).json({
        success: true,
        count: listings.length,
        total,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          total
        },
        data: listings
      });
    }

    // === ENHANCED NEWS ENDPOINT ===
    
    if (path === '/news') {
      console.log('[API] → NEWS');
      const newsCollection = db.collection('news');
      
      let query = {};
      
      // Category filter
      if (searchParams.get('category') && searchParams.get('category') !== 'all') {
        query.category = searchParams.get('category');
      }
      
      // Status filter for production
      if (process.env.NODE_ENV === 'production') {
        query.status = 'published';
        query.publishDate = { $lte: new Date() };
      }
      
      // Text search
      if (searchParams.get('search')) {
        query.$text = { $search: searchParams.get('search') };
      }
      
      // Date range
      if (searchParams.get('startDate') || searchParams.get('endDate')) {
        query.publishDate = {};
        if (searchParams.get('startDate')) {
          query.publishDate.$gte = new Date(searchParams.get('startDate'));
        }
        if (searchParams.get('endDate')) {
          query.publishDate.$lte = new Date(searchParams.get('endDate'));
        }
      }
      
      // Tags filter
      if (searchParams.get('tags')) {
        const tags = searchParams.get('tags').split(',').map(tag => tag.trim());
        query.tags = { $in: tags };
      }
      
      // Pagination
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      const total = await newsCollection.countDocuments(query);
      
      // Sorting
      let sort = { publishDate: -1, createdAt: -1 };
      if (searchParams.get('sort')) {
        const sortBy = searchParams.get('sort').split(',').join(' ');
        sort = { [sortBy.replace('-', '')]: sortBy.startsWith('-') ? -1 : 1 };
      }
      
      const articles = await newsCollection.find(query)
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .toArray();
      
      return res.status(200).json({
        success: true,
        count: articles.length,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          total
        },
        data: articles
      });
    }
    
    // Featured news
    if (path === '/news/featured') {
      console.log('[API] → FEATURED NEWS');
      const newsCollection = db.collection('news');
      
      const limit = parseInt(searchParams.get('limit')) || 5;
      
      const query = process.env.NODE_ENV === 'production' 
        ? { featured: true, status: 'published', publishDate: { $lte: new Date() } }
        : { featured: true };
      
      const articles = await newsCollection.find(query)
        .sort({ publishDate: -1, createdAt: -1 })
        .limit(limit)
        .toArray();
      
      return res.status(200).json({
        success: true,
        count: articles.length,
        data: articles
      });
    }
    
    // Latest news
    if (path === '/news/latest') {
      console.log('[API] → LATEST NEWS');
      const newsCollection = db.collection('news');
      
      const limit = parseInt(searchParams.get('limit')) || 6;
      
      const query = process.env.NODE_ENV === 'production'
        ? { status: 'published', publishDate: { $lte: new Date() } }
        : {};
      
      const articles = await newsCollection.find(query)
        .sort({ publishDate: -1, createdAt: -1 })
        .limit(limit)
        .toArray();
      
      return res.status(200).json({
        success: true,
        count: articles.length,
        data: articles
      });
    }

    // Continue with existing endpoints from Step 3...
    // (Service providers, transport, rentals, etc. - keeping them as they were working)
    
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

    // Individual endpoints from Step 2...
    // (Keep all the individual item endpoints that were working)
    
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
          
          // Increment view count
          try {
            await listingsCollection.updateOne(
              { _id: new ObjectId.default(listingId) },
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
          return res.status(500).json({
            success: false,
            message: 'Error fetching listing',
            error: error.message
          });
        }
      }
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
          
          // Increment view count
          try {
            await newsCollection.updateOne(
              { _id: new ObjectId.default(newsId) },
              { $inc: { 'metadata.views': 1 } }
            );
          } catch (viewError) {
            console.log('News view count increment failed:', viewError);
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

    // Keep existing transport, rentals, trailers endpoints...
    
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
    
    // === ANALYTICS ENDPOINTS ===
    if (path.includes('analytics')) {
      console.log('[API] → ANALYTICS');
      
      // Track page view
      if (path === '/analytics/track' && req.method === 'POST') {
        let body = {};
        try {
          const chunks = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          const rawBody = Buffer.concat(chunks).toString();
          body = JSON.parse(rawBody);
        } catch (e) {
          console.log('Analytics body parse error:', e);
        }
        
        // Store analytics event (simplified)
        const analyticsCollection = db.collection('analytics');
        try {
          await analyticsCollection.insertOne({
            ...body,
            timestamp: new Date(),
            ip: req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
            userAgent: req.headers['user-agent']
          });
        } catch (error) {
          console.log('Analytics storage error:', error);
        }
        
        return res.status(200).json({
          success: true,
          message: 'Event tracked successfully'
        });
      }
      
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

      const { fullName, email, password, role } = body;
      
      if (!fullName || !email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Please provide all required fields'
        });
      }
      
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
        name: fullName,
        email,
        password, // In production, hash this
        role: role || 'user',
        status: role === 'admin' ? 'pending' : 'active',
        createdAt: new Date()
      };
      
      const result = await usersCollection.insertOne(newUser);
      
      return res.status(201).json({
        success: true,
        message: role === 'admin' ? 
          'Admin registration successful! Please wait for approval.' :
          'Registration successful!',
        user: {
          id: result.insertedId,
          fullName,
          email,
          role: role || 'user'
        }
      });
    }
    
    // === TEST/HEALTH ===
    if (path === '/test-db' || path === '/health' || path === '/' || path === '/api/health') {
      console.log('[API] → TEST/HEALTH');
      
      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);
      
      const counts = {};
      for (const name of ['listings', 'dealers', 'news', 'serviceproviders', 'transportnodes', 'rentalvehicles', 'trailerlistings', 'users', 'analytics']) {
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
        features: [
          'Authentication (login/register)',
          'Enhanced Dealers (seller types, subscriptions)',
          'Advanced Listings (savings, filtering)',
          'News System (categories, featured)',
          'Analytics Tracking',
          'Business Card Provider Filtering',
          'Individual Item Endpoints'
        ]
      });
    }
    
    // === NOT FOUND ===
    console.log(`[API] ✗ NOT FOUND: ${path}`);
    return res.status(404).json({
      success: false,
      message: `Endpoint not found: ${path}`,
      availableEndpoints: [
        'POST /auth/login',
        'POST /auth/register', 
        'GET /auth/me',
        'GET /dealers?sellerType=private&search=name',
        'GET /dealers/all',
        'GET /listings?hasSavings=true&city=gaborone',
        'GET /listings/featured',
        'GET /listings/savings',
        'GET /news?category=automotive',
        'GET /news/featured',
        'GET /service-providers?providerType=workshop',
        'GET /transport?providerId=123',
        'GET /rentals?providerId=123',
        'POST /analytics/track'
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
