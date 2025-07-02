// server/routes/userProfile.js - Enhanced Version
import express from 'express';
import {
  getUserProfile,
  updateBasicProfile,
  updateUserAddress,
  updateNotificationPreferences,
  updatePrivacySettings,
  updatePassword,
  addUserService,
  updateUserService,
  deleteUserService,
  uploadServiceVerification,
  generateServiceQRCode,
  getBusinessDashboardData,
  getUserFavorites,
  getUserReviews,
  deleteUserAccount
} from '../controllers/userProfileController.js';

import { protect } from '../middleware/auth.js';
import { uploadSingle } from '../middleware/upload.js';

// Import sub-route handlers
import vehicleRoutes from './vehicleRoutes.js';
import userRouteRoutes from './userRouteRoutes.js';

const router = express.Router();

// All routes are protected (require authentication)
router.use(protect);

// === SUB-ROUTES ===
// Vehicle management routes
router.use('/vehicles', vehicleRoutes);

// User route management routes  
router.use('/routes', userRouteRoutes);

// === BASIC PROFILE ROUTES ===
// Get complete user profile
router.get('/profile', getUserProfile);

// Update basic profile info (with optional avatar upload)
router.put('/profile/basic', uploadSingle('avatar'), updateBasicProfile);

// Update address information
router.put('/profile/address', updateUserAddress);

// Update notification preferences
router.put('/profile/notifications', updateNotificationPreferences);

// Update privacy settings
router.put('/profile/privacy', updatePrivacySettings);

// Update password
router.put('/profile/password', updatePassword);

// === SERVICE MANAGEMENT ROUTES ===
// Add new service to user's business profile
router.post('/profile/services', addUserService);

// Update existing service
router.put('/profile/services/:serviceId', updateUserService);

// Delete service
router.delete('/profile/services/:serviceId', deleteUserService);

// Upload verification documents for a service
router.post('/profile/services/:serviceId/verify', uploadSingle('document'), uploadServiceVerification);

// Generate QR code for verified service
router.post('/profile/services/:serviceId/qr-code', generateServiceQRCode);

// === BUSINESS DASHBOARD ROUTES ===
// Get business dashboard data
router.get('/profile/business-dashboard', getBusinessDashboardData);

// === FAVORITES ROUTES ===
// Get user's favorites
router.get('/profile/favorites', getUserFavorites);

// === REVIEWS & RATINGS ROUTES ===
// Get user's review history (given and received)
router.get('/profile/reviews', getUserReviews);

// === ACCOUNT MANAGEMENT ===
// Delete user account (soft delete)
router.delete('/profile/delete-account', deleteUserAccount);

export default router;
