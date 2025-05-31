// server/test-s3-no-acl.js
import './env.js'; // Load environment variables
import AWS from 'aws-sdk';

console.log('\n===== S3 UPLOAD TEST (WITHOUT ACLs) =====');
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

// Test upload - WITHOUT ACL
const params = {
  Bucket: process.env.AWS_S3_BUCKET,
  Key: testKey,
  Body: testBuffer,
  ContentType: 'text/plain'
  // Removed: ACL: 'public-read'
};

console.log(`\nUploading to S3 bucket: ${params.Bucket}`);

s3.upload(params, (err, data) => {
  if (err) {
    console.error('\n❌ UPLOAD FAILED');
    console.error('Error code:', err.code);
    console.error('Error message:', err.message);
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
