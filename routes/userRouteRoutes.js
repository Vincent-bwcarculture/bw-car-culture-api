// server/routes/userRouteRoutes.js
import express from 'express';
import {
  getUserRoutes,
  getUserRoute,
  createUserRoute,
  updateUserRoute,
  deleteUserRoute,
  uploadRouteImages,
  addRouteReview,
  updateRouteLocation,
  setRouteUnavailable,
  clearRouteUnavailability,
  getRouteAnalytics,
  incrementRouteAnalytics,
  getUserRouteStats,
  searchRoutes,
  findNearbyRoutes,
  getRouteBySlug
} from '../controllers/userRouteController.js';

import { protect } from '../middleware/auth.js';
import { uploadMultiple } from '../middleware/upload.js';

const router = express.Router();

// === PUBLIC ROUTES (no authentication required) ===
// Search routes by origin/destination
router.get('/search', searchRoutes);

// Find nearby routes
router.get('/nearby', findNearbyRoutes);

// Get route by slug (public view)
router.get('/public/:slug', getRouteBySlug);

// === PROTECTED ROUTES (authentication required) ===
// Apply protection middleware to all routes below
router.use(protect);

// === BASIC ROUTE CRUD ===
// Get all user routes
router.get('/', getUserRoutes);

// Get user route statistics
router.get('/stats', getUserRouteStats);

// Get single route
router.get('/:id', getUserRoute);

// Create new route
router.post('/', createUserRoute);

// Update route
router.put('/:id', updateUserRoute);

// Delete route
router.delete('/:id', deleteUserRoute);

// === ROUTE IMAGES ===
// Upload route images
router.post('/:id/images', uploadMultiple('images', 5), uploadRouteImages);

// === ROUTE REVIEWS ===
// Add review to route (from other users)
router.post('/:id/reviews', addRouteReview);

// === LOCATION TRACKING ===
// Update route location (for real-time tracking)
router.put('/:id/location', updateRouteLocation);

// === AVAILABILITY MANAGEMENT ===
// Set route as temporarily unavailable
router.put('/:id/unavailable', setRouteUnavailable);

// Clear route unavailability
router.delete('/:id/unavailable', clearRouteUnavailability);

// === ANALYTICS ===
// Get route analytics
router.get('/:id/analytics', getRouteAnalytics);

// Increment route analytics (internal use)
router.post('/:id/analytics/:metric', incrementRouteAnalytics);

export default router;
