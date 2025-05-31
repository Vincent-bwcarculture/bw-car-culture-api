// server/config/analytics.js
export const analyticsConfig = {
  // Data retention policies
  dataRetention: {
    pageViews: parseInt(process.env.ANALYTICS_PAGEVIEW_RETENTION_DAYS) || 90, // 3 months
    sessions: parseInt(process.env.ANALYTICS_SESSION_RETENTION_DAYS) || 365, // 1 year  
    interactions: parseInt(process.env.ANALYTICS_INTERACTION_RETENTION_DAYS) || 180, // 6 months
    businessMetrics: parseInt(process.env.ANALYTICS_BUSINESS_METRICS_RETENTION_DAYS) || 1095, // 3 years
    searchAnalytics: parseInt(process.env.ANALYTICS_SEARCH_RETENTION_DAYS) || 365, // 1 year
    performanceMetrics: parseInt(process.env.ANALYTICS_PERFORMANCE_RETENTION_DAYS) || 30 // 1 month
  },

  // Performance settings
  performance: {
    batchSize: parseInt(process.env.ANALYTICS_BATCH_SIZE) || 1000,
    aggregationInterval: parseInt(process.env.ANALYTICS_AGGREGATION_INTERVAL) || 3600000, // 1 hour
    maxConcurrentQueries: parseInt(process.env.ANALYTICS_MAX_CONCURRENT_QUERIES) || 5,
    enableCaching: process.env.ANALYTICS_ENABLE_CACHING !== 'false',
    cacheExpiration: parseInt(process.env.ANALYTICS_CACHE_EXPIRATION) || 300 // 5 minutes
  },

  // Privacy and compliance
  privacy: {
    enableGDPRCompliance: process.env.ANALYTICS_GDPR_COMPLIANCE !== 'false',
    anonymizeIPs: process.env.ANALYTICS_ANONYMIZE_IPS !== 'false',
    enableDataSubjectRequests: process.env.ANALYTICS_ENABLE_DATA_SUBJECT_REQUESTS !== 'false',
    cookieConsent: process.env.ANALYTICS_REQUIRE_COOKIE_CONSENT !== 'false'
  },

  // Sampling for high-traffic scenarios
  sampling: {
    enabled: process.env.ANALYTICS_SAMPLING_ENABLED === 'true',
    rate: parseFloat(process.env.ANALYTICS_SAMPLING_RATE) || 1.0, // 100% by default
    enableSmartSampling: process.env.ANALYTICS_SMART_SAMPLING === 'true'
  },

  // Monitoring and alerts
  monitoring: {
    enableHealthChecks: process.env.ANALYTICS_HEALTH_CHECKS !== 'false',
    alertThresholds: {
      errorRate: parseFloat(process.env.ANALYTICS_ERROR_RATE_THRESHOLD) || 0.05, // 5%
      responseTime: parseInt(process.env.ANALYTICS_RESPONSE_TIME_THRESHOLD) || 5000 // 5 seconds
    }
  },

  // Feature flags
  features: {
    realTimeAnalytics: process.env.ANALYTICS_REALTIME !== 'false',
    performanceTracking: process.env.ANALYTICS_PERFORMANCE_TRACKING !== 'false',
    searchAnalytics: process.env.ANALYTICS_SEARCH_TRACKING !== 'false',
    userSessionTracking: process.env.ANALYTICS_SESSION_TRACKING !== 'false'
  }
};

// Validation
export const validateAnalyticsConfig = () => {
  const errors = [];

  if (analyticsConfig.dataRetention.pageViews < 7) {
    errors.push('Page view retention must be at least 7 days');
  }

  if (analyticsConfig.performance.batchSize < 100 || analyticsConfig.performance.batchSize > 10000) {
    errors.push('Batch size must be between 100 and 10000');
  }

  if (analyticsConfig.sampling.rate < 0 || analyticsConfig.sampling.rate > 1) {
    errors.push('Sampling rate must be between 0 and 1');
  }

  if (errors.length > 0) {
    throw new Error(`Analytics configuration errors: ${errors.join(', ')}`);
  }

  return true;
};

export default analyticsConfig;
