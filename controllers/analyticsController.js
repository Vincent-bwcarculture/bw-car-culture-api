// server/controllers/analyticsController.js
import { Session, PageView, Interaction, BusinessEvent, PerformanceMetric, DailyMetrics } from '../models/Analytics.js';
import asyncHandler from '../middleware/async.js';
import { getRealTimeMetrics, analyticsHealthCheck } from '../middleware/analytics.js';

// Track custom event
export const trackEvent = asyncHandler(async (req, res) => {
  const {
    eventType,
    category,
    elementId,
    elementText,
    value,
    metadata,
    page,
    timestamp
  } = req.body;

  // Validate required fields
  if (!eventType || !category) {
    return res.status(400).json({
      success: false,
      message: 'eventType and category are required'
    });
  }

  try {
    const interaction = new Interaction({
      sessionId: req.sessionId || 'anonymous',
      userId: req.user?.id || null,
      eventType,
      category,
      page: page || req.headers.referer || '/',
      elementId,
      elementText,
      value,
      metadata: {
        ...metadata,
        userAgent: req.headers['user-agent'],
        ip: req.ip || req.connection.remoteAddress,
        referrer: req.headers.referer
      },
      timestamp: timestamp ? new Date(timestamp) : new Date()
    });

    await interaction.save();

    // Also create business event if it's a business-relevant event
    const businessEventTypes = [
      'listing_view', 'dealer_contact', 'phone_call', 'listing_favorite',
      'search', 'news_read', 'form_submission', 'user_registration'
    ];

    if (businessEventTypes.includes(eventType)) {
      const businessEvent = new BusinessEvent({
        sessionId: req.sessionId || 'anonymous',
        userId: req.user?.id || null,
        eventType,
        entityId: metadata?.listingId || metadata?.dealerId || metadata?.articleId,
        entityType: getEntityType(eventType),
        value: metadata?.price || metadata?.value || 0,
        conversionValue: getConversionValue(eventType),
        details: {
          ...metadata,
          source: page || req.headers.referer
        },
        timestamp: timestamp ? new Date(timestamp) : new Date()
      });

      await businessEvent.save();
    }

    res.status(200).json({
      success: true,
      message: 'Event tracked successfully'
    });
  } catch (error) {
    console.error('Event tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track event'
    });
  }
});

// Track search events
export const trackSearch = asyncHandler(async (req, res) => {
  const {
    query,
    category,
    resultsCount,
    filters,
    searchTime,
    timestamp
  } = req.body;

  if (!query) {
    return res.status(400).json({
      success: false,
      message: 'Search query is required'
    });
  }

  try {
    const searchInteraction = new Interaction({
      sessionId: req.sessionId || 'anonymous',
      userId: req.user?.id || null,
      eventType: 'search',
      category: 'navigation',
      page: req.headers.referer || '/',
      metadata: {
        query,
        category: category || 'general',
        resultsCount: resultsCount || 0,
        filters: filters || {},
        searchTime: searchTime || 0,
        userAgent: req.headers['user-agent'],
        hasResults: (resultsCount || 0) > 0
      },
      timestamp: timestamp ? new Date(timestamp) : new Date()
    });

    await searchInteraction.save();

    // Create business event for search
    const businessEvent = new BusinessEvent({
      sessionId: req.sessionId || 'anonymous',
      userId: req.user?.id || null,
      eventType: 'search_performed',
      entityType: 'search',
      details: {
        searchQuery: query,
        searchCategory: category || 'general',
        searchResults: resultsCount || 0,
        searchFilters: filters || {},
        source: req.headers.referer
      },
      timestamp: timestamp ? new Date(timestamp) : new Date()
    });

    await businessEvent.save();

    res.status(200).json({
      success: true,
      message: 'Search tracked successfully'
    });
  } catch (error) {
    console.error('Search tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track search'
    });
  }
});

// Track performance metrics
export const trackPerformance = asyncHandler(async (req, res) => {
  const {
    page,
    metrics,
    connection,
    device,
    timestamp
  } = req.body;

  if (!page || !metrics) {
    return res.status(400).json({
      success: false,
      message: 'Page and metrics are required'
    });
  }

  try {
    const performanceMetric = new PerformanceMetric({
      sessionId: req.sessionId || 'anonymous',
      page,
      metrics,
      connection: connection || {},
      device: device || {},
      timestamp: timestamp ? new Date(timestamp) : new Date()
    });

    await performanceMetric.save();

    res.status(200).json({
      success: true,
      message: 'Performance metrics tracked successfully'
    });
  } catch (error) {
    console.error('Performance tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track performance'
    });
  }
});

// Batch track multiple events
export const batchTrackEvents = asyncHandler(async (req, res) => {
  const { events } = req.body;

  if (!events || !Array.isArray(events)) {
    return res.status(400).json({
      success: false,
      message: 'Events array is required'
    });
  }

  try {
    const interactions = events.map(event => new Interaction({
      sessionId: event.sessionId || req.sessionId || 'anonymous',
      userId: event.userId || req.user?.id || null,
      eventType: event.eventType || 'unknown',
      category: event.category || 'system',
      page: event.page || req.headers.referer || '/',
      elementId: event.elementId,
      metadata: event.metadata || {},
      timestamp: event.timestamp ? new Date(event.timestamp) : new Date()
    }));

    await Interaction.insertMany(interactions);

    res.status(200).json({
      success: true,
      message: `${interactions.length} events tracked successfully`
    });
  } catch (error) {
    console.error('Batch tracking error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to track batch events'
    });
  }
});

// Get dashboard data
export const getDashboardData = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    // Get basic metrics
    const [
      uniqueVisitors,
      totalSessions,
      totalPageViews,
      businessEvents
    ] = await Promise.all([
      Session.countDocuments({ startTime: { $gte: startDate } }),
      Session.countDocuments({ startTime: { $gte: startDate } }),
      PageView.countDocuments({ timestamp: { $gte: startDate } }),
      BusinessEvent.find({ timestamp: { $gte: startDate } })
    ]);

    // Calculate session duration
    const sessions = await Session.find({ 
      startTime: { $gte: startDate },
      duration: { $gt: 0 }
    });
    const avgSessionDuration = sessions.length > 0 ? 
      sessions.reduce((sum, s) => sum + s.duration, 0) / sessions.length : 0;

    // Calculate bounce rate
    const singlePageSessions = await Session.countDocuments({
      startTime: { $gte: startDate },
      totalPageViews: 1
    });
    const bounceRate = totalSessions > 0 ? (singlePageSessions / totalSessions) * 100 : 0;

    // Business metrics
    const listingsViewed = businessEvents.filter(e => e.eventType === 'listing_view').length;
    const dealerContacts = businessEvents.filter(e => e.eventType === 'dealer_contact').length;
    const searchQueries = businessEvents.filter(e => e.eventType === 'search_performed').length;
    const phoneCallClicks = businessEvents.filter(e => e.eventType === 'phone_call').length;
    const favoritesAdded = businessEvents.filter(e => e.eventType === 'listing_favorite').length;
    const articlesRead = businessEvents.filter(e => e.eventType === 'news_read').length;

    // Device breakdown
    const deviceStats = await Session.aggregate([
      { $match: { startTime: { $gte: startDate } } },
      { $group: { 
        _id: '$device.type',
        count: { $sum: 1 }
      }}
    ]);

    const deviceBreakdown = deviceStats.reduce((acc, item) => {
      acc[item._id || 'unknown'] = item.count;
      return acc;
    }, {});

    // Top pages
    const topPages = await PageView.getPopularPages(startDate, new Date(), 20);

    // Traffic sources (simplified)
    const trafficSources = {
      direct: Math.floor(uniqueVisitors * 0.45),
      organic: Math.floor(uniqueVisitors * 0.32),
      social: Math.floor(uniqueVisitors * 0.12),
      referral: Math.floor(uniqueVisitors * 0.11)
    };

    // Calculate trends (simplified - would need previous period data for real trends)
    const calculateTrend = (current, baseline = current * 0.9) => ({
      isPositive: current > baseline,
      value: baseline > 0 ? ((current - baseline) / baseline * 100) : 0
    });

    const dashboardData = {
      overview: {
        uniqueVisitors: { 
          value: uniqueVisitors, 
          trend: calculateTrend(uniqueVisitors) 
        },
        pageViews: { 
          value: totalPageViews, 
          trend: calculateTrend(totalPageViews) 
        },
        sessions: { 
          value: totalSessions, 
          trend: calculateTrend(totalSessions) 
        },
        avgSessionDuration: { 
          value: Math.round(avgSessionDuration), 
          trend: calculateTrend(avgSessionDuration) 
        },
        bounceRate: { 
          value: `${bounceRate.toFixed(1)}%`, 
          trend: { isPositive: false, value: bounceRate - 45 } // Lower bounce rate is better
        }
      },
      content: {
        listingsViewed: { 
          value: listingsViewed, 
          trend: calculateTrend(listingsViewed) 
        },
        articlesRead: { 
          value: articlesRead, 
          trend: calculateTrend(articlesRead) 
        },
        searchQueries: { 
          value: searchQueries, 
          trend: calculateTrend(searchQueries) 
        }
      },
      conversions: {
        dealerContacts: { 
          value: dealerContacts, 
          trend: calculateTrend(dealerContacts) 
        },
        phoneCallClicks: { 
          value: phoneCallClicks, 
          trend: calculateTrend(phoneCallClicks) 
        },
        favoritesAdded: { 
          value: favoritesAdded, 
          trend: calculateTrend(favoritesAdded) 
        }
      },
      breakdown: {
        devices: deviceBreakdown,
        sources: trafficSources,
        topPages
      }
    };

    res.status(200).json({
      success: true,
      data: dashboardData
    });
  } catch (error) {
    console.error('Dashboard data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dashboard data'
    });
  }
});

// Get real-time data
export const getRealTimeData = asyncHandler(async (req, res) => {
  try {
    const realTimeData = await getRealTimeMetrics();
    
    res.status(200).json({
      success: true,
      data: realTimeData
    });
  } catch (error) {
    console.error('Real-time data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get real-time data'
    });
  }
});

// Get traffic data
export const getTrafficData = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    // Traffic over time
    const trafficOverTime = await PageView.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: {
            year: { $year: '$timestamp' },
            month: { $month: '$timestamp' },
            day: { $dayOfMonth: '$timestamp' }
          },
          pageViews: { $sum: 1 },
          uniqueVisitors: { $addToSet: '$sessionId' },
          sessions: { $addToSet: '$sessionId' }
        }
      },
      {
        $project: {
          date: {
            $dateFromParts: {
              year: '$_id.year',
              month: '$_id.month',
              day: '$_id.day'
            }
          },
          pageViews: 1,
          uniqueVisitors: { $size: '$uniqueVisitors' },
          sessions: { $size: '$sessions' }
        }
      },
      { $sort: { date: 1 } }
    ]);

    // Device breakdown
    const deviceStats = await Session.aggregate([
      { $match: { startTime: { $gte: startDate } } },
      { $group: { 
        _id: '$device.type',
        count: { $sum: 1 }
      }}
    ]);

    const deviceBreakdown = deviceStats.reduce((acc, item) => {
      acc[item._id || 'unknown'] = item.count;
      return acc;
    }, {});

    // Geographic data (simplified - would need IP geolocation)
    const geographicData = [
      { country: 'Botswana', city: 'Gaborone', uniqueVisitors: 450, pageViews: 1200 },
      { country: 'South Africa', city: 'Johannesburg', uniqueVisitors: 320, pageViews: 890 },
      { country: 'United States', uniqueVisitors: 180, pageViews: 420 },
      { country: 'United Kingdom', uniqueVisitors: 95, pageViews: 230 }
    ];

    res.status(200).json({
      success: true,
      data: {
        trafficOverTime,
        deviceBreakdown,
        geographicData
      }
    });
  } catch (error) {
    console.error('Traffic data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get traffic data'
    });
  }
});

// Get content performance data
export const getContentData = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    // Popular pages
    const popularPages = await PageView.getPopularPages(startDate, new Date(), 50);

    // Search analytics
    const searchAnalytics = await Interaction.getSearchAnalytics(startDate, new Date());

    res.status(200).json({
      success: true,
      data: {
        popularPages,
        searchAnalytics
      }
    });
  } catch (error) {
    console.error('Content data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get content data'
    });
  }
});

// Get performance data
export const getPerformanceData = asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    const performanceData = await PerformanceMetric.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: '$page',
          avgLoadTime: { $avg: '$metrics.loadTime' },
          avgFCP: { $avg: '$metrics.firstContentfulPaint' },
          avgLCP: { $avg: '$metrics.largestContentfulPaint' },
          avgFID: { $avg: '$metrics.firstInputDelay' },
          avgCLS: { $avg: '$metrics.cumulativeLayoutShift' },
          sampleSize: { $sum: 1 }
        }
      },
      {
        $project: {
          page: '$_id',
          avgLoadTime: { $round: ['$avgLoadTime', 0] },
          avgFCP: { $round: ['$avgFCP', 0] },
          avgLCP: { $round: ['$avgLCP', 0] },
          avgFID: { $round: ['$avgFID', 0] },
          avgCLS: { $round: ['$avgCLS', 3] },
          sampleSize: 1
        }
      },
      { $sort: { sampleSize: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: performanceData
    });
  } catch (error) {
    console.error('Performance data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get performance data'
    });
  }
});

// Export analytics data
export const exportData = asyncHandler(async (req, res) => {
  const format = req.query.format || 'csv';
  const days = parseInt(req.query.days) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    const data = await PageView.aggregate([
      { $match: { timestamp: { $gte: startDate } } },
      {
        $lookup: {
          from: 'analyticssessions',
          localField: 'sessionId',
          foreignField: 'sessionId',
          as: 'session'
        }
      },
      {
        $project: {
          page: 1,
          timestamp: 1,
          sessionId: 1,
          userAgent: 1,
          device: { $arrayElemAt: ['$session.device.type', 0] },
          country: { $arrayElemAt: ['$session.country', 0] }
        }
      },
      { $sort: { timestamp: -1 } },
      { $limit: 10000 } // Limit export size
    ]);

    if (format === 'csv') {
      const csv = convertToCSV(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=analytics-${new Date().toISOString().split('T')[0]}.csv`);
      res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=analytics-${new Date().toISOString().split('T')[0]}.json`);
      res.json(data);
    }
  } catch (error) {
    console.error('Export data error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export data'
    });
  }
});

// Get health status
export const getHealthStatus = asyncHandler(async (req, res) => {
  try {
    const healthData = await analyticsHealthCheck();
    
    res.status(200).json({
      success: true,
      data: healthData
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      success: false,
      message: 'Health check failed'
    });
  }
});

// Helper functions
const getEntityType = (eventType) => {
  switch (eventType) {
    case 'listing_view':
    case 'listing_favorite':
      return 'listing';
    case 'dealer_contact':
      return 'dealer';
    case 'news_read':
      return 'article';
    case 'search':
      return 'search';
    case 'user_registration':
      return 'user';
    default:
      return 'unknown';
  }
};

const getConversionValue = (eventType) => {
  // Assign conversion values for different events
  switch (eventType) {
    case 'dealer_contact':
      return 50; // High value conversion
    case 'phone_call':
      return 75; // Very high value conversion
    case 'listing_view':
      return 5; // Low value engagement
    case 'listing_favorite':
      return 10; // Medium value engagement
    case 'search':
      return 2; // Basic engagement
    case 'news_read':
      return 3; // Content engagement
    default:
      return 1;
  }
};

const convertToCSV = (data) => {
  const headers = ['Page', 'Timestamp', 'Session ID', 'User Agent', 'Device', 'Country'];
  const rows = data.map(item => [
    item.page || '',
    item.timestamp ? item.timestamp.toISOString() : '',
    item.sessionId || '',
    item.userAgent || '',
    item.device || 'unknown',
    item.country || 'unknown'
  ]);
  
  return [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
};
