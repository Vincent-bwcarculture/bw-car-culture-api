// server/controllers/ministryRequestController.js
import { ErrorResponse } from '../utils/errorResponse.js';
import asyncHandler from '../middleware/async.js';
import MinistryRequest from '../models/MinistryRequest.js';
import User from '../models/User.js';
import { uploadDocument, deleteDocument } from '../utils/documentUpload.js';

// @desc    Create a new ministry request
// @route   POST /api/ministry-requests
// @access  Private (User)
export const createMinistryRequest = asyncHandler(async (req, res, next) => {
  try {
    // Parse request data
    const requestData = JSON.parse(req.body.requestData || '{}');
    
    // Check if user already has a pending request
    const existingRequest = await MinistryRequest.findOne({
      user: req.user.id,
      status: 'pending'
    });
    
    if (existingRequest) {
      return next(
        new ErrorResponse(
          'You already have a pending ministry access request. Please wait for it to be processed.',
          400
        )
      );
    }
    
    // Handle file uploads
    const documents = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          const result = await uploadDocument(file, 'ministry-requests');
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
    
    // Create ministry request
    const ministryRequest = await MinistryRequest.create({
      user: req.user.id,
      ministryName: requestData.ministryName,
      department: requestData.department,
      role: requestData.role,
      contactDetails: requestData.contactDetails,
      reason: requestData.reason,
      documents
    });
    
    res.status(201).json({
      success: true,
      message: 'Ministry access request submitted successfully.',
      data: ministryRequest
    });
  } catch (error) {
    console.error('Error creating ministry request:', error);
    return next(new ErrorResponse('Failed to submit ministry request', 500));
  }
});

// @desc    Get all ministry requests
// @route   GET /api/ministry-requests
// @access  Private (Admin)
export const getMinistryRequests = asyncHandler(async (req, res, next) => {
  // Filter by status if provided
  const filter = {};
  if (req.query.status) {
    filter.status = req.query.status;
  }
  
  const requests = await MinistryRequest.find(filter)
    .populate('user', 'name email')
    .sort({ createdAt: -1 });
  
  res.status(200).json({
    success: true,
    count: requests.length,
    data: requests
  });
});

// @desc    Get a single ministry request
// @route   GET /api/ministry-requests/:id
// @access  Private (Admin)
export const getMinistryRequest = asyncHandler(async (req, res, next) => {
  const request = await MinistryRequest.findById(req.params.id)
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

// @desc    Update ministry request status
// @route   PUT /api/ministry-requests/:id/status
// @access  Private (Admin)
export const updateMinistryRequestStatus = asyncHandler(async (req, res, next) => {
  const { status, notes } = req.body;
  
  if (!['approved', 'rejected'].includes(status)) {
    return next(new ErrorResponse('Invalid status value', 400));
  }
  
  const request = await MinistryRequest.findById(req.params.id);
  
  if (!request) {
    return next(new ErrorResponse(`Request not found with id ${req.params.id}`, 404));
  }
  
  // Update the request
  request.status = status;
  request.reviewNotes = notes;
  request.reviewedBy = req.user.id;
  request.reviewedAt = Date.now();
  
  await request.save();
  
  // If approved, update user role
  if (status === 'approved') {
    const user = await User.findById(request.user);
    
    if (user) {
      // Update user role to ministry
      user.role = 'ministry';
      user.ministryInfo = {
        ministryName: request.ministryName,
        department: request.department,
        role: request.role
      };
      await user.save();
    }
  }
  
  res.status(200).json({
    success: true,
    message: `Request ${status} successfully`,
    data: request
  });
});

// @desc    Delete ministry request
// @route   DELETE /api/ministry-requests/:id
// @access  Private (Admin)
export const deleteMinistryRequest = asyncHandler(async (req, res, next) => {
  const request = await MinistryRequest.findById(req.params.id);
  
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
    message: 'Ministry request deleted successfully',
    data: {}
  });
});