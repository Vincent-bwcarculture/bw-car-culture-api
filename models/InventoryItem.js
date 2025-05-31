// server/models/InventoryItem.js
import mongoose from 'mongoose';

const inventoryItemSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please add a title'],
    trim: true,
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Please add a description'],
    maxlength: [5000, 'Description cannot be more than 5000 characters']
  },
  category: {
    type: String,
    required: [true, 'Please specify a category'],
    enum: ['Parts', 'Accessories', 'Apparel', 'Collectibles', 'Tools', 'Fluids', 'Electronics', 'Other']
  },
  price: {
    type: Number,
    required: [true, 'Please add a price']
  },
  originalPrice: {
    type: Number,
    default: null
  },
  currency: {
    type: String,
    default: 'BWP'
  },
  condition: {
    type: String,
    enum: ['New', 'Used', 'Refurbished'],
    default: 'New'
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
  stock: {
    quantity: {
      type: Number,
      required: [true, 'Please specify stock quantity'],
      min: [0, 'Stock quantity cannot be negative']
    },
    sku: {
      type: String,
      default: null
    },
    location: {
      type: String,
      default: null
    }
  },
  specifications: {
    type: Object,
    default: {}
  },
  features: {
    type: [String],
    default: []
  },
  compatibleVehicles: {
    type: [Object],
    default: []
  },
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Please specify the business'],
    ref: 'ServiceProvider'
  },
  businessType: {
    type: String,
    enum: ['dealer', 'service'],
    required: [true, 'Please specify business type']
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending', 'rejected'],
    default: 'active'
  },
  featured: {
    type: Boolean,
    default: false
  },
  metrics: {
    views: {
      type: Number,
      default: 0
    },
    clicks: {
      type: Number,
      default: 0
    },
    purchases: {
      type: Number,
      default: 0
    },
    lastViewed: {
      type: Date,
      default: null
    }
  },
  shipping: {
    available: {
      type: Boolean,
      default: false
    },
    cost: {
      type: Number,
      default: 0
    },
    freeOver: {
      type: Number,
      default: null
    },
    estimatedDays: {
      type: String,
      default: null
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create index for search functionality
inventoryItemSchema.index({
  title: 'text',
  description: 'text',
  category: 'text',
  'specifications.brand': 'text',
  'specifications.model': 'text',
  'specifications.partNumber': 'text'
});

// Virtual for business details
inventoryItemSchema.virtual('business', {
  ref: function() {
    return this.businessType === 'dealer' ? 'Dealer' : 'ServiceProvider';
  },
  localField: 'businessId',
  foreignField: '_id',
  justOne: true
});

// Method to check if in stock
inventoryItemSchema.methods.isInStock = function() {
  return this.stock.quantity > 0;
};

// Method to check if on sale
inventoryItemSchema.methods.isOnSale = function() {
  return this.originalPrice !== null && this.price < this.originalPrice;
};

// Static method to get recently viewed items
inventoryItemSchema.statics.getRecentlyViewed = async function(limit = 10) {
  return this.find({ 'metrics.lastViewed': { $ne: null }, status: 'active' })
    .sort({ 'metrics.lastViewed': -1 })
    .limit(limit)
    .populate('business', 'businessName logo location.city');
};

// Pre-save hook to generate SKU if not provided
inventoryItemSchema.pre('save', function(next) {
  if (!this.stock.sku) {
    // Generate SKU format: CAT-BUSID-RANDOM
    const category = this.category.substring(0, 3).toUpperCase();
    const businessId = this.businessId.toString().substring(0, 4);
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    this.stock.sku = `${category}-${businessId}-${random}`;
  }
  next();
});

export default mongoose.model('InventoryItem', inventoryItemSchema);