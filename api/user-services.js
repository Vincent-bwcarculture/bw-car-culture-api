// api/user-services.js
// Step 1: Add authentication only (no database yet)

export default async function handler(req, res) {
  const path = req.url.split('?')[0];
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Simple auth check (no JWT verification yet)
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'No token provided'
    });
  }

  // Mock auth success for now
  const mockUserId = 'mock-user-id';

  try {
    // ==================== PAYMENTS ENDPOINTS ====================

    if (path === '/api/payments/available-tiers' && req.method === 'GET') {
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
          description: 'Each subscription allows 1 car listing. You can subscribe multiple times for additional cars.',
          source: 'user-services.js - SIMPLE AUTH',
          userId: mockUserId
        }
      });
    }

    if (path === '/api/payments/initiate' && req.method === 'POST') {
      const { listingId, subscriptionTier, paymentType } = req.body;

      if (!listingId) {
        return res.status(400).json({
          success: false,
          message: 'Listing ID is required'
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          paymentId: 'mock-payment-id',
          amount: 50,
          type: paymentType || 'subscription',
          status: 'pending',
          userId: mockUserId
        },
        message: 'Payment initiated successfully (mock)',
        source: 'user-services.js - SIMPLE AUTH'
      });
    }

    if (path === '/api/payments/history' && req.method === 'GET') {
      return res.status(200).json({
        success: true,
        data: [],
        message: 'Payment history (mock - empty)',
        source: 'user-services.js - SIMPLE AUTH',
        userId: mockUserId
      });
    }

    // ==================== ADDONS ENDPOINTS ====================

    if (path === '/api/addons/available' && req.method === 'GET') {
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
          whatsappNumber: '+26774122453',
          source: 'user-services.js - SIMPLE AUTH',
          userId: mockUserId
        }
      });
    }

    if (path === '/api/addons/purchase' && req.method === 'POST') {
      const { listingId, addonIds } = req.body;

      if (!listingId || !addonIds) {
        return res.status(400).json({
          success: false,
          message: 'Listing ID and addon IDs are required'
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          purchaseId: 'mock-purchase-id',
          addons: addonIds,
          totalCost: 100,
          status: 'pending',
          userId: mockUserId
        },
        message: 'Add-on purchase initiated (mock)',
        source: 'user-services.js - SIMPLE AUTH'
      });
    }

    if (path === '/api/addons/my-addons' && req.method === 'GET') {
      return res.status(200).json({
        success: true,
        data: [],
        message: 'My add-ons (mock - empty)',
        source: 'user-services.js - SIMPLE AUTH',
        userId: mockUserId
      });
    }

    // ==================== USER ENDPOINTS ====================

    if (path === '/api/user/vehicles' && req.method === 'GET') {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
        message: 'User vehicles (mock - empty)',
        source: 'user-services.js - SIMPLE AUTH',
        userId: mockUserId
      });
    }

    if (path === '/api/user/listings' && req.method === 'GET') {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: {
          currentPage: 1,
          totalPages: 1,
          total: 0
        },
        message: 'User listings (mock - empty)',
        source: 'user-services.js - SIMPLE AUTH',
        userId: mockUserId
      });
    }

    if (path === '/api/user/listings/stats' && req.method === 'GET') {
      return res.status(200).json({
        success: true,
        data: {
          totalListings: 0,
          activeListings: 0,
          featuredListings: 0,
          totalViews: 0,
          inactiveListings: 0
        },
        message: 'User listing stats (mock)',
        source: 'user-services.js - SIMPLE AUTH',
        userId: mockUserId
      });
    }

    // Handle listing status updates
    if (path.match(/^\/api\/user\/listings\/[a-f\d]{24}\/status$/) && req.method === 'PUT') {
      return res.status(200).json({
        success: true,
        message: 'Listing status updated (mock)',
        source: 'user-services.js - SIMPLE AUTH',
        userId: mockUserId
      });
    }

    // ==================== FALLBACK ====================
    
    return res.status(404).json({
      success: false,
      message: `Route not found: ${path} (${req.method})`,
      source: 'user-services.js - SIMPLE AUTH',
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
      error: error.message,
      source: 'user-services.js - SIMPLE AUTH'
    });
  }
}