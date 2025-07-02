// server/models/Vehicle.js
import mongoose from 'mongoose';

const VehicleSchema = new mongoose.Schema({
  // Owner Information
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Basic Vehicle Information
  make: {
    type: String,
    required: true,
    trim: true
  },
  model: {
    type: String,
    required: true,
    trim: true
  },
  year: {
    type: Number,
    required: true,
    min: 1950,
    max: new Date().getFullYear() + 1
  },
  color: {
    type: String,
    trim: true
  },
  bodyType: {
    type: String,
    enum: ['sedan', 'hatchback', 'suv', 'pickup', 'wagon', 'coupe', 'convertible', 'minivan', 'truck', 'motorcycle', 'other'],
    default: 'sedan'
  },
  fuelType: {
    type: String,
    enum: ['petrol', 'diesel', 'hybrid', 'electric', 'lpg', 'other'],
    default: 'petrol'
  },
  transmission: {
    type: String,
    enum: ['manual', 'automatic', 'cvt', 'other'],
    default: 'manual'
  },
  
  // Identification
  vin: {
    type: String,
    trim: true,
    sparse: true,
    unique: true
  },
  licensePlate: {
    type: String,
    trim: true,
    sparse: true,
    unique: true
  },
  engineNumber: {
    type: String,
    trim: true
  },
  
  // Ownership & Documentation
  ownershipStatus: {
    type: String,
    enum: ['owned', 'financed', 'leased', 'company'],
    default: 'owned'
  },
  purchaseDate: {
    type: Date
  },
  purchasePrice: {
    type: Number,
    min: 0
  },
  
  // Current Status
  mileage: {
    type: Number,
    min: 0
  },
  condition: {
    type: String,
    enum: ['excellent', 'good', 'fair', 'poor'],
    default: 'good'
  },
  location: {
    city: String,
    state: String,
    country: {
      type: String,
      default: 'Botswana'
    }
  },
  
  // Service Tracking
  lastServiceDate: {
    type: Date
  },
  nextServiceDue: {
    type: Date
  },
  serviceHistory: [{
    date: Date,
    workshopId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ServiceProvider'
    },
    workshopName: String,
    serviceType: String,
    description: String,
    cost: Number,
    mileageAtService: Number,
    receipts: [{
      url: String,
      key: String,
      filename: String
    }]
  }],
  preferredWorkshop: {
    type: String,
    trim: true
  },
  serviceReminders: {
    type: Boolean,
    default: true
  },
  
  // Selling Information
  forSale: {
    type: Boolean,
    default: false
  },
  askingPrice: {
    type: Number,
    min: 0
  },
  sellingReason: {
    type: String,
    trim: true
  },
  negotiable: {
    type: Boolean,
    default: true
  },
  saleDate: {
    type: Date
  },
  soldPrice: {
    type: Number,
    min: 0
  },
  
  // Performance Tracking
  trackPerformance: {
    type: Boolean,
    default: true
  },
  allowListingByOthers: {
    type: Boolean,
    default: false
  },
  performanceMetrics: {
    views: { type: Number, default: 0 },
    favorites: { type: Number, default: 0 },
    inquiries: { type: Number, default: 0 },
    testDrives: { type: Number, default: 0 },
    offers: { type: Number, default: 0 }
  },
  
  // Insurance & Legal
  insuranceCompany: {
    type: String,
    trim: true
  },
  insuranceExpiryDate: {
    type: Date
  },
  licenseExpiryDate: {
    type: Date
  },
  
  // Additional Details
  description: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  specialFeatures: [{
    type: String,
    trim: true
  }],
  images: [{
    url: String,
    key: String,
    filename: String,
    isPrimary: { type: Boolean, default: false }
  }],
  
  // Notifications
  notifications: {
    serviceReminders: { type: Boolean, default: true },
    insuranceReminders: { type: Boolean, default: true },
    licenseReminders: { type: Boolean, default: true },
    listingUpdates: { type: Boolean, default: true }
  },
  
  // Linked Listings
  linkedListings: [{
    listingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Listing'
    },
    listingType: {
      type: String,
      enum: ['sale', 'rental']
    },
    createdAt: Date,
    isActive: Boolean
  }],
  
  // System Fields
  isActive: {
    type: Boolean,
    default: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
VehicleSchema.index({ ownerId: 1 });
VehicleSchema.index({ make: 1, model: 1, year: 1 });
VehicleSchema.index({ licensePlate: 1 });
VehicleSchema.index({ forSale: 1 });
VehicleSchema.index({ isActive: 1, isDeleted: 1 });

// Virtual for vehicle display name
VehicleSchema.virtual('displayName').get(function() {
  return `${this.year} ${this.make} ${this.model}`;
});

// Virtual for service due status
VehicleSchema.virtual('isServiceDue').get(function() {
  if (!this.nextServiceDue) return false;
  const today = new Date();
  const daysUntilService = Math.ceil((this.nextServiceDue - today) / (1000 * 60 * 60 * 24));
  return daysUntilService <= 30;
});

// Virtual for insurance/license expiry warnings
VehicleSchema.virtual('expiryWarnings').get(function() {
  const warnings = [];
  const today = new Date();
  const warningPeriod = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
  
  if (this.insuranceExpiryDate && this.insuranceExpiryDate - today <= warningPeriod) {
    warnings.push({ type: 'insurance', date: this.insuranceExpiryDate });
  }
  
  if (this.licenseExpiryDate && this.licenseExpiryDate - today <= warningPeriod) {
    warnings.push({ type: 'license', date: this.licenseExpiryDate });
  }
  
  return warnings;
});

// Methods
VehicleSchema.methods.addServiceRecord = function(serviceData) {
  this.serviceHistory.push({
    date: serviceData.date || new Date(),
    workshopId: serviceData.workshopId,
    workshopName: serviceData.workshopName,
    serviceType: serviceData.serviceType,
    description: serviceData.description,
    cost: serviceData.cost,
    mileageAtService: serviceData.mileageAtService || this.mileage,
    receipts: serviceData.receipts || []
  });
  
  // Update last service date
  this.lastServiceDate = serviceData.date || new Date();
  
  // Calculate next service date (6 months from now as default)
  if (!this.nextServiceDue) {
    const nextService = new Date();
    nextService.setMonth(nextService.getMonth() + 6);
    this.nextServiceDue = nextService;
  }
  
  return this.save();
};

VehicleSchema.methods.updatePerformanceMetrics = function(metricType, increment = 1) {
  if (!this.performanceMetrics) {
    this.performanceMetrics = { views: 0, favorites: 0, inquiries: 0, testDrives: 0, offers: 0 };
  }
  
  if (this.performanceMetrics.hasOwnProperty(metricType)) {
    this.performanceMetrics[metricType] += increment;
    return this.save();
  }
  
  return Promise.resolve(this);
};

VehicleSchema.methods.linkListing = function(listingId, listingType) {
  const existingLink = this.linkedListings.find(
    link => link.listingId.toString() === listingId.toString()
  );
  
  if (!existingLink) {
    this.linkedListings.push({
      listingId,
      listingType,
      createdAt: new Date(),
      isActive: true
    });
  } else {
    existingLink.isActive = true;
  }
  
  return this.save();
};

VehicleSchema.methods.unlinkListing = function(listingId) {
  const linkIndex = this.linkedListings.findIndex(
    link => link.listingId.toString() === listingId.toString()
  );
  
  if (linkIndex > -1) {
    this.linkedListings[linkIndex].isActive = false;
  }
  
  return this.save();
};

// Static methods
VehicleSchema.statics.findByOwner = function(ownerId, options = {}) {
  const query = { 
    ownerId, 
    isDeleted: false,
    ...(options.includeInactive ? {} : { isActive: true })
  };
  
  return this.find(query)
    .populate('serviceHistory.workshopId', 'businessName location.city')
    .sort(options.sort || '-createdAt');
};

VehicleSchema.statics.findDueForService = function() {
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  
  return this.find({
    nextServiceDue: { $lte: thirtyDaysFromNow },
    serviceReminders: true,
    isActive: true,
    isDeleted: false
  }).populate('ownerId', 'name email profile.phone');
};

VehicleSchema.statics.getOwnershipStats = function(ownerId) {
  return this.aggregate([
    { $match: { ownerId: mongoose.Types.ObjectId(ownerId), isDeleted: false } },
    {
      $group: {
        _id: null,
        totalVehicles: { $sum: 1 },
        forSaleCount: { $sum: { $cond: ['$forSale', 1, 0] } },
        totalValue: { $sum: '$askingPrice' },
        avgYear: { $avg: '$year' },
        makeBreakdown: { $push: '$make' }
      }
    }
  ]);
};

// Pre-save middleware
VehicleSchema.pre('save', function(next) {
  // Ensure only one primary image
  if (this.images && this.images.length > 0) {
    let primaryCount = 0;
    this.images.forEach((image, index) => {
      if (image.isPrimary) {
        primaryCount++;
        if (primaryCount > 1) {
          image.isPrimary = false;
        }
      }
    });
    
    // If no primary image, make the first one primary
    if (primaryCount === 0) {
      this.images[0].isPrimary = true;
    }
  }
  
  next();
});

const Vehicle = mongoose.model('Vehicle', VehicleSchema);

export default Vehicle;
