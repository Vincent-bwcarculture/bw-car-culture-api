// server/controllers/roleRequestController.js
import { ErrorResponse } from '../utils/errorResponse.js';
import asyncHandler from '../middleware/async.js';
import RoleRequest from '../models/RoleRequest.js';
import User from '../models/User.js';
import Dealer from '../models/Dealer.js';
import ServiceProvider from '../models/ServiceProvider.js';
import MinistryRequest from '../models/MinistryRequest.js';

/**
 * @desc    Create a new role request
 * @route   POST /api/role-requests
 * @access  Private
 */
export const createRoleRequest = asyncHandler(async (req, res, next) => {
  try {
    const { requestType, ...requestData } = req.body;
    
    // Validate request type
    const validTypes = ['dealer', 'provider', 'ministry', 'coordinator'];
    if (!validTypes.includes(requestType)) {
      return next(new ErrorResponse('Invalid request type', 400));
    }
    
    // Check if user can request this role
    const canRequest = await RoleRequest.canUserRequestRole(req.user.id, requestType);
    if (!canRequest) {
      return next(new ErrorResponse(
        `You already have a pending ${requestType} request. Please wait for it to be processed.`,
        400
      ));
    }
    
    // Check if user already has this role
    const user = await User.findById(req.user.id);
    if (user.role === requestType) {
      return next(new ErrorResponse(`You already have ${requestType} role`, 400));
    }
    
    // Special validation for each request type
    const validationResult = await validateRequestData(requestType, requestData);
    if (!validationResult.isValid) {
      return next(new ErrorResponse(validationResult.message, 400));
    }
    
    // For ministry requests, also create a MinistryRequest for compatibility
    if (requestType === 'ministry') {
      await MinistryRequest.create({
        user: req.user.id,
        ministryName: requestData.ministryName,
        department: requestData.department,
        role: requestData.position,
        contactDetails: requestData.contactDetails,
        reason: requestData.reason
      });
    }
    
    // Create the role request
    const roleRequest = await RoleRequest.create({
      user: req.user.id,
      requestType,
      ...requestData
    });
    
    // Populate user data for response
    await roleRequest.populate('user', 'name email');
    
    res.status(201).json({
      success: true,
      message: `${requestType} role request submitted successfully. You'll receive an email when it's reviewed.`,
      data: roleRequest
    });
    
  } catch (error) {
    console.error('Error creating role request:', error);
    return next(new ErrorResponse('Failed to submit role request', 500));
  }
});

/**
 * @desc    Get all role requests (Admin)
 * @route   GET /api/role-requests
 * @access  Private/Admin
 */
export const getRoleRequests = asyncHandler(async (req, res, next) => {
  const {
    status,
    requestType,
    priority,
    page = 1,
    limit = 10,
    sort = '-createdAt'
  } = req.query;
  
  // Build filter
  const filter = {};
  
  if (status && status !== 'all') {
    filter.status = status;
  }
  
  if (requestType && requestType !== 'all') {
    filter.requestType = requestType;
  }
  
  if (priority && priority !== 'all') {
    filter.priority = priority;
  }
  
  // Pagination
  const startIndex = (page - 1) * limit;
  const total = await RoleRequest.countDocuments(filter);
  
  // Execute query
  const requests = await RoleRequest.find(filter)
    .populate('user', 'name email avatar')
    .populate('reviewedBy', 'name email')
    .sort(sort)
    .skip(startIndex)
    .limit(parseInt(limit));
  
  // Pagination info
  const pagination = {
    currentPage: parseInt(page),
    totalPages: Math.ceil(total / limit),
    total,
    hasNext: page * limit < total,
    hasPrev: page > 1
  };
  
  res.status(200).json({
    success: true,
    count: requests.length,
    pagination,
    data: requests
  });
});

/**
 * @desc    Get user's own role requests
 * @route   GET /api/role-requests/my-requests
 * @access  Private
 */
export const getMyRoleRequests = asyncHandler(async (req, res, next) => {
  const requests = await RoleRequest.getUserRequests(req.user.id);
  
  res.status(200).json({
    success: true,
    count: requests.length,
    data: requests
  });
});

/**
 * @desc    Get single role request
 * @route   GET /api/role-requests/:id
 * @access  Private (Own requests or Admin)
 */
export const getRoleRequest = asyncHandler(async (req, res, next) => {
  const request = await RoleRequest.findById(req.params.id)
    .populate('user', 'name email avatar profile')
    .populate('reviewedBy', 'name email');
  
  if (!request) {
    return next(new ErrorResponse(`Request not found with id ${req.params.id}`, 404));
  }
  
  // Check permissions - user can see own requests, admins can see all
  if (request.user._id.toString() !== req.user.id && req.user.role !== 'admin') {
    return next(new ErrorResponse('Not authorized to view this request', 403));
  }
  
  res.status(200).json({
    success: true,
    data: request
  });
});

/**
 * @desc    Update role request status (Admin)
 * @route   PUT /api/role-requests/:id/status
 * @access  Private/Admin
 */
export const updateRoleRequestStatus = asyncHandler(async (req, res, next) => {
  const { status, notes } = req.body;
  
  if (!['approved', 'rejected'].includes(status)) {
    return next(new ErrorResponse('Invalid status value', 400));
  }
  
  const request = await RoleRequest.findById(req.params.id);
  
  if (!request) {
    return next(new ErrorResponse(`Request not found with id ${req.params.id}`, 404));
  }
  
  // Update the request
  request.status = status;
  request.reviewNotes = notes;
  request.reviewedBy = req.user.id;
  request.reviewedAt = Date.now();
  
  await request.save();
  
  // If approved, process the role assignment
  if (status === 'approved') {
    try {
      const processResult = await processApprovedRequest(request);
      
      if (!processResult.success) {
        console.error('Failed to process approved request:', processResult.error);
        // Still return success for the review, but note the processing issue
      }
    } catch (error) {
      console.error('Error processing approved request:', error);
    }
  }
  
  // Also update MinistryRequest if this is a ministry request
  if (request.requestType === 'ministry') {
    try {
      await MinistryRequest.updateOne(
        { user: request.user },
        {
          $set: {
            status: status,
            reviewNotes: notes,
            reviewedBy: req.user.id,
            reviewedAt: Date.now()
          }
        }
      );
    } catch (error) {
      console.error('Error updating MinistryRequest:', error);
    }
  }
  
  res.status(200).json({
    success: true,
    message: `Request ${status} successfully`,
    data: request
  });
});

/**
 * @desc    Delete role request (Admin)
 * @route   DELETE /api/role-requests/:id
 * @access  Private/Admin
 */
export const deleteRoleRequest = asyncHandler(async (req, res, next) => {
  const request = await RoleRequest.findById(req.params.id);
  
  if (!request) {
    return next(new ErrorResponse(`Request not found with id ${req.params.id}`, 404));
  }
  
  await request.deleteOne();
  
  res.status(200).json({
    success: true,
    message: 'Role request deleted successfully',
    data: {}
  });
});

/**
 * @desc    Get role request statistics (Admin)
 * @route   GET /api/role-requests/stats
 * @access  Private/Admin
 */
export const getRoleRequestStats = asyncHandler(async (req, res, next) => {
  const stats = await RoleRequest.aggregate([
    {
      $group: {
        _id: {
          requestType: '$requestType',
          status: '$status'
        },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: '$_id.requestType',
        statuses: {
          $push: {
            status: '$_id.status',
            count: '$count'
          }
        },
        total: { $sum: '$count' }
      }
    }
  ]);
  
  // Get recent requests
  const recentRequests = await RoleRequest.find()
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .limit(5);
  
  res.status(200).json({
    success: true,
    data: {
      statistics: stats,
      recentRequests
    }
  });
});

// Helper Functions

/**
 * Validate request data based on request type
 */
async function validateRequestData(requestType, data) {
  const validations = {
    dealer: () => {
      if (!data.businessName || !data.businessType || !data.licenseNumber) {
        return { isValid: false, message: 'Business name, type, and license number are required for dealer requests' };
      }
      return { isValid: true };
    },
    
    provider: () => {
      if (!data.serviceType || !data.businessName) {
        return { isValid: false, message: 'Service type and business name are required for provider requests' };
      }
      return { isValid: true };
    },
    
    ministry: () => {
      if (!data.ministryName || !data.department || !data.position || !data.employeeId) {
        return { isValid: false, message: 'Ministry name, department, position, and employee ID are required' };
      }
      return { isValid: true };
    },
    
    coordinator: () => {
      if (!data.stationName || !data.transportExperience) {
        return { isValid: false, message: 'Station name and transport experience are required for coordinator requests' };
      }
      return { isValid: true };
    }
  };
  
  const validator = validations[requestType];
  if (!validator) {
    return { isValid: false, message: 'Unknown request type' };
  }
  
  return validator();
}

/**
 * Process approved role request
 */
async function processApprovedRequest(request) {
  try {
    const user = await User.findById(request.user);
    if (!user) {
      return { success: false, error: 'User not found' };
    }
    
    switch (request.requestType) {
      case 'dealer':
        return await processDealerApproval(user, request);
      
      case 'provider':
        return await processProviderApproval(user, request);
      
      case 'ministry':
        return await processMinistryApproval(user, request);
      
      case 'coordinator':
        return await processCoordinatorApproval(user, request);
      
      default:
        return { success: false, error: 'Unknown request type' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function processDealerApproval(user, request) {
  try {
    // Create dealer record
    const dealer = await Dealer.create({
      user: user._id,
      businessName: request.businessName,
      businessType: request.businessType,
      sellerType: 'business',
      status: 'active',
      verification: {
        status: 'verified',
        verifiedAt: Date.now(),
        verifiedBy: request.reviewedBy
      },
      contact: request.contactDetails || {},
      subscription: {
        plan: 'basic',
        status: 'active',
        startDate: Date.now()
      }
    });
    
    // Update user
    user.role = 'dealer';
    user.dealership = dealer._id;
    await user.save();
    
    request.associatedEntityId = dealer._id;
    await request.save();
    
    return { success: true, dealerId: dealer._id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function processProviderApproval(user, request) {
  try {
    // Create service provider record
    const provider = await ServiceProvider.create({
      user: user._id,
      businessName: request.businessName,
      providerType: request.serviceType,
      businessType: 'service',
      status: 'active',
      verification: {
        status: 'verified',
        verifiedAt: Date.now(),
        verifiedBy: request.reviewedBy
      },
      contact: request.contactDetails || {}
    });
    
    // Update user
    user.role = 'provider';
    user.providerId = provider._id;
    await user.save();
    
    request.associatedEntityId = provider._id;
    await request.save();
    
    return { success: true, providerId: provider._id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function processMinistryApproval(user, request) {
  try {
    // Update user role and ministry info
    user.role = 'ministry';
    user.ministryInfo = {
      ministryName: request.ministryName,
      department: request.department,
      role: request.position
    };
    await user.save();
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function processCoordinatorApproval(user, request) {
  try {
    // Update user with coordinator profile
    if (!user.coordinatorProfile) {
      user.coordinatorProfile = {};
    }
    
    user.coordinatorProfile.isCoordinator = true;
    user.coordinatorProfile.stations = [request.stationName];
    user.coordinatorProfile.approvedAt = Date.now();
    user.coordinatorProfile.approvedBy = request.reviewedBy;
    
    await user.save();
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
