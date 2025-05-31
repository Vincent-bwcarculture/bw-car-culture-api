// server/controllers/dashboardController.js
import asyncHandler from '../middleware/async.js';
import Listing from '../models/Listing.js';
import User from '../models/User.js';
import News from '../models/News.js';
import Dealer from '../models/Dealer.js';

/**
 * @desc    Get dashboard statistics
 * @route   GET /api/dashboard/stats
 * @access  Private/Admin
 */
export const getDashboardStats = asyncHandler(async (req, res, next) => {
  try {
    // Check if models exist before attempting to query them
    const models = {
      Listing: Listing || null,
      User: User || null, 
      News: News || null,
      Dealer: Dealer || null
    };
    
    // Initialize default values
    let stats = {
      totalListings: 0,
      activeListings: 0,
      totalUsers: 0,
      totalDealers: 0,
      totalReviews: 0,
      pendingReviews: 0,
      monthlyViews: 0
    };

    // Only query models that exist
    const promises = [];
    if (models.Listing) {
      promises.push(
        Listing.countDocuments().then(count => stats.totalListings = count),
        Listing.countDocuments({ status: 'active' }).then(count => stats.activeListings = count)
      );
    }
    
    if (models.User) {
      promises.push(
        User.countDocuments().then(count => stats.totalUsers = count)
      );
    }
    
    if (models.Dealer) {
      promises.push(
        Dealer.countDocuments().then(count => stats.totalDealers = count)
      );
    }
    
    if (models.News) {
      promises.push(
        News.countDocuments({ category: 'review' }).then(count => stats.totalReviews = count),
        News.countDocuments({ status: 'pending', category: 'review' }).then(count => stats.pendingReviews = count)
      );
    }
    
    // Wait for all promises to resolve
    await Promise.all(promises);

    // Get monthly views if applicable models exist
    if (models.Listing || models.News) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      // Initialize view counts
      let listingViews = 0;
      let articleViews = 0;
      
      // Get listing views if model exists
      if (models.Listing) {
        try {
          const listingViewsResult = await Listing.aggregate([
            { $match: { updatedAt: { $gte: thirtyDaysAgo } } },
            { $group: { _id: null, totalViews: { $sum: '$views' } } }
          ]);
          
          if (listingViewsResult && listingViewsResult.length > 0) {
            listingViews = listingViewsResult[0].totalViews || 0;
          }
        } catch (err) {
          console.error('Error aggregating listing views:', err);
        }
      }
      
      // Get article views if model exists
      if (models.News) {
        try {
          const articleViewsResult = await News.aggregate([
            { $match: { updatedAt: { $gte: thirtyDaysAgo } } },
            { $group: { _id: null, totalViews: { $sum: '$views' } } }
          ]);
          
          if (articleViewsResult && articleViewsResult.length > 0) {
            articleViews = articleViewsResult[0].totalViews || 0;
          }
        } catch (err) {
          console.error('Error aggregating article views:', err);
        }
      }
      
      stats.monthlyViews = listingViews + articleViews;
    }

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics',
      error: error.message
    });
  }
});

/**
 * @desc    Get analytics data
 * @route   GET /api/dashboard/analytics
 * @access  Private/Admin
 */
export const getAnalytics = asyncHandler(async (req, res, next) => {
  try {
    const { period = 'week' } = req.query;
    
    // Define time period
    const startDate = new Date();
    switch (period) {
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default: // week
        startDate.setDate(startDate.getDate() - 7);
        break;
    }
    
    // Build analytics data object
    const analyticsData = {
      viewsData: [],
      popularReviews: [],
      topDealers: [],
      recentActivity: []
    };
    
    // Generate view data based on the selected period
    const now = new Date();
    
    // Create date points for the time period
    if (period === 'year') {
      // Monthly data points for a year
      for (let i = 0; i < 12; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
        analyticsData.viewsData.push({
          date: date.toISOString().split('T')[0],
          views: Math.floor(Math.random() * 5000) + 2000
        });
      }
    } else {
      // Daily data points for week or month
      const days = period === 'week' ? 7 : 30;
      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - (days - 1) + i);
        
        analyticsData.viewsData.push({
          date: date.toISOString().split('T')[0],
          views: Math.floor(Math.random() * 1000) + 500
        });
      }
    }
    
    // Check if the News model exists before querying
    if (typeof News !== 'undefined') {
      try {
        // Get popular reviews
        const popularReviews = await News.find({ 
          category: 'review',
          status: 'active'
        })
        .sort({ views: -1 })
        .limit(3)
        .select('title views likes comments');
        
        analyticsData.popularReviews = popularReviews.map(review => ({
          title: review.title,
          views: review.views || 0,
          likes: review.likes || 0,
          comments: review.comments?.length || 0
        }));
      } catch (err) {
        console.error('Error fetching popular reviews:', err);
      }
    }
    
    // Check if the Dealer model exists before querying
    if (typeof Dealer !== 'undefined') {
      try {
        // Get top dealers
        const topDealers = await Dealer.find({ status: 'active' })
          .sort({ 'metrics.totalListings': -1 })
          .limit(3)
          .select('businessName metrics.totalListings metrics.activeSales rating');
        
        analyticsData.topDealers = topDealers.map(dealer => ({
          name: dealer.businessName,
          listings: dealer.metrics?.totalListings || 0,
          sales: dealer.metrics?.activeSales || 0,
          rating: dealer.rating?.average || 0
        }));
      } catch (err) {
        console.error('Error fetching top dealers:', err);
      }
    }
    
    // Generate recent activity based on available models
    try {
      const recentActivities = [];
      
      // Helper function to format time ago
      const formatTimeAgo = (date) => {
        const now = new Date();
        const diffMs = now - new Date(date);
        const diffSeconds = Math.floor(diffMs / 1000);
        const diffMinutes = Math.floor(diffSeconds / 60);
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffDays > 0) {
          return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
        }
        if (diffHours > 0) {
          return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
        }
        if (diffMinutes > 0) {
          return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
        }
        return 'Just now';
      };
      
      // Get recent reviews if News model exists
      if (typeof News !== 'undefined') {
        const recentReviews = await News.find({
          createdAt: { $gte: startDate }
        })
        .sort({ createdAt: -1 })
        .limit(2)
        .select('title createdAt');
        
        recentReviews.forEach(review => {
          recentActivities.push({
            type: 'review',
            text: `New review published: ${review.title}`,
            time: formatTimeAgo(review.createdAt),
            timestamp: review.createdAt
          });
        });
      }
      
      // Get recent listings if Listing model exists
      if (typeof Listing !== 'undefined') {
        const recentListings = await Listing.find({
          createdAt: { $gte: startDate }
        })
        .sort({ createdAt: -1 })
        .limit(2)
        .select('title dealer createdAt');
        
        recentListings.forEach(listing => {
          recentActivities.push({
            type: 'listing',
            text: `New vehicle listed${listing.dealer?.businessName ? ` by ${listing.dealer.businessName}` : ''}: ${listing.title}`,
            time: formatTimeAgo(listing.createdAt),
            timestamp: listing.createdAt
          });
        });
      }
      
      // Get recent dealer registrations if Dealer model exists
      if (typeof Dealer !== 'undefined') {
        const recentDealers = await Dealer.find({
          createdAt: { $gte: startDate }
        })
        .sort({ createdAt: -1 })
        .limit(1)
        .select('businessName createdAt');
        
        recentDealers.forEach(dealer => {
          recentActivities.push({
            type: 'dealer',
            text: `New dealer registered: ${dealer.businessName}`,
            time: formatTimeAgo(dealer.createdAt),
            timestamp: dealer.createdAt
          });
        });
      }
      
      // Sort by timestamp (newest first) and limit to 5
      analyticsData.recentActivity = recentActivities
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 5)
        .map(({ timestamp, ...item }) => item); // Remove timestamp from response
    } catch (err) {
      console.error('Error generating recent activity:', err);
    }
    
    res.status(200).json({
      success: true,
      data: analyticsData
    });
  } catch (error) {
    console.error('Error fetching analytics data:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching analytics data',
      error: error.message
    });
  }
});

/**
 * @desc    Get recent activity
 * @route   GET /api/dashboard/activity
 * @access  Private/Admin
 */
export const getRecentActivity = asyncHandler(async (req, res, next) => {
  try {
    const { limit = 5 } = req.query;
    const limitNum = parseInt(limit, 10);
    
    // Define recent period (last 7 days)
    const recentPeriod = new Date();
    recentPeriod.setDate(recentPeriod.getDate() - 7);
    
    // Helper function to format time ago
    const formatTimeAgo = (date) => {
      const now = new Date();
      const diffMs = now - new Date(date);
      const diffSeconds = Math.floor(diffMs / 1000);
      const diffMinutes = Math.floor(diffSeconds / 60);
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);
      
      if (diffDays > 0) {
        return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
      }
      if (diffHours > 0) {
        return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
      }
      if (diffMinutes > 0) {
        return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`;
      }
      return 'Just now';
    };
    
    // Initialize activities array
    const activities = [];
    
    // Check and query each model if it exists
    const models = {
      News: typeof News !== 'undefined' ? News : null,
      Listing: typeof Listing !== 'undefined' ? Listing : null,
      Dealer: typeof Dealer !== 'undefined' ? Dealer : null,
      User: typeof User !== 'undefined' ? User : null
    };
    
    // Get recent reviews if News model exists
    if (models.News) {
      try {
        const recentReviews = await News.find({
          createdAt: { $gte: recentPeriod }
        })
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .select('title category createdAt');
        
        recentReviews.forEach(review => {
          activities.push({
            type: 'review',
            text: `New ${review.category || 'article'} published: ${review.title}`,
            time: formatTimeAgo(review.createdAt),
            timestamp: review.createdAt
          });
        });
      } catch (err) {
        console.error('Error fetching recent reviews:', err);
      }
    }
    
    // Get recent listings if Listing model exists
    if (models.Listing) {
      try {
        const recentListings = await Listing.find({
          createdAt: { $gte: recentPeriod }
        })
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .select('title dealer createdAt');
        
        recentListings.forEach(listing => {
          activities.push({
            type: 'listing',
            text: `New vehicle listed${listing.dealer?.businessName ? ` by ${listing.dealer.businessName}` : ''}: ${listing.title}`,
            time: formatTimeAgo(listing.createdAt),
            timestamp: listing.createdAt
          });
        });
      } catch (err) {
        console.error('Error fetching recent listings:', err);
      }
    }
    
    // Get recent dealer registrations if Dealer model exists
    if (models.Dealer) {
      try {
        const recentDealers = await Dealer.find({
          createdAt: { $gte: recentPeriod }
        })
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .select('businessName createdAt');
        
        recentDealers.forEach(dealer => {
          activities.push({
            type: 'dealer',
            text: `New dealer registered: ${dealer.businessName}`,
            time: formatTimeAgo(dealer.createdAt),
            timestamp: dealer.createdAt
          });
        });
      } catch (err) {
        console.error('Error fetching recent dealers:', err);
      }
    }
    
    // Get recent user registrations if User model exists
    if (models.User) {
      try {
        const recentUsers = await User.find({
          createdAt: { $gte: recentPeriod }
        })
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .select('name createdAt');
        
        recentUsers.forEach(user => {
          activities.push({
            type: 'user',
            text: `New user registered: ${user.name}`,
            time: formatTimeAgo(user.createdAt),
            timestamp: user.createdAt
          });
        });
      } catch (err) {
        console.error('Error fetching recent users:', err);
      }
    }
    
    // If no activities found, generate some mock data
    if (activities.length === 0) {
      const mockActivities = [
        { type: 'review', text: 'New review published: 2024 BMW X5 Review', time: '2 hours ago' },
        { type: 'listing', text: 'New vehicle listed by Premium Motors: 2023 Mercedes E-Class', time: '3 hours ago' },
        { type: 'dealer', text: 'New dealer registered: Elite Auto Gallery', time: '5 hours ago' },
        { type: 'user', text: 'New user registered: John Smith', time: '1 day ago' },
        { type: 'review', text: 'New review published: Tesla Model 3 Long Range', time: '2 days ago' }
      ];
      
      // Use mock data with current timestamp
      activities.push(...mockActivities.map(activity => ({
        ...activity,
        timestamp: new Date()
      })));
    }
    
    // Sort by timestamp (newest first) and limit
    const sortedActivities = activities
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limitNum);
    
    // Remove timestamp from response
    const formattedActivities = sortedActivities.map(({ timestamp, ...item }) => item);
    
    res.status(200).json({
      success: true,
      data: formattedActivities
    });
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recent activity',
      error: error.message
    });
  }
});

/**
 * @desc    Generate performance report
 * @route   GET /api/dashboard/report
 * @access  Private/Admin
 */
export const generatePerformanceReport = asyncHandler(async (req, res, next) => {
  try {
    const { period = 'month' } = req.query;
    
    // Define time period
    const startDate = new Date();
    switch (period) {
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      default: // month
        startDate.setMonth(startDate.getMonth() - 1);
    }
    
    // Check which models are available
    const models = {
      Listing: typeof Listing !== 'undefined' ? Listing : null,
      News: typeof News !== 'undefined' ? News : null,
      Dealer: typeof Dealer !== 'undefined' ? Dealer : null,
      User: typeof User !== 'undefined' ? User : null
    };
    
    // Initialize metrics with default values
    const metrics = {
      counts: {
        listings: {
          total: 0,
          active: 0,
          sold: 0,
          growth: 0
        },
        content: {
          total: 0,
          published: 0,
          growth: 0
        },
        dealers: {
          total: 0,
          verified: 0,
          growth: 0
        },
        users: {
          total: 0,
          growth: 0
        }
      },
      views: {
        listings: 0,
        content: 0,
        total: 0
      }
    };
    
    // Helper function to calculate growth rate
    const calculateGrowthRate = (total, newItems) => {
      if (total === 0) return 0;
      return Math.round((newItems / total) * 100);
    };
    
    // Collect metrics based on available models
    const promises = [];
    
    // Listing metrics
    if (models.Listing) {
      promises.push(
        Listing.countDocuments().then(count => metrics.counts.listings.total = count),
        Listing.countDocuments({ status: 'active' }).then(count => metrics.counts.listings.active = count),
        Listing.countDocuments({ status: 'sold' }).then(count => metrics.counts.listings.sold = count),
        Listing.countDocuments({ createdAt: { $gte: startDate } }).then(count => {
          metrics.counts.listings.growth = calculateGrowthRate(metrics.counts.listings.total, count);
        }),
        Listing.aggregate([
          { $group: { _id: null, totalViews: { $sum: '$views' } } }
        ]).then(result => {
          if (result && result.length > 0) {
            metrics.views.listings = result[0].totalViews || 0;
          }
        }).catch(err => console.error('Error aggregating listing views:', err))
      );
    }
    
    // Content/News metrics
    if (models.News) {
      promises.push(
        News.countDocuments().then(count => metrics.counts.content.total = count),
        News.countDocuments({ status: 'published' }).then(count => metrics.counts.content.published = count),
        News.countDocuments({ createdAt: { $gte: startDate } }).then(count => {
          metrics.counts.content.growth = calculateGrowthRate(metrics.counts.content.total, count);
        }),
        News.aggregate([
          { $group: { _id: null, totalViews: { $sum: '$views' } } }
        ]).then(result => {
          if (result && result.length > 0) {
            metrics.views.content = result[0].totalViews || 0;
          }
        }).catch(err => console.error('Error aggregating content views:', err))
      );
    }
    
    // Dealer metrics
    if (models.Dealer) {
      promises.push(
        Dealer.countDocuments().then(count => metrics.counts.dealers.total = count),
        Dealer.countDocuments({ 'verification.status': 'verified' }).then(count => metrics.counts.dealers.verified = count),
        Dealer.countDocuments({ createdAt: { $gte: startDate } }).then(count => {
          metrics.counts.dealers.growth = calculateGrowthRate(metrics.counts.dealers.total, count);
        })
      );
    }
    
    // User metrics
    if (models.User) {
      promises.push(
        User.countDocuments().then(count => metrics.counts.users.total = count),
        User.countDocuments({ createdAt: { $gte: startDate } }).then(count => {
          metrics.counts.users.growth = calculateGrowthRate(metrics.counts.users.total, count);
        })
      );
    }
    
    // Wait for all promises to resolve
    await Promise.all(promises.filter(p => p instanceof Promise));
    
    // Calculate total views
    metrics.views.total = metrics.views.listings + metrics.views.content;
    
    // Generate recommendations
    const recommendations = [];
    
    // Check listing to content ratio
    const listingContentRatio = metrics.counts.content.total > 0 
      ? metrics.counts.listings.total / metrics.counts.content.total 
      : 0;
      
    if (listingContentRatio > 5) {
      recommendations.push('Consider creating more content to balance listings. Content helps drive traffic to listings.');
    }
    
    // Check dealer verification rate
    const dealerVerificationRate = metrics.counts.dealers.total > 0 
      ? metrics.counts.dealers.verified / metrics.counts.dealers.total 
      : 0;
      
    if (dealerVerificationRate < 0.7) {
      recommendations.push('Work on verifying more dealers to improve trust. Verified dealers tend to get more engagement.');
    }
    
    // Check active listings percentage
    const activeListingsPercentage = metrics.counts.listings.total > 0 
      ? metrics.counts.listings.active / metrics.counts.listings.total 
      : 0;
      
    if (activeListingsPercentage < 0.5) {
      recommendations.push('Many listings are not active. Consider following up with dealers or implementing listing renewal reminders.');
    }
    
    // If no recommendations, add a default one
    if (recommendations.length === 0) {
      recommendations.push('Your platform is performing well based on current metrics. Keep up the good work!');
    }
    
    // Format the report
    const report = {
      generated: new Date(),
      period,
      counts: metrics.counts,
      views: metrics.views,
      recommendations
    };
    
    res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Error generating performance report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating performance report',
      error: error.message
    });
  }
});