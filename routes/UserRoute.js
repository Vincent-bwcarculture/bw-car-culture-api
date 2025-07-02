// server/models/UserRoute.js
import mongoose from 'mongoose';

const UserRouteSchema = new mongoose.Schema({
  // Owner Information
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ServiceProvider',
    sparse: true // Optional - for when user has a registered service
  },
  
  // Basic Route Information
  routeName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  routeNumber: {
    type: String,
    trim: true,
    maxlength: 20
  },
  slug: {
    type: String,
    unique: true,
    sparse: true
  },
  
  // Service Type (for flexibility in Botswana's transport system)
  serviceType: {
    type: String,
    enum: ['taxi', 'combi', 'bus', 'ride_share', 'private_hire'],
    required: true
  },
  operatorName: {
    type: String,
    required: true,
    trim: true
  },
  operatorType: {
    type: String,
    enum: ['individual', 'company', 'cooperative'],
    default: 'individual'
  },
  
  // Route Details
  origin: {
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    coordinates: {
      lat: { type: Number, min: -90, max: 90 },
      lng: { type: Number, min: -180, max: 180 }
    },
    landmark: { type: String, trim: true }
  },
  destination: {
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    coordinates: {
      lat: { type: Number, min: -90, max: 90 },
      lng: { type: Number, min: -180, max: 180 }
    },
    landmark: { type: String, trim: true }
  },
  
  // Intermediate Stops
  stops: [{
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    coordinates: {
      lat: { type: Number, min: -90, max: 90 },
      lng: { type: Number, min: -180, max: 180 }
    },
    stopOrder: { type: Number, required: true },
    estimatedTime: String, // e.g., "10 minutes from origin"
    fare: Number // Optional individual stop fare
  }],
  
  // Flexible Scheduling for Botswana Context
  operationType: {
    type: String,
    enum: ['on_demand', 'scheduled', 'hybrid'],
    default: 'on_demand'
  },
  schedule: {
    operatingDays: [{
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    }],
    startTime: { type: String, default: '05:00' }, // Daily start time
    endTime: { type: String, default: '22:00' },   // Daily end time
    frequency: { type: String, default: 'On demand' }, // "On demand", "Every 30 min", "Call ahead"
    departureTimes: [String], // For scheduled services: ["06:00", "12:00", "18:00"]
    peakHours: [{
      start: String,
      end: String,
      description: String // e.g., "Morning rush"
    }],
    notes: { type: String, maxlength: 500 } // Additional scheduling info
  },
  
  // Pricing Information
  pricing: {
    baseFare: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'BWP' },
    fareType: {
      type: String,
      enum: ['flat_rate', 'distance_based', 'zone_based', 'negotiable'],
      default: 'flat_rate'
    },
    discounts: {
      student: Number,
      senior: Number,
      bulk: Number, // For multiple passengers
      regular: Number // For regular customers
    },
    paymentMethods: [{
      type: String,
      enum: ['cash', 'card', 'mobile_money', 'account']
    }],
    surcharges: [{
      type: String, // "night", "weekend", "holiday", "luggage"
      amount: Number,
      description: String
    }]
  },
  
  // Vehicle Information
  vehicleInfo: {
    vehicleType: {
      type: String,
      enum: ['sedan', 'hatchback', 'suv', 'minibus', 'bus', 'pickup', 'motorcycle'],
      default: 'sedan'
    },
    capacity: { type: Number, required: true, min: 1, max: 50 },
    vehicleIds: [{ // Link to user's vehicles if applicable
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle'
    }],
    amenities: [{
      type: String,
      enum: ['air_conditioning', 'wifi', 'music', 'phone_charging', 'luggage_space', 'wheelchair_accessible']
    }],
    licensePlates: [String], // Multiple vehicles for same route
    fleetSize: { type: Number, default: 1 }
  },
  
  // Route Metrics
  distance: { type: Number, min: 0 }, // in kilometers
  estimatedDuration: { type: String }, // e.g., "45 minutes"
  routeType: {
    type: String,
    enum: ['urban', 'suburban', 'intercity', 'rural'],
    default: 'urban'
  },
  
  // Contact Information
  contact: {
    phone: { type: String, required: true, trim: true },
    whatsapp: { type: String, trim: true },
    email: { type: String, trim: true },
    emergencyContact: { type: String, trim: true },
    preferredContactMethod: {
      type: String,
      enum: ['phone', 'whatsapp', 'sms'],
      default: 'phone'
    }
  },
  
  // Accessibility & Special Services
  accessibility: {
    wheelchairAccessible: { type: Boolean, default: false },
    allowPets: { type: Boolean, default: false },
    smokingAllowed: { type: Boolean, default: false },
    luggageAllowed: { type: Boolean, default: true },
    childFriendly: { type: Boolean, default: true }
  },
  
  // Route Status & Management
  isActive: { type: Boolean, default: true },
  temporarilyUnavailable: {
    status: { type: Boolean, default: false },
    reason: String,
    until: Date
  },
  operationalStatus: {
    type: String,
    enum: ['active', 'suspended', 'maintenance', 'seasonal'],
    default: 'active'
  },
  
  // Performance & Analytics
  analytics: {
    views: { type: Number, default: 0 },
    inquiries: { type: Number, default: 0 },
    bookings: { type: Number, default: 0 },
    rating: { type: Number, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
    popularTimes: [{
      day: String,
      hour: Number,
      bookingCount: Number
    }]
  },
  
  // Reviews & Feedback
  reviews: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, maxlength: 500 },
    travelDate: Date,
    isVerified: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  }],
  
  // Additional Information
  description: { type: String, maxlength: 1000 },
  specialNotes: { type: String, maxlength: 500 }, // Special instructions, landmarks, etc.
  images: [{
    url: String,
    key: String,
    description: String, // "Vehicle interior", "Route landmark", etc.
    isPrimary: { type: Boolean, default: false }
  }],
  
  // Verification & Compliance
  verification: {
    isVerified: { type: Boolean, default: false },
    verifiedAt: Date,
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    licenseNumber: String,
    permitNumber: String,
    insuranceValid: { type: Boolean, default: false },
    documentsUploaded: [{
      type: String, // "license", "permit", "insurance"
      url: String,
      expiryDate: Date
    }]
  },
  
  // Booking & Availability Management
  bookingSettings: {
    advanceBooking: { type: Boolean, default: true },
    maxAdvanceHours: { type: Number, default: 24 },
    cancellationPolicy: String,
    requiresConfirmation: { type: Boolean, default: true }
  },
  
  // Location Tracking (for real-time features)
  trackingEnabled: { type: Boolean, default: false },
  currentLocation: {
    coordinates: {
      lat: Number,
      lng: Number
    },
    lastUpdated: Date,
    isOnRoute: { type: Boolean, default: false }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
UserRouteSchema.index({ ownerId: 1 });
UserRouteSchema.index({ serviceType: 1, operationalStatus: 1 });
UserRouteSchema.index({ 'origin.name': 1, 'destination.name': 1 });
UserRouteSchema.index({ isActive: 1, operationalStatus: 1 });
UserRouteSchema.index({ 'contact.phone': 1 });
UserRouteSchema.index({ slug: 1 }, { unique: true, sparse: true });

// Text search index
UserRouteSchema.index({
  routeName: 'text',
  'origin.name': 'text',
  'destination.name': 'text',
  description: 'text'
});

// Geospatial indexes
UserRouteSchema.index({ 'origin.coordinates': '2dsphere' });
UserRouteSchema.index({ 'destination.coordinates': '2dsphere' });

// Virtual fields
UserRouteSchema.virtual('routeDisplayName').get(function() {
  const number = this.routeNumber ? `${this.routeNumber}: ` : '';
  return `${number}${this.origin.name} to ${this.destination.name}`;
});

UserRouteSchema.virtual('averageRating').get(function() {
  if (!this.reviews || this.reviews.length === 0) return 0;
  const sum = this.reviews.reduce((acc, review) => acc + review.rating, 0);
  return (sum / this.reviews.length).toFixed(1);
});

UserRouteSchema.virtual('isCurrentlyOperating').get(function() {
  if (!this.isActive || this.operationalStatus !== 'active') return false;
  if (this.temporarilyUnavailable.status) return false;
  
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;
  
  const startTime = this.schedule.startTime.split(':');
  const endTime = this.schedule.endTime.split(':');
  const startMinutes = parseInt(startTime[0]) * 60 + parseInt(startTime[1]);
  const endMinutes = parseInt(endTime[0]) * 60 + parseInt(endTime[1]);
  
  return currentTime >= startMinutes && currentTime <= endMinutes;
});

// Instance methods
UserRouteSchema.methods.addReview = function(userId, rating, comment, travelDate) {
  this.reviews.push({
    userId,
    rating,
    comment,
    travelDate,
    createdAt: new Date()
  });
  
  // Update analytics
  this.analytics.reviewCount = this.reviews.length;
  this.analytics.rating = this.averageRating;
  
  return this.save();
};

UserRouteSchema.methods.incrementAnalytics = function(metric) {
  if (this.analytics.hasOwnProperty(metric)) {
    this.analytics[metric] += 1;
    return this.save();
  }
  return Promise.resolve(this);
};

UserRouteSchema.methods.updateLocation = function(lat, lng, isOnRoute = false) {
  this.currentLocation = {
    coordinates: { lat, lng },
    lastUpdated: new Date(),
    isOnRoute
  };
  return this.save();
};

UserRouteSchema.methods.setTemporaryUnavailable = function(reason, until) {
  this.temporarilyUnavailable = {
    status: true,
    reason,
    until
  };
  return this.save();
};

// Static methods
UserRouteSchema.statics.findByOwner = function(ownerId, options = {}) {
  const query = { ownerId };
  if (!options.includeInactive) {
    query.isActive = true;
    query.operationalStatus = 'active';
  }
  
  return this.find(query).sort(options.sort || '-createdAt');
};

UserRouteSchema.statics.findByRoute = function(origin, destination, serviceType = null) {
  const query = {
    $and: [
      {
        $or: [
          { 'origin.name': new RegExp(origin, 'i') },
          { 'stops.name': new RegExp(origin, 'i') }
        ]
      },
      {
        $or: [
          { 'destination.name': new RegExp(destination, 'i') },
          { 'stops.name': new RegExp(destination, 'i') }
        ]
      }
    ],
    isActive: true,
    operationalStatus: 'active'
  };
  
  if (serviceType) {
    query.serviceType = serviceType;
  }
  
  return this.find(query)
    .populate('ownerId', 'name profile.phone')
    .sort('-analytics.rating -analytics.bookings');
};

UserRouteSchema.statics.findNearby = function(lat, lng, maxDistance = 10000) {
  return this.find({
    $or: [
      {
        'origin.coordinates': {
          $near: {
            $geometry: { type: 'Point', coordinates: [lng, lat] },
            $maxDistance: maxDistance
          }
        }
      },
      {
        'destination.coordinates': {
          $near: {
            $geometry: { type: 'Point', coordinates: [lng, lat] },
            $maxDistance: maxDistance
          }
        }
      }
    ],
    isActive: true,
    operationalStatus: 'active'
  }).populate('ownerId', 'name profile.phone');
};

UserRouteSchema.statics.getAnalyticsSummary = function(ownerId) {
  return this.aggregate([
    { $match: { ownerId: mongoose.Types.ObjectId(ownerId) } },
    {
      $group: {
        _id: null,
        totalRoutes: { $sum: 1 },
        activeRoutes: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
        totalViews: { $sum: '$analytics.views' },
        totalBookings: { $sum: '$analytics.bookings' },
        avgRating: { $avg: '$analytics.rating' },
        serviceTypeBreakdown: { $push: '$serviceType' }
      }
    }
  ]);
};

// Pre-save middleware
UserRouteSchema.pre('save', function(next) {
  // Generate slug if not exists
  if (!this.slug && this.routeName) {
    this.slug = this.routeName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .trim('-');
    
    // Add timestamp to ensure uniqueness
    this.slug += `-${Date.now()}`;
  }
  
  // Ensure stops are ordered
  if (this.stops && this.stops.length > 0) {
    this.stops.sort((a, b) => a.stopOrder - b.stopOrder);
  }
  
  // Validate coordinates
  if (this.origin.coordinates && this.origin.coordinates.lat === 0 && this.origin.coordinates.lng === 0) {
    this.origin.coordinates = undefined;
  }
  if (this.destination.coordinates && this.destination.coordinates.lat === 0 && this.destination.coordinates.lng === 0) {
    this.destination.coordinates = undefined;
  }
  
  next();
});

const UserRoute = mongoose.model('UserRoute', UserRouteSchema);

export default UserRoute;
