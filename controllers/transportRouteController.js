// server/controllers/transportRouteController.js - Enhanced for car integration
import asyncHandler from '../middleware/async.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import TransportRoute from '../models/TransportRoute.js';
import ServiceProvider, { PROVIDER_TYPES } from '../models/ServiceProvider.js';
import { uploadImage, deleteImage } from '../utils/imageUpload.js';
import mongoose from 'mongoose';

/**
 * @desc    Get all transport routes with filtering, sorting and pagination - ENHANCED
 * @route   GET /api/transport
 * @access  Public
 */
export const getTransportRoutes = asyncHandler(async (req, res, next) => {
  // Extract query parameters
  const {
    search,
    origin,
    destination,
    routeType,
    serviceType,
    minPrice,
    maxPrice,
    operatingDay,
    status,
    city,
    country,
    providerId, // NEW: Filter by specific provider
    page = 1,
    limit = 10,
    sort = '-createdAt'
  } = req.query;

  // Build query
  const query = {};

  // Provider-specific filtering
  if (providerId) {
    console.log(`Filtering transport routes by provider: ${providerId}`);
    if (mongoose.Types.ObjectId.isValid(providerId)) {
      query.providerId = providerId;
    } else {
      query.providerId = { $in: [providerId, providerId.toString()] };
    }
  }

  // Basic search - ENHANCED to include more fields
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { origin: { $regex: search, $options: 'i' } },
      { destination: { $regex: search, $options: 'i' } },
      { 'stops.name': { $regex: search, $options: 'i' } },
      { 'provider.businessName': { $regex: search, $options: 'i' } },
      { routeNumber: { $regex: search, $options: 'i' } }
    ];
  }

  // Origin filter - ENHANCED with fuzzy matching
  if (origin) {
    query.origin = { $regex: origin, $options: 'i' };
  }

  // Destination filter - ENHANCED with fuzzy matching
  if (destination) {
    query.destination = { $regex: destination, $options: 'i' };
  }

  // Route type filter
  if (routeType) {
    query.routeType = routeType;
  }

  // Service type filter
  if (serviceType) {
    query.serviceType = serviceType;
  }

  // Price range
  if (minPrice || maxPrice) {
    query.fare = {};
    if (minPrice) query.fare.$gte = parseFloat(minPrice);
    if (maxPrice) query.fare.$lte = parseFloat(maxPrice);
  }

  // Operating day
  if (operatingDay) {
    const day = operatingDay.toLowerCase();
    query[`schedule.operatingDays.${day}`] = true;
  }

  // Status - map to operationalStatus
  if (status && status !== 'all') {
    query.operationalStatus = status;
  }

  // Location filters (for provider location)
  if (city) {
    query['provider.location.city'] = { $regex: city, $options: 'i' };
  }

  if (country) {
    query['provider.location.country'] = { $regex: country, $options: 'i' };
  }

  // Calculate pagination
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  
  // Only show active routes by default, unless specified otherwise
  if (!query.operationalStatus) {
    query.operationalStatus = 'active';
  }
  
  // Log the final query for debugging
  if (process.env.NODE_ENV === 'development') {
    console.log('Final transport route query:', JSON.stringify(query, null, 2));
  }
  
  // Count total documents matching the query
  const total = await TransportRoute.countDocuments(query);

  // Execute query with pagination and sorting
  const routes = await TransportRoute.find(query)
    .sort(sort)
    .skip(startIndex)
    .limit(parseInt(limit));

  // Log results for debugging
  if (process.env.NODE_ENV === 'development') {
    console.log(`Found ${routes.length} transport routes matching filters`);
    if ((req.query.origin || req.query.destination) && routes.length > 0) {
      console.log('Sample route destinations:', 
        routes.slice(0, 3).map(r => ({
          origin: r.origin,
          destination: r.destination,
          provider: r.provider?.businessName
        }))
      );
    }
  }

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
    count: routes.length,
    total,
    data: routes,
    // Alternative format for backward compatibility
    routes: routes
  });
});

/**
 * @desc    Get single transport route - ENHANCED with related data
 * @route   GET /api/transport/:id
 * @access  Public
 */
export const getTransportRoute = asyncHandler(async (req, res, next) => {
  const route = await TransportRoute.findById(req.params.id);

  if (!route) {
    return next(new ErrorResponse(`Transport route not found with id ${req.params.id}`, 404));
  }

  // ENHANCED: Increment view count asynchronously
  try {
    await TransportRoute.findByIdAndUpdate(req.params.id, {
      $inc: { views: 1 }
    });
  } catch (viewError) {
    console.error('Error incrementing route views:', viewError);
    // Don't fail the request if view increment fails
  }

  res.status(200).json({
    success: true,
    data: route
  });
});

/**
 * @desc    Create new transport route
 * @route   POST /api/transport
 * @access  Private (Admin or Provider)
 */
export const createTransportRoute = asyncHandler(async (req, res, next) => {
  try {
    console.log('=== CREATE TRANSPORT ROUTE START ===');
    console.log('Request body:', req.body);
    console.log('Request files:', req.files?.length || 0);
    
    // Parse route data from form
    let routeData;
    try {
      routeData = JSON.parse(req.body.routeData || '{}');
      console.log('Parsed route data:', routeData);
    } catch (parseError) {
      console.error('Error parsing routeData:', parseError);
      return next(new ErrorResponse('Invalid route data format', 400));
    }
    
    // Check required fields
    if (!routeData.origin || !routeData.destination || !routeData.providerId || !routeData.routeType) {
      console.error('Missing required fields:', {
        origin: !routeData.origin,
        destination: !routeData.destination,
        providerId: !routeData.providerId,
        routeType: !routeData.routeType
      });
      return next(new ErrorResponse('Please provide origin, destination, provider ID, and route type', 400));
    }
    
    // Check if providerId is valid
    if (!mongoose.Types.ObjectId.isValid(routeData.providerId)) {
      console.error('Invalid provider ID format:', routeData.providerId);
      return next(new ErrorResponse('Invalid provider ID', 400));
    }
    
    // Verify the provider exists and is of type PUBLIC_TRANSPORT
    const provider = await ServiceProvider.findById(routeData.providerId);
    
    if (!provider) {
      console.error('Provider not found:', routeData.providerId);
      return next(new ErrorResponse(`Provider not found with id ${routeData.providerId}`, 404));
    }
    
    if (provider.providerType !== PROVIDER_TYPES.PUBLIC_TRANSPORT) {
      console.error('Invalid provider type:', provider.providerType);
      return next(new ErrorResponse('Provider must be a public transport provider', 400));
    }
    
    // Check if user is authorized (admin or provider owner)
    if (req.user.role !== 'admin' && provider.user && provider.user.toString() !== req.user.id) {
      console.error('Authorization failed');
      return next(new ErrorResponse('Not authorized to add routes for this provider', 403));
    }
    
    // Check if provider subscription allows more listings
    let subscriptionCheck = { allowed: true };
    
    if (provider.canAddListing && typeof provider.canAddListing === 'function') {
      subscriptionCheck = await provider.canAddListing();
      if (!subscriptionCheck.allowed) {
        console.error('Subscription check failed:', subscriptionCheck.reason);
        return next(new ErrorResponse(subscriptionCheck.reason, 403));
      }
    }
    
    // Add provider information to the route
    routeData.provider = {
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
    
    // Process route images - handle S3 images from middleware
    if (req.s3Images && req.s3Images.length > 0) {
      routeData.images = req.s3Images.map((s3Image, index) => ({
        url: s3Image.url,
        thumbnail: s3Image.thumbnail || null,
        key: s3Image.key,
        size: s3Image.size,
        mimetype: s3Image.mimetype,
        isPrimary: index === parseInt(req.body.primaryImage || 0)
      }));
      console.log('Added S3 images to route data:', routeData.images.length);
    } else if (req.files && req.files.length > 0) {
      // Fallback to local upload if S3 is not available
      console.log('Using fallback local upload');
      routeData.images = [];
      
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        
        try {
          const uploadResult = await uploadImage(file, 'transport');
          
          routeData.images.push({
            url: uploadResult.url,
            key: uploadResult.key || null,
            size: uploadResult.size,
            mimetype: uploadResult.mimetype,
            isPrimary: i === parseInt(req.body.primaryImage || 0)
          });
        } catch (error) {
          console.error('Image upload failed:', error);
          return next(new ErrorResponse(`Image upload failed: ${error.message}`, 500));
        }
      }
    }
    
    // Set default values for required fields
    if (!routeData.fare || routeData.fare <= 0) {
      console.error('Invalid fare amount:', routeData.fare);
      return next(new ErrorResponse('Please provide a valid fare amount', 400));
    }
    
    // Ensure required nested fields have defaults
    if (!routeData.schedule) {
      routeData.schedule = {};
    }
    
    if (!routeData.schedule.frequency) {
      routeData.schedule.frequency = 'Daily';
    }
    
    if (!routeData.schedule.operatingDays) {
      routeData.schedule.operatingDays = {
        monday: true,
        tuesday: true,
        wednesday: true,
        thursday: true,
        friday: true,
        saturday: true,
        sunday: true
      };
    }
    
    // Map status to operationalStatus
    if (routeData.status) {
      routeData.operationalStatus = routeData.status;
      delete routeData.status;
    } else if (!routeData.operationalStatus) {
      routeData.operationalStatus = 'active';
    }

    // ENHANCED: Initialize view count and other metrics
    routeData.views = 0;
    routeData.bookings = 0;
    
    // Log final route data before creation
    console.log('Final route data for creation:', JSON.stringify(routeData, null, 2));
    
    // Create transport route
    const route = await TransportRoute.create(routeData);
    
    if (!route) {
      console.error('Route creation returned null');
      return next(new ErrorResponse('Failed to create route', 500));
    }
    
    console.log('Route created successfully:', route._id);
    
    // Update provider metrics
    await ServiceProvider.findByIdAndUpdate(routeData.providerId, {
      $inc: { 'metrics.totalListings': 1 }
    });
    
    console.log('Provider metrics updated');
    console.log('=== CREATE TRANSPORT ROUTE END ===');
    
    res.status(201).json({
      success: true,
      data: route
    });
  } catch (error) {
    console.error('=== CREATE TRANSPORT ROUTE ERROR ===');
    console.error('Error details:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Check for specific MongoDB validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      console.error('Validation errors:', messages);
      return next(new ErrorResponse(`Validation error: ${messages.join(', ')}`, 400));
    }
    
    // Check for duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      console.error('Duplicate key error:', field);
      return next(new ErrorResponse(`Duplicate field value: ${field}`, 400));
    }
    
    return next(new ErrorResponse(`Failed to create transport route: ${error.message}`, 500));
  }
});

/**
 * @desc    Update transport route
 * @route   PUT /api/transport/:id
 * @access  Private (Admin or Provider Owner)
 */
export const updateTransportRoute = asyncHandler(async (req, res, next) => {
  let route = await TransportRoute.findById(req.params.id);
  
  if (!route) {
    return next(new ErrorResponse(`Transport route not found with id ${req.params.id}`, 404));
  }
  
  // Check if user is authorized (admin or provider owner)
  const provider = await ServiceProvider.findById(route.providerId);
  
  if (!provider) {
    return next(new ErrorResponse('Provider not found', 404));
  }
  
  if (req.user.role !== 'admin' && provider.user.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to update this route', 403));
  }
  
  // Parse route data from form
  let routeData;
  
  try {
    routeData = req.body.routeData 
      ? (typeof req.body.routeData === 'string' 
          ? JSON.parse(req.body.routeData) 
          : req.body.routeData)
      : req.body;
  } catch (parseError) {
    return next(new ErrorResponse('Invalid route data format', 400));
  }
  
  // Map status to operationalStatus if provided
  if (routeData.status) {
    routeData.operationalStatus = routeData.status;
    delete routeData.status;
  }
  
  // UPDATED: Process route images if present - handle S3 images from middleware
  if (req.s3Images && req.s3Images.length > 0) {
    // If keepImages is not true, delete existing images
    if (routeData.keepImages !== true) {
      // Delete old images
      if (route.images && route.images.length > 0) {
        for (const image of route.images) {
          try {
            if (image.key) {
              await deleteImage(image.key);
            } else if (image.url && image.url.includes('amazonaws.com')) {
              // Extract key from URL
              const urlParts = image.url.split('/');
              const key = urlParts.slice(3).join('/');
              await deleteImage(key);
            }
          } catch (error) {
            console.warn('Could not delete old image:', error);
          }
        }
      }
      
      routeData.images = [];
    } else {
      // Keep existing images
      routeData.images = route.images || [];
    }
    
    // Add new S3 images
    const newImages = req.s3Images.map((s3Image, index) => ({
      url: s3Image.url,
      thumbnail: s3Image.thumbnail || null,
      key: s3Image.key,
      size: s3Image.size,
      mimetype: s3Image.mimetype,
      isPrimary: false
    }));
    
    routeData.images = [...routeData.images, ...newImages];
    
    // Update primary image if specified
    if (req.body.primaryImage) {
      const primaryIndex = parseInt(req.body.primaryImage);
      
      if (primaryIndex >= 0 && primaryIndex < routeData.images.length) {
        routeData.images = routeData.images.map((image, index) => ({
          ...image,
          isPrimary: index === primaryIndex
        }));
      }
    }
  } else if (req.files && req.files.length > 0) {
    // Fallback to local upload
    // If keepImages is not true, delete existing images
    if (routeData.keepImages !== true) {
      // Delete old images
      if (route.images && route.images.length > 0) {
        for (const image of route.images) {
          try {
            if (image.key) {
              await deleteImage(image.key);
            } else if (image.url && image.url.includes('amazonaws.com')) {
              const urlParts = image.url.split('/');
              const key = urlParts.slice(3).join('/');
              await deleteImage(key);
            }
          } catch (error) {
            console.warn('Could not delete old image:', error);
          }
        }
      }
      
      routeData.images = [];
    } else {
      // Keep existing images
      routeData.images = route.images || [];
    }
    
    // Add new images
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      
      try {
        const uploadResult = await uploadImage(file, 'transport');
        
        routeData.images.push({
          url: uploadResult.url,
          key: uploadResult.key || null,
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
      
      if (primaryIndex >= 0 && primaryIndex < routeData.images.length) {
        routeData.images = routeData.images.map((image, index) => ({
          ...image,
          isPrimary: index === primaryIndex
        }));
      }
    }
  }
  
  // Update provider information if it has changed
  if (routeData.providerId && routeData.providerId !== route.providerId.toString()) {
    const newProvider = await ServiceProvider.findById(routeData.providerId);
    
    if (!newProvider) {
      return next(new ErrorResponse(`New provider not found with id ${routeData.providerId}`, 404));
    }
    
    if (newProvider.providerType !== PROVIDER_TYPES.PUBLIC_TRANSPORT) {
      return next(new ErrorResponse('New provider must be a public transport provider', 400));
    }
    
    // Check if user is authorized for new provider
    if (req.user.role !== 'admin' && newProvider.user.toString() !== req.user.id) {
      return next(new ErrorResponse('Not authorized to transfer this route to the new provider', 403));
    }
    
    // Update provider info
    routeData.provider = {
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
    await ServiceProvider.findByIdAndUpdate(route.providerId, {
      $inc: { 'metrics.totalListings': -1 }
    });
    
    await ServiceProvider.findByIdAndUpdate(routeData.providerId, {
      $inc: { 'metrics.totalListings': 1 }
    });
  }
  
  // Update transport route
  route = await TransportRoute.findByIdAndUpdate(
    req.params.id,
    routeData,
    {
      new: true,
      runValidators: true
    }
  );
  
  res.status(200).json({
    success: true,
    data: route
  });
});

/**
 * @desc    Delete transport route
 * @route   DELETE /api/transport/:id
 * @access  Private (Admin or Provider Owner)
 */
export const deleteTransportRoute = asyncHandler(async (req, res, next) => {
  const route = await TransportRoute.findById(req.params.id);
  
  if (!route) {
    return next(new ErrorResponse(`Transport route not found with id ${req.params.id}`, 404));
  }
  
  // Check if user is authorized (admin or provider owner)
  const provider = await ServiceProvider.findById(route.providerId);
  
  if (provider && req.user.role !== 'admin' && provider.user.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to delete this route', 403));
  }
  
  // UPDATED: Delete images with better error handling
  if (route.images && route.images.length > 0) {
    for (const image of route.images) {
      try {
        if (image.key) {
          await deleteImage(image.key);
        } else if (image.url && image.url.includes('amazonaws.com')) {
          // Extract key from URL
          const urlParts = image.url.split('/');
          const key = urlParts.slice(3).join('/');
          await deleteImage(key);
        } else if (typeof image === 'string' && image.includes('amazonaws.com')) {
          // Handle string URLs
          const urlParts = image.split('/');
          const key = urlParts.slice(3).join('/');
          await deleteImage(key);
        }
      } catch (error) {
        console.warn('Could not delete route image:', error);
      }
    }
  }
  
  // Delete route using deleteOne instead of remove
  await route.deleteOne();
  
  // Update provider metrics
  if (provider) {
    await ServiceProvider.findByIdAndUpdate(route.providerId, {
      $inc: { 'metrics.totalListings': -1 }
    });
  }
  
  res.status(200).json({
    success: true,
    data: {}
  });
});

/**
 * @desc    Get featured transport routes
 * @route   GET /api/transport/featured
 * @access  Public
 */
export const getFeaturedRoutes = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit, 10) || 6;
  
  const routes = await TransportRoute.find({
    featured: true,
    operationalStatus: 'active'
  })
    .limit(limit)
    .sort('-createdAt');
  
  res.status(200).json({
    success: true,
    count: routes.length,
    data: routes
  });
});

/**
 * @desc    Get transport routes for specific provider
 * @route   GET /api/transport/provider/:providerId
 * @access  Public
 */
export const getProviderRoutes = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;
  
  const provider = await ServiceProvider.findById(req.params.providerId);
  
  if (!provider) {
    return next(new ErrorResponse(`Provider not found with id ${req.params.providerId}`, 404));
  }
  
  if (provider.providerType !== PROVIDER_TYPES.PUBLIC_TRANSPORT) {
    return next(new ErrorResponse('Provider is not a public transport service', 400));
  }
  
  const query = { providerId: req.params.providerId };
  
  // Apply status filter if provided - map to operationalStatus
  if (req.query.status && req.query.status !== 'all') {
    query.operationalStatus = req.query.status;
  } else {
    // Default to active routes only
    query.operationalStatus = 'active';
  }
  
  // Count total
  const total = await TransportRoute.countDocuments(query);
  
  // Execute query
  const routes = await TransportRoute.find(query)
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
    count: routes.length,
    data: routes
  });
});

/**
 * @desc    Get routes by origin and destination - ENHANCED
 * @route   GET /api/transport/search
 * @access  Public
 */
export const searchRoutes = asyncHandler(async (req, res, next) => {
  const { origin, destination, date } = req.query;
  
  if (!origin || !destination) {
    return next(new ErrorResponse('Please provide origin and destination', 400));
  }
  
  const query = {
    origin: { $regex: origin, $options: 'i' },
    destination: { $regex: destination, $options: 'i' },
    operationalStatus: 'active'
  };
  
  // If date provided, check if route operates on that day
  if (date) {
    const dateObj = new Date(date);
    const day = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dateObj.getDay()];
    query[`schedule.operatingDays.${day}`] = true;
    
    // If it's a seasonal route, check if date is within season
    query.$or = [
      { 'schedule.seasonalAvailability.isYearRound': true },
      {
        $and: [
          { 'schedule.seasonalAvailability.startDate': { $lte: dateObj } },
          { 'schedule.seasonalAvailability.endDate': { $gte: dateObj } }
        ]
      }
    ];
  }
  
  const routes = await TransportRoute.find(query).sort('fare');
  
  res.status(200).json({
    success: true,
    count: routes.length,
    data: routes
  });
});

/**
 * @desc    Add review for transport route
 * @route   POST /api/transport/:id/reviews
 * @access  Private
 */
export const addReview = asyncHandler(async (req, res, next) => {
  const { rating, comment, categories } = req.body;
  
  if (!rating || rating < 1 || rating > 5) {
    return next(new ErrorResponse('Please provide a valid rating between 1 and 5', 400));
  }
  
  const route = await TransportRoute.findById(req.params.id);
  
  if (!route) {
    return next(new ErrorResponse(`Transport route not found with id ${req.params.id}`, 404));
  }
  
  // Check if user has already reviewed this route
  const alreadyReviewed = route.reviews.find(
    review => review.user.toString() === req.user.id
  );
  
  if (alreadyReviewed) {
    return next(new ErrorResponse('You have already reviewed this route', 400));
  }
  
  // Create review object
  const review = {
    user: req.user.id,
    userName: req.user.name,
    rating: Number(rating),
    comment,
    categories: categories || {}
  };
  
  // Add review to route
  await route.addReview(review);
  
  res.status(201).json({
    success: true,
    message: 'Review added successfully'
  });
});

/**
 * @desc    Update transport route status
 * @route   PATCH /api/transport/:id/status
 * @access  Private (Admin or Provider Owner)
 */
export const updateStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;
  
  if (!status) {
    return next(new ErrorResponse('Please provide a status', 400));
  }
  
  const route = await TransportRoute.findById(req.params.id);
  
  if (!route) {
    return next(new ErrorResponse(`Transport route not found with id ${req.params.id}`, 404));
  }
  
  // Check if user is authorized (admin or provider owner)
  const provider = await ServiceProvider.findById(route.providerId);
  
  if (req.user.role !== 'admin' && provider.user.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to update this route', 403));
  }
  
  // Update status (map to operationalStatus)
  const updatedRoute = await TransportRoute.findByIdAndUpdate(
    req.params.id,
    { operationalStatus: status },
    {
      new: true,
      runValidators: true
    }
  );
  
  res.status(200).json({
    success: true,
    data: updatedRoute
  });
});

/**
 * NEW: Get destination cities for dropdown/autocomplete
 * @desc    Get popular destination cities
 * @route   GET /api/transport/destinations
 * @access  Public
 */
export const getDestinationCities = asyncHandler(async (req, res, next) => {
  try {
    // Get unique destinations and origins, count frequency
    const destinations = await TransportRoute.aggregate([
      { $match: { operationalStatus: 'active' } },
      {
        $group: {
          _id: null,
          destinations: { $addToSet: '$destination' },
          origins: { $addToSet: '$origin' }
        }
      }
    ]);

    if (!destinations || destinations.length === 0) {
      return res.status(200).json({
        success: true,
        data: []
      });
    }

    // Combine and deduplicate
    const allCities = [...new Set([
      ...destinations[0].destinations,
      ...destinations[0].origins
    ])].filter(Boolean).sort();

    res.status(200).json({
      success: true,
      count: allCities.length,
      data: allCities
    });
  } catch (error) {
    console.error('Error getting destination cities:', error);
    return next(new ErrorResponse('Error fetching destination cities', 500));
  }
});