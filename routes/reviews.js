// server/routes/reviews.js
import express from 'express';
import {
  submitQRReview,
  submitServiceCodeReview,
  submitPlateNumberReview,
  submitGeneralReview,
  getServiceReviews,
  respondToReview,
  validateQRCode,
  getReviewAnalytics
} from '../controllers/reviewController.js';

import { protect } from '../middleware/auth.js';

const router = express.Router();

// === PUBLIC ROUTES ===
// Get reviews for a specific service (public access)
router.get('/service/:serviceId', getServiceReviews);

// === PROTECTED ROUTES ===
router.use(protect); // All routes below require authentication

// === REVIEW SUBMISSION ROUTES ===
// Submit review via QR code scan
router.post('/qr-scan', submitQRReview);

// Submit review via service code
router.post('/service-code', submitServiceCodeReview);

// Submit review via plate number (transport services)
router.post('/plate-number', submitPlateNumberReview);

// Submit general review directly from business profile (NEW)
router.post('/general', submitGeneralReview);

// === VALIDATION ROUTES ===
// Validate QR code before showing review form
router.post('/validate-qr', validateQRCode);

// === RESPONSE ROUTES ===
// Respond to a review (service providers only)
router.post('/:reviewId/respond', respondToReview);

// === ANALYTICS ROUTES ===
// Get review analytics for service providers
router.get('/analytics', getReviewAnalytics);

export default router;
