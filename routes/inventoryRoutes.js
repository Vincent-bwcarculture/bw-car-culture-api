// server/routes/inventoryRoutes.js
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import multer from 'multer';
import { uploadMultipleImagesToS3 } from '../utils/s3Upload.js';
import { deleteImageWithThumbnail } from '../utils/s3Delete.js';
import {
  getInventoryItems,
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getFeaturedItems,
  getRecentItems,
  incrementViewCount,
  getRelatedItems
} from '../controllers/inventoryController.js';

const router = express.Router();

// Configure multer for S3 uploads with enhanced validation
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
    files: 10 // Maximum 10 files
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files with specific types
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, WebP, and GIF files are allowed.`), false);
    }
  }
});

// Rate limiting configurations
const generalLimiter = rateLimiter(100, 15); // 100 requests per 15 minutes
const viewLimiter = rateLimiter(200, 15); // 200 view requests per 15 minutes
const uploadLimiter = rateLimiter(10, 60); // 10 upload requests per hour

// Validation middleware
const validateInventoryData = (req, res, next) => {
  const data = req.body.itemData ? 
    (typeof req.body.itemData === 'string' ? JSON.parse(req.body.itemData) : req.body.itemData) :
    req.body;

  // Basic validation
  if (!data.title || data.title.length < 3) {
    return res.status(400).json({
      success: false,
      message: 'Title must be at least 3 characters long'
    });
  }

  if (!data.price || isNaN(data.price) || data.price <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Price must be a valid positive number'
    });
  }

  if (!data.category) {
    return res.status(400).json({
      success: false,
      message: 'Category is required'
    });
  }

  if (!data.businessId) {
    return res.status(400).json({
      success: false,
      message: 'Business ID is required'
    });
  }

  next();
};

// Enhanced error handling middleware for multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size is 10MB per file.'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Maximum is 10 files per upload.'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected field name. Use "images" for file uploads.'
      });
    }
  }
  
  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  
  next(error);
};

// S3 upload middleware
const handleS3Upload = async (req, res, next) => {
  try {
    if (req.files && req.files.length > 0) {
      console.log(`Processing ${req.files.length} files for S3 upload`);
      
      // Validate file sizes and types again
      for (const file of req.files) {
        if (file.size > 10 * 1024 * 1024) {
          return res.status(400).json({
            success: false,
            message: `File ${file.originalname} is too large. Maximum size is 10MB.`
          });
        }
      }
      
      // Upload to S3 with optimization
      const uploadResults = await uploadMultipleImagesToS3(req.files, 'inventory', {
        optimization: {
          quality: 85,
          format: 'webp',
          progressive: true
        },
        createThumbnail: true,
        thumbnailOptions: {
          width: 300,
          height: 300,
          quality: 80
        }
      });
      
      console.log(`Successfully uploaded ${uploadResults.length} images to S3`);
      
      // Add S3 URLs to request for controller
      req.s3Images = uploadResults.map((result, index) => ({
        url: result.url,
        thumbnail: result.thumbnail,
        key: result.key,
        size: result.size,
        mimetype: result.mimetype,
        isPrimary: index === 0 // First image is primary by default
      }));
    }
    
    next();
  } catch (error) {
    console.error('S3 upload failed:', error);
    res.status(500).json({
      success: false,
      message: `Image upload failed: ${error.message}`,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Inventory service is healthy',
    timestamp: new Date().toISOString()
  });
});

// Public routes with rate limiting
router.get('/', generalLimiter, getInventoryItems);
router.get('/featured', generalLimiter, getFeaturedItems);
router.get('/recent', generalLimiter, getRecentItems);
router.get('/:id', generalLimiter, getInventoryItem);
router.get('/:id/related', generalLimiter, getRelatedItems);

// View tracking route with specific rate limiting
router.post('/:id/view', viewLimiter, incrementViewCount);

// Protected routes for business owners and admins
router.use(protect); // All routes below require authentication

// Create inventory item
router.post('/', 
  uploadLimiter,
  upload.array('images', 10),
  handleMulterError,
  validateInventoryData,
  handleS3Upload,
  authorize('admin', 'dealer', 'service'), // Allow dealers and service providers
  createInventoryItem
);

// Update inventory item
router.put('/:id', 
  uploadLimiter,
  upload.array('images', 10),
  handleMulterError,
  handleS3Upload,
  authorize('admin', 'dealer', 'service'),
  updateInventoryItem
);

// Delete inventory item with S3 cleanup
router.delete('/:id', 
  authorize('admin', 'dealer', 'service'),
  async (req, res, next) => {
    try {
      // Get the inventory item to find image URLs for cleanup
      const InventoryItem = (await import('../models/InventoryItem.js')).default;
      const item = await InventoryItem.findById(req.params.id).select('images businessId');
      
      if (item) {
        // Check ownership (skip for admins)
        if (req.user.role !== 'admin') {
          const userBusinessId = req.user.businessId?.toString() || req.user.dealership?.toString();
          if (item.businessId.toString() !== userBusinessId) {
            return res.status(403).json({
              success: false,
              message: 'Not authorized to delete this inventory item'
            });
          }
        }
        
        // Delete all images from S3 (don't wait for completion)
        if (item.images && item.images.length > 0) {
          const deletePromises = item.images.map(async (image) => {
            try {
              const imageUrl = typeof image === 'string' ? image : image.url;
              if (imageUrl) {
                await deleteImageWithThumbnail(imageUrl);
              }
            } catch (error) {
              console.warn(`Failed to delete image from S3: ${imageUrl}`, error);
            }
          });
          
          // Execute deletions in parallel but don't block the response
          Promise.allSettled(deletePromises)
            .then(results => {
              const failed = results.filter(r => r.status === 'rejected').length;
              if (failed > 0) {
                console.warn(`Failed to delete ${failed} images from S3`);
              }
            });
        }
      }
      
      // Call the delete controller
      deleteInventoryItem(req, res, next);
    } catch (error) {
      console.error('Error in inventory deletion route:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete inventory item',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Batch operations (admin only)
router.post('/batch/delete', 
  authorize('admin'),
  async (req, res, next) => {
    try {
      const { ids } = req.body;
      
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Please provide an array of item IDs'
        });
      }
      
      if (ids.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'Maximum 50 items can be deleted at once'
        });
      }
      
      const InventoryItem = (await import('../models/InventoryItem.js')).default;
      
      // Get all items to delete their images
      const items = await InventoryItem.find({ _id: { $in: ids } }).select('images');
      
      // Delete images from S3 (asynchronously)
      const imageDeletePromises = [];
      items.forEach(item => {
        if (item.images && item.images.length > 0) {
          item.images.forEach(image => {
            const imageUrl = typeof image === 'string' ? image : image.url;
            if (imageUrl) {
              imageDeletePromises.push(deleteImageWithThumbnail(imageUrl));
            }
          });
        }
      });
      
      // Delete items from database
      const deleteResult = await InventoryItem.deleteMany({ _id: { $in: ids } });
      
      // Clean up images (don't block response)
      Promise.allSettled(imageDeletePromises)
        .then(results => {
          const failed = results.filter(r => r.status === 'rejected').length;
          if (failed > 0) {
            console.warn(`Failed to delete ${failed} images from S3 during batch delete`);
          }
        });
      
      res.status(200).json({
        success: true,
        message: `Successfully deleted ${deleteResult.deletedCount} inventory items`,
        deletedCount: deleteResult.deletedCount
      });
      
    } catch (error) {
      console.error('Error in batch delete:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete inventory items',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Batch status update (admin only)
router.patch('/batch/status', 
  authorize('admin'),
  async (req, res, next) => {
    try {
      const { ids, status } = req.body;
      
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Please provide an array of item IDs'
        });
      }
      
      if (!['active', 'inactive', 'pending'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Status must be one of: active, inactive, pending'
        });
      }
      
      if (ids.length > 100) {
        return res.status(400).json({
          success: false,
          message: 'Maximum 100 items can be updated at once'
        });
      }
      
      const InventoryItem = (await import('../models/InventoryItem.js')).default;
      
      const updateResult = await InventoryItem.updateMany(
        { _id: { $in: ids } },
        { 
          status,
          updatedAt: Date.now()
        }
      );
      
      res.status(200).json({
        success: true,
        message: `Successfully updated ${updateResult.modifiedCount} inventory items`,
        modifiedCount: updateResult.modifiedCount
      });
      
    } catch (error) {
      console.error('Error in batch status update:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update inventory items',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Statistics endpoint (admin only)
router.get('/stats/overview', 
  authorize('admin'),
  async (req, res, next) => {
    try {
      const InventoryItem = (await import('../models/InventoryItem.js')).default;
      
      const [
        totalItems,
        activeItems,
        featuredItems,
        outOfStockItems,
        totalViews,
        recentItems
      ] = await Promise.all([
        InventoryItem.countDocuments(),
        InventoryItem.countDocuments({ status: 'active' }),
        InventoryItem.countDocuments({ featured: true, status: 'active' }),
        InventoryItem.countDocuments({ 'stock.quantity': 0 }),
        InventoryItem.aggregate([
          { $group: { _id: null, totalViews: { $sum: '$metrics.views' } } }
        ]),
        InventoryItem.countDocuments({ 
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        })
      ]);
      
      res.status(200).json({
        success: true,
        data: {
          totalItems,
          activeItems,
          featuredItems,
          outOfStockItems,
          totalViews: totalViews[0]?.totalViews || 0,
          recentItems: recentItems
        }
      });
      
    } catch (error) {
      console.error('Error fetching inventory statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch inventory statistics',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Search endpoint with enhanced filtering
router.get('/search/advanced', 
  generalLimiter,
  async (req, res, next) => {
    try {
      const {
        query: searchQuery,
        category,
        minPrice,
        maxPrice,
        condition,
        inStock,
        featured,
        businessId,
        sort = 'relevance',
        page = 1,
        limit = 12
      } = req.query;
      
      // Redirect to main getInventoryItems with search parameters
      req.query = {
        search: searchQuery,
        category,
        minPrice,
        maxPrice,
        condition,
        inStock,
        featured,
        businessId,
        sort,
        page,
        limit
      };
      
      getInventoryItems(req, res, next);
      
    } catch (error) {
      console.error('Error in advanced search:', error);
      res.status(500).json({
        success: false,
        message: 'Search failed',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Error handling middleware
router.use((error, req, res, next) => {
  console.error('Inventory routes error:', error);
  
  // Handle specific MongoDB errors
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format'
    });
  }
  
  if (error.name === 'ValidationError') {
    const messages = Object.values(error.errors).map(err => err.message);
    return res.status(400).json({
      success: false,
      message: 'Validation Error',
      errors: messages
    });
  }
  
  if (error.code === 11000) {
    return res.status(400).json({
      success: false,
      message: 'Duplicate field value entered'
    });
  }
  
  // Default error response
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Server Error',
    error: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
});

export default router;