// server/config/awsConfig.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Hard-coded fallback credentials for development - will be overridden by environment variables if they exist
const FALLBACK_CREDENTIALS = {
  accessKeyId: 'AKIA...', // Your actual key (for dev only)
  secretAccessKey: 'your-secret-here', // Your actual secret (for dev only)
  region: 'us-east-1',
  bucket: 'i3wcarculture-images'
};

/**
 * Directly access AWS credentials from multiple sources to ensure they're found
 */
export const getAwsCredentials = () => {
  console.log('🔑 Getting AWS credentials directly...');
  
  // Check for environment variables first
  const envCredentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1',
    bucket: process.env.AWS_S3_BUCKET
  };
  
  // Log what we found without exposing secrets
  console.log('FROM ENV:');
  console.log('AWS_ACCESS_KEY_ID:', envCredentials.accessKeyId ? `Present (starts with ${envCredentials.accessKeyId.substring(0, 4)}...)` : 'Missing');
  console.log('AWS_SECRET_ACCESS_KEY:', envCredentials.secretAccessKey ? `Present (length: ${envCredentials.secretAccessKey.length})` : 'Missing');
  console.log('AWS_REGION:', envCredentials.region || 'Missing');
  console.log('AWS_S3_BUCKET:', envCredentials.bucket || 'Missing');
  
  // If environment variables are present, use them
  if (envCredentials.accessKeyId && envCredentials.secretAccessKey) {
    console.log('✅ Using AWS credentials from environment variables');
    return envCredentials;
  }
  
  // Try .env file as a fallback
  try {
    const envPath = path.join(__dirname, '../../.env');
    if (fs.existsSync(envPath)) {
      console.log(`🔍 Found .env file at ${envPath}, parsing directly...`);
      const envContent = fs.readFileSync(envPath, 'utf8');
      const envLines = envContent.split('\n');
      
      const envVars = {};
      envLines.forEach(line => {
        // Skip comments and empty lines
        if (line.trim().startsWith('#') || !line.trim()) return;
        
        // Parse key-value pairs
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^['"]|['"]$/g, ''); // Remove quotes
          envVars[key] = value;
        }
      });
      
      // Extract AWS credentials from parsed env file
      const fileCredentials = {
        accessKeyId: envVars.AWS_ACCESS_KEY_ID,
        secretAccessKey: envVars.AWS_SECRET_ACCESS_KEY,
        region: envVars.AWS_REGION || 'us-east-1',
        bucket: envVars.AWS_S3_BUCKET
      };
      
      console.log('FROM .ENV FILE:');
      console.log('AWS_ACCESS_KEY_ID:', fileCredentials.accessKeyId ? `Present (starts with ${fileCredentials.accessKeyId.substring(0, 4)}...)` : 'Missing');
      console.log('AWS_SECRET_ACCESS_KEY:', fileCredentials.secretAccessKey ? `Present (length: ${fileCredentials.secretAccessKey.length})` : 'Missing');
      console.log('AWS_REGION:', fileCredentials.region || 'Missing');
      console.log('AWS_S3_BUCKET:', fileCredentials.bucket || 'Missing');
      
      if (fileCredentials.accessKeyId && fileCredentials.secretAccessKey) {
        console.log('✅ Using AWS credentials from .env file');
        
        // Set environment variables for future use
        process.env.AWS_ACCESS_KEY_ID = fileCredentials.accessKeyId;
        process.env.AWS_SECRET_ACCESS_KEY = fileCredentials.secretAccessKey;
        process.env.AWS_REGION = fileCredentials.region;
        process.env.AWS_S3_BUCKET = fileCredentials.bucket;
        
        return fileCredentials;
      }
    }
  } catch (error) {
    console.error('❌ Error reading .env file:', error.message);
  }
  
  // Last resort: use hardcoded fallback credentials (for development only)
  console.log('⚠️ Using fallback AWS credentials (for development only)');
  
  // Set environment variables using fallbacks
  process.env.AWS_ACCESS_KEY_ID = FALLBACK_CREDENTIALS.accessKeyId;
  process.env.AWS_SECRET_ACCESS_KEY = FALLBACK_CREDENTIALS.secretAccessKey;
  process.env.AWS_REGION = FALLBACK_CREDENTIALS.region;
  process.env.AWS_S3_BUCKET = FALLBACK_CREDENTIALS.bucket;
  
  return FALLBACK_CREDENTIALS;
};

export default getAwsCredentials;
