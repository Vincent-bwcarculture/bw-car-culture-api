// server/routes/dealerRoutes.js
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import multer from 'multer';
import { uploadMultipleImagesToS3 } from '../utils/s3Upload.js';
import { deleteFromS3, deleteImageWithThumbnail } from '../utils/s3Delete.js';
import {
  getDealers,
  getDealer,
  createDealer,
  updateDealer,
  deleteDealer,
  updateSubscription,
  verifyDealer,
  getDealerListings,
  getAllDealers
} from '../controllers/dealerController.js';

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

// Route to get all dealers for dropdowns (add this BEFORE other routes with params)
router.get('/all', getAllDealers);

// Public routes
router.get('/', getDealers);
router.get('/:id', getDealer);
router.get('/:id/listings', getDealerListings);

// Protected routes
router.use(protect);

// Routes with file upload middleware and S3 integration
router.post('/', 
  authorize('admin'), 
  upload.any(), 
  async (req, res, next) => {
    try {
      // Process uploaded files and upload to S3
      if (req.files && req.files.length > 0) {
        const logoFile = req.files.find(file => file.fieldname === 'logo');
        const bannerFile = req.files.find(file => file.fieldname === 'banner');
        
        let logoResult, bannerResult;
        
        if (logoFile) {
          console.log('Uploading dealer logo to S3...');
          logoResult = await uploadMultipleImagesToS3([logoFile], 'dealers', {
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
        
        if (bannerFile) {
          console.log('Uploading dealer banner to S3...');
          bannerResult = await uploadMultipleImagesToS3([bannerFile], 'dealers', {
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
      
      // Call original createDealer controller
      createDealer(req, res, next);
    } catch (error) {
      console.error('Dealer creation with S3 upload failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create dealer',
        error: error.message
      });
    }
  }
);

router.put('/:id', 
  authorize('admin'), 
  upload.any(), 
  async (req, res, next) => {
    try {
      // Process uploaded files and upload to S3
      if (req.files && req.files.length > 0) {
        const logoFile = req.files.find(file => file.fieldname === 'logo');
        const bannerFile = req.files.find(file => file.fieldname === 'banner');
        
        let logoResult, bannerResult;
        
        if (logoFile) {
          console.log('Uploading new dealer logo to S3...');
          logoResult = await uploadMultipleImagesToS3([logoFile], 'dealers', {
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
        
        if (bannerFile) {
          console.log('Uploading new dealer banner to S3...');
          bannerResult = await uploadMultipleImagesToS3([bannerFile], 'dealers', {
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
      
      // Call original updateDealer controller
      updateDealer(req, res, next);
    } catch (error) {
      console.error('Dealer update with S3 upload failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update dealer',
        error: error.message
      });
    }
  }
);

// Delete dealer (with S3 cleanup)
router.delete('/:id', 
  authorize('admin'),
  async (req, res, next) => {
    try {
      // Get the dealer to find image URLs
      const Dealer = await import('../models/Dealer.js').then(module => module.default);
      const dealer = await Dealer.findById(req.params.id);
      
      if (dealer) {
        // Delete logo from S3
        if (dealer.profile?.logo) {
          await deleteFromS3(dealer.profile.logo);
        }
        
        // Delete banner from S3
        if (dealer.profile?.banner) {
          await deleteFromS3(dealer.profile.banner);
        }
      }
      
      // Call original deleteDealer controller
      deleteDealer(req, res, next);
    } catch (error) {
      console.error('Dealer deletion with S3 cleanup failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete dealer',
        error: error.message
      });
    }
  }
);

router.put('/:id/subscription', authorize('admin'), updateSubscription);
router.put('/:id/verify', authorize('admin'), verifyDealer);

export default router;