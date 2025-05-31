// server/routes/carRoutes.js
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { advancedResults } from '../middleware/advancedResults.js';
import { upload } from '../utils/fileUpload.js';
import {
  createCar,
  getCars,
  getCar,
  updateCar,
  deleteCar,
  getDealerCars
} from '../controllers/carController.js';

const router = express.Router();

// Public routes
router.get('/', advancedResults(Car), getCars);
router.get('/:id', getCar);
router.get('/dealer/:dealerId/cars', getDealerCars);

// Protected routes
router.use(protect);

router.post(
  '/',
  authorize('dealer', 'admin'),
  upload.array('images', 10),
  createCar
);

router.put(
  '/:id',
  authorize('dealer', 'admin'),
  upload.array('images', 10),
  updateCar
);

router.delete(
  '/:id',
  authorize('dealer', 'admin'),
  deleteCar
);

export default router;