// server/test-s3-upload.js
import './env.js'; // Load environment variables
import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Running S3 upload test...');

// Initialize S3 client
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

// Test file path
const testFilePath = path.join(__dirname, '../public/images/placeholders/default.jpg');
if (!fs.existsSync(testFilePath)) {
  console.error(`Test file not found: ${testFilePath}`);
  process.exit(1);
}

console.log(`Using test file: ${testFilePath}`);
const fileContent = fs.readFileSync(testFilePath);

// Test upload
const params = {
  Bucket: process.env.AWS_S3_BUCKET,
  Key: `test-upload-${Date.now()}.jpg`,
  Body: fileContent,
  ContentType: 'image/jpeg',
  ACL: 'public-read'
};

console.log(`Attempting to upload to bucket: ${params.Bucket}, key: ${params.Key}`);

s3.upload(params, (err, data) => {
  if (err) {
    console.error('❌ Upload failed:', err);
    console.error('Error details:', err.code, err.message);
    process.exit(1);
  } else {
    console.log('✅ Upload successful!');
    console.log('File URL:', data.Location);
    
    // Now try to get the file back
    s3.getObject({
      Bucket: params.Bucket,
      Key: params.Key
    }, (getErr, getData) => {
      if (getErr) {
        console.error('❌ GetObject failed:', getErr);
      } else {
        console.log('✅ GetObject successful, content length:', getData.ContentLength);
      }
      
      // Clean up - delete the test file
      s3.deleteObject({
        Bucket: params.Bucket,
        Key: params.Key
      }, (deleteErr) => {
        if (deleteErr) {
          console.error('❌ DeleteObject failed:', deleteErr);
        } else {
          console.log('✅ Test file deleted successfully');
        }
        
        process.exit(0);
      });
    });
  }
});
