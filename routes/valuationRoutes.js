// server/routes/valuationRoutes.js - Car Valuation System

import express from 'express';
import {
  createValuationRequest,
  getValuationRequests,
  getValuationRequest,
  updateValuationRequest,
  deleteValuationRequest,
  getMyValuations,
  submitValuationEstimate,
  getValuationStats
} from '../controllers/valuationController.js';

import { protect, authorize } from '../middleware/auth.js';
import { uploadMultiple } from '../middleware/upload.js';

const router = express.Router();

// Test route
router.get('/test', (req, res) => {
  res.status(200).json({ message: 'Valuation routes loaded successfully' });
});

// === PROTECTED ROUTES (Require Authentication) ===
// Create new valuation request (with image upload support)
router.post('/', protect, uploadMultiple('images', 8), createValuationRequest);

// Get user's own valuation requests
router.get('/my-valuations', protect, getMyValuations);

// Get single valuation request by ID
router.get('/:id', protect, getValuationRequest);

// Update valuation request (user can update before expert review)
router.put('/:id', protect, uploadMultiple('images', 8), updateValuationRequest);

// Delete valuation request
router.delete('/:id', protect, deleteValuationRequest);

// === ADMIN/EXPERT ROUTES ===
// Get all valuation requests (for experts/admins)
router.get('/admin/all', protect, authorize('admin'), getValuationRequests);

// Submit valuation estimate (experts/admins only)
router.post('/:id/estimate', protect, authorize('admin'), submitValuationEstimate);

// Get valuation statistics (admins only)
router.get('/admin/stats', protect, authorize('admin'), getValuationStats);

export default router;
