// server/controllers/authController.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import asyncHandler from '../middleware/async.js';
import crypto from 'crypto';
import { uploadImage, deleteImage } from '../utils/imageUpload.js';
import { sendEmail } from '../utils/sendEmail.js';

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
export const register = asyncHandler(async (req, res, next) => {
  const { name, email, password } = req.body;

  // Validate input
  if (!name || !email || !password) {
    return next(new ErrorResponse('Please provide all required fields', 400));
  }

  // Check if email exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new ErrorResponse('Email already registered', 400));
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
    role: 'user', // Default role for normal users
    status: 'active', // No verification required for regular users
    avatar: avatarData
  });

  // Create token
  const token = jwt.sign(
    { id: user._id },
    process.env.JWT_SECRET,
    { 
      expiresIn: '7d',
      algorithm: 'HS256' // Explicitly set algorithm
    }
  );

  // Remove password from response
  user.password = undefined;

  res.status(201).json({
    success: true,
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar
    }
  });
});

// @desc    Register Admin (requires approval)
// @route   POST /api/auth/register/admin
// @access  Public
export const registerAdmin = asyncHandler(async (req, res, next) => {
  const { name, email, password } = req.body;

  // Validate input
  if (!name || !email || !password) {
    return next(new ErrorResponse('Please provide all required fields', 400));
  }

  // Check if email exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new ErrorResponse('Email already registered', 400));
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

  // Create user with pending status
  const user = await User.create({
    name,
    email,
    password,
    role: 'admin',
    status: 'pending',
    avatar: avatarData
  });

  res.status(201).json({
    success: true,
    message: 'Registration successful! Please wait for admin approval.'
  });
});

// @desc    Login
// @route   POST /api/auth/login
// @access  Public
export const login = asyncHandler(async (req, res, next) => {
  const { email, password } = req.body;

  // Validate email and password exists
  if (!email || !password) {
    return next(new ErrorResponse('Please provide email and password', 400));
  }

  // Find user
  const user = await User.findOne({ email }).select('+password');
  
  // Check if user exists
  if (!user) {
    console.log(`User not found with email: ${email}`);
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  // Debug logging
  console.log(`Found user: ${user.email}, role: ${user.role}`);
  console.log(`Comparing password for: ${user.email}`);
  
  try {
    // Check password match using the method in User model
    const isMatch = await user.matchPassword(password);
    
    console.log(`Password match result: ${isMatch}`);

    if (!isMatch) {
      // Log for debugging but don't expose specific failure reason to client
      console.log(`Login failed: Password incorrect for ${email}`);
      return next(new ErrorResponse('Invalid credentials', 401));
    }

    // Create token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Update last login time
    user.lastLogin = new Date();
    await user.save();

    // Remove password from result
    user.password = undefined;

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar
      }
    });
  } catch (error) {
    console.error('Error during password comparison:', error);
    return next(new ErrorResponse('An error occurred during authentication', 500));
  }
});

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
export const getMe = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  res.status(200).json({
    success: true,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      lastLogin: user.lastLogin,
      favorites: user.favorites
    }
  });
});

// @desc    Logout - just for clearing cookies if needed
// @route   POST /api/auth/logout
// @access  Private
export const logout = asyncHandler(async (req, res, next) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
export const updateProfile = asyncHandler(async (req, res, next) => {
  const { name, email } = req.body;
  const updateFields = {};

  if (name) updateFields.name = name;
  if (email) {
    // Check if email is already taken
    const existingUser = await User.findOne({ email, _id: { $ne: req.user.id } });
    if (existingUser) {
      return next(new ErrorResponse('Email already in use', 400));
    }
    updateFields.email = email;
  }

  // Handle avatar upload
  if (req.file) {
    try {
      // Upload new avatar
      const result = await uploadImage(req.file, 'avatars');
      
      // Delete old avatar if it exists
      const user = await User.findById(req.user.id);
      if (user.avatar?.key) {
        await deleteImage(user.avatar.key);
      }
      
      updateFields.avatar = {
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

  const user = await User.findByIdAndUpdate(
    req.user.id,
    updateFields,
    {
      new: true,
      runValidators: true
    }
  );

  res.status(200).json({
    success: true,
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar: user.avatar
    }
  });
});

// @desc    Update password
// @route   PUT /api/auth/password
// @access  Private
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

  // Generate new token after password change
  const token = jwt.sign(
    { id: user._id },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.status(200).json({
    success: true,
    message: 'Password updated successfully',
    token
  });
});

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
export const forgotPassword = asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new ErrorResponse('Please provide an email address', 400));
  }

  const user = await User.findOne({ email });

  if (!user) {
    // Don't reveal whether a user exists for security
    return res.status(200).json({
      success: true,
      message: 'If an account exists, a password reset link will be sent to your email'
    });
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(20).toString('hex');

  // Hash token and set to resetPasswordToken field
  user.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Set expire (10 minutes)
  user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

  await user.save();

  // Create reset URL
  const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;

  // Create message
  const message = `
    <h1>Password Reset</h1>
    <p>You requested a password reset. Please click the link below to reset your password:</p>
    <a href="${resetUrl}" target="_blank">Reset Password</a>
    <p>This link will expire in 10 minutes.</p>
    <p>If you did not request this, please ignore this email.</p>
  `;

  try {
    await sendEmail({
      email: user.email,
      subject: 'Password reset token',
      message
    });

    res.status(200).json({
      success: true,
      message: 'If an account exists, a password reset link will be sent to your email'
    });
  } catch (err) {
    console.error('Email error', err);

    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    return next(new ErrorResponse('Email could not be sent', 500));
  }
});

// @desc    Reset password
// @route   PUT /api/auth/reset-password/:token
// @access  Public
export const resetPassword = asyncHandler(async (req, res, next) => {
  // Get hashed token
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() }
  });

  if (!user) {
    return next(new ErrorResponse('Invalid or expired token', 400));
  }

  // Set new password
  user.password = req.body.password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  // Create new token
  const token = jwt.sign(
    { id: user._id },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.status(200).json({
    success: true,
    message: 'Password reset successful',
    token
  });
});

// @desc    Toggle favorite listing
// @route   PUT /api/auth/favorites/:id
// @access  Private
export const toggleFavorite = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);
  const listingId = req.params.id;

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  const favorites = user.favorites || [];
  const index = favorites.indexOf(listingId);

  if (index === -1) {
    favorites.push(listingId);
  } else {
    favorites.splice(index, 1);
  }

  user.favorites = favorites;
  await user.save();

  res.status(200).json({
    success: true,
    isFavorited: index === -1,
    favorites: user.favorites
  });
});

// @desc    Get user's favorites
// @route   GET /api/auth/favorites
// @access  Private
export const getFavorites = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id).populate('favorites');

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  res.status(200).json({
    success: true,
    data: user.favorites || []
  });
});

// Admin Routes

// @desc    Get all users
// @route   GET /api/auth/users
// @access  Private (Admin)
export const getUsers = asyncHandler(async (req, res, next) => {
  const users = await User.find().select('-password');

  res.status(200).json({
    success: true,
    count: users.length,
    data: users
  });
});

// @desc    Get single user
// @route   GET /api/auth/users/:id
// @access  Private (Admin)
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

// @desc    Create user
// @route   POST /api/auth/users
// @access  Private (Admin)
export const createUser = asyncHandler(async (req, res, next) => {
  // Create user
  const user = await User.create(req.body);

  res.status(201).json({
    success: true,
    data: user
  });
});

// @desc    Update user
// @route   PUT /api/auth/users/:id
// @access  Private (Admin)
export const updateUser = asyncHandler(async (req, res, next) => {
  const updateData = { ...req.body };

  // Handle avatar upload if present
  if (req.file) {
    try {
      // Get current user to check for existing avatar
      const currentUser = await User.findById(req.params.id);
      
      // Delete old avatar from S3 if it exists
      if (currentUser?.avatar?.key) {
        await deleteImage(currentUser.avatar.key);
      }
      
      // Upload new avatar
      const result = await uploadImage(req.file, 'avatars');
      
      // Add avatar data to update object
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

  const user = await User.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true
  }).select('-password');

  if (!user) {
    return next(new ErrorResponse(`User not found with id ${req.params.id}`, 404));
  }

  res.status(200).json({
    success: true,
    data: user
  });
});

// @desc    Delete user
// @route   DELETE /api/auth/users/:id
// @access  Private (Admin)
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

// @desc    Approve a pending user
// @route   PUT /api/auth/users/:id/approve
// @access  Private (Admin)
export const approveUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  if (user.status !== 'pending') {
    return next(new ErrorResponse('User is not pending approval', 400));
  }

  user.status = 'active';
  user.approvedBy = req.user.id;
  user.approvedAt = Date.now();
  
  await user.save();

  res.status(200).json({
    success: true,
    data: user
  });
});

// Export all controller functions
// export {
//   register,
//   registerAdmin,
//   login,
//   getMe,
//   logout,
//   updateProfile,
//   updatePassword,

// };