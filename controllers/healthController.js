// server/controllers/healthController.js
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';

/**
 * @desc    Check API health
 * @route   GET /api/health
 * @access  Public
 */
export const checkApiHealth = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API is operational',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
};

/**
 * @desc    Check database connection
 * @route   GET /api/health/db
 * @access  Public
 */
export const checkDatabaseHealth = async (req, res) => {
  try {
    // Check if Mongoose is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database connection is not established',
        status: 'error',
        details: {
          connectionState: mongoose.connection.readyState
        }
      });
    }

    // Ping the database to ensure it's responsive
    await mongoose.connection.db.admin().ping();

    res.status(200).json({
      success: true,
      message: 'Database connection is healthy',
      status: 'ok',
      details: {
        connectionState: 'connected',
        host: mongoose.connection.host,
        name: mongoose.connection.name
      }
    });
  } catch (error) {
    console.error('Database health check failed:', error);
    res.status(503).json({
      success: false,
      message: 'Database connection check failed',
      status: 'error',
      details: {
        error: error.message
      }
    });
  }
};

/**
 * @desc    Check file storage system
 * @route   GET /api/health/storage
 * @access  Public
 */
export const checkStorageHealth = async (req, res) => {
  try {
    // Define upload directory path (same as in your file upload utility)
    const uploadPath = process.env.FILE_UPLOAD_PATH || './public/uploads';
    
    // Check if directory exists
    if (!fs.existsSync(uploadPath)) {
      return res.status(503).json({
        success: false,
        message: 'Upload directory does not exist',
        status: 'error',
        details: {
          path: uploadPath
        }
      });
    }
    
    // Check if directory is writable by creating and removing a test file
    const testFilePath = path.join(uploadPath, '.health-check-test');
    try {
      // Try to write to the directory
      fs.writeFileSync(testFilePath, 'Health check test');
      
      // Try to read from the directory
      fs.readFileSync(testFilePath);
      
      // Clean up
      fs.unlinkSync(testFilePath);
    } catch (fsError) {
      return res.status(503).json({
        success: false,
        message: 'File system is not writable or readable',
        status: 'error',
        details: {
          error: fsError.message,
          path: uploadPath
        }
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Storage system is healthy',
      status: 'ok',
      details: {
        path: uploadPath,
        access: 'read/write'
      }
    });
  } catch (error) {
    console.error('Storage health check failed:', error);
    res.status(503).json({
      success: false,
      message: 'Storage health check failed',
      status: 'error',
      details: {
        error: error.message
      }
    });
  }
};