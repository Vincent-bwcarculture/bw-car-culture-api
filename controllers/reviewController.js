// server/controllers/reviewController.js
import User from '../models/User.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import asyncHandler from '../middleware/async.js';
import mongoose from 'mongoose';

// @desc    Submit a review via QR code scan
// @route   POST /api/reviews/qr-scan
// @access  Private
export const submitQRReview = asyncHandler(async (req, res, next) => {
  const {
    qrData,
    rating,
    review,
    isAnonymous = false,
    serviceExperience
  } = req.body;

  // Validate required fields
  if (!qrData || !rating || !review) {
    return next(new ErrorResponse('QR data, rating, and review text are required', 400));
  }

  if (rating < 1 || rating > 5) {
    return next(new ErrorResponse('Rating must be between 1 and 5', 400));
  }

  try {
    // Parse QR code data: serviceType|serviceId|providerId|serviceName
    const [serviceType, serviceId, providerId, serviceName] = qrData.split('|');
    
    if (!serviceType || !serviceId || !providerId) {
      return next(new ErrorResponse('Invalid QR code format', 400));
    }

    // Find the service provider
    const provider = await User.findById(providerId);
    if (!provider) {
      return next(new ErrorResponse('Service provider not found', 404));
    }

    // Find the specific service
    const service = provider.businessProfile?.services?.id(serviceId);
    if (!service) {
      return next(new ErrorResponse('Service not found', 404));
    }

    // Check if service is verified and active
    if (!service.isVerified || !service.isActive) {
      return next(new ErrorResponse('This service is not currently available for reviews', 400));
    }

    // Get the reviewer
    const reviewer = await User.findById(req.user.id);
    if (!reviewer) {
      return next(new ErrorResponse('Reviewer not found', 404));
    }

    // Check if user has already reviewed this service recently (within 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const existingReview = reviewer.reviews.given.find(r => 
      r.serviceId?.toString() === serviceId && 
      r.providerId?.toString() === providerId &&
      r.date > thirtyDaysAgo
    );

    if (existingReview) {
      return next(new ErrorResponse('You have already reviewed this service recently', 400));
    }

    // Create review for reviewer (given reviews)
    const newReviewGiven = {
      serviceId: new mongoose.Types.ObjectId(serviceId),
      serviceType: serviceType,
      providerId: new mongoose.Types.ObjectId(providerId),
      rating: rating,
      review: review,
      date: new Date(),
      isAnonymous: isAnonymous,
      verificationMethod: 'qr_code',
      serviceExperience: serviceExperience || {}
    };

    // Create review for provider (received reviews)
    const newReviewReceived = {
      fromUserId: isAnonymous ? null : new mongoose.Types.ObjectId(req.user.id),
      serviceId: new mongoose.Types.ObjectId(serviceId),
      rating: rating,
      review: review,
      date: new Date(),
      isPublic: true,
      verificationMethod: 'qr_code',
      serviceExperience: serviceExperience || {}
    };

    // Add reviews to both users
    reviewer.reviews.given.push(newReviewGiven);
    provider.reviews.received.push(newReviewReceived);

    // Update review statistics
    await updateReviewStats(reviewer, provider);

    // Add points to reviewer for leaving a review
    reviewer.addPoints(10, 'review_given');

    // Save both users
    await Promise.all([reviewer.save(), provider.save()]);

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully! You earned 10 points.',
      data: {
        review: newReviewGiven,
        pointsEarned: 10,
        totalPoints: reviewer.activity.points
      }
    });

  } catch (error) {
    console.error('QR Review submission error:', error);
    return next(new ErrorResponse('Failed to process QR code review', 500));
  }
});

// @desc    Submit a review via service code
// @route   POST /api/reviews/service-code
// @access  Private
export const submitServiceCodeReview = asyncHandler(async (req, res, next) => {
  const {
    serviceCode,
    rating,
    review,
    isAnonymous = false,
    serviceExperience
  } = req.body;

  if (!serviceCode || !rating || !review) {
    return next(new ErrorResponse('Service code, rating, and review are required', 400));
  }

  if (rating < 1 || rating > 5) {
    return next(new ErrorResponse('Rating must be between 1 and 5', 400));
  }

  try {
    // Find service by code
    const provider = await User.findOne({
      'businessProfile.services.qrCode.code': serviceCode,
      'businessProfile.services.isActive': true,
      'businessProfile.services.isVerified': true
    });

    if (!provider) {
      return next(new ErrorResponse('Invalid service code or service not available', 404));
    }

    const service = provider.businessProfile.services.find(s => 
      s.qrCode.code === serviceCode && s.isActive && s.isVerified
    );

    // Process similar to QR review
    const reviewer = await User.findById(req.user.id);
    
    // Check for recent reviews
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const existingReview = reviewer.reviews.given.find(r => 
      r.serviceId?.toString() === service._id.toString() && 
      r.providerId?.toString() === provider._id.toString() &&
      r.date > thirtyDaysAgo
    );

    if (existingReview) {
      return next(new ErrorResponse('You have already reviewed this service recently', 400));
    }

    // Create reviews
    const newReviewGiven = {
      serviceId: service._id,
      serviceType: service.serviceType,
      providerId: provider._id,
      rating: rating,
      review: review,
      date: new Date(),
      isAnonymous: isAnonymous,
      verificationMethod: 'service_code',
      serviceExperience: serviceExperience || {}
    };

    const newReviewReceived = {
      fromUserId: isAnonymous ? null : reviewer._id,
      serviceId: service._id,
      rating: rating,
      review: review,
      date: new Date(),
      isPublic: true,
      verificationMethod: 'service_code',
      serviceExperience: serviceExperience || {}
    };

    reviewer.reviews.given.push(newReviewGiven);
    provider.reviews.received.push(newReviewReceived);

    await updateReviewStats(reviewer, provider);
    reviewer.addPoints(10, 'review_given');

    await Promise.all([reviewer.save(), provider.save()]);

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully! You earned 10 points.',
      data: {
        review: newReviewGiven,
        pointsEarned: 10,
        totalPoints: reviewer.activity.points
      }
    });

  } catch (error) {
    console.error('Service code review error:', error);
    return next(new ErrorResponse('Failed to submit review', 500));
  }
});

// @desc    Submit a review via plate number (for transport services)
// @route   POST /api/reviews/plate-number
// @access  Private
export const submitPlateNumberReview = asyncHandler(async (req, res, next) => {
  const {
    plateNumber,
    serviceType,
    rating,
    review,
    isAnonymous = false,
    routeInfo
  } = req.body;

  if (!plateNumber || !rating || !review) {
    return next(new ErrorResponse('Plate number, rating, and review are required', 400));
  }

  // For plate number reviews, we need additional verification
  // This could integrate with a transport registry or operator database
  
  try {
    // Find transport services that match the criteria
    const providers = await User.find({
      'businessProfile.services.serviceType': 'public_transport',
      'businessProfile.services.isActive': true,
      'businessProfile.services.isVerified': true
    });

    // For MVP, we'll create a general transport review
    // In production, this would link to specific vehicle/route records
    
    const reviewer = await User.findById(req.user.id);
    
    // Create a general transport review
    const newReviewGiven = {
      serviceId: null, // No specific service ID for plate reviews
      serviceType: 'public_transport',
      providerId: null, // Will be determined by transport authority
      rating: rating,
      review: review,
      date: new Date(),
      isAnonymous: isAnonymous,
      verificationMethod: 'plate_number',
      plateNumber: plateNumber.toUpperCase(),
      routeInfo: routeInfo || {}
    };

    reviewer.reviews.given.push(newReviewGiven);
    reviewer.addPoints(5, 'transport_review'); // Lower points for unverified reviews

    await reviewer.save();

    res.status(201).json({
      success: true,
      message: 'Transport review submitted! You earned 5 points. Review will be processed by transport authorities.',
      data: {
        review: newReviewGiven,
        pointsEarned: 5,
        totalPoints: reviewer.activity.points
      }
    });

  } catch (error) {
    console.error('Plate number review error:', error);
    return next(new ErrorResponse('Failed to submit transport review', 500));
  }
});

// @desc    Get reviews for a specific service
// @route   GET /api/reviews/service/:serviceId
// @access  Public
export const getServiceReviews = asyncHandler(async (req, res, next) => {
  const { serviceId } = req.params;
  const { page = 1, limit = 10, sortBy = 'date' } = req.query;

  try {
    // Find the service provider
    const provider = await User.findOne({
      'businessProfile.services._id': serviceId
    }).populate('reviews.received.fromUserId', 'name avatar');

    if (!provider) {
      return next(new ErrorResponse('Service not found', 404));
    }

    const service = provider.businessProfile.services.id(serviceId);
    if (!service) {
      return next(new ErrorResponse('Service not found', 404));
    }

    // Filter reviews for this specific service
    let serviceReviews = provider.reviews.received.filter(review => 
      review.serviceId?.toString() === serviceId && review.isPublic
    );

    // Sort reviews
    serviceReviews.sort((a, b) => {
      if (sortBy === 'rating') {
        return b.rating - a.rating;
      } else if (sortBy === 'date') {
        return new Date(b.date) - new Date(a.date);
      }
      return 0;
    });

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedReviews = serviceReviews.slice(startIndex, endIndex);

    // Calculate review statistics
    const stats = {
      totalReviews: serviceReviews.length,
      averageRating: serviceReviews.length > 0 ? 
        serviceReviews.reduce((sum, r) => sum + r.rating, 0) / serviceReviews.length : 0,
      ratingDistribution: {
        5: serviceReviews.filter(r => r.rating === 5).length,
        4: serviceReviews.filter(r => r.rating === 4).length,
        3: serviceReviews.filter(r => r.rating === 3).length,
        2: serviceReviews.filter(r => r.rating === 2).length,
        1: serviceReviews.filter(r => r.rating === 1).length
      }
    };

    res.status(200).json({
      success: true,
      data: {
        service: {
          id: service._id,
          name: service.serviceName,
          type: service.serviceType
        },
        reviews: paginatedReviews,
        stats: stats,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(serviceReviews.length / limit),
          totalReviews: serviceReviews.length
        }
      }
    });

  } catch (error) {
    console.error('Get service reviews error:', error);
    return next(new ErrorResponse('Failed to fetch service reviews', 500));
  }
});

// @desc    Respond to a review (service provider only)
// @route   POST /api/reviews/:reviewId/respond
// @access  Private
export const respondToReview = asyncHandler(async (req, res, next) => {
  const { reviewId } = req.params;
  const { response } = req.body;

  if (!response || response.trim().length < 10) {
    return next(new ErrorResponse('Response must be at least 10 characters long', 400));
  }

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return next(new ErrorResponse('User not found', 404));
    }

    // Find the review in received reviews
    const review = user.reviews.received.id(reviewId);
    if (!review) {
      return next(new ErrorResponse('Review not found', 404));
    }

    // Check if already responded
    if (review.response && review.response.text) {
      return next(new ErrorResponse('You have already responded to this review', 400));
    }

    // Add response
    review.response = {
      text: response.trim(),
      date: new Date()
    };

    // Update response rate statistics
    await updateReviewStats(null, user);

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Response added successfully',
      data: {
        reviewId: review._id,
        response: review.response
      }
    });

  } catch (error) {
    console.error('Review response error:', error);
    return next(new ErrorResponse('Failed to respond to review', 500));
  }
});

// @desc    Validate QR code before review
// @route   POST /api/reviews/validate-qr
// @access  Private
export const validateQRCode = asyncHandler(async (req, res, next) => {
  const { qrData } = req.body;

  if (!qrData) {
    return next(new ErrorResponse('QR code data is required', 400));
  }

  try {
    // Parse QR code data
    const [serviceType, serviceId, providerId, serviceName] = qrData.split('|');
    
    if (!serviceType || !serviceId || !providerId) {
      return next(new ErrorResponse('Invalid QR code format', 400));
    }

    // Find and validate service
    const provider = await User.findById(providerId).select('businessProfile.services name');
    if (!provider) {
      return next(new ErrorResponse('Service provider not found', 404));
    }

    const service = provider.businessProfile?.services?.id(serviceId);
    if (!service) {
      return next(new ErrorResponse('Service not found', 404));
    }

    if (!service.isVerified || !service.isActive) {
      return next(new ErrorResponse('Service is not available for reviews', 400));
    }

    // Check if user has recently reviewed this service
    const reviewer = await User.findById(req.user.id);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const hasRecentReview = reviewer.reviews.given.some(r => 
      r.serviceId?.toString() === serviceId && 
      r.providerId?.toString() === providerId &&
      r.date > thirtyDaysAgo
    );

    res.status(200).json({
      success: true,
      data: {
        valid: true,
        service: {
          id: service._id,
          name: service.serviceName,
          type: service.serviceType,
          provider: provider.name,
          hasRecentReview: hasRecentReview
        }
      }
    });

  } catch (error) {
    console.error('QR validation error:', error);
    return next(new ErrorResponse('Failed to validate QR code', 500));
  }
});

// Helper function to update review statistics
async function updateReviewStats(reviewer, provider) {
  try {
    // Update reviewer stats
    if (reviewer) {
      const givenReviews = reviewer.reviews.given || [];
      reviewer.reviews.stats.totalGiven = givenReviews.length;
      
      if (givenReviews.length > 0) {
        reviewer.reviews.stats.averageRatingGiven = 
          givenReviews.reduce((sum, r) => sum + r.rating, 0) / givenReviews.length;
      }
    }

    // Update provider stats
    if (provider) {
      const receivedReviews = provider.reviews.received || [];
      provider.reviews.stats.totalReceived = receivedReviews.length;
      
      if (receivedReviews.length > 0) {
        provider.reviews.stats.averageRatingReceived = 
          receivedReviews.reduce((sum, r) => sum + r.rating, 0) / receivedReviews.length;
        
        const reviewsWithResponses = receivedReviews.filter(r => r.response && r.response.text);
        provider.reviews.stats.responseRate = 
          (reviewsWithResponses.length / receivedReviews.length) * 100;
      }
    }
  } catch (error) {
    console.error('Error updating review stats:', error);
  }
}

// Add this function to your existing server/controllers/reviewController.js file

// @desc    Submit a general review directly from business profile
// @route   POST /api/reviews/general
// @access  Private
export const submitGeneralReview = asyncHandler(async (req, res, next) => {
  const {
    businessId,
    rating,
    review,
    isAnonymous = false,
    serviceExperience
  } = req.body;

  // Validation
  if (!businessId || !rating || !review) {
    return next(new ErrorResponse('Business ID, rating, and review are required', 400));
  }

  if (rating < 1 || rating > 5) {
    return next(new ErrorResponse('Rating must be between 1 and 5', 400));
  }

  if (review.trim().length < 20) {
    return next(new ErrorResponse('Review must be at least 20 characters long', 400));
  }

  try {
    // Find the business being reviewed
    const business = await User.findById(businessId);
    if (!business) {
      return next(new ErrorResponse('Business not found', 404));
    }

    // Check if the business has an active business profile
    if (!business.businessProfile || !business.businessProfile.isActive) {
      return next(new ErrorResponse('Business profile is not active', 400));
    }

    const reviewer = await User.findById(req.user.id);
    
    // Prevent self-reviews
    if (reviewer._id.toString() === business._id.toString()) {
      return next(new ErrorResponse('You cannot review your own business', 400));
    }

    // Check for recent reviews (limit to one review per business per 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const existingReview = reviewer.reviews.given.find(r => 
      r.providerId?.toString() === business._id.toString() &&
      r.date > thirtyDaysAgo &&
      r.verificationMethod === 'general'
    );

    if (existingReview) {
      return next(new ErrorResponse('You have already reviewed this business recently', 400));
    }

    // Create the review given (for reviewer's profile)
    const newReviewGiven = {
      serviceId: null, // No specific service for general reviews
      serviceType: 'general_business',
      providerId: business._id,
      rating: rating,
      review: review.trim(),
      date: new Date(),
      isAnonymous: isAnonymous,
      verificationMethod: 'general',
      serviceExperience: serviceExperience || {}
    };

    // Create the review received (for business's profile)
    const newReviewReceived = {
      fromUserId: isAnonymous ? null : reviewer._id,
      serviceId: null,
      rating: rating,
      review: review.trim(),
      date: new Date(),
      isPublic: true,
      verificationMethod: 'general',
      serviceExperience: serviceExperience || {},
      isAnonymous: isAnonymous
    };

    // Add reviews to both users
    reviewer.reviews.given.push(newReviewGiven);
    business.reviews.received.push(newReviewReceived);

    // Update review statistics
    await updateReviewStats(reviewer, business);
    
    // Award points for review (slightly less than verified reviews)
    reviewer.addPoints(7, 'general_review_given');

    // Save both users
    await Promise.all([reviewer.save(), business.save()]);

    res.status(201).json({
      success: true,
      message: 'Review submitted successfully! You earned 7 points.',
      data: {
        review: newReviewGiven,
        pointsEarned: 7,
        totalPoints: reviewer.activity.points
      }
    });

  } catch (error) {
    console.error('General review submission error:', error);
    return next(new ErrorResponse('Failed to submit review', 500));
  }
});



// @desc    Get review analytics for service provider
// @route   GET /api/reviews/analytics
// @access  Private (Service Provider)
export const getReviewAnalytics = asyncHandler(async (req, res, next) => {
  const { timeframe = '30d' } = req.query;

  try {
    const user = await User.findById(req.user.id);
    if (!user || !user.businessProfile?.services?.length) {
      return next(new ErrorResponse('No services found for analytics', 404));
    }

    // Calculate date range
    const now = new Date();
    let startDate;
    
    switch (timeframe) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Filter reviews by timeframe
    const timeframeReviews = user.reviews.received.filter(review => 
      new Date(review.date) >= startDate
    );

    // Calculate analytics
    const analytics = {
      timeframe: timeframe,
      period: {
        start: startDate,
        end: now
      },
      totalReviews: timeframeReviews.length,
      averageRating: timeframeReviews.length > 0 ? 
        timeframeReviews.reduce((sum, r) => sum + r.rating, 0) / timeframeReviews.length : 0,
      ratingDistribution: {
        5: timeframeReviews.filter(r => r.rating === 5).length,
        4: timeframeReviews.filter(r => r.rating === 4).length,
        3: timeframeReviews.filter(r => r.rating === 3).length,
        2: timeframeReviews.filter(r => r.rating === 2).length,
        1: timeframeReviews.filter(r => r.rating === 1).length
      },
      responseRate: timeframeReviews.length > 0 ? 
        (timeframeReviews.filter(r => r.response?.text).length / timeframeReviews.length) * 100 : 0,
      verificationMethods: {
        qr_code: timeframeReviews.filter(r => r.verificationMethod === 'qr_code').length,
        service_code: timeframeReviews.filter(r => r.verificationMethod === 'service_code').length,
        plate_number: timeframeReviews.filter(r => r.verificationMethod === 'plate_number').length
      },
      serviceBreakdown: user.businessProfile.services.map(service => {
        const serviceReviews = timeframeReviews.filter(r => 
          r.serviceId?.toString() === service._id.toString()
        );
        
        return {
          serviceId: service._id,
          serviceName: service.serviceName,
          serviceType: service.serviceType,
          reviewCount: serviceReviews.length,
          averageRating: serviceReviews.length > 0 ? 
            serviceReviews.reduce((sum, r) => sum + r.rating, 0) / serviceReviews.length : 0
        };
      })
    };

    res.status(200).json({
      success: true,
      data: analytics
    });

  } catch (error) {
    console.error('Review analytics error:', error);
    return next(new ErrorResponse('Failed to generate review analytics', 500));
  }
});
