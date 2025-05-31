// src/utils/apiHelpers.js

/**
 * A utility function to add delay between requests to avoid rate limiting
 * @param {Function} apiCall - The API call function to execute
 * @param {number} retryCount - Current retry count
 * @param {number} maxRetries - Maximum number of retries
 * @returns {Promise} - The API response
 */
export const executeWithBackoff = async (apiCall, retryCount = 0, maxRetries = 3) => {
    try {
      // Add exponential backoff delay if retrying
      if (retryCount > 0) {
        const delay = Math.min(1000 * Math.pow(2, retryCount) + Math.random() * 1000, 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      return await apiCall();
    } catch (error) {
      // If we got a 429 rate limit error and haven't reached max retries
      if (error.response?.status === 429 && retryCount < maxRetries) {
        console.log(`Rate limited. Retrying (${retryCount + 1}/${maxRetries})...`);
        return executeWithBackoff(apiCall, retryCount + 1, maxRetries);
      }
      
      // For other errors or if max retries reached, throw the error
      throw error;
    }
  };
  
  /**
   * Throttle function to limit request frequency
   * @param {Function} func - Function to throttle
   * @param {number} limit - Minimum time between calls in ms
   * @returns {Function} - Throttled function
   */
  export const throttle = (func, limit) => {
    let lastCall = 0;
    return function(...args) {
      const now = Date.now();
      if (now - lastCall < limit) {
        return Promise.resolve(null); // Skip if called too recently
      }
      lastCall = now;
      return func.apply(this, args);
    };
  };