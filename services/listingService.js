// src/services/listingService.js
import axios from 'axios';
import { ApiError } from '../utils/errorHandler';
import { http } from '../config/axios';

class ListingService {
  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
    this.axios = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      withCredentials: true
    });

    // Add request interceptor
    this.axios.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor
    this.axios.interceptors.response.use(
      (response) => response,
      (error) => {
        // Handle unauthorized errors
        if (error.response?.status === 401) {
          localStorage.removeItem('token');
          window.location.href = '/login';
        }
        return Promise.reject(ApiError.handle(error));
      }
    );
  }

  // Create new listing
  async createListing(listingData) {
    try {
      // Create a FormData object
      const formData = new FormData();
      
      // Extract all file-related data before JSON stringifying
      const dataForServer = { ...listingData };
      delete dataForServer.images; // Remove image objects
      
      // Add basic listing data as JSON
      formData.append('listingData', JSON.stringify(dataForServer));
      
      // Process images if any exist
      if (listingData.images && listingData.images.length > 0) {
        console.log(`Processing ${listingData.images.length} images`);
        
        // Add each valid image file to formData
        listingData.images.forEach((img, index) => {
          if (img && img.file && (img.file instanceof File || img.file instanceof Blob)) {
            console.log(`Adding image ${index}: ${img.file.name}, type: ${img.file.type}`);
            formData.append('images', img.file);
            
            // Mark primary image
            if (index === listingData.primaryImageIndex) {
              formData.append('primaryImage', index.toString());
            }
          } else {
            console.warn(`Invalid image at index ${index}, skipping`);
          }
        });
      }
      
      // Make API call
      const response = await this.axios.post('/listings', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Error in createListing service:', error);
      throw error;
    }
  }

// Add to listingService.js
async retryOperation(operation, maxAttempts = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;
      
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => 
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      );
    }
  }
  
  throw lastError;
}

// Add to listingService.js
async checkHealth() {
  try {
    const response = await this.axios.get('/health');
    return {
      status: 'ok',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message
    };
  }
}

// Add to listingService.js
validateImages(images) {
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  const errors = [];
  images.forEach((image, index) => {
    if (!ALLOWED_TYPES.includes(image.type)) {
      errors.push(`File ${index + 1} has invalid type. Allowed: JPG, PNG, WebP`);
    }
    if (image.size > MAX_FILE_SIZE) {
      errors.push(`File ${index + 1} exceeds 5MB limit`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

  // Update listing
  async updateListing(id, listingData, onProgress) {
    try {
      const formData = new FormData();
      
      // Handle images
      if (listingData.images) {
        listingData.images.forEach((image, index) => {
          formData.append('images', image);
        });
        delete listingData.images;
      }

      formData.append('data', JSON.stringify(listingData));

      const response = await this.axios.put(`/listings/${id}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          const progress = (progressEvent.loaded / progressEvent.total) * 100;
          onProgress?.(Math.round(progress));
        }
      });

      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Get all listings with filters
  async getListings(filters = {}) {
    try {
      const response = await this.axios.get('/listings', { params: filters });
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Get single listing
  async getListing(id) {
    try {
      const response = await this.axios.get(`/listings/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  transformListingData(data) {
    return {
      ...data,
      price: parseFloat(data.price),
      images: data.images?.map(img => ({
        ...img,
        url: `${process.env.REACT_APP_API_URL}${img.url}`
      }))
    };
  }

  handleError(error) {
    const errorMessage = error.response?.data?.message || error.message;
    
    // Log error for debugging
    if (process.env.NODE_ENV === 'development') {
      console.error('Listing Service Error:', {
        message: errorMessage,
        status: error.response?.status,
        endpoint: error.config?.url
      });
    }
  
    throw new ApiError(errorMessage, error.response?.status);
  }

  // Delete listing
  async deleteListing(id) {
    try {
      const response = await this.axios.delete(`/listings/${id}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Update listing status
  async updateListingStatus(id, status) {
    try {
      const response = await this.axios.patch(`/listings/${id}/status`, { status });
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Get featured listings
  async getFeaturedListings() {
    try {
      const response = await this.axios.get('/listings/featured');
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  // Get dealer listings
  async getDealerListings(dealerId) {
    try {
      const response = await this.axios.get(`/listings/dealer/${dealerId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
}

export const listingService = new ListingService();