// server/controllers/dealerController.js
import asyncHandler from '../middleware/async.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import { uploadImage, deleteImage } from '../utils/imageUpload.js';
import Dealer from '../models/Dealer.js';
import Listing from '../models/Listing.js';
import User from '../models/User.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// @desc    Get all dealers for dropdown
// @route   GET /api/dealers/all
// @access  Public
const getAllDealers = asyncHandler(async (req, res, next) => {
  // Find all active dealers with ALL fields needed for the dropdown, including private seller data
  const filteredDealers = await Dealer.find({ status: 'active' })
    .select('businessName profile.logo verification.status sellerType privateSeller businessType')
    .lean(); // Use lean() for better performance

  // Map to the required format for dropdown with proper seller type handling
  const dealersForDropdown = filteredDealers.map(dealer => ({
    _id: dealer._id,
    businessName: dealer.businessName,
    name: dealer.businessName, // Adjust if you have a separate name field
    logo: dealer.profile?.logo,
    sellerType: dealer.sellerType || 'dealership', // Ensure sellerType is always present
    businessType: dealer.businessType,
    privateSeller: dealer.privateSeller, // Include private seller data
    verification: {
      isVerified: dealer.verification?.status === 'verified'
    },
    // Calculate display name based on seller type
    displayName: dealer.sellerType === 'private' && dealer.privateSeller
      ? `${dealer.privateSeller.firstName} ${dealer.privateSeller.lastName}`
      : dealer.businessName
  }));

  console.log(`Retrieved ${dealersForDropdown.length} sellers for dropdown:`, 
    dealersForDropdown.map(d => ({ 
      name: d.displayName, 
      type: d.sellerType 
    }))
  );

  res.status(200).json({
    success: true,
    count: dealersForDropdown.length,
    data: dealersForDropdown
  });
});

// @desc    Get all dealers
// @route   GET /api/dealers
// @access  Public
const getDealers = asyncHandler(async (req, res, next) => {
  console.log('Getting sellers with filters:', req.query);

  // Build query
  let query = Dealer.find();

  // Apply filters
  if (req.query.status && req.query.status !== 'all') {
    query = query.where('status').equals(req.query.status);
  }

  // NEW: Filter by seller type
  if (req.query.sellerType && req.query.sellerType !== 'all') {
    query = query.where('sellerType').equals(req.query.sellerType);
    console.log(`Filtering by seller type: ${req.query.sellerType}`);
  }

  if (req.query.businessType && req.query.businessType !== 'all') {
    // Only apply business type filter for dealerships
    query = query.where({
      $and: [
        { sellerType: 'dealership' },
        { businessType: req.query.businessType }
      ]
    });
  }

  if (req.query.subscriptionStatus && req.query.subscriptionStatus !== 'all') {
    query = query.where('subscription.status').equals(req.query.subscriptionStatus);
  }

  // Enhanced search to include private seller names
  if (req.query.search) {
    const searchTerm = req.query.search.toLowerCase();
    query = query.where({
      $or: [
        { businessName: { $regex: searchTerm, $options: 'i' } },
        { 'contact.email': { $regex: searchTerm, $options: 'i' } },
        { 'location.city': { $regex: searchTerm, $options: 'i' } },
        // NEW: Search private seller names
        { 'privateSeller.firstName': { $regex: searchTerm, $options: 'i' } },
        { 'privateSeller.lastName': { $regex: searchTerm, $options: 'i' } }
      ]
    });
  }

  if (req.query.city) {
    const cityTerm = req.query.city.toLowerCase();
    query = query.where('location.city').regex(cityTerm, 'i');
  }

  // Sort
  if (req.query.sort) {
    if (req.query.sort === '-createdAt') {
      query = query.sort({ createdAt: -1 });
    } else if (req.query.sort === 'createdAt') {
      query = query.sort({ createdAt: 1 });
    } else if (req.query.sort === 'businessName') {
      query = query.sort({ businessName: 1 });
    } else if (req.query.sort === 'subscription.expiresAt') {
      query = query.sort({ 'subscription.expiresAt': 1 });
    }
  } else {
    // Default sort by newest
    query = query.sort({ createdAt: -1 });
  }

  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const skip = (page - 1) * limit;

  // Execute query with pagination
  const total = await Dealer.countDocuments(query.getFilter());
  const sellers = await query.skip(skip).limit(limit).exec();

  // Log results with seller type information
  console.log(`Found ${sellers.length} sellers:`, {
    total,
    dealerships: sellers.filter(s => s.sellerType === 'dealership').length,
    privateStores: sellers.filter(s => s.sellerType === 'private').length
  });

  // Pagination metadata
  const pagination = {
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    total
  };

  // Response
  res.status(200).json({
    success: true,
    data: sellers,
    pagination
  });
});

// @desc    Get single dealer
// @route   GET /api/dealers/:id
// @access  Public
const getDealer = asyncHandler(async (req, res, next) => {
  try {
    console.log(`Looking up dealer with ID: ${req.params.id}`);
    
    // Try to find the dealer
    const dealer = await Dealer.findById(req.params.id);

    if (!dealer) {
      console.log(`No dealer found with id ${req.params.id}`);
      return res.status(404).json({
        success: false,
        message: `Dealer not found with id ${req.params.id}`
      });
    }

    // Make sure the dealer has all necessary properties for the frontend
    // This helps prevent "no dealer data available" errors
    const dealerResponse = {
      ...dealer.toObject(),
      // Ensure these properties exist even if empty
      businessName: dealer.businessName || 'Unnamed Dealer',
      profile: dealer.profile || {
        logo: null,
        banner: null,
        description: null,
        specialties: [],
        workingHours: {}
      },
      contact: dealer.contact || {
        phone: null,
        email: null,
        website: null
      },
      location: dealer.location || {
        address: null,
        city: null,
        state: null,
        country: null
      },
      metrics: dealer.metrics || {
        totalListings: 0,
        activeSales: 0,
        averageRating: 0,
        totalReviews: 0
      }
    };

    console.log(`Successfully found dealer: ${dealer.businessName}`);
    
    res.status(200).json({
      success: true,
      data: dealerResponse
    });
  } catch (error) {
    console.error(`Error fetching dealer ${req.params.id}:`, error);
    return next(new ErrorResponse(`Error fetching dealer: ${error.message}`, 500));
  }
});

// @desc    Create dealer profile
// @route   POST /api/dealers
// @access  Private/Admin
// Complete replacement for the createDealer function in dealerController.js
const createDealer = asyncHandler(async (req, res, next) => {
  console.log('Creating dealer with form data:', req.body);
  console.log('Files:', req.files);

  try {
    // Check for potential duplicate submission by business name
    if (req.body.businessName) {
      const existingDealer = await Dealer.findOne({ 
        businessName: req.body.businessName,
        // Check if created within the last minute
        createdAt: { $gt: new Date(Date.now() - 60 * 1000) }
      });

      if (existingDealer) {
        console.log('Potential duplicate dealer detected:', existingDealer.businessName);
        return res.status(200).json({ 
          success: true, 
          data: existingDealer,
          message: 'Existing dealer returned to prevent duplication'
        });
      }
    }

    // Check for dealerData field which might contain JSON string of all dealer data
    let dealerData = {};
    if (req.body.dealerData) {
      try {
        dealerData = JSON.parse(req.body.dealerData);
        console.log('Using parsed dealerData from request');
      } catch (e) {
        console.error('Error parsing dealerData JSON:', e);
        // Continue with normal field processing
      }
    }

    // If dealerData wasn't provided or couldn't be parsed, use individual fields
    if (Object.keys(dealerData).length === 0) {
      dealerData = {
        sellerType: req.body.sellerType || 'dealership', // IMPORTANT: Set sellerType first
        businessName: req.body.businessName,
        status: req.body.status || 'active',
        user: req.body.user // Required field in the schema
      };

      // FIXED: Only set businessType for dealerships
      if (dealerData.sellerType === 'dealership') {
        dealerData.businessType = req.body.businessType || 'independent';
      }

      // Parse JSON strings from form data
      if (req.body.contact) {
        try {
          dealerData.contact = JSON.parse(req.body.contact);
        } catch (e) {
          console.error('Error parsing contact JSON:', e);
          return next(new ErrorResponse('Invalid contact data format', 400));
        }
      }

      if (req.body.location) {
        try {
          dealerData.location = JSON.parse(req.body.location);
        } catch (e) {
          console.error('Error parsing location JSON:', e);
          return next(new ErrorResponse('Invalid location data format', 400));
        }
      }

      if (req.body.subscription) {
        try {
          const subscriptionData = JSON.parse(req.body.subscription);
          // Map subscription.plan to subscription.tier to match the schema
          if (subscriptionData.plan) {
            subscriptionData.tier = subscriptionData.plan;
            delete subscriptionData.plan;
          }
          dealerData.subscription = subscriptionData;
        } catch (e) {
          console.error('Error parsing subscription JSON:', e);
          return next(new ErrorResponse('Invalid subscription data format', 400));
        }
      }

      // FIXED: Handle private seller data
      if (req.body.privateSeller) {
        try {
          dealerData.privateSeller = JSON.parse(req.body.privateSeller);
        } catch (e) {
          console.error('Error parsing privateSeller JSON:', e);
          return next(new ErrorResponse('Invalid private seller data format', 400));
        }
      }

      // Initialize profile object
      dealerData.profile = {};

      if (req.body.profile) {
        try {
          dealerData.profile = JSON.parse(req.body.profile);
        } catch (e) {
          console.error('Error parsing profile JSON:', e);
          return next(new ErrorResponse('Invalid profile data format', 400));
        }
      }
    }

    // IMPORTANT: Clean up businessType for private sellers
    if (dealerData.sellerType === 'private') {
      delete dealerData.businessType; // Remove businessType entirely for private sellers
      console.log('Removed businessType for private seller');
    }

    // Handle file uploads
    if (req.files) {
      const logoFile = req.files.find(file => file.fieldname === 'logo');
      const bannerFile = req.files.find(file => file.fieldname === 'banner');

      if (logoFile) {
        try {
          const result = await uploadImage(logoFile, 'dealers');
          console.log('Logo upload result:', result);
          dealerData.profile.logo = result.url;
        } catch (error) {
          console.error('Error uploading logo:', error);
          dealerData.profile.logo = '/images/placeholders/dealer-logo.jpg';
        }
      } else if (!dealerData.profile.logo) {
        dealerData.profile.logo = '/images/placeholders/dealer-logo.jpg';
      }

      if (bannerFile && dealerData.sellerType === 'dealership') { // Only upload banner for dealerships
        try {
          const result = await uploadImage(bannerFile, 'dealers');
          console.log('Banner upload result:', result);
          dealerData.profile.banner = result.url;
        } catch (error) {
          console.error('Error uploading banner:', error);
          dealerData.profile.banner = '/images/placeholders/dealer-banner.jpg';
        }
      } else if (!dealerData.profile.banner && dealerData.sellerType === 'dealership') {
        dealerData.profile.banner = '/images/placeholders/dealer-banner.jpg';
      }
    } else {
      // Only set placeholders if not already set
      if (!dealerData.profile.logo) {
        dealerData.profile.logo = '/images/placeholders/dealer-logo.jpg';
      }
      if (!dealerData.profile.banner && dealerData.sellerType === 'dealership') {
        dealerData.profile.banner = '/images/placeholders/dealer-banner.jpg';
      }
    }

    // Log the final structure before saving
    console.log('Final dealer data structure:', {
      sellerType: dealerData.sellerType,
      businessName: dealerData.businessName,
      hasBusinessType: !!dealerData.businessType,
      businessType: dealerData.businessType,
      hasPrivateSeller: !!dealerData.privateSeller,
      hasProfile: !!dealerData.profile,
      logoUrl: dealerData.profile?.logo || 'none',
      bannerUrl: dealerData.profile?.banner || 'none'
    });

    // Create and save the dealer to MongoDB
    const dealer = new Dealer(dealerData);
    const savedDealer = await dealer.save();

    // Log the saved dealer for debugging
    console.log('Dealer saved successfully:', savedDealer._id);

    // Return success response
    res.status(201).json({
      success: true,
      data: savedDealer
    });
  } catch (error) {
    console.error('Error creating dealer:', error);
    return next(new ErrorResponse(`Failed to create dealer: ${error.message}`, 500));
  }
});

// @desc    Update dealer profile
// @route   PUT /api/dealers/:id
// @access  Private/Admin
const updateDealer = asyncHandler(async (req, res, next) => {
  console.log('Updating dealer with ID:', req.params.id);
  console.log('Update data:', req.body);
  console.log('Files:', req.files);

  // Find dealer by ID
  let dealer = await Dealer.findById(req.params.id);

  if (!dealer) {
    return next(new ErrorResponse(`Dealer not found with id ${req.params.id}`, 404));
  }

  try {
    // Update basic fields
    if (req.body.businessName) {
      dealer.businessName = req.body.businessName;
    }

    if (req.body.businessType) {
      dealer.businessType = req.body.businessType;
    }

    if (req.body.status) {
      dealer.status = req.body.status;
    }

    // Parse JSON strings from form data
    if (req.body.contact) {
      try {
        dealer.contact = JSON.parse(req.body.contact);
      } catch (e) {
        console.error('Error parsing contact JSON:', e);
        return next(new ErrorResponse('Invalid contact data format', 400));
      }
    }

    if (req.body.location) {
      try {
        dealer.location = JSON.parse(req.body.location);
      } catch (e) {
        console.error('Error parsing location JSON:', e);
        return next(new ErrorResponse('Invalid location data format', 400));
      }
    }

    if (req.body.subscription) {
      try {
        const subscriptionData = JSON.parse(req.body.subscription);
        if (subscriptionData.plan) {
          subscriptionData.tier = subscriptionData.plan;
          delete subscriptionData.plan;
        }
        dealer.subscription = subscriptionData;
      } catch (e) {
        console.error('Error parsing subscription JSON:', e);
        return next(new ErrorResponse('Invalid subscription data format', 400));
      }
    }

    // Update profile
    if (req.body.profile) {
      try {
        const profileData = JSON.parse(req.body.profile);
        dealer.profile = {
          ...dealer.profile,
          ...profileData
        };
      } catch (e) {
        console.error('Error parsing profile JSON:', e);
        return next(new ErrorResponse('Invalid profile data format', 400));
      }
    }

    // Handle file uploads
    if (req.files) {
      const logoFile = req.files.find(file => file.fieldname === 'logo');
      const bannerFile = req.files.find(file => file.fieldname === 'banner');

      if (logoFile) {
        try {
          // Delete old logo
          if (dealer.profile.logo && !dealer.profile.logo.includes('placeholder')) {
            await deleteImage(dealer.profile.logo);
          }
          
          const result = await uploadImage(logoFile, 'dealers');
          console.log('Logo upload result:', result);
          dealer.profile.logo = result.url;
        } catch (error) {
          console.error('Error uploading logo:', error);
        }
      }

      if (bannerFile) {
        try {
          // Delete old banner
          if (dealer.profile.banner && !dealer.profile.banner.includes('placeholder')) {
            await deleteImage(dealer.profile.banner);
          }
          
          const result = await uploadImage(bannerFile, 'dealers');
          console.log('Banner upload result:', result);
          dealer.profile.banner = result.url;
        } catch (error) {
          console.error('Error uploading banner:', error);
        }
      }
    }

    // Save the updated dealer
    const updatedDealer = await dealer.save();

    // Return success response
    res.status(200).json({
      success: true,
      data: updatedDealer
    });
  } catch (error) {
    console.error('Error updating dealer:', error);
    return next(new ErrorResponse(`Failed to update dealer: ${error.message}`, 500));
  }
});

// @desc    Delete dealer profile
// @route   DELETE /api/dealers/:id
// @access  Private/Admin
// @desc    Delete dealer profile
// @route   DELETE /api/dealers/:id
// @access  Private/Admin
const deleteDealer = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Find the dealer first to get access to its data
    const dealer = await Dealer.findById(id);
    
    if (!dealer) {
      return next(new ErrorResponse(`Dealer not found with id ${id}`, 404));
    }
    
    console.log(`Deleting dealer ${dealer.businessName} (${id})`);
    
    // 1. Delete all listings associated with this dealer first
    console.log(`Deleting listings for dealer: ${id}`);
    const deleteListingsResult = await Listing.deleteMany({ dealerId: id });
    console.log(`Deleted ${deleteListingsResult.deletedCount} listings`);
    
    // 2. Delete dealer's profile images if they exist
    if (dealer.profile) {
      if (dealer.profile.logo && !dealer.profile.logo.includes('placeholder')) {
        try {
          await deleteImage(dealer.profile.logo);
          console.log('Deleted dealer logo from S3');
        } catch (error) {
          console.warn('Error deleting dealer logo:', error);
        }
      }
      if (dealer.profile.banner && !dealer.profile.banner.includes('placeholder')) {
        try {
          await deleteImage(dealer.profile.banner);
          console.log('Deleted dealer banner from S3');
        } catch (error) {
          console.warn('Error deleting dealer banner:', error);
        }
      }
    }
    
    // 3. If dealer has an associated user, ONLY remove dealership reference WITHOUT changing role
    if (dealer.user) {
      // FIXED: Only remove the dealership reference, don't change the role
      await User.findByIdAndUpdate(
        dealer.user,
        { $unset: { dealership: 1 } }  // Removed "role: 'user'" to preserve existing role
      );
      console.log(`Updated user ${dealer.user} to remove dealership reference while preserving role`);
    }
    
    // 4. Delete the dealer
    await Dealer.findByIdAndDelete(id);
    
    res.status(200).json({
      success: true,
      message: 'Dealer and all associated listings deleted successfully'
    });
  } catch (error) {
    console.error(`Error deleting dealer with ID ${req.params.id}:`, error);
    return next(new ErrorResponse('Failed to delete dealer', 500));
  }
});

// @desc    Update dealer subscription
// @route   PUT /api/dealers/:id/subscription
// @access  Private/Admin
const updateSubscription = asyncHandler(async (req, res, next) => {
  let dealer = await Dealer.findById(req.params.id);

  if (!dealer) {
    return next(new ErrorResponse(`Dealer not found with id ${req.params.id}`, 404));
  }

  // Update subscription
  dealer.subscription = {
    ...dealer.subscription,
    ...req.body
  };

  const updatedDealer = await dealer.save();

  res.status(200).json({
    success: true,
    data: updatedDealer
  });
});

// @desc    Verify dealer
// @route   PUT /api/dealers/:id/verify
// @access  Private/Admin
const verifyDealer = asyncHandler(async (req, res, next) => {
  let dealer = await Dealer.findById(req.params.id);

  if (!dealer) {
    return next(new ErrorResponse(`Dealer not found with id ${req.params.id}`, 404));
  }

  // Update verification status
  dealer.verification = {
    status: 'verified',
    verifiedAt: new Date()
  };

  const updatedDealer = await dealer.save();

  res.status(200).json({
    success: true,
    data: updatedDealer
  });
});

// @desc    Get dealer listings
// @route   GET /api/dealers/:id/listings
// @access  Public
export const getDealerListings = asyncHandler(async (req, res, next) => {
  try {
    const dealerId = req.params.id;
    
    if (!dealerId) {
      return res.status(400).json({
        success: false,
        message: 'Dealer ID is required'
      });
    }

    console.log(`Looking up listings for dealer: ${dealerId}`);
    
    // Find all listings for this dealer
    let query = {};
    
    // Try different ID formats for flexibility
    if (mongoose.Types.ObjectId.isValid(dealerId)) {
      query.dealerId = dealerId;
    } else {
      // Use string comparison if not a valid ObjectId
      query = { 
        $or: [
          { dealerId: dealerId.toString() },
          { 'dealer.id': dealerId.toString() }
        ]
      };
    }
    
    console.log(`Searching for listings with query:`, JSON.stringify(query));
    
    // Get pagination parameters
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    
    // For public requests, only show active listings
    if (!req.user || req.user.role !== 'admin') {
      query.status = 'active';
    }
    
    // Count total matching documents for pagination
    const total = await Listing.countDocuments(query);
    
    // Execute query with pagination
    const listings = await Listing.find(query)
      .skip(startIndex)
      .limit(limit)
      .sort('-createdAt');
    
    console.log(`Found ${listings.length} listings for dealer ${dealerId}`);
    
    // Return response with pagination info
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

// Export all controller functions
export {
  getAllDealers,
  getDealers,
  getDealer,
  createDealer,
  updateDealer,
  deleteDealer,
  updateSubscription,
  verifyDealer,
};