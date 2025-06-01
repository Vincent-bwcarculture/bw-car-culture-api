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
    
    console.log(`[${timestamp}] Processing path: "${path}"`);

    // === SIMPLIFIED FIX: DEALER LISTINGS ===
    if (path.includes('/listings/dealer/')) {
      // FIXED: Simpler, more permissive approach
      const dealerId = path.replace('/listings/dealer/', '').split('?')[0].trim();
      const callId = Math.random().toString(36).substr(2, 9);
      console.log(`[${timestamp}] [CALL-${callId}] → DEALER LISTINGS (SIMPLIFIED): "${dealerId}"`);
      
      try {
        const listingsCollection = db.collection('listings');
        
        // FIXED: Try multiple approaches without strict validation
        let allListings = [];
        let successMethod = 'none';
        
        // Method 1: Try as ObjectId (most likely to work)
        if (dealerId.length === 24) {
          try {
            const { ObjectId } = await import('mongodb');
            const dealerObjectId = new ObjectId.default(dealerId);
            const objectIdListings = await listingsCollection.find({ dealerId: dealerObjectId }).toArray();
            if (objectIdListings.length > 0) {
              allListings = objectIdListings;
              successMethod = 'objectId';
              console.log(`[${timestamp}] [CALL-${callId}] SUCCESS with ObjectId: ${objectIdListings.length} listings`);
            }
          } catch (oidError) {
            console.log(`[${timestamp}] [CALL-${callId}] ObjectId method failed: ${oidError.message}`);
          }
        }
        
        // Method 2: Try as string if ObjectId didn't work
        if (allListings.length === 0) {
          try {
            const stringListings = await listingsCollection.find({ dealerId: dealerId }).toArray();
            if (stringListings.length > 0) {
              allListings = stringListings;
              successMethod = 'string';
              console.log(`[${timestamp}] [CALL-${callId}] SUCCESS with string: ${stringListings.length} listings`);
            }
          } catch (stringError) {
            console.log(`[${timestamp}] [CALL-${callId}] String method failed: ${stringError.message}`);
          }
        }
        
        // Method 3: Try broader search if still no results
        if (allListings.length === 0) {
          try {
            const { ObjectId } = await import('mongodb');
            const broadFilter = {
              $or: [
                { dealerId: dealerId },
                { dealerId: new ObjectId.default(dealerId) },
                { 'dealer._id': dealerId },
                { 'dealer.id': dealerId }
              ]
            };
            const broadListings = await listingsCollection.find(broadFilter).toArray();
            allListings = broadListings;
            successMethod = 'broad';
            console.log(`[${timestamp}] [CALL-${callId}] Broad search result: ${broadListings.length} listings`);
          } catch (broadError) {
            console.log(`[${timestamp}] [CALL-${callId}] Broad search failed: ${broadError.message}`);
          }
        }
        
        // Apply pagination
        const page = parseInt(searchParams.get('page')) || 1;
        const limit = parseInt(searchParams.get('limit')) || 10;
        const skip = (page - 1) * limit;
        
        const paginatedListings = allListings.slice(skip, skip + limit);
        const total = allListings.length;
        
        console.log(`[${timestamp}] [CALL-${callId}] FINAL RESULT: ${paginatedListings.length} listings (${total} total) via ${successMethod}`);
        
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
            successMethod: successMethod,
            totalMatches: total
          },
          message: `Found ${paginatedListings.length} listings for dealer`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] [CALL-${callId}] DEALER LISTINGS ERROR:`, error);
        return res.status(500).json({
          success: false,
          message: 'Error fetching dealer listings',
          error: error.message,
          dealerId: dealerId,
          debug: { callId: callId, timestamp: timestamp }
        });
      }
    }

    // === KEEP ALL OTHER WORKING ENDPOINTS (SAME AS BEFORE) ===
    
    if (path.includes('/dealers/') && path !== '/dealers') {
      const dealerId = path.replace('/dealers/', '');
      console.log(`[${timestamp}] → INDIVIDUAL DEALER: "${dealerId}"`);
      
      try {
        const dealersCollection = db.collection('dealers');
        let dealer = null;
        
        dealer = await dealersCollection.findOne({ _id: dealerId });
        
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
    
    if (path === '/service-providers') {
      console.log(`[${timestamp}] → SERVICE-PROVIDERS`);
      
      try {
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
        
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: 'Error fetching service providers',
          error: error.message
        });
      }
    }
    
    if (path === '/stats') {
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
    
    if (path === '/news') {
      const newsCollection = db.collection('news');
      const articles = await newsCollection.find({}).limit(20).toArray();
      return res.status(200).json({
        success: true,
        data: articles,
        message: `Found ${articles.length} news articles`
      });
    }
    
    if (path === '/transport') {
      let transportCollection = db.collection('transportroutes');
      const routes = await transportCollection.find({}).limit(20).toArray();
      return res.status(200).json({
        success: true,
        data: routes,
        message: `Found ${routes.length} transport routes`
      });
    }
    
    if (path === '/rentals') {
      const rentalsCollection = db.collection('rentalvehicles');
      const vehicles = await rentalsCollection.find({}).limit(20).toArray();
      return res.status(200).json({
        success: true,
        data: vehicles,
        message: `Found ${vehicles.length} rental vehicles`
      });
    }
    
    if (path === '/test-db') {
      const collections = await db.listCollections().toArray();
      return res.status(200).json({
        success: true,
        message: 'Simplified dealer listings fix - removed strict validation',
        collections: collections.map(c => c.name),
        timestamp: timestamp
      });
    }
    
    console.log(`[${timestamp}] ✗ NOT FOUND: "${path}"`);
    return res.status(404).json({
      success: false,
      message: `Endpoint not found: ${path}`,
      timestamp: timestamp
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
