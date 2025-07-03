// server/routes/paymentRoutes.js - Flutterwave Payment Integration

import express from 'express';
import {
  initiatePayment,
  verifyPayment,
  getPaymentHistory,
  processWebhook,
  refundPayment,
  getUserSubscriptions
} from '../controllers/paymentController.js';

import { protect } from '../middleware/auth.js';

const router = express.Router();

// === PUBLIC ROUTES ===
// Webhook endpoint for Flutterwave notifications
router.post('/webhook', processWebhook);

// Test route
router.get('/test', (req, res) => {
  res.status(200).json({ message: 'Payment routes loaded successfully' });
});

// === PROTECTED ROUTES ===
// Initiate payment for listing subscription
router.post('/initiate', protect, initiatePayment);

// Verify payment after user completes transaction
router.post('/verify', protect, verifyPayment);

// Get user's payment history
router.get('/history', protect, getPaymentHistory);

// Get user's active subscriptions
router.get('/subscriptions', protect, getUserSubscriptions);

// Request refund (admin approval required)
router.post('/refund/:transactionId', protect, refundPayment);

export default router;
