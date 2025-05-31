// server/routes/trailerListingRoutes.js
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import multer from 'multer';
import { uploadMultipleImagesToS3 } from '../utils/s3Upload.js';
import { deleteFromS3, deleteImageWithThumbnail } from '../utils/s3Delete.js';
import {
  getTrailerListings,
  getTrailerListing,
  createTrailerListing,
  updateTrailerListing,
  deleteTrailerListing,
  getFeaturedTrailers,
  getProviderTrailers,
  getSimilarTrailers,
  checkAvailability,
  calculateRentalCost,
  addReview,
  updateStatus
} from '../controllers/trailerListingController.js';

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

// Public routes (specific routes before parameter routes)
router.get('/', getTrailerListings);
router.get('/featured', getFeaturedTrailers);
router.get('/provider/:providerId', getProviderTrailers);

// Routes with ID parameters
router.get('/:id/similar', getSimilarTrailers);
router.get('/:id', getTrailerListing);
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
        console.log('Uploading trailer images to S3...');
        const uploadResults = await uploadMultipleImagesToS3(req.files, 'trailers', {
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
      }
      
      // Call original createTrailerListing controller
      createTrailerListing(req, res, next);
    } catch (error) {
      console.error('Trailer listing creation with S3 upload failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create trailer listing',
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
        console.log('Uploading new trailer images to S3...');
        const uploadResults = await uploadMultipleImagesToS3(req.files, 'trailers', {
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
      }
      
      // Call original updateTrailerListing controller
      updateTrailerListing(req, res, next);
    } catch (error) {
      console.error('Trailer listing update with S3 upload failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update trailer listing',
        error: error.message
      });
    }
  }
);

// Delete trailer listing (with S3 cleanup)
router.delete('/:id', 
  async (req, res, next) => {
    try {
      // Get the trailer listing to find image URLs
      const TrailerListing = await import('../models/TrailerListing.js').then(module => module.default);
      const trailer = await TrailerListing.findById(req.params.id);
      
      if (trailer && trailer.images && trailer.images.length > 0) {
        // Delete all images from S3
        for (const image of trailer.images) {
          const imageUrl = typeof image === 'string' ? image : image.url;
          if (imageUrl) {
            await deleteImageWithThumbnail(imageUrl);
          }
        }
      }
      
      // Call original deleteTrailerListing controller
      deleteTrailerListing(req, res, next);
    } catch (error) {
      console.error('Trailer listing deletion with S3 cleanup failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete trailer listing',
        error: error.message
      });
    }
  }
);

// Update status
router.patch('/:id/status', updateStatus);

// Add review
router.post('/:id/reviews', addReview);

export default router;