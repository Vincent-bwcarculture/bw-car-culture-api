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

// ============================================
// USER/JOURNALIST ROUTES - NEW SECTION
// ============================================

// CREATE USER ARTICLE - For regular users and journalists
router.post('/user', 
  upload.fields([
    { name: 'featuredImage', maxCount: 1 },
    { name: 'gallery', maxCount: 15 }
  ]),
  async (req, res, next) => {
    try {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] → EXPRESS ROUTER: CREATE USER ARTICLE`);
      console.log(`[${timestamp}] User: ${req.user?.name} (${req.user?.role})`);
      
      // Permission check - allow users, journalists, and admins
      const isJournalist = req.user.role === 'journalist' || 
                          (req.user.additionalRoles && req.user.additionalRoles.includes('journalist'));
      const isAdmin = req.user.role === 'admin';
      const canCreateArticles = isAdmin || isJournalist || req.user.role === 'user';
      
      if (!canCreateArticles) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to create articles'
        });
      }
      
      // Handle image uploads with HIGH QUALITY settings for news
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
        console.log(`[${timestamp}] Uploading ${allFiles.length} images to S3 with HIGH QUALITY settings for user article...`);
        
        // Use HIGH QUALITY settings specifically for news
        const uploadResults = await uploadMultipleImagesToS3(allFiles, 'news', {
          optimization: {
            quality: 95,           // High quality for news
            format: 'jpeg',        
            preserveOriginal: true 
          },
          createThumbnail: false,  // No thumbnails for news
          resize: false,           
          skipProcessing: true     
        });
        
        console.log(`[${timestamp}] ✅ S3 upload successful. ${uploadResults.length} HIGH QUALITY images uploaded.`);
        
        // Separate featured image from gallery
        const featuredImageCount = req.files?.featuredImage?.length || 0;
        
        if (featuredImageCount > 0) {
          req.s3FeaturedImage = {
            url: uploadResults[0].url,
            key: uploadResults[0].key,
            size: uploadResults[0].size,
            mimetype: uploadResults[0].mimetype
          };
        }
        
        if (uploadResults.length > featuredImageCount) {
          req.s3Gallery = uploadResults.slice(featuredImageCount).map(result => ({
            url: result.url,
            key: result.key,
            size: result.size,
            mimetype: result.mimetype
          }));
        }
      }
      
      // Set article status based on user role
      if (req.body.status === 'published') {
        if (isAdmin) {
          req.body.status = 'published';
        } else {
          req.body.status = 'pending'; // Non-admins need approval
          console.log(`[${timestamp}] Non-admin publish request changed to pending review`);
        }
      } else if (!req.body.status) {
        req.body.status = 'draft'; // Default status
      }
      
      // Add user permission flags for the controller
      req.userPermissions = {
        canPublish: isAdmin,
        isJournalist: isJournalist,
        isAdmin: isAdmin,
        role: req.user.role
      };
      
      console.log(`[${timestamp}] Calling createArticle controller for user article`);
      
      // Call the same createArticle controller
      createArticle(req, res, next);
      
    } catch (error) {
      console.error(`[${timestamp}] User article creation with S3 upload failed:`, error);
      res.status(500).json({
        success: false,
        message: 'Failed to create user article',
        error: error.message
      });
    }
  }
);

// GET USER'S OWN ARTICLES
router.get('/user/my-articles', async (req, res) => {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] → EXPRESS ROUTER: GET USER'S ARTICLES`);
    console.log(`[${timestamp}] User: ${req.user?.name} (${req.user?.role})`);
    
    // Parse query parameters
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 100, 100);
    const status = req.query.status;
    
    // Build query - only user's own articles
    let query = { author: req.user.id };
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    console.log(`[${timestamp}] Query: ${JSON.stringify(query)}`);
    
    // Get total count
    const total = await News.countDocuments(query);
    
    // Get articles with pagination
    const skip = (page - 1) * limit;
    const articles = await News.find(query)
      .populate('author', 'name email role avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    
    console.log(`[${timestamp}] Found ${articles.length} articles for user ${req.user.id}`);
    
    return res.status(200).json({
      success: true,
      data: articles,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total: total,
        hasNext: skip + articles.length < total,
        hasPrev: page > 1
      }
    });
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Get user articles error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch user articles',
      error: error.message
    });
  }
});

// UPDATE USER'S OWN ARTICLE
router.put('/user/:id',
  validateArticleId,
  upload.fields([
    { name: 'featuredImage', maxCount: 1 },
    { name: 'gallery', maxCount: 15 }
  ]),
  async (req, res, next) => {
    try {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] → EXPRESS ROUTER: UPDATE USER ARTICLE`);
      
      // Check if article exists and belongs to user
      const article = await News.findById(req.params.id);
      
      if (!article) {
        return res.status(404).json({
          success: false,
          message: 'Article not found'
        });
      }
      
      // Check ownership or admin rights
      if (article.author.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to update this article'
        });
      }
      
      // Handle image uploads
      const allFiles = [];
      
      if (req.files?.featuredImage) {
        allFiles.push(...req.files.featuredImage);
      }
      
      if (req.files?.gallery) {
        allFiles.push(...req.files.gallery);
      }
      
      if (allFiles.length > 0) {
        console.log(`[${timestamp}] Uploading ${allFiles.length} new images to S3...`);
        
        const uploadResults = await uploadMultipleImagesToS3(allFiles, 'news', {
          optimization: {
            quality: 95,
            format: 'jpeg',
            preserveOriginal: true
          },
          createThumbnail: false,
          resize: false,
          skipProcessing: true
        });
        
        console.log(`[${timestamp}] ✅ S3 upload successful. ${uploadResults.length} images uploaded.`);
        
        const featuredImageCount = req.files?.featuredImage?.length || 0;
        
        if (featuredImageCount > 0) {
          req.s3FeaturedImage = {
            url: uploadResults[0].url,
            key: uploadResults[0].key,
            size: uploadResults[0].size,
            mimetype: uploadResults[0].mimetype
          };
        }
        
        if (uploadResults.length > featuredImageCount) {
          req.s3Gallery = uploadResults.slice(featuredImageCount).map(result => ({
            url: result.url,
            key: result.key,
            size: result.size,
            mimetype: result.mimetype
          }));
        }
      }
      
      // Set status based on user role
      if (req.body.status === 'published') {
        if (req.user.role === 'admin') {
          req.body.status = 'published';
        } else {
          req.body.status = 'pending'; // Non-admins need approval
        }
      }
      
      updateArticle(req, res, next);
      
    } catch (error) {
      console.error(`[${timestamp}] User article update failed:`, error);
      res.status(500).json({
        success: false,
        message: 'Failed to update user article',
        error: error.message
      });
    }
  }
);

// DELETE USER'S OWN ARTICLE
router.delete('/user/:id', 
  validateArticleId,
  async (req, res, next) => {
    try {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] → EXPRESS ROUTER: DELETE USER ARTICLE`);
      
      const article = await News.findById(req.params.id);
      
      if (!article) {
        return res.status(404).json({
          success: false,
          message: 'Article not found'
        });
      }
      
      // Check ownership or admin rights
      if (article.author.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to delete this article'
        });
      }
      
      // Delete images from S3
      if (article.featuredImage) {
        await deleteImageWithThumbnail(article.featuredImage.url || article.featuredImage.key);
      }
      
      if (article.gallery && article.gallery.length > 0) {
        for (const image of article.gallery) {
          await deleteImageWithThumbnail(image.url || image.key);
        }
      }
      
      deleteArticle(req, res, next);
      
    } catch (error) {
      console.error(`[${timestamp}] User article deletion failed:`, error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete user article',
        error: error.message
      });
    }
  }
);

// ============================================
// ADMIN-ONLY ROUTES (EXISTING)
// ============================================

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