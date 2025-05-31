// server/controllers/carController.js
import Car from '../models/Car.js';
import Dealer from '../models/Dealer.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import { asyncHandler } from '../middleware/async.js';
import { optimizeAndUpload, deleteFile } from '../utils/fileUpload.js';
import slugify from 'slugify';

// @desc    Create new car listing
// @route   POST /api/v1/cars
// @access  Private/Dealer
export const createCar = asyncHandler(async (req, res, next) => {
  // Check if user is a dealer
  const dealer = await Dealer.findOne({ user: req.user.id });
  if (!dealer) {
    return next(new ErrorResponse('Not authorized to create listings', 403));
  }

  // Add dealer to req.body
  req.body.dealer = dealer._id;
  
  // Create slug from title
  req.body.slug = slugify(req.body.title, { lower: true });

  // Handle image uploads
  if (req.files && req.files.length > 0) {
    const imagePromises = req.files.map(async (file, index) => {
      const result = await optimizeAndUpload(file, 'cars');
      return {
        url: result.url,
        thumbnail: result.thumbnail,
        isMain: index === 0 // First image is main
      };
    });

    req.body.images = await Promise.all(imagePromises);
  }

  const car = await Car.create(req.body);
  
  // Update dealer metrics
  await Dealer.findByIdAndUpdate(dealer._id, {
    $inc: { 'metrics.totalListings': 1 }
  });

  res.status(201).json({
    success: true,
    data: car
  });
});

// @desc    Get all cars with filtering
// @route   GET /api/v1/cars
// @access  Public
export const getCars = asyncHandler(async (req, res, next) => {
  // Build query
  let query = {};
  
  // Price range
  if (req.query.minPrice || req.query.maxPrice) {
    query.price = {};
    if (req.query.minPrice) query.price.$gte = Number(req.query.minPrice);
    if (req.query.maxPrice) query.price.$lte = Number(req.query.maxPrice);
  }

  // Year range
  if (req.query.minYear || req.query.maxYear) {
    query['specifications.year'] = {};
    if (req.query.minYear) query['specifications.year'].$gte = Number(req.query.minYear);
    if (req.query.maxYear) query['specifications.year'].$lte = Number(req.query.maxYear);
  }

  // Mileage range
  if (req.query.maxMileage) {
    query['specifications.mileage'] = { $lte: Number(req.query.maxMileage) };
  }

  // Search by make/model
  if (req.query.make) {
    query['specifications.make'] = { $regex: req.query.make, $options: 'i' };
  }
  if (req.query.model) {
    query['specifications.model'] = { $regex: req.query.model, $options: 'i' };
  }

  // Status filter (published only for public)
  if (!req.user || req.user.role !== 'admin') {
    query.status = 'published';
  }

  // Text search
  if (req.query.search) {
    query.$text = { $search: req.query.search };
  }

  // Build final query with pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const total = await Car.countDocuments(query);

  const cars = await Car.find(query)
    .populate('dealer', 'businessName location.city verification.status')
    .skip(startIndex)
    .limit(limit)
    .sort(req.query.sort || '-createdAt');

  // Pagination result
  const pagination = {};
  if (endIndex < total) {
    pagination.next = { page: page + 1, limit };
  }
  if (startIndex > 0) {
    pagination.prev = { page: page - 1, limit };
  }

  res.status(200).json({
    success: true,
    count: cars.length,
    pagination,
    data: cars
  });
});

// @desc    Get single car
// @route   GET /api/v1/cars/:id
// @access  Public
export const getCar = asyncHandler(async (req, res, next) => {
  const car = await Car.findOneAndUpdate(
    { _id: req.params.id },
    { $inc: { views: 1 } }, // Increment view count
    { new: true }
  ).populate('dealer', 'businessName contact location verification metrics');

  if (!car) {
    return next(new ErrorResponse(`Car not found with id ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: car
  });
});

// @desc    Update car listing
// @route   PUT /api/v1/cars/:id
// @access  Private/Dealer
export const updateCar = asyncHandler(async (req, res, next) => {
  let car = await Car.findById(req.params.id);

  if (!car) {
    return next(new ErrorResponse(`Car not found with id ${req.params.id}`, 404));
  }

  // Make sure user is car dealer
  const dealer = await Dealer.findOne({ user: req.user.id });
  if (!dealer || (car.dealer.toString() !== dealer._id.toString() && req.user.role !== 'admin')) {
    return next(new ErrorResponse('Not authorized to update this listing', 403));
  }

  // Handle image uploads if any
  if (req.files && req.files.length > 0) {
    // Delete old images from storage
    if (car.images && car.images.length > 0) {
      const deletePromises = car.images.map(image => deleteFile(image.url));
      await Promise.all(deletePromises);
    }

    // Upload new images
    const imagePromises = req.files.map(async (file, index) => {
      const result = await optimizeAndUpload(file, 'cars');
      return {
        url: result.url,
        thumbnail: result.thumbnail,
        isMain: index === 0
      };
    });

    req.body.images = await Promise.all(imagePromises);
  }

  // Update slug if title changed
  if (req.body.title && req.body.title !== car.title) {
    req.body.slug = slugify(req.body.title, { lower: true });
  }

  car = await Car.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    success: true,
    data: car
  });
});

// @desc    Delete car listing
// @route   DELETE /api/v1/cars/:id
// @access  Private/Dealer
export const deleteCar = asyncHandler(async (req, res, next) => {
  const car = await Car.findById(req.params.id);

  if (!car) {
    return next(new ErrorResponse(`Car not found with id ${req.params.id}`, 404));
  }

  // Check ownership
  const dealer = await Dealer.findOne({ user: req.user.id });
  if (!dealer || (car.dealer.toString() !== dealer._id.toString() && req.user.role !== 'admin')) {
    return next(new ErrorResponse('Not authorized to delete this listing', 403));
  }

  // Delete images from storage
  if (car.images && car.images.length > 0) {
    const deletePromises = car.images.map(image => deleteFile(image.url));
    await Promise.all(deletePromises);
  }

  await car.remove();

  // Update dealer metrics
  await Dealer.findByIdAndUpdate(dealer._id, {
    $inc: { 'metrics.totalListings': -1 }
  });

  res.status(200).json({
    success: true,
    message: 'Car listing deleted successfully'
  });
});

// @desc    Get dealer cars
// @route   GET /api/v1/dealers/:dealerId/cars
// @access  Public
export const getDealerCars = asyncHandler(async (req, res, next) => {
  const dealerId = req.params.dealerId;

  const cars = await Car.find({ 
    dealer: dealerId,
    status: 'published'
  }).sort('-createdAt');

  res.status(200).json({
    success: true,
    count: cars.length,
    data: cars
  });
});