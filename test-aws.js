// server/test-aws.js
import AWS from 'aws-sdk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  console.log(`Loading .env from: ${envPath}`);
  dotenv.config({ path: envPath });
} else {
  console.log('No .env file found, using process.env');
  dotenv.config();
}

console.log('\n=== AWS CREDENTIALS TEST ===');
console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? 'Present [first 4 chars: ' + process.env.AWS_ACCESS_KEY_ID.substring(0, 4) + '...]' : 'MISSING');
console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? 'Present [length: ' + process.env.AWS_SECRET_ACCESS_KEY.length + ']' : 'MISSING');
console.log('AWS_REGION:', process.env.AWS_REGION || 'MISSING');
console.log('AWS_S3_BUCKET:', process.env.AWS_S3_BUCKET || 'MISSING');

// Configure AWS SDK
try {
  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
  });
  
  console.log('AWS SDK configured successfully');
  
  // Create S3 instance
  const s3 = new AWS.S3({
    apiVersion: '2006-03-01',
    signatureVersion: 'v4'
  });
  
  console.log('S3 client created, testing connection...');
  
  // Test connection
  s3.listBuckets((err, data) => {
    if (err) {
      console.error('Error connecting to S3:', err);
      console.log('\n=== TROUBLESHOOTING TIPS ===');
      console.log('1. Check if your AWS credentials are correct');
      console.log('2. Make sure your IAM user has S3 permissions');
      console.log('3. Verify your network connectivity');
      process.exit(1);
    } else {
      console.log('✅ Successfully connected to AWS S3!');
      console.log('Available buckets:', data.Buckets.map(b => b.Name).join(', '));
      
      const targetBucket = process.env.AWS_S3_BUCKET;
      const bucketExists = data.Buckets.some(b => b.Name === targetBucket);
      
      if (bucketExists) {
        console.log(`✅ Target bucket '${targetBucket}' exists and is accessible`);
      } else {
        console.log(`❌ Target bucket '${targetBucket}' NOT FOUND in your available buckets!`);
      }
      
      process.exit(0);
    }
  });
} catch (error) {
  console.error('Error setting up AWS SDK:', error);
  process.exit(1);
}
