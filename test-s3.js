// server/test-s3.js
import AWS from 'aws-sdk';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Running S3 connection test...');

/**
 * Loads environment variables from .env file and returns AWS credentials
 */
function loadEnvironment() {
  // Try multiple possible paths for .env file
  const possiblePaths = [
    path.join(__dirname, '../.env'),
    path.join(process.cwd(), '.env')
  ];
  
  let envPath = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      envPath = p;
      break;
    }
  }
  
  if (envPath) {
    console.log(`Loading environment variables from: ${envPath}`);
    dotenv.config({ path: envPath });
  } else {
    console.warn('⚠️ No .env file found! Using system environment variables.');
    dotenv.config();
  }
  
  // Return credentials
  return {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1',
    bucket: process.env.AWS_S3_BUCKET || 'i3wcarculture-images'
  };
}

// Load environment variables
const awsCredentials = loadEnvironment();

// Display credential status (without showing actual values)
console.log('\n=== Detailed AWS Variable Check ===');
console.log('AWS_ACCESS_KEY_ID:', awsCredentials.accessKeyId ? `✅ Set (length: ${awsCredentials.accessKeyId.length})` : '❌ Missing');
console.log('AWS_SECRET_ACCESS_KEY:', awsCredentials.secretAccessKey ? `✅ Set (length: ${awsCredentials.secretAccessKey.length})` : '❌ Missing');
console.log('AWS_REGION:', awsCredentials.region || '❌ Missing');
console.log('AWS_S3_BUCKET:', awsCredentials.bucket || '❌ Missing');
console.log('===================================\n');

// Initialize S3 client
let s3 = null;

/**
 * Lists the contents of the S3 bucket with formatting
 */
async function listBucketContents() {
  try {
    console.log(`Listing contents of bucket: ${awsCredentials.bucket}`);
    const listParams = {
      Bucket: awsCredentials.bucket,
      MaxKeys: 20 // Show up to 20 items
    };
    
    const objects = await s3.listObjectsV2(listParams).promise();
    
    if (objects.Contents && objects.Contents.length > 0) {
      console.log('\nFiles in bucket:');
      console.log('------------------------------------------------------------');
      console.log('| File Key                          | Size     | Last Modified');
      console.log('------------------------------------------------------------');
      
      objects.Contents.forEach(item => {
        // Format the file size
        const sizeInKB = Math.round(item.Size / 1024);
        let sizeStr = '';
        if (sizeInKB > 1024) {
          sizeStr = `${(sizeInKB / 1024).toFixed(2)} MB`;
        } else {
          sizeStr = `${sizeInKB} KB`;
        }
        
        // Format the date
        const date = item.LastModified.toISOString().split('T')[0];
        
        // Truncate the key if too long
        const keyDisplay = item.Key.length > 30 ? item.Key.substring(0, 27) + '...' : item.Key.padEnd(30);
        
        console.log(`| ${keyDisplay} | ${sizeStr.padEnd(8)} | ${date}`);
      });
      console.log('------------------------------------------------------------');
      console.log(`Total: ${objects.Contents.length} ${objects.Contents.length === 1 ? 'object' : 'objects'}`);
      
      // Show folder structure
      console.log('\nFolder Structure:');
      const folders = new Set();
      objects.Contents.forEach(item => {
        if (item.Key.includes('/')) {
          const folder = item.Key.split('/')[0];
          folders.add(folder);
        }
      });
      
      if (folders.size > 0) {
        Array.from(folders).sort().forEach(folder => {
          console.log(`- ${folder}/`);
        });
      } else {
        console.log('No folders found (all files in root)');
      }
    } else {
      console.log('No files found in bucket');
    }
    return true;
  } catch (error) {
    console.error('Error listing bucket contents:', error);
    return false;
  }
}

/**
 * Main function to test S3 connection
 */
async function testS3Connection() {
  if (!awsCredentials.accessKeyId || !awsCredentials.secretAccessKey) {
    console.error('❌ AWS credentials not found. Cannot initialize S3 client.');
    return false;
  }
  
  try {
    // Configure AWS with the credentials we just loaded
    AWS.config.update({
      accessKeyId: awsCredentials.accessKeyId,
      secretAccessKey: awsCredentials.secretAccessKey,
      region: awsCredentials.region
    });
    
    // Create S3 instance
    s3 = new AWS.S3({
      apiVersion: '2006-03-01',
      signatureVersion: 'v4'
    });
    
    console.log('S3 client initialized, testing connection...');
    
    // Try a simple operation - listing buckets requires minimal permissions
    const buckets = await s3.listBuckets().promise();
    console.log('✅ S3 connection successful. Available buckets:');
    console.log(buckets.Buckets.map(b => b.Name).join(', '));
    
    // Test the target bucket specifically
    if (buckets.Buckets.some(b => b.Name === awsCredentials.bucket)) {
      console.log(`✅ Target bucket '${awsCredentials.bucket}' exists and is accessible`);
    } else {
      console.warn(`⚠️ Target bucket '${awsCredentials.bucket}' not found in available buckets! Check bucket name.`);
      return false;
    }
    
    // Test bucket access
    console.log(`Testing access to bucket: ${awsCredentials.bucket}`);
    const objects = await s3.listObjectsV2({
      Bucket: awsCredentials.bucket,
      MaxKeys: 1
    }).promise();
    
    console.log(`✅ Successfully accessed bucket. Contains ${objects.KeyCount} objects.`);
    
    // List bucket contents if requested
    await listBucketContents();
    
    return true;
  } catch (error) {
    console.error('❌ S3 connection test failed:', error.message);
    console.error('Most common issues:');
    console.error('- Invalid credentials (check both key and secret)');
    console.error('- Insufficient permissions (S3 access needs to be enabled for these credentials)');
    console.error('- Network connectivity issue');
    return false;
  }
}

/**
 * Test bucket operations to verify full access
 */
async function testBucketOperations() {
  if (!s3) return false;
  
  try {
    // Create a test file to upload
    const testContent = `Test file created at ${new Date().toISOString()}`;
    const testKey = `test-files/test-${Date.now()}.txt`;
    
    console.log(`\nTesting write operations with test file: ${testKey}`);
    
    // Upload a test file
    await s3.putObject({
      Bucket: awsCredentials.bucket,
      Key: testKey,
      Body: testContent,
      ContentType: 'text/plain'
    }).promise();
    
    console.log('✅ Successfully uploaded test file');
    
    // Verify the file exists
    const headResponse = await s3.headObject({
      Bucket: awsCredentials.bucket,
      Key: testKey
    }).promise();
    
    console.log('✅ Successfully verified test file exists');
    
    // Read the file back
    const getResponse = await s3.getObject({
      Bucket: awsCredentials.bucket,
      Key: testKey
    }).promise();
    
    const retrievedContent = getResponse.Body.toString();
    const contentMatches = retrievedContent === testContent;
    
    console.log(`✅ Successfully retrieved test file (content match: ${contentMatches ? 'yes' : 'no'})`);
    
    // Delete the test file
    await s3.deleteObject({
      Bucket: awsCredentials.bucket,
      Key: testKey
    }).promise();
    
    console.log('✅ Successfully deleted test file');
    console.log('✅ All bucket operations tests passed!');
    
    return true;
  } catch (error) {
    console.error('❌ Bucket operations test failed:', error.message);
    return false;
  }
}

// Execute tests
async function runTests() {
  try {
    const connectionSuccess = await testS3Connection();
    
    if (connectionSuccess) {
      console.log('✅ S3 connection test passed!');
      
      // Only run bucket operations test if connection was successful
      const shouldTestOperations = process.argv.includes('--test-operations');
      if (shouldTestOperations) {
        await testBucketOperations();
      }
    } else {
      console.log('❌ S3 connection test failed!');
      process.exit(1);
    }
  } catch (err) {
    console.error('Error running tests:', err);
    process.exit(1);
  }
}

runTests()
  .then(() => {
    console.log('\nTest script completed successfully!');
    process.exit(0);
  })
  .catch(err => {
    console.error('\nTest script failed:', err);
    process.exit(1);
  });
