// server/models/TransportRoute.js
import mongoose from 'mongoose';
import slugify from 'slugify';

const transportRouteSchema = new mongoose.Schema({
  routeNumber: {
    type: String,
    trim: true
  },
  origin: {
    type: String,
    required: [true, 'Please specify the origin location'],
    trim: true
  },
  destination: {
    type: String,
    required: [true, 'Please specify the destination location'],
    trim: true
  },
  title: {
    type: String,
    trim: true
  },
  slug: {
    type: String,
    unique: true
  },
  description: {
    type: String,
    required: [true, 'Please add a description']
  },
  shortDescription: {
    type: String,
    maxlength: [200, 'Short description cannot exceed 200 characters']
  },
  // FIXED: Made images schema more flexible like other working models
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
      required: false // Made optional
    },
    size: {
      type: Number,
      required: false // Made optional
    },
    mimetype: {
      type: String,
      required: false // Made optional
    },
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  routeType: {
    type: String,
    required: [true, 'Please select a route type'],
    enum: ['Bus', 'Taxi', 'Shuttle', 'Train', 'Ferry', 'Other']
  },
  // FIXED: Renamed to operationalStatus to avoid conflict
  operationalStatus: {
    type: String,
    enum: ['active', 'seasonal', 'suspended', 'discontinued'],
    default: 'active'
  },
  serviceType: {
    type: String,
    enum: ['Regular', 'Express', 'Premium', 'Executive', 'Economy'],
    default: 'Regular'
  },
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ServiceProvider',
    required: true
  },
  provider: {
    name: String,
    businessName: String,
    logo: String,
    contact: {
      phone: String,
      email: String
    },
    location: {
      city: String,
      country: String
    }
  },
  schedule: {
    frequency: {
      type: String,
      required: [true, 'Please specify the service frequency']
    },
    operatingDays: {
      monday: { type: Boolean, default: true },
      tuesday: { type: Boolean, default: true },
      wednesday: { type: Boolean, default: true },
      thursday: { type: Boolean, default: true },
      friday: { type: Boolean, default: true },
      saturday: { type: Boolean, default: true },
      sunday: { type: Boolean, default: true }
    },
    departureTimes: [String], // Array of departure times, e.g., "08:00", "10:30"
    returnTimes: [String], // For round-trip routes
    duration: String, // Expected journey duration (e.g., "2h 30m")
    seasonalAvailability: {
      startDate: Date,
      endDate: Date,
      isYearRound: {
        type: Boolean,
        default: true
      }
    }
  },
  fare: {
    type: Number,
    required: [true, 'Please specify the fare amount']
  },
  fareOptions: {
    currency: {
      type: String,
      default: 'BWP' // Botswana Pula
    },
    childFare: Number,
    seniorFare: Number,
    studentFare: Number,
    discountGroups: [{
      name: String,
      discountPercentage: Number,
      requirements: String
    }],
    includesVAT: {
      type: Boolean,
      default: true
    },
    roundTripDiscount: Number, // Percentage discount for round trips
    loyaltyProgram: {
      available: {
        type: Boolean,
        default: false
      },
      details: String
    }
  },
  stops: [{
    name: {
      type: String,
      required: true
    },
    arrivalTime: String, // Estimated arrival time at this stop
    departureTime: String, // Estimated departure time from this stop
    fareFromOrigin: Number, // Optional fare from origin to this stop
    coordinates: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: [Number] // [longitude, latitude]
    }
  }],
  route: {
    distance: String,
    estimatedDuration: String,
    mapUrl: String,
    geoJson: {
      type: {
        type: String,
        enum: ['LineString']
      },
      coordinates: [[Number]] // Array of [longitude, latitude] points
    }
  },
  vehicles: [{
    vehicleType: String,
    capacity: Number,
    features: [String],
    accessibility: {
      wheelchairAccessible: Boolean,
      lowFloor: Boolean,
      other: [String]
    }
  }],
  amenities: [{
    type: String,
    trim: true
  }],
  bookingOptions: {
    onlineBooking: {
      type: Boolean,
      default: true
    },
    phoneBooking: {
      type: Boolean,
      default: true
    },
    inPersonBooking: {
      type: Boolean,
      default: true
    },
    advanceBookingRequired: {
      type: Boolean,
      default: false
    },
    advanceBookingPeriod: Number, // In hours
    cancellationPolicy: String
  },
  restrictions: {
    luggageAllowance: String,
    petPolicy: String,
    foodDrinkPolicy: String,
    other: [String]
  },
  paymentMethods: [String],
  // FIXED: Renamed to realtimeStatus to differentiate from operational status
  realtimeStatus: {
    type: String,
    enum: ['On time', 'Delayed', 'Cancelled', 'Scheduled'],
    default: 'Scheduled'
  },
  operatingAreas: [String], // Areas where this transport service operates
  reviews: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    userName: String,
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true
    },
    comment: String,
    date: {
      type: Date,
      default: Date.now
    },
    categories: {
      punctuality: {
        type: Number,
        min: 1,
        max: 5
      },
      comfort: {
        type: Number,
        min: 1,
        max: 5
      },
      cleanliness: {
        type: Number,
        min: 1,
        max: 5
      },
      value: {
        type: Number,
        min: 1,
        max: 5
      },
      staff: {
        type: Number,
        min: 1,
        max: 5
      }
    }
  }],
  averageRating: {
    type: Number,
    default: 0
  },
  ratingDetails: {
    punctuality: {
      type: Number,
      default: 0
    },
    comfort: {
      type: Number,
      default: 0
    },
    cleanliness: {
      type: Number,
      default: 0
    },
    value: {
      type: Number,
      default: 0
    },
    staff: {
      type: Number,
      default: 0
    }
  },
  seo: {
    metaTitle: String,
    metaDescription: String,
    keywords: [String]
  },
  featured: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Generate title and slug if not provided
transportRouteSchema.pre('save', function(next) {
  // Generate title if not provided
  if (!this.title) {
    this.title = `${this.origin} to ${this.destination}`;
    
    // Add route number if available
    if (this.routeNumber) {
      this.title = `${this.routeNumber} - ${this.title}`;
    }
    
    // Add service type if not Regular
    if (this.serviceType && this.serviceType !== 'Regular') {
      this.title = `${this.title} (${this.serviceType})`;
    }
  }
  
  // Generate slug if title changed
  if (this.isModified('title') || this.isNew) {
    this.slug = slugify(this.title, { lower: true, strict: true });
  }
  
  // Calculate and update average rating if reviews exist
  if (this.reviews && this.reviews.length > 0) {
    const total = this.reviews.reduce((sum, review) => sum + review.rating, 0);
    this.averageRating = (total / this.reviews.length).toFixed(1);
    
    // Calculate detailed ratings
    const categories = ['punctuality', 'comfort', 'cleanliness', 'value', 'staff'];
    
    categories.forEach(category => {
      const categoryReviews = this.reviews.filter(review => 
        review.categories && review.categories[category]
      );
      
      if (categoryReviews.length > 0) {
        const categoryTotal = categoryReviews.reduce(
          (sum, review) => sum + review.categories[category], 0
        );
        this.ratingDetails[category] = (categoryTotal / categoryReviews.length).toFixed(1);
      }
    });
  }
  
  next();
});

// Indexes for searching and filtering
transportRouteSchema.index({
  title: 'text',
  description: 'text',
  origin: 'text',
  destination: 'text',
  'stops.name': 'text'
});

transportRouteSchema.index({ providerId: 1, operationalStatus: 1 }); // Updated field name
transportRouteSchema.index({ origin: 1, destination: 1 });
transportRouteSchema.index({ routeType: 1 });
transportRouteSchema.index({ serviceType: 1 });
transportRouteSchema.index({ fare: 1 });
transportRouteSchema.index({ 'route.distance': 1 });

// Virtual for calculating expected arrival time based on departure time and duration
transportRouteSchema.virtual('expectedArrival').get(function() {
  if (!this.schedule.departureTimes || this.schedule.departureTimes.length === 0 || !this.route.estimatedDuration) {
    return null;
  }
  
  // Get the first departure time for simplicity
  const departureTime = this.schedule.departureTimes[0];
  
  // Parse duration (assuming format like "2h 30m" or "45m")
  let durationHours = 0;
  let durationMinutes = 0;
  
  const durationStr = this.route.estimatedDuration;
  const hoursMatch = durationStr.match(/(\d+)h/);
  const minutesMatch = durationStr.match(/(\d+)m/);
  
  if (hoursMatch) durationHours = parseInt(hoursMatch[1]);
  if (minutesMatch) durationMinutes = parseInt(minutesMatch[1]);
  
  // Parse departure time (assuming format like "08:30")
  const [depHours, depMinutes] = departureTime.split(':').map(Number);
  
  // Calculate total minutes
  let totalMinutes = (depHours * 60 + depMinutes) + (durationHours * 60 + durationMinutes);
  
  // Convert back to hours and minutes
  const arrHours = Math.floor(totalMinutes / 60) % 24;
  const arrMinutes = totalMinutes % 60;
  
  // Format as time string
  return `${arrHours.toString().padStart(2, '0')}:${arrMinutes.toString().padStart(2, '0')}`;
});

// ADDED: Virtual for backward compatibility with existing status field references
transportRouteSchema.virtual('status').get(function() {
  return this.operationalStatus;
});

transportRouteSchema.virtual('status').set(function(val) {
  this.operationalStatus = val;
});

// Method to check if route operates on a specific day
transportRouteSchema.methods.operatesOnDay = function(day) {
  const dayLower = day.toLowerCase();
  return this.schedule.operatingDays[dayLower];
};

// Method to check if route is seasonal and currently available
transportRouteSchema.methods.isCurrentlyOperating = function() {
  if (this.operationalStatus !== 'active') { // Updated field name
    return false;
  }
  
  if (this.schedule.seasonalAvailability.isYearRound) {
    return true;
  }
  
  const now = new Date();
  const startDate = new Date(this.schedule.seasonalAvailability.startDate);
  const endDate = new Date(this.schedule.seasonalAvailability.endDate);
  
  return now >= startDate && now <= endDate;
};

// Method to get the next available departure time from now
transportRouteSchema.methods.getNextDeparture = function() {
  if (!this.schedule.departureTimes || this.schedule.departureTimes.length === 0) {
    return null;
  }
  
  const now = new Date();
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTotalMinutes = currentHour * 60 + currentMinute;
  
  // Get day of week
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = days[now.getDay()];
  const tomorrow = days[(now.getDay() + 1) % 7];
  
  // Check if route operates today
  if (this.schedule.operatingDays[today]) {
    // Find the next departure time today
    for (const departureTime of this.schedule.departureTimes) {
      const [depHours, depMinutes] = departureTime.split(':').map(Number);
      const departureTotalMinutes = depHours * 60 + depMinutes;
      
      if (departureTotalMinutes > currentTotalMinutes) {
        return {
          day: 'today',
          time: departureTime
        };
      }
    }
  }
  
  // If no departures today or all departures have passed, check tomorrow
  if (this.schedule.operatingDays[tomorrow]) {
    return {
      day: 'tomorrow',
      time: this.schedule.departureTimes[0]
    };
  }
  
  // Otherwise, find the next day with service
  for (let i = 2; i < 8; i++) {
    const nextDay = days[(now.getDay() + i) % 7];
    if (this.schedule.operatingDays[nextDay]) {
      return {
        day: nextDay,
        time: this.schedule.departureTimes[0]
      };
    }
  }
  
  return null;
};

// Add a review
transportRouteSchema.methods.addReview = async function(review) {
  this.reviews.push(review);
  
  // Recalculate average rating
  const total = this.reviews.reduce((sum, review) => sum + review.rating, 0);
  this.averageRating = (total / this.reviews.length).toFixed(1);
  
  // Recalculate detailed ratings
  const categories = ['punctuality', 'comfort', 'cleanliness', 'value', 'staff'];
  
  categories.forEach(category => {
    const categoryReviews = this.reviews.filter(review => 
      review.categories && review.categories[category]
    );
    
    if (categoryReviews.length > 0) {
      const categoryTotal = categoryReviews.reduce(
        (sum, review) => sum + review.categories[category], 0
      );
      this.ratingDetails[category] = (categoryTotal / categoryReviews.length).toFixed(1);
    }
  });
  
  return this.save();
};

const TransportRoute = mongoose.model('TransportRoute', transportRouteSchema);
export default TransportRoute;