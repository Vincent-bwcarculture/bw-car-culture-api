// server/config/s3.js
import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('\n===== INITIALIZING AWS S3 =====');

// Check for required AWS environment variables
console.log('Checking AWS environment variables:');
console.log('AWS_ACCESS_KEY_ID:', process.env.AWS_ACCESS_KEY_ID ? '✅ Present' : '❌ Missing');
console.log('AWS_SECRET_ACCESS_KEY:', process.env.AWS_SECRET_ACCESS_KEY ? '✅ Present' : '❌ Missing');
console.log('AWS_REGION:', process.env.AWS_REGION || '❌ Missing');
console.log('AWS_S3_BUCKET:', process.env.AWS_S3_BUCKET || '❌ Missing');

// Determine if we have all required credentials
const hasCredentials = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
const hasBucket = !!process.env.AWS_S3_BUCKET;
const hasRegion = !!process.env.AWS_REGION;
const s3Enabled = hasCredentials && hasBucket && hasRegion;

// Create standard configuration structure
export const s3Config = {
  bucket: process.env.AWS_S3_BUCKET,
  region: process.env.AWS_REGION || 'us-east-1',
  baseUrl: process.env.AWS_S3_BUCKET 
    ? `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com`
    : '/uploads',
  enabled: s3Enabled,
  credentials: hasCredentials
};

console.log('\nS3 Configuration:');
console.log('- S3 Enabled:', s3Enabled ? 'Yes' : 'No');
console.log('- Bucket:', s3Config.bucket || 'Not configured');
console.log('- Region:', s3Config.region);
console.log('- Base URL:', s3Config.baseUrl);

// Initialize AWS S3 client
let s3 = null;

if (s3Enabled) {
  try {
    console.log('\nInitializing AWS S3 client with explicit credentials...');
    
    // Initialize S3 with explicit credentials
    s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1',
      apiVersion: '2006-03-01',
      signatureVersion: 'v4'
    });
    
    console.log('✅ AWS S3 client initialized successfully');
    
    // Display warning about AWS SDK version
    console.log('\n⚠️ Note: The AWS SDK for JavaScript (v2) is in maintenance mode.');
    console.log('   Consider upgrading to AWS SDK for JavaScript (v3) in the future.');
  } catch (error) {
    console.error('❌ Error initializing AWS S3 client:', error);
    s3 = null;
  }
} else {
  console.warn('⚠️ AWS S3 client not initialized - missing credentials or configuration');
  console.log('Using local upload fallback instead of S3');
}

// Function to normalize S3 keys (prevent duplicate path segments)
export const normalizeS3Key = (key) => {
  if (!key) return key;
  // Remove duplicate 'images/' segments
  return key.replace(/images\/images\//g, 'images/');
};

// Helper function to construct S3 object keys
export const getS3Key = (type, filename) => {
  // Ensure filename doesn't contain special characters
  const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  
  let key = '';
  switch (type) {
    case 'listings':
      key = `images/listings/${safeFilename}`;
      break;
    case 'listings-thumbnails':
      key = `images/listings/thumbnails/${safeFilename}`;
      break;
    case 'news':
      key = `images/news/${safeFilename}`;
      break;
    case 'news-gallery':
      key = `images/news/gallery/${safeFilename}`;
      break;
    case 'dealers':
      key = `images/dealers/${safeFilename}`;
      break;
    case 'providers':
      key = `images/providers/${safeFilename}`;
      break;
    case 'rentals':
      key = `images/rentals/${safeFilename}`;
      break;
    case 'trailers':
      key = `images/trailers/${safeFilename}`;
      break;
    case 'transport':
      key = `images/transport/${safeFilename}`;
      break;
    case 'videos':
      key = `images/videos/${safeFilename}`;
      break;
    case 'inventory':
      key = `images/inventory/${safeFilename}`;
      break;
    case 'provider-requests':
      key = `documents/provider-requests/${safeFilename}`;
      break;
    case 'ministry-requests':
      key = `documents/ministry-requests/${safeFilename}`;
      break;
    case 'avatars':
      key = `images/avatars/${safeFilename}`;
      break;
    default:
      key = `images/default/${safeFilename}`;
  }
  
  // Normalize the key to prevent duplicate segments
  return normalizeS3Key(key);
};

// Function to test S3 connection
export const testS3Connection = async () => {
  if (!s3 || !s3Config.enabled) {
    console.log('S3 is not configured, skipping connection test');
    return {
      success: false,
      message: 'S3 is not configured',
      enabled: false
    };
  }

  try {
    console.log('Testing S3 connection to AWS...');
    
    // Try the listBuckets operation - this requires minimal permissions
    const buckets = await s3.listBuckets().promise();
    
    console.log(`Found ${buckets.Buckets.length} buckets in your AWS account`);
    
    const bucketExists = buckets.Buckets.some(b => b.Name === s3Config.bucket);
    
    if (!bucketExists) {
      console.warn(`⚠️ Bucket '${s3Config.bucket}' not found in available buckets!`);
      console.warn('Available buckets:', buckets.Buckets.map(b => b.Name).join(', '));
      return {
        success: false,
        message: `Bucket '${s3Config.bucket}' not found in available buckets`,
        availableBuckets: buckets.Buckets.map(b => b.Name),
        enabled: true
      };
    }
    
    // If we get here, we've successfully connected to S3 and found the bucket
    console.log(`✅ S3 connection successful. Found bucket: ${s3Config.bucket}`);
    
    // Try a specific bucket operation to verify permissions
    try {
      await s3.getBucketLocation({ Bucket: s3Config.bucket }).promise();
      console.log(`✅ Verified permission to access bucket: ${s3Config.bucket}`);
    } catch (bucketError) {
      console.warn(`⚠️ Connected to S3 but got error accessing bucket: ${bucketError.message}`);
      // We're still returning success here since we could connect to S3
    }
    
    return {
      success: true,
      message: 'S3 connection successful',
      bucket: s3Config.bucket,
      enabled: true
    };
  } catch (error) {
    console.error('❌ S3 connection test failed:', error);
    
    // Provide more helpful error messages based on common S3 errors
    let errorMessage = `S3 connection failed: ${error.message}`;
    let errorDetails = {};
    
    if (error.code === 'InvalidAccessKeyId') {
      errorMessage = 'The AWS Access Key ID you provided does not exist in our records.';
      errorDetails.troubleshooting = 'Check your AWS_ACCESS_KEY_ID for accuracy or create a new one in AWS IAM console.';
    } else if (error.code === 'SignatureDoesNotMatch') {
      errorMessage = 'The request signature we calculated does not match the signature you provided.';
      errorDetails.troubleshooting = 'Check your AWS_SECRET_ACCESS_KEY for accuracy.';
    } else if (error.code === 'NetworkingError') {
      errorMessage = 'Network error occurred while connecting to AWS S3.';
      errorDetails.troubleshooting = 'Check your internet connection and firewall settings.';
    }
    
    return {
      success: false,
      message: errorMessage,
      error: error.code || error.message,
      details: errorDetails,
      enabled: true
    };
  }
};

// Function to check if S3 is properly configured
export const isS3Configured = () => {
  return {
    hasCredentials,
    hasBucket,
    hasRegion,
    clientInitialized: s3 !== null,
    enabled: s3Config.enabled
  };
};

// Export S3 instance
export { s3 };

console.log('===== S3 MODULE LOADED =====\n');