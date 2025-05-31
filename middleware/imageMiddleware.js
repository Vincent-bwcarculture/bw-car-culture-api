// server/middleware/imageMiddleware.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { s3Config } from '../config/s3.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Only serve static images (placeholders, logos) locally
export const imageMiddleware = express.static(path.join(__dirname, '../public/images'), {
  maxAge: '1d',
  fallthrough: true
});

// Add error handling for missing images
export const imageErrorHandler = (err, req, res, next) => {
  if (err.statusCode === 404) {
    // Serve a default placeholder image for 404s
    res.sendFile(path.join(__dirname, '../public/images/placeholders/default.jpg'));
  } else {
    next(err);
  }
};

// S3 proxy middleware (optional - use if you want to add an additional caching layer)
export const s3ProxyMiddleware = async (req, res, next) => {
  try {
    // Extract S3 key from request
    const s3Key = req.path.replace(/^\/s3\//, '');
    
    if (!s3Key) {
      return res.status(400).json({ error: 'No S3 key provided' });
    }
    
    // Construct S3 URL
    const s3Url = `${s3Config.baseUrl}/${s3Key}`;
    
    // Proxy the request to S3
    const response = await fetch(s3Url);
    
    if (!response.ok) {
      return res.status(response.status).json({ error: 'S3 object not found' });
    }
    
    // Set appropriate headers
    res.setHeader('Content-Type', response.headers.get('content-type'));
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year cache
    res.setHeader('ETag', response.headers.get('etag'));
    
    // Stream the response
    response.body.pipe(res);
  } catch (error) {
    console.error('S3 proxy error:', error);
    res.status(500).json({ error: 'Failed to fetch from S3' });
  }
};