// api/user-services.js
// Complete user services based on the working "NO AUTH VERSION" foundation
// Enhanced with optional auth and database when possible
// UPDATED: Added query parameter support for frontend routing + IMAGE UPLOAD ENDPOINT

// Database connection helper (async, only called when needed)
let cachedDb = null;
let client = null;

const connectToDatabase = async () => {
  if (cachedDb) return cachedDb;
  
  try {
    const { MongoClient } = await import('mongodb');
    
    if (!client) {
      client = new MongoClient(process.env.MONGODB_URI, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      await client.connect();
    }
    
    cachedDb = client.db(process.env.DB_NAME || 'carculture');
    return cachedDb;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    return null; // Return null instead of throwing
  }
};

// Simple auth helper (optional - doesn't break if it fails)
const getAuthenticatedUser = async (req) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null; // No auth, return null instead of error
    }
    
    const token = authHeader.substring(7);
    if (!token || token.length < 10) {
      return null;
    }

    // Try to verify token, but don't fail if it doesn't work
    try {
      const jwt = await import('jsonwebtoken');
      const secretKey = process.env.JWT_SECRET || 'bw-car-culture-secret-key-2025';
      const decoded = jwt.default.verify(token, secretKey);
      
      return {
        id: decoded.userId || decoded.id,
        email: decoded.email,
        role: decoded.role,
        name: decoded.name
      };
    } catch (jwtError) {
      // JWT failed, but that's OK - return null
      return null;
    }
    
  } catch (error) {
    // Any error in auth is OK - return null
    return null;
  }
};

// User token verification helper (copied from working main API)
const verifyToken = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'Access token required'
      });
      return { success: false, message: 'No token provided' };
    }
    
    const token = authHeader.substring(7);
    
    try {
      const jwt = await import('jsonwebtoken');
      const secretKey = process.env.JWT_SECRET || 'bw-car-culture-secret-key-2025';
      const decoded = jwt.default.verify(token, secretKey);
      
      // 🎯 KEY FIX: Use the SAME pattern as working functions
      return { 
        success: true, 
        userId: decoded.userId, // Use decoded.userId (not decoded.id)
        user: {
          id: decoded.userId,    // Return as 'id' in user object
          email: decoded.email,
          role: decoded.role,
          name: decoded.name
        }
      };
      
    } catch (jwtError) {
      console.error('JWT verification failed:', jwtError.message);
      res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
      return { success: false, message: 'Invalid or expired token' };
    }
    
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
    return { success: false, message: 'Token verification error' };
  }
};

const getUserData = async (userId) => {
  if (!userId) return null;
  
  try {
    const db = await connectToDatabase();
    if (!db) return null;
    
    const { ObjectId } = await import('mongodb');
    
    // 🎯 KEY FIX: Make sure to use the correct userId field
    const [listings, payments, addons] = await Promise.allSettled([
      db.collection('listings').find({
        $or: [
          { 'dealer.user': new ObjectId(userId) },
          { 'seller.user': new ObjectId(userId) },
          { dealerId: new ObjectId(userId) },
          { userId: new ObjectId(userId) }  // Added this as fallback
        ]
      }).toArray(),
      db.collection('payments').find({ 
        $or: [
          { user: new ObjectId(userId) },
          { userId: new ObjectId(userId) }  // Added this as fallback
        ]
      }).toArray(),
      db.collection('addonPurchases').find({ 
        $or: [
          { user: new ObjectId(userId) },
          { userId: new ObjectId(userId) }  // Added this as fallback
        ]
      }).toArray()
    ]);
    
    return {
      listings: listings.status === 'fulfilled' ? listings.value : [],
      payments: payments.status === 'fulfilled' ? payments.value : [],
      addons: addons.status === 'fulfilled' ? addons.value : []
    };
  } catch (error) {
    console.error('getUserData error:', error);
    return null;
  }
};

// Main handler function - keeping the working structure
export default function handler(req, res) {
  let path = req.url.split('?')[0];
  
  // 🎯 NEW: Handle query parameter routing from frontend
  const url = new URL(req.url, `https://${req.headers.host}`);
  const queryPath = url.searchParams.get('path');
  
  if (queryPath) {
    path = queryPath;
    console.log(`🔄 Frontend routed path: ${path}`);
  }
  
// 🔍 DEBUGGING: Log all upload-related requests
  if (path.includes('upload')) {
    console.log(`🔍 UPLOAD DEBUG:`, {
      originalUrl: req.url,
      path: path,
      method: req.method,
      contentType: req.headers['content-type'],
      isUploadRoute: path === '/api/user/upload-images',
      isPostMethod: req.method === 'POST'
    });
  }

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  console.log(`🎯 Processing user-services path: "${path}"`);

  // ==================== USER PROFILE ENDPOINTS ====================
  
  // GET /api/user/profile - MISSING ENDPOINT CAUSING 500 ERROR
  if (path === '/api/user/profile' && req.method === 'GET') {
    (async () => {
      try {
        const authResult = await verifyToken(req, res);
        if (!authResult.success) return;
        
        const db = await connectToDatabase();
        if (db) {
          const { ObjectId } = await import('mongodb');
          const usersCollection = db.collection('users');
          const user = await usersCollection.findOne({ 
            _id: new ObjectId(authResult.userId) 
          });
          
          if (user) {
            // Remove sensitive data
            delete user.password;
            delete user.security;
            
            // Calculate profile completeness
            let completeness = 0;
            if (user.name) completeness += 25;
            if (user.email) completeness += 25;
            if (user.avatar?.url) completeness += 15;
            if (user.profile?.phone) completeness += 10;
            if (user.profile?.bio) completeness += 10;
            if (user.profile?.address?.city) completeness += 15;
            
            // Determine seller type
            let sellerType = 'private';
            if (user.businessProfile?.services?.length > 0) {
              const dealershipService = user.businessProfile.services.find(s => s.serviceType === 'dealership');
              if (dealershipService) {
                sellerType = 'dealership';
              }
            }

            return res.status(200).json({
              success: true,
              data: {
                ...user,
                profileCompleteness: Math.round(completeness),
                sellerType: sellerType,
                stats: {
                  totalVehicles: 0,
                  activeListings: 0,
                  totalViews: 0
                }
              },
              source: 'user-services.js - ENHANCED WORKING VERSION'
            });
          }
        }

        // Fallback response
        return res.status(200).json({
          success: true,
          data: {
            _id: authResult.userId,
            email: authResult.user.email,
            name: authResult.user.name,
            role: authResult.user.role,
            profileCompleteness: 50,
            sellerType: 'private',
            stats: {
              totalVehicles: 0,
              activeListings: 0,
              totalViews: 0
            }
          },
          message: 'User profile (fallback)',
          source: 'user-services.js - ENHANCED WORKING VERSION'
        });

      } catch (error) {
        console.error('User profile error:', error);
        return res.status(500).json({
          success: false,
          message: 'Failed to load user profile',
          error: error.message
        });
      }
    })();
    return;
  }

  // ==================== IMAGE UPLOAD ENDPOINT ====================

// USER IMAGE UPLOAD ENDPOINT - api/user-services.js
if (path === '/api/user/upload-images' && req.method === 'POST') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → USER IMAGE UPLOAD (api/user-services.js - PRODUCTION S3)`);
  
  // Same exact implementation as index.js but with different source identifier
  (async () => {
    try {
      const authResult = await verifyToken(req, res);
      if (!authResult.success) return;

      const userId = authResult.userId;
      
      // Parse multipart form data (same logic)
      const boundary = req.headers['content-type']?.split('boundary=')[1];
      if (!boundary) {
        return res.status(400).json({
          success: false,
          message: 'Invalid multipart form data - no boundary'
        });
      }

      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      const body = buffer.toString('binary');

      const parts = body.split('--' + boundary);
      const files = [];

      for (const part of parts) {
        if (part.includes('Content-Disposition: form-data') && part.includes('filename=')) {
          const filenameMatch = part.match(/filename="([^"]*)"/);
          if (!filenameMatch || !filenameMatch[1] || filenameMatch[1] === '""') continue;
          
          const filename = filenameMatch[1];
          let fileType = 'image/jpeg';
          
          const contentTypeMatch = part.match(/Content-Type: ([^\r\n]*)/);
          if (contentTypeMatch) fileType = contentTypeMatch[1].trim();

          const dataStart = part.indexOf('\r\n\r\n');
          if (dataStart !== -1) {
            const fileData = part.substring(dataStart + 4);
            const cleanData = fileData.replace(/\r\n$/, '').replace(/\r\n--$/, '');
            const fileBuffer = Buffer.from(cleanData, 'binary');
            
            if (fileBuffer.length > 100) {
              files.push({
                filename: filename,
                buffer: fileBuffer,
                mimetype: fileType,
                size: fileBuffer.length
              });
            }
          }
        }
      }

      if (files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid image files found'
        });
      }

      // AWS S3 Configuration (same as index.js)
      const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
      const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
      const awsBucket = process.env.AWS_S3_BUCKET_NAME || 'bw-car-culture-images';
      const awsRegion = process.env.AWS_S3_REGION || 'us-east-1';

      if (!awsAccessKey || !awsSecretKey) {
        return res.status(500).json({
          success: false,
          message: 'AWS credentials not configured',
          source: 'api/user-services.js'
        });
      }

      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      const s3Client = new S3Client({
        region: awsRegion,
        credentials: { accessKeyId: awsAccessKey, secretAccessKey: awsSecretKey }
      });

      const uploadResults = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        try {
          const timestamp_ms = Date.now();
          const randomString = Math.random().toString(36).substring(2, 8);
          const fileExtension = file.filename.split('.').pop() || 'jpg';
          const s3Key = `user-listings/${userId}/listing-${timestamp_ms}-${randomString}-${i}.${fileExtension}`;

          await s3Client.send(new PutObjectCommand({
            Bucket: awsBucket,
            Key: s3Key,
            Body: file.buffer,
            ContentType: file.mimetype,
            Metadata: {
              userId: userId,
              uploadType: 'user-listing',
              originalFilename: file.filename,
              source: 'api-user-services-js'
            }
          }));
          
          const imageUrl = `https://${awsBucket}.s3.${awsRegion}.amazonaws.com/${s3Key}`;
          
          uploadResults.push({
            url: imageUrl,
            key: s3Key,
            thumbnail: imageUrl,
            size: file.size,
            mimetype: file.mimetype,
            isPrimary: i === 0,
            originalFilename: file.filename
          });

        } catch (fileError) {
          console.error(`Failed to upload file ${i + 1}:`, fileError);
        }
      }

      return res.status(200).json({
        success: true,
        message: `Successfully uploaded ${uploadResults.length} images`,
        images: uploadResults,
        count: uploadResults.length,
        source: 'api/user-services.js - PRODUCTION S3'
      });

    } catch (error) {
      console.error(`User image upload error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Image upload failed',
        error: error.message,
        source: 'api/user-services.js'
      });
    }
  })();
  return;
}

// USER SUBMIT LISTING ENDPOINT - api/user-services.js
if (path === '/api/user/submit-listing' && req.method === 'POST') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → USER SUBMIT LISTING (api/user-services.js - PRODUCTION)`);
  
  (async () => {
    try {
      const authResult = await verifyToken(req, res);
      if (!authResult.success) return;

      let body = {};
      try {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const rawBody = Buffer.concat(chunks).toString();
        if (rawBody) body = JSON.parse(rawBody);
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          message: 'Invalid request body format'
        });
      }

      const { listingData } = body;
      if (!listingData) {
        return res.status(400).json({
          success: false,
          message: 'Listing data is required'
        });
      }

      // Same validation as index.js
      const errors = [];
      if (!listingData.title?.length || listingData.title.length < 10) errors.push('Title must be at least 10 characters');
      if (!listingData.specifications?.make) errors.push('Vehicle make is required');
      if (!listingData.specifications?.model) errors.push('Vehicle model is required');
      if (!listingData.pricing?.price || listingData.pricing.price <= 0) errors.push('Valid price is required');
      if (!listingData.contact?.sellerName) errors.push('Seller name is required');
      if (!listingData.contact?.phone) errors.push('Phone number is required');

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors
        });
      }

      const db = await connectToDatabase();
      if (!db) {
        return res.status(500).json({
          success: false,
          message: 'Database connection failed'
        });
      }

      const { ObjectId } = await import('mongodb');
      const userSubmissionsCollection = db.collection('usersubmissions');
      const usersCollection = db.collection('users');

      const user = await usersCollection.findOne({
        _id: new ObjectId(authResult.userId)
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const submission = {
        _id: new ObjectId(),
        userId: new ObjectId(authResult.userId),
        userName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        userEmail: user.email,
        listingData: {
          ...listingData,
          contact: { ...listingData.contact, email: user.email }
        },
        status: 'pending_review',
        submittedAt: new Date(),
        source: 'api/user-services.js'
      };

      const result = await userSubmissionsCollection.insertOne(submission);

      return res.status(201).json({
        success: true,
        message: 'Listing submitted for admin review successfully',
        data: {
          submissionId: result.insertedId,
          status: 'pending_review',
          title: submission.listingData.title,
          submittedAt: submission.submittedAt,
          source: 'api/user-services.js'
        }
      });

    } catch (error) {
      console.error(`Submit listing error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to submit listing',
        error: error.message,
        source: 'api/user-services.js'
      });
    }
  })();
  return;
}

  // ==================== PAYMENTS ENDPOINTS ====================

  if (path === '/api/payments/available-tiers' && req.method === 'GET') {
    return res.status(200).json({
      success: true,
      data: {
        sellerType: 'private',
        tiers: {
          basic: { 
            name: 'Basic Plan', 
            price: 50, 
            duration: 30, 
            maxListings: 1,
            features: ['1 Car Listing', 'Basic Support', '30 Days Active']
          },
          standard: { 
            name: 'Standard Plan', 
            price: 100, 
            duration: 30, 
            maxListings: 1,
            features: ['1 Car Listing', 'Priority Support', '30 Days Active', 'Enhanced Visibility']
          },
          premium: { 
            name: 'Premium Plan', 
            price: 200, 
            duration: 45, 
            maxListings: 1,
            features: ['1 Car Listing', 'Premium Support', '45 Days Active', 'Featured Placement']
          }
        },
        allowMultipleSubscriptions: true,
        description: 'Each subscription allows 1 car listing. You can subscribe multiple times for additional cars.',
        source: 'user-services.js - ENHANCED WORKING VERSION'
      }
    });
  }

  if (path === '/api/payments/initiate' && req.method === 'POST') {
    // Enhanced with async database operation but fallback to mock
    (async () => {
      try {
        const user = await getAuthenticatedUser(req);
        const { listingId, subscriptionTier, paymentType } = req.body;

        if (!listingId) {
          return res.status(400).json({
            success: false,
            message: 'Listing ID is required'
          });
        }

        // Try to create real payment record
        const db = await connectToDatabase();
        if (db && user) {
          try {
            const { ObjectId } = await import('mongodb');
            const paymentsCollection = db.collection('payments');
            const payment = {
              user: new ObjectId(user.id),
              listing: new ObjectId(listingId),
              type: paymentType || 'subscription',
              amount: 50,
              status: 'pending',
              createdAt: new Date()
            };

            const result = await paymentsCollection.insertOne(payment);
            
            return res.status(200).json({
              success: true,
              data: {
                paymentId: result.insertedId,
                amount: 50,
                type: paymentType || 'subscription',
                status: 'pending'
              },
              message: 'Payment initiated successfully (real)',
              source: 'user-services.js - ENHANCED WORKING VERSION'
            });
          } catch (dbError) {
            // Database failed, use mock response
          }
        }

        // Fallback to mock response (always works)
        return res.status(200).json({
          success: true,
          data: {
            paymentId: 'mock-payment-' + Date.now(),
            amount: 50,
            type: paymentType || 'subscription',
            status: 'pending'
          },
          message: 'Payment initiated successfully (mock)',
          source: 'user-services.js - ENHANCED WORKING VERSION'
        });

      } catch (error) {
        // Any error, return mock response
        return res.status(200).json({
          success: true,
          data: {
            paymentId: 'mock-payment-' + Date.now(),
            amount: 50,
            type: 'subscription',
            status: 'pending'
          },
          message: 'Payment initiated successfully (fallback)',
          source: 'user-services.js - ENHANCED WORKING VERSION'
        });
      }
    })();
    return; // Let the async function handle the response
  }

  if (path === '/api/payments/history' && req.method === 'GET') {
    // Enhanced with async database operation but fallback to mock
    (async () => {
      try {
        const user = await getAuthenticatedUser(req);
        
        if (user) {
          const userData = await getUserData(user.id);
          if (userData && userData.payments.length > 0) {
            return res.status(200).json({
              success: true,
              data: userData.payments,
              pagination: {
                currentPage: 1,
                totalPages: 1,
                total: userData.payments.length
              },
              source: 'user-services.js - ENHANCED WORKING VERSION (real data)'
            });
          }
        }

        // Fallback to mock data
        return res.status(200).json({
          success: true,
          data: [],
          pagination: {
            currentPage: 1,
            totalPages: 1,
            total: 0
          },
          message: 'Payment history (mock - empty)',
          source: 'user-services.js - ENHANCED WORKING VERSION'
        });

      } catch (error) {
        // Error fallback
        return res.status(200).json({
          success: true,
          data: [],
          message: 'Payment history (fallback)',
          source: 'user-services.js - ENHANCED WORKING VERSION'
        });
      }
    })();
    return;
  }

  // ==================== ADDONS ENDPOINTS ====================

  if (path === '/api/addons/available' && req.method === 'GET') {
    return res.status(200).json({
      success: true,
      data: {
        sellerType: 'private',
        addons: {
          'featured-boost': { 
            name: 'Featured Boost', 
            price: 30, 
            description: 'Feature your listing for 7 days'
          },
          'photo-session': { 
            name: 'Professional Photos', 
            price: 150, 
            description: 'Professional car photography session'
          },
          'video-showcase': { 
            name: 'Video Showcase', 
            price: 200, 
            description: 'Professional video of your car'
          }
        },
        whatsappNumber: '+26774122453',
        source: 'user-services.js - ENHANCED WORKING VERSION'
      }
    });
  }

  if (path === '/api/addons/purchase' && req.method === 'POST') {
    return res.status(200).json({
      success: true,
      data: {
        purchaseId: 'mock-purchase-' + Date.now(),
        addons: req.body.addonIds || ['featured-boost'],
        totalCost: 30,
        status: 'pending'
      },
      message: 'Add-on purchase initiated (mock)',
      source: 'user-services.js - ENHANCED WORKING VERSION'
    });
  }

  if (path === '/api/addons/my-addons' && req.method === 'GET') {
    // Enhanced with async database operation but fallback to mock
    (async () => {
      try {
        const user = await getAuthenticatedUser(req);
        
        if (user) {
          const userData = await getUserData(user.id);
          if (userData && userData.addons.length > 0) {
            return res.status(200).json({
              success: true,
              data: userData.addons,
              source: 'user-services.js - ENHANCED WORKING VERSION (real data)'
            });
          }
        }

        // Fallback to mock
        return res.status(200).json({
          success: true,
          data: [],
          message: 'My add-ons (mock - empty)',
          source: 'user-services.js - ENHANCED WORKING VERSION'
        });

      } catch (error) {
        return res.status(200).json({
          success: true,
          data: [],
          message: 'My add-ons (fallback)',
          source: 'user-services.js - ENHANCED WORKING VERSION'
        });
      }
    })();
    return;
  }

  // ==================== USER ENDPOINTS ====================

  if (path === '/api/user/vehicles' && req.method === 'GET') {
    // Enhanced with async database operation but fallback to mock
    (async () => {
      try {
        const user = await getAuthenticatedUser(req);
        
        if (user) {
          const userData = await getUserData(user.id);
          if (userData && userData.listings.length > 0) {
            return res.status(200).json({
              success: true,
              count: userData.listings.length,
              data: userData.listings,
              source: 'user-services.js - ENHANCED WORKING VERSION (real data)'
            });
          }
        }

        // Fallback to mock
        return res.status(200).json({
          success: true,
          count: 0,
          data: [],
          message: 'User vehicles (mock - empty)',
          source: 'user-services.js - ENHANCED WORKING VERSION'
        });

      } catch (error) {
        return res.status(200).json({
          success: true,
          count: 0,
          data: [],
          message: 'User vehicles (fallback)',
          source: 'user-services.js - ENHANCED WORKING VERSION'
        });
      }
    })();
    return;
  }

  if (path === '/api/user/listings' && req.method === 'GET') {
    // Enhanced with async database operation but fallback to mock
    (async () => {
      try {
        const user = await getAuthenticatedUser(req);
        
        if (user) {
          const userData = await getUserData(user.id);
          if (userData && userData.listings.length > 0) {
            return res.status(200).json({
              success: true,
              data: userData.listings,
              source: 'user-services.js - ENHANCED WORKING VERSION (real data)'
            });
          }
        }

        // Fallback to mock
        return res.status(200).json({
          success: true,
          data: [],
          message: 'User listings (mock - empty)',
          source: 'user-services.js - ENHANCED WORKING VERSION'
        });

      } catch (error) {
        return res.status(200).json({
          success: true,
          data: [],
          message: 'User listings (fallback)',
          source: 'user-services.js - ENHANCED WORKING VERSION'
        });
      }
    })();
    return;
  }

  if (path === '/api/user/listings/stats' && req.method === 'GET') {
    // Enhanced with async database operation but fallback to mock
    (async () => {
      try {
        const user = await getAuthenticatedUser(req);
        
        if (user) {
          const userData = await getUserData(user.id);
          if (userData && userData.listings.length > 0) {
            const activeListings = userData.listings.filter(l => l.status === 'active').length;
            const featuredListings = userData.listings.filter(l => l.featured === true).length;
            const totalViews = userData.listings.reduce((sum, l) => sum + (l.views || 0), 0);

            return res.status(200).json({
              success: true,
              data: {
                totalListings: userData.listings.length,
                activeListings: activeListings,
                featuredListings: featuredListings,
                totalViews: totalViews,
                inactiveListings: userData.listings.length - activeListings
              },
              source: 'user-services.js - ENHANCED WORKING VERSION (real data)'
            });
          }
        }

        // Fallback to mock
        return res.status(200).json({
          success: true,
          data: {
            totalListings: 0,
            activeListings: 0,
            featuredListings: 0,
            totalViews: 0,
            inactiveListings: 0
          },
          message: 'User listing stats (mock)',
          source: 'user-services.js - ENHANCED WORKING VERSION'
        });

      } catch (error) {
        return res.status(200).json({
          success: true,
          data: {
            totalListings: 0,
            activeListings: 0,
            featuredListings: 0,
            totalViews: 0,
            inactiveListings: 0
          },
          message: 'User listing stats (fallback)',
          source: 'user-services.js - ENHANCED WORKING VERSION'
        });
      }
    })();
    return;
  }

  // Handle listing status updates
  if (path.match(/^\/api\/user\/listings\/[a-f\d]{24}\/status$/) && req.method === 'PUT') {
    return res.status(200).json({
      success: true,
      message: 'Listing status updated (mock)',
      source: 'user-services.js - ENHANCED WORKING VERSION'
    });
  }

// ==================== TEST ENDPOINT ====================
if (path === '/api/user/test-upload' && req.method === 'GET') {
  return res.status(200).json({
    success: true,
    message: 'Upload endpoint is ready!',
    timestamp: new Date().toISOString(),
    version: 'user-services.js - UPDATED WITH UPLOAD',
    availableEndpoints: {
      'GET /api/user/test-upload': 'This test endpoint',
      'POST /api/user/upload-images': 'Image upload endpoint'
    }
  });
}

  // ==================== FALLBACK ====================
  
  return res.status(404).json({
    success: false,
    message: `User services route not found: ${path} (${req.method})`,
    source: 'user-services.js - ENHANCED WORKING VERSION',
    queryPath: queryPath, // For debugging
    originalUrl: req.url,
    availableRoutes: [
      'GET /api/user/profile',
      'POST /api/user/upload-images',     // ✅ ADDED
      'GET /api/payments/available-tiers',
      'POST /api/payments/initiate', 
      'GET /api/payments/history',
      'GET /api/addons/available',
      'POST /api/addons/purchase',
      'GET /api/addons/my-addons',
      'GET /api/user/vehicles',
      'GET /api/user/listings',
      'GET /api/user/listings/stats',
      'PUT /api/user/listings/{id}/status'
    ]
  });
}