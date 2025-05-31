// src/utils/imageUploadVerification.js
export const verifyImageUpload = async (file) => {
    try {
      const formData = new FormData();
      formData.append('test-image', file);
  
      const response = await fetch('/api/upload/verify', {
        method: 'POST',
        body: formData,
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });
  
      if (!response.ok) {
        throw new Error('Image upload verification failed');
      }
  
      return {
        success: true,
        message: 'Image upload system working correctly'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  };