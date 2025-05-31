// server/controllers/serviceProviderController.js
import asyncHandler from '../middleware/async.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import ServiceProvider, { PROVIDER_TYPES } from '../models/ServiceProvider.js';
import { uploadImage, deleteImage } from '../utils/imageUpload.js';
import mongoose from 'mongoose';

// Helper function to extract S3 key from URL
const extractS3KeyFromUrl = (url) => {
  if (!url || !url.includes('amazonaws.com')) {
    return null;
  }
  
  try {
    // For URLs like: https://bucket-name.s3.region.amazonaws.com/path/to/file.jpg
    // We want to extract: path/to/file.jpg
    const urlParts = url.split('/');
    const bucketAndDomain = urlParts.slice(0, 3).join('/'); // https://bucket.s3.region.amazonaws.com
    const key = url.replace(bucketAndDomain + '/', ''); // Everything after the domain
    return key;
  } catch (error) {
    console.error('Error extracting S3 key from URL:', url, error);
    return null;
  }
};

/**
 * @desc    Get all service providers
 * @route   GET /api/providers
 * @access  Public
 */
export const getProviders = asyncHandler(async (req, res, next) => {
  // Extract query parameters
  const {
    providerType,
    businessType,
    status,
    subscriptionStatus,
    search,
    city,
    country,
    page = 1,
    limit = 10,
    sort = '-createdAt',
    user // Add user parameter to filter by user
  } = req.query;

  // Build query
  const query = {};

  // Filter by provider type
  if (providerType && Object.values(PROVIDER_TYPES).includes(providerType)) {
    query.providerType = providerType;
  }

  // Filter by business type
  if (businessType && businessType !== 'all') {
    query.businessType = businessType;
  }

  // Filter by status
  if (status && status !== 'all') {
    query.status = status;
  }

  // Filter by subscription status
  if (subscriptionStatus && subscriptionStatus !== 'all') {
    query['subscription.status'] = subscriptionStatus;
  }

  // Filter by city
  if (city) {
    query['location.city'] = { $regex: city, $options: 'i' };
  }

  // Filter by country
  if (country) {
    query['location.country'] = { $regex: country, $options: 'i' };
  }

  // Filter by user ID if provided
  if (user) {
    query.user = user;
  }

  // Search by business name or description
  if (search) {
    query.$or = [
      { businessName: { $regex: search, $options: 'i' } },
      { 'profile.description': { $regex: search, $options: 'i' } },
      { 'profile.specialties': { $regex: search, $options: 'i' } }
    ];
  }

  // Calculate pagination
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  
  // Count total documents matching the query
  const total = await ServiceProvider.countDocuments(query);

  // Execute query with pagination and sorting
  const providers = await ServiceProvider.find(query)
    .sort(sort)
    .skip(startIndex)
    .limit(parseInt(limit))
    .populate('user', 'name email avatar');

  // Create pagination object
  const pagination = {
    currentPage: parseInt(page),
    totalPages: Math.ceil(total / limit),
    total
  };

  // Check if there are next/previous pages
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
    count: providers.length,
    data: providers
  });
});

/**
 * @desc    Get all providers for dropdowns
 * @route   GET /api/providers/all
 * @access  Public
 */
export const getAllProviders = asyncHandler(async (req, res, next) => {
  const providerType = req.query.type;
  const query = {};
  
  // Filter by provider type if specified
  if (providerType && Object.values(PROVIDER_TYPES).includes(providerType)) {
    query.providerType = providerType;
  }
  
  // Only active providers with active subscriptions
  query.status = 'active';
  query['subscription.status'] = 'active';
  
  // Get minimal provider info for dropdowns
  const providers = await ServiceProvider.find(query)
    .select('_id businessName providerType businessType location.city location.country profile.logo verification.status')
    .sort('businessName');
  
  res.status(200).json({
    success: true,
    count: providers.length,
    providers
  });
});

/**
 * @desc    Get single provider
 * @route   GET /api/providers/:id
 * @access  Public
 */
export const getProvider = asyncHandler(async (req, res, next) => {
  const provider = await ServiceProvider.findById(req.params.id)
    .populate('user', 'name email avatar');

  if (!provider) {
    return next(new ErrorResponse(`Provider not found with id ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: provider
  });
});

/**
 * @desc    Create new provider
 * @route   POST /api/providers
 * @access  Private (Admin)
 */
// In server/controllers/serviceProviderController.js
// Update the createProvider function around line 200

export const createProvider = asyncHandler(async (req, res, next) => {
  console.log('=== CREATE PROVIDER DEBUG ===');
  console.log('Request body:', req.body);
  console.log('Request files:', req.files);
  
  // Handle S3 uploaded images
  let providerData = {};
  
  try {
    // Parse the main provider data
    if (req.body.businessName && req.body.providerType && req.body.businessType) {
      // Direct field approach
      providerData = {
        businessName: req.body.businessName,
        providerType: req.body.providerType,
        businessType: req.body.businessType,
        status: req.body.status || 'active',
        user: req.body.user
      };
      
      // Parse JSON fields
      ['contact', 'location', 'profile', 'social'].forEach(field => {
        if (req.body[field]) {
          try {
            providerData[field] = JSON.parse(req.body[field]);
          } catch (e) {
            console.warn(`Failed to parse ${field}:`, e);
            providerData[field] = {};
          }
        }
      });
      
    } else if (req.body.providerData) {
      // JSON approach
      providerData = JSON.parse(req.body.providerData);
    } else {
      return next(new ErrorResponse('Please provide business name, provider type, and business type', 400));
    }
    
    console.log('Parsed provider data:', providerData);
    
  } catch (error) {
    console.error('Error parsing provider data:', error);
    return next(new ErrorResponse('Invalid data format', 400));
  }

  // Validate required fields
  if (!providerData.businessName || !providerData.providerType || !providerData.businessType) {
    console.error('Missing required fields:', {
      businessName: !!providerData.businessName,
      providerType: !!providerData.providerType,
      businessType: !!providerData.businessType
    });
    return next(new ErrorResponse('Please provide business name, provider type, and business type', 400));
  }
  
  // Check if provider type is valid
  if (!Object.values(PROVIDER_TYPES).includes(providerData.providerType)) {
    return next(new ErrorResponse('Invalid provider type', 400));
  }
  
  // Check if user exists and is valid
  if (providerData.user && !mongoose.Types.ObjectId.isValid(providerData.user)) {
    return next(new ErrorResponse('Invalid user reference', 400));
  }
  
  // Initialize profile if not exists
  if (!providerData.profile) {
    providerData.profile = {};
  }
  
  // FIXED: Handle S3 uploaded images - store just the URL like Dealer model
  if (req.s3Logo) {
    // Store just the URL string, not the entire S3 object
    providerData.profile.logo = req.s3Logo.url;
    console.log('Added S3 logo URL:', req.s3Logo.url);
  }
  
  if (req.s3Banner) {
    // Store just the URL string, not the entire S3 object
    providerData.profile.banner = req.s3Banner.url;
    console.log('Added S3 banner URL:', req.s3Banner.url);
  }
  
  // Log final data before creation
  console.log('Final provider data for creation:', JSON.stringify(providerData, null, 2));
  
  // Create provider
  const provider = await ServiceProvider.create(providerData);
  
  console.log('Provider created successfully:', provider._id);
  
  res.status(201).json({
    success: true,
    data: provider
  });
});

/**
 * @desc    Update provider
 * @route   PUT /api/providers/:id
 * @access  Private (Admin or Provider Owner)
 */
/**
 * @desc    Update provider
 * @route   PUT /api/providers/:id
 * @access  Private (Admin or Provider Owner)
 */
export const updateProvider = asyncHandler(async (req, res, next) => {
  let provider = await ServiceProvider.findById(req.params.id);
  
  if (!provider) {
    return next(new ErrorResponse(`Provider not found with id ${req.params.id}`, 404));
  }
  
  // Authorization check (only admin or provider owner can update)
  if (req.user.role !== 'admin' && provider.user && provider.user.toString() !== req.user.id) {
    return next(new ErrorResponse('Not authorized to update this provider', 403));
  }
  
  // Parse provider data
  let providerData = {};
  
  try {
    if (req.body.businessName && req.body.providerType && req.body.businessType) {
      // Direct field approach
      providerData = {
        businessName: req.body.businessName,
        providerType: req.body.providerType,
        businessType: req.body.businessType,
        status: req.body.status || provider.status
      };
      
      // Parse JSON fields
      ['contact', 'location', 'profile', 'social'].forEach(field => {
        if (req.body[field]) {
          try {
            providerData[field] = { ...provider[field], ...JSON.parse(req.body[field]) };
          } catch (e) {
            console.warn(`Failed to parse ${field}:`, e);
          }
        }
      });
      
    } else if (req.body.providerData) {
      providerData = JSON.parse(req.body.providerData);
    }
  } catch (error) {
    return next(new ErrorResponse('Invalid data format', 400));
  }
  
  // UPDATED: Handle S3 uploaded images
  if (req.s3Logo) {
    if (!providerData.profile) providerData.profile = {};
    
    // Delete old logo if exists (now it's a URL string, not object)
    if (provider.profile && provider.profile.logo) {
      const key = extractS3KeyFromUrl(provider.profile.logo);
      if (key) {
        try {
          await deleteImage(key);
          console.log('Deleted old logo from S3:', key);
        } catch (error) {
          console.warn('Could not delete old logo:', error);
        }
      }
    }
    
    // Store just the URL string
    providerData.profile.logo = req.s3Logo.url;
  }
  
  if (req.s3Banner) {
    if (!providerData.profile) providerData.profile = {};
    
    // Delete old banner if exists (now it's a URL string, not object)
    if (provider.profile && provider.profile.banner) {
      const key = extractS3KeyFromUrl(provider.profile.banner);
      if (key) {
        try {
          await deleteImage(key);
          console.log('Deleted old banner from S3:', key);
        } catch (error) {
          console.warn('Could not delete old banner:', error);
        }
      }
    }
    
    // Store just the URL string
    providerData.profile.banner = req.s3Banner.url;
  }
  
  // Update provider
  provider = await ServiceProvider.findByIdAndUpdate(
    req.params.id,
    providerData,
    {
      new: true,
      runValidators: true
    }
  );
  
  res.status(200).json({
    success: true,
    data: provider
  });
});

/**
 * @desc    Delete provider
 * @route   DELETE /api/providers/:id
 * @access  Private (Admin)
 */
/**
 * @desc    Delete provider
 * @route   DELETE /api/providers/:id
 * @access  Private (Admin)
 */
export const deleteProvider = asyncHandler(async (req, res, next) => {
  const provider = await ServiceProvider.findById(req.params.id);
  
  if (!provider) {
    return next(new ErrorResponse(`Provider not found with id ${req.params.id}`, 404));
  }
  
  // UPDATED: Delete provider logo and banner from S3 (now they're URL strings)
  if (provider.profile && provider.profile.logo) {
    const key = extractS3KeyFromUrl(provider.profile.logo);
    if (key) {
      try {
        await deleteImage(key);
        console.log('Deleted logo from S3:', key);
      } catch (error) {
        console.warn('Could not delete logo:', error);
      }
    }
  }
  
  if (provider.profile && provider.profile.banner) {
    const key = extractS3KeyFromUrl(provider.profile.banner);
    if (key) {
      try {
        await deleteImage(key);
        console.log('Deleted banner from S3:', key);
      } catch (error) {
        console.warn('Could not delete banner:', error);
      }
    }
  }
  
  // Delete all associated listings based on provider type
  const listingModels = {
    [PROVIDER_TYPES.CAR_RENTAL]: 'RentalVehicle',
    [PROVIDER_TYPES.TRAILER_RENTAL]: 'TrailerListing',
    [PROVIDER_TYPES.PUBLIC_TRANSPORT]: 'TransportRoute'
  };
  
  if (listingModels[provider.providerType]) {
    try {
      const Model = mongoose.model(listingModels[provider.providerType]);
      const listings = await Model.find({ providerId: provider._id });
      
      // Delete all listings and their images using deleteOne()
      for (const listing of listings) {
        if (listing.images && listing.images.length > 0) {
          for (const image of listing.images) {
            // Handle both string URLs and object formats for listing images
            let imageKey = null;
            
            if (typeof image === 'string') {
              imageKey = extractS3KeyFromUrl(image);
            } else if (image && image.key) {
              imageKey = image.key;
            } else if (image && image.url) {
              imageKey = extractS3KeyFromUrl(image.url);
            }
            
            if (imageKey) {
              try {
                await deleteImage(imageKey);
              } catch (error) {
                console.warn('Could not delete listing image:', error);
              }
            }
          }
        }
        await listing.deleteOne(); // Updated from .remove()
      }
    } catch (error) {
      console.warn(`Error deleting listings for provider type ${provider.providerType}:`, error);
    }
  }
  
  // Remove the provider using deleteOne()
  await provider.deleteOne(); // Updated from .remove()
  
  res.status(200).json({
    success: true,
    data: {}
  });
});

/**
 * @desc    Update provider subscription
 * @route   PUT /api/providers/:id/subscription
 * @access  Private (Admin)
 */
export const updateSubscription = asyncHandler(async (req, res, next) => {
  let provider = await ServiceProvider.findById(req.params.id);
  
  if (!provider) {
    return next(new ErrorResponse(`Provider not found with id ${req.params.id}`, 404));
  }
  
  // Update subscription information
  provider = await ServiceProvider.findByIdAndUpdate(
    req.params.id,
    {
      subscription: req.body
    },
    {
      new: true,
      runValidators: true
    }
  );
  
  res.status(200).json({
    success: true,
    data: provider
  });
});

/**
 * @desc    Verify provider
 * @route   PUT /api/providers/:id/verify
 * @access  Private (Admin)
 */
export const verifyProvider = asyncHandler(async (req, res, next) => {
  let provider = await ServiceProvider.findById(req.params.id);
  
  if (!provider) {
    return next(new ErrorResponse(`Provider not found with id ${req.params.id}`, 404));
  }
  
  // Update verification status
  provider = await ServiceProvider.findByIdAndUpdate(
    req.params.id,
    {
      'verification.status': 'verified',
      'verification.verifiedAt': Date.now(),
      'verification.verifiedBy': req.user.id
    },
    {
      new: true,
      runValidators: true
    }
  );
  
  res.status(200).json({
    success: true,
    data: provider
  });
});

/**
 * @desc    Get provider listings based on provider type
 * @route   GET /api/providers/:id/listings
 * @access  Public
 */
export const getProviderListings = asyncHandler(async (req, res, next) => {
  const provider = await ServiceProvider.findById(req.params.id);
  
  if (!provider) {
    return next(new ErrorResponse(`Provider not found with id ${req.params.id}`, 404));
  }
  
  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;
  
  let Model, query, total, listings;
  
  // Get the appropriate model based on provider type
  const listingModels = {
    [PROVIDER_TYPES.CAR_RENTAL]: 'RentalVehicle',
    [PROVIDER_TYPES.TRAILER_RENTAL]: 'TrailerListing',
    [PROVIDER_TYPES.PUBLIC_TRANSPORT]: 'TransportRoute'
  };
  
  if (!listingModels[provider.providerType]) {
    return next(new ErrorResponse(`Provider type ${provider.providerType} does not support listings`, 400));
  }
  
  try {
    Model = mongoose.model(listingModels[provider.providerType]);
  } catch (error) {
    return next(new ErrorResponse(`Model not found for provider type: ${provider.providerType}`, 400));
  }
  
  // Build query
  query = { providerId: provider._id };
  
  // Add additional filters from query params if needed
  if (req.query.status && req.query.status !== 'all') {
    query.status = req.query.status;
  }
  
  // Get total count and listings
  total = await Model.countDocuments(query);
  listings = await Model.find(query)
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
    count: listings.length,
    data: listings
  });
});