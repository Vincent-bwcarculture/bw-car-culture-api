// server/routes/providerRequestRoutes.js
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import asyncHandler from '../middleware/async.js';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import ProviderRequest from '../models/ProviderRequest.js';
import User from '../models/User.js';
import ServiceProvider from '../models/ServiceProvider.js';
import { uploadMultipleToS3 } from '../utils/s3Upload.js';
import { deleteFromS3, deleteMultipleFromS3 } from '../utils/s3Delete.js';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for S3 uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    // Accept documents and images
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only image and PDF files are allowed!'), false);
    }
  }
});

// @desc    Create a new provider request
// @route   POST /api/provider-requests
// @access  Private (User)
router.post('/', 
  protect, 
  upload.array('documents', 5), 
  asyncHandler(async (req, res, next) => {
    try {
      // Parse request data
      const requestData = JSON.parse(req.body.requestData || '{}');
      
      // Check if user already has a pending request
      const existingRequest = await ProviderRequest.findOne({
        user: req.user.id,
        status: 'pending'
      });
      
      if (existingRequest) {
        return next(
          new ErrorResponse(
            'You already have a pending provider access request. Please wait for it to be processed.',
            400
          )
        );
      }
      
      // Handle file uploads with S3
      let documents = [];
      if (req.files?.length > 0) {
        console.log('Uploading provider request documents to S3...');
        
        const uploadResults = await uploadMultipleToS3(req.files, 'provider-requests', {
          params: {
            ACL: 'private' // Documents should not be public
          }
        });
        
        documents = uploadResults.map(result => ({
          filename: req.files.find(f => f.originalname === result.originalname)?.originalname || result.filename,
          path: result.url,
          url: result.url,
          key: result.key,
          mimetype: result.mimetype,
          size: result.size
        }));
      }
      
      console.log('Creating provider request with documents from S3:', documents);
      
      // Create provider request
      const providerRequest = await ProviderRequest.create({
        user: req.user.id,
        businessName: requestData.businessName,
        providerType: requestData.providerType,
        businessType: requestData.businessType,
        contact: requestData.contact,
        location: requestData.location,
        documents
      });
      
      console.log('Provider request created:', providerRequest);
      
      res.status(201).json({
        success: true,
        message: 'Provider access request submitted successfully.',
        data: providerRequest
      });
    } catch (error) {
      console.error('Error creating provider request:', error);
      
      // Clean up uploaded files from S3 if there was an error
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
      
      return next(new ErrorResponse('Failed to submit provider request', 500));
    }
  })
);

// @desc    Get all provider requests
// @route   GET /api/provider-requests
// @access  Private (Admin)
router.get('/', protect, authorize('admin'), asyncHandler(async (req, res, next) => {
  try {
    console.log('Fetching all provider requests...');
    // Filter by status if provided
    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }
    
    const requests = await ProviderRequest.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 });
    
    console.log(`Found ${requests.length} provider requests`);
    
    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    console.error('Error fetching provider requests:', error);
    next(error);
  }
}));

// @desc    Get a single provider request
// @route   GET /api/provider-requests/:id
// @access  Private (Admin)
router.get('/:id', protect, authorize('admin'), asyncHandler(async (req, res, next) => {
  const request = await ProviderRequest.findById(req.params.id)
    .populate('user', 'name email')
    .populate('reviewedBy', 'name email');
  
  if (!request) {
    return next(new ErrorResponse(`Request not found with id ${req.params.id}`, 404));
  }
  
  res.status(200).json({
    success: true,
    data: request
  });
}));

// @desc    Update provider request status
// @route   PUT /api/provider-requests/:id/status
// @access  Private (Admin)
router.put('/:id/status', protect, authorize('admin'), asyncHandler(async (req, res, next) => {
  console.log(`Updating provider request ${req.params.id} status to ${req.body.status}`);
  
  const { status, notes } = req.body;
  
  if (!['approved', 'rejected'].includes(status)) {
    return next(new ErrorResponse('Invalid status value', 400));
  }
  
  const request = await ProviderRequest.findById(req.params.id);
  
  if (!request) {
    return next(new ErrorResponse(`Request not found with id ${req.params.id}`, 404));
  }
  
  // Update the request
  request.status = status;
  request.reviewNotes = notes;
  request.reviewedBy = req.user.id;
  request.reviewedAt = Date.now();
  
  await request.save();
  console.log(`Provider request ${req.params.id} status updated to ${status}`);
  
  // If approved, update user role and create a service provider
  if (status === 'approved') {
    console.log(`Creating service provider for approved request ${req.params.id}`);
    const user = await User.findById(request.user);
    
    if (user) {
      // Update user role to provider
      user.role = 'provider';
      await user.save();
      console.log(`User ${user._id} role updated to provider`);
      
      // Create service provider
      try {
        const serviceProvider = await ServiceProvider.create({
          user: user._id,
          businessName: request.businessName,
          providerType: request.providerType,
          businessType: request.businessType,
          contact: request.contact,
          location: request.location,
          verification: {
            status: 'verified',
            verifiedAt: Date.now(),
            verifiedBy: req.user.id
          }
        });
        
        console.log(`Service provider created: ${serviceProvider._id}`);
        
        // Add provider ID to user
        user.providerId = serviceProvider._id;
        await user.save();
      } catch (error) {
        console.error('Error creating service provider:', error);
        // We'll continue even if service provider creation fails
        // The request has already been approved
      }
    }
  }
  
  res.status(200).json({
    success: true,
    message: `Request ${status} successfully`,
    data: request
  });
}));

// @desc    Delete provider request
// @route   DELETE /api/provider-requests/:id
// @access  Private (Admin)
router.delete('/:id', protect, authorize('admin'), asyncHandler(async (req, res, next) => {
  const request = await ProviderRequest.findById(req.params.id);
  
  if (!request) {
    return next(new ErrorResponse(`Request not found with id ${req.params.id}`, 404));
  }
  
  // Delete associated files from S3
  if (request.documents && request.documents.length > 0) {
    const documentUrls = request.documents.map(doc => doc.url || doc.path).filter(Boolean);
    if (documentUrls.length > 0) {
      await deleteMultipleFromS3(documentUrls);
    }
  }
  
  await request.remove();
  
  res.status(200).json({
    success: true,
    message: 'Provider request deleted successfully',
    data: {}
  });
}));

// @desc    Get provider requests by user
// @route   GET /api/provider-requests/user/me
// @access  Private
router.get('/user/me', protect, asyncHandler(async (req, res, next) => {
  const requests = await ProviderRequest.find({ user: req.user.id })
    .sort({ createdAt: -1 });
  
  res.status(200).json({
    success: true,
    count: requests.length,
    data: requests
  });
}));

export default router;