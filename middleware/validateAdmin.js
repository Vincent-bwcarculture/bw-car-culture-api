// server/middleware/validateAdmin.js
import ErrorResponse from '../utils/errorResponse.js';

export const validateAdminAccess = async (req, res, next) => {
  try {
    // For initial admin setup, you might want to check against environment variables
    const { email, password } = req.body;
    
    // Add your admin validation logic here
    // For example, check against allowed admin emails
    const allowedAdmins = process.env.ADMIN_EMAILS?.split(',') || [];
    
    if (!allowedAdmins.includes(email)) {
      return next(new ErrorResponse('Not authorized to access admin area', 403));
    }

    next();
  } catch (error) {
    next(error);
  }
};