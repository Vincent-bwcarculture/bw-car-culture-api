// server/models/Video.js
import mongoose from 'mongoose';
import slugify from 'slugify';

const videoSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a title'],
    trim: true,
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  slug: {
    type: String,
    unique: true
  },
  description: {
    type: String,
    trim: true
  },
  youtubeUrl: {
    type: String,
    required: [true, 'Please add a YouTube URL'],
    trim: true
  },
  youtubeVideoId: {
    type: String,
    required: [true, 'YouTube video ID is required'],
    trim: true
  },
  thumbnail: {
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
  category: {
    type: String,
    enum: [
      'car-review', 
      'podcast', 
      'maintenance', 
      'news', 
      'test-drive', 
      'comparison'
    ],
    required: [true, 'Please specify a video category']
  },
  subscriptionTier: {
    type: String,
    enum: ['basic', 'standard', 'premium', 'none'],
    default: 'none',
    required: [true, 'Please specify the required subscription tier']
  },
  featured: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  authorName: {
    type: String
  },
  relatedDealerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dealer',
    default: null
  },
  relatedListingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Listing',
    default: null
  },
  publishDate: {
    type: Date,
    default: Date.now
  },
  metadata: {
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 }
  },
  tags: [String]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Generate slug from title before saving
videoSchema.pre('save', function(next) {
  if (!this.slug || this.isModified('title')) {
    this.slug = slugify(this.title, { 
      lower: true, 
      strict: true,
      remove: /[*+~.()'"!:@]/g
    });
  }
  
  // Extract YouTube video ID if not already set
  if (this.isModified('youtubeUrl') && !this.youtubeVideoId) {
    const youtubeId = extractYouTubeId(this.youtubeUrl);
    if (youtubeId) {
      this.youtubeVideoId = youtubeId;
      
      // Set thumbnail URL if not already set
      if (!this.thumbnail?.url) {
        this.thumbnail = {
          url: `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`,
          key: null,
          size: null,
          mimetype: 'image/jpeg'
        };
      }
    }
  }
  
  next();
});

// Extract YouTube video ID helper function
function extractYouTubeId(url) {
  if (!url) return null;
  
  // Handle different YouTube URL formats
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  
  return (match && match[2].length === 11) ? match[2] : null;
}

// Virtual field for embedded YouTube iframe
videoSchema.virtual('embedUrl').get(function() {
  return `https://www.youtube.com/embed/${this.youtubeVideoId}`;
});

// Virtual for comments
videoSchema.virtual('comments', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'video'
});

// Indexes for efficient querying
videoSchema.index({ featured: 1, status: 1, publishDate: -1 });
videoSchema.index({ category: 1, status: 1 });
videoSchema.index({ 'metadata.views': -1 });
videoSchema.index({ subscriptionTier: 1 });
videoSchema.index({ relatedDealerId: 1 });
videoSchema.index({ relatedListingId: 1 });

const Video = mongoose.model('Video', videoSchema);

export default Video;