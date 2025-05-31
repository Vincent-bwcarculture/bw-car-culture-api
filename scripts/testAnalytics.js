// server/scripts/testAnalytics.js
// Test script to verify analytics infrastructure is working

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import path from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Import analytics components
import { initializeAnalyticsDatabase, verifyAnalyticsHealth, getAnalyticsStats, createSampleAnalyticsData } from '../config/analyticsDatabase.js';
import { Session, PageView, Interaction, BusinessEvent } from '../models/Analytics.js';

async function testAnalyticsInfrastructure() {
  console.log('🧪 Starting Analytics Infrastructure Test...\n');
  
  try {
    // 1. Test database connection
    console.log('1️⃣ Testing database connection...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: process.env.MONGODB_NAME
    });
    console.log('✅ Database connected successfully\n');

    // 2. Test analytics database initialization
    console.log('2️⃣ Testing analytics database initialization...');
    const initResult = await initializeAnalyticsDatabase();
    console.log('✅ Analytics database initialized:', initResult, '\n');

    // 3. Test analytics health
    console.log('3️⃣ Testing analytics health check...');
    const health = await verifyAnalyticsHealth();
    console.log('✅ Analytics health status:', health.status);
    if (health.issues && health.issues.length > 0) {
      console.log('⚠️ Health issues:', health.issues);
    }
    console.log();

    // 4. Test model creation
    console.log('4️⃣ Testing analytics model creation...');
    
    // Create test session
    const testSession = new Session({
      sessionId: `test-${Date.now()}`,
      startTime: new Date(),
      isActive: true,
      userAgent: 'Test Script/1.0',
      ip: '127.0.0.1',
      country: 'Botswana',
      city: 'Gaborone',
      device: {
        type: 'desktop',
        os: 'Test OS',
        browser: 'Test Browser'
      },
      pages: ['/test'],
      totalPageViews: 1
    });
    
    await testSession.save();
    console.log('✅ Test session created:', testSession.sessionId);

    // Create test page view
    const testPageView = new PageView({
      sessionId: testSession.sessionId,
      page: '/test',
      title: 'Test Page',
      timestamp: new Date()
    });
    
    await testPageView.save();
    console.log('✅ Test page view created');

    // Create test interaction
    const testInteraction = new Interaction({
      sessionId: testSession.sessionId,
      eventType: 'test_event',
      category: 'testing',
      page: '/test',
      metadata: {
        testData: true,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date()
    });
    
    await testInteraction.save();
    console.log('✅ Test interaction created');

    // Create test business event
    const testBusinessEvent = new BusinessEvent({
      sessionId: testSession.sessionId,
      eventType: 'listing_view',
      entityType: 'listing',
      entityId: 'test-listing-123',
      conversionValue: 10,
      details: {
        listingPrice: 50000,
        listingMake: 'Test Make',
        listingModel: 'Test Model',
        source: 'test'
      },
      timestamp: new Date()
    });
    
    await testBusinessEvent.save();
    console.log('✅ Test business event created\n');

    // 5. Test analytics queries
    console.log('5️⃣ Testing analytics queries...');
    
    const sessionCount = await Session.countDocuments();
    const pageViewCount = await PageView.countDocuments();
    const interactionCount = await Interaction.countDocuments();
    const businessEventCount = await BusinessEvent.countDocuments();
    
    console.log('📊 Current counts:');
    console.log(`   Sessions: ${sessionCount}`);
    console.log(`   Page Views: ${pageViewCount}`);
    console.log(`   Interactions: ${interactionCount}`);
    console.log(`   Business Events: ${businessEventCount}\n`);

    // 6. Test analytics statistics
    console.log('6️⃣ Testing analytics statistics...');
    const stats = await getAnalyticsStats();
    console.log('📈 Analytics stats:', JSON.stringify(stats, null, 2), '\n');

    // 7. Test aggregation queries
    console.log('7️⃣ Testing aggregation queries...');
    
    // Test popular pages aggregation
    const popularPages = await PageView.aggregate([
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
      { $limit: 5 }
    ]);
    
    console.log('📄 Popular pages:', popularPages);

    // Test search analytics
    const searchAnalytics = await Interaction.aggregate([
      {
        $match: {
          eventType: 'search'
        }
      },
      {
        $group: {
          _id: '$metadata.query',
          searches: { $sum: 1 }
        }
      },
      { $sort: { searches: -1 } },
      { $limit: 5 }
    ]);
    
    console.log('🔍 Search analytics:', searchAnalytics, '\n');

    // 8. Cleanup test data
    console.log('8️⃣ Cleaning up test data...');
    await Session.deleteOne({ _id: testSession._id });
    await PageView.deleteOne({ _id: testPageView._id });
    await Interaction.deleteOne({ _id: testInteraction._id });
    await BusinessEvent.deleteOne({ _id: testBusinessEvent._id });
    console.log('✅ Test data cleaned up\n');

    // Final verification
    console.log('🎉 All analytics infrastructure tests passed!');
    console.log('✅ Your analytics system is ready for production\n');

    console.log('📋 Next steps:');
    console.log('   1. Start your server with the integrated analytics');
    console.log('   2. Visit /api/analytics/health to check API health');
    console.log('   3. Visit /admin/analytics to see the dashboard');
    console.log('   4. Begin integrating tracking into your components\n');

  } catch (error) {
    console.error('❌ Analytics test failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
}

// Run the test
testAnalyticsInfrastructure();
