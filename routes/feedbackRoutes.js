// server/routes/feedbackRoutes.js - Complete with all updates
import express from 'express';
import multer from 'multer';
import { protect, authorize } from '../middleware/auth.js';
import { uploadMultipleToS3 } from '../utils/s3Upload.js';
import { deleteFromS3, deleteMultipleFromS3 } from '../utils/s3Delete.js';
import {
  submitFeedback,
  getFeedback,
  getFeedbackById,
  updateFeedbackStatus,
  deleteFeedback,
  addAdminResponse,
  getFeedbackStats,
  getFeedbackNotifications,
  bulkUpdateFeedback,
  exportFeedback,
  getFeedbackAnalytics
} from '../controllers/feedbackController.js';

const router = express.Router();

// Configure multer for S3 uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB limit per file
    files: 3 // Maximum 3 files per feedback
  },
  fileFilter: (req, file, cb) => {
    // Accept images, PDFs, and text files for feedback attachments
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf',
      'text/plain',
      'text/csv',
      'application/json'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, PDFs, and text files are allowed.'), false);
    }
  }
});

// =============================================
// PUBLIC ROUTES
// =============================================

// Submit feedback with optional attachments
router.post('/', 
  upload.array('attachments', 3), 
  async (req, res, next) => {
    try {
      // Handle file uploads to S3
      let attachments = [];
      if (req.files && req.files.length > 0) {
        console.log('Uploading feedback attachments to S3...');
        
        const uploadResults = await uploadMultipleToS3(req.files, 'feedback', {
          params: {
            ACL: 'private' // Feedback attachments should be private
          },
          optimization: {
            quality: 85,
            format: 'webp'
          },
          createThumbnail: false // Don't create thumbnails for feedback attachments
        });
        
        attachments = uploadResults.map((result, index) => ({
          url: result.url,
          key: result.key,
          size: result.size,
          mimetype: result.mimetype,
          filename: req.files[index].originalname
        }));
      }
      
      // Add attachments to request for controller
      req.s3Attachments = attachments;
      
      // Call the submitFeedback controller
      submitFeedback(req, res, next);
    } catch (error) {
      console.error('Feedback submission with S3 upload failed:', error);
      
      // Clean up any uploaded files if there was an error
      if (req.files && req.files.length > 0) {
        try {
          const uploadedUrls = req.files.map(file => file.s3Url).filter(Boolean);
          if (uploadedUrls.length > 0) {
            await deleteMultipleFromS3(uploadedUrls);
          }
        } catch (cleanupError) {
          console.error('Error during S3 cleanup:', cleanupError);
        }
      }
      
      res.status(500).json({
        success: false,
        message: 'Failed to submit feedback',
        error: error.message
      });
    }
  }
);

// Track feedback by email (for users to check their feedback status)
router.get('/track/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const Feedback = await import('../models/Feedback.js').then(module => module.default);
    
    // Find feedback by email but only return basic info
    const feedback = await Feedback.find({ email })
      .select('name feedbackType message rating status createdAt adminResponse.message adminResponse.respondedAt')
      .sort('-createdAt')
      .limit(10); // Limit to last 10 feedback items
    
    res.status(200).json({
      success: true,
      count: feedback.length,
      data: feedback
    });
  } catch (error) {
    console.error('Error tracking feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Error tracking feedback',
      error: error.message
    });
  }
});

// Submit feedback via WhatsApp (tracking endpoint)
router.post('/whatsapp-submitted', async (req, res) => {
  try {
    // This endpoint can be used to track when feedback was submitted via WhatsApp
    const { name, email, feedbackType, rating, message } = req.body;
    
    // Log WhatsApp feedback submission for analytics
    console.log('Feedback submitted via WhatsApp:', {
      name,
      email,
      feedbackType,
      rating,
      timestamp: new Date(),
      method: 'whatsapp'
    });
    
    res.status(200).json({
      success: true,
      message: 'WhatsApp feedback submission tracked'
    });
  } catch (error) {
    console.error('Error tracking WhatsApp feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Error tracking WhatsApp feedback'
    });
  }
});

// =============================================
// PROTECTED ROUTES (ADMIN ONLY)
// =============================================

// Apply authentication middleware to all routes below
router.use(protect);

// Get all feedback with advanced filtering and pagination
router.get('/', authorize('admin'), getFeedback);

// Get feedback statistics and analytics
router.get('/stats', authorize('admin'), getFeedbackStats);

// Get real-time notifications for admin dashboard
router.get('/notifications', authorize('admin'), getFeedbackNotifications);

// Get detailed analytics for feedback
router.get('/analytics', authorize('admin'), getFeedbackAnalytics);

// Export feedback data
router.get('/export/:format', authorize('admin'), exportFeedback);

// Get single feedback by ID
router.get('/:id', authorize('admin'), getFeedbackById);

// Update feedback status and admin notes
router.put('/:id/status', authorize('admin'), updateFeedbackStatus);

// Add or update admin response to feedback
router.put('/:id/response', authorize('admin'), addAdminResponse);

// Bulk update multiple feedback items
router.put('/bulk-update', authorize('admin'), bulkUpdateFeedback);

// Delete feedback (includes S3 cleanup)
router.delete('/:id', 
  authorize('admin'),
  async (req, res, next) => {
    try {
      // Get the feedback to find attachment URLs
      const Feedback = await import('../models/Feedback.js').then(module => module.default);
      const feedback = await Feedback.findById(req.params.id);
      
      if (feedback && feedback.attachments && feedback.attachments.length > 0) {
        // Delete all attachments from S3
        const attachmentKeys = feedback.attachments.map(attachment => attachment.key);
        await deleteMultipleFromS3(attachmentKeys);
        console.log(`Deleted ${attachmentKeys.length} feedback attachments from S3`);
      }
      
      // Call original deleteFeedback controller
      deleteFeedback(req, res, next);
    } catch (error) {
      console.error('Feedback deletion with S3 cleanup failed:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete feedback',
        error: error.message
      });
    }
  }
);

// Get feedback attachments metadata
router.get('/:id/attachments', 
  authorize('admin'), 
  async (req, res) => {
    try {
      const Feedback = await import('../models/Feedback.js').then(module => module.default);
      const feedback = await Feedback.findById(req.params.id);
      
      if (!feedback) {
        return res.status(404).json({
          success: false,
          message: 'Feedback not found'
        });
      }
      
      // Return only attachment metadata
      const attachments = feedback.attachments?.map(attachment => ({
        url: attachment.url,
        filename: attachment.filename,
        size: attachment.size,
        mimetype: attachment.mimetype,
        uploadedAt: attachment.uploadedAt || feedback.createdAt
      })) || [];
      
      res.status(200).json({
        success: true,
        count: attachments.length,
        data: attachments
      });
    } catch (error) {
      console.error('Error fetching feedback attachments:', error);
      res.status(500).json({
        success: false,
        message: 'Error fetching attachments',
        error: error.message
      });
    }
  }
);

// Download a specific attachment
router.get('/:id/attachments/:attachmentIndex', 
  authorize('admin'), 
  async (req, res) => {
    try {
      const Feedback = await import('../models/Feedback.js').then(module => module.default);
      const feedback = await Feedback.findById(req.params.id);
      
      if (!feedback) {
        return res.status(404).json({
          success: false,
          message: 'Feedback not found'
        });
      }
      
      const attachmentIndex = parseInt(req.params.attachmentIndex);
      const attachment = feedback.attachments?.[attachmentIndex];
      
      if (!attachment) {
        return res.status(404).json({
          success: false,
          message: 'Attachment not found'
        });
      }
      
      // Generate a signed URL for secure download (if using S3)
      // For now, redirect to the attachment URL
      res.redirect(301, attachment.url);
    } catch (error) {
      console.error('Error downloading feedback attachment:', error);
      res.status(500).json({
        success: false,
        message: 'Error downloading attachment',
        error: error.message
      });
    }
  }
);

// Update feedback priority
router.put('/:id/priority', 
  authorize('admin'), 
  async (req, res) => {
    try {
      const { priority } = req.body;
      const validPriorities = ['low', 'medium', 'high', 'urgent'];
      
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid priority level'
        });
      }
      
      const Feedback = await import('../models/Feedback.js').then(module => module.default);
      const feedback = await Feedback.findByIdAndUpdate(
        req.params.id,
        { priority },
        { new: true }
      );
      
      if (!feedback) {
        return res.status(404).json({
          success: false,
          message: 'Feedback not found'
        });
      }
      
      res.status(200).json({
        success: true,
        data: feedback
      });
    } catch (error) {
      console.error('Error updating feedback priority:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating priority'
      });
    }
  }
);

// Archive/Unarchive feedback
router.put('/:id/archive', 
  authorize('admin'), 
  async (req, res) => {
    try {
      const { archived = true } = req.body;
      const Feedback = await import('../models/Feedback.js').then(module => module.default);
      
      const feedback = await Feedback.findByIdAndUpdate(
        req.params.id,
        { 
          status: archived ? 'archived' : 'completed',
          archivedAt: archived ? new Date() : null
        },
        { new: true }
      );
      
      if (!feedback) {
        return res.status(404).json({
          success: false,
          message: 'Feedback not found'
        });
      }
      
      res.status(200).json({
        success: true,
        message: `Feedback ${archived ? 'archived' : 'unarchived'} successfully`,
        data: feedback
      });
    } catch (error) {
      console.error('Error archiving feedback:', error);
      res.status(500).json({
        success: false,
        message: 'Error archiving feedback'
      });
    }
  }
);

// Test route for feedback functionality
router.get('/test/endpoints', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Feedback routes are working',
    version: '2.0.0',
    endpoints: {
      public: {
        submit: 'POST /',
        track: 'GET /track/:email',
        whatsappTrack: 'POST /whatsapp-submitted'
      },
      admin: {
        list: 'GET /',
        stats: 'GET /stats',
        notifications: 'GET /notifications',
        analytics: 'GET /analytics',
        export: 'GET /export/:format',
        single: 'GET /:id',
        updateStatus: 'PUT /:id/status',
        addResponse: 'PUT /:id/response',
        bulkUpdate: 'PUT /bulk-update',
        delete: 'DELETE /:id',
        attachments: 'GET /:id/attachments',
        download: 'GET /:id/attachments/:index',
        priority: 'PUT /:id/priority',
        archive: 'PUT /:id/archive'
      }
    }
  });
});

export default router;