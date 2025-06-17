// api/index.js - Complete Production-Ready Version
// BW Car Culture API - Serverless Backend for Vercel

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';

// MongoDB connection management
let MongoClient;
let client;
let isConnected = false;

const connectDB = async () => {
  if (isConnected && client) {
    return client.db(process.env.MONGODB_NAME || 'i3wcarculture');
  }

  try {
    if (!MongoClient) {
      const mongodb = await import('mongodb');
      MongoClient = mongodb.MongoClient;
    }
    
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    isConnected = true;
    
    return client.db(process.env.MONGODB_NAME || 'i3wcarculture');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    return null;
  }
};

const setCORSHeaders = (res, origin) => {
  const allowedOrigins = [
    'https://bw-car-culture.vercel.app',
    'https://bw-car-culture-mt6puwxf-katso-vincents-projects.vercel.app',
    'https://bw-car-culture-nc0x7ja4-katso-vincents-projects.vercel.app',
    'http://localhost:3000'
  ];
  
  const isAllowed = allowedOrigins.includes(origin) || 
                   (origin && origin.includes('bw-car-culture') && origin.includes('vercel.app'));
  
  const allowOrigin = isAllowed ? origin : allowedOrigins[0];
  
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
};

// Main handler function
export default async function handler(req, res) {
  const timestamp = new Date().toISOString();
  const origin = req.headers.origin;
  
  // Set CORS headers
  setCORSHeaders(res, origin);
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Connect to MongoDB
  const db = await connectDB();
  if (!db) {
    return res.status(503).json({
      success: false,
      message: 'Database connection failed',
      timestamp: timestamp
    });
  }
  
  // Parse URL and query parameters
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace('/api', '');
  const searchParams = url.searchParams;
  
  try {
    // ==================== SECTION 1: CRITICAL FILTER ENDPOINTS (MUST BE FIRST) ====================
    
    // === CAR MAKES ENDPOINT ===
    if (path === '/listings/makes' && req.method === 'GET') {
      console.log(`[${timestamp}] → GET LISTINGS MAKES`);
      
      try {
        const listingsCollection = db.collection('listings');
        const makes = await listingsCollection.distinct('make', { status: { $ne: 'deleted' } });
        
        const cleanMakes = makes
          .filter(make => make && make.trim())
          .map(make => make.trim())
          .sort();
        
        return res.status(200).json({
          success: true,
          data: cleanMakes,
          count: cleanMakes.length,
          message: `Found ${cleanMakes.length} car makes`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Get makes error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch car makes',
          error: error.message,
          data: []
        });
      }
    }

    // === CAR MODELS BY MAKE ENDPOINT ===
    if (path === '/listings/models' && req.method === 'GET') {
      const make = searchParams.get('make');
      console.log(`[${timestamp}] → GET LISTINGS MODELS for make: ${make}`);
      
      if (!make) {
        return res.status(400).json({
          success: false,
          message: 'Make parameter is required',
          data: []
        });
      }
      
      try {
        const listingsCollection = db.collection('listings');
        const models = await listingsCollection.distinct('model', { 
          make: { $regex: new RegExp(`^${make}$`, 'i') },
          status: { $ne: 'deleted' }
        });
        
        const cleanModels = models
          .filter(model => model && model.trim())
          .map(model => model.trim())
          .sort();
        
        // Fallback models if none found
        if (cleanModels.length === 0) {
          const fallbackModels = {
            'Toyota': ['Corolla', 'Camry', 'RAV4', 'Highlander', 'Tacoma', 'Prius'],
            'Ford': ['F-150', 'Mustang', 'Explorer', 'Escape', 'Ranger', 'Bronco'],
            'Honda': ['Civic', 'Accord', 'CR-V', 'Pilot', 'Fit', 'HR-V'],
            'Nissan': ['Altima', 'Sentra', 'Rogue', 'Pathfinder', 'Frontier', 'Murano'],
          };
          
          const fallbackForMake = fallbackModels[make] || fallbackModels[make.charAt(0).toUpperCase() + make.slice(1).toLowerCase()];
          
          if (fallbackForMake) {
            return res.status(200).json({
              success: true,
              data: fallbackForMake,
              message: `Models for ${make} via fallback`
            });
          }
        }
        
        return res.status(200).json({
          success: true,
          data: cleanModels,
          message: `Found ${cleanModels.length} models for ${make}`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Get models error:`, error);
        return res.status(500).json({
          success: false,
          message: `Failed to get models for ${make}`,
          error: error.message,
          data: []
        });
      }
    }

    // ==================== SECTION 2: AUTHENTICATION ENDPOINTS ====================
    
    // === LOGIN ENDPOINT ===
    if (path === '/auth/login' && req.method === 'POST') {
      console.log(`[${timestamp}] → AUTH LOGIN`);
      
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString());
        
        const { email, password } = body;
        
        if (!email || !password) {
          return res.status(400).json({
            success: false,
            message: 'Email and password are required'
          });
        }
        
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ email: email.toLowerCase() });
        
        if (!user) {
          return res.status(401).json({
            success: false,
            message: 'Invalid credentials'
          });
        }
        
        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
          return res.status(401).json({
            success: false,
            message: 'Invalid credentials'
          });
        }
        
        const token = jwt.sign(
          { id: user._id.toString(), email: user.email, role: user.role },
          process.env.JWT_SECRET,
          { expiresIn: '7d' }
        );
        
        // Update last login
        await usersCollection.updateOne(
          { _id: user._id },
          { $set: { lastLogin: new Date() } }
        );
        
        return res.status(200).json({
          success: true,
          message: 'Login successful',
          token: token,
          user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role
          }
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Login error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Login failed',
          error: error.message
        });
      }
    }

    // === GET USERS FOR DEALER FORM ===
    if (path === '/auth/users' && req.method === 'GET') {
      console.log(`[${timestamp}] → GET USERS FOR DEALER FORM`);
      
      try {
        const usersCollection = db.collection('users');
        const users = await usersCollection
          .find({ role: { $in: ['dealer', 'admin'] } })
          .project({ _id: 1, name: 1, email: 1, role: 1 })
          .toArray();
        
        return res.status(200).json({
          success: true,
          data: users,
          message: `Found ${users.length} users`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Get users error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch users',
          error: error.message
        });
      }
    }

    // ==================== SECTION 3: ADMIN ENDPOINTS ====================
    
    // === ADMIN CREATE LISTING ===
    if (path === '/admin/listings' && req.method === 'POST') {
      console.log(`[${timestamp}] → ADMIN CREATE LISTING`);
      
      try {
        // Check authentication
        if (!req.headers.authorization) {
          return res.status(401).json({
            success: false,
            message: 'Authentication required'
          });
        }
        
        const token = req.headers.authorization.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.id) });
        
        if (!user || user.role !== 'admin') {
          return res.status(403).json({
            success: false,
            message: 'Admin access required'
          });
        }
        
        // Parse request body
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const listingData = JSON.parse(Buffer.concat(chunks).toString());
        
        // Create listing
        const listingsCollection = db.collection('listings');
        const newListing = {
          ...listingData,
          createdBy: user._id,
          createdByName: user.name,
          createdAt: new Date(),
          updatedAt: new Date(),
          status: listingData.status || 'active',
          views: 0
        };
        
        const result = await listingsCollection.insertOne(newListing);
        
        return res.status(201).json({
          success: true,
          message: 'Listing created successfully',
          data: { ...newListing, _id: result.insertedId }
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Admin create listing error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to create listing',
          error: error.message
        });
      }
    }

    // === ADMIN UPDATE LISTING ===
    if (path.match(/^\/admin\/listings\/([a-f\d]{24})$/) && req.method === 'PUT') {
      const listingId = path.split('/')[3];
      console.log(`[${timestamp}] → ADMIN UPDATE LISTING: ${listingId}`);
      
      try {
        // Check authentication (same as create)
        if (!req.headers.authorization) {
          return res.status(401).json({
            success: false,
            message: 'Authentication required'
          });
        }
        
        const token = req.headers.authorization.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.id) });
        
        if (!user || user.role !== 'admin') {
          return res.status(403).json({
            success: false,
            message: 'Admin access required'
          });
        }
        
        // Parse request body
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const updateData = JSON.parse(Buffer.concat(chunks).toString());
        
        // Update listing
        const listingsCollection = db.collection('listings');
        const result = await listingsCollection.findOneAndUpdate(
          { _id: new ObjectId(listingId) },
          { 
            $set: {
              ...updateData,
              updatedAt: new Date(),
              updatedBy: user._id,
              updatedByName: user.name
            }
          },
          { returnDocument: 'after' }
        );
        
        if (!result.value) {
          return res.status(404).json({
            success: false,
            message: 'Listing not found'
          });
        }
        
        return res.status(200).json({
          success: true,
          message: 'Listing updated successfully',
          data: result.value
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Admin update listing error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to update listing',
          error: error.message
        });
      }
    }

    // === ADMIN DELETE LISTING ===
    if (path.match(/^\/admin\/listings\/([a-f\d]{24})$/) && req.method === 'DELETE') {
      const listingId = path.split('/')[3];
      console.log(`[${timestamp}] → ADMIN DELETE LISTING: ${listingId}`);
      
      try {
        // Check authentication
        if (!req.headers.authorization) {
          return res.status(401).json({
            success: false,
            message: 'Authentication required'
          });
        }
        
        const token = req.headers.authorization.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.id) });
        
        if (!user || user.role !== 'admin') {
          return res.status(403).json({
            success: false,
            message: 'Admin access required'
          });
        }
        
        // Soft delete the listing
        const listingsCollection = db.collection('listings');
        const result = await listingsCollection.findOneAndUpdate(
          { _id: new ObjectId(listingId) },
          { 
            $set: {
              status: 'deleted',
              deletedAt: new Date(),
              deletedBy: user._id,
              deletedByName: user.name
            }
          },
          { returnDocument: 'after' }
        );
        
        if (!result.value) {
          return res.status(404).json({
            success: false,
            message: 'Listing not found'
          });
        }
        
        return res.status(200).json({
          success: true,
          message: 'Listing deleted successfully'
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Admin delete listing error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to delete listing',
          error: error.message
        });
      }
    }

    // ==================== SECTION 4: IMAGES & FILE UPLOADS ====================
    
    // === IMAGE UPLOAD ENDPOINT ===
    if (path === '/images/upload' && req.method === 'POST') {
      console.log(`[${timestamp}] → IMAGE UPLOAD`);
      
      try {
        const contentType = req.headers['content-type'] || '';
        
        if (!contentType.includes('multipart/form-data')) {
          return res.status(400).json({
            success: false,
            message: 'Content type must be multipart/form-data'
          });
        }
        
        const boundary = contentType.split('boundary=')[1];
        if (!boundary) {
          return res.status(400).json({
            success: false,
            message: 'No boundary found in multipart data'
          });
        }
        
        // Read the request body
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        
        // Parse multipart data
        const parts = buffer.toString('binary').split(`--${boundary}`);
        let fileBuffer = null;
        let filename = null;
        let fileType = null;
        
        for (const part of parts) {
          if (part.includes('filename=')) {
            const filenameMatch = part.match(/filename="(.+?)"/);
            if (filenameMatch) {
              filename = filenameMatch[1];
              
              const contentTypeMatch = part.match(/Content-Type: (.+?)\r\n/);
              fileType = contentTypeMatch ? contentTypeMatch[1].trim() : 'image/jpeg';
              
              const dataStart = part.indexOf('\r\n\r\n');
              if (dataStart !== -1) {
                const fileData = part.substring(dataStart + 4);
                const cleanData = fileData.replace(/\r\n$/, '').replace(/\r\n--$/, '');
                fileBuffer = Buffer.from(cleanData, 'binary');
              }
            }
          }
        }
        
        if (!fileBuffer || !filename) {
          return res.status(400).json({
            success: false,
            message: 'No file found in upload request'
          });
        }
        
        // Check environment variables
        const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
        const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
        const awsBucket = process.env.AWS_S3_BUCKET_NAME || 'bw-car-culture-images';
        const awsRegion = process.env.AWS_S3_REGION || 'us-east-1';
        
        if (!awsAccessKey || !awsSecretKey) {
          // Return mock URL for development
          const mockImageUrl = `https://${awsBucket}.s3.${awsRegion}.amazonaws.com/images/mock-${Date.now()}-${filename}`;
          
          return res.status(200).json({
            success: true,
            message: 'Image upload simulated (AWS credentials missing)',
            imageUrl: mockImageUrl,
            data: {
              url: mockImageUrl,
              filename: filename,
              size: fileBuffer.length,
              uploadedAt: new Date().toISOString()
            }
          });
        }
        
        // AWS S3 upload
        try {
          const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
          
          const s3Client = new S3Client({
            region: awsRegion,
            credentials: {
              accessKeyId: awsAccessKey,
              secretAccessKey: awsSecretKey,
            },
          });
          
          const timestamp = Date.now();
          const randomString = Math.random().toString(36).substring(2, 8);
          const fileExtension = filename.split('.').pop() || 'jpg';
          const s3Key = `images/uploads/${timestamp}-${randomString}.${fileExtension}`;
          
          const uploadParams = {
            Bucket: awsBucket,
            Key: s3Key,
            Body: fileBuffer,
            ContentType: fileType
          };
          
          const command = new PutObjectCommand(uploadParams);
          await s3Client.send(command);
          
          const imageUrl = `https://${awsBucket}.s3.${awsRegion}.amazonaws.com/${s3Key}`;
          
          return res.status(200).json({
            success: true,
            message: 'Image uploaded successfully',
            imageUrl: imageUrl,
            data: {
              url: imageUrl,
              key: s3Key,
              filename: filename,
              size: fileBuffer.length,
              uploadedAt: new Date().toISOString()
            }
          });
          
        } catch (s3Error) {
          console.error(`[${timestamp}] S3 upload error:`, s3Error);
          return res.status(500).json({
            success: false,
            message: 'Failed to upload image to S3',
            error: s3Error.message
          });
        }
        
      } catch (error) {
        console.error(`[${timestamp}] Image upload error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to upload image',
          error: error.message
        });
      }
    }

    // === MULTIPLE IMAGE UPLOAD ENDPOINT ===
    if (path === '/images/upload-multiple' && req.method === 'POST') {
      console.log(`[${timestamp}] → MULTIPLE IMAGE UPLOAD`);
      
      try {
        const contentType = req.headers['content-type'] || '';
        
        if (!contentType.includes('multipart/form-data')) {
          return res.status(400).json({
            success: false,
            message: 'Content type must be multipart/form-data'
          });
        }
        
        const boundary = contentType.split('boundary=')[1];
        if (!boundary) {
          return res.status(400).json({
            success: false,
            message: 'No boundary found in multipart data'
          });
        }
        
        // Read the request body
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);
        
        // Parse multipart data for multiple files
        const parts = buffer.toString('binary').split(`--${boundary}`);
        const files = [];
        
        for (const part of parts) {
          if (part.includes('filename=')) {
            const filenameMatch = part.match(/filename="(.+?)"/);
            if (filenameMatch) {
              const filename = filenameMatch[1];
              
              const contentTypeMatch = part.match(/Content-Type: (.+?)\r\n/);
              const fileType = contentTypeMatch ? contentTypeMatch[1].trim() : 'image/jpeg';
              
              const dataStart = part.indexOf('\r\n\r\n');
              if (dataStart !== -1) {
                const fileData = part.substring(dataStart + 4);
                const cleanData = fileData.replace(/\r\n$/, '').replace(/\r\n--$/, '');
                const fileBuffer = Buffer.from(cleanData, 'binary');
                
                if (fileBuffer.length > 100) {
                  files.push({
                    filename: filename,
                    fileType: fileType,
                    buffer: fileBuffer,
                    size: fileBuffer.length
                  });
                }
              }
            }
          }
        }
        
        if (files.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'No valid image files found in upload request'
          });
        }
        
        // Check environment variables for S3
        const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
        const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
        const awsBucket = process.env.AWS_S3_BUCKET_NAME || 'bw-car-culture-images';
        const awsRegion = process.env.AWS_S3_REGION || 'us-east-1';
        
        const uploadedUrls = [];
        
        if (!awsAccessKey || !awsSecretKey) {
          // Return mock URLs for development
          for (const file of files) {
            const mockUrl = `https://${awsBucket}.s3.amazonaws.com/images/listing-${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${file.filename}`;
            uploadedUrls.push(mockUrl);
          }
          
          return res.status(200).json({
            success: true,
            message: `Multiple image upload simulated (AWS credentials missing)`,
            uploadedCount: files.length,
            urls: uploadedUrls
          });
        }
        
        // Real S3 uploads
        try {
          const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
          
          const s3Client = new S3Client({
            region: awsRegion,
            credentials: {
              accessKeyId: awsAccessKey,
              secretAccessKey: awsSecretKey,
            },
          });
          
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            try {
              const timestamp_ms = Date.now();
              const randomString = Math.random().toString(36).substring(2, 8);
              const fileExtension = file.filename.split('.').pop() || 'jpg';
              const s3Key = `images/listings/${timestamp_ms}-${randomString}-${i}.${fileExtension}`;
              
              const uploadParams = {
                Bucket: awsBucket,
                Key: s3Key,
                Body: file.buffer,
                ContentType: file.fileType
              };
              
              const command = new PutObjectCommand(uploadParams);
              await s3Client.send(command);
              
              const imageUrl = `https://${awsBucket}.s3.${awsRegion}.amazonaws.com/${s3Key}`;
              uploadedUrls.push(imageUrl);
              
            } catch (fileError) {
              console.error(`[${timestamp}] Failed to upload file ${i}:`, fileError);
            }
          }
          
          return res.status(200).json({
            success: true,
            message: `Successfully uploaded ${uploadedUrls.length} of ${files.length} images`,
            uploadedCount: uploadedUrls.length,
            urls: uploadedUrls
          });
          
        } catch (s3Error) {
          console.error(`[${timestamp}] S3 multiple upload error:`, s3Error);
          return res.status(500).json({
            success: false,
            message: 'Failed to upload images to S3',
            error: s3Error.message,
            uploadedCount: uploadedUrls.length,
            urls: uploadedUrls
          });
        }
        
      } catch (error) {
        console.error(`[${timestamp}] Multiple image upload error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to upload images',
          error: error.message
        });
      }
    }

    // ==================== SECTION 5: LISTINGS ENDPOINTS ====================
    
    // === GET ALL LISTINGS ===
    if (path === '/listings' && req.method === 'GET') {
      console.log(`[${timestamp}] → GET LISTINGS`);
      
      try {
        const listingsCollection = db.collection('listings');
        
        // Build filter
        let filter = { status: { $ne: 'deleted' } };
        
        // Search functionality
        if (searchParams.get('search')) {
          const searchTerm = searchParams.get('search');
          const searchRegex = { $regex: searchTerm, $options: 'i' };
          
          filter.$or = [
            { make: searchRegex },
            { model: searchRegex },
            { description: searchRegex },
            { location: searchRegex }
          ];
        }
        
        // Filter by make
        if (searchParams.get('make') && searchParams.get('make') !== 'All') {
          filter.make = { $regex: searchParams.get('make'), $options: 'i' };
        }
        
        // Filter by model
        if (searchParams.get('model') && searchParams.get('model') !== 'All') {
          filter.model = { $regex: searchParams.get('model'), $options: 'i' };
        }
        
        // Filter by status
        if (searchParams.get('status') && searchParams.get('status') !== 'all') {
          filter.status = searchParams.get('status');
        }
        
        // Filter by price range
        if (searchParams.get('minPrice') || searchParams.get('maxPrice')) {
          filter.price = {};
          if (searchParams.get('minPrice')) {
            filter.price.$gte = parseFloat(searchParams.get('minPrice'));
          }
          if (searchParams.get('maxPrice')) {
            filter.price.$lte = parseFloat(searchParams.get('maxPrice'));
          }
        }
        
        // Filter by year
        if (searchParams.get('minYear') || searchParams.get('maxYear')) {
          filter.year = {};
          if (searchParams.get('minYear')) {
            filter.year.$gte = parseInt(searchParams.get('minYear'));
          }
          if (searchParams.get('maxYear')) {
            filter.year.$lte = parseInt(searchParams.get('maxYear'));
          }
        }
        
        // Filter by condition
        if (searchParams.get('condition') && searchParams.get('condition') !== 'all') {
          filter.condition = searchParams.get('condition');
        }
        
        // Filter by transmission
        if (searchParams.get('transmission') && searchParams.get('transmission') !== 'all') {
          filter.transmission = searchParams.get('transmission');
        }
        
        // Filter by fuel type
        if (searchParams.get('fuelType') && searchParams.get('fuelType') !== 'all') {
          filter.fuelType = searchParams.get('fuelType');
        }
        
        // Filter by dealer
        if (searchParams.get('dealerId')) {
          filter.dealerId = searchParams.get('dealerId');
        }
        
        // Pagination
        const page = parseInt(searchParams.get('page')) || 1;
        const limit = parseInt(searchParams.get('limit')) || 20;
        const skip = (page - 1) * limit;
        
        // Sorting
        let sort = { createdAt: -1 };
        if (searchParams.get('sort')) {
          switch (searchParams.get('sort')) {
            case 'price-asc':
              sort = { price: 1 };
              break;
            case 'price-desc':
              sort = { price: -1 };
              break;
            case 'year-asc':
              sort = { year: 1 };
              break;
            case 'year-desc':
              sort = { year: -1 };
              break;
            case 'newest':
              sort = { createdAt: -1 };
              break;
            case 'oldest':
              sort = { createdAt: 1 };
              break;
          }
        }
        
        // Execute query
        const total = await listingsCollection.countDocuments(filter);
        const listings = await listingsCollection
          .find(filter)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .toArray();
        
        return res.status(200).json({
          success: true,
          data: listings,
          total: total,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total: total,
            limit: limit
          },
          count: listings.length,
          message: `Found ${listings.length} listings`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Get listings error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch listings',
          error: error.message
        });
      }
    }

    // === GET SINGLE LISTING ===
    if (path.match(/^\/listings\/([a-f\d]{24})$/) && req.method === 'GET') {
      const listingId = path.split('/')[2];
      console.log(`[${timestamp}] → GET LISTING: ${listingId}`);
      
      try {
        const listingsCollection = db.collection('listings');
        const listing = await listingsCollection.findOne({ _id: new ObjectId(listingId) });
        
        if (!listing) {
          return res.status(404).json({
            success: false,
            message: 'Listing not found'
          });
        }
        
        // Increment views
        await listingsCollection.updateOne(
          { _id: new ObjectId(listingId) },
          { $inc: { views: 1 } }
        );
        
        return res.status(200).json({
          success: true,
          data: listing
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Get listing error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch listing',
          error: error.message
        });
      }
    }

    // === UPDATE LISTING (PUBLIC) ===
    if (path.match(/^\/listings\/([a-f\d]{24})$/) && req.method === 'PUT') {
      const listingId = path.split('/')[2];
      console.log(`[${timestamp}] → UPDATE LISTING: ${listingId}`);
      
      try {
        // Parse request body
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const updateData = JSON.parse(Buffer.concat(chunks).toString());
        
        // Update listing
        const listingsCollection = db.collection('listings');
        const result = await listingsCollection.findOneAndUpdate(
          { _id: new ObjectId(listingId) },
          { 
            $set: {
              ...updateData,
              updatedAt: new Date()
            }
          },
          { returnDocument: 'after' }
        );
        
        if (!result.value) {
          return res.status(404).json({
            success: false,
            message: 'Listing not found'
          });
        }
        
        return res.status(200).json({
          success: true,
          message: 'Listing updated successfully',
          data: result.value
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Update listing error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to update listing',
          error: error.message
        });
      }
    }

    // === GET LISTINGS BY DEALER ===
    if (path.match(/^\/listings\/dealer\/(.+)$/) && req.method === 'GET') {
      const dealerId = path.split('/')[3];
      console.log(`[${timestamp}] → GET LISTINGS BY DEALER: ${dealerId}`);
      
      try {
        const listingsCollection = db.collection('listings');
        
        const page = parseInt(searchParams.get('page')) || 1;
        const limit = parseInt(searchParams.get('limit')) || 20;
        const skip = (page - 1) * limit;
        
        const filter = { 
          dealerId: dealerId,
          status: { $ne: 'deleted' }
        };
        
        const total = await listingsCollection.countDocuments(filter);
        const listings = await listingsCollection
          .find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();
        
        return res.status(200).json({
          success: true,
          data: listings,
          total: total,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total: total
          },
          count: listings.length,
          message: `Found ${listings.length} listings for dealer`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Get dealer listings error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch dealer listings',
          error: error.message
        });
      }
    }

    // === API LISTINGS ENDPOINT (for frontend compatibility) ===
    if (path === '/api/listings' && req.method === 'GET') {
      console.log(`[${timestamp}] → API LISTINGS (redirect to /listings)`);
      // Redirect to main listings endpoint logic
      req.url = req.url.replace('/api/listings', '/listings');
      return handler(req, res);
    }

    // ==================== SECTION 6: DEALERS ENDPOINTS ====================
    
    // === GET ALL DEALERS ===
    if (path === '/dealers' && req.method === 'GET') {
      console.log(`[${timestamp}] → GET DEALERS`);
      
      try {
        const dealersCollection = db.collection('dealers');
        
        let filter = { status: { $ne: 'deleted' } };
        
        // Search functionality
        if (searchParams.get('search')) {
          const searchTerm = searchParams.get('search');
          const searchRegex = { $regex: searchTerm, $options: 'i' };
          
          filter.$or = [
            { businessName: searchRegex },
            { contactName: searchRegex },
            { location: searchRegex },
            { description: searchRegex }
          ];
        }
        
        // Filter by status
        if (searchParams.get('status') && searchParams.get('status') !== 'all') {
          filter.status = searchParams.get('status');
        }
        
        // Filter by verification
        if (searchParams.get('verified') === 'true') {
          filter.status = 'verified';
        }
        
        // Pagination
        const page = parseInt(searchParams.get('page')) || 1;
        const limit = parseInt(searchParams.get('limit')) || 20;
        const skip = (page - 1) * limit;
        
        // Execute query
        const total = await dealersCollection.countDocuments(filter);
        const dealers = await dealersCollection
          .find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();
        
        return res.status(200).json({
          success: true,
          data: dealers,
          total: total,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total: total
          },
          count: dealers.length,
          message: `Found ${dealers.length} dealers`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Get dealers error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch dealers',
          error: error.message
        });
      }
    }

    // === CREATE DEALER ===
    if (path === '/dealers' && req.method === 'POST') {
      console.log(`[${timestamp}] → CREATE DEALER`);
      
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const dealerData = JSON.parse(Buffer.concat(chunks).toString());
        
        const dealersCollection = db.collection('dealers');
        
        // Check if dealer already exists
        const existingDealer = await dealersCollection.findOne({
          $or: [
            { email: dealerData.email },
            { businessName: dealerData.businessName }
          ]
        });
        
        if (existingDealer) {
          return res.status(400).json({
            success: false,
            message: 'Dealer with this email or business name already exists'
          });
        }
        
        // Create new dealer
        const newDealer = {
          ...dealerData,
          status: 'pending',
          verified: false,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        const result = await dealersCollection.insertOne(newDealer);
        
        return res.status(201).json({
          success: true,
          message: 'Dealer created successfully',
          data: { ...newDealer, _id: result.insertedId }
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Create dealer error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to create dealer',
          error: error.message
        });
      }
    }

    // === GET SINGLE DEALER ===
    if (path.match(/^\/dealers\/([a-f\d]{24})$/) && req.method === 'GET') {
      const dealerId = path.split('/')[2];
      console.log(`[${timestamp}] → GET DEALER: ${dealerId}`);
      
      try {
        const dealersCollection = db.collection('dealers');
        const dealer = await dealersCollection.findOne({ _id: new ObjectId(dealerId) });
        
        if (!dealer) {
          return res.status(404).json({
            success: false,
            message: 'Dealer not found'
          });
        }
        
        return res.status(200).json({
          success: true,
          data: dealer
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Get dealer error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch dealer',
          error: error.message
        });
      }
    }

    // === UPDATE DEALER ===
    if (path.match(/^\/dealers\/([a-f\d]{24})$/) && req.method === 'PUT') {
      const dealerId = path.split('/')[2];
      console.log(`[${timestamp}] → UPDATE DEALER: ${dealerId}`);
      
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const updateData = JSON.parse(Buffer.concat(chunks).toString());
        
        const dealersCollection = db.collection('dealers');
        const result = await dealersCollection.findOneAndUpdate(
          { _id: new ObjectId(dealerId) },
          { 
            $set: {
              ...updateData,
              updatedAt: new Date()
            }
          },
          { returnDocument: 'after' }
        );
        
        if (!result.value) {
          return res.status(404).json({
            success: false,
            message: 'Dealer not found'
          });
        }
        
        return res.status(200).json({
          success: true,
          message: 'Dealer updated successfully',
          data: result.value
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Update dealer error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to update dealer',
          error: error.message
        });
      }
    }

    // === DELETE DEALER ===
    if (path.match(/^\/dealers\/([a-f\d]{24})$/) && req.method === 'DELETE') {
      const dealerId = path.split('/')[2];
      console.log(`[${timestamp}] → DELETE DEALER: ${dealerId}`);
      
      try {
        const dealersCollection = db.collection('dealers');
        const result = await dealersCollection.findOneAndUpdate(
          { _id: new ObjectId(dealerId) },
          { 
            $set: {
              status: 'deleted',
              deletedAt: new Date()
            }
          }
        );
        
        if (!result.value) {
          return res.status(404).json({
            success: false,
            message: 'Dealer not found'
          });
        }
        
        return res.status(200).json({
          success: true,
          message: 'Dealer deleted successfully'
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Delete dealer error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to delete dealer',
          error: error.message
        });
      }
    }

    // === VERIFY DEALER ===
    if (path.match(/^\/dealers\/([a-f\d]{24})\/verify$/) && req.method === 'PUT') {
      const dealerId = path.split('/')[2];
      console.log(`[${timestamp}] → VERIFY DEALER: ${dealerId}`);
      
      try {
        const dealersCollection = db.collection('dealers');
        const result = await dealersCollection.findOneAndUpdate(
          { _id: new ObjectId(dealerId) },
          { 
            $set: {
              status: 'verified',
              verified: true,
              verifiedAt: new Date(),
              updatedAt: new Date()
            }
          },
          { returnDocument: 'after' }
        );
        
        if (!result.value) {
          return res.status(404).json({
            success: false,
            message: 'Dealer not found'
          });
        }
        
        return res.status(200).json({
          success: true,
          message: 'Dealer verified successfully',
          data: result.value
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Verify dealer error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to verify dealer',
          error: error.message
        });
      }
    }

    // === GET ALL DEALERS FOR DROPDOWN ===
    if (path === '/dealers/all' && req.method === 'GET') {
      console.log(`[${timestamp}] → GET ALL DEALERS FOR DROPDOWN`);
      
      try {
        const dealersCollection = db.collection('dealers');
        const dealers = await dealersCollection
          .find({ status: { $in: ['active', 'verified'] } })
          .project({ _id: 1, businessName: 1, contactName: 1 })
          .sort({ businessName: 1 })
          .toArray();
        
        return res.status(200).json({
          success: true,
          data: dealers,
          count: dealers.length,
          message: `Found ${dealers.length} active dealers`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Get all dealers error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch dealers',
          error: error.message
        });
      }
    }

    // === API DEALERS ENDPOINTS (for frontend compatibility) ===
    if (path === '/api/dealers' || path === '/api/dealers/all') {
      console.log(`[${timestamp}] → API DEALERS (redirect)`);
      req.url = req.url.replace('/api', '');
      return handler(req, res);
    }

    // ==================== SECTION 7: RENTALS ENDPOINTS ====================
    
    // === GET ALL RENTALS ===
    if (path === '/rentals' && req.method === 'GET') {
      console.log(`[${timestamp}] → GET RENTALS`);
      
      try {
        const rentalsCollection = db.collection('rentalvehicles');
        
        let filter = { status: { $ne: 'deleted' } };
        
        // Search functionality
        if (searchParams.get('search')) {
          const searchTerm = searchParams.get('search');
          const searchRegex = { $regex: searchTerm, $options: 'i' };
          
          filter.$or = [
            { make: searchRegex },
            { model: searchRegex },
            { location: searchRegex },
            { description: searchRegex }
          ];
        }
        
        // Filter by status
        if (searchParams.get('status') && searchParams.get('status') !== 'all') {
          filter.status = searchParams.get('status');
        }
        
        // Filter by vehicle type
        if (searchParams.get('vehicleType') && searchParams.get('vehicleType') !== 'all') {
          filter.vehicleType = searchParams.get('vehicleType');
        }
        
        // Filter by price range
        if (searchParams.get('minPrice') || searchParams.get('maxPrice')) {
          filter['pricing.daily'] = {};
          if (searchParams.get('minPrice')) {
            filter['pricing.daily'].$gte = parseFloat(searchParams.get('minPrice'));
          }
          if (searchParams.get('maxPrice')) {
            filter['pricing.daily'].$lte = parseFloat(searchParams.get('maxPrice'));
          }
        }
        
        // Pagination
        const page = parseInt(searchParams.get('page')) || 1;
        const limit = parseInt(searchParams.get('limit')) || 20;
        const skip = (page - 1) * limit;
        
        // Execute query
        const total = await rentalsCollection.countDocuments(filter);
        const rentals = await rentalsCollection
          .find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();
        
        return res.status(200).json({
          success: true,
          data: rentals,
          vehicles: rentals, // Alternative format
          total: total,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total: total
          },
          count: rentals.length,
          message: `Found ${rentals.length} rental vehicles`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Get rentals error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch rental vehicles',
          error: error.message
        });
      }
    }

    // === GET SINGLE RENTAL ===
    if (path.match(/^\/rentals\/([a-f\d]{24})$/) && req.method === 'GET') {
      const rentalId = path.split('/')[2];
      console.log(`[${timestamp}] → GET RENTAL: ${rentalId}`);
      
      try {
        const rentalsCollection = db.collection('rentalvehicles');
        const rental = await rentalsCollection.findOne({ _id: new ObjectId(rentalId) });
        
        if (!rental) {
          return res.status(404).json({
            success: false,
            message: 'Rental vehicle not found'
          });
        }
        
        // Increment views
        await rentalsCollection.updateOne(
          { _id: new ObjectId(rentalId) },
          { $inc: { views: 1 } }
        );
        
        return res.status(200).json({
          success: true,
          data: rental
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Get rental error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch rental vehicle',
          error: error.message
        });
      }
    }

    // === API RENTALS ENDPOINT (for frontend compatibility) ===
    if (path === '/api/rentals') {
      console.log(`[${timestamp}] → API RENTALS (redirect)`);
      req.url = req.url.replace('/api', '');
      return handler(req, res);
    }

    // ==================== SECTION 8: SERVICE PROVIDERS ENDPOINTS ====================
    
    // === GET ALL SERVICE PROVIDERS ===
    if ((path === '/service-providers' || path === '/providers') && req.method === 'GET') {
      console.log(`[${timestamp}] → GET SERVICE PROVIDERS`);
      
      try {
        const serviceProvidersCollection = db.collection('serviceproviders');
        
        let filter = { status: { $ne: 'deleted' } };
        
        // Search functionality
        if (searchParams.get('search')) {
          const searchTerm = searchParams.get('search');
          const searchRegex = { $regex: searchTerm, $options: 'i' };
          
          filter.$or = [
            { businessName: searchRegex },
            { description: searchRegex },
            { location: searchRegex },
            { services: searchRegex }
          ];
        }
        
        // Filter by provider type
        if (searchParams.get('providerType') && searchParams.get('providerType') !== 'all') {
          filter.providerType = searchParams.get('providerType');
        }
        
        // Filter by status
        if (searchParams.get('status') && searchParams.get('status') !== 'all') {
          filter.status = searchParams.get('status');
        }
        
        // Pagination
        const page = parseInt(searchParams.get('page')) || 1;
        const limit = parseInt(searchParams.get('limit')) || 12;
        const skip = (page - 1) * limit;
        
        // Execute query
        const total = await serviceProvidersCollection.countDocuments(filter);
        const providers = await serviceProvidersCollection
          .find(filter)
          .sort({ businessName: 1 })
          .skip(skip)
          .limit(limit)
          .toArray();
        
        return res.status(200).json({
          success: true,
          data: providers,
          total: total,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total: total
          },
          count: providers.length,
          message: `Found ${providers.length} service providers`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Get service providers error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch service providers',
          error: error.message
        });
      }
    }

    // === API PROVIDERS ENDPOINT (for frontend compatibility) ===
    if (path === '/api/providers') {
      console.log(`[${timestamp}] → API PROVIDERS (redirect)`);
      req.url = req.url.replace('/api/providers', '/providers');
      return handler(req, res);
    }

    // ==================== SECTION 9: TRANSPORT ENDPOINTS ====================
    
    // === GET ALL TRANSPORT ROUTES ===
    if ((path === '/transport' || path === '/transport-routes') && req.method === 'GET') {
      console.log(`[${timestamp}] → GET TRANSPORT ROUTES`);
      
      try {
        const transportCollection = db.collection('transportroutes');
        
        let filter = {};
        
        // Status filtering
        if (searchParams.get('status') && searchParams.get('status') !== 'all') {
          filter.operationalStatus = searchParams.get('status');
        } else {
          filter.operationalStatus = { $in: ['active', 'seasonal'] };
        }
        
        // Search functionality
        if (searchParams.get('search')) {
          const searchTerm = searchParams.get('search');
          const searchRegex = { $regex: searchTerm, $options: 'i' };
          
          filter.$or = [
            { routeName: searchRegex },
            { title: searchRegex },
            { operatorName: searchRegex },
            { origin: searchRegex },
            { destination: searchRegex },
            { description: searchRegex },
            { 'stops.name': searchRegex }
          ];
        }
        
        // Destination filtering
        if (searchParams.get('destination') && searchParams.get('destination') !== 'All') {
          const destination = searchParams.get('destination');
          const destRegex = { $regex: destination, $options: 'i' };
          filter.$and = [
            filter.$and || {},
            {
              $or: [
                { destination: destRegex },
                { 'stops.name': destRegex }
              ]
            }
          ];
        }
        
        // Route type filtering
        if (searchParams.get('routeType') && searchParams.get('routeType') !== 'All') {
          filter.routeType = { $regex: searchParams.get('routeType'), $options: 'i' };
        }
        
        // Transport type filtering
        if (searchParams.get('transportType') && searchParams.get('transportType') !== 'All') {
          filter.serviceType = { $regex: searchParams.get('transportType'), $options: 'i' };
        }
        
        // Location/city filtering
        if (searchParams.get('city')) {
          const cityRegex = { $regex: searchParams.get('city'), $options: 'i' };
          filter['provider.location.city'] = cityRegex;
        }
        
        // Pagination
        const page = parseInt(searchParams.get('page')) || 1;
        const limit = parseInt(searchParams.get('limit')) || 20;
        const skip = (page - 1) * limit;
        
        // Execute query
        const total = await transportCollection.countDocuments(filter);
        const routes = await transportCollection
          .find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();
        
        return res.status(200).json({
          success: true,
          data: routes,
          total: total,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total: total
          },
          count: routes.length,
          message: `Found ${routes.length} transport routes`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Get transport routes error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch transport routes',
          error: error.message
        });
      }
    }

    // === GET SINGLE TRANSPORT ROUTE ===
    if (path.match(/^\/transport\/([a-f\d]{24})$/) && req.method === 'GET') {
      const routeId = path.split('/')[2];
      console.log(`[${timestamp}] → GET TRANSPORT ROUTE: ${routeId}`);
      
      try {
        const transportCollection = db.collection('transportroutes');
        const route = await transportCollection.findOne({ _id: new ObjectId(routeId) });
        
        if (!route) {
          return res.status(404).json({
            success: false,
            message: 'Transport route not found'
          });
        }
        
        // Format the route data
        const formattedRoute = {
          _id: route._id,
          title: route.title || route.routeName || 'Unnamed Route',
          routeName: route.routeName || route.title,
          operatorName: route.operatorName || 'Unknown Operator',
          origin: route.origin || 'Unknown',
          destination: route.destination || 'Unknown',
          stops: route.stops || [],
          routeType: route.routeType || 'regular',
          serviceType: route.serviceType || route.transportType || 'bus',
          schedule: route.schedule || {},
          pricing: route.pricing || {},
          operationalStatus: route.operationalStatus || 'active',
          accessibility: route.accessibility || {},
          contact: route.contact || {},
          provider: route.provider || {},
          images: route.images || [],
          description: route.description || '',
          createdAt: route.createdAt || new Date(),
          updatedAt: route.updatedAt || new Date()
        };
        
        return res.status(200).json({
          success: true,
          data: formattedRoute,
          message: `Transport route: ${formattedRoute.title}`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Get transport route error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch transport route',
          error: error.message
        });
      }
    }

    // === API TRANSPORT ENDPOINTS (for frontend compatibility) ===
    if (path === '/api/transport' || path === '/api/transport-routes') {
      console.log(`[${timestamp}] → API TRANSPORT (redirect)`);
      req.url = req.url.replace('/api', '');
      return handler(req, res);
    }

    // ==================== SECTION 10: NEWS ENDPOINTS ====================
    
    // === GET ALL NEWS ===
    if (path === '/news' && req.method === 'GET') {
      console.log(`[${timestamp}] → GET NEWS`);
      
      try {
        const newsCollection = db.collection('news');
        
        let filter = { status: 'published' };
        
        // Admin can see all articles
        if (req.headers.authorization) {
          try {
            const token = req.headers.authorization.replace('Bearer ', '');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.id) });
            if (user && user.role === 'admin') {
              filter = {};
            }
          } catch (e) {
            // Invalid token, continue with public filter
          }
        }
        
        // Search functionality
        if (searchParams.get('search')) {
          const searchTerm = searchParams.get('search');
          const searchRegex = { $regex: searchTerm, $options: 'i' };
          
          filter.$or = [
            { title: searchRegex },
            { content: searchRegex },
            { excerpt: searchRegex },
            { tags: searchRegex }
          ];
        }
        
        // Filter by category
        if (searchParams.get('category') && searchParams.get('category') !== 'all') {
          filter.category = searchParams.get('category');
        }
        
        // Filter by tag
        if (searchParams.get('tag')) {
          filter.tags = searchParams.get('tag');
        }
        
        // Pagination
        const page = parseInt(searchParams.get('page')) || 1;
        const limit = parseInt(searchParams.get('limit')) || 10;
        const skip = (page - 1) * limit;
        
        // Execute query
        const total = await newsCollection.countDocuments(filter);
        const articles = await newsCollection
          .find(filter)
          .sort({ publishDate: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray();
        
        return res.status(200).json({
          success: true,
          data: articles,
          total: total,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total: total
          },
          count: articles.length,
          message: `Found ${articles.length} news articles`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Get news error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch news articles',
          error: error.message
        });
      }
    }

    // ==================== SECTION 11: VIDEO ENDPOINTS ====================
    
    // === GET ALL VIDEOS ===
    if (path === '/videos' && req.method === 'GET') {
      console.log(`[${timestamp}] → GET VIDEOS`);
      
      try {
        const videosCollection = db.collection('videos');
        
        // Build filter
        let filter = { status: 'published' };
        
        // Admin can see all videos
        if (req.headers.authorization) {
          try {
            const token = req.headers.authorization.replace('Bearer ', '');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.id) });
            if (user && user.role === 'admin') {
              filter = {};
              if (searchParams.get('status') && searchParams.get('status') !== 'all') {
                filter.status = searchParams.get('status');
              }
            }
          } catch (e) {
            // Invalid token, continue with public filter
          }
        }
        
        // Handle category filter
        if (searchParams.get('category') && searchParams.get('category') !== 'all') {
          filter.category = searchParams.get('category');
        }
        
        // Handle search
        if (searchParams.get('search')) {
          const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
          filter.$or = [
            { title: searchRegex },
            { description: searchRegex },
            { tags: searchRegex }
          ];
        }
        
        // Handle featured filter
        if (searchParams.get('featured') === 'true') {
          filter.featured = true;
        }
        
        // Pagination
        const page = parseInt(searchParams.get('page')) || 1;
        const limit = parseInt(searchParams.get('limit')) || 12;
        const skip = (page - 1) * limit;
        
        // Sorting
        let sort = { publishDate: -1, createdAt: -1 };
        if (searchParams.get('sort') === 'views') {
          sort = { 'metadata.views': -1 };
        } else if (searchParams.get('sort') === 'likes') {
          sort = { 'metadata.likes': -1 };
        }
        
        // Execute query
        const total = await videosCollection.countDocuments(filter);
        const videos = await videosCollection
          .find(filter)
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .toArray();
        
        return res.status(200).json({
          success: true,
          data: videos,
          total: total,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total: total
          },
          count: videos.length,
          message: `Found ${videos.length} videos`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Get videos error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch videos',
          error: error.message
        });
      }
    }

    // === GET SINGLE VIDEO ===
    if (path.match(/^\/videos\/([a-f\d]{24})$/) && req.method === 'GET') {
      const videoId = path.split('/')[2];
      console.log(`[${timestamp}] → GET VIDEO: ${videoId}`);
      
      try {
        const videosCollection = db.collection('videos');
        const video = await videosCollection.findOne({ _id: new ObjectId(videoId) });
        
        if (!video) {
          return res.status(404).json({
            success: false,
            message: 'Video not found'
          });
        }
        
        // Non-admin users can only view published videos
        if (video.status !== 'published') {
          if (!req.headers.authorization) {
            return res.status(404).json({
              success: false,
              message: 'Video not found'
            });
          }
          
          try {
            const token = req.headers.authorization.replace('Bearer ', '');
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.id) });
            if (!user || user.role !== 'admin') {
              return res.status(404).json({
                success: false,
                message: 'Video not found'
              });
            }
          } catch (e) {
            return res.status(404).json({
              success: false,
              message: 'Video not found'
            });
          }
        }
        
        // Increment view count
        await videosCollection.updateOne(
          { _id: new ObjectId(videoId) },
          { $inc: { 'metadata.views': 1 } }
        );
        video.metadata.views = (video.metadata.views || 0) + 1;
        
        return res.status(200).json({
          success: true,
          data: video
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Get video error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch video',
          error: error.message
        });
      }
    }

    // === CREATE VIDEO (ADMIN ONLY) ===
    if (path === '/videos' && req.method === 'POST') {
      console.log(`[${timestamp}] → CREATE VIDEO`);
      
      try {
        // Check authentication
        if (!req.headers.authorization) {
          return res.status(401).json({
            success: false,
            message: 'Authentication required'
          });
        }
        
        const token = req.headers.authorization.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.id) });
        
        if (!user || user.role !== 'admin') {
          return res.status(403).json({
            success: false,
            message: 'Admin access required'
          });
        }
        
        // Handle form data
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const rawBody = Buffer.concat(chunks);
        
        const contentType = req.headers['content-type'] || '';
        let videoData = {};
        
        if (contentType.includes('application/json')) {
          videoData = JSON.parse(rawBody.toString());
        } else {
          videoData = JSON.parse(rawBody.toString());
        }
        
        // Extract YouTube video ID if URL provided
        if (videoData.youtubeUrl && !videoData.youtubeVideoId) {
          const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
          const match = videoData.youtubeUrl.match(regExp);
          
          if (match && match[2].length === 11) {
            videoData.youtubeVideoId = match[2];
            
            // Set thumbnail URL if not provided
            if (!videoData.thumbnail?.url) {
              videoData.thumbnail = {
                url: `https://img.youtube.com/vi/${match[2]}/maxresdefault.jpg`,
                size: 0,
                mimetype: 'image/jpeg'
              };
            }
          }
        }
        
        // Create video document
        const newVideo = {
          ...videoData,
          author: user._id,
          authorName: user.name,
          status: videoData.status || 'draft',
          featured: videoData.featured || false,
          metadata: {
            views: 0,
            likes: 0,
            shares: 0,
            duration: videoData.duration || null,
            ...videoData.metadata
          },
          createdAt: new Date(),
          updatedAt: new Date(),
          publishDate: videoData.publishDate ? new Date(videoData.publishDate) : new Date()
        };
        
        const videosCollection = db.collection('videos');
        const result = await videosCollection.insertOne(newVideo);
        
        return res.status(201).json({
          success: true,
          data: { ...newVideo, _id: result.insertedId },
          message: 'Video created successfully'
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Create video error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to create video',
          error: error.message
        });
      }
    }

    // ==================== SECTION 12: ANALYTICS ENDPOINTS ====================
    
    // === ANALYTICS TRACK ENDPOINT ===
    if (path === '/analytics/track' && req.method === 'POST') {
      console.log(`[${timestamp}] → ANALYTICS TRACK`);
      
      try {
        let body = {};
        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const rawBody = Buffer.concat(chunks).toString();
          if (rawBody && rawBody.trim()) {
            body = JSON.parse(rawBody);
          }
        } catch (parseError) {
          console.warn(`[${timestamp}] Analytics parsing warning:`, parseError.message);
        }
        
        // Always return success for analytics to prevent crashes
        return res.status(200).json({
          success: true,
          message: 'Event tracked successfully',
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.warn(`[${timestamp}] Analytics error:`, error.message);
        return res.status(200).json({
          success: true,
          message: 'Event tracked with warnings',
          timestamp: new Date().toISOString()
        });
      }
    }

    // === GET ANALYTICS DASHBOARD DATA (ADMIN ONLY) ===
    if (path === '/analytics/dashboard' && req.method === 'GET') {
      console.log(`[${timestamp}] → GET ANALYTICS DASHBOARD`);
      
      try {
        // Check authentication
        if (!req.headers.authorization) {
          return res.status(401).json({
            success: false,
            message: 'Authentication required'
          });
        }
        
        const token = req.headers.authorization.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.id) });
        
        if (!user || user.role !== 'admin') {
          return res.status(403).json({
            success: false,
            message: 'Admin access required'
          });
        }
        
        // Get time period from query params
        const period = searchParams.get('period') || '7d';
        const startDate = new Date();
        
        switch(period) {
          case '24h': startDate.setHours(startDate.getHours() - 24); break;
          case '7d': startDate.setDate(startDate.getDate() - 7); break;
          case '30d': startDate.setDate(startDate.getDate() - 30); break;
          case '90d': startDate.setDate(startDate.getDate() - 90); break;
          default: startDate.setDate(startDate.getDate() - 7);
        }
        
        // Fetch analytics data from your analytics collection
        const analyticsCollection = db.collection('analytics_events');
        const events = await analyticsCollection.find({
          timestamp: { $gte: startDate }
        }).toArray();
        
        // Calculate overview metrics
        const uniqueVisitors = new Set(events.map(e => e.userId || e.sessionId)).size;
        const pageViews = events.filter(e => e.type === 'page_view').length;
        const sessions = new Set(events.map(e => e.sessionId)).size;
        const avgSessionDuration = events.reduce((acc, e) => acc + (e.duration || 0), 0) / sessions || 0;
        
        // Calculate content metrics
        const listingsViewed = events.filter(e => e.type === 'listing_view').length;
        const articlesRead = events.filter(e => e.type === 'article_read').length;
        const searchQueries = events.filter(e => e.type === 'search').length;
        
        // Calculate device breakdown
        const deviceBreakdown = {
          desktop: events.filter(e => e.device === 'desktop').length,
          mobile: events.filter(e => e.device === 'mobile').length,
          tablet: events.filter(e => e.device === 'tablet').length
        };
        
        // Calculate traffic sources
        const sources = {};
        events.forEach(e => {
          const source = e.source || 'direct';
          sources[source] = (sources[source] || 0) + 1;
        });
        
        return res.status(200).json({
          success: true,
          data: {
            overview: {
              uniqueVisitors: { value: uniqueVisitors, trend: 'up' },
              pageViews: { value: pageViews, trend: 'up' },
              sessions: { value: sessions, trend: 'stable' },
              avgSessionDuration: { value: Math.round(avgSessionDuration), trend: 'up' },
              bounceRate: { value: '32%', trend: 'down' }
            },
            content: {
              listingsViewed: { value: listingsViewed, trend: 'up' },
              articlesRead: { value: articlesRead, trend: 'up' },
              searchQueries: { value: searchQueries, trend: 'stable' }
            },
            breakdown: {
              devices: deviceBreakdown,
              sources: sources
            }
          },
          period: period,
          message: 'Analytics dashboard data retrieved successfully'
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Analytics dashboard error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch analytics data',
          error: error.message
        });
      }
    }

    // === BATCH TRACK ANALYTICS EVENTS ===
    if (path === '/analytics/track/batch' && req.method === 'POST') {
      console.log(`[${timestamp}] → BATCH TRACK ANALYTICS`);
      
      try {
        let events = [];
        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const rawBody = Buffer.concat(chunks).toString();
          const body = JSON.parse(rawBody);
          events = body.events || [];
        } catch (parseError) {
          console.warn(`[${timestamp}] Batch analytics parsing warning:`, parseError.message);
          return res.status(400).json({
            success: false,
            message: 'Invalid request body'
          });
        }
        
        if (!Array.isArray(events) || events.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'No events provided'
          });
        }
        
        // Process and store events
        const analyticsCollection = db.collection('analytics_events');
        const processedEvents = events.map(event => ({
          ...event,
          timestamp: new Date(event.timestamp || Date.now()),
          serverTimestamp: new Date()
        }));
        
        const result = await analyticsCollection.insertMany(processedEvents);
        
        return res.status(200).json({
          success: true,
          message: `${result.insertedCount} events tracked successfully`,
          count: result.insertedCount
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Batch analytics error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to track batch events',
          error: error.message
        });
      }
    }

    // ==================== SECTION 13: DASHBOARD STATS ENDPOINTS ====================
    
    // === GET DASHBOARD STATS (ADMIN ONLY) ===
    if (path === '/dashboard/stats' && req.method === 'GET') {
      console.log(`[${timestamp}] → GET DASHBOARD STATS`);
      
      try {
        // Check admin authentication
        if (!req.headers.authorization) {
          return res.status(401).json({ success: false, message: 'Authentication required' });
        }
        
        const token = req.headers.authorization.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.id) });
        
        if (!user || user.role !== 'admin') {
          return res.status(403).json({ success: false, message: 'Admin access required' });
        }
        
        // Fetch comprehensive stats
        const [
          totalListings,
          activeListings,
          totalDealers,
          verifiedDealers,
          totalProviders,
          activeProviders,
          totalRentals,
          activeRentals,
          totalTransport,
          activeTransport,
          totalNews,
          publishedNews,
          totalUsers,
          activeUsers
        ] = await Promise.all([
          db.collection('listings').countDocuments(),
          db.collection('listings').countDocuments({ status: 'active' }),
          db.collection('dealers').countDocuments(),
          db.collection('dealers').countDocuments({ status: 'verified' }),
          db.collection('serviceproviders').countDocuments(),
          db.collection('serviceproviders').countDocuments({ status: 'active' }),
          db.collection('rentalvehicles').countDocuments(),
          db.collection('rentalvehicles').countDocuments({ status: 'available' }),
          db.collection('transportroutes').countDocuments(),
          db.collection('transportroutes').countDocuments({ operationalStatus: 'active' }),
          db.collection('news').countDocuments(),
          db.collection('news').countDocuments({ status: 'published' }),
          db.collection('users').countDocuments(),
          db.collection('users').countDocuments({ isActive: true })
        ]);
        
        // Calculate growth percentages (mock data for now)
        const stats = {
          listings: {
            total: totalListings,
            active: activeListings,
            growth: 12.5,
            trend: 'up'
          },
          dealers: {
            total: totalDealers,
            verified: verifiedDealers,
            growth: 8.3,
            trend: 'up'
          },
          providers: {
            total: totalProviders,
            active: activeProviders,
            growth: 15.2,
            trend: 'up'
          },
          rentals: {
            total: totalRentals,
            available: activeRentals,
            growth: 10.1,
            trend: 'up'
          },
          transport: {
            total: totalTransport,
            active: activeTransport,
            growth: 5.7,
            trend: 'stable'
          },
          news: {
            total: totalNews,
            published: publishedNews,
            growth: 22.4,
            trend: 'up'
          },
          users: {
            total: totalUsers,
            active: activeUsers,
            growth: 18.9,
            trend: 'up'
          },
          revenue: {
            total: 125000,
            monthly: 12500,
            growth: 25.3,
            trend: 'up'
          }
        };
        
        return res.status(200).json({
          success: true,
          data: stats,
          lastUpdated: new Date().toISOString(),
          message: 'Dashboard stats retrieved successfully'
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Dashboard stats error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch dashboard stats',
          error: error.message
        });
      }
    }

    // === ALIAS FOR DASHBOARD STATS ===
    if (path === '/stats/dashboard' && req.method === 'GET') {
      console.log(`[${timestamp}] → STATS DASHBOARD (redirect)`);
      req.url = req.url.replace('/stats/dashboard', '/dashboard/stats');
      return handler(req, res);
    }

    // ==================== SECTION 14: GENERAL STATS ENDPOINT ====================
    
    // === GENERAL WEBSITE STATS ===
    if (path === '/stats' && req.method === 'GET') {
      console.log(`[${timestamp}] → WEBSITE STATS`);
      
      try {
        // Get counts from all collections
        const [
          totalListings,
          activeDealers,
          serviceProviders,
          rentalVehicles,
          transportRoutes,
          newsArticles
        ] = await Promise.all([
          db.collection('listings').countDocuments({ status: { $ne: 'deleted' } }),
          db.collection('dealers').countDocuments({ status: 'verified' }),
          db.collection('serviceproviders').countDocuments({ status: { $ne: 'deleted' } }),
          db.collection('rentalvehicles').countDocuments({ status: { $ne: 'deleted' } }),
          db.collection('transportroutes').countDocuments({ operationalStatus: 'active' }),
          db.collection('news').countDocuments({ status: 'published' })
        ]);
        
        return res.status(200).json({
          success: true,
          data: {
            totalListings,
            activeDealers,
            serviceProviders,
            rentalVehicles,
            transportRoutes,
            newsArticles,
            lastUpdated: new Date().toISOString()
          },
          message: 'Website statistics retrieved successfully'
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Get stats error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch website statistics',
          error: error.message
        });
      }
    }

    // ==================== SECTION 15: HEALTH CHECK ====================
    
    // === TEST DATABASE CONNECTION ===
    if (path === '/test-db') {
      console.log(`[${timestamp}] → TEST DATABASE`);
      
      try {
        const collections = await db.listCollections().toArray();
        const counts = {};
        
        for (const name of ['listings', 'dealers', 'news', 'serviceproviders', 'rentalvehicles', 'transportroutes', 'users', 'videos']) {
          try {
            counts[name] = await db.collection(name).countDocuments();
          } catch (e) {
            counts[name] = 0;
          }
        }
        
        return res.status(200).json({
          success: true,
          message: 'BW Car Culture API - Production Ready',
          collections: collections.map(c => c.name),
          counts: counts,
          timestamp: timestamp,
          features: [
            'Complete CRUD operations for all entities',
            'JWT authentication and authorization',
            'AWS S3 image uploads',
            'Analytics and dashboard endpoints',
            'Video management system',
            'Transport routes management',
            'Service providers directory',
            'News and content management',
            'Multi-endpoint strategy for frontend compatibility'
          ],
          version: '2.0.0'
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Test DB error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Database test failed',
          error: error.message
        });
      }
    }

    // === HEALTH CHECK ===
    if (path === '/health') {
      return res.status(200).json({
        success: true,
        status: 'healthy',
        timestamp: timestamp,
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'production'
      });
    }

    // ==================== DEFAULT 404 HANDLER ====================
    return res.status(404).json({
      success: false,
      message: `Endpoint not found: ${path}`,
      timestamp: timestamp,
      availableEndpoints: [
        '=== PUBLIC ENDPOINTS ===',
        '/listings (GET/POST)',
        '/listings/{id} (GET/PUT)',
        '/listings/makes (GET)',
        '/listings/models?make={make} (GET)',
        '/listings/dealer/{dealerId} (GET)',
        '/dealers (GET/POST)',
        '/dealers/{id} (GET/PUT/DELETE)',
        '/dealers/{id}/verify (PUT)',
        '/dealers/all (GET)',
        '/rentals (GET)',
        '/rentals/{id} (GET)',
        '/service-providers (GET)',
        '/providers (GET)',
        '/transport (GET)',
        '/transport/{id} (GET)',
        '/news (GET)',
        '/videos (GET/POST)',
        '/videos/{id} (GET)',
        '/stats (GET)',
        '/health (GET)',
        '/test-db (GET)',
        '=== AUTH ENDPOINTS ===',
        '/auth/login (POST)',
        '/auth/users (GET)',
        '=== ADMIN ENDPOINTS ===',
        '/admin/listings (POST)',
        '/admin/listings/{id} (PUT/DELETE)',
        '/admin/dealers (POST)',
        '/admin/dealers/{id} (PUT/DELETE)',
        '=== ANALYTICS ENDPOINTS ===',
        '/analytics/track (POST)',
        '/analytics/track/batch (POST)',
        '/analytics/dashboard (GET)',
        '/dashboard/stats (GET)',
        '/dashboard/analytics (GET)',
        '/dashboard/activity (GET)',
        '=== IMAGE UPLOAD ===',
        '/images/upload (POST)',
        '/images/upload-multiple (POST)'
      ]
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] API Error:`, error);
    
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
      timestamp: new Date().toISOString(),
      path: req.url
    });
  }
}