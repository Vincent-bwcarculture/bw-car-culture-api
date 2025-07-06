// server/routes/roleRequestRoutes.js
import express from 'express';
import {
  createRoleRequest,
  getRoleRequests,
  getMyRoleRequests,
  getRoleRequest,
  updateRoleRequestStatus,
  deleteRoleRequest,
  getRoleRequestStats
} from '../controllers/roleRequestController.js';

import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// Public routes (requires authentication)
router.use(protect);

// User routes
router
  .route('/')
  .get(authorize('admin'), getRoleRequests) // Admin only
  .post(createRoleRequest); // Any authenticated user

router.get('/my-requests', getMyRoleRequests); // User's own requests
router.get('/stats', authorize('admin'), getRoleRequestStats); // Admin only

router
  .route('/:id')
  .get(getRoleRequest) // User can see own requests, admin can see all
  .delete(authorize('admin'), deleteRoleRequest); // Admin only

router.put('/:id/status', authorize('admin'), updateRoleRequestStatus); // Admin only

export default router;
