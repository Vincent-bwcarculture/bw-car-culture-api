// server/scripts/debugTracking.js
// Debug the 500 error in analytics tracking - FIXED

import fetch from 'node-fetch';

const SERVER_URL = 'http://localhost:5000';

async function debugTrackingError() {
  console.log('🔍 Debugging Analytics Tracking Error\n');
  
  try {
    // Test with detailed error handling - FIXED: Use valid category
    console.log('Testing tracking endpoint with detailed logging...');
    
    const response = await fetch(`${SERVER_URL}/api/analytics/track`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Debug-Script/1.0'
      },
      body: JSON.stringify({
        eventType: 'debug_test',
        category: 'system', // FIXED: Changed from 'testing' to 'system'
        page: '/debug',
        metadata: { 
          test: true, 
          timestamp: new Date().toISOString(),
          source: 'debug_script'
        }
      })
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    const responseText = await response.text();
    console.log('Response body:', responseText);
    
    if (!response.ok) {
      console.log('\n❌ Error details:');
      try {
        const errorData = JSON.parse(responseText);
        console.log('Parsed error:', errorData);
      } catch (e) {
        console.log('Raw error text:', responseText);
      }
    } else {
      console.log('\n✅ Success! Analytics tracking is working.');
    }
    
    // Test a simpler request - FIXED: Use valid category
    console.log('\n🔄 Testing with minimal data...');
    const simpleResponse = await fetch(`${SERVER_URL}/api/analytics/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'simple_test',
        category: 'system' // FIXED: Changed from 'testing' to 'system'
      })
    });
    
    console.log('Simple request status:', simpleResponse.status);
    const simpleText = await simpleResponse.text();
    console.log('Simple response:', simpleText);
    
    if (simpleResponse.ok) {
      console.log('\n✅ Simple test passed! Analytics is working correctly.');
    }
    
    // Test business event tracking
    console.log('\n🚗 Testing business event tracking...');
    const businessResponse = await fetch(`${SERVER_URL}/api/analytics/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'listing_view',
        category: 'content',
        metadata: {
          listingId: 'test-listing-123',
          make: 'Toyota',
          model: 'Corolla',
          price: 25000
        }
      })
    });
    
    console.log('Business event status:', businessResponse.status);
    const businessText = await businessResponse.text();
    console.log('Business response:', businessText);
    
    // Test search tracking
    console.log('\n🔍 Testing search tracking...');
    const searchResponse = await fetch(`${SERVER_URL}/api/analytics/track/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: 'Toyota Corolla',
        category: 'cars',
        resultsCount: 15,
        filters: {
          make: 'Toyota',
          priceRange: '20000-30000'
        }
      })
    });
    
    console.log('Search tracking status:', searchResponse.status);
    const searchText = await searchResponse.text();
    console.log('Search response:', searchText);
    
    // Test health endpoint for comparison
    console.log('\n✅ Testing analytics health for comparison...');
    const healthResponse = await fetch(`${SERVER_URL}/api/analytics/health`);
    console.log('Health status:', healthResponse.status);
    const healthText = await healthResponse.text();
    console.log('Health response:', healthText);
    
    console.log('\n🎉 Analytics debugging completed!');
    console.log('\n📋 Summary:');
    console.log('- Main tracking endpoint:', response.ok ? '✅ Working' : '❌ Failed');
    console.log('- Simple tracking:', simpleResponse.ok ? '✅ Working' : '❌ Failed');
    console.log('- Business events:', businessResponse.ok ? '✅ Working' : '❌ Failed');
    console.log('- Search tracking:', searchResponse.ok ? '✅ Working' : '❌ Failed');
    console.log('- Health endpoint:', healthResponse.ok ? '✅ Working' : '❌ Failed');
    
  } catch (error) {
    console.error('❌ Debug test failed:', error.message);
    console.log('\n🔧 Make sure your server is running: npm start');
  }
}

debugTrackingError();
