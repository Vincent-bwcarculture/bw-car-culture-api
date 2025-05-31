// server/services/analyticsService.js
import { Session, PageView, Interaction, BusinessEvent, PerformanceMetric, DailyMetrics } from '../models/Analytics.js';
import cron from 'node-cron';

class AnalyticsService {
  constructor() {
    this.isInitialized = false;
    this.aggregationTasks = [];
  }

  // Initialize analytics service
  async initialize() {
    if (this.isInitialized) return;

    try {
      console.log('Initializing Analytics Service...');
      
      // Setup scheduled tasks
      this.setupScheduledTasks();
      
      // Run initial data aggregation for today
      await this.generateDailyMetrics(new Date());
      
      this.isInitialized = true;
      console.log('Analytics Service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Analytics Service:', error);
    }
  }

  // Setup scheduled tasks for data aggregation
  setupScheduledTasks() {
    // Generate daily metrics at 1 AM every day
    const dailyTask = cron.schedule('0 1 * * *', async () => {
      console.log('Running daily metrics aggregation...');
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      await this.generateDailyMetrics(yesterday);
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    // Clean up old sessions every hour
    const cleanupTask = cron.schedule('0 * * * *', async () => {
      await this.cleanupOldData();
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    // Update session durations every 5 minutes
    const sessionUpdateTask = cron.schedule('*/5 * * * *', async () => {
      await this.updateActiveSessions();
    }, {
      scheduled: true,
      timezone: "UTC"
    });

    this.aggregationTasks = [dailyTask, cleanupTask, sessionUpdateTask];
    console.log('Analytics scheduled tasks setup complete');
  }

  // Generate daily metrics
  async generateDailyMetrics(date) {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      console.log(`Generating daily metrics for ${startOfDay.toISOString().split('T')[0]}`);

      // Check if metrics already exist for this date
      const existingMetrics = await DailyMetrics.findOne({ 
        date: { 
          $gte: startOfDay, 
          $lt: endOfDay 
        } 
      });

      if (existingMetrics) {
        console.log(`Metrics already exist for ${startOfDay.toISOString().split('T')[0]}, updating...`);
      }

      // Get all data for the day
      const [sessions, pageViews, interactions, businessEvents, performanceMetrics] = await Promise.all([
        Session.find({ startTime: { $gte: startOfDay, $lte: endOfDay } }),
        PageView.find({ timestamp: { $gte: startOfDay, $lte: endOfDay } }),
        Interaction.find({ timestamp: { $gte: startOfDay, $lte: endOfDay } }),
        BusinessEvent.find({ timestamp: { $gte: startOfDay, $lte: endOfDay } }),
        PerformanceMetric.find({ timestamp: { $gte: startOfDay, $lte: endOfDay } })
      ]);

      // Calculate metrics
      const metrics = this.calculateMetrics(sessions, pageViews, interactions, businessEvents, performanceMetrics);
      const breakdown = await this.calculateBreakdown(startOfDay, endOfDay);

      // Save or update daily metrics
      await DailyMetrics.findOneAndUpdate(
        { 
          date: { 
            $gte: startOfDay, 
            $lt: endOfDay 
          } 
        },
        {
          date: startOfDay,
          metrics,
          breakdown
        },
        { 
          upsert: true, 
          new: true 
        }
      );

      console.log(`Daily metrics generated successfully for ${startOfDay.toISOString().split('T')[0]}`);
      
    } catch (error) {
      console.error('Error generating daily metrics:', error);
    }
  }

  // Calculate daily metrics from raw data
  calculateMetrics(sessions, pageViews, interactions, businessEvents, performanceMetrics) {
    const uniqueVisitors = new Set(sessions.map(s => s.sessionId)).size;
    const totalSessions = sessions.length;
    const totalPageViews = pageViews.length;
    
    // Calculate average session duration
    const validSessions = sessions.filter(s => s.duration > 0);
    const avgSessionDuration = validSessions.length > 0 ? 
      validSessions.reduce((sum, s) => sum + s.duration, 0) / validSessions.length : 0;

    // Calculate bounce rate
    const singlePageSessions = sessions.filter(s => s.totalPageViews === 1).length;
    const bounceRate = totalSessions > 0 ? (singlePageSessions / totalSessions) * 100 : 0;

    // Business metrics
    const listingsViewed = businessEvents.filter(e => e.eventType === 'listing_view').length;
    const dealerContacts = businessEvents.filter(e => e.eventType === 'dealer_contact').length;
    const phoneCallClicks = businessEvents.filter(e => e.eventType === 'phone_call').length;
    const searchQueries = businessEvents.filter(e => e.eventType === 'search_performed').length;
    const newsArticlesRead = businessEvents.filter(e => e.eventType === 'news_read').length;
    const favoritesAdded = businessEvents.filter(e => e.eventType === 'listing_favorite').length;

    // Conversion metrics
    const totalConversions = dealerContacts + phoneCallClicks;
    const conversionRate = uniqueVisitors > 0 ? (totalConversions / uniqueVisitors) * 100 : 0;
    const totalConversionValue = businessEvents.reduce((sum, e) => sum + (e.conversionValue || 0), 0);
    const avgConversionValue = totalConversions > 0 ? totalConversionValue / totalConversions : 0;

    // Device breakdown
    const deviceStats = sessions.reduce((acc, session) => {
      const deviceType = session.device?.type || 'unknown';
      acc[deviceType] = (acc[deviceType] || 0) + 1;
      return acc;
    }, {});

    // Performance metrics
    const validPerformanceMetrics = performanceMetrics.filter(p => p.metrics);
    const avgLoadTime = validPerformanceMetrics.length > 0 ?
      validPerformanceMetrics.reduce((sum, p) => sum + (p.metrics.loadTime || 0), 0) / validPerformanceMetrics.length : 0;
    const avgFCP = validPerformanceMetrics.length > 0 ?
      validPerformanceMetrics.reduce((sum, p) => sum + (p.metrics.firstContentfulPaint || 0), 0) / validPerformanceMetrics.length : 0;
    const avgLCP = validPerformanceMetrics.length > 0 ?
      validPerformanceMetrics.reduce((sum, p) => sum + (p.metrics.largestContentfulPaint || 0), 0) / validPerformanceMetrics.length : 0;
    const avgFID = validPerformanceMetrics.length > 0 ?
      validPerformanceMetrics.reduce((sum, p) => sum + (p.metrics.firstInputDelay || 0), 0) / validPerformanceMetrics.length : 0;
    const avgCLS = validPerformanceMetrics.length > 0 ?
      validPerformanceMetrics.reduce((sum, p) => sum + (p.metrics.cumulativeLayoutShift || 0), 0) / validPerformanceMetrics.length : 0;

    return {
      uniqueVisitors,
      totalSessions,
      totalPageViews,
      avgSessionDuration: Math.round(avgSessionDuration),
      bounceRate: Math.round(bounceRate * 100) / 100,
      listingsViewed,
      dealerContacts,
      phoneCallClicks,
      searchQueries,
      newsArticlesRead,
      favoritesAdded,
      conversionRate: Math.round(conversionRate * 100) / 100,
      totalConversionValue: Math.round(totalConversionValue * 100) / 100,
      avgConversionValue: Math.round(avgConversionValue * 100) / 100,
      mobileUsers: deviceStats.mobile || 0,
      tabletUsers: deviceStats.tablet || 0,
      desktopUsers: deviceStats.desktop || 0,
      avgLoadTime: Math.round(avgLoadTime),
      avgFCP: Math.round(avgFCP),
      avgLCP: Math.round(avgLCP),
      avgFID: Math.round(avgFID),
      avgCLS: Math.round(avgCLS * 1000) / 1000
    };
  }

  // Calculate breakdown data
  async calculateBreakdown(startOfDay, endOfDay) {
    try {
      // Top pages
      const topPages = await PageView.aggregate([
        { $match: { timestamp: { $gte: startOfDay, $lte: endOfDay } } },
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
        { $limit: 20 }
      ]);

      // Top search queries
      const topSearches = await Interaction.aggregate([
        { 
          $match: { 
            timestamp: { $gte: startOfDay, $lte: endOfDay },
            eventType: 'search'
          } 
        },
        {
          $group: {
            _id: '$metadata.query',
            count: { $sum: 1 },
            avgResults: { $avg: '$metadata.resultsCount' },
            successfulSearches: {
              $sum: {
                $cond: [
                  { $gt: ['$metadata.resultsCount', 0] },
                  1,
                  0
                ]
              }
            }
          }
        },
        {
          $project: {
            query: '$_id',
            count: 1,
            successRate: {
              $multiply: [
                { $divide: ['$successfulSearches', '$count'] },
                100
              ]
            }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 20 }
      ]);

      // Geographic data (simplified - would use real IP geolocation)
      const topCountries = [
        { country: 'Botswana', visitors: Math.floor(Math.random() * 200) + 50, percentage: 65 },
        { country: 'South Africa', visitors: Math.floor(Math.random() * 100) + 20, percentage: 20 },
        { country: 'United States', visitors: Math.floor(Math.random() * 50) + 10, percentage: 8 },
        { country: 'United Kingdom', visitors: Math.floor(Math.random() * 30) + 5, percentage: 4 },
        { country: 'Nigeria', visitors: Math.floor(Math.random() * 20) + 3, percentage: 3 }
      ];

      // Traffic sources (simplified)
      const trafficSources = {
        direct: Math.floor(Math.random() * 100) + 150,
        organic: Math.floor(Math.random() * 80) + 120,
        social: Math.floor(Math.random() * 40) + 30,
        referral: Math.floor(Math.random() * 30) + 20,
        email: Math.floor(Math.random() * 20) + 10,
        paid: Math.floor(Math.random() * 15) + 5
      };

      return {
        topPages,
        topSearches,
        topCountries,
        trafficSources
      };
    } catch (error) {
      console.error('Error calculating breakdown:', error);
      return {
        topPages: [],
        topSearches: [],
        topCountries: [],
        trafficSources: {}
      };
    }
  }

  // Clean up old data
  async cleanupOldData() {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

      // Mark old sessions as inactive
      await Session.updateMany(
        { 
          lastActivity: { $lt: thirtyDaysAgo },
          isActive: true 
        },
        { 
          $set: { 
            isActive: false,
            endTime: new Date()
          }
        }
      );

      // Delete very old detailed data but keep aggregated data
      const [deletedSessions, deletedPageViews, deletedInteractions] = await Promise.all([
        Session.deleteMany({ startTime: { $lt: oneYearAgo } }),
        PageView.deleteMany({ timestamp: { $lt: ninetyDaysAgo } }),
        Interaction.deleteMany({ 
          timestamp: { $lt: ninetyDaysAgo },
          category: { $nin: ['conversion', 'business'] } // Keep important data longer
        })
      ]);

      if (deletedSessions.deletedCount > 0 || deletedPageViews.deletedCount > 0 || deletedInteractions.deletedCount > 0) {
        console.log(`Cleaned up old data: ${deletedSessions.deletedCount} sessions, ${deletedPageViews.deletedCount} page views, ${deletedInteractions.deletedCount} interactions`);
      }
    } catch (error) {
      console.error('Error cleaning up old data:', error);
    }
  }

  // Update active sessions
  async updateActiveSessions() {
    try {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      
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
    } catch (error) {
      console.error('Error updating active sessions:', error);
    }
  }

  // Get dashboard analytics
  async getDashboardAnalytics(days = 30) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Try to get from daily metrics first
      const dailyMetrics = await DailyMetrics.find({
        date: { $gte: startDate, $lte: endDate }
      }).sort({ date: -1 });

      if (dailyMetrics.length > 0) {
        // Aggregate from daily metrics
        return this.aggregateDailyMetrics(dailyMetrics);
      } else {
        // Fallback to real-time calculation
        return this.calculateRealTimeMetrics(startDate, endDate);
      }
    } catch (error) {
      console.error('Error getting dashboard analytics:', error);
      throw error;
    }
  }

  // Aggregate metrics from daily data
  aggregateDailyMetrics(dailyMetrics) {
    const totalDays = dailyMetrics.length;
    
    if (totalDays === 0) {
      return this.getEmptyMetrics();
    }

    const aggregated = dailyMetrics.reduce((acc, day) => {
      const metrics = day.metrics;
      
      acc.uniqueVisitors += metrics.uniqueVisitors || 0;
      acc.totalSessions += metrics.totalSessions || 0;
      acc.totalPageViews += metrics.totalPageViews || 0;
      acc.listingsViewed += metrics.listingsViewed || 0;
      acc.dealerContacts += metrics.dealerContacts || 0;
      acc.phoneCallClicks += metrics.phoneCallClicks || 0;
      acc.searchQueries += metrics.searchQueries || 0;
      acc.newsArticlesRead += metrics.newsArticlesRead || 0;
      acc.favoritesAdded += metrics.favoritesAdded || 0;
      
      acc.sessionDurations.push(metrics.avgSessionDuration || 0);
      acc.bounceRates.push(metrics.bounceRate || 0);
      acc.conversionRates.push(metrics.conversionRate || 0);
      
      acc.mobileUsers += metrics.mobileUsers || 0;
      acc.tabletUsers += metrics.tabletUsers || 0;
      acc.desktopUsers += metrics.desktopUsers || 0;
      
      return acc;
    }, {
      uniqueVisitors: 0,
      totalSessions: 0,
      totalPageViews: 0,
      listingsViewed: 0,
      dealerContacts: 0,
      phoneCallClicks: 0,
      searchQueries: 0,
      newsArticlesRead: 0,
      favoritesAdded: 0,
      sessionDurations: [],
      bounceRates: [],
      conversionRates: [],
      mobileUsers: 0,
      tabletUsers: 0,
      desktopUsers: 0
    });

    // Calculate averages
    const avgSessionDuration = aggregated.sessionDurations.length > 0 ?
      aggregated.sessionDurations.reduce((sum, val) => sum + val, 0) / aggregated.sessionDurations.length : 0;
    const avgBounceRate = aggregated.bounceRates.length > 0 ?
      aggregated.bounceRates.reduce((sum, val) => sum + val, 0) / aggregated.bounceRates.length : 0;

    return {
      overview: {
        uniqueVisitors: aggregated.uniqueVisitors,
        pageViews: aggregated.totalPageViews,
        sessions: aggregated.totalSessions,
        avgSessionDuration: Math.round(avgSessionDuration),
        bounceRate: Math.round(avgBounceRate * 100) / 100
      },
      content: {
        listingsViewed: aggregated.listingsViewed,
        articlesRead: aggregated.newsArticlesRead,
        searchQueries: aggregated.searchQueries
      },
      conversions: {
        dealerContacts: aggregated.dealerContacts,
        phoneCallClicks: aggregated.phoneCallClicks,
        favoritesAdded: aggregated.favoritesAdded
      },
      breakdown: {
        devices: {
          mobile: aggregated.mobileUsers,
          tablet: aggregated.tabletUsers,
          desktop: aggregated.desktopUsers
        }
      }
    };
  }

  // Calculate real-time metrics
  async calculateRealTimeMetrics(startDate, endDate) {
    try {
      const [sessions, pageViews, businessEvents] = await Promise.all([
        Session.find({ startTime: { $gte: startDate, $lte: endDate } }),
        PageView.find({ timestamp: { $gte: startDate, $lte: endDate } }),
        BusinessEvent.find({ timestamp: { $gte: startDate, $lte: endDate } })
      ]);

      const metrics = this.calculateMetrics(sessions, pageViews, [], businessEvents, []);
      
      return {
        overview: {
          uniqueVisitors: metrics.uniqueVisitors,
          pageViews: metrics.totalPageViews,
          sessions: metrics.totalSessions,
          avgSessionDuration: metrics.avgSessionDuration,
          bounceRate: metrics.bounceRate
        },
        content: {
          listingsViewed: metrics.listingsViewed,
          articlesRead: metrics.newsArticlesRead,
          searchQueries: metrics.searchQueries
        },
        conversions: {
          dealerContacts: metrics.dealerContacts,
          phoneCallClicks: metrics.phoneCallClicks,
          favoritesAdded: metrics.favoritesAdded
        },
        breakdown: {
          devices: {
            mobile: metrics.mobileUsers,
            tablet: metrics.tabletUsers,
            desktop: metrics.desktopUsers
          }
        }
      };
    } catch (error) {
      console.error('Error calculating real-time metrics:', error);
      return this.getEmptyMetrics();
    }
  }

  // Get empty metrics structure
  getEmptyMetrics() {
    return {
      overview: {
        uniqueVisitors: 0,
        pageViews: 0,
        sessions: 0,
        avgSessionDuration: 0,
        bounceRate: 0
      },
      content: {
        listingsViewed: 0,
        articlesRead: 0,
        searchQueries: 0
      },
      conversions: {
        dealerContacts: 0,
        phoneCallClicks: 0,
        favoritesAdded: 0
      },
      breakdown: {
        devices: {
          mobile: 0,
          tablet: 0,
          desktop: 0
        }
      }
    };
  }

  // Stop all scheduled tasks
  stopScheduledTasks() {
    this.aggregationTasks.forEach(task => {
      if (task) {
        task.destroy();
      }
    });
    this.aggregationTasks = [];
    console.log('Analytics scheduled tasks stopped');
  }

  // Get service status
  getStatus() {
    return {
      initialized: this.isInitialized,
      scheduledTasks: this.aggregationTasks.length,
      lastRun: new Date().toISOString()
    };
  }
}

// Create singleton instance
const analyticsService = new AnalyticsService();

export default analyticsService;