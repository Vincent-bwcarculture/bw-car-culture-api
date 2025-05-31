// server/controllers/userController.js
import User from '../models/User.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import asyncHandler from '../middleware/async.js';
import { uploadImage, deleteImage } from '../utils/imageUpload.js';

/**
 * @desc    Get all users (admin)
 * @route   GET /api/users
 * @access  Private/Admin
 */
export const getUsers = asyncHandler(async (req, res, next) => {
  // Apply pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const startIndex = (page - 1) * limit;
  
  // Apply filters
  const filter = {};
  
  // Filter by role
  if (req.query.role && req.query.role !== 'all') {
    filter.role = req.query.role;
  }
  
  // Filter by status
  if (req.query.status && req.query.status !== 'all') {
    filter.status = req.query.status;
  }
  
  // Search by name or email
  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { email: { $regex: req.query.search, $options: 'i' } }
    ];
  }
  
  // Count total documents
  const total = await User.countDocuments(filter);
  
  // Execute query
  const users = await User.find(filter)
    .select('-password')
    .sort(req.query.sort || '-createdAt')
    .skip(startIndex)
    .limit(limit);
  
  // Create pagination object
  const pagination = {
    currentPage: page,
    totalPages: Math.ceil(total / limit),
    total
  };
  
  res.status(200).json({
    success: true,
    pagination,
    count: users.length,
    data: users
  });
});

/**
 * @desc    Get single user
 * @route   GET /api/users/:id
 * @access  Private/Admin
 */
export const getUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id).select('-password');
  
  if (!user) {
    return next(new ErrorResponse(`User not found with id ${req.params.id}`, 404));
  }
  
  res.status(200).json({
    success: true,
    data: user
  });
});

/**
 * @desc    Create user (admin)
 * @route   POST /api/users
 * @access  Private/Admin
 */
export const createUser = asyncHandler(async (req, res, next) => {
  // Extract data from request
  const { name, email, password, role, status } = req.body;
  
  // Basic validation
  if (!name || !email || !password) {
    return next(new ErrorResponse('Please provide name, email and password', 400));
  }
  
  // Check if email already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new ErrorResponse('Email already in use', 400));
  }
  
  // Handle avatar upload if present
  let avatarData = null;
  if (req.file) {
    try {
      const result = await uploadImage(req.file, 'avatars');
      avatarData = {
        url: result.url,
        key: result.key,
        size: result.size,
        mimetype: result.mimetype
      };
    } catch (error) {
      console.error('Avatar upload error:', error);
      // Continue without avatar if upload fails
    }
  }
  
  // Create user
  const user = await User.create({
    name,
    email,
    password,
    role: role || 'user',
    status: status || 'active',
    avatar: avatarData
  });
  
  // Remove password from response
  user.password = undefined;
  
  res.status(201).json({
    success: true,
    data: user
  });
});

/**
 * @desc    Update user (admin)
 * @route   PUT /api/users/:id
 * @access  Private/Admin
 */
export const updateUser = asyncHandler(async (req, res, next) => {
  // Check if user exists
  let user = await User.findById(req.params.id);
  
  if (!user) {
    return next(new ErrorResponse(`User not found with id ${req.params.id}`, 404));
  }
  
  // Extract fields to update
  const { name, email, role, status } = req.body;
  const updateData = {};
  
  // Only add fields that are provided
  if (name) updateData.name = name;
  if (email) {
    // Check if email already exists for another user
    const existingUser = await User.findOne({ email, _id: { $ne: req.params.id } });
    if (existingUser) {
      return next(new ErrorResponse('Email already in use by another user', 400));
    }
    updateData.email = email;
  }
  if (role) updateData.role = role;
  if (status) updateData.status = status;
  
  // Handle avatar upload if present
  if (req.file) {
    try {
      // Delete old avatar if it exists
      if (user.avatar?.key) {
        await deleteImage(user.avatar.key);
      }
      
      // Upload new avatar
      const result = await uploadImage(req.file, 'avatars');
      
      // Add to update data
      updateData.avatar = {
        url: result.url,
        key: result.key,
        size: result.size,
        mimetype: result.mimetype
      };
    } catch (error) {
      console.error('Avatar upload error:', error);
      return next(new ErrorResponse('Failed to upload avatar', 500));
    }
  }
  
  // Update user
  user = await User.findByIdAndUpdate(
    req.params.id,
    updateData,
    {
      new: true,
      runValidators: true
    }
  ).select('-password');
  
  res.status(200).json({
    success: true,
    data: user
  });
});

/**
 * @desc    Delete user
 * @route   DELETE /api/users/:id
 * @access  Private/Admin
 */
export const deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    return next(new ErrorResponse(`User not found with id ${req.params.id}`, 404));
  }
  
  // Delete avatar from S3 if it exists
  if (user.avatar?.key) {
    try {
      await deleteImage(user.avatar.key);
    } catch (error) {
      console.error('Error deleting avatar from S3:', error);
      // Continue with user deletion even if avatar deletion fails
    }
  }
  
  await user.remove();
  
  res.status(200).json({
    success: true,
    data: {}
  });
});

/**
 * @desc    Get current user profile
 * @route   GET /api/users/me
 * @access  Private
 */
export const getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id).select('-password');
  
  res.status(200).json({
    success: true,
    data: user
  });
});

/**
 * @desc    Update user profile
 * @route   PUT /api/users/profile
 * @access  Private
 */
export const updateProfile = asyncHandler(async (req, res, next) => {
  // Extract fields to update
  const { name, email } = req.body;
  const updateData = {};
  
  // Only add fields that are provided
  if (name) updateData.name = name;
  if (email) {
    // Check if email already exists for another user
    const existingUser = await User.findOne({ email, _id: { $ne: req.user.id } });
    if (existingUser) {
      return next(new ErrorResponse('Email already in use by another user', 400));
    }
    updateData.email = email;
  }
  
  // Handle avatar upload if present
  if (req.file) {
    try {
      // Get current user
      const user = await User.findById(req.user.id);
      
      // Delete old avatar if it exists
      if (user.avatar?.key) {
        await deleteImage(user.avatar.key);
      }
      
      // Upload new avatar
      const result = await uploadImage(req.file, 'avatars');
      
      // Add to update data
      updateData.avatar = {
        url: result.url,
        key: result.key,
        size: result.size,
        mimetype: result.mimetype
      };
    } catch (error) {
      console.error('Avatar upload error:', error);
      return next(new ErrorResponse('Failed to upload avatar', 500));
    }
  }
  
  // Update user
  const user = await User.findByIdAndUpdate(
    req.user.id,
    updateData,
    {
      new: true,
      runValidators: true
    }
  ).select('-password');
  
  res.status(200).json({
    success: true,
    data: user
  });
});

/**
 * @desc    Update password
 * @route   PUT /api/users/password
 * @access  Private
 */
export const updatePassword = asyncHandler(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  
  if (!currentPassword || !newPassword) {
    return next(new ErrorResponse('Please provide current and new password', 400));
  }
  
  // Get user with password
  const user = await User.findById(req.user.id).select('+password');
  
  // Check current password
  const isMatch = await user.matchPassword(currentPassword);
  if (!isMatch) {
    return next(new ErrorResponse('Current password is incorrect', 401));
  }
  
  // Update password
  user.password = newPassword;
  await user.save();
  
  res.status(200).json({
    success: true,
    message: 'Password updated successfully'
  });
});

/**
 * @desc    Delete my account
 * @route   DELETE /api/users/me
 * @access  Private
 */
export const deleteMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  
  // Delete avatar from S3 if it exists
  if (user.avatar?.key) {
    try {
      await deleteImage(user.avatar.key);
    } catch (error) {
      console.error('Error deleting avatar from S3:', error);
      // Continue with user deletion even if avatar deletion fails
    }
  }
  
  await user.remove();
  
  res.status(200).json({
    success: true,
    message: 'Your account has been deleted'
  });
});

/**
 * @desc    Get users with specific role
 * @route   GET /api/users/role/:role
 * @access  Private/Admin
 */
export const getUsersByRole = asyncHandler(async (req, res, next) => {
  const { role } = req.params;
  
  if (!['user', 'admin', 'provider', 'ministry'].includes(role)) {
    return next(new ErrorResponse('Invalid role specified', 400));
  }
  
  const users = await User.find({ role }).select('-password');
  
  res.status(200).json({
    success: true,
    count: users.length,
    data: users
  });
});

/**
 * @desc    Change user role
 * @route   PUT /api/users/:id/role
 * @access  Private/Admin
 */
export const changeUserRole = asyncHandler(async (req, res, next) => {
  const { role } = req.body;
  
  if (!role || !['user', 'admin', 'provider', 'ministry'].includes(role)) {
    return next(new ErrorResponse('Please provide a valid role', 400));
  }
  
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { role },
    {
      new: true,
      runValidators: true
    }
  ).select('-password');
  
  if (!user) {
    return next(new ErrorResponse(`User not found with id ${req.params.id}`, 404));
  }
  
  res.status(200).json({
    success: true,
    data: user
  });
});

/**
 * @desc    Toggle user status (active/suspended)
 * @route   PUT /api/users/:id/status
 * @access  Private/Admin
 */
export const toggleUserStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.body;
  
  if (!status || !['active', 'suspended', 'pending'].includes(status)) {
    return next(new ErrorResponse('Please provide a valid status', 400));
  }
  
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { status },
    {
      new: true,
      runValidators: true
    }
  ).select('-password');
  
  if (!user) {
    return next(new ErrorResponse(`User not found with id ${req.params.id}`, 404));
  }
  
  res.status(200).json({
    success: true,
    data: user
  });
});

/**
 * @desc    Delete user avatar
 * @route   DELETE /api/users/avatar
 * @access  Private
 */
export const deleteAvatar = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  
  if (!user.avatar?.key) {
    return next(new ErrorResponse('No avatar to delete', 400));
  }
  
  // Delete avatar from S3
  try {
    await deleteImage(user.avatar.key);
  } catch (error) {
    console.error('Error deleting avatar from S3:', error);
    return next(new ErrorResponse('Failed to delete avatar', 500));
  }
  
  // Update user to remove avatar
  user.avatar = null;
  await user.save();
  
  res.status(200).json({
    success: true,
    message: 'Avatar deleted successfully'
  });
});

// Export all functions
export {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  getMe,
  updateProfile,
  updatePassword,
  deleteMe,
  getUsersByRole,
  changeUserRole,
  toggleUserStatus,
  deleteAvatar
};