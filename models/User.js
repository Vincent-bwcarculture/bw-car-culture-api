// server/models/User.js - Enhanced User Model
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema({
  // === EXISTING BASIC INFO (keeping as-is) ===
  name: {
    type: String,
    required: [true, 'Please add a name'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: 6,
    select: false
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'provider', 'ministry'],
    default: 'user'
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'suspended'],
    default: 'active'
  },
  avatar: {
    url: {
      type: String,
      default: null
    },
    key: {
      type: String,
      default: null
    },
    size: {
      type: Number,
      default: null
    },
    mimetype: {
      type: String,
      default: null
    }
  },
    coverPicture: {
    url: {
      type: String,
      default: null
    },
    key: {
      type: String,
      default: null
    },
    size: {
      type: Number,
      default: null
    },
    mimetype: {
      type: String,
      default: null
    }
  },
  favorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Listing'
  }],
  lastLogin: {
    type: Date,
    default: null
  },

  // === NEW ENHANCED PROFILE FEATURES ===
  
  // Extended Profile Information
  profile: {
    // Personal Details
    firstName: {
      type: String,
      trim: true
    },
    lastName: {
      type: String,
      trim: true
    },
    phone: {
      type: String,
      trim: true
    },
    dateOfBirth: {
      type: Date
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer_not_to_say']
    },
    nationality: {
      type: String,
      default: 'Botswana'
    },
    
    // Address Information
    address: {
      street: String,
      city: String,
      state: String,
      postalCode: String,
      country: {
        type: String,
        default: 'Botswana'
      }
    },
    
    // Preferences
    language: {
      type: String,
      enum: ['english', 'setswana', 'afrikaans'],
      default: 'english'
    },
    currency: {
      type: String,
      default: 'BWP'
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      sms: {
        type: Boolean,
        default: false
      },
      push: {
        type: Boolean,
        default: true
      },
      marketing: {
        type: Boolean,
        default: false
      }
    },
    
    // Bio and Social
    bio: {
      type: String,
      maxlength: 500
    },
    website: {
      type: String,
      trim: true
    },
    socialMedia: {
      facebook: String,
      twitter: String,
      instagram: String,
      linkedin: String
    }
  },

  // Business/Service Provider Information
  businessProfile: {
    // Basic Business Info
    businessName: {
      type: String,
      trim: true
    },
    businessType: {
      type: String,
      enum: ['individual', 'sole_proprietorship', 'partnership', 'company', 'ngo', 'government']
    },
    registrationNumber: {
      type: String,
      trim: true
    },
    taxNumber: {
      type: String,
      trim: true
    },
    
    // Services They Provide
    services: [{
      serviceType: {
        type: String,
        enum: [
          'car_dealership',
          'car_rental',
          'trailer_rental',
          'public_transport',
          'workshop',
          'car_wash',
          'towing',
          'insurance',
          'financing',
          'parts_dealer',
          'tire_service',
          'battery_service',
          'glass_repair',
          'bodywork',
          'electrical_repair'
        ]
      },
      serviceName: String,
      description: String,
      location: {
        address: String,
        city: String,
        coordinates: {
          type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
          },
          coordinates: {
            type: [Number], // [longitude, latitude]
            default: [0, 0]
          }
        }
      },
      operatingHours: {
        monday: { open: String, close: String, closed: Boolean },
        tuesday: { open: String, close: String, closed: Boolean },
        wednesday: { open: String, close: String, closed: Boolean },
        thursday: { open: String, close: String, closed: Boolean },
        friday: { open: String, close: String, closed: Boolean },
        saturday: { open: String, close: String, closed: Boolean },
        sunday: { open: String, close: String, closed: Boolean }
      },
      contactInfo: {
        phone: String,
        email: String,
        whatsapp: String
      },
      isActive: {
        type: Boolean,
        default: false
      },
      isVerified: {
        type: Boolean,
        default: false
      },
      verificationStatus: {
        type: String,
        enum: ['pending', 'verified', 'rejected', 'expired'],
        default: 'pending'
      },
      verificationDocuments: [{
        type: String, // business_license, tax_certificate, insurance, etc.
        url: String,
        key: String, // S3 key for deletion
        uploadedAt: {
          type: Date,
          default: Date.now
        },
        status: {
          type: String,
          enum: ['pending', 'approved', 'rejected'],
          default: 'pending'
        }
      }],
      qrCode: {
        url: String,
        key: String,
        code: String, // Unique code for this service
        generatedAt: Date,
        isActive: {
          type: Boolean,
          default: true
        }
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    
    // Business Verification Status
    overallVerificationStatus: {
      type: String,
      enum: ['unverified', 'pending', 'partial', 'verified', 'rejected'],
      default: 'unverified'
    },
    verificationLevel: {
      type: String,
      enum: ['none', 'basic', 'standard', 'premium'],
      default: 'none'
    }
  },

  // Reviews and Ratings (as a service user)
  reviews: {
    given: [{
      serviceId: mongoose.Schema.Types.ObjectId,
      serviceType: String,
      providerId: mongoose.Schema.Types.ObjectId,
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      review: String,
      date: {
        type: Date,
        default: Date.now
      },
      isAnonymous: {
        type: Boolean,
        default: false
      },
      verificationMethod: {
        type: String,
        enum: ['qr_code', 'service_code', 'plate_number', 'booking_reference']
      }
    }],
    
    // Reviews received (if they're a service provider)
    received: [{
      fromUserId: mongoose.Schema.Types.ObjectId,
      serviceId: mongoose.Schema.Types.ObjectId,
      rating: {
        type: Number,
        min: 1,
        max: 5
      },
      review: String,
      date: {
        type: Date,
        default: Date.now
      },
      response: {
        text: String,
        date: Date
      },
      isPublic: {
        type: Boolean,
        default: true
      },
      verificationMethod: String
    }],
    
    // Aggregate ratings
    stats: {
      totalGiven: {
        type: Number,
        default: 0
      },
      totalReceived: {
        type: Number,
        default: 0
      },
      averageRatingGiven: {
        type: Number,
        default: 0
      },
      averageRatingReceived: {
        type: Number,
        default: 0
      },
      responseRate: {
        type: Number,
        default: 0
      }
    }
  },

  // Activity Tracking
  activity: {
    loginCount: {
      type: Number,
      default: 0
    },
    lastActiveAt: {
      type: Date,
      default: Date.now
    },
    favoriteUpdatedAt: Date,
    profileCompleteness: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    points: {
      type: Number,
      default: 0
    },
    badges: [{
      badgeType: String,
      earnedAt: Date,
      description: String
    }],
    achievements: [{
      achievementType: String,
      unlockedAt: Date,
      description: String,
      points: Number
    }]
  },

  // Security and Privacy
  security: {
    twoFactorEnabled: {
      type: Boolean,
      default: false
    },
    twoFactorSecret: String,
    recoveryTokens: [String],
    failedLoginAttempts: {
      type: Number,
      default: 0
    },
    accountLockedUntil: Date,
    privacySettings: {
      profileVisibility: {
        type: String,
        enum: ['public', 'limited', 'private'],
        default: 'public'
      },
      showEmail: {
        type: Boolean,
        default: false
      },
      showPhone: {
        type: Boolean,
        default: false
      },
      allowDirectMessages: {
        type: Boolean,
        default: true
      }
    }
  },

  // === EXISTING FIELDS (keeping as-is) ===
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ServiceProvider'
  },
  ministryInfo: {
    ministryName: String,
    department: String,
    role: String
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
UserSchema.index({ email: 1 });
UserSchema.index({ 'businessProfile.services.serviceType': 1 });
UserSchema.index({ 'businessProfile.services.location.coordinates': '2dsphere' });
UserSchema.index({ 'activity.lastActiveAt': 1 });
UserSchema.index({ role: 1, status: 1 });

// === EXISTING METHODS (keeping as-is) ===
// Encrypt password using bcrypt
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    console.error('Password hashing error:', error);
    next(error);
  }
});

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function(enteredPassword) {
  try {
    // Log for debugging
    console.log('Comparing passwords...');
    
    // Use bcrypt.compare to check the password
    return await bcrypt.compare(enteredPassword, this.password);
  } catch (error) {
    console.error('Password comparison error:', error);
    return false;
  }
};

// Check if user has an active dealership
UserSchema.methods.hasActiveDealership = async function() {
  if (!this.dealership) {
    return false;
  }
  
  const Dealer = mongoose.model('Dealer');
  const dealer = await Dealer.findById(this.dealership);
  
  return dealer && dealer.status === 'active' && 
    dealer.subscription && dealer.subscription.status === 'active';
};

// Check if a user has provider dashboard access
UserSchema.methods.hasProviderAccess = async function() {
  return this.role === 'admin' || this.role === 'provider' || 
         (this.businessProfile && this.businessProfile.services.length > 0);
};

// Check if a user has ministry dashboard access
UserSchema.methods.hasMinistryAccess = async function() {
  return this.role === 'admin' || this.role === 'ministry';
};

// === NEW METHODS ===

// Calculate profile completeness percentage
UserSchema.methods.calculateProfileCompleteness = function() {
  let score = 0;
  let maxScore = 0;

  // Basic info (40 points total)
  maxScore += 40;
  if (this.name) score += 10;
  if (this.email) score += 10;
  if (this.avatar && this.avatar.url) score += 10;
  if (this.profile && this.profile.phone) score += 10;

  // Extended profile (30 points total)
  maxScore += 30;
  if (this.profile) {
    if (this.profile.bio) score += 10;
    if (this.profile.address && this.profile.address.city) score += 10;
    if (this.profile.dateOfBirth) score += 10;
  }

  // Business profile (30 points total if they have services)
  if (this.businessProfile && this.businessProfile.services.length > 0) {
    maxScore += 30;
    if (this.businessProfile.businessName) score += 10;
    if (this.businessProfile.businessType) score += 10;
    if (this.businessProfile.services.some(s => s.isVerified)) score += 10;
  }

  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  this.activity.profileCompleteness = percentage;
  return percentage;
};

// Check if user can provide a specific service
UserSchema.methods.canProvideService = function(serviceType) {
  if (!this.businessProfile || !this.businessProfile.services) return false;
  
  return this.businessProfile.services.some(service => 
    service.serviceType === serviceType && 
    service.isActive && 
    service.isVerified
  );
};

// Get user's active verified services
UserSchema.methods.getActiveServices = function() {
  if (!this.businessProfile || !this.businessProfile.services) return [];
  
  return this.businessProfile.services.filter(service => 
    service.isActive && service.isVerified
  );
};

// Add points and check for achievements
UserSchema.methods.addPoints = function(points, reason) {
  this.activity.points = (this.activity.points || 0) + points;
  
  // Check for point-based achievements
  const pointMilestones = [100, 500, 1000, 2500, 5000, 10000];
  pointMilestones.forEach(milestone => {
    if (this.activity.points >= milestone) {
      const hasAchievement = this.activity.achievements.some(
        achievement => achievement.achievementType === `points_${milestone}`
      );
      
      if (!hasAchievement) {
        this.activity.achievements.push({
          achievementType: `points_${milestone}`,
          unlockedAt: new Date(),
          description: `Earned ${milestone} points`,
          points: milestone / 10
        });
      }
    }
  });
  
  return this.activity.points;
};

// Get user's QR codes for their services
UserSchema.methods.getServiceQRCodes = function() {
  if (!this.businessProfile || !this.businessProfile.services) return [];
  
  return this.businessProfile.services
    .filter(service => service.qrCode && service.qrCode.isActive)
    .map(service => ({
      serviceId: service._id,
      serviceName: service.serviceName,
      serviceType: service.serviceType,
      qrCode: service.qrCode
    }));
};

export default mongoose.model('User', UserSchema);