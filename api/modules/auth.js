// auth.js - All Authentication Related APIs

// Admin token verification helper
export const verifyAdminToken = async (req) => {
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

export const handleAuth = async (req, res, db, path, searchParams, timestamp) => {
  // Only handle auth-related paths
  if (!path.includes('/auth')) return null;

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
};