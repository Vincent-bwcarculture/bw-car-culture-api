// server/controllers/listingController.js - Complete Updated Version with Savings Integration
import Listing from '../models/Listing.js';
import User from '../models/User.js';
import Dealer from '../models/Dealer.js';
import mongoose from 'mongoose';
import { ErrorResponse } from '../utils/errorResponse.js';
import { asyncHandler } from '../utils/errorHandler.js';
import { uploadImage, deleteImage } from '../utils/imageUpload.js';
import { uploadImageToS3, uploadMultipleImagesToS3 } from '../utils/s3Upload.js';
import { s3Config, s3 } from '../config/s3.js';

const updateDealerMetrics = async (dealerId) => {
  try {
    if (!dealerId) return;

    const dealer = await Dealer.findById(dealerId);
    if (!dealer) {
      console.log(`Cannot update metrics: Dealer ${dealerId} not found`);
      return;
    }

    const totalListings = await Listing.countDocuments({ dealerId: dealerId });
    const activeSales = await Listing.countDocuments({ 
      dealerId: dealerId,
      status: 'active'
    });
    
    console.log(`Updating metrics for dealer ${dealerId}:`, {
      totalListings,
      activeSales
    });

    dealer.metrics.totalListings = totalListings;
    dealer.metrics.activeSales = activeSales;
    
    await dealer.save();
  } catch (error) {
    console.error(`Error updating dealer metrics:`, error);
  }
};

// NEW: Helper function for calculating and updating savings
const calculateAndUpdateSavings = (listingData) => {
  if (!listingData.priceOptions) {
    listingData.priceOptions = {};
  }
  
  const { originalPrice, dealerDiscount } = listingData.priceOptions;
  const currentPrice = listingData.price;
  
  // Auto-calculate savings if original price is provided
  if (originalPrice && originalPrice > currentPrice) {
    const savingsAmount = originalPrice - currentPrice;
    const savingsPercentage = Math.round((savingsAmount / originalPrice) * 100);
    
    listingData.priceOptions.savingsAmount = savingsAmount;
    listingData.priceOptions.savingsPercentage = savingsPercentage;
    listingData.priceOptions.showSavings = true;
    
    console.log(`Auto-calculated savings: P${savingsAmount.toLocaleString()} (${savingsPercentage}%)`);
  }
  // Calculate from dealer discount percentage
  else if (dealerDiscount && dealerDiscount > 0 && currentPrice) {
    const originalPrice = Math.round(currentPrice / (1 - dealerDiscount / 100));
    const savingsAmount = originalPrice - currentPrice;
    const savingsPercentage = dealerDiscount;
    
    listingData.priceOptions.originalPrice = originalPrice;
    listingData.priceOptions.savingsAmount = savingsAmount;
    listingData.priceOptions.savingsPercentage = savingsPercentage;
    listingData.priceOptions.showSavings = true;
    
    console.log(`Calculated from dealer discount: P${savingsAmount.toLocaleString()} (${savingsPercentage}%)`);
  }
  
  return listingData;
};

// @desc    Test connection
// @route   GET /api/listings/test-api
// @access  Private
export const testConnection = asyncHandler(async (req, res) => {
  // Check S3 configuration
  const s3Status = {
    enabled: s3Config.enabled,
    bucket: s3Config.bucket,
    region: s3Config.region,
    baseUrl: s3Config.baseUrl,
    credentials: !!process.env.AWS_ACCESS_KEY_ID && !!process.env.AWS_SECRET_ACCESS_KEY
  };

  res.status(200).json({
    success: true,
    message: 'Listing API is working',
    user: req.user ? {
      id: req.user.id,
      role: req.user.role
    } : 'Not authenticated',
    s3: s3Status
  });
});

// @desc    Create new listing
// @route   POST /api/listings
// @access  Private/Admin/Dealer
export const createListing = asyncHandler(async (req, res, next) => {
  try {
    console.log('\n========== CREATE LISTING REQUEST ==========');
    console.log(`User: ${req.user ? req.user.id : 'Not authenticated'}`);
    console.log(`User role: ${req.user ? req.user.role : 'Unknown'}`);
    console.log(`Content-Type: ${req.headers['content-type']}`);
    console.log(`Files received: ${req.files ? req.files.length : 0}`);
    console.log(`S3 status: ${s3Config.enabled ? 'Enabled' : 'Disabled'}`);
    
    // Print body summary without sensitive data
    if (req.body) {
      const bodySummary = {};
      Object.keys(req.body).forEach(key => {
        if (key === 'listingData') {
          try {
            const data = typeof req.body.listingData === 'string'
              ? JSON.parse(req.body.listingData)
              : req.body.listingData;
            
            bodySummary.listingData = {
              title: data.title,
              price: data.price,
              category: data.category,
              dealerId: data.dealerId,
              sellerType: data.dealer?.sellerType,
              imagesCount: data.images?.length || 0,
              hasSavings: !!(data.priceOptions?.originalPrice || data.priceOptions?.dealerDiscount)
            };
          } catch (e) {
            bodySummary.listingData = '[Error parsing JSON]';
          }
        } else {
          bodySummary[key] = req.body[key];
        }
      });
      console.log('Request body summary:', bodySummary);
    }

    // Check authentication
    if (!req.user || !req.user.id) {
      throw new ErrorResponse('User not authenticated', 401);
    }

    // Parse listing data
    let listingData = req.body;
    if (req.body.listingData) {
      try {
        listingData = typeof req.body.listingData === 'string' 
          ? JSON.parse(req.body.listingData) 
          : req.body.listingData;
      } catch (err) {
        console.error('Error parsing listing data:', err);
        throw new ErrorResponse('Invalid listing data format', 400);
      }
    }

    // Validate required fields
    const requiredFields = [
      'title',
      'description',
      'price',
      'category',
      'condition',
      'specifications.make',
      'specifications.model',
      'specifications.year',
      'specifications.mileage',
      'specifications.transmission',
      'specifications.fuelType',
      'location.city',
      'location.country'
    ];

    const errors = {};
    for (const field of requiredFields) {
      const fieldPath = field.split('.');
      let value = listingData;
      
      for (const path of fieldPath) {
        value = value?.[path];
      }
      
      if (!value && value !== 0) {
        errors[field] = `${field} is required`;
      }
    }

    // Validate field constraints
    if (listingData.title && listingData.title.length < 10) {
      errors.title = 'Title must be at least 10 characters';
    }
    if (listingData.description && listingData.description.length < 50) {
      errors.description = 'Description must be at least 50 characters';
    }

    // Check if there are validation errors
    if (Object.keys(errors).length > 0) {
      console.error('Validation errors:', errors);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    // Add creator ID
    listingData.createdBy = req.user.id;
    
    // Check dealer and set dealerId
    let dealerId;
    let dealer;
    
    if (req.user.role === 'admin') {
      // Admin can set dealerId or create for themselves
      dealerId = listingData.dealerId || req.user.id;
      
      if (listingData.dealerId) {
        dealer = await Dealer.findById(listingData.dealerId);
        if (!dealer) {
          return next(new ErrorResponse(`Dealer not found with id ${listingData.dealerId}`, 404));
        }
        console.log('Found dealer for listing:', {
          id: dealer._id,
          businessName: dealer.businessName,
          sellerType: dealer.sellerType,
          hasPrivateSeller: !!dealer.privateSeller
        });
      }
    } else {
      return next(new ErrorResponse('Only admins can create listings', 403));
    }
    
    // Set the dealer ID for the listing
    listingData.dealerId = dealerId;
    
    // Set default status
    listingData.status = 'active';
    
    // ENHANCED: Set dealer information with proper seller type handling
    if (dealer) {
      const isPrivateSeller = dealer.sellerType === 'private';
      
      // Calculate display name based on seller type
      let displayName;
      let contactName;
      
      if (isPrivateSeller && dealer.privateSeller) {
        displayName = `${dealer.privateSeller.firstName} ${dealer.privateSeller.lastName}`;
        contactName = displayName;
      } else {
        displayName = dealer.businessName || 'Unknown Seller';
        contactName = dealer.user?.name || 'Unknown';
      }
      
      listingData.dealer = {
        id: dealer._id,
        name: contactName,
        businessName: displayName,
        sellerType: dealer.sellerType || 'dealership',
        
        contact: {
          phone: dealer.contact?.phone || 'N/A',
          email: dealer.contact?.email || 'N/A',
          website: (!isPrivateSeller && dealer.contact?.website) ? dealer.contact.website : null
        },
        
        location: {
          city: dealer.location?.city || 'Unknown',
          state: dealer.location?.state || null,
          country: dealer.location?.country || 'Unknown',
          address: dealer.location?.address || null
        },
        
        verification: {
          isVerified: dealer.verification?.status === 'verified',
          verifiedAt: dealer.verification?.verifiedAt || null
        },
        
        logo: dealer.profile?.logo || null,
        
        // Include business type only for dealerships
        ...((!isPrivateSeller && dealer.businessType) && {
          businessType: dealer.businessType
        }),
        
        // Include working hours only for dealerships
        ...((!isPrivateSeller && dealer.profile?.workingHours) && {
          workingHours: dealer.profile.workingHours
        }),
        
        // Include private seller information if applicable
        ...(isPrivateSeller && dealer.privateSeller && {
          privateSeller: {
            firstName: dealer.privateSeller.firstName,
            lastName: dealer.privateSeller.lastName,
            preferredContactMethod: dealer.privateSeller.preferredContactMethod || 'both',
            canShowContactInfo: dealer.privateSeller.canShowContactInfo !== false
          }
        }),
        
        // Include metrics if available
        ...(dealer.metrics && {
          metrics: {
            totalListings: dealer.metrics.totalListings || 0,
            activeSales: dealer.metrics.activeSales || 0,
            averageRating: dealer.metrics.averageRating || 0,
            totalReviews: dealer.metrics.totalReviews || 0
          }
        })
      };
      
      console.log('Enhanced dealer info for listing:', {
        dealerId: dealer._id,
        sellerType: dealer.sellerType,
        isPrivateSeller,
        displayName,
        businessName: listingData.dealer.businessName,
        hasPrivateSellerData: !!listingData.dealer.privateSeller,
        contactMethods: Object.keys(listingData.dealer.contact).filter(key => 
          listingData.dealer.contact[key] && listingData.dealer.contact[key] !== 'N/A'
        )
      });
    }

    // Calculate savings if pricing information is provided
    listingData = calculateAndUpdateSavings(listingData);
    
    // Log savings information if present
    if (listingData.priceOptions?.showSavings) {
      console.log('Listing created with savings:', {
        originalPrice: listingData.priceOptions.originalPrice,
        currentPrice: listingData.price,
        savingsAmount: listingData.priceOptions.savingsAmount,
        savingsPercentage: listingData.priceOptions.savingsPercentage,
        isExclusive: listingData.priceOptions.exclusiveDeal,
        sellerType: dealer?.sellerType || 'unknown'
      });
    }
    
    // Handle images - check for pre-uploaded images first
    if (listingData.images && listingData.images.length > 0) {
      console.log('Using pre-uploaded images:', listingData.images.length);
      // Images are already in the correct format from S3
    } else if (req.s3Images && req.s3Images.length > 0) {
      console.log('Using S3 uploaded images:', req.s3Images.length);
      listingData.images = req.s3Images;
    } else if (req.files && req.files.length > 0) {
      console.log('Processing uploaded files for S3:', req.files.length);
      
      // Check if S3 is properly configured
      if (!s3Config.enabled) {
        console.error('S3 is not properly configured for image upload');
        throw new ErrorResponse('S3 configuration is missing or invalid', 500);
      }
      
      try {
        // Process uploaded files using S3
        const imagePromises = req.files.map(async (file, index) => {
          try {
            const isPrimary = req.body.primaryImage 
              ? parseInt(req.body.primaryImage) === index
              : index === 0;
            
            // Use the S3 upload function directly
            const result = await uploadImageToS3(file, 'listings');
            
            if (!result) {
              throw new Error(`S3 upload failed for image ${index}`);
            }
            
            return {
              url: result.url,
              key: result.key,
              size: result.size,
              mimetype: result.mimetype,
              thumbnail: result.thumbnail,
              isPrimary: isPrimary
            };
          } catch (error) {
            console.error(`Image upload error for image ${index}:`, error);
            throw new Error(`Failed to upload image ${index}: ${error.message}`);
          }
        });

        listingData.images = await Promise.all(imagePromises);
        
        // Log successful image uploads
        console.log(`Successfully processed ${listingData.images.length} images for S3`);
        if (listingData.images.length > 0) {
          console.log('First image URL:', listingData.images[0].url);
          console.log('Is S3 URL:', listingData.images[0].url.includes('s3.amazonaws.com') ? 'Yes' : 'No');
        }
      } catch (uploadError) {
        console.error('S3 image processing error:', uploadError);
        throw new ErrorResponse(`Image upload failed: ${uploadError.message}`, 500);
      }
    } else {
      console.error('No images provided in the request');
      throw new ErrorResponse('At least one image is required', 400);
    }

    // Create listing
    console.log('Creating listing with data:', {
      title: listingData.title,
      price: listingData.price,
      images: listingData.images.length,
      dealerId: listingData.dealerId,
      sellerType: listingData.dealer?.sellerType,
      hasSavings: listingData.priceOptions?.showSavings
    });
    
    // Create slug if missing
    if (!listingData.slug && listingData.title) {
      const slugify = (str) => {
        return str
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/[\s_-]+/g, '-')
          .replace(/^-+|-+$/g, '');
      };
      listingData.slug = slugify(listingData.title);
    }
    
    // Set default values
    listingData.views = 0;
    listingData.saves = 0;
    listingData.inquiries = 0;
    
    // Clean up any undefined fields
    const cleanListingData = JSON.parse(JSON.stringify(listingData, (key, value) => {
      return value === undefined ? null : value;
    }));
    
    console.log('Final listing data structure:', {
      title: cleanListingData.title,
      dealerId: cleanListingData.dealerId,
      sellerType: cleanListingData.dealer?.sellerType,
      businessName: cleanListingData.dealer?.businessName,
      hasPrivateSellerData: !!cleanListingData.dealer?.privateSeller,
      imagesCount: cleanListingData.images?.length || 0,
      hasSavings: cleanListingData.priceOptions?.showSavings || false
    });
    
    const listing = await Listing.create(cleanListingData);

    console.log('========== LISTING CREATED SUCCESSFULLY ==========');
    console.log(`Listing ID: ${listing._id}`);
    console.log(`Dealer ID: ${listing.dealerId}`);
    console.log(`Seller Type: ${listing.dealer?.sellerType || 'unknown'}`);
    console.log(`Business Name: ${listing.dealer?.businessName || 'unknown'}`);
    console.log(`Image count: ${listing.images.length}`);
    console.log(`First image URL: ${listing.images[0]?.url || 'None'}`);
    console.log(`Has savings: ${listing.priceOptions?.showSavings ? 'Yes' : 'No'}`);
    console.log(`Has private seller data: ${listing.dealer?.privateSeller ? 'Yes' : 'No'}`);

    // Update dealer metrics
    if (dealer) {
      await updateDealerMetrics(listing.dealerId);
    }

    // Send response
    return res.status(201).json({
      success: true,
      data: listing
    });
  } catch (error) {
    console.error('========== ERROR CREATING LISTING ==========');
    console.error(`Error:`, error);
    
    // Handle specific error types
    if (error.name === 'ValidationError') {
      const validationErrors = {};
      Object.keys(error.errors).forEach(key => {
        validationErrors[key] = error.errors[key].message;
      });
      
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A listing with this title already exists',
        error: 'Duplicate entry'
      });
    }

    // Handle AWS S3 errors
    if (error.code && (
        error.code.includes('S3') || 
        error.code === 'CredentialsError' || 
        error.code === 'NoSuchBucket' || 
        error.code === 'AccessDenied')) {
      console.error('\n🔴 AWS S3 ERROR:', {
        code: error.code,
        message: error.message,
        region: process.env.AWS_REGION,
        bucket: process.env.AWS_S3_BUCKET,
        hasCredentials: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
      });
      
      return res.status(500).json({
        success: false,
        message: 'Failed to upload images to S3',
        error: `AWS S3 error: ${error.message}`,
        awsError: {
          code: error.code,
          message: error.message
        }
      });
    }

    // Send error response
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Error creating listing',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// @desc    Get all listings - ENHANCED with location filtering and savings
// @route   GET /api/listings
// @access  Public
export const getListings = asyncHandler(async (req, res, next) => {
  const filters = { ...req.query };
  
  // Remove fields for pagination
  const removeFields = ['page', 'limit', 'sort', 'fields'];
  removeFields.forEach(field => delete filters[field]);

  // ENHANCED: Location-based filtering
  if (filters.location) {
    console.log(`Filtering listings by location: ${filters.location}`);
    
    // Create location filter - search in multiple location fields
    const locationRegex = new RegExp(filters.location, 'i');
    filters.$or = [
      { 'location.city': locationRegex },
      { 'location.state': locationRegex },
      { 'location.country': locationRegex },
      { 'location.address': locationRegex },
      // Also search in dealer location if available
      { 'dealer.location.city': locationRegex },
      { 'dealer.location.state': locationRegex },
      { 'dealer.location.country': locationRegex }
    ];
    
    // Remove the original location filter
    delete filters.location;
  }

  // City-specific filtering
  if (filters.city) {
    console.log(`Filtering listings by city: ${filters.city}`);
    const cityRegex = new RegExp(filters.city, 'i');
    
    if (filters.$or) {
      // If we already have $or from location, add city filters
      filters.$or.push(
        { 'location.city': cityRegex },
        { 'dealer.location.city': cityRegex }
      );
    } else {
      filters.$or = [
        { 'location.city': cityRegex },
        { 'dealer.location.city': cityRegex }
      ];
    }
    
    delete filters.city;
  }

  // NEW: Savings-based filtering
  if (filters.hasSavings === 'true') {
    filters['priceOptions.showSavings'] = true;
    filters['priceOptions.savingsAmount'] = { $gt: 0 };
    delete filters.hasSavings;
  }

  if (filters.minSavings) {
    filters['priceOptions.savingsAmount'] = { 
      ...(filters['priceOptions.savingsAmount'] || {}),
      $gte: Number(filters.minSavings) 
    };
    delete filters.minSavings;
  }

  if (filters.maxSavings) {
    filters['priceOptions.savingsAmount'] = { 
      ...(filters['priceOptions.savingsAmount'] || {}),
      $lte: Number(filters.maxSavings) 
    };
    delete filters.maxSavings;
  }

  if (filters.minSavingsPercentage) {
    filters['priceOptions.savingsPercentage'] = { 
      ...(filters['priceOptions.savingsPercentage'] || {}),
      $gte: Number(filters.minSavingsPercentage) 
    };
    delete filters.minSavingsPercentage;
  }

  if (filters.exclusiveOnly === 'true') {
    filters['priceOptions.exclusiveDeal'] = true;
    delete filters.exclusiveOnly;
  }

  if (filters.validSavingsOnly === 'true') {
    filters.$and = filters.$and || [];
    filters.$and.push({
      $or: [
        { 'priceOptions.savingsValidUntil': { $gt: new Date() } },
        { 'priceOptions.savingsValidUntil': { $exists: false } }
      ]
    });
    delete filters.validSavingsOnly;
  }

  // Price range filter
  if (filters.minPrice || filters.maxPrice) {
    filters.price = {};
    if (filters.minPrice) filters.price.$gte = Number(filters.minPrice);
    if (filters.maxPrice) filters.price.$lte = Number(filters.maxPrice);
    delete filters.minPrice;
    delete filters.maxPrice;
  }

  // Default to showing only active listings for public
  if (!req.user || req.user.role !== 'admin') {
    filters.status = 'active';
  } else if (filters.status) {
    // Admin can filter by status
  } else {
    // Default for admin is to show all statuses
    delete filters.status;
  }

  // Text search
  if (filters.search) {
    filters.$text = { $search: filters.search };
  }

  // Make/Model filtering
  if (filters.make) {
    filters['specifications.make'] = new RegExp(filters.make, 'i');
    delete filters.make;
  }

  if (filters.model) {
    filters['specifications.model'] = new RegExp(filters.model, 'i');
    delete filters.model;
  }

  // Year range filtering
  if (filters.minYear || filters.maxYear) {
    filters['specifications.year'] = {};
    if (filters.minYear) filters['specifications.year'].$gte = Number(filters.minYear);
    if (filters.maxYear) filters['specifications.year'].$lte = Number(filters.maxYear);
    delete filters.minYear;
    delete filters.maxYear;
  }

  // Mileage range filtering
  if (filters.minMileage || filters.maxMileage) {
    filters['specifications.mileage'] = {};
    if (filters.minMileage) filters['specifications.mileage'].$gte = Number(filters.minMileage);
    if (filters.maxMileage) filters['specifications.mileage'].$lte = Number(filters.maxMileage);
    delete filters.minMileage;
    delete filters.maxMileage;
  }

  // Category/body style filtering
  if (filters.category) {
    filters.category = new RegExp(filters.category, 'i');
  }

  // Condition filtering
  if (filters.condition) {
    filters.condition = filters.condition;
  }

  // Transmission filtering
  if (filters.transmission) {
    filters['specifications.transmission'] = new RegExp(filters.transmission, 'i');
    delete filters.transmission;
  }

  // Fuel type filtering
  if (filters.fuelType) {
    filters['specifications.fuelType'] = new RegExp(filters.fuelType, 'i');
    delete filters.fuelType;
  }

  // Log the final filters for debugging
  if (process.env.NODE_ENV === 'development') {
    console.log('Final listing filters:', JSON.stringify(filters, null, 2));
  }

  // Create query
  let query = Listing.find(filters);

  // Sort - prioritize savings if requested
  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else if (filters['priceOptions.showSavings'] || filters['priceOptions.savingsAmount']) {
    // If filtering by savings, sort by savings amount descending
    query = query.sort('-priceOptions.savingsAmount -createdAt');
  } else {
    query = query.sort('-createdAt');
  }

  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const total = await Listing.countDocuments(filters);

  query = query.skip(startIndex).limit(limit);

  // Execute query
  const listings = await query;

  // Log results for debugging
  if (process.env.NODE_ENV === 'development') {
    console.log(`Found ${listings.length} listings matching filters`);
    if (req.query.location && listings.length > 0) {
      console.log('Sample listing locations:', 
        listings.slice(0, 3).map(l => ({
          title: l.title,
          city: l.location?.city,
          dealerCity: l.dealer?.location?.city,
          hasSavings: l.priceOptions?.showSavings
        }))
      );
    }
  }

  // Pagination result
  const pagination = {};

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
    count: listings.length,
    total,
    pagination,
    data: listings
  });
});

// @desc    Get single listing
// @route   GET /api/listings/:id
// @access  Public
export const getListing = asyncHandler(async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id)
      .populate('dealerId', 'businessName location contact verification profile');
    
    if (!listing) {
      return next(new ErrorResponse('Listing not found', 404));
    }

    // Check if listing has a dealerId before populating
    if (!listing.dealerId) {
      console.log('Warning: Listing has no dealerId');
    }

    // Increment views - don't let this fail the request
    try {
      await listing.incrementViews();
    } catch (viewError) {
      console.error('Error incrementing views:', viewError);
      // Continue without failing
    }

    // Check and repair any image URLs if needed
    if (listing.images && listing.images.length > 0) {
      let modified = false;
      
      // Create a deep copy of the images array to modify
      const fixedImages = listing.images.map(img => {
        const image = typeof img.toObject === 'function' ? img.toObject() : { ...img };
        
        // Fix problematic URLs
        if (image.url && image.url.includes('/images/images/')) {
          image.url = image.url.replace(/\/images\/images\//g, '/images/');
          modified = true;
        }
        
        // Repair missing or malformed URLs based on keys
        if ((!image.url || image.url.startsWith('/')) && image.key && s3Config.enabled) {
          image.url = `${s3Config.baseUrl}/${image.key}`;
          modified = true;
        }
        
        // Fix thumbnail URLs
        if (image.thumbnail && image.thumbnail.includes('/images/images/')) {
          image.thumbnail = image.thumbnail.replace(/\/images\/images\//g, '/images/');
          modified = true;
        }
        
        return image;
      });
      
      // Update listing if any URLs were fixed
      if (modified) {
        console.log(`Repairing image URLs for listing ${listing._id}`);
        await Listing.findByIdAndUpdate(listing._id, { images: fixedImages });
        
        // Update the current listing object
        listing.images = fixedImages;
      }
    }

    res.status(200).json({
      success: true,
      data: listing
    });
  } catch (error) {
    console.error('Error in getListing:', error);
    // Log more details about the error
    if (error.name === 'CastError') {
      return next(new ErrorResponse('Invalid listing ID format', 400));
    }
    return next(new ErrorResponse('Error fetching listing', 500));
  }
});

// @desc    Update listing
// @route   PUT /api/listings/:id
// @access  Private/Admin/Dealer
export const updateListing = asyncHandler(async (req, res) => {
  try {
    console.log(`\n========== UPDATE LISTING REQUEST ${req.params.id} ==========`);
    console.log(`Content-Type: ${req.headers['content-type']}`);
    console.log(`Files received: ${req.files ? req.files.length : 0}`);
    
    // Parse listing data from form
    let listingData;
    if (req.body.listingData) {
      try {
        listingData = JSON.parse(req.body.listingData);
      } catch (error) {
        console.error('Error parsing listingData:', error);
        throw new ErrorResponse('Invalid listing data format', 400);
      }
    } else {
      listingData = req.body;
    }
    
    console.log('Listing data:', {
      id: req.params.id,
      title: listingData.title,
      price: listingData.price,
      replaceImages: !!listingData.replaceImages,
      hasSavingsData: !!(listingData.priceOptions?.originalPrice || listingData.priceOptions?.dealerDiscount)
    });
    
    let listing = await Listing.findById(req.params.id);

    if (!listing) {
      throw new ErrorResponse(`Listing not found with id ${req.params.id}`, 404);
    }

    // Check ownership
    if (listing.dealerId.toString() !== req.user.id && req.user.role !== 'admin') {
      throw new ErrorResponse('Not authorized to update this listing', 403);
    }

    // Get dealer to check subscription requirements
    const dealer = await Dealer.findById(listing.dealerId);
    if (!dealer && req.user.role !== 'admin') {
      throw new ErrorResponse('Dealer not found', 404);
    }

    // Check dealer's subscription status for non-admin users
    if (dealer && req.user.role !== 'admin') {
      if (dealer.subscription.status !== 'active') {
        throw new ErrorResponse('Your subscription is not active. Please renew to update listings.', 403);
      }

      // Check if dealer can have photography based on subscription
      if (req.files?.length && !dealer.subscription.features.allowPhotography) {
        throw new ErrorResponse('Your current subscription does not include photography uploads', 403);
      }
    }

    // NEW: Recalculate savings if pricing has changed
    if (listingData.price !== listing.price || 
        listingData.priceOptions?.originalPrice !== listing.priceOptions?.originalPrice ||
        listingData.priceOptions?.dealerDiscount !== listing.priceOptions?.dealerDiscount) {
      listingData = calculateAndUpdateSavings(listingData);
      console.log('Recalculated savings for listing update');
    }

    // Handle image updates
    if (req.files?.length) {
      console.log('Processing updated images:', req.files.length);
      
      // Verify S3 is properly configured
      if (!s3Config.enabled) {
        console.error('S3 is not properly configured for image upload');
        throw new ErrorResponse('S3 configuration is missing or invalid', 500);
      }
      
      try {
        // Upload new images to S3
        const uploadResults = await uploadMultipleImagesToS3(req.files, 'listings', {
          optimization: {
            quality: 85,
            format: 'webp'
          },
          createThumbnail: true
        });
        
        const newImages = uploadResults.map((result, index) => ({
          url: result.url,
          key: result.key,
          size: result.size,
          mimetype: result.mimetype,
          thumbnail: result.thumbnail,
          isPrimary: req.body.primaryImage ? parseInt(req.body.primaryImage) === index : index === 0
        }));
        
        console.log(`Processed ${newImages.length} new images for S3`);
        
        // If keeping existing images, combine them
        if (!listingData.replaceImages) {
          listingData.images = [...(listing.images || []), ...newImages];
          console.log('Keeping existing images and adding new ones');
        } else {
          // Delete old images if replacing
          console.log('Replacing all images - deleting old ones');
          try {
            for (const image of listing.images) {
              if (image.key) {
                await deleteImage(image.key);
                console.log(`Deleted old image: ${image.key}`);
              }
            }
          } catch (deleteError) {
            console.warn('Error deleting old images:', deleteError);
            // Continue even if deletion fails
          }
          listingData.images = newImages;
        }
      } catch (uploadError) {
        console.error('S3 image upload error:', uploadError);
        throw new ErrorResponse(`Failed to upload images: ${uploadError.message}`, 500);
      }
    }

    // Check status change for updating dealer metrics
    const previousStatus = listing.status;
    const newStatus = listingData.status || previousStatus;

    // Update the listing
    listing = await Listing.findByIdAndUpdate(
      req.params.id,
      { ...listingData, lastUpdated: Date.now() },
      { new: true, runValidators: true }
    );

    // Update dealer metrics if status changed
    if (dealer && previousStatus !== newStatus) {
      if (previousStatus === 'active' && newStatus !== 'active') {
        dealer.metrics.activeSales = Math.max(0, dealer.metrics.activeSales - 1);
      } else if (previousStatus !== 'active' && newStatus === 'active') {
        dealer.metrics.activeSales += 1;
      }
      await dealer.save();
    }

    // Log success
    console.log(`Listing ${req.params.id} updated successfully`);
    console.log(`Updated with ${listing.images.length} images`);
    console.log(`Has savings: ${listing.priceOptions?.showSavings ? 'Yes' : 'No'}`);
    
    // Show sample URLs for debugging
    if (listing.images && listing.images.length > 0) {
      console.log('First image URL:', listing.images[0].url);
      console.log('Is S3 URL:', listing.images[0].url.includes('s3.amazonaws.com') ? 'Yes' : 'No');
    }

    // Update dealer metrics
    await updateDealerMetrics(listing.dealerId);

    res.status(200).json({
      success: true,
      data: listing
    });
  } catch (error) {
    console.error('Error in updateListing:', error);
    
    // Enhanced error handling for S3 issues
    if (error.code && (
        error.code.includes('S3') || 
        error.code === 'CredentialsError' || 
        error.code === 'NoSuchBucket' || 
        error.code === 'AccessDenied')) {
      return res.status(500).json({
        success: false,
        message: 'Failed to upload images to S3',
        error: `AWS S3 error: ${error.message}`,
        awsError: {
          code: error.code,
          message: error.message
        }
      });
    }
    
    throw error;
  }
});

// @desc    Increment view count for a listing
// @route   POST /api/listings/:id/views
// @access  Public
export const incrementViewCount = asyncHandler(async (req, res, next) => {
  try {
    // Find and update the listing
    const listing = await Listing.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } }, // Increment views field by 1
      { new: true }
    );
    
    if (!listing) {
      return next(new ErrorResponse(`Listing not found with id ${req.params.id}`, 404));
    }
    
    // Return success response with updated view count
    res.status(200).json({
      success: true,
      data: {
        views: listing.views
      }
    });
    
    // Also update analytics data asynchronously (don't wait for this)
    try {
      // If we have an analytics model, record the view
      if (typeof Analytics !== 'undefined') {
        Analytics.create({
          type: 'view',
          contentType: 'listing',
          contentId: listing._id,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          timestamp: new Date()
        }).catch(err => console.error('Error recording analytics:', err));
      }
    } catch (analyticError) {
      console.error('Error recording analytics:', analyticError);
      // Don't affect the main response
    }
  } catch (error) {
    console.error(`Error incrementing view count for listing ${req.params.id}:`, error);
    return next(new ErrorResponse('Error incrementing view count', 500));
  }
});

// @desc    Delete listing
// @route   DELETE /api/listings/:id
// @access  Private/Admin/Dealer
export const deleteListing = asyncHandler(async (req, res, next) => {
  const listing = await Listing.findById(req.params.id);

  if (!listing) {
    return next(new ErrorResponse(`Listing not found with id ${req.params.id}`, 404));
  }

  // Check ownership
  if (listing.dealerId.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to delete this listing', 403));
  }

  // Delete images from S3
  if (listing.images && listing.images.length > 0) {
    try {
      console.log('Deleting associated images from S3');
      for (const image of listing.images) {
        if (image.key) {
          try {
            await deleteImage(image.key);
            console.log(`Deleted image: ${image.key}`);
          } catch (err) {
            console.warn(`Error deleting image ${image.key}:`, err);
            // Continue with next image even if deletion fails
          }
        }
      }
    } catch (err) {
      console.warn('Error deleting images during listing deletion:', err);
      // Continue with deletion even if image removal fails
    }
  }

  // Update dealer metrics before removing the listing
  if (listing.status === 'active') {
    const dealer = await Dealer.findById(listing.dealerId);
    if (dealer) {
      dealer.metrics.totalListings = Math.max(0, dealer.metrics.totalListings - 1);
      dealer.metrics.activeSales = Math.max(0, dealer.metrics.activeSales - 1);
      await dealer.save();
    }
  }

  await listing.remove();

  // Update dealer metrics
  await updateDealerMetrics(listing.dealerId);

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Get featured listings
// @route   GET /api/listings/featured
// @access  Public
export const getFeaturedListings = asyncHandler(async (req, res, next) => {
  // Get limit parameter or default to 6
  const limit = parseInt(req.query.limit, 10) || 6;
  
  const listings = await Listing.find({ 
    featured: true, 
    status: 'active' 
  })
  .limit(limit)
  .sort('-createdAt');

  res.status(200).json({
    success: true,
    count: listings.length,
    data: listings
  });
});

// NEW: @desc    Get listings with savings
// @route   GET /api/listings/savings
// @access  Public
export const getListingsWithSavings = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit, 10) || 10;
  const page = parseInt(req.query.page, 10) || 1;
  const startIndex = (page - 1) * limit;
  
  // Find listings with active savings
  const query = {
    'priceOptions.showSavings': true,
    'priceOptions.savingsAmount': { $gt: 0 },
    status: 'active'
  };
  
  // Optional: filter by savings amount or percentage
  if (req.query.minSavings) {
    query['priceOptions.savingsAmount'] = { 
      ...query['priceOptions.savingsAmount'],
      $gte: Number(req.query.minSavings) 
    };
  }
  
  if (req.query.minPercentage) {
    query['priceOptions.savingsPercentage'] = { $gte: Number(req.query.minPercentage) };
  }
  
  // Optional: filter by exclusive deals
  if (req.query.exclusiveOnly === 'true') {
    query['priceOptions.exclusiveDeal'] = true;
  }
  
  // Optional: filter by valid deals only
  if (req.query.validOnly === 'true') {
    query.$or = [
      { 'priceOptions.savingsValidUntil': { $gt: new Date() } },
      { 'priceOptions.savingsValidUntil': { $exists: false } }
    ];
  }
  
  const total = await Listing.countDocuments(query);
  
  const listings = await Listing.find(query)
    .sort({ 'priceOptions.savingsAmount': -1 }) // Sort by highest savings first
    .skip(startIndex)
    .limit(limit);
  
  // Calculate additional savings stats
  const savingsStats = await Listing.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        totalSavingsOffered: { $sum: '$priceOptions.savingsAmount' },
        averageSavings: { $avg: '$priceOptions.savingsAmount' },
        averagePercentage: { $avg: '$priceOptions.savingsPercentage' },
        maxSavings: { $max: '$priceOptions.savingsAmount' },
        exclusiveDealsCount: {
          $sum: {
            $cond: [{ $eq: ['$priceOptions.exclusiveDeal', true] }, 1, 0]
          }
        }
      }
    }
  ]);
  
  const pagination = {};
  if (startIndex + limit < total) {
    pagination.next = { page: page + 1, limit };
  }
  if (startIndex > 0) {
    pagination.prev = { page: page - 1, limit };
  }
  
  res.status(200).json({
    success: true,
    count: listings.length,
    total,
    pagination,
    stats: savingsStats.length > 0 ? savingsStats[0] : null,
    data: listings
  });
});

// @desc    Get dealer listings
// @route   GET /api/listings/dealer/:dealerId
// @access  Public
export const getDealerListings = asyncHandler(async (req, res, next) => {
  try {
    const dealerId = req.params.dealerId;
    
    if (!dealerId) {
      return res.status(400).json({
        success: false,
        message: 'Dealer ID is required'
      });
    }

    console.log(`Looking up listings for dealer: ${dealerId}`);
    
    // First verify the dealer exists
    const dealer = await Dealer.findById(dealerId);
    
    if (dealer) {
      console.log(`Found dealer: ${dealer.businessName}`);
    } else {
      console.log(`No dealer found with ID: ${dealerId}`);
      // Continue anyway to attempt finding listings
    }
    
    // Get pagination parameters
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    
    // Build the filter query object
    let filterQuery = {};
    
    // Try different ID formats for maximum compatibility
    if (mongoose.Types.ObjectId.isValid(dealerId)) {
      filterQuery = { dealerId: dealerId };
    } else {
      // Use string comparison if not a valid ObjectId
      filterQuery = { 
        $or: [
          { dealerId: dealerId.toString() },
          { 'dealer.id': dealerId.toString() }
        ]
      };
    }
    
    console.log(`Filter query for listings:`, JSON.stringify(filterQuery));
    
    // For public requests, only show active listings
    if (!req.user || (req.user.role !== 'admin' && (!dealer || req.user.id !== dealer.user?.toString()))) {
      filterQuery.status = 'active';
    }
    
    // IMPORTANT: Create a separate query for count - don't reuse the same query object
    const total = await Listing.countDocuments(filterQuery);
    console.log(`Total matching listings found: ${total}`);
    
    // Create a new query for fetching the actual data
    const listings = await Listing.find(filterQuery)
      .skip(startIndex)
      .limit(limit)
      .sort('-createdAt');
    
    console.log(`Found ${listings.length} listings for dealer ${dealerId}`);
    
    // Return response with pagination
    return res.status(200).json({
      success: true,
      count: listings.length,
      total,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total
      },
      data: listings
    });
  } catch (error) {
    console.error(`Error in getDealerListings: ${error.message}`);
    return next(new ErrorResponse(`Error fetching dealer listings: ${error.message}`, 500));
  }
});

// @desc    Get similar listings
// @route   GET /api/listings/:id/similar
// @access  Public
export const getSimilarListings = asyncHandler(async (req, res, next) => {
  const listing = await Listing.findById(req.params.id);

  if (!listing) {
    return next(new ErrorResponse(`Listing not found with id ${req.params.id}`, 404));
  }

  const similarListings = await Listing.getSimilarListings(listing);

  res.status(200).json({
    success: true,
    count: similarListings.length,
    data: similarListings
  });
});

// ENHANCED: Get filter options with location data and savings
export const getFilterOptions = asyncHandler(async (req, res, next) => {
  // Gather all unique values from the database
  const makes = await Listing.distinct('specifications.make');
  const years = await Listing.distinct('specifications.year');
  const fuelTypes = await Listing.distinct('specifications.fuelType');
  const transmissionTypes = await Listing.distinct('specifications.transmission');
  const bodyStyles = await Listing.distinct('category');
  const drivetrainTypes = await Listing.distinct('specifications.drivetrain');
  const conditions = await Listing.distinct('condition');
  const colors = await Listing.distinct('specifications.exteriorColor');
  
  // Get location data
  const cities = await Listing.distinct('location.city');
  const states = await Listing.distinct('location.state');
  const countries = await Listing.distinct('location.country');
  const dealerCities = await Listing.distinct('dealer.location.city');
  const allCities = [...new Set([...cities, ...dealerCities])].filter(Boolean).sort();

  // NEW: Get savings statistics
  const savingsStats = await Listing.aggregate([
    { 
      $match: { 
        status: 'active',
        'priceOptions.showSavings': true,
        'priceOptions.savingsAmount': { $gt: 0 }
      } 
    },
    {
      $group: {
        _id: null,
        minSavings: { $min: '$priceOptions.savingsAmount' },
        maxSavings: { $max: '$priceOptions.savingsAmount' },
        avgSavings: { $avg: '$priceOptions.savingsAmount' },
        minPercentage: { $min: '$priceOptions.savingsPercentage' },
        maxPercentage: { $max: '$priceOptions.savingsPercentage' },
        totalWithSavings: { $sum: 1 },
        exclusiveDeals: {
          $sum: {
            $cond: [{ $eq: ['$priceOptions.exclusiveDeal', true] }, 1, 0]
          }
        }
      }
    }
  ]);

  // For price and mileage stats
  const priceStats = await Listing.aggregate([
    { $match: { status: 'active' } },
    { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } }
  ]);
  
  const mileageStats = await Listing.aggregate([
    { $match: { status: 'active' } },
    { $group: { _id: null, min: { $min: '$specifications.mileage' }, max: { $max: '$specifications.mileage' } } }
  ]);

  // Format price ranges based on actual data
  const priceMin = priceStats.length > 0 ? priceStats[0].min : 0;
  const priceMax = priceStats.length > 0 ? priceStats[0].max : 200000;
  const step = Math.ceil(priceMax / 6);
  
  const priceRanges = [];
  let currentMin = 0;
  while (currentMin < priceMax) {
    const max = currentMin + step;
    priceRanges.push({
      label: `P${currentMin.toLocaleString()} - P${max.toLocaleString()}`,
      min: currentMin,
      max: max
    });
    currentMin = max;
  }

  // NEW: Create savings ranges if we have savings data
  const savingsRanges = [];
  if (savingsStats.length > 0) {
    const maxSavings = savingsStats[0].maxSavings;
    const savingsStep = Math.ceil(maxSavings / 5);
    
    let currentSavingsMin = 0;
    while (currentSavingsMin < maxSavings) {
      const max = currentSavingsMin + savingsStep;
      savingsRanges.push({
        label: `Save P${currentSavingsMin.toLocaleString()} - P${max.toLocaleString()}`,
        min: currentSavingsMin,
        max: max
      });
      currentSavingsMin = max;
    }
  }

  res.status(200).json({
    success: true,
    data: {
      makes: makes.sort(),
      years: years.sort((a, b) => b - a),
      fuelTypes,
      transmissionTypes,
      bodyStyles,
      drivetrainTypes,
      conditions,
      colors,
      cities: allCities,
      states: states.filter(Boolean).sort(),
      countries: countries.filter(Boolean).sort(),
      priceRanges,
      mileageRanges: [
        { label: 'Under 10,000 km', min: 0, max: 10000 },
        { label: '10,000 - 30,000 km', min: 10000, max: 30000 },
        { label: '30,000 - 60,000 km', min: 30000, max: 60000 },
        { label: '60,000 - 100,000 km', min: 60000, max: 100000 },
        { label: 'Over 100,000 km', min: 100000, max: null }
      ],
      // NEW: Savings filter options
      savingsRanges,
      savingsPercentageRanges: [
        { label: '5% - 10% Off', min: 5, max: 10 },
        { label: '10% - 20% Off', min: 10, max: 20 },
        { label: '20% - 30% Off', min: 20, max: 30 },
        { label: '30% - 50% Off', min: 30, max: 50 },
        { label: 'Over 50% Off', min: 50, max: null }
      ],
      savingsStats: savingsStats.length > 0 ? {
        totalListingsWithSavings: savingsStats[0].totalWithSavings,
        exclusiveDeals: savingsStats[0].exclusiveDeals,
        averageSavings: Math.round(savingsStats[0].avgSavings),
        maxSavings: savingsStats[0].maxSavings,
        maxPercentage: savingsStats[0].maxPercentage
      } : null
    }
  });
});

export const getModelsByMake = asyncHandler(async (req, res, next) => {
  const { make } = req.query;
  
  if (!make) {
    return res.status(400).json({
      success: false,
      message: 'Make parameter is required'
    });
  }
  
  // Find all models for the given make
  const models = await Listing.distinct('specifications.model', {
    'specifications.make': make
  });
  
  res.status(200).json({
    success: true,
    data: models.sort() // Sort alphabetically
  });
});

// NEW: @desc    Check savings validity
// @route   GET /api/listings/:id/savings-validity
// @access  Public
export const checkSavingsValidity = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  
  const listing = await Listing.findById(id);
  
  if (!listing) {
    return next(new ErrorResponse(`Listing not found with id ${id}`, 404));
  }
  
  const now = new Date();
  let isValid = true;
  let message = 'Savings offer is active';
  
  if (listing.priceOptions?.savingsValidUntil) {
    const validUntil = new Date(listing.priceOptions.savingsValidUntil);
    if (now > validUntil) {
      isValid = false;
      message = 'This savings offer has expired';
    } else {
      const daysRemaining = Math.ceil((validUntil - now) / (1000 * 60 * 60 * 24));
      message = `Savings offer valid for ${daysRemaining} more day${daysRemaining !== 1 ? 's' : ''}`;
    }
  }
  
  res.status(200).json({
    success: true,
    data: {
      isValid,
      message,
      validUntil: listing.priceOptions?.savingsValidUntil,
      savingsAmount: listing.priceOptions?.savingsAmount,
      savingsPercentage: listing.priceOptions?.savingsPercentage
    }
  });
});

// @desc    Update listing status
// @route   PATCH /api/listings/:id/status
// @access  Private/Admin/Dealer
export const updateListingStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;

  if (!status) {
    return next(new ErrorResponse('Please provide a status', 400));
  }

  let listing = await Listing.findById(req.params.id);

  if (!listing) {
    return next(new ErrorResponse(`Listing not found with id ${req.params.id}`, 404));
  }

  // Check authorization
  if (listing.dealerId.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to update this listing', 403));
  }

  // Get previous status to update dealer metrics
  const prevStatus = listing.status;

  // Update listing status
  listing = await Listing.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  );

  // Update dealer metrics if status changed between active and inactive
  if (prevStatus !== status) {
    const dealer = await Dealer.findById(listing.dealerId);
    if (dealer) {
      if (prevStatus === 'active' && status !== 'active') {
        dealer.metrics.activeSales = Math.max(0, dealer.metrics.activeSales - 1);
      } else if (prevStatus !== 'active' && status === 'active') {
        dealer.metrics.activeSales += 1;
      }
      await dealer.save();
    }
  }

  res.status(200).json({
    success: true,
    data: listing
  });
});

// @desc    Toggle listing featured status
// @route   PATCH /api/listings/:id/featured
// @access  Private/Admin
export const toggleFeatured = asyncHandler(async (req, res, next) => {
  const listing = await Listing.findById(req.params.id);

  if (!listing) {
    return next(new ErrorResponse(`Listing not found with id ${req.params.id}`, 404));
  }

  // Only admins can toggle featured status
  if (req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to modify featured status', 403));
  }

  listing.featured = !listing.featured;
  await listing.save();

  res.status(200).json({
    success: true,
    data: listing
  });
});

// @desc    Save/Unsave listing for user
// @route   PUT /api/listings/:id/save
// @access  Private
export const toggleSaveListing = asyncHandler(async (req, res, next) => {
  const listing = await Listing.findById(req.params.id);

  if (!listing) {
    return next(new ErrorResponse(`Listing not found with id ${req.params.id}`, 404));
  }

  const user = await User.findById(req.user.id);
  const savedListings = user.savedListings || [];
  const listingIndex = savedListings.indexOf(req.params.id);

  if (listingIndex === -1) {
    savedListings.push(req.params.id);
    listing.saves += 1;
  } else {
    savedListings.splice(listingIndex, 1);
    listing.saves = Math.max(0, listing.saves - 1);
  }

  await Promise.all([
    user.save(),
    listing.save()
  ]);

  res.status(200).json({
    success: true,
    data: {
      saved: listingIndex === -1,
      saves: listing.saves
    }
  });
});

// @desc    Bulk delete multiple listings
// @route   POST /api/listings/bulk-delete
// @access  Private/Admin
export const bulkDeleteListings = asyncHandler(async (req, res, next) => {
  const { ids } = req.body;
  
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorResponse('Please provide an array of listing IDs', 400));
  }
  
  // Only admins can bulk delete
  if (req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to perform bulk operations', 403));
  }
  
  console.log(`Bulk deleting ${ids.length} listings`);
  
  // Get all listings to delete images and update dealer metrics
  const listings = await Listing.find({ _id: { $in: ids } });
  
  if (listings.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'No listings found with the provided IDs'
    });
  }
  
  // Track dealers for metric updates
  const dealerIds = new Set();
  
  // Delete images from S3 for each listing
  for (const listing of listings) {
    // Track dealer for metrics update
    dealerIds.add(listing.dealerId.toString());
    
    // Delete images
    if (listing.images && listing.images.length > 0) {
      try {
        for (const image of listing.images) {
          if (image.key) {
            try {
              await deleteImage(image.key);
            } catch (err) {
              console.warn(`Error deleting image ${image.key}:`, err);
              // Continue to next image if one fails
            }
          }
        }
      } catch (err) {
        console.warn(`Error deleting images for listing ${listing._id}:`, err);
        // Continue to next listing if image deletion fails
      }
    }
  }
  
  // Delete the listings
  const result = await Listing.deleteMany({ _id: { $in: ids } });
  
  // Update metrics for all affected dealers
  for (const dealerId of dealerIds) {
    await updateDealerMetrics(dealerId);
  }
  
  res.status(200).json({
    success: true,
    count: result.deletedCount,
    message: `Successfully deleted ${result.deletedCount} listings`
  });
});

// @desc    Bulk update listing statuses
// @route   PATCH /api/listings/bulk-status
// @access  Private/Admin
export const bulkUpdateStatus = asyncHandler(async (req, res, next) => {
  const { ids, status } = req.body;
  
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return next(new ErrorResponse('Please provide an array of listing IDs', 400));
  }
  
  if (!status) {
    return next(new ErrorResponse('Please provide a status', 400));
  }
  
  // Only admins can bulk update
  if (req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to perform bulk operations', 403));
  }
  
  console.log(`Bulk updating ${ids.length} listings to status: ${status}`);
  
  // Update the listings
  const result = await Listing.updateMany(
    { _id: { $in: ids } },
    { status }
  );
  
  // Get affected dealers
  const listings = await Listing.find({ _id: { $in: ids } });
  const dealerIds = [...new Set(listings.map(listing => listing.dealerId.toString()))];
  
  // Update metrics for all affected dealers
  for (const dealerId of dealerIds) {
    await updateDealerMetrics(dealerId);
  }
  
  res.status(200).json({
    success: true,
    count: result.modifiedCount,
    message: `Successfully updated ${result.modifiedCount} listings to status: ${status}`
  });
});