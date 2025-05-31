// server/models/Dealer.js - Updated to support private sellers
import mongoose from 'mongoose';

// Define subscription tiers constants
export const SUBSCRIPTION_TIERS = {
  BASIC: 'basic',
  STANDARD: 'standard',
  PREMIUM: 'premium'
};

// Define seller types
export const SELLER_TYPES = {
  DEALERSHIP: 'dealership',
  PRIVATE: 'private'
};

// Define tier limits and features
export const TIER_LIMITS = {
  [SUBSCRIPTION_TIERS.BASIC]: {
    maxListings: 10,
    allowPhotography: true,
    allowReviews: false,
    allowPodcasts: false,
    allowVideos: false
  },
  [SUBSCRIPTION_TIERS.STANDARD]: {
    maxListings: 20,
    allowPhotography: true,
    allowReviews: true,
    allowPodcasts: true,
    allowVideos: false
  },
  [SUBSCRIPTION_TIERS.PREMIUM]: {
    maxListings: 40,
    allowPhotography: true,
    allowReviews: true,
    allowPodcasts: true,
    allowVideos: true
  }
};

const dealerSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // NEW: Seller type to distinguish between dealerships and private sellers
  sellerType: {
    type: String,
    enum: Object.values(SELLER_TYPES),
    default: SELLER_TYPES.DEALERSHIP,
    required: true
  },
  
  // For dealerships: business name, for private: can be person's name or preferred name
  businessName: {
    type: String,
    required: true
  },
  
  // Only required for dealerships
businessType: {
  type: String,
  enum: ['independent', 'franchise', 'certified'],
  required: function() {
    // More explicit check for dealership type
    return this.sellerType === 'dealership' || this.sellerType === SELLER_TYPES.DEALERSHIP;
  },
  // Set to undefined for private sellers
  validate: {
    validator: function(value) {
      // If it's a private seller, businessType should be undefined or empty
      if (this.sellerType === 'private' || this.sellerType === SELLER_TYPES.PRIVATE) {
        return !value; // Should be undefined/null/empty for private sellers
      }
      // If it's a dealership, businessType should be one of the enum values
      if (this.sellerType === 'dealership' || this.sellerType === SELLER_TYPES.DEALERSHIP) {
        return ['independent', 'franchise', 'certified'].includes(value);
      }
      return true;
    },
    message: 'BusinessType should only be set for dealerships'
  }
},
  
  contact: {
    phone: String,
    email: String,
    website: String
  },
  
  location: {
    address: String,
    city: String,
    state: String,
    country: String,
    coordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        required: false
      }
    }
  },
  
  verification: {
    status: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending'
    },
    documents: [{
      type: String,
      documentType: String,
      verificationStatus: String
    }],
    verifiedAt: Date
  },
  
  profile: {
    logo: {
      type: String,
      default: null
    },
    banner: {
      type: String,
      default: null
    },
    description: String,
    specialties: [String],
    // Working hours only relevant for dealerships
    workingHours: {
      monday: { open: String, close: String },
      tuesday: { open: String, close: String },
      wednesday: { open: String, close: String },
      thursday: { open: String, close: String },
      friday: { open: String, close: String },
      saturday: { open: String, close: String },
      sunday: { open: String, close: String }
    }
  },
  
  metrics: {
    totalListings: { type: Number, default: 0 },
    activeSales: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 }
  },
  
  subscription: {
    tier: {
      type: String,
      enum: Object.values(SUBSCRIPTION_TIERS),
      default: SUBSCRIPTION_TIERS.BASIC
    },
    status: {
      type: String,
      enum: ['active', 'pending', 'expired', 'cancelled'],
      default: 'active'
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
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
      amount: Number,
      date: Date,
      transactionId: String,
      method: String
    }]
  },
  
  status: {
    type: String,
    enum: ['active', 'suspended', 'inactive'],
    default: 'active'
  },
  
  // NEW: Private seller specific fields
  privateSeller: {
    firstName: {
      type: String,
      required: function() {
        return this.sellerType === SELLER_TYPES.PRIVATE;
      }
    },
    lastName: {
      type: String,
      required: function() {
        return this.sellerType === SELLER_TYPES.PRIVATE;
      }
    },
    preferredContactMethod: {
      type: String,
      enum: ['phone', 'email', 'both'],
      default: 'both'
    },
    canShowContactInfo: {
      type: Boolean,
      default: true
    }
  }
}, {
  timestamps: true
});

// Index for geospatial queries
dealerSchema.index({ 'location.coordinates': '2dsphere' });

// Add index for seller type
dealerSchema.index({ sellerType: 1 });

// Middleware to update features based on tier when subscription changes
dealerSchema.pre('save', function(next) {
  // If subscription tier is changing, update the features accordingly
  if (this.isModified('subscription.tier')) {
    const tier = this.subscription.tier;
    const tierConfig = TIER_LIMITS[tier];
    
    if (tierConfig) {
      this.subscription.features = {
        maxListings: tierConfig.maxListings,
        allowPhotography: tierConfig.allowPhotography,
        allowReviews: tierConfig.allowReviews,
        allowPodcasts: tierConfig.allowPodcasts,
        allowVideos: tierConfig.allowVideos
      };
    }
  }

  // If coordinates are not provided or invalid, remove the coordinates field
  if (this.location && this.location.coordinates) {
    const coords = this.location.coordinates.coordinates;
    if (!coords || !Array.isArray(coords) || coords.length !== 2 || coords.some(coord => typeof coord !== 'number' || isNaN(coord))) {
      this.location.coordinates = undefined;
    }
  }

  // Set businessName for private sellers if not provided
  if (this.sellerType === SELLER_TYPES.PRIVATE && !this.businessName) {
    if (this.privateSeller && this.privateSeller.firstName && this.privateSeller.lastName) {
      this.businessName = `${this.privateSeller.firstName} ${this.privateSeller.lastName}`;
    }
  }

  next();
});

// Method to check if seller can add more listings (same as before)
dealerSchema.methods.canAddListing = async function() {
  if (this.status !== 'active' || this.subscription.status !== 'active') {
    return {
      allowed: false,
      reason: 'Seller account or subscription is not active'
    };
  }
  
  const Listing = mongoose.model('Listing');
  const activeListingsCount = await Listing.countDocuments({
    dealerId: this._id,
    status: { $in: ['active', 'pending'] }
  });
  
  const maxAllowed = this.subscription.features.maxListings;
  
  if (activeListingsCount >= maxAllowed) {
    return {
      allowed: false,
      reason: `Maximum listings limit (${maxAllowed}) reached for current subscription tier`
    };
  }
  
  return {
    allowed: true,
    remainingSlots: maxAllowed - activeListingsCount
  };
};

// NEW: Method to get display name
dealerSchema.methods.getDisplayName = function() {
  if (this.sellerType === SELLER_TYPES.PRIVATE) {
    if (this.privateSeller && this.privateSeller.firstName && this.privateSeller.lastName) {
      return `${this.privateSeller.firstName} ${this.privateSeller.lastName}`;
    }
  }
  return this.businessName || 'Unknown Seller';
};

// NEW: Method to check if this is a private seller
dealerSchema.methods.isPrivateSeller = function() {
  return this.sellerType === SELLER_TYPES.PRIVATE;
};

// NEW: Method to check if this is a dealership
dealerSchema.methods.isDealership = function() {
  return this.sellerType === SELLER_TYPES.DEALERSHIP;
};

// Method to check if subscription is expired
dealerSchema.methods.isSubscriptionExpired = function() {
  return this.subscription.expiresAt < new Date();
};

// Method to check if seller can have reviews
dealerSchema.methods.canHaveReviews = function() {
  return this.subscription.features.allowReviews;
};

// Method to check if seller can have podcasts
dealerSchema.methods.canHavePodcasts = function() {
  return this.subscription.features.allowPodcasts;
};

// Method to check if seller can have videos
dealerSchema.methods.canHaveVideos = function() {
  return this.subscription.features.allowVideos;
};

// Static method to upgrade seller subscription
dealerSchema.statics.upgradeTier = async function(sellerId, newTier) {
  const seller = await this.findById(sellerId);
  if (!seller) {
    throw new Error('Seller not found');
  }
  
  if (!Object.values(SUBSCRIPTION_TIERS).includes(newTier)) {
    throw new Error('Invalid subscription tier');
  }
  
  seller.subscription.tier = newTier;
  
  // Apply new tier limits
  const tierConfig = TIER_LIMITS[newTier];
  seller.subscription.features = {
    maxListings: tierConfig.maxListings,
    allowPhotography: tierConfig.allowPhotography,
    allowReviews: tierConfig.allowReviews,
    allowPodcasts: tierConfig.allowPodcasts,
    allowVideos: tierConfig.allowVideos
  };
  
  // Set subscription to active and extend expiry by 30 days
  seller.subscription.status = 'active';
  seller.subscription.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  
  await seller.save();
  return seller;
};

const Dealer = mongoose.model('Dealer', dealerSchema);
export default Dealer;