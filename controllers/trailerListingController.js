// server/controllers/trailerListingController.js
import asyncHandler from '../middleware/async.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import TrailerListing from '../models/TrailerListing.js';
import ServiceProvider, { PROVIDER_TYPES } from '../models/ServiceProvider.js';
import { uploadImage, deleteImage } from '../utils/imageUpload.js';
import mongoose from 'mongoose';

/**
 * @desc    Get all trailer listings with filtering, sorting and pagination
 * @route   GET /api/trailers
 * @access  Public
 */
export const getTrailerListings = asyncHandler(async (req, res, next) => {
  // Extract query parameters
  const {
    search,
    trailerType,
    minCapacity,
    maxCapacity,
    minSize,
    maxSize,
    minPrice,
    maxPrice,
    status,
    availability,
    city,
    country,
    page = 1,
    limit = 10,
    sort = '-createdAt'
  } = req.query;

  // Build query
  const query = {};

  // Basic search
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { trailerType: { $regex: search, $options: 'i' } }
    ];
  }

  // Trailer type filter
  if (trailerType) {
    query.trailerType = trailerType;
  }

  // Capacity range
  if (minCapacity || maxCapacity) {
    query['specifications.capacity.weight'] = {};
    if (minCapacity) query['specifications.capacity.weight'].$gte = parseInt(minCapacity);
    if (maxCapacity) query['specifications.capacity.weight'].$lte = parseInt(maxCapacity);
  }

  // Size range (length)
  if (minSize || maxSize) {
    query['specifications.size.length'] = {};
    if (minSize) query['specifications.size.length'].$gte = parseFloat(minSize);
    if (maxSize) query['specifications.size.length'].$lte = parseFloat(maxSize);
  }

  // Price range
  if (minPrice || maxPrice) {
    query['rates.daily'] = {};
    if (minPrice) query['rates.daily'].$gte = parseInt(minPrice);
    if (maxPrice) query['rates.daily'].$lte = parseInt(maxPrice);
  }

  // Status
  if (status && status !== 'all') {
    query.status = status;
  }

  // Availability
  if (availability && availability !== 'all') {
    query.availability = availability;
  }

  // Location filters
  if (city) {
    query['location.city'] = { $regex: city, $options: 'i' };
  }

  if (country) {
    query['location.country'] = { $regex: country, $options: 'i' };
  }

  // Calculate pagination
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  
  // Only show available trailers by default, unless specified otherwise
  if (!query.status) {
    query.status = 'available';
  }
  
  // Count total documents matching the query
  const total = await TrailerListing.countDocuments(query);

  // Execute query with pagination and sorting
  const trailers = await TrailerListing.find(query)
    .sort(sort)
    .skip(startIndex)
    .limit(parseInt(limit));

  // Create pagination object
  const pagination = {
    currentPage: parseInt(page),
    totalPages: Math.ceil(total / limit),
    total
  };

  // Add next/prev pages if available
  if (endIndex < total) {
    pagination.next = {
      page: page + 1,
      limit
    };
  }

  if (startIndex > 0) {
    pagination.prev = {
      page: page - 1,
      limit
    };
  }

  res.status(200).json({
    success: true,
    pagination,
    count: trailers.length,
    data: trailers
  });
});

/**
 * @desc    Get single trailer listing
 * @route   GET /api/trailers/:id
 * @access  Public
 */
export const getTrailerListing = asyncHandler(async (req, res, next) => {
  const trailer = await TrailerListing.findById(req.params.id);

  if (!trailer) {
    return next(new ErrorResponse(`Trailer listing not found with id ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: trailer
  });
});

/**
 * @desc    Create new trailer listing
 * @route   POST /api/trailers
 * @access  Private (Admin or Provider)
 */
export const createTrailerListing = asyncHandler(async (req, res, next) => {
  // Parse trailer data from form
  const trailerData = JSON.parse(req.body.trailerData || '{}');
  
  // Check required fields
  if (!trailerData.title || !trailerData.providerId || !trailerData.trailerType) {
    return next(new ErrorResponse('Please provide title, provider ID, and trailer type', 400));
  }
  
  // Check if providerId is valid
  if (!mongoose.Types.ObjectId.isValid(trailerData.providerId)) {
    return next(new ErrorResponse('Invalid provider ID', 400));
  }
  
  // Verify the provider exists and is of type TRAILER_RENTAL
  const provider = await ServiceProvider.findById(trailerData.providerId);
  
  if (!provider) {
    return next(new ErrorResponse(`Provider not found with id ${trailerData.providerId}`, 404));
  }
  
  if (provider.providerType !== PROVIDER_TYPES.TRAILER_RENTAL) {
    return next(new ErrorResponse('Provider must be a trailer rental provider', 400));
  }
  
  // Check if user is authorized (admin or provider owner)
  if (req.user.role !== 'admin' && provider.user.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to add trailers for this provider', 403));
  }
  
  // Check if provider subscription allows more listings
  const subscriptionCheck = await provider.canAddListing();
  if (!subscriptionCheck.allowed) {
    return next(new ErrorResponse(subscriptionCheck.reason, 403));
  }
  
  // Add provider information to the trailer
  trailerData.provider = {
    name: provider.businessName,
    businessName: provider.businessName,
    logo: provider.profile?.logo,
    contact: {
      phone: provider.contact?.phone,
      email: provider.contact?.email
    },
    location: {
      city: provider.location?.city,
      country: provider.location?.country
    }
  };
  
  // Process trailer images
  if (req.files && req.files.length > 0) {
    trailerData.images = [];
    
    // Loop through each file and upload
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      
      try {
        const uploadResult = await uploadImage(file, 'trailers');
        
        trailerData.images.push({
          url: uploadResult.url,
          key: uploadResult.key,
          size: uploadResult.size,
          mimetype: uploadResult.mimetype,
          isPrimary: i === parseInt(req.body.primaryImage || 0)
        });
      } catch (error) {
        return next(new ErrorResponse(`Image upload failed: ${error.message}`, 500));
      }
    }
  }
  
  // Create trailer listing
  const trailer = await TrailerListing.create(trailerData);
  
  // Update provider metrics
  await ServiceProvider.findByIdAndUpdate(trailerData.providerId, {
    $inc: { 'metrics.totalListings': 1 }
  });
  
  res.status(201).json({
    success: true,
    data: trailer
  });
});

/**
 * @desc    Update trailer listing
 * @route   PUT /api/trailers/:id
 * @access  Private (Admin or Provider Owner)
 */
export const updateTrailerListing = asyncHandler(async (req, res, next) => {
  let trailer = await TrailerListing.findById(req.params.id);
  
  if (!trailer) {
    return next(new ErrorResponse(`Trailer listing not found with id ${req.params.id}`, 404));
  }
  
  // Check if user is authorized (admin or provider owner)
  const provider = await ServiceProvider.findById(trailer.providerId);
  
  if (!provider) {
    return next(new ErrorResponse('Provider not found', 404));
  }
  
  if (req.user.role !== 'admin' && provider.user.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to update this trailer', 403));
  }
  
  // Parse trailer data from form
  const trailerData = JSON.parse(req.body.trailerData || '{}');
  
  // Process trailer images if present
  if (req.files && req.files.length > 0) {
    // If keepImages is not true, delete existing images
    if (trailerData.keepImages !== true) {
      // Delete old images
      if (trailer.images && trailer.images.length > 0) {
        for (const image of trailer.images) {
          await deleteImage(image.key || image.url);
        }
      }
      
      trailerData.images = [];
    } else {
      // Keep existing images
      trailerData.images = trailer.images || [];
    }
    
    // Add new images
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      
      try {
        const uploadResult = await uploadImage(file, 'trailers');
        
        trailerData.images.push({
          url: uploadResult.url,
          key: uploadResult.key,
          size: uploadResult.size,
          mimetype: uploadResult.mimetype,
          isPrimary: false
        });
      } catch (error) {
        return next(new ErrorResponse(`Image upload failed: ${error.message}`, 500));
      }
    }
    
    // Update primary image if specified
    if (req.body.primaryImage) {
      const primaryIndex = parseInt(req.body.primaryImage);
      
      if (primaryIndex >= 0 && primaryIndex < trailerData.images.length) {
        trailerData.images = trailerData.images.map((image, index) => ({
          ...image,
          isPrimary: index === primaryIndex
        }));
      }
    }
  }
  
  // Update provider information if it has changed
  if (trailerData.providerId && trailerData.providerId !== trailer.providerId.toString()) {
    const newProvider = await ServiceProvider.findById(trailerData.providerId);
    
    if (!newProvider) {
      return next(new ErrorResponse(`New provider not found with id ${trailerData.providerId}`, 404));
    }
    
    if (newProvider.providerType !== PROVIDER_TYPES.TRAILER_RENTAL) {
      return next(new ErrorResponse('New provider must be a trailer rental provider', 400));
    }
    
    // Check if user is authorized for new provider
    if (req.user.role !== 'admin' && newProvider.user.toString() !== req.user.id) {
      return next(new ErrorResponse('Not authorized to transfer this trailer to the new provider', 403));
    }
    
    // Update provider info
    trailerData.provider = {
      name: newProvider.businessName,
      businessName: newProvider.businessName,
      logo: newProvider.profile?.logo,
      contact: {
        phone: newProvider.contact?.phone,
        email: newProvider.contact?.email
      },
      location: {
        city: newProvider.location?.city,
        country: newProvider.location?.country
      }
    };
    
    // Update provider metrics (decrement old, increment new)
    await ServiceProvider.findByIdAndUpdate(trailer.providerId, {
      $inc: { 'metrics.totalListings': -1 }
    });
    
    await ServiceProvider.findByIdAndUpdate(trailerData.providerId, {
      $inc: { 'metrics.totalListings': 1 }
    });
  }
  
  // Update trailer listing
  trailer = await TrailerListing.findByIdAndUpdate(
    req.params.id,
    trailerData,
    {
      new: true,
      runValidators: true
    }
  );
  
  res.status(200).json({
    success: true,
    data: trailer
  });
});

/**
 * @desc    Add review for trailer listing
 * @route   POST /api/trailers/:id/reviews
 * @access  Private
 */
export const addReview = asyncHandler(async (req, res, next) => {
  const { rating, comment } = req.body;
  
  if (!rating || rating < 1 || rating > 5) {
    return next(new ErrorResponse('Please provide a valid rating between 1 and 5', 400));
  }
  
  const trailer = await TrailerListing.findById(req.params.id);
  
  if (!trailer) {
    return next(new ErrorResponse(`Trailer listing not found with id ${req.params.id}`, 404));
  }
  
  // Check if user has already reviewed this trailer
  const alreadyReviewed = trailer.reviews.find(
    review => review.user.toString() === req.user.id
  );
  
  if (alreadyReviewed) {
    return next(new ErrorResponse('You have already reviewed this trailer', 400));
  }
  
  // Create review object
  const review = {
    user: req.user.id,
    userName: req.user.name,
    rating: Number(rating),
    comment
  };
  
  // Add review to trailer
  await trailer.addReview(review);
  
  res.status(201).json({
    success: true,
    message: 'Review added successfully'
  });
});



/**
 * @desc    Delete trailer listing
 * @route   DELETE /api/trailers/:id
 * @access  Private (Admin or Provider Owner)
 */
export const deleteTrailerListing = asyncHandler(async (req, res, next) => {
  const trailer = await TrailerListing.findById(req.params.id);
  
  if (!trailer) {
    return next(new ErrorResponse(`Trailer listing not found with id ${req.params.id}`, 404));
  }
  
  // Check if user is authorized (admin or provider owner)
  const provider = await ServiceProvider.findById(trailer.providerId);
  
  if (provider && req.user.role !== 'admin' && provider.user.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to delete this trailer', 403));
  }
  
  // Delete images
  if (trailer.images && trailer.images.length > 0) {
    for (const image of trailer.images) {
      await deleteImage(image.key || image.url);
    }
  }
  
  // Delete trailer
  await trailer.remove();
  
  // Update provider metrics
  if (provider) {
    await ServiceProvider.findByIdAndUpdate(trailer.providerId, {
      $inc: { 'metrics.totalListings': -1 }
    });
  }
  
  res.status(200).json({
    success: true,
    data: {}
  });
});

/**
 * @desc    Get featured trailer listings
 * @route   GET /api/trailers/featured
 * @access  Public
 */
export const getFeaturedTrailers = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit, 10) || 6;
  
  const trailers = await TrailerListing.find({
    featured: true,
    status: 'available'
  })
    .limit(limit)
    .sort('-createdAt');
  
  res.status(200).json({
    success: true,
    count: trailers.length,
    data: trailers
  });
});

/**
 * @desc    Get trailer listings for specific provider
 * @route   GET /api/trailers/provider/:providerId
 * @access  Public
 */
export const getProviderTrailers = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;
  
  const provider = await ServiceProvider.findById(req.params.providerId);
  
  if (!provider) {
    return next(new ErrorResponse(`Provider not found with id ${req.params.providerId}`, 404));
  }
  
  if (provider.providerType !== PROVIDER_TYPES.TRAILER_RENTAL) {
    return next(new ErrorResponse('Provider is not a trailer rental service', 400));
  }
  
  const query = { providerId: req.params.providerId };
  
  // Apply status filter if provided
  if (req.query.status && req.query.status !== 'all') {
    query.status = req.query.status;
  } else {
    // Default to available trailers only
    query.status = 'available';
  }
  
  // Count total
  const total = await TrailerListing.countDocuments(query);
  
  // Execute query
  const trailers = await TrailerListing.find(query)
    .skip(startIndex)
    .limit(limit)
    .sort(req.query.sort || '-createdAt');
  
  // Create pagination object
  const pagination = {
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    total
  };
  
  res.status(200).json({
    success: true,
    pagination,
    count: trailers.length,
    data: trailers
  });
});

/**
 * @desc    Get similar trailer listings
 * @route   GET /api/trailers/:id/similar
 * @access  Public
 */
export const getSimilarTrailers = asyncHandler(async (req, res, next) => {
  const trailer = await TrailerListing.findById(req.params.id);
  
  if (!trailer) {
    return next(new ErrorResponse(`Trailer listing not found with id ${req.params.id}`, 404));
  }
  
  const limit = parseInt(req.query.limit, 10) || 4;
  
  // Find similar trailers (same type, similar capacity range)
  const similarTrailers = await TrailerListing.find({
    _id: { $ne: trailer._id },
    trailerType: trailer.trailerType,
    status: 'available',
    'specifications.capacity.weight': {
      $gte: trailer.specifications.capacity.weight * 0.7,
      $lte: trailer.specifications.capacity.weight * 1.3
    }
  })
    .limit(limit)
    .sort('-createdAt');
  
  res.status(200).json({
    success: true,
    count: similarTrailers.length,
    data: similarTrailers
  });
});

/**
 * @desc    Check trailer availability
 * @route   POST /api/trailers/:id/availability
 * @access  Public
 */
export const checkAvailability = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.body;
  
  if (!startDate || !endDate) {
    return next(new ErrorResponse('Please provide start and end dates', 400));
  }
  
  const trailer = await TrailerListing.findById(req.params.id);
  
  if (!trailer) {
    return next(new ErrorResponse(`Trailer listing not found with id ${req.params.id}`, 404));
  }
  
  // Check availability using model method
  const availabilityCheck = trailer.checkAvailability(startDate, endDate);
  
  res.status(200).json({
    success: true,
    data: availabilityCheck
  });
});

/**
 * @desc    Calculate rental cost
 * @route   POST /api/trailers/:id/calculate
 * @access  Public
 */
export const calculateRentalCost = asyncHandler(async (req, res, next) => {
  const { startDate, endDate, options } = req.body;
  
  if (!startDate || !endDate) {
    return next(new ErrorResponse('Please provide start and end dates', 400));
  }
  
  const trailer = await TrailerListing.findById(req.params.id);
  
  if (!trailer) {
    return next(new ErrorResponse(`Trailer listing not found with id ${req.params.id}`, 404));
  }
  
  try {
    // Calculate cost using model method
    const costCalculation = trailer.calculateRentalCost(startDate, endDate, options || {});
    
    res.status(200).json({
      success: true,
      data: costCalculation
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 400));
  }
});

/**
 * @desc    Update trailer listing status
 * @route   PATCH /api/trailers/:id/status
 * @access  Private (Admin or Provider Owner)
 */
export const updateStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;
  
  if (!status) {
    return next(new ErrorResponse('Please provide a status', 400));
  }
  
  const trailer = await TrailerListing.findById(req.params.id);
  
  if (!trailer) {
    return next(new ErrorResponse(`Trailer listing not found with id ${req.params.id}`, 404));
  }
  
  // Check if user is authorized (admin or provider owner)
  const provider = await ServiceProvider.findById(trailer.providerId);
  
  if (req.user.role !== 'admin' && provider.user.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to update this trailer', 403));
  }
  
  // Update status
  const updatedTrailer = await TrailerListing.findByIdAndUpdate(
    req.params.id,
    { status },
    {
      new: true,
      runValidators: true
    }
  );
  
  res.status(200).json({
    success: true,
    data: updatedTrailer
  });
});