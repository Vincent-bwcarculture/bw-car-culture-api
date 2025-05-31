// server/routes/serviceProviderRoutes.js
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import multer from 'multer';
import { uploadMultipleImagesToS3 } from '../utils/s3Upload.js';
import { deleteFromS3, deleteImageWithThumbnail } from '../utils/s3Delete.js';
import {
  getProviders,
  getProvider,
  createProvider,
  updateProvider,
  deleteProvider,
  updateSubscription,
  verifyProvider,
  getProviderListings,
  getAllProviders
} from '../controllers/serviceProviderController.js';

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

// Route to get all providers for dropdowns (must be before other routes with params)
router.get('/all', getAllProviders);

// Public routes
router.get('/', getProviders);
router.get('/:id', getProvider);
router.get('/:id/listings', getProviderListings);

// Protected routes
router.use(protect);

// Routes with file upload middleware and S3 integration
router.post('/', 
  authorize('admin'), 
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'banner', maxCount: 1 }
  ]),
  async (req, res, next) => {
    try {
      // Process uploaded files and upload to S3
      if (req.files) {
        let logoResult, bannerResult;
        
        if (req.files.logo && req.files.logo[0]) {
          console.log('Uploading provider logo to S3...');
          logoResult = await uploadMultipleImagesToS3(req.files.logo, 'providers', {
            optimization: {
              quality: 90,
              format: 'webp'
            },
            createThumbnail: false
          });
          
          req.s3Logo = {
            url: logoResult[0].url,
            key: logoResult[0].key,
            size: logoResult[0].size,
            mimetype: logoResult[0].mimetype
          };
        }
        
        if (req.files.banner && req.files.banner[0]) {
          console.log('Uploading provider banner to S3...');
          bannerResult = await uploadMultipleImagesToS3(req.files.banner, 'providers', {
            optimization: {
              quality: 85,
              format: 'webp'
            },
            createThumbnail: false
          });
          
          req.s3Banner = {
            url: bannerResult[0].url,
            key: bannerResult[0].key,
            size: bannerResult[0].size,
            mimetype: bannerResult[0].mimetype
          };
        }
      }
      
      // Call original createProvider controller
      createProvider(req, res, next);
    } catch (error) {
      console.error('Provider creation with S3 upload failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create provider',
        error: error.message
      });
    }
  }
);

router.put('/:id', 
  authorize('admin'), 
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'banner', maxCount: 1 }
  ]),
  async (req, res, next) => {
    try {
      // Process uploaded files and upload to S3
      if (req.files) {
        let logoResult, bannerResult;
        
        if (req.files.logo && req.files.logo[0]) {
          console.log('Uploading new provider logo to S3...');
          logoResult = await uploadMultipleImagesToS3(req.files.logo, 'providers', {
            optimization: {
              quality: 90,
              format: 'webp'
            },
            createThumbnail: false
          });
          
          req.s3Logo = {
            url: logoResult[0].url,
            key: logoResult[0].key,
            size: logoResult[0].size,
            mimetype: logoResult[0].mimetype
          };
        }
        
        if (req.files.banner && req.files.banner[0]) {
          console.log('Uploading new provider banner to S3...');
          bannerResult = await uploadMultipleImagesToS3(req.files.banner, 'providers', {
            optimization: {
              quality: 85,
              format: 'webp'
            },
            createThumbnail: false
          });
          
          req.s3Banner = {
            url: bannerResult[0].url,
            key: bannerResult[0].key,
            size: bannerResult[0].size,
            mimetype: bannerResult[0].mimetype
          };
        }
      }
      
      // Call original updateProvider controller
      updateProvider(req, res, next);
    } catch (error) {
      console.error('Provider update with S3 upload failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update provider',
        error: error.message
      });
    }
  }
);

// Delete provider (with S3 cleanup)
router.delete('/:id', 
  authorize('admin'),
  async (req, res, next) => {
    try {
      // Get the provider to find image URLs
      const ServiceProvider = await import('../models/ServiceProvider.js').then(module => module.default);
      const provider = await ServiceProvider.findById(req.params.id);
      
      if (provider) {
        // Delete logo from S3
        if (provider.profile?.logo) {
          await deleteFromS3(provider.profile.logo);
        }
        
        // Delete banner from S3
        if (provider.profile?.banner) {
          await deleteFromS3(provider.profile.banner);
        }
      }
      
      // Call original deleteProvider controller
      deleteProvider(req, res, next);
    } catch (error) {
      console.error('Provider deletion with S3 cleanup failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete provider',
        error: error.message
      });
    }
  }
);

// Admin-only routes
router.put('/:id/subscription', authorize('admin'), updateSubscription);
router.put('/:id/verify', authorize('admin'), verifyProvider);

export default router;