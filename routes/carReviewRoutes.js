// server/routes/carReviewRoutes.js
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import {
  createCarReview,
  getCarReviews,
  getCarReview,
  updateCarReview,
  deleteCarReview,
  updateCarReviewStatus,
  markCarReviewHelpful,
  getReviewsByCar,
  getUserCarReviews
} from '../controllers/carReviewController.js';

const router = express.Router();

// Public routes
router.get('/', getCarReviews);
router.get('/car', getReviewsByCar);
router.get('/:id', getCarReview);

// Protected routes
router.use(protect); // All routes below require authentication

// User routes
router.post('/', createCarReview);
router.put('/:id', updateCarReview);
router.delete('/:id', deleteCarReview);
router.put('/:id/helpful', markCarReviewHelpful);
router.get('/user/me', getUserCarReviews);

// Admin routes
router.put('/:id/status', authorize('admin'), updateCarReviewStatus);

export default router;