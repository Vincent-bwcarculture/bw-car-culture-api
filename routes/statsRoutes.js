// server/routes/statsRoutes.js
import express from 'express';
import Listing from '../models/Listing.js';
import User from '../models/User.js';
import ServiceProvider from '../models/ServiceProvider.js';
import asyncHandler from '../middleware/async.js';

const router = express.Router();

// @desc    Get website statistics for dashboard
// @route   GET /api/stats/dashboard
// @access  Public
router.get('/dashboard', asyncHandler(async (req, res) => {
  try {
    // Get real statistics from your database
    const carListings = await Listing.countDocuments({ status: 'active' });
    
    // Count users (customers)
    const userCount = await User.countDocuments();
    
    // Count verified dealers
    const verifiedDealers = await ServiceProvider.countDocuments({ 
      'verification.status': 'verified', 
      providerType: 'dealership' 
    });
    
    // Count transport providers
    const transportProviders = await ServiceProvider.countDocuments({ 
      providerType: 'public_transport',
      status: 'active'
    });
    
    res.status(200).json({
      success: true,
      carListings,
      happyCustomers: userCount,
      verifiedDealers,
      transportProviders
    });
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Server Error'
    });
  }
}));

export default router;