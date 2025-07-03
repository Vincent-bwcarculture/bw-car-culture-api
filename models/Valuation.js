// server/models/Valuation.js - Car Valuation Model

import mongoose from 'mongoose';

const ValuationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'Valuation must belong to a user']
  },
  vehicleInfo: {
    make: {
      type: String,
      required: [true, 'Vehicle make is required'],
      trim: true,
      maxlength: [50, 'Make cannot exceed 50 characters']
    },
    model: {
      type: String,
      required: [true, 'Vehicle model is required'],
      trim: true,
      maxlength: [50, 'Model cannot exceed 50 characters']
    },
    year: {
      type: Number,
      required: [true, 'Vehicle year is required'],
      min: [1950, 'Year must be 1950 or later'],
      max: [new Date().getFullYear() + 1, 'Year cannot be in the future']
    },
    mileage: {
      type: Number,
      min: [0, 'Mileage cannot be negative'],
      max: [1000000, 'Mileage seems unrealistic']
    },
    condition: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor'],
      lowercase: true
    },
    bodyType: String,
    transmission: {
      type: String,
      enum: ['manual', 'automatic', 'cvt'],
      lowercase: true
    },
    fuelType: {
      type: String,
      enum: ['petrol', 'diesel', 'hybrid', 'electric'],
      lowercase: true
    },
    engineSize: String,
    color: String
  },
  images: [{
    url: {
      type: String,
      required: true
    },
    key: {
      type: String,
      required: true
    },
    size: Number,
    mimetype: String,
    thumbnail: String,
    description: String,
    angle: {
      type: String,
      enum: ['front', 'rear', 'driver_side', 'passenger_side', 'interior_front', 'interior_rear', 'engine', 'odometer', 'damage', 'other'],
      default: 'other'
    }
  }],
  additionalInfo: {
    type: String,
    maxlength: [1000, 'Additional info cannot exceed 1000 characters']
  },
  contactInfo: {
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    },
    phone: String,
    preferredMethod: {
      type: String,
      enum: ['email', 'phone', 'both'],
      default: 'email'
    }
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'cancelled'],
    default: 'pending',
    index: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  estimate: {
    value: {
      type: Number,
      min: [0, 'Estimated value cannot be negative']
    },
    lowRange: Number,
    highRange: Number,
    currency: {
      type: String,
      default: 'BWP',
      enum: ['BWP', 'USD', 'ZAR']
    },
    marketConditions: String,
    valuerNotes: String,
    confidenceLevel: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    },
    methodology: String,
    comparableVehicles: [{
      make: String,
      model: String,
      year: Number,
      mileage: Number,
      price: Number,
      source: String,
      date: Date
    }],
    valuedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    },
    valuedAt: Date
  },
  analytics: {
    timeToComplete: Number, // minutes from request to completion
    userSatisfactionRating: {
      type: Number,
      min: 1,
      max: 5
    },
    userFeedback: String,
    viewCount: {
      type: Number,
      default: 0
    },
    downloadCount: {
      type: Number,
      default: 0
    }
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: Date,
  cancelledAt: Date,
  cancelReason: String,
  internalNotes: [{
    note: String,
    addedBy: {
      type: mongoose.Schema.ObjectId,
      ref: 'User'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
ValuationSchema.index({ user: 1, status: 1 });
ValuationSchema.index({ status: 1, createdAt: -1 });
ValuationSchema.index({ 'vehicleInfo.make': 1, 'vehicleInfo.model': 1 });
ValuationSchema.index({ 'vehicleInfo.year': 1 });
ValuationSchema.index({ priority: 1, status: 1 });
ValuationSchema.index({ requestedAt: -1 });

// Virtual for vehicle description
ValuationSchema.virtual('vehicleDescription').get(function() {
  const { make, model, year, mileage } = this.vehicleInfo;
  let description = `${year} ${make} ${model}`;
  if (mileage) {
    description += ` - ${mileage.toLocaleString()}km`;
  }
  return description;
});

// Virtual for time since request
ValuationSchema.virtual('timeSinceRequest').get(function() {
  const now = new Date();
  const diffInMs = now - this.requestedAt;
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  
  if (diffInHours < 1) {
    return 'Less than 1 hour ago';
  } else if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  } else {
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  }
});

// Virtual for completion time
ValuationSchema.virtual('completionTime').get(function() {
  if (this.completedAt && this.requestedAt) {
    const diffInMs = this.completedAt - this.requestedAt;
    const diffInHours = Math.round(diffInMs / (1000 * 60 * 60));
    return diffInHours;
  }
  return null;
});

// Virtual for estimated range display
ValuationSchema.virtual('estimateRange').get(function() {
  if (!this.estimate?.value) return null;
  
  const { value, lowRange, highRange, currency } = this.estimate;
  if (lowRange && highRange) {
    return `${currency} ${lowRange.toLocaleString()} - ${highRange.toLocaleString()}`;
  }
  return `${currency} ${value.toLocaleString()}`;
});

// Static method to get valuation statistics
ValuationSchema.statics.getValuationStats = function(startDate, endDate) {
  const match = {};
  if (startDate && endDate) {
    match.createdAt = { $gte: startDate, $lte: endDate };
  }

  return this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalRequests: { $sum: 1 },
        completedRequests: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        pendingRequests: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        inProgressRequests: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
        avgEstimateValue: { $avg: '$estimate.value' },
        avgCompletionTime: { $avg: '$analytics.timeToComplete' }
      }
    }
  ]);
};

// Static method to get popular vehicle makes
ValuationSchema.statics.getPopularMakes = function(limit = 10) {
  return this.aggregate([
    {
      $group: {
        _id: '$vehicleInfo.make',
        count: { $sum: 1 },
        avgEstimate: { $avg: '$estimate.value' },
        latestRequest: { $max: '$createdAt' }
      }
    },
    { $sort: { count: -1 } },
    { $limit: limit }
  ]);
};

// Instance method to calculate urgency score
ValuationSchema.methods.getUrgencyScore = function() {
  let score = 0;
  
  // Age of request
  const hoursOld = (Date.now() - this.requestedAt) / (1000 * 60 * 60);
  if (hoursOld > 48) score += 3;
  else if (hoursOld > 24) score += 2;
  else if (hoursOld > 12) score += 1;
  
  // Priority level
  const priorityScores = { low: 0, medium: 1, high: 2, urgent: 3 };
  score += priorityScores[this.priority] || 0;
  
  // Number of images (more images = more serious)
  if (this.images.length >= 5) score += 1;
  
  // Additional info provided
  if (this.additionalInfo && this.additionalInfo.length > 100) score += 1;
  
  return score;
};

// Instance method to add internal note
ValuationSchema.methods.addInternalNote = function(note, userId) {
  this.internalNotes.push({
    note,
    addedBy: userId,
    addedAt: new Date()
  });
  return this.save();
};

// Instance method to update status with timestamp
ValuationSchema.methods.updateStatus = function(newStatus, userId = null) {
  this.status = newStatus;
  
  if (newStatus === 'completed') {
    this.completedAt = new Date();
    
    // Calculate completion time
    if (this.requestedAt) {
      const diffInMs = this.completedAt - this.requestedAt;
      this.analytics.timeToComplete = Math.round(diffInMs / (1000 * 60)); // in minutes
    }
  } else if (newStatus === 'cancelled') {
    this.cancelledAt = new Date();
  }
  
  // Add status change note
  if (userId) {
    this.internalNotes.push({
      note: `Status changed to ${newStatus}`,
      addedBy: userId,
      addedAt: new Date()
    });
  }
  
  return this.save();
};

// Pre-save middleware
ValuationSchema.pre('save', function(next) {
  // Auto-set priority based on vehicle value indicators
  if (this.isNew) {
    const { make, year } = this.vehicleInfo;
    const luxuryBrands = ['BMW', 'Mercedes', 'Audi', 'Lexus', 'Porsche', 'Jaguar'];
    const currentYear = new Date().getFullYear();
    
    if (luxuryBrands.includes(make) || (currentYear - year) <= 2) {
      this.priority = 'high';
    }
  }
  
  next();
});

// Post-save middleware for notifications
ValuationSchema.post('save', async function(doc) {
  // Send notifications on status changes
  if (doc.isModified('status')) {
    try {
      // Implement notification logic here
      console.log(`Valuation ${doc._id} status changed to ${doc.status}`);
      
      // You can add email notifications, push notifications, etc.
    } catch (error) {
      console.error('Notification error:', error);
    }
  }
});

const Valuation = mongoose.model('Valuation', ValuationSchema);

export default Valuation;
