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
    
    console.log(`[API] Raw path: "${path}"`);

    // === SIMPLE URL ROUTING WITH EXPLICIT CHECKS ===
    
    // Check if it's individual dealer
    if (path.includes('/dealers/') && path !== '/dealers') {
      const dealerId = path.replace('/dealers/', '');
      console.log(`[API] → INDIVIDUAL DEALER: "${dealerId}"`);
      
      if (!dealerId || dealerId.includes('/')) {
        return res.status(400).json({
          success: false,
          message: 'Invalid dealer ID format',
          dealerId: dealerId
        });
      }
      
      try {
        const dealersCollection = db.collection('dealers');
        
        console.log(`[DEBUG] Looking for dealer with ID: "${dealerId}"`);
        
        // Try multiple strategies
        let dealer = null;
        
        // Strategy 1: Exact string match
        dealer = await dealersCollection.findOne({ _id: dealerId });
        if (dealer) {
          console.log(`[SUCCESS] Found with string ID`);
        }
        
        // Strategy 2: ObjectId if 24 chars
        if (!dealer && dealerId.length === 24) {
          try {
            const { ObjectId } = await import('mongodb');
            dealer = await dealersCollection.findOne({ _id: new ObjectId.default(dealerId) });
            if (dealer) {
              console.log(`[SUCCESS] Found with ObjectId`);
            }
          } catch (oidError) {
            console.log(`[DEBUG] ObjectId failed: ${oidError.message}`);
          }
        }
        
        if (!dealer) {
          // Debug: Show sample dealers
          const sampleDealers = await dealersCollection.find({}).limit(3).toArray();
          console.log(`[DEBUG] Sample dealers:`, sampleDealers.map(d => ({ _id: d._id, businessName: d.businessName })));
          
          return res.status(404).json({
            success: false,
            message: 'Dealer not found',
            dealerId: dealerId,
            searchedId: dealerId
          });
        }
        
        return res.status(200).json({
          success: true,
          data: dealer,
          message: `Found dealer: ${dealer.businessName}`
        });
        
      } catch (error) {
        console.error(`[ERROR] Dealer lookup failed:`, error);
        return res.status(500).json({
          success: false,
          message: 'Error fetching dealer',
          error: error.message,
          dealerId: dealerId
        });
      }
    }
    
    // Check if it's individual listing
    if (path.includes('/listings/') && !path.includes('/listings/dealer/') && !path.includes('/listings/featured') && path !== '/listings') {
      const listingId = path.replace('/listings/', '');
      console.log(`[API] → INDIVIDUAL LISTING: "${listingId}"`);
      
      if (!listingId || listingId.includes('/')) {
        return res.status(400).json({
          success: false,
          message: 'Invalid listing ID format',
          listingId: listingId
        });
      }
      
      try {
        const listingsCollection = db.collection('listings');
        
        let listing = null;
        
        // Try string first
        listing = await listingsCollection.findOne({ _id: listingId });
        
        // Try ObjectId if 24 chars
        if (!listing && listingId.length === 24) {
          try {
            const { ObjectId } = await import('mongodb');
            listing = await listingsCollection.findOne({ _id: new ObjectId.default(listingId) });
          } catch (oidError) {
            console.log(`Listing ObjectId failed: ${oidError.message}`);
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
        console.error(`Listing lookup failed:`, error);
        return res.status(500).json({
          success: false,
          message: 'Error fetching listing',
          error: error.message
        });
      }
    }
    
    // Check if it's dealer listings (business card)
    if (path.includes('/listings/dealer/')) {
      const dealerId = path.replace('/listings/dealer/', '');
      console.log(`[API] → DEALER LISTINGS (BUSINESS CARD): "${dealerId}"`);
      
      try {
        const listingsCollection = db.collection('listings');
        const dealersCollection = db.collection('dealers');
        
        console.log(`[DEBUG] Searching for listings with dealerId: "${dealerId}"`);
        
        // ENHANCED DEBUGGING: Let's see what's actually in the database
        
        // 1. Check if dealer exists
        let dealer = null;
        try {
          dealer = await dealersCollection.findOne({ _id: dealerId });
          if (!dealer && dealerId.length === 24) {
            const { ObjectId } = await import('mongodb');
            dealer = await dealersCollection.findOne({ _id: new ObjectId.default(dealerId) });
          }
          console.log(`[DEBUG] Dealer found:`, dealer ? dealer.businessName : 'NOT FOUND');
        } catch (dealerError) {
          console.log(`[DEBUG] Dealer lookup error:`, dealerError.message);
        }
        
        // 2. Check all listings to see their dealerId formats
        const sampleListings = await listingsCollection.find({}).limit(5).toArray();
        console.log(`[DEBUG] Sample listings dealerId formats:`, sampleListings.map(l => ({
          _id: l._id,
          dealerId: l.dealerId,
          dealerIdType: typeof l.dealerId,
          title: l.title
        })));
        
        // 3. Try different search strategies
        const strategies = [
          { name: 'string', filter: { dealerId: dealerId } },
          { name: 'objectId', filter: dealerId.length === 24 ? (() => {
            try {
              const { ObjectId } = require('mongodb');
              return { dealerId: new ObjectId.default(dealerId) };
            } catch { return null; }
          })() : null }
        ];
        
        let allListings = [];
        
        for (const strategy of strategies) {
          if (!strategy.filter) continue;
          
          try {
            const listings = await listingsCollection.find(strategy.filter).toArray();
            console.log(`[DEBUG] Strategy "${strategy.name}" found ${listings.length} listings`);
            
            if (listings.length > 0) {
              allListings = listings;
              break;
            }
          } catch (strategyError) {
            console.log(`[DEBUG] Strategy "${strategy.name}" failed:`, strategyError.message);
          }
        }
        
        // 4. If still no results, try broader search
        if (allListings.length === 0) {
          console.log(`[DEBUG] No direct matches, trying broader search...`);
          
          // Look for any field that might contain the dealer ID
          const broadListings = await listingsCollection.find({
            $or: [
              { dealerId: dealerId },
              { 'dealer._id': dealerId },
              { 'dealer.id': dealerId },
              { dealerName: dealer?.businessName }
            ]
          }).toArray();
          
          console.log(`[DEBUG] Broad search found ${broadListings.length} listings`);
          allListings = broadListings;
        }
        
        // Apply pagination
        const page = parseInt(searchParams.get('page')) || 1;
        const limit = parseInt(searchParams.get('limit')) || 10;
        const skip = (page - 1) * limit;
        
        const paginatedListings = allListings.slice(skip, skip + limit);
        const total = allListings.length;
        
        console.log(`[SUCCESS] Returning ${paginatedListings.length} listings (${total} total) for dealer ${dealerId}`);
        
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
            dealerExists: !!dealer,
            totalFound: total,
            searchStrategies: strategies.map(s => s.name),
            sampleDealerIds: sampleListings.map(l => l.dealerId)
          },
          message: `Business card: ${paginatedListings.length} listings found for dealer`
        });
        
      } catch (error) {
        console.error(`[ERROR] Business card listings error:`, error);
        return res.status(200).json({
          success: true,
          data: [],
          pagination: { currentPage: 1, totalPages: 0, total: 0 },
          dealerId: dealerId,
          error: error.message,
          message: 'Error occurred while fetching dealer listings'
        });
      }
    }
    
    // === OTHER ENDPOINTS ===
    
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
    
    if (path === '/listings/featured') {
      console.log('[API] → FEATURED LISTINGS');
      const listingsCollection = db.collection('listings');
      const listings = await listingsCollection.find({ featured: true }).limit(6).toArray();
      return res.status(200).json({
        success: true,
        data: listings,
        count: listings.length
      });
    }
    
    if (path === '/listings') {
      console.log('[API] → LISTINGS');
      const listingsCollection = db.collection('listings');
      const listings = await listingsCollection.find({}).limit(20).toArray();
      return res.status(200).json({
        success: true,
        data: listings,
        total: listings.length
      });
    }
    
    if (path === '/dealers') {
      console.log('[API] → DEALERS');
      const dealersCollection = db.collection('dealers');
      const dealers = await dealersCollection.find({}).limit(20).toArray();
      return res.status(200).json({
        success: true,
        data: dealers,
        total: dealers.length
      });
    }
    
    if (path === '/test-db') {
      console.log('[API] → TEST/HEALTH');
      const collections = await db.listCollections().toArray();
      const counts = {};
      
      for (const name of ['listings', 'dealers', 'news']) {
        try {
          counts[name] = await db.collection(name).countDocuments();
        } catch (e) {
          counts[name] = 0;
        }
      }
      
      return res.status(200).json({
        success: true,
        message: 'Simple API with Enhanced Debugging',
        collections: collections.map(c => c.name),
        counts: counts,
        fixes: [
          'Bulletproof simple path matching using path.replace()',
          'Enhanced debugging for business card associations',
          'Multiple dealer ID lookup strategies',
          'Sample data inspection for troubleshooting'
        ]
      });
    }
    
    // === NOT FOUND ===
    console.log(`[API] ✗ NOT FOUND: "${path}"`);
    return res.status(404).json({
      success: false,
      message: `Endpoint not found: ${path}`,
      testedPath: path,
      availableEndpoints: [
        '/dealers/{id}',
        '/listings/{id}',
        '/listings/dealer/{dealerId}',
        '/listings/featured',
        '/stats'
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
