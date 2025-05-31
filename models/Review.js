// server/models/Review.js
import mongoose from 'mongoose';
import Dealer from './Dealer.js';
import slugify from 'slugify';

const reviewSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: [200, 'Title cannot be more than 200 characters']
  },
  subtitle: {
    type: String,
    trim: true,
    maxlength: [300, 'Subtitle cannot be more than 300 characters']
  },
  slug: {
    type: String,
    unique: true
  },
  content: { 
    type: mongoose.Schema.Types.Mixed,
    required: true 
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  authorName: {
    type: String
  },
  authorDetails: {
    avatar: String,
    title: String,
    bio: String
  },
  category: { 
    type: String, 
    required: true,
    enum: ['car-review', 'news', 'comparison', 'feature', 'industry']
  },
  type: {
    type: String,
    enum: ['car-review', 'dealer-review', 'editorial', 'comparison', 'first-drive'],
    default: 'car-review'
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  featuredImage: {
    url: {
      type: String,
      default: null
    },
    thumbnail: {
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
    },
    alt: String,
    credit: String,
    caption: String
  },
  gallery: [{
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
    alt: String,
    caption: String
  }],
  car: {
    make: String,
    model: String,
    year: Number,
    trim: String,
    price: Number,
    engine: String,
    transmission: String
  },
  dealer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dealer'
  },
  dealerInfo: {
    businessName: String,
    logo: String,
    location: {
      city: String,
      country: String
    },
    verification: {
      isVerified: {
        type: Boolean,
        default: false
      }
    }
  },
  rating: {
    overall: {
      type: Number,
      min: 0,
      max: 10
    },
    categories: {
      design: { type: Number, min: 0, max: 10 },
      performance: { type: Number, min: 0, max: 10 },
      comfort: { type: Number, min: 0, max: 10 },
      technology: { type: Number, min: 0, max: 10 },
      value: { type: Number, min: 0, max: 10 }
    },
    pros: [String],
    cons: [String]
  },
  videos: [{
    title: String,
    url: String,
    thumbnail: String,
    duration: String,
    platform: {
      type: String,
      enum: ['youtube', 'vimeo', 'other']
    }
  }],
  podcast: {
    title: String,
    url: String,
    duration: String,
    platform: String
  },
  publishDate: {
    type: Date,
    default: Date.now
  },
  featured: {
    type: Boolean,
    default: false
  },
  tags: [{
    type: String,
    trim: true
  }],
  stats: {
    views: {
      type: Number,
      default: 0
    },
    likes: {
      type: Number,
      default: 0
    },
    shares: {
      type: Number,
      default: 0
    },
    comments: {
      type: Number,
      default: 0
    }
  },
  seo: {
    metaTitle: String,
    metaDescription: String,
    keywords: [String],
    canonicalUrl: String
  },
  relatedReviews: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Review'
  }],
  relatedListings: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Listing'
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create slug from title
reviewSchema.pre('save', function(next) {
  if (this.isModified('title')) {
    this.slug = slugify(this.title, { lower: true, strict: true });
  }
  
  this.updatedAt = new Date();
  
  next();
});

// Pre-save middleware to check dealer subscription for reviews
reviewSchema.pre('save', async function(next) {
  try {
    if (this.isNew && this.dealer) {
      const dealer = await Dealer.findById(this.dealer);
      
      if (!dealer) {
        throw new Error('Dealer not found');
      }
      
      if (!dealer.subscription?.features?.allowReviews) {
        throw new Error(`Dealer's subscription plan does not include reviews. Please upgrade to add reviews.`);
      }
      
      this.dealerInfo = {
        businessName: dealer.businessName,
        logo: dealer.profile?.logo || null,
        location: {
          city: dealer.location?.city || 'Unknown',
          country: dealer.location?.country || 'Unknown'
        },
        verification: {
          isVerified: dealer.verification?.status === 'verified'
        }
      };
    }
    
    if (this.isNew || this.isModified('videos') || this.isModified('podcast')) {
      if (this.dealer && (this.videos?.length > 0 || this.podcast)) {
        const dealer = await Dealer.findById(this.dealer);
        
        if (!dealer) {
          throw new Error('Dealer not found');
        }
        
        if (this.videos?.length > 0 && !dealer.subscription?.features?.allowVideos) {
          throw new Error(`Dealer's subscription plan does not include videos. Please upgrade to add videos.`);
        }
        
        if (this.podcast && !dealer.subscription?.features?.allowPodcasts) {
          throw new Error(`Dealer's subscription plan does not include podcasts. Please upgrade to add podcasts.`);
        }
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Method to increment views
reviewSchema.methods.incrementViews = async function() {
  if (!this.stats) {
    this.stats = { views: 0 };
  }
  this.stats.views = (this.stats.views || 0) + 1;
  return this.save({ validateBeforeSave: false });
};

// Static method to get related reviews
reviewSchema.statics.getRelatedReviews = async function(review, limit = 3) {
  return this.find({
    _id: { $ne: review._id },
    status: 'published',
    $or: [
      { 'car.make': review.car?.make },
      { 'car.model': review.car?.model },
      { tags: { $in: review.tags } }
    ]
  })
  .limit(limit)
  .sort('-publishDate');
};

// Static method to get dealer's reviews
reviewSchema.statics.getDealerReviews = async function(dealerId, limit = 10, page = 1) {
  const skip = (page - 1) * limit;
  
  return this.find({
    dealer: dealerId,
    status: 'published'
  })
  .skip(skip)
  .limit(limit)
  .sort('-publishDate');
};

// Static method to get featured reviews
reviewSchema.statics.getFeaturedReviews = async function(limit = 5) {
  return this.find({
    featured: true,
    status: 'published'
  })
  .limit(limit)
  .sort('-publishDate');
};

// Indexes
reviewSchema.index({ title: 'text', 'car.make': 'text', 'car.model': 'text', tags: 'text' });
reviewSchema.index({ status: 1, publishDate: -1 });
reviewSchema.index({ dealer: 1, status: 1 });
reviewSchema.index({ slug: 1 });
reviewSchema.index({ featured: 1 });
reviewSchema.index({ 'car.make': 1, 'car.model': 1 });

const Review = mongoose.model('Review', reviewSchema);

export default Review;