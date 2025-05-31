// server/routes/rentalVehicleRoutes.js - Enhanced for transport integration
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import multer from 'multer';
import { uploadMultipleImagesToS3 } from '../utils/s3Upload.js';
import { deleteFromS3, deleteImageWithThumbnail } from '../utils/s3Delete.js';
import {
  getRentalVehicles,
  getRentalVehicle,
  createRentalVehicle,
  updateRentalVehicle,
  deleteRentalVehicle,
  getFeaturedRentals,
  getProviderRentals,
  getSimilarRentals,
  checkAvailability,
  calculateRentalCost,
  addReview,
  updateStatus
} from '../controllers/rentalVehicleController.js';

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

// NEW: Location-based search endpoint for transport integration
router.get('/locations', async (req, res) => {
  try {
    const RentalVehicle = await import('../models/RentalVehicle.js').then(module => module.default || module);
    
    // Get unique locations from rental vehicles
    const locations = await RentalVehicle.aggregate([
      { $match: { status: 'available' } },
      {
        $group: {
          _id: null,
          cities: { $addToSet: '$location.city' },
          states: { $addToSet: '$location.state' },
          countries: { $addToSet: '$location.country' },
          providerCities: { $addToSet: '$provider.location.city' }
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
      ...locations[0].providerCities
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
    console.error('Error fetching rental vehicle locations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rental vehicle locations',
      error: error.message
    });
  }
});

// NEW: Search rentals by destination city (for transport integration)
router.get('/by-destination/:city', async (req, res) => {
  try {
    const { city } = req.params;
    const { limit = 6, page = 1 } = req.query;
    
    console.log(`Searching rental vehicles in destination city: ${city}`);
    
    const RentalVehicle = await import('../models/RentalVehicle.js').then(module => module.default || module);
    
    // Create location filter for the specific city
    const cityRegex = new RegExp(city, 'i');
    const query = {
      status: 'available',
      $or: [
        { 'location.city': cityRegex },
        { 'provider.location.city': cityRegex },
        { 'pickupLocations.city': cityRegex },
        { 'serviceArea': cityRegex }
      ]
    };
    
    // Calculate pagination
    const startIndex = (page - 1) * limit;
    const total = await RentalVehicle.countDocuments(query);
    
    // Execute query
    const vehicles = await RentalVehicle.find(query)
      .sort('-createdAt')
      .skip(startIndex)
      .limit(parseInt(limit));
    
    console.log(`Found ${vehicles.length} rental vehicles in ${city}`);
    
    // Create pagination object
    const pagination = {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      total
    };
    
    res.status(200).json({
      success: true,
      pagination,
      count: vehicles.length,
      total,
      data: vehicles,
      // Alternative format for backward compatibility
      vehicles: vehicles
    });
  } catch (error) {
    console.error(`Error fetching rentals for destination ${req.params.city}:`, error);
    res.status(500).json({
      success: false,
      message: `Failed to fetch rental vehicles for destination: ${req.params.city}`,
      error: error.message
    });
  }
});

// Public routes (specific routes before parameter routes)
router.get('/', getRentalVehicles);
router.get('/featured', getFeaturedRentals);
router.get('/provider/:providerId', getProviderRentals);

// Routes with ID parameters
router.get('/:id/similar', getSimilarRentals);
router.get('/:id', getRentalVehicle);
router.post('/:id/availability', checkAvailability);
router.post('/:id/calculate', calculateRentalCost);

// Protected routes
router.use(protect);

// Routes with file upload middleware and S3 integration
router.post('/', 
  upload.array('images', 10), 
  async (req, res, next) => {
    try {
      // Upload images to S3
      if (req.files && req.files.length > 0) {
        console.log('Uploading rental vehicle images to S3...');
        
        try {
          const uploadResults = await uploadMultipleImagesToS3(req.files, 'rentals', {
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
          
          console.log(`Successfully uploaded ${req.s3Images.length} rental images to S3`);
        } catch (uploadError) {
          console.error('S3 upload failed:', uploadError);
          
          // Don't fail the request if S3 upload fails
          console.warn('Continuing without S3 images due to upload failure');
          req.s3Images = [];
        }
      }
      
      // Call original createRentalVehicle controller
      createRentalVehicle(req, res, next);
    } catch (error) {
      console.error('Rental vehicle creation with S3 upload failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create rental vehicle',
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
        console.log('Uploading new rental vehicle images to S3...');
        
        try {
          const uploadResults = await uploadMultipleImagesToS3(req.files, 'rentals', {
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
          
          console.log(`Successfully uploaded ${req.s3Images.length} new rental images to S3`);
        } catch (uploadError) {
          console.error('S3 upload failed:', uploadError);
          
          // Don't fail the request if S3 upload fails
          console.warn('Continuing update without new S3 images due to upload failure');
          req.s3Images = [];
        }
      }
      
      // Call original updateRentalVehicle controller
      updateRentalVehicle(req, res, next);
    } catch (error) {
      console.error('Rental vehicle update with S3 upload failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update rental vehicle',
        error: error.message
      });
    }
  }
);

// Delete rental vehicle (with S3 cleanup)
router.delete('/:id', 
  async (req, res, next) => {
    try {
      // Get the rental vehicle to find image URLs
      const RentalVehicle = await import('../models/RentalVehicle.js').then(module => module.default || module);
      const vehicle = await RentalVehicle.findById(req.params.id);
      
      if (vehicle && vehicle.images && vehicle.images.length > 0) {
        console.log(`Deleting ${vehicle.images.length} images from S3 for rental vehicle ${req.params.id}`);
        
        // Delete all images from S3
        for (const image of vehicle.images) {
          try {
            const imageUrl = typeof image === 'string' ? image : image.url;
            if (imageUrl) {
              await deleteImageWithThumbnail(imageUrl);
              console.log(`Deleted rental image: ${imageUrl}`);
            }
          } catch (deleteError) {
            console.warn(`Failed to delete rental image from S3: ${deleteError.message}`);
            // Continue with other images even if one fails
          }
        }
      }
      
      // Call original deleteRentalVehicle controller
      deleteRentalVehicle(req, res, next);
    } catch (error) {
      console.error('Rental vehicle deletion with S3 cleanup failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete rental vehicle',
        error: error.message
      });
    }
  }
);

// Update status
router.patch('/:id/status', updateStatus);

// Add review
router.post('/:id/reviews', addReview);

// NEW: Analytics endpoint for rental vehicles
router.get('/:id/analytics', async (req, res) => {
  try {
    const RentalVehicle = await import('../models/RentalVehicle.js').then(module => module.default || module);
    const vehicle = await RentalVehicle.findById(req.params.id);
    
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Rental vehicle not found'
      });
    }
    
    // Basic analytics data
    const analytics = {
      views: vehicle.views || 0,
      bookings: vehicle.bookings || 0,
      averageRating: vehicle.averageRating || 0,
      totalReviews: vehicle.reviews?.length || 0,
      status: vehicle.status,
      availability: vehicle.availability,
      createdAt: vehicle.createdAt,
      lastUpdated: vehicle.updatedAt,
      // Additional metrics
      popularityScore: ((vehicle.views || 0) * 0.6) + ((vehicle.bookings || 0) * 0.4),
      isAvailable: vehicle.status === 'available',
      hasReviews: (vehicle.reviews?.length || 0) > 0,
      dailyRate: vehicle.rates?.daily || 0
    };
    
    res.status(200).json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('Error fetching rental vehicle analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rental vehicle analytics',
      error: error.message
    });
  }
});

// NEW: Bulk operations for admin management
router.post('/bulk-update-status', protect, authorize('admin'), async (req, res) => {
  try {
    const { vehicleIds, status } = req.body;
    
    if (!vehicleIds || !Array.isArray(vehicleIds) || vehicleIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of vehicle IDs'
      });
    }
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a status'
      });
    }
    
    const RentalVehicle = await import('../models/RentalVehicle.js').then(module => module.default || module);
    
    const result = await RentalVehicle.updateMany(
      { _id: { $in: vehicleIds } },
      { status: status, updatedAt: new Date() }
    );
    
    res.status(200).json({
      success: true,
      message: `Updated ${result.modifiedCount} rental vehicles to status: ${status}`,
      count: result.modifiedCount
    });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update rental vehicles',
      error: error.message
    });
  }
});

// NEW: Get rental vehicles summary for dashboard/analytics
router.get('/admin/summary', protect, authorize('admin'), async (req, res) => {
  try {
    const RentalVehicle = await import('../models/RentalVehicle.js').then(module => module.default || module);
    
    const summary = await RentalVehicle.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          available: {
            $sum: {
              $cond: [{ $eq: ['$status', 'available'] }, 1, 0]
            }
          },
          unavailable: {
            $sum: {
              $cond: [{ $ne: ['$status', 'available'] }, 1, 0]
            }
          },
          totalViews: { $sum: '$views' },
          totalBookings: { $sum: '$bookings' },
          averageRating: { $avg: '$averageRating' },
          averageDailyRate: { $avg: '$rates.daily' }
        }
      }
    ]);
    
    const result = summary.length > 0 ? summary[0] : {
      total: 0,
      available: 0,
      unavailable: 0,
      totalViews: 0,
      totalBookings: 0,
      averageRating: 0,
      averageDailyRate: 0
    };
    
    // Get popular categories
    const popularCategories = await RentalVehicle.aggregate([
      { $match: { status: 'available' } },
      { $group: { _id: '$category', count: { $sum: 1 }, totalViews: { $sum: '$views' } } },
      { $sort: { totalViews: -1 } },
      { $limit: 10 }
    ]);
    
    // Get popular locations
    const popularLocations = await RentalVehicle.aggregate([
      { $match: { status: 'available' } },
      { $group: { _id: '$location.city', count: { $sum: 1 }, totalViews: { $sum: '$views' } } },
      { $sort: { totalViews: -1 } },
      { $limit: 10 }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        summary: result,
        popularCategories,
        popularLocations
      }
    });
  } catch (error) {
    console.error('Error fetching rental vehicles summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rental vehicles summary',
      error: error.message
    });
  }
});

// NEW: Get rental availability calendar
router.get('/:id/calendar', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Please provide startDate and endDate query parameters'
      });
    }
    
    const RentalVehicle = await import('../models/RentalVehicle.js').then(module => module.default || module);
    const vehicle = await RentalVehicle.findById(req.params.id);
    
    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: 'Rental vehicle not found'
      });
    }
    
    // Generate availability calendar
    const start = new Date(startDate);
    const end = new Date(endDate);
    const calendar = [];
    
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const dateStr = date.toISOString().split('T')[0];
      
      // Check if date is available (simplified logic)
      const isAvailable = vehicle.status === 'available' && 
                         (!vehicle.unavailableDates || !vehicle.unavailableDates.includes(dateStr));
      
      calendar.push({
        date: dateStr,
        available: isAvailable,
        rate: isAvailable ? vehicle.rates?.daily || 0 : null
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        vehicleId: vehicle._id,
        calendar
      }
    });
  } catch (error) {
    console.error('Error fetching rental calendar:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch rental calendar',
      error: error.message
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Rental vehicles API is healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;