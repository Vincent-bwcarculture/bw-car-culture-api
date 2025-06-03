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

// Admin token verification helper
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
            
            // Try multiple lookup strategies
            let user = null;
            
            // Try string ID first
            try {
              user = await usersCollection.findOne({ 
                _id: decoded.userId,
                status: 'active'
              });
            } catch (stringError) {
              console.log(`[${timestamp}] String ID lookup failed: ${stringError.message}`);
            }
            
            // Try ObjectId if string failed
            if (!user && decoded.userId && typeof decoded.userId === 'string' && decoded.userId.length === 24) {
              try {
                const { ObjectId } = await import('mongodb');
                user = await usersCollection.findOne({ 
                  _id: new ObjectId(decoded.userId),
                  status: 'active'
                });
              } catch (objectIdError) {
                console.log(`[${timestamp}] ObjectId lookup failed: ${objectIdError.message}`);
              }
            }
            
            // Try email lookup as fallback
            if (!user && decoded.email) {
              try {
                user = await usersCollection.findOne({ 
                  email: decoded.email,
                  status: 'active'
                });
              } catch (emailError) {
                console.log(`[${timestamp}] Email lookup failed: ${emailError.message}`);
              }
            }
            
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
      
      // GET USERS FOR DEALER FORM
      if (path === '/auth/users' && req.method === 'GET') {
        try {
          console.log(`[${timestamp}] → GET USERS for dealer form`);
          
          const usersCollection = db.collection('users');
          
          // Get users - only inclusion projection (no exclusion)
          const users = await usersCollection.find(
            { 
              status: 'active'
            },
            { 
              projection: {
                _id: 1,
                name: 1,
                email: 1,
                role: 1,
                status: 1,
                createdAt: 1
                // Password automatically excluded since it's not listed
              }
            }
          ).sort({ name: 1 }).toArray();
          
          // Filter out users who already have dealer associations (optional)
          const dealersCollection = db.collection('dealers');
          const usersWithDealers = await dealersCollection.find({}, { projection: { user: 1 } }).toArray();
          const assignedUserIds = usersWithDealers.map(d => d.user?.toString()).filter(Boolean);
          
          // Separate assigned and available users
          const availableUsers = users.filter(user => !assignedUserIds.includes(user._id.toString()));
          const assignedUsers = users.filter(user => assignedUserIds.includes(user._id.toString()));
          
          console.log(`[${timestamp}] ✅ Found ${users.length} users (${availableUsers.length} available, ${assignedUsers.length} assigned)`);
          
          return res.status(200).json({
            success: true,
            data: users, // Return all users - let frontend decide filtering
            available: availableUsers, // Users without dealer associations
            assigned: assignedUsers, // Users already with dealers
            total: users.length,
            message: `Found ${users.length} users for dealer assignment`
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
      
      return res.status(404).json({
        success: false,
        message: `Auth endpoint not found: ${path}`
      });
    }

    // === ADMIN CRUD ENDPOINTS ===
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

    // === TRADITIONAL API ENDPOINTS FOR FRONTEND FORM ===
    
    // === CREATE DEALER (TRADITIONAL ENDPOINT) ===
    if (path === '/api/dealers' && req.method === 'POST') {
      try {
        console.log(`[${timestamp}] → TRADITIONAL API: Create Dealer`);
        
        // Check if user is authenticated (optional, or verify JWT)
        const authHeader = req.headers.authorization;
        let adminUser = null;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const authResult = await verifyAdminToken(req);
          if (authResult.success) {
            adminUser = authResult.user;
            console.log(`[${timestamp}] Authenticated user: ${adminUser.name}`);
          }
        }
        
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
        
        console.log(`[${timestamp}] Creating dealer via traditional API:`, body);
        
        const dealersCollection = db.collection('dealers');
        const { ObjectId } = await import('mongodb');
        
        // Check if dealer already exists
        if (body.businessName) {
          const existingDealer = await dealersCollection.findOne({ 
            businessName: body.businessName 
          });
          
          if (existingDealer) {
            return res.status(400).json({
              success: false,
              message: 'Dealer with this business name already exists'
            });
          }
        }
        
        // Create new dealer object (matching traditional structure)
        const newDealer = {
          _id: new ObjectId(),
          businessName: body.businessName,
          businessType: body.businessType || 'independent',
          sellerType: body.sellerType || 'dealership',
          status: body.status || 'active',
          user: body.user ? (body.user.length === 24 ? new ObjectId(body.user) : body.user) : null,
          
          // Handle contact data
          contact: {
            phone: body.contact?.phone || body.phone,
            email: body.contact?.email || body.email,
            website: body.contact?.website || body.website
          },
          
          // Handle location data  
          location: {
            address: body.location?.address || body.address,
            city: body.location?.city || body.city,
            state: body.location?.state || body.state,
            country: body.location?.country || 'Botswana'
          },
          
          // Handle profile data
          profile: {
            logo: body.profile?.logo || '/images/placeholders/dealer-logo.jpg',
            banner: body.profile?.banner || '/images/placeholders/dealer-banner.jpg',
            description: body.profile?.description || '',
            specialties: body.profile?.specialties || [],
            workingHours: body.profile?.workingHours || {}
          },
          
          // Handle subscription data
          subscription: {
            tier: body.subscription?.tier || body.subscription?.plan || 'basic',
            status: body.subscription?.status || 'active',
            startDate: new Date(),
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year
          },
          
          // Handle private seller data
          privateSeller: body.privateSeller || null,
          
          // Verification
          verification: {
            status: 'pending',
            verifiedAt: null
          },
          
          // Metrics
          metrics: {
            totalListings: 0,
            activeSales: 0,
            averageRating: 0,
            totalReviews: 0
          },
          
          // Timestamps
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        // Add created by info if admin user exists
        if (adminUser) {
          newDealer.createdBy = {
            userId: adminUser.id,
            userEmail: adminUser.email,
            userName: adminUser.name
          };
        }
        
        // Insert dealer
        const result = await dealersCollection.insertOne(newDealer);
        
        console.log(`[${timestamp}] ✅ Dealer created via traditional API: ${newDealer.businessName} (ID: ${result.insertedId})`);
        
        // Return response in format expected by frontend
        return res.status(201).json({
          success: true,
          data: {
            ...newDealer,
            _id: result.insertedId
          }
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Traditional API create dealer error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to create dealer',
          error: error.message
        });
      }
    }
    
    // === GET ALL DEALERS (TRADITIONAL ENDPOINT) ===
    if (path === '/api/dealers' && req.method === 'GET') {
      console.log(`[${timestamp}] → TRADITIONAL API: Get All Dealers`);
      
      try {
        const dealersCollection = db.collection('dealers');
        
        // Build filter based on query parameters
        let filter = {};
        
        if (searchParams.get('status') && searchParams.get('status') !== 'all') {
          filter.status = searchParams.get('status');
        }
        
        if (searchParams.get('sellerType') && searchParams.get('sellerType') !== 'all') {
          filter.sellerType = searchParams.get('sellerType');
        }
        
        if (searchParams.get('businessType') && searchParams.get('businessType') !== 'all') {
          filter.businessType = searchParams.get('businessType');
        }
        
        if (searchParams.get('search')) {
          const searchTerm = searchParams.get('search');
          filter.$or = [
            { businessName: { $regex: searchTerm, $options: 'i' } },
            { 'contact.email': { $regex: searchTerm, $options: 'i' } },
            { 'location.city': { $regex: searchTerm, $options: 'i' } }
          ];
        }
        
        // Pagination
        const page = parseInt(searchParams.get('page')) || 1;
        const limit = parseInt(searchParams.get('limit')) || 10;
        const skip = (page - 1) * limit;
        
        // Get total count
        const total = await dealersCollection.countDocuments(filter);
        
        // Get dealers
        const dealers = await dealersCollection.find(filter)
          .skip(skip)
          .limit(limit)
          .sort({ createdAt: -1 })
          .toArray();
        
        // Return response in traditional format
        return res.status(200).json({
          success: true,
          data: dealers,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total: total
          }
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Traditional API get dealers error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to get dealers',
          error: error.message
        });
      }
    }
    
    // === GET DEALERS FOR DROPDOWN (TRADITIONAL ENDPOINT) ===
    if (path === '/api/dealers/all' && req.method === 'GET') {
      console.log(`[${timestamp}] → TRADITIONAL API: Get Dealers for Dropdown`);
      
      try {
        const dealersCollection = db.collection('dealers');
        
        // Get active dealers for dropdown
        const dealers = await dealersCollection.find({ 
          status: 'active' 
        })
        .project({
          businessName: 1,
          'profile.logo': 1,
          'verification.status': 1,
          sellerType: 1,
          businessType: 1,
          privateSeller: 1
        })
        .sort({ businessName: 1 })
        .toArray();
        
        // Map to format expected by dropdown
        const dealersForDropdown = dealers.map(dealer => ({
          _id: dealer._id,
          businessName: dealer.businessName,
          name: dealer.businessName,
          logo: dealer.profile?.logo,
          sellerType: dealer.sellerType || 'dealership',
          businessType: dealer.businessType,
          privateSeller: dealer.privateSeller,
          verification: {
            isVerified: dealer.verification?.status === 'verified'
          },
          displayName: dealer.sellerType === 'private' && dealer.privateSeller
            ? `${dealer.privateSeller.firstName} ${dealer.privateSeller.lastName}`
            : dealer.businessName
        }));
        
        return res.status(200).json({
          success: true,
          count: dealersForDropdown.length,
          data: dealersForDropdown
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Traditional API get dealers dropdown error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to get dealers for dropdown',
          error: error.message
        });
      }
    }

    // === FRONTEND COMPATIBLE /dealers ENDPOINTS ===
    // These endpoints match what your dealerService.js expects
    
    // === CREATE DEALER (FRONTEND ENDPOINT) ===
    if (path === '/dealers' && req.method === 'POST') {
      try {
        console.log(`[${timestamp}] → FRONTEND DEALERS: Create Dealer`);
        
        // Check authentication (dealerService sends Bearer token)
        const authHeader = req.headers.authorization;
        let adminUser = null;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const authResult = await verifyAdminToken(req);
          if (authResult.success) {
            adminUser = authResult.user;
            console.log(`[${timestamp}] Authenticated admin: ${adminUser.name}`);
          } else {
            console.log(`[${timestamp}] Auth failed: ${authResult.message}`);
          }
        }
        
        // Parse multipart FormData (dealerService sends FormData)
        let dealerData = {};
        let body = {};
        
        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const rawBody = Buffer.concat(chunks).toString();
          
          // Try to parse as JSON first (fallback)
          if (rawBody.startsWith('{')) {
            body = JSON.parse(rawBody);
            dealerData = body;
          } else {
            // Handle FormData (multipart) - for now, extract dealerData field
            if (rawBody.includes('dealerData')) {
              const dealerDataMatch = rawBody.match(/name="dealerData"[^]*?({[^}]+})/);
              if (dealerDataMatch) {
                dealerData = JSON.parse(dealerDataMatch[1]);
              }
            }
            
            // Extract individual fields as fallback
            const extractField = (fieldName) => {
              const regex = new RegExp(`name="${fieldName}"[^]*?\\r\\n\\r\\n([^\\r\\n]+)`);
              const match = rawBody.match(regex);
              return match ? match[1] : null;
            };
            
            if (!dealerData.businessName) dealerData.businessName = extractField('businessName');
            if (!dealerData.businessType) dealerData.businessType = extractField('businessType');
            if (!dealerData.status) dealerData.status = extractField('status') || 'active';
            if (!dealerData.user) dealerData.user = extractField('user');
            
            // Parse JSON fields
            try {
              if (!dealerData.contact && extractField('contact')) {
                dealerData.contact = JSON.parse(extractField('contact'));
              }
              if (!dealerData.location && extractField('location')) {
                dealerData.location = JSON.parse(extractField('location'));
              }
              if (!dealerData.profile && extractField('profile')) {
                dealerData.profile = JSON.parse(extractField('profile'));
              }
              if (!dealerData.subscription && extractField('subscription')) {
                dealerData.subscription = JSON.parse(extractField('subscription'));
              }
              if (!dealerData.privateSeller && extractField('privateSeller')) {
                dealerData.privateSeller = JSON.parse(extractField('privateSeller'));
              }
            } catch (parseError) {
              console.log(`[${timestamp}] JSON parsing warning:`, parseError.message);
            }
          }
        } catch (parseError) {
          console.error(`[${timestamp}] Body parsing error:`, parseError);
          return res.status(400).json({
            success: false,
            message: 'Invalid request body format'
          });
        }
        
        console.log(`[${timestamp}] Parsed dealer data:`, {
          businessName: dealerData.businessName,
          sellerType: dealerData.sellerType,
          hasContact: !!dealerData.contact,
          hasLocation: !!dealerData.location,
          hasProfile: !!dealerData.profile
        });
        
        const dealersCollection = db.collection('dealers');
        const { ObjectId } = await import('mongodb');
        
        // Validate required fields
        if (!dealerData.businessName) {
          return res.status(400).json({
            success: false,
            message: 'Business name is required'
          });
        }
        
        // Check for existing dealer
        const existingDealer = await dealersCollection.findOne({ 
          businessName: dealerData.businessName 
        });
        
        if (existingDealer) {
          return res.status(400).json({
            success: false,
            message: 'Dealer with this business name already exists'
          });
        }
        
        // Create dealer object (same structure as /api/dealers)
        const newDealer = {
          _id: new ObjectId(),
          businessName: dealerData.businessName,
          businessType: dealerData.businessType || 'independent',
          sellerType: dealerData.sellerType || 'dealership',
          status: dealerData.status || 'active',
          user: dealerData.user ? (dealerData.user.length === 24 ? new ObjectId(dealerData.user) : dealerData.user) : null,
          
          // Contact data
          contact: {
            phone: dealerData.contact?.phone || '',
            email: dealerData.contact?.email || '',
            website: dealerData.contact?.website || ''
          },
          
          // Location data  
          location: {
            address: dealerData.location?.address || '',
            city: dealerData.location?.city || '',
            state: dealerData.location?.state || '',
            country: dealerData.location?.country || 'Botswana'
          },
          
          // Profile data
          profile: {
            logo: dealerData.profile?.logo || '/images/placeholders/dealer-logo.jpg',
            banner: dealerData.profile?.banner || '/images/placeholders/dealer-banner.jpg',
            description: dealerData.profile?.description || '',
            specialties: dealerData.profile?.specialties || [],
            workingHours: dealerData.profile?.workingHours || {}
          },
          
          // Subscription data
          subscription: {
            tier: dealerData.subscription?.tier || 'basic',
            status: dealerData.subscription?.status || 'active',
            startDate: new Date(),
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          },
          
          // Private seller data
          privateSeller: dealerData.privateSeller || null,
          
          // Verification
          verification: {
            status: 'pending',
            verifiedAt: null
          },
          
          // Metrics
          metrics: {
            totalListings: 0,
            activeSales: 0,
            averageRating: 0,
            totalReviews: 0
          },
          
          // Timestamps
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        // Add created by info if admin user exists
        if (adminUser) {
          newDealer.createdBy = {
            userId: adminUser.id,
            userEmail: adminUser.email,
            userName: adminUser.name
          };
        }
        
        // Insert dealer
        const result = await dealersCollection.insertOne(newDealer);
        
        console.log(`[${timestamp}] ✅ Dealer created via /dealers endpoint: ${newDealer.businessName} (ID: ${result.insertedId})`);
        
        // Return response in format expected by dealerService
        return res.status(201).json({
          success: true,
          message: 'Dealer created successfully',
          data: {
            ...newDealer,
            _id: result.insertedId
          }
        });
        
      } catch (error) {
        console.error(`[${timestamp}] /dealers create error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to create dealer',
          error: error.message
        });
      }
    }
    
    // === GET DEALERS (FRONTEND ENDPOINT) ===
    if (path === '/dealers' && req.method === 'GET') {
      console.log(`[${timestamp}] → FRONTEND DEALERS: Get Dealers`);
      
      try {
        const dealersCollection = db.collection('dealers');
        
        // Build filter based on query parameters
        let filter = {};
        
        if (searchParams.get('status') && searchParams.get('status') !== 'all') {
          filter.status = searchParams.get('status');
        }
        
        if (searchParams.get('sellerType') && searchParams.get('sellerType') !== 'all') {
          filter.sellerType = searchParams.get('sellerType');
        }
        
        if (searchParams.get('businessType') && searchParams.get('businessType') !== 'all') {
          filter.businessType = searchParams.get('businessType');
        }
        
        if (searchParams.get('search')) {
          const searchTerm = searchParams.get('search');
          filter.$or = [
            { businessName: { $regex: searchTerm, $options: 'i' } },
            { 'contact.email': { $regex: searchTerm, $options: 'i' } },
            { 'location.city': { $regex: searchTerm, $options: 'i' } }
          ];
        }
        
        // Pagination
        const page = parseInt(searchParams.get('page')) || 1;
        const limit = parseInt(searchParams.get('limit')) || 10;
        const skip = (page - 1) * limit;
        
        // Sorting
        let sort = { createdAt: -1 };
        if (searchParams.get('sort')) {
          const sortParam = searchParams.get('sort');
          if (sortParam.startsWith('-')) {
            sort = { [sortParam.substring(1)]: -1 };
          } else {
            sort = { [sortParam]: 1 };
          }
        }
        
        // Get total count
        const total = await dealersCollection.countDocuments(filter);
        
        // Get dealers
        const dealers = await dealersCollection.find(filter)
          .skip(skip)
          .limit(limit)
          .sort(sort)
          .toArray();
        
        // Return response in format expected by dealerService
        return res.status(200).json({
          success: true,
          data: dealers,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total: total
          }
        });
        
      } catch (error) {
        console.error(`[${timestamp}] /dealers get error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to get dealers',
          error: error.message
        });
      }
    }
    
    // === UPDATE DEALER (FRONTEND ENDPOINT) ===
    if (path.match(/^\/dealers\/[a-fA-F0-9]{24}$/) && req.method === 'PUT') {
      const dealerId = path.split('/').pop();
      console.log(`[${timestamp}] → FRONTEND DEALERS: Update Dealer ${dealerId}`);
      
      try {
        // Check authentication
        const authHeader = req.headers.authorization;
        let adminUser = null;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const authResult = await verifyAdminToken(req);
          if (authResult.success) {
            adminUser = authResult.user;
          }
        }
        
        // Parse FormData similar to create
        let dealerData = {};
        
        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const rawBody = Buffer.concat(chunks).toString();
          
          if (rawBody.startsWith('{')) {
            dealerData = JSON.parse(rawBody);
          } else {
            // Handle FormData
            if (rawBody.includes('dealerData')) {
              const dealerDataMatch = rawBody.match(/name="dealerData"[^]*?({[^}]+})/);
              if (dealerDataMatch) {
                dealerData = JSON.parse(dealerDataMatch[1]);
              }
            }
          }
        } catch (parseError) {
          return res.status(400).json({
            success: false,
            message: 'Invalid request body format'
          });
        }
        
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
          ...dealerData,
          updatedAt: new Date()
        };
        
        if (adminUser) {
          updateData.lastUpdatedBy = {
            userId: adminUser.id,
            userEmail: adminUser.email,
            userName: adminUser.name,
            timestamp: new Date()
          };
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
        
        // Get updated dealer
        const updatedDealer = await dealersCollection.findOne({ 
          _id: new ObjectId(dealerId) 
        });
        
        console.log(`[${timestamp}] ✅ Dealer updated via /dealers endpoint: ${existingDealer.businessName}`);
        
        return res.status(200).json({
          success: true,
          message: 'Dealer updated successfully',
          data: updatedDealer
        });
        
      } catch (error) {
        console.error(`[${timestamp}] /dealers update error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to update dealer',
          error: error.message
        });
      }
    }
    
    // === DELETE DEALER (FRONTEND ENDPOINT) ===
    if (path.match(/^\/dealers\/[a-fA-F0-9]{24}$/) && req.method === 'DELETE') {
      const dealerId = path.split('/').pop();
      console.log(`[${timestamp}] → FRONTEND DEALERS: Delete Dealer ${dealerId}`);
      
      try {
        // Check authentication
        const authHeader = req.headers.authorization;
        let adminUser = null;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const authResult = await verifyAdminToken(req);
          if (authResult.success) {
            adminUser = authResult.user;
          }
        }
        
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
        
        // Soft delete - mark as deleted
        const result = await dealersCollection.updateOne(
          { _id: new ObjectId(dealerId) },
          { 
            $set: { 
              status: 'deleted',
              deletedAt: new Date(),
              ...(adminUser && {
                deletedBy: {
                  userId: adminUser.id,
                  userEmail: adminUser.email,
                  userName: adminUser.name,
                  timestamp: new Date()
                }
              })
            }
          }
        );
        
        console.log(`[${timestamp}] ✅ Dealer deleted via /dealers endpoint: ${existingDealer.businessName}`);
        
        return res.status(200).json({
          success: true,
          message: 'Dealer deleted successfully',
          data: {
            id: dealerId,
            businessName: existingDealer.businessName,
            deletedAt: new Date()
          }
        });
        
      } catch (error) {
        console.error(`[${timestamp}] /dealers delete error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to delete dealer',
          error: error.message
        });
      }
    }
    
    // === GET DEALERS FOR DROPDOWN (FRONTEND ENDPOINT) ===
    if (path === '/dealers/all' && req.method === 'GET') {
      console.log(`[${timestamp}] → FRONTEND DEALERS: Get All Dealers for Dropdown`);
      
      try {
        const dealersCollection = db.collection('dealers');
        
        // Get active dealers for dropdown
        const dealers = await dealersCollection.find({ 
          status: 'active' 
        })
        .project({
          businessName: 1,
          'profile.logo': 1,
          'verification.status': 1,
          sellerType: 1,
          businessType: 1,
          privateSeller: 1
        })
        .sort({ businessName: 1 })
        .toArray();
        
        // Map to format expected by frontend
        const dealersForDropdown = dealers.map(dealer => ({
          _id: dealer._id,
          businessName: dealer.businessName,
          name: dealer.businessName,
          logo: dealer.profile?.logo,
          sellerType: dealer.sellerType || 'dealership',
          businessType: dealer.businessType,
          privateSeller: dealer.privateSeller,
          verification: {
            isVerified: dealer.verification?.status === 'verified'
          },
          displayName: dealer.sellerType === 'private' && dealer.privateSeller
            ? `${dealer.privateSeller.firstName} ${dealer.privateSeller.lastName}`
            : dealer.businessName
        }));
        
        return res.status(200).json({
          success: true,
          count: dealersForDropdown.length,
          data: dealersForDropdown
        });
        
      } catch (error) {
        console.error(`[${timestamp}] /dealers/all error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to get dealers for dropdown',
          error: error.message
        });
      }
    }
    
    // === VERIFY DEALER (FRONTEND ENDPOINT) ===
    if (path.match(/^\/dealers\/[a-fA-F0-9]{24}\/verify$/) && req.method === 'PUT') {
      const dealerId = path.split('/')[2]; // Extract dealer ID from /dealers/{id}/verify
      console.log(`[${timestamp}] → FRONTEND DEALERS: Verify Dealer ${dealerId}`);
      
      try {
        // Check authentication
        const authHeader = req.headers.authorization;
        let adminUser = null;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const authResult = await verifyAdminToken(req);
          if (authResult.success) {
            adminUser = authResult.user;
          }
        }
        
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
            verifiedBy: adminUser ? adminUser.id : 'system',
            verifierName: adminUser ? adminUser.name : 'System'
          },
          updatedAt: new Date()
        };
        
        if (adminUser) {
          verificationData.lastUpdatedBy = {
            userId: adminUser.id,
            userEmail: adminUser.email,
            userName: adminUser.name,
            timestamp: new Date(),
            action: 'verification'
          };
        }
        
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
        
        // Get updated dealer
        const updatedDealer = await dealersCollection.findOne({ 
          _id: new ObjectId(dealerId) 
        });
        
        console.log(`[${timestamp}] ✅ Dealer verified via /dealers endpoint: ${existingDealer.businessName}`);
        
        return res.status(200).json({
          success: true,
          message: 'Dealer verified successfully',
          data: updatedDealer
        });
        
      } catch (error) {
        console.error(`[${timestamp}] /dealers verify error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to verify dealer',
          error: error.message
        });
      }
    }

    // === IMAGE UPLOAD ENDPOINT ===
    if (path === '/images/upload' && req.method === 'POST') {
      try {
        console.log(`[${timestamp}] → IMAGE UPLOAD`);
        
        // For now, return a mock successful response
        // In production, this would upload to AWS S3
        const mockImageUrl = `https://bw-car-culture-images.s3.amazonaws.com/dealers/dealer-${Date.now()}.jpg`;
        
        console.log(`[${timestamp}] ✅ Image upload simulated: ${mockImageUrl}`);
        
        return res.status(200).json({
          success: true,
          message: 'Image uploaded successfully',
          imageUrl: mockImageUrl,
          data: {
            url: mockImageUrl,
            filename: `dealer-${Date.now()}.jpg`,
            size: 1024000, // 1MB mock size
            uploadedAt: new Date().toISOString()
          }
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Image upload error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Image upload failed',
          error: error.message
        });
      }
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

    // === UPDATE DEALER STATUS (FOLLOWING VERIFY PATTERN) ===
    if (path.match(/^\/dealers\/[a-fA-F0-9]{24}\/status\/[a-zA-Z]+$/) && req.method === 'PUT') {
      const pathParts = path.split('/');
      const dealerId = pathParts[2];
      const newStatus = pathParts[4]; // active, inactive, pending, suspended
      console.log(`[${timestamp}] → UPDATE DEALER STATUS: ${dealerId} to ${newStatus}`);
      
      try {
        const dealersCollection = db.collection('dealers');
        const { ObjectId } = await import('mongodb');
        
        const existingDealer = await dealersCollection.findOne({ 
          _id: new ObjectId(dealerId) 
        });
        
        if (!existingDealer) {
          return res.status(404).json({
            success: false,
            message: 'Dealer not found'
          });
        }
        
        const result = await dealersCollection.updateOne(
          { _id: new ObjectId(dealerId) },
          { 
            $set: { 
              status: newStatus,
              updatedAt: new Date()
            }
          }
        );
        
        console.log(`[${timestamp}] ✅ Dealer status updated: ${existingDealer.businessName} → ${newStatus}`);
        
        return res.status(200).json({
          success: true,
          message: `Dealer status updated to ${newStatus}`,
          data: {
            id: dealerId,
            businessName: existingDealer.businessName,
            status: newStatus,
            updatedAt: new Date()
          }
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Update dealer status error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to update dealer status',
          error: error.message
        });
      }
    }

    // === UPDATE LISTING STATUS (FOLLOWING VERIFY PATTERN) ===
    if (path.match(/^\/listings\/[a-fA-F0-9]{24}\/status\/[a-zA-Z]+$/) && req.method === 'PUT') {
      const pathParts = path.split('/');
      const listingId = pathParts[2];
      const newStatus = pathParts[4]; // active, inactive, pending, sold, deleted
      console.log(`[${timestamp}] → UPDATE LISTING STATUS: ${listingId} to ${newStatus}`);
      
      try {
        const listingsCollection = db.collection('listings');
        const { ObjectId } = await import('mongodb');
        
        const existingListing = await listingsCollection.findOne({ 
          _id: new ObjectId(listingId) 
        });
        
        if (!existingListing) {
          return res.status(404).json({
            success: false,
            message: 'Listing not found'
          });
        }
        
        const result = await listingsCollection.updateOne(
          { _id: new ObjectId(listingId) },
          { 
            $set: { 
              status: newStatus,
              updatedAt: new Date()
            }
          }
        );
        
        console.log(`[${timestamp}] ✅ Listing status updated: ${existingListing.title} → ${newStatus}`);
        
        return res.status(200).json({
          success: true,
          message: `Listing status updated to ${newStatus}`,
          data: {
            id: listingId,
            title: existingListing.title,
            status: newStatus,
            updatedAt: new Date()
          }
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Update listing status error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to update listing status',
          error: error.message
        });
      }
    }

    // === TOGGLE LISTING FEATURED (FOLLOWING VERIFY PATTERN) ===
    if (path.match(/^\/listings\/[a-fA-F0-9]{24}\/featured\/[a-zA-Z]+$/) && req.method === 'PUT') {
      const pathParts = path.split('/');
      const listingId = pathParts[2];
      const featuredStatus = pathParts[4] === 'true' || pathParts[4] === 'on'; // true/false
      console.log(`[${timestamp}] → TOGGLE LISTING FEATURED: ${listingId} to ${featuredStatus}`);
      
      try {
        const listingsCollection = db.collection('listings');
        const { ObjectId } = await import('mongodb');
        
        const existingListing = await listingsCollection.findOne({ 
          _id: new ObjectId(listingId) 
        });
        
        if (!existingListing) {
          return res.status(404).json({
            success: false,
            message: 'Listing not found'
          });
        }
        
        const result = await listingsCollection.updateOne(
          { _id: new ObjectId(listingId) },
          { 
            $set: { 
              featured: featuredStatus,
              updatedAt: new Date()
            }
          }
        );
        
        console.log(`[${timestamp}] ✅ Listing featured updated: ${existingListing.title} → ${featuredStatus}`);
        
        return res.status(200).json({
          success: true,
          message: `Listing ${featuredStatus ? 'featured' : 'unfeatured'} successfully`,
          data: {
            id: listingId,
            title: existingListing.title,
            featured: featuredStatus,
            updatedAt: new Date()
          }
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Toggle listing featured error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to toggle listing featured status',
          error: error.message
        });
      }
    }

    // === UPDATE SERVICE PROVIDER STATUS (FOLLOWING VERIFY PATTERN) ===
    if (path.match(/^\/providers\/[a-fA-F0-9]{24}\/status\/[a-zA-Z]+$/) && req.method === 'PUT') {
      const pathParts = path.split('/');
      const providerId = pathParts[2];
      const newStatus = pathParts[4]; // active, inactive, pending, suspended
      console.log(`[${timestamp}] → UPDATE PROVIDER STATUS: ${providerId} to ${newStatus}`);
      
      try {
        const providersCollection = db.collection('serviceproviders');
        const { ObjectId } = await import('mongodb');
        
        const existingProvider = await providersCollection.findOne({ 
          _id: new ObjectId(providerId) 
        });
        
        if (!existingProvider) {
          return res.status(404).json({
            success: false,
            message: 'Service provider not found'
          });
        }
        
        const result = await providersCollection.updateOne(
          { _id: new ObjectId(providerId) },
          { 
            $set: { 
              status: newStatus,
              updatedAt: new Date()
            }
          }
        );
        
        console.log(`[${timestamp}] ✅ Provider status updated: ${existingProvider.businessName} → ${newStatus}`);
        
        return res.status(200).json({
          success: true,
          message: `Provider status updated to ${newStatus}`,
          data: {
            id: providerId,
            businessName: existingProvider.businessName,
            status: newStatus,
            updatedAt: new Date()
          }
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Update provider status error:`, error);
        return res.status(500).json({
          success: false,
          message: 'Failed to update provider status',
          error: error.message
        });
      }
    }

    // === DEBUG: VERIFY DEALER WITH UNDEFINED HANDLING ===
    if (path.match(/^\/dealers\/undefined\/verify$/) && req.method === 'PUT') {
      console.log(`[${timestamp}] ⚠️ Dealer verification called with undefined ID`);
      return res.status(400).json({
        success: false,
        message: 'Dealer ID is missing or undefined',
        debug: {
          receivedPath: path,
          issue: 'Frontend is passing undefined as dealer ID',
          solution: 'Check frontend JavaScript - dealer ID extraction might be failing'
        }
      });
    }

    // === VERIFY DEALER (FRONTEND PATH) ===
    if (path.match(/^\/dealers\/[a-fA-F0-9]{24}\/verify$/) && req.method === 'PUT') {
      const dealerId = path.split('/')[2]; // Extract dealer ID from /dealers/{id}/verify
      console.log(`[${timestamp}] → VERIFY DEALER (frontend path): "${dealerId}"`);
      
      // Check if admin token provided (optional for backward compatibility)
      const authHeader = req.headers.authorization;
      let adminUser = null;
      
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const authResult = await verifyAdminToken(req);
        if (authResult.success) {
          adminUser = authResult.user;
          console.log(`[${timestamp}] Admin verification by: ${adminUser.name}`);
        }
      }
      
      try {
        const dealersCollection = db.collection('dealers');
        const { ObjectId } = await import('mongodb');
        
        // Find existing dealer
        const existingDealer = await dealersCollection.findOne({ 
          _id: new ObjectId(dealerId) 
        });
        
        if (!existingDealer) {
          console.log(`[${timestamp}] Dealer not found for verification: ${dealerId}`);
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
            verifiedBy: adminUser ? adminUser.id : 'system',
            verifierName: adminUser ? adminUser.name : 'System'
          },
          updatedAt: new Date()
        };
        
        if (adminUser) {
          verificationData.lastUpdatedBy = {
            userId: adminUser.id,
            userEmail: adminUser.email,
            userName: adminUser.name,
            timestamp: new Date(),
            action: 'verification'
          };
        }
        
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
        
        console.log(`[${timestamp}] ✅ Dealer verified: ${existingDealer.businessName} by ${adminUser ? adminUser.name : 'system'}`);
        
        return res.status(200).json({
          success: true,
          message: 'Dealer verified successfully',
          data: {
            id: dealerId,
            businessName: existingDealer.businessName,
            status: 'verified',
            verifiedAt: verificationData.verification.verifiedAt,
            verifiedBy: adminUser ? adminUser.name : 'System'
          }
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

    // === INDIVIDUAL DEALER ===
    if (path.includes('/dealers/') && path !== '/dealers' && !path.includes('/dealers/all') && !path.includes('/dealers/undefined')) {
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

    // === FEEDBACK STATS (MISSING ENDPOINT) ===
    if (path === '/feedback/stats') {
      console.log(`[${timestamp}] → FEEDBACK STATS`);
      // Return mock feedback stats since this endpoint was missing
      return res.status(200).json({
        success: true,
        data: {
          totalFeedback: 0,
          averageRating: 0,
          positiveCount: 0,
          negativeCount: 0,
          neutralCount: 0
        },
        message: 'Feedback stats retrieved'
      });
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
        message: 'BW Car Culture API - COMPLETE WITH FRONTEND /dealers ENDPOINTS',
        collections: collections.map(c => c.name),
        counts: counts,
        timestamp: timestamp,
        newFeatures: [
          'Admin CRUD operations for listings and dealers',
          'JWT token authentication for admin access',
          'Users endpoint for dealer form dropdown',
          'Traditional API endpoints for frontend form compatibility',
          'Frontend /dealers endpoints for dealerService.js compatibility',
          'Image upload endpoint for dealer logos',
          'Audit logging for all admin actions',
          'Multi-endpoint strategy for maximum frontend compatibility'
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
        '/dealers/{id}/verify (PUT) - Verify dealer',
        '/listings/{id}',
        '/listings/dealer/{dealerId}',
        '/rentals/{id}',
        '/transport/{id}',
        '/service-providers',
        '/providers (alias for service-providers)',
        '/news',
        '/stats',
        '/analytics/track (POST)',
        '/images/upload (POST) - Image upload',
        '=== AUTH ENDPOINTS ===',
        '/auth/login (POST)',
        '/auth/users (GET) - Get users for dealer form',
        '=== TRADITIONAL API ENDPOINTS ===',
        '/api/dealers (GET/POST) - Traditional dealer operations',
        '/api/dealers/all (GET) - Dealers for dropdown',
        '=== FRONTEND /dealers ENDPOINTS ===',
        '/dealers (GET/POST) - Frontend dealer operations',
        '/dealers/all (GET) - Dealers for dropdown',
        '/dealers/{id} (PUT/DELETE) - Update/delete dealer',
        '/dealers/{id}/verify (PUT) - Verify dealer',
        '=== ADMIN CRUD ENDPOINTS ===',
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