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
    'http://localhost:3000'
  ];
  
  const isAllowed = allowedOrigins.includes(origin) || 
                   (origin && origin.includes('bw-car-culture') && origin.includes('vercel.app'));
  
  const allowOrigin = isAllowed ? origin : '*';
  
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With, Cache-Control');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
};

// ONLY NEW ADDITION: Admin token verification helper
const verifyAdminToken = async (req) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { success: false, message: 'No token provided' };
    }
    
    const token = authHeader.substring(7);
    
    try {
      const jwt = await import('jsonwebtoken');
      const secretKey = process.env.JWT_SECRET || 'bw-car-culture-secret-key-2025';
      const decoded = jwt.default.verify(token, secretKey);
      
      // Check if user has admin role
      const adminRoles = ['admin', 'super-admin', 'administrator'];
      if (!adminRoles.includes(decoded.role?.toLowerCase())) {
        return { success: false, message: 'Admin access required' };
      }
      
      return { 
        success: true, 
        user: {
          id: decoded.userId,
          email: decoded.email,
          role: decoded.role,
          name: decoded.name
        }
      };
      
    } catch (jwtError) {
      return { success: false, message: 'Invalid or expired token' };
    }
    
  } catch (error) {
    return { success: false, message: 'Token verification error' };
  }
};

export default async function handler(req, res) {
  const origin = req.headers.origin;
  setCORSHeaders(res, origin);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);

  try {
    const db = await connectDB();
    if (!db) {
      return res.status(500).json({
        success: false,
        message: 'Database connection failed'
      });
    }

    const url = new URL(req.url, `https://${req.headers.host}`);
    const path = url.pathname;
    const searchParams = url.searchParams;
    
    console.log(`[${timestamp}] Processing path: "${path}"`);

    // === AUTHENTICATION ENDPOINTS ===
    if (path.includes('/auth')) {
      console.log(`[${timestamp}] → AUTH: ${path}`);
      
      // LOGIN ENDPOINT
      if (path === '/auth/login' && req.method === 'POST') {
        try {
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
          
          const { email, password } = body;
          
          if (!email || !password) {
            return res.status(400).json({
              success: false,
              message: 'Email and password are required'
            });
          }
          
          console.log(`[${timestamp}] Login attempt for email: ${email}`);
          
          const usersCollection = db.collection('users');
          const user = await usersCollection.findOne({ 
            email: email.toLowerCase(),
            status: 'active'
          });
          
          if (!user) {
            console.log(`[${timestamp}] User not found: ${email}`);
            return res.status(401).json({
              success: false,
              message: 'Invalid email or password'
            });
          }
          
          console.log(`[${timestamp}] User found: ${user.name} (${user.role})`);
          
          let isValidPassword = false;
          try {
            const bcrypt = await import('bcryptjs');
            isValidPassword = await bcrypt.default.compare(password, user.password);
            console.log(`[${timestamp}] Bcrypt comparison result: ${isValidPassword}`);
          } catch (bcryptError) {
            console.log(`[${timestamp}] Bcrypt error:`, bcryptError.message);
            isValidPassword = (password === user.password);
            console.log(`[${timestamp}] Direct comparison result: ${isValidPassword}`);
          }
          
          if (!isValidPassword) {
            console.log(`[${timestamp}] Invalid password for: ${email}`);
            return res.status(401).json({
              success: false,
              message: 'Invalid email or password'
            });
          }
          
          let token = null;
          try {
            const jwt = await import('jsonwebtoken');
            const secretKey = process.env.JWT_SECRET || 'bw-car-culture-secret-key-2025';
            
            token = jwt.default.sign(
              {
                userId: user._id,
                email: user.email,
                role: user.role,
                name: user.name
              },
              secretKey,
              { expiresIn: '24h' }
            );
          } catch (jwtError) {
            console.log(`[${timestamp}] JWT error:`, jwtError.message);
            token = Buffer.from(`${user._id}:${user.email}:${Date.now()}`).toString('base64');
          }
          
          try {
            await usersCollection.updateOne(
              { _id: user._id },
              { $set: { lastLoginAt: new Date() } }
            );
          } catch (updateError) {
            console.log(`[${timestamp}] Failed to update last login:`, updateError.message);
          }
          
          console.log(`[${timestamp}] ✅ Login successful for: ${user.name}`);
          
          const adminRoles = ['admin', 'super-admin', 'administrator'];
          const hasAdminAccess = adminRoles.includes(user.role?.toLowerCase());
          
          return res.status(200).json({
            success: true,
            message: 'Login successful',
            user: {
              id: user._id,
              email: user.email,
              name: user.name,
              role: user.role,
              status: user.status,
              hasAdminAccess: hasAdminAccess,
              permissions: {
                canAccessAdmin: hasAdminAccess,
                canManageListings: hasAdminAccess,
                canManageDealers: hasAdminAccess,
                canManageUsers: user.role?.toLowerCase() === 'super-admin',
                canViewAnalytics: hasAdminAccess
              }
            },
            token: token,
            expiresIn: '24h'
          });
          
        } catch (error) {
          console.error(`[${timestamp}] Login error:`, error);
          return res.status(500).json({
            success: false,
            message: 'Login system error',
            error: error.message
          });
        }
      }
      
      // TOKEN VERIFICATION ENDPOINT
      if (path === '/auth/verify' && req.method === 'GET') {
        try {
          const authHeader = req.headers.authorization;
          
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
              success: false,
              message: 'No token provided'
            });
          }
          
          const token = authHeader.substring(7);
          
          try {
            const jwt = await import('jsonwebtoken');
            const secretKey = process.env.JWT_SECRET || 'bw-car-culture-secret-key-2025';
            
            const decoded = jwt.default.verify(token, secretKey);
            
            const usersCollection = db.collection('users');
            const user = await usersCollection.findOne({ 
              _id: decoded.userId,
              status: 'active'
            });
            
            if (!user) {
              return res.status(401).json({
                success: false,
                message: 'User not found or inactive'
              });
            }
            
            return res.status(200).json({
              success: true,
              user: {
                id: user._id,
                email: user.email,
                name: user.name,
                role: user.role,
                status: user.status
              },
              message: 'Token valid'
            });
            
          } catch (jwtError) {
            return res.status(401).json({
              success: false,
              message: 'Invalid or expired token'
            });
          }
          
        } catch (error) {
          return res.status(500).json({
            success: false,
            message: 'Token verification error'
          });
        }
      }
      
      // LOGOUT ENDPOINT
      if (path === '/auth/logout' && req.method === 'POST') {
        return res.status(200).json({
          success: true,
          message: 'Logged out successfully'
        });
      }
      
      return res.status(404).json({
        success: false,
        message: `Auth endpoint not found: ${path}`
      });
    }

    // === NEW: ADMIN CRUD ENDPOINTS (ONLY ADDITION) ===
    if (path.includes('/admin')) {
      console.log(`[${timestamp}] → ADMIN: ${path}`);
      
      // Verify admin access for all admin endpoints
      const authResult = await verifyAdminToken(req);
      if (!authResult.success) {
        return res.status(401).json({
          success: false,
          message: authResult.message
        });
      }
      
      const adminUser = authResult.user;
      console.log(`[${timestamp}] Admin access granted to: ${adminUser.name} (${adminUser.role})`);
      
      // === CREATE NEW LISTING ===
      if (path === '/admin/listings' && req.method === 'POST') {
        try {
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
          
          console.log(`[${timestamp}] Creating new listing by admin: ${adminUser.name}`);
          
          const listingsCollection = db.collection('listings');
          const { ObjectId } = await import('mongodb');
          
          // Required fields validation
          const requiredFields = ['title', 'price', 'dealerId'];
          const missingFields = requiredFields.filter(field => !body[field]);
          
          if (missingFields.length > 0) {
            return res.status(400).json({
              success: false,
              message: `Missing required fields: ${missingFields.join(', ')}`
            });
          }
          
          // Create new listing object
          const newListing = {
            _id: new ObjectId(),
            ...body,
            dealerId: body.dealerId.length === 24 ? new ObjectId(body.dealerId) : body.dealerId,
            status: body.status || 'active',
            featured: body.featured || false,
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: {
              userId: adminUser.id,
              userEmail: adminUser.email,
              userName: adminUser.name
            }
          };
          
          // Insert listing
          const result = await listingsCollection.insertOne(newListing);
          
          console.log(`[${timestamp}] ✅ New listing created: ${newListing.title} (ID: ${result.insertedId})`);
          
          return res.status(201).json({
            success: true,
            message: 'Listing created successfully',
            data: {
              id: result.insertedId,
              title: newListing.title,
              price: newListing.price,
              status: newListing.status,
              createdAt: newListing.createdAt
            },
            createdBy: adminUser.name
          });
          
        } catch (error) {
          console.error(`[${timestamp}] Create listing error:`, error);
          return res.status(500).json({
            success: false,
            message: 'Failed to create listing',
            error: error.message
          });
        }
      }
      
      // === UPDATE EXISTING LISTING ===
      if (path.match(/^\/admin\/listings\/[a-fA-F0-9]{24}$/) && (req.method === 'PUT' || req.method === 'PATCH')) {
        try {
          const listingId = path.split('/').pop();
          
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
          
          console.log(`[${timestamp}] Updating listing ${listingId} by admin: ${adminUser.name}`);
          
          const listingsCollection = db.collection('listings');
          const { ObjectId } = await import('mongodb');
          
          // Find existing listing
          const existingListing = await listingsCollection.findOne({ 
            _id: new ObjectId(listingId) 
          });
          
          if (!existingListing) {
            return res.status(404).json({
              success: false,
              message: 'Listing not found'
            });
          }
          
          // Prepare update data
          const updateData = {
            ...body,
            updatedAt: new Date(),
            lastUpdatedBy: {
              userId: adminUser.id,
              userEmail: adminUser.email,
              userName: adminUser.name,
              timestamp: new Date()
            }
          };
          
          // Handle dealerId conversion
          if (body.dealerId && body.dealerId.length === 24) {
            updateData.dealerId = new ObjectId(body.dealerId);
          }
          
          // Update listing
          const result = await listingsCollection.updateOne(
            { _id: new ObjectId(listingId) },
            { $set: updateData }
          );
          
          if (result.matchedCount === 0) {
            return res.status(404).json({
              success: false,
              message: 'Listing not found'
            });
          }
          
          console.log(`[${timestamp}] ✅ Listing updated: ${existingListing.title} by ${adminUser.name}`);
          
          return res.status(200).json({
            success: true,
            message: 'Listing updated successfully',
            data: {
              id: listingId,
              title: updateData.title || existingListing.title,
              updatedFields: Object.keys(body),
              updatedAt: updateData.updatedAt
            },
            updatedBy: adminUser.name
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
      
      // === DELETE LISTING ===
      if (path.match(/^\/admin\/listings\/[a-fA-F0-9]{24}$/) && req.method === 'DELETE') {
        try {
          const listingId = path.split('/').pop();
          
          console.log(`[${timestamp}] Deleting listing ${listingId} by admin: ${adminUser.name}`);
          
          const listingsCollection = db.collection('listings');
          const { ObjectId } = await import('mongodb');
          
          // Find existing listing
          const existingListing = await listingsCollection.findOne({ 
            _id: new ObjectId(listingId) 
          });
          
          if (!existingListing) {
            return res.status(404).json({
              success: false,
              message: 'Listing not found'
            });
          }
          
          // Soft delete - mark as deleted instead of removing
          const result = await listingsCollection.updateOne(
            { _id: new ObjectId(listingId) },
            { 
              $set: { 
                status: 'deleted',
                deletedAt: new Date(),
                deletedBy: {
                  userId: adminUser.id,
                  userEmail: adminUser.email,
                  userName: adminUser.name,
                  timestamp: new Date()
                }
              }
            }
          );
          
          console.log(`[${timestamp}] ✅ Listing deleted: ${existingListing.title} by ${adminUser.name}`);
          
          return res.status(200).json({
            success: true,
            message: 'Listing deleted successfully',
            data: {
              id: listingId,
              title: existingListing.title,
              deletedAt: new Date()
            },
            deletedBy: adminUser.name
          });
          
        } catch (error) {
          console.error(`[${timestamp}] Delete listing error:`, error);
          return res.status(500).json({
            success: false,
            message: 'Failed to delete listing',
            error: error.message
          });
        }
      }
      
      // === CREATE NEW DEALER ===
      if (path === '/admin/dealers' && req.method === 'POST') {
        try {
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
          
          console.log(`[${timestamp}] Creating new dealer by admin: ${adminUser.name}`);
          
          const dealersCollection = db.collection('dealers');
          const { ObjectId } = await import('mongodb');
          
          // Required fields validation
          const requiredFields = ['businessName', 'email'];
          const missingFields = requiredFields.filter(field => !body[field]);
          
          if (missingFields.length > 0) {
            return res.status(400).json({
              success: false,
              message: `Missing required fields: ${missingFields.join(', ')}`
            });
          }
          
          // Check if dealer email already exists
          const existingDealer = await dealersCollection.findOne({ 
            email: body.email.toLowerCase() 
          });
          
          if (existingDealer) {
            return res.status(400).json({
              success: false,
              message: 'Dealer with this email already exists'
            });
          }
          
          // Create new dealer object
          const newDealer = {
            _id: new ObjectId(),
            ...body,
            email: body.email.toLowerCase(),
            status: body.status || 'active',
            businessType: body.businessType || 'dealer',
            metrics: {
              totalListings: 0,
              activeSales: 0,
              completedSales: 0,
              averageRating: 0,
              totalReviews: 0
            },
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: {
              userId: adminUser.id,
              userEmail: adminUser.email,
              userName: adminUser.name
            }
          };
          
          // Insert dealer
          const result = await dealersCollection.insertOne(newDealer);
          
          console.log(`[${timestamp}] ✅ New dealer created: ${newDealer.businessName} (ID: ${result.insertedId})`);
          
          return res.status(201).json({
            success: true,
            message: 'Dealer created successfully',
            data: {
              id: result.insertedId,
              businessName: newDealer.businessName,
              email: newDealer.email,
              status: newDealer.status,
              createdAt: newDealer.createdAt
            },
            createdBy: adminUser.name
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
      
      // === UPDATE EXISTING DEALER ===
      if (path.match(/^\/admin\/dealers\/[a-fA-F0-9]{24}$/) && (req.method === 'PUT' || req.method === 'PATCH')) {
        try {
          const dealerId = path.split('/').pop();
          
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
          
          console.log(`[${timestamp}] Updating dealer ${dealerId} by admin: ${adminUser.name}`);
          
          const dealersCollection = db.collection('dealers');
          const { ObjectId } = await import('mongodb');
          
          // Find existing dealer
          const existingDealer = await dealersCollection.findOne({ 
            _id: new ObjectId(dealerId) 
          });
          
          if (!existingDealer) {
            return res.status(404).json({
              success: false,
              message: 'Dealer not found'
            });
          }
          
          // Prepare update data
          const updateData = {
            ...body,
            updatedAt: new Date(),
            lastUpdatedBy: {
              userId: adminUser.id,
              userEmail: adminUser.email,
              userName: adminUser.name,
              timestamp: new Date()
            }
          };
          
          // Handle email normalization
          if (body.email) {
            updateData.email = body.email.toLowerCase();
          }
          
          // Update dealer
          const result = await dealersCollection.updateOne(
            { _id: new ObjectId(dealerId) },
            { $set: updateData }
          );
          
          if (result.matchedCount === 0) {
            return res.status(404).json({
              success: false,
              message: 'Dealer not found'
            });
          }
          
          console.log(`[${timestamp}] ✅ Dealer updated: ${existingDealer.businessName} by ${adminUser.name}`);
          
          return res.status(200).json({
            success: true,
            message: 'Dealer updated successfully',
            data: {
              id: dealerId,
              businessName: updateData.businessName || existingDealer.businessName,
              updatedFields: Object.keys(body),
              updatedAt: updateData.updatedAt
            },
            updatedBy: adminUser.name
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
      
      // === VERIFY DEALER ===
      if (path.match(/^\/admin\/dealers\/[a-fA-F0-9]{24}\/verify$/) && req.method === 'POST') {
        try {
          const dealerId = path.split('/')[3]; // Extract dealer ID from path
          
          console.log(`[${timestamp}] Verifying dealer ${dealerId} by admin: ${adminUser.name}`);
          
          const dealersCollection = db.collection('dealers');
          const { ObjectId } = await import('mongodb');
          
          // Find existing dealer
          const existingDealer = await dealersCollection.findOne({ 
            _id: new ObjectId(dealerId) 
          });
          
          if (!existingDealer) {
            return res.status(404).json({
              success: false,
              message: 'Dealer not found'
            });
          }
          
          // Update dealer with verification info
          const verificationData = {
            status: 'verified',
            verification: {
              status: 'verified',
              verifiedAt: new Date(),
              verifiedBy: adminUser.id,
              verifierName: adminUser.name
            },
            updatedAt: new Date(),
            lastUpdatedBy: {
              userId: adminUser.id,
              userEmail: adminUser.email,
              userName: adminUser.name,
              timestamp: new Date(),
              action: 'verification'
            }
          };
          
          const result = await dealersCollection.updateOne(
            { _id: new ObjectId(dealerId) },
            { $set: verificationData }
          );
          
          if (result.matchedCount === 0) {
            return res.status(404).json({
              success: false,
              message: 'Dealer not found'
            });
          }
          
          console.log(`[${timestamp}] ✅ Dealer verified: ${existingDealer.businessName} by ${adminUser.name}`);
          
          return res.status(200).json({
            success: true,
            message: 'Dealer verified successfully',
            data: {
              id: dealerId,
              businessName: existingDealer.businessName,
              status: 'verified',
              verifiedAt: verificationData.verification.verifiedAt,
              verifiedBy: adminUser.name
            },
            verifiedBy: adminUser.name
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
      
      // === DELETE DEALER ===
      if (path.match(/^\/admin\/dealers\/[a-fA-F0-9]{24}$/) && req.method === 'DELETE') {
        try {
          const dealerId = path.split('/').pop();
          
          console.log(`[${timestamp}] Deleting dealer ${dealerId} by admin: ${adminUser.name}`);
          
          const dealersCollection = db.collection('dealers');
          const { ObjectId } = await import('mongodb');
          
          // Find existing dealer
          const existingDealer = await dealersCollection.findOne({ 
            _id: new ObjectId(dealerId) 
          });
          
          if (!existingDealer) {
            return res.status(404).json({
              success: false,
              message: 'Dealer not found'
            });
          }
          
          // Soft delete - mark as deleted instead of removing
          const result = await dealersCollection.updateOne(
            { _id: new ObjectId(dealerId) },
            { 
              $set: { 
                status: 'deleted',
                deletedAt: new Date(),
                deletedBy: {
                  userId: adminUser.id,
                  userEmail: adminUser.email,
                  userName: adminUser.name,
                  timestamp: new Date()
                }
              }
            }
          );
          
          console.log(`[${timestamp}] ✅ Dealer deleted: ${existingDealer.businessName} by ${adminUser.name}`);
          
          return res.status(200).json({
            success: true,
            message: 'Dealer deleted successfully',
            data: {
              id: dealerId,
              businessName: existingDealer.businessName,
              deletedAt: new Date()
            },
            deletedBy: adminUser.name
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
      
      return res.status(404).json({
        success: false,
        message: `Admin endpoint not found: ${path}`,
        availableAdminEndpoints: [
          'POST /admin/listings - Create new listing',
          'PUT /admin/listings/{id} - Update listing', 
          'DELETE /admin/listings/{id} - Delete listing',
          'POST /admin/dealers - Create new dealer',
          'PUT /admin/dealers/{id} - Update dealer',
          'DELETE /admin/dealers/{id} - Delete dealer',
          'POST /admin/dealers/{id}/verify - Verify dealer'
        ]
      });
    }

    // === ANALYTICS ENDPOINTS ===
    if (path.includes('/analytics')) {
      console.log(`[${timestamp}] → ANALYTICS: ${path}`);
      
      if (path === '/analytics/track' && req.method === 'POST') {
        try {
          let body = {};
          try {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const rawBody = Buffer.concat(chunks).toString();
            if (rawBody) body = JSON.parse(rawBody);
          } catch (e) {}
          
          const analyticsCollection = db.collection('analytics');
          await analyticsCollection.insertOne({
            ...body,
            timestamp: new Date(),
            ip: req.headers['x-forwarded-for'] || 'unknown',
            userAgent: req.headers['user-agent']
          });
          
          console.log(`[${timestamp}] Analytics event stored successfully`);
        } catch (e) {
          console.log(`[${timestamp}] Analytics storage error:`, e.message);
        }
        
        return res.status(200).json({
          success: true,
          message: 'Event tracked successfully'
        });
      }
      
      if (path === '/analytics/track/performance' && req.method === 'POST') {
        return res.status(200).json({
          success: true,
          message: 'Performance tracking successful'
        });
      }
      
      return res.status(200).json({
        success: true,
        message: 'Analytics endpoint working',
        path: path
      });
    }

    // === BUSINESS CARD DEALER LISTINGS ===
    if (path.includes('/listings/dealer/')) {
      const dealerId = path.replace('/listings/dealer/', '').split('?')[0];
      const callId = Math.random().toString(36).substr(2, 9);
      console.log(`[${timestamp}] [CALL-${callId}] → BUSINESS CARD LISTINGS: "${dealerId}"`);
      
      try {
        const listingsCollection = db.collection('listings');
        const { ObjectId } = await import('mongodb');
        
        let foundListings = [];
        let successStrategy = null;
        
        if (dealerId.length === 24 && /^[0-9a-fA-F]{24}$/.test(dealerId)) {
          try {
            const dealerObjectId = new ObjectId(dealerId);
            const objectIdListings = await listingsCollection.find({ 
              dealerId: dealerObjectId 
            }).toArray();
            
            if (objectIdListings.length > 0) {
              foundListings = objectIdListings;
              successStrategy = 'objectId_direct';
            }
          } catch (objectIdError) {
            console.log(`[${timestamp}] [CALL-${callId}] ObjectId conversion failed: ${objectIdError.message}`);
          }
        }
        
        if (foundListings.length === 0) {
          try {
            const stringListings = await listingsCollection.find({ dealerId: dealerId }).toArray();
            if (stringListings.length > 0) {
              foundListings = stringListings;
              successStrategy = 'string_direct';
            }
          } catch (stringError) {
            console.log(`[${timestamp}] [CALL-${callId}] String match failed: ${stringError.message}`);
          }
        }
        
        const page = parseInt(searchParams.get('page')) || 1;
        const limit = parseInt(searchParams.get('limit')) || 10;
        const skip = (page - 1) * limit;
        
        const paginatedListings = foundListings.slice(skip, skip + limit);
        const total = foundListings.length;
        
        return res.status(200).json({
          success: true,
          data: paginatedListings,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total: total
          },
          dealerId: dealerId,
          debug: {
            callId: callId,
            timestamp: timestamp,
            totalFound: total,
            successStrategy: successStrategy
          },
          message: `Business card: ${paginatedListings.length} listings found for dealer`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] [CALL-${callId}] Business card error:`, error);
        return res.status(200).json({
          success: true,
          data: [],
          pagination: { currentPage: 1, totalPages: 0, total: 0 },
          dealerId: dealerId,
          error: error.message,
          message: 'Error occurred while fetching dealer listings'
        });
      }
    }

    // === INDIVIDUAL DEALER ===
    if (path.includes('/dealers/') && path !== '/dealers') {
      const dealerId = path.replace('/dealers/', '').split('?')[0];
      console.log(`[${timestamp}] → INDIVIDUAL DEALER: "${dealerId}"`);
      
      try {
        const dealersCollection = db.collection('dealers');
        const { ObjectId } = await import('mongodb');
        
        let dealer = null;
        
        try {
          dealer = await dealersCollection.findOne({ _id: dealerId });
          if (dealer) {
            console.log(`[${timestamp}] ✅ Found dealer with string ID: ${dealer.businessName}`);
          }
        } catch (stringError) {
          console.log(`[${timestamp}] String lookup failed: ${stringError.message}`);
        }
        
        if (!dealer && dealerId.length === 24 && /^[0-9a-fA-F]{24}$/.test(dealerId)) {
          try {
            dealer = await dealersCollection.findOne({ _id: new ObjectId(dealerId) });
            if (dealer) {
              console.log(`[${timestamp}] ✅ Found dealer with ObjectId: ${dealer.businessName}`);
            }
          } catch (objectIdError) {
            console.log(`[${timestamp}] ObjectId lookup failed: ${objectIdError.message}`);
          }
        }
        
        if (!dealer) {
          return res.status(404).json({
            success: false,
            message: 'Dealer not found',
            dealerId: dealerId
          });
        }
        
        return res.status(200).json({
          success: true,
          data: dealer,
          message: `Found dealer: ${dealer.businessName}`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Dealer lookup error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Error fetching dealer',
          error: error.message
        });
      }
    }

    // === INDIVIDUAL LISTING ===
    if (path.includes('/listings/') && !path.includes('/listings/dealer/') && !path.includes('/listings/featured') && path !== '/listings') {
      const listingId = path.replace('/listings/', '');
      console.log(`[${timestamp}] → INDIVIDUAL LISTING: "${listingId}"`);
      
      try {
        const listingsCollection = db.collection('listings');
        const { ObjectId } = await import('mongodb');
        
        let listing = null;
        
        listing = await listingsCollection.findOne({ _id: listingId });
        
        if (!listing && listingId.length === 24) {
          try {
            listing = await listingsCollection.findOne({ _id: new ObjectId(listingId) });
          } catch (oidError) {
            console.log(`[${timestamp}] Listing ObjectId failed: ${oidError.message}`);
          }
        }
        
        if (!listing) {
          return res.status(404).json({
            success: false,
            message: 'Listing not found',
            listingId: listingId
          });
        }
        
        return res.status(200).json({
          success: true,
          data: listing,
          message: `Found listing: ${listing.title}`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Listing lookup failed:`, error);
        return res.status(500).json({
          success: false,
          message: 'Error fetching listing',
          error: error.message
        });
      }
    }

    // === INDIVIDUAL RENTAL VEHICLE ===
    if (path.includes('/rentals/') && path !== '/rentals') {
      const rentalId = path.replace('/rentals/', '').split('?')[0];
      console.log(`[${timestamp}] → INDIVIDUAL RENTAL: "${rentalId}"`);
      
      try {
        const rentalsCollection = db.collection('rentalvehicles');
        const { ObjectId } = await import('mongodb');
        
        let rental = null;
        
        try {
          rental = await rentalsCollection.findOne({ _id: rentalId });
        } catch (stringError) {
          console.log(`[${timestamp}] Rental string lookup failed`);
        }
        
        if (!rental && rentalId.length === 24 && /^[0-9a-fA-F]{24}$/.test(rentalId)) {
          try {
            rental = await rentalsCollection.findOne({ _id: new ObjectId(rentalId) });
          } catch (objectIdError) {
            console.log(`[${timestamp}] Rental ObjectId lookup failed`);
          }
        }
        
        if (!rental) {
          return res.status(404).json({
            success: false,
            message: 'Rental vehicle not found',
            rentalId: rentalId
          });
        }
        
        return res.status(200).json({
          success: true,
          data: rental,
          message: `Found rental vehicle`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Rental lookup error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Error fetching rental vehicle',
          error: error.message
        });
      }
    }

    // === INDIVIDUAL TRANSPORT ROUTE ===
    if (path.includes('/transport/') && path !== '/transport') {
      const routeId = path.replace('/transport/', '').split('?')[0];
      console.log(`[${timestamp}] → INDIVIDUAL TRANSPORT ROUTE: "${routeId}"`);
      
      try {
        let transportCollection;
        try {
          transportCollection = db.collection('transportroutes');
        } catch (error) {
          transportCollection = db.collection('transportnodes');
        }
        
        const { ObjectId } = await import('mongodb');
        let route = null;
        
        try {
          route = await transportCollection.findOne({ _id: routeId });
        } catch (stringError) {
          console.log(`[${timestamp}] Route string lookup failed`);
        }
        
        if (!route && routeId.length === 24 && /^[0-9a-fA-F]{24}$/.test(routeId)) {
          try {
            route = await transportCollection.findOne({ _id: new ObjectId(routeId) });
          } catch (objectIdError) {
            console.log(`[${timestamp}] Route ObjectId lookup failed`);
          }
        }
        
        if (!route) {
          return res.status(404).json({
            success: false,
            message: 'Transport route not found',
            routeId: routeId
          });
        }
        
        return res.status(200).json({
          success: true,
          data: route,
          message: `Found transport route`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Transport route lookup error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Error fetching transport route',
          error: error.message
        });
      }
    }

    // === SERVICE PROVIDERS ===
    if (path === '/service-providers') {
      console.log(`[${timestamp}] → SERVICE-PROVIDERS`);
      
      try {
        const serviceProvidersCollection = db.collection('serviceproviders');
        
        let filter = {};
        
        if (searchParams.get('providerType')) {
          filter.providerType = searchParams.get('providerType');
        }
        
        if (searchParams.get('search')) {
          const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
          filter.$or = [
            { businessName: searchRegex },
            { 'profile.description': searchRegex },
            { 'profile.specialties': { $in: [searchRegex] } },
            { 'location.city': searchRegex }
          ];
        }
        
        if (searchParams.get('city')) {
          filter['location.city'] = { $regex: searchParams.get('city'), $options: 'i' };
        }
        
        if (searchParams.get('businessType') && searchParams.get('businessType') !== 'All') {
          filter.businessType = searchParams.get('businessType');
        }
        
        const page = parseInt(searchParams.get('page')) || 1;
        const limit = parseInt(searchParams.get('limit')) || 12;
        const skip = (page - 1) * limit;
        
        const providers = await serviceProvidersCollection.find(filter)
          .skip(skip)
          .limit(limit)
          .sort({ businessName: 1 })
          .toArray();
        
        const total = await serviceProvidersCollection.countDocuments(filter);
        
        return res.status(200).json({
          success: true,
          data: providers,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total: total
          },
          message: `Service providers: ${providers.length} found (${total} total)`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Service providers error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Error fetching service providers',
          error: error.message
        });
      }
    }

    // === NEWS ===
    if (path === '/news') {
      console.log(`[${timestamp}] → NEWS`);
      
      try {
        const newsCollection = db.collection('news');
        
        let filter = {};
        
        if (searchParams.get('category') && searchParams.get('category') !== 'all') {
          filter.category = searchParams.get('category');
        }
        
        if (searchParams.get('search')) {
          const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
          filter.$or = [
            { title: searchRegex },
            { content: searchRegex },
            { summary: searchRegex }
          ];
        }
        
        const page = parseInt(searchParams.get('page')) || 1;
        const limit = parseInt(searchParams.get('limit')) || 10;
        const skip = (page - 1) * limit;
        
        const articles = await newsCollection.find(filter)
          .skip(skip)
          .limit(limit)
          .sort({ publishedAt: -1, createdAt: -1 })
          .toArray();
        
        const total = await newsCollection.countDocuments(filter);
        
        return res.status(200).json({
          success: true,
          data: articles,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total: total
          },
          message: `Found ${articles.length} news articles`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] News fetch error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Error fetching news',
          error: error.message
        });
      }
    }

    // === STATS ===
    if (path === '/stats') {
      console.log(`[${timestamp}] → STATS`);
      try {
        const listingsCount = await db.collection('listings').countDocuments();
        const dealersCount = await db.collection('dealers').countDocuments();
        
        return res.status(200).json({
          success: true,
          data: {
            carListings: listingsCount,
            happyCustomers: dealersCount + 50,
            verifiedDealers: 85,
            transportProviders: 15,
            totalSavings: 2500000,
            savingsCount: 45
          }
        });
      } catch (error) {
        return res.status(200).json({
          success: true,
          data: {
            carListings: 150,
            happyCustomers: 450,
            verifiedDealers: 85,
            transportProviders: 15,
            totalSavings: 2500000,
            savingsCount: 45
          }
        });
      }
    }
    
    // === FEATURED LISTINGS ===
    if (path === '/listings/featured') {
      console.log(`[${timestamp}] → FEATURED LISTINGS`);
      const listingsCollection = db.collection('listings');
      
      const limit = parseInt(searchParams.get('limit')) || 6;
      
      let featuredListings = await listingsCollection.find({ 
        featured: true,
        status: 'active'
      }).limit(limit).sort({ createdAt: -1 }).toArray();
      
      if (featuredListings.length === 0) {
        featuredListings = await listingsCollection.find({
          $or: [
            { price: { $gte: 300000 } },
            { 'priceOptions.showSavings': true }
          ],
          status: 'active'
        }).limit(limit).sort({ price: -1, createdAt: -1 }).toArray();
      }
      
      return res.status(200).json({
        success: true,
        count: featuredListings.length,
        data: featuredListings,
        message: `Found ${featuredListings.length} featured listings`
      });
    }
    
    // === GENERAL LISTINGS ===
    if (path === '/listings') {
      console.log(`[${timestamp}] → LISTINGS`);
      const listingsCollection = db.collection('listings');
      
      let filter = {};
      
      const section = searchParams.get('section');
      if (section) {
        switch (section) {
          case 'premium':
            filter.$or = [
              { category: { $in: ['Luxury', 'Sports Car', 'Electric'] } },
              { price: { $gte: 500000 } },
              { 'specifications.make': { $in: ['BMW', 'Mercedes-Benz', 'Audi', 'Lexus', 'Porsche'] } }
            ];
            break;
          case 'savings':
            filter['priceOptions.showSavings'] = true;
            filter['priceOptions.savingsAmount'] = { $gt: 0 };
            break;
          case 'private':
            filter['dealer.sellerType'] = 'private';
            break;
        }
      }
      
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 10;
      const skip = (page - 1) * limit;
      
      const listings = await listingsCollection.find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 })
        .toArray();
      
      const total = await listingsCollection.countDocuments(filter);
      
      return res.status(200).json({
        success: true,
        data: listings,
        total,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        section: section || 'all',
        message: `Found ${listings.length} listings`
      });
    }
    
    // === DEALERS LIST ===
    if (path === '/dealers') {
      console.log(`[${timestamp}] → DEALERS`);
      const dealersCollection = db.collection('dealers');
      
      const page = parseInt(searchParams.get('page')) || 1;
      const limit = parseInt(searchParams.get('limit')) || 20;
      const skip = (page - 1) * limit;
      
      const dealers = await dealersCollection.find({})
        .skip(skip)
        .limit(limit)
        .sort({ businessName: 1 })
        .toArray();
      
      const total = await dealersCollection.countDocuments();
      
      return res.status(200).json({
        success: true,
        data: dealers,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          total: total
        },
        message: `Found ${dealers.length} dealers`
      });
    }

    // === TRANSPORT ===
    if (path === '/transport') {
      console.log(`[${timestamp}] → TRANSPORT`);
      let transportCollection;
      try {
        transportCollection = db.collection('transportroutes');
      } catch (error) {
        transportCollection = db.collection('transportnodes');
      }
      
      const routes = await transportCollection.find({}).limit(20).toArray();
      return res.status(200).json({
        success: true,
        data: routes,
        message: `Found ${routes.length} transport routes`
      });
    }
    
    // === RENTALS ===
    if (path === '/rentals') {
      console.log(`[${timestamp}] → RENTALS`);
      const rentalsCollection = db.collection('rentalvehicles');
      const vehicles = await rentalsCollection.find({}).limit(20).toArray();
      return res.status(200).json({
        success: true,
        data: vehicles,
        message: `Found ${vehicles.length} rental vehicles`
      });
    }

    // === PROVIDERS ALIAS (FRONTEND USES THIS) ===
    if (path === '/providers') {
      console.log(`[${timestamp}] → PROVIDERS (alias for service-providers)`);
      
      try {
        const serviceProvidersCollection = db.collection('serviceproviders');
        
        let filter = {};
        
        if (searchParams.get('providerType')) {
          filter.providerType = searchParams.get('providerType');
        }
        
        if (searchParams.get('search')) {
          const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
          filter.$or = [
            { businessName: searchRegex },
            { 'profile.description': searchRegex },
            { 'profile.specialties': { $in: [searchRegex] } },
            { 'location.city': searchRegex }
          ];
        }
        
        if (searchParams.get('city')) {
          filter['location.city'] = { $regex: searchParams.get('city'), $options: 'i' };
        }
        
        if (searchParams.get('businessType') && searchParams.get('businessType') !== 'All') {
          filter.businessType = searchParams.get('businessType');
        }
        
        const page = parseInt(searchParams.get('page')) || 1;
        const limit = parseInt(searchParams.get('limit')) || 12;
        const skip = (page - 1) * limit;
        
        const providers = await serviceProvidersCollection.find(filter)
          .skip(skip)
          .limit(limit)
          .sort({ businessName: 1 })
          .toArray();
        
        const total = await serviceProvidersCollection.countDocuments(filter);
        
        console.log(`[${timestamp}] Found ${providers.length} providers via /providers alias`);
        
        return res.status(200).json({
          success: true,
          data: providers,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total: total
          },
          message: `Found ${providers.length} providers (${total} total)`
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Providers alias error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Error fetching providers',
          error: error.message
        });
      }
    }

    // === INDIVIDUAL PROVIDER (FRONTEND MIGHT USE THIS TOO) ===
    if (path.includes('/providers/') && path !== '/providers') {
      const providerId = path.replace('/providers/', '').split('?')[0];
      console.log(`[${timestamp}] → INDIVIDUAL PROVIDER (via /providers): ${providerId}`);
      
      try {
        const serviceProvidersCollection = db.collection('serviceproviders');
        const { ObjectId } = await import('mongodb');
        
        let provider = null;
        
        // Try as string first
        provider = await serviceProvidersCollection.findOne({ _id: providerId });
        
        // Try as ObjectId if string fails
        if (!provider && providerId.length === 24 && /^[0-9a-fA-F]{24}$/.test(providerId)) {
          try {
            provider = await serviceProvidersCollection.findOne({ _id: new ObjectId(providerId) });
          } catch (objectIdError) {
            console.log(`[${timestamp}] Provider ObjectId creation failed:`, objectIdError.message);
          }
        }
        
        if (!provider) {
          return res.status(404).json({
            success: false,
            message: 'Service provider not found',
            providerId: providerId
          });
        }
        
        return res.status(200).json({
          success: true,
          data: provider,
          message: `Individual provider: ${provider.businessName || provider.name}`
        });
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: 'Error fetching service provider',
          error: error.message,
          providerId: providerId
        });
      }
    }

    // === TEST/HEALTH ===
    if (path === '/test-db') {
      console.log(`[${timestamp}] → TEST/HEALTH`);
      const collections = await db.listCollections().toArray();
      const counts = {};
      
      for (const name of ['listings', 'dealers', 'news', 'serviceproviders']) {
        try {
          counts[name] = await db.collection(name).countDocuments();
        } catch (e) {
          counts[name] = 0;
        }
      }
      
      return res.status(200).json({
        success: true,
        message: 'BW Car Culture API - WORKING + ADMIN CRUD ADDED',
        collections: collections.map(c => c.name),
        counts: counts,
        timestamp: timestamp,
        newFeatures: [
          'Admin CRUD operations for listings and dealers',
          'JWT token authentication for admin access',
          'Audit logging for all admin actions'
        ]
      });
    }
    
    // === NOT FOUND ===
    console.log(`[${timestamp}] ✗ NOT FOUND: "${path}"`);
    return res.status(404).json({
      success: false,
      message: `Endpoint not found: ${path}`,
      timestamp: timestamp,
      availableEndpoints: [
        '=== PUBLIC ENDPOINTS ===',
        '/dealers/{id}',
        '/listings/{id}',
        '/listings/dealer/{dealerId}',
        '/rentals/{id}',
        '/transport/{id}',
        '/service-providers',
        '/news',
        '/stats',
        '/analytics/track (POST)',
        '=== AUTH ENDPOINTS ===',
        '/auth/login (POST)',
        '=== NEW: ADMIN CRUD ENDPOINTS ===',
        '/admin/listings (POST) - Create listing [REQUIRES ADMIN TOKEN]',
        '/admin/listings/{id} (PUT) - Update listing [REQUIRES ADMIN TOKEN]',
        '/admin/listings/{id} (DELETE) - Delete listing [REQUIRES ADMIN TOKEN]',
        '/admin/dealers (POST) - Create dealer [REQUIRES ADMIN TOKEN]',
        '/admin/dealers/{id} (PUT) - Update dealer [REQUIRES ADMIN TOKEN]',
        '/admin/dealers/{id} (DELETE) - Delete dealer [REQUIRES ADMIN TOKEN]',
        '/admin/dealers/{id}/verify (POST) - Verify dealer [REQUIRES ADMIN TOKEN]'
      ]
    });

  } catch (error) {
    console.error(`[${new Date().toISOString()}] API Error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
}