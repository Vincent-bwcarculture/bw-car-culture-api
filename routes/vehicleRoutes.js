// server/routes/vehicleRoutes.js
import express from 'express';
import {
  getUserVehicles,
  getVehicle,
  addVehicle,
  updateVehicle,
  deleteVehicle,
  uploadVehicleImages,
  deleteVehicleImage,
  setPrimaryImage,
  addServiceRecord,
  getVehicleAnalytics,
  updateVehicleMetrics,
  getVehiclesDueForService,
  getVehicleStats,
  linkVehicleToListing,
  unlinkVehicleFromListing
} from '../controllers/vehicleController.js';

import { protect } from '../middleware/auth.js';
import { uploadMultiple, uploadSingle } from '../middleware/upload.js';

const router = express.Router();

// All routes are protected (require authentication)
router.use(protect);

// === BASIC VEHICLE CRUD ===
// Get all user vehicles
router.get('/', getUserVehicles);

// Get single vehicle
router.get('/:id', getVehicle);

// Add new vehicle
router.post('/', addVehicle);

// Update vehicle
router.put('/:id', updateVehicle);

// Delete vehicle (soft delete)
router.delete('/:id', deleteVehicle);

// === VEHICLE IMAGES ===
// Upload vehicle images
router.post('/:id/images', uploadMultiple('images', 10), uploadVehicleImages);

// Delete specific vehicle image
router.delete('/:id/images/:imageIndex', deleteVehicleImage);

// Set primary image
router.put('/:id/images/:imageIndex/primary', setPrimaryImage);

// === SERVICE TRACKING ===
// Add service record
router.post('/:id/service', addServiceRecord);

// Get vehicles due for service
router.get('/service-due', getVehiclesDueForService);

// === ANALYTICS & STATS ===
// Get vehicle analytics
router.get('/:id/analytics', getVehicleAnalytics);

// Get user vehicle statistics
router.get('/stats', getVehicleStats);

// Update vehicle performance metrics (internal use)
router.put('/:id/metrics', updateVehicleMetrics);

// === LISTING INTEGRATION ===
// Link vehicle to listing (internal use)
router.post('/:id/link-listing', linkVehicleToListing);

// Unlink vehicle from listing (internal use)
router.delete('/:id/unlink-listing/:listingId', unlinkVehicleFromListing);

export default router;
