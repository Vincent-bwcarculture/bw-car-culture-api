// api/user-services.js
// Working version with all endpoints

const jwt = require('jsonwebtoken');
const { MongoClient, ObjectId } = require('mongodb');

// Database connection
let cachedDb = null;
let client = null;

const connectToDatabase = async () => {
  if (cachedDb) return cachedDb;
  
  try {
    if (!client) {
      client = new MongoClient(process.env.MONGODB_URI, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      await client.connect();
    }
    
    cachedDb = client.db(process.env.DB_NAME || 'carculture');
    return cachedDb;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
};

// Authentication middleware
const verifyToken = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const db = await connectToDatabase();
    const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.id) });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    return { success: true, userId: user._id.toString(), user };
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

export default async function handler(req, res) {
  const path = req.url.split('?')[0];
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const db = await connectToDatabase();

    // ==================== PAYMENTS ENDPOINTS ====================

    if (path === '/api/payments/available-tiers' && req.method === 'GET') {
      const authResult = await verifyToken(req, res);
      if (!authResult.success) return;

      return res.status(200).json({
        success: true,
        data: {
          sellerType: 'private',
          tiers: {
            basic: { 
              name: 'Basic Plan', 
              price: 50, 
              duration: 30, 
              maxListings: 1,
              features: ['1 Car Listing', 'Basic Support', '30 Days Active']
            },
            standard: { 
              name: 'Standard Plan', 
              price: 100, 
              duration: 30, 
              maxListings: 1,
              features: ['1 Car Listing', 'Priority Support', '30 Days Active', 'Enhanced Visibility']
            },
            premium: { 
              name: 'Premium Plan', 
              price: 200, 
              duration: 45, 
              maxListings: 1,
              features: ['1 Car Listing', 'Premium Support', '45 Days Active', 'Featured Placement']
            }
          },
          allowMultipleSubscriptions: true,
          description: 'Each subscription allows 1 car listing. You can subscribe multiple times for additional cars.'
        }
      });
    }

    if (path === '/api/payments/initiate' && req.method === 'POST') {
      const authResult = await verifyToken(req, res);
      if (!authResult.success) return;

      const { listingId, subscriptionTier, paymentType } = req.body;

      if (!listingId) {
        return res.status(400).json({
          success: false,
          message: 'Listing ID is required'
        });
      }

      // Create payment record
      const paymentsCollection = db.collection('payments');
      const payment = {
        user: new ObjectId(authResult.userId),
        listing: new ObjectId(listingId),
        type: paymentType || 'subscription',
        amount: 50,
        status: 'pending',
        createdAt: new Date()
      };

      const result = await paymentsCollection.insertOne(payment);

      return res.status(200).json({
        success: true,
        data: {
          paymentId: result.insertedId,
          amount: 50,
          type: paymentType || 'subscription',
          status: 'pending'
        },
        message: 'Payment initiated successfully'
      });
    }

    if (path === '/api/payments/history' && req.method === 'GET') {
      const authResult = await verifyToken(req, res);
      if (!authResult.success) return;

      const paymentsCollection = db.collection('payments');
      const payments = await paymentsCollection.find({ 
        user: new ObjectId(authResult.userId) 
      }).sort({ createdAt: -1 }).toArray();

      return res.status(200).json({
        success: true,
        data: payments
      });
    }

    // ==================== ADDONS ENDPOINTS ====================

    if (path === '/api/addons/available' && req.method === 'GET') {
      const authResult = await verifyToken(req, res);
      if (!authResult.success) return;

      return res.status(200).json({
        success: true,
        data: {
          sellerType: 'private',
          addons: {
            'featured-boost': { 
              name: 'Featured Boost', 
              price: 30, 
              description: 'Feature your listing for 7 days'
            },
            'photo-session': { 
              name: 'Professional Photos', 
              price: 150, 
              description: 'Professional car photography session'
            },
            'video-showcase': { 
              name: 'Video Showcase', 
              price: 200, 
              description: 'Professional video of your car'
            }
          },
          whatsappNumber: '+26774122453'
        }
      });
    }

    if (path === '/api/addons/purchase' && req.method === 'POST') {
      const authResult = await verifyToken(req, res);
      if (!authResult.success) return;

      const { listingId, addonIds } = req.body;

      if (!listingId || !addonIds) {
        return res.status(400).json({
          success: false,
          message: 'Listing ID and addon IDs are required'
        });
      }

      // Create addon purchase record
      const addonPurchasesCollection = db.collection('addonPurchases');
      const purchase = {
        user: new ObjectId(authResult.userId),
        listing: new ObjectId(listingId),
        addons: addonIds,
        totalCost: 100,
        status: 'pending',
        createdAt: new Date()
      };

      const result = await addonPurchasesCollection.insertOne(purchase);

      return res.status(200).json({
        success: true,
        data: {
          purchaseId: result.insertedId,
          addons: addonIds,
          totalCost: 100,
          status: 'pending'
        },
        message: 'Add-on purchase initiated'
      });
    }

    if (path === '/api/addons/my-addons' && req.method === 'GET') {
      const authResult = await verifyToken(req, res);
      if (!authResult.success) return;

      const addonPurchasesCollection = db.collection('addonPurchases');
      const purchases = await addonPurchasesCollection.find({
        user: new ObjectId(authResult.userId)
      }).sort({ createdAt: -1 }).toArray();

      return res.status(200).json({
        success: true,
        data: purchases
      });
    }

    // ==================== USER ENDPOINTS ====================

    if (path === '/api/user/vehicles' && req.method === 'GET') {
      const authResult = await verifyToken(req, res);
      if (!authResult.success) return;

      const listingsCollection = db.collection('listings');
      const vehicles = await listingsCollection.find({ 
        $or: [
          { 'dealer.user': new ObjectId(authResult.userId) },
          { 'seller.user': new ObjectId(authResult.userId) },
          { dealerId: new ObjectId(authResult.userId) }
        ]
      }).sort({ createdAt: -1 }).toArray();

      return res.status(200).json({
        success: true,
        count: vehicles.length,
        data: vehicles || []
      });
    }

    if (path === '/api/user/listings' && req.method === 'GET') {
      const authResult = await verifyToken(req, res);
      if (!authResult.success) return;

      const listingsCollection = db.collection('listings');
      const listings = await listingsCollection.find({
        $or: [
          { 'dealer.user': new ObjectId(authResult.userId) },
          { 'seller.user': new ObjectId(authResult.userId) },
          { dealerId: new ObjectId(authResult.userId) }
        ]
      }).sort({ createdAt: -1 }).toArray();

      return res.status(200).json({
        success: true,
        data: listings,
        pagination: {
          currentPage: 1,
          totalPages: 1,
          total: listings.length
        },
        message: `Found ${listings.length} listings`
      });
    }

    if (path === '/api/user/listings/stats' && req.method === 'GET') {
      const authResult = await verifyToken(req, res);
      if (!authResult.success) return;

      const listingsCollection = db.collection('listings');
      const filter = {
        $or: [
          { 'dealer.user': new ObjectId(authResult.userId) },
          { 'seller.user': new ObjectId(authResult.userId) },
          { dealerId: new ObjectId(authResult.userId) }
        ]
      };

      const [totalListings, activeListings, featuredListings] = await Promise.all([
        listingsCollection.countDocuments(filter),
        listingsCollection.countDocuments({ ...filter, status: 'active' }),
        listingsCollection.countDocuments({ ...filter, featured: true })
      ]);

      return res.status(200).json({
        success: true,
        data: {
          totalListings,
          activeListings,
          featuredListings,
          totalViews: 0,
          inactiveListings: totalListings - activeListings
        }
      });
    }

    // Handle listing status updates
    if (path.match(/^\/api\/user\/listings\/[a-f\d]{24}\/status$/) && req.method === 'PUT') {
      const authResult = await verifyToken(req, res);
      if (!authResult.success) return;

      const listingId = path.split('/')[4];
      const { status } = req.body;

      if (!['active', 'inactive', 'sold'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status'
        });
      }

      const listingsCollection = db.collection('listings');
      const result = await listingsCollection.updateOne(
        {
          _id: new ObjectId(listingId),
          $or: [
            { 'dealer.user': new ObjectId(authResult.userId) },
            { 'seller.user': new ObjectId(authResult.userId) },
            { dealerId: new ObjectId(authResult.userId) }
          ]
        },
        {
          $set: {
            status: status,
            updatedAt: new Date()
          }
        }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'Listing not found or access denied'
        });
      }

      return res.status(200).json({
        success: true,
        message: `Listing status updated to ${status}`
      });
    }

    // ==================== FALLBACK ====================
    
    return res.status(404).json({
      success: false,
      message: `Route not found: ${path} (${req.method})`,
      availableRoutes: [
        'GET /api/payments/available-tiers',
        'POST /api/payments/initiate',
        'GET /api/payments/history',
        'GET /api/addons/available',
        'POST /api/addons/purchase',
        'GET /api/addons/my-addons',
        'GET /api/user/vehicles',
        'GET /api/user/listings',
        'GET /api/user/listings/stats',
        'PUT /api/user/listings/{id}/status'
      ]
    });

  } catch (error) {
    console.error('USER-SERVICES ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}