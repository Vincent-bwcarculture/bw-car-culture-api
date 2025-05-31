// server/models/ServiceProvider.js
import mongoose from 'mongoose';

// Provider types enum
export const PROVIDER_TYPES = {
  CAR_RENTAL: 'car_rental',
  TRAILER_RENTAL: 'trailer_rental', 
  PUBLIC_TRANSPORT: 'public_transport',
  WORKSHOP: 'workshop'
};

const serviceProviderSchema = new mongoose.Schema({
  businessName: {
    type: String,
    required: [true, 'Business name is required'],
    trim: true,
    maxlength: [100, 'Business name cannot exceed 100 characters']
  },
  
  providerType: {
    type: String,
    required: [true, 'Provider type is required'],
    enum: {
      values: Object.values(PROVIDER_TYPES),
      message: 'Invalid provider type'
    }
  },
  
  businessType: {
    type: String,
    required: [true, 'Business type is required'],
    enum: ['independent', 'franchise', 'certified', 'authorized', 'government']
  },
  
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Allow unassigned providers (admin managed)
  },
  
  contact: {
    phone: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    website: {
      type: String,
      trim: true
    }
  },
  
  location: {
    address: {
      type: String,
      trim: true
    },
    city: {
      type: String,
      trim: true
    },
    state: {
      type: String,
      trim: true
    },
    country: {
      type: String,
      trim: true
    },
    postalCode: {
      type: String,
      trim: true
    },
    coordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        default: [0, 0]
      }
    }
  },
  
  // FIXED: Match Dealer model approach - use simple strings for images
  profile: {
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters']
    },
    
    specialties: [{
      type: String,
      trim: true
    }],
    
    // Changed back to String like Dealer model
    logo: {
      type: String,
      default: null
    },
    
    // Changed back to String like Dealer model  
    banner: {
      type: String,
      default: null
    },
    
    workingHours: {
      monday: {
        open: { type: String, default: '' },
        close: { type: String, default: '' }
      },
      tuesday: {
        open: { type: String, default: '' },
        close: { type: String, default: '' }
      },
      wednesday: {
        open: { type: String, default: '' },
        close: { type: String, default: '' }
      },
      thursday: {
        open: { type: String, default: '' },
        close: { type: String, default: '' }
      },
      friday: {
        open: { type: String, default: '' },
        close: { type: String, default: '' }
      },
      saturday: {
        open: { type: String, default: '' },
        close: { type: String, default: '' }
      },
      sunday: {
        open: { type: String, default: '' },
        close: { type: String, default: '' }
      }
    }
  },
  
  social: {
    facebook: {
      type: String,
      trim: true
    },
    instagram: {
      type: String,
      trim: true
    },
    twitter: {
      type: String,
      trim: true
    },
    whatsapp: {
      type: String,
      trim: true
    }
  },
  
  // Service-specific data
  carRental: {
    fleetSize: {
      type: Number,
      min: [0, 'Fleet size cannot be negative']
    },
    minimumRentalPeriod: {
      type: Number,
      min: [1, 'Minimum rental period must be at least 1 day'],
      default: 1
    },
    depositRequired: {
      type: Boolean,
      default: true
    },
    insuranceIncluded: {
      type: Boolean,
      default: true
    }
  },
  
  trailerRental: {
    requiresVehicleInspection: {
      type: Boolean,
      default: true
    },
    towingCapacityRequirement: {
      type: Boolean,
      default: true
    },
    deliveryAvailable: {
      type: Boolean,
      default: false
    },
    deliveryFee: {
      type: Number,
      min: [0, 'Delivery fee cannot be negative'],
      default: 0
    }
  },
  
  publicTransport: {
    routesCount: {
      type: Number,
      min: [0, 'Routes count cannot be negative']
    },
    fleetSize: {
      type: Number,
      min: [0, 'Fleet size cannot be negative']
    },
    licensedOperator: {
      type: Boolean,
      default: true
    },
    regulatoryCompliance: {
      type: String,
      trim: true
    }
  },
  
  workshop: {
    warrantyOffered: {
      type: Boolean,
      default: true
    },
    warrantyPeriod: {
      type: String,
      trim: true
    },
    certifications: [{
      type: String,
      trim: true
    }]
  },
  
  subscription: {
    tier: {
      type: String,
      enum: ['basic', 'standard', 'premium'],
      default: 'basic'
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'expired', 'pending', 'cancelled'],
      default: 'active'
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    },
    features: {
      maxListings: {
        type: Number,
        default: 10
      },
      allowPhotography: {
        type: Boolean,
        default: true
      },
      allowReviews: {
        type: Boolean,
        default: false
      },
      allowPodcasts: {
        type: Boolean,
        default: false
      },
      allowVideos: {
        type: Boolean,
        default: false
      }
    },
    paymentHistory: [{
      amount: {
        type: Number,
        required: true
      },
      date: {
        type: Date,
        required: true
      },
      transactionId: {
        type: String,
        required: true
      },
      method: {
        type: String,
        enum: ['credit_card', 'bank_transfer', 'cash', 'mobile_money', 'paypal'],
        required: true
      }
    }]
  },
  
  verification: {
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending'
    },
    verifiedAt: {
      type: Date
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    documents: [{
      type: {
        type: String,
        required: true
      },
      url: {
        type: String,
        required: true
      },
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  
  metrics: {
    totalListings: {
      type: Number,
      default: 0
    },
    activeSales: {
      type: Number,
      default: 0
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    totalReviews: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
serviceProviderSchema.index({ providerType: 1, status: 1 });
serviceProviderSchema.index({ user: 1 });
serviceProviderSchema.index({ 'location.city': 1 });
serviceProviderSchema.index({ businessName: 'text', 'profile.description': 'text' });

// Instance methods (same as Dealer model pattern)
serviceProviderSchema.methods.isSubscriptionActive = function() {
  if (!this.subscription) return false;
  return this.subscription.status === 'active' && 
         this.subscription.expiresAt && 
         new Date() <= this.subscription.expiresAt;
};

serviceProviderSchema.methods.canAddListings = function() {
  if (!this.isSubscriptionActive()) return false;
  return this.metrics.totalListings < this.subscription.features.maxListings;
};

// ADDED: Missing canAddListing method that the transport route controller expects
serviceProviderSchema.methods.canAddListing = async function() {
  // Check if provider and subscription are active
  if (this.status !== 'active' || !this.subscription || this.subscription.status !== 'active') {
    return {
      allowed: false,
      reason: 'Provider account or subscription is not active'
    };
  }
  
  // Check if subscription is expired
  if (this.subscription.expiresAt && this.subscription.expiresAt < new Date()) {
    return {
      allowed: false,
      reason: 'Subscription has expired'
    };
  }
  
  // Get limits
  const maxAllowed = this.subscription.features?.maxListings || 10;
  const currentListings = this.metrics?.totalListings || 0;
  
  // Check if limit reached
  if (currentListings >= maxAllowed) {
    return {
      allowed: false,
      reason: `Maximum listings limit (${maxAllowed}) reached for current subscription tier`
    };
  }
  
  // All checks passed
  return {
    allowed: true,
    remainingSlots: maxAllowed - currentListings
  };
};

serviceProviderSchema.methods.getRemainingListings = function() {
  if (!this.subscription?.features?.maxListings) return 0;
  return Math.max(0, this.subscription.features.maxListings - this.metrics.totalListings);
};

// Static methods
serviceProviderSchema.statics.findByProviderType = function(type) {
  return this.find({ providerType: type, status: 'active' });
};

serviceProviderSchema.statics.findActiveProviders = function() {
  return this.find({ 
    status: 'active',
    'subscription.status': 'active',
    'subscription.expiresAt': { $gt: new Date() }
  });
};

const ServiceProvider = mongoose.model('ServiceProvider', serviceProviderSchema);

export default ServiceProvider;