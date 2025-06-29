// server/routes/userProfile.js
import express from 'express';
import {
  getUserProfile,
  updateBasicProfile,
  updateUserAddress,
  updateNotificationPreferences,
  addUserService,
  uploadServiceVerification,
  getUserServices,
  generateServiceQRCode,
  getUserFavorites,
  getUserReviews,
  updateUserActivity,
  getUserQRCodes,
  deleteUserService,
  updateUserService
} from '../controllers/userProfileController.js';

import { protect } from '../middleware/auth.js';
import { uploadSingle } from '../middleware/upload.js';

const router = express.Router();

// All routes are protected (require authentication)
router.use(protect);

// === BASIC PROFILE ROUTES ===
// Get complete user profile
router.get('/profile', getUserProfile);

// Update basic profile info (with optional avatar upload)
router.put('/profile/basic', uploadSingle('avatar'), updateBasicProfile);

// Update address information
router.put('/profile/address', updateUserAddress);

// Update notification preferences
router.put('/profile/notifications', updateNotificationPreferences);

// === FAVORITES ROUTES ===
// Get user's favorites (extending existing functionality)
router.get('/profile/favorites', getUserFavorites);

// === BUSINESS/SERVICE ROUTES ===
// Get user's services
router.get('/profile/services', getUserServices);

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

// Get all user's QR codes
router.get('/profile/qr-codes', getUserQRCodes);

// === REVIEWS & RATINGS ROUTES ===
// Get user's review history (given and received)
router.get('/profile/reviews', getUserReviews);

// === ACTIVITY & GAMIFICATION ROUTES ===
// Update user activity and points
router.post('/profile/activity', updateUserActivity);

export default router;
