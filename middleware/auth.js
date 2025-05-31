// server/middleware/auth.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { ErrorResponse } from '../utils/errorResponse.js';

// Create an optional auth middleware for public routes that may have authenticated users
export const optionalAuth = async (req, res, next) => {
  try {
    let token;

    // Get token from Authorization header
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // If no token, just continue without user
    if (!token) {
      return next();
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      
      if (user && user.status !== 'suspended') {
        req.user = user;
      }
    } catch (err) {
      // Invalid token, but that's OK for optional auth
      console.log('Invalid token in optional auth route');
    }

    next();
  } catch (err) {
    console.error('Optional auth middleware error:', err);
    next(err);
  }
};

// The main protect middleware for routes that require authentication
export const protect = async (req, res, next) => {
  try {
    let token;

    // Get token from Authorization header
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      console.log('Found token in Authorization header');
    }

    if (!token) {
      console.log(`No token found for protected route: ${req.path}`);
      return res.status(401).json({
        success: false,
        message: 'Please login to access this route'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log(`Token verified successfully for user ID: ${decoded.id}`);
      
      // Get user from token
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        console.log(`User not found for ID: ${decoded.id}`);
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if user is still active
      if (user.status === 'suspended') {
        console.log(`User ${user._id} is suspended`);
        return res.status(401).json({
          success: false,
          message: 'User account is suspended'
        });
      }

      req.user = user;
      next();
    } catch (err) {
      console.error('Token verification error:', err);
      
      if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token'
        });
      } else if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expired'
        });
      } else {
        return res.status(401).json({
          success: false,
          message: 'Not authorized'
        });
      }
    }
  } catch (err) {
    console.error('Auth middleware error:', err);
    next(err);
  }
};

// Enhanced authorize middleware
export const authorize = (...roles) => {
  return (req, res, next) => {
    // Debug middleware execution
    console.log('Authorization check for roles:', roles);
    console.log('User role:', req.user?.role);
    
    if (!req.user) {
      console.log('Authorization failed: No user in request');
      return next(new ErrorResponse('Not authorized to access this route', 401));
    }

    if (!roles.includes(req.user.role)) {
      console.log(`Authorization failed: User role ${req.user.role} not in allowed roles: ${roles.join(', ')}`);
      return next(
        new ErrorResponse(
          `User role ${req.user.role} is not authorized to access this route`,
          403
        )
      );
    }

    console.log(`Authorization successful for user: ${req.user.id} with role: ${req.user.role}`);
    next();
  };
};