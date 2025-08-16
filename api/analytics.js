// For Vercel Serverless - Create: api/analytics.js
// This creates a new serverless function for analytics endpoints

import { 
  Session, 
  PageView, 
  Interaction, 
  BusinessEvent 
} from '../models/Analytics.js';

let MongoClient;
let client;
let isConnected = false;

const connectDB = async () => {
  if (isConnected && client) {
    return client.db(process.env.MONGODB_NAME || 'i3wcarculture');
  }

  try {
    if (!MongoClient) {
      const mongodb = await import('mongodb');
      MongoClient = mongodb.MongoClient;
    }
    
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    isConnected = true;
    
    return client.db(process.env.MONGODB_NAME || 'i3wcarculture');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    return null;
  }
};

const setCORSHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

// Generate session ID
const generateSessionId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Get device info from user agent
const getDeviceInfo = (userAgent) => {
  const isMobile = /Mobile|Android|iPhone|iPad/.test(userAgent);
  const isTablet = /iPad|Tablet/.test(userAgent);
  
  return {
    type: isMobile && !isTablet ? 'mobile' : isTablet ? 'tablet' : 'desktop',
    userAgent,
    browser: getBrowser(userAgent),
    os: getOS(userAgent)
  };
};

const getBrowser = (userAgent) => {
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Edge')) return 'Edge';
  return 'Unknown';
};

const getOS = (userAgent) => {
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iOS')) return 'iOS';
  return 'Unknown';
};

export default async function handler(req, res) {
  setCORSHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const db = await connectDB();
  if (!db) {
    return res.status(500).json({ success: false, message: 'Database connection failed' });
  }

  const { method, url, headers, body } = req;
  const path = url.split('?')[0];

  try {
    // Track Event Endpoint
    if (path === '/api/analytics/track' && method === 'POST') {
      const {
        eventType,
        category,
        page,
        elementId,
        elementText,
        metadata,
        sessionId,
        timestamp
      } = body;

      if (!eventType) {
        return res.status(400).json({
          success: false,
          message: 'Event type is required'
        });
      }

      const deviceInfo = getDeviceInfo(headers['user-agent'] || '');
      
      const interaction = {
        sessionId: sessionId || generateSessionId(),
        userId: null, // Would need to implement auth extraction
        eventType,
        category: category || 'general',
        page: page || '/',
        elementId,
        elementText,
        metadata: metadata || {},
        userAgent: headers['user-agent'],
        ip: headers['x-forwarded-for'] || headers['x-real-ip'] || 'unknown',
        device: deviceInfo,
        timestamp: timestamp ? new Date(timestamp) : new Date()
      };

      await db.collection('analyticsinteractions').insertOne(interaction);

      // Create business event for important interactions
      const businessEventTypes = [
        'listing_view', 'dealer_contact', 'phone_call', 
        'listing_favorite', 'news_read', 'form_submit'
      ];

      if (businessEventTypes.includes(eventType)) {
        const businessEvent = {
          sessionId: interaction.sessionId,
          userId: null,
          eventType,
          entityType: metadata?.entityType || 'unknown',
          entityId: metadata?.entityId || null,
          details: metadata || {},
          conversionValue: metadata?.conversionValue || 0,
          timestamp: interaction.timestamp
        };

        await db.collection('analyticsbusinessevents').insertOne(businessEvent);
      }

      return res.status(200).json({
        success: true,
        message: 'Event tracked successfully'
      });
    }

    // Track Search Endpoint
    if (path === '/api/analytics/track/search' && method === 'POST') {
      const {
        query,
        category,
        resultsCount,
        filters,
        sessionId,
        timestamp
      } = body;

      if (!query) {
        return res.status(400).json({
          success: false,
          message: 'Search query is required'
        });
      }

      const deviceInfo = getDeviceInfo(headers['user-agent'] || '');
      
      const searchInteraction = {
        sessionId: sessionId || generateSessionId(),
        userId: null,
        eventType: 'search',
        category: 'navigation',
        page: '/',
        metadata: {
          query,
          category: category || 'general',
          resultsCount: resultsCount || 0,
          filters: filters || {},
          userAgent: headers['user-agent'],
          hasResults: (resultsCount || 0) > 0
        },
        device: deviceInfo,
        timestamp: timestamp ? new Date(timestamp) : new Date()
      };

      await db.collection('analyticsinteractions').insertOne(searchInteraction);

      return res.status(200).json({
        success: true,
        message: 'Search tracked successfully'
      });
    }

    // Get Dashboard Data
    if (path === '/api/analytics/dashboard' && method === 'GET') {
      const days = parseInt(req.query?.days) || 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const [
        totalInteractions,
        totalSessions,
        businessEvents
      ] = await Promise.all([
        db.collection('analyticsinteractions').countDocuments({
          timestamp: { $gte: startDate }
        }),
        db.collection('analyticssessions').countDocuments({
          startTime: { $gte: startDate }
        }),
        db.collection('analyticsbusinessevents').find({
          timestamp: { $gte: startDate }
        }).toArray()
      ]);

      const listingsViewed = businessEvents.filter(e => e.eventType === 'listing_view').length;
      const dealerContacts = businessEvents.filter(e => e.eventType === 'dealer_contact').length;
      const searchQueries = businessEvents.filter(e => e.eventType === 'search_performed').length;

      // Generate time series data
      const timeSeriesData = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayStart = new Date(date.setHours(0, 0, 0, 0));
        const dayEnd = new Date(date.setHours(23, 59, 59, 999));

        const dayViews = await db.collection('analyticsinteractions').countDocuments({
          timestamp: { $gte: dayStart, $lte: dayEnd },
          eventType: 'page_view'
        });

        timeSeriesData.push({
          date: dayStart.toISOString().split('T')[0],
          views: dayViews
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          overview: {
            totalSessions,
            uniqueVisitors: totalSessions, // Simplified
            totalPageViews: totalInteractions,
            avgSessionDuration: 120, // Placeholder
            bounceRate: 45 // Placeholder
          },
          businessMetrics: {
            listingsViewed,
            dealerContacts,
            searchQueries,
            phoneCallClicks: 0,
            favoritesAdded: 0,
            articlesRead: 0
          },
          timeSeriesData,
          recentActivity: businessEvents.slice(-20).map(event => ({
            type: event.eventType,
            timestamp: event.timestamp,
            details: event.details
          }))
        }
      });
    }

    // Health Check
    if (path === '/api/analytics/health' && method === 'GET') {
      const [
        sessionsCount,
        interactionsCount
      ] = await Promise.all([
        db.collection('analyticssessions').countDocuments(),
        db.collection('analyticsinteractions').countDocuments()
      ]);

      return res.status(200).json({
        success: true,
        data: {
          healthy: true,
          collections: {
            sessions: sessionsCount,
            interactions: interactionsCount
          },
          timestamp: new Date().toISOString()
        }
      });
    }

    return res.status(404).json({
      success: false,
      message: 'Analytics endpoint not found'
    });

  } catch (error) {
    console.error('Analytics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Analytics processing failed'
    });
  }
}
