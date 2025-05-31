// server/controllers/providerRequestController.js
import { ErrorResponse } from '../utils/errorResponse.js';
import asyncHandler from '../middleware/async.js';
import ProviderRequest from '../models/ProviderRequest.js';
import User from '../models/User.js';
import ServiceProvider from '../models/ServiceProvider.js';
import { uploadDocument, deleteDocument } from '../utils/documentUpload.js';

// @desc    Create a new provider request
// @route   POST /api/provider-requests
// @access  Private (User)
export const createProviderRequest = asyncHandler(async (req, res, next) => {
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
    
    // Handle file uploads
    const documents = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const result = await uploadDocument(file, 'provider-requests');
          documents.push({
            filename: file.originalname,
            url: result.url,
            key: result.key,
            mimetype: file.mimetype,
            size: file.size
          });
        } catch (error) {
          console.error('Error uploading document:', error);
          // Cleanup already uploaded documents
          for (const doc of documents) {
            await deleteDocument(doc.key).catch(err => console.error('Cleanup error:', err));
          }
          return next(new ErrorResponse(`Document upload failed: ${error.message}`, 500));
        }
      }
    }
    
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
    
    res.status(201).json({
      success: true,
      message: 'Provider access request submitted successfully.',
      data: providerRequest
    });
  } catch (error) {
    console.error('Error creating provider request:', error);
    return next(new ErrorResponse('Failed to submit provider request', 500));
  }
});

// @desc    Get all provider requests
// @route   GET /api/provider-requests
// @access  Private (Admin)
export const getProviderRequests = asyncHandler(async (req, res, next) => {
  // Filter by status if provided
  const filter = {};
  if (req.query.status) {
    filter.status = req.query.status;
  }
  
  const requests = await ProviderRequest.find(filter)
    .populate('user', 'name email')
    .sort({ createdAt: -1 });
  
  res.status(200).json({
    success: true,
    count: requests.length,
    data: requests
  });
});

// @desc    Get a single provider request
// @route   GET /api/provider-requests/:id
// @access  Private (Admin)
export const getProviderRequest = asyncHandler(async (req, res, next) => {
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
});

// @desc    Update provider request status
// @route   PUT /api/provider-requests/:id/status
// @access  Private (Admin)
export const updateProviderRequestStatus = asyncHandler(async (req, res, next) => {
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
  
  // If approved, update user role and create a service provider
  if (status === 'approved') {
    const user = await User.findById(request.user);
    
    if (user) {
      // Update user role to provider
      user.role = 'provider';
      await user.save();
      
      // Create service provider
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
      
      // Add provider ID to user
      user.providerId = serviceProvider._id;
      await user.save();
    }
  }
  
  res.status(200).json({
    success: true,
    message: `Request ${status} successfully`,
    data: request
  });
});

// @desc    Delete provider request
// @route   DELETE /api/provider-requests/:id
// @access  Private (Admin)
export const deleteProviderRequest = asyncHandler(async (req, res, next) => {
  const request = await ProviderRequest.findById(req.params.id);
  
  if (!request) {
    return next(new ErrorResponse(`Request not found with id ${req.params.id}`, 404));
  }
  
  // Delete associated files
  if (request.documents && request.documents.length > 0) {
    const deletePromises = request.documents.map(doc => deleteDocument(doc.key));
    await Promise.allSettled(deletePromises);
  }
  
  await request.remove();
  
  res.status(200).json({
    success: true,
    message: 'Provider request deleted successfully',
    data: {}
  });
});