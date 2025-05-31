// server/controllers/inventoryController.js
import asyncHandler from '../middleware/async.js';
import InventoryItem from '../models/InventoryItem.js';
import ServiceProvider from '../models/ServiceProvider.js';
import Dealer from '../models/Dealer.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import { uploadMultipleImagesToS3 } from '../utils/s3Upload.js';
import { deleteImageWithThumbnail } from '../utils/s3Delete.js';
import mongoose from 'mongoose';

/**
 * @desc    Get all inventory items with advanced filtering and pagination
 * @route   GET /api/inventory
 * @access  Public
 */
export const getInventoryItems = asyncHandler(async (req, res, next) => {
  const {
    businessId,
    category,
    condition,
    minPrice,
    maxPrice,
    search,
    featured,
    sort = '-createdAt',
    page = 1,
    limit = 12,
    exclude,
    inStock
  } = req.query;

  // Build query with performance optimizations
  const query = { status: 'active' };

  // Filter by business
  if (businessId) {
    if (!mongoose.Types.ObjectId.isValid(businessId)) {
      return next(new ErrorResponse('Invalid business ID format', 400));
    }
    query.businessId = businessId;
  }

  // Filter by category (case-insensitive)
  if (category && category !== 'all') {
    query.category = new RegExp(category, 'i');
  }

  // Filter by condition
  if (condition && condition !== 'all') {
    query.condition = condition;
  }

  // Filter by price range
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice && !isNaN(minPrice)) query.price.$gte = Number(minPrice);
    if (maxPrice && !isNaN(maxPrice)) query.price.$lte = Number(maxPrice);
  }

  // Filter by stock availability
  if (inStock === 'true') {
    query['stock.quantity'] = { $gt: 0 };
  }

  // Filter featured items
  if (featured === 'true') {
    query.featured = true;
  }

  // Exclude specific items
  if (exclude) {
    const excludeIds = Array.isArray(exclude) ? exclude : [exclude];
    const validExcludeIds = excludeIds.filter(id => mongoose.Types.ObjectId.isValid(id));
    if (validExcludeIds.length > 0) {
      query._id = { $nin: validExcludeIds };
    }
  }

  // Search functionality with text index
  if (search && search.trim()) {
    const searchTerm = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = [
      { title: new RegExp(searchTerm, 'i') },
      { description: new RegExp(searchTerm, 'i') },
      { 'specifications.brand': new RegExp(searchTerm, 'i') },
      { 'specifications.model': new RegExp(searchTerm, 'i') },
      { 'specifications.partNumber': new RegExp(searchTerm, 'i') },
      { features: { $in: [new RegExp(searchTerm, 'i')] } }
    ];
  }

  try {
    // Calculate pagination with validation
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit))); // Max 50 items per page
    const startIndex = (pageNum - 1) * limitNum;
    
    // Get total count with timeout
    const totalPromise = InventoryItem.countDocuments(query).maxTimeMS(5000);
    
    // Build sort options
    let sortOptions = {};
    switch (sort) {
      case 'price_asc':
        sortOptions = { price: 1 };
        break;
      case 'price_desc':
        sortOptions = { price: -1 };
        break;
      case 'title_asc':
        sortOptions = { title: 1 };
        break;
      case 'title_desc':
        sortOptions = { title: -1 };
        break;
      case 'views':
        sortOptions = { 'metrics.views': -1 };
        break;
      case 'featured':
        sortOptions = { featured: -1, createdAt: -1 };
        break;
      default:
        sortOptions = { createdAt: -1 };
    }

    // Execute query with optimizations
    const inventoryItemsPromise = InventoryItem.find(query)
      .populate({
        path: 'business',
        select: 'businessName logo location contact verification.isVerified',
        options: { lean: true }
      })
      .select('-__v') // Exclude version field
      .sort(sortOptions)
      .skip(startIndex)
      .limit(limitNum)
      .lean() // Use lean queries for better performance
      .maxTimeMS(10000); // 10 second timeout

    // Execute both queries in parallel
    const [total, inventoryItems] = await Promise.all([totalPromise, inventoryItemsPromise]);

    // Calculate pagination
    const totalPages = Math.ceil(total / limitNum);
    const pagination = {
      currentPage: pageNum,
      totalPages: totalPages,
      total: total,
      limit: limitNum,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1
    };

    // Add pagination links
    if (pagination.hasNext) {
      pagination.next = {
        page: pageNum + 1,
        limit: limitNum
      };
    }

    if (pagination.hasPrev) {
      pagination.prev = {
        page: pageNum - 1,
        limit: limitNum
      };
    }

    // Process images for S3 URLs
    const processedItems = inventoryItems.map(item => ({
      ...item,
      images: item.images?.map(img => {
        if (typeof img === 'string') {
          return { url: img };
        }
        return {
          ...img,
          url: img.url || (img.key ? `${process.env.AWS_S3_BASE_URL}/${img.key}` : '/images/placeholders/part.jpg')
        };
      }) || []
    }));

    // Return response
    res.status(200).json({
      success: true,
      pagination,
      count: processedItems.length,
      data: processedItems
    });

  } catch (error) {
    console.error('Error in getInventoryItems:', error);
    return next(new ErrorResponse('Error fetching inventory items', 500));
  }
});

/**
 * @desc    Get single inventory item with view tracking
 * @route   GET /api/inventory/:id
 * @access  Public
 */
export const getInventoryItem = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new ErrorResponse('Invalid item ID format', 400));
  }

  try {
    const item = await InventoryItem.findById(id)
      .populate({
        path: 'business',
        select: 'businessName logo location contact verification metrics rating',
        options: { lean: true }
      })
      .lean();

    if (!item) {
      return next(new ErrorResponse(`Inventory item not found with id ${id}`, 404));
    }

    // Process images for S3 URLs
    const processedItem = {
      ...item,
      images: item.images?.map(img => {
        if (typeof img === 'string') {
          return { url: img };
        }
        return {
          ...img,
          url: img.url || (img.key ? `${process.env.AWS_S3_BASE_URL}/${img.key}` : '/images/placeholders/part.jpg')
        };
      }) || []
    };

    // Increment view count asynchronously (don't wait for it)
    InventoryItem.findByIdAndUpdate(
      id,
      { 
        $inc: { 'metrics.views': 1 },
        'metrics.lastViewed': Date.now()
      },
      { new: false }
    ).catch(err => console.warn('Failed to update view count:', err));

    res.status(200).json({
      success: true,
      data: processedItem
    });

  } catch (error) {
    console.error('Error in getInventoryItem:', error);
    return next(new ErrorResponse('Error fetching inventory item', 500));
  }
});

/**
 * @desc    Create new inventory item with S3 image upload
 * @route   POST /api/inventory
 * @access  Private (Business owners and admins)
 */
export const createInventoryItem = asyncHandler(async (req, res, next) => {
  try {
    // Parse inventory data from form or direct JSON
    let itemData;
    if (req.body.itemData) {
      try {
        itemData = typeof req.body.itemData === 'string' 
          ? JSON.parse(req.body.itemData) 
          : req.body.itemData;
      } catch (parseError) {
        return next(new ErrorResponse('Invalid JSON in itemData', 400));
      }
    } else {
      itemData = req.body;
    }
    
    // Validate required fields
    const requiredFields = ['title', 'price', 'category', 'businessId'];
    const missingFields = requiredFields.filter(field => !itemData[field]);
    
    if (missingFields.length > 0) {
      return next(new ErrorResponse(`Missing required fields: ${missingFields.join(', ')}`, 400));
    }
    
    // Validate and convert numeric fields
    itemData.price = Number(itemData.price);
    if (isNaN(itemData.price) || itemData.price < 0) {
      return next(new ErrorResponse('Price must be a valid positive number', 400));
    }

    if (itemData.originalPrice) {
      itemData.originalPrice = Number(itemData.originalPrice);
      if (isNaN(itemData.originalPrice) || itemData.originalPrice < 0) {
        return next(new ErrorResponse('Original price must be a valid positive number', 400));
      }
    }

    // Validate stock quantity
    if (itemData.stock?.quantity !== undefined) {
      itemData.stock.quantity = Number(itemData.stock.quantity);
      if (isNaN(itemData.stock.quantity) || itemData.stock.quantity < 0) {
        return next(new ErrorResponse('Stock quantity must be a valid non-negative number', 400));
      }
    }

    // Validate business exists and get business type
    let business;
    let businessType;
    
    if (!mongoose.Types.ObjectId.isValid(itemData.businessId)) {
      return next(new ErrorResponse('Invalid business ID format', 400));
    }
    
    // Try to find business in Dealer collection first
    business = await Dealer.findById(itemData.businessId).lean();
    if (business) {
      businessType = 'dealer';
    } else {
      // Try ServiceProvider collection
      business = await ServiceProvider.findById(itemData.businessId).lean();
      if (business) {
        businessType = 'service';
      } else {
        return next(new ErrorResponse('Business not found', 404));
      }
    }
    
    // Set business type
    itemData.businessType = businessType;

    // Process S3 image uploads
    let imageData = [];
    
    // Handle images from S3 upload middleware
    if (req.s3Images && req.s3Images.length > 0) {
      imageData = req.s3Images.map((image, index) => ({
        url: image.url,
        thumbnail: image.thumbnail,
        key: image.key,
        size: image.size,
        mimetype: image.mimetype,
        isPrimary: index === 0 // First image is primary
      }));
    }
    // Handle direct file uploads
    else if (req.files && req.files.length > 0) {
      try {
        const uploadResults = await uploadMultipleImagesToS3(req.files, 'inventory', {
          optimization: {
            quality: 85,
            format: 'webp'
          },
          createThumbnail: true
        });
        
        imageData = uploadResults.map((result, index) => ({
          url: result.url,
          thumbnail: result.thumbnail?.url,
          key: result.key,
          size: result.size,
          mimetype: result.mimetype,
          isPrimary: index === 0
        }));
      } catch (uploadError) {
        console.error('S3 upload failed:', uploadError);
        return next(new ErrorResponse(`Image upload failed: ${uploadError.message}`, 500));
      }
    }
    // Handle pre-uploaded images from request body
    else if (itemData.images && Array.isArray(itemData.images)) {
      imageData = itemData.images;
    }
    
    // Ensure at least one image
    if (imageData.length === 0) {
      return next(new ErrorResponse('At least one image is required', 400));
    }
    
    // Add images to item data
    itemData.images = imageData;
    
    // Ensure at least one image is marked as primary
    if (!imageData.some(img => img.isPrimary)) {
      imageData[0].isPrimary = true;
    }

    // Set default values
    itemData.status = itemData.status || 'active';
    itemData.featured = itemData.featured || false;
    itemData.metrics = {
      views: 0,
      clicks: 0,
      purchases: 0,
      lastViewed: null
    };

    // Create inventory item
    const inventoryItem = await InventoryItem.create(itemData);
    
    // Populate business information for response
    const populatedItem = await InventoryItem.findById(inventoryItem._id)
      .populate({
        path: 'business',
        select: 'businessName logo location'
      })
      .lean();
    
    res.status(201).json({
      success: true,
      data: populatedItem
    });

  } catch (error) {
    console.error('Error creating inventory item:', error);
    
    // Clean up uploaded images if item creation failed
    if (req.s3Images && req.s3Images.length > 0) {
      for (const image of req.s3Images) {
        try {
          await deleteImageWithThumbnail(image.url);
        } catch (cleanupError) {
          console.warn('Failed to cleanup uploaded image:', cleanupError);
        }
      }
    }
    
    return next(new ErrorResponse('Failed to create inventory item', 500));
  }
});

/**
 * @desc    Update inventory item with S3 image handling
 * @route   PUT /api/inventory/:id
 * @access  Private (Business owners and admins)
 */
export const updateInventoryItem = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new ErrorResponse('Invalid item ID format', 400));
  }

  try {
    let item = await InventoryItem.findById(id);
    
    if (!item) {
      return next(new ErrorResponse(`Inventory item not found with id ${id}`, 404));
    }
    
    // Check ownership (skip for admins)
    if (req.user.role !== 'admin') {
      const userBusinessId = req.user.businessId?.toString() || req.user.dealership?.toString();
      if (item.businessId.toString() !== userBusinessId) {
        return next(new ErrorResponse('Not authorized to update this inventory item', 403));
      }
    }
    
    // Parse item data from form or direct JSON
    let itemData;
    if (req.body.itemData) {
      try {
        itemData = typeof req.body.itemData === 'string' 
          ? JSON.parse(req.body.itemData) 
          : req.body.itemData;
      } catch (parseError) {
        return next(new ErrorResponse('Invalid JSON in itemData', 400));
      }
    } else {
      itemData = req.body;
    }

    // Validate numeric fields if provided
    if (itemData.price !== undefined) {
      itemData.price = Number(itemData.price);
      if (isNaN(itemData.price) || itemData.price < 0) {
        return next(new ErrorResponse('Price must be a valid positive number', 400));
      }
    }

    if (itemData.originalPrice !== undefined) {
      itemData.originalPrice = Number(itemData.originalPrice);
      if (isNaN(itemData.originalPrice) || itemData.originalPrice < 0) {
        return next(new ErrorResponse('Original price must be a valid positive number', 400));
      }
    }

    // Handle image updates
    let updatedImages = [...(item.images || [])];
    
    // Process new S3 uploads
    if (req.s3Images && req.s3Images.length > 0) {
      // Handle existing images to keep
      const existingImages = itemData.existingImages || [];
      const imagesToKeep = updatedImages.filter(img => 
        existingImages.includes(img._id?.toString() || img.url)
      );
      
      // Delete removed images from S3
      const imagesToDelete = updatedImages.filter(img => 
        !existingImages.includes(img._id?.toString() || img.url)
      );
      
      for (const img of imagesToDelete) {
        try {
          await deleteImageWithThumbnail(img.url || img.key);
        } catch (error) {
          console.warn(`Failed to delete image: ${error.message}`);
        }
      }
      
      // Add new images
      const newImages = req.s3Images.map((result, index) => ({
        url: result.url,
        thumbnail: result.thumbnail,
        key: result.key,
        size: result.size,
        mimetype: result.mimetype,
        isPrimary: imagesToKeep.length === 0 && index === 0 // First new image is primary if no existing images
      }));
      
      // Combine images
      updatedImages = [...imagesToKeep, ...newImages];
      
      // Ensure at least one image is primary
      if (updatedImages.length > 0 && !updatedImages.some(img => img.isPrimary)) {
        updatedImages[0].isPrimary = true;
      }
      
      itemData.images = updatedImages;
    }
    
    // Update item
    const updatedItem = await InventoryItem.findByIdAndUpdate(
      id,
      { 
        ...itemData,
        updatedAt: Date.now()
      },
      {
        new: true,
        runValidators: true
      }
    ).populate({
      path: 'business',
      select: 'businessName logo location'
    }).lean();
    
    res.status(200).json({
      success: true,
      data: updatedItem
    });

  } catch (error) {
    console.error('Error updating inventory item:', error);
    return next(new ErrorResponse('Failed to update inventory item', 500));
  }
});

/**
 * @desc    Delete inventory item with S3 cleanup
 * @route   DELETE /api/inventory/:id
 * @access  Private (Business owners and admins)
 */
export const deleteInventoryItem = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new ErrorResponse('Invalid item ID format', 400));
  }

  try {
    const item = await InventoryItem.findById(id);
    
    if (!item) {
      return next(new ErrorResponse(`Inventory item not found with id ${id}`, 404));
    }
    
    // Check ownership (skip for admins)
    if (req.user.role !== 'admin') {
      const userBusinessId = req.user.businessId?.toString() || req.user.dealership?.toString();
      if (item.businessId.toString() !== userBusinessId) {
        return next(new ErrorResponse('Not authorized to delete this inventory item', 403));
      }
    }
    
    // Delete all images from S3
    if (item.images && item.images.length > 0) {
      const deletePromises = item.images.map(async (img) => {
        try {
          await deleteImageWithThumbnail(img.url || img.key);
        } catch (error) {
          console.warn(`Failed to delete image: ${error.message}`);
        }
      });
      
      await Promise.allSettled(deletePromises);
    }
    
    // Remove item from database
    await InventoryItem.findByIdAndDelete(id);
    
    res.status(200).json({
      success: true,
      data: {},
      message: 'Inventory item deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting inventory item:', error);
    return next(new ErrorResponse('Failed to delete inventory item', 500));
  }
});

/**
 * @desc    Get featured inventory items
 * @route   GET /api/inventory/featured
 * @access  Public
 */
export const getFeaturedItems = asyncHandler(async (req, res, next) => {
  const { limit = 8 } = req.query;
  const limitNum = Math.min(20, Math.max(1, parseInt(limit)));

  try {
    const featuredItems = await InventoryItem.find({
      featured: true,
      status: 'active',
      'stock.quantity': { $gt: 0 }
    })
      .populate({
        path: 'business',
        select: 'businessName logo location',
        options: { lean: true }
      })
      .select('-__v')
      .sort({ 'metrics.views': -1, createdAt: -1 })
      .limit(limitNum)
      .lean();

    // Process images for S3 URLs
    const processedItems = featuredItems.map(item => ({
      ...item,
      images: item.images?.map(img => {
        if (typeof img === 'string') {
          return { url: img };
        }
        return {
          ...img,
          url: img.url || (img.key ? `${process.env.AWS_S3_BASE_URL}/${img.key}` : '/images/placeholders/part.jpg')
        };
      }) || []
    }));
    
    res.status(200).json({
      success: true,
      count: processedItems.length,
      data: processedItems
    });

  } catch (error) {
    console.error('Error fetching featured items:', error);
    return next(new ErrorResponse('Error fetching featured items', 500));
  }
});

/**
 * @desc    Get recent inventory items
 * @route   GET /api/inventory/recent
 * @access  Public
 */
export const getRecentItems = asyncHandler(async (req, res, next) => {
  const { limit = 8 } = req.query;
  const limitNum = Math.min(20, Math.max(1, parseInt(limit)));

  try {
    const recentItems = await InventoryItem.find({ 
      status: 'active',
      'stock.quantity': { $gt: 0 }
    })
      .populate({
        path: 'business',
        select: 'businessName logo location',
        options: { lean: true }
      })
      .select('-__v')
      .sort('-createdAt')
      .limit(limitNum)
      .lean();

    // Process images for S3 URLs
    const processedItems = recentItems.map(item => ({
      ...item,
      images: item.images?.map(img => {
        if (typeof img === 'string') {
          return { url: img };
        }
        return {
          ...img,
          url: img.url || (img.key ? `${process.env.AWS_S3_BASE_URL}/${img.key}` : '/images/placeholders/part.jpg')
        };
      }) || []
    }));
    
    res.status(200).json({
      success: true,
      count: processedItems.length,
      data: processedItems
    });

  } catch (error) {
    console.error('Error fetching recent items:', error);
    return next(new ErrorResponse('Error fetching recent items', 500));
  }
});

/**
 * @desc    Increment inventory item view count
 * @route   POST /api/inventory/:id/view
 * @access  Public
 */
export const incrementViewCount = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new ErrorResponse('Invalid item ID format', 400));
  }

  try {
    // Rate limiting: check IP-based view tracking
    const clientIP = req.ip || req.connection.remoteAddress;
    const viewKey = `view_${id}_${clientIP}`;
    
    // Simple in-memory rate limiting (in production, use Redis)
    if (!global.viewCache) global.viewCache = new Map();
    
    const lastView = global.viewCache.get(viewKey);
    const now = Date.now();
    
    // Only count view if last view was more than 1 hour ago
    if (lastView && (now - lastView) < 3600000) {
      return res.status(200).json({
        success: true,
        message: 'View already recorded recently'
      });
    }
    
    // Update view count
    const item = await InventoryItem.findByIdAndUpdate(
      id,
      { 
        $inc: { 'metrics.views': 1 },
        'metrics.lastViewed': now
      },
      { new: true, select: 'metrics.views' }
    );
    
    if (!item) {
      return next(new ErrorResponse(`Inventory item not found with id ${id}`, 404));
    }
    
    // Cache this view
    global.viewCache.set(viewKey, now);
    
    // Clean old cache entries periodically
    if (global.viewCache.size > 10000) {
      const cutoff = now - 3600000; // 1 hour ago
      for (const [key, timestamp] of global.viewCache.entries()) {
        if (timestamp < cutoff) {
          global.viewCache.delete(key);
        }
      }
    }
    
    res.status(200).json({
      success: true,
      data: {
        views: item.metrics.views
      }
    });

  } catch (error) {
    console.error('Error incrementing view count:', error);
    return next(new ErrorResponse('Error recording view', 500));
  }
});

/**
 * @desc    Get related inventory items
 * @route   GET /api/inventory/:id/related
 * @access  Public
 */
export const getRelatedItems = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { limit = 4 } = req.query;

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new ErrorResponse('Invalid item ID format', 400));
  }

  const limitNum = Math.min(10, Math.max(1, parseInt(limit)));

  try {
    const item = await InventoryItem.findById(id).select('category businessId price').lean();
    
    if (!item) {
      return next(new ErrorResponse(`Inventory item not found with id ${id}`, 404));
    }
    
    // Build query for related items
    const relatedQuery = {
      _id: { $ne: item._id },
      status: 'active',
      'stock.quantity': { $gt: 0 },
      $or: [
        { category: item.category },
        { businessId: item.businessId }
      ]
    };

    // Add price range filter if item has price
    if (item.price) {
      const priceRange = item.price * 0.3; // 30% price variance
      relatedQuery.$or.push({
        price: {
          $gte: item.price - priceRange,
          $lte: item.price + priceRange
        }
      });
    }
    
    const relatedItems = await InventoryItem.find(relatedQuery)
      .populate({
        path: 'business',
        select: 'businessName logo location',
        options: { lean: true }
      })
      .select('-__v')
      .sort({ 'metrics.views': -1, createdAt: -1 })
      .limit(limitNum)
      .lean();

    // Process images for S3 URLs
    const processedItems = relatedItems.map(item => ({
      ...item,
      images: item.images?.map(img => {
        if (typeof img === 'string') {
          return { url: img };
        }
        return {
          ...img,
          url: img.url || (img.key ? `${process.env.AWS_S3_BASE_URL}/${img.key}` : '/images/placeholders/part.jpg')
        };
      }) || []
    }));
    
    res.status(200).json({
      success: true,
      count: processedItems.length,
      data: processedItems
    });

  } catch (error) {
    console.error('Error fetching related items:', error);
    return next(new ErrorResponse('Error fetching related items', 500));
  }
});