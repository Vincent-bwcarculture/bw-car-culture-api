// server/models/Analytics.js
import mongoose from 'mongoose';

// Session Schema - Tracks user sessions
const sessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  startTime: {
    type: Date,
    default: Date.now,
    index: true
  },
  endTime: {
    type: Date,
    default: null
  },
  lastActivity: {
    type: Date,
    default: Date.now,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  userAgent: {
    type: String,
    default: ''
  },
  ip: {
    type: String,
    index: true
  },
  country: {
    type: String,
    default: 'Unknown'
  },
  city: {
    type: String,
    default: 'Unknown'
  },
  device: {
    type: {
      type: String,
      enum: ['mobile', 'tablet', 'desktop'],
      default: 'desktop'
    },
    os: {
      type: String,
      default: 'Unknown'
    },
    browser: {
      type: String,
      default: 'Unknown'
    },
    model: {
      type: String,
      default: 'Unknown'
    }
  },
  pages: [{
    type: String
  }],
  totalPageViews: {
    type: Number,
    default: 0
  },
  duration: {
    type: Number, // in seconds
    default: 0
  },
  referrer: {
    type: String,
    default: null
  },
  utmSource: {
    type: String,
    default: null
  },
  utmMedium: {
    type: String,
    default: null
  },
  utmCampaign: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Page View Schema - Tracks individual page visits
const pageViewSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  page: {
    type: String,
    required: true,
    index: true
  },
  title: {
    type: String,
    default: null
  },
  referrer: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: ''
  },
  ip: {
    type: String,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  timeOnPage: {
    type: Number, // in seconds
    default: null
  },
  exitPage: {
    type: Boolean,
    default: false
  },
  query: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  loadTime: {
    type: Number, // in milliseconds
    default: null
  },
  bounced: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Interaction Schema - Tracks user interactions and events
const interactionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  eventType: {
    type: String,
    required: true,
    index: true
  },
  category: {
    type: String,
    enum: [
      'interaction',    // General UI interactions
      'content',        // Content consumption
      'conversion',     // Business conversions
      'navigation',     // Site navigation
      'system',         // System events
      'engagement',     // User engagement
      'business'        // Business-specific events
    ],
    required: true,
    index: true
  },
  page: {
    type: String,
    index: true
  },
  elementId: {
    type: String,
    default: null
  },
  elementText: {
    type: String,
    default: null
  },
  value: {
    type: Number,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Business Event Schema - Tracks specific business events
const businessEventSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  eventType: {
    type: String,
    required: true,
    enum: [
      'listing_view',
      'listing_inquiry',
      'dealer_contact',
      'phone_call',
      'listing_favorite',
      'search_performed',
      'filter_applied',
      'news_read',
      'form_submission',
      'user_registration',
      'user_login'
    ],
    index: true
  },
  entityId: {
    type: String, // ID of the listing, dealer, article, etc.
    index: true
  },
  entityType: {
    type: String,
    enum: ['listing', 'dealer', 'article', 'user', 'search'],
    index: true
  },
  value: {
    type: Number, // Monetary value if applicable
    default: null
  },
  conversionValue: {
    type: Number, // Conversion value for this event
    default: 0
  },
  details: {
    // Listing details
    listingPrice: Number,
    listingMake: String,
    listingModel: String,
    listingYear: Number,
    dealerId: String,
    
    // Search details
    searchQuery: String,
    searchCategory: String,
    searchResults: Number,
    searchFilters: mongoose.Schema.Types.Mixed,
    
    // Contact details
    contactMethod: String,
    phoneNumber: String,
    
    // Form details
    formType: String,
    formFields: [String],
    
    // General metadata
    source: String,
    campaign: String,
    medium: String
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Performance Metrics Schema - Tracks page performance
const performanceMetricSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  page: {
    type: String,
    required: true,
    index: true
  },
  metrics: {
    // Web Vitals
    firstContentfulPaint: Number, // FCP
    largestContentfulPaint: Number, // LCP
    firstInputDelay: Number, // FID
    cumulativeLayoutShift: Number, // CLS
    
    // Loading metrics
    loadTime: Number,
    domContentLoaded: Number,
    timeToFirstByte: Number,
    
    // Custom metrics
    timeToInteractive: Number,
    speedIndex: Number
  },
  connection: {
    effectiveType: String, // 4g, 3g, 2g, slow-2g
    downlink: Number,
    rtt: Number,
    saveData: Boolean
  },
  device: {
    type: String,
    memory: Number, // Device memory in GB
    hardwareConcurrency: Number // CPU cores
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Daily Metrics Schema - Aggregated daily statistics
const dailyMetricsSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true,
    index: true
  },
  metrics: {
    // Traffic metrics
    uniqueVisitors: { type: Number, default: 0 },
    totalSessions: { type: Number, default: 0 },
    totalPageViews: { type: Number, default: 0 },
    avgSessionDuration: { type: Number, default: 0 },
    bounceRate: { type: Number, default: 0 },
    
    // Business metrics
    listingsViewed: { type: Number, default: 0 },
    dealerContacts: { type: Number, default: 0 },
    phoneCallClicks: { type: Number, default: 0 },
    searchQueries: { type: Number, default: 0 },
    newsArticlesRead: { type: Number, default: 0 },
    favoritesAdded: { type: Number, default: 0 },
    
    // Conversion metrics
    conversionRate: { type: Number, default: 0 },
    totalConversionValue: { type: Number, default: 0 },
    avgConversionValue: { type: Number, default: 0 },
    
    // Device breakdown
    mobileUsers: { type: Number, default: 0 },
    tabletUsers: { type: Number, default: 0 },
    desktopUsers: { type: Number, default: 0 },
    
    // Performance metrics
    avgLoadTime: { type: Number, default: 0 },
    avgFCP: { type: Number, default: 0 },
    avgLCP: { type: Number, default: 0 },
    avgFID: { type: Number, default: 0 },
    avgCLS: { type: Number, default: 0 }
  },
  breakdown: {
    // Top pages
    topPages: [{
      page: String,
      views: Number,
      uniqueVisitors: Number
    }],
    
    // Top search queries
    topSearches: [{
      query: String,
      count: Number,
      successRate: Number
    }],
    
    // Geographic data
    topCountries: [{
      country: String,
      visitors: Number,
      percentage: Number
    }],
    
    // Traffic sources
    trafficSources: {
      direct: Number,
      organic: Number,
      social: Number,
      referral: Number,
      email: Number,
      paid: Number
    }
  }
}, {
  timestamps: true
});

// Add indexes for better query performance
sessionSchema.index({ startTime: -1 });
sessionSchema.index({ isActive: 1, lastActivity: -1 });
sessionSchema.index({ userId: 1, startTime: -1 });
sessionSchema.index({ 'device.type': 1 });
sessionSchema.index({ country: 1 });

pageViewSchema.index({ page: 1, timestamp: -1 });
pageViewSchema.index({ sessionId: 1, timestamp: 1 });
pageViewSchema.index({ timestamp: -1 });
pageViewSchema.index({ userId: 1, timestamp: -1 });

interactionSchema.index({ eventType: 1, timestamp: -1 });
interactionSchema.index({ category: 1, timestamp: -1 });
interactionSchema.index({ sessionId: 1, timestamp: 1 });
interactionSchema.index({ page: 1, eventType: 1 });
interactionSchema.index({ userId: 1, timestamp: -1 });

businessEventSchema.index({ eventType: 1, timestamp: -1 });
businessEventSchema.index({ entityType: 1, entityId: 1 });
businessEventSchema.index({ userId: 1, timestamp: -1 });
businessEventSchema.index({ timestamp: -1, conversionValue: -1 });

performanceMetricSchema.index({ page: 1, timestamp: -1 });
performanceMetricSchema.index({ timestamp: -1 });

dailyMetricsSchema.index({ date: -1 });

// Pre-save middleware for sessions
sessionSchema.pre('save', function(next) {
  if (this.isModified('lastActivity') || this.isNew) {
    // Update duration
    this.duration = Math.floor((this.lastActivity - this.startTime) / 1000);
  }
  next();
});

// Static methods for common queries

// Session methods
sessionSchema.statics.getActiveSessionsCount = function() {
  return this.countDocuments({ isActive: true });
};

sessionSchema.statics.getSessionsByDateRange = function(startDate, endDate) {
  return this.find({
    startTime: { $gte: startDate, $lte: endDate }
  }).sort({ startTime: -1 });
};

// Page view methods
pageViewSchema.statics.getPopularPages = function(startDate, endDate, limit = 10) {
  return this.aggregate([
    { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: '$page',
        views: { $sum: 1 },
        uniqueVisitors: { $addToSet: '$sessionId' }
      }
    },
    {
      $project: {
        page: '$_id',
        views: 1,
        uniqueVisitors: { $size: '$uniqueVisitors' }
      }
    },
    { $sort: { views: -1 } },
    { $limit: limit }
  ]);
};

// Interaction methods
interactionSchema.statics.getEventsByType = function(eventType, startDate, endDate) {
  return this.find({
    eventType,
    timestamp: { $gte: startDate, $lte: endDate }
  }).sort({ timestamp: -1 });
};

interactionSchema.statics.getSearchAnalytics = function(startDate, endDate) {
  return this.aggregate([
    {
      $match: {
        eventType: 'search',
        timestamp: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: '$metadata.query',
        searches: { $sum: 1 },
        avgResults: { $avg: '$metadata.resultsCount' },
        successRate: {
          $avg: {
            $cond: [
              { $gt: ['$metadata.resultsCount', 0] },
              100,
              0
            ]
          }
        }
      }
    },
    {
      $project: {
        query: '$_id',
        searches: 1,
        avgResults: { $round: ['$avgResults', 0] },
        successRate: { $round: ['$successRate', 1] }
      }
    },
    { $sort: { searches: -1 } }
  ]);
};

// Business event methods
businessEventSchema.statics.getConversionFunnel = function(startDate, endDate) {
  return this.aggregate([
    { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
    {
      $group: {
        _id: '$eventType',
        count: { $sum: 1 },
        totalValue: { $sum: '$conversionValue' }
      }
    },
    { $sort: { count: -1 } }
  ]);
};

// Create and export models
export const Session = mongoose.model('AnalyticsSession', sessionSchema);
export const PageView = mongoose.model('AnalyticsPageView', pageViewSchema);
export const Interaction = mongoose.model('AnalyticsInteraction', interactionSchema);
export const BusinessEvent = mongoose.model('AnalyticsBusinessEvent', businessEventSchema);
export const PerformanceMetric = mongoose.model('AnalyticsPerformanceMetric', performanceMetricSchema);
export const DailyMetrics = mongoose.model('AnalyticsDailyMetrics', dailyMetricsSchema);

// Export all models as default
export default {
  Session,
  PageView,
  Interaction,
  BusinessEvent,
  PerformanceMetric,
  DailyMetrics
};