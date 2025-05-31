// server/routes/listingRoutes.js - Complete Enhanced Version with Savings Integration
import express from 'express';
import { protect, authorize, optionalAuth } from '../middleware/auth.js';
import { advancedResults } from '../middleware/advancedResults.js';
import multer from 'multer';
import Listing from '../models/Listing.js';
import Dealer from '../models/Dealer.js';
import mongoose from 'mongoose';
import { debugImageUpload } from '../utils/uploadDiagnostics.js';
import { deleteFromS3, deleteImageWithThumbnail } from '../utils/s3Delete.js';
import { uploadMultipleImagesToS3 } from '../utils/s3Upload.js';
// Add the missing import for s3Config
import { s3, s3Config } from '../config/s3.js';
import {
  createListing,
  getListings,
  getListing,
  updateListing,
  deleteListing,
  getFeaturedListings,
  getDealerListings,
  getSimilarListings,
  getFilterOptions,
  getModelsByMake,
  updateListingStatus,
  toggleFeatured,
  toggleSaveListing,
  incrementViewCount,
  testConnection,
  bulkDeleteListings,
  bulkUpdateStatus,
  // NEW: Import savings-related functions
  getListingsWithSavings,
  checkSavingsValidity
} from '../controllers/listingController.js';

const router = express.Router();

// Configure multer for file uploads to memory (for S3)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Debug middleware
const debugRequest = (req, res, next) => {
  console.log('\n=== REQUEST DEBUG ===');
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Is multipart:', req.headers['content-type']?.includes('multipart/form-data'));
  console.log('Method:', req.method);
  console.log('URL:', req.originalUrl);
  console.log('=====================\n');
  next();
};

// Pre-upload logger
const preUploadLogger = (req, res, next) => {
  console.log('\n=== PRE-UPLOAD MIDDLEWARE ===');
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Content-Length:', req.headers['content-length']);
  console.log('Body keys:', Object.keys(req.body || {}));
  console.log('=============================\n');
  next();
};

// Post-upload logger
const postUploadLogger = (req, res, next) => {
  console.log('\n=== POST-UPLOAD MIDDLEWARE ===');
  console.log('Files received:', req.files?.length || 0);
  if (req.files && req.files.length > 0) {
    req.files.forEach((file, index) => {
      console.log(`File ${index}:`, {
        name: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        buffer: file.buffer ? 'present' : 'missing'
      });
    });
  } else {
    console.log('No files received by multer middleware');
  }
  console.log('==============================\n');
  next();
};

// NEW: Location-based search endpoint for transport integration
router.get('/locations', async (req, res) => {
  try {
    // Get unique locations from listings
    const locations = await Listing.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: null,
          cities: { $addToSet: '$location.city' },
          states: { $addToSet: '$location.state' },
          countries: { $addToSet: '$location.country' },
          dealerCities: { $addToSet: '$dealer.location.city' }
        }
      }
    ]);

    if (!locations || locations.length === 0) {
      return res.status(200).json({
        success: true,
        data: { cities: [], states: [], countries: [] }
      });
    }

    // Combine and deduplicate location data
    const allCities = [...new Set([
      ...locations[0].cities,
      ...locations[0].dealerCities
    ])].filter(Boolean).sort();

    const result = {
      cities: allCities,
      states: locations[0].states.filter(Boolean).sort(),
      countries: locations[0].countries.filter(Boolean).sort()
    };

    res.status(200).json({
      success: true,
      count: allCities.length,
      data: result
    });
  } catch (error) {
    console.error('Error fetching listing locations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch listing locations',
      error: error.message
    });
  }
});

// NEW: Search listings by destination city (for transport integration)
router.get('/by-destination/:city', async (req, res) => {
  try {
    const { city } = req.params;
    const { limit = 6, page = 1, status = 'active' } = req.query;
    
    console.log(`Searching car listings in destination city: ${city}`);
    
    // Create location filter for the specific city
    const cityRegex = new RegExp(city, 'i');
    const query = {
      status: status,
      $or: [
        { 'location.city': cityRegex },
        { 'location.state': cityRegex },
        { 'location.address': cityRegex },
        // Also search in dealer location if available
        { 'dealer.location.city': cityRegex },
        { 'dealer.location.state': cityRegex },
        { 'dealer.location.country': cityRegex }
      ]
    };
    
    // Calculate pagination
    const startIndex = (page - 1) * limit;
    const total = await Listing.countDocuments(query);
    
    // Execute query
    const listings = await Listing.find(query)
      .sort('-createdAt')
      .skip(startIndex)
      .limit(parseInt(limit));
    
    console.log(`Found ${listings.length} car listings in ${city}`);
    
    // Create pagination object
    const pagination = {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      total
    };
    
    res.status(200).json({
      success: true,
      pagination,
      count: listings.length,
      total,
      data: listings
    });
  } catch (error) {
    console.error(`Error fetching listings for destination ${req.params.city}:`, error);
    res.status(500).json({
      success: false,
      message: `Failed to fetch car listings for destination: ${req.params.city}`,
      error: error.message
    });
  }
});

// Test route
router.get('/test', (req, res) => {
  res.status(200).json({ message: 'Listing routes loaded successfully' });
});

// Test API route for authentication verification
router.get('/test-api', protect, testConnection);

// Diagnostic route for dealer listings
router.get('/debug-dealer-listings/:dealerId', async (req, res) => {
  try {
    const dealerId = req.params.dealerId;
    console.log(`Debug request for dealer ID: ${dealerId}`);
    
    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    
    const rawListings = await Listing.find();
    console.log(`Total listings in database: ${rawListings.length}`);
    
    const exactMatchListings = await Listing.find({ dealerId: dealerId });
    console.log(`Listings with exact dealerId match: ${exactMatchListings.length}`);
    
    const stringMatchListings = await Listing.find({ 
      dealerId: { $in: [dealerId, dealerId.toString()] } 
    });
    console.log(`Listings with string/ObjectId match: ${stringMatchListings.length}`);
    
    const userMatches = await Listing.find({ dealerId: dealer.user });
    console.log(`Listings matching dealer's user ID: ${userMatches.length}`);
    
    return res.status(200).json({
      success: true,
      dealer: {
        id: dealer._id,
        businessName: dealer.businessName,
        userId: dealer.user
      },
      diagnostics: {
        totalListings: rawListings.length,
        exactMatches: exactMatchListings.length,
        stringMatches: stringMatchListings.length,
        userMatches: userMatches.length
      },
      listings: {
        exactMatches: exactMatchListings.map(l => ({
          id: l._id,
          title: l.title,
          dealerId: l.dealerId,
          dealerIdType: typeof l.dealerId
        })),
        userMatches: userMatches.map(l => ({
          id: l._id,
          title: l.title,
          dealerId: l.dealerId,
          dealerIdType: typeof l.dealerId
        }))
      }
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error in debug endpoint',
      error: error.message
    });
  }
});

// Diagnostic route for testing uploads with S3
router.post('/diagnose-upload', 
  protect, 
  authorize('admin'), 
  debugRequest,
  preUploadLogger,
  debugImageUpload,
  upload.array('images', 10), 
  postUploadLogger,
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No files uploaded'
        });
      }

      const uploadResults = await uploadMultipleImagesToS3(req.files, 'listings', {
        optimization: {
          quality: 85,
          format: 'webp'
        },
        createThumbnail: true
      });

      res.status(200).json({
        success: true,
        message: 'Upload diagnostics complete',
        filesReceived: req.files?.length || 0,
        bodyKeys: Object.keys(req.body),
        s3Results: uploadResults.map(result => ({
          url: result.url,
          thumbnail: result.thumbnail?.url,
          size: result.size
        }))
      });
    } catch (error) {
      console.error('S3 upload test failed:', error);
      res.status(500).json({
        success: false,
        message: 'S3 upload test failed',
        error: error.message
      });
    }
  }
);

// Test image upload route
router.post('/test-image-upload', 
  protect, 
  authorize('admin'), 
  debugImageUpload,
  upload.single('testImage'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No test image provided'
        });
      }
      
      const result = await uploadMultipleImagesToS3([req.file], 'listings', {
        optimization: {
          quality: 85,
          format: 'webp'
        },
        createThumbnail: true
      });
      
      res.status(200).json({
        success: true,
        message: 'Image upload test successful',
        image: result[0]
      });
    } catch (error) {
      console.error('Test image upload failed:', error);
      res.status(500).json({
        success: false,
        message: 'Test image upload failed',
        error: error.message
      });
    }
  }
);

// Route verification
router.get('/verify-routes', async (req, res) => {
  const routes = [
    { path: '/listings', methods: ['GET', 'POST'] },
    { path: '/listings/:id', methods: ['GET', 'PUT', 'DELETE'] },
    { path: '/listings/featured', methods: ['GET'] },
    { path: '/listings/dealer/:dealerId', methods: ['GET'] },
    { path: '/listings/savings', methods: ['GET'] }, // NEW
    { path: '/listings/:id/savings-validity', methods: ['GET'] } // NEW
  ];

  res.status(200).json({
    status: 'success',
    routes
  });
});

// Bulk delete endpoint
router.delete(
  '/dealer/:dealerId/all',
  protect,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const { dealerId } = req.params;
      
      const listings = await Listing.find({ dealerId });
      
      if (listings.length === 0) {
        return res.status(200).json({
          success: true,
          message: `No listings found for dealer ${dealerId}`,
          count: 0
        });
      }
      
      const count = listings.length;
      
      // Delete images from S3
      for (const listing of listings) {
        if (listing.images && listing.images.length > 0) {
          for (const image of listing.images) {
            const imageUrl = typeof image === 'string' ? image : image.url;
            if (imageUrl) {
              try {
                await deleteImageWithThumbnail(imageUrl);
              } catch (error) {
                console.warn(`Failed to delete image from S3: ${imageUrl}`, error);
              }
            }
          }
        }
      }
      
      await Listing.deleteMany({ dealerId });
      
      const dealer = await Dealer.findById(dealerId);
      if (dealer) {
        dealer.metrics.totalListings = 0;
        dealer.metrics.activeSales = 0;
        await dealer.save();
      }
      
      res.status(200).json({
        success: true,
        message: `Successfully deleted ${count} listings for dealer ${dealerId}`,
        count
      });
    } catch (error) {
      console.error(`Error in bulk delete listings: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: `Error deleting listings: ${error.message}`
      });
    }
  }
);

// =============================================================================
// PUBLIC ROUTES (No authentication required)
// =============================================================================

// Basic listings endpoint with optional authentication
router.get('/', optionalAuth, advancedResults(Listing), getListings);

// Featured listings
router.get('/featured', optionalAuth, getFeaturedListings);

// NEW: Listings with savings deals - Public access
router.get('/savings', getListingsWithSavings);

// Filter options for search
router.get('/filter-options', getFilterOptions);

// Get models by make
router.get('/models', getModelsByMake);

// Dealer listings - Public access
router.get('/dealer/:dealerId', optionalAuth, getDealerListings);

// Similar listings - Public access  
router.get('/:id/similar', optionalAuth, getSimilarListings);

// NEW: Check savings validity - Public access
router.get('/:id/savings-validity', checkSavingsValidity);

// Single listing - Public access (must be after other specific routes)
router.get('/:id', optionalAuth, getListing);

// =============================================================================
// PROTECTED ROUTES (Authentication required)
// =============================================================================

// View count increment - Public access
router.post('/:id/views', incrementViewCount);

// Create new listing - Admin only
router.post('/', 
  // CORS middleware specifically for file uploads
  (req, res, next) => {
    // Handle CORS for multipart/form-data
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    next();
  },
  // Authentication middleware
  protect,
  authorize('admin'),
  // Debug logging
  debugRequest,
  preUploadLogger,
  // Handle file uploads based on content-type
  (req, res, next) => {
    // Check if it's a multipart request
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      console.log('Multipart request detected, applying multer middleware');
      // Use multer for multipart requests
      upload.array('images', 10)(req, res, (err) => {
        if (err) {
          console.error('Multer upload error:', err);
          return res.status(400).json({
            success: false,
            message: `File upload failed: ${err.message}`
          });
        }
        next();
      });
    } else {
      console.log('JSON request detected, skipping multer middleware');
      // For JSON requests, parse the body normally
      next();
    }
  },
  postUploadLogger,
  // S3 upload and listing creation
  async (req, res, next) => {
    try {
      // Verify S3 configuration
      if (s3Config && !s3Config.enabled) {
        console.warn('⚠️ S3 is not enabled but attempting to use it. Check AWS credentials.');
      }

      // Handle S3 upload for images
      if (req.files && req.files.length > 0) {
        console.log(`Uploading ${req.files.length} images to S3 folder: listings`);
        
        // Log file details for debugging
        req.files.forEach((file, index) => {
          console.log(`File ${index+1}/${req.files.length}: ${file.originalname} (${file.size} bytes, ${file.mimetype})`);
        });
        
        // Use the updated S3 upload function with better error handling
        try {
          const uploadResults = await uploadMultipleImagesToS3(req.files, 'listings', {
            optimization: {
              quality: 85,
              format: 'webp'
            },
            createThumbnail: true
          });
          
          console.log(`✅ S3 upload successful. ${uploadResults.length} images uploaded.`);
          
          // Add S3 URLs to request
          req.s3Images = uploadResults.map((result, index) => ({
            url: result.url,
            thumbnail: result.thumbnail,
            key: result.key,
            size: result.size,
            mimetype: result.mimetype,
            isPrimary: req.body.primaryImage ? parseInt(req.body.primaryImage) === index : index === 0
          }));
          
          console.log('Example image URL:', req.s3Images[0]?.url);
        } catch (uploadError) {
          console.error('❌ S3 upload failed:', uploadError);
          return res.status(500).json({
            success: false,
            message: `Image upload to S3 failed: ${uploadError.message}`,
            error: uploadError.message
          });
        }
      } else if (req.body.listingData) {
        // Handle case where images are already provided in request body
        try {
          const listingData = typeof req.body.listingData === 'string' 
            ? JSON.parse(req.body.listingData) 
            : req.body.listingData;
            
          if (listingData.images && listingData.images.length > 0) {
            console.log(`Using ${listingData.images.length} pre-uploaded images from request body`);
          } else {
            console.warn('No images found in listingData');
          }
        } catch (parseError) {
          console.error('Error parsing listing data:', parseError);
        }
      } else {
        console.warn('No files or pre-uploaded images found in request');
      }
      
      // Call the listing controller
      createListing(req, res, next);
    } catch (error) {
      console.error('Error in listing creation route:', error);
      res.status(500).json({
        success: false,
        message: `Failed to create listing: ${error.message}`,
        error: error.message
      });
    }
  }
);

// Update listing - Admin only
router.put(
  '/:id',
  protect,
  authorize('admin'),
  debugRequest,
  preUploadLogger,
  (req, res, next) => {
    // Check if it's a multipart request
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      console.log('Multipart request detected, using multer');
      // Use multer for multipart requests
      upload.array('images', 10)(req, res, next);
    } else {
      console.log('JSON request detected, skipping multer');
      // For JSON requests, parse the body normally
      next();
    }
  },
  postUploadLogger,
  async (req, res, next) => {
    try {
      // Handle S3 upload for new images
      if (req.files && req.files.length > 0) {
        console.log('Uploading new images to S3...');
        const uploadResults = await uploadMultipleImagesToS3(req.files, 'listings', {
          optimization: {
            quality: 85,
            format: 'webp'
          },
          createThumbnail: true
        });
        
        // Add S3 URLs to request
        req.s3Images = uploadResults.map(result => ({
          url: result.url,
          thumbnail: result.thumbnail?.url,
          key: result.key,
          size: result.size,
          mimetype: result.mimetype
        }));
      }
      
      // Call controller
      updateListing(req, res, next);
    } catch (error) {
      console.error('Listing update with S3 upload failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update listing',
        error: error.message
      });
    }
  }
);

// Delete listing - Admin only
router.delete(
  '/:id',
  protect,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const listing = await Listing.findById(req.params.id);
      
      if (listing && listing.images && listing.images.length > 0) {
        for (const image of listing.images) {
          const imageUrl = typeof image === 'string' ? image : image.url;
          if (imageUrl) {
            await deleteImageWithThumbnail(imageUrl);
          }
        }
      }
      
      deleteListing(req, res, next);
    } catch (error) {
      console.error('Listing deletion with S3 cleanup failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete listing',
        error: error.message
      });
    }
  }
);

// =============================================================================
// ADMIN ROUTES
// =============================================================================

// Status updates - Admin only
router.patch('/:id/status', protect, authorize('admin'), updateListingStatus);
router.patch('/:id/featured', protect, authorize('admin'), toggleFeatured);

// Bulk operations - Admin only
router.post('/bulk-delete', protect, authorize('admin'), bulkDeleteListings);
router.patch('/bulk-status', protect, authorize('admin'), bulkUpdateStatus);

// =============================================================================
// USER ROUTES (Authenticated users)
// =============================================================================

// Save/unsave listing - User authentication required
router.put('/:id/save', protect, toggleSaveListing);

// =============================================================================
// ANALYTICS & MONITORING ROUTES
// =============================================================================

// Analytics endpoint for specific listing
router.get('/:id/analytics', async (req, res) => {
  try {
    const listing = await Listing.findById(req.params.id);
    
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found'
      });
    }
    
    // Basic analytics data
    const analytics = {
      views: listing.views || 0,
      saves: listing.saves || 0,
      inquiries: listing.inquiries || 0,
      status: listing.status,
      featured: listing.featured || false,
      createdAt: listing.createdAt,
      lastUpdated: listing.updatedAt,
      // Additional metrics
      popularityScore: ((listing.views || 0) * 0.5) + ((listing.saves || 0) * 0.3) + ((listing.inquiries || 0) * 0.2),
      isActive: listing.status === 'active',
      daysOnSite: Math.floor((Date.now() - listing.createdAt) / (1000 * 60 * 60 * 24)),
      price: listing.price,
      // NEW: Savings analytics
      hasSavings: listing.priceOptions?.showSavings || false,
      savingsAmount: listing.priceOptions?.savingsAmount || 0,
      savingsPercentage: listing.priceOptions?.savingsPercentage || 0,
      isExclusiveDeal: listing.priceOptions?.exclusiveDeal || false
    };
    
    res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Error fetching listing analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch listing analytics',
      error: error.message
    });
  }
});

// NEW: Get listings summary for dashboard/analytics - Admin only
router.get('/admin/summary', protect, authorize('admin'), async (req, res) => {
  try {
    const summary = await Listing.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: {
            $sum: {
              $cond: [{ $eq: ['$status', 'active'] }, 1, 0]
            }
          },
          inactive: {
            $sum: {
              $cond: [{ $ne: ['$status', 'active'] }, 1, 0]
            }
          },
          featured: {
            $sum: {
              $cond: [{ $eq: ['$featured', true] }, 1, 0]
            }
          },
          totalViews: { $sum: '$views' },
          totalSaves: { $sum: '$saves' },
          totalInquiries: { $sum: '$inquiries' },
          averagePrice: { $avg: '$price' },
          // NEW: Savings analytics
          withSavings: {
            $sum: {
              $cond: [{ $eq: ['$priceOptions.showSavings', true] }, 1, 0]
            }
          },
          totalSavingsOffered: { 
            $sum: {
              $cond: [
                { $eq: ['$priceOptions.showSavings', true] },
                '$priceOptions.savingsAmount',
                0
              ]
            }
          },
          exclusiveDeals: {
            $sum: {
              $cond: [{ $eq: ['$priceOptions.exclusiveDeal', true] }, 1, 0]
            }
          }
        }
      }
    ]);
    
    const result = summary.length > 0 ? summary[0] : {
      total: 0,
      active: 0,
      inactive: 0,
      featured: 0,
      totalViews: 0,
      totalSaves: 0,
      totalInquiries: 0,
      averagePrice: 0,
      withSavings: 0,
      totalSavingsOffered: 0,
      exclusiveDeals: 0
    };
    
    // Get popular makes
    const popularMakes = await Listing.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$specifications.make', count: { $sum: 1 }, totalViews: { $sum: '$views' } } },
      { $sort: { totalViews: -1 } },
      { $limit: 10 }
    ]);
    
    // Get popular locations
    const popularLocations = await Listing.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$location.city', count: { $sum: 1 }, totalViews: { $sum: '$views' } } },
      { $sort: { totalViews: -1 } },
      { $limit: 10 }
    ]);

    // NEW: Get top savings deals
    const topSavingsDeals = await Listing.aggregate([
      { 
        $match: { 
          status: 'active',
          'priceOptions.showSavings': true,
          'priceOptions.savingsAmount': { $gt: 0 }
        }
      },
      { $sort: { 'priceOptions.savingsAmount': -1 } },
      { $limit: 5 },
      {
        $project: {
          title: 1,
          price: 1,
          'priceOptions.savingsAmount': 1,
          'priceOptions.savingsPercentage': 1,
          'priceOptions.exclusiveDeal': 1,
          views: 1
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        summary: result,
        popularMakes,
        popularLocations,
        topSavingsDeals // NEW
      }
    });
  } catch (error) {
    console.error('Error fetching listings summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch listings summary',
      error: error.message
    });
  }
});

// Test dealer-listing relationship
router.get('/test-dealer-listings/:dealerId', async (req, res) => {
  try {
    const dealerId = req.params.dealerId;
    const dealer = await Dealer.findById(dealerId);
    
    if (!dealer) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }
    
    const listings = await Listing.find({ dealerId });
    
    return res.status(200).json({
      success: true,
      dealer: {
        id: dealer._id,
        name: dealer.businessName,
        userRef: dealer.user
      },
      listingsCount: listings.length,
      listings: listings.map(l => ({
        id: l._id,
        title: l.title,
        dealerId: l.dealerId,
        hasEmbeddedDealer: !!l.dealer,
        hasSavings: l.priceOptions?.showSavings || false // NEW
      }))
    });
  } catch (error) {
    console.error('Test endpoint error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error in test endpoint',
      error: error.message
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Listings API is healthy',
    timestamp: new Date().toISOString(),
    features: {
      savings: true,
      s3Upload: s3Config?.enabled || false,
      locationSearch: true,
      analytics: true
    }
  });
});

// NEW: Savings-specific health check
router.get('/savings/health', async (req, res) => {
  try {
    const savingsCount = await Listing.countDocuments({
      'priceOptions.showSavings': true,
      'priceOptions.savingsAmount': { $gt: 0 },
      status: 'active'
    });

    const exclusiveDealsCount = await Listing.countDocuments({
      'priceOptions.exclusiveDeal': true,
      status: 'active'
    });

    res.status(200).json({
      success: true,
      message: 'Savings functionality is operational',
      data: {
        activeSavingsDeals: savingsCount,
        exclusiveDeals: exclusiveDealsCount,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error checking savings functionality',
      error: error.message
    });
  }
});

export default router;