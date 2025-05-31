// server/controllers/videoController.js
import Video from '../models/Video.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import asyncHandler from '../middleware/async.js';
import { uploadImage, deleteImage } from '../utils/imageUpload.js';

/**
 * @desc    Get all videos with filtering
 * @route   GET /api/videos
 * @access  Public
 */
export const getVideos = asyncHandler(async (req, res, next) => {
  // Extract query parameters
  const {
    category,
    subscriptionTier,
    featured,
    dealerId,
    listingId,
    search,
    page = 1,
    limit = 10,
    sort = '-createdAt'
  } = req.query;

  // Build query
  const query = {};

  // Only show published videos for non-admin users
  if (req.user && req.user.role === 'admin') {
    // Admins can see all videos (optionally filter by status)
    if (req.query.status) {
      query.status = req.query.status;
    }
  } else {
    // Non-admins only see published videos
    query.status = 'published';
  }

  // Filter by category
  if (category && category !== 'all') {
    query.category = category;
  }

  // Filter by subscription tier
  if (subscriptionTier) {
    query.subscriptionTier = subscriptionTier;
  }

  // Filter by featured status
  if (featured === 'true') {
    query.featured = true;
  }

  // Filter by related dealer
  if (dealerId) {
    query.relatedDealerId = dealerId;
  }

  // Filter by related listing
  if (listingId) {
    query.relatedListingId = listingId;
  }

  // Search by title or description
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  // Calculate pagination
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  
  // Count total documents matching the query
  const total = await Video.countDocuments(query);

  // Parse sort field
  const sortBy = sort.startsWith('-') ? { [sort.substring(1)]: -1 } : { [sort]: 1 };

  // Execute query with pagination and sorting
  const videos = await Video.find(query)
    .sort(sortBy)
    .skip(startIndex)
    .limit(parseInt(limit))
    .populate([
      { path: 'author', select: 'name avatar' },
      { path: 'relatedDealerId', select: 'businessName location logo' },
      { path: 'relatedListingId', select: 'title specifications.make specifications.model price mainImage' }
    ]);

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
    count: videos.length,
    data: videos
  });
});

/**
 * @desc    Get single video
 * @route   GET /api/videos/:id
 * @access  Public
 */
export const getVideo = asyncHandler(async (req, res, next) => {
  const video = await Video.findById(req.params.id)
    .populate([
      { path: 'author', select: 'name avatar' },
      { path: 'relatedDealerId', select: 'businessName location logo' },
      { path: 'relatedListingId', select: 'title specifications.make specifications.model price mainImage' }
    ]);

  if (!video) {
    return next(new ErrorResponse(`Video not found with id ${req.params.id}`, 404));
  }

  // Non-admin users can only view published videos
  if (video.status !== 'published' && (!req.user || req.user.role !== 'admin')) {
    return next(new ErrorResponse(`Video not found with id ${req.params.id}`, 404));
  }

  // Increment view count
  video.metadata.views += 1;
  await video.save();

  res.status(200).json({
    success: true,
    data: video
  });
});

/**
 * @desc    Create new video
 * @route   POST /api/videos
 * @access  Private (Admin)
 */
export const createVideo = asyncHandler(async (req, res, next) => {
  // Set author to current user
  req.body.author = req.user.id;
  req.body.authorName = req.user.name;

  // Ensure YouTube video ID is extracted
  if (!req.body.youtubeVideoId && req.body.youtubeUrl) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = req.body.youtubeUrl.match(regExp);
    
    if (match && match[2].length === 11) {
      req.body.youtubeVideoId = match[2];
      
      // Set thumbnail URL if not provided
      if (!req.body.thumbnail?.url) {
        req.body.thumbnail = {
          url: `https://img.youtube.com/vi/${match[2]}/maxresdefault.jpg`,
          size: 0,
          mimetype: 'image/jpeg'
        };
      }
    } else {
      return next(new ErrorResponse('Invalid YouTube URL', 400));
    }
  }

  // Handle custom thumbnail upload if file is provided
  if (req.file) {
    try {
      const result = await uploadImage(req.file, 'videos/thumbnails');
      req.body.thumbnail = {
        url: result.url,
        key: result.key,
        size: result.size,
        mimetype: result.mimetype
      };
    } catch (error) {
      console.error('Error uploading video thumbnail:', error);
      return next(new ErrorResponse('Failed to upload thumbnail', 500));
    }
  }

  // Create video
  const video = await Video.create(req.body);

  res.status(201).json({
    success: true,
    data: video
  });
});

/**
 * @desc    Update video
 * @route   PUT /api/videos/:id
 * @access  Private (Admin)
 */
export const updateVideo = asyncHandler(async (req, res, next) => {
  let video = await Video.findById(req.params.id);

  if (!video) {
    return next(new ErrorResponse(`Video not found with id ${req.params.id}`, 404));
  }

  // Re-extract YouTube video ID if URL changed
  if (req.body.youtubeUrl && req.body.youtubeUrl !== video.youtubeUrl) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = req.body.youtubeUrl.match(regExp);
    
    if (match && match[2].length === 11) {
      req.body.youtubeVideoId = match[2];
      
      // Update thumbnail if not explicitly provided
      if (!req.body.thumbnail?.url || req.body.thumbnail.url === video.thumbnail?.url) {
        req.body.thumbnail = {
          url: `https://img.youtube.com/vi/${match[2]}/maxresdefault.jpg`,
          size: 0,
          mimetype: 'image/jpeg'
        };
      }
    } else {
      return next(new ErrorResponse('Invalid YouTube URL', 400));
    }
  }

  // Handle custom thumbnail upload if file is provided
  if (req.file) {
    try {
      // Delete old thumbnail if it exists and was uploaded to S3
      if (video.thumbnail?.key) {
        await deleteImage(video.thumbnail.key);
      }
      
      const result = await uploadImage(req.file, 'videos/thumbnails');
      req.body.thumbnail = {
        url: result.url,
        key: result.key,
        size: result.size,
        mimetype: result.mimetype
      };
    } catch (error) {
      console.error('Error uploading video thumbnail:', error);
      return next(new ErrorResponse('Failed to upload thumbnail', 500));
    }
  }

  // Update video
  video = await Video.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });

  res.status(200).json({
    success: true,
    data: video
  });
});

/**
 * @desc    Delete video
 * @route   DELETE /api/videos/:id
 * @access  Private (Admin)
 */
export const deleteVideo = asyncHandler(async (req, res, next) => {
  const video = await Video.findById(req.params.id);

  if (!video) {
    return next(new ErrorResponse(`Video not found with id ${req.params.id}`, 404));
  }

  // Delete custom thumbnail if it exists
  if (video.thumbnail?.key) {
    try {
      await deleteImage(video.thumbnail.key);
    } catch (error) {
      console.warn('Error deleting video thumbnail:', error);
      // Continue with deletion even if thumbnail deletion fails
    }
  }

  await video.remove();

  res.status(200).json({
    success: true,
    data: {}
  });
});

/**
 * @desc    Get featured videos
 * @route   GET /api/videos/featured
 * @access  Public
 */
export const getFeaturedVideos = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit) || 4;
  
  const videos = await Video.find({
    featured: true,
    status: 'published'
  })
    .sort('-publishDate')
    .limit(limit)
    .populate([
      { path: 'author', select: 'name avatar' },
      { path: 'relatedDealerId', select: 'businessName location logo' }
    ]);

  res.status(200).json({
    success: true,
    count: videos.length,
    data: videos
  });
});

/**
 * @desc    Get videos by category
 * @route   GET /api/videos/category/:category
 * @access  Public
 */
export const getVideosByCategory = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit) || 10;
  
  const videos = await Video.find({
    category: req.params.category,
    status: 'published'
  })
    .sort('-publishDate')
    .limit(limit)
    .populate([
      { path: 'author', select: 'name avatar' },
      { path: 'relatedDealerId', select: 'businessName location logo' }
    ]);

  res.status(200).json({
    success: true,
    count: videos.length,
    data: videos
  });
});

/**
 * @desc    Get dealer videos
 * @route   GET /api/videos/dealer/:dealerId
 * @access  Public
 */
export const getDealerVideos = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit) || 10;
  
  const videos = await Video.find({
    relatedDealerId: req.params.dealerId,
    status: 'published'
  })
    .sort('-publishDate')
    .limit(limit)
    .populate('author', 'name avatar');

  res.status(200).json({
    success: true,
    count: videos.length,
    data: videos
  });
});

/**
 * @desc    Get videos for a listing
 * @route   GET /api/videos/listing/:listingId
 * @access  Public
 */
export const getListingVideos = asyncHandler(async (req, res, next) => {
  const limit = parseInt(req.query.limit) || 10;
  
  const videos = await Video.find({
    relatedListingId: req.params.listingId,
    status: 'published'
  })
    .sort('-publishDate')
    .limit(limit)
    .populate('author', 'name avatar');

  res.status(200).json({
    success: true,
    count: videos.length,
    data: videos
  });
});

/**
 * @desc    Toggle featured status
 * @route   PATCH /api/videos/:id/featured
 * @access  Private (Admin)
 */
export const toggleFeatured = asyncHandler(async (req, res, next) => {
  let video = await Video.findById(req.params.id);

  if (!video) {
    return next(new ErrorResponse(`Video not found with id ${req.params.id}`, 404));
  }

  // Toggle featured status
  video.featured = !video.featured;
  await video.save();

  res.status(200).json({
    success: true,
    data: video
  });
});

/**
 * @desc    Like a video
 * @route   PUT /api/videos/:id/like
 * @access  Private
 */
export const likeVideo = asyncHandler(async (req, res, next) => {
  let video = await Video.findById(req.params.id);

  if (!video) {
    return next(new ErrorResponse(`Video not found with id ${req.params.id}`, 404));
  }

  // Increment like count
  video.metadata.likes += 1;
  await video.save();

  res.status(200).json({
    success: true,
    data: video
  });
});

/**
 * @desc    Update video status
 * @route   PATCH /api/videos/:id/status
 * @access  Private (Admin)
 */
export const updateVideoStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;
  
  if (!status || !['draft', 'published', 'archived'].includes(status)) {
    return next(new ErrorResponse('Please provide a valid status', 400));
  }
  
  const video = await Video.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true }
  );
  
  if (!video) {
    return next(new ErrorResponse(`Video not found with id ${req.params.id}`, 404));
  }
  
  res.status(200).json({
    success: true,
    data: video
  });
});

/**
 * @desc    Get video analytics
 * @route   GET /api/videos/:id/analytics
 * @access  Private (Admin)
 */
export const getVideoAnalytics = asyncHandler(async (req, res, next) => {
  const video = await Video.findById(req.params.id);
  
  if (!video) {
    return next(new ErrorResponse(`Video not found with id ${req.params.id}`, 404));
  }
  
  // Get analytics data
  const analytics = {
    views: video.metadata.views,
    likes: video.metadata.likes,
    publishDate: video.publishDate,
    viewsPerDay: video.metadata.views / Math.max(1, Math.ceil((new Date() - new Date(video.publishDate)) / (1000 * 60 * 60 * 24))),
    engagementRate: video.metadata.views > 0 ? (video.metadata.likes / video.metadata.views) * 100 : 0
  };
  
  res.status(200).json({
    success: true,
    data: analytics
  });
});

// Export all controller functions
// export {
//   getVideos,
//   getVideo,
//   createVideo,
//   updateVideo,
//   deleteVideo,
//   getFeaturedVideos,
//   getVideosByCategory,
//   getDealerVideos,
//   getListingVideos,
//   toggleFeatured,
//   likeVideo,
// };