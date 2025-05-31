// server/models/RentalVehicle.js
import mongoose from 'mongoose';
import slugify from 'slugify';

const rentalVehicleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a vehicle name'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
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
  category: {
    type: String,
    required: [true, 'Please select a category'],
    enum: [
      'Sedan', 'SUV', 'Sports Car', 'Luxury', 'Electric',
      'Hybrid', 'Truck', 'Van', 'Wagon', 'Convertible', 'Compact',
      'Economy'
    ]
  },
  status: {
    type: String,
    enum: ['available', 'booked', 'maintenance', 'inactive'],
    default: 'available'
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
    transmission: {
      type: String,
      enum: ['manual', 'automatic', 'cvt', 'semi-automatic'],
      required: true
    },
    fuelType: {
      type: String,
      enum: ['petrol', 'diesel', 'electric', 'hybrid', 'plugin_hybrid'],
      required: true
    },
    engineSize: String,
    power: String,
    seats: {
      type: Number,
      required: [true, 'Please specify the number of seats']
    },
    doors: Number,
    mileage: Number,
    fuelEconomy: String,
    exteriorColor: String,
    interiorColor: String
  },
  features: [{
    type: String,
    trim: true
  }],
  rates: {
    daily: {
      type: Number,
      required: [true, 'Please add a daily rate']
    },
    weekly: Number,
    monthly: Number,
    security: Number, // Security deposit
    includesVAT: {
      type: Boolean,
      default: true
    }
  },
  rentalTerms: {
    minimumAge: {
      type: Number,
      default: 21
    },
    minimumRentalPeriod: {
      type: Number,
      default: 1
    }, // in days
    depositRequired: {
      type: Boolean,
      default: true
    },
    licenseRequired: {
      type: Boolean,
      default: true
    },
    fuelPolicy: {
      type: String,
      enum: ['full-to-full', 'full-to-empty', 'same-to-same'],
      default: 'full-to-full'
    },
    mileageLimit: {
      type: Number,
      default: 0
    }, // 0 means unlimited
    lateFeeRate: Number,
    additionalDriverFee: Number,
    insuranceOptions: [{
      name: String,
      description: String,
      rate: Number
    }]
  },
  availability: {
    type: String,
    enum: ['available', 'limited', 'unavailable', 'booked'],
    default: 'available'
  },
  bookings: [{
    startDate: Date,
    endDate: Date,
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['confirmed', 'pending', 'cancelled', 'completed'],
      default: 'pending'
    }
  }],
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
  usageType: {
    type: String,
    enum: ['Personal', 'Business', 'Both'],
    default: 'Both'
  },
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
    }
  }],
  averageRating: {
    type: Number,
    default: 0
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

// Create slug from name
rentalVehicleSchema.pre('save', function(next) {
  if (this.isModified('name')) {
    this.slug = slugify(`${this.name}-${this.specifications.make}-${this.specifications.model}`, { lower: true, strict: true });
  }
  
  // Calculate and update average rating if reviews exist
  if (this.reviews && this.reviews.length > 0) {
    const total = this.reviews.reduce((sum, review) => sum + review.rating, 0);
    this.averageRating = (total / this.reviews.length).toFixed(1);
  }
  
  next();
});

// Indexes for searching and filtering
rentalVehicleSchema.index({
  name: 'text',
  description: 'text',
  'specifications.make': 'text',
  'specifications.model': 'text'
});

rentalVehicleSchema.index({ 'location.coordinates': '2dsphere' });
rentalVehicleSchema.index({ providerId: 1, status: 1 });
rentalVehicleSchema.index({ availability: 1, status: 1 });
rentalVehicleSchema.index({ category: 1 });
rentalVehicleSchema.index({ 'rates.daily': 1 });

// Check availability for a specific date range
rentalVehicleSchema.methods.checkAvailability = function(startDate, endDate) {
  // If vehicle is not active or available, it's not bookable
  if (this.status !== 'available' || this.availability === 'unavailable') {
    return {
      available: false,
      reason: 'Vehicle is not available for booking'
    };
  }
  
  // Convert dates to ensure proper comparison
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Check if there are any overlapping bookings
  const overlappingBookings = this.bookings.filter(booking => {
    // Ignore cancelled bookings
    if (booking.status === 'cancelled') return false;
    
    // Convert booking dates
    const bookingStart = new Date(booking.startDate);
    const bookingEnd = new Date(booking.endDate);
    
    // Check for overlap
    return (
      (start >= bookingStart && start <= bookingEnd) || // Start date falls within existing booking
      (end >= bookingStart && end <= bookingEnd) || // End date falls within existing booking
      (start <= bookingStart && end >= bookingEnd) // Booking is fully contained within requested period
    );
  });
  
  if (overlappingBookings.length > 0) {
    return {
      available: false,
      reason: 'Vehicle is already booked for part or all of the requested period',
      conflictingBookings: overlappingBookings
    };
  }
  
  return {
    available: true
  };
};

// Calculate rental cost
rentalVehicleSchema.methods.calculateRentalCost = function(startDate, endDate, options = {}) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  // Calculate duration in days (round up partial days)
  const durationMs = end.getTime() - start.getTime();
  const days = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
  
  if (days <= 0) {
    throw new Error('Invalid rental duration');
  }
  
  let totalCost = 0;
  
  // Apply appropriate rate based on duration
  if (days >= 30 && this.rates.monthly) {
    // Monthly rate
    const months = Math.floor(days / 30);
    const remainingDays = days % 30;
    
    totalCost = (months * this.rates.monthly) + (remainingDays * (this.rates.daily || this.rates.monthly / 30));
  } else if (days >= 7 && this.rates.weekly) {
    // Weekly rate
    const weeks = Math.floor(days / 7);
    const remainingDays = days % 7;
    
    totalCost = (weeks * this.rates.weekly) + (remainingDays * (this.rates.daily || this.rates.weekly / 7));
  } else {
    // Daily rate
    totalCost = days * this.rates.daily;
  }
  
  // Add additional driver fee if applicable
  if (options.additionalDrivers && this.rentalTerms.additionalDriverFee) {
    totalCost += (options.additionalDrivers * this.rentalTerms.additionalDriverFee);
  }
  
  // Add insurance if selected
  if (options.insuranceOption && this.rentalTerms.insuranceOptions) {
    const selectedInsurance = this.rentalTerms.insuranceOptions.find(
      ins => ins.name === options.insuranceOption
    );
    
    if (selectedInsurance) {
      totalCost += (selectedInsurance.rate * days);
    }
  }
  
  return {
    days,
    baseRate: this.rates.daily,
    baseCost: days * this.rates.daily,
    totalCost,
    securityDeposit: this.rates.security || 0,
    grandTotal: totalCost + (this.rates.security || 0)
  };
};

// Add a review
rentalVehicleSchema.methods.addReview = async function(review) {
  this.reviews.push(review);
  
  // Recalculate average rating
  const total = this.reviews.reduce((sum, review) => sum + review.rating, 0);
  this.averageRating = (total / this.reviews.length).toFixed(1);
  
  return this.save();
};

const RentalVehicle = mongoose.model('RentalVehicle', rentalVehicleSchema);
export default RentalVehicle;