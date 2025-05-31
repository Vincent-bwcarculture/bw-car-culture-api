// server/models/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema({
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
  favorites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Listing'
  }],
  lastLogin: {
    type: Date,
    default: null
  },
  // For provider users
  providerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ServiceProvider'
  },
  // For ministry users
  ministryInfo: {
    ministryName: String,
    department: String,
    role: String
  },
  resetPasswordToken: String,
  resetPasswordExpire: Date
}, {
  timestamps: true
});

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

// Add a method to check if user has an active dealership
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
  return this.role === 'admin' || this.role === 'provider';
};

// Check if a user has ministry dashboard access
UserSchema.methods.hasMinistryAccess = async function() {
  return this.role === 'admin' || this.role === 'ministry';
};

export default mongoose.model('User', UserSchema);