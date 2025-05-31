// server/routes/dashboardRoutes.js
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import {
  getDashboardStats,
  getAnalytics,
  getRecentActivity,
  generatePerformanceReport
} from '../controllers/dashboardController.js';

const router = express.Router();

// All dashboard routes should be protected and admin-only
router.use(protect);
router.use(authorize('admin'));

// Dashboard endpoints
router.get('/stats', getDashboardStats);
router.get('/analytics', getAnalytics);
router.get('/activity', getRecentActivity);
router.get('/report', generatePerformanceReport);

export default router;