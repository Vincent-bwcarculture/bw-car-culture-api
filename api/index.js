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

    // === WEBSITE STATISTICS ENDPOINT (for HeroSection) ===
    if (path === '/stats' || path === '/website-stats') {
      console.log('[API] → WEBSITE STATS');
      
      try {
        const [
          carListingsCount,
          dealersCount,
          verifiedDealersCount,
          transportProvidersCount,
          newsCount,
          savingsData
        ] = await Promise.all([
          db.collection('listings').countDocuments({ status: 'active' }),
          db.collection('dealers').countDocuments({ status: 'active' }),
          db.collection('dealers').countDocuments({ 'verification.status': 'verified' }),
          db.collection('serviceproviders').countDocuments({ providerType: 'transport' }),
          db.collection('news').countDocuments({ status: 'published' }),
          calculateTotalSavings(db)
        ]);

        const stats = {
          carListings: carListingsCount,
          happyCustomers: dealersCount + transportProvidersCount,
          verifiedDealers: Math.round((verifiedDealersCount / Math.max(dealersCount, 1)) * 100),
          transportProviders: transportProvidersCount,
          totalSavings: savingsData.totalSavings,
          savingsCount: savingsData.savingsCount,
          newsArticles: newsCount
        };

        return res.status(200).json({
          success: true,
          data: stats,
          message: 'Website statistics retrieved successfully'
        });
      } catch (error) {
        console.error('Stats calculation error:', error);
        // Return fallback stats
        return res.status(200).json({
          success: true,
          data: {
            carListings: 150,
            happyCustomers: 450,
            verifiedDealers: 85,
            transportProviders: 15,
            totalSavings: 2500000,
            savingsCount: 45,
            newsArticles: 25
          },
          message: 'Fallback statistics'
        });
      }
    }

    // === MARKETPLACE SECTIONS ENDPOINT (for MarketplaceFilters) ===
    if (path === '/listings') {
      console.log('[API] → LISTINGS WITH SECTIONS');
      const listingsCollection = db.collection('listings');
      
      // Build base filter
      let filter = { status: 'active' };
      
      // Section-based filtering (from MarketplaceFilters)
      const section = searchParams.get('section');
      if (section) {
        switch (section) {
          case 'premium':
            filter.$or = [
              { category: { $in: ['Luxury', 'Sports Car', 'Electric'] } },
              { price: { $gte: 500000 } },
              { 'specifications.make': { $in: ['BMW', 'Mercedes-Benz', 'Audi', 'Lexus', 'Porsche', 'Ferrari', 'Lamborghini'] } }
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
          case 'all':
          default:
            // No additional filter for 'all'
            break;
        }
      }

      // Apply other filters from MarketplaceFilters
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
        
        if (filter.$or) {
          filter = { $and: [filter, searchFilter] };
        } else {
          filter = { ...filter, ...searchFilter };
        }
      }

      // Dealer/Seller filtering
      if (searchParams.get('dealerId')) {
        const dealerFilter = {
          $or: [
            { dealerId: searchParams.get('dealerId') },
            { 'dealer._id': searchParams.get('dealerId') },
            { 'dealer.id': searchParams.get('dealerId') }
          ]
        };
        
        if (filter.$and) {
          filter.$and.push(dealerFilter);
        } else {
          filter = { $and: [filter, dealerFilter] };
        }
      }

      // Seller type filtering
      if (searchParams.get('sellerType')) {
        const sellerTypeFilter = { 'dealer.sellerType': searchParams.get('sellerType') };
        
        if (filter.$and) {
          filter.$and.push(sellerTypeFilter);
        } else {
          filter = { $and: [filter, sellerTypeFilter] };
        }
      }

      // Vehicle specifications filtering
      if (searchParams.get('make')) {
        filter['specifications.make'] = { $regex: searchParams.get('make'), $options: 'i' };
      }
      if (searchParams.get('model')) {
        filter['specifications.model'] = { $regex: searchParams.get('model'), $options: 'i' };
      }
      if (searchParams.get('category')) {
        filter.category = { $regex: searchParams.get('category'), $options: 'i' };
      }
      if (searchParams.get('drivetrain')) {
        filter['specifications.drivetrain'] = searchParams.get('drivetrain');
      }

      // Price range filtering
      if (searchParams.get('minPrice') || searchParams.get('maxPrice')) {
        filter.price = {};
        if (searchParams.get('minPrice')) filter.price.$gte = Number(searchParams.get('minPrice'));
        if (searchParams.get('maxPrice')) filter.price.$lte = Number(searchParams.get('maxPrice'));
      }

      // Year range filtering
      if (searchParams.get('minYear') || searchParams.get('maxYear')) {
        filter['specifications.year'] = {};
        if (searchParams.get('minYear')) filter['specifications.year'].$gte = Number(searchParams.get('minYear'));
        if (searchParams.get('maxYear')) filter['specifications.year'].$lte = Number(searchParams.get('maxYear'));
      }

      // Mileage range filtering
      if (searchParams.get('minMileage') || searchParams.get('maxMileage')) {
        filter['specifications.mileage'] = {};
        if (searchParams.get('minMileage')) filter['specifications.mileage'].$gte = Number(searchParams.get('minMileage'));
        if (searchParams.get('maxMileage')) filter['specifications.mileage'].$lte = Number(searchParams.get('maxMileage'));
      }

      // Location filtering
      if (searchParams.get('city')) {
        const cityRegex = { $regex: searchParams.get('city'), $options: 'i' };
        const cityFilter = {
          $or: [
            { 'location.city': cityRegex },
            { 'dealer.location.city': cityRegex }
          ]
        };
        
        if (filter.$and) {
          filter.$and.push(cityFilter);
        } else {
          filter = { $and: [filter, cityFilter] };
        }
      }

      // Availability filtering
      if (searchParams.get('availability')) {
        filter.availability = searchParams.get('availability');
      }

      // Pagination
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 12;
      const skip = (page - 1) * limit;

      // Sort - prioritize savings for savings section
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
        count: listings.length,
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        data: listings,
        section: section || 'all',
        message: `Found ${listings.length} listings in ${section || 'all'} section`
      });
    }

    // === INDIVIDUAL LISTING WITH RELATED DATA (for CarMarketPlace) ===
    if (path.startsWith('/listings/')) {
      // Handle individual listing by ID with related data
      const listingMatch = path.match(/\/listings\/([a-fA-F0-9]{24})$/);
      if (listingMatch) {
        const listingId = listingMatch[1];
        console.log(`[API] → INDIVIDUAL LISTING WITH RELATED: ${listingId}`);
        
        try {
          const { ObjectId } = await import('mongodb');
          const listingsCollection = db.collection('listings');
          
          // Get the main listing
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

          // Get related data in parallel
          const [dealerListings, similarListings, relatedNews] = await Promise.all([
            getDealerListings(db, listing, listingId),
            getSimilarListings(db, listing, listingId),
            getRelatedNews(db, listing)
          ]);

          return res.status(200).json({
            success: true,
            data: {
              listing,
              dealerListings,
              similarListings,
              relatedNews
            },
            message: `Listing details with related content`
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            message: 'Error fetching listing details',
            error: error.message
          });
        }
      }

      // Handle dealer-specific listings
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
            message: `Found ${listings.length} listings for dealer`
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            message: 'Error fetching dealer listings',
            error: error.message
          });
        }
      }
    }

    // === VEHICLE MAKES AND MODELS ENDPOINT (for MarketplaceFilters) ===
    if (path === '/vehicles/makes') {
      console.log('[API] → VEHICLE MAKES');
      const listingsCollection = db.collection('listings');
      
      try {
        const makes = await listingsCollection.distinct('specifications.make', { status: 'active' });
        const cleanMakes = makes.filter(make => make && make.trim()).sort();
        
        return res.status(200).json({
          success: true,
          data: cleanMakes,
          count: cleanMakes.length
        });
      } catch (error) {
        // Fallback makes
        return res.status(200).json({
          success: true,
          data: ['BMW', 'Mercedes-Benz', 'Toyota', 'Honda', 'Ford', 'Audi', 'Nissan', 'Mazda', 'Volkswagen', 'Hyundai'],
          count: 10
        });
      }
    }

    if (path === '/vehicles/models') {
      console.log('[API] → VEHICLE MODELS');
      const make = searchParams.get('make');
      
      if (!make) {
        return res.status(400).json({
          success: false,
          message: 'Make parameter is required'
        });
      }

      const listingsCollection = db.collection('listings');
      
      try {
        const models = await listingsCollection.distinct('specifications.model', {
          'specifications.make': { $regex: make, $options: 'i' },
          status: 'active'
        });
        
        const cleanModels = models.filter(model => model && model.trim()).sort();
        
        return res.status(200).json({
          success: true,
          data: cleanModels,
          count: cleanModels.length,
          make: make
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: 'Error fetching models',
          error: error.message
        });
      }
    }

    // === RENTAL VEHICLES WITH RELATED DATA (for RentalVehicleDetail) ===
    if (path === '/rentals') {
      console.log('[API] → RENTALS');
      const rentalsCollection = db.collection('rentalvehicles');
      
      // Build filter
      let filter = {};
      
      // Provider ID filtering (for business cards and related rentals)
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

      // Category filtering
      if (searchParams.get('category')) {
        filter.category = { $regex: searchParams.get('category'), $options: 'i' };
      }

      // Make filtering
      if (searchParams.get('make')) {
        filter['specifications.make'] = { $regex: searchParams.get('make'), $options: 'i' };
      }

      // Status filtering
      if (searchParams.get('status')) {
        filter.status = searchParams.get('status');
      } else {
        filter.status = 'available'; // Default to available
      }

      // Search filtering
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        const searchFilter = {
          $or: [
            { name: searchRegex },
            { title: searchRegex },
            { 'specifications.make': searchRegex },
            { 'specifications.model': searchRegex },
            { description: searchRegex }
          ]
        };
        
        if (Object.keys(filter).length > 0 && !filter.$or) {
          filter = { $and: [filter, searchFilter] };
        } else if (filter.$or) {
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
        message: `Found ${vehicles.length} rental vehicles${providerId ? ` for provider` : ''}`
      });
    }

    // === INDIVIDUAL RENTAL VEHICLE WITH RELATED DATA ===
    if (path.startsWith('/rentals/')) {
      const rentalMatch = path.match(/\/rentals\/([a-fA-F0-9]{24})$/);
      if (rentalMatch) {
        const rentalId = rentalMatch[1];
        console.log(`[API] → INDIVIDUAL RENTAL WITH RELATED: ${rentalId}`);
        
        try {
          const { ObjectId } = await import('mongodb');
          const rentalsCollection = db.collection('rentalvehicles');
          
          // Get the main rental vehicle
          const vehicle = await rentalsCollection.findOne({ _id: new ObjectId.default(rentalId) });
          
          if (!vehicle) {
            return res.status(404).json({
              success: false,
              message: 'Rental vehicle not found'
            });
          }

          // Get related data in parallel
          const [providerRentals, similarRentals] = await Promise.all([
            getProviderRentals(db, vehicle, rentalId),
            getSimilarRentals(db, vehicle, rentalId)
          ]);

          return res.status(200).json({
            success: true,
            vehicle: vehicle,
            data: {
              vehicle,
              providerRentals,
              similarRentals
            },
            message: 'Rental vehicle details with related content'
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            message: 'Error fetching rental vehicle details',
            error: error.message
          });
        }
      }
    }

    // === KEEP ALL EXISTING ENDPOINTS FROM PREVIOUS VERSION ===
    
    // Authentication endpoints
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
      
      if (!user || user.password !== password) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }
      
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

    // Enhanced dealers endpoint
    if (path === '/dealers') {
      console.log('[API] → DEALERS');
      const dealersCollection = db.collection('dealers');
      
      let filter = {};
      
      if (searchParams.get('sellerType')) {
        filter.sellerType = searchParams.get('sellerType');
      }
      
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        filter.$or = [
          { businessName: searchRegex },
          { 'profile.description': searchRegex },
          { 'location.city': searchRegex },
          { 'privateSeller.firstName': searchRegex },
          { 'privateSeller.lastName': searchRegex }
        ];
      }
      
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      const dealers = await dealersCollection.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ businessName: 1 })
        .toArray();
      
      const total = await dealersCollection.countDocuments(filter);
      
      // Calculate listing counts
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
        message: `Found ${dealers.length} dealers`
      });
    }

    if (path === '/dealers/all') {
      console.log('[API] → DEALERS ALL');
      const dealersCollection = db.collection('dealers');
      
      const dealers = await dealersCollection.find({ status: 'active' })
        .sort({ businessName: 1 })
        .toArray();
      
      const processedDealers = dealers.map(dealer => ({
        _id: dealer._id,
        businessName: dealer.businessName,
        name: dealer.businessName,
        sellerType: dealer.sellerType || 'dealership',
        privateSeller: dealer.privateSeller,
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

    // Service providers endpoints (keep existing)
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
          { 'location.city': searchRegex }
        ];
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

    // Keep existing transport, trailers, news endpoints...
    
    if (path === '/transport') {
      console.log('[API] → TRANSPORT');
      const transportCollection = db.collection('transportnodes');
      
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
        total,
        message: `Found ${routes.length} transport routes`
      });
    }

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
        total,
        message: `Found ${trailers.length} trailers`
      });
    }

    if (path === '/news') {
      console.log('[API] → NEWS');
      const newsCollection = db.collection('news');
      
      let query = {};
      
      if (searchParams.get('category') && searchParams.get('category') !== 'all') {
        query.category = searchParams.get('category');
      }
      
      if (searchParams.get('search')) {
        query.$text = { $search: searchParams.get('search') };
      }
      
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      const articles = await newsCollection.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ publishDate: -1, createdAt: -1 })
        .toArray();
      
      const total = await newsCollection.countDocuments(query);
      
      return res.status(200).json({
        success: true,
        data: articles,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          total
        },
        message: `Found ${articles.length} news articles`
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

    if (path === '/providers') {
      console.log('[API] → PROVIDERS (alias for service-providers)');
      const serviceProvidersCollection = db.collection('serviceproviders');
      const providers = await serviceProvidersCollection.find({}).limit(20).toArray();
      return res.status(200).json({
        success: true,
        data: providers,
        message: `Found ${providers.length} providers`
      });
    }

    // Analytics endpoints
    if (path.includes('analytics')) {
      console.log('[API] → ANALYTICS');
      
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

    // Auth register
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
        password,
        role: role || 'user',
        status: 'active',
        createdAt: new Date()
      };
      
      const result = await usersCollection.insertOne(newUser);
      
      return res.status(201).json({
        success: true,
        message: 'Registration successful!',
        user: {
          id: result.insertedId,
          fullName,
          email,
          role: role || 'user'
        }
      });
    }

    // Test/Health endpoint
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
        message: 'BW Car Culture API Enhanced for Production!',
        path: path,
        collections: collectionNames,
        counts: counts,
        timestamp: new Date().toISOString(),
        newFeatures: [
          'Website Statistics for HeroSection',
          'Section-based Filtering (premium, savings, private)',
          'Individual Listings with Related Content',
          'Vehicle Makes/Models Endpoints',
          'Enhanced Rental Vehicle Details',
          'Mobile-optimized API responses'
        ]
      });
    }

    // Not found
    console.log(`[API] ✗ NOT FOUND: ${path}`);
    return res.status(404).json({
      success: false,
      message: `Endpoint not found: ${path}`,
      availableEndpoints: [
        'GET /stats - Website statistics',
        'GET /listings?section=premium - Section filtering',
        'GET /listings/{id} - Individual listing with related data',
        'GET /vehicles/makes - Available makes',
        'GET /vehicles/models?make=BMW - Models for make',
        'GET /rentals/{id} - Individual rental with related data',
        'GET /dealers/all - All dealers for dropdown',
        'POST /auth/login - User authentication',
        'POST /analytics/track - Event tracking'
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

// Helper functions for related content
async function calculateTotalSavings(db) {
  try {
    const listingsCollection = db.collection('listings');
    const savingsListings = await listingsCollection.find({
      'priceOptions.showSavings': true,
      'priceOptions.savingsAmount': { $gt: 0 }
    }).toArray();

    let totalSavings = 0;
    let savingsCount = 0;

    savingsListings.forEach(listing => {
      if (listing.priceOptions && listing.priceOptions.savingsAmount > 0) {
        totalSavings += listing.priceOptions.savingsAmount;
        savingsCount++;
      }
    });

    return { totalSavings, savingsCount };
  } catch (error) {
    return { totalSavings: 0, savingsCount: 0 };
  }
}

async function getDealerListings(db, listing, currentListingId) {
  try {
    const listingsCollection = db.collection('listings');
    
    // Extract dealer ID
    let dealerId = null;
    if (listing.dealerId) {
      dealerId = listing.dealerId.toString ? listing.dealerId.toString() : listing.dealerId;
    } else if (listing.dealer && listing.dealer._id) {
      dealerId = listing.dealer._id.toString ? listing.dealer._id.toString() : listing.dealer._id;
    }

    if (!dealerId) return [];

    const filter = {
      $and: [
        {
          $or: [
            { dealerId: dealerId },
            { 'dealer._id': dealerId },
            { 'dealer.id': dealerId }
          ]
        },
        {
          _id: { $ne: new (await import('mongodb')).ObjectId.default(currentListingId) }
        }
      ]
    };

    const dealerListings = await listingsCollection.find(filter)
      .limit(3)
      .sort({ createdAt: -1 })
      .toArray();

    return dealerListings;
  } catch (error) {
    console.error('Error fetching dealer listings:', error);
    return [];
  }
}

async function getSimilarListings(db, listing, currentListingId) {
  try {
    const listingsCollection = db.collection('listings');
    
    // Build similarity filters
    let filters = [];
    
    if (listing.specifications?.make) {
      filters.push({ 'specifications.make': listing.specifications.make });
    }
    
    if (listing.category) {
      filters.push({ category: listing.category });
    }
    
    if (listing.price && filters.length === 0) {
      const priceRange = listing.price * 0.3;
      filters.push({
        price: {
          $gte: listing.price - priceRange,
          $lte: listing.price + priceRange
        }
      });
    }

    if (filters.length === 0) return [];

    const filter = {
      $and: [
        { $or: filters },
        { _id: { $ne: new (await import('mongodb')).ObjectId.default(currentListingId) } },
        { status: 'active' }
      ]
    };

    const similarListings = await listingsCollection.find(filter)
      .limit(3)
      .sort({ createdAt: -1 })
      .toArray();

    return similarListings;
  } catch (error) {
    console.error('Error fetching similar listings:', error);
    return [];
  }
}

async function getRelatedNews(db, listing) {
  try {
    const newsCollection = db.collection('news');
    
    // Build tags for related news
    const tags = [];
    if (listing.specifications?.make) tags.push(listing.specifications.make);
    if (listing.specifications?.model) tags.push(listing.specifications.model);
    if (listing.category) tags.push(listing.category);

    if (tags.length === 0) return [];

    const filter = {
      $or: [
        { tags: { $in: tags } },
        { category: listing.category }
      ]
    };

    const relatedNews = await newsCollection.find(filter)
      .limit(3)
      .sort({ publishDate: -1 })
      .toArray();

    return relatedNews;
  } catch (error) {
    console.error('Error fetching related news:', error);
    return [];
  }
}

async function getProviderRentals(db, vehicle, currentVehicleId) {
  try {
    const rentalsCollection = db.collection('rentalvehicles');
    
    let providerId = null;
    if (vehicle.providerId) {
      providerId = vehicle.providerId.toString ? vehicle.providerId.toString() : vehicle.providerId;
    } else if (vehicle.provider && vehicle.provider._id) {
      providerId = vehicle.provider._id.toString ? vehicle.provider._id.toString() : vehicle.provider._id;
    }

    if (!providerId) return [];

    const filter = {
      $and: [
        {
          $or: [
            { providerId: providerId },
            { 'provider._id': providerId },
            { 'provider.id': providerId }
          ]
        },
        {
          _id: { $ne: new (await import('mongodb')).ObjectId.default(currentVehicleId) }
        }
      ]
    };

    const providerRentals = await rentalsCollection.find(filter)
      .limit(3)
      .sort({ createdAt: -1 })
      .toArray();

    return providerRentals;
  } catch (error) {
    console.error('Error fetching provider rentals:', error);
    return [];
  }
}

async function getSimilarRentals(db, vehicle, currentVehicleId) {
  try {
    const rentalsCollection = db.collection('rentalvehicles');
    
    let filters = [];
    
    if (vehicle.category) {
      filters.push({ category: vehicle.category });
    }
    
    if (vehicle.specifications?.make) {
      filters.push({ 'specifications.make': vehicle.specifications.make });
    }
    
    if (vehicle.specifications?.transmission) {
      filters.push({ 'specifications.transmission': vehicle.specifications.transmission });
    }

    if (filters.length === 0) {
      filters.push({ status: 'available' });
    }

    const filter = {
      $and: [
        { $or: filters },
        { _id: { $ne: new (await import('mongodb')).ObjectId.default(currentVehicleId) } },
        { status: 'available' }
      ]
    };

    const similarRentals = await rentalsCollection.find(filter)
      .limit(3)
      .sort({ createdAt: -1 })
      .toArray();

    return similarRentals;
  } catch (error) {
    console.error('Error fetching similar rentals:', error);
    return [];
  }
}
EOFcat > api/index.js << 'EOF'
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

    // === WEBSITE STATISTICS ENDPOINT (for HeroSection) ===
    if (path === '/stats' || path === '/website-stats') {
      console.log('[API] → WEBSITE STATS');
      
      try {
        const [
          carListingsCount,
          dealersCount,
          verifiedDealersCount,
          transportProvidersCount,
          newsCount,
          savingsData
        ] = await Promise.all([
          db.collection('listings').countDocuments({ status: 'active' }),
          db.collection('dealers').countDocuments({ status: 'active' }),
          db.collection('dealers').countDocuments({ 'verification.status': 'verified' }),
          db.collection('serviceproviders').countDocuments({ providerType: 'transport' }),
          db.collection('news').countDocuments({ status: 'published' }),
          calculateTotalSavings(db)
        ]);

        const stats = {
          carListings: carListingsCount,
          happyCustomers: dealersCount + transportProvidersCount,
          verifiedDealers: Math.round((verifiedDealersCount / Math.max(dealersCount, 1)) * 100),
          transportProviders: transportProvidersCount,
          totalSavings: savingsData.totalSavings,
          savingsCount: savingsData.savingsCount,
          newsArticles: newsCount
        };

        return res.status(200).json({
          success: true,
          data: stats,
          message: 'Website statistics retrieved successfully'
        });
      } catch (error) {
        console.error('Stats calculation error:', error);
        // Return fallback stats
        return res.status(200).json({
          success: true,
          data: {
            carListings: 150,
            happyCustomers: 450,
            verifiedDealers: 85,
            transportProviders: 15,
            totalSavings: 2500000,
            savingsCount: 45,
            newsArticles: 25
          },
          message: 'Fallback statistics'
        });
      }
    }

    // === MARKETPLACE SECTIONS ENDPOINT (for MarketplaceFilters) ===
    if (path === '/listings') {
      console.log('[API] → LISTINGS WITH SECTIONS');
      const listingsCollection = db.collection('listings');
      
      // Build base filter
      let filter = { status: 'active' };
      
      // Section-based filtering (from MarketplaceFilters)
      const section = searchParams.get('section');
      if (section) {
        switch (section) {
          case 'premium':
            filter.$or = [
              { category: { $in: ['Luxury', 'Sports Car', 'Electric'] } },
              { price: { $gte: 500000 } },
              { 'specifications.make': { $in: ['BMW', 'Mercedes-Benz', 'Audi', 'Lexus', 'Porsche', 'Ferrari', 'Lamborghini'] } }
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
          case 'all':
          default:
            // No additional filter for 'all'
            break;
        }
      }

      // Apply other filters from MarketplaceFilters
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
        
        if (filter.$or) {
          filter = { $and: [filter, searchFilter] };
        } else {
          filter = { ...filter, ...searchFilter };
        }
      }

      // Dealer/Seller filtering
      if (searchParams.get('dealerId')) {
        const dealerFilter = {
          $or: [
            { dealerId: searchParams.get('dealerId') },
            { 'dealer._id': searchParams.get('dealerId') },
            { 'dealer.id': searchParams.get('dealerId') }
          ]
        };
        
        if (filter.$and) {
          filter.$and.push(dealerFilter);
        } else {
          filter = { $and: [filter, dealerFilter] };
        }
      }

      // Seller type filtering
      if (searchParams.get('sellerType')) {
        const sellerTypeFilter = { 'dealer.sellerType': searchParams.get('sellerType') };
        
        if (filter.$and) {
          filter.$and.push(sellerTypeFilter);
        } else {
          filter = { $and: [filter, sellerTypeFilter] };
        }
      }

      // Vehicle specifications filtering
      if (searchParams.get('make')) {
        filter['specifications.make'] = { $regex: searchParams.get('make'), $options: 'i' };
      }
      if (searchParams.get('model')) {
        filter['specifications.model'] = { $regex: searchParams.get('model'), $options: 'i' };
      }
      if (searchParams.get('category')) {
        filter.category = { $regex: searchParams.get('category'), $options: 'i' };
      }
      if (searchParams.get('drivetrain')) {
        filter['specifications.drivetrain'] = searchParams.get('drivetrain');
      }

      // Price range filtering
      if (searchParams.get('minPrice') || searchParams.get('maxPrice')) {
        filter.price = {};
        if (searchParams.get('minPrice')) filter.price.$gte = Number(searchParams.get('minPrice'));
        if (searchParams.get('maxPrice')) filter.price.$lte = Number(searchParams.get('maxPrice'));
      }

      // Year range filtering
      if (searchParams.get('minYear') || searchParams.get('maxYear')) {
        filter['specifications.year'] = {};
        if (searchParams.get('minYear')) filter['specifications.year'].$gte = Number(searchParams.get('minYear'));
        if (searchParams.get('maxYear')) filter['specifications.year'].$lte = Number(searchParams.get('maxYear'));
      }

      // Mileage range filtering
      if (searchParams.get('minMileage') || searchParams.get('maxMileage')) {
        filter['specifications.mileage'] = {};
        if (searchParams.get('minMileage')) filter['specifications.mileage'].$gte = Number(searchParams.get('minMileage'));
        if (searchParams.get('maxMileage')) filter['specifications.mileage'].$lte = Number(searchParams.get('maxMileage'));
      }

      // Location filtering
      if (searchParams.get('city')) {
        const cityRegex = { $regex: searchParams.get('city'), $options: 'i' };
        const cityFilter = {
          $or: [
            { 'location.city': cityRegex },
            { 'dealer.location.city': cityRegex }
          ]
        };
        
        if (filter.$and) {
          filter.$and.push(cityFilter);
        } else {
          filter = { $and: [filter, cityFilter] };
        }
      }

      // Availability filtering
      if (searchParams.get('availability')) {
        filter.availability = searchParams.get('availability');
      }

      // Pagination
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 12;
      const skip = (page - 1) * limit;

      // Sort - prioritize savings for savings section
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
        count: listings.length,
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        data: listings,
        section: section || 'all',
        message: `Found ${listings.length} listings in ${section || 'all'} section`
      });
    }

    // === INDIVIDUAL LISTING WITH RELATED DATA (for CarMarketPlace) ===
    if (path.startsWith('/listings/')) {
      // Handle individual listing by ID with related data
      const listingMatch = path.match(/\/listings\/([a-fA-F0-9]{24})$/);
      if (listingMatch) {
        const listingId = listingMatch[1];
        console.log(`[API] → INDIVIDUAL LISTING WITH RELATED: ${listingId}`);
        
        try {
          const { ObjectId } = await import('mongodb');
          const listingsCollection = db.collection('listings');
          
          // Get the main listing
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

          // Get related data in parallel
          const [dealerListings, similarListings, relatedNews] = await Promise.all([
            getDealerListings(db, listing, listingId),
            getSimilarListings(db, listing, listingId),
            getRelatedNews(db, listing)
          ]);

          return res.status(200).json({
            success: true,
            data: {
              listing,
              dealerListings,
              similarListings,
              relatedNews
            },
            message: `Listing details with related content`
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            message: 'Error fetching listing details',
            error: error.message
          });
        }
      }

      // Handle dealer-specific listings
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
            message: `Found ${listings.length} listings for dealer`
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            message: 'Error fetching dealer listings',
            error: error.message
          });
        }
      }
    }

    // === VEHICLE MAKES AND MODELS ENDPOINT (for MarketplaceFilters) ===
    if (path === '/vehicles/makes') {
      console.log('[API] → VEHICLE MAKES');
      const listingsCollection = db.collection('listings');
      
      try {
        const makes = await listingsCollection.distinct('specifications.make', { status: 'active' });
        const cleanMakes = makes.filter(make => make && make.trim()).sort();
        
        return res.status(200).json({
          success: true,
          data: cleanMakes,
          count: cleanMakes.length
        });
      } catch (error) {
        // Fallback makes
        return res.status(200).json({
          success: true,
          data: ['BMW', 'Mercedes-Benz', 'Toyota', 'Honda', 'Ford', 'Audi', 'Nissan', 'Mazda', 'Volkswagen', 'Hyundai'],
          count: 10
        });
      }
    }

    if (path === '/vehicles/models') {
      console.log('[API] → VEHICLE MODELS');
      const make = searchParams.get('make');
      
      if (!make) {
        return res.status(400).json({
          success: false,
          message: 'Make parameter is required'
        });
      }

      const listingsCollection = db.collection('listings');
      
      try {
        const models = await listingsCollection.distinct('specifications.model', {
          'specifications.make': { $regex: make, $options: 'i' },
          status: 'active'
        });
        
        const cleanModels = models.filter(model => model && model.trim()).sort();
        
        return res.status(200).json({
          success: true,
          data: cleanModels,
          count: cleanModels.length,
          make: make
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: 'Error fetching models',
          error: error.message
        });
      }
    }

    // === RENTAL VEHICLES WITH RELATED DATA (for RentalVehicleDetail) ===
    if (path === '/rentals') {
      console.log('[API] → RENTALS');
      const rentalsCollection = db.collection('rentalvehicles');
      
      // Build filter
      let filter = {};
      
      // Provider ID filtering (for business cards and related rentals)
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

      // Category filtering
      if (searchParams.get('category')) {
        filter.category = { $regex: searchParams.get('category'), $options: 'i' };
      }

      // Make filtering
      if (searchParams.get('make')) {
        filter['specifications.make'] = { $regex: searchParams.get('make'), $options: 'i' };
      }

      // Status filtering
      if (searchParams.get('status')) {
        filter.status = searchParams.get('status');
      } else {
        filter.status = 'available'; // Default to available
      }

      // Search filtering
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        const searchFilter = {
          $or: [
            { name: searchRegex },
            { title: searchRegex },
            { 'specifications.make': searchRegex },
            { 'specifications.model': searchRegex },
            { description: searchRegex }
          ]
        };
        
        if (Object.keys(filter).length > 0 && !filter.$or) {
          filter = { $and: [filter, searchFilter] };
        } else if (filter.$or) {
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
        message: `Found ${vehicles.length} rental vehicles${providerId ? ` for provider` : ''}`
      });
    }

    // === INDIVIDUAL RENTAL VEHICLE WITH RELATED DATA ===
    if (path.startsWith('/rentals/')) {
      const rentalMatch = path.match(/\/rentals\/([a-fA-F0-9]{24})$/);
      if (rentalMatch) {
        const rentalId = rentalMatch[1];
        console.log(`[API] → INDIVIDUAL RENTAL WITH RELATED: ${rentalId}`);
        
        try {
          const { ObjectId } = await import('mongodb');
          const rentalsCollection = db.collection('rentalvehicles');
          
          // Get the main rental vehicle
          const vehicle = await rentalsCollection.findOne({ _id: new ObjectId.default(rentalId) });
          
          if (!vehicle) {
            return res.status(404).json({
              success: false,
              message: 'Rental vehicle not found'
            });
          }

          // Get related data in parallel
          const [providerRentals, similarRentals] = await Promise.all([
            getProviderRentals(db, vehicle, rentalId),
            getSimilarRentals(db, vehicle, rentalId)
          ]);

          return res.status(200).json({
            success: true,
            vehicle: vehicle,
            data: {
              vehicle,
              providerRentals,
              similarRentals
            },
            message: 'Rental vehicle details with related content'
          });
        } catch (error) {
          return res.status(500).json({
            success: false,
            message: 'Error fetching rental vehicle details',
            error: error.message
          });
        }
      }
    }

    // === KEEP ALL EXISTING ENDPOINTS FROM PREVIOUS VERSION ===
    
    // Authentication endpoints
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
      
      if (!user || user.password !== password) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }
      
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

    // Enhanced dealers endpoint
    if (path === '/dealers') {
      console.log('[API] → DEALERS');
      const dealersCollection = db.collection('dealers');
      
      let filter = {};
      
      if (searchParams.get('sellerType')) {
        filter.sellerType = searchParams.get('sellerType');
      }
      
      if (searchParams.get('search')) {
        const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
        filter.$or = [
          { businessName: searchRegex },
          { 'profile.description': searchRegex },
          { 'location.city': searchRegex },
          { 'privateSeller.firstName': searchRegex },
          { 'privateSeller.lastName': searchRegex }
        ];
      }
      
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      const dealers = await dealersCollection.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ businessName: 1 })
        .toArray();
      
      const total = await dealersCollection.countDocuments(filter);
      
      // Calculate listing counts
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
        message: `Found ${dealers.length} dealers`
      });
    }

    if (path === '/dealers/all') {
      console.log('[API] → DEALERS ALL');
      const dealersCollection = db.collection('dealers');
      
      const dealers = await dealersCollection.find({ status: 'active' })
        .sort({ businessName: 1 })
        .toArray();
      
      const processedDealers = dealers.map(dealer => ({
        _id: dealer._id,
        businessName: dealer.businessName,
        name: dealer.businessName,
        sellerType: dealer.sellerType || 'dealership',
        privateSeller: dealer.privateSeller,
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

    // Service providers endpoints (keep existing)
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
          { 'location.city': searchRegex }
        ];
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

    // Keep existing transport, trailers, news endpoints...
    
    if (path === '/transport') {
      console.log('[API] → TRANSPORT');
      const transportCollection = db.collection('transportnodes');
      
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
        total,
        message: `Found ${routes.length} transport routes`
      });
    }

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
        total,
        message: `Found ${trailers.length} trailers`
      });
    }

    if (path === '/news') {
      console.log('[API] → NEWS');
      const newsCollection = db.collection('news');
      
      let query = {};
      
      if (searchParams.get('category') && searchParams.get('category') !== 'all') {
        query.category = searchParams.get('category');
      }
      
      if (searchParams.get('search')) {
        query.$text = { $search: searchParams.get('search') };
      }
      
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      const articles = await newsCollection.find(query)
        .skip(skip)
        .limit(limit)
        .sort({ publishDate: -1, createdAt: -1 })
        .toArray();
      
      const total = await newsCollection.countDocuments(query);
      
      return res.status(200).json({
        success: true,
        data: articles,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          total
        },
        message: `Found ${articles.length} news articles`
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

    if (path === '/providers') {
      console.log('[API] → PROVIDERS (alias for service-providers)');
      const serviceProvidersCollection = db.collection('serviceproviders');
      const providers = await serviceProvidersCollection.find({}).limit(20).toArray();
      return res.status(200).json({
        success: true,
        data: providers,
        message: `Found ${providers.length} providers`
      });
    }

    // Analytics endpoints
    if (path.includes('analytics')) {
      console.log('[API] → ANALYTICS');
      
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

    // Auth register
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
        password,
        role: role || 'user',
        status: 'active',
        createdAt: new Date()
      };
      
      const result = await usersCollection.insertOne(newUser);
      
      return res.status(201).json({
        success: true,
        message: 'Registration successful!',
        user: {
          id: result.insertedId,
          fullName,
          email,
          role: role || 'user'
        }
      });
    }

    // Test/Health endpoint
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
        message: 'BW Car Culture API Enhanced for Production!',
        path: path,
        collections: collectionNames,
        counts: counts,
        timestamp: new Date().toISOString(),
        newFeatures: [
          'Website Statistics for HeroSection',
          'Section-based Filtering (premium, savings, private)',
          'Individual Listings with Related Content',
          'Vehicle Makes/Models Endpoints',
          'Enhanced Rental Vehicle Details',
          'Mobile-optimized API responses'
        ]
      });
    }

    // Not found
    console.log(`[API] ✗ NOT FOUND: ${path}`);
    return res.status(404).json({
      success: false,
      message: `Endpoint not found: ${path}`,
      availableEndpoints: [
        'GET /stats - Website statistics',
        'GET /listings?section=premium - Section filtering',
        'GET /listings/{id} - Individual listing with related data',
        'GET /vehicles/makes - Available makes',
        'GET /vehicles/models?make=BMW - Models for make',
        'GET /rentals/{id} - Individual rental with related data',
        'GET /dealers/all - All dealers for dropdown',
        'POST /auth/login - User authentication',
        'POST /analytics/track - Event tracking'
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

// Helper functions for related content
async function calculateTotalSavings(db) {
  try {
    const listingsCollection = db.collection('listings');
    const savingsListings = await listingsCollection.find({
      'priceOptions.showSavings': true,
      'priceOptions.savingsAmount': { $gt: 0 }
    }).toArray();

    let totalSavings = 0;
    let savingsCount = 0;

    savingsListings.forEach(listing => {
      if (listing.priceOptions && listing.priceOptions.savingsAmount > 0) {
        totalSavings += listing.priceOptions.savingsAmount;
        savingsCount++;
      }
    });

    return { totalSavings, savingsCount };
  } catch (error) {
    return { totalSavings: 0, savingsCount: 0 };
  }
}

async function getDealerListings(db, listing, currentListingId) {
  try {
    const listingsCollection = db.collection('listings');
    
    // Extract dealer ID
    let dealerId = null;
    if (listing.dealerId) {
      dealerId = listing.dealerId.toString ? listing.dealerId.toString() : listing.dealerId;
    } else if (listing.dealer && listing.dealer._id) {
      dealerId = listing.dealer._id.toString ? listing.dealer._id.toString() : listing.dealer._id;
    }

    if (!dealerId) return [];

    const filter = {
      $and: [
        {
          $or: [
            { dealerId: dealerId },
            { 'dealer._id': dealerId },
            { 'dealer.id': dealerId }
          ]
        },
        {
          _id: { $ne: new (await import('mongodb')).ObjectId.default(currentListingId) }
        }
      ]
    };

    const dealerListings = await listingsCollection.find(filter)
      .limit(3)
      .sort({ createdAt: -1 })
      .toArray();

    return dealerListings;
  } catch (error) {
    console.error('Error fetching dealer listings:', error);
    return [];
  }
}

async function getSimilarListings(db, listing, currentListingId) {
  try {
    const listingsCollection = db.collection('listings');
    
    // Build similarity filters
    let filters = [];
    
    if (listing.specifications?.make) {
      filters.push({ 'specifications.make': listing.specifications.make });
    }
    
    if (listing.category) {
      filters.push({ category: listing.category });
    }
    
    if (listing.price && filters.length === 0) {
      const priceRange = listing.price * 0.3;
      filters.push({
        price: {
          $gte: listing.price - priceRange,
          $lte: listing.price + priceRange
        }
      });
    }

    if (filters.length === 0) return [];

    const filter = {
      $and: [
        { $or: filters },
        { _id: { $ne: new (await import('mongodb')).ObjectId.default(currentListingId) } },
        { status: 'active' }
      ]
    };

    const similarListings = await listingsCollection.find(filter)
      .limit(3)
      .sort({ createdAt: -1 })
      .toArray();

    return similarListings;
  } catch (error) {
    console.error('Error fetching similar listings:', error);
    return [];
  }
}

async function getRelatedNews(db, listing) {
  try {
    const newsCollection = db.collection('news');
    
    // Build tags for related news
    const tags = [];
    if (listing.specifications?.make) tags.push(listing.specifications.make);
    if (listing.specifications?.model) tags.push(listing.specifications.model);
    if (listing.category) tags.push(listing.category);

    if (tags.length === 0) return [];

    const filter = {
      $or: [
        { tags: { $in: tags } },
        { category: listing.category }
      ]
    };

    const relatedNews = await newsCollection.find(filter)
      .limit(3)
      .sort({ publishDate: -1 })
      .toArray();

    return relatedNews;
  } catch (error) {
    console.error('Error fetching related news:', error);
    return [];
  }
}

async function getProviderRentals(db, vehicle, currentVehicleId) {
  try {
    const rentalsCollection = db.collection('rentalvehicles');
    
    let providerId = null;
    if (vehicle.providerId) {
      providerId = vehicle.providerId.toString ? vehicle.providerId.toString() : vehicle.providerId;
    } else if (vehicle.provider && vehicle.provider._id) {
      providerId = vehicle.provider._id.toString ? vehicle.provider._id.toString() : vehicle.provider._id;
    }

    if (!providerId) return [];

    const filter = {
      $and: [
        {
          $or: [
            { providerId: providerId },
            { 'provider._id': providerId },
            { 'provider.id': providerId }
          ]
        },
        {
          _id: { $ne: new (await import('mongodb')).ObjectId.default(currentVehicleId) }
        }
      ]
    };

    const providerRentals = await rentalsCollection.find(filter)
      .limit(3)
      .sort({ createdAt: -1 })
      .toArray();

    return providerRentals;
  } catch (error) {
    console.error('Error fetching provider rentals:', error);
    return [];
  }
}

async function getSimilarRentals(db, vehicle, currentVehicleId) {
  try {
    const rentalsCollection = db.collection('rentalvehicles');
    
    let filters = [];
    
    if (vehicle.category) {
      filters.push({ category: vehicle.category });
    }
    
    if (vehicle.specifications?.make) {
      filters.push({ 'specifications.make': vehicle.specifications.make });
    }
    
    if (vehicle.specifications?.transmission) {
      filters.push({ 'specifications.transmission': vehicle.specifications.transmission });
    }

    if (filters.length === 0) {
      filters.push({ status: 'available' });
    }

    const filter = {
      $and: [
        { $or: filters },
        { _id: { $ne: new (await import('mongodb')).ObjectId.default(currentVehicleId) } },
        { status: 'available' }
      ]
    };

    const similarRentals = await rentalsCollection.find(filter)
      .limit(3)
      .sort({ createdAt: -1 })
      .toArray();

    return similarRentals;
  } catch (error) {
    console.error('Error fetching similar rentals:', error);
    return [];
  }
}
