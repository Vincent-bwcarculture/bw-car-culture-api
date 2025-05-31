// server/utils/envLoader.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Loads environment variables from .env file and returns AWS credentials
 * This ensures consistent loading across different scripts
 */
export function loadEnvironment() {
  // Try multiple possible paths for .env file
  const possiblePaths = [
    path.join(__dirname, '../../.env'),
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
  
  // Important: force direct access to process.env to get latest values
  // This avoids caching issues
  return {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1',
    bucket: process.env.AWS_S3_BUCKET || 'i3wcarculture-images'
  };
}

/**
 * Checks if AWS credentials are valid and complete
 */
export function hasValidAWSCredentials() {
  const creds = loadEnvironment();
  return !!(creds.accessKeyId && creds.secretAccessKey && 
           creds.region && creds.bucket);
}
