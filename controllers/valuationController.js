// server/controllers/valuationController.js - Car Valuation System

import asyncHandler from '../middleware/async.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import Valuation from '../models/Valuation.js';
import User from '../models/User.js';
import { uploadMultipleImagesToS3, deleteImageFromS3 } from '../utils/s3Upload.js';

// @desc    Create new valuation request
// @route   POST /api/valuations
// @access  Private
export const createValuationRequest = asyncHandler(async (req, res, next) => {
  const {
    make,
    model,
    year,
    mileage,
    condition,
    additionalInfo,
    contactPreferences
  } = req.body;

  // Validate required fields
  if (!make || !model || !year) {
    return next(new ErrorResponse('Make, model, and year are required', 400));
  }

  // Process uploaded images if any
  let images = [];
  if (req.files && req.files.length > 0) {
    try {
      console.log('Processing uploaded images for valuation:', req.files.length);
      
      const uploadResults = await uploadMultipleImagesToS3(req.files, 'valuations', {
        optimization: {
          quality: 85,
          format: 'webp'
        },
        createThumbnail: true
      });

      images = uploadResults.map((result) => ({
        url: result.url,
        key: result.key,
        size: result.size,
        mimetype: result.mimetype,
        thumbnail: result.thumbnail
      }));

      console.log('Images uploaded successfully for valuation');
    } catch (uploadError) {
      console.error('Image upload failed for valuation:', uploadError);
      return next(new ErrorResponse('Failed to upload images', 500));
    }
  }

  // Create valuation request
  const valuation = await Valuation.create({
    user: req.user.id,
    vehicleInfo: {
      make: make.trim(),
      model: model.trim(),
      year: parseInt(year),
      mileage: mileage ? parseInt(mileage) : null,
      condition: condition
    },
    images,
    additionalInfo: additionalInfo?.trim(),
    contactInfo: {
      name: req.user.name,
      email: req.user.email,
      phone: req.user.profile?.phone || '',
      preferredMethod: contactPreferences || 'email'
    },
    status: 'pending',
    requestedAt: new Date()
  });

  // Populate user information
  await valuation.populate('user', 'name email profile.phone');

  // TODO: Send notification to valuation experts
  // You can implement email notification or admin dashboard notification here

  res.status(201).json({
    success: true,
    message: 'Valuation request submitted successfully. You will receive an estimate within 24 hours.',
    data: valuation
  });
});

// @desc    Get user's valuation requests
// @route   GET /api/valuations/my-valuations
// @access  Private
export const getMyValuations = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const valuations = await Valuation.find({ user: req.user.id })
    .sort('-createdAt')
    .skip(skip)
    .limit(limit);

  const total = await Valuation.countDocuments({ user: req.user.id });

  res.status(200).json({
    success: true,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      total,
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1
    },
    data: valuations
  });
});

// @desc    Get single valuation request
// @route   GET /api/valuations/:id
// @access  Private
export const getValuationRequest = asyncHandler(async (req, res, next) => {
  const valuation = await Valuation.findById(req.params.id).populate('user', 'name email profile.phone');

  if (!valuation) {
    return next(new ErrorResponse('Valuation request not found', 404));
  }

  // Check if user owns the valuation or is admin
  if (valuation.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Access denied to this valuation request', 403));
  }

  res.status(200).json({
    success: true,
    data: valuation
  });
});

// @desc    Update valuation request (before expert review)
// @route   PUT /api/valuations/:id
// @access  Private
export const updateValuationRequest = asyncHandler(async (req, res, next) => {
  let valuation = await Valuation.findById(req.params.id);

  if (!valuation) {
    return next(new ErrorResponse('Valuation request not found', 404));
  }

  // Check ownership
  if (valuation.user.toString() !== req.user.id) {
    return next(new ErrorResponse('Access denied to this valuation request', 403));
  }

  // Check if valuation can still be updated
  if (valuation.status !== 'pending') {
    return next(new ErrorResponse('Cannot update valuation request after expert review has started', 400));
  }

  const {
    make,
    model,
    year,
    mileage,
    condition,
    additionalInfo
  } = req.body;

  // Update vehicle info
  if (make) valuation.vehicleInfo.make = make.trim();
  if (model) valuation.vehicleInfo.model = model.trim();
  if (year) valuation.vehicleInfo.year = parseInt(year);
  if (mileage !== undefined) valuation.vehicleInfo.mileage = mileage ? parseInt(mileage) : null;
  if (condition) valuation.vehicleInfo.condition = condition;
  if (additionalInfo !== undefined) valuation.additionalInfo = additionalInfo.trim();

  // Handle new image uploads
  if (req.files && req.files.length > 0) {
    try {
      const uploadResults = await uploadMultipleImagesToS3(req.files, 'valuations', {
        optimization: {
          quality: 85,
          format: 'webp'
        },
        createThumbnail: true
      });

      const newImages = uploadResults.map((result) => ({
        url: result.url,
        key: result.key,
        size: result.size,
        mimetype: result.mimetype,
        thumbnail: result.thumbnail
      }));

      valuation.images = [...valuation.images, ...newImages];
    } catch (uploadError) {
      console.error('Image upload failed:', uploadError);
      return next(new ErrorResponse('Failed to upload images', 500));
    }
  }

  valuation.updatedAt = new Date();
  await valuation.save();

  res.status(200).json({
    success: true,
    message: 'Valuation request updated successfully',
    data: valuation
  });
});

// @desc    Delete valuation request
// @route   DELETE /api/valuations/:id
// @access  Private
export const deleteValuationRequest = asyncHandler(async (req, res, next) => {
  const valuation = await Valuation.findById(req.params.id);

  if (!valuation) {
    return next(new ErrorResponse('Valuation request not found', 404));
  }

  // Check ownership
  if (valuation.user.toString() !== req.user.id) {
    return next(new ErrorResponse('Access denied to this valuation request', 403));
  }

  // Delete associated images from S3
  if (valuation.images && valuation.images.length > 0) {
    try {
      const deletePromises = valuation.images.map(image => deleteImageFromS3(image.key));
      await Promise.all(deletePromises);
    } catch (error) {
      console.error('Failed to delete some images from S3:', error);
      // Continue with valuation deletion even if image deletion fails
    }
  }

  await valuation.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Valuation request deleted successfully'
  });
});

// @desc    Get all valuation requests (admin only)
// @route   GET /api/valuations/admin/all
// @access  Private/Admin
export const getValuationRequests = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const { status, make, sortBy } = req.query;

  // Build query
  const query = {};
  if (status) query.status = status;
  if (make) query['vehicleInfo.make'] = new RegExp(make, 'i');

  // Build sort
  let sort = '-createdAt';
  if (sortBy === 'oldest') sort = 'createdAt';
  if (sortBy === 'urgency') sort = '-requestedAt';

  const valuations = await Valuation.find(query)
    .populate('user', 'name email profile.phone')
    .sort(sort)
    .skip(skip)
    .limit(limit);

  const total = await Valuation.countDocuments(query);

  res.status(200).json({
    success: true,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      total,
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1
    },
    data: valuations
  });
});

// @desc    Submit valuation estimate (experts/admins only)
// @route   POST /api/valuations/:id/estimate
// @access  Private/Admin
export const submitValuationEstimate = asyncHandler(async (req, res, next) => {
  const valuation = await Valuation.findById(req.params.id);

  if (!valuation) {
    return next(new ErrorResponse('Valuation request not found', 404));
  }

  const {
    estimatedValue,
    lowEstimate,
    highEstimate,
    marketConditions,
    valuerNotes,
    confidenceLevel,
    comparableVehicles
  } = req.body;

  if (!estimatedValue) {
    return next(new ErrorResponse('Estimated value is required', 400));
  }

  // Update valuation with estimate
  valuation.estimate = {
    value: parseFloat(estimatedValue),
    lowRange: lowEstimate ? parseFloat(lowEstimate) : null,
    highRange: highEstimate ? parseFloat(highEstimate) : null,
    currency: 'BWP',
    marketConditions: marketConditions || '',
    valuerNotes: valuerNotes || '',
    confidenceLevel: confidenceLevel || 'medium',
    comparableVehicles: comparableVehicles || [],
    valuedBy: req.user.id,
    valuedAt: new Date()
  };

  valuation.status = 'completed';
  valuation.completedAt = new Date();
  await valuation.save();

  // Populate the valuer information
  await valuation.populate('estimate.valuedBy', 'name email');

  // TODO: Send notification to user about completed valuation
  // You can implement email notification here

  res.status(200).json({
    success: true,
    message: 'Valuation estimate submitted successfully',
    data: valuation
  });
});

// @desc    Get valuation statistics (admin only)
// @route   GET /api/valuations/admin/stats
// @access  Private/Admin
export const getValuationStats = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;
  
  const matchCondition = {};
  if (startDate && endDate) {
    matchCondition.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  // Overall statistics
  const totalStats = await Valuation.aggregate([
    { $match: matchCondition },
    {
      $group: {
        _id: null,
        totalRequests: { $sum: 1 },
        completedRequests: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        pendingRequests: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        inProgressRequests: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
        averageEstimate: { $avg: '$estimate.value' }
      }
    }
  ]);

  // Requests by vehicle make
  const requestsByMake = await Valuation.aggregate([
    { $match: matchCondition },
    {
      $group: {
        _id: '$vehicleInfo.make',
        count: { $sum: 1 },
        avgEstimate: { $avg: '$estimate.value' }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);

  // Requests by condition
  const requestsByCondition = await Valuation.aggregate([
    { $match: matchCondition },
    {
      $group: {
        _id: '$vehicleInfo.condition',
        count: { $sum: 1 },
        avgEstimate: { $avg: '$estimate.value' }
      }
    }
  ]);

  // Daily request trends (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const dailyRequests = await Valuation.aggregate([
    {
      $match: {
        createdAt: { $gte: thirtyDaysAgo }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        requests: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  res.status(200).json({
    success: true,
    data: {
      overview: totalStats[0] || {
        totalRequests: 0,
        completedRequests: 0,
        pendingRequests: 0,
        inProgressRequests: 0,
        averageEstimate: 0
      },
      requestsByMake,
      requestsByCondition,
      dailyRequests
    }
  });
});
