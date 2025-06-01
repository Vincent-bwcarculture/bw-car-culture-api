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
  
  const isAllowed = allowedOrigins.includes(origin) || 
                   (origin && origin.includes('bw-car-culture') && origin.includes('vercel.app'));
  
  const allowOrigin = isAllowed ? origin : '*';
  
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With, Cache-Control, Pragma, Expires, If-Modified-Since, If-None-Match');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
};

// Helper function to parse query parameters
const parseQueryParams = (req) => {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const page = parseInt(url.searchParams.get('page')) || 1;
  const limit = Math.min(parseInt(url.searchParams.get('limit')) || 10, 100);
  const skip = (page - 1) * limit;
  
  return { page, limit, skip, searchParams: url.searchParams };
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

    // === API PREFIX HANDLER ===
    let apiPath = req.url;
    if (apiPath.startsWith('/api/')) {
      apiPath = apiPath.substring(4); // Remove '/api/' prefix
    }

    // === LISTINGS API (Matches listingService.js) ===
    if (apiPath.startsWith('listings')) {
      const { page, limit, skip, searchParams } = parseQueryParams(req);
      const listingsCollection = db.collection('listings');
      
      // Get featured listings
      if (apiPath === 'listings/featured') {
        try {
          const featuredLimit = parseInt(searchParams.get('limit')) || 5;
          const featuredListings = await listingsCollection.find({ featured: true })
            .limit(featuredLimit)
            .sort({ createdAt: -1 })
            .toArray();
          
          return res.status(200).json({
            success: true,
            data: featuredListings,
            total: featuredListings.length
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching featured listings', error: error.message });
        }
      }
      
      // Get dealer listings - matches getDealerListings(dealerId, page, limit)
      if (apiPath.match(/^listings\/dealer\/[a-fA-F0-9]{24}$/)) {
        try {
          const { ObjectId } = await import('mongodb');
          const dealerId = apiPath.split('/')[2];
          
          const filter = {
            $or: [
              { dealerId: new ObjectId.default(dealerId) },
              { dealerId: dealerId },
              { 'dealer._id': dealerId },
              { 'dealer.id': dealerId }
            ]
          };
          
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
            }
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching dealer listings', error: error.message });
        }
      }
      
      // Get filter options - matches getFilterOptions()
      if (apiPath === 'listings/filter-options') {
        try {
          // Get unique makes, models, years, etc. from actual data
          const makes = await listingsCollection.distinct('specifications.make');
          const years = await listingsCollection.distinct('specifications.year');
          const fuelTypes = await listingsCollection.distinct('specifications.fuelType');
          const transmissions = await listingsCollection.distinct('specifications.transmission');
          const categories = await listingsCollection.distinct('category');
          const colors = await listingsCollection.distinct('specifications.exteriorColor');
          
          return res.status(200).json({
            success: true,
            data: {
              makes: makes.filter(Boolean).sort(),
              years: years.filter(Boolean).sort((a, b) => b - a),
              fuelTypes: fuelTypes.filter(Boolean),
              transmissionTypes: transmissions.filter(Boolean),
              bodyStyles: categories.filter(Boolean),
              colors: colors.filter(Boolean).sort()
            }
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching filter options', error: error.message });
        }
      }
      
      // Get models by make - matches getModelsByMake(make)
      if (apiPath === 'listings/models' && searchParams.get('make')) {
        try {
          const make = searchParams.get('make');
          const models = await listingsCollection.distinct('specifications.model', {
            'specifications.make': make
          });
          
          return res.status(200).json({
            success: true,
            data: models.filter(Boolean).sort()
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching models', error: error.message });
        }
      }
      
      // Get single listing by ID
      if (apiPath.match(/^listings\/[a-fA-F0-9]{24}$/)) {
        try {
          const { ObjectId } = await import('mongodb');
          const listingId = apiPath.split('/')[1];
          
          const listing = await listingsCollection.findOne({ _id: new ObjectId.default(listingId) });
          
          if (!listing) {
            return res.status(404).json({ success: false, message: 'Listing not found' });
          }
          
          return res.status(200).json({
            success: true,
            data: listing
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching listing', error: error.message });
        }
      }
      
      // Get all listings - matches getListings(filters, page, limit)
      if (apiPath === 'listings' || apiPath.startsWith('listings?')) {
        try {
          // Build filter from query parameters
          let filter = {};
          
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
          if (searchParams.get('fuelType')) {
            filter['specifications.fuelType'] = searchParams.get('fuelType');
          }
          if (searchParams.get('transmission')) {
            filter['specifications.transmission'] = searchParams.get('transmission');
          }
          
          const listings = await listingsCollection.find(filter)
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 })
            .toArray();
          
          const total = await listingsCollection.countDocuments(filter);
          
          return res.status(200).json({
            success: true,
            data: listings,
            total: total,
            currentPage: page,
            totalPages: Math.ceil(total / limit)
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching listings', error: error.message });
        }
      }
    }

    // === DEALERS API (Matches dealerService.js) ===
    if (apiPath.startsWith('dealers')) {
      const { page, limit, skip, searchParams } = parseQueryParams(req);
      const dealersCollection = db.collection('dealers');
      
      // Get all dealers - matches getAllDealers()
      if (apiPath === 'dealers/all') {
        try {
          const dealers = await dealersCollection.find({}).toArray();
          
          // Process dealers to match expected format
          const processedDealers = dealers.map(dealer => ({
            ...dealer,
            sellerType: dealer.sellerType || (dealer.privateSeller ? 'private' : 'dealership'),
            displayName: dealer.sellerType === 'private' && dealer.privateSeller
              ? `${dealer.privateSeller.firstName} ${dealer.privateSeller.lastName}`
              : dealer.businessName || dealer.name
          }));
          
          return res.status(200).json({
            success: true,
            data: processedDealers
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching all dealers', error: error.message });
        }
      }
      
      // Get single dealer by ID - matches getDealer(id)
      if (apiPath.match(/^dealers\/[a-fA-F0-9]{24}$/)) {
        try {
          const { ObjectId } = await import('mongodb');
          const dealerId = apiPath.split('/')[1];
          
          const dealer = await dealersCollection.findOne({ _id: new ObjectId.default(dealerId) });
          
          if (!dealer) {
            return res.status(404).json({ success: false, message: 'Dealer not found' });
          }
          
          return res.status(200).json({
            success: true,
            data: dealer
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching dealer', error: error.message });
        }
      }
      
      // Get dealers with filters - matches getDealers(filters, page)
      if (apiPath === 'dealers' || apiPath.startsWith('dealers?')) {
        try {
          // Build filter from query parameters
          let filter = {};
          
          if (searchParams.get('status') && searchParams.get('status') !== 'all') {
            filter.status = searchParams.get('status');
          }
          if (searchParams.get('businessType') && searchParams.get('businessType') !== 'all') {
            filter.businessType = searchParams.get('businessType');
          }
          if (searchParams.get('sellerType') && searchParams.get('sellerType') !== 'all') {
            filter.sellerType = searchParams.get('sellerType');
          }
          if (searchParams.get('search')) {
            const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
            filter.$or = [
              { businessName: searchRegex },
              { 'privateSeller.firstName': searchRegex },
              { 'privateSeller.lastName': searchRegex },
              { 'location.city': searchRegex }
            ];
          }
          
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
            }
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching dealers', error: error.message });
        }
      }
    }

    // === NEWS API (Matches newsService.js) ===
    if (apiPath.startsWith('news')) {
      const { page, limit, skip, searchParams } = parseQueryParams(req);
      const newsCollection = db.collection('news');
      
      // Get featured articles
      if (apiPath === 'news/featured') {
        try {
          const featuredLimit = parseInt(searchParams.get('limit')) || 1;
          const featured = await newsCollection.find({ featured: true })
            .limit(featuredLimit)
            .sort({ publishedAt: -1, createdAt: -1 })
            .toArray();
          
          return res.status(200).json({
            success: true,
            data: featured
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching featured news', error: error.message });
        }
      }
      
      // Get latest articles
      if (apiPath === 'news/latest') {
        try {
          const latestLimit = parseInt(searchParams.get('limit')) || 6;
          const latest = await newsCollection.find({})
            .limit(latestLimit)
            .sort({ publishedAt: -1, createdAt: -1 })
            .toArray();
          
          return res.status(200).json({
            success: true,
            data: latest
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching latest news', error: error.message });
        }
      }
      
      // Get single article by ID
      if (apiPath.match(/^news\/[a-fA-F0-9]{24}$/)) {
        try {
          const { ObjectId } = await import('mongodb');
          const newsId = apiPath.split('/')[1];
          
          const article = await newsCollection.findOne({ _id: new ObjectId.default(newsId) });
          
          if (!article) {
            return res.status(404).json({ success: false, message: 'Article not found' });
          }
          
          return res.status(200).json({
            success: true,
            data: article
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching article', error: error.message });
        }
      }
      
      // Get all news articles
      if (apiPath === 'news' || apiPath.startsWith('news?')) {
        try {
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
          
          const articles = await newsCollection.find(filter)
            .skip(skip)
            .limit(limit)
            .sort({ publishedAt: -1, createdAt: -1 })
            .toArray();
          
          const total = await newsCollection.countDocuments(filter);
          
          return res.status(200).json({
            success: true,
            data: articles,
            total: total,
            currentPage: page,
            totalPages: Math.ceil(total / limit)
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching news', error: error.message });
        }
      }
    }

    // === SERVICE PROVIDERS API (Matches serviceProviderService.js) ===
    if (apiPath.startsWith('providers')) {
      const { page, limit, skip, searchParams } = parseQueryParams(req);
      const providersCollection = db.collection('serviceproviders');
      
      // Get all providers
      if (apiPath === 'providers/all') {
        try {
          const providers = await providersCollection.find({}).toArray();
          
          return res.status(200).json({
            success: true,
            providers: providers
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching all providers', error: error.message });
        }
      }
      
      // Get single provider by ID
      if (apiPath.match(/^providers\/[a-fA-F0-9]{24}$/)) {
        try {
          const { ObjectId } = await import('mongodb');
          const providerId = apiPath.split('/')[1];
          
          const provider = await providersCollection.findOne({ _id: new ObjectId.default(providerId) });
          
          if (!provider) {
            return res.status(404).json({ success: false, message: 'Provider not found' });
          }
          
          return res.status(200).json({
            success: true,
            data: provider
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching provider', error: error.message });
        }
      }
      
      // Get providers with filters
      if (apiPath === 'providers' || apiPath.startsWith('providers?')) {
        try {
          let filter = {};
          
          if (searchParams.get('providerType')) {
            filter.providerType = searchParams.get('providerType');
          }
          if (searchParams.get('businessType') && searchParams.get('businessType') !== 'all') {
            filter.businessType = searchParams.get('businessType');
          }
          if (searchParams.get('status') && searchParams.get('status') !== 'all') {
            filter.status = searchParams.get('status');
          }
          if (searchParams.get('search')) {
            const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
            filter.$or = [
              { businessName: searchRegex },
              { 'profile.description': searchRegex },
              { 'location.city': searchRegex }
            ];
          }
          
          const providers = await providersCollection.find(filter)
            .skip(skip)
            .limit(limit)
            .sort({ businessName: 1 })
            .toArray();
          
          const total = await providersCollection.countDocuments(filter);
          
          return res.status(200).json({
            success: true,
            data: providers,
            pagination: {
              currentPage: page,
              totalPages: Math.ceil(total / limit),
              total: total
            }
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching providers', error: error.message });
        }
      }
    }

    // === RENTAL VEHICLES API (Matches rentalVehicleService.js) ===
    if (apiPath.startsWith('rentals')) {
      const { page, limit, skip, searchParams } = parseQueryParams(req);
      const rentalsCollection = db.collection('rentalvehicles');
      
      // Get featured rentals
      if (apiPath === 'rentals/featured') {
        try {
          const featuredLimit = parseInt(searchParams.get('limit')) || 6;
          const featured = await rentalsCollection.find({ featured: true })
            .limit(featuredLimit)
            .sort({ createdAt: -1 })
            .toArray();
          
          return res.status(200).json({
            success: true,
            vehicles: featured,
            data: featured
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching featured rentals', error: error.message });
        }
      }
      
      // Get single rental vehicle by ID
      if (apiPath.match(/^rentals\/[a-fA-F0-9]{24}$/)) {
        try {
          const { ObjectId } = await import('mongodb');
          const rentalId = apiPath.split('/')[1];
          
          const vehicle = await rentalsCollection.findOne({ _id: new ObjectId.default(rentalId) });
          
          if (!vehicle) {
            return res.status(404).json({ success: false, message: 'Rental vehicle not found' });
          }
          
          return res.status(200).json({
            success: true,
            vehicle: vehicle,
            data: vehicle
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching rental vehicle', error: error.message });
        }
      }
      
      // Get all rental vehicles
      if (apiPath === 'rentals' || apiPath.startsWith('rentals?')) {
        try {
          let filter = {};
          
          if (searchParams.get('category')) {
            filter.category = searchParams.get('category');
          }
          if (searchParams.get('make')) {
            filter['specifications.make'] = searchParams.get('make');
          }
          if (searchParams.get('status') && searchParams.get('status') !== 'all') {
            filter.status = searchParams.get('status');
          }
          if (searchParams.get('search')) {
            const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
            filter.$or = [
              { name: searchRegex },
              { 'specifications.make': searchRegex },
              { 'specifications.model': searchRegex },
              { description: searchRegex }
            ];
          }
          
          const vehicles = await rentalsCollection.find(filter)
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 })
            .toArray();
          
          const total = await rentalsCollection.countDocuments(filter);
          
          return res.status(200).json({
            success: true,
            vehicles: vehicles,
            data: vehicles,
            pagination: {
              currentPage: page,
              totalPages: Math.ceil(total / limit),
              total: total
            }
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching rental vehicles', error: error.message });
        }
      }
    }

    // === TRANSPORT ROUTES API (Matches transportRouteService.js) ===
    if (apiPath.startsWith('transport')) {
      const { page, limit, skip, searchParams } = parseQueryParams(req);
      const transportCollection = db.collection('transportnodes');
      
      // Get featured routes
      if (apiPath === 'transport/featured') {
        try {
          const featuredLimit = parseInt(searchParams.get('limit')) || 6;
          const featured = await transportCollection.find({ featured: true })
            .limit(featuredLimit)
            .sort({ createdAt: -1 })
            .toArray();
          
          return res.status(200).json({
            success: true,
            routes: featured,
            data: featured
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching featured transport routes', error: error.message });
        }
      }
      
      // Get single transport route by ID
      if (apiPath.match(/^transport\/[a-fA-F0-9]{24}$/)) {
        try {
          const { ObjectId } = await import('mongodb');
          const routeId = apiPath.split('/')[1];
          
          const route = await transportCollection.findOne({ _id: new ObjectId.default(routeId) });
          
          if (!route) {
            return res.status(404).json({ success: false, message: 'Transport route not found' });
          }
          
          return res.status(200).json({
            success: true,
            route: route,
            data: route
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching transport route', error: error.message });
        }
      }
      
      // Get all transport routes
      if (apiPath === 'transport' || apiPath.startsWith('transport?')) {
        try {
          let filter = {};
          
          if (searchParams.get('origin')) {
            filter.origin = { $regex: searchParams.get('origin'), $options: 'i' };
          }
          if (searchParams.get('destination')) {
            filter.destination = { $regex: searchParams.get('destination'), $options: 'i' };
          }
          if (searchParams.get('routeType')) {
            filter.routeType = searchParams.get('routeType');
          }
          if (searchParams.get('search')) {
            const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
            filter.$or = [
              { origin: searchRegex },
              { destination: searchRegex },
              { title: searchRegex },
              { description: searchRegex }
            ];
          }
          
          const routes = await transportCollection.find(filter)
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 })
            .toArray();
          
          const total = await transportCollection.countDocuments(filter);
          
          return res.status(200).json({
            success: true,
            routes: routes,
            data: routes,
            pagination: {
              currentPage: page,
              totalPages: Math.ceil(total / limit),
              total: total
            }
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching transport routes', error: error.message });
        }
      }
    }

    // === ANALYTICS API (Matches analyticsService.js) ===
    if (apiPath.startsWith('analytics')) {
      // Basic analytics tracking endpoint
      if (apiPath === 'analytics/track' && req.method === 'POST') {
        try {
          // Just return success for now - analytics tracking working
          return res.status(200).json({
            success: true,
            message: 'Event tracked'
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Analytics error', error: error.message });
        }
      }
      
      // Dashboard data
      if (apiPath === 'analytics/dashboard') {
        try {
          const listingsCollection = db.collection('listings');
          const dealersCollection = db.collection('dealers');
          const newsCollection = db.collection('news');
          const usersCollection = db.collection('users');
          
          const [listingsCount, dealersCount, newsCount, usersCount] = await Promise.all([
            listingsCollection.countDocuments(),
            dealersCollection.countDocuments(),
            newsCollection.countDocuments(),
            usersCollection.countDocuments()
          ]);
          
          return res.status(200).json({
            success: true,
            data: {
              totalListings: listingsCount,
              totalDealers: dealersCount,
              totalNews: newsCount,
              totalUsers: usersCount,
              timestamp: new Date().toISOString()
            }
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error fetching dashboard data', error: error.message });
        }
      }
      
      // Default analytics response
      return res.status(200).json({
        success: true,
        message: 'Analytics endpoint working'
      });
    }

    // === AUTH API ===
    if (apiPath.startsWith('auth')) {
      // Admin registration
      if (apiPath === 'auth/register' && req.method === 'POST') {
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
    }

    // === TEST AND DEBUG ENDPOINTS ===
    if (apiPath === 'test-db' || apiPath === 'health') {
      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);
      
      const sampleData = {};
      for (const collectionName of ['listings', 'news', 'dealers', 'users', 'serviceproviders', 'rentalvehicles', 'transportnodes']) {
        try {
          const collection = db.collection(collectionName);
          const count = await collection.countDocuments();
          sampleData[collectionName] = { count };
        } catch (e) {
          sampleData[collectionName] = { error: e.message };
        }
      }
      
      return res.status(200).json({
        success: true,
        message: 'BW Car Culture API - Database connected!',
        database: process.env.MONGODB_NAME || 'i3wcarculture',
        collections: collectionNames,
        sampleData,
        timestamp: new Date().toISOString()
      });
    }

    // === DEFAULT RESPONSE WITH ALL ENDPOINTS ===
    return res.status(200).json({
      success: true,
      message: 'BW Car Culture API - Ready!',
      timestamp: new Date().toISOString(),
      origin: origin,
      endpoints: {
        // Listings
        'listings': 'GET /api/listings',
        'listings-featured': 'GET /api/listings/featured',
        'listings-dealer': 'GET /api/listings/dealer/{dealerId}',
        'listings-filters': 'GET /api/listings/filter-options',
        'listings-models': 'GET /api/listings/models?make={make}',
        'listing-detail': 'GET /api/listings/{id}',
        
        // Dealers  
        'dealers': 'GET /api/dealers',
        'dealers-all': 'GET /api/dealers/all',
        'dealer-detail': 'GET /api/dealers/{id}',
        
        // News
        'news': 'GET /api/news',
        'news-featured': 'GET /api/news/featured',
        'news-latest': 'GET /api/news/latest',
        'news-detail': 'GET /api/news/{id}',
        
        // Service Providers
        'providers': 'GET /api/providers',
        'providers-all': 'GET /api/providers/all',
        'provider-detail': 'GET /api/providers/{id}',
        
        // Rentals
        'rentals': 'GET /api/rentals',
        'rentals-featured': 'GET /api/rentals/featured',
        'rental-detail': 'GET /api/rentals/{id}',
        
        // Transport
        'transport': 'GET /api/transport',
        'transport-featured': 'GET /api/transport/featured',
        'transport-detail': 'GET /api/transport/{id}',
        
        // Analytics
        'analytics-track': 'POST /api/analytics/track',
        'analytics-dashboard': 'GET /api/analytics/dashboard',
        
        // Auth
        'auth-register': 'POST /api/auth/register',
        
        // System
        'health': 'GET /api/health'
      }
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
