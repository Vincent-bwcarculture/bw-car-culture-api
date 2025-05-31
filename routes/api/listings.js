// server/routes/api/listings.js
import express from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { listingController } from '../../controllers/listingController.js';
import { upload } from '../../utils/fileUpload.js';

const router = express.Router();

// Public routes
router.get('/', listingController.getListings);
router.get('/:id', listingController.getListing);
router.get('/featured', listingController.getFeaturedListings);

// Protected routes
router.use(protect);
router.use(authorize(['dealer', 'admin']));

// Create listing with image upload
router.post('/', 
  upload.array('images', 10),
  listingController.createListing
);

router.put('/:id',
  upload.array('images', 10),
  listingController.updateListing
);

router.delete('/:id', listingController.deleteListing);

router.patch('/:id/status', listingController.updateListingStatus);

export default router;