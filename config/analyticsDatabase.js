// server/config/analyticsDatabase.js
import mongoose from 'mongoose';
import { Session, PageView, Interaction, BusinessEvent, PerformanceMetric, DailyMetrics } from '../models/Analytics.js';

/**
 * Initialize analytics database collections and indexes
 */
export const initializeAnalyticsDatabase = async () => {
  try {
    console.log('🔧 Initializing analytics database...');
    
    // Ensure all analytics collections exist
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(col => col.name);
    
    const requiredCollections = [
      'analyticssessions',
      'analyticspageviews', 
      'analyticsinteractions',
      'analyticsbusinessevents',
      'analyticsperformancemetrics',
      'analyticsdailymetrics'
    ];
    
    console.log('📋 Checking analytics collections...');
    
    // Create indexes for better performance
    await createAnalyticsIndexes();
    
    // Verify collections exist (they'll be created automatically when first document is inserted)
    const missingCollections = requiredCollections.filter(name => !collectionNames.includes(name));
    if (missingCollections.length > 0) {
      console.log(`📝 Collections will be created on first use: ${missingCollections.join(', ')}`);
    }
    
    console.log('✅ Analytics database initialized successfully');
    
    return {
      success: true,
      collections: collectionNames.filter(name => name.startsWith('analytics')),
      indexes: await getIndexStatus()
    };
    
  } catch (error) {
    console.error('❌ Analytics database initialization failed:', error);
    throw error;
  }
};

/**
 * Create all necessary indexes for analytics collections
 */
const createAnalyticsIndexes = async () => {
  try {
    console.log('🔍 Creating analytics database indexes...');
    
    // Session indexes
    await Session.collection.createIndex({ sessionId: 1 }, { unique: true });
    await Session.collection.createIndex({ startTime: -1 });
    await Session.collection.createIndex({ isActive: 1, lastActivity: -1 });
    await Session.collection.createIndex({ userId: 1, startTime: -1 });
    await Session.collection.createIndex({ 'device.type': 1 });
    await Session.collection.createIndex({ country: 1 });
    await Session.collection.createIndex({ ip: 1 });
    
    // PageView indexes
    await PageView.collection.createIndex({ page: 1, timestamp: -1 });
    await PageView.collection.createIndex({ sessionId: 1, timestamp: 1 });
    await PageView.collection.createIndex({ timestamp: -1 });
    await PageView.collection.createIndex({ userId: 1, timestamp: -1 });
    await PageView.collection.createIndex({ page: 1 });
    
    // Interaction indexes
    await Interaction.collection.createIndex({ eventType: 1, timestamp: -1 });
    await Interaction.collection.createIndex({ category: 1, timestamp: -1 });
    await Interaction.collection.createIndex({ sessionId: 1, timestamp: 1 });
    await Interaction.collection.createIndex({ page: 1, eventType: 1 });
    await Interaction.collection.createIndex({ userId: 1, timestamp: -1 });
    await Interaction.collection.createIndex({ timestamp: -1 });
    
    // BusinessEvent indexes
    await BusinessEvent.collection.createIndex({ eventType: 1, timestamp: -1 });
    await BusinessEvent.collection.createIndex({ entityType: 1, entityId: 1 });
    await BusinessEvent.collection.createIndex({ userId: 1, timestamp: -1 });
    await BusinessEvent.collection.createIndex({ timestamp: -1, conversionValue: -1 });
    await BusinessEvent.collection.createIndex({ sessionId: 1 });
    
    // PerformanceMetric indexes
    await PerformanceMetric.collection.createIndex({ page: 1, timestamp: -1 });
    await PerformanceMetric.collection.createIndex({ timestamp: -1 });
    await PerformanceMetric.collection.createIndex({ sessionId: 1 });
    
    // DailyMetrics indexes
    await DailyMetrics.collection.createIndex({ date: -1 }, { unique: true });
    
    console.log('✅ Analytics database indexes created successfully');
    
  } catch (error) {
    console.error('❌ Error creating analytics indexes:', error);
    // Don't throw here - indexes might already exist
    console.log('⚠️ Some indexes may already exist, continuing...');
  }
};

/**
 * Get status of all analytics indexes
 */
const getIndexStatus = async () => {
  try {
    const indexStatus = {};
    
    const models = [
      { name: 'Session', model: Session },
      { name: 'PageView', model: PageView },
      { name: 'Interaction', model: Interaction },
      { name: 'BusinessEvent', model: BusinessEvent },
      { name: 'PerformanceMetric', model: PerformanceMetric },
      { name: 'DailyMetrics', model: DailyMetrics }
    ];
    
    for (const { name, model } of models) {
      const indexes = await model.collection.indexes();
      indexStatus[name] = indexes.map(idx => idx.name || 'unnamed');
    }
    
    return indexStatus;
    
  } catch (error) {
    console.error('Error getting index status:', error);
    return {};
  }
};

/**
 * Clean up old analytics data based on retention policy
 */
export const cleanupAnalyticsData = async (options = {}) => {
  try {
    const {
      retainRawDataDays = 90,
      retainAggregatedDataDays = 365,
      retainBusinessEventsDays = 730 // Keep business events longer
    } = options;
    
    console.log('🧹 Starting analytics data cleanup...');
    
    const rawDataCutoff = new Date(Date.now() - retainRawDataDays * 24 * 60 * 60 * 1000);
    const aggregatedDataCutoff = new Date(Date.now() - retainAggregatedDataDays * 24 * 60 * 60 * 1000);
    const businessEventsCutoff = new Date(Date.now() - retainBusinessEventsDays * 24 * 60 * 60 * 1000);
    
    const results = {};
    
    // Clean up old sessions
    results.sessions = await Session.deleteMany({
      startTime: { $lt: rawDataCutoff }
    });
    
    // Clean up old page views
    results.pageViews = await PageView.deleteMany({
      timestamp: { $lt: rawDataCutoff }
    });
    
    // Clean up old interactions (except important business ones)
    results.interactions = await Interaction.deleteMany({
      timestamp: { $lt: rawDataCutoff },
      category: { $nin: ['conversion', 'business'] }
    });
    
    // Clean up very old business events
    results.businessEvents = await BusinessEvent.deleteMany({
      timestamp: { $lt: businessEventsCutoff }
    });
    
    // Clean up old performance metrics
    results.performanceMetrics = await PerformanceMetric.deleteMany({
      timestamp: { $lt: rawDataCutoff }
    });
    
    // Clean up very old daily metrics
    results.dailyMetrics = await DailyMetrics.deleteMany({
      date: { $lt: aggregatedDataCutoff }
    });
    
    console.log('✅ Analytics data cleanup completed:', {
      sessionsDeleted: results.sessions.deletedCount,
      pageViewsDeleted: results.pageViews.deletedCount,
      interactionsDeleted: results.interactions.deletedCount,
      businessEventsDeleted: results.businessEvents.deletedCount,
      performanceMetricsDeleted: results.performanceMetrics.deletedCount,
      dailyMetricsDeleted: results.dailyMetrics.deletedCount
    });
    
    return results;
    
  } catch (error) {
    console.error('❌ Analytics data cleanup failed:', error);
    throw error;
  }
};

/**
 * Get analytics database statistics
 */
export const getAnalyticsStats = async () => {
  try {
    const stats = {};
    
    // Get collection counts
    stats.collections = {
      sessions: await Session.countDocuments(),
      pageViews: await PageView.countDocuments(),
      interactions: await Interaction.countDocuments(),
      businessEvents: await BusinessEvent.countDocuments(),
      performanceMetrics: await PerformanceMetric.countDocuments(),
      dailyMetrics: await DailyMetrics.countDocuments()
    };
    
    // Get recent activity (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    stats.recentActivity = {
      newSessions: await Session.countDocuments({ startTime: { $gte: yesterday } }),
      pageViews: await PageView.countDocuments({ timestamp: { $gte: yesterday } }),
      interactions: await Interaction.countDocuments({ timestamp: { $gte: yesterday } }),
      businessEvents: await BusinessEvent.countDocuments({ timestamp: { $gte: yesterday } })
    };
    
    // Get active sessions
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    stats.activeSessions = await Session.countDocuments({
      isActive: true,
      lastActivity: { $gte: thirtyMinutesAgo }
    });
    
    // Get database size info
    const dbStats = await mongoose.connection.db.stats();
    stats.database = {
      size: dbStats.dataSize,
      collections: dbStats.collections,
      indexes: dbStats.indexes
    };
    
    return stats;
    
  } catch (error) {
    console.error('Error getting analytics stats:', error);
    throw error;
  }
};

/**
 * Verify analytics database health
 */
export const verifyAnalyticsHealth = async () => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      issues: []
    };
    
    // Check if collections exist and have data
    const collections = [
      { name: 'Session', model: Session },
      { name: 'PageView', model: PageView },
      { name: 'Interaction', model: Interaction },
      { name: 'BusinessEvent', model: BusinessEvent },
      { name: 'PerformanceMetric', model: PerformanceMetric },
      { name: 'DailyMetrics', model: DailyMetrics }
    ];
    
    for (const { name, model } of collections) {
      try {
        const count = await model.countDocuments();
        health[name.toLowerCase()] = {
          exists: true,
          count: count,
          hasData: count > 0
        };
      } catch (error) {
        health[name.toLowerCase()] = {
          exists: false,
          error: error.message
        };
        health.issues.push(`${name} collection issue: ${error.message}`);
      }
    }
    
    // Check for recent activity
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentSessions = await Session.countDocuments({ startTime: { $gte: yesterday } });
    
    if (recentSessions === 0) {
      health.issues.push('No recent session activity in the last 24 hours');
    }
    
    // Set overall status
    if (health.issues.length > 0) {
      health.status = health.issues.length > 3 ? 'unhealthy' : 'warning';
    }
    
    return health;
    
  } catch (error) {
    return {
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * Create sample analytics data for testing (development only)
 */
export const createSampleAnalyticsData = async () => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Sample data creation is not allowed in production');
  }
  
  try {
    console.log('🔧 Creating sample analytics data...');
    
    const sampleSessionId = 'sample-' + Date.now();
    
    // Create sample session
    const session = new Session({
      sessionId: sampleSessionId,
      startTime: new Date(),
      isActive: true,
      userAgent: 'Sample Browser/1.0',
      ip: '127.0.0.1',
      country: 'Botswana',
      city: 'Gaborone',
      device: {
        type: 'desktop',
        os: 'Sample OS',
        browser: 'Sample Browser'
      },
      pages: ['/'],
      totalPageViews: 1
    });
    
    await session.save();
    
    // Create sample page view
    const pageView = new PageView({
      sessionId: sampleSessionId,
      page: '/',
      title: 'Home Page',
      timestamp: new Date()
    });
    
    await pageView.save();
    
    // Create sample interaction
    const interaction = new Interaction({
      sessionId: sampleSessionId,
      eventType: 'page_view',
      category: 'navigation',
      page: '/',
      timestamp: new Date()
    });
    
    await interaction.save();
    
    console.log('✅ Sample analytics data created successfully');
    
    return {
      session: session._id,
      pageView: pageView._id,
      interaction: interaction._id
    };
    
  } catch (error) {
    console.error('❌ Error creating sample data:', error);
    throw error;
  }
};

export default {
  initializeAnalyticsDatabase,
  cleanupAnalyticsData,
  getAnalyticsStats,
  verifyAnalyticsHealth,
  createSampleAnalyticsData
};
