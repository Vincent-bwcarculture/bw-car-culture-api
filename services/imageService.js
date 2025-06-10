// src/services/imageService.js
class ImageService {
  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || 'https://bw-car-culture-api.vercel.app';
    this.endpoint = `${this.baseURL}/images/upload/multiple`; // ← FIXED!
  }
  
  async uploadImage(file, onProgress) {
    const formData = new FormData();
    formData.append('image1', file); // ← FIXED field name for multiple upload
    
    try {
      const response = await axios.post(this.endpoint, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          // Remove auth header if not needed for image uploads
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress?.(progress);
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Image upload error:', error);
      throw error;
    }
  }

  // Add method for multiple images
  async uploadMultipleImages(files, onProgress) {
    const formData = new FormData();
    files.forEach((file, index) => {
      formData.append(`image${index + 1}`, file);
    });
    
    try {
      const response = await axios.post(this.endpoint, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress?.(progress);
        }
      });
      
      return response.data;
    } catch (error) {
      console.error('Multiple image upload error:', error);
      throw error;
    }
  }
}

export const imageService = new ImageService();