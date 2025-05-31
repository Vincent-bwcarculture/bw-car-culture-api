// server/services/authService.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { ErrorResponse } from '../utils/errorResponse.js';

class AuthService {
  static async validateLoginCredentials(email, password) {
    if (!email || !password) {
      throw new ErrorResponse('Please provide email and password', 400);
    }

    // Find user and include password for verification
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      throw new ErrorResponse('Invalid credentials', 401);
    }

    // Check if account is locked
    if (user.isLocked()) {
      throw new ErrorResponse('Account is temporarily locked. Please try again later', 423);
    }

    // Verify password
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      // Increment login attempts
      await user.incrementLoginAttempts();
      throw new ErrorResponse('Invalid credentials', 401);
    }

    // Reset login attempts on successful login
    await user.resetLoginAttempts();

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    return user;
  }

  static async generateAuthResponse(user) {
    const token = user.generateAuthToken();

    return {
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        lastLogin: user.lastLogin
      }
    };
  }

  static verifyToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      throw new ErrorResponse('Invalid token', 401);
    }
  }

  async verifyAuthConnection() {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        return { authenticated: false, error: 'No token found' };
      }
  
      const response = await axios.get('/api/auth/verify', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
  
      return {
        authenticated: true,
        user: response.data.user
      };
    } catch (error) {
      return {
        authenticated: false,
        error: error.message
      };
    }
  }

}

export default AuthService;