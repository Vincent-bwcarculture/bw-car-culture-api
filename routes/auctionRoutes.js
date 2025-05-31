// server/routes/auctionRoutes.js
import express from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { upload } from '../utils/fileUpload.js';
import {
  createAuction,
  getAuctions,
  getAuction,
  updateAuction,
  deleteAuction,
  placeBid,
  watchAuction,
  getWatchedAuctions,
  getSellingAuctions,
  getUserBids,
  getAuctionBids,
  updateAuctionStatus,
  getSimilarAuctions,
  getFeaturedAuctions,
  toggleFeatured
} from '../controllers/auctionController.js';

const router = express.Router();

// Public routes
router.get('/', getAuctions);
router.get('/featured', getFeaturedAuctions);
router.get('/:id', getAuction);
router.get('/:id/similar', getSimilarAuctions);
router.get('/:id/bids', getAuctionBids);

// Protected routes
router.use(protect);

// User routes
router.post('/', upload.array('images', 10), createAuction);
router.put('/:id', upload.array('images', 10), updateAuction);
router.delete('/:id', deleteAuction);
router.post('/:id/bid', placeBid);
router.put('/:id/watch', watchAuction);
router.get('/user/watched', getWatchedAuctions);
router.get('/user/selling', getSellingAuctions);
router.get('/user/bids', getUserBids);

// Admin routes
router.patch('/:id/status', authorize('admin'), updateAuctionStatus);
router.patch('/:id/featured', authorize('admin'), toggleFeatured);

export default router;