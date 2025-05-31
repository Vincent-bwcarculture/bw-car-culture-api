// server/middleware/analytics.js
import { Session, PageView, Interaction } from '../models/Analytics.js';
import { UAParser } from 'ua-parser-js';

// Generate unique session ID
const generateSessionId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// Parse user agent for device info
const parseUserAgent = (userAgentString) => {
  const parser = new UAParser(userAgentString);
  const result = parser.getResult();
  
  return {
    browser: result.browser.name || 'Unknown',
    browserVersion: result.browser.version || 'Unknown',
    os: result.os.name || 'Unknown',
    osVersion: result.os.version || 'Unknown',
    device: result.device.type || 'desktop',
    deviceModel: result.device.model || 'Unknown',
    deviceVendor: result.device.vendor || 'Unknown'
  };
};

// Get client IP address
const getClientIP = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         '127.0.0.1';
};

// Get or create session
export const initializeSession = async (req, res, next) => {
  try {
    let sessionId = req.cookies?.sessionId || req.headers['x-session-id'];
    const userAgent = req.headers['user-agent'] || '';
    const ip = getClientIP(req);
    const deviceInfo = parseUserAgent(userAgent);

    // Generate new session ID if not present
    if (!sessionId) {
      sessionId = generateSessionId();
    }

    // Set session cookie if not exists (for web clients)
    if (!req.cookies?.sessionId && res.cookie) {
      res.cookie('sessionId', sessionId, {
        maxAge: 30 * 60 * 1000, // 30 minutes
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
    }

    // Try to find existing active session
    let session = await Session.findOne({ 
      sessionId, 
      isActive: true,
      endTime: null
    });

    if (!session) {
      // Create new session
      session = new Session({
        sessionId,
        userId: req.user?.id || null,
        startTime: new Date(),
        isActive: true,
        userAgent,
        ip,
        device: {
          type: deviceInfo.device === 'mobile' ? 'mobile' : 
                deviceInfo.device === 'tablet' ? 'tablet' : 'desktop',
          os: deviceInfo.os,
          browser: deviceInfo.browser,
          model: deviceInfo.deviceModel
        },
        pages: [],
        totalPageViews: 0
      });

      await session.save();
      console.log(`New session created: ${sessionId}`);
    } else {
      // Update existing session
      session.lastActivity = new Date();
      session.userId = session.userId || req.user?.id || null;
      
      // Update session duration
      session.duration = Math.floor((new Date() - session.startTime) / 1000);
      
      await session.save();
    }

    // Attach session info to request
    req.sessionId = sessionId;
    req.analyticsSession = session;
    req.deviceInfo = deviceInfo;
    req.clientIP = ip;

    next();
  } catch (error) {
    console.error('Session initialization error:', error);
    // Don't fail the request if analytics fails
    req.sessionId = generateSessionId();
    next();
  }
};

// Track page views
export const trackPageView = async (req, res, next) => {
  try {
    // Only track GET requests for actual pages (not API calls)
    if (req.method !== 'GET' || req.path.startsWith('/api/')) {
      return next();
    }

    const pageView = new PageView({
      sessionId: req.sessionId,
      userId: req.user?.id || null,
      page: req.path,
      title: req.query.title || null,
      referrer: req.headers.referer || req.headers.referrer || null,
      userAgent: req.headers['user-agent'],
      ip: req.clientIP,
      timestamp: new Date(),
      query: Object.keys(req.query).length > 0 ? req.query : null
    });

    // Save page view asynchronously
    pageView.save().catch(console.error);

    // Update session with page visit
    if (req.analyticsSession) {
      req.analyticsSession.pages.push(req.path);
      req.analyticsSession.totalPageViews += 1;
      req.analyticsSession.lastActivity = new Date();
      req.analyticsSession.save().catch(console.error);
    }

    next();
  } catch (error) {
    console.error('Page view tracking error:', error);
    next();
  }
};

// Track API usage
export const trackAPIUsage = async (req, res, next) => {
  try {
    // Only track API endpoints
    if (!req.path.startsWith('/api/')) {
      return next();
    }

    const startTime = Date.now();

    // Override res.json to capture response data
    const originalJson = res.json;
    res.json = function(data) {
      const responseTime = Date.now() - startTime;
      
      // Track API call
      const apiInteraction = new Interaction({
        sessionId: req.sessionId,
        userId: req.user?.id || null,
        eventType: 'api_call',
        category: 'system',
        page: req.path,
        metadata: {
          method: req.method,
          endpoint: req.path,
          statusCode: res.statusCode,
          responseTime,
          userAgent: req.headers['user-agent'],
          hasAuth: !!req.user
        },
        timestamp: new Date()
      });

      apiInteraction.save().catch(console.error);
      
      return originalJson.call(this, data);
    };

    next();
  } catch (error) {
    console.error('API usage tracking error:', error);
    next();
  }
};

// Track errors
export const trackErrors = (err, req, res, next) => {
  try {
    // Only track 4xx and 5xx errors
    if (err.statusCode && err.statusCode >= 400) {
      const errorInteraction = new Interaction({
        sessionId: req.sessionId,
        userId: req.user?.id || null,
        eventType: 'error',
        category: 'system',
        page: req.path,
        metadata: {
          errorType: err.name || 'UnknownError',
          errorMessage: err.message?.substring(0, 500), // Limit message length
          statusCode: err.statusCode || 500,
          stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
          userAgent: req.headers['user-agent'],
          method: req.method,
          query: req.query,
          body: req.method === 'POST' ? 
                 JSON.stringify(req.body)?.substring(0, 1000) : undefined
        },
        timestamp: new Date()
      });

      errorInteraction.save().catch(console.error);
    }
  } catch (error) {
    console.error('Error tracking failed:', error);
  }
  
  next(err);
};

// Clean up inactive sessions
export const cleanupSessions = async () => {
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    // Mark sessions as inactive if no activity for 30 minutes
    const result = await Session.updateMany(
      { 
        lastActivity: { $lt: thirtyMinutesAgo },
        isActive: true 
      },
      { 
        $set: { 
          isActive: false,
          endTime: new Date()
        }
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`Marked ${result.modifiedCount} sessions as inactive`);
    }

    // Delete very old sessions (older than 90 days)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    
    const deleteResult = await Session.deleteMany({
      startTime: { $lt: ninetyDaysAgo }
    });

    if (deleteResult.deletedCount > 0) {
      console.log(`Deleted ${deleteResult.deletedCount} old sessions`);
    }

    // Clean up old page views
    await PageView.deleteMany({
      timestamp: { $lt: ninetyDaysAgo }
    });

    // Clean up old interactions (keep important ones longer)
    await Interaction.deleteMany({
      timestamp: { $lt: ninetyDaysAgo },
      category: { $nin: ['conversion', 'business'] } // Keep conversion data longer
    });

  } catch (error) {
    console.error('Session cleanup error:', error);
  }
};

// Schedule periodic cleanup
export const scheduleCleanup = () => {
  // Run cleanup every hour
  setInterval(cleanupSessions, 60 * 60 * 1000);
  
  // Run initial cleanup after 5 minutes
  setTimeout(cleanupSessions, 5 * 60 * 1000);
};

// Get real-time metrics
export const getRealTimeMetrics = async () => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [activeSessions, recentPageViews, recentInteractions, topPages] = await Promise.all([
      // Active sessions in last 5 minutes
      Session.countDocuments({
        isActive: true,
        lastActivity: { $gte: fiveMinutesAgo }
      }),

      // Page views in last 24 hours
      PageView.countDocuments({
        timestamp: { $gte: oneDayAgo }
      }),

      // Recent interactions in last hour
      Interaction.find({
        timestamp: { $gte: oneHourAgo },
        eventType: { $in: ['listing_view', 'dealer_contact', 'phone_call', 'search'] }
      })
      .sort({ timestamp: -1 })
      .limit(50)
      .lean(),

      // Top pages in last 24 hours
      PageView.aggregate([
        { $match: { timestamp: { $gte: oneDayAgo } } },
        { 
          $group: {
            _id: '$page',
            views: { $sum: 1 },
            uniqueVisitors: { $addToSet: '$sessionId' }
          }
        },
        {
          $project: {
            page: '$_id',
            views: 1,
            uniqueVisitors: { $size: '$uniqueVisitors' }
          }
        },
        { $sort: { views: -1 } },
        { $limit: 10 }
      ])
    ]);

    return {
      activeSessions,
      recentPageViews,
      recentInteractions: recentInteractions.map(interaction => ({
        ...interaction,
        description: getInteractionDescription(interaction)
      })),
      topPages
    };
  } catch (error) {
    console.error('Error getting real-time metrics:', error);
    return {
      activeSessions: 0,
      recentPageViews: 0,
      recentInteractions: [],
      topPages: []
    };
  }
};

// Helper function to describe interactions
const getInteractionDescription = (interaction) => {
  switch (interaction.eventType) {
    case 'listing_view':
      return 'viewed a car listing';
    case 'dealer_contact':
      return 'contacted a dealer';
    case 'phone_call':
      return 'clicked a phone number';
    case 'search':
      return 'performed a search';
    case 'news_read':
      return 'read an article';
    case 'listing_favorite':
      return 'favorited a listing';
    default:
      return `performed ${interaction.eventType.replace('_', ' ')}`;
  }
};

// Analytics health check
export const analyticsHealthCheck = async () => {
  try {
    const [sessionsCount, pageViewsCount, interactionsCount] = await Promise.all([
      Session.countDocuments(),
      PageView.countDocuments(),
      Interaction.countDocuments()
    ]);

    const lastHour = new Date(Date.now() - 60 * 60 * 1000);
    const recentActivity = await Interaction.countDocuments({
      timestamp: { $gte: lastHour }
    });

    return {
      healthy: true,
      collections: {
        sessions: sessionsCount,
        pageViews: pageViewsCount,
        interactions: interactionsCount
      },
      recentActivity,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Analytics health check failed:', error);
    return {
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

// Batch tracking for high-volume scenarios
export const batchTrackEvents = async (events) => {
  try {
    if (!events || !Array.isArray(events) || events.length === 0) {
      return { success: false, message: 'No events provided' };
    }

    const interactions = events.map(event => new Interaction({
      sessionId: event.sessionId || 'batch',
      userId: event.userId || null,
      eventType: event.eventType || 'unknown',
      category: event.category || 'system',
      page: event.page || '/',
      elementId: event.elementId || null,
      metadata: event.metadata || {},
      timestamp: event.timestamp ? new Date(event.timestamp) : new Date()
    }));

    await Interaction.insertMany(interactions);

    return {
      success: true,
      processed: interactions.length,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Batch event tracking failed:', error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

// Export all middleware and utilities
export default {
  initializeSession,
  trackPageView,
  trackAPIUsage,
  trackErrors,
  cleanupSessions,
  scheduleCleanup,
  getRealTimeMetrics,
  analyticsHealthCheck,
  batchTrackEvents
};