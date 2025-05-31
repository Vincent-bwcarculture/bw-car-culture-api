// server/models/Listing.js
import mongoose from 'mongoose';
import slugify from 'slugify';

const listingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a title'],
    trim: true,
    minlength: [10, 'Title must be at least 10 characters'],
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  slug: {
    type: String,
    unique: true
  },
  description: {
    type: String,
    required: [true, 'Please add a description'],
    minlength: [50, 'Description must be at least 50 characters']
  },
  shortDescription: {
    type: String,
    maxlength: [200, 'Short description cannot exceed 200 characters']
  },
  price: {
    type: Number,
    required: [true, 'Please add a price']
  },
  priceType: {
    type: String,
    enum: ['fixed', 'negotiable', 'call', 'poa'],
    default: 'fixed'
  },
  priceOptions: {
    includesVAT: {
      type: Boolean,
      default: false
    },
    showPriceAsPOA: {
      type: Boolean,
      default: false
    },
    financeAvailable: {
      type: Boolean,
      default: false
    },
    leaseAvailable: {
      type: Boolean,
      default: false
    },
    monthlyPayment: {
      type: Number,
      default: null
    },
    // SAVINGS FUNCTIONALITY - NEW FIELDS
    originalPrice: {
      type: Number,
      default: null // Original dealer price before I3W discount
    },
    savingsAmount: {
      type: Number,
      default: null // Amount customer saves through I3W
    },
    savingsPercentage: {
      type: Number,
      default: null // Percentage saved
    },
    dealerDiscount: {
      type: Number,
      default: null // Discount percentage negotiated with dealer
    },
    showSavings: {
      type: Boolean,
      default: false // Whether to display savings to customers
    },
    savingsDescription: {
      type: String,
      default: null // Custom savings message
    },
    exclusiveDeal: {
      type: Boolean,
      default: false // Mark as exclusive I3W deal
    },
    savingsValidUntil: {
      type: Date,
      default: null // Expiry date for the savings offer
    }
  },
  status: {
    type: String,
    enum: ['draft', 'pending', 'active', 'sold', 'archived'],
    default: 'draft'
  },
  category: {
    type: String,
    required: [true, 'Please select a category'],
    enum: [
      'Sedan', 'SUV', 'Sports Car', 'Luxury', 'Electric',
      'Hybrid', 'Truck', 'Van', 'Wagon', 'Convertible', 'Classic'
    ]
  },
  condition: {
    type: String,
    required: [true, 'Please select a condition'],
    enum: ['new', 'used', 'certified']
  },
  specifications: {
    make: {
      type: String,
      required: [true, 'Please add the make']
    },
    model: {
      type: String,
      required: [true, 'Please add the model']
    },
    year: {
      type: Number,
      required: [true, 'Please add the year']
    },
    mileage: {
      type: Number,
      required: [true, 'Please add the mileage']
    },
    transmission: {
      type: String,
      required: [true, 'Please select the transmission type'],
      enum: ['manual', 'automatic', 'cvt', 'dct', 'semi-auto']
    },
    fuelType: {
      type: String,
      required: [true, 'Please select the fuel type'],
      enum: ['petrol', 'diesel', 'electric', 'hybrid', 'plugin_hybrid', 'hydrogen']
    },
    engineSize: String,
    power: String,
    torque: String,
    drivetrain: {
      type: String,
      enum: ['fwd', 'rwd', 'awd', '4wd', ''],
    },
    acceleration: String,
    topSpeed: String,
    fuelEconomy: String,
    exteriorColor: String,
    interiorColor: String,
    vin: String
  },
  features: [{
    type: String,
    trim: true
  }],
  safetyFeatures: [{
    type: String,
    trim: true
  }],
  comfortFeatures: [{
    type: String,
    trim: true
  }],
  performanceFeatures: [{
    type: String,
    trim: true
  }],
  entertainmentFeatures: [{
    type: String,
    trim: true
  }],
  images: [{
    url: {
      type: String,
      required: true
    },
    thumbnail: {
      type: String,
      default: null
    },
    key: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    mimetype: {
      type: String,
      required: true
    },
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  dealer: {
    name: {
      type: String,
      required: true
    },
    businessName: {
      type: String,
      required: true
    },
    contact: {
      phone: {
        type: String,
        required: true
      },
      email: {
        type: String,
        required: true
      },
      website: String
    },
    location: {
      address: String,
      city: {
        type: String,
        required: true
      },
      state: String,
      country: {
        type: String,
        required: true
      },
      coordinates: {
        type: {
          type: String,
          enum: ['Point']
        },
        coordinates: {
          type: [Number],
          index: '2dsphere'
        }
      }
    },
    verification: {
      isVerified: {
        type: Boolean,
        default: false
      },
      verifiedAt: Date
    },
    rating: {
      average: {
        type: Number,
        default: 0
      },
      count: {
        type: Number,
        default: 0
      }
    },
    metrics: {
      totalListings: {
        type: Number,
        default: 0
      },
      activeSales: {
        type: Number,
        default: 0
      }
    },
    logo: String,
    openingHours: {
      monday: { open: String, close: String },
      tuesday: { open: String, close: String },
      wednesday: { open: String, close: String },
      thursday: { open: String, close: String },
      friday: { open: String, close: String },
      saturday: { open: String, close: String },
      sunday: { open: String, close: String }
    }
  },
  dealerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dealer',
    required: true
  },
  location: {
    address: String,
    city: {
      type: String,
      required: [true, 'Please add the city']
    },
    state: String,
    country: {
      type: String,
      required: [true, 'Please add the country']
    },
    postalCode: String,
    coordinates: {
      type: {
        type: String,
        enum: ['Point']
      },
      coordinates: {
        type: [Number],
        index: '2dsphere'
      }
    }
  },
  serviceHistory: {
    hasServiceHistory: {
      type: Boolean,
      default: false
    },
    records: [{
      date: Date,
      mileage: Number,
      serviceType: String,
      description: String,
      serviceCenter: String,
      documents: [{
        url: String,
        key: String,
        type: String,
        name: String
      }]
    }]
  },
  views: {
    type: Number,
    default: 0
  },
  saves: {
    type: Number,
    default: 0
  },
  inquiries: {
    type: Number,
    default: 0
  },
  seo: {
    metaTitle: String,
    metaDescription: String,
    keywords: [String],
    canonicalUrl: String
  },
  featured: {
    type: Boolean,
    default: false
  },
  sold: {
    date: Date,
    price: Number,
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create slug from title
listingSchema.pre('save', function(next) {
  if (this.isModified('title')) {
    this.slug = slugify(this.title, { lower: true, strict: true });
  }
  next();
});

// Auto-calculate savings if original price is provided
listingSchema.pre('save', function(next) {
  if (this.priceOptions && this.priceOptions.originalPrice && this.price) {
    const originalPrice = this.priceOptions.originalPrice;
    const currentPrice = this.price;
    
    if (originalPrice > currentPrice) {
      this.priceOptions.savingsAmount = originalPrice - currentPrice;
      this.priceOptions.savingsPercentage = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
      this.priceOptions.showSavings = true;
    }
  }
  next();
});

// Index for searching
listingSchema.index({
  title: 'text',
  description: 'text',
  'specifications.make': 'text',
  'specifications.model': 'text',
  'dealer.businessName': 'text'
});

// Index for geospatial queries
listingSchema.index({ 'location.coordinates': '2dsphere' });
listingSchema.index({ 'dealer.location.coordinates': '2dsphere' });

// Compound indexes for common queries
listingSchema.index({ status: 1, featured: 1 });
listingSchema.index({ dealerId: 1, status: 1 });
listingSchema.index({ 'specifications.make': 1, 'specifications.model': 1 });
listingSchema.index({ category: 1, status: 1 });
listingSchema.index({ createdAt: -1 });
listingSchema.index({ 'priceOptions.showSavings': 1, status: 1 }); // Index for savings queries

// Methods
listingSchema.methods.incrementViews = async function() {
  this.views += 1;
  return this.save();
};

listingSchema.methods.markAsSold = async function(buyerData) {
  this.status = 'sold';
  this.sold = {
    date: new Date(),
    price: this.price,
    buyer: buyerData.buyerId
  };
  return this.save();
};

// Calculate and get savings information
listingSchema.methods.getSavingsInfo = function() {
  if (!this.priceOptions || !this.priceOptions.showSavings) {
    return null;
  }
  
  const { originalPrice, savingsAmount, savingsPercentage } = this.priceOptions;
  
  if (savingsAmount && savingsAmount > 0) {
    return {
      amount: savingsAmount,
      percentage: savingsPercentage || Math.round((savingsAmount / (this.price + savingsAmount)) * 100),
      originalPrice: originalPrice || (this.price + savingsAmount),
      description: this.priceOptions.savingsDescription || null,
      isExclusive: this.priceOptions.exclusiveDeal || false,
      validUntil: this.priceOptions.savingsValidUntil || null
    };
  }
  
  return null;
};

// Static methods
listingSchema.statics.getSimilarListings = async function(listing) {
  return this.find({
    _id: { $ne: listing._id },
    category: listing.category,
    'specifications.make': listing.specifications.make,
    price: {
      $gte: listing.price * 0.8,
      $lte: listing.price * 1.2
    },
    status: 'active'
  }).limit(4);
};

// Get listings with savings
listingSchema.statics.getListingsWithSavings = async function(limit = 10) {
  return this.find({
    'priceOptions.showSavings': true,
    status: 'active'
  })
  .sort({ 'priceOptions.savingsAmount': -1 })
  .limit(limit);
};

// Update dealer metrics
listingSchema.statics.updateDealerMetrics = async function(dealerId) {
  const metrics = await this.aggregate([
    { $match: { dealerId: dealerId } },
    { 
      $group: {
        _id: '$dealerId',
        totalListings: { $sum: 1 },
        activeSales: { 
          $sum: { 
            $cond: [{ $eq: ['$status', 'active'] }, 1, 0] 
          } 
        }
      }
    }
  ]);

  if (metrics.length > 0) {
    await this.model('User').findByIdAndUpdate(dealerId, {
      $set: {
        'dealer.metrics': {
          totalListings: metrics[0].totalListings,
          activeSales: metrics[0].activeSales
        }
      }
    });
  }
};

// Middleware hooks
listingSchema.post('save', async function() {
  await this.constructor.updateDealerMetrics(this.dealerId);
});

listingSchema.post('remove', async function() {
  await this.constructor.updateDealerMetrics(this.dealerId);
});

// Virtual fields
listingSchema.virtual('isNew').get(function() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return this.createdAt > thirtyDaysAgo;
});

listingSchema.virtual('priceFormatted').get(function() {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(this.price);
});

listingSchema.virtual('hasSavings').get(function() {
  return this.priceOptions && this.priceOptions.showSavings && this.priceOptions.savingsAmount > 0;
});

// Query middleware
listingSchema.pre('find', function(next) {
  this.populate('dealerId', 'name email dealer.businessName');
  next();
});

listingSchema.pre('findOne', function(next) {
  this.populate('dealerId', 'name email dealer.businessName');
  next();
});

const Listing = mongoose.model('Listing', listingSchema);

export default Listing;