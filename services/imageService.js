// src/services/imageService.js
class ImageService {
    constructor() {
      this.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
      this.endpoint = `${this.baseURL}/listings`; // Update this to match your API
    }
  
    async uploadImage(file, onProgress) {
      const formData = new FormData();
      formData.append('images', file); // Note: changed to 'images' to match the multer config
  
      try {
        const response = await axios.post(this.endpoint, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
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
  }
  
  export const imageService = new ImageService();