// server/controllers/carReviewController.js
import CarReview from '../models/CarReview.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import asyncHandler from '../middleware/async.js';

// @desc    Create a new car review
// @route   POST /api/car-reviews
// @access  Private
export const createCarReview = asyncHandler(async (req, res, next) => {
  // Add user to request body
  req.body.user = req.user.id;
  
  // Check if user already reviewed this car model
  const existingReview = await CarReview.findOne({
    user: req.user.id,
    carMake: req.body.carMake,
    carModel: req.body.carModel
  });

  // If user already reviewed this car model, return error
  if (existingReview) {
    return next(
      new ErrorResponse('You have already reviewed this car model', 400)
    );
  }

  // Create review
  const review = await CarReview.create(req.body);

  res.status(201).json({
    success: true,
    data: review
  });
});

// @desc    Get all car reviews
// @route   GET /api/car-reviews
// @access  Public
export const getCarReviews = asyncHandler(async (req, res, next) => {
  // Prepare query conditions
  const conditions = {};

  // For public users, only show approved reviews
  if (!req.user || req.user.role !== 'admin') {
    conditions.status = 'approved';
  }
  
  // Filter by car make and model if provided
  if (req.query.make) {
    conditions.carMake = new RegExp(req.query.make, 'i');
  }
  
  if (req.query.model) {
    conditions.carModel = new RegExp(req.query.model, 'i');
  }
  
  // For text search
  if (req.query.search) {
    conditions.$or = [
      { carMake: new RegExp(req.query.search, 'i') },
      { carModel: new RegExp(req.query.search, 'i') },
      { reviewText: new RegExp(req.query.search, 'i') }
    ];
  }

  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;
  
  // Get reviews
  const reviews = await CarReview.find(conditions)
    .skip(startIndex)
    .limit(limit)
    .sort({ createdAt: -1 })
    .populate('user', 'name avatar');
  
  // Get total
  const total = await CarReview.countDocuments(conditions);

  res.status(200).json({
    success: true,
    count: reviews.length,
    pagination: {
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit)
    },
    data: reviews
  });
});

// @desc    Get a single car review
// @route   GET /api/car-reviews/:id
// @access  Public
export const getCarReview = asyncHandler(async (req, res, next) => {
  const review = await CarReview.findById(req.params.id).populate('user', 'name avatar');

  if (!review) {
    return next(new ErrorResponse(`Review not found with id of ${req.params.id}`, 404));
  }

  // If review is not approved and user is not admin or the review owner
  if (
    review.status !== 'approved' && 
    (!req.user || (req.user.role !== 'admin' && review.user.toString() !== req.user.id))
  ) {
    return next(new ErrorResponse(`Review not found with id of ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: review
  });
});

// @desc    Update a car review
// @route   PUT /api/car-reviews/:id
// @access  Private
export const updateCarReview = asyncHandler(async (req, res, next) => {
  let review = await CarReview.findById(req.params.id);

  if (!review) {
    return next(new ErrorResponse(`Review not found with id of ${req.params.id}`, 404));
  }

  // Check if user is review owner or admin
  if (review.user.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`Not authorized to update this review`, 401));
  }

  // If user is updating their own review, set status back to pending for re-approval
  if (review.user.toString() === req.user.id && req.user.role !== 'admin') {
    req.body.status = 'pending';
  }

  // Update review
  review = await CarReview.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    success: true,
    data: review
  });
});

// @desc    Delete a car review
// @route   DELETE /api/car-reviews/:id
// @access  Private
export const deleteCarReview = asyncHandler(async (req, res, next) => {
  const review = await CarReview.findById(req.params.id);

  if (!review) {
    return next(new ErrorResponse(`Review not found with id of ${req.params.id}`, 404));
  }

  // Check if user is review owner or admin
  if (review.user.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse(`Not authorized to delete this review`, 401));
  }

  await review.remove();

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Approve or reject a car review
// @route   PUT /api/car-reviews/:id/status
// @access  Private/Admin
export const updateCarReviewStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;
  
  // Validate status
  if (!status || !['approved', 'rejected', 'pending'].includes(status)) {
    return next(new ErrorResponse(`Please provide a valid status`, 400));
  }

  let review = await CarReview.findById(req.params.id);

  if (!review) {
    return next(new ErrorResponse(`Review not found with id of ${req.params.id}`, 404));
  }

  // Check if user is admin
  if (req.user.role !== 'admin') {
    return next(new ErrorResponse(`Not authorized to update review status`, 401));
  }

  // Update review status
  review = await CarReview.findByIdAndUpdate(
    req.params.id, 
    { status }, 
    { new: true }
  );

  res.status(200).json({
    success: true,
    data: review
  });
});

// @desc    Mark car review as helpful
// @route   PUT /api/car-reviews/:id/helpful
// @access  Private
export const markCarReviewHelpful = asyncHandler(async (req, res, next) => {
  const review = await CarReview.findById(req.params.id);

  if (!review) {
    return next(new ErrorResponse(`Review not found with id of ${req.params.id}`, 404));
  }

  // Check if user already marked this review as helpful
  const alreadyMarked = review.helpful.users.includes(req.user.id);
  
  let updatedReview;
  
  if (alreadyMarked) {
    // Remove user from helpful users
    updatedReview = await CarReview.findByIdAndUpdate(
      req.params.id,
      {
        $pull: { 'helpful.users': req.user.id },
        $inc: { 'helpful.count': -1 }
      },
      { new: true }
    );
  } else {
    // Add user to helpful users
    updatedReview = await CarReview.findByIdAndUpdate(
      req.params.id,
      {
        $addToSet: { 'helpful.users': req.user.id },
        $inc: { 'helpful.count': 1 }
      },
      { new: true }
    );
  }

  res.status(200).json({
    success: true,
    data: {
      helpful: updatedReview.helpful,
      isHelpful: !alreadyMarked
    }
  });
});

// @desc    Get reviews by car model
// @route   GET /api/car-reviews/car
// @access  Public
export const getReviewsByCar = asyncHandler(async (req, res, next) => {
  const { make, model } = req.query;
  
  if (!make && !model) {
    return next(new ErrorResponse('Please provide car make or model', 400));
  }
  
  const conditions = { status: 'approved' };
  
  if (make) {
    conditions.carMake = new RegExp(make, 'i');
  }
  
  if (model) {
    conditions.carModel = new RegExp(model, 'i');
  }
  
  const reviews = await CarReview.find(conditions)
    .sort({ createdAt: -1 })
    .populate('user', 'name avatar');
  
  // Calculate average ratings across all reviews
  let averageRatings = {
    overall: 0,
    reliability: 0,
    fuelEfficiency: 0,
    comfort: 0,
    performance: 0,
    value: 0
  };
  
  if (reviews.length > 0) {
    reviews.forEach(review => {
      averageRatings.reliability += review.ratings.reliability;
      averageRatings.fuelEfficiency += review.ratings.fuelEfficiency;
      averageRatings.comfort += review.ratings.comfort;
      averageRatings.performance += review.ratings.performance;
      averageRatings.value += review.ratings.value;
      averageRatings.overall += review.averageRating;
    });
    
    const count = reviews.length;
    averageRatings.reliability = (averageRatings.reliability / count).toFixed(1);
    averageRatings.fuelEfficiency = (averageRatings.fuelEfficiency / count).toFixed(1);
    averageRatings.comfort = (averageRatings.comfort / count).toFixed(1);
    averageRatings.performance = (averageRatings.performance / count).toFixed(1);
    averageRatings.value = (averageRatings.value / count).toFixed(1);
    averageRatings.overall = (averageRatings.overall / count).toFixed(1);
  }
  
  res.status(200).json({
    success: true,
    count: reviews.length,
    averageRatings,
    data: reviews
  });
});

// @desc    Get user's car reviews
// @route   GET /api/car-reviews/user
// @access  Private
export const getUserCarReviews = asyncHandler(async (req, res, next) => {
  const reviews = await CarReview.find({ user: req.user.id })
    .sort({ createdAt: -1 });
  
  res.status(200).json({
    success: true,
    count: reviews.length,
    data: reviews
  });
});