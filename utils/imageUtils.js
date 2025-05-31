// src/utils/imageUtils.js
export const getImagePath = (imageName, type = 'default') => {
  const baseUrl = process.env.REACT_APP_API_URL || '';
  
  // Return placeholder for missing images
  if (!imageName) {
    return `${baseUrl}/images/placeholders/default-${type}.png`;
  }

  // Handle relative vs absolute URLs
  if (imageName.startsWith('http')) {
    return imageName;
  }

  // Check for common UUID pattern in your file names
  const uuidPattern = /[a-f0-9-]{32,36}\.(jpg|jpeg|png|webp|gif)/i;
  if (uuidPattern.test(imageName)) {
    // Extract just the filename if it's a path
    const filename = imageName.split('/').pop();
    // Make sure it has the correct /uploads/listings/ prefix
    return `${baseUrl}/uploads/listings/${filename}`;
  }

  // Default handling for other paths
  return `${baseUrl}${imageName.startsWith('/') ? '' : '/'}${imageName}`;
};