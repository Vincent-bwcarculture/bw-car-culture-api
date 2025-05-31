// server/test-s3-direct.js
import './env.js'; // Load environment variables
import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('\n===== S3 DIRECT UPLOAD TEST =====');
console.log('AWS Credentials:');
console.log('- Access Key ID:', process.env.AWS_ACCESS_KEY_ID ? '✅ Set' : '❌ Missing');
console.log('- Secret Access Key:', process.env.AWS_SECRET_ACCESS_KEY ? '✅ Set' : '❌ Missing');
console.log('- Region:', process.env.AWS_REGION || 'us-east-1');
console.log('- Bucket:', process.env.AWS_S3_BUCKET);

// Initialize S3 client with explicit credentials
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1',
  apiVersion: '2006-03-01',
  signatureVersion: 'v4'
});

// Create a simple test file with current timestamp
const testContent = `This is a test file created at ${new Date().toISOString()}`;
const testBuffer = Buffer.from(testContent);
const testKey = `test-upload-${Date.now()}.txt`;

console.log(`\nCreated test file content (${testBuffer.length} bytes)`);
console.log(`Test key: ${testKey}`);

// Test upload
const params = {
  Bucket: process.env.AWS_S3_BUCKET,
  Key: testKey,
  Body: testBuffer,
  ContentType: 'text/plain',
  ACL: 'public-read'
};

console.log(`\nUploading to S3 bucket: ${params.Bucket}`);

s3.upload(params, (err, data) => {
  if (err) {
    console.error('\n❌ UPLOAD FAILED');
    console.error('Error code:', err.code);
    console.error('Error message:', err.message);
    
    if (err.code === 'InvalidAccessKeyId') {
      console.error('\nTROUBLESHOOTING:');
      console.error('- Your Access Key ID is invalid or doesn\'t exist');
      console.error('- Check that you\'re using the correct AWS account');
      console.error('- Create a new access key in the IAM console');
    } else if (err.code === 'SignatureDoesNotMatch') {
      console.error('\nTROUBLESHOOTING:');
      console.error('- Your Secret Access Key is incorrect');
      console.error('- Create a new access key pair in the IAM console');
    } else if (err.code === 'AccessDenied') {
      console.error('\nTROUBLESHOOTING:');
      console.error('- Your IAM user doesn\'t have permission to upload to this bucket');
      console.error('- Check your bucket policy and IAM user permissions');
      console.error('- Make sure your bucket allows public writes if that\'s your intention');
      console.error('- Verify "Block Public Access" settings are appropriate');
    }
    
    process.exit(1);
  } else {
    console.log('\n✅ UPLOAD SUCCESSFUL!');
    console.log('File URL:', data.Location);
    
    // Try to get the file back
    s3.getObject({
      Bucket: params.Bucket,
      Key: params.Key
    }, (getErr, getData) => {
      if (getErr) {
        console.error('\n❌ GET OBJECT FAILED');
        console.error('Error code:', getErr.code);
        console.error('Error message:', getErr.message);
      } else {
        console.log('\n✅ GET OBJECT SUCCESSFUL');
        console.log('Content length:', getData.ContentLength);
        console.log('Content type:', getData.ContentType);
        console.log('Content (first 100 chars):', getData.Body.toString().substring(0, 100));
      }
      
      // Clean up - delete the test file
      s3.deleteObject({
        Bucket: params.Bucket,
        Key: params.Key
      }, (deleteErr) => {
        if (deleteErr) {
          console.error('\n❌ DELETE OBJECT FAILED');
          console.error('Error code:', deleteErr.code);
          console.error('Error message:', deleteErr.message);
        } else {
          console.log('\n✅ TEST FILE DELETED SUCCESSFULLY');
        }
        
        console.log('\n===== TEST COMPLETE =====');
        process.exit(0);
      });
    });
  }
});
