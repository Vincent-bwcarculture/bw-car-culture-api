// server/controllers/rentalVehicleController.js - Enhanced for transport destination searches
import asyncHandler from '../middleware/async.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import RentalVehicle from '../models/RentalVehicle.js';
import ServiceProvider, { PROVIDER_TYPES } from '../models/ServiceProvider.js';
import { uploadImage, deleteImage } from '../utils/imageUpload.js';
import mongoose from 'mongoose';

/**
 * @desc    Get all rental vehicles with filtering, sorting and pagination - ENHANCED
 * @route   GET /api/rentals
 * @access  Public
 */
export const getRentalVehicles = asyncHandler(async (req, res, next) => {
  // Extract query parameters
  const {
    search,
    category,
    make,
    model,
    minYear,
    maxYear,
    transmission,
    fuelType,
    minSeats,
    maxSeats,
    minPrice,
    maxPrice,
    status,
    availability,
    city,
    country,
    location, // NEW: General location search parameter
    providerId, // NEW: Filter by specific provider
    page = 1,
    limit = 10,
    sort = '-createdAt'
  } = req.query;

  // Build query
  const query = {};

  // ENHANCED: Location-based filtering for transport destination searches
  if (location) {
    console.log(`Filtering rental vehicles by location: ${location}`);
    
    // Create location filter - search in multiple location fields
    const locationRegex = new RegExp(location, 'i');
    query.$or = [
      { 'location.city': locationRegex },
      { 'location.state': locationRegex },
      { 'location.country': locationRegex },
      { 'location.address': locationRegex },
      // Also search in provider location if available
      { 'provider.location.city': locationRegex },
      { 'provider.location.state': locationRegex },
      { 'provider.location.country': locationRegex },
      // Search in service area if defined
      { 'serviceArea': locationRegex },
      // Search in pickup locations if defined
      { 'pickupLocations.city': locationRegex },
      { 'pickupLocations.address': locationRegex }
    ];
  }

  // Provider-specific filtering
  if (providerId) {
    console.log(`Filtering rental vehicles by provider: ${providerId}`);
    if (mongoose.Types.ObjectId.isValid(providerId)) {
      query.providerId = providerId;
    } else {
      query.providerId = { $in: [providerId, providerId.toString()] };
    }
  }

  // Basic search
  if (search) {
    // If we already have $or from location, combine with AND
    const searchConditions = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { 'specifications.make': { $regex: search, $options: 'i' } },
      { 'specifications.model': { $regex: search, $options: 'i' } },
      { 'provider.businessName': { $regex: search, $options: 'i' } }
    ];
    
    if (query.$or) {
      // Combine location and search filters with AND logic
      query.$and = [
        { $or: query.$or },
        { $or: searchConditions }
      ];
      delete query.$or;
    } else {
      query.$or = searchConditions;
    }
  }

  // Category filter
  if (category) {
    query.category = category;
  }

  // Make filter
  if (make) {
    query['specifications.make'] = { $regex: make, $options: 'i' };
  }

  // Model filter
  if (model) {
    query['specifications.model'] = { $regex: model, $options: 'i' };
  }

  // Year range
  if (minYear || maxYear) {
    query['specifications.year'] = {};
    if (minYear) query['specifications.year'].$gte = parseInt(minYear);
    if (maxYear) query['specifications.year'].$lte = parseInt(maxYear);
  }

  // Transmission
  if (transmission) {
    query['specifications.transmission'] = transmission;
  }

  // Fuel type
  if (fuelType) {
    query['specifications.fuelType'] = fuelType;
  }

  // Seats range
  if (minSeats || maxSeats) {
    query['specifications.seats'] = {};
    if (minSeats) query['specifications.seats'].$gte = parseInt(minSeats);
    if (maxSeats) query['specifications.seats'].$lte = parseInt(maxSeats);
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

  // City-specific filtering (individual parameter)
  if (city && !location) {
    console.log(`Filtering rental vehicles by city: ${city}`);
    const cityRegex = new RegExp(city, 'i');
    
    if (query.$or) {
      // If we already have $or conditions, add city filters
      query.$or.push(
        { 'location.city': cityRegex },
        { 'provider.location.city': cityRegex },
        { 'pickupLocations.city': cityRegex }
      );
    } else {
      query.$or = [
        { 'location.city': cityRegex },
        { 'provider.location.city': cityRegex },
        { 'pickupLocations.city': cityRegex }
      ];
    }
  }

  // Country filtering
  if (country) {
    query['location.country'] = { $regex: country, $options: 'i' };
  }

  // Calculate pagination
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  
  // Only show available rentals by default, unless specified otherwise
  if (!query.status) {
    query.status = 'available';
  }
  
  // Log the final query for debugging
  if (process.env.NODE_ENV === 'development') {
    console.log('Final rental vehicle query:', JSON.stringify(query, null, 2));
  }
  
  // Count total documents matching the query
  const total = await RentalVehicle.countDocuments(query);

  // Execute query with pagination and sorting
  const vehicles = await RentalVehicle.find(query)
    .sort(sort)
    .skip(startIndex)
    .limit(parseInt(limit));

  // Log results for debugging
  if (process.env.NODE_ENV === 'development') {
    console.log(`Found ${vehicles.length} rental vehicles matching filters`);
    if (req.query.location && vehicles.length > 0) {
      console.log('Sample rental vehicle locations:', 
        vehicles.slice(0, 3).map(v => ({
          name: v.name,
          city: v.location?.city,
          providerCity: v.provider?.location?.city
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
    count: vehicles.length,
    total,
    data: vehicles,
    // Alternative format for backward compatibility
    vehicles: vehicles
  });
});

/**
 * @desc    Get single rental vehicle
 * @route   GET /api/rentals/:id
 * @access  Public
 */
export const getRentalVehicle = asyncHandler(async (req, res, next) => {
  const vehicle = await RentalVehicle.findById(req.params.id);

  if (!vehicle) {
    return next(new ErrorResponse(`Rental vehicle not found with id ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: vehicle
  });
});

/**
 * @desc    Create new rental vehicle
 * @route   POST /api/rentals
 * @access  Private (Admin or Provider)
 */
export const createRentalVehicle = asyncHandler(async (req, res, next) => {
  // Parse vehicle data from form
  let vehicleData;
  
  try {
    vehicleData = req.body.vehicleData 
      ? (typeof req.body.vehicleData === 'string' 
          ? JSON.parse(req.body.vehicleData) 
          : req.body.vehicleData)
      : req.body;
  } catch (parseError) {
    console.error('Error parsing vehicle data:', parseError);
    return next(new ErrorResponse('Invalid vehicle data format', 400));
  }
  
  // Check required fields
  if (!vehicleData.name || !vehicleData.providerId || !vehicleData.category) {
    return next(new ErrorResponse('Please provide name, provider ID, and category', 400));
  }
  
  // Check if providerId is valid
  if (!mongoose.Types.ObjectId.isValid(vehicleData.providerId)) {
    return next(new ErrorResponse('Invalid provider ID', 400));
  }
  
  // Verify the provider exists and is of type CAR_RENTAL
  const provider = await ServiceProvider.findById(vehicleData.providerId);
  
  if (!provider) {
    return next(new ErrorResponse(`Provider not found with id ${vehicleData.providerId}`, 404));
  }
  
  if (provider.providerType !== PROVIDER_TYPES.CAR_RENTAL) {
    return next(new ErrorResponse('Provider must be a car rental provider', 400));
  }
  
  // Check if user is authorized (admin or provider owner)
  if (req.user.role !== 'admin' && provider.user.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to add vehicles for this provider', 403));
  }
  
  // Check if provider subscription allows more listings
  const subscriptionCheck = await provider.canAddListing();
  if (!subscriptionCheck.allowed) {
    return next(new ErrorResponse(subscriptionCheck.reason, 403));
  }
  
  // Add provider information to the vehicle
  vehicleData.provider = {
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

  // ENHANCED: Set location data from provider if not specified
  if (!vehicleData.location && provider.location) {
    vehicleData.location = {
      city: provider.location.city,
      state: provider.location.state,
      country: provider.location.country,
      address: provider.location.address
    };
  }
  
  // Process vehicle images - Handle S3 images from middleware
  if (req.s3Images && req.s3Images.length > 0) {
    vehicleData.images = req.s3Images.map((s3Image, index) => ({
      url: s3Image.url,
      thumbnail: s3Image.thumbnail || null,
      key: s3Image.key,
      size: s3Image.size,
      mimetype: s3Image.mimetype,
      isPrimary: index === parseInt(req.body.primaryImage || 0)
    }));
    console.log('Added S3 images to vehicle data:', vehicleData.images.length);
  } else if (req.files && req.files.length > 0) {
    vehicleData.images = [];
    
    // Loop through each file and upload
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      
      try {
        const uploadResult = await uploadImage(file, 'rentals');
        
        vehicleData.images.push({
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
  
  // Create rental vehicle
  const vehicle = await RentalVehicle.create(vehicleData);
  
  // Update provider metrics
  await ServiceProvider.findByIdAndUpdate(vehicleData.providerId, {
    $inc: { 'metrics.totalListings': 1 }
  });
  
  res.status(201).json({
    success: true,
    data: vehicle
  });
});

/**
 * @desc    Update rental vehicle
 * @route   PUT /api/rentals/:id
 * @access  Private (Admin or Provider Owner)
 */
export const updateRentalVehicle = asyncHandler(async (req, res, next) => {
  let vehicle = await RentalVehicle.findById(req.params.id);
  
  if (!vehicle) {
    return next(new ErrorResponse(`Rental vehicle not found with id ${req.params.id}`, 404));
  }
  
  // Check if user is authorized (admin or provider owner)
  const provider = await ServiceProvider.findById(vehicle.providerId);
  
  if (!provider) {
    return next(new ErrorResponse('Provider not found', 404));
  }
  
  if (req.user.role !== 'admin' && provider.user.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to update this vehicle', 403));
  }
  
  // Parse vehicle data from form
  let vehicleData;
  
  try {
    vehicleData = req.body.vehicleData 
      ? (typeof req.body.vehicleData === 'string' 
          ? JSON.parse(req.body.vehicleData) 
          : req.body.vehicleData)
      : req.body;
  } catch (parseError) {
    return next(new ErrorResponse('Invalid vehicle data format', 400));
  }
  
  // ENHANCED: Process vehicle images if present - handle S3 images from middleware
  if (req.s3Images && req.s3Images.length > 0) {
    // If keepImages is not true, delete existing images
    if (vehicleData.keepImages !== true) {
      // Delete old images
      if (vehicle.images && vehicle.images.length > 0) {
        for (const image of vehicle.images) {
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
            console.warn('Could not delete old vehicle image:', error);
          }
        }
      }
      
      vehicleData.images = [];
    } else {
      // Keep existing images
      vehicleData.images = vehicle.images || [];
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
    
    vehicleData.images = [...vehicleData.images, ...newImages];
    
    // Update primary image if specified
    if (req.body.primaryImage) {
      const primaryIndex = parseInt(req.body.primaryImage);
      
      if (primaryIndex >= 0 && primaryIndex < vehicleData.images.length) {
        vehicleData.images = vehicleData.images.map((image, index) => ({
          ...image,
          isPrimary: index === primaryIndex
        }));
      }
    }
  } else if (req.files && req.files.length > 0) {
    // Fallback to local upload if S3 not available
    // If keepImages is not true, delete existing images
    if (vehicleData.keepImages !== true) {
      // Delete old images
      if (vehicle.images && vehicle.images.length > 0) {
        for (const image of vehicle.images) {
          await deleteImage(image.key || image.url);
        }
      }
      
      vehicleData.images = [];
    } else {
      // Keep existing images
      vehicleData.images = vehicle.images || [];
    }
    
    // Add new images
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      
      try {
        const uploadResult = await uploadImage(file, 'rentals');
        
        vehicleData.images.push({
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
      
      if (primaryIndex >= 0 && primaryIndex < vehicleData.images.length) {
        vehicleData.images = vehicleData.images.map((image, index) => ({
          ...image,
          isPrimary: index === primaryIndex
        }));
      }
    }
  }
  
  // Update provider information if it has changed
  if (vehicleData.providerId && vehicleData.providerId !== vehicle.providerId.toString()) {
    const newProvider = await ServiceProvider.findById(vehicleData.providerId);
    
    if (!newProvider) {
      return next(new ErrorResponse(`New provider not found with id ${vehicleData.providerId}`, 404));
    }
    
    if (newProvider.providerType !== PROVIDER_TYPES.CAR_RENTAL) {
      return next(new ErrorResponse('New provider must be a car rental provider', 400));
    }
    
    // Check if user is authorized for new provider
    if (req.user.role !== 'admin' && newProvider.user.toString() !== req.user.id) {
      return next(new ErrorResponse('Not authorized to transfer this vehicle to the new provider', 403));
    }
    
    // Update provider info
    vehicleData.provider = {
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
    await ServiceProvider.findByIdAndUpdate(vehicle.providerId, {
      $inc: { 'metrics.totalListings': -1 }
    });
    
    await ServiceProvider.findByIdAndUpdate(vehicleData.providerId, {
      $inc: { 'metrics.totalListings': 1 }
    });
  }
  
  // Update rental vehicle
  vehicle = await RentalVehicle.findByIdAndUpdate(
    req.params.id,
    vehicleData,
    {
      new: true,
      runValidators: true
    }
  );
  
  res.status(200).json({
    success: true,
    data: vehicle
  });
});

/**
 * @desc    Delete rental vehicle
 * @route   DELETE /api/rentals/:id
 * @access  Private (Admin or Provider Owner)
 */
export const deleteRentalVehicle = asyncHandler(async (req, res, next) => {
  const vehicle = await RentalVehicle.findById(req.params.id);
  
  if (!vehicle) {
    return next(new ErrorResponse(`Rental vehicle not found with id ${req.params.id}`, 404));
  }
  
  // Check if user is authorized (admin or provider owner)
  const provider = await ServiceProvider.findById(vehicle.providerId);
  
  if (provider && req.user.role !== 'admin' && provider.user.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to delete this vehicle', 403));
  }
  
  // ENHANCED: Delete images with better error handling
  if (vehicle.images && vehicle.images.length > 0) {
    for (const image of vehicle.images) {
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
        console.warn('Could not delete vehicle image:', error);
      }
    }
  }
  
  // Delete vehicle using deleteOne instead of remove
  await vehicle.deleteOne();
  
  // Update provider metrics
  if (provider) {
    await ServiceProvider.findByIdAndUpdate(vehicle.providerId, {
      $inc: { 'metrics.totalListings': -1 }
    });
  }
  
  res.status(200).json({
    success: true,
    data: {}
  });
});

/**
 * @desc    Get featured rental vehicles
 * @route   GET /api/rentals/featured
 * @access  Public
 */
export const getFeaturedRentals = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit, 10) || 6;
  
  const vehicles = await RentalVehicle.find({
    featured: true,
    status: 'available'
  })
    .limit(limit)
    .sort('-createdAt');
  
  res.status(200).json({
    success: true,
    count: vehicles.length,
    data: vehicles,
    // Alternative format for backward compatibility
    vehicles: vehicles
  });
});

/**
 * @desc    Get rental vehicles for specific provider
 * @route   GET /api/rentals/provider/:providerId
 * @access  Public
 */
export const getProviderRentals = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;
  
  const provider = await ServiceProvider.findById(req.params.providerId);
  
  if (!provider) {
    return next(new ErrorResponse(`Provider not found with id ${req.params.providerId}`, 404));
  }
  
  if (provider.providerType !== PROVIDER_TYPES.CAR_RENTAL) {
    return next(new ErrorResponse('Provider is not a car rental service', 400));
  }
  
  const query = { providerId: req.params.providerId };
  
  // Apply status filter if provided
  if (req.query.status && req.query.status !== 'all') {
    query.status = req.query.status;
  } else {
    // Default to available vehicles only
    query.status = 'available';
  }
  
  // Count total
  const total = await RentalVehicle.countDocuments(query);
  
  // Execute query
  const vehicles = await RentalVehicle.find(query)
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
    count: vehicles.length,
    data: vehicles,
    // Alternative format for backward compatibility
    vehicles: vehicles
  });
});

/**
 * @desc    Get similar rental vehicles
 * @route   GET /api/rentals/:id/similar
 * @access  Public
 */
export const getSimilarRentals = asyncHandler(async (req, res, next) => {
  const vehicle = await RentalVehicle.findById(req.params.id);
  
  if (!vehicle) {
    return next(new ErrorResponse(`Rental vehicle not found with id ${req.params.id}`, 404));
  }
  
  const limit = parseInt(req.query.limit, 10) || 4;
  
  // Find similar vehicles (same category, similar price range)
  const similarVehicles = await RentalVehicle.find({
    _id: { $ne: vehicle._id },
    category: vehicle.category,
    status: 'available',
    'rates.daily': {
      $gte: vehicle.rates.daily * 0.7,
      $lte: vehicle.rates.daily * 1.3
    }
  })
    .limit(limit)
    .sort('-createdAt');
  
  res.status(200).json({
    success: true,
    count: similarVehicles.length,
    data: similarVehicles
  });
});

/**
 * @desc    Check rental vehicle availability
 * @route   POST /api/rentals/:id/availability
 * @access  Public
 */
export const checkAvailability = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.body;
  
  if (!startDate || !endDate) {
    return next(new ErrorResponse('Please provide start and end dates', 400));
  }
  
  const vehicle = await RentalVehicle.findById(req.params.id);
  
  if (!vehicle) {
    return next(new ErrorResponse(`Rental vehicle not found with id ${req.params.id}`, 404));
  }
  
  // Check availability using model method
  const availabilityCheck = vehicle.checkAvailability(startDate, endDate);
  
  res.status(200).json({
    success: true,
    data: availabilityCheck
  });
});

/**
 * @desc    Calculate rental cost
 * @route   POST /api/rentals/:id/calculate
 * @access  Public
 */
export const calculateRentalCost = asyncHandler(async (req, res, next) => {
  const { startDate, endDate, options } = req.body;
  
  if (!startDate || !endDate) {
    return next(new ErrorResponse('Please provide start and end dates', 400));
  }
  
  const vehicle = await RentalVehicle.findById(req.params.id);
  
  if (!vehicle) {
    return next(new ErrorResponse(`Rental vehicle not found with id ${req.params.id}`, 404));
  }
  
  try {
    // Calculate cost using model method
    const costCalculation = vehicle.calculateRentalCost(startDate, endDate, options || {});
    
    res.status(200).json({
      success: true,
      data: costCalculation
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 400));
  }
});

/**
 * @desc    Add review for rental vehicle
 * @route   POST /api/rentals/:id/reviews
 * @access  Private
 */
export const addReview = asyncHandler(async (req, res, next) => {
  const { rating, comment } = req.body;
  
  if (!rating || rating < 1 || rating > 5) {
    return next(new ErrorResponse('Please provide a valid rating between 1 and 5', 400));
  }
  
  const vehicle = await RentalVehicle.findById(req.params.id);
  
  if (!vehicle) {
    return next(new ErrorResponse(`Rental vehicle not found with id ${req.params.id}`, 404));
  }
  
  // Check if user has already reviewed this vehicle
  const alreadyReviewed = vehicle.reviews.find(
    review => review.user.toString() === req.user.id
  );
  
  if (alreadyReviewed) {
    return next(new ErrorResponse('You have already reviewed this vehicle', 400));
  }
  
  // Create review object
  const review = {
    user: req.user.id,
    userName: req.user.name,
    rating: Number(rating),
    comment
  };
  
  // Add review to vehicle
  await vehicle.addReview(review);
  
  res.status(201).json({
    success: true,
    message: 'Review added successfully'
  });
});

/**
 * @desc    Update rental vehicle status
 * @route   PATCH /api/rentals/:id/status
 * @access  Private (Admin or Provider Owner)
 */
export const updateStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;
  
  if (!status) {
    return next(new ErrorResponse('Please provide a status', 400));
  }
  
  const vehicle = await RentalVehicle.findById(req.params.id);
  
  if (!vehicle) {
    return next(new ErrorResponse(`Rental vehicle not found with id ${req.params.id}`, 404));
  }
  
  // Check if user is authorized (admin or provider owner)
  const provider = await ServiceProvider.findById(vehicle.providerId);
  
  if (req.user.role !== 'admin' && provider.user.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to update this vehicle', 403));
  }
  
  // Update status
  const updatedVehicle = await RentalVehicle.findByIdAndUpdate(
    req.params.id,
    { status },
    {
      new: true,
      runValidators: true
    }
  );
  
  res.status(200).json({
    success: true,
    data: updatedVehicle
  });
});