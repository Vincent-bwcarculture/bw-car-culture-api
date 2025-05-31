// server/routes/videoRoutes.js
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import multer from 'multer';
import { uploadImageToS3 } from '../utils/s3Upload.js';
import { deleteFromS3, deleteImageWithThumbnail } from '../utils/s3Delete.js';
import {
  getVideos,
  getVideo,
  createVideo,
  updateVideo,
  deleteVideo,
  getFeaturedVideos,
  getVideosByCategory,
  getDealerVideos,
  getListingVideos,
  toggleFeatured,
  likeVideo
} from '../controllers/videoController.js';

const router = express.Router();

// Configure multer for S3 uploads (only for thumbnails)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    // Accept only image files (for thumbnails)
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Public routes
router.get('/', getVideos);
router.get('/featured', getFeaturedVideos);
router.get('/category/:category', getVideosByCategory);
router.get('/dealer/:dealerId', getDealerVideos);
router.get('/listing/:listingId', getListingVideos);
router.get('/:id', getVideo);

// Protected routes - require authentication
router.use(protect);

// Like video (for authenticated users)
router.put('/:id/like', likeVideo);

// Admin-only routes with thumbnail upload
router.post('/', 
  authorize('admin'), 
  upload.single('thumbnail'),
  async (req, res, next) => {
    try {
      // Upload thumbnail to S3
      if (req.file) {
        console.log('Uploading video thumbnail to S3...');
        const thumbnailResult = await uploadImageToS3(req.file, 'videos', {
          optimization: {
            quality: 90,
            format: 'webp'
          },
          createThumbnail: false // Video thumbnails don't need additional thumbnails
        });
        
        req.s3Thumbnail = {
          url: thumbnailResult.url,
          key: thumbnailResult.key,
          size: thumbnailResult.size,
          mimetype: thumbnailResult.mimetype
        };
      }
      
      // Call original createVideo controller
      createVideo(req, res, next);
    } catch (error) {
      console.error('Video creation with S3 thumbnail upload failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create video',
        error: error.message
      });
    }
  }
);

router.put('/:id', 
  authorize('admin'), 
  upload.single('thumbnail'),
  async (req, res, next) => {
    try {
      // Upload new thumbnail to S3
      if (req.file) {
        console.log('Uploading new video thumbnail to S3...');
        const thumbnailResult = await uploadImageToS3(req.file, 'videos', {
          optimization: {
            quality: 90,
            format: 'webp'
          },
          createThumbnail: false
        });
        
        req.s3Thumbnail = {
          url: thumbnailResult.url,
          key: thumbnailResult.key,
          size: thumbnailResult.size,
          mimetype: thumbnailResult.mimetype
        };
      }
      
      // Call original updateVideo controller
      updateVideo(req, res, next);
    } catch (error) {
      console.error('Video update with S3 thumbnail upload failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update video',
        error: error.message
      });
    }
  }
);

// Delete video (with S3 cleanup)
router.delete('/:id', 
  authorize('admin'),
  async (req, res, next) => {
    try {
      // Get the video to find thumbnail URL
      const Video = await import('../models/Video.js').then(module => module.default);
      const video = await Video.findById(req.params.id);
      
      if (video && video.thumbnail) {
        // Delete thumbnail from S3
        await deleteFromS3(video.thumbnail);
      }
      
      // Call original deleteVideo controller
      deleteVideo(req, res, next);
    } catch (error) {
      console.error('Video deletion with S3 cleanup failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete video',
        error: error.message
      });
    }
  }
);

router.patch('/:id/featured', authorize('admin'), toggleFeatured);

export default router;