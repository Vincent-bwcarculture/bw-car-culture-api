// server/routes/transportRouteRoutes.js - Enhanced for car integration
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import multer from 'multer';
import { uploadMultipleImagesToS3 } from '../utils/s3Upload.js';
import { deleteFromS3, deleteImageWithThumbnail } from '../utils/s3Delete.js';
import {
  getTransportRoutes,
  getTransportRoute,
  createTransportRoute,
  updateTransportRoute,
  deleteTransportRoute,
  getFeaturedRoutes,
  getProviderRoutes,
  searchRoutes,
  addReview,
  updateStatus,
  getDestinationCities // NEW: Added destination cities endpoint
} from '../controllers/transportRouteController.js';

const router = express.Router();

// Configure multer for S3 uploads
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

// Debug route for testing (REMOVE IN PRODUCTION)
router.post('/test-create', protect, async (req, res) => {
  try {
    const TransportRoute = await import('../models/TransportRoute.js').then(module => module.default);
    
    const testRoute = {
      routeNumber: 'TEST-001',
      origin: 'Test Origin',
      destination: 'Test Destination',
      title: 'Test Route',
      description: 'This is a test route',
      routeType: 'Bus',
      serviceType: 'Regular',
      providerId: req.body.providerId || '682f5834fd2b11481150d279', // Use the NKK Express ID
      operationalStatus: 'active',
      fare: 100,
      schedule: {
        frequency: 'Daily',
        operatingDays: {
          monday: true,
          tuesday: true,
          wednesday: true,
          thursday: true,
          friday: true,
          saturday: true,
          sunday: true
        },
        departureTimes: ['08:00', '12:00', '16:00'],
        duration: '2h'
      },
      fareOptions: {
        currency: 'BWP',
        includesVAT: true
      },
      provider: {
        name: 'Test Provider',
        businessName: 'Test Provider Business'
      }
    };
    
    const route = await TransportRoute.create(testRoute);
    
    res.status(201).json({
      success: true,
      message: 'Test route created successfully',
      data: route
    });
  } catch (error) {
    console.error('Test route creation error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      errors: error.errors
    });
  }
});

// NEW: Destination cities endpoint for car integration
router.get('/destinations', getDestinationCities);

// Public routes (specific routes before parameter routes)
router.get('/', getTransportRoutes);
router.get('/featured', getFeaturedRoutes);
router.get('/provider/:providerId', getProviderRoutes);
router.get('/search', searchRoutes);

// Routes with ID parameters
router.get('/:id', getTransportRoute);

// Protected routes
router.use(protect);

// Routes with file upload middleware and S3 integration
router.post('/', 
  upload.array('images', 10), 
  async (req, res, next) => {
    try {
      // Upload images to S3
      if (req.files && req.files.length > 0) {
        console.log('Uploading transport route images to S3...');
        
        try {
          const uploadResults = await uploadMultipleImagesToS3(req.files, 'transport', {
            optimization: {
              quality: 85,
              format: 'webp'
            },
            createThumbnail: true
          });
          
          req.s3Images = uploadResults.map(result => ({
            url: result.url,
            thumbnail: result.thumbnail?.url,
            key: result.key,
            size: result.size,
            mimetype: result.mimetype
          }));
          
          console.log(`Successfully uploaded ${req.s3Images.length} images to S3`);
        } catch (uploadError) {
          console.error('S3 upload failed:', uploadError);
          
          // Don't fail the request if S3 upload fails
          // The controller will handle the fallback
          console.warn('Continuing without S3 images due to upload failure');
          req.s3Images = [];
        }
      }
      
      // Call original createTransportRoute controller
      createTransportRoute(req, res, next);
    } catch (error) {
      console.error('Transport route creation with S3 upload failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create transport route',
        error: error.message
      });
    }
  }
);

router.put('/:id', 
  upload.array('images', 10), 
  async (req, res, next) => {
    try {
      // Upload new images to S3
      if (req.files && req.files.length > 0) {
        console.log('Uploading new transport route images to S3...');
        
        try {
          const uploadResults = await uploadMultipleImagesToS3(req.files, 'transport', {
            optimization: {
              quality: 85,
              format: 'webp'
            },
            createThumbnail: true
          });
          
          req.s3Images = uploadResults.map(result => ({
            url: result.url,
            thumbnail: result.thumbnail?.url,
            key: result.key,
            size: result.size,
            mimetype: result.mimetype
          }));
          
          console.log(`Successfully uploaded ${req.s3Images.length} new images to S3`);
        } catch (uploadError) {
          console.error('S3 upload failed:', uploadError);
          
          // Don't fail the request if S3 upload fails
          console.warn('Continuing update without new S3 images due to upload failure');
          req.s3Images = [];
        }
      }
      
      // Call original updateTransportRoute controller
      updateTransportRoute(req, res, next);
    } catch (error) {
      console.error('Transport route update with S3 upload failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update transport route',
        error: error.message
      });
    }
  }
);

// Delete transport route (with S3 cleanup)
router.delete('/:id', 
  async (req, res, next) => {
    try {
      // Get the transport route to find image URLs
      const TransportRoute = await import('../models/TransportRoute.js').then(module => module.default);
      const route = await TransportRoute.findById(req.params.id);
      
      if (route && route.images && route.images.length > 0) {
        console.log(`Deleting ${route.images.length} images from S3 for route ${req.params.id}`);
        
        // Delete all images from S3
        for (const image of route.images) {
          try {
            const imageUrl = typeof image === 'string' ? image : image.url;
            if (imageUrl) {
              await deleteImageWithThumbnail(imageUrl);
              console.log(`Deleted image: ${imageUrl}`);
            }
          } catch (deleteError) {
            console.warn(`Failed to delete image from S3: ${deleteError.message}`);
            // Continue with other images even if one fails
          }
        }
      }
      
      // Call original deleteTransportRoute controller
      deleteTransportRoute(req, res, next);
    } catch (error) {
      console.error('Transport route deletion with S3 cleanup failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete transport route',
        error: error.message
      });
    }
  }
);

// Update status
router.patch('/:id/status', updateStatus);

// Add review
router.post('/:id/reviews', addReview);

// NEW: Analytics endpoint for car integration (if implemented in controller)
router.get('/:id/analytics', async (req, res) => {
  try {
    const TransportRoute = await import('../models/TransportRoute.js').then(module => module.default);
    const route = await TransportRoute.findById(req.params.id);
    
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Transport route not found'
      });
    }
    
    // Basic analytics data
    const analytics = {
      views: route.views || 0,
      bookings: route.bookings || 0,
      averageRating: route.averageRating || 0,
      totalReviews: route.reviews?.length || 0,
      operationalStatus: route.operationalStatus,
      createdAt: route.createdAt,
      lastUpdated: route.updatedAt,
      // Additional metrics that could be useful for car integration
      popularityScore: ((route.views || 0) * 0.7) + ((route.bookings || 0) * 0.3),
      isActive: route.operationalStatus === 'active',
      hasReviews: (route.reviews?.length || 0) > 0
    };
    
    res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Error fetching route analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch route analytics',
      error: error.message
    });
  }
});

// NEW: Bulk operations for admin management
router.post('/bulk-update-status', protect, authorize('admin'), async (req, res) => {
  try {
    const { routeIds, status } = req.body;
    
    if (!routeIds || !Array.isArray(routeIds) || routeIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of route IDs'
      });
    }
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a status'
      });
    }
    
    const TransportRoute = await import('../models/TransportRoute.js').then(module => module.default);
    
    const result = await TransportRoute.updateMany(
      { _id: { $in: routeIds } },
      { operationalStatus: status, updatedAt: new Date() }
    );
    
    res.status(200).json({
      success: true,
      message: `Updated ${result.modifiedCount} routes to status: ${status}`,
      count: result.modifiedCount
    });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update routes',
      error: error.message
    });
  }
});

// NEW: Get routes summary for dashboard/analytics
router.get('/admin/summary', protect, authorize('admin'), async (req, res) => {
  try {
    const TransportRoute = await import('../models/TransportRoute.js').then(module => module.default);
    
    const summary = await TransportRoute.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: {
            $sum: {
              $cond: [{ $eq: ['$operationalStatus', 'active'] }, 1, 0]
            }
          },
          inactive: {
            $sum: {
              $cond: [{ $ne: ['$operationalStatus', 'active'] }, 1, 0]
            }
          },
          totalViews: { $sum: '$views' },
          totalBookings: { $sum: '$bookings' },
          averageRating: { $avg: '$averageRating' }
        }
      }
    ]);
    
    const result = summary.length > 0 ? summary[0] : {
      total: 0,
      active: 0,
      inactive: 0,
      totalViews: 0,
      totalBookings: 0,
      averageRating: 0
    };
    
    // Get popular destinations
    const popularDestinations = await TransportRoute.aggregate([
      { $match: { operationalStatus: 'active' } },
      { $group: { _id: '$destination', count: { $sum: 1 }, totalViews: { $sum: '$views' } } },
      { $sort: { totalViews: -1 } },
      { $limit: 10 }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        summary: result,
        popularDestinations
      }
    });
  } catch (error) {
    console.error('Error fetching routes summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch routes summary',
      error: error.message
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Transport routes API is healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;