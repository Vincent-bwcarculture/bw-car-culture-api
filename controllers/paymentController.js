// server/controllers/paymentController.js - Part 1 - Flutterwave Integration

import axios from 'axios';
import crypto from 'crypto';
import asyncHandler from '../middleware/async.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import Payment from '../models/Payment.js';
import Listing from '../models/Listing.js';
import User from '../models/User.js';

// Flutterwave configuration
const FLW_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY;
const FLW_PUBLIC_KEY = process.env.FLUTTERWAVE_PUBLIC_KEY;
const FLW_BASE_URL = 'https://api.flutterwave.com/v3';

// Subscription pricing (matching frontend)
const SUBSCRIPTION_PRICING = {
  basic: { price: 50, duration: 30 }, // 30 days
  standard: { price: 100, duration: 30 },
  premium: { price: 200, duration: 30 }
};

// @desc    Initiate payment for listing subscription
// @route   POST /api/payments/initiate
// @access  Private
export const initiatePayment = asyncHandler(async (req, res, next) => {
  const { listingId, subscriptionTier, callbackUrl } = req.body;

  // Validate subscription tier
  if (!SUBSCRIPTION_PRICING[subscriptionTier]) {
    return next(new ErrorResponse('Invalid subscription tier', 400));
  }

  // Check if listing exists and belongs to user
  const listing = await Listing.findOne({
    _id: listingId,
    'dealer.user': req.user.id
  });

  if (!listing) {
    return next(new ErrorResponse('Listing not found or access denied', 404));
  }

  const tierConfig = SUBSCRIPTION_PRICING[subscriptionTier];
  const txRef = `listing_${listingId}_${Date.now()}`;
  
  // Create payment record
  const payment = await Payment.create({
    user: req.user.id,
    listing: listingId,
    transactionRef: txRef,
    amount: tierConfig.price,
    currency: 'BWP',
    subscriptionTier,
    status: 'pending',
    paymentMethod: 'flutterwave',
    metadata: {
      duration: tierConfig.duration,
      callbackUrl: callbackUrl || `${process.env.CLIENT_URL}/profile?tab=vehicles`
    }
  });

  // Prepare Flutterwave payment payload
  const paymentData = {
    tx_ref: txRef,
    amount: tierConfig.price,
    currency: 'BWP',
    redirect_url: `${process.env.SERVER_URL}/api/payments/verify`,
    customer: {
      email: req.user.email,
      phonenumber: req.user.profile?.phone || '',
      name: req.user.name
    },
    customizations: {
      title: 'BW Car Culture - Car Listing Subscription',
      description: `${subscriptionTier.charAt(0).toUpperCase() + subscriptionTier.slice(1)} listing subscription`,
      logo: `${process.env.CLIENT_URL}/logo.png`
    },
    meta: {
      listing_id: listingId,
      subscription_tier: subscriptionTier,
      user_id: req.user.id,
      payment_id: payment._id
    }
  };

  try {
    // Initialize payment with Flutterwave
    const response = await axios.post(`${FLW_BASE_URL}/payments`, paymentData, {
      headers: {
        'Authorization': `Bearer ${FLW_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.status === 'success') {
      // Update payment record with Flutterwave data
      payment.flutterwaveData = {
        paymentLink: response.data.data.link,
        flwRef: response.data.data.id
      };
      await payment.save();

      res.status(200).json({
        success: true,
        data: {
          paymentLink: response.data.data.link,
          transactionRef: txRef,
          amount: tierConfig.price,
          currency: 'BWP'
        }
      });
    } else {
      throw new Error('Failed to initialize payment');
    }
  } catch (error) {
    console.error('Flutterwave payment initialization error:', error.response?.data || error.message);
    
    // Mark payment as failed
    payment.status = 'failed';
    payment.failureReason = error.response?.data?.message || error.message;
    await payment.save();

    return next(new ErrorResponse('Payment initialization failed', 500));
  }
});

// @desc    Verify payment after user completes transaction
// @route   POST /api/payments/verify
// @access  Private
export const verifyPayment = asyncHandler(async (req, res, next) => {
  const { transaction_id, tx_ref } = req.body;

  if (!transaction_id && !tx_ref) {
    return next(new ErrorResponse('Transaction ID or reference is required', 400));
  }

  try {
    // Verify payment with Flutterwave
    const verificationUrl = transaction_id 
      ? `${FLW_BASE_URL}/transactions/${transaction_id}/verify`
      : `${FLW_BASE_URL}/transactions/verify_by_reference?tx_ref=${tx_ref}`;

    const response = await axios.get(verificationUrl, {
      headers: {
        'Authorization': `Bearer ${FLW_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.status === 'success' && response.data.data.status === 'successful') {
      const transactionData = response.data.data;
      const txRef = transactionData.tx_ref;
      
      // Find payment record
      const payment = await Payment.findOne({ transactionRef: txRef });
      
      if (!payment) {
        return next(new ErrorResponse('Payment record not found', 404));
      }

      // Verify amount and currency
      if (transactionData.amount !== payment.amount || transactionData.currency !== payment.currency) {
        payment.status = 'failed';
        payment.failureReason = 'Amount or currency mismatch';
        await payment.save();
        return next(new ErrorResponse('Payment verification failed: amount mismatch', 400));
      }

      // Update payment status
      payment.status = 'completed';
      payment.flutterwaveData = {
        ...payment.flutterwaveData,
        transactionId: transactionData.id,
        flwRef: transactionData.flw_ref,
        completedAt: new Date(transactionData.created_at)
      };
      payment.completedAt = new Date();
      await payment.save();

      // Activate listing subscription
      const listing = await Listing.findById(payment.listing);
      if (listing) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + payment.metadata.duration);

        listing.subscription = {
          tier: payment.subscriptionTier,
          status: 'active',
          expiresAt: expiresAt,
          paymentId: payment._id
        };
        listing.status = 'published'; // Activate the listing
        await listing.save();
      }

      // Update user's subscription history
      const user = await User.findById(payment.user);
      if (user) {
        if (!user.subscriptionHistory) {
          user.subscriptionHistory = [];
        }
        user.subscriptionHistory.push({
          subscriptionTier: payment.subscriptionTier,
          amount: payment.amount,
          startDate: new Date(),
          endDate: expiresAt,
          paymentId: payment._id,
          listingId: payment.listing
        });
        await user.save();
      }

      res.status(200).json({
        success: true,
        message: 'Payment verified successfully',
        data: {
          transactionId: transactionData.id,
          amount: transactionData.amount,
          currency: transactionData.currency,
          listingId: payment.listing,
          subscriptionTier: payment.subscriptionTier,
          expiresAt: listing?.subscription?.expiresAt
        }
      });
    } else {
      // Payment failed
      const payment = await Payment.findOne({ 
        transactionRef: tx_ref || transaction_id 
      });
      
      if (payment) {
        payment.status = 'failed';
        payment.failureReason = response.data.data?.processor_response || 'Payment unsuccessful';
        await payment.save();
      }

      return next(new ErrorResponse('Payment verification failed', 400));
    }
  } catch (error) {
    console.error('Payment verification error:', error.response?.data || error.message);
    return next(new ErrorResponse('Payment verification failed', 500));
  }
});

// @desc    Get user's payment history
// @route   GET /api/payments/history
// @access  Private
export const getPaymentHistory = asyncHandler(async (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const payments = await Payment.find({ user: req.user.id })
    .populate('listing', 'title images.main price')
    .sort('-createdAt')
    .skip(skip)
    .limit(limit);

  const total = await Payment.countDocuments({ user: req.user.id });

  res.status(200).json({
    success: true,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      total,
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1
    },
    data: payments
  });
});

// server/controllers/paymentController.js - Part 2 - Webhooks & Additional Functions

// @desc    Process Flutterwave webhook notifications
// @route   POST /api/payments/webhook
// @access  Public (but verified with signature)
export const processWebhook = asyncHandler(async (req, res, next) => {
  const secretHash = process.env.FLUTTERWAVE_SECRET_HASH;
  const signature = req.headers['verif-hash'];

  // Verify webhook signature
  if (!signature || signature !== secretHash) {
    console.warn('Invalid webhook signature received');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const payload = req.body;
  
  try {
    if (payload.event === 'charge.completed') {
      const txRef = payload.data.tx_ref;
      
      // Find payment record
      const payment = await Payment.findOne({ transactionRef: txRef });
      
      if (payment && payment.status === 'pending') {
        // Verify the transaction with Flutterwave
        const response = await axios.get(
          `${FLW_BASE_URL}/transactions/${payload.data.id}/verify`,
          {
            headers: {
              'Authorization': `Bearer ${FLW_SECRET_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.data.status === 'success' && response.data.data.status === 'successful') {
          // Update payment status
          payment.status = 'completed';
          payment.flutterwaveData = {
            ...payment.flutterwaveData,
            transactionId: payload.data.id,
            flwRef: payload.data.flw_ref,
            completedAt: new Date()
          };
          payment.completedAt = new Date();
          await payment.save();

          // Activate listing subscription
          const listing = await Listing.findById(payment.listing);
          if (listing) {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + payment.metadata.duration);

            listing.subscription = {
              tier: payment.subscriptionTier,
              status: 'active',
              expiresAt: expiresAt,
              paymentId: payment._id
            };
            listing.status = 'published';
            await listing.save();
          }

          console.log(`Payment ${payment._id} completed via webhook`);
        }
      }
    }

    res.status(200).json({ message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// @desc    Get user's active subscriptions
// @route   GET /api/payments/subscriptions
// @access  Private
export const getUserSubscriptions = asyncHandler(async (req, res, next) => {
  const activePayments = await Payment.find({
    user: req.user.id,
    status: 'completed'
  }).populate({
    path: 'listing',
    select: 'title images.main price subscription status',
    match: { 'subscription.status': 'active' }
  }).sort('-createdAt');

  // Filter out payments where listing is null (expired subscriptions)
  const activeSubscriptions = activePayments.filter(payment => payment.listing);

  // Calculate subscription stats
  const subscriptionStats = {
    total: activeSubscriptions.length,
    totalSpent: activePayments.reduce((sum, payment) => sum + payment.amount, 0),
    byTier: {
      basic: activeSubscriptions.filter(p => p.subscriptionTier === 'basic').length,
      standard: activeSubscriptions.filter(p => p.subscriptionTier === 'standard').length,
      premium: activeSubscriptions.filter(p => p.subscriptionTier === 'premium').length
    }
  };

  res.status(200).json({
    success: true,
    data: {
      subscriptions: activeSubscriptions,
      stats: subscriptionStats
    }
  });
});

// @desc    Request refund for a payment (admin approval required)
// @route   POST /api/payments/refund/:transactionId
// @access  Private
export const refundPayment = asyncHandler(async (req, res, next) => {
  const { transactionId } = req.params;
  const { reason } = req.body;

  // Find payment by transaction ID
  const payment = await Payment.findOne({
    'flutterwaveData.transactionId': transactionId,
    user: req.user.id
  });

  if (!payment) {
    return next(new ErrorResponse('Payment not found', 404));
  }

  if (payment.status !== 'completed') {
    return next(new ErrorResponse('Only completed payments can be refunded', 400));
  }

  if (payment.refundStatus === 'requested' || payment.refundStatus === 'completed') {
    return next(new ErrorResponse('Refund already requested or completed', 400));
  }

  // Update payment with refund request
  payment.refundStatus = 'requested';
  payment.refundReason = reason;
  payment.refundRequestedAt = new Date();
  await payment.save();

  // TODO: Notify admin about refund request
  // You can implement email notification or admin dashboard notification here

  res.status(200).json({
    success: true,
    message: 'Refund request submitted successfully. It will be reviewed by our team.',
    data: {
      transactionId,
      refundStatus: 'requested',
      refundReason: reason
    }
  });
});

// @desc    Process refund (admin only)
// @route   POST /api/admin/payments/process-refund/:paymentId
// @access  Private/Admin
export const processRefund = asyncHandler(async (req, res, next) => {
  const { paymentId } = req.params;
  const { approved, adminNotes } = req.body;

  const payment = await Payment.findById(paymentId);
  
  if (!payment) {
    return next(new ErrorResponse('Payment not found', 404));
  }

  if (payment.refundStatus !== 'requested') {
    return next(new ErrorResponse('No pending refund request found', 400));
  }

  if (!approved) {
    // Reject refund
    payment.refundStatus = 'rejected';
    payment.refundRejectedAt = new Date();
    payment.adminNotes = adminNotes;
    await payment.save();

    return res.status(200).json({
      success: true,
      message: 'Refund request rejected',
      data: payment
    });
  }

  try {
    // Process refund with Flutterwave
    const refundData = {
      amount: payment.amount,
      currency: payment.currency,
      id: payment.flutterwaveData.transactionId
    };

    const response = await axios.post(`${FLW_BASE_URL}/transactions/refund`, refundData, {
      headers: {
        'Authorization': `Bearer ${FLW_SECRET_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.status === 'success') {
      // Update payment record
      payment.refundStatus = 'completed';
      payment.refundCompletedAt = new Date();
      payment.refundAmount = payment.amount;
      payment.adminNotes = adminNotes;
      payment.flutterwaveData.refundId = response.data.data.id;
      await payment.save();

      // Deactivate listing subscription
      const listing = await Listing.findById(payment.listing);
      if (listing && listing.subscription) {
        listing.subscription.status = 'cancelled';
        listing.subscription.cancelledAt = new Date();
        listing.status = 'draft'; // Unpublish the listing
        await listing.save();
      }

      res.status(200).json({
        success: true,
        message: 'Refund processed successfully',
        data: payment
      });
    } else {
      throw new Error('Refund processing failed');
    }
  } catch (error) {
    console.error('Refund processing error:', error.response?.data || error.message);
    
    payment.refundStatus = 'failed';
    payment.refundFailedAt = new Date();
    payment.adminNotes = `${adminNotes}\n\nRefund failed: ${error.message}`;
    await payment.save();

    return next(new ErrorResponse('Refund processing failed', 500));
  }
});

// @desc    Get payment analytics (admin only)
// @route   GET /api/admin/payments/analytics
// @access  Private/Admin
export const getPaymentAnalytics = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;
  
  const matchCondition = {};
  if (startDate && endDate) {
    matchCondition.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  // Aggregate payment data
  const analytics = await Payment.aggregate([
    { $match: matchCondition },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0] } },
        totalTransactions: { $sum: 1 },
        completedTransactions: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        pendingTransactions: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        failedTransactions: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        averageTransactionValue: { $avg: { $cond: [{ $eq: ['$status', 'completed'] }, '$amount', null] } }
      }
    }
  ]);

  // Revenue by subscription tier
  const revenueByTier = await Payment.aggregate([
    { $match: { ...matchCondition, status: 'completed' } },
    {
      $group: {
        _id: '$subscriptionTier',
        revenue: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  // Daily revenue trend (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const dailyRevenue = await Payment.aggregate([
    {
      $match: {
        status: 'completed',
        completedAt: { $gte: thirtyDaysAgo }
      }
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
        revenue: { $sum: '$amount' },
        transactions: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  res.status(200).json({
    success: true,
    data: {
      overview: analytics[0] || {
        totalRevenue: 0,
        totalTransactions: 0,
        completedTransactions: 0,
        pendingTransactions: 0,
        failedTransactions: 0,
        averageTransactionValue: 0
      },
      revenueByTier,
      dailyRevenue
    }
  });
});
