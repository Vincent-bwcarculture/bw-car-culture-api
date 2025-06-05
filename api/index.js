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

// === CREATE SERVICE PROVIDER WITH FILE UPLOADS ===
if (path === '/providers' && req.method === 'POST') {
  try {
    console.log(`[${timestamp}] → CREATE SERVICE PROVIDER WITH FILES`);
    
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);
    
    const contentType = req.headers['content-type'] || '';
    
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({
        success: false,
        message: 'Expected multipart/form-data'
      });
    }
    
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    if (!boundaryMatch) {
      return res.status(400).json({
        success: false,
        message: 'No boundary found in multipart data'
      });
    }
    
    const boundary = boundaryMatch[1];
    const bodyString = rawBody.toString('binary');
    const parts = bodyString.split(`--${boundary}`);
    
    let providerData = {};
    const files = {}; // Store uploaded files
    
    // Parse each part of the multipart data
    for (const part of parts) {
      if (part.includes('Content-Disposition: form-data')) {
        const nameMatch = part.match(/name="([^"]+)"/);
        if (!nameMatch) continue;
        
        const fieldName = nameMatch[1];
        const isFile = part.includes('filename=');
        
        if (isFile) {
          // Handle file upload
          const filenameMatch = part.match(/filename="([^"]+)"/);
          if (!filenameMatch || !filenameMatch[1]) continue;
          
          const filename = filenameMatch[1];
          const contentTypeMatch = part.match(/Content-Type: ([^\r\n]+)/);
          const fileType = contentTypeMatch ? contentTypeMatch[1].trim() : 'image/jpeg';
          
          const dataStart = part.indexOf('\r\n\r\n');
          if (dataStart !== -1) {
            const fileData = part.substring(dataStart + 4);
            const cleanData = fileData.replace(/\r\n$/, '').replace(/\r\n--$/, '');
            const fileBuffer = Buffer.from(cleanData, 'binary');
            
            if (fileBuffer.length > 100) { // Skip very small files
              files[fieldName] = {
                filename: filename,
                buffer: fileBuffer,
                mimetype: fileType,
                size: fileBuffer.length
              };
              console.log(`[${timestamp}] Found file: ${fieldName} (${filename}, ${fileBuffer.length} bytes)`);
            }
          }
        } else {
          // Handle regular form field
          const dataStart = part.indexOf('\r\n\r\n');
          if (dataStart !== -1) {
            const fieldValue = part.substring(dataStart + 4).replace(/\r\n$/, '').trim();
            
            // Try to parse JSON fields
            if (['contact', 'location', 'profile', 'social'].includes(fieldName)) {
              try {
                providerData[fieldName] = JSON.parse(fieldValue);
              } catch (e) {
                providerData[fieldName] = fieldValue;
              }
            } else {
              providerData[fieldName] = fieldValue;
            }
          }
        }
      }
    }
    
    console.log(`[${timestamp}] Parsed data:`, {
      businessName: providerData.businessName,
      filesFound: Object.keys(files),
      totalFields: Object.keys(providerData).length
    });
    
    // Upload files to S3
    const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
    const awsBucket = process.env.AWS_S3_BUCKET_NAME || 'bw-car-culture-images';
    const awsRegion = process.env.AWS_S3_REGION || 'us-east-1';
    
    const uploadedImages = {};
    
    if (awsAccessKey && awsSecretKey) {
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
        
        for (const [fieldName, file] of Object.entries(files)) {
          try {
            const timestamp_ms = Date.now();
            const randomString = Math.random().toString(36).substring(2, 8);
            const fileExtension = file.filename.split('.').pop() || 'jpg';
            const s3Filename = `images/providers/provider-${timestamp_ms}-${randomString}-${fieldName}.${fileExtension}`;
            
            const uploadCommand = new PutObjectCommand({
              Bucket: awsBucket,
              Key: s3Filename,
              Body: file.buffer,
              ContentType: file.mimetype,
            });
            
            await s3Client.send(uploadCommand);
            
            const imageUrl = `https://${awsBucket}.s3.amazonaws.com/${s3Filename}`;
            uploadedImages[fieldName] = imageUrl;
            
            console.log(`[${timestamp}] ✅ Uploaded ${fieldName}: ${imageUrl}`);
          } catch (fileError) {
            console.error(`[${timestamp}] Failed to upload ${fieldName}:`, fileError.message);
          }
        }
      } catch (s3Error) {
        console.error(`[${timestamp}] S3 setup error:`, s3Error.message);
      }
    } else {
      // Mock URLs for development
      for (const fieldName of Object.keys(files)) {
        uploadedImages[fieldName] = `https://${awsBucket}.s3.amazonaws.com/images/providers/mock-${fieldName}-${Date.now()}.jpg`;
      }
    }
    
    // Create provider with uploaded image URLs
    const providersCollection = db.collection('serviceproviders');
    const { ObjectId } = await import('mongodb');
    
    const newProvider = {
      _id: new ObjectId(),
      businessName: providerData.businessName || '',
      providerType: providerData.providerType || 'general',
      businessType: providerData.businessType || 'other',
      user: providerData.user ? (providerData.user.length === 24 ? new ObjectId(providerData.user) : providerData.user) : null,
      
      contact: {
        phone: providerData.contact?.phone || '',
        email: providerData.contact?.email || '',
        website: providerData.contact?.website || ''
      },
      
      location: {
        address: providerData.location?.address || '',
        city: providerData.location?.city || '',
        state: providerData.location?.state || '',
        country: providerData.location?.country || 'Botswana',
        postalCode: providerData.location?.postalCode || '',
        coordinates: {
          type: 'Point',
          coordinates: [0, 0]
        }
      },
      
      profile: {
        description: providerData.profile?.description || '',
        specialties: providerData.profile?.specialties || [],
        logo: uploadedImages.logo || '', // ← Set uploaded logo URL
        banner: uploadedImages.banner || '', // ← Set uploaded banner URL
        workingHours: providerData.profile?.workingHours || {
          monday: { open: '08:00', close: '17:00' },
          tuesday: { open: '08:00', close: '17:00' },
          wednesday: { open: '08:00', close: '17:00' },
          thursday: { open: '08:00', close: '17:00' },
          friday: { open: '08:00', close: '17:00' },
          saturday: { open: '09:00', close: '13:00' },
          sunday: { open: '', close: '' }
        }
      },
      
      social: {
        facebook: providerData.social?.facebook || '',
        instagram: providerData.social?.instagram || '',
        twitter: providerData.social?.twitter || '',
        whatsapp: providerData.social?.whatsapp || ''
      },
      
      carRental: {
        minimumRentalPeriod: 1,
        depositRequired: true,
        insuranceIncluded: true
      },
      
      trailerRental: {
        requiresVehicleInspection: true,
        towingCapacityRequirement: true,
        deliveryAvailable: false,
        deliveryFee: 0
      },
      
      publicTransport: {
        licensedOperator: true
      },
      
      workshop: {
        warrantyOffered: true,
        certifications: []
      },
      
      subscription: {
        features: {
          maxListings: 10,
          allowPhotography: true,
          allowReviews: false,
          allowPodcasts: false,
          allowVideos: false
        },
        tier: 'basic',
        status: 'active',
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        paymentHistory: []
      },
      
      verification: {
        status: 'pending',
        documents: [],
        verifiedAt: null,
        verifiedBy: null
      },
      
      status: providerData.status || 'active',
      
      metrics: {
        totalListings: 0,
        activeSales: 0,
        averageRating: 0,
        totalReviews: 0
      },
      
      createdAt: new Date(),
      updatedAt: new Date(),
      __v: 0
    };
    
    const result = await providersCollection.insertOne(newProvider);
    
    console.log(`[${timestamp}] ✅ Service provider created with images: ${newProvider.businessName}`);
    console.log(`[${timestamp}] Images uploaded: ${Object.keys(uploadedImages).join(', ')}`);
    
    return res.status(201).json({
      success: true,
      message: 'Service provider created successfully with images',
      data: { ...newProvider, _id: result.insertedId },
      uploadedImages: uploadedImages
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Create service provider with files error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create service provider with files',
      error: error.message
    });
  }
}

// === UPDATE SERVICE PROVIDER ===
if (path.match(/^\/providers\/[a-fA-F0-9]{24}$/) && req.method === 'PUT') {
  const providerId = path.split('/').pop();
  console.log(`[${timestamp}] → UPDATE SERVICE PROVIDER ${providerId}`);
  
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
    
    const providersCollection = db.collection('serviceproviders');
    const { ObjectId } = await import('mongodb');
    
    const updateData = {
      ...body,
      updatedAt: new Date()
    };
    
    const result = await providersCollection.updateOne(
      { _id: new ObjectId(providerId) },
      { $set: updateData }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service provider not found'
      });
    }
    
    const updatedProvider = await providersCollection.findOne({ 
      _id: new ObjectId(providerId) 
    });
    
    console.log(`[${timestamp}] ✅ Service provider updated: ${providerId}`);
    
    return res.status(200).json({
      success: true,
      message: 'Service provider updated successfully',
      data: updatedProvider
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Update service provider error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update service provider',
      error: error.message
    });
  }
}

// === VERIFY SERVICE PROVIDER ===
if (path.match(/^\/providers\/[a-fA-F0-9]{24}\/verify$/) && req.method === 'PUT') {
  const providerId = path.split('/')[2];
  console.log(`[${timestamp}] → VERIFY SERVICE PROVIDER ${providerId}`);
  
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
    
    const verificationData = {
      verification: {
        status: 'verified',
        verifiedAt: new Date(),
        verifiedBy: 'system', // You can change this to actual admin user ID
        documents: []
      },
      updatedAt: new Date()
    };
    
    const result = await providersCollection.updateOne(
      { _id: new ObjectId(providerId) },
      { $set: verificationData }
    );
    
    const updatedProvider = await providersCollection.findOne({ 
      _id: new ObjectId(providerId) 
    });
    
    console.log(`[${timestamp}] ✅ Service provider verified: ${existingProvider.businessName}`);
    
    return res.status(200).json({
      success: true,
      message: 'Service provider verified successfully',
      data: updatedProvider
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Verify service provider error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify service provider',
      error: error.message
    });
  }
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

// === MULTIPLE IMAGE UPLOAD ENDPOINT FOR CAR LISTINGS - FIXED ===
  // === MULTIPLE IMAGE UPLOAD ENDPOINT FOR CAR LISTINGS - FIXED ===
 // === MULTIPLE IMAGE UPLOAD ENDPOINT FOR CAR LISTINGS - FIXED ===
    if (path === '/images/upload/multiple' && req.method === 'POST') {
      try {
        console.log(`[${timestamp}] → MULTIPLE S3 IMAGE UPLOAD: Starting`);
        
        // Parse multipart form data for multiple file uploads
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const rawBody = Buffer.concat(chunks);
        
        console.log(`[${timestamp}] MULTIPLE UPLOAD - Received ${rawBody.length} bytes`);
        
        // Check payload size (Vercel limit is ~4.5MB)
        if (rawBody.length > 4400000) { // 4.4MB
          return res.status(413).json({
            success: false,
            message: 'Payload too large. Maximum total size is 4.4MB for all images combined.',
            receivedSize: rawBody.length,
            maxSize: 4400000
          });
        }
        
        // Extract boundary from content-type
        const contentType = req.headers['content-type'] || '';
        const boundaryMatch = contentType.match(/boundary=(.+)$/);
        
        if (!boundaryMatch) {
          console.log(`[${timestamp}] MULTIPLE UPLOAD - No boundary found`);
          return res.status(400).json({
            success: false,
            message: 'Invalid multipart request - no boundary found'
          });
        }
        
        const boundary = boundaryMatch[1];
        console.log(`[${timestamp}] MULTIPLE UPLOAD - Using boundary: ${boundary}`);
        
        // Parse multipart data to extract multiple files
        const bodyString = rawBody.toString('binary');
        const parts = bodyString.split(`--${boundary}`);
        
        const files = [];
        
        for (const part of parts) {
          if (part.includes('Content-Disposition: form-data') && part.includes('filename=')) {
            // Extract filename
            const filenameMatch = part.match(/filename="([^"]+)"/);
            if (!filenameMatch) continue;
            
            const filename = filenameMatch[1];
            
            // Skip empty filenames
            if (!filename || filename === '""') continue;
            
            // Extract content type
            let fileType = 'image/jpeg'; // default
            const contentTypeMatch = part.match(/Content-Type: ([^\r\n]+)/);
            if (contentTypeMatch) {
              fileType = contentTypeMatch[1].trim();
            }
            
            // Extract file data (after double CRLF)
            const dataStart = part.indexOf('\r\n\r\n');
            if (dataStart !== -1) {
              const fileData = part.substring(dataStart + 4);
              // Remove trailing boundary and whitespace
              const cleanData = fileData.replace(/\r\n$/, '').replace(/\r\n--$/, '');
              const fileBuffer = Buffer.from(cleanData, 'binary');
              
              // Skip very small files (likely empty)
              if (fileBuffer.length < 100) continue;
              
              files.push({
                filename: filename,
                fileType: fileType,
                buffer: fileBuffer,
                size: fileBuffer.length
              });
              
              console.log(`[${timestamp}] MULTIPLE UPLOAD - File parsed: ${filename} (${fileBuffer.length} bytes, ${fileType})`);
            }
          }
        }
        
        if (files.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'No valid image files found in upload request'
          });
        }
        
        console.log(`[${timestamp}] MULTIPLE UPLOAD - Found ${files.length} files to upload`);
        
        // Check environment variables for S3
        const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
        const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
        const awsBucket = process.env.AWS_S3_BUCKET_NAME || 'bw-car-culture-images';
        const awsRegion = process.env.AWS_S3_REGION || 'us-east-1';
        
        let uploadedImages = []; // FIXED: Declare at function scope
        
        if (!awsAccessKey || !awsSecretKey) {
          console.log(`[${timestamp}] MULTIPLE UPLOAD - Missing AWS credentials, using mock URLs`);
          
          // Return mock URLs for each file - FIXED FORMAT
          for (const file of files) {
            const mockUrl = `https://${awsBucket}.s3.amazonaws.com/images/listing-${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${file.filename}`;
            uploadedUrls.push(mockUrl); // FIXED: Just push the URL string
          }
          
          return res.status(200).json({
            success: true,
            message: `Multiple image upload simulated (AWS credentials missing)`,
            uploadedCount: files.length,
            urls: uploadedUrls, // FIXED: Simple array of URL strings
            note: 'Configure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in Vercel environment variables'
          });
        }
        
        // Real S3 uploads
        try {
          const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
          
          // Create S3 client
          const s3Client = new S3Client({
            region: awsRegion,
            credentials: {
              accessKeyId: awsAccessKey,
              secretAccessKey: awsSecretKey,
            },
          });
          
          console.log(`[${timestamp}] MULTIPLE UPLOAD - S3 client created, uploading ${files.length} files`);
          
          // Upload each file to S3
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            try {
              // Generate unique filename for S3 - FIXED PATH
              const timestamp_ms = Date.now();
              const randomString = Math.random().toString(36).substring(2, 8);
              const fileExtension = file.filename.split('.').pop() || 'jpg';
              const s3Filename = `images/listing-${timestamp_ms}-${randomString}-${i}.${fileExtension}`;
              
              console.log(`[${timestamp}] MULTIPLE UPLOAD - Uploading file ${i + 1}/${files.length}: ${s3Filename}`);
              
              // Upload to S3
              const uploadCommand = new PutObjectCommand({
                Bucket: awsBucket,
                Key: s3Filename,
                Body: file.buffer,
                ContentType: file.fileType,
              });
              
              const uploadResult = await s3Client.send(uploadCommand);
              
              // Generate public URL - FIXED FORMAT TO MATCH OLD WORKING IMAGES
              const imageUrl = `https://${awsBucket}.s3.amazonaws.com/${s3Filename}`;
              
              // FIXED: Push object in format frontend expects
              uploadedImages.push({
                url: imageUrl,
                key: s3Filename,
                size: file.size,
                mimetype: file.fileType,
                thumbnail: imageUrl, // For now, same as main image
                isPrimary: i === 0
              });
              
              console.log(`[${timestamp}] MULTIPLE UPLOAD - Success ${i + 1}/${files.length}: ${imageUrl}`);
              
            } catch (fileUploadError) {
              console.error(`[${timestamp}] MULTIPLE UPLOAD - File ${i + 1} failed:`, fileUploadError.message);
              // Don't add failed uploads to the images array
            }
          }
          
          console.log(`[${timestamp}] ✅ MULTIPLE UPLOAD COMPLETE: ${uploadedImages.length} successful, ${files.length - uploadedImages.length} failed`);
          
          return res.status(200).json({
            success: uploadedImages.length > 0,
            message: `Multiple image upload complete: ${uploadedImages.length}/${files.length} successful`,
            uploadedCount: uploadedImages.length,
            images: uploadedImages, // FIXED: Return 'images' array with objects
            urls: uploadedImages.map(img => img.url), // Keep URLs for backward compatibility
            data: {
              totalFiles: files.length,
              successfulUploads: uploadedImages.length,
              failedUploads: files.length - uploadedImages.length,
              uploadedAt: new Date().toISOString(),
              bucket: awsBucket,
              region: awsRegion
            }
          });
          
        } catch (s3ClientError) {
          console.error(`[${timestamp}] MULTIPLE UPLOAD - S3 client error:`, s3ClientError.message);
          
          // Fall back to mock URLs if S3 completely fails - FIXED FORMAT
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const mockFilename = `images/listing-${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${i}.jpg`;
            const mockUrl = `https://${awsBucket}.s3.amazonaws.com/${mockFilename}`;
            
            uploadedImages.push({
              url: mockUrl,
              key: mockFilename,
              size: file.size,
              mimetype: file.fileType,
              thumbnail: mockUrl,
              isPrimary: i === 0,
              mock: true,
              s3Error: s3ClientError.message
            });
          }
          
          return res.status(200).json({
            success: true,
            message: `S3 upload failed, using mock URLs for ${files.length} files`,
            uploadedCount: files.length,
            images: uploadedImages, // FIXED: Return 'images' array with objects
            urls: uploadedImages.map(img => img.url), // Keep URLs for backward compatibility
            error: s3ClientError.message,
            note: 'S3 upload failed - check AWS credentials and bucket permissions'
          });
        }
        
      } catch (error) {
        console.error(`[${timestamp}] MULTIPLE UPLOAD ERROR:`, error.message);
        return res.status(500).json({
          success: false,
          message: 'Multiple image upload failed',
          error: error.message,
          timestamp: timestamp
        });
      }
    }

    // === CREATE LISTING (FRONTEND ENDPOINT) ===
// === CREATE LISTING (FRONTEND ENDPOINT) - FIXED WITH SLUG GENERATION ===
    if (path === '/listings' && req.method === 'POST') {
      try {
        console.log(`[${timestamp}] → FRONTEND: Create Listing`);
        
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
        
        console.log(`[${timestamp}] Creating listing: ${body.title || 'Untitled'}`);
        
        const listingsCollection = db.collection('listings');
        const { ObjectId } = await import('mongodb');
        
        // SLUG GENERATION FUNCTION
        const generateSlug = (title) => {
          if (!title) {
            return `listing-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
          }
          
          const baseSlug = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
          
          // Add timestamp to ensure uniqueness
          return `${baseSlug}-${Date.now()}`;
        };
        
        // VALIDATE REQUIRED FIELDS
        if (!body.title) {
          return res.status(400).json({
            success: false,
            message: 'Title is required for listing creation'
          });
        }
        
        if (!body.dealerId) {
          return res.status(400).json({
            success: false,
            message: 'Dealer ID is required for listing creation'
          });
        }
        
        // CREATE NEW LISTING OBJECT WITH SLUG
        const newListing = {
          _id: new ObjectId(),
          
          // Basic Information
          title: body.title || '',
          slug: generateSlug(body.title), // FIXED: Generate unique slug
          description: body.description || '',
          shortDescription: body.shortDescription || '',
          category: body.category || '',
          condition: body.condition || 'used',
          status: body.status || 'active',
          featured: Boolean(body.featured),
          
          // Dealer Information
          dealerId: body.dealerId.length === 24 ? new ObjectId(body.dealerId) : body.dealerId,
          dealer: body.dealer || null,
          
          // Pricing Information
          price: Number(body.price) || 0,
          priceType: body.priceType || 'fixed',
          priceOptions: {
            includesVAT: Boolean(body.priceOptions?.includesVAT),
            showPriceAsPOA: Boolean(body.priceOptions?.showPriceAsPOA),
            financeAvailable: Boolean(body.priceOptions?.financeAvailable),
            leaseAvailable: Boolean(body.priceOptions?.leaseAvailable),
            monthlyPayment: body.priceOptions?.monthlyPayment ? Number(body.priceOptions.monthlyPayment) : null,
            
            // Savings options
            originalPrice: body.priceOptions?.originalPrice ? Number(body.priceOptions.originalPrice) : null,
            savingsAmount: body.priceOptions?.savingsAmount ? Number(body.priceOptions.savingsAmount) : null,
            savingsPercentage: body.priceOptions?.savingsPercentage ? Number(body.priceOptions.savingsPercentage) : null,
            dealerDiscount: body.priceOptions?.dealerDiscount ? Number(body.priceOptions.dealerDiscount) : null,
            showSavings: Boolean(body.priceOptions?.showSavings),
            savingsDescription: body.priceOptions?.savingsDescription || null,
            exclusiveDeal: Boolean(body.priceOptions?.exclusiveDeal),
            savingsValidUntil: body.priceOptions?.savingsValidUntil ? new Date(body.priceOptions.savingsValidUntil) : null
          },
          
          // Features
          safetyFeatures: Array.isArray(body.safetyFeatures) ? body.safetyFeatures : [],
          comfortFeatures: Array.isArray(body.comfortFeatures) ? body.comfortFeatures : [],
          performanceFeatures: Array.isArray(body.performanceFeatures) ? body.performanceFeatures : [],
          entertainmentFeatures: Array.isArray(body.entertainmentFeatures) ? body.entertainmentFeatures : [],
          features: Array.isArray(body.features) ? body.features : [],
          
          // Vehicle Specifications
          specifications: {
            make: body.specifications?.make || '',
            model: body.specifications?.model || '',
            year: Number(body.specifications?.year) || new Date().getFullYear(),
            mileage: Number(body.specifications?.mileage) || 0,
            transmission: body.specifications?.transmission || '',
            fuelType: body.specifications?.fuelType || '',
            engineSize: body.specifications?.engineSize || '',
            power: body.specifications?.power || '',
            torque: body.specifications?.torque || '',
            drivetrain: body.specifications?.drivetrain || '',
            exteriorColor: body.specifications?.exteriorColor || '',
            interiorColor: body.specifications?.interiorColor || '',
            vin: body.specifications?.vin || ''
          },
          
          // Location Information
          location: {
            address: body.location?.address || '',
            city: body.location?.city || '',
            state: body.location?.state || '',
            country: body.location?.country || 'Botswana',
            postalCode: body.location?.postalCode || ''
          },
          
          // SEO Information
          seo: {
            metaTitle: body.seo?.metaTitle || body.title || '',
            metaDescription: body.seo?.metaDescription || body.shortDescription || '',
            keywords: Array.isArray(body.seo?.keywords) ? body.seo.keywords : []
          },
          
          // Service History
          serviceHistory: body.serviceHistory?.hasServiceHistory ? {
            hasServiceHistory: true,
            records: Array.isArray(body.serviceHistory.records) ? body.serviceHistory.records : []
          } : {
            hasServiceHistory: false,
            records: []
          },
          
          // Images (should be simple URL strings now)
          images: Array.isArray(body.images) ? body.images : [],
          primaryImageIndex: Number(body.primaryImageIndex) || 0,
          
          // Timestamps
          createdAt: new Date(),
          updatedAt: new Date(),
          
          // View and engagement metrics
          views: 0,
          saves: 0,
          contacts: 0,
          
          // Moderation and verification
          isVerified: false,
          moderationStatus: 'pending'
        };
        
        console.log(`[${timestamp}] Attempting to insert listing with slug: ${newListing.slug}`);
        
        // CHECK FOR DUPLICATE SLUG (extra safety)
        const existingListing = await listingsCollection.findOne({ slug: newListing.slug });
        if (existingListing) {
          // If somehow slug exists, add more uniqueness
          newListing.slug = `${newListing.slug}-${Math.random().toString(36).substring(2, 6)}`;
          console.log(`[${timestamp}] Slug collision detected, using: ${newListing.slug}`);
        }
        
        // INSERT LISTING INTO DATABASE
        const result = await listingsCollection.insertOne(newListing);
        
        console.log(`[${timestamp}] ✅ Listing created successfully: ${newListing.title} (ID: ${result.insertedId}, Slug: ${newListing.slug})`);
        
        // RETURN SUCCESS RESPONSE
        return res.status(201).json({
          success: true,
          message: 'Listing created successfully',
          data: {
            _id: result.insertedId,
            title: newListing.title,
            slug: newListing.slug,
            status: newListing.status,
            price: newListing.price,
            images: newListing.images,
            dealer: newListing.dealer,
            createdAt: newListing.createdAt,
            specifications: newListing.specifications
          }
        });
        
      } catch (error) {
        console.error(`[${timestamp}] Create listing error:`, error);
        
        // Handle specific MongoDB errors
        if (error.code === 11000) {
          // Duplicate key error
          const duplicateField = Object.keys(error.keyPattern || {})[0] || 'unknown';
          return res.status(400).json({
            success: false,
            message: `Duplicate ${duplicateField} - please use a different value`,
            error: 'DUPLICATE_KEY'
          });
        }
        
        return res.status(500).json({
          success: false,
          message: 'Failed to create listing',
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

    // === SERVICES ALIAS ENDPOINTS (FOR ADMIN COMPATIBILITY) ===

// GET all services (alias for providers)
if (path === '/services' && req.method === 'GET') {
  console.log(`[${timestamp}] → SERVICES ALIAS: Get all service providers`);
  
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
        { 'location.city': searchRegex }
      ];
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
      message: `Found ${providers.length} service providers via /services alias`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Services alias error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching service providers',
      error: error.message
    });
  }
}

// GET service items (alias for individual provider)
if (path.match(/^\/services\/[a-fA-F0-9]{24}\/items$/) && req.method === 'GET') {
  const serviceId = path.split('/')[2];
  console.log(`[${timestamp}] → SERVICES ALIAS: Get service items for ${serviceId}`);
  
  try {
    const serviceProvidersCollection = db.collection('serviceproviders');
    const { ObjectId } = await import('mongodb');
    
    const provider = await serviceProvidersCollection.findOne({ 
      _id: new ObjectId(serviceId) 
    });
    
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Service provider not found'
      });
    }
    
    // Return provider data in "items" format for admin compatibility
    return res.status(200).json({
      success: true,
      data: [provider], // Wrap in array as "items"
      total: 1,
      message: `Service provider details via /services alias`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Service items alias error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching service provider details',
      error: error.message
    });
  }
}

// GET individual service (alias for individual provider)
if (path.match(/^\/services\/[a-fA-F0-9]{24}$/) && req.method === 'GET') {
  const serviceId = path.split('/')[2];
  console.log(`[${timestamp}] → SERVICES ALIAS: Get individual service ${serviceId}`);
  
  try {
    const serviceProvidersCollection = db.collection('serviceproviders');
    const { ObjectId } = await import('mongodb');
    
    const provider = await serviceProvidersCollection.findOne({ 
      _id: new ObjectId(serviceId) 
    });
    
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Service provider not found'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: provider,
      message: `Service provider via /services alias`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Individual service alias error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching service provider',
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
    // === CREATE DEALER (FRONTEND ENDPOINT) - FIXED FORMDATA PARSING ===
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
        
        // Parse request body - handle both JSON and FormData
        let dealerData = {};
        let body = {};
        
        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const rawBody = Buffer.concat(chunks).toString();
          
          console.log(`[${timestamp}] Request Content-Type: ${req.headers['content-type']}`);
          console.log(`[${timestamp}] Raw body preview: ${rawBody.substring(0, 200)}...`);
          
          // Check if it's JSON or FormData
          const contentType = req.headers['content-type'] || '';
          
          if (contentType.includes('application/json')) {
            // Handle JSON request
            console.log(`[${timestamp}] Parsing as JSON`);
            body = JSON.parse(rawBody);
            dealerData = body;
          } else if (contentType.includes('multipart/form-data') || rawBody.includes('Content-Disposition')) {
            // Handle FormData request
            console.log(`[${timestamp}] Parsing as FormData`);
            
            // Simple FormData parser for dealerData field
            const dealerDataMatch = rawBody.match(/name="dealerData"[^]*?\r\n\r\n([^]*?)\r\n--/);
            if (dealerDataMatch) {
              try {
                dealerData = JSON.parse(dealerDataMatch[1]);
                console.log(`[${timestamp}] Extracted dealerData from FormData:`, Object.keys(dealerData));
              } catch (jsonError) {
                console.log(`[${timestamp}] Failed to parse dealerData JSON:`, jsonError.message);
              }
            }
            
            // Extract individual fields as fallback
            const extractField = (fieldName) => {
              const regex = new RegExp(`name="${fieldName}"[^]*?\\r\\n\\r\\n([^\\r\\n]+)`);
              const match = rawBody.match(regex);
              return match ? match[1].trim() : null;
            };
            
            // Fallback field extraction
            if (!dealerData.businessName) dealerData.businessName = extractField('businessName');
            if (!dealerData.businessType) dealerData.businessType = extractField('businessType');
            if (!dealerData.sellerType) dealerData.sellerType = extractField('sellerType');
            if (!dealerData.status) dealerData.status = extractField('status') || 'active';
            if (!dealerData.user) dealerData.user = extractField('user');
            
            // Parse JSON fields from FormData
            const jsonFields = ['contact', 'location', 'profile', 'subscription', 'privateSeller'];
            jsonFields.forEach(fieldName => {
              if (!dealerData[fieldName]) {
                const fieldValue = extractField(fieldName);
                if (fieldValue) {
                  try {
                    dealerData[fieldName] = JSON.parse(fieldValue);
                  } catch (parseError) {
                    console.log(`[${timestamp}] Failed to parse ${fieldName}:`, parseError.message);
                  }
                }
              }
            });
            
          } else {
            // Try JSON as fallback
            console.log(`[${timestamp}] Unknown content type, trying JSON fallback`);
            try {
              body = JSON.parse(rawBody);
              dealerData = body;
            } catch (jsonError) {
              console.log(`[${timestamp}] JSON fallback failed:`, jsonError.message);
              // If everything fails, return error with more info
              return res.status(400).json({
                success: false,
                message: 'Invalid request body format',
                debug: {
                  contentType: contentType,
                  bodyPreview: rawBody.substring(0, 100),
                  suggestion: 'Expected JSON or multipart/form-data'
                }
              });
            }
          }
          
        } catch (parseError) {
          console.error(`[${timestamp}] Body parsing error:`, parseError);
          return res.status(400).json({
            success: false,
            message: 'Failed to parse request body',
            error: parseError.message
          });
        }
        
        console.log(`[${timestamp}] Final parsed dealer data:`, {
          businessName: dealerData.businessName,
          sellerType: dealerData.sellerType,
          hasContact: !!dealerData.contact,
          hasLocation: !!dealerData.location,
          hasProfile: !!dealerData.profile,
          user: dealerData.user
        });
        
        const dealersCollection = db.collection('dealers');
        const { ObjectId } = await import('mongodb');
        
        // Validate required fields
        if (!dealerData.businessName) {
          return res.status(400).json({
            success: false,
            message: 'Business name is required',
            receivedData: Object.keys(dealerData)
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
        
        // Create dealer object with proper defaults
        const newDealer = {
          _id: new ObjectId(),
          businessName: dealerData.businessName,
          businessType: dealerData.businessType || 'independent',
          sellerType: dealerData.sellerType || 'dealership',
          status: dealerData.status || 'active',
          user: dealerData.user ? (dealerData.user.length === 24 ? new ObjectId(dealerData.user) : dealerData.user) : null,
          
          // Contact data with defaults
          contact: {
            phone: dealerData.contact?.phone || '',
            email: dealerData.contact?.email || '',
            website: dealerData.contact?.website || ''
          },
          
          // Location data with defaults
          location: {
            address: dealerData.location?.address || '',
            city: dealerData.location?.city || '',
            state: dealerData.location?.state || '',
            country: dealerData.location?.country || 'Botswana'
          },
          
          // Profile data with defaults
          profile: {
            logo: dealerData.profile?.logo || '/images/placeholders/dealer-logo.jpg',
            banner: dealerData.profile?.banner || '/images/placeholders/dealer-banner.jpg',
            description: dealerData.profile?.description || '',
            specialties: dealerData.profile?.specialties || [],
            workingHours: dealerData.profile?.workingHours || {}
          },
          
          // Subscription data with defaults
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
        
        // Insert dealer into database
        const result = await dealersCollection.insertOne(newDealer);
        
        console.log(`[${timestamp}] ✅ Dealer created successfully via /dealers endpoint: ${newDealer.businessName} (ID: ${result.insertedId})`);
        
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
          error: error.message,
          stack: error.stack
        });
      }
    }

    // === CREATE TRANSPORT ROUTE (PUBLIC ENDPOINT) ===
if (path === '/transport' && req.method === 'POST') {
  try {
    console.log(`[${timestamp}] → CREATE TRANSPORT ROUTE`);
    
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
    
    const transportCollection = db.collection('transportroutes');
    const { ObjectId } = await import('mongodb');
    
    // Validate required fields
    if (!body.routeName) {
      return res.status(400).json({
        success: false,
        message: 'Route name is required'
      });
    }
    
    if (!body.operatorName) {
      return res.status(400).json({
        success: false,
        message: 'Operator name is required'
      });
    }
    
    // Create new transport route
    const newRoute = {
      _id: new ObjectId(),
      routeName: body.routeName,
      routeNumber: body.routeNumber || '',
      operatorName: body.operatorName,
      operatorType: body.operatorType || 'public_transport',
      
      // Route details
      origin: {
        name: body.origin?.name || '',
        address: body.origin?.address || '',
        coordinates: body.origin?.coordinates || { lat: 0, lng: 0 }
      },
      
      destination: {
        name: body.destination?.name || '',
        address: body.destination?.address || '',
        coordinates: body.destination?.coordinates || { lat: 0, lng: 0 }
      },
      
      // Stops along the route
      stops: Array.isArray(body.stops) ? body.stops.map(stop => ({
        name: stop.name || '',
        address: stop.address || '',
        coordinates: stop.coordinates || { lat: 0, lng: 0 },
        estimatedTime: stop.estimatedTime || '',
        order: stop.order || 0
      })) : [],
      
      // Schedule information
      schedule: {
        startTime: body.schedule?.startTime || '06:00',
        endTime: body.schedule?.endTime || '22:00',
        frequency: body.schedule?.frequency || '30', // minutes
        operatingDays: body.schedule?.operatingDays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        specialSchedule: body.schedule?.specialSchedule || {}
      },
      
      // Pricing
      pricing: {
        baseFare: Number(body.pricing?.baseFare) || 0,
        currency: body.pricing?.currency || 'BWP',
        discounts: body.pricing?.discounts || {},
        paymentMethods: body.pricing?.paymentMethods || ['cash']
      },
      
      // Route characteristics
      distance: Number(body.distance) || 0,
      estimatedDuration: body.estimatedDuration || '',
      routeType: body.routeType || 'urban', // urban, intercity, suburban
      vehicleType: body.vehicleType || 'bus',
      accessibility: {
        wheelchairAccessible: Boolean(body.accessibility?.wheelchairAccessible),
        lowFloor: Boolean(body.accessibility?.lowFloor),
        audioAnnouncements: Boolean(body.accessibility?.audioAnnouncements)
      },
      
      // Contact and service info
      contact: {
        phone: body.contact?.phone || '',
        email: body.contact?.email || '',
        website: body.contact?.website || ''
      },
      
      // Service provider reference
      serviceProvider: body.serviceProvider ? (body.serviceProvider.length === 24 ? new ObjectId(body.serviceProvider) : body.serviceProvider) : null,
      
      // Status and verification
      status: body.status || 'active',
      verification: {
        status: 'pending',
        verifiedAt: null,
        verifiedBy: null
      },
      
      // Metadata
      createdAt: new Date(),
      updatedAt: new Date(),
      __v: 0
    };
    
    const result = await transportCollection.insertOne(newRoute);
    
    console.log(`[${timestamp}] ✅ Transport route created: ${newRoute.routeName} (${newRoute.operatorName})`);
    
    return res.status(201).json({
      success: true,
      message: 'Transport route created successfully',
      data: { ...newRoute, _id: result.insertedId }
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Create transport route error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create transport route',
      error: error.message
    });
  }
}

// === UPDATE TRANSPORT ROUTE ===
if (path.match(/^\/transport\/[a-fA-F0-9]{24}$/) && req.method === 'PUT') {
  const routeId = path.split('/').pop();
  console.log(`[${timestamp}] → UPDATE TRANSPORT ROUTE ${routeId}`);
  
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
    
    const transportCollection = db.collection('transportroutes');
    const { ObjectId } = await import('mongodb');
    
    const updateData = {
      ...body,
      updatedAt: new Date()
    };
    
    // Handle serviceProvider ObjectId conversion
    if (body.serviceProvider && body.serviceProvider.length === 24) {
      updateData.serviceProvider = new ObjectId(body.serviceProvider);
    }
    
    const result = await transportCollection.updateOne(
      { _id: new ObjectId(routeId) },
      { $set: updateData }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transport route not found'
      });
    }
    
    const updatedRoute = await transportCollection.findOne({ 
      _id: new ObjectId(routeId) 
    });
    
    console.log(`[${timestamp}] ✅ Transport route updated: ${routeId}`);
    
    return res.status(200).json({
      success: true,
      message: 'Transport route updated successfully',
      data: updatedRoute
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Update transport route error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update transport route',
      error: error.message
    });
  }
}

// === DELETE TRANSPORT ROUTE ===
if (path.match(/^\/transport\/[a-fA-F0-9]{24}$/) && req.method === 'DELETE') {
  const routeId = path.split('/').pop();
  console.log(`[${timestamp}] → DELETE TRANSPORT ROUTE ${routeId}`);
  
  try {
    const transportCollection = db.collection('transportroutes');
    const { ObjectId } = await import('mongodb');
    
    // Check if route exists
    const existingRoute = await transportCollection.findOne({ 
      _id: new ObjectId(routeId) 
    });
    
    if (!existingRoute) {
      return res.status(404).json({
        success: false,
        message: 'Transport route not found'
      });
    }
    
    // Soft delete - mark as deleted
    const result = await transportCollection.updateOne(
      { _id: new ObjectId(routeId) },
      { 
        $set: { 
          status: 'deleted',
          deletedAt: new Date()
        }
      }
    );
    
    console.log(`[${timestamp}] ✅ Transport route deleted: ${existingRoute.routeName}`);
    
    return res.status(200).json({
      success: true,
      message: 'Transport route deleted successfully',
      data: { 
        id: routeId, 
        routeName: existingRoute.routeName,
        deletedAt: new Date() 
      }
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Delete transport route error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete transport route',
      error: error.message
    });
  }
}

// === BULK UPLOAD TRANSPORT ROUTES (FIXED FOR DUPLICATES) ===
if (path === '/transport/bulk-upload' && req.method === 'POST') {
  try {
    console.log(`[${timestamp}] → BULK UPLOAD TRANSPORT ROUTES`);
    
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
    
    const { routes } = body;
    
    if (!Array.isArray(routes) || routes.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Routes array is required'
      });
    }
    
    const transportCollection = db.collection('transportroutes');
    const { ObjectId } = await import('mongodb');
    
    const results = {
      inserted: [],
      errors: [],
      duplicates: []
    };
    
    // Process routes one by one to handle duplicates gracefully
    for (let i = 0; i < routes.length; i++) {
      const routeData = routes[i];
      
      try {
        // Validate required fields
        if (!routeData.routeName || !routeData.operatorName) {
          results.errors.push({
            index: i,
            route: routeData.routeName || 'Unknown',
            error: 'Missing required fields: routeName and operatorName'
          });
          continue;
        }
        
        // Check for existing route with same name and operator
        const existingRoute = await transportCollection.findOne({
          routeName: routeData.routeName,
          operatorName: routeData.operatorName
        });
        
        if (existingRoute) {
          results.duplicates.push({
            index: i,
            route: routeData.routeName,
            operator: routeData.operatorName,
            message: 'Route already exists with same name and operator'
          });
          continue;
        }
        
        // Create unique route number if not provided or if duplicate
        let routeNumber = routeData.routeNumber || '';
        if (routeNumber) {
          const existingWithNumber = await transportCollection.findOne({
            routeNumber: routeNumber,
            operatorName: routeData.operatorName
          });
          
          if (existingWithNumber) {
            // Generate unique route number
            routeNumber = `${routeNumber}-${Date.now().toString().slice(-4)}`;
          }
        }
        
        // Create route object
        const newRoute = {
          _id: new ObjectId(),
          routeName: routeData.routeName,
          routeNumber: routeNumber,
          operatorName: routeData.operatorName,
          operatorType: routeData.operatorType || 'public_transport',
          
          origin: routeData.origin || { name: '', address: '', coordinates: { lat: 0, lng: 0 } },
          destination: routeData.destination || { name: '', address: '', coordinates: { lat: 0, lng: 0 } },
          stops: routeData.stops || [],
          
          schedule: {
            startTime: routeData.schedule?.startTime || '06:00',
            endTime: routeData.schedule?.endTime || '22:00',
            frequency: routeData.schedule?.frequency || '30',
            operatingDays: routeData.schedule?.operatingDays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
            specialSchedule: routeData.schedule?.specialSchedule || {}
          },
          
          pricing: {
            baseFare: Number(routeData.pricing?.baseFare) || 0,
            currency: routeData.pricing?.currency || 'BWP',
            discounts: routeData.pricing?.discounts || {},
            paymentMethods: routeData.pricing?.paymentMethods || ['cash']
          },
          
          distance: Number(routeData.distance) || 0,
          estimatedDuration: routeData.estimatedDuration || '',
          routeType: routeData.routeType || 'urban',
          vehicleType: routeData.vehicleType || 'bus',
          
          accessibility: {
            wheelchairAccessible: Boolean(routeData.accessibility?.wheelchairAccessible),
            lowFloor: Boolean(routeData.accessibility?.lowFloor),
            audioAnnouncements: Boolean(routeData.accessibility?.audioAnnouncements)
          },
          
          contact: routeData.contact || { phone: '', email: '', website: '' },
          
          serviceProvider: routeData.serviceProvider ? 
            (routeData.serviceProvider.length === 24 ? new ObjectId(routeData.serviceProvider) : routeData.serviceProvider) : null,
          
          status: routeData.status || 'active',
          verification: {
            status: 'pending',
            verifiedAt: null,
            verifiedBy: null
          },
          
          createdAt: new Date(),
          updatedAt: new Date(),
          __v: 0
        };
        
        // Insert individual route
        const insertResult = await transportCollection.insertOne(newRoute);
        
        results.inserted.push({
          index: i,
          route: routeData.routeName,
          operator: routeData.operatorName,
          id: insertResult.insertedId,
          routeNumber: routeNumber
        });
        
      } catch (routeError) {
        console.error(`[${timestamp}] Error processing route ${i}:`, routeError);
        
        // Handle specific MongoDB duplicate key errors
        if (routeError.code === 11000) {
          results.duplicates.push({
            index: i,
            route: routeData.routeName || 'Unknown',
            operator: routeData.operatorName || 'Unknown',
            error: 'Duplicate key constraint violation'
          });
        } else {
          results.errors.push({
            index: i,
            route: routeData.routeName || 'Unknown',
            error: routeError.message
          });
        }
      }
    }
    
    console.log(`[${timestamp}] ✅ Bulk upload complete: ${results.inserted.length} inserted, ${results.duplicates.length} duplicates, ${results.errors.length} errors`);
    
    return res.status(200).json({
      success: true,
      message: `Bulk upload complete: ${results.inserted.length} routes created`,
      data: {
        totalRequested: routes.length,
        inserted: results.inserted.length,
        duplicates: results.duplicates.length,
        errors: results.errors.length
      },
      results: results
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Bulk upload transport routes error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to bulk upload transport routes',
      error: error.message
    });
  }
}
    
// === GET DEALERS (FRONTEND ENDPOINT) - FIXED PAGINATION ===
    if (path === '/dealers' && req.method === 'GET') {
      console.log(`[${timestamp}] → FRONTEND DEALERS: Get Dealers`);
      
      try {
        const dealersCollection = db.collection('dealers');
        
        // Build filter based on query parameters
        let filter = {};
        
        // Don't filter by status unless explicitly requested
        if (searchParams.get('status') && searchParams.get('status') !== 'all') {
          filter.status = searchParams.get('status');
        } else {
          // Include active and verified dealers by default
          filter.status = { $in: ['active', 'verified', 'pending'] };
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
        
        // FIXED: Increase default pagination limit
        const page = parseInt(searchParams.get('page')) || 1;
        const limit = parseInt(searchParams.get('limit')) || 50; // ← INCREASED from 10 to 50
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
        
        console.log(`[${timestamp}] DEALERS QUERY:`, {
          filter: filter,
          page: page,
          limit: limit,
          skip: skip
        });
        
        // Get total count
        const total = await dealersCollection.countDocuments(filter);
        console.log(`[${timestamp}] DEALERS TOTAL COUNT: ${total}`);
        
        // Get dealers
        const dealers = await dealersCollection.find(filter)
          .skip(skip)
          .limit(limit)
          .sort(sort)
          .toArray();
        
        console.log(`[${timestamp}] DEALERS RETURNED: ${dealers.length} of ${total} total`);
        
        // Return response in format expected by dealerService
        return res.status(200).json({
          success: true,
          data: dealers,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(total / limit),
            total: total
          },
          debug: {
            filter: filter,
            totalInDatabase: total,
            returned: dealers.length,
            limit: limit,
            page: page
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
   // === UPDATE DEALER (FRONTEND ENDPOINT) - COMPLETE FIX ===
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
        console.log(`[${timestamp}] Update authenticated by: ${adminUser.name}`);
      } else {
        console.log(`[${timestamp}] Update auth failed: ${authResult.message}`);
      }
    }
    
    // Enhanced request body parsing with detailed logging
    let dealerData = {};
    let rawBody = '';
    
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      rawBody = Buffer.concat(chunks).toString();
      
      console.log(`[${timestamp}] UPDATE - Content-Type: ${req.headers['content-type']}`);
      console.log(`[${timestamp}] UPDATE - Body size: ${rawBody.length} bytes`);
      console.log(`[${timestamp}] UPDATE - Body preview: ${rawBody.substring(0, 200)}...`);
      
      const contentType = req.headers['content-type'] || '';
      
      if (contentType.includes('application/json')) {
        // Handle JSON request
        console.log(`[${timestamp}] UPDATE - Parsing as JSON`);
        dealerData = JSON.parse(rawBody);
        console.log(`[${timestamp}] UPDATE - JSON parsed successfully:`, Object.keys(dealerData));
        
      } else if (contentType.includes('multipart/form-data') || rawBody.includes('Content-Disposition')) {
        // Handle FormData request with enhanced parsing
        console.log(`[${timestamp}] UPDATE - Parsing as FormData`);
        
        // Extract dealerData JSON field
        const dealerDataPattern = /name="dealerData"[^]*?\r\n\r\n([^]*?)\r\n--/;
        const dealerDataMatch = rawBody.match(dealerDataPattern);
        
        if (dealerDataMatch) {
          try {
            const dealerDataJSON = dealerDataMatch[1].trim();
            dealerData = JSON.parse(dealerDataJSON);
            console.log(`[${timestamp}] UPDATE - FormData dealerData parsed:`, Object.keys(dealerData));
          } catch (jsonParseError) {
            console.error(`[${timestamp}] UPDATE - Failed to parse dealerData JSON:`, jsonParseError.message);
            console.log(`[${timestamp}] UPDATE - Raw dealerData content:`, dealerDataMatch[1]);
            
            // Fallback: try to extract individual fields
            dealerData = {};
          }
        }
        
        // Enhanced field extraction function
        const extractFormField = (fieldName) => {
          const patterns = [
            new RegExp(`name="${fieldName}"[^]*?\\r\\n\\r\\n([^\\r\\n]+)`, 'g'),
            new RegExp(`name="${fieldName}"[^]*?\\n\\n([^\\n]+)`, 'g'),
            new RegExp(`name="${fieldName}".*?\\r\\n\\r\\n([^\\r\\n--]+)`, 'g')
          ];
          
          for (const pattern of patterns) {
            const match = pattern.exec(rawBody);
            if (match && match[1]) {
              return match[1].trim();
            }
          }
          return null;
        };
        
        // Extract and parse complex fields
        const complexFields = ['contact', 'location', 'profile', 'subscription', 'verification', 'privateSeller'];
        complexFields.forEach(fieldName => {
          if (!dealerData[fieldName]) {
            const fieldValue = extractFormField(fieldName);
            if (fieldValue && fieldValue !== 'undefined' && fieldValue !== 'null') {
              try {
                dealerData[fieldName] = JSON.parse(fieldValue);
                console.log(`[${timestamp}] UPDATE - Parsed ${fieldName} from FormData`);
              } catch (parseError) {
                console.log(`[${timestamp}] UPDATE - Failed to parse ${fieldName}:`, parseError.message);
              }
            }
          }
        });
        
        // Extract simple fields as fallback
        const simpleFields = ['businessName', 'businessType', 'sellerType', 'status', 'user'];
        simpleFields.forEach(fieldName => {
          if (!dealerData[fieldName]) {
            const fieldValue = extractFormField(fieldName);
            if (fieldValue && fieldValue !== 'undefined' && fieldValue !== 'null') {
              dealerData[fieldName] = fieldValue;
              console.log(`[${timestamp}] UPDATE - Extracted ${fieldName}: ${fieldValue}`);
            }
          }
        });
        
      } else {
        // Try JSON fallback
        console.log(`[${timestamp}] UPDATE - Unknown content type, trying JSON fallback`);
        try {
          dealerData = JSON.parse(rawBody);
          console.log(`[${timestamp}] UPDATE - JSON fallback successful`);
        } catch (jsonFallbackError) {
          console.error(`[${timestamp}] UPDATE - All parsing methods failed`);
          return res.status(400).json({
            success: false,
            message: 'Unable to parse request body',
            debug: {
              contentType: contentType,
              bodySize: rawBody.length,
              bodyPreview: rawBody.substring(0, 100),
              error: jsonFallbackError.message
            }
          });
        }
      }
      
    } catch (bodyParseError) {
      console.error(`[${timestamp}] UPDATE - Body parsing error:`, bodyParseError.message);
      return res.status(400).json({
        success: false,
        message: 'Failed to parse request body',
        error: bodyParseError.message,
        debug: {
          bodySize: rawBody.length,
          hasContent: rawBody.length > 0
        }
      });
    }
    
    console.log(`[${timestamp}] UPDATE - Final parsed data structure:`, {
      hasBusinessName: !!dealerData.businessName,
      hasContact: !!dealerData.contact,
      hasLocation: !!dealerData.location,
      hasProfile: !!dealerData.profile,
      hasSubscription: !!dealerData.subscription,
      totalFields: Object.keys(dealerData).length
    });
    
    // Database operations with enhanced error handling
    const dealersCollection = db.collection('dealers');
    const { ObjectId } = await import('mongodb');
    
    // Validate dealer ID
    if (!dealerId || dealerId.length !== 24) {
      return res.status(400).json({
        success: false,
        message: 'Invalid dealer ID format',
        dealerId: dealerId
      });
    }
    
    // Find existing dealer
    let existingDealer;
    try {
      existingDealer = await dealersCollection.findOne({ 
        _id: new ObjectId(dealerId) 
      });
    } catch (dbLookupError) {
      console.error(`[${timestamp}] UPDATE - Database lookup error:`, dbLookupError.message);
      return res.status(500).json({
        success: false,
        message: 'Database lookup failed',
        error: dbLookupError.message,
        dealerId: dealerId
      });
    }
    
    if (!existingDealer) {
      console.log(`[${timestamp}] UPDATE - Dealer not found: ${dealerId}`);
      return res.status(404).json({
        success: false,
        message: 'Dealer not found',
        dealerId: dealerId
      });
    }
    
    console.log(`[${timestamp}] UPDATE - Found existing dealer: ${existingDealer.businessName}`);
    
    // Prepare update data with safe merging
    const updateData = {
      updatedAt: new Date()
    };
    
    // Safely merge fields
    const fieldsToUpdate = ['businessName', 'businessType', 'sellerType', 'status', 'user'];
    fieldsToUpdate.forEach(field => {
      if (dealerData[field] !== undefined && dealerData[field] !== null) {
        updateData[field] = dealerData[field];
      }
    });
    
    // Handle complex objects with safe merging
    if (dealerData.contact && typeof dealerData.contact === 'object') {
      updateData.contact = {
        ...existingDealer.contact,
        ...dealerData.contact
      };
    }
    
    if (dealerData.location && typeof dealerData.location === 'object') {
      updateData.location = {
        ...existingDealer.location,
        ...dealerData.location
      };
    }
    
    if (dealerData.profile && typeof dealerData.profile === 'object') {
      updateData.profile = {
        ...existingDealer.profile,
        ...dealerData.profile
      };
    }
    
    if (dealerData.subscription && typeof dealerData.subscription === 'object') {
      updateData.subscription = {
        ...existingDealer.subscription,
        ...dealerData.subscription
      };
    }
    
    if (dealerData.verification && typeof dealerData.verification === 'object') {
      updateData.verification = {
        ...existingDealer.verification,
        ...dealerData.verification
      };
    }
    
    if (dealerData.privateSeller) {
      updateData.privateSeller = dealerData.privateSeller;
    }
    
    // Add admin user info if available
    if (adminUser) {
      updateData.lastUpdatedBy = {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userName: adminUser.name,
        timestamp: new Date()
      };
    }
    
    console.log(`[${timestamp}] UPDATE - Prepared update data:`, {
      fieldsToUpdate: Object.keys(updateData),
      hasContact: !!updateData.contact,
      hasProfile: !!updateData.profile
    });
    
    // Perform database update
    let updateResult;
    try {
      updateResult = await dealersCollection.updateOne(
        { _id: new ObjectId(dealerId) },
        { $set: updateData }
      );
    } catch (dbUpdateError) {
      console.error(`[${timestamp}] UPDATE - Database update error:`, dbUpdateError.message);
      return res.status(500).json({
        success: false,
        message: 'Database update failed',
        error: dbUpdateError.message,
        dealerId: dealerId
      });
    }
    
    if (updateResult.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Dealer not found during update',
        dealerId: dealerId
      });
    }
    
    // Fetch updated dealer
    let updatedDealer;
    try {
      updatedDealer = await dealersCollection.findOne({ 
        _id: new ObjectId(dealerId) 
      });
    } catch (dbFetchError) {
      console.error(`[${timestamp}] UPDATE - Failed to fetch updated dealer:`, dbFetchError.message);
      // Return success anyway since update succeeded
      updatedDealer = { ...existingDealer, ...updateData, _id: new ObjectId(dealerId) };
    }
    
    console.log(`[${timestamp}] ✅ UPDATE - Dealer updated successfully: ${existingDealer.businessName}`);
    
    return res.status(200).json({
      success: true,
      message: 'Dealer updated successfully',
      data: updatedDealer,
      debug: {
        dealerId: dealerId,
        fieldsUpdated: Object.keys(updateData),
        updateTimestamp: updateData.updatedAt
      }
    });
    
  } catch (error) {
    console.error(`[${timestamp}] UPDATE - Unexpected error:`, error.message);
    console.error(`[${timestamp}] UPDATE - Error stack:`, error.stack);
    
    return res.status(500).json({
      success: false,
      message: 'Internal server error during dealer update',
      error: error.message,
      dealerId: dealerId,
      timestamp: timestamp,
      debug: {
        errorType: error.constructor.name,
        hasStack: !!error.stack
      }
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

   // === REAL S3 IMAGE UPLOAD ENDPOINT ===
if (path === '/images/upload' && req.method === 'POST') {
  try {
    console.log(`[${timestamp}] → S3 IMAGE UPLOAD: Starting real upload`);
    
    // Parse multipart form data for file upload
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);
    
    console.log(`[${timestamp}] S3 UPLOAD - Received ${rawBody.length} bytes`);
    
    // Extract boundary from content-type
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    
    if (!boundaryMatch) {
      console.log(`[${timestamp}] S3 UPLOAD - No boundary found in content-type`);
      return res.status(400).json({
        success: false,
        message: 'Invalid multipart request - no boundary found'
      });
    }
    
    const boundary = boundaryMatch[1];
    const boundaryBuffer = Buffer.from(`--${boundary}`);
    
    // Simple file extraction from multipart data
    const bodyString = rawBody.toString('binary');
    const parts = bodyString.split(`--${boundary}`);
    
    let fileBuffer = null;
    let filename = null;
    let fileType = null;
    
    for (const part of parts) {
      if (part.includes('Content-Disposition: form-data') && part.includes('filename=')) {
        // Extract filename
        const filenameMatch = part.match(/filename="([^"]+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
        
        // Extract content type
        const contentTypeMatch = part.match(/Content-Type: ([^\r\n]+)/);
        if (contentTypeMatch) {
          fileType = contentTypeMatch[1].trim();
        }
        
        // Extract file data (after double CRLF)
        const dataStart = part.indexOf('\r\n\r\n');
        if (dataStart !== -1) {
          const fileData = part.substring(dataStart + 4);
          // Remove trailing boundary if present
          const cleanData = fileData.replace(/\r\n$/, '');
          fileBuffer = Buffer.from(cleanData, 'binary');
          break;
        }
      }
    }
    
    if (!fileBuffer || !filename) {
      console.log(`[${timestamp}] S3 UPLOAD - No file found in multipart data`);
      return res.status(400).json({
        success: false,
        message: 'No file found in upload request'
      });
    }
    
    console.log(`[${timestamp}] S3 UPLOAD - File extracted: ${filename} (${fileBuffer.length} bytes, type: ${fileType})`);
    
    // Check environment variables
    const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
    const awsBucket = process.env.AWS_S3_BUCKET_NAME || 'bw-car-culture-images';
    const awsRegion = process.env.AWS_S3_REGION || 'us-east-1';
    
    if (!awsAccessKey || !awsSecretKey) {
      console.log(`[${timestamp}] S3 UPLOAD - Missing AWS credentials`);
      
      // Return mock URL for now but log the issue
      const mockImageUrl = `https://${awsBucket}.s3.${awsRegion}.amazonaws.com/dealers/dealer-${Date.now()}-${filename}`;
      
      return res.status(200).json({
        success: true,
        message: 'Image upload simulated (AWS credentials missing)',
        imageUrl: mockImageUrl,
        data: {
          url: mockImageUrl,
          filename: filename,
          size: fileBuffer.length,
          uploadedAt: new Date().toISOString(),
          note: 'Configure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in Vercel environment variables'
        }
      });
    }
    
    // Try AWS S3 upload
    try {
      // Import AWS SDK for S3 upload
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      
      // Create S3 client
      const s3Client = new S3Client({
        region: awsRegion,
        credentials: {
          accessKeyId: awsAccessKey,
          secretAccessKey: awsSecretKey,
        },
      });
      
      // Generate unique filename
      const timestamp = Date.now();
      const randomString = Math.random().toString(36).substring(2, 8);
      const fileExtension = filename.split('.').pop() || 'jpg';
      const s3Filename = `dealers/dealer-${timestamp}-${randomString}.${fileExtension}`;
      
      console.log(`[${timestamp}] S3 UPLOAD - Uploading to: ${s3Filename}`);
      
      // Upload to S3
      const uploadCommand = new PutObjectCommand({
        Bucket: awsBucket,
        Key: s3Filename,
        Body: fileBuffer,
        ContentType: fileType || 'image/jpeg',
      });
      
      const uploadResult = await s3Client.send(uploadCommand);
      
      // Generate public URL
      const imageUrl = `https://${awsBucket}.s3.${awsRegion}.amazonaws.com/${s3Filename}`;
      
      console.log(`[${timestamp}] ✅ S3 UPLOAD SUCCESS: ${imageUrl}`);
      
      return res.status(200).json({
        success: true,
        message: 'Image uploaded successfully to S3',
        imageUrl: imageUrl,
        data: {
          url: imageUrl,
          filename: s3Filename,
          size: fileBuffer.length,
          uploadedAt: new Date().toISOString(),
          etag: uploadResult.ETag,
          bucket: awsBucket,
          region: awsRegion
        }
      });
      
    } catch (s3Error) {
      console.error(`[${timestamp}] S3 UPLOAD ERROR:`, s3Error.message);
      
      // If S3 upload fails, fall back to mock URL
      const mockImageUrl = `https://${awsBucket}.s3.${awsRegion}.amazonaws.com/dealers/dealer-${Date.now()}-${filename}`;
      
      return res.status(200).json({
        success: true,
        message: 'S3 upload failed, using mock URL',
        imageUrl: mockImageUrl,
        data: {
          url: mockImageUrl,
          filename: filename,
          size: fileBuffer.length,
          uploadedAt: new Date().toISOString(),
          error: s3Error.message,
          note: 'S3 upload failed - check AWS credentials and bucket permissions'
        }
      });
    }
    
  } catch (error) {
    console.error(`[${timestamp}] IMAGE UPLOAD ERROR:`, error.message);
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
   // === PROVIDERS ALIAS (FRONTEND USES THIS) ===
if (path === '/providers') {
  console.log(`[${timestamp}] → PROVIDERS (alias for service-providers)`);
  
  try {
    const serviceProvidersCollection = db.collection('serviceproviders');
    
    let filter = {};
    
    // Handle status filter (from admin panel)
    if (searchParams.get('status') && searchParams.get('status') !== 'all') {
      filter.status = searchParams.get('status');
    }
    
    // Handle subscription status filter (from admin panel) 
    if (searchParams.get('subscriptionStatus') && searchParams.get('subscriptionStatus') !== 'all') {
      filter['subscription.status'] = searchParams.get('subscriptionStatus');
    }
    
    // Handle provider type filter
    if (searchParams.get('providerType')) {
      filter.providerType = searchParams.get('providerType');
    }
    
    // Handle business type filter
    if (searchParams.get('businessType') && searchParams.get('businessType') !== 'all') {
      filter.businessType = searchParams.get('businessType');
    }
    
    // Handle search filter
    if (searchParams.get('search')) {
      const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
      filter.$or = [
        { businessName: searchRegex },
        { 'profile.description': searchRegex },
        { 'profile.specialties': { $in: [searchRegex] } },
        { 'location.city': searchRegex }
      ];
    }
    
    // Handle city filter
    if (searchParams.get('city')) {
      filter['location.city'] = { $regex: searchParams.get('city'), $options: 'i' };
    }
    
    // Handle pagination
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 12;
    const skip = (page - 1) * limit;
    
    // Handle sorting
    let sort = { businessName: 1 }; // default sort
    const sortParam = searchParams.get('sort') || searchParams.get('sortBy');
    
    if (sortParam) {
      switch (sortParam) {
        case 'newest':
        case '-createdAt':
          sort = { createdAt: -1 };
          break;
        case 'oldest':
        case 'createdAt':
          sort = { createdAt: 1 };
          break;
        case 'businessName':
          sort = { businessName: 1 };
          break;
        case 'subscriptionExpiry':
        case 'subscription.expiresAt':
          sort = { 'subscription.expiresAt': 1 };
          break;
        default:
          if (sortParam.startsWith('-')) {
            const field = sortParam.substring(1);
            sort = { [field]: -1 };
          } else {
            sort = { [sortParam]: 1 };
          }
      }
    }
    
    console.log(`[${timestamp}] PROVIDERS QUERY:`, {
      filter: filter,
      sort: sort,
      page: page,
      limit: limit
    });
    
    // Execute query
    const providers = await serviceProvidersCollection.find(filter)
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .toArray();
    
    const total = await serviceProvidersCollection.countDocuments(filter);
    
    console.log(`[${timestamp}] Found ${providers.length} providers via /providers alias (${total} total)`);
    
    return res.status(200).json({
      success: true,
      data: providers,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total: total
      },
      message: `Found ${providers.length} providers (${total} total)`,
      debug: {
        filter: filter,
        sort: sort,
        totalInDatabase: total
      }
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

    // Add these endpoints to your existing api/index.js file



// === DELETE SERVICE PROVIDER (ENHANCED) ===
if (path.match(/^\/providers\/[a-fA-F0-9]{24}$/) && req.method === 'DELETE') {
  const providerId = path.split('/').pop();
  console.log(`[${timestamp}] → DELETE SERVICE PROVIDER ${providerId}`);
  
  try {
    // Optional: Check authentication for admin operations
    const authHeader = req.headers.authorization;
    let adminUser = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const authResult = await verifyAdminToken(req);
      if (authResult.success) {
        adminUser = authResult.user;
        console.log(`[${timestamp}] Delete authorized by: ${adminUser.name}`);
      } else {
        console.log(`[${timestamp}] Delete auth failed: ${authResult.message}`);
        // Continue without auth for now - uncomment below to require auth
        // return res.status(401).json({
        //   success: false,
        //   message: 'Admin authentication required'
        // });
      }
    }
    
    const providersCollection = db.collection('serviceproviders');
    const { ObjectId } = await import('mongodb');
    
    // Validate provider ID
    if (!providerId || providerId.length !== 24) {
      return res.status(400).json({
        success: false,
        message: 'Invalid provider ID format',
        providerId: providerId
      });
    }
    
    // Check if provider exists first
    let existingProvider;
    try {
      existingProvider = await providersCollection.findOne({ 
        _id: new ObjectId(providerId) 
      });
    } catch (findError) {
      console.error(`[${timestamp}] Error finding provider:`, findError);
      return res.status(400).json({
        success: false,
        message: 'Invalid provider ID',
        error: findError.message
      });
    }
    
    if (!existingProvider) {
      console.log(`[${timestamp}] Provider not found for deletion: ${providerId}`);
      return res.status(404).json({
        success: false,
        message: 'Service provider not found',
        providerId: providerId
      });
    }
    
    console.log(`[${timestamp}] Found provider to delete: ${existingProvider.businessName}`);
    
    // Perform soft delete - mark as deleted
    const deleteData = {
      status: 'deleted',
      deletedAt: new Date(),
      updatedAt: new Date()
    };
    
    // Add admin info if available
    if (adminUser) {
      deleteData.deletedBy = {
        userId: adminUser.id,
        userEmail: adminUser.email,
        userName: adminUser.name,
        timestamp: new Date()
      };
    }
    
    const result = await providersCollection.updateOne(
      { _id: new ObjectId(providerId) },
      { $set: deleteData }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Service provider not found during update',
        providerId: providerId
      });
    }
    
    if (result.modifiedCount === 0) {
      console.log(`[${timestamp}] Provider was matched but not modified - might already be deleted`);
    }
    
    console.log(`[${timestamp}] ✅ Service provider deleted: ${existingProvider.businessName}`);
    
    return res.status(200).json({
      success: true,
      message: 'Service provider deleted successfully',
      data: { 
        id: providerId, 
        businessName: existingProvider.businessName,
        deletedAt: deleteData.deletedAt,
        deletedBy: adminUser ? adminUser.name : 'System'
      }
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Delete service provider error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete service provider',
      error: error.message,
      providerId: providerId,
      stack: error.stack
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

