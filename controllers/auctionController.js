// server/controllers/auctionController.js
import Auction from '../models/Auction.js';
import Bid from '../models/Bid.js';
import User from '../models/User.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import { asyncHandler } from '../middleware/async.js';
import { uploadImage, deleteImage } from '../utils/imageUpload.js';

// @desc    Create new auction
// @route   POST /api/auctions
// @access  Private
export const createAuction = asyncHandler(async (req, res, next) => {
  try {
    console.log('Creating auction with data:', req.body);
    
    // Parse auction data from form if it exists
    let auctionData = req.body;
    if (req.body.auctionData) {
      try {
        auctionData = JSON.parse(req.body.auctionData);
      } catch (err) {
        console.error('Error parsing auction data:', err);
        throw new ErrorResponse('Invalid auction data format', 400);
      }
    }

    // Set the seller as current user
    auctionData.seller = req.user.id;
    
    // Verify dates
    const startDate = new Date(auctionData.startDate);
    const endDate = new Date(auctionData.endDate);
    
    if (isNaN(startDate.getTime())) {
      throw new ErrorResponse('Invalid start date', 400);
    }
    
    if (isNaN(endDate.getTime())) {
      throw new ErrorResponse('Invalid end date', 400);
    }
    
    if (endDate <= startDate) {
      throw new ErrorResponse('End date must be after start date', 400);
    }
    
    // Handle image uploads
    if (req.files && req.files.length > 0) {
      console.log('Processing image uploads:', req.files.length, 'files');
      
      const imagePromises = req.files.map(async (file, index) => {
        if (!file.mimetype || !file.mimetype.startsWith('image/')) {
          throw new ErrorResponse(`Invalid file type for file at index ${index}: ${file.mimetype}`, 400);
        }
        
        try {
          const isPrimary = req.body.primaryImage && parseInt(req.body.primaryImage) === index;
          console.log(`Processing image ${index}, isPrimary: ${isPrimary}`);
          
          const result = await uploadImage(file, 'auctions');
          console.log(`Image ${index} uploaded successfully:`, result.url);
          return {
            url: result.url,
            thumbnail: result.thumbnail,
            isPrimary: isPrimary
          };
        } catch (error) {
          console.error('Image upload error:', error);
          throw new ErrorResponse(`Failed to upload image: ${error.message}`, 500);
        }
      });

      auctionData.images = await Promise.all(imagePromises);
      console.log(`Successfully processed ${auctionData.images.length} images`);
    } else {
      // No images were uploaded
      throw new ErrorResponse('At least one image is required', 400);
    }

    // Create auction
    const auction = await Auction.create(auctionData);

    // Log success
    console.log('Auction created successfully:', auction._id);

    res.status(201).json({
      success: true,
      data: auction
    });
  } catch (error) {
    console.error('Error creating auction:', error);
    
    // Handle specific errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid auction data',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }
    
    // Rethrow for the global error handler
    throw error;
  }
});

// @desc    Get all auctions
// @route   GET /api/auctions
// @access  Public
export const getAuctions = asyncHandler(async (req, res, next) => {
  const filters = { ...req.query };
  
  // Remove fields for pagination
  const removeFields = ['page', 'limit', 'sort', 'fields'];
  removeFields.forEach(field => delete filters[field]);

  // Filter by auction status
  if (filters.status === 'active') {
    filters.status = 'active';
    filters.startDate = { $lte: new Date() };
    filters.endDate = { $gt: new Date() };
  } else if (filters.status === 'upcoming') {
    filters.status = 'active';
    filters.startDate = { $gt: new Date() };
    delete filters.status;
  } else if (filters.status === 'ended') {
    filters.$or = [
      { status: 'ended' },
      { status: 'sold' },
      { status: 'unsold' },
      { 
        status: 'active',
        endDate: { $lte: new Date() } 
      }
    ];
    delete filters.status;
  }

  // Filter by price range
  if (filters.minPrice || filters.maxPrice) {
    filters.startingBid = {};
    if (filters.minPrice) filters.startingBid.$gte = Number(filters.minPrice);
    if (filters.maxPrice) filters.startingBid.$lte = Number(filters.maxPrice);
    delete filters.minPrice;
    delete filters.maxPrice;
  }

  // Filter by vehicle attributes
  if (filters.make) {
    filters['vehicle.make'] = { $regex: filters.make, $options: 'i' };
    delete filters.make;
  }
  
  if (filters.model) {
    filters['vehicle.model'] = { $regex: filters.model, $options: 'i' };
    delete filters.model;
  }
  
  if (filters.year) {
    filters['vehicle.year'] = Number(filters.year);
    delete filters.year;
  }

  // Custom filter for ending soon
  if (filters.endingSoon) {
    const hours = Number(filters.endingSoon) || 24;
    const now = new Date();
    const future = new Date(now);
    future.setHours(now.getHours() + hours);
    
    filters.endDate = { $gt: now, $lte: future };
    filters.status = 'active';
    filters.startDate = { $lte: now };
    
    delete filters.endingSoon;
  }

  // Custom filter for no bids
  if (filters.noBids === 'true') {
    filters['bidHistory.0'] = { $exists: false };
    delete filters.noBids;
  }

  // Create query
  let query = Auction.find(filters);

  // Sort
  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('-createdAt');
  }

  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const total = await Auction.countDocuments(filters);

  query = query.skip(startIndex).limit(limit);

  // Execute query
  const auctions = await query;

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
    count: auctions.length,
    pagination,
    data: auctions
  });
});

// @desc    Get single auction
// @route   GET /api/auctions/:id
// @access  Public
export const getAuction = asyncHandler(async (req, res, next) => {
  let auction = await Auction.findById(req.params.id)
    .populate({
      path: 'bidHistory.bidder',
      select: 'name avatar'
    });

  if (!auction) {
    return next(new ErrorResponse(`Auction not found with id ${req.params.id}`, 404));
  }

  // Increment views
  auction.views += 1;
  await auction.save();

  // Check if auction has ended but status not updated
  if (auction.status === 'active' && auction.hasEnded()) {
    auction = await auction.endAuction();
  }

  // Check if logged in user is watching this auction
  if (req.user) {
    auction._doc.isWatching = auction.watchers.includes(req.user.id);
  }

  res.status(200).json({
    success: true,
    data: auction
  });
});

// @desc    Update auction
// @route   PUT /api/auctions/:id
// @access  Private
export const updateAuction = asyncHandler(async (req, res, next) => {
  let auction = await Auction.findById(req.params.id);

  // Check if auction exists
  if (!auction) {
    return next(new ErrorResponse(`Auction not found with id ${req.params.id}`, 404));
  }

  // Make sure user is auction owner
  if (auction.seller.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to update this auction', 403));
  }

  // Check if auction has already started
  if (auction.hasStarted() && auction.status === 'active') {
    return next(new ErrorResponse('Cannot update an auction that has already started', 400));
  }

  // Parse auction data
  let auctionData = req.body;
  if (req.body.auctionData) {
    try {
      auctionData = JSON.parse(req.body.auctionData);
    } catch (err) {
      return next(new ErrorResponse('Invalid auction data format', 400));
    }
  }

  // Handle image uploads
  if (req.files && req.files.length > 0) {
    const imagePromises = req.files.map(async (file, index) => {
      const isPrimary = req.body.primaryImage && parseInt(req.body.primaryImage) === index;
      const result = await uploadImage(file, 'auctions');
      return {
        url: result.url,
        thumbnail: result.thumbnail,
        isPrimary: isPrimary
      };
    });

    const newImages = await Promise.all(imagePromises);

    // If keeping existing images, combine them
    if (!auctionData.replaceImages) {
      auctionData.images = [...auction.images, ...newImages];
    } else {
      // Delete old images if replacing
      await Promise.all(auction.images.map(image => deleteImage(image.url)));
      auctionData.images = newImages;
    }
  }

  // Update the auction
  auction = await Auction.findByIdAndUpdate(
    req.params.id,
    auctionData,
    { new: true, runValidators: true }
  );

  res.status(200).json({
    success: true,
    data: auction
  });
});

// @desc    Delete auction
// @route   DELETE /api/auctions/:id
// @access  Private
export const deleteAuction = asyncHandler(async (req, res, next) => {
  const auction = await Auction.findById(req.params.id);

  if (!auction) {
    return next(new ErrorResponse(`Auction not found with id ${req.params.id}`, 404));
  }

  // Make sure user is auction owner
  if (auction.seller.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to delete this auction', 403));
  }

  // Check if auction has bids
  if (auction.bidHistory.length > 0 && auction.status === 'active') {
    return next(new ErrorResponse('Cannot delete an auction with active bids', 400));
  }

  // Delete images
  if (auction.images && auction.images.length > 0) {
    await Promise.all(auction.images.map(image => deleteImage(image.url)));
  }

  await auction.remove();

  res.status(200).json({
    success: true,
    data: {}
  });
});

// @desc    Place bid on auction
// @route   POST /api/auctions/:id/bid
// @access  Private
export const placeBid = asyncHandler(async (req, res, next) => {
  const { amount } = req.body;
  
  if (!amount) {
    return next(new ErrorResponse('Please provide a bid amount', 400));
  }
  
  const bidAmount = Number(amount);
  
  if (isNaN(bidAmount) || bidAmount <= 0) {
    return next(new ErrorResponse('Invalid bid amount', 400));
  }

  let auction = await Auction.findById(req.params.id);

  if (!auction) {
    return next(new ErrorResponse(`Auction not found with id ${req.params.id}`, 404));
  }

  // Check if auction is active
  if (auction.status !== 'active') {
    return next(new ErrorResponse('Cannot bid on inactive auction', 400));
  }

  // Check if auction has started
  if (!auction.hasStarted()) {
    return next(new ErrorResponse('Auction has not started yet', 400));
  }

  // Check if auction has ended
  if (auction.hasEnded()) {
    return next(new ErrorResponse('Auction has ended', 400));
  }

  // Check if user is seller
  if (auction.seller.toString() === req.user.id) {
    return next(new ErrorResponse('You cannot bid on your own auction', 400));
  }

  // Check if bid is valid
  if (auction.currentBid.amount > 0 && bidAmount <= auction.currentBid.amount) {
    return next(new ErrorResponse('Bid must be higher than current bid', 400));
  }

  if (auction.currentBid.amount === 0 && bidAmount < auction.startingBid) {
    return next(new ErrorResponse(`Bid must be at least the starting bid amount of ${auction.startingBid}`, 400));
  }

  if (auction.currentBid.amount > 0 && bidAmount < auction.currentBid.amount + auction.incrementAmount) {
    return next(new ErrorResponse(`Bid must be at least ${auction.incrementAmount} more than the current bid`, 400));
  }

  // Check if user is approved for auctions
  const user = await User.findById(req.user.id);
  if (!user.auctionApproved && req.user.role !== 'admin') {
    return next(new ErrorResponse('Your account is not approved for auctions. Please contact support.', 403));
  }

  try {
    // If there's a current bidder, mark their bid as outbid
    if (auction.currentBid.bidder) {
      const previousBid = await Bid.findOne({
        auction: auction._id,
        bidder: auction.currentBid.bidder,
        status: 'accepted'
      });
      
      if (previousBid) {
        await previousBid.markAsOutbid();
      }
    }

    // Create bid record
    const bid = await Bid.create({
      auction: auction._id,
      bidder: req.user.id,
      amount: bidAmount,
      status: 'accepted',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    // Update auction with new bid
    auction = await auction.placeBid(req.user.id, bidAmount);

    res.status(200).json({
      success: true,
      data: {
        auction,
        bid
      }
    });
  } catch (error) {
    return next(new ErrorResponse(error.message, 400));
  }
});

// @desc    Watch auction (add to watchlist)
// @route   PUT /api/auctions/:id/watch
// @access  Private
export const watchAuction = asyncHandler(async (req, res, next) => {
  const auction = await Auction.findById(req.params.id);

  if (!auction) {
    return next(new ErrorResponse(`Auction not found with id ${req.params.id}`, 404));
  }

  const isWatching = auction.watchers.includes(req.user.id);
  let message;

  if (isWatching) {
    // Remove user from watchers
    auction.watchers.pull(req.user.id);
    message = 'Auction removed from watchlist';
  } else {
    // Add user to watchers
    auction.watchers.push(req.user.id);
    message = 'Auction added to watchlist';
  }

  await auction.save();

  res.status(200).json({
    success: true,
    data: { isWatching: !isWatching },
    message
  });
});

// @desc    Get user's watched auctions
// @route   GET /api/auctions/watched
// @access  Private
export const getWatchedAuctions = asyncHandler(async (req, res, next) => {
  // Find all auctions the user is watching
  const auctions = await Auction.find({
    watchers: req.user.id
  }).sort('-createdAt');

  res.status(200).json({
    success: true,
    count: auctions.length,
    data: auctions
  });
});

// @desc    Get user's auctions (as seller)
// @route   GET /api/auctions/selling
// @access  Private
export const getSellingAuctions = asyncHandler(async (req, res, next) => {
  // Find all auctions where user is seller
  const auctions = await Auction.find({
    seller: req.user.id
  }).sort('-createdAt');

  res.status(200).json({
    success: true,
    count: auctions.length,
    data: auctions
  });
});

// @desc    Get user's bids
// @route   GET /api/auctions/bids
// @access  Private
export const getUserBids = asyncHandler(async (req, res, next) => {
  // Get all user's bids, grouped by auction
  const bids = await Bid.getUserBidHistory(req.user.id);

  res.status(200).json({
    success: true,
    count: bids.length,
    data: bids
  });
});

// @desc    Get auction bid history
// @route   GET /api/auctions/:id/bids
// @access  Public
export const getAuctionBids = asyncHandler(async (req, res, next) => {
  const auction = await Auction.findById(req.params.id);

  if (!auction) {
    return next(new ErrorResponse(`Auction not found with id ${req.params.id}`, 404));
  }

  // Get bid history for auction
  const bids = await Bid.getAuctionBids(req.params.id);

  res.status(200).json({
    success: true,
    count: bids.length,
    data: bids
  });
});

// @desc    Update auction status
// @route   PATCH /api/auctions/:id/status
// @access  Private/Admin
export const updateAuctionStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;

  if (!status) {
    return next(new ErrorResponse('Please provide a status', 400));
  }

  let auction = await Auction.findById(req.params.id);

  if (!auction) {
    return next(new ErrorResponse(`Auction not found with id ${req.params.id}`, 404));
  }

  // Only admins can update status
  if (req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to update auction status', 403));
  }

  // Update status
  auction.status = status;
  await auction.save();

  res.status(200).json({
    success: true,
    data: auction
  });
});

// @desc    Get similar auctions
// @route   GET /api/auctions/:id/similar
// @access  Public
export const getSimilarAuctions = asyncHandler(async (req, res, next) => {
  const auction = await Auction.findById(req.params.id);

  if (!auction) {
    return next(new ErrorResponse(`Auction not found with id ${req.params.id}`, 404));
  }

  // Find auctions with same make, model, or similar price
  const similarAuctions = await Auction.find({
    _id: { $ne: auction._id },
    status: 'active',
    $or: [
      { 'vehicle.make': auction.vehicle.make },
      { 'vehicle.model': auction.vehicle.model },
      { 
        startingBid: { 
          $gte: auction.startingBid * 0.7, 
          $lte: auction.startingBid * 1.3 
        } 
      }
    ]
  }).limit(4);

  res.status(200).json({
    success: true,
    count: similarAuctions.length,
    data: similarAuctions
  });
});

// @desc    Get featured auctions
// @route   GET /api/auctions/featured
// @access  Public
export const getFeaturedAuctions = asyncHandler(async (req, res, next) => {
  const auctions = await Auction.find({
    featured: true,
    status: 'active',
    startDate: { $lte: new Date() },
    endDate: { $gt: new Date() }
  }).limit(4);

  res.status(200).json({
    success: true,
    count: auctions.length,
    data: auctions
  });
});

// @desc    Toggle featured auction status
// @route   PATCH /api/auctions/:id/featured
// @access  Private/Admin
export const toggleFeatured = asyncHandler(async (req, res, next) => {
  let auction = await Auction.findById(req.params.id);

  if (!auction) {
    return next(new ErrorResponse(`Auction not found with id ${req.params.id}`, 404));
  }

  // Only admins can toggle featured status
  if (req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to modify featured status', 403));
  }

  // Toggle featured status
  auction.featured = !auction.featured;
  await auction.save();

  res.status(200).json({
    success: true,
    data: auction
  });
});