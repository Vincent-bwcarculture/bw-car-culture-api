// server/models/News.js
import mongoose from 'mongoose';

const newsSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Article title is required'],
    trim: true,
    maxlength: 150
  },
  subtitle: {
    type: String,
    maxlength: 200
  },
  slug: {
    type: String,
    unique: true,
    index: true,
    maxlength: 200 // Increased max length
  },
  content: {
    type: String,
    required: [true, 'Article content is required']
  },
  category: {
    type: String,
    required: [true, 'Article category is required'],
    enum: ['news', 'review', 'feature', 'comparison', 'industry'],
    default: 'news'
  },
  tags: [{
    type: String,
    trim: true
  }],
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  authorName: {
    type: String,
    default: 'Car Culture News'
  },
  featuredImage: {
    url: String,
    caption: String,
    credit: String,
    key: String,
    size: Number,
    mimetype: String
  },
  gallery: [{
    url: String,
    caption: String,
    key: String,
    size: Number,
    mimetype: String
  }],
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  featured: {
    type: Boolean,
    default: false
  },
  publishDate: {
    type: Date
  },
  metadata: {
    views: {
      type: Number,
      default: 0
    },
    likes: {
      type: Number,
      default: 0
    },
    comments: {
      type: Number,
      default: 0
    },
    readTime: {
      type: Number,
      default: 5
    }
  },
  seo: {
    metaTitle: String,
    metaDescription: String,
    metaKeywords: String
  },
  ratings: {
    performance: Number,
    comfort: Number,
    handling: Number,
    practicality: Number,
    value: Number,
    overall: Number
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create text index for search
newsSchema.index({
  title: 'text',
  content: 'text',
  tags: 'text',
  category: 'text'
});

// Pre-save hook to generate slug
newsSchema.pre('save', async function(next) {
  // Generate slug from title if not provided
  if (!this.slug && this.title) {
    // Create a cleaner slug with no trailing hyphens and limited length
    let baseSlug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
      .substring(0, 150); // Limit length to prevent issues
    
    // Ensure slug is unique
    let finalSlug = baseSlug;
    let counter = 0;
    
    while (true) {
      const existingDoc = await this.constructor.findOne({ 
        slug: finalSlug,
        _id: { $ne: this._id }
      });
      
      if (!existingDoc) break;
      
      counter++;
      finalSlug = `${baseSlug}-${counter}`;
    }
    
    this.slug = finalSlug;
  }
  
  next();
});

// Virtual for full URL path - now uses ID
newsSchema.virtual('url').get(function() {
  return `/news/article/${this._id}`;
});

// Virtual for calculating average rating
newsSchema.virtual('averageRating').get(function() {
  if (!this.ratings) return null;
  
  const ratings = Object.values(this.ratings).filter(r => r !== null && r !== undefined);
  if (ratings.length === 0) return null;
  
  return ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
});

const News = mongoose.model('News', newsSchema);
export default News;