// server/controllers/userProfileController.js
import User from '../models/User.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import asyncHandler from '../middleware/async.js';
import { uploadImage, deleteImage } from '../utils/imageUpload.js';
import QRCode from 'qrcode';
import crypto from 'crypto';

// @desc    Get user's complete profile
// @route   GET /api/user/profile
// @access  Private
export const getUserProfile = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id)
    .select('-password -security.twoFactorSecret -security.recoveryTokens')
    .populate('favorites', 'title images.main price location')
    .populate('reviews.given.providerId', 'businessName')
    .populate('reviews.received.fromUserId', 'name avatar');

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Calculate profile completeness
  user.calculateProfileCompleteness();
  await user.save();

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Update user's basic profile
// @route   PUT /api/user/profile/basic
// @access  Private
export const updateBasicProfile = asyncHandler(async (req, res, next) => {
  const allowedFields = [
    'name', 'profile.firstName', 'profile.lastName', 'profile.phone',
    'profile.dateOfBirth', 'profile.gender', 'profile.nationality',
    'profile.bio', 'profile.website', 'profile.language', 'profile.currency'
  ];

  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Handle nested profile updates
  const updateData = {};
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

  // Handle avatar upload
  if (req.file) {
    try {
      // Delete old avatar
      if (user.avatar && user.avatar.key) {
        await deleteImage(user.avatar.key);
      }

      // Upload new avatar
      const result = await uploadImage(req.file, 'avatars');
      updateData.avatar = {
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

  // Merge profile updates
  if (updateData.profile && user.profile) {
    Object.assign(user.profile, updateData.profile);
    delete updateData.profile;
  }

  Object.assign(user, updateData);
  
  // Update last active timestamp
  user.activity.lastActiveAt = new Date();
  
  await user.save();

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully',
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      profile: user.profile,
      profileCompleteness: user.activity.profileCompleteness
    }
  });
});

// @desc    Update user's address
// @route   PUT /api/user/profile/address
// @access  Private
export const updateUserAddress = asyncHandler(async (req, res, next) => {
  const { street, city, state, postalCode, country } = req.body;

  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  if (!user.profile) user.profile = {};
  if (!user.profile.address) user.profile.address = {};

  Object.assign(user.profile.address, {
    street: street || user.profile.address.street,
    city: city || user.profile.address.city,
    state: state || user.profile.address.state,
    postalCode: postalCode || user.profile.address.postalCode,
    country: country || user.profile.address.country || 'Botswana'
  });

  await user.save();

  res.status(200).json({
    success: true,
    message: 'Address updated successfully',
    data: user.profile.address
  });
});

// @desc    Update notification preferences
// @route   PUT /api/user/profile/notifications
// @access  Private
export const updateNotificationPreferences = asyncHandler(async (req, res, next) => {
  const { email, sms, push, marketing } = req.body;

  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  if (!user.profile) user.profile = {};
  if (!user.profile.notifications) user.profile.notifications = {};

  Object.assign(user.profile.notifications, {
    email: email !== undefined ? email : user.profile.notifications.email,
    sms: sms !== undefined ? sms : user.profile.notifications.sms,
    push: push !== undefined ? push : user.profile.notifications.push,
    marketing: marketing !== undefined ? marketing : user.profile.notifications.marketing
  });

  await user.save();

  res.status(200).json({
    success: true,
    message: 'Notification preferences updated',
    data: user.profile.notifications
  });
});

// @desc    Add a new service to user's business profile
// @route   POST /api/user/profile/services
// @access  Private
export const addUserService = asyncHandler(async (req, res, next) => {
  const {
    serviceType,
    serviceName,
    description,
    location,
    operatingHours,
    contactInfo
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

  // Check if user already has this service type
  const existingService = user.businessProfile.services.find(
    service => service.serviceType === serviceType
  );

  if (existingService) {
    return next(new ErrorResponse('You already have this service type registered', 400));
  }

  // Generate unique service code for QR
  const serviceCode = `${serviceType.toUpperCase()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

  // Create new service
  const newService = {
    serviceType,
    serviceName,
    description,
    location: location || {},
    operatingHours: operatingHours || {},
    contactInfo: contactInfo || {},
    isActive: false, // Needs verification first
    isVerified: false,
    verificationStatus: 'pending',
    qrCode: {
      code: serviceCode,
      isActive: false, // Will be activated after verification
      generatedAt: new Date()
    },
    createdAt: new Date()
  };

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

// @desc    Upload verification documents for a service
// @route   POST /api/user/profile/services/:serviceId/verify
// @access  Private
export const uploadServiceVerification = asyncHandler(async (req, res, next) => {
  const { serviceId } = req.params;
  const { documentType } = req.body;

  if (!req.file) {
    return next(new ErrorResponse('Please upload a verification document', 400));
  }

  if (!documentType) {
    return next(new ErrorResponse('Document type is required', 400));
  }

  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const service = user.businessProfile?.services?.id(serviceId);
  if (!service) {
    return next(new ErrorResponse('Service not found', 404));
  }

  try {
    // Upload document to S3
    const result = await uploadImage(req.file, `verification/${user._id}/${serviceId}`);

    // Add document to service
    service.verificationDocuments.push({
      type: documentType,
      url: result.url,
      key: result.key,
      uploadedAt: new Date(),
      status: 'pending'
    });

    // Update service status
    service.verificationStatus = 'pending';

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Verification document uploaded successfully. It will be reviewed within 24-48 hours.',
      data: {
        serviceId: service._id,
        documentType,
        status: 'pending'
      }
    });

  } catch (error) {
    console.error('Document upload error:', error);
    return next(new ErrorResponse('Failed to upload verification document', 500));
  }
});

// @desc    Get user's services
// @route   GET /api/user/profile/services
// @access  Private
export const getUserServices = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const services = user.businessProfile?.services || [];

  res.status(200).json({
    success: true,
    count: services.length,
    data: services,
    overallStatus: user.businessProfile?.overallVerificationStatus || 'unverified'
  });
});

// @desc    Generate QR code for verified service
// @route   POST /api/user/profile/services/:serviceId/qr-code
// @access  Private
export const generateServiceQRCode = asyncHandler(async (req, res, next) => {
  const { serviceId } = req.params;

  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const service = user.businessProfile?.services?.id(serviceId);
  if (!service) {
    return next(new ErrorResponse('Service not found', 404));
  }

  if (!service.isVerified) {
    return next(new ErrorResponse('Service must be verified before generating QR code', 400));
  }

  try {
    // Create QR code data
    const qrData = `${service.serviceType}|${service._id}|${user._id}|${service.serviceName}`;
    
    // Generate QR code image
    const qrCodeUrl = await QRCode.toDataURL(qrData, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    // Update service with QR code
    service.qrCode.url = qrCodeUrl;
    service.qrCode.isActive = true;
    service.qrCode.generatedAt = new Date();

    await user.save();

    res.status(200).json({
      success: true,
      message: 'QR code generated successfully',
      data: {
        serviceId: service._id,
        serviceName: service.serviceName,
        qrCode: service.qrCode,
        instructions: 'Display this QR code at your service location for customers to scan and leave reviews'
      }
    });

  } catch (error) {
    console.error('QR code generation error:', error);
    return next(new ErrorResponse('Failed to generate QR code', 500));
  }
});

// @desc    Get user's favorites with detailed info
// @route   GET /api/user/profile/favorites
// @access  Private
export const getUserFavorites = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id)
    .populate({
      path: 'favorites',
      select: 'title description images price location dealer createdAt',
      populate: {
        path: 'dealer',
        select: 'businessName location contact verification'
      }
    });

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  res.status(200).json({
    success: true,
    count: user.favorites.length,
    data: user.favorites
  });
});

// @desc    Get user's review history
// @route   GET /api/user/profile/reviews
// @access  Private
export const getUserReviews = asyncHandler(async (req, res, next) => {
  const { type = 'all' } = req.query; // 'given', 'received', 'all'

  const user = await User.findById(req.user.id)
    .populate('reviews.given.providerId', 'businessName profile.logo')
    .populate('reviews.received.fromUserId', 'name avatar');

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  let reviewData = {};

  if (type === 'given' || type === 'all') {
    reviewData.given = user.reviews.given || [];
  }

  if (type === 'received' || type === 'all') {
    reviewData.received = user.reviews.received || [];
  }

  if (type === 'all') {
    reviewData.stats = user.reviews.stats || {};
  }

  res.status(200).json({
    success: true,
    data: reviewData
  });
});

// @desc    Update user's activity (for point tracking)
// @route   POST /api/user/profile/activity
// @access  Private
export const updateUserActivity = asyncHandler(async (req, res, next) => {
  const { action, points, metadata } = req.body;

  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Add points if provided
  if (points && points > 0) {
    user.addPoints(points, action);
  }

  // Update last active time
  user.activity.lastActiveAt = new Date();

  // Track specific actions
  switch (action) {
    case 'login':
      user.activity.loginCount = (user.activity.loginCount || 0) + 1;
      break;
    case 'review_given':
      // Points are handled in the review creation process
      break;
    case 'profile_updated':
      user.calculateProfileCompleteness();
      break;
  }

  await user.save();

  res.status(200).json({
    success: true,
    data: {
      points: user.activity.points,
      achievements: user.activity.achievements,
      profileCompleteness: user.activity.profileCompleteness
    }
  });
});

// @desc    Get user's QR codes for all verified services
// @route   GET /api/user/profile/qr-codes
// @access  Private
export const getUserQRCodes = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const qrCodes = user.getServiceQRCodes();

  res.status(200).json({
    success: true,
    count: qrCodes.length,
    data: qrCodes
  });
});

// @desc    Delete user service
// @route   DELETE /api/user/profile/services/:serviceId
// @access  Private
export const deleteUserService = asyncHandler(async (req, res, next) => {
  const { serviceId } = req.params;

  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const serviceIndex = user.businessProfile?.services?.findIndex(
    service => service._id.toString() === serviceId
  );

  if (serviceIndex === -1) {
    return next(new ErrorResponse('Service not found', 404));
  }

  const service = user.businessProfile.services[serviceIndex];

  // Delete verification documents from S3
  if (service.verificationDocuments?.length > 0) {
    for (const doc of service.verificationDocuments) {
      if (doc.key) {
        try {
          await deleteImage(doc.key);
        } catch (error) {
          console.error('Error deleting verification document:', error);
        }
      }
    }
  }

  // Remove service from array
  user.businessProfile.services.splice(serviceIndex, 1);

  // Update overall verification status if no services left
  if (user.businessProfile.services.length === 0) {
    user.businessProfile.overallVerificationStatus = 'unverified';
    user.businessProfile.verificationLevel = 'none';
  }

  await user.save();

  res.status(200).json({
    success: true,
    message: 'Service deleted successfully'
  });
});

// @desc    Update service information
// @route   PUT /api/user/profile/services/:serviceId
// @access  Private
export const updateUserService = asyncHandler(async (req, res, next) => {
  const { serviceId } = req.params;
  const updateData = req.body;

  const user = await User.findById(req.user.id);
  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const service = user.businessProfile?.services?.id(serviceId);
  if (!service) {
    return next(new ErrorResponse('Service not found', 404));
  }

  // Allowed fields for update
  const allowedFields = [
    'serviceName', 'description', 'location', 'operatingHours', 'contactInfo'
  ];

  // Update only allowed fields
  allowedFields.forEach(field => {
    if (updateData[field] !== undefined) {
      service[field] = updateData[field];
    }
  });

  await user.save();

  res.status(200).json({
    success: true,
    message: 'Service updated successfully',
    data: service
  });
});
