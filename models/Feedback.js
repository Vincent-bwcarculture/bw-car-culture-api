// server/models/Feedback.js
import mongoose from 'mongoose';

const FeedbackSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a name'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please add an email'],
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  feedbackType: {
    type: String,
    enum: ['general', 'bug', 'feature', 'content', 'design', 'other'],
    default: 'general'
  },
  message: {
    type: String,
    required: [true, 'Please add your feedback message'],
    trim: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: 5
  },
  // Add attachments with S3 integration
  attachments: [{
    url: {
      type: String,
      required: true
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
    filename: {
      type: String,
      required: true
    }
  }],
  status: {
    type: String,
    enum: ['new', 'in-progress', 'completed', 'archived'],
    default: 'new'
  },
  adminNotes: {
    type: String,
    default: ''
  },
  statusHistory: [
    {
      status: {
        type: String,
        enum: ['new', 'in-progress', 'completed', 'archived']
      },
      changedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      changedAt: {
        type: Date,
        default: Date.now
      }
    }
  ],
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  // Add optional user reference for authenticated users
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // Add page context where feedback was submitted
  pageContext: {
    url: String,
    page: String,
    section: String
  },
  // Add priority level for admin triage
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  // Add browser information for better bug tracking
  browserInfo: {
    userAgent: String,
    browser: String,
    version: String,
    os: String,
    device: String
  },
  // Add response from admin
  adminResponse: {
    message: String,
    respondedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    respondedAt: Date
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
FeedbackSchema.index({ status: 1 });
FeedbackSchema.index({ feedbackType: 1 });
FeedbackSchema.index({ createdAt: -1 });
FeedbackSchema.index({ email: 1 });
FeedbackSchema.index({ priority: 1, status: 1 });
FeedbackSchema.index({ user: 1 });

// Add text search index
FeedbackSchema.index({
  name: 'text',
  email: 'text',
  message: 'text',
  adminNotes: 'text'
});

// Pre-save middleware to add status history
FeedbackSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    this.statusHistory.push({
      status: this.status,
      changedBy: this._updatedBy, // This should be set by the controller
      changedAt: new Date()
    });
  }
  next();
});

// Method to add admin response
FeedbackSchema.methods.addAdminResponse = function(message, adminId) {
  this.adminResponse = {
    message: message,
    respondedBy: adminId,
    respondedAt: new Date()
  };
  return this.save();
};

const Feedback = mongoose.model('Feedback', FeedbackSchema);

export default Feedback;