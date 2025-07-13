// api/user-services.js
// Separate API file for user listings, payments, and addons
import jwt from 'jsonwebtoken';
import { MongoClient, ObjectId } from 'mongodb';

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
    console.log('✅ Connected to MongoDB');
    return cachedDb;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
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

// Helper function to get user seller type
const getUserSellerType = async (db, userId) => {
  try {
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user) return 'private';
    
    // Check if user is a dealer
    const dealer = await db.collection('dealers').findOne({ user: new ObjectId(userId) });
    if (dealer) return 'dealer';
    
    // Check if user is a rental provider
    const rentalProvider = await db.collection('serviceProviders').findOne({ 
      user: new ObjectId(userId), 
      serviceType: 'rental' 
    });
    if (rentalProvider) return 'rental';
    
    return user.accountType || 'private';
  } catch (error) {
    console.error('Error getting seller type:', error);
    return 'private';
  }
};

// Subscription pricing configuration
const SUBSCRIPTION_PRICING = {
  private: {
    basic: { name: 'Basic Plan', price: 50, duration: 30, maxListings: 1 },
    standard: { name: 'Standard Plan', price: 100, duration: 30, maxListings: 1 },
    premium: { name: 'Premium Plan', price: 200, duration: 45, maxListings: 1 }
  },
  dealer: {
    starter: { name: 'Dealer Starter', price: 300, duration: 30, maxListings: 10 },
    professional: { name: 'Dealer Professional', price: 600, duration: 30, maxListings: 25 },
    enterprise: { name: 'Dealer Enterprise', price: 1200, duration: 30, maxListings: 100 }
  },
  rental: {
    basic: { name: 'Rental Basic', price: 400, duration: 30, maxListings: 15 },
    premium: { name: 'Rental Premium', price: 800, duration: 30, maxListings: 50 }
  }
};

// Add-on pricing configuration
const ADDON_PRICING = {
  private: {
    'featured-boost': { name: 'Featured Boost', price: 30, description: 'Feature your listing for 7 days' },
    'photo-session': { name: 'Professional Photos', price: 150, description: 'Professional car photography' },
    'video-showcase': { name: 'Video Showcase', price: 200, description: 'Professional video of your car' }
  },
  dealer: {
    'bulk-upload': { name: 'Bulk Upload Tool', price: 100, description: 'Upload multiple cars at once' },
    'analytics-pro': { name: 'Advanced Analytics', price: 50, description: 'Detailed performance insights' },
    'priority-support': { name: 'Priority Support', price: 75, description: '24/7 priority customer support' }
  },
  rental: {
    'calendar-sync': { name: 'Calendar Integration', price: 60, description: 'Sync with external calendars' },
    'insurance-addon': { name: 'Insurance Package', price: 120, description: 'Enhanced insurance coverage' },
    'maintenance-tracker': { name: 'Maintenance Tracking', price: 80, description: 'Track vehicle maintenance' }
  }
};

// Main handler function
export default async function handler(req, res) {
  const timestamp = new Date().toISOString();
  const { pathname: path } = new URL(req.url, `http://${req.headers.host}`);
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  console.log(`[${timestamp}] USER SERVICES: ${req.method} ${path}`);

  try {
    const db = await connectToDatabase();

    // ==================== USER LISTINGS SECTION ====================
    
    // Get user's listings
    if (path === '/api/user/listings' && req.method === 'GET') {
      const authResult = await verifyToken(req, res);
      if (!authResult.success) return;

      try {
        const listingsCollection = db.collection('listings');
        const page = parseInt(req.query?.page) || 1;
        const limit = parseInt(req.query?.limit) || 10;
        const skip = (page - 1) * limit;

        const filter = {
          $or: [
            { 'dealer.user': new ObjectId(authResult.userId) },
            { 'seller.user': new ObjectId(authResult.userId) },
            { dealerId: new ObjectId(authResult.userId) }
          ]
        };

        const [listings, total] = await Promise.all([
          listingsCollection.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray(),
          listingsCollection.countDocuments(filter)
        ]);

        return res.status(200).json({
          success: true,
          data: listings,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total: total,
            hasNext: page < Math.ceil(total / limit),
            hasPrev: page > 1
          },
          message: `Found ${listings.length} listings`
        });
      } catch (error) {
        console.error('Error fetching user listings:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch your listings'
        });
      }
    }

    // Get user listing statistics
    if (path === '/api/user/listings/stats' && req.method === 'GET') {
      const authResult = await verifyToken(req, res);
      if (!authResult.success) return;

      try {
        const listingsCollection = db.collection('listings');
        const filter = {
          $or: [
            { 'dealer.user': new ObjectId(authResult.userId) },
            { 'seller.user': new ObjectId(authResult.userId) },
            { dealerId: new ObjectId(authResult.userId) }
          ]
        };

        const [totalListings, activeListings, featuredListings, totalViews] = await Promise.all([
          listingsCollection.countDocuments(filter),
          listingsCollection.countDocuments({ ...filter, status: 'active' }),
          listingsCollection.countDocuments({ ...filter, featured: true }),
          listingsCollection.aggregate([
            { $match: filter },
            { $group: { _id: null, totalViews: { $sum: '$views' } } }
          ]).toArray()
        ]);

        return res.status(200).json({
          success: true,
          data: {
            totalListings,
            activeListings,
            featuredListings,
            totalViews: totalViews[0]?.totalViews || 0,
            inactiveListings: totalListings - activeListings
          }
        });
      } catch (error) {
        console.error('Error fetching listing stats:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch listing statistics'
        });
      }
    }

    // Update listing status
    if (path.startsWith('/api/user/listings/') && path.endsWith('/status') && req.method === 'PUT') {
      const authResult = await verifyToken(req, res);
      if (!authResult.success) return;

      try {
        const listingId = path.split('/')[4]; // Extract ID from path
        const { status } = req.body;

        if (!['active', 'inactive', 'sold'].includes(status)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid status. Must be: active, inactive, or sold'
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
      } catch (error) {
        console.error('Error updating listing status:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to update listing status'
        });
      }
    }

    // ==================== PAYMENTS SECTION ====================

    // Get available subscription tiers
    if (path === '/api/payments/available-tiers' && req.method === 'GET') {
      const authResult = await verifyToken(req, res);
      if (!authResult.success) return;

      try {
        const sellerType = await getUserSellerType(db, authResult.userId);
        const availableTiers = SUBSCRIPTION_PRICING[sellerType];

        return res.status(200).json({
          success: true,
          data: {
            sellerType,
            tiers: availableTiers,
            allowMultipleSubscriptions: sellerType === 'private',
            description: sellerType === 'private' ? 
              'Each subscription allows 1 car listing. You can subscribe multiple times for additional cars.' :
              sellerType === 'rental' ?
              'Manage your rental car fleet with booking calendar and availability tracking.' :
              'Choose a plan that fits your dealership size and needs.'
          }
        });
      } catch (error) {
        console.error('Error getting available tiers:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to get available tiers'
        });
      }
    }

    // Initiate payment
    if (path === '/api/payments/initiate' && req.method === 'POST') {
      const authResult = await verifyToken(req, res);
      if (!authResult.success) return;

      try {
        const { 
          listingId, 
          subscriptionTier, 
          addons = [], 
          paymentType,
          callbackUrl 
        } = req.body;

        if (!listingId) {
          return res.status(400).json({
            success: false,
            message: 'Listing ID is required'
          });
        }

        if (!paymentType || !['subscription', 'addon'].includes(paymentType)) {
          return res.status(400).json({
            success: false,
            message: 'Valid payment type is required (subscription or addon)'
          });
        }

        const userSellerType = await getUserSellerType(db, authResult.userId);
        let totalAmount = 0;
        let paymentDescription = '';
        let paymentMetadata = {};

        if (paymentType === 'subscription') {
          if (!subscriptionTier || !SUBSCRIPTION_PRICING[userSellerType]?.[subscriptionTier]) {
            return res.status(400).json({
              success: false,
              message: 'Valid subscription tier is required'
            });
          }

          const tierDetails = SUBSCRIPTION_PRICING[userSellerType][subscriptionTier];
          totalAmount = tierDetails.price;
          paymentDescription = `${tierDetails.name} - ${tierDetails.duration} days`;
          paymentMetadata = {
            subscriptionTier,
            tierDetails,
            maxListings: tierDetails.maxListings,
            duration: tierDetails.duration
          };
        } else {
          // Handle add-on payments
          const userAddons = ADDON_PRICING[userSellerType] || {};
          const addonDetails = [];

          for (const addonId of addons) {
            const addon = userAddons[addonId];
            if (!addon) {
              return res.status(400).json({
                success: false,
                message: `Invalid add-on ${addonId} for seller type ${userSellerType}`
              });
            }
            totalAmount += addon.price;
            addonDetails.push(addon);
          }

          paymentDescription = `Add-ons: ${addonDetails.map(a => a.name).join(', ')}`;
          paymentMetadata = {
            addons,
            addonDetails
          };
        }

        // Verify listing exists and belongs to user
        const listingsCollection = db.collection('listings');
        const listing = await listingsCollection.findOne({
          _id: new ObjectId(listingId),
          $or: [
            { 'dealer.user': new ObjectId(authResult.userId) },
            { 'seller.user': new ObjectId(authResult.userId) },
            { dealerId: new ObjectId(authResult.userId) }
          ]
        });

        if (!listing) {
          return res.status(404).json({
            success: false,
            message: 'Listing not found or access denied'
          });
        }

        // For subscriptions, check if listing already has active subscription
        if (paymentType === 'subscription' && 
            listing.subscription?.status === 'active' && 
            listing.subscription?.expiresAt && 
            new Date(listing.subscription.expiresAt) > new Date()) {
          return res.status(400).json({
            success: false,
            message: 'This listing already has an active subscription'
          });
        }

        // Create payment record
        const paymentsCollection = db.collection('payments');
        const payment = {
          user: new ObjectId(authResult.userId),
          listing: new ObjectId(listingId),
          type: paymentType,
          amount: totalAmount,
          description: paymentDescription,
          status: 'pending',
          sellerType: userSellerType,
          metadata: paymentMetadata,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        if (paymentType === 'subscription') {
          payment.subscriptionTier = subscriptionTier;
        }

        if (paymentType === 'addon') {
          payment.addons = addons;
        }

        const result = await paymentsCollection.insertOne(payment);

        // In a real implementation, you would integrate with a payment gateway here
        // For now, return payment information for manual processing
        return res.status(200).json({
          success: true,
          data: {
            paymentId: result.insertedId,
            amount: totalAmount,
            description: paymentDescription,
            type: paymentType,
            // In production, you would return payment gateway URL/token here
            paymentUrl: `${callbackUrl || '/dashboard/payments'}?payment=${result.insertedId}`,
            instructions: 'Please contact support to complete payment processing'
          },
          message: 'Payment initiated successfully'
        });

      } catch (error) {
        console.error('Payment initiation error:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to initiate payment'
        });
      }
    }

    // Get payment history
    if (path === '/api/payments/history' && req.method === 'GET') {
      const authResult = await verifyToken(req, res);
      if (!authResult.success) return;

      try {
        const paymentsCollection = db.collection('payments');
        const page = parseInt(req.query?.page) || 1;
        const limit = parseInt(req.query?.limit) || 10;
        const skip = (page - 1) * limit;

        const [payments, total] = await Promise.all([
          paymentsCollection.find({ user: new ObjectId(authResult.userId) })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray(),
          paymentsCollection.countDocuments({ user: new ObjectId(authResult.userId) })
        ]);

        return res.status(200).json({
          success: true,
          data: payments,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total: total
          }
        });
      } catch (error) {
        console.error('Payment history error:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch payment history'
        });
      }
    }

    // ==================== ADDONS SECTION ====================

    // Get available add-ons
    if (path === '/api/addons/available' && req.method === 'GET') {
      const authResult = await verifyToken(req, res);
      if (!authResult.success) return;

      try {
        const sellerType = await getUserSellerType(db, authResult.userId);
        const availableAddons = ADDON_PRICING[sellerType] || {};

        return res.status(200).json({
          success: true,
          data: {
            sellerType,
            addons: availableAddons,
            whatsappNumber: '+26774122453'
          }
        });
      } catch (error) {
        console.error('Error getting available add-ons:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to get available add-ons'
        });
      }
    }

    // Purchase add-on
    if (path === '/api/addons/purchase' && req.method === 'POST') {
      const authResult = await verifyToken(req, res);
      if (!authResult.success) return;

      try {
        const { listingId, addonIds } = req.body;

        if (!listingId || !addonIds || !Array.isArray(addonIds)) {
          return res.status(400).json({
            success: false,
            message: 'Listing ID and addon IDs array are required'
          });
        }

        const sellerType = await getUserSellerType(db, authResult.userId);
        const availableAddons = ADDON_PRICING[sellerType] || {};

        // Validate all addon IDs
        const purchasedAddons = [];
        let totalCost = 0;

        for (const addonId of addonIds) {
          const addon = availableAddons[addonId];
          if (!addon) {
            return res.status(400).json({
              success: false,
              message: `Invalid add-on: ${addonId}`
            });
          }
          purchasedAddons.push({ id: addonId, ...addon });
          totalCost += addon.price;
        }

        // Verify listing ownership
        const listingsCollection = db.collection('listings');
        const listing = await listingsCollection.findOne({
          _id: new ObjectId(listingId),
          $or: [
            { 'dealer.user': new ObjectId(authResult.userId) },
            { 'seller.user': new ObjectId(authResult.userId) },
            { dealerId: new ObjectId(authResult.userId) }
          ]
        });

        if (!listing) {
          return res.status(404).json({
            success: false,
            message: 'Listing not found or access denied'
          });
        }

        // Create addon purchase record
        const addonPurchasesCollection = db.collection('addonPurchases');
        const purchase = {
          user: new ObjectId(authResult.userId),
          listing: new ObjectId(listingId),
          addons: purchasedAddons,
          totalCost,
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date()
        };

        const result = await addonPurchasesCollection.insertOne(purchase);

        return res.status(200).json({
          success: true,
          data: {
            purchaseId: result.insertedId,
            addons: purchasedAddons,
            totalCost,
            status: 'pending'
          },
          message: 'Add-on purchase initiated. Please contact support to complete payment.'
        });

      } catch (error) {
        console.error('Add-on purchase error:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to purchase add-ons'
        });
      }
    }

    // Get user's purchased add-ons
    if (path === '/api/addons/my-addons' && req.method === 'GET') {
      const authResult = await verifyToken(req, res);
      if (!authResult.success) return;

      try {
        const addonPurchasesCollection = db.collection('addonPurchases');
        const purchases = await addonPurchasesCollection.find({
          user: new ObjectId(authResult.userId)
        }).sort({ createdAt: -1 }).toArray();

        return res.status(200).json({
          success: true,
          data: purchases
        });
      } catch (error) {
        console.error('Error fetching user add-ons:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch your add-ons'
        });
      }
    }

    // Handle undefined routes
    return res.status(404).json({
      success: false,
      message: `Route not found: ${path}`
    });

  } catch (error) {
    console.error(`[${timestamp}] User services error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
