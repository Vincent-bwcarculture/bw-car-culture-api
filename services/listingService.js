// src/services/listingService.js
import axios from 'axios';
import { ApiError } from '../utils/errorHandler';
import { http } from '../config/axios';

class ListingService {
  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || 'https://bw-car-culture-api.vercel.app';
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

  // FIXED: Create new listing - Send S3 URLs, don't upload files again
  async createListing(listingData) {
    try {
      console.log('Creating listing with data:', {
        title: listingData.title,
        price: listingData.price,
        dealerId: listingData.dealerId,
        hasImages: !!listingData.images,
        imageCount: listingData.images?.length || 0,
        imageUrls: listingData.images?.map(img => img.url) || []
      });
      
      // Prepare listing data - keep S3 URLs from imageService
      const dataForServer = {
        ...listingData,
        // Ensure images are in the correct format (S3 URLs from imageService)
        images: listingData.images?.map(img => ({
          url: img.url,
          key: img.key,
          size: img.size,
          mimetype: img.mimetype,
          thumbnail: img.thumbnail,
          isPrimary: img.isPrimary
        })) || []
      };
      
      console.log('Sending to API:', {
        endpoint: '/listings',
        method: 'POST',
        imageCount: dataForServer.images.length,
        firstImageUrl: dataForServer.images[0]?.url
      });
      
      // Send as JSON with S3 URLs (NOT FormData with files)
      const response = await this.axios.post('/listings', dataForServer, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ Listing created successfully:', response.data);
      return response.data;
      
    } catch (error) {
      console.error('❌ Error in createListing service:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  }

  // Add retry operation
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

  // Add health check
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

  // Add image validation
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
      // For updates, send as JSON (assume images are already S3 URLs)
      const response = await this.axios.put(`/listings/${id}`, listingData, {
        headers: {
          'Content-Type': 'application/json'
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

  // REMOVED: transformListingData - no longer needed since we use proper S3 URLs
  
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