// scripts/testUpload.js
const fetch = require('node-fetch');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function testUpload() {
  try {
    console.log('Testing image upload...');
    
    // Create a form data object
    const form = new FormData();
    
    // Add a test image
    const imagePath = path.join(__dirname, '../public/images/placeholders/default.jpg');
    const imageFile = fs.readFileSync(imagePath);
    form.append('images', imageFile, {
      filename: 'test-image.jpg',
      contentType: 'image/jpeg'
    });
    
    // Add sample listing data
    form.append('primaryImage', '0');
    form.append('listingData', JSON.stringify({
      title: 'Test Listing',
      price: 9999,
      description: 'This is a test listing'
    }));
    
    // Log what we're sending
    console.log('Sending form data with fields:', Array.from(form.keys()));
    
    // Get the auth token - you'll need to set this
    const token = 'YOUR_TOKEN_HERE'; // Replace with a valid token
    
    // Make the request
    const response = await fetch('http://localhost:5000/api/listings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        ...form.getHeaders()
      },
      body: form
    });
    
    // Handle the response
    const data = await response.json();
    console.log('Response status:', response.status);
    console.log('Response body:', data);
    
    if (response.ok) {
      console.log('Test passed! Upload successful');
    } else {
      console.log('Test failed! Upload error');
    }
  } catch (error) {
    console.error('Test error:', error);
  }
}

testUpload();