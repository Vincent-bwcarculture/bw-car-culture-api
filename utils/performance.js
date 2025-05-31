// Add to utils/performance.js
export const lazyLoadImage = (imageSrc) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = imageSrc;
      img.onload = () => resolve(img);
      img.onerror = reject;
    });
  };

  // Add to src/utils/performance.js
export const imageOptimizer = {
  compressImage: async (file, options = {}) => {
    const { maxWidth = 1200, quality = 0.8 } = options;
    // Implementation...
  },


  preloadCriticalAssets: (assets) => {
    assets.forEach(asset => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.href = asset;
      link.as = asset.endsWith('.js') ? 'script' : 'style';
      document.head.appendChild(link);
    });
  }
};
  
  export const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };