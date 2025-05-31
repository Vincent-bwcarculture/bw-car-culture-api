// scripts/testAuth.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

async function testAuth() {
  const testEmail = 'kvramphothoi3wcarculture.com';
  const testPassword = 'your_test_password'; // Replace with actual test password
  
  // Test password hashing
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(testPassword, salt);
  console.log('Hashed password:', hashedPassword);
  
  // Create a test JWT token
  const jwtSecret = process.env.JWT_SECRET || 'test_secret';
  const token = jwt.sign(
    { id: 'test_user_id' },
    jwtSecret,
    { expiresIn: '7d' }
  );
  console.log('Generated JWT token:', token);
  
  // Verify the token
  try {
    const decoded = jwt.verify(token, jwtSecret);
    console.log('Decoded token:', decoded);
  } catch (error) {
    console.error('Token verification failed:', error);
  }
}

testAuth().catch(console.error);