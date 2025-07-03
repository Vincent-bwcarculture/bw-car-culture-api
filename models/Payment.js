// server/models/Payment.js - Payment Model for Flutterwave Integration

import mongoose from 'mongoose';

const PaymentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Payment must belong to a user']
  },
  listing: {
    type: mongoose.Schema.ObjectId,
    ref: 'Listing',
    required: [true, 'Payment must be associated with a listing']
  },
  transactionRef: {
    type: String,
    required: [true, 'Transaction reference is required'],
    unique: true,
    index: true
  },
  amount: {
    type: Number,
    required: [true, 'Payment amount is required'],
    min: [1, 'Amount must be greater than 0']
  },
  currency: {
    type: String,
    required: [true, 'Currency is required'],
    default: 'BWP',
    enum: ['BWP', 'USD', 'ZAR']
  },
  subscriptionTier: {
    type: String,
    required: [true, 'Subscription tier is required'],
    enum: ['basic', 'standard', 'premium'],
    lowercase: true
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'completed', 'failed', 'cancelled', 'refunded'],
    default: 'pending',
    index: true
  },
  paymentMethod: {
    type: String,
    required: true,
    enum: ['flutterwave', 'manual', 'other'],
    default: 'flutterwave'
  },
  flutterwaveData: {
    paymentLink: String,
    flwRef: String,
    transactionId: String,
    refundId: String,
    completedAt: Date
  },
  metadata: {
    duration: {
      type: Number,
      default: 30 // days
    },
    callbackUrl: String,
    userAgent: String,
    ipAddress: String
  },
  refundStatus: {
    type: String,
    enum: ['none', 'requested', 'approved', 'rejected', 'completed', 'failed'],
    default: 'none'
  },
  refundReason: String,
  refundAmount: Number,
  refundRequestedAt: Date,
  refundCompletedAt: Date,
  refundRejectedAt: Date,
  refundFailedAt: Date,
  adminNotes: String,
  failureReason: String,
  completedAt: Date,
  analytics: {
    conversionSource: String, // 'hero_section', 'marketplace', 'profile', etc.
    deviceType: String,
    browserInfo: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
PaymentSchema.index({ user: 1, status: 1 });
PaymentSchema.index({ listing: 1 });
PaymentSchema.index({ subscriptionTier: 1, status: 1 });
PaymentSchema.index({ createdAt: -1 });
PaymentSchema.index({ 'flutterwaveData.transactionId': 1 });

// Virtual for payment duration in days
PaymentSchema.virtual('durationDays').get(function() {
  return this.metadata?.duration || 30;
});

// Virtual for subscription end date
PaymentSchema.virtual('subscriptionEndDate').get(function() {
  if (this.completedAt && this.metadata?.duration) {
    const endDate = new Date(this.completedAt);
    endDate.setDate(endDate.getDate() + this.metadata.duration);
    return endDate;
  }
  return null;
});

// Virtual for time remaining
PaymentSchema.virtual('timeRemaining').get(function() {
  const endDate = this.subscriptionEndDate;
  if (endDate && this.status === 'completed') {
    const now = new Date();
    const remaining = endDate - now;
    return remaining > 0 ? Math.ceil(remaining / (1000 * 60 * 60 * 24)) : 0;
  }
  return 0;
});

// Static method to get user's payment statistics
PaymentSchema.statics.getUserStats = function(userId) {
  return this.aggregate([
    { $match: { user: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        totalPayments: { $sum: 1 },
        totalSpent: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, '$amount', 0] } },
        successfulPayments: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        failedPayments: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        avgTransactionValue: { $avg: { $cond: [{ $eq: ['$status', 'completed'] }, '$amount', null] } },
        preferredTier: { $first: '$subscriptionTier' } // Most recent tier
      }
    }
  ]);
};

// Static method to get revenue analytics
PaymentSchema.statics.getRevenueAnalytics = function(startDate, endDate) {
  const match = { status: 'completed' };
  if (startDate && endDate) {
    match.completedAt = { $gte: startDate, $lte: endDate };
  }

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          tier: '$subscriptionTier',
          date: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } }
        },
        revenue: { $sum: '$amount' },
        transactions: { $sum: 1 }
      }
    },
    { $sort: { '_id.date': 1, '_id.tier': 1 } }
  ]);
};

// Instance method to check if payment is expired
PaymentSchema.methods.isExpired = function() {
  if (this.status !== 'completed') return false;
  const endDate = this.subscriptionEndDate;
  return endDate ? new Date() > endDate : false;
};

// Instance method to calculate refund eligibility
PaymentSchema.methods.isRefundEligible = function() {
  // Can only refund completed payments
  if (this.status !== 'completed') return false;
  
  // Cannot refund if already refunded or refund is in progress
  if (this.refundStatus !== 'none') return false;
  
  // Check if within refund window (e.g., 7 days)
  const refundWindow = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  const now = new Date();
  const paymentAge = now - this.completedAt;
  
  return paymentAge <= refundWindow;
};

// Pre-save middleware to set completion timestamp
PaymentSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'completed' && !this.completedAt) {
    this.completedAt = new Date();
  }
  next();
});

// Post-save middleware for analytics tracking
PaymentSchema.post('save', async function(doc) {
  // Update payment analytics in background
  if (doc.status === 'completed' && doc.isModified('status')) {
    try {
      // You can implement additional analytics tracking here
      console.log(`Payment ${doc._id} completed: ${doc.amount} ${doc.currency} for ${doc.subscriptionTier} tier`);
    } catch (error) {
      console.error('Payment analytics tracking error:', error);
    }
  }
});

const Payment = mongoose.model('Payment', PaymentSchema);

export default Payment;
