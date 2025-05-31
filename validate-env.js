// server/validate-env.js
import { loadEnvironment } from './utils/envLoader.js';

// Load env vars directly
const env = loadEnvironment();

// Required environment variables for production
const requiredVars = [
  { name: 'NODE_ENV', value: process.env.NODE_ENV },
  { name: 'PORT', value: process.env.PORT },
  { name: 'MONGODB_URI', value: process.env.MONGODB_URI },
  { name: 'MONGODB_NAME', value: process.env.MONGODB_NAME },
  { name: 'JWT_SECRET', value: process.env.JWT_SECRET },
  { name: 'AWS_ACCESS_KEY_ID', value: env.accessKeyId },
  { name: 'AWS_SECRET_ACCESS_KEY', value: env.secretAccessKey },
  { name: 'AWS_REGION', value: env.region },
  { name: 'AWS_S3_BUCKET', value: env.bucket }
];

console.log('Validating environment variables for production...');
let allValid = true;

requiredVars.forEach(variable => {
  if (!variable.value) {
    console.error(`❌ Missing required environment variable: ${variable.name}`);
    allValid = false;
  } else {
    console.log(`✅ ${variable.name} is set`);
  }
});

if (allValid) {
  console.log('\n✅ All required environment variables are set.');
  console.log('The application is ready for production deployment!');
} else {
  console.error('\n❌ Some required environment variables are missing.');
  console.error('Please set them before deploying to production.');
  process.exit(1);
}
