// server/test-keys.js
import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to read .env file
const readEnvFile = () => {
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n');
    const envVars = {};
    
    lines.forEach(line => {
      if (line.trim() && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        const value = valueParts.join('=').trim();
        envVars[key.trim()] = value.replace(/^['"]|['"]$/g, '');
      }
    });
    
    return envVars;
  }
  return {};
};

// Read credentials from .env file
const envVars = readEnvFile();
const accessKeyId = envVars.AWS_ACCESS_KEY_ID;
const secretAccessKey = envVars.AWS_SECRET_ACCESS_KEY;
const region = envVars.AWS_REGION || 'us-east-1';
const bucket = envVars.AWS_S3_BUCKET;

console.log('===== Testing AWS Credentials =====');
console.log(`Access Key ID: ${accessKeyId ? accessKeyId.substring(0, 5) + '...' : 'Not Found'}`);
console.log(`Secret Access Key: ${secretAccessKey ? '[Present]' : 'Not Found'}`);
console.log(`Region: ${region}`);
console.log(`Bucket: ${bucket}`);

// Create S3 client with explicit credentials
if (!accessKeyId || !secretAccessKey) {
  console.error('❌ Missing AWS credentials in .env file');
  process.exit(1);
}

// Create S3 client with explicit credentials
const s3 = new AWS.S3({
  accessKeyId,
  secretAccessKey,
  region,
  apiVersion: '2006-03-01',
  signatureVersion: 'v4'
});

// Test connection
console.log('\nTesting S3 connection with these specific credentials...');

try {
  s3.listBuckets((err, data) => {
    if (err) {
      console.error('❌ AWS ERROR:', err.code);
      console.error('Error Message:', err.message);
      
      if (err.code === 'InvalidAccessKeyId') {
        console.error('\n❌ The Access Key ID does not exist or is incorrect.');
        console.error('Actions to take:');
        console.error('1. Double-check the AWS_ACCESS_KEY_ID in your .env file');
        console.error('2. Check if this key exists in the IAM console');
        console.error('3. If necessary, create a new access key in AWS IAM');
      } else if (err.code === 'SignatureDoesNotMatch') {
        console.error('\n❌ The Secret Access Key is incorrect.');
        console.error('Actions to take:');
        console.error('1. Double-check the AWS_SECRET_ACCESS_KEY in your .env file');
        console.error('2. Create a new access key if you cannot find the correct secret key');
      }
      
      process.exit(1);
    } else {
      console.log('✅ Successfully connected to AWS S3!');
      console.log(`Available buckets: ${data.Buckets.map(b => b.Name).join(', ')}`);
      
      // Check if the specified bucket exists
      if (bucket && data.Buckets.some(b => b.Name === bucket)) {
        console.log(`✅ Target bucket '${bucket}' exists and is accessible`);
        
        // Try a bucket-specific operation
        s3.getBucketLocation({ Bucket: bucket }, (err, data) => {
          if (err) {
            console.error(`❌ Error accessing bucket '${bucket}':`, err.message);
          } else {
            console.log(`✅ Successfully verified bucket access for '${bucket}'`);
            console.log(`Bucket location: ${data.LocationConstraint || 'us-east-1'}`);
          }
        });
      } else if (bucket) {
        console.error(`❌ Target bucket '${bucket}' NOT FOUND in your available buckets!`);
        console.error('Available buckets:', data.Buckets.map(b => b.Name).join(', '));
      }
    }
  });
} catch (error) {
  console.error('❌ Error during S3 test:', error);
}
