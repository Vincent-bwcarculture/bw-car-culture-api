// server/scripts/quickTest.js
// Quick test to verify analytics integration

import fetch from 'node-fetch'; // You might need: npm install node-fetch

const SERVER_URL = 'http://localhost:5000';

async function testAnalyticsIntegration() {
  console.log('🧪 Quick Analytics Integration Test\n');
  
  try {
    // 1. Test server health
    console.log('1️⃣ Testing server health...');
    const healthResponse = await fetch(`${SERVER_URL}/api/health`);
    const healthData = await healthResponse.json();
    
    if (healthData.analytics?.enabled) {
      console.log('✅ Server reports analytics enabled');
    } else {
      console.log('❌ Server reports analytics NOT enabled');
      return;
    }
    
    // 2. Test analytics health endpoint
    console.log('\n2️⃣ Testing analytics health endpoint...');
    const analyticsHealthResponse = await fetch(`${SERVER_URL}/api/analytics/health`);
    
    if (analyticsHealthResponse.ok) {
      const analyticsHealth = await analyticsHealthResponse.json();
      console.log('✅ Analytics health endpoint working:', analyticsHealth.success ? 'Healthy' : 'Issues detected');
    } else {
      console.log('❌ Analytics health endpoint failed:', analyticsHealthResponse.status);
    }
    
    // 3. Test tracking endpoint
    console.log('\n3️⃣ Testing analytics tracking...');
    const trackResponse = await fetch(`${SERVER_URL}/api/analytics/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'test_event',
        category: 'testing',
        metadata: { test: true, timestamp: new Date().toISOString() }
      })
    });
    
    if (trackResponse.ok) {
      console.log('✅ Analytics tracking endpoint working');
    } else {
      console.log('❌ Analytics tracking failed:', trackResponse.status);
    }
    
    // 4. Test dashboard data endpoint
    console.log('\n4️⃣ Testing dashboard data...');
    const dashboardResponse = await fetch(`${SERVER_URL}/api/analytics/dashboard`);
    
    if (dashboardResponse.ok) {
      const dashboardData = await dashboardResponse.json();
      console.log('✅ Dashboard data endpoint working');
      console.log('   - Response structure:', Object.keys(dashboardData.data || {}));
    } else {
      console.log('❌ Dashboard data failed:', dashboardResponse.status);
    }
    
    console.log('\n🎉 Analytics integration test completed!');
    console.log('\n📋 Next steps:');
    console.log('   1. Visit http://localhost:3000/admin/analytics (login as admin)');
    console.log('   2. Browse your website to generate analytics data');
    console.log('   3. Return to admin dashboard to see live data');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n🔧 Make sure your server is running: npm start');
  }
}

testAnalyticsIntegration();
