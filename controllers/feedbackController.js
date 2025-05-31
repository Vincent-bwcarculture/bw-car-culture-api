// server/controllers/feedbackController.js - Complete with all updates
import asyncHandler from '../middleware/async.js';
import Feedback from '../models/Feedback.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import { uploadFile, deleteFile } from '../utils/fileUpload.js';

/**
 * @desc    Submit feedback
 * @route   POST /api/feedback
 * @access  Public
 */
export const submitFeedback = asyncHandler(async (req, res, next) => {
  try {
    // Parse feedback data - handle both regular form data and multipart form data
    const feedbackData = req.body.feedbackData 
      ? JSON.parse(req.body.feedbackData) 
      : req.body;
    
    const { name, email, feedbackType, message, rating, pageContext, browserInfo } = feedbackData;
    
    // Validate required fields
    if (!name || !email || !message) {
      return next(new ErrorResponse('Please provide name, email, and message', 400));
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return next(new ErrorResponse('Please provide a valid email address', 400));
    }
    
    // Validate rating
    const ratingNum = parseInt(rating) || 5;
    if (ratingNum < 1 || ratingNum > 5) {
      return next(new ErrorResponse('Rating must be between 1 and 5', 400));
    }
    
    // Create feedback object
    const feedbackObj = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      feedbackType: feedbackType || 'general',
      message: message.trim(),
      rating: ratingNum,
      status: 'new',
      priority: ratingNum <= 2 ? 'high' : 'medium', // Low ratings get high priority
      ipAddress: req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip,
      userAgent: req.headers['user-agent'],
      pageContext: pageContext || {
        url: req.headers.referer || 'unknown',
        page: 'unknown',
        section: 'feedback'
      }
    };
    
    // If user is authenticated, add user reference
    if (req.user) {
      feedbackObj.user = req.user.id;
    }
    
    // Handle attachments from S3 upload middleware
    if (req.s3Attachments && req.s3Attachments.length > 0) {
      feedbackObj.attachments = req.s3Attachments.map(attachment => ({
        ...attachment,
        uploadedAt: new Date()
      }));
    }
    
    // Add browser information if provided
    if (browserInfo || req.headers['user-agent']) {
      feedbackObj.browserInfo = {
        userAgent: req.headers['user-agent'],
        ...browserInfo
      };
    }
    
    // Create feedback in database
    const feedback = await Feedback.create(feedbackObj);
    
    // Log successful submission for analytics
    console.log('New feedback submitted:', {
      id: feedback._id,
      name: feedback.name,
      email: feedback.email,
      type: feedback.feedbackType,
      rating: feedback.rating,
      hasAttachments: feedback.attachments?.length > 0,
      timestamp: feedback.createdAt
    });
    
    res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully',
      data: {
        id: feedback._id,
        status: feedback.status,
        submittedAt: feedback.createdAt
      }
    });
  } catch (error) {
    console.error('Submit feedback error:', error);
    
    // Clean up uploaded files if database save failed
    if (req.s3Attachments && req.s3Attachments.length > 0) {
      try {
        const { deleteMultipleFromS3 } = await import('../utils/s3Delete.js');
        const keys = req.s3Attachments.map(att => att.key);
        await deleteMultipleFromS3(keys);
        console.log('Cleaned up uploaded files after database error');
      } catch (cleanupError) {
        console.error('Error cleaning up files:', cleanupError);
      }
    }
    
    return next(new ErrorResponse('Failed to submit feedback', 500));
  }
});

/**
 * @desc    Get all feedback (paginated with advanced filtering)
 * @route   GET /api/feedback
 * @access  Private (Admin)
 */
export const getFeedback = asyncHandler(async (req, res, next) => {
  try {
    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    
    // Filtering
    const filter = {};
    
    // Status filter
    if (req.query.status && req.query.status !== 'all') {
      filter.status = req.query.status;
    }
    
    // Type filter
    if (req.query.feedbackType && req.query.feedbackType !== 'all') {
      filter.feedbackType = req.query.feedbackType;
    }
    
    // Priority filter
    if (req.query.priority && req.query.priority !== 'all') {
      filter.priority = req.query.priority;
    }
    
    // Rating filter
    if (req.query.rating) {
      const rating = parseInt(req.query.rating);
      if (rating >= 1 && rating <= 5) {
        filter.rating = rating;
      }
    }
    
    // Date range filter
    if (req.query.dateFrom || req.query.dateTo) {
      filter.createdAt = {};
      if (req.query.dateFrom) {
        filter.createdAt.$gte = new Date(req.query.dateFrom);
      }
      if (req.query.dateTo) {
        filter.createdAt.$lte = new Date(req.query.dateTo);
      }
    }
    
    // Search filter
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, 'i');
      filter.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { message: searchRegex },
        { adminNotes: searchRegex }
      ];
    }
    
    // Sorting
    const sort = {};
    if (req.query.sortBy) {
      const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
      sort[req.query.sortBy] = sortOrder;
    } else {
      sort.createdAt = -1; // Default sorting by newest
    }
    
    // Execute query with population
    const feedback = await Feedback.find(filter)
      .populate('user', 'name email')
      .populate('adminResponse.respondedBy', 'name')
      .sort(sort)
      .skip(startIndex)
      .limit(limit);
    
    // Get total count for pagination
    const total = await Feedback.countDocuments(filter);
    
    // Calculate pagination info
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;
    
    res.status(200).json({
      success: true,
      count: feedback.length,
      pagination: {
        total,
        page,
        limit,
        pages: totalPages,
        hasNextPage,
        hasPrevPage,
        nextPage: hasNextPage ? page + 1 : null,
        prevPage: hasPrevPage ? page - 1 : null
      },
      filters: {
        status: req.query.status || 'all',
        feedbackType: req.query.feedbackType || 'all',
        priority: req.query.priority || 'all',
        search: req.query.search || ''
      },
      data: feedback
    });
  } catch (error) {
    console.error('Error fetching feedback:', error);
    return next(new ErrorResponse('Failed to fetch feedback', 500));
  }
});

/**
 * @desc    Get single feedback
 * @route   GET /api/feedback/:id
 * @access  Private (Admin)
 */
export const getFeedbackById = asyncHandler(async (req, res, next) => {
  try {
    const feedback = await Feedback.findById(req.params.id)
      .populate('user', 'name email avatar')
      .populate('adminResponse.respondedBy', 'name email')
      .populate('statusHistory.changedBy', 'name');
    
    if (!feedback) {
      return next(new ErrorResponse(`Feedback not found with id ${req.params.id}`, 404));
    }
    
    res.status(200).json({
      success: true,
      data: feedback
    });
  } catch (error) {
    console.error('Error fetching feedback by ID:', error);
    return next(new ErrorResponse('Failed to fetch feedback', 500));
  }
});

/**
 * @desc    Update feedback status
 * @route   PUT /api/feedback/:id/status
 * @access  Private (Admin)
 */
export const updateFeedbackStatus = asyncHandler(async (req, res, next) => {
  try {
    const { status, adminNotes, priority } = req.body;
    
    // Validate status
    const validStatuses = ['new', 'in-progress', 'completed', 'archived'];
    if (status && !validStatuses.includes(status)) {
      return next(new ErrorResponse('Invalid status value', 400));
    }
    
    // Validate priority
    const validPriorities = ['low', 'medium', 'high', 'urgent'];
    if (priority && !validPriorities.includes(priority)) {
      return next(new ErrorResponse('Invalid priority value', 400));
    }
    
    // Find feedback
    let feedback = await Feedback.findById(req.params.id);
    
    if (!feedback) {
      return next(new ErrorResponse(`Feedback not found with id ${req.params.id}`, 404));
    }
    
    // Prepare update data
    const updateData = {};
    
    if (status) {
      updateData.status = status;
      updateData.updatedAt = new Date();
      
      // Add to status history
      if (!feedback.statusHistory) {
        feedback.statusHistory = [];
      }
      feedback.statusHistory.push({
        status,
        changedBy: req.user.id,
        changedAt: new Date(),
        notes: adminNotes || ''
      });
    }
    
    if (adminNotes) {
      updateData.adminNotes = adminNotes;
    }
    
    if (priority) {
      updateData.priority = priority;
    }
    
    // Update feedback
    feedback = await Feedback.findByIdAndUpdate(
      req.params.id,
      { 
        ...updateData,
        statusHistory: feedback.statusHistory
      },
      { new: true }
    ).populate('statusHistory.changedBy', 'name');
    
    res.status(200).json({
      success: true,
      message: 'Feedback updated successfully',
      data: feedback
    });
  } catch (error) {
    console.error('Error updating feedback status:', error);
    return next(new ErrorResponse('Failed to update feedback', 500));
  }
});

/**
 * @desc    Delete feedback
 * @route   DELETE /api/feedback/:id
 * @access  Private (Admin)
 */
export const deleteFeedback = asyncHandler(async (req, res, next) => {
  try {
    const feedback = await Feedback.findById(req.params.id);
    
    if (!feedback) {
      return next(new ErrorResponse(`Feedback not found with id ${req.params.id}`, 404));
    }
    
    // Delete attachments from S3 (handled by route middleware)
    // The route middleware handles S3 cleanup before calling this controller
    
    await Feedback.findByIdAndDelete(req.params.id);
    
    console.log(`Feedback deleted: ${req.params.id} by admin: ${req.user.id}`);
    
    res.status(200).json({
      success: true,
      message: 'Feedback deleted successfully',
      data: {}
    });
  } catch (error) {
    console.error('Error deleting feedback:', error);
    return next(new ErrorResponse('Failed to delete feedback', 500));
  }
});

/**
 * @desc    Add admin response to feedback
 * @route   PUT /api/feedback/:id/response
 * @access  Private (Admin)
 */
export const addAdminResponse = asyncHandler(async (req, res, next) => {
  try {
    const { message } = req.body;
    
    if (!message || !message.trim()) {
      return next(new ErrorResponse('Please provide a response message', 400));
    }
    
    const feedback = await Feedback.findById(req.params.id);
    
    if (!feedback) {
      return next(new ErrorResponse(`Feedback not found with id ${req.params.id}`, 404));
    }
    
    // Add admin response
    feedback.adminResponse = {
      message: message.trim(),
      respondedBy: req.user.id,
      respondedAt: new Date()
    };
    
    // Auto-update status to completed if not already
    if (feedback.status === 'new' || feedback.status === 'in-progress') {
      feedback.status = 'completed';
      
      // Add to status history
      if (!feedback.statusHistory) {
        feedback.statusHistory = [];
      }
      feedback.statusHistory.push({
        status: 'completed',
        changedBy: req.user.id,
        changedAt: new Date(),
        notes: 'Status updated automatically after admin response'
      });
    }
    
    await feedback.save();
    
    // Populate the response for return
    await feedback.populate('adminResponse.respondedBy', 'name email');
    
    res.status(200).json({
      success: true,
      message: 'Admin response added successfully',
      data: feedback
    });
  } catch (error) {
    console.error('Error adding admin response:', error);
    return next(new ErrorResponse('Failed to add admin response', 500));
  }
});

/**
 * @desc    Get feedback statistics
 * @route   GET /api/feedback/stats
 * @access  Private (Admin)
 */
export const getFeedbackStats = asyncHandler(async (req, res, next) => {
  try {
    // Get counts by status
    const statusCounts = await Feedback.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Get counts by type
    const typeCounts = await Feedback.aggregate([
      {
        $group: {
          _id: '$feedbackType',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Get counts by priority
    const priorityCounts = await Feedback.aggregate([
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Get average rating and rating distribution
    const ratingStats = await Feedback.aggregate([
      {
        $group: {
          _id: null,
          averageRating: { $avg: '$rating' },
          totalRatings: { $sum: 1 },
          ratings: {
            $push: '$rating'
          }
        }
      }
    ]);
    
    // Get rating distribution
    const ratingDistribution = await Feedback.aggregate([
      {
        $group: {
          _id: '$rating',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Get recent feedback count (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentCount = await Feedback.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });
    
    // Get response rate
    const totalWithResponses = await Feedback.countDocuments({
      'adminResponse.message': { $exists: true }
    });
    
    // Get total count
    const totalCount = await Feedback.countDocuments();
    
    // Calculate trends (compare with previous period)
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    
    const previousPeriodCount = await Feedback.countDocuments({
      createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo }
    });
    
    // Format the response
    const stats = {
      total: totalCount,
      recentCount,
      responseRate: totalCount > 0 ? ((totalWithResponses / totalCount) * 100).toFixed(1) : 0,
      averageRating: ratingStats[0]?.averageRating?.toFixed(1) || 0,
      totalRatings: ratingStats[0]?.totalRatings || 0,
      trends: {
        current: recentCount,
        previous: previousPeriodCount,
        change: recentCount - previousPeriodCount,
        changePercent: previousPeriodCount > 0 ? 
          (((recentCount - previousPeriodCount) / previousPeriodCount) * 100).toFixed(1) : 0
      },
      byStatus: {},
      byType: {},
      byPriority: {},
      ratingDistribution: {}
    };
    
    // Format status counts
    statusCounts.forEach(item => {
      stats.byStatus[item._id] = item.count;
    });
    
    // Format type counts
    typeCounts.forEach(item => {
      stats.byType[item._id] = item.count;
    });
    
    // Format priority counts
    priorityCounts.forEach(item => {
      stats.byPriority[item._id] = item.count;
    });
    
    // Format rating distribution
    ratingDistribution.forEach(item => {
      stats.ratingDistribution[item._id] = item.count;
    });
    
    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting feedback stats:', error);
    return next(new ErrorResponse('Failed to get feedback statistics', 500));
  }
});

/**
 * @desc    Get real-time feedback notifications for admin
 * @route   GET /api/feedback/notifications
 * @access  Private (Admin)
 */
export const getFeedbackNotifications = asyncHandler(async (req, res, next) => {
  try {
    // Get recent feedback (last 24 hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const recentFeedback = await Feedback.find({
      createdAt: { $gte: yesterday },
      status: 'new'
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('name email feedbackType rating message createdAt priority')
    .populate('user', 'name');

    // Get counts by status for badges
    const statusCounts = await Feedback.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get urgent/high priority feedback
    const urgentFeedback = await Feedback.find({
      priority: { $in: ['urgent', 'high'] },
      status: { $ne: 'completed' }
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('name email feedbackType rating priority createdAt');

    // Format status counts
    const counts = {};
    statusCounts.forEach(item => {
      counts[item._id] = item.count;
    });

    res.status(200).json({
      success: true,
      data: {
        recentFeedback,
        urgentFeedback,
        counts,
        totalNew: counts.new || 0,
        totalPending: (counts.new || 0) + (counts['in-progress'] || 0),
        totalUrgent: urgentFeedback.length
      }
    });
  } catch (error) {
    console.error('Error fetching feedback notifications:', error);
    return next(new ErrorResponse('Failed to fetch feedback notifications', 500));
  }
});

/**
 * @desc    Bulk update feedback items
 * @route   PUT /api/feedback/bulk-update
 * @access  Private (Admin)
 */
export const bulkUpdateFeedback = asyncHandler(async (req, res, next) => {
  try {
    const { ids, updates } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return next(new ErrorResponse('Please provide feedback IDs to update', 400));
    }
    
    if (!updates || Object.keys(updates).length === 0) {
      return next(new ErrorResponse('Please provide updates to apply', 400));
    }
    
    // Validate updates
    const allowedUpdates = ['status', 'priority', 'adminNotes'];
    const updateKeys = Object.keys(updates);
    const isValidUpdate = updateKeys.every(key => allowedUpdates.includes(key));
    
    if (!isValidUpdate) {
      return next(new ErrorResponse('Invalid update fields provided', 400));
    }
    
    // Apply updates
    const result = await Feedback.updateMany(
      { _id: { $in: ids } },
      { 
        ...updates,
        updatedAt: new Date()
      }
    );
    
    res.status(200).json({
      success: true,
      message: `Successfully updated ${result.modifiedCount} feedback items`,
      data: {
        matched: result.matchedCount,
        modified: result.modifiedCount
      }
    });
  } catch (error) {
    console.error('Error in bulk update:', error);
    return next(new ErrorResponse('Failed to bulk update feedback', 500));
  }
});

/**
 * @desc    Export feedback data
 * @route   GET /api/feedback/export/:format
 * @access  Private (Admin)
 */
export const exportFeedback = asyncHandler(async (req, res, next) => {
  try {
    const { format } = req.params;
    const allowedFormats = ['csv', 'json'];
    
    if (!allowedFormats.includes(format)) {
      return next(new ErrorResponse('Invalid export format. Use csv or json', 400));
    }
    
    // Get all feedback data
    const feedback = await Feedback.find({})
      .populate('user', 'name email')
      .populate('adminResponse.respondedBy', 'name')
      .sort({ createdAt: -1 });
    
    if (format === 'csv') {
      // Convert to CSV format
      const csvHeader = 'ID,Name,Email,Type,Rating,Status,Priority,Message,Created,Admin Notes,Admin Response\n';
      const csvData = feedback.map(item => {
        const row = [
          item._id,
          `"${item.name}"`,
          item.email,
          item.feedbackType,
          item.rating,
          item.status,
          item.priority || 'medium',
          `"${item.message.replace(/"/g, '""')}"`,
          item.createdAt.toISOString(),
          `"${(item.adminNotes || '').replace(/"/g, '""')}"`,
          `"${(item.adminResponse?.message || '').replace(/"/g, '""')}"`
        ];
        return row.join(',');
      }).join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="feedback-export-${Date.now()}.csv"`);
      res.send(csvHeader + csvData);
    } else {
      // JSON format
      const jsonData = {
        exportDate: new Date().toISOString(),
        totalRecords: feedback.length,
        data: feedback
      };
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="feedback-export-${Date.now()}.json"`);
      res.json(jsonData);
    }
  } catch (error) {
    console.error('Error exporting feedback:', error);
    return next(new ErrorResponse('Failed to export feedback data', 500));
  }
});

/**
 * @desc    Get detailed analytics for feedback
 * @route   GET /api/feedback/analytics
 * @access  Private (Admin)
 */
export const getFeedbackAnalytics = asyncHandler(async (req, res, next) => {
  try {
    // Time-based analytics (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Daily feedback counts for the last 30 days
    const dailyFeedback = await Feedback.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 },
          averageRating: { $avg: '$rating' }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);
    
    // Page-based analytics
    const pageAnalytics = await Feedback.aggregate([
      {
        $group: {
          _id: '$pageContext.page',
          count: { $sum: 1 },
          averageRating: { $avg: '$rating' }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);
    
    // Response time analytics
    const responseTimeAnalytics = await Feedback.aggregate([
      {
        $match: {
          'adminResponse.respondedAt': { $exists: true }
        }
      },
      {
        $project: {
          responseTime: {
            $divide: [
              { $subtract: ['$adminResponse.respondedAt', '$createdAt'] },
              1000 * 60 * 60 // Convert to hours
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          averageResponseTime: { $avg: '$responseTime' },
          minResponseTime: { $min: '$responseTime' },
          maxResponseTime: { $max: '$responseTime' }
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        dailyFeedback,
        pageAnalytics,
        responseTime: responseTimeAnalytics[0] || {
          averageResponseTime: 0,
          minResponseTime: 0,
          maxResponseTime: 0
        }
      }
    });
  } catch (error) {
    console.error('Error getting feedback analytics:', error);
    return next(new ErrorResponse('Failed to get feedback analytics', 500));
  }
});