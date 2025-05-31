// server/routes/analyticsRoutes.js
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import {
  trackEvent,
  trackSearch,
  trackPerformance,
  getDashboardData,
  getRealTimeData,
  getTrafficData,
  getContentData,
  getPerformanceData,
  exportData,
  getHealthStatus,
  batchTrackEvents
} from '../controllers/analyticsController.js';

const router = express.Router();

// Public tracking endpoints (for client-side analytics)
router.post('/track', trackEvent);
router.post('/track/search', trackSearch);
router.post('/track/performance', trackPerformance);
router.post('/track/batch', batchTrackEvents);

// Protected analytics endpoints (admin only)
router.get('/dashboard', protect, authorize('admin'), getDashboardData);
router.get('/realtime', protect, authorize('admin'), getRealTimeData);
router.get('/traffic', protect, authorize('admin'), getTrafficData);
router.get('/content', protect, authorize('admin'), getContentData);
router.get('/performance', protect, authorize('admin'), getPerformanceData);
router.get('/export', protect, authorize('admin'), exportData);

// Health check endpoint
router.get('/health', getHealthStatus);

export default router;