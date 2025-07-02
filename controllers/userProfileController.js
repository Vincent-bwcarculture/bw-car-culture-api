// server/controllers/userProfileController.js - Enhanced Version
import User from '../models/User.js';
import Vehicle from '../models/Vehicle.js';
import UserRoute from '../models/UserRoute.js';
import ServiceProvider from '../models/ServiceProvider.js';
import Listing from '../models/Listing.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import asyncHandler from '../middleware/async.js';
import { uploadImage, deleteImage } from '../utils/imageUpload.js';
import QRCode from 'qrcode';
import crypto from 'crypto';

// @desc    Get user's complete profile with all related data
// @route   GET /api/user/profile
// @access  Private
export const getUserProfile = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id)
    .select('-password -security.twoFactorSecret -security.recoveryTokens')
    .populate('favorites', 'title images.main price location')
    .populate('dealership', 'businessName status subscription')
    .lean();

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Get user's vehicles
  const vehicles = await Vehicle.find({ 
    ownerId: req.user.id, 
    isDeleted: false 
  }).select('make model year condition forSale').lean();

  // Get user's routes (if transport provider)
  const routes = await UserRoute.find({ 
    ownerId: req.user.id, 
    isActive: true 
  }).select('routeName serviceType operationalStatus analytics').lean();

  // Get linked service providers
  const serviceProviders = await ServiceProvider.find({
    'contact.email': user.email
  }).select('businessName providerType status verification').lean();

  // Calculate profile completeness
  let completeness = 0;
  const fields = [
    user.name, user.email, user.avatar, 
    user.profile?.phone, user.profile?.bio, user.profile?.address?.city
  ];
  fields.forEach(field => {
    if (field) completeness += 16.67;
  });

  // Add business profile completeness if exists
  if (user.businessProfile?.services?.length > 0) {
    if (user.businessProfile.services.some(s => s.isVerified)) completeness += 10;
  }

  const profileData = {
    ...user,
    vehicles,
    routes,
    serviceProviders,
    profileCompleteness: Math.round(completeness),
    stats: {
      totalVehicles: vehicles.length,
      totalRoutes: routes.length,
      verifiedServices: user.businessProfile?.services?.filter(s => s.isVerified).length || 0,
      activeDealership: !!user.dealership?.status === 'active'
    }
  };

  res.status(200).json({
    success: true,
    data: profileData
  });
});

// @desc    Update user's basic profile
// @route   PUT /api/user/profile/basic
// @access  Private
export const updateBasicProfile = asyncHandler(async (req, res, next) => {
  const allowedFields = [
    'name', 'profile.firstName', 'profile.lastName', 'profile.phone',
    'profile.dateOfBirth', 'profile.gender', 'profile.nationality',
    'profile.bio', 'profile.website', 'profile.language', 'profile.currency',
    'profile.timezone'
  ];

  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Handle avatar upload if file is provided
  let avatarData = user.avatar;
  if (req.file) {
    try {
      // Delete old avatar if exists
      if (user.avatar?.key) {
        await deleteImage(user.avatar.key);
      }
      
      const result = await uploadImage(req.file, 'avatars');
      avatarData = {
        url: result.url,
        key: result.key,
        size: result.size,
        mimetype: result.mimetype
      };
    } catch (error) {
      console.error('Avatar upload error:', error);
      return next(new ErrorResponse('Failed to upload avatar', 500));
    }
  }

  // Process nested profile updates
  const updateData = { avatar: avatarData };
  Object.keys(req.body).forEach(key => {
    if (allowedFields.includes(key)) {
      if (key.startsWith('profile.')) {
        const profileField = key.split('.')[1];
        if (!updateData.profile) updateData.profile = {};
        updateData.profile[profileField] = req.body[key];
      } else {
        updateData[key] = req.body[key];
      }
    }
  });

  const updatedUser = await User.findByIdAndUpdate(
    req.user.id,
    { $set: updateData },
    { new: true, runValidators: true }
  ).select('-password');

  res.status(200).json({
    success: true,
    data: updatedUser
  });
});

// @desc    Update user address
// @route   PUT /api/user/profile/address
// @access  Private
export const updateUserAddress = asyncHandler(async (req, res, next) => {
  const { street, city, state, country, postalCode } = req.body;

  const user = await User.findByIdAndUpdate(
    req.user.id,
    {
      $set: {
        'profile.address': {
          street: street?.trim(),
          city: city?.trim(),
          state: state?.trim(),
          country: country?.trim() || 'Botswana',
          postalCode: postalCode?.trim()
        }
      }
    },
    { new: true, runValidators: true }
  ).select('-password');

  res.status(200).json({
    success: true,
    data: user.profile.address
  });
});

// @desc    Update notification preferences
// @route   PUT /api/user/profile/notifications
// @access  Private
export const updateNotificationPreferences = asyncHandler(async (req, res, next) => {
  const { 
    email, sms, push, marketing, serviceReminders, 
    listingUpdates, priceAlerts, newsUpdates 
  } = req.body;

  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  user.profile.notifications = {
    email: email !== undefined ? email : user.profile.notifications?.email !== false,
    sms: sms !== undefined ? sms : user.profile.notifications?.sms !== false,
    push: push !== undefined ? push : user.profile.notifications?.push !== false,
    marketing: marketing !== undefined ? marketing : user.profile.notifications?.marketing !== false,
    serviceReminders: serviceReminders !== undefined ? serviceReminders : user.profile.notifications?.serviceReminders !== false,
    listingUpdates: listingUpdates !== undefined ? listingUpdates : user.profile.notifications?.listingUpdates !== false,
    priceAlerts: priceAlerts !== undefined ? priceAlerts : user.profile.notifications?.priceAlerts !== false,
    newsUpdates: newsUpdates !== undefined ? newsUpdates : user.profile.notifications?.newsUpdates !== false
  };

  await user.save();

  res.status(200).json({
    success: true,
    message: 'Notification preferences updated',
    data: user.profile.notifications
  });
});

// @desc    Update privacy settings
// @route   PUT /api/user/profile/privacy
// @access  Private
export const updatePrivacySettings = asyncHandler(async (req, res, next) => {
  const { 
    profileVisibility, showEmail, showPhone, allowMessages, 
    dataSharing, locationTracking 
  } = req.body;

  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  user.profile.privacy = {
    profileVisibility: profileVisibility || user.profile.privacy?.profileVisibility || 'public',
    showEmail: showEmail !== undefined ? showEmail : user.profile.privacy?.showEmail !== false,
    showPhone: showPhone !== undefined ? showPhone : user.profile.privacy?.showPhone !== false,
    allowMessages: allowMessages !== undefined ? allowMessages : user.profile.privacy?.allowMessages !== false,
    dataSharing: dataSharing !== undefined ? dataSharing : user.profile.privacy?.dataSharing !== false,
    locationTracking: locationTracking !== undefined ? locationTracking : user.profile.privacy?.locationTracking !== false
  };

  await user.save();

  res.status(200).json({
    success: true,
    message: 'Privacy settings updated',
    data: user.profile.privacy
  });
});

// @desc    Update password
// @route   PUT /api/user/profile/password
// @access  Private
export const updatePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return next(new ErrorResponse('Current password and new password are required', 400));
  }

  const user = await User.findById(req.user.id).select('+password');

  // Check current password
  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) {
    return next(new ErrorResponse('Current password is incorrect', 401));
  }

  // Update password
  user.password = newPassword;
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Password updated successfully'
  });
});

// @desc    Add a new service to user's business profile
// @route   POST /api/user/profile/services
// @access  Private
export const addUserService = asyncHandler(async (req, res, next) => {
  const {
    serviceType, businessType, serviceName, description, location,
    operatingHours, contactInfo, routeCount, fleetSize, operationType,
    specializations, certifications
  } = req.body;

  // Validate required fields
  if (!serviceType || !serviceName || !description) {
    return next(new ErrorResponse('Service type, name, and description are required', 400));
  }

  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Initialize business profile if not exists
  if (!user.businessProfile) {
    user.businessProfile = {
      services: [],
      overallVerificationStatus: 'unverified',
      verificationLevel: 'none'
    };
  }

  // Check if user already has this service type with same business type
  const existingService = user.businessProfile.services.find(
    service => service.serviceType === serviceType && service.businessType === businessType
  );

  if (existingService) {
    return next(new ErrorResponse('You already have this service type registered', 400));
  }

  // Generate unique service code for QR
  const serviceCode = `${serviceType.toUpperCase()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  // Create new service
  const newService = {
    serviceType,
    businessType: businessType || 'independent',
    serviceName: serviceName.trim(),
    description: description.trim(),
    location: location || {},
    operatingHours: operatingHours || {},
    contactInfo: {
      phone: contactInfo?.phone || user.profile?.phone || '',
      email: contactInfo?.email || user.email,
      whatsapp: contactInfo?.whatsapp || '',
      website: contactInfo?.website || ''
    },
    isActive: false, // Needs verification first
    isVerified: false,
    verificationStatus: 'pending',
    qrCode: {
      code: serviceCode,
      isActive: false,
      generatedAt: new Date()
    },
    createdAt: new Date()
  };

  // Add transport-specific fields
  if (serviceType === 'public_transport') {
    newService.routeCount = routeCount || 1;
    newService.fleetSize = fleetSize || 1;
    newService.operationType = operationType || 'on_demand';
  }

  // Add workshop-specific fields
  if (serviceType === 'workshop') {
    newService.specializations = specializations || [];
    newService.certifications = certifications || [];
  }

  user.businessProfile.services.push(newService);
  
  // Update overall status
  if (user.businessProfile.overallVerificationStatus === 'unverified') {
    user.businessProfile.overallVerificationStatus = 'pending';
  }

  await user.save();

  res.status(201).json({
    success: true,
    message: 'Service added successfully. Please upload verification documents to activate it.',
    data: newService
  });
});

// @desc    Update user service
// @route   PUT /api/user/profile/services/:serviceId
// @access  Private
export const updateUserService = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const service = user.businessProfile?.services?.id(req.params.serviceId);
  if (!service) {
    return next(new ErrorResponse('Service not found', 404));
  }

  // Update allowed fields
  const allowedFields = [
    'serviceName', 'description', 'location', 'operatingHours', 
    'contactInfo', 'routeCount', 'fleetSize', 'operationType',
    'specializations', 'certifications'
  ];

  allowedFields.forEach(field => {
    if (req.body[field] !== undefined) {
      service[field] = req.body[field];
    }
  });

  await user.save();

  res.status(200).json({
    success: true,
    data: service
  });
});

// @desc    Delete user service
// @route   DELETE /api/user/profile/services/:serviceId
// @access  Private
export const deleteUserService = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const serviceIndex = user.businessProfile?.services?.findIndex(
    service => service._id.toString() === req.params.serviceId
  );

  if (serviceIndex === -1) {
    return next(new ErrorResponse('Service not found', 404));
  }

  user.businessProfile.services.splice(serviceIndex, 1);

  // Update overall status if no services left
  if (user.businessProfile.services.length === 0) {
    user.businessProfile.overallVerificationStatus = 'unverified';
    user.businessProfile.verificationLevel = 'none';
  }

  await user.save();

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Upload service verification documents
// @route   POST /api/user/profile/services/:serviceId/verify
// @access  Private
export const uploadServiceVerification = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const service = user.businessProfile?.services?.id(req.params.serviceId);
  if (!service) {
    return next(new ErrorResponse('Service not found', 404));
  }

  if (!req.file) {
    return next(new ErrorResponse('Please select a document to upload', 400));
  }

  try {
    const result = await uploadImage(req.file, 'verifications');
    
    service.verificationDocuments = service.verificationDocuments || [];
    service.verificationDocuments.push({
      url: result.url,
      key: result.key,
      filename: req.file.originalname,
      uploadedAt: new Date()
    });

    service.verificationStatus = 'under_review';
    
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Verification document uploaded successfully',
      data: service.verificationDocuments[service.verificationDocuments.length - 1]
    });
  } catch (error) {
    return next(new ErrorResponse('Failed to upload verification document', 500));
  }
});

// @desc    Generate QR code for verified service
// @route   POST /api/user/profile/services/:serviceId/qr-code
// @access  Private
export const generateServiceQRCode = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const service = user.businessProfile?.services?.id(req.params.serviceId);
  if (!service) {
    return next(new ErrorResponse('Service not found', 404));
  }

  if (!service.isVerified) {
    return next(new ErrorResponse('Service must be verified to generate QR code', 400));
  }

  try {
    const qrData = {
      serviceId: service._id,
      serviceName: service.serviceName,
      serviceType: service.serviceType,
      businessType: service.businessType,
      contactPhone: service.contactInfo.phone,
      verificationCode: service.qrCode.code
    };

    const qrCodeUrl = await QRCode.toDataURL(JSON.stringify(qrData), {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    service.qrCode.url = qrCodeUrl;
    service.qrCode.isActive = true;
    service.qrCode.generatedAt = new Date();

    await user.save();

    res.status(200).json({
      success: true,
      data: {
        qrCodeUrl,
        qrData: service.qrCode
      }
    });
  } catch (error) {
    return next(new ErrorResponse('Failed to generate QR code', 500));
  }
});

// @desc    Get user's business dashboard data
// @route   GET /api/user/profile/business-dashboard
// @access  Private
export const getBusinessDashboardData = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Check if user has business access
  const hasBusinessAccess = user.businessProfile?.services?.some(s => s.isVerified) || 
                           user.dealership || 
                           user.role === 'admin';

  if (!hasBusinessAccess) {
    return next(new ErrorResponse('No business access available', 403));
  }

  // Get analytics for verified services
  const verifiedServices = user.businessProfile?.services?.filter(s => s.isVerified) || [];
  
  // Get route analytics if transport provider
  const routeStats = await UserRoute.getAnalyticsSummary(req.user.id);
  
  // Get vehicle analytics
  const vehicleStats = await Vehicle.getOwnershipStats(req.user.id);
  
  // Get service provider analytics if linked
  const serviceProviderStats = await ServiceProvider.find({
    'contact.email': user.email
  }).select('analytics metrics').lean();

  // Get dealer analytics if applicable
  let dealerStats = null;
  if (user.dealership) {
    // This would need to be implemented based on your dealer model
    dealerStats = {
      totalListings: 0,
      revenue: 0
    };
  }

  // Get admin stats if admin
  let adminStats = null;
  if (user.role === 'admin') {
    const totalUsers = await User.countDocuments();
    const totalListings = await Listing.countDocuments();
    adminStats = { totalUsers, totalListings };
  }

  // Sample recent activity (would need proper activity tracking)
  const recentActivity = [
    {
      type: 'view',
      description: 'Your taxi service received a new inquiry',
      timeAgo: '2 hours ago'
    },
    {
      type: 'review',
      description: 'New 5-star review for your combi route',
      timeAgo: '1 day ago'
    }
  ];

  const dashboardData = {
    services: verifiedServices,
    analytics: {
      totalViews: (routeStats[0]?.totalViews || 0) + serviceProviderStats.reduce((sum, sp) => sum + (sp.analytics?.views || 0), 0),
      totalInquiries: (routeStats[0]?.totalBookings || 0) + serviceProviderStats.reduce((sum, sp) => sum + (sp.analytics?.inquiries || 0), 0),
      averageRating: routeStats[0]?.avgRating || 0,
      totalReviews: serviceProviderStats.reduce((sum, sp) => sum + (sp.analytics?.reviewCount || 0), 0),
      totalRevenue: 0 // Would need proper revenue tracking
    },
    routes: routeStats[0],
    vehicles: vehicleStats[0],
    dealer: dealerStats,
    admin: adminStats,
    recentActivity
  };

  res.status(200).json({
    success: true,
    data: dashboardData
  });
});

// @desc    Get user favorites
// @route   GET /api/user/profile/favorites
// @access  Private
export const getUserFavorites = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id)
    .populate('favorites', 'title images.main price location createdAt')
    .lean();

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  res.status(200).json({
    success: true,
    count: user.favorites?.length || 0,
    data: user.favorites || []
  });
});

// @desc    Get user reviews (given and received)
// @route   GET /api/user/profile/reviews
// @access  Private
export const getUserReviews = asyncHandler(async (req, res, next) => {
  // Get reviews given by user
  const routesWithReviews = await UserRoute.find({
    'reviews.userId': req.user.id
  }).select('routeName reviews').lean();

  const reviewsGiven = [];
  routesWithReviews.forEach(route => {
    const userReviews = route.reviews.filter(review => review.userId.toString() === req.user.id);
    userReviews.forEach(review => {
      reviewsGiven.push({
        ...review,
        routeName: route.routeName,
        routeId: route._id
      });
    });
  });

  // Get reviews received for user's routes
  const userRoutes = await UserRoute.find({
    ownerId: req.user.id
  }).populate('reviews.userId', 'name').lean();

  const reviewsReceived = [];
  userRoutes.forEach(route => {
    route.reviews.forEach(review => {
      reviewsReceived.push({
        ...review,
        routeName: route.routeName,
        routeId: route._id
      });
    });
  });

  res.status(200).json({
    success: true,
    data: {
      given: reviewsGiven,
      received: reviewsReceived,
      stats: {
        totalGiven: reviewsGiven.length,
        totalReceived: reviewsReceived.length,
        averageRatingGiven: reviewsGiven.length > 0 ? 
          reviewsGiven.reduce((sum, r) => sum + r.rating, 0) / reviewsGiven.length : 0,
        averageRatingReceived: reviewsReceived.length > 0 ? 
          reviewsReceived.reduce((sum, r) => sum + r.rating, 0) / reviewsReceived.length : 0
      }
    }
  });
});

// @desc    Delete user account
// @route   DELETE /api/user/profile/delete-account
// @access  Private
export const deleteUserAccount = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Soft delete related data
  await Vehicle.updateMany(
    { ownerId: req.user.id },
    { isDeleted: true, isActive: false }
  );

  await UserRoute.updateMany(
    { ownerId: req.user.id },
    { isActive: false, operationalStatus: 'suspended' }
  );

  // Delete user
  await user.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Account deleted successfully'
  });
});
