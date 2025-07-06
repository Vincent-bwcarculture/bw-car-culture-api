// server/models/RoleRequest.js
import mongoose from 'mongoose';

const RoleRequestSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  requestType: {
    type: String,
    enum: ['dealer', 'provider', 'ministry', 'coordinator'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  
  // Common fields for all request types
  reason: {
    type: String,
    required: true
  },
  
  // Dealer-specific fields
  businessName: String,
  businessType: {
    type: String,
    enum: ['dealership', 'private_seller', 'auction_house']
  },
  licenseNumber: String,
  
  // Provider-specific fields
  serviceType: {
    type: String,
    enum: ['mechanic', 'body_shop', 'detailing', 'towing', 'parts_dealer', 'other']
  },
  experience: String,
  
  // Ministry-specific fields (for compatibility with existing system)
  ministryName: String,
  department: String,
  position: String,
  employeeId: String,
  
  // Coordinator-specific fields
  stationName: String,
  transportExperience: String,
  
  // Contact and verification info
  contactDetails: {
    phone: String,
    alternateEmail: String,
    businessAddress: String
  },
  
  // Supporting documents
  documents: [{
    filename: String,
    url: String,
    key: String,
    mimetype: String,
    size: Number,
    documentType: {
      type: String,
      enum: ['license', 'certificate', 'id', 'insurance', 'registration', 'other']
    }
  }],
  
  // Review tracking
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewNotes: String,
  reviewedAt: Date,
  
  // Additional metadata
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  
  // Auto-approval rules
  autoApprovalEligible: {
    type: Boolean,
    default: false
  },
  
  // Integration tracking
  associatedEntityId: mongoose.Schema.Types.ObjectId, // Created dealer/provider ID after approval
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
RoleRequestSchema.index({ user: 1, requestType: 1 });
RoleRequestSchema.index({ status: 1, createdAt: -1 });
RoleRequestSchema.index({ requestType: 1, status: 1 });

// Virtual for formatted request type
RoleRequestSchema.virtual('formattedRequestType').get(function() {
  return this.requestType.charAt(0).toUpperCase() + this.requestType.slice(1);
});

// Check if user can have multiple requests of same type
RoleRequestSchema.statics.canUserRequestRole = async function(userId, requestType) {
  const existingPending = await this.findOne({
    user: userId,
    requestType: requestType,
    status: 'pending'
  });
  
  return !existingPending;
};

// Get user's active requests
RoleRequestSchema.statics.getUserRequests = async function(userId) {
  return await this.find({ user: userId })
    .sort({ createdAt: -1 })
    .populate('reviewedBy', 'name email')
    .lean();
};

// Instance method to check if request can be auto-approved
RoleRequestSchema.methods.checkAutoApproval = function() {
  // Define auto-approval rules based on request type
  const autoApprovalRules = {
    dealer: false, // Always require manual approval
    provider: this.experience && parseInt(this.experience) >= 2, // 2+ years experience
    ministry: false, // Always require manual approval
    coordinator: false // Always require manual approval
  };
  
  this.autoApprovalEligible = autoApprovalRules[this.requestType] || false;
  return this.autoApprovalEligible;
};

// Pre-save middleware to set priority
RoleRequestSchema.pre('save', function(next) {
  if (this.isNew) {
    // Set priority based on request type
    const priorityMap = {
      ministry: 'high',
      dealer: 'high',
      provider: 'medium',
      coordinator: 'medium'
    };
    
    this.priority = priorityMap[this.requestType] || 'medium';
    
    // Check auto-approval eligibility
    this.checkAutoApproval();
  }
  
  next();
});

// Post-save middleware for notifications
RoleRequestSchema.post('save', async function(doc) {
  // Only trigger for new requests
  if (doc.isNew) {
    try {
      // Here you could add notification logic
      console.log(`New ${doc.requestType} role request from user ${doc.user}`);
      
      // If auto-approval eligible, could trigger automatic approval
      if (doc.autoApprovalEligible) {
        console.log(`Request ${doc._id} is eligible for auto-approval`);
      }
    } catch (error) {
      console.error('Post-save notification error:', error);
    }
  }
});

export default mongoose.model('RoleRequest', RoleRequestSchema);
