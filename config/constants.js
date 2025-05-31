// Add to src/config/constants.js
export const API_CONFIG = {
    BASE_URL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
    TIMEOUT: 30000,
    RETRY_ATTEMPTS: 3
  };
  
  // Add error tracking service configuration
  export const ERROR_TRACKING = {
    enabled: process.env.NODE_ENV === 'production',
    sampleRate: 0.1
  };
  
  // Add performance monitoring thresholds
  export const PERFORMANCE_THRESHOLDS = {
    FCP: 2000, // First Contentful Paint
    LCP: 2500, // Largest Contentful Paint
    FID: 100,  // First Input Delay
    CLS: 0.1   // Cumulative Layout Shift
  };