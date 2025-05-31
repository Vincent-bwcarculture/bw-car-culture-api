// server/models/CarReview.js
import mongoose from 'mongoose';

const RatingSchema = new mongoose.Schema({
  reliability: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  fuelEfficiency: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  comfort: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  performance: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  value: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  }
});

const CarReviewSchema = new mongoose.Schema({
  carMake: {
    type: String,
    required: [true, 'Please provide the car make'],
    trim: true
  },
  carModel: {
    type: String,
    required: [true, 'Please provide the car model'],
    trim: true
  },
  carYear: {
    type: String,
    required: [true, 'Please provide the car year'],
    trim: true
  },
  reviewText: {
    type: String,
    required: [true, 'Please provide a review'],
    trim: true,
    minlength: [50, 'Review text must be at least 50 characters long']
  },
  ratings: {
    type: RatingSchema,
    required: true
  },
  averageRating: {
    type: Number,
    min: 1,
    max: 5
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ownerName: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  helpful: {
    count: {
      type: Number,
      default: 0
    },
    users: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  },
  reported: {
    count: {
      type: Number,
      default: 0
    },
    users: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
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
    caption: String
  }]
}, {
  timestamps: true
});

// Calculate average rating before saving
CarReviewSchema.pre('save', function(next) {
  const ratings = this.ratings;
  const sum = ratings.reliability + ratings.fuelEfficiency + 
              ratings.comfort + ratings.performance + ratings.value;
  this.averageRating = sum / 5;
  next();
});

// Create text index for searching
CarReviewSchema.index({
  carMake: 'text',
  carModel: 'text',
  reviewText: 'text'
});

// Create compound index for filtering
CarReviewSchema.index({ carMake: 1, carModel: 1, status: 1 });

export default mongoose.model('CarReview', CarReviewSchema);