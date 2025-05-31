// server/models/Auction.js
import mongoose from 'mongoose';
import slugify from 'slugify';

const auctionSchema = new mongoose.Schema({
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
  vehicle: {
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
      enum: ['fwd', 'rwd', 'awd', '4wd']
    },
    exteriorColor: String,
    interiorColor: String,
    vin: String
  },
  images: [{
    url: {
      type: String,
      required: true
    },
    thumbnail: {
      type: String,
      required: true
    },
    isPrimary: {
      type: Boolean,
      default: false
    }
  }],
  features: [String],
  safetyFeatures: [String],
  comfortFeatures: [String],
  performanceFeatures: [String],
  entertainmentFeatures: [String],
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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
    postalCode: String
  },
  startingBid: {
    type: Number,
    required: [true, 'Please add a starting bid']
  },
  reservePrice: {
    type: Number,
    default: 0
  },
  currentBid: {
    amount: {
      type: Number,
      default: 0
    },
    bidder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    time: Date
  },
  bidHistory: [{
    amount: {
      type: Number,
      required: true
    },
    bidder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    time: {
      type: Date,
      default: Date.now
    }
  }],
  status: {
    type: String,
    enum: ['draft', 'pending', 'active', 'ended', 'sold', 'unsold'],
    default: 'draft'
  },
  startDate: {
    type: Date,
    required: [true, 'Please specify when the auction starts']
  },
  endDate: {
    type: Date,
    required: [true, 'Please specify when the auction ends']
  },
  incrementAmount: {
    type: Number,
    default: 100,
    required: [true, 'Please specify bid increment amount']
  },
  featured: {
    type: Boolean,
    default: false
  },
  views: {
    type: Number,
    default: 0
  },
  watchers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  winner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  sellerNotes: String,
  inspectionReports: [{
    title: String,
    description: String,
    fileUrl: String,
    date: Date
  }],
  auctionFee: {
    type: Number,
    default: 0
  },
  termsAccepted: {
    type: Boolean,
    default: false,
    required: [true, 'Terms must be accepted']
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create slug from title
auctionSchema.pre('save', function(next) {
  if (this.isModified('title')) {
    this.slug = slugify(this.title, { lower: true, strict: true });
  }
  next();
});

// Index for searching
auctionSchema.index({
  title: 'text',
  description: 'text',
  'vehicle.make': 'text',
  'vehicle.model': 'text'
});

// Status methods
auctionSchema.methods.hasStarted = function() {
  return new Date() >= this.startDate;
};

auctionSchema.methods.hasEnded = function() {
  return new Date() >= this.endDate;
};

// Check if reserve is met
auctionSchema.methods.isReserveMet = function() {
  return this.currentBid.amount >= this.reservePrice;
};

// Place a bid
auctionSchema.methods.placeBid = async function(userId, amount) {
  if (this.hasEnded()) {
    throw new Error('Auction has ended');
  }
  
  if (!this.hasStarted()) {
    throw new Error('Auction has not started yet');
  }
  
  if (amount <= this.currentBid.amount) {
    throw new Error('Bid amount must be higher than the current bid');
  }
  
  if (this.currentBid.amount === 0 && amount < this.startingBid) {
    throw new Error('Bid must be at least the starting bid amount');
  }
  
  if (amount < this.currentBid.amount + this.incrementAmount) {
    throw new Error(`Bid must be at least ${this.incrementAmount} more than the current bid`);
  }
  
  if (userId.toString() === this.seller.toString()) {
    throw new Error('Seller cannot bid on their own auction');
  }
  
  // Add to bid history
  this.bidHistory.push({
    amount,
    bidder: userId,
    time: new Date()
  });
  
  // Update current bid
  this.currentBid = {
    amount,
    bidder: userId,
    time: new Date()
  };
  
  await this.save();
  return this;
};

// Auto-end auction
auctionSchema.methods.endAuction = async function() {
  // If auction is already ended, do nothing
  if (['ended', 'sold', 'unsold'].includes(this.status)) {
    return this;
  }
  
  // Set status based on bids
  if (this.bidHistory.length > 0 && this.isReserveMet()) {
    this.status = 'sold';
    this.winner = this.currentBid.bidder;
  } else {
    this.status = 'unsold';
  }
  
  await this.save();
  return this;
};

// Virtual fields
auctionSchema.virtual('timeRemaining').get(function() {
  if (this.hasEnded()) {
    return 0;
  }
  return this.endDate - new Date();
});

auctionSchema.virtual('bidCount').get(function() {
  return this.bidHistory.length;
});

auctionSchema.virtual('isActive').get(function() {
  return this.status === 'active' && this.hasStarted() && !this.hasEnded();
});

auctionSchema.virtual('totalBidders').get(function() {
  const uniqueBidders = new Set();
  this.bidHistory.forEach(bid => uniqueBidders.add(bid.bidder.toString()));
  return uniqueBidders.size;
});

// Static methods for queries
auctionSchema.statics.getActiveAuctions = function() {
  return this.find({ 
    status: 'active', 
    startDate: { $lte: new Date() }, 
    endDate: { $gt: new Date() } 
  });
};

auctionSchema.statics.getEndingSoonAuctions = function(hours = 24) {
  const date = new Date();
  const futureDate = new Date(date);
  futureDate.setHours(date.getHours() + hours);
  
  return this.find({
    status: 'active',
    startDate: { $lte: date },
    endDate: { $gt: date, $lte: futureDate }
  });
};

auctionSchema.statics.getUpcomingAuctions = function() {
  return this.find({
    status: 'active',
    startDate: { $gt: new Date() }
  });
};

// Query middleware
auctionSchema.pre('find', function(next) {
  this.populate('seller', 'name email avatar');
  next();
});

auctionSchema.pre('findOne', function(next) {
  this.populate('seller', 'name email avatar');
  this.populate('currentBid.bidder', 'name email avatar');
  next();
});

// Create model
const Auction = mongoose.model('Auction', auctionSchema);

export default Auction;