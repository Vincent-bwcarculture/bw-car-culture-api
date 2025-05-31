// server/routes/authRoutes.js
import express from 'express';
import {
  register,
  registerAdmin,
  login,
  getMe,
  logout,
  updateProfile,
  toggleFavorite,
  getFavorites,
  getUsers,
  approveUser
} from '../controllers/authController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/register', register);
router.post('/register/admin', registerAdmin);
router.post('/login', login);
router.post('/logout', logout);

// Protected routes
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.put('/favorites/:id', protect, toggleFavorite);
router.get('/favorites', protect, getFavorites);

// Admin routes
router.get('/users', protect, authorize('admin'), getUsers);
router.put('/users/:id/approve', protect, authorize('admin'), approveUser);

export default router;