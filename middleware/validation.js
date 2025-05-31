// server/middleware/validation.js
import mongoose from 'mongoose';
import { ErrorResponse } from '../utils/errorResponse.js';

export const validateResource = (resourceType) => async (req, res, next) => {
  try {
    // Get the model
    const Model = mongoose.model(resourceType);
    
    // Create an instance without saving to validate
    const resource = new Model(req.body);
    
    try {
      // Validate the document
      await resource.validate();
      next();
    } catch (validationError) {
      // Extract validation error details
      const errors = {};
      
      if (validationError.errors) {
        // Process mongoose validation errors
        Object.keys(validationError.errors).forEach(field => {
          errors[field] = validationError.errors[field].message;
        });
      }
      
      console.error('Validation failed:', errors);
      
      // Return a structured error response
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }
  } catch (error) {
    console.error('Error during validation middleware:', error);
    next(new ErrorResponse('Server error during validation', 500));
  }
};