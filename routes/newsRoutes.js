// server/routes/newsRoutes.js
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import News from '../models/News.js';
import { advancedResults } from '../middleware/advancedResults.js';
import multer from 'multer';
import { uploadMultipleImagesToS3 } from '../utils/s3Upload.js';
import { deleteFromS3, deleteImageWithThumbnail } from '../utils/s3Delete.js';
import {
  createArticle,
  getArticles,
  getArticle,
  updateArticle,
  deleteArticle,
  toggleLike,
  getFeaturedArticles,
  getTrendingArticles,
  getLatestArticles,
  getArticlesByTag,
  getArticlesByCategory,
  getSimilarArticles,
  toggleFeatured
} from '../controllers/newsController.js';

const router = express.Router();

// Configure multer for S3 uploads with higher limits for news
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Increased to 10MB for higher quality news images
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Validation middleware for article ID
const validateArticleId = (req, res, next) => {
  const { id } = req.params;
  
  if (!id) {
    return res.status(400).json({
      success: false,
      message: 'Article ID is required'
    });
  }
  
  if (id.length > 100) {
    return res.status(400).json({
      success: false,
      message: 'Invalid article ID format'
    });
  }
  
  const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(id);
  const isValidSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id);
  
  if (!isValidObjectId && !isValidSlug) {
    return res.status(400).json({
      success: false,
      message: 'Invalid article ID format'
    });
  }
  
  next();
};

// Test route
router.get('/test', (req, res) => {
  console.log("News test route accessed");
  res.status(200).json({
    success: true,
    message: 'News routes are working correctly!',
    routePrefix: '/api/news'
  });
});

// Public routes - NO authentication required
router.get('/', advancedResults(News), getArticles);
router.get('/featured', getFeaturedArticles);
router.get('/trending', getTrendingArticles);
router.get('/latest', getLatestArticles);
router.get('/tags/:tag', getArticlesByTag);
router.get('/category/:category', getArticlesByCategory);
router.get('/:id', validateArticleId, getArticle);
router.get('/:id/similar', validateArticleId, getSimilarArticles);

// Protected routes
router.use(protect);
router.put('/:id/like', validateArticleId, toggleLike);

// Admin-only routes - CREATE ARTICLE
router.post('/', 
  authorize('admin'),
  upload.fields([
    { name: 'featuredImage', maxCount: 1 },
    { name: 'gallery', maxCount: 15 } // Increased gallery limit
  ]),
  async (req, res, next) => {
    try {
      // Handle ALL images together with HIGH QUALITY settings for news
      const allFiles = [];
      
      // Collect featured image
      if (req.files?.featuredImage) {
        allFiles.push(...req.files.featuredImage);
      }
      
      // Collect gallery images
      if (req.files?.gallery) {
        allFiles.push(...req.files.gallery);
      }
      
      if (allFiles.length > 0) {
        console.log(`Uploading ${allFiles.length} images to S3 with HIGH QUALITY settings for news...`);
        
        // Use HIGH QUALITY settings specifically for news (different from listings)
        const uploadResults = await uploadMultipleImagesToS3(allFiles, 'news', {
          optimization: {
            quality: 95,           // MUCH higher quality than listings (85)
            format: 'jpeg',        // Keep original format instead of webp conversion
            preserveOriginal: true // Try to preserve original if this option exists
          },
          createThumbnail: false,  // DISABLE thumbnails completely for news
          resize: false,           // DISABLE any resizing to prevent cropping
          skipProcessing: true     // If this option exists, skip all processing
        });
        
        console.log(`✅ S3 upload successful. ${uploadResults.length} HIGH QUALITY images uploaded.`);
        
        // Separate featured image from gallery
        const featuredImageCount = req.files?.featuredImage?.length || 0;
        
        if (featuredImageCount > 0) {
          req.s3FeaturedImage = {
            url: uploadResults[0].url,
            key: uploadResults[0].key,
            size: uploadResults[0].size,
            mimetype: uploadResults[0].mimetype
            // NO THUMBNAIL REFERENCE - using full image only
          };
        }
        
        if (uploadResults.length > featuredImageCount) {
          req.s3Gallery = uploadResults.slice(featuredImageCount).map(result => ({
            url: result.url,
            key: result.key,
            size: result.size,
            mimetype: result.mimetype
            // NO THUMBNAIL REFERENCE - using full images only
          }));
        }
      }
      
      createArticle(req, res, next);
    } catch (error) {
      console.error('Article creation with S3 upload failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create article',
        error: error.message
      });
    }
  }
);

// Admin-only routes - UPDATE ARTICLE
router.put('/:id',
  validateArticleId,
  authorize('admin'),
  upload.fields([
    { name: 'featuredImage', maxCount: 1 },
    { name: 'gallery', maxCount: 15 } // Increased gallery limit
  ]),
  async (req, res, next) => {
    try {
      // Handle ALL images together with HIGH QUALITY settings for news
      const allFiles = [];
      
      // Collect featured image
      if (req.files?.featuredImage) {
        allFiles.push(...req.files.featuredImage);
      }
      
      // Collect gallery images
      if (req.files?.gallery) {
        allFiles.push(...req.files.gallery);
      }
      
      if (allFiles.length > 0) {
        console.log(`Uploading ${allFiles.length} new images to S3 with HIGH QUALITY settings for news...`);
        
        // Use HIGH QUALITY settings specifically for news (different from listings)
        const uploadResults = await uploadMultipleImagesToS3(allFiles, 'news', {
          optimization: {
            quality: 95,           // MUCH higher quality than listings (85)
            format: 'jpeg',        // Keep original format instead of webp conversion
            preserveOriginal: true // Try to preserve original if this option exists
          },
          createThumbnail: false,  // DISABLE thumbnails completely for news
          resize: false,           // DISABLE any resizing to prevent cropping
          skipProcessing: true     // If this option exists, skip all processing
        });
        
        console.log(`✅ S3 upload successful. ${uploadResults.length} HIGH QUALITY images uploaded.`);
        
        // Separate featured image from gallery
        const featuredImageCount = req.files?.featuredImage?.length || 0;
        
        if (featuredImageCount > 0) {
          req.s3FeaturedImage = {
            url: uploadResults[0].url,
            key: uploadResults[0].key,
            size: uploadResults[0].size,
            mimetype: uploadResults[0].mimetype
            // NO THUMBNAIL REFERENCE - using full image only
          };
        }
        
        if (uploadResults.length > featuredImageCount) {
          req.s3Gallery = uploadResults.slice(featuredImageCount).map(result => ({
            url: result.url,
            key: result.key,
            size: result.size,
            mimetype: result.mimetype
            // NO THUMBNAIL REFERENCE - using full images only
          }));
        }
      }
      
      updateArticle(req, res, next);
    } catch (error) {
      console.error('Article update with S3 upload failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update article',
        error: error.message
      });
    }
  }
);

// Delete article with S3 cleanup
router.delete('/:id', 
  validateArticleId,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const article = await News.findById(req.params.id);
      
      if (article) {
        // Delete featured image from S3 (no thumbnails to worry about for news)
        if (article.featuredImage) {
          await deleteImageWithThumbnail(article.featuredImage.url || article.featuredImage.key);
        }
        
        // Delete gallery images from S3 (no thumbnails to worry about for news)
        if (article.gallery && article.gallery.length > 0) {
          for (const image of article.gallery) {
            await deleteImageWithThumbnail(image.url || image.key);
          }
        }
      }
      
      deleteArticle(req, res, next);
    } catch (error) {
      console.error('Article deletion with S3 cleanup failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete article',
        error: error.message
      });
    }
  }
);

// Toggle featured
router.patch('/:id/featured', validateArticleId, authorize('admin'), toggleFeatured);

// Health check endpoint for S3 connectivity (news-specific)
router.get('/health/s3', authorize('admin'), async (req, res) => {
  try {
    const { testS3Connection } = await import('../config/s3.js');
    const result = await testS3Connection();
    
    res.status(200).json({
      success: true,
      message: 'News S3 connectivity check completed',
      result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'News S3 connectivity check failed',
      error: error.message
    });
  }
});

export default router;