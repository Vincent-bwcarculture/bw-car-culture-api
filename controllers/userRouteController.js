// server/controllers/userRouteController.js
import UserRoute from '../models/UserRoute.js';
import User from '../models/User.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import asyncHandler from '../middleware/async.js';
import { uploadImage, deleteImage } from '../utils/imageUpload.js';

// @desc    Get user's routes
// @route   GET /api/user/profile/routes
// @access  Private
export const getUserRoutes = asyncHandler(async (req, res, next) => {
  const routes = await UserRoute.findByOwner(req.user.id, {
    includeInactive: req.query.includeInactive === 'true',
    sort: req.query.sort || '-createdAt'
  });

  res.status(200).json({
    success: true,
    count: routes.length,
    data: routes
  });
});

// @desc    Get single route
// @route   GET /api/user/profile/routes/:id
// @access  Private
export const getUserRoute = asyncHandler(async (req, res, next) => {
  const route = await UserRoute.findOne({
    _id: req.params.id,
    ownerId: req.user.id
  }).populate('vehicleInfo.vehicleIds', 'make model year licensePlate');

  if (!route) {
    return next(new ErrorResponse('Route not found', 404));
  }

  res.status(200).json({
    success: true,
    data: route
  });
});

// @desc    Create new route
// @route   POST /api/user/profile/routes
// @access  Private
export const createUserRoute = asyncHandler(async (req, res, next) => {
  const {
    routeName, routeNumber, serviceType, operatorName, operatorType,
    origin, destination, stops, operationType, schedule, pricing,
    vehicleInfo, distance, estimatedDuration, routeType, contact,
    accessibility, description, specialNotes, bookingSettings
  } = req.body;

  // Validate required fields
  if (!routeName || !serviceType || !operatorName || !origin?.name || !destination?.name) {
    return next(new ErrorResponse('Route name, service type, operator name, origin, and destination are required', 400));
  }

  if (!contact?.phone) {
    return next(new ErrorResponse('Contact phone number is required', 400));
  }

  if (!pricing?.baseFare || pricing.baseFare < 0) {
    return next(new ErrorResponse('Valid base fare is required', 400));
  }

  if (!vehicleInfo?.capacity || vehicleInfo.capacity < 1) {
    return next(new ErrorResponse('Vehicle capacity must be at least 1', 400));
  }

  // Check if user has transport service registered
  const user = await User.findById(req.user.id);
  const hasTransportService = user.businessProfile?.services?.some(
    service => service.serviceType === 'public_transport' && service.isVerified
  );

  const routeData = {
    ownerId: req.user.id,
    routeName: routeName.trim(),
    routeNumber: routeNumber?.trim(),
    serviceType,
    operatorName: operatorName.trim(),
    operatorType: operatorType || 'individual',
    
    origin: {
      name: origin.name.trim(),
      address: origin.address?.trim(),
      coordinates: origin.coordinates,
      landmark: origin.landmark?.trim()
    },
    destination: {
      name: destination.name.trim(),
      address: destination.address?.trim(),
      coordinates: destination.coordinates,
      landmark: destination.landmark?.trim()
    },
    
    stops: stops?.map((stop, index) => ({
      name: stop.name.trim(),
      address: stop.address?.trim(),
      coordinates: stop.coordinates,
      stopOrder: stop.stopOrder || index + 1,
      estimatedTime: stop.estimatedTime?.trim(),
      fare: stop.fare ? parseFloat(stop.fare) : undefined
    })) || [],
    
    operationType: operationType || 'on_demand',
    schedule: {
      operatingDays: schedule?.operatingDays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
      startTime: schedule?.startTime || '05:00',
      endTime: schedule?.endTime || '22:00',
      frequency: schedule?.frequency || 'On demand',
      departureTimes: schedule?.departureTimes || [],
      peakHours: schedule?.peakHours || [],
      notes: schedule?.notes?.trim()
    },
    
    pricing: {
      baseFare: parseFloat(pricing.baseFare),
      currency: pricing.currency || 'BWP',
      fareType: pricing.fareType || 'flat_rate',
      discounts: pricing.discounts || {},
      paymentMethods: pricing.paymentMethods || ['cash'],
      surcharges: pricing.surcharges || []
    },
    
    vehicleInfo: {
      vehicleType: vehicleInfo.vehicleType || 'sedan',
      capacity: parseInt(vehicleInfo.capacity),
      vehicleIds: vehicleInfo.vehicleIds || [],
      amenities: vehicleInfo.amenities || [],
      licensePlates: vehicleInfo.licensePlates || [],
      fleetSize: vehicleInfo.fleetSize || 1
    },
    
    distance: distance ? parseFloat(distance) : undefined,
    estimatedDuration: estimatedDuration?.trim(),
    routeType: routeType || 'urban',
    
    contact: {
      phone: contact.phone.trim(),
      whatsapp: contact.whatsapp?.trim(),
      email: contact.email?.trim(),
      emergencyContact: contact.emergencyContact?.trim(),
      preferredContactMethod: contact.preferredContactMethod || 'phone'
    },
    
    accessibility: {
      wheelchairAccessible: accessibility?.wheelchairAccessible || false,
      allowPets: accessibility?.allowPets || false,
      smokingAllowed: accessibility?.smokingAllowed || false,
      luggageAllowed: accessibility?.luggageAllowed !== false,
      childFriendly: accessibility?.childFriendly !== false
    },
    
    description: description?.trim(),
    specialNotes: specialNotes?.trim(),
    
    bookingSettings: {
      advanceBooking: bookingSettings?.advanceBooking !== false,
      maxAdvanceHours: bookingSettings?.maxAdvanceHours || 24,
      cancellationPolicy: bookingSettings?.cancellationPolicy?.trim(),
      requiresConfirmation: bookingSettings?.requiresConfirmation !== false
    },
    
    // Set verification status based on user's transport service verification
    verification: {
      isVerified: hasTransportService,
      verifiedAt: hasTransportService ? new Date() : undefined
    }
  };

  const route = await UserRoute.create(routeData);

  res.status(201).json({
    success: true,
    data: route
  });
});

// @desc    Update route
// @route   PUT /api/user/profile/routes/:id
// @access  Private
export const updateUserRoute = asyncHandler(async (req, res, next) => {
  let route = await UserRoute.findOne({
    _id: req.params.id,
    ownerId: req.user.id
  });

  if (!route) {
    return next(new ErrorResponse('Route not found', 404));
  }

  // Validate updated data
  if (req.body.pricing?.baseFare !== undefined && req.body.pricing.baseFare < 0) {
    return next(new ErrorResponse('Base fare cannot be negative', 400));
  }

  if (req.body.vehicleInfo?.capacity !== undefined && req.body.vehicleInfo.capacity < 1) {
    return next(new ErrorResponse('Vehicle capacity must be at least 1', 400));
  }

  // Process stops if provided
  if (req.body.stops) {
    req.body.stops = req.body.stops.map((stop, index) => ({
      ...stop,
      name: stop.name?.trim(),
      address: stop.address?.trim(),
      stopOrder: stop.stopOrder || index + 1,
      estimatedTime: stop.estimatedTime?.trim(),
      fare: stop.fare ? parseFloat(stop.fare) : undefined
    }));
  }

  // Process pricing if provided
  if (req.body.pricing) {
    req.body.pricing = {
      ...route.pricing.toObject(),
      ...req.body.pricing,
      baseFare: req.body.pricing.baseFare ? parseFloat(req.body.pricing.baseFare) : route.pricing.baseFare
    };
  }

  route = await UserRoute.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    success: true,
    data: route
  });
});

// @desc    Delete route
// @route   DELETE /api/user/profile/routes/:id
// @access  Private
export const deleteUserRoute = asyncHandler(async (req, res, next) => {
  const route = await UserRoute.findOne({
    _id: req.params.id,
    ownerId: req.user.id
  });

  if (!route) {
    return next(new ErrorResponse('Route not found', 404));
  }

  await route.deleteOne();

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Upload route images
// @route   POST /api/user/profile/routes/:id/images
// @access  Private
export const uploadRouteImages = asyncHandler(async (req, res, next) => {
  const route = await UserRoute.findOne({
    _id: req.params.id,
    ownerId: req.user.id
  });

  if (!route) {
    return next(new ErrorResponse('Route not found', 404));
  }

  if (!req.files || req.files.length === 0) {
    return next(new ErrorResponse('Please select images to upload', 400));
  }

  const uploadedImages = [];

  try {
    for (const file of req.files) {
      const result = await uploadImage(file, 'routes');
      uploadedImages.push({
        url: result.url,
        key: result.key,
        description: req.body.description || '',
        isPrimary: route.images.length === 0 && uploadedImages.length === 0
      });
    }

    route.images.push(...uploadedImages);
    await route.save();

    res.status(200).json({
      success: true,
      data: uploadedImages
    });
  } catch (error) {
    // Clean up any uploaded images on error
    for (const image of uploadedImages) {
      try {
        await deleteImage(image.key);
      } catch (deleteError) {
        console.error('Error deleting image after upload failure:', deleteError);
      }
    }
    return next(new ErrorResponse('Error uploading images', 500));
  }
});

// @desc    Add route review
// @route   POST /api/user/profile/routes/:id/reviews
// @access  Private (from another user)
export const addRouteReview = asyncHandler(async (req, res, next) => {
  const route = await UserRoute.findOne({
    _id: req.params.id,
    isActive: true,
    operationalStatus: 'active'
  });

  if (!route) {
    return next(new ErrorResponse('Route not found', 404));
  }

  // Users cannot review their own routes
  if (route.ownerId.toString() === req.user.id) {
    return next(new ErrorResponse('You cannot review your own route', 400));
  }

  const { rating, comment, travelDate } = req.body;

  if (!rating || rating < 1 || rating > 5) {
    return next(new ErrorResponse('Rating must be between 1 and 5', 400));
  }

  // Check if user has already reviewed this route
  const existingReview = route.reviews.find(
    review => review.userId.toString() === req.user.id
  );

  if (existingReview) {
    return next(new ErrorResponse('You have already reviewed this route', 400));
  }

  await route.addReview(req.user.id, rating, comment?.trim(), travelDate ? new Date(travelDate) : undefined);

  res.status(201).json({
    success: true,
    data: route.reviews[route.reviews.length - 1]
  });
});

// @desc    Update route location (for tracking)
// @route   PUT /api/user/profile/routes/:id/location
// @access  Private
export const updateRouteLocation = asyncHandler(async (req, res, next) => {
  const route = await UserRoute.findOne({
    _id: req.params.id,
    ownerId: req.user.id
  });

  if (!route) {
    return next(new ErrorResponse('Route not found', 404));
  }

  if (!route.trackingEnabled) {
    return next(new ErrorResponse('Location tracking is not enabled for this route', 400));
  }

  const { lat, lng, isOnRoute } = req.body;

  if (!lat || !lng) {
    return next(new ErrorResponse('Latitude and longitude are required', 400));
  }

  await route.updateLocation(parseFloat(lat), parseFloat(lng), isOnRoute === true);

  res.status(200).json({
    success: true,
    data: {
      currentLocation: route.currentLocation
    }
  });
});

// @desc    Set route temporary unavailability
// @route   PUT /api/user/profile/routes/:id/unavailable
// @access  Private
export const setRouteUnavailable = asyncHandler(async (req, res, next) => {
  const route = await UserRoute.findOne({
    _id: req.params.id,
    ownerId: req.user.id
  });

  if (!route) {
    return next(new ErrorResponse('Route not found', 404));
  }

  const { reason, until } = req.body;

  if (!reason) {
    return next(new ErrorResponse('Reason for unavailability is required', 400));
  }

  await route.setTemporaryUnavailable(reason.trim(), until ? new Date(until) : undefined);

  res.status(200).json({
    success: true,
    data: {
      temporarilyUnavailable: route.temporarilyUnavailable
    }
  });
});

// @desc    Clear route unavailability
// @route   DELETE /api/user/profile/routes/:id/unavailable
// @access  Private
export const clearRouteUnavailability = asyncHandler(async (req, res, next) => {
  const route = await UserRoute.findOne({
    _id: req.params.id,
    ownerId: req.user.id
  });

  if (!route) {
    return next(new ErrorResponse('Route not found', 404));
  }

  route.temporarilyUnavailable = {
    status: false,
    reason: undefined,
    until: undefined
  };

  await route.save();

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Get route analytics
// @route   GET /api/user/profile/routes/:id/analytics
// @access  Private
export const getRouteAnalytics = asyncHandler(async (req, res, next) => {
  const route = await UserRoute.findOne({
    _id: req.params.id,
    ownerId: req.user.id
  });

  if (!route) {
    return next(new ErrorResponse('Route not found', 404));
  }

  const analytics = {
    basicMetrics: route.analytics,
    performance: {
      rating: parseFloat(route.averageRating),
      totalReviews: route.reviews.length,
      isCurrentlyOperating: route.isCurrentlyOperating
    },
    recentReviews: route.reviews
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5)
      .map(review => ({
        rating: review.rating,
        comment: review.comment,
        travelDate: review.travelDate,
        createdAt: review.createdAt
      })),
    operationalStatus: {
      isActive: route.isActive,
      operationalStatus: route.operationalStatus,
      temporarilyUnavailable: route.temporarilyUnavailable
    }
  };

  res.status(200).json({
    success: true,
    data: analytics
  });
});

// @desc    Increment route analytics
// @route   POST /api/user/profile/routes/:id/analytics/:metric
// @access  Private (internal use)
export const incrementRouteAnalytics = asyncHandler(async (req, res, next) => {
  const route = await UserRoute.findById(req.params.id);

  if (!route) {
    return next(new ErrorResponse('Route not found', 404));
  }

  const metric = req.params.metric;
  await route.incrementAnalytics(metric);

  res.status(200).json({
    success: true,
    data: route.analytics
  });
});

// @desc    Get user route statistics
// @route   GET /api/user/profile/routes/stats
// @access  Private
export const getUserRouteStats = asyncHandler(async (req, res, next) => {
  const stats = await UserRoute.getAnalyticsSummary(req.user.id);

  res.status(200).json({
    success: true,
    data: stats[0] || {
      totalRoutes: 0,
      activeRoutes: 0,
      totalViews: 0,
      totalBookings: 0,
      avgRating: 0,
      serviceTypeBreakdown: []
    }
  });
});

// @desc    Search routes by origin/destination
// @route   GET /api/routes/search
// @access  Public
export const searchRoutes = asyncHandler(async (req, res, next) => {
  const { origin, destination, serviceType } = req.query;

  if (!origin || !destination) {
    return next(new ErrorResponse('Origin and destination are required', 400));
  }

  const routes = await UserRoute.findByRoute(origin, destination, serviceType);

  res.status(200).json({
    success: true,
    count: routes.length,
    data: routes
  });
});

// @desc    Find nearby routes
// @route   GET /api/routes/nearby
// @access  Public
export const findNearbyRoutes = asyncHandler(async (req, res, next) => {
  const { lat, lng, maxDistance } = req.query;

  if (!lat || !lng) {
    return next(new ErrorResponse('Latitude and longitude are required', 400));
  }

  const routes = await UserRoute.findNearby(
    parseFloat(lat), 
    parseFloat(lng), 
    maxDistance ? parseInt(maxDistance) : 10000
  );

  res.status(200).json({
    success: true,
    count: routes.length,
    data: routes
  });
});

// @desc    Get route by slug (public access)
// @route   GET /api/routes/:slug
// @access  Public
export const getRouteBySlug = asyncHandler(async (req, res, next) => {
  const route = await UserRoute.findOne({
    slug: req.params.slug,
    isActive: true,
    operationalStatus: 'active'
  }).populate('ownerId', 'name profile.phone');

  if (!route) {
    return next(new ErrorResponse('Route not found', 404));
  }

  // Increment view count
  await route.incrementAnalytics('views');

  res.status(200).json({
    success: true,
    data: route
  });
});
