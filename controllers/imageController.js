// server/controllers/imageController.js
import asyncHandler from '../middleware/async.js';
import { ErrorResponse } from '../utils/errorResponse.js';
import { uploadImage, deleteImage } from '../utils/imageUpload.js';

/**
 * @desc    Upload image to S3
 * @route   POST /api/images/upload
 * @access  Private
 */
export const uploadSingleImage = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return next(new ErrorResponse('Please upload a file', 400));
  }

  try {
    // Extract folder path from request body or default to 'general'
    const folder = req.body.folder || 'general';
    
    // Upload image to S3
    const result = await uploadImage(req.file, folder);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Image upload error:', error);
    return next(new ErrorResponse('Image upload failed', 500));
  }
});

/**
 * @desc    Upload multiple images to S3
 * @route   POST /api/images/upload/multiple
 * @access  Private
 */
export const uploadMultipleImages = asyncHandler(async (req, res, next) => {
  if (!req.files || req.files.length === 0) {
    return next(new ErrorResponse('Please upload at least one file', 400));
  }

  try {
    const folder = req.body.folder || 'general';
    
    // Upload all images to S3
    const uploadPromises = req.files.map(file => uploadImage(file, folder));
    const results = await Promise.all(uploadPromises);

    res.status(200).json({
      success: true,
      count: results.length,
      data: results
    });
  } catch (error) {
    console.error('Multiple image upload error:', error);
    return next(new ErrorResponse('Image upload failed', 500));
  }
});

/**
 * @desc    Delete image from S3
 * @route   DELETE /api/images/:key
 * @access  Private
 */
export const deleteImageController = asyncHandler(async (req, res, next) => {
  const { key } = req.params;

  if (!key) {
    return next(new ErrorResponse('Please provide image key', 400));
  }

  try {
    // Delete image from S3
    await deleteImage(key);

    res.status(200).json({
      success: true,
      message: 'Image deleted successfully'
    });
  } catch (error) {
    console.error('Image deletion error:', error);
    return next(new ErrorResponse('Image deletion failed', 500));
  }
});

/**
 * @desc    Get pre-signed URL for uploading to S3
 * @route   POST /api/images/presigned-url
 * @access  Private
 */
export const getPresignedUrl = asyncHandler(async (req, res, next) => {
  const { fileName, fileType, folder = 'general' } = req.body;

  if (!fileName || !fileType) {
    return next(new ErrorResponse('Please provide fileName and fileType', 400));
  }

  try {
    const { getPresignedUploadUrl } = await import('../utils/imageUpload.js');
    const result = await getPresignedUploadUrl(fileName, fileType, folder);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Presigned URL error:', error);
    return next(new ErrorResponse('Failed to generate presigned URL', 500));
  }
});

/**
 * @desc    Optimize and re-upload existing image
 * @route   PUT /api/images/optimize
 * @access  Private
 */
export const optimizeExistingImage = asyncHandler(async (req, res, next) => {
  const { imageUrl, folder = 'general' } = req.body;

  if (!imageUrl) {
    return next(new ErrorResponse('Please provide image URL', 400));
  }

  try {
    // Download the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch image');
    }

    const buffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(buffer);

    // Create a file-like object
    const file = {
      buffer: uint8Array,
      mimetype: response.headers.get('content-type') || 'image/jpeg',
      originalname: imageUrl.split('/').pop()
    };

    // Re-upload optimized version
    const result = await uploadImage(file, folder);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Image optimization error:', error);
    return next(new ErrorResponse('Image optimization failed', 500));
  }
});