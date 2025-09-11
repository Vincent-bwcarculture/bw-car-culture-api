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
  'https://www.bwcarculture.com',                         // Add this
  'https://bwcarculture.com',                             // Add this
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

// User token verification helper (for regular users, not just admins)
const verifyUserToken = async (req) => {
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
      
      // For regular user verification, we don't need to check admin roles
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




// HELPER FUNCTION - Add this near your other helper functions
async function getUserSellerType(db, userId) {
  try {
    const { ObjectId } = await import('mongodb');
    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
    
    if (!user) return 'private';
    
    // Check if user has dealership
    const dealersCollection = db.collection('dealers');
    const dealer = await dealersCollection.findOne({ user: new ObjectId(userId) });
    
    if (dealer) return 'dealership';
    
    // Check if user has rental business
    const rentalsCollection = db.collection('rentals');
    const rental = await rentalsCollection.findOne({ user: new ObjectId(userId) });
    
    if (rental) return 'rental';
    
    return 'private';
  } catch (error) {
    console.error('Error determining seller type:', error);
    return 'private';
  }
}

export default async function handler(req, res) {
  // ← CRITICAL: Ensure we ALWAYS return JSON, never HTML
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const origin = req.headers.origin;
  setCORSHeaders(res, origin);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);

    // ← ADD: Ensure JSON responses and prevent HTML fallbacks
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-cache');

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

    // Add this function near the top of your api/index.js file, before the route handlers
const transformUserSubmissionToListing = (submissionData) => {
  console.log('Transforming user submission to listing format...');
  
  const listingData = {
    // Basic info - direct mapping
    title: submissionData.title,
    description: submissionData.description,
    condition: submissionData.condition || 'used',
    category: submissionData.category || 'car',
    bodyStyle: submissionData.bodyStyle || '',
    
    // Price mapping - handle both nested and direct structures
    price: submissionData.pricing?.price || submissionData.price,
    priceType: submissionData.pricing?.priceType || submissionData.priceType || 'fixed',
    priceOptions: {
      includesVAT: submissionData.pricing?.includesVAT || false,
      financeAvailable: submissionData.pricing?.financing || false,
      leaseAvailable: submissionData.pricing?.leasing || false,
      negotiable: submissionData.pricing?.negotiable || false,
      monthlyPayment: submissionData.pricing?.monthlyPayment || null,
      showPriceAsPOA: false,
      // Savings fields - set defaults
      originalPrice: null,
      savingsAmount: null,
      savingsPercentage: null,
      showSavings: false,
      exclusiveDeal: false
    },
    
    // Currency
    currency: submissionData.pricing?.currency || submissionData.currency || 'BWP',
    
    // Specifications - should work as-is but ensure all required fields
    specifications: {
      make: submissionData.specifications?.make || '',
      model: submissionData.specifications?.model || '',
      year: submissionData.specifications?.year || new Date().getFullYear(),
      mileage: submissionData.specifications?.mileage || 0,
      transmission: submissionData.specifications?.transmission || '',
      fuelType: submissionData.specifications?.fuelType || '',
      engineSize: submissionData.specifications?.engineSize || '',
      drivetrain: submissionData.specifications?.drivetrain || '',
      exteriorColor: submissionData.specifications?.exteriorColor || '',
      interiorColor: submissionData.specifications?.interiorColor || '',
      doors: submissionData.specifications?.doors || '',
      seats: submissionData.specifications?.seats || '',
      vin: submissionData.specifications?.vin || ''
    },
    
    // Features arrays - ensure they exist
    safetyFeatures: submissionData.safetyFeatures || [],
    comfortFeatures: submissionData.comfortFeatures || [],
    exteriorFeatures: submissionData.exteriorFeatures || [],
    interiorFeatures: submissionData.interiorFeatures || [],
    
    // Images - handle both formats
    images: (submissionData.images || []).map((image, index) => {
      if (typeof image === 'string') {
        return {
          url: image,
          key: `user-listings/${Date.now()}/${index}`,
          isPrimary: index === 0,
          size: null,
          mimetype: 'image/jpeg'
        };
      }
      return {
        url: image.url || image,
        key: image.key || `user-listings/${Date.now()}/${index}`,
        isPrimary: image.isPrimary || index === 0,
        size: image.size || null,
        mimetype: image.mimetype || 'image/jpeg'
      };
    }),
    
    // Contact -> Dealer mapping for private sellers
    dealer: {
      businessName: submissionData.contact?.sellerName || 'Private Seller',
      sellerType: 'private',
      privateSeller: {
        firstName: submissionData.contact?.sellerName?.split(' ')[0] || '',
        lastName: submissionData.contact?.sellerName?.split(' ').slice(1).join(' ') || '',
        preferredContactMethod: submissionData.contact?.preferredContactMethod || 'phone'
      },
      contact: {
        phone: submissionData.contact?.phone || '',
        email: submissionData.contact?.email || '',
        whatsapp: submissionData.contact?.whatsapp || submissionData.contact?.phone
      },
      location: {
        city: submissionData.contact?.location?.city || '',
        state: submissionData.contact?.location?.state || '',
        country: submissionData.contact?.location?.country || 'Botswana',
        coordinates: null
      },
      profile: {
        logo: null,
        description: `Private seller in ${submissionData.contact?.location?.city || 'Botswana'}`
      },
      verification: {
        isVerified: false,
        verifiedAt: null
      },
      metrics: {
        totalSales: 0,
        activeSales: 1,
        averageRating: 0,
        totalReviews: 0
      }
    },
    
    // Location mapping (separate from dealer location)
    location: {
      city: submissionData.contact?.location?.city || '',
      state: submissionData.contact?.location?.state || '',
      country: submissionData.contact?.location?.country || 'Botswana',
      coordinates: null
    },
    
    // Contact info (separate field)
    contact: {
      sellerName: submissionData.contact?.sellerName || 'Private Seller',
      phone: submissionData.contact?.phone || '',
      email: submissionData.contact?.email || '',
      whatsapp: submissionData.contact?.whatsapp || submissionData.contact?.phone,
      preferredContactMethod: submissionData.contact?.preferredContactMethod || 'phone',
      location: {
        city: submissionData.contact?.location?.city || '',
        state: submissionData.contact?.location?.state || '',
        country: submissionData.contact?.location?.country || 'Botswana'
      }
    },
    
    // Service history
    serviceHistory: {
      hasServiceHistory: submissionData.serviceHistory?.hasServiceHistory || false,
      records: submissionData.serviceHistory?.records || []
    },
    
    // Status and metadata
    status: 'active',
    featured: false,
    views: 0,
    saves: 0,
    inquiries: 0,
    
    // SEO fields
    seo: {
      metaTitle: submissionData.title,
      metaDescription: submissionData.description?.substring(0, 160),
      keywords: [
        submissionData.specifications?.make,
        submissionData.specifications?.model,
        submissionData.specifications?.year?.toString(),
        'used car',
        'private seller'
      ].filter(Boolean)
    }
  };
  
  console.log('Transformation complete:', {
    title: listingData.title,
    price: listingData.price,
    sellerName: listingData.dealer.businessName,
    city: listingData.location.city
  });
  
  return listingData;
};


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

      // Add this code to your api/index.js file, right after the login endpoint

// REGISTRATION ENDPOINT
if (path === '/auth/register' && req.method === 'POST') {
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
    
    const { name, email, password } = body;
    
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and password'
      });
    }
    
    console.log(`[${timestamp}] Registration attempt for email: ${email}`);
    
    const usersCollection = db.collection('users');
    
    // Check if user already exists
    const existingUser = await usersCollection.findOne({ 
      email: email.toLowerCase() 
    });
    
    if (existingUser) {
      console.log(`[${timestamp}] User already exists: ${email}`);
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }
    
    // Hash password
    const bcrypt = await import('bcryptjs');
    const salt = await bcrypt.default.genSalt(12);
    const hashedPassword = await bcrypt.default.hash(password, salt);
    
    // Create user object
    const { ObjectId } = await import('mongodb');
    const newUser = {
      _id: new ObjectId(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: 'user',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLogin: null,
      favorites: []
    };
    
    // Insert user into database
    const result = await usersCollection.insertOne(newUser);
    
    if (result.insertedId) {
      // Create JWT token
      const jwt = await import('jsonwebtoken');
      const token = jwt.default.sign(
        { id: result.insertedId.toString() },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      console.log(`[${timestamp}] User registered successfully: ${email}`);
      
      return res.status(201).json({
        success: true,
        token,
        user: {
          id: result.insertedId.toString(),
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          avatar: null
        }
      });
    } else {
      console.error(`[${timestamp}] Failed to create user: ${email}`);
      return res.status(500).json({
        success: false,
        message: 'Failed to create user account'
      });
    }
    
  } catch (error) {
    console.error(`[${timestamp}] Registration error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during registration'
    });
  }
}

// ADMIN REGISTRATION ENDPOINT
if (path === '/auth/register/admin' && req.method === 'POST') {
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
    
    const { name, email, password } = body;
    
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and password'
      });
    }
    
    console.log(`[${timestamp}] Admin registration attempt for email: ${email}`);
    
    const usersCollection = db.collection('users');
    
    // Check if user already exists
    const existingUser = await usersCollection.findOne({ 
      email: email.toLowerCase() 
    });
    
    if (existingUser) {
      console.log(`[${timestamp}] User already exists: ${email}`);
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }
    
    // Hash password
    const bcrypt = await import('bcryptjs');
    const salt = await bcrypt.default.genSalt(12);
    const hashedPassword = await bcrypt.default.hash(password, salt);
    
    // Create admin user object (pending approval)
    const { ObjectId } = await import('mongodb');
    const newAdmin = {
      _id: new ObjectId(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: 'admin',
      status: 'pending', // Requires approval
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLogin: null,
      favorites: []
    };
    
    // Insert admin user into database
    const result = await usersCollection.insertOne(newAdmin);
    
    if (result.insertedId) {
      console.log(`[${timestamp}] Admin user registered successfully (pending approval): ${email}`);
      
      return res.status(201).json({
        success: true,
        message: 'Admin registration successful! Please wait for approval.'
      });
    } else {
      console.error(`[${timestamp}] Failed to create admin user: ${email}`);
      return res.status(500).json({
        success: false,
        message: 'Failed to create admin account'
      });
    }
    
  } catch (error) {
    console.error(`[${timestamp}] Admin registration error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during admin registration'
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

      // TOKEN VERIFICATION ENDPOINT (alias for /auth/me)
if (path === '/auth/me' && req.method === 'GET') {
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
      
      // Try multiple lookup strategies (same logic as /auth/verify)
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
        console.log(`[${timestamp}] ❌ User not found in database for verification`);
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }
      
      console.log(`[${timestamp}] ✅ Token verification successful for: ${user.name}`);
      
      return res.status(200).json({
        success: true,
        data: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status
        }
      });
      
    } catch (jwtError) {
      console.log(`[${timestamp}] ❌ JWT verification failed:`, jwtError.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }
    
  } catch (error) {
    console.error(`[${timestamp}] Auth verification error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Authentication verification failed'
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


// // @desc    Get users for network/social features (admin role only - temporary)
// // @route   GET /users/network
// // @access  Private (authenticated users only)
if (path === '/users/network' && req.method === 'GET') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → GET NETWORK USERS (ADMIN ROLE ONLY - TEMPORARY)`);
  
  try {
    // Check authentication
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const currentUserId = authResult.user.id;
    console.log(`[${timestamp}] Fetching admin role users for network for: ${currentUserId}`);

    const { ObjectId } = await import('mongodb');
    const usersCollection = db.collection('users');
    
    // Parse query parameters for pagination and filtering
    const url = new URL(req.url, `https://${req.headers.host}`);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    const search = url.searchParams.get('search') || '';
    const userType = url.searchParams.get('userType') || 'all';
    const verified = url.searchParams.get('verified') || 'all';
    
    const skip = (page - 1) * limit;

    // Build query - ONLY SHOW USERS WITH ROLE "admin"
    let query = {
      _id: { $ne: ObjectId.isValid(currentUserId) ? new ObjectId(currentUserId) : currentUserId },
      status: { $ne: 'deleted' }, // Exclude deleted users
      
      // Only show users with role exactly "admin"
      role: 'admin'
    };

    console.log(`[${timestamp}] Query for admin users:`, query);

    // Add search filter
    if (search) {
      query.$and = query.$and || [];
      query.$and.push({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      });
    }

    // User type filter - only allow 'admin' or 'all'
    if (userType !== 'all' && userType === 'admin') {
      // Role is already set to 'admin', so no change needed
      console.log(`[${timestamp}] User type filter: admin (already applied)`);
    } else if (userType !== 'all' && userType !== 'admin') {
      // If they filter for non-admin roles, show no results
      query.role = 'non_existent_role';
      console.log(`[${timestamp}] User type filter: ${userType} (not admin, will show no results)`);
    }

    // Add verification filter
    if (verified === 'verified') {
      query.emailVerified = true;
    } else if (verified === 'unverified') {
      query.emailVerified = { $ne: true };
    }

    // Get total count for pagination
    const total = await usersCollection.countDocuments(query);
    console.log(`[${timestamp}] Total admin users found: ${total}`);

    // Fetch users with pagination
    const users = await usersCollection
      .find(query)
      .sort({ createdAt: -1 }) // Most recent users first
      .skip(skip)
      .limit(limit)
      .project({
        // Return the same fields that work in vehicle cards
        name: 1,
        email: 1,
        role: 1,
        avatar: 1, // This is the key field that works in vehicle cards
        profilePicture: 1,
        city: 1,
        bio: 1,
        emailVerified: 1,
        createdAt: 1,
        // Don't include sensitive data
        password: 0,
        security: 0
      })
      .toArray();

    console.log(`[${timestamp}] Found ${users.length} admin users:`, users.map(u => ({name: u.name, role: u.role, email: u.email})));

    // Add debugging for avatar fields (like in vehicle cards)
    users.forEach(user => {
      console.log(`[${timestamp}] User ${user.name} avatar data:`, {
        hasAvatar: !!user.avatar,
        avatarUrl: user.avatar?.url,
        avatarStructure: user.avatar,
        hasProfilePicture: !!user.profilePicture
      });
    });

    // Add stats for each user (matching vehicle card format)
    const usersWithStats = users.map(user => ({
      ...user,
      memberSince: user.createdAt,
      isVerified: user.emailVerified || false
    }));

    const totalPages = Math.ceil(total / limit);

    console.log(`[${timestamp}] ✅ Returning ${users.length} admin users (page ${page}/${totalPages})`);

    return res.status(200).json({
      success: true,
      data: usersWithStats,
      pagination: {
        currentPage: page,
        totalPages,
        total: users.length,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        limit
      },
      message: `Found ${users.length} admin users`
    });

  } catch (error) {
    console.error(`[${timestamp}] Network users error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch network users',
      error: error.message
    });
  }
}



// Test endpoint to check if endpoints are reachable
if (path === '/debug/endpoints' && req.method === 'GET') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → DEBUG: Endpoints Test`);
  
  return res.status(200).json({
    success: true,
    message: 'Debug endpoints are working',
    availableEndpoints: [
      'GET /debug/endpoints',
      'POST /debug/upload-test',
      'GET /user/profile',
      'POST /user/profile/avatar',
      'POST /user/profile/cover-picture',
      'DELETE /user/profile/cover-picture'
    ],
    timestamp: timestamp
  });
}

// Debug upload test endpoint
if (path === '/debug/upload-test' && req.method === 'POST') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → DEBUG: Upload Test Endpoint`);
  
  try {
    // Log request headers
    console.log(`[${timestamp}] Request Headers:`, req.headers);
    console.log(`[${timestamp}] Content-Type:`, req.headers['content-type']);
    console.log(`[${timestamp}] Authorization:`, req.headers.authorization ? 'Present' : 'Missing');
    
    // Test authentication
    const authResult = await verifyUserToken(req);
    console.log(`[${timestamp}] Auth Result:`, {
      success: authResult.success,
      userId: authResult.success ? authResult.user.id : null,
      error: authResult.error
    });
    
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication test failed',
        error: authResult.error
      });
    }

    // Test AWS credentials
    const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
    const awsBucket = process.env.AWS_S3_BUCKET_NAME || 'bw-car-culture-images';
    const awsRegion = process.env.AWS_S3_REGION || 'us-east-1';
    
    console.log(`[${timestamp}] AWS Config:`, {
      hasAccessKey: !!awsAccessKey,
      hasSecretKey: !!awsSecretKey,
      bucket: awsBucket,
      region: awsRegion,
      accessKeyLength: awsAccessKey ? awsAccessKey.length : 0,
      secretKeyLength: awsSecretKey ? awsSecretKey.length : 0
    });

    // Test database connection
    const { ObjectId } = await import('mongodb');
    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({
      _id: ObjectId.isValid(authResult.user.id) ? new ObjectId(authResult.user.id) : authResult.user.id
    });
    
    console.log(`[${timestamp}] Database Test:`, {
      userFound: !!user,
      userName: user?.name,
      hasAvatar: !!user?.avatar,
      hasCoverPicture: !!user?.coverPicture
    });

    return res.status(200).json({
      success: true,
      message: 'Debug test completed successfully',
      data: {
        auth: authResult.success,
        userId: authResult.user.id,
        userName: user?.name,
        aws: {
          hasCredentials: !!(awsAccessKey && awsSecretKey),
          bucket: awsBucket,
          region: awsRegion
        },
        database: {
          userFound: !!user,
          hasAvatar: !!user?.avatar,
          hasCoverPicture: !!user?.coverPicture
        },
        timestamp: timestamp
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] ❌ Debug test error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Debug test failed',
      error: error.message,
      stack: error.stack
    });
  }
}











// Add this section to your existing api/index.js file
// Insert these route handlers after your existing authentication routes

    // === USER PROFILE ROUTES === 
    // Enhanced user profile management
    if (path.startsWith('/user/profile')) {
      console.log(`[${timestamp}] → USER PROFILE: ${path}`);
      
      // Get complete user profile
  if (path === '/user/profile' && req.method === 'GET') {
  console.log(`[${timestamp}] 🔍 DEBUG: USER PROFILE ENDPOINT HIT`);
  
  try {
    // 1. First, let's see what auth method is being used
    console.log(`[${timestamp}] 🔍 Testing authentication methods...`);
    
    // Try the NEW auth method first
    let authResult;
    try {
      authResult = await verifyUserToken(req);
      console.log(`[${timestamp}] ✅ verifyUserToken result:`, {
        success: authResult.success,
        hasUser: !!authResult.user,
        userId: authResult.user?.id,
        userEmail: authResult.user?.email
      });
    } catch (authError) {
      console.log(`[${timestamp}] ❌ verifyUserToken failed:`, authError.message);
      
      // Fallback to old method for debugging
      try {
        console.log(`[${timestamp}] 🔄 Trying old auth method...`);
        const authHeader = req.headers.authorization;
        if (authHeader) {
          const token = authHeader.substring(7);
          console.log(`[${timestamp}] 🔍 Token exists:`, token.substring(0, 20) + '...');
        } else {
          console.log(`[${timestamp}] ❌ No authorization header found`);
        }
      } catch (e) {
        console.log(`[${timestamp}] ❌ Auth debug failed:`, e.message);
      }
    }

    if (!authResult?.success) {
      console.log(`[${timestamp}] ❌ Authentication failed, returning 401`);
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        debug: 'Auth verification failed'
      });
    }

    // 2. Now let's check the database connection and user lookup
    console.log(`[${timestamp}] 🔍 Looking up user in database...`);
    
    const { ObjectId } = await import('mongodb');
    const usersCollection = db.collection('users');
    
    // First, let's see what user ID we're looking for
    const userId = authResult.user?.id;
    console.log(`[${timestamp}] 🔍 Searching for user ID:`, userId);
    console.log(`[${timestamp}] 🔍 User ID type:`, typeof userId);
    
    if (!userId) {
      console.log(`[${timestamp}] ❌ No user ID found in auth result`);
      return res.status(400).json({
        success: false,
        message: 'No user ID in authentication',
        debug: { authResult: authResult }
      });
    }

    // Try to find the user
    let user;
    try {
      user = await usersCollection.findOne({ _id: new ObjectId(userId) });
      console.log(`[${timestamp}] 🔍 Database lookup result:`, {
        found: !!user,
        hasName: !!user?.name,
        hasEmail: !!user?.email,
        hasProfile: !!user?.profile,
        userKeys: user ? Object.keys(user).join(', ') : 'none'
      });
    } catch (dbError) {
      console.log(`[${timestamp}] ❌ Database lookup failed:`, dbError.message);
      return res.status(500).json({
        success: false,
        message: 'Database lookup failed',
        debug: { error: dbError.message, userId: userId }
      });
    }

    if (!user) {
      console.log(`[${timestamp}] ❌ User not found in database`);
      return res.status(404).json({
        success: false,
        message: 'User not found in database',
        debug: { searchedUserId: userId }
      });
    }

    // 3. Let's examine the user data structure
    console.log(`[${timestamp}] 🔍 User data structure analysis:`);
    console.log(`[${timestamp}] - User _id:`, user._id);
    console.log(`[${timestamp}] - User name:`, user.name);
    console.log(`[${timestamp}] - User email:`, user.email);
    console.log(`[${timestamp}] - User role:`, user.role);
    console.log(`[${timestamp}] - Has password:`, !!user.password);
    console.log(`[${timestamp}] - Has profile:`, !!user.profile);
    console.log(`[${timestamp}] - Has avatar:`, !!user.avatar);
    console.log(`[${timestamp}] - All user keys:`, Object.keys(user));

    // 4. Clean up sensitive data safely
    const cleanUser = { ...user };
    delete cleanUser.password;
    delete cleanUser.security;
    
    // 5. Calculate profile completeness safely
    let completeness = 0;
    try {
      if (user.name) completeness += 25;
      if (user.email) completeness += 25;
      if (user.avatar?.url) completeness += 15;
      if (user.profile?.phone) completeness += 10;
      if (user.profile?.bio) completeness += 10;
      if (user.profile?.address?.city) completeness += 15;
      console.log(`[${timestamp}] ✅ Profile completeness calculated:`, completeness);
    } catch (completenessError) {
      console.log(`[${timestamp}] ❌ Profile completeness calculation failed:`, completenessError.message);
      completeness = 0;
    }

    // 6. Build response data carefully
    const responseData = {
      ...cleanUser,
      profileCompleteness: completeness,
      stats: {
        totalVehicles: 0,
        activeListings: 0,
        totalViews: 0
      },
      debug: {
        authMethod: 'verifyUserToken',
        databaseConnection: 'success',
        userFound: true,
        timestamp: timestamp
      }
    };

    console.log(`[${timestamp}] ✅ Sending successful response`);
    return res.status(200).json({
      success: true,
      data: responseData,
      message: 'Profile loaded successfully'
    });

  } catch (error) {
    console.error(`[${timestamp}] ❌ CRITICAL ERROR in user profile endpoint:`, error);
    console.error(`[${timestamp}] Error stack:`, error.stack);
    
    return res.status(500).json({
      success: false,
      message: 'Critical error in profile endpoint',
      error: error.message,
      debug: {
        timestamp: timestamp,
        endpoint: '/user/profile',
        method: 'GET'
      }
    });
  }
}

// Simple name update endpoint
if (path === '/api/user/profile/update-name' && req.method === 'POST') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → UPDATE USER NAME`);
  
  try {
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    const { name } = JSON.parse(body);

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Name is required'
      });
    }

    console.log(`[${timestamp}] Updating name for user ${authResult.userId}: "${name}"`);

    const { ObjectId } = await import('mongodb');
    const usersCollection = db.collection('users');
    
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(authResult.userId) },
      { 
        $set: { 
          name: name.trim(),
          updatedAt: new Date()
        }
      }
    );

    console.log(`[${timestamp}] Name update result:`, result);

    if (result.modifiedCount === 1 || result.matchedCount === 1) {
      console.log(`[${timestamp}] ✅ Name updated successfully`);
      return res.status(200).json({
        success: true,
        message: 'Name updated successfully'
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Failed to update name'
      });
    }

  } catch (error) {
    console.error(`[${timestamp}] ❌ Name update error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update name',
      error: error.message
    });
  }
}

// Add this to your api/index.js file - COPY THE EXACT WORKING PATTERN

// Profile Text Update Endpoint - COPIED FROM WORKING IMAGE UPLOAD PATTERN
if (path === '/user/profile/update' && req.method === 'POST') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → UPDATE PROFILE DATA`);
  
  try {
    // COPIED: Same authentication pattern as working image uploads
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      console.log(`[${timestamp}] ❌ Authentication failed`);
      return res.status(401).json({
        success: false,
        message: 'Authentication required for profile update'
      });
    }

    const userId = authResult.user.id;
    console.log(`[${timestamp}] Profile update for user: ${userId}`);

    // COPIED: Same request parsing pattern as working endpoints
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    
    let updateData;
    try {
      updateData = JSON.parse(body);
      console.log(`[${timestamp}] Received update data:`, updateData);
    } catch (parseError) {
      console.log(`[${timestamp}] ❌ Failed to parse JSON`);
      return res.status(400).json({
        success: false,
        message: 'Invalid JSON data'
      });
    }

    // COPIED: Same database connection pattern as working endpoints  
    const { ObjectId } = await import('mongodb');
    const usersCollection = db.collection('users');

    // COPIED: Same user lookup pattern as working endpoints
    const currentUser = await usersCollection.findOne({
      _id: ObjectId.isValid(userId) ? new ObjectId(userId) : userId
    });

    if (!currentUser) {
      console.log(`[${timestamp}] ❌ User not found: ${userId}`);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`[${timestamp}] Current user found: ${currentUser.name || currentUser.email}`);

    // Prepare update object - simple and clean like image uploads
    const profileUpdate = {
      updatedAt: new Date()
    };

    // Update basic fields if provided
    if (updateData.name && updateData.name.trim()) {
      profileUpdate.name = updateData.name.trim();
    }

    // Update profile nested fields if provided
    if (updateData.bio !== undefined) {
      profileUpdate['profile.bio'] = updateData.bio.trim();
    }
    if (updateData.phone !== undefined) {
      profileUpdate['profile.phone'] = updateData.phone.trim();
    }
    if (updateData.location !== undefined) {
      profileUpdate['profile.location'] = updateData.location.trim();
    }
    if (updateData.firstName !== undefined) {
      profileUpdate['profile.firstName'] = updateData.firstName.trim();
    }
    if (updateData.lastName !== undefined) {
      profileUpdate['profile.lastName'] = updateData.lastName.trim();
    }
    if (updateData.gender !== undefined) {
      profileUpdate['profile.gender'] = updateData.gender;
    }
    if (updateData.nationality !== undefined) {
      profileUpdate['profile.nationality'] = updateData.nationality.trim();
    }
    if (updateData.website !== undefined) {
      profileUpdate['profile.website'] = updateData.website.trim();
    }
    if (updateData.dateOfBirth !== undefined) {
      profileUpdate['profile.dateOfBirth'] = updateData.dateOfBirth;
    }

    console.log(`[${timestamp}] Profile update fields:`, Object.keys(profileUpdate));

    // COPIED: Same database update pattern as working image uploads
    const updateResult = await usersCollection.updateOne(
      { _id: ObjectId.isValid(userId) ? new ObjectId(userId) : userId },
      { $set: profileUpdate }
    );

    console.log(`[${timestamp}] 💾 Database update result: ${updateResult.modifiedCount} documents modified`);

    if (updateResult.modifiedCount === 1 || updateResult.matchedCount === 1) {
      // Get updated user data - same pattern as working endpoints
      const updatedUser = await usersCollection.findOne({
        _id: ObjectId.isValid(userId) ? new ObjectId(userId) : userId
      });

      // Remove sensitive data - same as working endpoints
      delete updatedUser.password;
      delete updatedUser.security;

      console.log(`[${timestamp}] ✅ Profile updated successfully`);

      // COPIED: Same success response pattern as working image uploads
      return res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: {
          user: updatedUser
        }
      });
    } else {
      console.log(`[${timestamp}] ⚠️ No documents were modified`);
      return res.status(400).json({
        success: false,
        message: 'No changes were made to the profile'
      });
    }

  } catch (error) {
    // COPIED: Same error handling pattern as working endpoints
    console.error(`[${timestamp}] ❌ Profile update error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Profile update failed',
      error: error.message
    });
  }
}

  


// Update user address (additional endpoint)
if (path === '/user/profile/address' && req.method === 'PUT') {
  try {
    const authResult = await verifyUserToken(req);
    if (!authResult.success) return;

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    const addressData = JSON.parse(body);

    const usersCollection = db.collection('users');
    
    // Update address information
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(authResult.userId) },
      { 
        $set: { 
          'profile.address': addressData,
          updatedAt: new Date()
        }
      }
    );

    if (result.modifiedCount === 1) {
      return res.status(200).json({
        success: true,
        message: 'Address updated successfully',
        data: addressData
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'No changes were made to address'
      });
    }

  } catch (error) {
    console.error('Address update error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update address',
      error: error.message
    });
  }
}

      // Get user's services
      if (path === '/user/profile/services' && req.method === 'GET') {
        try {
           const authResult = await verifyUserToken(req);
          if (!authResult.success) return;

          const usersCollection = db.collection('users');
          const user = await usersCollection.findOne({ 
            _id: new ObjectId(authResult.userId) 
          });

          const services = user?.businessProfile?.services || [];

          return res.status(200).json({
            success: true,
            count: services.length,
            data: services,
            overallStatus: user?.businessProfile?.overallVerificationStatus || 'unverified'
          });

        } catch (error) {
          console.error(`[${timestamp}] Get services error:`, error);
          return res.status(500).json({
            success: false,
            message: 'Failed to load services'
          });
        }
      }

      // Add new service
      if (path === '/user/profile/services' && req.method === 'POST') {
        try {
           const authResult = await verifyUserToken(req);
          if (!authResult.success) return;

          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = Buffer.concat(chunks).toString();
          const serviceData = JSON.parse(body);

          // Validate required fields
          if (!serviceData.serviceType || !serviceData.serviceName || !serviceData.description) {
            return res.status(400).json({
              success: false,
              message: 'Service type, name, and description are required'
            });
          }

          // Generate unique service code for QR
          const serviceCode = `${serviceData.serviceType.toUpperCase()}_${Date.now().toString(36).toUpperCase()}`;

          const newService = {
            _id: new ObjectId(),
            serviceType: serviceData.serviceType,
            serviceName: serviceData.serviceName,
            description: serviceData.description,
            location: serviceData.location || {},
            operatingHours: serviceData.operatingHours || {},
            contactInfo: serviceData.contactInfo || {},
            isActive: false,
            isVerified: false,
            verificationStatus: 'pending',
            verificationDocuments: [],
            qrCode: {
              code: serviceCode,
              isActive: false,
              generatedAt: new Date()
            },
            createdAt: new Date()
          };

          const usersCollection = db.collection('users');
          await usersCollection.updateOne(
            { _id: new ObjectId(authResult.userId) },
            { 
              $push: { 'businessProfile.services': newService },
              $set: { 
                'businessProfile.overallVerificationStatus': 'pending',
                'activity.lastActiveAt': new Date()
              }
            }
          );

          return res.status(201).json({
            success: true,
            message: 'Service added successfully. Please upload verification documents to activate it.',
            data: newService
          });

        } catch (error) {
          console.error(`[${timestamp}] Add service error:`, error);
          return res.status(500).json({
            success: false,
            message: 'Failed to add service'
          });
        }
      }

      // Generate QR code for service
      if (path.match(/^\/user\/profile\/services\/([^\/]+)\/qr-code$/) && req.method === 'POST') {
        try {
           const authResult = await verifyUserToken(req);
          if (!authResult.success) return;

          const serviceId = path.split('/')[4];
          
          const usersCollection = db.collection('users');
          const user = await usersCollection.findOne({ 
            _id: new ObjectId(authResult.userId) 
          });

          const service = user?.businessProfile?.services?.find(s => 
            s._id.toString() === serviceId
          );

          if (!service) {
            return res.status(404).json({
              success: false,
              message: 'Service not found'
            });
          }

          if (!service.isVerified) {
            return res.status(400).json({
              success: false,
              message: 'Service must be verified before generating QR code'
            });
          }

          // Generate QR code data
          const qrData = `${service.serviceType}|${service._id}|${authResult.userId}|${service.serviceName}`;
          
          // For production, use a QR code library like 'qrcode'
          // const qrCodeUrl = await QRCode.toDataURL(qrData);
          const qrCodeUrl = `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==`; // Placeholder

          // Update service with QR code
          await usersCollection.updateOne(
            { 
              _id: new ObjectId(authResult.userId),
              'businessProfile.services._id': new ObjectId(serviceId)
            },
            { 
              $set: { 
                'businessProfile.services.$.qrCode.url': qrCodeUrl,
                'businessProfile.services.$.qrCode.isActive': true,
                'businessProfile.services.$.qrCode.generatedAt': new Date()
              }
            }
          );

          return res.status(200).json({
            success: true,
            message: 'QR code generated successfully',
            data: {
              serviceId: serviceId,
              serviceName: service.serviceName,
              qrCode: {
                url: qrCodeUrl,
                code: service.qrCode.code,
                isActive: true,
                generatedAt: new Date()
              }
            }
          });

        } catch (error) {
          console.error(`[${timestamp}] Generate QR error:`, error);
          return res.status(500).json({
            success: false,
            message: 'Failed to generate QR code'
          });
        }
      }

      // Get user's QR codes
      if (path === '/user/profile/qr-codes' && req.method === 'GET') {
        try {
          const authResult = await verifyUserToken(req);
          if (!authResult.success) return;

          const usersCollection = db.collection('users');
          const user = await usersCollection.findOne({ 
            _id: new ObjectId(authResult.userId) 
          });

          const qrCodes = [];
          if (user?.businessProfile?.services) {
            user.businessProfile.services.forEach(service => {
              if (service.qrCode && service.qrCode.isActive && service.isVerified) {
                qrCodes.push({
                  serviceId: service._id,
                  serviceName: service.serviceName,
                  serviceType: service.serviceType,
                  qrCode: service.qrCode
                });
              }
            });
          }

          return res.status(200).json({
            success: true,
            count: qrCodes.length,
            data: qrCodes
          });

        } catch (error) {
          console.error(`[${timestamp}] Get QR codes error:`, error);
          return res.status(500).json({
            success: false,
            message: 'Failed to load QR codes'
          });
        }
      }


      // This handles avatar uploads (separate from cover picture uploads)

// Upload Avatar Endpoint
if (path === '/user/profile/avatar' && req.method === 'POST') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → UPLOAD AVATAR`);
  
  try {
    // Verify user authentication
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      console.log(`[${timestamp}] ❌ Authentication failed`);
      return res.status(401).json({
        success: false,
        message: 'Authentication required for avatar upload'
      });
    }

    const userId = authResult.user.id;
    console.log(`[${timestamp}] Avatar upload for user: ${userId}`);

    // Parse multipart form data
    const boundary = req.headers['content-type']?.split('boundary=')[1];
    if (!boundary) {
      console.log(`[${timestamp}] ❌ No boundary found in content-type`);
      return res.status(400).json({
        success: false,
        message: 'Invalid multipart form data - no boundary'
      });
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    const body = buffer.toString('binary');

    console.log(`[${timestamp}] Received data length: ${buffer.length}`);
    console.log(`[${timestamp}] Content-Type: ${req.headers['content-type']}`);

    // Parse form data
    const parts = body.split('--' + boundary);
    let filename = null;
    let fileBuffer = null;
    let fileType = 'image/jpeg';

    for (const part of parts) {
      if (part.includes('Content-Disposition: form-data; name="avatar"')) {
        const filenameMatch = part.match(/filename="([^"]*)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }

        const contentTypeMatch = part.match(/Content-Type: ([^\r\n]*)/);
        if (contentTypeMatch) {
          fileType = contentTypeMatch[1].trim();
        }

        const dataStart = part.indexOf('\r\n\r\n');
        if (dataStart !== -1) {
          const fileData = part.substring(dataStart + 4);
          const cleanData = fileData.replace(/\r\n$/, '').replace(/\r\n--$/, '');
          fileBuffer = Buffer.from(cleanData, 'binary');
          break;
        }
      }
    }

    if (!fileBuffer || fileBuffer.length < 100) {
      console.log(`[${timestamp}] ❌ No valid file found. Buffer length: ${fileBuffer?.length || 0}`);
      return res.status(400).json({
        success: false,
        message: 'No valid avatar file found in request'
      });
    }

    console.log(`[${timestamp}] ✅ Avatar file parsed: ${filename} (${fileBuffer.length} bytes)`);

    // AWS S3 Configuration
    const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
    const awsBucket = process.env.AWS_S3_BUCKET_NAME || 'bw-car-culture-images';
    const awsRegion = process.env.AWS_S3_REGION || 'us-east-1';

    if (!awsAccessKey || !awsSecretKey) {
      console.log(`[${timestamp}] ❌ Missing AWS credentials`);
      return res.status(500).json({
        success: false,
        message: 'AWS credentials not configured',
        error: 'Configure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in environment variables'
      });
    }

    try {
      // Import AWS SDK
      const { S3Client, PutObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      
      // Create S3 client
      const s3Client = new S3Client({
        region: awsRegion,
        credentials: {
          accessKeyId: awsAccessKey,
          secretAccessKey: awsSecretKey,
        },
      });

      // Generate unique filename for avatar
      const timestamp_ms = Date.now();
      const randomString = Math.random().toString(36).substring(2, 8);
      const fileExtension = filename.split('.').pop() || 'jpg';
      const s3Key = `users/avatars/avatar-${userId}-${timestamp_ms}-${randomString}.${fileExtension}`;

      // Upload to S3
      const uploadParams = {
        Bucket: awsBucket,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: fileType,
        Metadata: {
          userId: userId,
          uploadType: 'avatar',
          originalFilename: filename
        }
      };

      console.log(`[${timestamp}] 📤 Uploading avatar to S3: ${s3Key}`);
      const uploadResult = await s3Client.send(new PutObjectCommand(uploadParams));
      
      const avatarUrl = `https://${awsBucket}.s3.${awsRegion}.amazonaws.com/${s3Key}`;
      console.log(`[${timestamp}] ✅ Avatar uploaded successfully: ${avatarUrl}`);

      // Get user's current data to delete old avatar
      const { ObjectId } = await import('mongodb');
      const usersCollection = db.collection('users');
      const currentUser = await usersCollection.findOne({
        _id: ObjectId.isValid(userId) ? new ObjectId(userId) : userId
      });

      // Delete old avatar if exists
      if (currentUser?.avatar?.key) {
        try {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: awsBucket,
            Key: currentUser.avatar.key
          }));
          console.log(`[${timestamp}] 🗑️ Deleted old avatar: ${currentUser.avatar.key}`);
        } catch (deleteError) {
          console.log(`[${timestamp}] ⚠️ Could not delete old avatar: ${deleteError.message}`);
        }
      }

      // Update user's avatar in database
      const updateResult = await usersCollection.updateOne(
        { _id: ObjectId.isValid(userId) ? new ObjectId(userId) : userId },
        {
          $set: {
            avatar: {
              url: avatarUrl,
              key: s3Key,
              size: fileBuffer.length,
              mimetype: fileType
            },
            updatedAt: new Date()
          }
        }
      );

      console.log(`[${timestamp}] 💾 Database update result: ${updateResult.modifiedCount} documents modified`);

      return res.status(200).json({
        success: true,
        message: 'Avatar uploaded successfully',
        data: {
          avatar: {
            url: avatarUrl,
            size: fileBuffer.length,
            mimetype: fileType
          }
        }
      });

    } catch (uploadError) {
      console.error(`[${timestamp}] ❌ S3 upload error:`, uploadError);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload avatar to S3',
        error: uploadError.message
      });
    }

  } catch (error) {
    console.error(`[${timestamp}] ❌ Avatar upload error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Avatar upload failed',
      error: error.message
    });
  }
}

// Delete Avatar Endpoint
if (path === '/api/user/profile/avatar' && req.method === 'DELETE') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → DELETE AVATAR`);
  
  try {
    // Verify user authentication
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const userId = authResult.user.id;
    const { ObjectId } = await import('mongodb');
    const usersCollection = db.collection('users');

    // Get user's current avatar
    const user = await usersCollection.findOne({
      _id: ObjectId.isValid(userId) ? new ObjectId(userId) : userId
    });

    if (!user?.avatar?.key) {
      return res.status(404).json({
        success: false,
        message: 'No avatar found to delete'
      });
    }

    // Delete from S3
    const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
    const awsBucket = process.env.AWS_S3_BUCKET_NAME || 'bw-car-culture-images';
    const awsRegion = process.env.AWS_S3_REGION || 'us-east-1';

    if (awsAccessKey && awsSecretKey) {
      try {
        const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
        const s3Client = new S3Client({
          region: awsRegion,
          credentials: {
            accessKeyId: awsAccessKey,
            secretAccessKey: awsSecretKey,
          },
        });

        await s3Client.send(new DeleteObjectCommand({
          Bucket: awsBucket,
          Key: user.avatar.key
        }));

        console.log(`[${timestamp}] Deleted avatar from S3: ${user.avatar.key}`);
      } catch (s3Error) {
        console.log(`[${timestamp}] Could not delete from S3: ${s3Error.message}`);
      }
    }

    // Remove from database
    await usersCollection.updateOne(
      { _id: ObjectId.isValid(userId) ? new ObjectId(userId) : userId },
      {
        $unset: { avatar: 1 },
        $set: { updatedAt: new Date() }
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Avatar deleted successfully'
    });

  } catch (error) {
    console.error(`[${timestamp}] Delete avatar error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete avatar',
      error: error.message
    });
  }
}

      // Add these endpoints to your api/index.js file
// Find the user profile endpoints section and add these:

// Upload Cover Picture Endpoint
if (path === '/user/profile/cover-picture' && req.method === 'POST') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → UPLOAD COVER PICTURE`);
  
  try {
    // Verify user authentication
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      console.log(`[${timestamp}] ❌ Authentication failed`);
      return res.status(401).json({
        success: false,
        message: 'Authentication required for cover picture upload'
      });
    }

    const userId = authResult.user.id;
    console.log(`[${timestamp}] Cover picture upload for user: ${userId}`);

    // Parse multipart form data
    const boundary = req.headers['content-type']?.split('boundary=')[1];
    if (!boundary) {
      console.log(`[${timestamp}] ❌ No boundary found in content-type`);
      return res.status(400).json({
        success: false,
        message: 'Invalid multipart form data - no boundary'
      });
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);
    const body = buffer.toString('binary');

    console.log(`[${timestamp}] Received data length: ${buffer.length}`);

    // Parse form data
    const parts = body.split('--' + boundary);
    let filename = null;
    let fileBuffer = null;
    let fileType = 'image/jpeg';

    for (const part of parts) {
      if (part.includes('Content-Disposition: form-data; name="coverPicture"')) {
        const filenameMatch = part.match(/filename="([^"]*)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }

        const contentTypeMatch = part.match(/Content-Type: ([^\r\n]*)/);
        if (contentTypeMatch) {
          fileType = contentTypeMatch[1].trim();
        }

        const dataStart = part.indexOf('\r\n\r\n');
        if (dataStart !== -1) {
          const fileData = part.substring(dataStart + 4);
          const cleanData = fileData.replace(/\r\n$/, '').replace(/\r\n--$/, '');
          fileBuffer = Buffer.from(cleanData, 'binary');
          break;
        }
      }
    }

    if (!fileBuffer || fileBuffer.length < 100) {
      console.log(`[${timestamp}] ❌ No valid file found. Buffer length: ${fileBuffer?.length || 0}`);
      return res.status(400).json({
        success: false,
        message: 'No valid cover picture file found in request'
      });
    }

    console.log(`[${timestamp}] ✅ Cover picture file parsed: ${filename} (${fileBuffer.length} bytes)`);

    // AWS S3 Configuration
    const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
    const awsBucket = process.env.AWS_S3_BUCKET_NAME || 'bw-car-culture-images';
    const awsRegion = process.env.AWS_S3_REGION || 'us-east-1';

    if (!awsAccessKey || !awsSecretKey) {
      console.log(`[${timestamp}] ❌ Missing AWS credentials`);
      return res.status(500).json({
        success: false,
        message: 'AWS credentials not configured'
      });
    }

    try {
      // Import AWS SDK
      const { S3Client, PutObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
      
      // Create S3 client
      const s3Client = new S3Client({
        region: awsRegion,
        credentials: {
          accessKeyId: awsAccessKey,
          secretAccessKey: awsSecretKey,
        },
      });

      // Generate unique filename for cover picture
      const timestamp_ms = Date.now();
      const randomString = Math.random().toString(36).substring(2, 8);
      const fileExtension = filename.split('.').pop() || 'jpg';
      const s3Key = `users/covers/cover-${userId}-${timestamp_ms}-${randomString}.${fileExtension}`;

      // Upload to S3
      const uploadParams = {
        Bucket: awsBucket,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: fileType,
        Metadata: {
          userId: userId,
          uploadType: 'coverPicture',
          originalFilename: filename
        }
      };

      console.log(`[${timestamp}] 📤 Uploading cover picture to S3: ${s3Key}`);
      const uploadResult = await s3Client.send(new PutObjectCommand(uploadParams));
      
      const coverPictureUrl = `https://${awsBucket}.s3.${awsRegion}.amazonaws.com/${s3Key}`;
      console.log(`[${timestamp}] ✅ Cover picture uploaded successfully: ${coverPictureUrl}`);

      // Get user's current data to delete old cover picture
      const { ObjectId } = await import('mongodb');
      const usersCollection = db.collection('users');
      const currentUser = await usersCollection.findOne({
        _id: ObjectId.isValid(userId) ? new ObjectId(userId) : userId
      });

      // Delete old cover picture if exists
      if (currentUser?.coverPicture?.key) {
        try {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: awsBucket,
            Key: currentUser.coverPicture.key
          }));
          console.log(`[${timestamp}] 🗑️ Deleted old cover picture: ${currentUser.coverPicture.key}`);
        } catch (deleteError) {
          console.log(`[${timestamp}] ⚠️ Could not delete old cover picture: ${deleteError.message}`);
        }
      }

      // Update user's cover picture in database
      const updateResult = await usersCollection.updateOne(
        { _id: ObjectId.isValid(userId) ? new ObjectId(userId) : userId },
        {
          $set: {
            coverPicture: {
              url: coverPictureUrl,
              key: s3Key,
              size: fileBuffer.length,
              mimetype: fileType
            },
            updatedAt: new Date()
          }
        }
      );

      console.log(`[${timestamp}] 💾 Database update result: ${updateResult.modifiedCount} documents modified`);

      return res.status(200).json({
        success: true,
        message: 'Cover picture uploaded successfully',
        data: {
          coverPicture: {
            url: coverPictureUrl,
            size: fileBuffer.length,
            mimetype: fileType
          }
        }
      });

    } catch (uploadError) {
      console.error(`[${timestamp}] ❌ S3 upload error:`, uploadError);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload cover picture to S3',
        error: uploadError.message
      });
    }

  } catch (error) {
    console.error(`[${timestamp}] ❌ Cover picture upload error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Cover picture upload failed',
      error: error.message
    });
  }
}

// Delete Cover Picture Endpoint - CORRECTED PATH
if (path === '/user/profile/cover-picture' && req.method === 'DELETE') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → DELETE COVER PICTURE`);
  
  try {
    // Verify user authentication
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const userId = authResult.user.id;
    const { ObjectId } = await import('mongodb');
    const usersCollection = db.collection('users');

    // Get user's current cover picture
    const user = await usersCollection.findOne({
      _id: ObjectId.isValid(userId) ? new ObjectId(userId) : userId
    });

    if (!user?.coverPicture?.key) {
      return res.status(404).json({
        success: false,
        message: 'No cover picture found to delete'
      });
    }

    // Delete from S3
    const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
    const awsBucket = process.env.AWS_S3_BUCKET_NAME || 'bw-car-culture-images';
    const awsRegion = process.env.AWS_S3_REGION || 'us-east-1';

    if (awsAccessKey && awsSecretKey) {
      try {
        const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
        const s3Client = new S3Client({
          region: awsRegion,
          credentials: {
            accessKeyId: awsAccessKey,
            secretAccessKey: awsSecretKey,
          },
        });

        await s3Client.send(new DeleteObjectCommand({
          Bucket: awsBucket,
          Key: user.coverPicture.key
        }));

        console.log(`[${timestamp}] 🗑️ Deleted cover picture from S3: ${user.coverPicture.key}`);
      } catch (s3Error) {
        console.log(`[${timestamp}] ⚠️ Could not delete from S3: ${s3Error.message}`);
      }
    }

    // Remove from database
    await usersCollection.updateOne(
      { _id: ObjectId.isValid(userId) ? new ObjectId(userId) : userId },
      {
        $unset: { coverPicture: 1 },
        $set: { updatedAt: new Date() }
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Cover picture deleted successfully'
    });

  } catch (error) {
    console.error(`[${timestamp}] ❌ Delete cover picture error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete cover picture',
      error: error.message
    });
  }
}

if (path === '/api/debug/upload-test' && req.method === 'POST') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → DEBUG: Upload Test Endpoint`);
  
  try {
    // Log request headers
    console.log(`[${timestamp}] Request Headers:`, req.headers);
    console.log(`[${timestamp}] Content-Type:`, req.headers['content-type']);
    console.log(`[${timestamp}] Authorization:`, req.headers.authorization ? 'Present' : 'Missing');
    
    // Test authentication
    const authResult = await verifyUserToken(req);
    console.log(`[${timestamp}] Auth Result:`, {
      success: authResult.success,
      userId: authResult.success ? authResult.user.id : null,
      error: authResult.error
    });
    
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication test failed',
        error: authResult.error
      });
    }

    // Test AWS credentials
    const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
    const awsBucket = process.env.AWS_S3_BUCKET_NAME || 'bw-car-culture-images';
    const awsRegion = process.env.AWS_S3_REGION || 'us-east-1';
    
    console.log(`[${timestamp}] AWS Config:`, {
      hasAccessKey: !!awsAccessKey,
      hasSecretKey: !!awsSecretKey,
      bucket: awsBucket,
      region: awsRegion,
      accessKeyLength: awsAccessKey ? awsAccessKey.length : 0,
      secretKeyLength: awsSecretKey ? awsSecretKey.length : 0
    });

    // Test database connection
    const { ObjectId } = await import('mongodb');
    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({
      _id: ObjectId.isValid(authResult.user.id) ? new ObjectId(authResult.user.id) : authResult.user.id
    });
    
    console.log(`[${timestamp}] Database Test:`, {
      userFound: !!user,
      userName: user?.name,
      hasAvatar: !!user?.avatar,
      hasCoverPicture: !!user?.coverPicture
    });

    // Test form data parsing
    const boundary = req.headers['content-type']?.split('boundary=')[1];
    console.log(`[${timestamp}] Form Data:`, {
      hasBoundary: !!boundary,
      boundary: boundary?.substring(0, 20) + '...'
    });

    if (boundary) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
      
      console.log(`[${timestamp}] Form Data Buffer:`, {
        length: buffer.length,
        preview: buffer.toString('binary').substring(0, 200)
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Debug test completed successfully',
      data: {
        auth: authResult.success,
        userId: authResult.user.id,
        userName: user?.name,
        aws: {
          hasCredentials: !!(awsAccessKey && awsSecretKey),
          bucket: awsBucket,
          region: awsRegion
        },
        database: {
          userFound: !!user,
          hasAvatar: !!user?.avatar,
          hasCoverPicture: !!user?.coverPicture
        },
        timestamp: timestamp
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] ❌ Debug test error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Debug test failed',
      error: error.message,
      stack: error.stack
    });
  }
}

// Test endpoint to check if endpoints are reachable
if (path === '/api/debug/endpoints' && req.method === 'GET') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → DEBUG: Endpoints Test`);
  
  return res.status(200).json({
    success: true,
    message: 'Debug endpoints are working',
    availableEndpoints: [
      'GET /api/debug/endpoints',
      'POST /api/debug/upload-test',
      'POST /api/user/profile/avatar',
      'POST /api/user/profile/cover-picture',
      'DELETE /api/user/profile/cover-picture'
    ],
    timestamp: timestamp
  });
}


      // Get user's favorites
      if (path === '/user/profile/favorites' && req.method === 'GET') {
        try {
          const authResult = await verifyUserToken(req);
          if (!authResult.success) return;

          const usersCollection = db.collection('users');
          const listingsCollection = db.collection('listings');
          
          const user = await usersCollection.findOne({ 
            _id: new ObjectId(authResult.userId) 
          });

          const favoriteIds = user?.favorites || [];
          const favorites = [];

          if (favoriteIds.length > 0) {
            const listings = await listingsCollection.find({
              _id: { $in: favoriteIds.map(id => new ObjectId(id)) }
            }).toArray();

            favorites.push(...listings);
          }

          return res.status(200).json({
            success: true,
            count: favorites.length,
            data: favorites
          });

        } catch (error) {
          console.error(`[${timestamp}] Get favorites error:`, error);
          return res.status(500).json({
            success: false,
            message: 'Failed to load favorites'
          });
        }
      }

      // Update user activity and points
      if (path === '/user/profile/activity' && req.method === 'POST') {
        try {
           const authResult = await verifyUserToken(req);
          if (!authResult.success) return;

          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = Buffer.concat(chunks).toString();
          const { action, points, metadata } = JSON.parse(body);

          const usersCollection = db.collection('users');
          const updateQuery = {
            $set: { 'activity.lastActiveAt': new Date() }
          };

          // Add points if provided
          if (points && points > 0) {
            updateQuery.$inc = { 'activity.points': points };
          }

          // Track specific actions
          if (action === 'login') {
            updateQuery.$inc = { 
              ...updateQuery.$inc,
              'activity.loginCount': 1 
            };
          }

          await usersCollection.updateOne(
            { _id: new ObjectId(authResult.userId) },
            updateQuery
          );

          // Get updated user data
          const user = await usersCollection.findOne({ 
            _id: new ObjectId(authResult.userId) 
          });

          return res.status(200).json({
            success: true,
            data: {
              points: user?.activity?.points || 0,
              achievements: user?.activity?.achievements || [],
              profileCompleteness: user?.activity?.profileCompleteness || 0
            }
          });

        } catch (error) {
          console.error(`[${timestamp}] Update activity error:`, error);
          return res.status(500).json({
            success: false,
            message: 'Failed to update activity'
          });
        }
      }
    }


// Fix /user/vehicles endpoint:
if (path === '/user/vehicles' && req.method === 'GET') {
  try {
    const authResult = await verifyUserToken(req);  // ✅ Changed
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const { ObjectId } = await import('mongodb');
    const vehiclesCollection = db.collection('vehicles');
    const vehicles = await vehiclesCollection.find({ 
      ownerId: new ObjectId(authResult.user.id),
      isDeleted: { $ne: true }
    }).sort({ createdAt: -1 }).toArray();

    console.log(`[${timestamp}] ✅ Found ${vehicles.length} user vehicles`);

    return res.status(200).json({
      success: true,
      count: vehicles.length,
      data: vehicles || [],
      message: 'User vehicles loaded'
    });
  } catch (error) {
    console.error('Error getting user vehicles:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get vehicles',
      error: error.message
    });
  }
}



// ========================================
// PRODUCTION USER SUBMIT LISTING ENDPOINT
// ========================================
if (path === '/api/user/submit-listing' && req.method === 'POST') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → USER SUBMIT LISTING (PRODUCTION)`);
  
  try {
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Parse request body
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

    // Basic validation
    const validationErrors = [];
    
    if (!listingData.title || listingData.title.length < 10) {
      validationErrors.push('Title must be at least 10 characters');
    }
    
    if (!listingData.specifications?.make) {
      validationErrors.push('Vehicle make is required');
    }
    
    if (!listingData.specifications?.model) {
      validationErrors.push('Vehicle model is required');
    }
    
    if (!listingData.pricing?.price || listingData.pricing.price <= 0) {
      validationErrors.push('Valid price is required');
    }
    
    if (!listingData.contact?.sellerName) {
      validationErrors.push('Seller name is required');
    }
    
    if (!listingData.contact?.phone) {
      validationErrors.push('Phone number is required');
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Save to MongoDB
    try {
      const { ObjectId } = await import('mongodb');
      const db = await connectDB();
      const userSubmissionsCollection = db.collection('usersubmissions');
      const usersCollection = db.collection('users');

      // Get user info
      const user = await usersCollection.findOne({
        _id: new ObjectId(authResult.user.id)
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Create submission record
      const submission = {
        _id: new ObjectId(),
        userId: new ObjectId(authResult.user.id),
        userName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        userEmail: user.email,
        listingData: {
          ...listingData,
          contact: {
            ...listingData.contact,
            email: user.email // Ensure contact email matches user
          }
        },
        status: 'pending_review',
        submittedAt: new Date(),
        adminReview: null,
        listingId: null,
        priority: 'normal',
        estimatedReviewTime: '24-48 hours',
        source: 'user_form_production'
      };

      const result = await userSubmissionsCollection.insertOne(submission);

      console.log(`[${timestamp}] ✅ User listing submitted to database: ${submission.listingData.title} by ${submission.userName}`);

      return res.status(201).json({
        success: true,
        message: 'Listing submitted for admin review successfully',
        data: {
          submissionId: result.insertedId,
          status: 'pending_review',
          estimatedReviewTime: '24-48 hours',
          title: submission.listingData.title,
          submittedAt: submission.submittedAt,
          imageCount: submission.listingData.images?.length || 0
        }
      });

    } catch (dbError) {
      console.error(`[${timestamp}] Database error:`, dbError);
      return res.status(500).json({
        success: false,
        message: 'Failed to save listing to database',
        error: dbError.message
      });
    }

  } catch (error) {
    console.error(`[${timestamp}] Submit listing error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit listing for review',
      error: error.message
    });
  }
}

// User Image Upload Endpoint - Add this to api/index.js
// User Image Upload Endpoint - COMPLETE VERSION
// User Image Upload Endpoint - FIXED VERSION (Manual Parsing)
if (path === '/user/upload-images' && req.method === 'POST') {
  console.log(`[${timestamp}] → USER IMAGE UPLOAD`);
  
  try {
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    console.log(`🖼️ USER UPLOAD: Authenticated user ${authResult.userId || authResult.user?.id}`);

    // Manual multipart parsing (same as working endpoints)
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);
    
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    
    if (!boundaryMatch) {
      return res.status(400).json({
        success: false,
        message: 'Invalid multipart request - no boundary found'
      });
    }
    
    const boundary = boundaryMatch[1];
    const bodyString = rawBody.toString('binary');
    const parts = bodyString.split(`--${boundary}`);
    
    const files = [];
    
    // Parse each part (same logic as working endpoints)
    for (const part of parts) {
      if (part.includes('Content-Disposition: form-data') && part.includes('filename=')) {
        const filenameMatch = part.match(/filename="([^"]+)"/);
        if (!filenameMatch || !filenameMatch[1] || filenameMatch[1] === '""') continue;
        
        const filename = filenameMatch[1];
        
        let fileType = 'image/jpeg';
        const contentTypeMatch = part.match(/Content-Type: ([^\r\n]+)/);
        if (contentTypeMatch) {
          fileType = contentTypeMatch[1].trim();
        }
        
        const dataStart = part.indexOf('\r\n\r\n');
        if (dataStart !== -1) {
          const fileData = part.substring(dataStart + 4);
          const cleanData = fileData.replace(/\r\n$/, '');
          const fileBuffer = Buffer.from(cleanData, 'binary');
          
          if (fileBuffer.length > 100) {
            files.push({
              originalFilename: filename,
              buffer: fileBuffer,
              size: fileBuffer.length,
              mimetype: fileType
            });
          }
        }
      }
    }

    if (files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid images found'
      });
    }

    console.log(`🖼️ USER UPLOAD: Processing ${files.length} files`);

    // Create mock results (same format as working endpoints)
    const mockResults = files.map((file, index) => {
      const timestamp_ms = Date.now();
      const userId = authResult.userId || authResult.user?.id || 'user';
      const safeName = file.originalFilename.replace(/[^a-zA-Z0-9.-]/g, '_');
      
      return {
        url: `https://mock-s3.example.com/user-listings/${userId}-${timestamp_ms}-${index}-${safeName}`,
        key: `user-listings/${userId}-${timestamp_ms}-${index}-${safeName}`,
        thumbnail: `https://mock-s3.example.com/user-listings/${userId}-${timestamp_ms}-${index}-${safeName}`,
        size: file.size,
        mimetype: file.mimetype,
        isPrimary: index === 0,
        mock: true
      };
    });

    console.log(`🖼️ USER UPLOAD: ✅ Returning ${mockResults.length} mock results`);

    return res.status(200).json({
      success: true,
      message: `Successfully uploaded ${mockResults.length} images`,
      images: mockResults,
      count: mockResults.length
    });

  } catch (error) {
    console.error(`🖼️ USER UPLOAD: ❌ Upload failed:`, error);
    return res.status(500).json({
      success: false,
      message: 'Image upload failed',
      error: error.message
    });
  }
}

// === TEST USER UPLOAD ENDPOINT ===
if (path === '/api/user/test-upload' && req.method === 'GET') {
  console.log(`[${timestamp}] → TEST USER UPLOAD ENDPOINT`);
  
  return res.status(200).json({
    success: true,
    message: 'User upload endpoint test successful',
    timestamp: new Date().toISOString(),
    source: 'api/index.js - MAIN API',
    endpoints: {
      'GET /api/user/test-upload': 'This test endpoint',
      'POST /api/user/upload-images': 'Image upload endpoint (should exist)',
      'POST /api/user/submit-listing': 'Listing submission endpoint'
    },
    note: 'This confirms /api/user/* requests go to api/index.js'
  });
}

// ========================================
// PRODUCTION USER IMAGE UPLOAD ENDPOINT
// ========================================
if (path === '/api/user/upload-images' && req.method === 'POST') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → USER IMAGE UPLOAD (PRODUCTION S3)`);
  
  try {
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const userId = authResult.user.id;
    console.log(`[${timestamp}] 🖼️ User listing image upload for user: ${userId}`);

    // Parse multipart form data (same pattern as avatar/cover picture)
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

    console.log(`[${timestamp}] Received data length: ${buffer.length}`);

    // Parse multiple files from form data
    const parts = body.split('--' + boundary);
    const files = [];

    for (const part of parts) {
      if (part.includes('Content-Disposition: form-data') && part.includes('filename=')) {
        const filenameMatch = part.match(/filename="([^"]*)"/);
        if (!filenameMatch || !filenameMatch[1] || filenameMatch[1] === '""') continue;
        
        const filename = filenameMatch[1];
        let fileType = 'image/jpeg';
        
        const contentTypeMatch = part.match(/Content-Type: ([^\r\n]*)/);
        if (contentTypeMatch) {
          fileType = contentTypeMatch[1].trim();
        }

        const dataStart = part.indexOf('\r\n\r\n');
        if (dataStart !== -1) {
          const fileData = part.substring(dataStart + 4);
          const cleanData = fileData.replace(/\r\n$/, '').replace(/\r\n--$/, '');
          const fileBuffer = Buffer.from(cleanData, 'binary');
          
          if (fileBuffer.length > 100) { // Skip tiny files
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

    console.log(`[${timestamp}] 📸 Found ${files.length} image files to upload`);

    // AWS S3 Configuration (same as avatar/cover picture)
    const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
    const awsBucket = process.env.AWS_S3_BUCKET_NAME || 'bw-car-culture-images';
    const awsRegion = process.env.AWS_S3_REGION || 'us-east-1';

    if (!awsAccessKey || !awsSecretKey) {
      console.log(`[${timestamp}] ❌ Missing AWS credentials`);
      return res.status(500).json({
        success: false,
        message: 'AWS credentials not configured',
        error: 'Configure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in environment variables'
      });
    }

    try {
      // Import AWS SDK (same as avatar/cover picture)
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      
      // Create S3 client
      const s3Client = new S3Client({
        region: awsRegion,
        credentials: {
          accessKeyId: awsAccessKey,
          secretAccessKey: awsSecretKey,
        },
      });

      const uploadResults = [];

      // Upload each file to S3
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        try {
          // Generate unique filename (same pattern as avatar/cover picture)
          const timestamp_ms = Date.now();
          const randomString = Math.random().toString(36).substring(2, 8);
          const fileExtension = file.filename.split('.').pop() || 'jpg';
          const s3Key = `user-listings/${userId}/listing-${timestamp_ms}-${randomString}-${i}.${fileExtension}`;

          // Upload to S3 (same pattern as avatar/cover picture)
          const uploadParams = {
            Bucket: awsBucket,
            Key: s3Key,
            Body: file.buffer,
            ContentType: file.mimetype,
            Metadata: {
              userId: userId,
              uploadType: 'user-listing',
              originalFilename: file.filename,
              imageIndex: i.toString()
            }
          };

          console.log(`[${timestamp}] 📤 Uploading image ${i + 1}/${files.length} to S3: ${s3Key}`);
          await s3Client.send(new PutObjectCommand(uploadParams));
          
          // Generate public URL (same format as avatar/cover picture)
          const imageUrl = `https://${awsBucket}.s3.${awsRegion}.amazonaws.com/${s3Key}`;
          console.log(`[${timestamp}] ✅ Image ${i + 1} uploaded successfully: ${imageUrl}`);

          uploadResults.push({
            url: imageUrl,
            key: s3Key,
            thumbnail: imageUrl, // For now, same as main image
            size: file.size,
            mimetype: file.mimetype,
            isPrimary: i === 0,
            originalFilename: file.filename
          });

        } catch (fileError) {
          console.error(`[${timestamp}] ❌ Failed to upload file ${i + 1}:`, fileError);
          // Continue with other files
        }
      }

      if (uploadResults.length === 0) {
        throw new Error('All file uploads failed');
      }

      console.log(`[${timestamp}] 🎉 Successfully uploaded ${uploadResults.length}/${files.length} images to S3`);

      return res.status(200).json({
        success: true,
        message: `Successfully uploaded ${uploadResults.length} images`,
        images: uploadResults,
        count: uploadResults.length,
        production: true,
        storage: 'AWS S3'
      });

    } catch (s3Error) {
      console.error(`[${timestamp}] ❌ S3 upload error:`, s3Error);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload images to S3',
        error: s3Error.message
      });
    }

  } catch (error) {
    console.error(`[${timestamp}] ❌ User image upload error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Image upload failed',
      error: error.message
    });
  }
}



// 2. Add/Update the user submissions retrieval endpoint:

if (path === '/api/user/my-submissions' && req.method === 'GET') {
  console.log(`[${timestamp}] → GET USER SUBMISSIONS`);
  
  try {
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const { ObjectId } = await import('mongodb');
    const userSubmissionsCollection = db.collection('usersubmissions');

    // Get user's submissions with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const submissions = await userSubmissionsCollection
      .find({ userId: new ObjectId(authResult.user.id) })
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const total = await userSubmissionsCollection.countDocuments({ 
      userId: new ObjectId(authResult.user.id) 
    });

    console.log(`[${timestamp}] ✅ Found ${submissions.length} submissions for user ${authResult.user.id}`);

    return res.status(200).json({
      success: true,
      data: submissions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] Get user submissions error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch your submissions',
      error: error.message
    });
  }
}

// === USER'S GARAGE LISTINGS API ENDPOINT ===
// === USER'S GARAGE LISTINGS API ENDPOINT ===
// === USER'S GARAGE LISTINGS API ENDPOINT ===
// === USER'S GARAGE LISTINGS API ENDPOINT ===
// === USER'S GARAGE LISTINGS API ENDPOINT ===
// === USER'S GARAGE LISTINGS API ENDPOINT ===
// Add this to your existing API endpoints
if (path === '/api/user/my-garage' && req.method === 'GET') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → GET USER'S GARAGE LISTINGS (from usersubmissions)`);
  
  try {
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const { ObjectId } = await import('mongodb');
    const userSubmissionsCollection = db.collection('usersubmissions');
    const userId = authResult.user.id;

    console.log(`[${timestamp}] Fetching garage listings for user: ${userId}`);

    // CORRECTED: Query usersubmissions for approved/live listings
    const query = {
      userId: new ObjectId(userId),
      // Only show approved listings and listings that have gone live
      status: { 
        $in: ['approved', 'listing_created', 'active'] 
      }
    };

    // Get listings with pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [submissions, total] = await Promise.all([
      userSubmissionsCollection.find(query)
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      userSubmissionsCollection.countDocuments(query)
    ]);

    console.log(`[${timestamp}] Found ${submissions.length} garage listings for user`);

    // Transform submissions to look like garage listings
    const garageListings = submissions.map(submission => ({
      _id: submission._id,
      title: submission.listingData?.title || 'Untitled Listing',
      price: submission.listingData?.pricing?.basePrice || 0,
      currency: submission.listingData?.pricing?.currency || 'BWP',
      images: submission.listingData?.images || [],
      specifications: submission.listingData?.specifications || {},
      status: submission.status === 'listing_created' ? 'active' : submission.status,
      submittedAt: submission.submittedAt,
      approvedAt: submission.adminReview?.reviewedAt || null,
      featured: submission.listingData?.featured || false,
      // Include original submission data
      originalSubmission: submission,
      // Analytics from the listing data if available
      analytics: {
        views: submission.listingData?.analytics?.views || 0,
        inquiries: submission.listingData?.analytics?.inquiries || 0,
        saves: submission.listingData?.analytics?.saves || 0
      }
    }));

    // Calculate garage statistics
    const allUserSubmissions = await userSubmissionsCollection.find({
      userId: new ObjectId(userId),
      status: { $in: ['approved', 'listing_created', 'active', 'inactive', 'paused', 'sold'] }
    }).toArray();

    const garageStats = {
      total: allUserSubmissions.length,
      active: allUserSubmissions.filter(s => 
        ['listing_created', 'active', 'approved'].includes(s.status)
      ).length,
      inactive: allUserSubmissions.filter(s => s.status === 'inactive').length,
      paused: allUserSubmissions.filter(s => s.status === 'paused').length,
      sold: allUserSubmissions.filter(s => s.status === 'sold').length,
      featured: allUserSubmissions.filter(s => 
        s.listingData?.featured === true
      ).length
    };

    // Calculate analytics totals
    const garageAnalytics = allUserSubmissions.reduce((acc, submission) => {
      const analytics = submission.listingData?.analytics || {};
      return {
        totalViews: acc.totalViews + (analytics.views || 0),
        totalInquiries: acc.totalInquiries + (analytics.inquiries || 0),
        totalSaves: acc.totalSaves + (analytics.saves || 0)
      };
    }, { totalViews: 0, totalInquiries: 0, totalSaves: 0 });

    console.log(`[${timestamp}] ✅ Garage data compiled:`, {
      listingsCount: garageListings.length,
      stats: garageStats,
      analytics: garageAnalytics
    });

    return res.status(200).json({
      success: true,
      data: garageListings,
      stats: garageStats,
      analytics: garageAnalytics,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] Get user garage listings error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch your garage listings',
      error: error.message
    });
  }
}

// === UPDATE LISTING STATUS ENDPOINT ===
if (path.match(/^\/api\/user\/my-garage\/[a-fA-F0-9]{24}\/status$/) && req.method === 'PUT') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → UPDATE GARAGE LISTING STATUS (usersubmissions)`);
  
  try {
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const submissionId = path.split('/')[4]; // Extract submission ID from path
    const { ObjectId } = await import('mongodb');
    const userSubmissionsCollection = db.collection('usersubmissions');
    const userId = authResult.user.id;

    // Parse request body
    let body = {};
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString());
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body'
      });
    }

    const { status } = body;
    const validStatuses = ['active', 'inactive', 'paused', 'sold'];
    
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    // Update the submission status
    const result = await userSubmissionsCollection.updateOne(
      {
        _id: new ObjectId(submissionId),
        userId: new ObjectId(userId)
      },
      {
        $set: {
          status: status,
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found or you do not have permission to update it'
      });
    }

    console.log(`[${timestamp}] ✅ Updated submission ${submissionId} status to ${status}`);

    return res.status(200).json({
      success: true,
      message: `Listing status updated to ${status}`,
      data: {
        submissionId,
        status,
        updatedAt: new Date()
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] Update submission status error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update listing status',
      error: error.message
    });
  }
}

// === DELETE LISTING ENDPOINT ===
if (path.match(/^\/api\/user\/my-garage\/[a-fA-F0-9]{24}$/) && req.method === 'DELETE') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → DELETE GARAGE LISTING (usersubmissions)`);
  
  try {
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const submissionId = path.split('/')[4]; // Extract submission ID from path
    const { ObjectId } = await import('mongodb');
    const userSubmissionsCollection = db.collection('usersubmissions');
    const userId = authResult.user.id;

    console.log(`[${timestamp}] Attempting to delete submission ${submissionId} for user ${userId}`);

    // Soft delete - update status to 'deleted'
    const result = await userSubmissionsCollection.updateOne(
      {
        _id: new ObjectId(submissionId),
        userId: new ObjectId(userId)
      },
      {
        $set: {
          status: 'deleted',
          deletedAt: new Date(),
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found or you do not have permission to delete it'
      });
    }

    console.log(`[${timestamp}] ✅ Submission ${submissionId} marked as deleted`);

    return res.status(200).json({
      success: true,
      message: 'Listing deleted successfully',
      data: {
        submissionId,
        deletedAt: new Date()
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] Delete submission error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete listing',
      error: error.message
    });
  }
}

// === GET SINGLE SUBMISSION FOR EDITING ===
if (path.match(/^\/api\/user\/submissions\/[a-fA-F0-9]{24}\/edit$/) && req.method === 'GET') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → GET SUBMISSION FOR EDITING`);
  
  try {
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const submissionId = path.split('/')[4]; // Extract submission ID
    const { ObjectId } = await import('mongodb');
    const userSubmissionsCollection = db.collection('usersubmissions');
    const userId = authResult.user.id;

    // Find the submission
    const submission = await userSubmissionsCollection.findOne({
      _id: new ObjectId(submissionId),
      userId: new ObjectId(userId)
    });

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    // Check if submission can be edited
    const editableStatuses = ['pending_review', 'rejected', 'approved'];
    if (!editableStatuses.includes(submission.status)) {
      return res.status(400).json({
        success: false,
        message: 'This submission cannot be edited in its current status',
        currentStatus: submission.status
      });
    }

    console.log(`[${timestamp}] ✅ Submission found for editing: ${submission.listingData?.title}`);

    return res.status(200).json({
      success: true,
      data: submission,
      canEdit: true,
      editType: submission.status === 'listing_created' ? 'requires_review' : 'direct_edit'
    });

  } catch (error) {
    console.error(`[${timestamp}] Get submission for editing error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch submission for editing',
      error: error.message
    });
  }
}

// === UPDATE SUBMISSION ===
if (path.match(/^\/api\/user\/submissions\/[a-fA-F0-9]{24}$/) && req.method === 'PUT') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → UPDATE USER SUBMISSION`);
  
  try {
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const submissionId = path.split('/')[4]; // Extract submission ID
    
    // Parse request body
    let body = {};
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString());
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body'
      });
    }

    const { listingData, editNote } = body;

    if (!listingData) {
      return res.status(400).json({
        success: false,
        message: 'Listing data is required'
      });
    }

    const { ObjectId } = await import('mongodb');
    const userSubmissionsCollection = db.collection('usersubmissions');
    const userId = authResult.user.id;

    // Find the existing submission
    const existingSubmission = await userSubmissionsCollection.findOne({
      _id: new ObjectId(submissionId),
      userId: new ObjectId(userId)
    });

    if (!existingSubmission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    // Check if submission can be edited
    const editableStatuses = ['pending_review', 'rejected', 'approved'];
    if (!editableStatuses.includes(existingSubmission.status)) {
      return res.status(400).json({
        success: false,
        message: 'This submission cannot be edited in its current status',
        currentStatus: existingSubmission.status
      });
    }

    // Determine new status after edit
    let newStatus = existingSubmission.status;
    let requiresReview = false;

    if (existingSubmission.status === 'listing_created') {
      // If it was live, editing requires new review
      newStatus = 'pending_review';
      requiresReview = true;
    } else if (existingSubmission.status === 'approved') {
      // If it was approved but not live, editing requires new review
      newStatus = 'pending_review';
      requiresReview = true;
    } else if (existingSubmission.status === 'rejected') {
      // If it was rejected, editing puts it back for review
      newStatus = 'pending_review';
      requiresReview = true;
    }
    // If pending_review, keep it as pending_review

    // Prepare update data
    const updateData = {
      listingData: {
        ...listingData,
        contact: {
          ...listingData.contact,
          email: authResult.user.email // Ensure contact email matches user email
        }
      },
      updatedAt: new Date(),
      status: newStatus
    };

    // Add edit history
    if (!existingSubmission.editHistory) {
      updateData.editHistory = [];
    } else {
      updateData.editHistory = [...existingSubmission.editHistory];
    }

    updateData.editHistory.push({
      editedAt: new Date(),
      previousStatus: existingSubmission.status,
      newStatus: newStatus,
      editNote: editNote || 'Submission updated',
      requiresReview
    });

    // If it requires review, reset admin review
    if (requiresReview) {
      updateData.adminReview = null;
    }

    // Update the submission
    const result = await userSubmissionsCollection.updateOne(
      { _id: new ObjectId(submissionId) },
      { $set: updateData }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({
        success: false,
        message: 'Failed to update submission'
      });
    }

    console.log(`[${timestamp}] ✅ Submission updated: ${listingData.title}`);

    return res.status(200).json({
      success: true,
      message: requiresReview 
        ? 'Submission updated and sent for review' 
        : 'Submission updated successfully',
      data: {
        submissionId,
        status: newStatus,
        requiresReview,
        updatedAt: new Date()
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] Update submission error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update submission',
      error: error.message
    });
  }
}


// === CLONE SUBMISSION (Create new submission based on existing one) ===
if (path.match(/^\/api\/user\/submissions\/[a-fA-F0-9]{24}\/clone$/) && req.method === 'POST') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → CLONE SUBMISSION`);
  
  try {
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const sourceSubmissionId = path.split('/')[4]; // Extract submission ID
    const { ObjectId } = await import('mongodb');
    const userSubmissionsCollection = db.collection('usersubmissions');
    const usersCollection = db.collection('users');
    const userId = authResult.user.id;

    // Find the source submission
    const sourceSubmission = await userSubmissionsCollection.findOne({
      _id: new ObjectId(sourceSubmissionId),
      userId: new ObjectId(userId)
    });

    if (!sourceSubmission) {
      return res.status(404).json({
        success: false,
        message: 'Source submission not found'
      });
    }

    // Get user info
    const user = await usersCollection.findOne({
      _id: new ObjectId(userId)
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Create new submission based on the source
    const newSubmission = {
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      userName: user.name,
      userEmail: user.email,
      listingData: {
        ...sourceSubmission.listingData,
        title: `${sourceSubmission.listingData.title} (Copy)`,
        contact: {
          ...sourceSubmission.listingData.contact,
          email: user.email // Ensure contact email matches user email
        }
      },
      status: 'pending_review',
      submittedAt: new Date(),
      adminReview: null,
      listingId: null,
      clonedFrom: sourceSubmissionId,
      clonedAt: new Date()
    };

    const result = await userSubmissionsCollection.insertOne(newSubmission);

    console.log(`[${timestamp}] ✅ Submission cloned: ${newSubmission.listingData.title}`);

    return res.status(201).json({
      success: true,
      message: 'Submission cloned successfully',
      data: {
        submissionId: result.insertedId,
        title: newSubmission.listingData.title,
        status: 'pending_review',
        clonedFrom: sourceSubmissionId
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] Clone submission error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to clone submission',
      error: error.message
    });
  }
}

// === GARAGE STATISTICS ENDPOINT ===
if (path === '/api/user/my-garage/stats' && req.method === 'GET') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → GET USER GARAGE STATISTICS`);
  
  try {
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const { ObjectId } = await import('mongodb');
    const listingsCollection = db.collection('listings');
    const userId = authResult.user.id;

    // Base query for user's listings
    const baseQuery = {
      $or: [
        { 'dealer.user': userId },
        { 'dealer.user': new ObjectId(userId) },
        { createdBy: userId },
        { createdBy: new ObjectId(userId) }
      ],
      status: { $ne: 'deleted' }
    };

    // Get comprehensive statistics
    const [
      totalListings,
      activeListings,
      inactiveListings,
      soldListings,
      pausedListings,
      featuredListings,
      analyticsData
    ] = await Promise.all([
      listingsCollection.countDocuments(baseQuery),
      listingsCollection.countDocuments({ ...baseQuery, status: 'active' }),
      listingsCollection.countDocuments({ ...baseQuery, status: 'inactive' }),
      listingsCollection.countDocuments({ ...baseQuery, status: 'sold' }),
      listingsCollection.countDocuments({ ...baseQuery, status: 'paused' }),
      listingsCollection.countDocuments({ ...baseQuery, featured: true }),
      listingsCollection.aggregate([
        { $match: baseQuery },
        {
          $group: {
            _id: null,
            totalViews: { $sum: '$views' },
            totalInquiries: { $sum: '$inquiries' },
            totalSaves: { $sum: '$saves' },
            averagePrice: { $avg: '$price' },
            totalValue: { $sum: '$price' }
          }
        }
      ]).toArray()
    ]);

    const analytics = analyticsData[0] || {
      totalViews: 0,
      totalInquiries: 0,
      totalSaves: 0,
      averagePrice: 0,
      totalValue: 0
    };

    const stats = {
      listings: {
        total: totalListings,
        active: activeListings,
        inactive: inactiveListings,
        sold: soldListings,
        paused: pausedListings,
        featured: featuredListings
      },
      performance: {
        totalViews: analytics.totalViews || 0,
        totalInquiries: analytics.totalInquiries || 0,
        totalSaves: analytics.totalSaves || 0,
        averageViewsPerListing: totalListings > 0 ? Math.round((analytics.totalViews || 0) / totalListings) : 0,
        inquiryRate: analytics.totalViews > 0 ? ((analytics.totalInquiries || 0) / analytics.totalViews * 100).toFixed(1) : '0.0'
      },
      financial: {
        totalValue: analytics.totalValue || 0,
        averagePrice: Math.round(analytics.averagePrice || 0),
        currency: 'BWP'
      }
    };

    console.log(`[${timestamp}] ✅ Generated garage statistics for user ${userId}`);

    return res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error(`[${timestamp}] Garage statistics error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch garage statistics',
      error: error.message
    });
  }
}

if (path === '/api/test/user-submission' && req.method === 'GET') {
  console.log(`[${timestamp}] → TEST USER SUBMISSION SYSTEM`);
  
  try {
    const { ObjectId } = await import('mongodb');
    
    // Test database connections
    const userSubmissionsCollection = db.collection('usersubmissions');
    const usersCollection = db.collection('users');
    
    const submissionsCount = await userSubmissionsCollection.countDocuments();
    const usersCount = await usersCollection.countDocuments();
    
    return res.status(200).json({
      success: true,
      message: 'User submission system test successful',
      data: {
        submissionsCount,
        usersCount,
        dbConnected: !!db,
        timestamp: new Date().toISOString(),
        endpoints: [
          'POST /api/user/submit-listing',
          'GET /api/user/my-submissions', 
          'GET /api/user/profile'
        ]
      }
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Test failed:`, error);
    return res.status(500).json({
      success: false,
      message: 'User submission system test failed',
      error: error.message
    });
  }
}

// @desc    Get user submission status with real-time updates
// @route   GET /api/user/submission-status/:submissionId
// @access  Private
if (path.match(/^\/api\/user\/submission-status\/[a-fA-F0-9]{24}$/) && req.method === 'GET') {
  const submissionId = path.split('/').pop();
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → GET USER SUBMISSION STATUS: ${submissionId}`);
  
  try {
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const { ObjectId } = await import('mongodb');
    const userSubmissionsCollection = db.collection('usersubmissions');
    const paymentsCollection = db.collection('payments');
    const listingsCollection = db.collection('listings');

    // Get submission with full details
    const submission = await userSubmissionsCollection.findOne({
      _id: new ObjectId(submissionId),
      userId: new ObjectId(authResult.user.id) // Ensure user can only see their own submissions
    });

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    // Get related payment info
    const payment = await paymentsCollection.findOne({
      $or: [
        { _id: new ObjectId(submissionId) },
        { listing: submission.listingData?._id },
        { user: new ObjectId(authResult.user.id), listing: new ObjectId(submission.listingData?._id) }
      ]
    });

    // Get listing status
    const listing = await listingsCollection.findOne({
      _id: submission.listingData?._id
    });

    // ENHANCED: Calculate current status based on all available data
    let currentStatus = 'submitted';
    let statusMessage = 'Submission received';
    let progress = 25;
    let nextStep = 'Admin Review';
    let canEdit = false;
    let isLive = false;
    let paymentRequired = false;
    let paymentCompleted = false;

    // Determine actual status based on submission, payment, and listing data
    if (submission.status === 'rejected') {
      currentStatus = 'rejected';
      statusMessage = 'Submission rejected';
      progress = 0;
      nextStep = 'Please review and resubmit';
      canEdit = true;
    } else if (submission.status === 'approved' && submission.adminReview?.subscriptionTier === 'free') {
      currentStatus = 'approved_free';
      statusMessage = 'Approved - Free listing is live';
      progress = 100;
      nextStep = 'Complete';
      isLive = true;
    } else if (submission.status === 'approved' && submission.adminReview?.subscriptionTier !== 'free') {
      if (payment?.status === 'completed' || submission.status === 'approved_paid_active') {
        currentStatus = 'live';
        statusMessage = 'Payment approved - Listing is live';
        progress = 100;
        nextStep = 'Complete';
        isLive = true;
        paymentCompleted = true;
      } else if (payment?.status === 'proof_submitted' || submission.paymentProof?.submitted) {
        currentStatus = 'payment_review';
        statusMessage = 'Payment proof under review';
        progress = 75;
        nextStep = 'Admin payment verification';
        paymentRequired = true;
      } else {
        currentStatus = 'payment_required';
        statusMessage = 'Approved - Payment required';
        progress = 50;
        nextStep = 'Submit payment proof';
        paymentRequired = true;
      }
    } else if (submission.status === 'pending_review') {
      currentStatus = 'under_review';
      statusMessage = 'Under admin review';
      progress = 25;
      nextStep = 'Admin review in progress';
    }

    // Calculate pricing details
    const baseTierPricing = {
      basic: { name: 'Basic Plan', price: 50 },
      standard: { name: 'Standard Plan', price: 100 },
      premium: { name: 'Premium Plan', price: 200 }
    };

    const addonPricing = {
      featured: { name: 'Featured Listing', price: 200 },
      photography: { name: 'Professional Photography', price: 150 },
      review: { name: 'Professional Review', price: 100 },
      video: { name: 'Video Showcase', price: 300 }
    };

    let totalAmount = 0;
    let appliedAddons = [];
    const tierDetails = baseTierPricing[submission.adminReview?.subscriptionTier] || baseTierPricing.basic;

    if (submission.adminReview?.subscriptionTier !== 'free') {
      totalAmount = tierDetails.price;

      if (submission.selectedAddons && Array.isArray(submission.selectedAddons)) {
        for (const addonKey of submission.selectedAddons) {
          if (addonPricing[addonKey]) {
            appliedAddons.push({
              key: addonKey,
              ...addonPricing[addonKey]
            });
            totalAmount += addonPricing[addonKey].price;
          }
        }
      }

      // Use actual total from pricing details if available
      if (submission.pricingDetails?.totalAmount) {
        totalAmount = submission.pricingDetails.totalAmount;
      }
    }

    const statusData = {
      submissionId: submission._id,
      currentStatus,
      statusMessage,
      progress,
      nextStep,
      canEdit,
      isLive,
      paymentRequired,
      paymentCompleted,
      submission: {
        status: submission.status,
        submittedAt: submission.submittedAt,
        adminReview: submission.adminReview,
        selectedAddons: submission.selectedAddons || [],
        appliedAddons,
        listingData: submission.listingData
      },
      payment: payment ? {
        status: payment.status,
        amount: payment.amount,
        transactionRef: payment.transactionRef,
        completedAt: payment.completedAt,
        proofSubmitted: !!payment.proofOfPayment?.submitted
      } : null,
      listing: listing ? {
        status: listing.status,
        isFeatured: listing.isFeatured || false,
        featuredUntil: listing.featuredUntil,
        subscription: listing.subscription
      } : null,
      pricing: {
        subscriptionTier: submission.adminReview?.subscriptionTier || 'basic',
        tierDetails,
        addons: appliedAddons,
        totalAmount,
        currency: 'BWP'
      },
      timeline: [
        {
          step: 'submitted',
          title: 'Submission Received',
          completed: true,
          date: submission.submittedAt
        },
        {
          step: 'review',
          title: 'Admin Review',
          completed: submission.status !== 'pending_review',
          date: submission.adminReview?.reviewedAt
        },
        {
          step: 'payment',
          title: paymentRequired ? 'Payment Processing' : 'Payment Not Required',
          completed: !paymentRequired || paymentCompleted,
          date: payment?.completedAt,
          skipped: !paymentRequired
        },
        {
          step: 'live',
          title: 'Listing Active',
          completed: isLive,
          date: listing?.subscription?.approvedAt || submission.adminReview?.listingActivatedAt
        }
      ]
    };

    console.log(`[${timestamp}] ✅ Submission status calculated:`, {
      submissionId,
      currentStatus,
      progress,
      paymentRequired,
      paymentCompleted,
      isLive,
      totalAmount
    });

    return res.status(200).json({
      success: true,
      data: statusData
    });

  } catch (error) {
    console.error(`[${timestamp}] Get submission status error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get submission status',
      error: error.message
    });
  }
}

// PART 2: Add to api/user-services.js - Enhanced User Profile Endpoint
// Add this new endpoint to handle form auto-fill data

if (path === '/api/user/profile/form-data' && req.method === 'GET') {
  console.log(`[${timestamp}] → GET USER FORM AUTO-FILL DATA`);
  
  try {
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const userId = authResult.user.id;
    console.log(`[${timestamp}] Getting form data for user: ${userId}`);

    // Try to get user data from database
    try {
      const { ObjectId } = await import('mongodb');
      const usersCollection = db.collection('users');
      const dealersCollection = db.collection('dealers');
      
      // Get user data
      const userData = await usersCollection.findOne({
        _id: ObjectId.isValid(userId) ? new ObjectId(userId) : userId
      });

      if (userData) {
        // Check if user has a dealer profile for additional data
        const dealerProfile = await dealersCollection.findOne({
          user: ObjectId.isValid(userId) ? new ObjectId(userId) : userId
        });

        // Prepare auto-fill data structure
        const formAutoFillData = {
          // Basic user information
          sellerName: userData.name || '',
          email: userData.email || '',
          profilePicture: userData.profilePicture || userData.avatar || '',
          
          // Contact information
          contact: {
            phone: userData.phone || dealerProfile?.contact?.phone || '',
            email: userData.email || dealerProfile?.contact?.email || '',
            whatsapp: userData.whatsapp || dealerProfile?.contact?.whatsapp || '',
            
            // Location from user or dealer profile
            location: {
              city: userData.city || dealerProfile?.location?.city || '',
              state: userData.state || dealerProfile?.location?.state || '',
              address: userData.address || dealerProfile?.location?.address || '',
              country: userData.country || dealerProfile?.location?.country || 'Botswana'
            }
          },
          
          // Seller type information
          sellerType: dealerProfile?.sellerType || 'private',
          
          // Business information (if applicable)
          businessInfo: dealerProfile ? {
            businessName: dealerProfile.businessName || '',
            businessType: dealerProfile.businessType || '',
            registrationNumber: dealerProfile.registrationNumber || '',
            vatNumber: dealerProfile.vatNumber || ''
          } : null,
          
          // Private seller info (if applicable)
          privateSeller: dealerProfile?.privateSeller ? {
            firstName: dealerProfile.privateSeller.firstName || userData.firstName || '',
            lastName: dealerProfile.privateSeller.lastName || userData.lastName || '',
            idNumber: dealerProfile.privateSeller.idNumber || ''
          } : {
            firstName: userData.firstName || userData.name?.split(' ')[0] || '',
            lastName: userData.lastName || userData.name?.split(' ').slice(1).join(' ') || '',
            idNumber: ''
          },
          
          // Social media (if available)
          social: dealerProfile?.social || {
            facebook: userData.facebook || '',
            instagram: userData.instagram || '',
            twitter: userData.twitter || '',
            linkedin: userData.linkedin || ''
          },
          
          // Additional metadata
          userAccountType: userData.role || 'user',
          hasVerifiedEmail: userData.emailVerified || false,
          hasVerifiedPhone: userData.phoneVerified || false,
          memberSince: userData.createdAt || new Date(),
          
          // Profile completion status
          profileCompletion: {
            basicInfo: !!(userData.name && userData.email),
            contactInfo: !!(userData.phone),
            locationInfo: !!(userData.city),
            profilePicture: !!(userData.profilePicture || userData.avatar)
          }
        };

        console.log(`[${timestamp}] ✅ User form data prepared:`, {
          userId: userId,
          sellerName: formAutoFillData.sellerName,
          hasContact: !!formAutoFillData.contact.phone,
          hasLocation: !!formAutoFillData.contact.location.city,
          sellerType: formAutoFillData.sellerType,
          hasBusinessInfo: !!formAutoFillData.businessInfo,
          profileCompletion: Object.values(formAutoFillData.profileCompletion).filter(Boolean).length
        });

        return res.status(200).json({
          success: true,
          data: formAutoFillData,
          message: 'User form auto-fill data retrieved successfully',
          source: 'user-services.js - Enhanced with form auto-fill'
        });
      }
    } catch (dbError) {
      console.error(`[${timestamp}] Database error:`, dbError);
      // Continue to fallback
    }

    // Fallback for when user data is not available
    const fallbackData = {
      sellerName: authResult.user.name || '',
      email: authResult.user.email || '',
      profilePicture: '',
      contact: {
        phone: '',
        email: authResult.user.email || '',
        whatsapp: '',
        location: {
          city: '',
          state: '',
          address: '',
          country: 'Botswana'
        }
      },
      sellerType: 'private',
      businessInfo: null,
      privateSeller: {
        firstName: authResult.user.name?.split(' ')[0] || '',
        lastName: authResult.user.name?.split(' ').slice(1).join(' ') || '',
        idNumber: ''
      },
      social: {
        facebook: '',
        instagram: '',
        twitter: '',
        linkedin: ''
      },
      userAccountType: 'user',
      hasVerifiedEmail: false,
      hasVerifiedPhone: false,
      memberSince: new Date(),
      profileCompletion: {
        basicInfo: !!(authResult.user.name && authResult.user.email),
        contactInfo: false,
        locationInfo: false,
        profilePicture: false
      }
    };

    console.log(`[${timestamp}] ✅ Using fallback form data for user: ${userId}`);

    return res.status(200).json({
      success: true,
      data: fallbackData,
      message: 'User form auto-fill data (fallback)',
      source: 'user-services.js - Fallback data'
    });

  } catch (error) {
    console.error(`[${timestamp}] User form data error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve user form data',
      error: error.message
    });
  }
}

// Also add endpoint to update user profile data from listing form
if (path === '/api/user/profile/update-from-listing' && req.method === 'PUT') {
  console.log(`[${timestamp}] → UPDATE USER PROFILE FROM LISTING FORM`);
  
  try {
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const userId = authResult.user.id;
    const updateData = req.body;

    console.log(`[${timestamp}] Updating user profile from listing form:`, {
      userId: userId,
      hasPhone: !!updateData.contact?.phone,
      hasLocation: !!updateData.contact?.location?.city,
      hasProfilePicture: !!updateData.profilePicture
    });

    try {
      const { ObjectId } = await import('mongodb');
      const usersCollection = db.collection('users');
      
      // Prepare user update
      const userUpdate = {
        updatedAt: new Date()
      };

      // Update basic info if provided
      if (updateData.contact?.phone) {
        userUpdate.phone = updateData.contact.phone;
      }
      if (updateData.contact?.location?.city) {
        userUpdate.city = updateData.contact.location.city;
      }
      if (updateData.contact?.location?.state) {
        userUpdate.state = updateData.contact.location.state;
      }
      if (updateData.contact?.location?.address) {
        userUpdate.address = updateData.contact.location.address;
      }
      if (updateData.profilePicture) {
        userUpdate.profilePicture = updateData.profilePicture;
      }
      if (updateData.social) {
        userUpdate.facebook = updateData.social.facebook || '';
        userUpdate.instagram = updateData.social.instagram || '';
        userUpdate.twitter = updateData.social.twitter || '';
        userUpdate.linkedin = updateData.social.linkedin || '';
      }

      // Update user document
      const result = await usersCollection.updateOne(
        { _id: ObjectId.isValid(userId) ? new ObjectId(userId) : userId },
        { $set: userUpdate }
      );

      console.log(`[${timestamp}] ✅ User profile updated:`, {
        userId: userId,
        modifiedCount: result.modifiedCount,
        fieldsUpdated: Object.keys(userUpdate).length
      });

      return res.status(200).json({
        success: true,
        message: 'User profile updated successfully',
        modifiedCount: result.modifiedCount,
        source: 'user-services.js - Profile update from listing'
      });

    } catch (dbError) {
      console.error(`[${timestamp}] Database update error:`, dbError);
      return res.status(500).json({
        success: false,
        message: 'Failed to update user profile',
        error: dbError.message
      });
    }

  } catch (error) {
    console.error(`[${timestamp}] User profile update error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update user profile',
      error: error.message
    });
  }
}


// ==================== FEEDBACK ENDPOINTS (CLEAN VERSION) ====================
// REPLACE both feedback sections with this single clean version

if (path.startsWith('/api/feedback') || path.startsWith('/feedback')) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 🔍 Feedback endpoint: ${path} (${req.method})`);
  
  // Test endpoint
  if ((path === '/api/feedback/test/endpoints' || path === '/feedback/test/endpoints') && req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: 'Feedback routes are working',
      version: '2.0.0',
      timestamp: timestamp
    });
  }
  
// Submit feedback - FIXED FOR JSON SUBMISSIONS
if ((path === '/api/feedback' || path === '/feedback') && req.method === 'POST') {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 📝 Processing feedback submission`);
    console.log(`[${timestamp}] Content-Type:`, req.headers['content-type']);
    
    // Handle JSON submissions (which should work in Vercel)
    const { name, email, feedbackType, message, rating, pageContext, browserInfo } = req.body;
    
    console.log(`[${timestamp}] 📋 Received data:`, {
      name: name || 'MISSING',
      email: email || 'MISSING',
      feedbackType: feedbackType || 'MISSING',
      message: message ? 'present' : 'MISSING',
      rating: rating || 'MISSING'
    });
    
    // Validate required fields
    if (!name || !email || !message) {
      console.log(`[${timestamp}] ❌ Missing required fields`);
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and message',
        debug: {
          hasName: !!name,
          hasEmail: !!email,
          hasMessage: !!message
        }
      });
    }
    
    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log(`[${timestamp}] ❌ Invalid email format`);
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }
    
    // Create feedback object
    const { ObjectId } = await import('mongodb');
    const feedbackObj = {
      _id: new ObjectId(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      feedbackType: feedbackType || 'general',
      message: message.trim(),
      rating: parseInt(rating) || 5,
      status: 'new',
      priority: (parseInt(rating) || 5) <= 2 ? 'high' : 'medium',
      ipAddress: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      pageContext: pageContext || {
        url: req.headers.referer || 'unknown',
        page: 'unknown',
        section: 'feedback'
      },
      browserInfo: browserInfo || {
        userAgent: req.headers['user-agent'] || 'unknown'
      },
      attachments: [], // No attachments for JSON submissions
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    console.log(`[${timestamp}] 💾 Saving to database...`);
    
    // Insert feedback
    const result = await db.collection('feedback').insertOne(feedbackObj);
    
    if (result.insertedId) {
      console.log(`[${timestamp}] ✅ Success: ${result.insertedId}`);
      return res.status(201).json({
        success: true,
        message: 'Feedback submitted successfully. Thank you!',
        data: { id: result.insertedId }
      });
    } else {
      throw new Error('Database insert failed');
    }
    
  } catch (error) {
    console.error(`[${timestamp}] ❌ Error:`, error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit feedback. Please try again.',
      debug: { error: error.message }
    });
  }
}
  
  // Track feedback by email
  if ((path.startsWith('/api/feedback/track/') || path.startsWith('/feedback/track/')) && req.method === 'GET') {
    try {
      const email = path.split('/').pop();
      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required'
        });
      }
      
      const feedback = await db.collection('feedback')
        .find({ email: email.toLowerCase() })
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray();
      
      return res.status(200).json({
        success: true,
        count: feedback.length,
        data: feedback
      });
      
    } catch (error) {
      console.error('Feedback tracking error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error tracking feedback'
      });
    }
  }
  
  // WhatsApp tracking
  if ((path === '/api/feedback/whatsapp-submitted' || path === '/feedback/whatsapp-submitted') && req.method === 'POST') {
    console.log(`[${timestamp}] 📱 WhatsApp feedback tracked`);
    return res.status(200).json({
      success: true,
      message: 'WhatsApp feedback tracked'
    });
  }
  
  // Stats endpoint
  if ((path === '/api/feedback/stats' || path === '/feedback/stats') && req.method === 'GET') {
    try {
      const [total, newCount, completed] = await Promise.all([
        db.collection('feedback').countDocuments(),
        db.collection('feedback').countDocuments({ status: 'new' }),
        db.collection('feedback').countDocuments({ status: 'completed' })
      ]);
      
      return res.status(200).json({
        success: true,
        data: {
          total,
          new: newCount,
          completed,
          responseRate: total ? Math.round((completed / total) * 100) : 0
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Error fetching stats'
      });
    }
  }

  // ==================== ADMIN FEEDBACK ENDPOINTS ====================

// Get all feedback (Admin) - GET /api/feedback
if ((path === '/api/feedback' || path === '/feedback') && req.method === 'GET') {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 📋 Admin: Fetching all feedback`);
    
    // Add basic authentication check (you can enhance this)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    // Parse query parameters for filtering and pagination
    const query = new URL(req.url, `https://${req.headers.host}`).searchParams;
    const page = parseInt(query.get('page')) || 1;
    const limit = parseInt(query.get('limit')) || 10;
    const status = query.get('status');
    const feedbackType = query.get('feedbackType');
    const sortBy = query.get('sortBy') || 'createdAt';
    const sortOrder = query.get('sortOrder') === 'asc' ? 1 : -1;
    
    // Build filter
    let filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (feedbackType && feedbackType !== 'all') {
      filter.feedbackType = feedbackType;
    }
    
    // Calculate skip
    const skip = (page - 1) * limit;
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder;
    
    // Get feedback with pagination
    const [feedback, totalCount] = await Promise.all([
      db.collection('feedback')
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection('feedback').countDocuments(filter)
    ]);
    
    console.log(`[${timestamp}] ✅ Found ${feedback.length} feedback items`);
    
    return res.status(200).json({
      success: true,
      count: feedback.length,
      pagination: {
        total: totalCount,
        page,
        limit,
        pages: Math.ceil(totalCount / limit),
        hasNextPage: page < Math.ceil(totalCount / limit),
        hasPrevPage: page > 1
      },
      data: feedback
    });
    
  } catch (error) {
    console.error('Admin feedback fetch error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch feedback'
    });
  }
}

// Get feedback stats (Admin) - GET /api/feedback/stats  
if (path === '/api/feedback/stats' && req.method === 'GET') {
  try {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 📊 Admin: Fetching feedback stats`);
    
    // Basic auth check
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    // Get comprehensive stats
    const [
      totalCount,
      newCount,
      inProgressCount,
      completedCount,
      highPriorityCount,
      avgRatingResult,
      typeDistribution,
      recentCount
    ] = await Promise.all([
      db.collection('feedback').countDocuments(),
      db.collection('feedback').countDocuments({ status: 'new' }),
      db.collection('feedback').countDocuments({ status: 'in-progress' }),
      db.collection('feedback').countDocuments({ status: 'completed' }),
      db.collection('feedback').countDocuments({ priority: 'high' }),
      db.collection('feedback').aggregate([
        { $group: { _id: null, avgRating: { $avg: '$rating' } } }
      ]).toArray(),
      db.collection('feedback').aggregate([
        { $group: { _id: '$feedbackType', count: { $sum: 1 } } }
      ]).toArray(),
      db.collection('feedback').countDocuments({
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      })
    ]);
    
    const stats = {
      total: totalCount,
      byStatus: {
        new: newCount,
        'in-progress': inProgressCount,
        completed: completedCount
      },
      byPriority: {
        high: highPriorityCount,
        medium: totalCount - highPriorityCount - newCount,
        low: Math.max(0, newCount)
      },
      averageRating: avgRatingResult[0]?.avgRating?.toFixed(1) || '0.0',
      responseRate: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
      recentFeedback: recentCount,
      typeDistribution: typeDistribution.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {})
    };
    
    console.log(`[${timestamp}] ✅ Stats calculated - Total: ${totalCount}, New: ${newCount}`);
    
    return res.status(200).json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    console.error('Feedback stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch feedback statistics'
    });
  }
}

// Update feedback status (Admin) - PUT /api/feedback/:id/status
if (path.startsWith('/api/feedback/') && path.includes('/status') && req.method === 'PUT') {
  try {
    const timestamp = new Date().toISOString();
    const feedbackId = path.split('/')[3]; // Extract ID from path
    console.log(`[${timestamp}] 🔄 Admin: Updating feedback ${feedbackId} status`);
    
    // Basic auth check
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    const { status, adminNotes, priority } = req.body;
    
    // Validate status
    const validStatuses = ['new', 'in-progress', 'completed', 'archived'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }
    
    // Build update object
    const updateObj = {
      updatedAt: new Date()
    };
    
    if (status) updateObj.status = status;
    if (adminNotes) updateObj.adminNotes = adminNotes;
    if (priority) updateObj.priority = priority;
    
    // Update feedback
    const { ObjectId } = await import('mongodb');
    const result = await db.collection('feedback').updateOne(
      { _id: new ObjectId(feedbackId) },
      { $set: updateObj }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Feedback not found'
      });
    }
    
    console.log(`[${timestamp}] ✅ Feedback ${feedbackId} updated`);
    
    return res.status(200).json({
      success: true,
      message: 'Feedback updated successfully',
      data: { id: feedbackId, ...updateObj }
    });
    
  } catch (error) {
    console.error('Feedback update error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update feedback'
    });
  }
}

// Add admin response to feedback - PUT /api/feedback/:id/response
if (path.startsWith('/api/feedback/') && path.includes('/response') && req.method === 'PUT') {
  try {
    const timestamp = new Date().toISOString();
    const feedbackId = path.split('/')[3];
    console.log(`[${timestamp}] 💬 Admin: Adding response to feedback ${feedbackId}`);
    
    // Basic auth check
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    const { message } = req.body;
    
    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Response message is required'
      });
    }
    
    // Update feedback with admin response
    const { ObjectId } = await import('mongodb');
    const result = await db.collection('feedback').updateOne(
      { _id: new ObjectId(feedbackId) },
      {
        $set: {
          adminResponse: {
            message: message.trim(),
            respondedAt: new Date()
          },
          status: 'completed', // Auto-complete when admin responds
          updatedAt: new Date()
        }
      }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Feedback not found'
      });
    }
    
    console.log(`[${timestamp}] ✅ Admin response added to feedback ${feedbackId}`);
    
    return res.status(200).json({
      success: true,
      message: 'Admin response added successfully'
    });
    
  } catch (error) {
    console.error('Admin response error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add admin response'
    });
  }
}
  
  // Feedback endpoint not found
  return res.status(404).json({
    success: false,
    message: `Feedback endpoint not found: ${path}`
  });
}







// ==================== ROLE REQUESTS ENDPOINTS ====================
// REPLACE your entire "COMPLETE ROLE REQUESTS ENDPOINTS" section with this clean version
// This goes OUTSIDE the admin block, with your other user endpoints

// 1. GET USER'S ROLE REQUESTS
if (path === '/user/role-requests' && req.method === 'GET') {
  console.log(`[${timestamp}] → GET USER ROLE REQUESTS`);
  
  try {
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const roleRequestsCollection = db.collection('rolerequests');
    
    const userRequests = await roleRequestsCollection.find({
      userId: authResult.user.id
    })
    .sort({ createdAt: -1 })
    .toArray();

    console.log(`[${timestamp}] ✅ Found ${userRequests.length} role requests for user ${authResult.user.name}`);

    // Transform data for consistent frontend consumption
    const transformedRequests = userRequests.map(request => ({
      id: request._id,
      requestType: request.requestType,
      status: request.status,
      createdAt: request.createdAt,
      submittedAt: request.createdAt, // For compatibility
      priority: request.priority || 'normal',
      reason: request.reason || '',
      reviewNotes: request.reviewNotes || request.adminNotes || '',
      reviewedAt: request.reviewedAt,
      reviewedByName: request.reviewedByName || 'Admin'
    }));

    return res.status(200).json({
      success: true,
      count: transformedRequests.length,
      data: transformedRequests
    });

  } catch (error) {
    console.error(`[${timestamp}] Get user role requests error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch role requests',
      error: error.message
    });
  }
}

// 2. SUBMIT ROLE REQUEST  
// SUBMIT ROLE REQUEST - COMPLETE REPLACEMENT
// Find and REPLACE your existing '/role-requests' POST endpoint with this:
if (path === '/role-requests' && req.method === 'POST') {
  console.log(`[${timestamp}] → ROLE REQUEST SUBMISSION`);
  
  try {
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    let body = {};
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks).toString();
      
      if (rawBody) {
        body = JSON.parse(rawBody);
      }
    } catch (parseError) {
      console.error(`[${timestamp}] Request parsing error:`, parseError);
      return res.status(400).json({
        success: false,
        message: 'Invalid request format'
      });
    }

    const { requestType, reason, requestData } = body;

    console.log(`[${timestamp}] Processing role request:`, { requestType, reason });

    // UPDATED: Validate request type - NOW INCLUDES JOURNALIST AND COURIER
    const validTypes = [
      'dealership_admin', 'transport_admin', 'rental_admin', 
      'transport_coordinator', 'taxi_driver', 'ministry_official',
      'journalist',  // ADDED: Journalist role
      'courier'      // ADDED: Courier role
    ];
    
    if (!validTypes.includes(requestType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid request type. Valid types: ${validTypes.join(', ')}`
      });
    }

    const { ObjectId } = await import('mongodb');
    const usersCollection = db.collection('users');
    const roleRequestsCollection = db.collection('rolerequests');

    // Check if user already has this role
    const user = await usersCollection.findOne({ _id: new ObjectId(authResult.user.id) });
    if (user && user.role === requestType) {
      return res.status(400).json({
        success: false,
        message: `You already have the ${requestType} role`
      });
    }

    // Check for existing pending request
    const existingRequest = await roleRequestsCollection.findOne({
      userId: authResult.user.id,
      requestType: requestType,
      status: 'pending'
    });
    
    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: `You already have a pending ${requestType} request. Please wait for it to be processed.`
      });
    }

    // ENHANCED: Create role request with complete data support
    const roleRequest = {
      userId: authResult.user.id,
      userEmail: authResult.user.email,
      userName: authResult.user.name,
      requestType: requestType,
      status: 'pending',
      priority: ['ministry_official', 'transport_admin', 'journalist'].includes(requestType) ? 'high' : 'medium',
      reason: reason || `Application for ${requestType} role`,
      
      // ENHANCED: Store complete request data for admin review
      requestData: requestData || {},
      
      // Legacy structure for backward compatibility
      businessInfo: {
        businessName: requestData?.businessName || '',
        businessType: requestData?.businessType || '',
        licenseNumber: requestData?.licenseNumber || '',
        taxId: requestData?.taxId || '',
        registrationNumber: requestData?.registrationNumber || '',
        website: requestData?.website || ''
      },
      
      contactInfo: {
        businessPhone: requestData?.businessPhone || '',
        businessEmail: requestData?.businessEmail || '',
        businessAddress: requestData?.businessAddress || '',
        city: requestData?.city || ''
      },
      
      // ENHANCED: Role-specific information with ALL role types
      roleSpecificInfo: {
        // Existing dealership/transport fields
        serviceType: requestData?.serviceType || '',
        dealershipType: requestData?.dealershipType || '',
        transportRoutes: requestData?.transportRoutes || '',
        fleetSize: requestData?.fleetSize || '',
        operatingAreas: requestData?.operatingAreas || '',
        employeeId: requestData?.employeeId || '',
        department: requestData?.department || '',
        ministryName: requestData?.ministryName || '',
        position: requestData?.position || '',
        experience: requestData?.experience || '',
        description: requestData?.description || '',
        specializations: requestData?.specializations || '',
        
        // NEW: Journalist-specific fields
        writingExperience: requestData?.writingExperience || '',
        portfolio: requestData?.portfolio || '',
        motivation: requestData?.motivation || '',
        socialMediaHandles: requestData?.socialMediaHandles || '',
        
        // NEW: Courier-specific fields
        transportModes: requestData?.transportModes || [],
        deliveryCapacity: requestData?.deliveryCapacity || '',
        operatingSchedule: requestData?.operatingSchedule || '',
        coverageAreas: requestData?.coverageAreas || '',
        courierExperience: requestData?.courierExperience || ''
      },
      
      // Metadata
      ipAddress: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await roleRequestsCollection.insertOne(roleRequest);
    
    console.log(`[${timestamp}] ✅ Role request created: ${requestType} for user ${authResult.user.name}`);
    
    return res.status(201).json({
      success: true,
      message: `${requestType} role request submitted successfully! You will receive an email when it's reviewed.`,
      data: {
        id: result.insertedId,
        requestType: roleRequest.requestType,
        status: roleRequest.status,
        submittedAt: roleRequest.createdAt
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] Role request submission error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit role request',
      error: error.message
    });
  }
}

// 9. SUBSCRIPTION/SELLER TYPE ENDPOINT
if (path === '/api/subscription/seller-type' && req.method === 'GET') {
  console.log(`[${timestamp}] → GET SUBSCRIPTION SELLER TYPE`);
  
  try {
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Get user's current subscription info
    const { ObjectId } = await import('mongodb');
    const usersCollection = db.collection('users');
    const dealersCollection = db.collection('dealers');
    
    const user = await usersCollection.findOne({ _id: new ObjectId(authResult.user.id) });
    
    let subscriptionData = {
      sellerType: 'private',
      hasSubscription: false,
      subscriptionTier: null,
      subscriptionStatus: null,
      expiresAt: null
    };

    // Check if user has dealer profile
    if (user && user.dealership) {
      const dealer = await dealersCollection.findOne({ _id: new ObjectId(user.dealership) });
      if (dealer) {
        subscriptionData = {
          sellerType: dealer.sellerType || 'dealership',
          hasSubscription: dealer.subscription && dealer.subscription.status === 'active',
          subscriptionTier: dealer.subscription?.tier || null,
          subscriptionStatus: dealer.subscription?.status || null,
          expiresAt: dealer.subscription?.expiresAt || null
        };
      }
    }

    return res.status(200).json({
      success: true,
      data: subscriptionData
    });

  } catch (error) {
    console.error(`[${timestamp}] Get seller type error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch seller type',
      error: error.message
    });
  }
}

// 10. ROLE STATISTICS ENDPOINT (Admin)
if (path === '/api/role-requests/stats' && req.method === 'GET') {
  console.log(`[${timestamp}] → GET ROLE REQUEST STATISTICS`);
  
  try {
    const authResult = await verifyAdminToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required'
      });
    }

    const roleRequestsCollection = db.collection('rolerequests');
    
    // Get statistics
    const [
      totalRequests,
      pendingRequests,
      approvedRequests,
      rejectedRequests,
      requestsByType,
      recentRequests
    ] = await Promise.all([
      roleRequestsCollection.countDocuments({}),
      roleRequestsCollection.countDocuments({ status: 'pending' }),
      roleRequestsCollection.countDocuments({ status: 'approved' }),
      roleRequestsCollection.countDocuments({ status: 'rejected' }),
      roleRequestsCollection.aggregate([
        { $group: { _id: '$requestType', count: { $sum: 1 } } }
      ]).toArray(),
      roleRequestsCollection.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .toArray()
    ]);

    const stats = {
      total: totalRequests,
      pending: pendingRequests,
      approved: approvedRequests,
      rejected: rejectedRequests,
      byType: requestsByType.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {}),
      recent: recentRequests
    };

    return res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error(`[${timestamp}] Get role statistics error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch role statistics',
      error: error.message
    });
  }
}

// ==================== END ROLE REQUESTS ENDPOINTS ====================









// ============================================
// MANUAL PAYMENT API ENDPOINTS - COMPLETE SECTION
// Replace your existing manual payment section with this complete version
// ============================================

// ==========================================
// TEST ENDPOINTS FOR DEBUGGING
// ==========================================

// @desc    Test endpoint for submit-proof debugging (full path)
// @route   GET /api/payments/test-submit-proof
// @access  Public (for debugging)
if (path === '/api/payments/test-submit-proof' && req.method === 'GET') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → TEST SUBMIT PROOF ENDPOINT HIT (full path)`);
  
  return res.status(200).json({
    success: true,
    message: 'Submit proof endpoint is accessible via full path',
    timestamp: timestamp,
    path: path,
    method: req.method,
    info: 'This confirms the /api/payments/submit-proof routing is working correctly'
  });
}

// @desc    Test endpoint for submit-proof debugging (normalized path)
// @route   GET /payments/test-submit-proof
// @access  Public (for debugging)
if (path === '/payments/test-submit-proof' && req.method === 'GET') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → TEST SUBMIT PROOF ENDPOINT HIT (normalized path)`);
  
  return res.status(200).json({
    success: true,
    message: 'Submit proof endpoint is accessible via normalized path',
    timestamp: timestamp,
    path: path,
    method: req.method,
    info: 'This confirms the /payments/submit-proof routing is working correctly'
  });
}

// ==========================================
// SUBMIT PROOF ENDPOINTS (BOTH PATHS)
// ==========================================

// @desc    Submit proof of payment (uses existing S3 infrastructure) - FULL PATH
// @route   POST /api/payments/submit-proof
// @access  Private
if (path === '/api/payments/submit-proof' && req.method === 'POST') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → SUBMIT PROOF OF PAYMENT (full path - using existing S3)`);
  
  try {
    // Check authentication
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    let body = {};
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString();
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch (parseError) {
        console.log(`[${timestamp}] ❌ JSON parse error:`, parseError.message);
        return res.status(400).json({
          success: false,
          message: 'Invalid JSON in request body'
        });
      }
    }

    console.log(`[${timestamp}] 📝 Request body received:`, {
      hasListingId: !!body.listingId,
      hasSubscriptionTier: !!body.subscriptionTier,
      hasAmount: !!body.amount,
      hasProofFile: !!body.proofFile
    });

    const { listingId, subscriptionTier, amount, paymentType = 'manual', proofFile } = body;

    if (!listingId || !subscriptionTier || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: listingId, subscriptionTier, amount'
      });
    }

    if (!proofFile || !proofFile.url) {
      return res.status(400).json({
        success: false,
        message: 'Proof of payment file is required'
      });
    }

    const { ObjectId } = await import('mongodb');
    
    // Create payment record with S3 file info
    const paymentsCollection = db.collection('payments');
    const txRef = `manual_${listingId}_${Date.now()}`;
    
    const paymentData = {
      user: new ObjectId(authResult.user.id),
      listing: new ObjectId(listingId),
      transactionRef: txRef,
      amount: Number(amount),
      currency: 'BWP',
      subscriptionTier,
      status: 'proof_submitted',
      paymentMethod: 'manual',
      proofOfPayment: {
        submitted: true,
        submittedAt: new Date(),
        file: {
          url: proofFile.url, // S3 URL from your existing upload system
          filename: proofFile.filename,
          size: proofFile.size,
          mimetype: proofFile.mimetype,
          uploadedAt: new Date(proofFile.uploadedAt)
        },
        status: 'pending_review'
      },
      metadata: {
        manualPayment: true,
        userAgent: req.headers['user-agent'],
        ipAddress: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        uploadedViaS3: true
      },
      createdAt: new Date()
    };

    const result = await paymentsCollection.insertOne(paymentData);

    // Update the user submission to indicate proof submitted
    try {
      const userSubmissionsCollection = db.collection('usersubmissions');
      await userSubmissionsCollection.updateOne(
        { 
          userId: new ObjectId(authResult.user.id),
          'listingData._id': new ObjectId(listingId)
        },
        {
          $set: {
            'paymentProof.submitted': true,
            'paymentProof.submittedAt': new Date(),
            'paymentProof.paymentId': result.insertedId,
            'paymentProof.status': 'pending_admin_review',
            'paymentProof.file': proofFile
          }
        }
      );
    } catch (submissionUpdateError) {
      console.log(`[${timestamp}] User submission update failed (non-critical):`, submissionUpdateError.message);
    }

    // Send email notifications (optional)
    try {
      const usersCollection = db.collection('users');
      const user = await usersCollection.findOne({ _id: new ObjectId(authResult.user.id) });
      
      console.log(`[${timestamp}] ✅ Proof of payment submitted: ${result.insertedId}`);
      console.log(`[${timestamp}] 📧 Email notifications would be sent here`);
    } catch (emailError) {
      console.error('Email notification failed:', emailError);
      // Don't fail the payment submission if email fails
    }

    return res.status(200).json({
      success: true,
      data: {
        paymentId: result.insertedId,
        transactionRef: txRef,
        status: 'proof_submitted',
        fileUrl: proofFile.url,
        message: 'Proof of payment submitted successfully'
      },
      message: 'Your proof of payment has been submitted and is pending admin review (usually within 24 hours)'
    });

  } catch (error) {
    console.error(`[${timestamp}] Submit proof error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit proof of payment',
      error: error.message
    });
  }
}

// @desc    Submit proof of payment (uses existing S3 infrastructure) - NORMALIZED PATH
// @route   POST /payments/submit-proof
// @access  Private
if (path === '/payments/submit-proof' && req.method === 'POST') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → SUBMIT PROOF OF PAYMENT (normalized path - using existing S3)`);
  
  try {
    // Check authentication
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    let body = {};
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString();
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch (parseError) {
        console.log(`[${timestamp}] ❌ JSON parse error:`, parseError.message);
        return res.status(400).json({
          success: false,
          message: 'Invalid JSON in request body'
        });
      }
    }

    console.log(`[${timestamp}] 📝 Request body received:`, {
      hasListingId: !!body.listingId,
      hasSubscriptionTier: !!body.subscriptionTier,
      hasAmount: !!body.amount,
      hasProofFile: !!body.proofFile
    });

    const { listingId, subscriptionTier, amount, paymentType = 'manual', proofFile } = body;

    if (!listingId || !subscriptionTier || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: listingId, subscriptionTier, amount'
      });
    }

    if (!proofFile || !proofFile.url) {
      return res.status(400).json({
        success: false,
        message: 'Proof of payment file is required'
      });
    }

    const { ObjectId } = await import('mongodb');
    
    // Create payment record with S3 file info
    const paymentsCollection = db.collection('payments');
    const txRef = `manual_${listingId}_${Date.now()}`;
    
    const paymentData = {
      user: new ObjectId(authResult.user.id),
      listing: new ObjectId(listingId),
      transactionRef: txRef,
      amount: Number(amount),
      currency: 'BWP',
      subscriptionTier,
      status: 'proof_submitted',
      paymentMethod: 'manual',
      proofOfPayment: {
        submitted: true,
        submittedAt: new Date(),
        file: {
          url: proofFile.url, // S3 URL from your existing upload system
          filename: proofFile.filename,
          size: proofFile.size,
          mimetype: proofFile.mimetype,
          uploadedAt: new Date(proofFile.uploadedAt)
        },
        status: 'pending_review'
      },
      metadata: {
        manualPayment: true,
        userAgent: req.headers['user-agent'],
        ipAddress: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        uploadedViaS3: true
      },
      createdAt: new Date()
    };

    const result = await paymentsCollection.insertOne(paymentData);

    // Update the user submission to indicate proof submitted
    try {
      const userSubmissionsCollection = db.collection('usersubmissions');
      await userSubmissionsCollection.updateOne(
        { 
          userId: new ObjectId(authResult.user.id),
          'listingData._id': new ObjectId(listingId)
        },
        {
          $set: {
            'paymentProof.submitted': true,
            'paymentProof.submittedAt': new Date(),
            'paymentProof.paymentId': result.insertedId,
            'paymentProof.status': 'pending_admin_review',
            'paymentProof.file': proofFile
          }
        }
      );
    } catch (submissionUpdateError) {
      console.log(`[${timestamp}] User submission update failed (non-critical):`, submissionUpdateError.message);
    }

    // Send email notifications (optional)
    try {
      const usersCollection = db.collection('users');
      const user = await usersCollection.findOne({ _id: new ObjectId(authResult.user.id) });
      
      console.log(`[${timestamp}] ✅ Proof of payment submitted: ${result.insertedId}`);
      console.log(`[${timestamp}] 📧 Email notifications would be sent here`);
    } catch (emailError) {
      console.error('Email notification failed:', emailError);
      // Don't fail the payment submission if email fails
    }

    return res.status(200).json({
      success: true,
      data: {
        paymentId: result.insertedId,
        transactionRef: txRef,
        status: 'proof_submitted',
        fileUrl: proofFile.url,
        message: 'Proof of payment submitted successfully'
      },
      message: 'Your proof of payment has been submitted and is pending admin review (usually within 24 hours)'
    });

  } catch (error) {
    console.error(`[${timestamp}] Submit proof error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit proof of payment',
      error: error.message
    });
  }
}

// ============================================
// MANUAL PAYMENT API ENDPOINTS - COMPLETE SECTION
// ============================================

// ==========================================
// TEST ENDPOINTS FOR DEBUGGING
// ==========================================

// @desc    Test endpoint for payment dashboard routing
// @route   GET /api/admin/payments/test
// @access  Public (for testing)
if (path === '/api/admin/payments/test' && req.method === 'GET') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → PAYMENT DASHBOARD TEST ENDPOINT HIT`);
  
  return res.status(200).json({
    success: true,
    message: 'Payment dashboard API routing is working correctly!',
    timestamp: timestamp,
    path: path,
    method: req.method,
    availableEndpoints: [
      'GET /api/admin/payments/test',
      'GET /api/admin/payments/list',
      'GET /api/admin/payments/stats', 
      'GET /api/admin/payments/pending-manual',
      'POST /api/admin/payments/approve-manual',
      'GET /api/admin/payments/proof/:paymentId',
      'GET /api/payments/history',
      'GET /api/payments/status/:listingId'
    ],
    mockData: {
      totalPayments: 25,
      pendingReview: 3,
      approvedToday: 2,
      totalRevenue: 1250,
      testPayments: [
        {
          _id: 'test1',
          transactionRef: 'TXN001',
          userEmail: 'test@example.com',
          amount: 150,
          status: 'completed',
          subscriptionTier: 'premium',
          paymentMethod: 'manual',
          createdAt: new Date().toISOString()
        }
      ]
    }
  });
}


// ==================== END MANUAL PAYMENT ENDPOINTS ====================

    // Add these endpoint handlers to your existing api/index.js file
// Insert these AFTER your existing route handlers but BEFORE the final catch-all

// ===== ADD THESE PAYMENT ENDPOINTS =====
// Add this section after your existing /user/profile routes

// ==================== COMPLETE ENDPOINTS SECTION ====================
// Add this to your main api/index.js file
// Place AFTER path setup but BEFORE existing conditional blocks

// ==================== MISSING ENDPOINTS (OUTSIDE CONDITIONAL BLOCKS) ====================
// These need to be outside conditional blocks to be reachable by normalized paths

// GET /payments/available-tiers - PUBLIC endpoint (no auth required)
if (path === '/payments/available-tiers' && req.method === 'GET') {
  console.log(`[${timestamp}] ✅ HIT: /payments/available-tiers (normalized path)`);
  
  return res.status(200).json({
    success: true,
    data: {
      sellerType: 'private',
      tiers: {
          // ADD FREE TIER - simple addition
        free: {
          name: 'Free Listing',
          price: 0,
          duration: 30,
          maxListings: 8,
          features: [
            'Up to 8 Active Listings',
            'Basic Support', 
            '30 Days Active',
            'Limited Visibility'
          ]
        },
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
      hasFreeOption: true, 
      description: 'Each subscription allows 1 car listing. You can subscribe multiple times for additional cars.',
      source: 'updated-with-free-tier'
    }
  });
}

if (path === '/payments/process-free-listing' && req.method === 'POST') {
  try {
    const { submissionId } = req.body;
    
    if (!submissionId) {
      return res.status(400).json({
        success: false,
        message: 'Submission ID is required'
      });
    }

    // Simple update - mark submission as free tier
    const { ObjectId } = await import('mongodb');
    const userSubmissionsCollection = db.collection('usersubmissions');
    
    const updateResult = await userSubmissionsCollection.updateOne(
      { 
        _id: new ObjectId(submissionId),
        status: 'pending_review'
      },
      {
        $set: {
          selectedTier: 'free',
          paymentRequired: false,
          updatedAt: new Date()
        }
      }
    );

    if (updateResult.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found or already processed'
      });
    }

    console.log(`✅ Free tier selected for submission: ${submissionId}`);

    return res.status(200).json({
      success: true,
      message: 'Free listing tier selected successfully',
      data: {
        submissionId,
        tier: 'free',
        paymentRequired: false,
        status: 'pending_review'
      }
    });

  } catch (error) {
    console.error('Process free listing error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process free listing selection'
    });
  }
}

// GET /addons/available - PUBLIC endpoint (no auth required)
if (path === '/addons/available' && req.method === 'GET') {
  console.log(`[${timestamp}] ✅ HIT: /addons/available (normalized path)`);
  
  return res.status(200).json({
    success: true,
    data: {
      sellerType: 'private',
      addons: {
        photography: {
          name: 'Professional Photography',
          price: 600,
          description: 'High-quality photos of your vehicle',
          features: ['Professional photographer visit', 'Multiple angles', 'Interior and exterior shots', 'Same-day delivery', 'Transport fees charged separately'],
          duration: '2-3 hours',
          bookingRequired: true
        },
        review: {
          name: 'Professional Car Review',
          price: 900,
          description: 'Detailed review of your vehicle by automotive expert',
          features: ['Professional review video', 'Written assessment', 'Market value analysis', 'Reliability evaluation', 'Transport fees charged separately'],
          duration: '3-4 hours',
          bookingRequired: true
        },
         management: {
          name: 'Professional Listing Assistance',
          price: 0,
          description: 'Full assistance with making vehicle listing on Bw Car Culture',
          features: ['Listing creation','SEO Optimization'],
          duration: '3-6 mins',
          bookingRequired: true
        },
        featured: {
          name: 'Featured Listing',
          price: 200,
          description: 'Boost your listing visibility',
          features: ['Top placement in search', 'Highlighted in listings', '3x social media promtion', '30 days featured'],
          duration: '30 days',
          bookingRequired: false
        }
      },
      whatsappNumber: '+26774122453',
      bookingInstructions: 'Contact us via WhatsApp to schedule addon services',
      source: 'main-index.js-fixed'
    }
  });
}

// ==================== PAYMENTS SECTION (AUTHENTICATED ENDPOINTS) ====================
// Keep your existing payment logic here with authentication

if (path.startsWith('/api/payments')) {
  console.log(`[${timestamp}] → PAYMENTS: ${path}`);
  
  // === WEBHOOK ENDPOINT (NO AUTH REQUIRED) ===
  if (path === '/api/payments/webhook' && req.method === 'POST') {
    try {
      const secretHash = process.env.FLUTTERWAVE_SECRET_HASH;
      const signature = req.headers['verif-hash'];

      if (!signature || signature !== secretHash) {
        console.warn('Invalid webhook signature received');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const payload = req.body;
      console.log('Webhook payload received:', payload.event);

      if (payload.event === 'charge.completed' && payload.data.status === 'successful') {
        const txRef = payload.data.tx_ref;
        
        const paymentsCollection = db.collection('payments');
        const payment = await paymentsCollection.findOne({ transactionRef: txRef });
        
        if (payment && payment.status === 'pending') {
          // Get seller type and pricing
          const sellerType = await getUserSellerType(db, payment.user);
          
          // Update payment status
          await paymentsCollection.updateOne(
            { _id: payment._id },
            {
              $set: {
                status: 'completed',
                'flutterwaveData.transactionId': payload.data.id,
                'flutterwaveData.webhookData': payload.data,
                sellerType,
                completedAt: new Date()
              }
            }
          );
          
          // Handle subscription or add-on activation
          if (payment.type === 'subscription' || !payment.type) {
            // Activate listing subscription
            const pricing = SUBSCRIPTION_PRICING[sellerType][payment.subscriptionTier];
            const listingsCollection = db.collection('listings');
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + pricing.duration);

            await listingsCollection.updateOne(
              { _id: new ObjectId(payment.listing) },
              {
                $set: {
                  'subscription.tier': payment.subscriptionTier,
                  'subscription.status': 'active',
                  'subscription.expiresAt': expiresAt,
                  'subscription.sellerType': sellerType,
                  'subscription.maxListings': pricing.maxListings,
                  'subscription.planName': pricing.name,
                  status: 'published'
                }
              }
            );
          } else if (payment.type === 'addon') {
            // Activate add-on service
            const listingsCollection = db.collection('listings');
            const addonsArray = payment.addons || [payment.addonId];
            
            await listingsCollection.updateOne(
              { _id: new ObjectId(payment.listing) },
              {
                $addToSet: {
                  'addons.active': {
                    $each: addonsArray.map(addonId => ({
                      id: addonId,
                      purchasedAt: new Date(),
                      paymentId: payment._id,
                      status: 'active'
                    }))
                  }
                }
              }
            );
          }
          
          console.log(`Payment ${payment._id} completed via webhook for ${sellerType} seller`);
        }
      }

      return res.status(200).json({ message: 'Webhook processed successfully' });
    } catch (error) {
      console.error('Webhook processing error:', error);
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  }

  // === ALL OTHER PAYMENT ROUTES REQUIRE AUTHENTICATION ===
  const authResult = await verifyUserToken(req);
  if (!authResult.success) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  // === CHECK SUBSCRIPTION ELIGIBILITY ===
  if (path === '/api/payments/check-eligibility' && req.method === 'POST') {
    try {
      const { listingId } = req.body;

      if (!listingId) {
        return res.status(400).json({
          success: false,
          message: 'Listing ID is required'
        });
      }

      const { ObjectId } = await import('mongodb');
      const listingsCollection = db.collection('listings');
      const listing = await listingsCollection.findOne({
        _id: new ObjectId(listingId),
        $or: [
          { 'dealer.user': new ObjectId(authResult.user.id) },
          { 'seller.user': new ObjectId(authResult.user.id) },
          { dealerId: new ObjectId(authResult.user.id) }
        ]
      });

      if (!listing) {
        return res.status(404).json({
          success: false,
          message: 'Listing not found or access denied'
        });
      }

      const hasActiveSubscription = listing.subscription?.status === 'active' && 
                                   listing.subscription?.expiresAt && 
                                   new Date(listing.subscription.expiresAt) > new Date();

      const sellerType = await getUserSellerType(db, authResult.user.id);

      return res.status(200).json({
        success: true,
        data: {
          eligible: !hasActiveSubscription,
          hasActiveSubscription,
          sellerType,
          currentSubscription: listing.subscription || null,
          availableTiers: {
            basic: { name: 'Basic Plan', price: 50, duration: 30, maxListings: 1 },
            standard: { name: 'Standard Plan', price: 100, duration: 30, maxListings: 1 },
            premium: { name: 'Premium Plan', price: 200, duration: 45, maxListings: 1 }
          },
          availableAddons: {},
          activeAddons: listing.addons?.active || [],
          message: hasActiveSubscription ? 
            'This listing already has an active subscription' :
            'Ready to subscribe or purchase add-ons'
        }
      });

    } catch (error) {
      console.error('Eligibility check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to check subscription eligibility'
      });
    }
  }

  // === INITIATE PAYMENT ===
  if (path === '/api/payments/initiate' && req.method === 'POST') {
    try {
      const { 
        listingId, 
        subscriptionTier, 
        addons = [], 
        addonId, 
        bookingId,
        paymentType, 
        sellerType: requestedSellerType,
        callbackUrl 
      } = req.body;

      if (!listingId) {
        return res.status(400).json({
          success: false,
          message: 'Listing ID is required'
        });
      }

      if (!paymentType || !['subscription', 'addon'].includes(paymentType)) {
        return res.status(400).json({
          success: false,
          message: 'Valid payment type is required (subscription or addon)'
        });
      }

      const userSellerType = requestedSellerType || await getUserSellerType(db, authResult.user.id);
      let totalAmount = 0;
      let paymentDescription = '';
      let paymentMetadata = {};

      if (paymentType === 'subscription') {
        if (!subscriptionTier) {
          return res.status(400).json({
            success: false,
            message: 'Valid subscription tier is required'
          });
        }

        const tierPricing = {
          basic: { name: 'Basic Plan', price: 50, duration: 30, maxListings: 1 },
          standard: { name: 'Standard Plan', price: 100, duration: 30, maxListings: 1 },
          premium: { name: 'Premium Plan', price: 200, duration: 45, maxListings: 1 }
        };

        const tierDetails = tierPricing[subscriptionTier];
        if (!tierDetails) {
          return res.status(400).json({
            success: false,
            message: 'Invalid subscription tier'
          });
        }

        totalAmount = tierDetails.price;
        paymentDescription = `${tierDetails.name} - ${tierDetails.duration} days`;
        paymentMetadata = {
          subscriptionTier,
          tierDetails,
          maxListings: tierDetails.maxListings,
          duration: tierDetails.duration
        };
      } else {
        // Handle add-on payments
        const addonPricing = {
          photography: { name: 'Professional Photography', price: 150 },
          review: { name: 'Professional Car Review', price: 200 },
          featured: { name: 'Featured Listing', price: 50 }
        };

        const addonsToProcess = addons.length > 0 ? addons : [addonId];
        const addonDetails = [];

        for (const id of addonsToProcess) {
          const addon = addonPricing[id];
          if (!addon) {
            return res.status(400).json({
              success: false,
              message: `Invalid add-on ${id}`
            });
          }
          totalAmount += addon.price;
          addonDetails.push(addon);
        }

        paymentDescription = `Add-ons: ${addonDetails.map(a => a.name).join(', ')}`;
        paymentMetadata = {
          addons: addonsToProcess,
          addonDetails,
          bookingId
        };
      }

      // Verify listing exists and belongs to user
      const { ObjectId } = await import('mongodb');
      const listingsCollection = db.collection('listings');
      const listing = await listingsCollection.findOne({
        _id: new ObjectId(listingId),
        $or: [
          { 'dealer.user': new ObjectId(authResult.user.id) },
          { 'seller.user': new ObjectId(authResult.user.id) },
          { dealerId: new ObjectId(authResult.user.id) }
        ]
      });

      if (!listing) {
        return res.status(404).json({
          success: false,
          message: 'Listing not found or access denied'
        });
      }

      const txRef = `${paymentType}_${listingId}_${Date.now()}`;
      
      // Create payment record
      const paymentsCollection = db.collection('payments');
      const paymentData = {
        user: new ObjectId(authResult.user.id),
        listing: new ObjectId(listingId),
        transactionRef: txRef,
        amount: totalAmount,
        currency: 'BWP',
        type: paymentType,
        sellerType: userSellerType,
        status: 'pending',
        paymentMethod: 'flutterwave',
        metadata: {
          ...paymentMetadata,
          callbackUrl: callbackUrl || `${process.env.CLIENT_URL}/profile?tab=vehicles`
        },
        createdAt: new Date()
      };

      if (paymentType === 'subscription') {
        paymentData.subscriptionTier = subscriptionTier;
      } else {
        paymentData.addons = addonsToProcess;
        if (bookingId) {
          paymentData.bookingId = new ObjectId(bookingId);
        }
      }

      const payment = await paymentsCollection.insertOne(paymentData);

      // For demo purposes, return success (in production, integrate with Flutterwave)
      console.log(`[${timestamp}] ✅ Payment initiated: ${paymentType} - ${totalAmount} BWP`);

      return res.status(200).json({
        success: true,
        data: {
          paymentLink: `${process.env.CLIENT_URL}/payment-demo?ref=${txRef}`,
          transactionRef: txRef,
          amount: totalAmount,
          sellerType: userSellerType,
          paymentType,
          description: paymentDescription,
          bookingId,
          message: paymentType === 'subscription' ? 
            'This subscription allows you to list 1 car. You can subscribe again for additional cars.' :
            'Add-on services will be activated after payment confirmation.'
        }
      });

    } catch (error) {
      console.error('Payment initiation error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to initiate payment'
      });
    }
  }

  // === VERIFY PAYMENT ===
  if (path === '/api/payments/verify' && req.method === 'POST') {
    try {
      const { transaction_id, tx_ref } = req.body;

      if (!transaction_id && !tx_ref) {
        return res.status(400).json({
          success: false,
          message: 'Transaction ID or reference is required'
        });
      }

      const paymentsCollection = db.collection('payments');
      const payment = await paymentsCollection.findOne({ 
        transactionRef: tx_ref || transaction_id 
      });

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: 'Payment record not found'
        });
      }

      // Update payment status
      await paymentsCollection.updateOne(
        { _id: payment._id },
        { 
          $set: { 
            status: 'completed',
            completedAt: new Date()
          }
        }
      );

      return res.status(200).json({
        success: true,
        message: 'Payment verified successfully',
        data: {
          transactionId: transaction_id,
          listingId: payment.listing,
          subscriptionTier: payment.subscriptionTier
        }
      });
    } catch (error) {
      console.error('Payment verification error:', error);
      return res.status(500).json({
        success: false,
        message: 'Payment verification failed'
      });
    }
  }

  // === GET PAYMENT HISTORY ===
  if (path === '/api/payments/history' && req.method === 'GET') {
    try {
      const paymentsCollection = db.collection('payments');
      const payments = await paymentsCollection.find({ 
        user: new ObjectId(authResult.user.id) 
      }).sort({ createdAt: -1 }).toArray();

      return res.status(200).json({
        success: true,
        data: payments
      });
    } catch (error) {
      console.error('Payment history error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch payment history'
      });
    }
  }

  // === PAYMENT ENDPOINT NOT FOUND ===
  return res.status(404).json({
    success: false,
    message: `Payment endpoint not found: ${path}`
  });
}

// ==================== ADDITIONAL STANDALONE ENDPOINTS ====================
// These handle other normalized paths that don't fit in conditional blocks

// Simple available tiers endpoint (alternative path)
if (path === '/api/payments/available-tiers' && req.method === 'GET') {
  console.log(`[${timestamp}] ✅ HIT: /api/payments/available-tiers (full path)`);
  
  return res.status(200).json({
    success: true,
    data: {
      sellerType: 'private',
      tiers: {
        basic: { name: 'Basic Plan', price: 50, duration: 30, maxListings: 1 },
        standard: { name: 'Standard Plan', price: 100, duration: 30, maxListings: 1 },
        premium: { name: 'Premium Plan', price: 200, duration: 45, maxListings: 1 }
      },
      allowMultipleSubscriptions: true,
      description: 'Each subscription allows 1 car listing.',
      source: 'standalone-endpoint'
    }
  });
}

// Simple available addons endpoint (alternative path)
if (path === '/api/addons/available' && req.method === 'GET') {
  console.log(`[${timestamp}] ✅ HIT: /api/addons/available (full path)`);
  
  return res.status(200).json({
    success: true,
    data: {
      sellerType: 'private',
      addons: {
        photography: { name: 'Professional Photography', price: 150 },
        review: { name: 'Professional Car Review', price: 200 },
        featured: { name: 'Featured Listing', price: 50 }
      },
      whatsappNumber: '+26774122453',
      source: 'standalone-endpoint'
    }
  });
}

// ==================== IMPLEMENTATION INSTRUCTIONS ====================

/*
STEP 1: Locate your main api/index.js file

STEP 2: Find your handler function structure:
```javascript
export default async function handler(req, res) {
  // ... setup code ...
  const path = url.pathname;
  
  // INSERT THE COMPLETE CODE ABOVE HERE
  
  // ... your existing conditional blocks ...
}
```

STEP 3: Place this complete code section AFTER path setup but BEFORE existing blocks

STEP 4: Remove any duplicate endpoint definitions from elsewhere in your file

STEP 5: Deploy and test - you should see these debug logs:
- ✅ HIT: /payments/available-tiers (normalized path)
- ✅ HIT: /addons/available (normalized path)

STEP 6: Verify the profile page loads without 404 errors
*/



// ===== 5. ADD NEW ENDPOINTS AFTER YOUR EXISTING PAYMENT ROUTES =====
// Add these new endpoints after your existing payment section:






// Get available subscription tiers and add-ons for user's seller type
if (path === '/api/payments/available-tiers' && req.method === 'GET') {
  try {
    const authResult = await verifyToken(req, res);
    if (!authResult.success) return;

    const sellerType = await getUserSellerType(db, authResult.userId);
    const availableTiers = SUBSCRIPTION_PRICING[sellerType];
    const availableAddons = ADDON_PRICING[sellerType] || {};
    
    console.log(`[${timestamp}] ✅ Available tiers for ${sellerType} seller`);
    
    return res.status(200).json({
      success: true,
      data: {
        sellerType,
        tiers: availableTiers,
        addons: availableAddons,
        allowMultipleSubscriptions: sellerType === 'private',
        description: sellerType === 'private' ? 
          'Each subscription allows 1 car listing. You can subscribe multiple times for additional cars.' :
          sellerType === 'rental' ?
          'Manage your rental car fleet with booking calendar and availability tracking.' :
          'Choose a plan that fits your dealership size and needs.'
      }
    });
  } catch (error) {
    console.error('Error getting available tiers:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get available tiers'
    });
  }
}

// Check subscription eligibility for a specific listing
if (path === '/api/payments/check-eligibility' && req.method === 'POST') {
  try {
    const { listingId } = req.body;

    if (!listingId) {
      return res.status(400).json({
        success: false,
        message: 'Listing ID is required'
      });
    }

    // Check if listing exists and belongs to user
    const listingsCollection = db.collection('listings');
    const listing = await listingsCollection.findOne({
      _id: new ObjectId(listingId),
      $or: [
        { 'dealer.user': new ObjectId(authResult.userId) },
        { 'seller.user': new ObjectId(authResult.userId) },
        { dealerId: new ObjectId(authResult.userId) }
      ]
    });

    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found or access denied'
      });
    }

    // Check current subscription status
    const hasActiveSubscription = listing.subscription?.status === 'active' && 
                                 listing.subscription?.expiresAt && 
                                 new Date(listing.subscription.expiresAt) > new Date();

    const sellerType = await getUserSellerType(db, authResult.userId);

    return res.status(200).json({
      success: true,
      data: {
        eligible: !hasActiveSubscription,
        hasActiveSubscription,
        sellerType,
        currentSubscription: listing.subscription || null,
        availableTiers: SUBSCRIPTION_PRICING[sellerType],
        availableAddons: ADDON_PRICING[sellerType] || {},
        activeAddons: listing.addons?.active || [],
        message: hasActiveSubscription ? 
          'This listing already has an active subscription' :
          'Ready to subscribe or purchase add-ons'
      }
    });

  } catch (error) {
    console.error('Eligibility check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check subscription eligibility'
    });
  }
}

/// ===== NEW ADDONS SECTION (ADD AFTER PAYMENTS) =====
    if (path.startsWith('/api/addons')) {
      console.log(`[${timestamp}] → ADDONS: ${path}`);
      
      const authResult = await verifyToken(req, res);
      if (!authResult.success) return;

      // Get available add-ons for user's seller type
      if (path === '/api/addons/available' && req.method === 'GET') {
        try {
          const sellerType = await getUserSellerType(db, authResult.userId);
          const availableAddons = ADDON_PRICING[sellerType] || {};
          
          console.log(`[${timestamp}] ✅ Available addons for ${sellerType} seller`);
          
          return res.status(200).json({
            success: true,
            data: {
              sellerType,
              addons: availableAddons,
              whatsappNumber: '+26774122453'
            }
          });
        } catch (error) {
          console.error('Error getting available add-ons:', error);
          return res.status(500).json({
            success: false,
            message: 'Failed to get available add-ons'
          });
        }
      }

      // Book add-on service
      if (path === '/api/addons/book' && req.method === 'POST') {
        try {
          const { listingId, addonId, bookingDetails } = req.body;

          if (!listingId || !addonId) {
            return res.status(400).json({
              success: false,
              message: 'Listing ID and addon ID are required'
            });
          }

          const sellerType = await getUserSellerType(db, authResult.userId);
          const addon = ADDON_PRICING[sellerType]?.[addonId];

          if (!addon) {
            return res.status(400).json({
              success: false,
              message: 'Invalid add-on for your seller type'
            });
          }

          if (addon.requiresBooking && !bookingDetails) {
            return res.status(400).json({
              success: false,
              message: 'This add-on requires booking details',
              requiresBooking: true,
              addon: {
                name: addon.name,
                description: addon.description,
                duration: addon.duration,
                price: addon.price
              }
            });
          }

          const { ObjectId } = await import('mongodb');
          const bookingsCollection = db.collection('addon_bookings');
          const booking = await bookingsCollection.insertOne({
            user: new ObjectId(authResult.userId),
            listing: new ObjectId(listingId),
            addonId,
            addonDetails: addon,
            bookingDetails: bookingDetails || {},
            status: 'pending',
            createdAt: new Date()
          });

          console.log(`[${timestamp}] ✅ Add-on booking created: ${addonId} for listing ${listingId}`);

          return res.status(200).json({
            success: true,
            data: {
              bookingId: booking.insertedId,
              addon,
              message: addon.requiresBooking ? 
                'Booking request submitted. We will contact you within 24 hours to schedule.' :
                'Add-on will be activated after payment.',
              nextStep: 'payment'
            }
          });

        } catch (error) {
          console.error('Add-on booking error:', error);
          return res.status(500).json({
            success: false,
            message: 'Failed to create add-on booking'
          });
        }
      }

      // Get user's active add-ons
      if (path === '/api/addons/my-addons' && req.method === 'GET') {
        try {
          const { ObjectId } = await import('mongodb');
          const listingsCollection = db.collection('listings');
          const userListings = await listingsCollection.find({
            $or: [
              { 'dealer.user': new ObjectId(authResult.userId) },
              { 'seller.user': new ObjectId(authResult.userId) },
              { dealerId: new ObjectId(authResult.userId) }
            ],
            'addons.active': { $exists: true, $ne: [] }
          }).toArray();

          const activeAddons = [];
          userListings.forEach(listing => {
            if (listing.addons?.active) {
              listing.addons.active.forEach(addon => {
                activeAddons.push({
                  ...addon,
                  listingId: listing._id,
                  listingTitle: listing.title
                });
              });
            }
          });

          return res.status(200).json({
            success: true,
            data: {
              activeAddons,
              totalActive: activeAddons.length
            }
          });
        } catch (error) {
          console.error('Error getting user add-ons:', error);
          return res.status(500).json({
            success: false,
            message: 'Failed to get your add-ons'
          });
        }
      }
    }


// ===== 7. ADD WHATSAPP BOOKING ENDPOINTS =====
// Add these after your add-on endpoints:

if (path.startsWith('/api/whatsapp')) {
  console.log(`[${timestamp}] → WHATSAPP: ${path}`);
  
  // Generate WhatsApp booking link
  if (path === '/api/whatsapp/booking-link' && req.method === 'POST') {
    try {
      const { serviceType, addonId, listingId, customMessage } = req.body;
      
      const whatsappNumber = '+26774122453'; // Replace with actual number
      let message = customMessage || 'Hi! I would like to book a service for my car listing.';
      
      if (serviceType === 'photography') {
        message = 'Hi! I would like to book a photography session for my car listing. Please provide details about scheduling and trip expenses.';
      } else if (serviceType === 'review') {
        message = 'Hi! I would like to book a professional car review session. Please provide details about scheduling and trip expenses.';
      }
      
      const whatsappLink = `https://wa.me/${whatsappNumber.replace('+', '')}?text=${encodeURIComponent(message)}`;
      
      return res.status(200).json({
        success: true,
        data: {
          whatsappLink,
          phoneNumber: whatsappNumber,
          message
        }
      });
    } catch (error) {
      console.error('WhatsApp link generation error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate WhatsApp link'
      });
    }
  }
}

// 1. Available tiers endpoint (add after your existing payment routes)
if (path === '/api/payments/available-tiers' && req.method === 'GET') {
  try {
    // Simple response for now
    return res.status(200).json({
      success: true,
      data: {
        sellerType: 'private',
        tiers: {
          basic: { price: 50, duration: 30, maxListings: 1, name: 'Individual Basic' },
          standard: { price: 100, duration: 30, maxListings: 1, name: 'Individual Plus' },
          premium: { price: 200, duration: 45, maxListings: 1, name: 'Individual Pro' }
        },
        addons: {},
        allowMultipleSubscriptions: true,
        description: 'Each subscription allows 1 car listing. You can subscribe multiple times for additional cars.'
      }
    });
  } catch (error) {
    console.error('Error getting available tiers:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get available tiers'
    });
  }
}

// 3. My listings endpoint (if not exists)
if (path === '/api/listings/my-listings' && req.method === 'GET') {
  try {
    const db = await connectToDatabase();
    const listingsCollection = db.collection('listings');
    
    // Get user's listings
    const listings = await listingsCollection.find({
      $or: [
        { 'dealer.user': new ObjectId(authResult.userId) },
        { 'seller.user': new ObjectId(authResult.userId) },
        { dealerId: new ObjectId(authResult.userId) }
      ]
    }).toArray();

    return res.status(200).json({
      success: true,
      data: listings
    });
  } catch (error) {
    console.error('Error getting user listings:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get your listings'
    });
  }
}

// Analytics endpoint
if (path === '/api/payments/analytics' && req.method === 'GET') {
  try {
    const authResult = await verifyToken(req, res);
    if (!authResult.success) return;

    console.log(`[${timestamp}] ✅ Payment analytics retrieved`);
    
    return res.status(200).json({
      success: true,
      data: {
        subscriptions: [],
        payments: [],
        activeAddons: [],
        stats: {
          sellerType: 'private',
          currentLimits: {
            basic: { price: 50, duration: 30, maxListings: 1 },
            standard: { price: 100, duration: 30, maxListings: 1 },
            premium: { price: 200, duration: 45, maxListings: 1 }
          },
          total: 0,
          totalSpent: 0,
          byTier: { basic: 0, standard: 0, premium: 0 },
          canSubscribeMore: true,
          subscriptionModel: '1 car per subscription - subscribe multiple times for more cars'
        }
      }
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get analytics'
    });
  }
}

// 5. Check eligibility endpoint
if (path === '/api/payments/check-eligibility' && req.method === 'POST') {
  try {
    const { listingId } = req.body;

    if (!listingId) {
      return res.status(400).json({
        success: false,
        message: 'Listing ID is required'
      });
    }

    // Simple eligibility check
    return res.status(200).json({
      success: true,
      data: {
        eligible: true,
        hasActiveSubscription: false,
        sellerType: 'private',
        currentSubscription: null,
        availableTiers: {
          basic: { price: 50, duration: 30, maxListings: 1, name: 'Individual Basic' },
          standard: { price: 100, duration: 30, maxListings: 1, name: 'Individual Plus' },
          premium: { price: 200, duration: 45, maxListings: 1, name: 'Individual Pro' }
        },
        availableAddons: {},
        activeAddons: [],
        message: 'Ready to subscribe or purchase add-ons'
      }
    });

  } catch (error) {
    console.error('Eligibility check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check subscription eligibility'
    });
  }
}


// Get user's listings
if (path === '/api/listings/my-listings' && req.method === 'GET') {
  try {
    const authResult = await verifyToken(req, res);
    if (!authResult.success) return;

    const { ObjectId } = await import('mongodb');
    const listingsCollection = db.collection('listings');
    const listings = await listingsCollection.find({
      $or: [
        { 'dealer.user': new ObjectId(authResult.userId) },
        { 'seller.user': new ObjectId(authResult.userId) },
        { dealerId: new ObjectId(authResult.userId) }
      ]
    }).sort({ createdAt: -1 }).toArray();

    console.log(`[${timestamp}] ✅ Found ${listings.length} user listings`);

    return res.status(200).json({
      success: true,
      data: listings
    });
  } catch (error) {
    console.error('Error getting user listings:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get your listings'
    });
  }
}

// ===== USER VEHICLES ENDPOINTS =====

// Get user's vehicles
if (path === '/user/vehicles' && req.method === 'GET') {
  try {
    const authResult = await verifyToken(req, res);
    if (!authResult.success) return;

    const { ObjectId } = await import('mongodb');
    const vehiclesCollection = db.collection('vehicles');
    const vehicles = await vehiclesCollection.find({ 
      ownerId: new ObjectId(authResult.userId),
      isDeleted: { $ne: true }
    }).sort({ createdAt: -1 }).toArray();

    console.log(`[${timestamp}] ✅ Found ${vehicles.length} user vehicles`);

    return res.status(200).json({
      success: true,
      count: vehicles.length,
      data: vehicles || []
    });
  } catch (error) {
    console.error('Error getting user vehicles:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get vehicles'
    });
  }
}

// Add new vehicle
if (path === '/user/vehicles' && req.method === 'POST') {
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
        message: 'Invalid request body'
      });
    }

    // Validate required fields
    if (!body.make || !body.model || !body.year) {
      return res.status(400).json({
        success: false,
        message: 'Make, model, and year are required'
      });
    }

    const { ObjectId } = await import('mongodb');
    const vehiclesCollection = db.collection('vehicles');
    
    const newVehicle = {
      ownerId: new ObjectId(authResult.userId),
      make: body.make.trim(),
      model: body.model.trim(),
      year: parseInt(body.year),
      color: body.color?.trim(),
      bodyType: body.bodyType,
      fuelType: body.fuelType,
      transmission: body.transmission,
      vin: body.vin?.trim().toUpperCase(),
      licensePlate: body.licensePlate?.trim().toUpperCase(),
      condition: body.condition || 'good',
      mileage: body.mileage ? parseInt(body.mileage) : undefined,
      forSale: body.forSale || false,
      askingPrice: body.forSale && body.askingPrice ? parseFloat(body.askingPrice) : undefined,
      isActive: true,
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await vehiclesCollection.insertOne(newVehicle);
    const insertedVehicle = await vehiclesCollection.findOne({ _id: result.insertedId });

    console.log(`[${timestamp}] ✅ Vehicle added: ${body.make} ${body.model}`);

    return res.status(201).json({
      success: true,
      message: 'Vehicle added successfully',
      data: insertedVehicle
    });
  } catch (error) {
    console.error('Error adding vehicle:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add vehicle'
    });
  }
}

// ===== WHATSAPP ENDPOINTS =====

// Generate WhatsApp booking link
if (path === '/api/whatsapp/booking-link' && req.method === 'POST') {
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
        message: 'Invalid request body'
      });
    }

    const { serviceType, addonId, listingId, customMessage } = body;
    
    const whatsappNumber = '+26774122453'; // Replace with actual number
    let message = customMessage || 'Hi! I would like to book a service for my car listing.';
    
    if (serviceType === 'photography') {
      message = 'Hi! I would like to book a photography session for my car listing. Please provide details about scheduling and trip expenses.';
    } else if (serviceType === 'review') {
      message = 'Hi! I would like to book a professional car review session. Please provide details about scheduling and trip expenses.';
    }
    
    const whatsappLink = `https://wa.me/${whatsappNumber.replace('+', '')}?text=${encodeURIComponent(message)}`;
    
    console.log(`[${timestamp}] ✅ WhatsApp link generated for ${serviceType || 'general'} service`);
    
    return res.status(200).json({
      success: true,
      data: {
        whatsappLink,
        phoneNumber: whatsappNumber,
        message
      }
    });
  } catch (error) {
    console.error('WhatsApp link generation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to generate WhatsApp link'
    });
  }
}


















// ===== ADD THESE VALUATION ENDPOINTS =====
// Add this section after the payments section

if (path.startsWith('/api/valuations')) {
  console.log(`[${timestamp}] → VALUATIONS: ${path}`);
  
  // All valuation routes require authentication
  const authResult = await verifyToken(req, res);
  if (!authResult.success) return;

  // Create valuation request
  if (path === '/api/valuations' && req.method === 'POST') {
    try {
      const { make, model, year, mileage, condition, additionalInfo } = req.body;

      if (!make || !model || !year) {
        return res.status(400).json({
          success: false,
          message: 'Make, model, and year are required'
        });
      }

      const valuationsCollection = db.collection('valuations');
      const valuation = await valuationsCollection.insertOne({
        user: new ObjectId(authResult.userId),
        vehicleInfo: {
          make: make.trim(),
          model: model.trim(),
          year: parseInt(year),
          mileage: mileage ? parseInt(mileage) : null,
          condition: condition
        },
        additionalInfo: additionalInfo?.trim(),
        status: 'pending',
        requestedAt: new Date(),
        createdAt: new Date()
      });

      return res.status(201).json({
        success: true,
        message: 'Valuation request submitted successfully. You will receive an estimate within 24 hours.',
        data: { 
          id: valuation.insertedId,
          status: 'pending'
        }
      });
    } catch (error) {
      console.error('Valuation creation error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to submit valuation request'
      });
    }
  }

  // Get user's valuations
  if (path === '/api/valuations/my-valuations' && req.method === 'GET') {
    try {
      const valuationsCollection = db.collection('valuations');
      const valuations = await valuationsCollection.find({ 
        user: new ObjectId(authResult.userId) 
      }).sort({ createdAt: -1 }).toArray();

      return res.status(200).json({
        success: true,
        data: valuations
      });
    } catch (error) {
      console.error('Valuations fetch error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch valuations'
      });
    }
  }
}

// ===== ADD THESE LISTING ENDPOINTS UPDATES =====
// Add these to your existing listings section

// Add this to your existing /api/listings section:

// Get user's own listings
if (path === '/api/listings/my-listings' && req.method === 'GET') {
  try {
    const authResult = await verifyToken(req, res);
    if (!authResult.success) return;

    const listingsCollection = db.collection('listings');
    const listings = await listingsCollection.find({ 
      'dealer.user': new ObjectId(authResult.userId) 
    }).sort({ createdAt: -1 }).toArray();

    return res.status(200).json({
      success: true,
      data: listings
    });
  } catch (error) {
    console.error('My listings fetch error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch your listings'
    });
  }
}

// Get user listing stats
if (path === '/api/listings/user/stats' && req.method === 'GET') {
  try {
    const authResult = await verifyToken(req, res);
    if (!authResult.success) return;

    const listingsCollection = db.collection('listings');
    const stats = await listingsCollection.aggregate([
      { $match: { 'dealer.user': new ObjectId(authResult.userId) } },
      {
        $group: {
          _id: null,
          totalListings: { $sum: 1 },
          activeListings: { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } },
          totalViews: { $sum: '$analytics.views' },
          totalInquiries: { $sum: '$analytics.inquiries' }
        }
      }
    ]).toArray();

    return res.status(200).json({
      success: true,
      data: stats[0] || {
        totalListings: 0,
        activeListings: 0,
        totalViews: 0,
        totalInquiries: 0
      }
    });
  } catch (error) {
    console.error('Listing stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch listing statistics'
    });
  }
}












 // === REVIEW SYSTEM ROUTES ===
    // === REVIEW SYSTEM ROUTES ===
    // === REVIEW SYSTEM ROUTES ===
    // === REVIEW SYSTEM ROUTES ===

// === REVIEW ENDPOINTS ===
if (path.includes('/reviews')) {
  console.log(`[${timestamp}] → REVIEWS: ${path}`);

  // GET DEALER REVIEWS - FIXED to look for reviews.given
  if (path.match(/^\/reviews\/dealer\/([a-f\d]{24})$/) && req.method === 'GET') {
  const dealerId = path.split('/')[3];
  console.log(`[${timestamp}] → GET DEALER REVIEWS: ${dealerId}`);
  
  try {
    const { ObjectId } = await import('mongodb');
    const dealersCollection = db.collection('dealers');
    const usersCollection = db.collection('users');
    
    // First, verify the dealer exists
    let dealer = null;
    try {
      dealer = await dealersCollection.findOne({ _id: dealerId });
      if (!dealer && dealerId.length === 24 && /^[0-9a-fA-F]{24}$/.test(dealerId)) {
        dealer = await dealersCollection.findOne({ _id: new ObjectId(dealerId) });
      }
    } catch (lookupError) {
      console.log(`[${timestamp}] Dealer lookup error:`, lookupError.message);
    }

    if (!dealer) {
      console.log(`[${timestamp}] ❌ Dealer not found:`, dealerId);
      return res.status(404).json({
        success: false,
        message: 'Dealer not found'
      });
    }

    console.log(`[${timestamp}] ✅ Dealer found:`, dealer.businessName);

    // FIXED: Look for reviews GIVEN about this dealer - USE OBJECTID
    let reviews = [];
    let stats = {
      totalReviews: 0,
      averageRating: 0,
      ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    };

    console.log(`[${timestamp}] 🔍 Looking for reviews given about dealer: ${dealerId}`);

    try {
      // CRITICAL FIX: Convert dealerId to ObjectId for the query
      const usersWithReviews = await usersCollection.find({
        'reviews.given': { 
          $elemMatch: { 
            businessId: new ObjectId(dealerId)  // ← FIXED: Use ObjectId, not string
          } 
        }
      }).toArray();

      console.log(`[${timestamp}] 📋 Found ${usersWithReviews.length} users who reviewed this dealer`);

      // Extract reviews about this dealer from all users
      usersWithReviews.forEach(user => {
        if (user.reviews?.given) {
          const reviewsAboutThisDealer = user.reviews.given.filter(review => {
            // Handle both ObjectId and string comparison
            const reviewBusinessId = review.businessId?.toString() || review.businessId;
            return reviewBusinessId === dealerId;
          });
          
          // Add reviewer info to each review
          reviewsAboutThisDealer.forEach(review => {
            reviews.push({
              ...review,
              _id: review._id || `${user._id}_${review.businessId}_${review.date}`,
              fromUserId: {
                _id: user._id,
                name: user.name,
                avatar: user.avatar
              },
              reviewer: {
                name: user.name,
                avatar: user.avatar
              }
            });
          });
        }
      });

      // Sort reviews by date (newest first)
      reviews.sort((a, b) => new Date(b.date) - new Date(a.date));

      // Calculate stats
      if (reviews.length > 0) {
        stats.totalReviews = reviews.length;
        stats.averageRating = reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length;
        
        // Rating distribution
        reviews.forEach(review => {
          if (review.rating >= 1 && review.rating <= 5) {
            stats.ratingDistribution[review.rating]++;
          }
        });
      }

      console.log(`[${timestamp}] ✅ Found ${reviews.length} reviews about this dealer`);
      console.log(`[${timestamp}] ✅ Average rating: ${stats.averageRating.toFixed(1)}`);
      
      // Log sample review for debugging
      if (reviews.length > 0) {
        console.log(`[${timestamp}] 📝 Sample review:`, {
          rating: reviews[0].rating,
          review: reviews[0].review?.substring(0, 50) + '...',
          reviewer: reviews[0].fromUserId?.name
        });
      }

    } catch (reviewError) {
      console.log(`[${timestamp}] ❌ Error finding reviews:`, reviewError.message);
    }

    return res.status(200).json({
      success: true,
      data: {
        reviews: reviews,
        stats: stats
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] Get dealer reviews error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch dealer reviews'
    });
  }
}

if ((path === '/reviews/simple-test' || path === '/api/reviews/simple-test') && req.method === 'GET') {
  console.log(`[${timestamp}] 🔍 SIMPLE REVIEW TEST`);
  
  try {
    const usersCollection = db.collection('users');
    const dealerId = '6833420039f186e3a47ee1b3';
    
    console.log(`[${timestamp}] Testing for dealer ID: ${dealerId}`);
    
    // Test 1: Find ANY users with reviews.given
    const usersWithGivenReviews = await usersCollection.find({
      'reviews.given': { $exists: true, $ne: [] }
    }).limit(5).toArray();
    
    console.log(`[${timestamp}] Found ${usersWithGivenReviews.length} users with reviews.given`);
    
    // Test 2: Check the first user's review structure
    let sampleReviewStructure = null;
    if (usersWithGivenReviews.length > 0) {
      const firstUser = usersWithGivenReviews[0];
      sampleReviewStructure = {
        userId: firstUser._id,
        userName: firstUser.name,
        reviewsGivenCount: firstUser.reviews?.given?.length || 0,
        firstReview: firstUser.reviews?.given?.[0] || null
      };
      console.log(`[${timestamp}] Sample review structure:`, sampleReviewStructure);
    }
    
    // Test 3: Try to find reviews for our specific dealer (multiple approaches)
    const tests = [];
    
    // Test 3a: Exact string match
    try {
      const exactMatch = await usersCollection.find({
        'reviews.given.businessId': dealerId
      }).toArray();
      tests.push({
        method: 'exact_string_match',
        query: { 'reviews.given.businessId': dealerId },
        results: exactMatch.length,
        userIds: exactMatch.map(u => u._id)
      });
    } catch (error) {
      tests.push({ method: 'exact_string_match', error: error.message });
    }
    
    // Test 3b: Using $elemMatch with string
    try {
      const elemMatch = await usersCollection.find({
        'reviews.given': { $elemMatch: { businessId: dealerId } }
      }).toArray();
      tests.push({
        method: 'elem_match_string',
        query: { 'reviews.given': { $elemMatch: { businessId: dealerId } } },
        results: elemMatch.length,
        userIds: elemMatch.map(u => u._id)
      });
    } catch (error) {
      tests.push({ method: 'elem_match_string', error: error.message });
    }
    
    // Test 3c: Using ObjectId
    try {
      const { ObjectId } = await import('mongodb');
      const objectIdMatch = await usersCollection.find({
        'reviews.given': { $elemMatch: { businessId: new ObjectId(dealerId) } }
      }).toArray();
      tests.push({
        method: 'elem_match_objectid',
        query: { 'reviews.given': { $elemMatch: { businessId: 'ObjectId(' + dealerId + ')' } } },
        results: objectIdMatch.length,
        userIds: objectIdMatch.map(u => u._id)
      });
    } catch (error) {
      tests.push({ method: 'elem_match_objectid', error: error.message });
    }
    
    // Test 4: Look at ALL reviews to see the businessId format
    let allBusinessIds = [];
    if (usersWithGivenReviews.length > 0) {
      usersWithGivenReviews.forEach(user => {
        if (user.reviews?.given) {
          user.reviews.given.forEach(review => {
            if (review.businessId) {
              allBusinessIds.push({
                businessId: review.businessId,
                businessIdType: typeof review.businessId,
                isObjectId: review.businessId.toString ? review.businessId.toString() : 'no toString',
                userId: user._id
              });
            }
          });
        }
      });
    }
    
    return res.status(200).json({
      success: true,
      message: 'Simple review test complete',
      data: {
        targetDealerId: dealerId,
        totalUsersWithGivenReviews: usersWithGivenReviews.length,
        sampleReviewStructure: sampleReviewStructure,
        queryTests: tests,
        allBusinessIds: allBusinessIds.slice(0, 10), // First 10 for inspection
        summary: {
          foundReviewsForTargetDealer: tests.some(t => t.results > 0),
          businessIdFormats: [...new Set(allBusinessIds.map(b => b.businessIdType))],
          totalReviewsInDatabase: allBusinessIds.length
        }
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] Simple test error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Simple test failed',
      error: error.message
    });
  }
}

  // GET SERVICE REVIEWS - FIXED to look for reviews.given
  // FIXED: GET SERVICE REVIEWS - Same fix for service providers
if (path.match(/^\/reviews\/service\/([a-f\d]{24})$/) && req.method === 'GET') {
  const serviceId = path.split('/')[3];
  console.log(`[${timestamp}] → GET SERVICE REVIEWS: ${serviceId}`);
  
  try {
    const { ObjectId } = await import('mongodb');
    const usersCollection = db.collection('users');
    
    // FIXED: Look for reviews GIVEN about this service - USE OBJECTID
    let reviews = [];
    let stats = {
      totalReviews: 0,
      averageRating: 0,
      ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    };

    try {
      // CRITICAL FIX: Convert serviceId to ObjectId for the query
      const usersWithReviews = await usersCollection.find({
        'reviews.given': { 
          $elemMatch: { 
            businessId: new ObjectId(serviceId)  // ← FIXED: Use ObjectId, not string
          } 
        }
      }).toArray();

      console.log(`[${timestamp}] 📋 Found ${usersWithReviews.length} users who reviewed this service provider`);

      // Extract reviews about this service provider from all users
      usersWithReviews.forEach(user => {
        if (user.reviews?.given) {
          const reviewsAboutThisProvider = user.reviews.given.filter(review => {
            // Handle both ObjectId and string comparison
            const reviewBusinessId = review.businessId?.toString() || review.businessId;
            return reviewBusinessId === serviceId;
          });
          
          // Add reviewer info to each review
          reviewsAboutThisProvider.forEach(review => {
            reviews.push({
              ...review,
              _id: review._id || `${user._id}_${review.businessId}_${review.date}`,
              fromUserId: {
                _id: user._id,
                name: user.name,
                avatar: user.avatar
              },
              reviewer: {
                name: user.name,
                avatar: user.avatar
              }
            });
          });
        }
      });

      // Sort reviews by date (newest first)
      reviews.sort((a, b) => new Date(b.date) - new Date(a.date));

      // Calculate stats
      if (reviews.length > 0) {
        stats.totalReviews = reviews.length;
        stats.averageRating = reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length;
        
        // Rating distribution
        reviews.forEach(review => {
          if (review.rating >= 1 && review.rating <= 5) {
            stats.ratingDistribution[review.rating]++;
          }
        });
      }

      console.log(`[${timestamp}] ✅ Found ${reviews.length} reviews about this service provider`);

    } catch (reviewError) {
      console.log(`[${timestamp}] ❌ Error finding reviews:`, reviewError.message);
    }

    return res.status(200).json({
      success: true,
      data: {
        reviews: reviews,
        stats: stats
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] Get service reviews error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch service reviews'
    });
  }
}

// FIXED: Handle both /reviews/test and /api/reviews/test
if ((path === '/reviews/test' || path === '/api/reviews/test') && req.method === 'GET') {
  console.log(`[${timestamp}] ✅ TEST ENDPOINT HIT!`);
  return res.status(200).json({
    success: true,
    message: 'Review test endpoint working!',
    path: path,
    method: req.method,
    timestamp: timestamp
  });
}

// TEST ENDPOINT: Check if business can be found via review endpoints
if ((path === '/reviews/test-business' || path === '/api/reviews/test-business') && req.method === 'GET') {
  console.log(`[${timestamp}] ✅ TEST BUSINESS LOOKUP - PATH MATCHED!`);
  
  try {
    const businessId = searchParams.get('businessId');
    
    if (!businessId) {
      return res.status(400).json({
        success: false,
        message: 'businessId parameter required'
      });
    }

    console.log(`[${timestamp}] Testing business lookup for ID:`, businessId);

    // Use EXACT same pattern as dealer endpoint
    const { ObjectId } = await import('mongodb');
    const dealersCollection = db.collection('dealers');
    const usersCollection = db.collection('users');
    
    let businessRecord = null;
    let lookupMethod = null;
    
    // STEP 1: Test database connectivity
    console.log(`[${timestamp}] 🔍 Testing database connectivity...`);
    console.log(`[${timestamp}] - db object exists:`, !!db);
    console.log(`[${timestamp}] - dealersCollection exists:`, !!dealersCollection);
    
    try {
      const totalDealers = await dealersCollection.countDocuments({});
      console.log(`[${timestamp}] - Total dealers in database:`, totalDealers);
    } catch (countError) {
      console.log(`[${timestamp}] - Error counting dealers:`, countError.message);
    }

    // STEP 2: Try string lookup (same as working dealer endpoint)
    console.log(`[${timestamp}] 🔍 STEP 2: Trying string lookup...`);
    try {
      businessRecord = await dealersCollection.findOne({ _id: businessId });
      if (businessRecord) {
        lookupMethod = 'string_lookup';
        console.log(`[${timestamp}] ✅ Found with string lookup!`);
      } else {
        console.log(`[${timestamp}] ❌ String lookup failed`);
      }
    } catch (stringError) {
      console.log(`[${timestamp}] ❌ String lookup error:`, stringError.message);
    }

    // STEP 3: Try ObjectId lookup
    if (!businessRecord && businessId.length === 24 && /^[0-9a-fA-F]{24}$/.test(businessId)) {
      console.log(`[${timestamp}] 🔍 STEP 3: Trying ObjectId lookup...`);
      try {
        businessRecord = await dealersCollection.findOne({ _id: new ObjectId(businessId) });
        if (businessRecord) {
          lookupMethod = 'objectid_lookup';
          console.log(`[${timestamp}] ✅ Found with ObjectId lookup!`);
        } else {
          console.log(`[${timestamp}] ❌ ObjectId lookup failed`);
        }
      } catch (objectIdError) {
        console.log(`[${timestamp}] ❌ ObjectId lookup error:`, objectIdError.message);
      }
    }

    // STEP 4: Get sample data for comparison
    let sampleDealer = null;
    try {
      sampleDealer = await dealersCollection.findOne({});
      if (sampleDealer) {
        console.log(`[${timestamp}] 📋 Sample dealer for comparison:`);
        console.log(`[${timestamp}] - Sample ID:`, sampleDealer._id, 'Type:', typeof sampleDealer._id);
        console.log(`[${timestamp}] - Sample name:`, sampleDealer.businessName);
        console.log(`[${timestamp}] - Target ID:`, businessId, 'Type:', typeof businessId);
        console.log(`[${timestamp}] - IDs match:`, sampleDealer._id === businessId || sampleDealer._id.toString() === businessId);
      }
    } catch (sampleError) {
      console.log(`[${timestamp}] Error getting sample dealer:`, sampleError.message);
    }

    // STEP 5: Try finding the specific dealer we know exists (from working dealer endpoint)
    let targetDealerDirect = null;
    try {
      console.log(`[${timestamp}] 🔍 Testing if we can find the dealer using same query as dealer endpoint...`);
      
      // This is the EXACT same query pattern used in your working dealer endpoint
      targetDealerDirect = await dealersCollection.findOne({ _id: businessId });
      if (!targetDealerDirect && businessId.length === 24 && /^[0-9a-fA-F]{24}$/.test(businessId)) {
        targetDealerDirect = await dealersCollection.findOne({ _id: new ObjectId(businessId) });
      }
      
      if (targetDealerDirect) {
        console.log(`[${timestamp}] ✅ Target dealer found using dealer endpoint pattern!`);
        businessRecord = targetDealerDirect;
        lookupMethod = 'dealer_endpoint_pattern';
      } else {
        console.log(`[${timestamp}] ❌ Target dealer NOT found even with dealer endpoint pattern`);
      }
    } catch (directError) {
      console.log(`[${timestamp}] Error with direct dealer lookup:`, directError.message);
    }

    // Return comprehensive test results
    return res.status(200).json({
      success: !!businessRecord,
      message: businessRecord ? 'Business found!' : 'Business not found',
      data: {
        businessFound: !!businessRecord,
        lookupMethod: lookupMethod,
        businessData: businessRecord ? {
          id: businessRecord._id,
          name: businessRecord.businessName,
          type: businessRecord.sellerType || 'dealer'
        } : null,
        debug: {
          targetBusinessId: businessId,
          businessIdType: typeof businessId,
          businessIdLength: businessId.length,
          validObjectIdPattern: /^[0-9a-fA-F]{24}$/.test(businessId),
          databaseConnected: !!db,
          dealersCollectionAccessible: !!dealersCollection,
          usersCollectionAccessible: !!usersCollection,
          sampleDealerFound: !!sampleDealer,
          sampleDealerId: sampleDealer?._id,
          sampleDealerType: typeof sampleDealer?._id
        }
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] Test business lookup error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Test business lookup failed',
      error: error.message
    });
  }
}

// Enhanced debug endpoint to test the correct review lookup
if ((path === '/reviews/debug-dealer' || path === '/api/reviews/debug-dealer') && req.method === 'GET') {
  const dealerId = '6833420039f186e3a47ee1b3'; // Your specific dealer ID
  console.log(`[${timestamp}] 🔍 DEBUG DEALER REVIEW LOOKUP for ID: ${dealerId}`);
  
  try {
    const { ObjectId } = await import('mongodb');
    const dealersCollection = db.collection('dealers');
    const usersCollection = db.collection('users');
    
    const results = {
      dealerId: dealerId,
      reviewLookupStrategy: 'reviews.given (not reviews.received)'
    };
    
    // Test dealer lookup
    try {
      const dealer = await dealersCollection.findOne({ _id: dealerId }) || 
                   await dealersCollection.findOne({ _id: new ObjectId(dealerId) });
      results.dealerFound = {
        success: !!dealer,
        dealer: dealer ? {
          id: dealer._id,
          name: dealer.businessName,
          user: dealer.user
        } : null
      };
    } catch (dealerError) {
      results.dealerFound = { success: false, error: dealerError.message };
    }
    
    // Test review lookup - Look for reviews GIVEN about this dealer
    try {
      const usersWithReviews = await usersCollection.find({
        'reviews.given': { 
          $elemMatch: { 
            businessId: dealerId 
          } 
        }
      }).toArray();
      
      let allReviews = [];
      usersWithReviews.forEach(user => {
        if (user.reviews?.given) {
          const reviewsAboutThisDealer = user.reviews.given.filter(review => 
            review.businessId === dealerId
          );
          
          reviewsAboutThisDealer.forEach(review => {
            allReviews.push({
              ...review,
              reviewerName: user.name,
              reviewerId: user._id
            });
          });
        }
      });
      
      results.reviewsFound = {
        success: true,
        totalUsersWithReviews: usersWithReviews.length,
        totalReviews: allReviews.length,
        reviews: allReviews.map(r => ({
          rating: r.rating,
          reviewText: r.review?.substring(0, 50) + '...',
          reviewerName: r.reviewerName,
          date: r.date
        }))
      };
      
    } catch (reviewError) {
      results.reviewsFound = { success: false, error: reviewError.message };
    }
    
    // Also check if there are ANY users with reviews.given
    try {
      const totalUsersWithGivenReviews = await usersCollection.countDocuments({
        'reviews.given': { $exists: true, $ne: [] }
      });
      results.totalUsersWithGivenReviews = totalUsersWithGivenReviews;
      
      // Sample users with given reviews
      const sampleUsers = await usersCollection.find({
        'reviews.given': { $exists: true, $ne: [] }
      }).limit(3).toArray();
      
      results.sampleUsersWithGivenReviews = sampleUsers.map(user => ({
        userId: user._id,
        userName: user.name,
        reviewsGiven: user.reviews?.given?.length || 0,
        sampleReview: user.reviews?.given?.[0] ? {
          businessId: user.reviews.given[0].businessId,
          rating: user.reviews.given[0].rating,
          review: user.reviews.given[0].review?.substring(0, 50) + '...'
        } : null
      }));
      
    } catch (sampleError) {
      results.sampleUsersWithGivenReviews = { error: sampleError.message };
    }
    
    return res.status(200).json({
      success: true,
      message: 'Debug dealer review lookup complete',
      data: results
    });

  } catch (error) {
    console.error(`[${timestamp}] Debug dealer review lookup error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Debug dealer review lookup failed',
      error: error.message
    });
  }
}

// Also add a more robust reviews/{businessId} GET endpoint
// FIXED: Enhanced business reviews endpoint
if ((path.startsWith('/reviews/business/') || path.startsWith('/api/reviews/business/')) && req.method === 'GET') {
  const businessId = path.split('/business/')[1].split('?')[0];
  console.log(`[${timestamp}] ✅ GET BUSINESS REVIEWS for ID: ${businessId}`);
  
  try {
    const { ObjectId } = await import('mongodb');
    const dealersCollection = db.collection('dealers');
    const usersCollection = db.collection('users');
    
    // Find business using same pattern as dealer endpoint
    let businessRecord = null;
    
    try {
      businessRecord = await dealersCollection.findOne({ _id: businessId });
      if (!businessRecord && businessId.length === 24 && /^[0-9a-fA-F]{24}$/.test(businessId)) {
        businessRecord = await dealersCollection.findOne({ _id: new ObjectId(businessId) });
      }
    } catch (lookupError) {
      console.log(`[${timestamp}] Business lookup error:`, lookupError.message);
    }

    if (!businessRecord) {
      return res.status(404).json({
        success: false,
        message: 'Business not found',
        businessId: businessId
      });
    }

    // FIXED: Look for reviews GIVEN about this business - USE OBJECTID
    let reviews = [];
    let stats = {
      totalReviews: 0,
      averageRating: 0,
      ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
    };

    try {
      // CRITICAL FIX: Convert businessId to ObjectId for the query
      const usersWithReviews = await usersCollection.find({
        'reviews.given': { 
          $elemMatch: { 
            businessId: new ObjectId(businessId)  // ← FIXED: Use ObjectId, not string
          } 
        }
      }).toArray();

      // Extract reviews about this business from all users
      usersWithReviews.forEach(user => {
        if (user.reviews?.given) {
          const reviewsAboutThisBusiness = user.reviews.given.filter(review => {
            // Handle both ObjectId and string comparison
            const reviewBusinessId = review.businessId?.toString() || review.businessId;
            return reviewBusinessId === businessId;
          });
          
          // Add reviewer info to each review
          reviewsAboutThisBusiness.forEach(review => {
            reviews.push({
              ...review,
              _id: review._id || `${user._id}_${review.businessId}_${review.date}`,
              fromUserId: {
                _id: user._id,
                name: user.name,
                avatar: user.avatar
              },
              reviewer: {
                name: user.name,
                avatar: user.avatar
              }
            });
          });
        }
      });

      // Sort reviews by date (newest first)
      reviews.sort((a, b) => new Date(b.date) - new Date(a.date));

      // Calculate stats
      if (reviews.length > 0) {
        stats.totalReviews = reviews.length;
        stats.averageRating = reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length;
        
        // Rating distribution
        reviews.forEach(review => {
          if (review.rating >= 1 && review.rating <= 5) {
            stats.ratingDistribution[review.rating]++;
          }
        });
      }

    } catch (reviewError) {
      console.log(`[${timestamp}] ❌ Error finding reviews:`, reviewError.message);
    }

    return res.status(200).json({
      success: true,
      data: {
        business: {
          id: businessRecord._id,
          name: businessRecord.businessName,
          type: businessRecord.sellerType || 'dealer'
        },
        reviews: reviews,
        stats: stats
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] Get business reviews error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get business reviews',
      error: error.message
    });
  }
}

// KEEP ALL YOUR EXISTING WORKING POST ENDPOINTS EXACTLY AS THEY ARE:

// SUBMIT GENERAL REVIEW (KEEP AS-IS - THIS IS WORKING)
if ((path === '/reviews/general' || path === '/api/reviews/general') && req.method === 'POST') {
  console.log(`[${timestamp}] ✅ SUBMIT GENERAL REVIEW - PATH MATCHED!`);
  
  try {
    // Parse request body
    let body = {};
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks).toString();
      console.log(`[${timestamp}] Raw request body:`, rawBody);
      
      if (rawBody) body = JSON.parse(rawBody);
      console.log(`[${timestamp}] Parsed body:`, body);
    } catch (parseError) {
      console.error(`[${timestamp}] Body parse error:`, parseError);
      return res.status(400).json({
        success: false,
        message: 'Invalid request body format',
        error: parseError.message
      });
    }

    const { 
      businessId, 
      rating, 
      review, 
      isAnonymous = false, 
      serviceExperience = {} 
    } = body;

    // Validate required fields
    if (!businessId || !rating || !review) {
      console.log(`[${timestamp}] Validation failed:`, { 
        hasBusinessId: !!businessId, 
        hasRating: !!rating, 
        hasReview: !!review 
      });
      return res.status(400).json({
        success: false,
        message: 'Business ID, rating, and review are required',
        received: { businessId, rating, review }
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5'
      });
    }

    if (review.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Review must be at least 10 characters long'
      });
    }

    console.log(`[${timestamp}] ✅ Validation passed, proceeding with business lookup...`);

    // CRITICAL: Use EXACT same business lookup pattern as working GET endpoint
    const { ObjectId } = await import('mongodb');
    const dealersCollection = db.collection('dealers');
    const usersCollection = db.collection('users');
    
    let businessRecord = null;
    
    console.log(`[${timestamp}] 🔍 Using working GET endpoint pattern for business lookup...`);
    console.log(`[${timestamp}] Target business ID: ${businessId}`);
    
    // EXACT same lookup as working GET endpoint
    try {
      businessRecord = await dealersCollection.findOne({ _id: businessId });
      if (!businessRecord && businessId.length === 24 && /^[0-9a-fA-F]{24}$/.test(businessId)) {
        businessRecord = await dealersCollection.findOne({ _id: new ObjectId(businessId) });
      }
    } catch (lookupError) {
      console.log(`[${timestamp}] Business lookup error:`, lookupError.message);
    }

    if (!businessRecord) {
      console.log(`[${timestamp}] ❌ Business not found - This shouldn't happen since GET works!`);
      return res.status(404).json({
        success: false,
        message: 'Business not found in POST endpoint',
        businessId: businessId,
        debug: {
          note: "GET endpoint works for same ID, check POST logic differences"
        }
      });
    }

    console.log(`[${timestamp}] ✅ Business found in POST: ${businessRecord.businessName}`);

    // FIXED: Use proper token verification that extracts the actual user ID
    console.log(`[${timestamp}] 🔍 Verifying authentication...`);
    
    let userId = null;
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          message: 'No token provided'
        });
      }
      
      const token = authHeader.substring(7);
      console.log(`[${timestamp}] Token received (first 20 chars):`, token.substring(0, 20) + '...');
      
      // Decode the JWT token properly
      const jwt = await import('jsonwebtoken');
      const secretKey = process.env.JWT_SECRET || 'bw-car-culture-secret-key-2025';
      const decoded = jwt.default.verify(token, secretKey);
      
      console.log(`[${timestamp}] ✅ JWT decoded successfully`);
      console.log(`[${timestamp}] Decoded userId:`, decoded.userId);
      console.log(`[${timestamp}] Decoded email:`, decoded.email);
      console.log(`[${timestamp}] Decoded role:`, decoded.role);
      
      // Extract the actual user ID from the decoded token
      userId = decoded.userId;
      
      if (!userId) {
        console.log(`[${timestamp}] ❌ No userId found in decoded token`);
        return res.status(401).json({
          success: false,
          message: 'Invalid token format - no user ID'
        });
      }
      
      console.log(`[${timestamp}] ✅ Extracted user ID:`, userId);
      console.log(`[${timestamp}] User ID type:`, typeof userId, 'Length:', userId?.length);
      
    } catch (jwtError) {
      console.log(`[${timestamp}] ❌ JWT verification failed:`, jwtError.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // FIXED: Validate and convert user ID properly
    let userObjectId;
    try {
      if (!userId) {
        throw new Error('User ID is null or undefined');
      }
      
      // Convert userId to ObjectId safely
      if (typeof userId === 'string' && userId.length === 24 && /^[0-9a-fA-F]{24}$/.test(userId)) {
        userObjectId = new ObjectId(userId);
        console.log(`[${timestamp}] ✅ User ObjectId created from string:`, userObjectId);
      } else if (typeof userId === 'object' && userId._id) {
        // If userId is already an object with _id
        userObjectId = new ObjectId(userId._id);
        console.log(`[${timestamp}] ✅ User ObjectId created from object:`, userObjectId);
      } else {
        // Try to use as string directly (fallback)
        console.log(`[${timestamp}] ⚠️ Using userId as-is (not standard ObjectId format):`, userId);
        userObjectId = userId;
      }
      
    } catch (userIdError) {
      console.log(`[${timestamp}] ❌ User ID validation error:`, userIdError.message);
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format',
        debug: {
          userId: userId,
          userIdType: typeof userId,
          userIdLength: userId?.length,
          error: userIdError.message
        }
      });
    }

    // Get reviewer with safe ObjectId handling
    let reviewer = null;
    try {
      console.log(`[${timestamp}] 🔍 Looking for reviewer with ObjectId:`, userObjectId);
      
      reviewer = await usersCollection.findOne({ 
        _id: userObjectId
      });
      
      if (!reviewer) {
        console.log(`[${timestamp}] ❌ Reviewer not found for ObjectId:`, userObjectId);
        
        // Debug: Let's see what users exist
        try {
          const sampleUser = await usersCollection.findOne({});
          console.log(`[${timestamp}] 📋 Sample user ID for comparison:`, sampleUser?._id, 'Type:', typeof sampleUser?._id);
        } catch (debugError) {
          console.log(`[${timestamp}] Debug user lookup error:`, debugError.message);
        }
        
        return res.status(404).json({
          success: false,
          message: 'Reviewer not found',
          debug: {
            searchedForObjectId: userObjectId.toString(),
            originalUserId: userId,
            userIdType: typeof userId,
            userIdLength: userId?.length
          }
        });
      }
      
      console.log(`[${timestamp}] ✅ Reviewer found:`, reviewer.name, 'Email:', reviewer.email);
    } catch (reviewerError) {
      console.log(`[${timestamp}] ❌ Reviewer lookup error:`, reviewerError.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to find reviewer',
        error: reviewerError.message
      });
    }

    // Create review entry with safe ID handling
    const newReview = {
      businessId: businessRecord._id, // Keep as is since business lookup worked
      businessName: businessRecord.businessName,
      businessType: businessRecord.sellerType || 'dealer',
      rating: rating,
      review: review.trim(),
      date: new Date(),
      isAnonymous: isAnonymous,
      verificationMethod: 'general',
      serviceExperience: serviceExperience
    };

    console.log(`[${timestamp}] 📝 Created review object:`, {
      businessId: newReview.businessId,
      businessName: newReview.businessName,
      rating: newReview.rating,
      isAnonymous: newReview.isAnonymous
    });

    // FIXED: Initialize and update reviewer reviews with safe operations
    try {
      const reviewerReviews = reviewer.reviews || { given: [], received: [] };
      reviewerReviews.given.push(newReview);

      const updateResult = await usersCollection.updateOne(
        { _id: userObjectId },
        { 
          $set: { 
            reviews: reviewerReviews,
            'activity.points': (reviewer.activity?.points || 0) + 7
          }
        }
      );
      
      console.log(`[${timestamp}] ✅ Reviewer updated:`, updateResult.modifiedCount, 'documents');
    } catch (reviewerUpdateError) {
      console.log(`[${timestamp}] ❌ Reviewer update error:`, reviewerUpdateError.message);
      return res.status(500).json({
        success: false,
        message: 'Failed to save reviewer data',
        error: reviewerUpdateError.message
      });
    }

    console.log(`[${timestamp}] ✅ Review saved successfully`);

    return res.status(201).json({
      success: true,
      message: 'Review submitted successfully! You earned 7 points.',
      data: {
        review: newReview,
        pointsEarned: 7,
        totalPoints: (reviewer.activity?.points || 0) + 7
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] Submit general review error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit review',
      error: error.message
    });
  }
}

// KEEP ALL YOUR OTHER WORKING ENDPOINTS AS-IS:

// ALSO ADD this debug endpoint to test business lookup:
if ((path === '/reviews/debug-business' || path === '/api/reviews/debug-business') && req.method === 'POST') {
  console.log(`[${timestamp}] 🔍 DEBUG BUSINESS LOOKUP`);
  
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString();
    const { businessId } = JSON.parse(rawBody);
    
    console.log(`[${timestamp}] Looking for business:`, businessId);
    
    const dealersCollection = db.collection('dealers');
    const serviceProvidersCollection = db.collection('serviceproviders');
    
    // Try both collections
    const dealer = await dealersCollection.findOne({ 
      _id: new ObjectId(businessId) 
    });
    
    const provider = await serviceProvidersCollection.findOne({ 
      _id: new ObjectId(businessId) 
    });
    
    return res.status(200).json({
      success: true,
      debug: {
        businessId,
        foundAsDealer: !!dealer,
        foundAsProvider: !!provider,
        dealerData: dealer ? {
          id: dealer._id,
          name: dealer.businessName,
          hasUser: !!dealer.user
        } : null,
        providerData: provider ? {
          id: provider._id,
          name: provider.businessName,  
          hasUser: !!provider.user
        } : null
      }
    });
  } catch (error) {
    console.error(`[${timestamp}] Debug error:`, error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

  // SUBMIT QR CODE REVIEW (KEEP AS-IS)
  if (path === '/reviews/qr-scan' && req.method === 'POST') {
    console.log(`[${timestamp}] → SUBMIT QR REVIEW`);
    
    try {
      // Parse request body
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

      const { 
        qrData,
        rating, 
        review, 
        isAnonymous = false, 
        serviceExperience = {} 
      } = body;

      // Validate required fields
      if (!qrData || !rating || !review) {
        return res.status(400).json({
          success: false,
          message: 'QR data, rating, and review text are required'
        });
      }

      // Parse QR data: serviceType|serviceId|providerId|serviceName
      const [serviceType, serviceId, providerId, serviceName] = qrData.split('|');
      
      if (!serviceType || !serviceId || !providerId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid QR code format'
        });
      }

      // Verify authentication
      const authResult = await verifyUserToken(req);
      if (!authResult.success) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const usersCollection = db.collection('users');
      
      // Find the service provider
      let provider = null;
      try {
        provider = await usersCollection.findOne({ _id: providerId });
      } catch (stringError) {
        try {
          const { ObjectId } = await import('mongodb');
          provider = await usersCollection.findOne({ _id: new ObjectId(providerId) });
        } catch (objectIdError) {
          console.log(`[${timestamp}] Provider lookup failed:`, objectIdError.message);
        }
      }

      if (!provider) {
        return res.status(404).json({
          success: false,
          message: 'Service provider not found'
        });
      }

      // Create and save review (similar to general review but with QR verification)
      const reviewDate = new Date();
      const { ObjectId } = await import('mongodb');
      const reviewId = new ObjectId();

      const newReviewReceived = {
        _id: reviewId,
        fromUserId: isAnonymous ? null : authResult.user.id,
        serviceId: serviceId,
        rating: rating,
        review: review,
        date: reviewDate,
        isPublic: true,
        verificationMethod: 'qr_code',
        serviceExperience: serviceExperience
      };

      // Initialize reviews arrays if they don't exist
      if (!provider.reviews) provider.reviews = { given: [], received: [] };
      if (!provider.reviews.received) provider.reviews.received = [];

      // Add review
      provider.reviews.received.push(newReviewReceived);

      // Update provider in database
      await usersCollection.updateOne(
        { _id: provider._id },
        { $set: { reviews: provider.reviews } }
      );

      console.log(`[${timestamp}] ✅ QR review submitted successfully`);

      return res.status(201).json({
        success: true,
        message: 'Review submitted successfully!',
        data: {
          review: newReviewReceived
        }
      });

    } catch (error) {
      console.error(`[${timestamp}] Submit QR review error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to submit QR review'
      });
    }
  }

  // SUBMIT SERVICE CODE REVIEW (KEEP AS-IS)
  if (path === '/reviews/service-code' && req.method === 'POST') {
    console.log(`[${timestamp}] → SUBMIT SERVICE CODE REVIEW`);
    
    try {
      // Parse request body
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

      const { 
        serviceCode,
        rating, 
        review, 
        isAnonymous = false, 
        serviceExperience = {} 
      } = body;

      // Validate required fields
      if (!serviceCode || !rating || !review) {
        return res.status(400).json({
          success: false,
          message: 'Service code, rating, and review text are required'
        });
      }

      // For now, accept any service code format
      // In production, you'd validate against actual service codes

      // Verify authentication
      const authResult = await verifyUserToken(req);
      if (!authResult.success) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      console.log(`[${timestamp}] ✅ Service code review submitted successfully`);

      return res.status(201).json({
        success: true,
        message: 'Review submitted successfully!',
        data: {
          serviceCode: serviceCode,
          rating: rating
        }
      });

    } catch (error) {
      console.error(`[${timestamp}] Submit service code review error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to submit service code review'
      });
    }
  }

    // KEEP ALL YOUR OTHER WORKING ENDPOINTS (QR validation, leaderboard, etc.) AS-IS
    if (path.startsWith('/reviews')) {
      console.log(`[${timestamp}] → REVIEWS: ${path}`);
      
      // Submit review via QR code scan
      if (path === '/reviews/qr-scan' && req.method === 'POST') {
        try {
          const authResult = await verifyToken(req, res);
          if (!authResult.success) return;

          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = Buffer.concat(chunks).toString();
          const { qrData, rating, review, isAnonymous = false, serviceExperience } = JSON.parse(body);

          if (!qrData || !rating || !review) {
            return res.status(400).json({
              success: false,
              message: 'QR data, rating, and review text are required'
            });
          }

          if (rating < 1 || rating > 5) {
            return res.status(400).json({
              success: false,
              message: 'Rating must be between 1 and 5'
            });
          }

          // Parse QR code data: serviceType|serviceId|providerId|serviceName
          const [serviceType, serviceId, providerId, serviceName] = qrData.split('|');
          
          if (!serviceType || !serviceId || !providerId) {
            return res.status(400).json({
              success: false,
              message: 'Invalid QR code format'
            });
          }

          const usersCollection = db.collection('users');
          
          // Find the service provider
          const provider = await usersCollection.findOne({ 
            _id: new ObjectId(providerId) 
          });

          if (!provider) {
            return res.status(404).json({
              success: false,
              message: 'Service provider not found'
            });
          }

          // Find the specific service
          const service = provider.businessProfile?.services?.find(s => 
            s._id.toString() === serviceId
          );

          if (!service) {
            return res.status(404).json({
              success: false,
              message: 'Service not found'
            });
          }

          if (!service.isVerified || !service.isActive) {
            return res.status(400).json({
              success: false,
              message: 'This service is not currently available for reviews'
            });
          }

          // Get the reviewer
          const reviewer = await usersCollection.findOne({ 
            _id: new ObjectId(authResult.userId) 
          });

          // Check for recent reviews (within 30 days)
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          const existingReview = reviewer?.reviews?.given?.find(r => 
            r.serviceId === serviceId && 
            r.providerId === providerId &&
            new Date(r.date) > thirtyDaysAgo
          );

          if (existingReview) {
            return res.status(400).json({
              success: false,
              message: 'You have already reviewed this service recently'
            });
          }

          // Create review objects
          const reviewId = new ObjectId();
          const reviewDate = new Date();

          const newReviewGiven = {
            _id: reviewId,
            serviceId: serviceId,
            serviceType: serviceType,
            providerId: providerId,
            rating: rating,
            review: review,
            date: reviewDate,
            isAnonymous: isAnonymous,
            verificationMethod: 'qr_code',
            serviceExperience: serviceExperience || {}
          };

          const newReviewReceived = {
            _id: reviewId,
            fromUserId: isAnonymous ? null : authResult.userId,
            serviceId: serviceId,
            rating: rating,
            review: review,
            date: reviewDate,
            isPublic: true,
            verificationMethod: 'qr_code',
            serviceExperience: serviceExperience || {}
          };

          // Update both users
          await usersCollection.updateOne(
            { _id: new ObjectId(authResult.userId) },
            { 
              $push: { 'reviews.given': newReviewGiven },
              $inc: { 'activity.points': 10 }
            }
          );

          await usersCollection.updateOne(
            { _id: new ObjectId(providerId) },
            { $push: { 'reviews.received': newReviewReceived } }
          );

          return res.status(201).json({
            success: true,
            message: 'Review submitted successfully! You earned 10 points.',
            data: {
              review: newReviewGiven,
              pointsEarned: 10
            }
          });

        } catch (error) {
          console.error(`[${timestamp}] QR review error:`, error);
          return res.status(500).json({
            success: false,
            message: 'Failed to submit review'
          });
        }
      }

      // Submit review via service code
      if (path === '/reviews/service-code' && req.method === 'POST') {
        try {
          const authResult = await verifyToken(req, res);
          if (!authResult.success) return;

          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = Buffer.concat(chunks).toString();
          const { serviceCode, rating, review, isAnonymous = false, serviceExperience } = JSON.parse(body);

          if (!serviceCode || !rating || !review) {
            return res.status(400).json({
              success: false,
              message: 'Service code, rating, and review are required'
            });
          }

          const usersCollection = db.collection('users');
          
          // Find service by code
          const provider = await usersCollection.findOne({
            'businessProfile.services.qrCode.code': serviceCode,
            'businessProfile.services.isActive': true,
            'businessProfile.services.isVerified': true
          });

          if (!provider) {
            return res.status(404).json({
              success: false,
              message: 'Invalid service code or service not available'
            });
          }

          const service = provider.businessProfile.services.find(s => 
            s.qrCode.code === serviceCode && s.isActive && s.isVerified
          );

          // Process similar to QR review (code similar to above)
          // ... (implement similar logic as QR review)

          return res.status(201).json({
            success: true,
            message: 'Review submitted successfully! You earned 10 points.'
          });

        } catch (error) {
          console.error(`[${timestamp}] Service code review error:`, error);
          return res.status(500).json({
            success: false,
            message: 'Failed to submit review'
          });
        }
      }

      // Validate QR code
      if (path === '/reviews/validate-qr' && req.method === 'POST') {
        try {
          const authResult = await verifyToken(req, res);
          if (!authResult.success) return;

          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const body = Buffer.concat(chunks).toString();
          const { qrData } = JSON.parse(body);

          if (!qrData) {
            return res.status(400).json({
              success: false,
              message: 'QR code data is required'
            });
          }

          // Parse and validate QR code
          const [serviceType, serviceId, providerId, serviceName] = qrData.split('|');
          
          if (!serviceType || !serviceId || !providerId) {
            return res.status(400).json({
              success: false,
              message: 'Invalid QR code format'
            });
          }

          const usersCollection = db.collection('users');
          const provider = await usersCollection.findOne({ 
            _id: new ObjectId(providerId) 
          });

          if (!provider) {
            return res.status(404).json({
              success: false,
              message: 'Service provider not found'
            });
          }

          const service = provider.businessProfile?.services?.find(s => 
            s._id.toString() === serviceId
          );

          if (!service || !service.isVerified || !service.isActive) {
            return res.status(400).json({
              success: false,
              message: 'Service is not available for reviews'
            });
          }

          return res.status(200).json({
            success: true,
            data: {
              valid: true,
              service: {
                id: service._id,
                name: service.serviceName,
                type: service.serviceType,
                provider: provider.name
              }
            }
          });

        } catch (error) {
          console.error(`[${timestamp}] QR validation error:`, error);
          return res.status(500).json({
            success: false,
            message: 'Failed to validate QR code'
          });
        }
      }

      // Get service reviews (public endpoint) - FIXED to use reviews.given lookup
      if (path.match(/^\/reviews\/service\/([^\/]+)$/) && req.method === 'GET') {
        try {
          const serviceId = path.split('/')[3];
          const url = new URL(req.url, `http://${req.headers.host}`);
          const page = parseInt(url.searchParams.get('page')) || 1;
          const limit = parseInt(url.searchParams.get('limit')) || 10;

          const usersCollection = db.collection('users');
          
          // FIXED: Find reviews GIVEN about this service, not received by service
          const usersWithReviews = await usersCollection.find({
            'reviews.given': { 
              $elemMatch: { 
                serviceId: serviceId 
              } 
            }
          }).toArray();

          let serviceReviews = [];
          usersWithReviews.forEach(user => {
            if (user.reviews?.given) {
              const reviewsAboutThisService = user.reviews.given.filter(review => 
                review.serviceId === serviceId
              );
              
              reviewsAboutThisService.forEach(review => {
                serviceReviews.push({
                  ...review,
                  fromUserId: {
                    _id: user._id,
                    name: user.name,
                    avatar: user.avatar
                  }
                });
              });
            }
          });

          // Sort by date (newest first)
          serviceReviews.sort((a, b) => new Date(b.date) - new Date(a.date));

          // Pagination
          const startIndex = (page - 1) * limit;
          const paginatedReviews = serviceReviews.slice(startIndex, startIndex + limit);

          // Calculate stats
          const stats = {
            totalReviews: serviceReviews.length,
            averageRating: serviceReviews.length > 0 ? 
              serviceReviews.reduce((sum, r) => sum + r.rating, 0) / serviceReviews.length : 0,
            ratingDistribution: {
              5: serviceReviews.filter(r => r.rating === 5).length,
              4: serviceReviews.filter(r => r.rating === 4).length,
              3: serviceReviews.filter(r => r.rating === 3).length,
              2: serviceReviews.filter(r => r.rating === 2).length,
              1: serviceReviews.filter(r => r.rating === 1).length
            }
          };

          return res.status(200).json({
            success: true,
            data: {
              service: {
                id: serviceId
              },
              reviews: paginatedReviews,
              stats: stats,
              pagination: {
                currentPage: page,
                totalPages: Math.ceil(serviceReviews.length / limit),
                totalReviews: serviceReviews.length
              }
            }
          });

        } catch (error) {
          console.error(`[${timestamp}] Get service reviews error:`, error);
          return res.status(500).json({
            success: false,
            message: 'Failed to fetch service reviews'
          });
        }
      }
    }

    // Helper function to verify JWT token
    async function verifyToken(req, res) {
      try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          res.status(401).json({
            success: false,
            message: 'No token provided'
          });
          return { success: false };
        }

        const token = authHeader.substring(7);
        
        // For production, use proper JWT verification
        // For now, we'll do basic token validation
        if (!token || token.length < 10) {
          res.status(401).json({
            success: false,
            message: 'Invalid token'
          });
          return { success: false };
        }

        // Extract user ID from token (simplified)
        // In production, use jwt.verify()
        const userId = token.split(':')[0] || token.split('.')[1];
        
        return {
          success: true,
          userId: userId
        };

      } catch (error) {
        res.status(401).json({
          success: false,
          message: 'Token verification failed'
        });
        return { success: false };
      }
    }

    // Helper function to verify user token
    async function verifyUserToken(req) {
      try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return { success: false, message: 'No token provided' };
        }

        const token = authHeader.substring(7);
        
        if (!token || token.length < 10) {
          return { success: false, message: 'Invalid token' };
        }

        // Extract user ID from token (simplified)
        const userId = token.split(':')[0] || token.split('.')[1];
        
        return {
          success: true,
          userId: userId,
          user: { id: userId }
        };

      } catch (error) {
        return { success: false, message: 'Token verification failed' };
      }
    }

// GET REVIEWS LEADERBOARD (KEEP AS-IS)
if (path === '/reviews/leaderboard' && req.method === 'GET') {
  console.log(`[${timestamp}] → GET REVIEWS LEADERBOARD`);
  
  try {
    const usersCollection = db.collection('users');
    
    // Find all users with business profiles and services
    const businesses = await usersCollection.find({
      'businessProfile.isBusinessAccount': true,
      'businessProfile.services': { $exists: true, $ne: [] },
      'reviews.received': { $exists: true, $ne: [] }
    }).toArray();

    const leaderboard = [];

    // Process each business
    for (const business of businesses) {
      if (!business.businessProfile?.services) continue;

      // For each service, calculate ratings
      for (const service of business.businessProfile.services) {
        if (!service.isActive || !service.isVerified) continue;

        // Get reviews for this service
        const serviceReviews = (business.reviews?.received || []).filter(review => 
          review.serviceId === service._id.toString() && 
          review.isPublic !== false &&
          review.rating && 
          review.rating >= 1 && 
          review.rating <= 5
        );

        if (serviceReviews.length === 0) continue;

        // Calculate average rating
        const totalRating = serviceReviews.reduce((sum, review) => sum + review.rating, 0);
        const averageRating = totalRating / serviceReviews.length;

        // Only include services with at least 3 reviews and 4+ star average
        if (serviceReviews.length >= 3 && averageRating >= 4.0) {
          leaderboard.push({
            _id: service._id,
            businessId: business._id,
            businessName: business.businessProfile.businessName || business.name || 'Unknown Business',
            serviceName: service.serviceName || service.serviceType || 'Service',
            serviceType: service.serviceType || 'general',
            averageRating: parseFloat(averageRating.toFixed(2)),
            totalReviews: serviceReviews.length,
            category: service.category || 'general',
            location: business.businessProfile.location || business.profile?.location || null,
            isVerified: service.isVerified,
            businessAvatar: business.avatar?.url || null,
            
            // Additional metrics for better ranking
            ratingScore: parseFloat(averageRating.toFixed(2)),
            reviewCount: serviceReviews.length,
            
            // Weighted score (rating * log(review count)) for fairer ranking
            weightedScore: averageRating * Math.log10(serviceReviews.length + 1),
            
            // Recent activity (reviews in last 30 days)
            recentReviews: serviceReviews.filter(review => {
              const reviewDate = new Date(review.date);
              const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
              return reviewDate > thirtyDaysAgo;
            }).length
          });
        }
      }
    }

    // Sort by weighted score (considers both rating and review count)
    leaderboard.sort((a, b) => {
      // Primary sort: weighted score
      if (b.weightedScore !== a.weightedScore) {
        return b.weightedScore - a.weightedScore;
      }
      
      // Secondary sort: total reviews
      if (b.totalReviews !== a.totalReviews) {
        return b.totalReviews - a.totalReviews;
      }
      
      // Tertiary sort: average rating
      return b.averageRating - a.averageRating;
    });

    // Return top 10 for the leaderboard
    const topServices = leaderboard.slice(0, 10);

    return res.status(200).json({
      success: true,
      data: topServices,
      stats: {
        totalQualifiedServices: leaderboard.length,
        averageRating: leaderboard.length > 0 
          ? (leaderboard.reduce((sum, s) => sum + s.averageRating, 0) / leaderboard.length).toFixed(2)
          : 0,
        totalReviews: leaderboard.reduce((sum, s) => sum + s.totalReviews, 0)
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] Get leaderboard error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch leaderboard data'
    });
  }
}

// GET CATEGORY LEADERBOARD (KEEP AS-IS)
if (path.match(/^\/reviews\/leaderboard\/category\/(.+)$/) && req.method === 'GET') {
  const category = decodeURIComponent(path.split('/')[4]);
  console.log(`[${timestamp}] → GET CATEGORY LEADERBOARD: ${category}`);
  
  try {
    const usersCollection = db.collection('users');
    
    // Find businesses with services in the specific category
    const businesses = await usersCollection.find({
      'businessProfile.isBusinessAccount': true,
      'businessProfile.services.serviceType': category,
      'reviews.received': { $exists: true, $ne: [] }
    }).toArray();

    const categoryLeaderboard = [];

    // Process each business (similar logic as above but filtered by category)
    for (const business of businesses) {
      if (!business.businessProfile?.services) continue;

      for (const service of business.businessProfile.services) {
        if (!service.isActive || !service.isVerified) continue;
        if (service.serviceType !== category) continue;

        const serviceReviews = (business.reviews?.received || []).filter(review => 
          review.serviceId === service._id.toString() && 
          review.isPublic !== false &&
          review.rating && 
          review.rating >= 1 && 
          review.rating <= 5
        );

        if (serviceReviews.length === 0) continue;

        const totalRating = serviceReviews.reduce((sum, review) => sum + review.rating, 0);
        const averageRating = totalRating / serviceReviews.length;

        if (serviceReviews.length >= 2 && averageRating >= 3.5) { // Lower threshold for category-specific
          categoryLeaderboard.push({
            _id: service._id,
            businessId: business._id,
            businessName: business.businessProfile.businessName || business.name || 'Unknown Business',
            serviceName: service.serviceName || service.serviceType || 'Service',
            serviceType: service.serviceType,
            averageRating: parseFloat(averageRating.toFixed(2)),
            totalReviews: serviceReviews.length,
            category: service.category || category,
            location: business.businessProfile.location || business.profile?.location || null,
            isVerified: service.isVerified,
            businessAvatar: business.avatar?.url || null,
            weightedScore: averageRating * Math.log10(serviceReviews.length + 1)
          });
        }
      }
    }

    // Sort by weighted score
    categoryLeaderboard.sort((a, b) => {
      if (b.weightedScore !== a.weightedScore) {
        return b.weightedScore - a.weightedScore;
      }
      return b.totalReviews - a.totalReviews;
    });

    return res.status(200).json({
      success: true,
      category: category,
      data: categoryLeaderboard.slice(0, 15), // Top 15 for category
      stats: {
        totalInCategory: categoryLeaderboard.length,
        averageRating: categoryLeaderboard.length > 0 
          ? (categoryLeaderboard.reduce((sum, s) => sum + s.averageRating, 0) / categoryLeaderboard.length).toFixed(2)
          : 0
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] Get category leaderboard error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch category leaderboard'
    });
  }
}

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




// ==================== COMPLETE ADMIN ROLE REQUEST ENDPOINTS ====================
// Add this section to your api/index.js file
// Replace your existing admin role request endpoints with this consolidated version




// === GET ALL ROLE REQUESTS (Admin) ===
// === GET ALL ROLE REQUESTS (Admin) ===
if (path === '/api/admin/role-requests' && req.method === 'GET') {
  console.log(`[${timestamp}] → ADMIN GET ALL ROLE REQUESTS`);
  
  try {
    const authResult = await verifyAdminToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required'
      });
    }

    const roleRequestsCollection = db.collection('rolerequests');
    const url = new URL(req.url, `https://${req.headers.host}`);
    
    // Build filter from query params
    const filter = {};
    if (url.searchParams.get('status') && url.searchParams.get('status') !== 'all') {
      filter.status = url.searchParams.get('status');
    }
    if (url.searchParams.get('requestType') && url.searchParams.get('requestType') !== 'all') {
      filter.requestType = url.searchParams.get('requestType');
    }
    if (url.searchParams.get('priority') && url.searchParams.get('priority') !== 'all') {
      filter.priority = url.searchParams.get('priority');
    }

    // Pagination
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    const skip = (page - 1) * limit;

    const [requests, total] = await Promise.all([
      roleRequestsCollection.find(filter)
        .sort({ priority: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      roleRequestsCollection.countDocuments(filter)
    ]);

    // ENHANCED: Transform requests for admin panel with complete journalist/courier data
    const transformedRequests = requests.map(request => ({
      _id: request._id,
      role: request.requestType,
      userName: request.requestData?.businessName || request.userName || 'N/A',
      userEmail: request.requestData?.businessEmail || request.userEmail || 'N/A',
      status: request.status,
      submittedAt: request.createdAt,
      reviewedAt: request.reviewedAt,
      reviewedBy: request.reviewedBy,
      reviewedByName: request.reviewedByName,
      notes: request.reviewNotes || request.adminNotes || '',
      priority: request.priority || 'normal',
      // COMPLETE: All application data for admin review
      applicationData: {
        // Journalist-specific fields
        writingExperience: request.requestData?.writingExperience || '',
        portfolio: request.requestData?.portfolio || '',
        specializations: request.requestData?.specializations || [],
        motivation: request.requestData?.motivation || '',
        socialMediaHandles: request.requestData?.socialMediaHandles || '',
        
        // Courier fields
        transportModes: request.requestData?.transportModes || [],
        deliveryCapacity: request.requestData?.deliveryCapacity || '',
        operatingSchedule: request.requestData?.operatingSchedule || '',
        coverageAreas: request.requestData?.coverageAreas || '',
        courierExperience: request.requestData?.courierExperience || '',
        
        // Dealership fields
        dealershipType: request.requestData?.dealershipType || '',
        licenseNumber: request.requestData?.licenseNumber || '',
        fleetSize: request.requestData?.fleetSize || '',
        
        // Transport fields
        serviceType: request.requestData?.serviceType || '',
        operatingAreas: request.requestData?.operatingAreas || '',
        transportRoutes: request.requestData?.transportRoutes || '',
        
        // Ministry fields
        ministryName: request.requestData?.ministryName || '',
        department: request.requestData?.department || '',
        position: request.requestData?.position || '',
        employeeId: request.requestData?.employeeId || '',
        
        // General business fields
        businessName: request.requestData?.businessName || '',
        businessType: request.requestData?.businessType || '',
        businessPhone: request.requestData?.businessPhone || '',
        businessEmail: request.requestData?.businessEmail || '',
        businessAddress: request.requestData?.businessAddress || '',
        city: request.requestData?.city || '',
        website: request.requestData?.website || '',
        taxId: request.requestData?.taxId || '',
        registrationNumber: request.requestData?.registrationNumber || '',
        description: request.requestData?.description || '',
        experience: request.requestData?.experience || ''
      }
    }));

    console.log(`[${timestamp}] ✅ Admin fetched ${requests.length} of ${total} role requests`);

    return res.status(200).json({
      success: true,
      count: requests.length,
      total: total,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      },
      data: transformedRequests
    });

  } catch (error) {
    console.error(`[${timestamp}] Admin get all requests error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch role requests',
      error: error.message
    });
  }
}

// === UPDATE ROLE REQUEST STATUS (Admin) ===
if (path.match(/^\/api\/admin\/role-requests\/[a-fA-F0-9]{24}$/) && req.method === 'PUT') {
  console.log(`[${timestamp}] → ADMIN UPDATE ROLE REQUEST STATUS`);
  
  try {
    const authResult = await verifyAdminToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required'
      });
    }

    const requestId = path.split('/').pop();
    
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

    const { status, adminNotes, reviewNotes } = body;
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "approved" or "rejected"'
      });
    }

    const { ObjectId } = await import('mongodb');
    const roleRequestsCollection = db.collection('rolerequests');
    const usersCollection = db.collection('users');

    // Find the role request
    const roleRequest = await roleRequestsCollection.findOne({
      _id: new ObjectId(requestId)
    });

    if (!roleRequest) {
      return res.status(404).json({
        success: false,
        message: 'Role request not found'
      });
    }

    console.log(`[${timestamp}] Updating role request ${requestId} to ${status} for ${roleRequest.requestType} role`);

    // Update the role request
    const updateData = {
      status: status,
      reviewNotes: reviewNotes || adminNotes || '',
      adminNotes: adminNotes || reviewNotes || '',
      reviewedBy: authResult.user?.id || authResult.userId,
      reviewedByName: authResult.user?.name || 'Admin',
      reviewedAt: new Date(),
      updatedAt: new Date()
    };

    await roleRequestsCollection.updateOne(
      { _id: new ObjectId(requestId) },
      { $set: updateData }
    );

    // ENHANCED: If approved, update user's role with hierarchy system
    if (status === 'approved') {
      let targetUser = null;
      
      // Try multiple methods to find the user
      if (roleRequest.userId) {
        try {
          targetUser = await usersCollection.findOne({
            _id: new ObjectId(roleRequest.userId)
          });
        } catch (err) {
          console.error('Error finding user by ID:', err);
        }
      }
      
      // Try finding by email from request data
      if (!targetUser && roleRequest.requestData?.businessEmail) {
        targetUser = await usersCollection.findOne({
          email: roleRequest.requestData.businessEmail
        });
      }
      
      // Try finding by email from userEmail field
      if (!targetUser && roleRequest.userEmail) {
        targetUser = await usersCollection.findOne({
          email: roleRequest.userEmail
        });
      }

      if (targetUser) {
        // ENHANCED ROLE HIERARCHY SYSTEM
        const currentRole = targetUser.role;
        const newRole = roleRequest.requestType;
        
        // Define role hierarchy (higher number = higher priority)
        const roleHierarchy = {
          'super_admin': 1000,
          'admin': 900,
          'ministry_official': 800,
          'transport_admin': 700,
          'dealership_admin': 600,
          'rental_admin': 600,
          'transport_coordinator': 500,
          'journalist': 400,
          'courier': 400,
          'taxi_driver': 300,
          'user': 100
        };

        // Get role priorities
        const currentPriority = roleHierarchy[currentRole] || 100;
        const newPriority = roleHierarchy[newRole] || 100;

        console.log(`[${timestamp}] Role comparison: Current (${currentRole}: ${currentPriority}) vs New (${newRole}: ${newPriority})`);

        // Determine final role and additional roles
        let finalRole = currentRole;
        let additionalRoles = targetUser.additionalRoles || [];
        
        // If new role has higher priority, make it primary
        if (newPriority > currentPriority) {
          // Move current role to additional roles if it's not already there
          if (currentRole !== 'user' && !additionalRoles.includes(currentRole)) {
            additionalRoles.push(currentRole);
          }
          finalRole = newRole;
        } else if (newPriority < currentPriority) {
          // Keep current role as primary, add new role as additional
          if (!additionalRoles.includes(newRole)) {
            additionalRoles.push(newRole);
          }
        } else {
          // Same priority level, keep current as primary, add new as additional
          if (!additionalRoles.includes(newRole)) {
            additionalRoles.push(newRole);
          }
        }

        // Remove duplicates and filter out 'user' from additional roles
        additionalRoles = [...new Set(additionalRoles)].filter(role => role !== 'user' && role !== finalRole);

        // Generate permissions for the user
        const rolePermissions = generateRolePermissions(finalRole, additionalRoles);

        // Update user with role hierarchy
        const userUpdate = {
          role: finalRole,
          additionalRoles: additionalRoles,
          roleHistory: [
            ...(targetUser.roleHistory || []),
            {
              action: 'role_approved',
              fromRole: currentRole,
              toRole: finalRole,
              requestedRole: newRole,
              approvedAt: new Date(),
              approvedBy: authResult.user?.id || authResult.userId,
              approvedByName: authResult.user?.name || 'Admin',
              requestId: requestId
            }
          ],
          lastRoleUpdate: new Date(),
          rolePermissions: rolePermissions,
          updatedAt: new Date(),
          roleApprovedBy: authResult.user?.id || authResult.userId,
          roleApprovedAt: new Date(),
          roleApprovedByName: authResult.user?.name || 'Admin'
        };

        // Update the user
        const userUpdateResult = await usersCollection.updateOne(
          { _id: targetUser._id },
          { $set: userUpdate }
        );
        
        console.log(`[${timestamp}] ✅ User ${targetUser.email} roles updated:`);
        console.log(`   Primary Role: ${currentRole} → ${finalRole}`);
        console.log(`   Additional Roles: [${additionalRoles.join(', ')}]`);
        console.log(`   Permissions: [${rolePermissions.slice(0, 5).join(', ')}${rolePermissions.length > 5 ? '...' : ''}]`);
        console.log(`   Modified Count: ${userUpdateResult.modifiedCount}`);
        
      } else {
        console.warn(`[${timestamp}] ⚠️ Could not find user to update role for request ${requestId}`);
      }
    }

    console.log(`[${timestamp}] ✅ Role request ${status}: ${requestId} by ${authResult.user?.name || 'Admin'}`);

    return res.status(200).json({
      success: true,
      message: `Role request ${status} successfully`,
      data: {
        id: requestId,
        requestType: roleRequest.requestType,
        userName: roleRequest.userName || roleRequest.requestData?.businessName,
        status: status,
        reviewedAt: updateData.reviewedAt,
        userRoleUpdated: status === 'approved'
      },
      reviewedBy: authResult.user?.name || 'Admin'
    });

  } catch (error) {
    console.error(`[${timestamp}] Admin update role request error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update role request',
      error: error.message
    });
  }
}

// Helper function to generate role permissions
function generateRolePermissions(primaryRole, additionalRoles) {
  const allRoles = [primaryRole, ...additionalRoles];
  const permissions = new Set();
  
  // Define permissions for each role
  const rolePermissions = {
    'super_admin': ['*'], // All permissions
    'admin': [
      'admin_panel_access', 'manage_users', 'manage_roles', 'manage_content',
      'approve_requests', 'view_analytics', 'manage_system'
    ],
    'ministry_official': [
      'view_transport_data', 'regulatory_oversight', 'policy_management',
      'compliance_monitoring', 'government_analytics'
    ],
    'transport_admin': [
      'manage_transport_routes', 'fleet_management', 'schedule_management',
      'transport_analytics', 'route_optimization'
    ],
    'dealership_admin': [
      'manage_dealership_listings', 'inventory_management', 'sales_analytics',
      'customer_management', 'dealership_settings'
    ],
    'rental_admin': [
      'manage_rental_fleet', 'booking_management', 'rental_analytics',
      'maintenance_scheduling', 'pricing_management'
    ],
    'transport_coordinator': [
      'coordinate_routes', 'driver_communication', 'schedule_coordination',
      'performance_monitoring', 'passenger_assistance'
    ],
    'journalist': [
      'create_articles', 'publish_content', 'content_analytics',
      'author_profile', 'editorial_tools', 'content_monetization'
    ],
    'courier': [
      'post_delivery_services', 'manage_delivery_routes', 'track_deliveries',
      'courier_analytics', 'customer_communication', 'earnings_tracking'
    ],
    'taxi_driver': [
      'driver_dashboard', 'trip_management', 'earnings_tracking',
      'customer_ratings', 'route_optimization'
    ],
    'user': ['basic_access', 'profile_management', 'browse_content']
  };
  
  // Collect all permissions from all roles
  allRoles.forEach(role => {
    const perms = rolePermissions[role] || [];
    perms.forEach(perm => permissions.add(perm));
  });
  
  return Array.from(permissions);
}

// === ENHANCED GET SINGLE ROLE REQUEST (Admin) ===
if (path.match(/^\/api\/admin\/role-requests\/[a-fA-F0-9]{24}$/) && req.method === 'GET') {
  console.log(`[${timestamp}] → GET SINGLE ROLE REQUEST (Admin) - Enhanced`);
  
  try {
    const authResult = await verifyAdminToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required'
      });
    }

    const requestId = path.split('/').pop();
    
    const { ObjectId } = await import('mongodb');
    const roleRequestsCollection = db.collection('rolerequests');
    const usersCollection = db.collection('users');
    
    const roleRequest = await roleRequestsCollection.findOne({
      _id: new ObjectId(requestId)
    });
    
    if (!roleRequest) {
      return res.status(404).json({
        success: false,
        message: 'Role request not found'
      });
    }
    
    console.log(`[${timestamp}] ✅ Role request found: ${roleRequest.requestType} for ${roleRequest.userName || roleRequest.requestData?.businessName}`);
    
    // ENHANCED: Get current user details for context
    let targetUser = null;
    let roleAnalysis = null;
    
    // Try to find the user using the same logic as PUT endpoint
    if (roleRequest.userId) {
      try {
        targetUser = await usersCollection.findOne({
          _id: new ObjectId(roleRequest.userId)
        });
      } catch (err) {
        console.error('Error finding user by ID:', err);
      }
    }
    
    // Try finding by email from request data
    if (!targetUser && roleRequest.requestData?.businessEmail) {
      targetUser = await usersCollection.findOne({
        email: roleRequest.requestData.businessEmail
      });
    }
    
    // Try finding by email from userEmail field
    if (!targetUser && roleRequest.userEmail) {
      targetUser = await usersCollection.findOne({
        email: roleRequest.userEmail
      });
    }

    // ENHANCED: Analyze role hierarchy impact if user found
    if (targetUser) {
      const currentRole = targetUser.role || 'user';
      const requestedRole = roleRequest.requestType;
      
      // Define role hierarchy (higher number = higher priority)
      const roleHierarchy = {
        'super_admin': 1000,
        'admin': 900,
        'ministry_official': 800,
        'transport_admin': 700,
        'dealership_admin': 600,
        'rental_admin': 600,
        'transport_coordinator': 500,
        'journalist': 400,
        'courier': 400,
        'taxi_driver': 300,
        'user': 100
      };

      const currentPriority = roleHierarchy[currentRole] || 100;
      const requestedPriority = roleHierarchy[requestedRole] || 100;
      
      // Predict what would happen if approved
      let predictedFinalRole = currentRole;
      let predictedAdditionalRoles = targetUser.additionalRoles || [];
      
      if (requestedPriority > currentPriority) {
        // Requested role would become primary
        predictedFinalRole = requestedRole;
        if (currentRole !== 'user' && !predictedAdditionalRoles.includes(currentRole)) {
          predictedAdditionalRoles = [...predictedAdditionalRoles, currentRole];
        }
      } else if (requestedPriority < currentPriority) {
        // Current role stays primary, requested becomes additional
        if (!predictedAdditionalRoles.includes(requestedRole)) {
          predictedAdditionalRoles = [...predictedAdditionalRoles, requestedRole];
        }
      } else {
        // Same priority, current stays primary, requested becomes additional
        if (!predictedAdditionalRoles.includes(requestedRole)) {
          predictedAdditionalRoles = [...predictedAdditionalRoles, requestedRole];
        }
      }
      
      // Remove duplicates and filter out 'user'
      predictedAdditionalRoles = [...new Set(predictedAdditionalRoles)].filter(role => role !== 'user' && role !== predictedFinalRole);
      
      roleAnalysis = {
        currentRole: currentRole,
        currentPriority: currentPriority,
        requestedRole: requestedRole,
        requestedPriority: requestedPriority,
        currentAdditionalRoles: targetUser.additionalRoles || [],
        willBecomeNewPrimary: requestedPriority > currentPriority,
        predictedOutcome: {
          finalRole: predictedFinalRole,
          additionalRoles: predictedAdditionalRoles
        },
        impactAnalysis: {
          roleChange: currentRole !== predictedFinalRole ? `${currentRole} → ${predictedFinalRole}` : 'No primary role change',
          additionalRolesChange: predictedAdditionalRoles.length !== (targetUser.additionalRoles || []).length,
          permissionsWillExpand: true // Always true when adding roles
        }
      };
    }
    
    // Enhanced transformation with role analysis
    const transformedRequest = {
      _id: roleRequest._id,
      role: roleRequest.requestType,
      userName: roleRequest.requestData?.businessName || roleRequest.userName || 'N/A',
      userEmail: roleRequest.requestData?.businessEmail || roleRequest.userEmail || 'N/A',
      status: roleRequest.status,
      submittedAt: roleRequest.createdAt,
      reviewedAt: roleRequest.reviewedAt,
      reviewedBy: roleRequest.reviewedBy,
      reviewedByName: roleRequest.reviewedByName,
      notes: roleRequest.reviewNotes || roleRequest.adminNotes || '',
      priority: roleRequest.priority || 'normal',
      reason: roleRequest.reason || '',
      applicationData: {
        // Include all possible fields for complete view
        ...roleRequest.requestData
      },
      // ENHANCED: Add role analysis for admin decision making
      userContext: targetUser ? {
        userId: targetUser._id,
        userName: targetUser.name,
        userEmail: targetUser.email,
        currentRole: targetUser.role,
        currentAdditionalRoles: targetUser.additionalRoles || [],
        accountCreated: targetUser.createdAt,
        lastLogin: targetUser.lastLogin,
        isVerified: targetUser.isVerified || false,
        roleHistory: targetUser.roleHistory || []
      } : null,
      roleAnalysis: roleAnalysis,
      // Add approval guidance
      approvalGuidance: roleAnalysis ? {
        recommendation: roleAnalysis.willBecomeNewPrimary ? 
          `⚠️ This will change user's primary role from ${roleAnalysis.currentRole} to ${roleAnalysis.requestedRole}` :
          `✅ This will add ${roleAnalysis.requestedRole} as additional role, keeping ${roleAnalysis.currentRole} as primary`,
        riskLevel: roleAnalysis.requestedPriority > 600 ? 'high' : 
                  roleAnalysis.requestedPriority > 400 ? 'medium' : 'low'
      } : null
    };
    
    return res.status(200).json({
      success: true,
      data: transformedRequest,
      viewedBy: authResult.user?.name || 'Admin'
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Enhanced get single role request error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch role request',
      error: error.message
    });
  }
}

// === DELETE ROLE REQUEST (Admin) ===
if (path.match(/^\/api\/admin\/role-requests\/[a-fA-F0-9]{24}$/) && req.method === 'DELETE') {
  console.log(`[${timestamp}] → DELETE ROLE REQUEST (Admin)`);
  
  try {
    const authResult = await verifyAdminToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required'
      });
    }

    const requestId = path.split('/').pop();
    
    const { ObjectId } = await import('mongodb');
    const roleRequestsCollection = db.collection('rolerequests');
    
    // Find existing role request
    const existingRequest = await roleRequestsCollection.findOne({ 
      _id: new ObjectId(requestId) 
    });
    
    if (!existingRequest) {
      return res.status(404).json({
        success: false,
        message: 'Role request not found'
      });
    }
    
    console.log(`[${timestamp}] Deleting role request ${requestId}: ${existingRequest.requestType} for ${existingRequest.userName || existingRequest.requestData?.businessName}`);
    
    // Soft delete - mark as deleted instead of removing
    const result = await roleRequestsCollection.updateOne(
      { _id: new ObjectId(requestId) },
      { 
        $set: { 
          status: 'deleted',
          deletedAt: new Date(),
          deletedBy: {
            userId: authResult.user?.id || authResult.userId,
            userEmail: authResult.user?.email || 'admin',
            userName: authResult.user?.name || 'Admin',
            timestamp: new Date()
          }
        }
      }
    );
    
    console.log(`[${timestamp}] ✅ Role request soft-deleted: ${existingRequest.requestType}`);
    
    return res.status(200).json({
      success: true,
      message: 'Role request deleted successfully',
      data: {
        id: requestId,
        requestType: existingRequest.requestType,
        userName: existingRequest.userName || existingRequest.requestData?.businessName,
        deletedAt: new Date()
      },
      deletedBy: authResult.user?.name || 'Admin'
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Delete role request error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete role request',
      error: error.message
    });
  }
}

// === GET ROLE REQUEST STATISTICS (Admin) ===
if (path === '/api/admin/role-requests/stats' && req.method === 'GET') {
  console.log(`[${timestamp}] → GET ROLE REQUEST STATISTICS (Admin)`);
  
  try {
    const authResult = await verifyAdminToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required'
      });
    }

    const roleRequestsCollection = db.collection('rolerequests');
    
    // Get overall statistics
    const [
      totalRequests,
      pendingRequests,
      approvedRequests,
      rejectedRequests
    ] = await Promise.all([
      roleRequestsCollection.countDocuments({}),
      roleRequestsCollection.countDocuments({ status: 'pending' }),
      roleRequestsCollection.countDocuments({ status: 'approved' }),
      roleRequestsCollection.countDocuments({ status: 'rejected' })
    ]);

    // Get statistics by role type
    const roleStats = await roleRequestsCollection.aggregate([
      {
        $group: {
          _id: '$requestType',
          total: { $sum: 1 },
          pending: { 
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          approved: { 
            $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
          },
          rejected: { 
            $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
          }
        }
      }
    ]).toArray();

    // Get recent requests
    const recentRequests = await roleRequestsCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    const transformedRecent = recentRequests.map(request => ({
      _id: request._id,
      role: request.requestType,
      userName: request.requestData?.businessName || request.userName || 'N/A',
      status: request.status,
      submittedAt: request.createdAt
    }));

    console.log(`[${timestamp}] ✅ Role request statistics generated`);

    return res.status(200).json({
      success: true,
      data: {
        overview: {
          totalRequests,
          pendingRequests,
          approvedRequests,
          rejectedRequests
        },
        byRole: roleStats.reduce((acc, stat) => {
          acc[stat._id] = {
            total: stat.total,
            pending: stat.pending,
            approved: stat.approved,
            rejected: stat.rejected
          };
          return acc;
        }, {}),
        recentRequests: transformedRecent
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] Get role request statistics error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch role request statistics',
      error: error.message
    });
  }
}

// ==================== END ADMIN ROLE REQUEST ENDPOINTS ===================="






        if (path === '/admin/user-listings' && req.method === 'GET') {
    console.log(`[${timestamp}] → GET ADMIN USER LISTINGS`);
    
    try {
      const { ObjectId } = await import('mongodb');
      const userSubmissionsCollection = db.collection('usersubmissions');
      
      // Get query parameters for filtering (same as your existing code)
      const status = req.query.status;
      const search = req.query.search;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const skip = (page - 1) * limit;

      // Build filter (same as your existing code)
      let filter = {};
      if (status && status !== 'all') {
        filter.status = status;
      }
      if (search) {
        filter.$or = [
          { 'listingData.title': { $regex: search, $options: 'i' } },
          { 'userName': { $regex: search, $options: 'i' } },
          { 'listingData.specifications.make': { $regex: search, $options: 'i' } },
          { 'listingData.specifications.model': { $regex: search, $options: 'i' } }
        ];
      }

      // Get submissions with pagination (same as your existing code)
      const submissions = await userSubmissionsCollection
        .find(filter)
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();

      const total = await userSubmissionsCollection.countDocuments(filter);

      // Get statistics (same as your existing code)
      const stats = await userSubmissionsCollection.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]).toArray();

      const statsMap = stats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {});

      const responseStats = {
        total: total,
        pending: statsMap.pending_review || 0,
        approved: statsMap.approved || 0,
        rejected: statsMap.rejected || 0,
        listing_created: statsMap.listing_created || 0
      };

      console.log(`[${timestamp}] ✅ Found ${submissions.length} user submissions`);

      return res.status(200).json({
        success: true,
        data: submissions,
        stats: responseStats,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        }
      });

    } catch (error) {
      console.error(`[${timestamp}] Get user submissions error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch user submissions',
        error: error.message
      });
    }
  }

  // === ADD THE REVIEW ENDPOINT TOO ===
// === COMPLETE ADMIN REVIEW ENDPOINT ===
// Replace your current endpoint with this complete implementation
if (path.match(/^\/admin\/user-listings\/[a-f\d]{24}\/review$/) && req.method === 'PUT') {
  console.log(`[${timestamp}] → REVIEW USER LISTING SUBMISSION`);
  
  try {
    // Admin authentication
    const authResult = await verifyAdminToken(req);
    if (!authResult.success) {
      console.error(`[${timestamp}] Admin auth failed:`, authResult.message);
      return res.status(401).json({
        success: false,
        message: 'Admin authentication required'
      });
    }

    // Extract submission ID from path
    const submissionId = path.split('/')[3]; // /admin/user-listings/{ID}/review
    console.log(`[${timestamp}] Processing review for submission: ${submissionId}`);
    
    // Validate submission ID format
    if (!submissionId || submissionId.length !== 24) {
      console.error(`[${timestamp}] Invalid submission ID format: ${submissionId}`);
      return res.status(400).json({
        success: false,
        message: 'Invalid submission ID format'
      });
    }
    
    // Parse request body
    let body = {};
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks).toString();
      if (rawBody) body = JSON.parse(rawBody);
      console.log(`[${timestamp}] Request body:`, body);
    } catch (parseError) {
      console.error(`[${timestamp}] Parse error:`, parseError);
      return res.status(400).json({
        success: false,
        message: 'Invalid request body format'
      });
    }

    const { action, adminNotes, subscriptionTier } = body;

    // Validate action
    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be approve or reject'
      });
    }

    // Connect to database
    const { ObjectId } = await import('mongodb');
    const userSubmissionsCollection = db.collection('usersubmissions');
    const listingsCollection = db.collection('listings'); // NEW: For free tier listings

    // Find the submission with proper ObjectId handling
    let submission;
    try {
      submission = await userSubmissionsCollection.findOne({
        _id: new ObjectId(submissionId)
      });
    } catch (objectIdError) {
      console.error(`[${timestamp}] ObjectId error:`, objectIdError);
      return res.status(400).json({
        success: false,
        message: 'Invalid submission ID format'
      });
    }

    if (!submission) {
      console.error(`[${timestamp}] Submission not found: ${submissionId}`);
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    console.log(`[${timestamp}] Found submission: ${submission.listingData?.title || 'Unknown'}`);

    // Check if submission can be reviewed
    if (submission.status && submission.status !== 'pending_review') {
      return res.status(400).json({
        success: false,
        message: `Submission has already been ${submission.status}`
      });
    }

    // Validate admin user
    const adminUser = authResult.user;
    if (!adminUser || !adminUser.id) {
      console.error(`[${timestamp}] Invalid admin user:`, adminUser);
      return res.status(401).json({
        success: false,
        message: 'Invalid admin user'
      });
    }

    // NEW: Check if this is a free tier submission
    const isFreeSubmission = submission.selectedTier === 'free' || submission.paymentRequired === false;
    console.log(`[${timestamp}] Is free submission: ${isFreeSubmission}`);

    if (action === 'approve') {
      if (isFreeSubmission) {
        // FREE TIER: Create listing immediately (no payment required)
        console.log(`[${timestamp}] Processing free tier approval`);
        
        try {
          // Transform submission data to listing format
          const listingData = submission.listingData || {};
          
          const transformedData = {
            title: listingData.title || 'Untitled Listing',
            description: listingData.description || '',
            price: listingData.pricing?.price || 0,
            images: (listingData.images || []).slice(0, 10), // Limit free tier to 10 images
            specifications: listingData.specifications || {},
            contact: listingData.contact || {},
            location: listingData.location || {},
            category: listingData.category || 'cars',
            condition: listingData.condition || 'used',
            views: 0,
            inquiries: 0,
            saves: 0,
            
            // Add dealer/seller info for free tier
            dealer: {
              businessName: listingData.contact?.sellerName || 'Private Seller',
              sellerType: 'private',
              user: submission.userId,
              contactMethod: listingData.contact?.contactMethod || 'phone',
              phone: listingData.contact?.phone,
              email: listingData.contact?.email || submission.userEmail,
              location: listingData.location || {}
            }
          };
          
          const newListing = {
            _id: new ObjectId(),
            ...transformedData,
            
            // Free tier specific settings
            dealerId: null,
            createdBy: submission.userId,
            sourceType: 'user_submission_free',
            submissionId: new ObjectId(submissionId),
            
            // Free tier subscription with limited features
            subscription: {
              tier: 'free',
              status: 'active',
              planName: 'Free Listing',
              startDate: new Date(),
              expiresAt: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)), // 30 days
              autoRenew: false,
              paymentRequired: false,
              features: {
                maxVisibility: 'limited',
                searchPriority: 1, // Lower priority
                allowFeatured: false,
                allowHomepage: false,
                maxPhotos: 10
              }
            },
            
            // Free tier gets basic visibility
            status: 'active',
            featured: false,
            priority: 1, // Lower priority than paid listings
            visibility: 'limited',
            searchBoost: 0,
            
            createdAt: new Date(),
            updatedAt: new Date()
          };

          // Insert the listing
          const listingResult = await listingsCollection.insertOne(newListing);
          console.log(`[${timestamp}] ✅ Free listing created: ${listingResult.insertedId}`);
          
          // Update submission status to listing_created
          const updateData = {
            status: 'listing_created',
            listingId: listingResult.insertedId,
            adminReview: {
              action: 'approve',
              adminNotes: adminNotes || 'Free listing approved and activated',
              reviewedBy: adminUser.id,
              reviewedByName: adminUser.name || adminUser.email,
              reviewedAt: new Date(),
              subscriptionTier: 'free'
            }
          };

          const updateResult = await userSubmissionsCollection.updateOne(
            { _id: new ObjectId(submissionId) },
            { $set: updateData }
          );

          if (updateResult.matchedCount === 0) {
            console.error(`[${timestamp}] Failed to update submission after listing creation`);
            // Try to cleanup the created listing
            await listingsCollection.deleteOne({ _id: listingResult.insertedId });
            throw new Error('Failed to update submission after listing creation');
          }

          console.log(`[${timestamp}] ✅ Free listing approved and activated: ${transformedData.title}`);

          return res.status(200).json({
            success: true,
            message: 'Free listing approved and activated successfully',
            data: {
              submissionId: submissionId,
              listingId: listingResult.insertedId,
              status: 'listing_created',
              action: 'approve',
              tier: 'free',
              paymentRequired: false,
              adminReview: updateData.adminReview,
              listingTitle: transformedData.title
            },
            reviewedBy: adminUser.name || adminUser.email
          });

        } catch (listingError) {
          console.error(`[${timestamp}] Error creating free listing:`, listingError);
          
          // Fallback to regular approval if listing creation fails
          const updateData = {
            status: 'approved',
            adminReview: {
              action: 'approve',
              adminNotes: (adminNotes || '') + ' (Free tier - listing creation failed, manual intervention needed)',
              reviewedBy: adminUser.id,
              reviewedByName: adminUser.name || adminUser.email,
              reviewedAt: new Date(),
              subscriptionTier: 'free',
              error: listingError.message
            }
          };

          await userSubmissionsCollection.updateOne(
            { _id: new ObjectId(submissionId) },
            { $set: updateData }
          );

          return res.status(200).json({
            success: true,
            message: 'Free submission approved but listing creation failed - manual intervention needed',
            data: {
              submissionId: submissionId,
              status: 'approved',
              action: 'approve',
              tier: 'free',
              requiresManualListing: true,
              adminReview: updateData.adminReview,
              error: listingError.message
            },
            reviewedBy: adminUser.name || adminUser.email
          });
        }

      } else {
        // PAID TIER: Regular approval (your existing logic)
        console.log(`[${timestamp}] Processing paid tier approval`);
        
        const updateData = {
          status: 'approved',
          adminReview: {
            action: 'approve',
            adminNotes: adminNotes || 'Listing approved - payment required',
            reviewedBy: adminUser.id,
            reviewedByName: adminUser.name || adminUser.email,
            reviewedAt: new Date(),
            subscriptionTier: subscriptionTier || 'basic'
          }
        };

        const updateResult = await userSubmissionsCollection.updateOne(
          { _id: new ObjectId(submissionId) },
          { $set: updateData }
        );

        if (updateResult.matchedCount === 0) {
          console.error(`[${timestamp}] No submission matched for update: ${submissionId}`);
          return res.status(404).json({
            success: false,
            message: 'Submission not found for update'
          });
        }

        console.log(`[${timestamp}] ✅ Paid submission approved: ${submission.listingData?.title || 'Unknown'}`);

        return res.status(200).json({
          success: true,
          message: 'Paid listing approved - user can now complete payment',
          data: {
            submissionId: submissionId,
            status: 'approved',
            action: 'approve',
            requiresPayment: true,
            subscriptionTier: subscriptionTier || 'basic',
            adminReview: updateData.adminReview
          },
          reviewedBy: adminUser.name || adminUser.email
        });
      }

    } else {
      // REJECT SUBMISSION (same for both free and paid)
      console.log(`[${timestamp}] Processing rejection`);
      
      const updateData = {
        status: 'rejected',
        adminReview: {
          action: 'reject',
          adminNotes: adminNotes || 'Submission did not meet listing requirements',
          reviewedBy: adminUser.id,
          reviewedByName: adminUser.name || adminUser.email,
          reviewedAt: new Date(),
          subscriptionTier: null
        }
      };

      const updateResult = await userSubmissionsCollection.updateOne(
        { _id: new ObjectId(submissionId) },
        { $set: updateData }
      );

      if (updateResult.matchedCount === 0) {
        console.error(`[${timestamp}] No submission matched for update: ${submissionId}`);
        return res.status(404).json({
          success: false,
          message: 'Submission not found for update'
        });
      }

      console.log(`[${timestamp}] ✅ Submission rejected: ${submission.listingData?.title || 'Unknown'}`);

      return res.status(200).json({
        success: true,
        message: 'Submission rejected successfully',
        data: {
          submissionId: submissionId,
          status: 'rejected',
          action: 'reject',
          adminReview: updateData.adminReview
        },
        reviewedBy: adminUser.name || adminUser.email
      });
    }

  } catch (error) {
    console.error(`[${timestamp}] Review submission error:`, error);
    
    // Enhanced error logging for debugging
    if (error.name === 'BSONTypeError' || error.message.includes('ObjectId')) {
      console.error(`[${timestamp}] MongoDB ObjectId error - check submission ID format`);
    }
    
    return res.status(500).json({
      success: false,
      message: 'Failed to review submission',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? {
        stack: error.stack,
        name: error.name
      } : undefined
    });
  }
}

// ============================================
// ADMIN PAYMENT ENDPOINTS - CORRECTED PATHS (NO /api PREFIX)
// Add these to your admin endpoints section in api/index.js
// ============================================

// @desc    Test endpoint for payment dashboard routing
// @route   GET /admin/payments/test
// @access  Private/Admin
if (path === '/admin/payments/test' && req.method === 'GET') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → ADMIN PAYMENT TEST ENDPOINT HIT`);
  
  return res.status(200).json({
    success: true,
    message: 'Admin payment dashboard API routing is working correctly!',
    timestamp: timestamp,
    path: path,
    method: req.method,
    note: 'Admin endpoints work without /api prefix'
  });
}

// @desc    Get paginated payment list for admin dashboard
// @route   GET /admin/payments/list
// @access  Private/Admin
if (path === '/admin/payments/list' && req.method === 'GET') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → GET ADMIN PAYMENTS LIST`);
  
  try {
    // Check admin authentication
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const { ObjectId } = await import('mongodb');
    const usersCollection = db.collection('users');
    const adminUser = await usersCollection.findOne({ _id: new ObjectId(authResult.user.id) });
    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    // Parse query parameters
    const url = new URL(req.url, `https://${req.headers.host}`);
    const page = parseInt(url.searchParams.get('page')) || 1;
    const limit = parseInt(url.searchParams.get('limit')) || 20;
    const status = url.searchParams.get('status') || 'all';
    const tier = url.searchParams.get('tier') || 'all';
    const search = url.searchParams.get('search') || '';
    const dateRange = url.searchParams.get('dateRange') || 'all';

    // Build query
    let query = {};
    if (status !== 'all') {
      query.status = status;
    }
    if (tier !== 'all') {
      query.subscriptionTier = tier;
    }
    if (search) {
      query.$or = [
        { userEmail: { $regex: search, $options: 'i' } },
        { transactionRef: { $regex: search, $options: 'i' } }
      ];
    }

    // Add date range filter
    if (dateRange !== 'all') {
      const now = new Date();
      let startDate;
      
      switch (dateRange) {
        case '1day':
          startDate = new Date(now.getTime() - (24 * 60 * 60 * 1000));
          break;
        case '7days':
          startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
          break;
        case '30days':
          startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
          break;
        default:
          startDate = null;
      }
      
      if (startDate) {
        query.createdAt = { $gte: startDate };
      }
    }

    const paymentsCollection = db.collection('payments');
    const skip = (page - 1) * limit;

    // Get payments with user information
    const paymentsAggregation = [
      { $match: query },
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      {
        $addFields: {
          userEmail: { $arrayElemAt: ['$userInfo.email', 0] },
          userName: { $arrayElemAt: ['$userInfo.name', 0] }
        }
      },
      { $project: { userInfo: 0 } },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit }
    ];

    const payments = await paymentsCollection.aggregate(paymentsAggregation).toArray();
    const totalPayments = await paymentsCollection.countDocuments(query);
    const totalPages = Math.ceil(totalPayments / limit);

    console.log(`[${timestamp}] ✅ Found ${payments.length} payments (page ${page}/${totalPages})`);

    return res.status(200).json({
      success: true,
      data: payments,
      pagination: {
        currentPage: page,
        totalPages,
        total: totalPayments,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        limit
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] Get payments list error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch payments list',
      error: error.message
    });
  }
}

// @desc    Get payment statistics for admin dashboard
// @route   GET /admin/payments/stats
// @access  Private/Admin
if (path === '/admin/payments/stats' && req.method === 'GET') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → GET PAYMENT STATISTICS`);
  
  try {
    // Check admin authentication
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const { ObjectId } = await import('mongodb');
    const usersCollection = db.collection('users');
    const adminUser = await usersCollection.findOne({ _id: new ObjectId(authResult.user.id) });
    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const paymentsCollection = db.collection('payments');
    const userSubmissionsCollection = db.collection('usersubmissions');

    // Get current date ranges
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Run parallel queries for statistics
    const [
      totalPayments,
      pendingPayments,
      completedPayments,
      todayPayments,
      monthlyRevenue,
      pendingSubmissions
    ] = await Promise.all([
      paymentsCollection.countDocuments(),
      paymentsCollection.countDocuments({ status: 'proof_submitted' }),
      paymentsCollection.countDocuments({ status: 'completed' }),
      paymentsCollection.countDocuments({ 
        status: 'completed',
        createdAt: { $gte: startOfToday }
      }),
      paymentsCollection.aggregate([
        {
          $match: {
            status: 'completed',
            createdAt: { $gte: startOfMonth }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: { $toDouble: '$amount' } }
          }
        }
      ]).toArray(),
      userSubmissionsCollection.countDocuments({
        status: 'approved',
        'adminReview.subscriptionTier': { $ne: 'free' },
        'paymentProof.status': { $ne: 'approved' }
      })
    ]);

    // Calculate average payment amount
    const avgPaymentResult = await paymentsCollection.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, avg: { $avg: { $toDouble: '$amount' } } } }
    ]).toArray();

    const stats = {
      totalPayments,
      pendingReview: pendingPayments + pendingSubmissions,
      approvedToday: todayPayments,
      totalRevenue: monthlyRevenue[0]?.total || 0,
      averageAmount: avgPaymentResult[0]?.avg || 0,
      conversionRate: totalPayments > 0 ? (completedPayments / totalPayments * 100).toFixed(1) : 0,
      pendingSubmissions,
      completedPayments
    };

    console.log(`[${timestamp}] ✅ Payment statistics generated:`, stats);

    return res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error(`[${timestamp}] Get payment stats error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch payment statistics',
      error: error.message
    });
  }
}

// @desc    Get pending manual payments (admin only)
// @route   GET /admin/payments/pending-manual
// @access  Private/Admin
if (path === '/admin/payments/pending-manual' && req.method === 'GET') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → GET PENDING MANUAL PAYMENTS`);
  
  try {
    // Check admin authentication
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const { ObjectId } = await import('mongodb');
    const usersCollection = db.collection('users');
    const adminUser = await usersCollection.findOne({ _id: new ObjectId(authResult.user.id) });
    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const paymentsCollection = db.collection('payments');
    const userSubmissionsCollection = db.collection('usersubmissions');

    // ENHANCED: Get payments with proof submitted OR pending review with user info
    const pendingPaymentsAggregation = [
      {
        $match: {
          $or: [
            { status: 'proof_submitted' },
            { status: 'pending_review' },
            { status: 'pending' }
          ],
          $or: [
            { paymentMethod: 'manual' },
            { paymentMethod: { $exists: false } }
          ]
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      {
        $addFields: {
          userEmail: { $arrayElemAt: ['$userInfo.email', 0] },
          userName: { $arrayElemAt: ['$userInfo.name', 0] }
        }
      },
      { $project: { userInfo: 0 } }, // Remove the userInfo array
      { $sort: { createdAt: -1 } }
    ];

    const pendingPayments = await paymentsCollection.aggregate(pendingPaymentsAggregation).toArray();

    // ENHANCED: Get submissions that need manual payment approval with user information
    const pendingSubmissionsQuery = {
      $or: [
        // Submissions that are approved but need payment
        {
          status: 'approved',
          'adminReview.subscriptionTier': { $exists: true, $ne: 'free' },
          $or: [
            { 'paymentProof.status': 'pending_admin_review' },
            { 'paymentProof.status': 'pending_review' },
            { 'paymentProof.submitted': { $ne: true } },
            { 'paymentProof.status': { $exists: false } },
            { 'paymentProof': { $exists: false } }
          ]
        },
        // Submissions with proof submitted awaiting approval
        {
          'paymentProof.submitted': true,
          'paymentProof.status': { $in: ['pending_admin_review', 'pending_review'] }
        }
      ]
    };

    const pendingSubmissionsAggregation = [
      { $match: pendingSubmissionsQuery },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'userInfo'
        }
      },
      {
        $addFields: {
          userEmail: { $arrayElemAt: ['$userInfo.email', 0] },
          userName: { $arrayElemAt: ['$userInfo.name', 0] }
        }
      },
      { $project: { userInfo: 0 } },
      { $sort: { submittedAt: -1 } }
    ];

    const pendingSubmissions = await userSubmissionsCollection
      .aggregate(pendingSubmissionsAggregation)
      .toArray();

    // Get additional metrics
    const urgentCount = pendingSubmissions.filter(sub => {
      const submittedDate = new Date(sub.submittedAt);
      const threeDaysAgo = new Date(Date.now() - (3 * 24 * 60 * 60 * 1000));
      return submittedDate < threeDaysAgo;
    }).length;

    // ENHANCED DEBUG: Log what we found with more details
    console.log(`[${timestamp}] 🔍 Debug Info:`, {
      pendingPaymentsCount: pendingPayments.length,
      pendingSubmissionsCount: pendingSubmissions.length,
      samplePayment: pendingPayments[0] ? {
        id: pendingPayments[0]._id,
        status: pendingPayments[0].status,
        paymentMethod: pendingPayments[0].paymentMethod,
        userEmail: pendingPayments[0].userEmail,
        amount: pendingPayments[0].amount,
        subscriptionTier: pendingPayments[0].subscriptionTier
      } : null,
      sampleSubmission: pendingSubmissions[0] ? {
        id: pendingSubmissions[0]._id,
        status: pendingSubmissions[0].status,
        userEmail: pendingSubmissions[0].userEmail,
        paymentProofStatus: pendingSubmissions[0].paymentProof?.status
      } : null
    });

    console.log(`[${timestamp}] ✅ Found ${pendingPayments.length} pending payments, ${pendingSubmissions.length} pending submissions`);

    return res.status(200).json({
      success: true,
      data: {
        pendingPayments,
        pendingSubmissions,
        stats: {
          totalPending: pendingPayments.length + pendingSubmissions.length,
          proofSubmitted: pendingPayments.length,
          awaitingPayment: pendingSubmissions.length,
          urgentReview: urgentCount
        }
      },
      debug: {
        pendingPaymentsCount: pendingPayments.length,
        pendingSubmissionsCount: pendingSubmissions.length,
        queriedStatuses: ['proof_submitted', 'pending_review', 'pending'],
        sampleData: {
          payment: pendingPayments[0] ? {
            hasUserEmail: !!pendingPayments[0].userEmail,
            hasAmount: !!pendingPayments[0].amount,
            hasTier: !!pendingPayments[0].subscriptionTier
          } : null
        }
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] Get pending payments error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch pending payments',
      error: error.message
    });
  }
}

// @desc    Debug endpoint to see actual payment and submission data
// @route   GET /admin/debug/payments-data
// @access  Private/Admin
if (path === '/admin/debug/payments-data' && req.method === 'GET') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → DEBUG PAYMENTS DATA`);
  
  try {
    // Check admin authentication
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const { ObjectId } = await import('mongodb');
    const usersCollection = db.collection('users');
    const adminUser = await usersCollection.findOne({ _id: new ObjectId(authResult.user.id) });
    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    const paymentsCollection = db.collection('payments');
    const userSubmissionsCollection = db.collection('usersubmissions');

    // Get sample data to understand the structure
    const [
      allPayments,
      allSubmissions,
      paymentStatuses,
      submissionStatuses
    ] = await Promise.all([
      paymentsCollection.find({}).limit(5).toArray(),
      userSubmissionsCollection.find({}).limit(5).toArray(),
      paymentsCollection.distinct('status'),
      userSubmissionsCollection.distinct('status')
    ]);

    // Count by status
    const paymentCounts = {};
    for (const status of paymentStatuses) {
      paymentCounts[status] = await paymentsCollection.countDocuments({ status });
    }

    const submissionCounts = {};
    for (const status of submissionStatuses) {
      submissionCounts[status] = await userSubmissionsCollection.countDocuments({ status });
    }

    // Check for payments with proof
    const paymentsWithProof = await paymentsCollection.find({
      'proofOfPayment': { $exists: true }
    }).limit(3).toArray();

    // Check for submissions needing payment
    const submissionsNeedingPayment = await userSubmissionsCollection.find({
      $or: [
        { 'adminReview.subscriptionTier': { $exists: true, $ne: 'free' } },
        { 'paymentProof': { $exists: true } }
      ]
    }).limit(3).toArray();

    return res.status(200).json({
      success: true,
      timestamp,
      debug: {
        paymentStatuses: paymentStatuses,
        submissionStatuses: submissionStatuses,
        paymentCounts,
        submissionCounts,
        samplePayments: allPayments.map(p => ({
          _id: p._id,
          status: p.status,
          paymentMethod: p.paymentMethod,
          hasProof: !!p.proofOfPayment,
          createdAt: p.createdAt
        })),
        sampleSubmissions: allSubmissions.map(s => ({
          _id: s._id,
          status: s.status,
          hasAdminReview: !!s.adminReview,
          subscriptionTier: s.adminReview?.subscriptionTier,
          hasPaymentProof: !!s.paymentProof,
          paymentProofStatus: s.paymentProof?.status,
          submittedAt: s.submittedAt
        })),
        paymentsWithProof: paymentsWithProof.map(p => ({
          _id: p._id,
          status: p.status,
          proofSubmitted: !!p.proofOfPayment?.submitted,
          proofFileUrl: p.proofOfPayment?.file?.url
        })),
        submissionsNeedingPayment: submissionsNeedingPayment.map(s => ({
          _id: s._id,
          status: s.status,
          tier: s.adminReview?.subscriptionTier,
          paymentProofStatus: s.paymentProof?.status
        }))
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] Debug payments data error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to debug payments data',
      error: error.message
    });
  }
}

// @desc    Admin approve manual payment with FULL FEATURED LISTING SUPPORT
// @route   POST /admin/payments/approve-manual
// @access  Private/Admin
if (path === '/admin/payments/approve-manual' && req.method === 'POST') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → ADMIN APPROVE MANUAL PAYMENT WITH ENHANCED ADDONS & FEATURED SUPPORT`);
  
  try {
    // Check admin authentication
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const { ObjectId } = await import('mongodb');
    const usersCollection = db.collection('users');
    const adminUser = await usersCollection.findOne({ _id: new ObjectId(authResult.user.id) });
    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required'
      });
    }

    let body = {};
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString();
    if (rawBody) {
      try {
        body = JSON.parse(rawBody);
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          message: 'Invalid JSON in request body'
        });
      }
    }

    const { 
      submissionId, 
      listingId, 
      subscriptionTier, 
      adminNotes, 
      manualVerification = true 
    } = body;

    console.log(`[${timestamp}] 📥 Request payload:`, body);

    if (!submissionId || !listingId || !subscriptionTier) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: submissionId, listingId, subscriptionTier'
      });
    }

    if (!ObjectId.isValid(submissionId) || !ObjectId.isValid(listingId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid ID format'
      });
    }

    const paymentsCollection = db.collection('payments');
    const listingsCollection = db.collection('listings');
    const userSubmissionsCollection = db.collection('usersubmissions');

    // ENHANCED: Get the submission to understand the pricing and addons
    let submission = await userSubmissionsCollection.findOne({ _id: new ObjectId(submissionId) });
    let payment = await paymentsCollection.findOne({ _id: new ObjectId(submissionId) });
    
    // If submissionId is actually a payment ID, try to find the related submission
    if (payment && !submission) {
      submission = await userSubmissionsCollection.findOne({
        userId: payment.user,
        'listingData._id': new ObjectId(listingId)
      });
    }

    // If we still don't have submission, try by listing ID
    if (!submission) {
      submission = await userSubmissionsCollection.findOne({
        $or: [
          { 'listingData._id': new ObjectId(listingId) },
          { listingId: new ObjectId(listingId) }
        ]
      });
    }

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Could not find submission record',
        debug: { submissionId, listingId }
      });
    }

    console.log(`[${timestamp}] 📋 Found submission:`, {
      id: submission._id,
      status: submission.status,
      hasAddons: !!submission.selectedAddons,
      addons: submission.selectedAddons,
      pricingDetails: submission.pricingDetails
    });

    // ENHANCED: Calculate pricing based on submission data
    const baseTierPricing = {
      basic: { name: 'Basic Plan', price: 50, duration: 30 },
      standard: { name: 'Standard Plan', price: 100, duration: 30 },
      premium: { name: 'Premium Plan', price: 200, duration: 45 }
    };

    const addonPricing = {
      featured: { name: 'Featured Listing', price: 200, duration: 30 },
      photography: { name: 'Professional Photography', price: 150 },
      review: { name: 'Professional Review', price: 100 },
      video: { name: 'Video Showcase', price: 300 }
    };

    // Calculate total cost based on submission data
    const tierDetails = baseTierPricing[subscriptionTier] || baseTierPricing.basic;
    let totalAmount = tierDetails.price;
    let appliedAddons = [];
    let isFeatured = false;

    // Process addons from submission
    if (submission.selectedAddons && Array.isArray(submission.selectedAddons)) {
      for (const addonKey of submission.selectedAddons) {
        if (addonPricing[addonKey]) {
          appliedAddons.push({
            key: addonKey,
            ...addonPricing[addonKey]
          });
          totalAmount += addonPricing[addonKey].price;
          
          // Check if featured addon is selected
          if (addonKey === 'featured') {
            isFeatured = true;
          }
        }
      }
    }

    // ENHANCED: Also check listingData for selected addons (alternative location)
    if (submission.listingData?.selectedAddons && Array.isArray(submission.listingData.selectedAddons)) {
      for (const addonKey of submission.listingData.selectedAddons) {
        if (addonPricing[addonKey]) {
          // Avoid duplicates
          const existingAddon = appliedAddons.find(addon => addon.key === addonKey);
          if (!existingAddon) {
            appliedAddons.push({
              key: addonKey,
              ...addonPricing[addonKey]
            });
            totalAmount += addonPricing[addonKey].price;
          }
          
          // Check if featured addon is selected
          if (addonKey === 'featured') {
            isFeatured = true;
          }
        }
      }
    }

    // Use actual total from pricing details if available
    if (submission.pricingDetails?.totalAmount) {
      totalAmount = submission.pricingDetails.totalAmount;
    }

    console.log(`[${timestamp}] 💰 Pricing calculation:`, {
      subscriptionTier,
      tierPrice: tierDetails.price,
      addons: appliedAddons,
      totalAmount,
      isFeatured
    });

    const userId = submission.userId;
    const txRef = payment?.transactionRef || `manual_approved_${listingId}_${Date.now()}`;

    // Create or update payment record
    if (payment) {
      await paymentsCollection.updateOne(
        { _id: payment._id },
        {
          $set: {
            status: 'completed',
            completedAt: new Date(),
            adminApproval: {
              approvedBy: adminUser._id,
              approvedByName: adminUser.name || adminUser.email,
              approvedAt: new Date(),
              adminNotes: adminNotes || 'Manual payment verification',
              manualVerification: true
            },
            subscriptionTier,
            amount: totalAmount,
            addons: appliedAddons,
            isFeatured,
            updatedAt: new Date()
          }
        }
      );
    } else {
      const paymentData = {
        user: new ObjectId(userId),
        listing: new ObjectId(listingId),
        transactionRef: txRef,
        amount: totalAmount,
        currency: 'BWP',
        subscriptionTier,
        status: 'completed',
        paymentMethod: 'manual',
        completedAt: new Date(),
        addons: appliedAddons,
        isFeatured,
        adminApproval: {
          approvedBy: adminUser._id,
          approvedByName: adminUser.name || adminUser.email,
          approvedAt: new Date(),
          adminNotes: adminNotes || 'Manual payment verification - admin approved',
          manualVerification: true
        },
        metadata: {
          manualPayment: true,
          adminApproved: true,
          directApproval: true,
          originalSubmissionId: submissionId
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = await paymentsCollection.insertOne(paymentData);
      payment = { _id: result.insertedId, ...paymentData };
    }

    // ENHANCED: Activate listing with proper subscription and featured status
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + tierDetails.duration);

    // Calculate featured expiry if featured addon is applied
    let featuredExpiresAt = null;
    if (isFeatured) {
      featuredExpiresAt = new Date();
      featuredExpiresAt.setDate(featuredExpiresAt.getDate() + (addonPricing.featured.duration || 30));
    }

    const listingUpdateData = {
      'subscription.tier': subscriptionTier,
      'subscription.status': 'active',
      'subscription.expiresAt': expiresAt,
      'subscription.paymentId': payment._id,
      'subscription.planName': tierDetails.name,
      'subscription.paymentMethod': 'manual',
      'subscription.manuallyApproved': true,
      'subscription.approvedBy': adminUser._id,
      'subscription.approvedAt': new Date(),
      'subscription.totalAmount': totalAmount,
      'subscription.addons': appliedAddons,
      status: 'published',
      updatedAt: new Date()
    };

    // ENHANCED: Add featured listing properties if featured addon is applied
    if (isFeatured) {
      // Set MULTIPLE featured flags for maximum compatibility
      listingUpdateData.featured = true; // Simple boolean flag (original method)
      listingUpdateData.isFeatured = true; // Alternative flag
      listingUpdateData.featuredUntil = featuredExpiresAt; // Expiry date
      
      // Detailed featured object
      listingUpdateData['featured.status'] = 'active';
      listingUpdateData['featured.activatedAt'] = new Date();
      listingUpdateData['featured.expiresAt'] = featuredExpiresAt;
      listingUpdateData['featured.paymentId'] = payment._id;
      listingUpdateData['featured.approvedBy'] = adminUser._id;
      
      console.log(`[${timestamp}] 🌟 Setting featured flags:`, {
        featured: true,
        isFeatured: true,
        featuredUntil: featuredExpiresAt,
        featuredStatus: 'active'
      });
    }

    const listingUpdateResult = await listingsCollection.updateOne(
      { _id: new ObjectId(listingId) },
      { $set: listingUpdateData }
    );

    // ENHANCED: Verify listing was updated and featured flag was set
    if (isFeatured) {
      const updatedListing = await listingsCollection.findOne({ _id: new ObjectId(listingId) });
      console.log(`[${timestamp}] 🔍 Verification - Updated listing featured status:`, {
        featured: updatedListing.featured,
        isFeatured: updatedListing.isFeatured,
        featuredUntil: updatedListing.featuredUntil,
        featuredObject: updatedListing['featured.status']
      });
    }

    // ENHANCED: Update submission with complete status and payment info
    const submissionUpdateResult = await userSubmissionsCollection.updateOne(
      { _id: submission._id },
      {
        $set: {
          status: 'approved_paid_active', // New status to indicate listing is live
          isLive: true, // Flag for real-time status checking
          'adminReview.action': 'approve',
          'adminReview.adminNotes': adminNotes || 'Payment manually verified and approved - listing activated',
          'adminReview.reviewedBy': adminUser._id,
          'adminReview.reviewedByName': adminUser.name || adminUser.email,
          'adminReview.reviewedAt': new Date(),
          'adminReview.subscriptionTier': subscriptionTier,
          'adminReview.totalCost': totalAmount,
          'adminReview.appliedAddons': appliedAddons,
          'adminReview.isFeatured': isFeatured,
          'adminReview.manualPaymentApproval': true,
          'adminReview.paymentVerifiedAt': new Date(),
          'adminReview.paymentNotes': adminNotes,
          'adminReview.listingActivatedAt': new Date(),
          'paymentProof.status': 'approved',
          'paymentProof.submitted': true,
          'paymentProof.approvedAt': new Date(),
          'paymentProof.approvedBy': adminUser._id,
          'paymentProof.approvedByName': adminUser.name || adminUser.email,
          'pricingDetails.status': 'completed',
          'pricingDetails.paidAmount': totalAmount,
          'pricingDetails.paymentCompletedAt': new Date(),
          listingCreatedAt: new Date(), // For timeline display
          updatedAt: new Date()
        }
      }
    );

    console.log(`[${timestamp}] ✅ Manual payment approved with full processing:`, {
      paymentId: payment._id,
      listingId,
      subscriptionTier,
      totalAmount,
      isFeatured,
      addonsApplied: appliedAddons.length,
      listingUpdated: listingUpdateResult.modifiedCount > 0,
      submissionUpdated: submissionUpdateResult.modifiedCount > 0,
      approvedBy: adminUser.name || adminUser.email
    });

    // ENHANCED: Log featured listing activation for debugging
    if (isFeatured) {
      console.log(`[${timestamp}] 🌟 FEATURED LISTING ACTIVATED:`, {
        listingId,
        featuredUntil: featuredExpiresAt,
        paymentId: payment._id,
        submissionId: submission._id,
        totalAmount,
        featuredAddonPrice: addonPricing.featured.price
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        paymentId: payment._id,
        transactionRef: txRef,
        listingId,
        subscriptionTier,
        status: 'completed',
        totalAmount,
        expiresAt,
        isFeatured,
        featuredExpiresAt,
        addons: appliedAddons,
        tierDetails: {
          name: tierDetails.name,
          price: tierDetails.price,
          duration: tierDetails.duration
        },
        adminApproval: {
          approvedBy: adminUser.name || adminUser.email,
          approvedAt: new Date(),
          adminNotes
        },
        // ENHANCED: Include real-time status info for frontend
        realTimeStatus: {
          isLive: true,
          paymentStatus: 'completed',
          listingStatus: 'published',
          featuredStatus: isFeatured ? 'active' : 'none'
        }
      },
      message: `Payment manually approved and listing activated successfully${isFeatured ? ' as featured listing' : ''}${appliedAddons.length > 0 ? ` with ${appliedAddons.length} addon${appliedAddons.length > 1 ? 's' : ''}` : ''}`
    });

  } catch (error) {
    console.error(`[${timestamp}] Admin approve payment error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to approve payment',
      error: error.message,
      timestamp
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

//     // === GET ALL USER LISTING SUBMISSIONS ===
// if (path === '/api/admin/user-listings' && req.method === 'GET') {
//   console.log(`[${timestamp}] → GET ADMIN USER LISTINGS`);
  
//   try {
//     const authResult = await verifyAdminToken(req);
//     if (!authResult.success) {
//       return res.status(401).json({
//         success: false,
//         message: 'Admin authentication required'
//       });
//     }

//     const { ObjectId } = await import('mongodb');
//     const userSubmissionsCollection = db.collection('usersubmissions');
    
//     // Get query parameters for filtering
//     const status = req.query.status;
//     const search = req.query.search;
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 20;
//     const skip = (page - 1) * limit;

//     // Build filter
//     let filter = {};
//     if (status && status !== 'all') {
//       filter.status = status;
//     }
//     if (search) {
//       filter.$or = [
//         { 'listingData.title': { $regex: search, $options: 'i' } },
//         { 'userName': { $regex: search, $options: 'i' } },
//         { 'listingData.specifications.make': { $regex: search, $options: 'i' } },
//         { 'listingData.specifications.model': { $regex: search, $options: 'i' } }
//       ];
//     }

//     // Get submissions with pagination
//     const submissions = await userSubmissionsCollection
//       .find(filter)
//       .sort({ submittedAt: -1 })
//       .skip(skip)
//       .limit(limit)
//       .toArray();

//     const total = await userSubmissionsCollection.countDocuments(filter);

//     // Get statistics
//     const stats = await userSubmissionsCollection.aggregate([
//       {
//         $group: {
//           _id: '$status',
//           count: { $sum: 1 }
//         }
//       }
//     ]).toArray();

//     const statsMap = stats.reduce((acc, stat) => {
//       acc[stat._id] = stat.count;
//       return acc;
//     }, {});

//     const responseStats = {
//       total: total,
//       pending: statsMap.pending_review || 0,
//       approved: statsMap.approved || 0,
//       rejected: statsMap.rejected || 0,
//       listing_created: statsMap.listing_created || 0
//     };

//     console.log(`[${timestamp}] ✅ Found ${submissions.length} user submissions`);

//     return res.status(200).json({
//       success: true,
//       data: submissions,
//       stats: responseStats,
//       pagination: {
//         page,
//         limit,
//         total,
//         totalPages: Math.ceil(total / limit),
//         hasNext: page < Math.ceil(total / limit),
//         hasPrev: page > 1
//       }
//     });

//   } catch (error) {
//     console.error(`[${timestamp}] Get user submissions error:`, error);
//     return res.status(500).json({
//       success: false,
//       message: 'Failed to fetch user submissions',
//       error: error.message
//     });
//   }
// }

// // === REVIEW USER LISTING SUBMISSION ===
// if (path.match(/^\/api\/admin\/user-listings\/[a-f\d]{24}\/review$/) && req.method === 'PUT') {
//   console.log(`[${timestamp}] → REVIEW USER LISTING SUBMISSION`);
  
//   try {
//     const authResult = await verifyAdminToken(req);
//     if (!authResult.success) {
//       return res.status(401).json({
//         success: false,
//         message: 'Admin authentication required'
//       });
//     }

//     const submissionId = path.split('/')[4]; // Extract ID from path
    
//     // Parse request body
//     let body = {};
//     try {
//       const chunks = [];
//       for await (const chunk of req) chunks.push(chunk);
//       const rawBody = Buffer.concat(chunks).toString();
//       if (rawBody) body = JSON.parse(rawBody);
//     } catch (parseError) {
//       return res.status(400).json({
//         success: false,
//         message: 'Invalid request body format'
//       });
//     }

//     const { action, adminNotes, subscriptionTier } = body;

//     if (!action || !['approve', 'reject'].includes(action)) {
//       return res.status(400).json({
//         success: false,
//         message: 'Valid action (approve/reject) is required'
//       });
//     }

//     const { ObjectId } = await import('mongodb');
//     const userSubmissionsCollection = db.collection('usersubmissions');
//     const listingsCollection = db.collection('listings');

//     // Find the submission
//     const submission = await userSubmissionsCollection.findOne({
//       _id: new ObjectId(submissionId)
//     });

//     if (!submission) {
//       return res.status(404).json({
//         success: false,
//         message: 'Submission not found'
//       });
//     }

//     if (submission.status !== 'pending_review') {
//       return res.status(400).json({
//         success: false,
//         message: 'Submission has already been reviewed'
//       });
//     }

//     const adminUser = authResult.user;
//     const timestamp = new Date();

//     if (action === 'approve') {
//       // Create the actual listing
//      const transformedData = transformUserSubmissionToListing(submission.listingData);

// if (action === 'approve') {
//   // Transform user submission data to proper listing format
//   const transformedData = transformUserSubmissionToListing(submission.listingData);
  
//   const newListing = {
//     _id: new ObjectId(),
//     ...transformedData,
    
//     // Add admin and submission tracking
//     dealerId: null, // No dealerId for user submissions
//     createdBy: submission.userId,
//     sourceType: 'user_submission',
//     submissionId: new ObjectId(submissionId),
    
//     // Subscription info
//     subscription: {
//       tier: subscriptionTier || 'basic',
//       status: 'active', // User listings are active immediately
//       planName: subscriptionTier === 'premium' ? 'Premium Plan' : 
//                subscriptionTier === 'standard' ? 'Standard Plan' : 'Basic Plan',
//       startDate: new Date(),
//       endDate: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)), // 30 days
//       autoRenew: false
//     },
    
//     // Timestamps
//     createdAt: new Date(),
//     updatedAt: new Date()
//   };

//       // Insert the new listing
//     const listingResult = await listingsCollection.insertOne(newListing);
  
//   // Update submission status
//   await userSubmissionsCollection.updateOne(
//     { _id: new ObjectId(submissionId) },
//     {
//       $set: {
//         status: 'listing_created',
//         listingId: listingResult.insertedId,
//         adminReview: {
//           reviewedBy: adminUser.name,
//           reviewedAt: timestamp,
//           action: 'approve',
//           notes: adminNotes || 'Listing approved and created',
//           subscriptionTier: subscriptionTier || 'basic'
//         }
//       }
//     }
//   );
  
//   console.log(`[${timestamp}] ✅ User listing approved and created: ${transformedData.title} (ID: ${listingResult.insertedId})`);
  
//   return res.status(200).json({
//     success: true,
//     message: 'Listing approved and created successfully',
//     data: {
//       listingId: listingResult.insertedId,
//       submissionId,
//       title: transformedData.title,
//       seller: transformedData.dealer.businessName
//     }
//   });
// }

//     } else {
//       // Reject the submission
//       await userSubmissionsCollection.updateOne(
//         { _id: new ObjectId(submissionId) },
//         {
//           $set: {
//             status: 'rejected',
//             adminReview: {
//               reviewedBy: adminUser.id,
//               reviewedAt: timestamp,
//               action: 'reject',
//               adminNotes: adminNotes || 'Submission did not meet listing requirements'
//             }
//           }
//         }
//       );

//       console.log(`[${timestamp}] ✅ Submission rejected: ${submissionId}`);

//       return res.status(200).json({
//         success: true,
//         message: 'Submission rejected',
//         data: {
//           submissionId: submissionId,
//           action: 'reject',
//           adminNotes: adminNotes
//         }
//       });
//     }

//   } catch (error) {
//     console.error(`[${timestamp}] Review submission error:`, error);
//     return res.status(500).json({
//       success: false,
//       message: 'Failed to review submission',
//       error: error.message
//     });
//   }
// }

// // === GET SINGLE USER SUBMISSION ===
// if (path.match(/^\/api\/admin\/user-listings\/[a-f\d]{24}$/) && req.method === 'GET') {
//   console.log(`[${timestamp}] → GET SINGLE USER SUBMISSION`);
  
//   try {
//     const authResult = await verifyAdminToken(req);
//     if (!authResult.success) {
//       return res.status(401).json({
//         success: false,
//         message: 'Admin authentication required'
//       });
//     }

//     const submissionId = path.split('/')[4]; // Extract ID from path
//     const { ObjectId } = await import('mongodb');
//     const userSubmissionsCollection = db.collection('usersubmissions');

//     const submission = await userSubmissionsCollection.findOne({
//       _id: new ObjectId(submissionId)
//     });

//     if (!submission) {
//       return res.status(404).json({
//         success: false,
//         message: 'Submission not found'
//       });
//     }

//     console.log(`[${timestamp}] ✅ Found submission: ${submission.listingData.title}`);

//     return res.status(200).json({
//       success: true,
//       data: submission
//     });

//   } catch (error) {
//     console.error(`[${timestamp}] Get submission error:`, error);
//     return res.status(500).json({
//       success: false,
//       message: 'Failed to fetch submission',
//       error: error.message
//     });
//   }
// }

// === USER LISTING SUBMISSION ENDPOINT (For users to submit listings) ===
if (path === '/api/user/submit-listing' && req.method === 'POST') {
  console.log(`[${timestamp}] → USER SUBMIT LISTING`);
  
  try {
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Parse request body
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

    // Validate required listing fields
    const requiredFields = ['title', 'pricing', 'specifications', 'contact'];
    const missingFields = requiredFields.filter(field => !listingData[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    const { ObjectId } = await import('mongodb');
    const userSubmissionsCollection = db.collection('usersubmissions');
    const usersCollection = db.collection('users');

    // Get user info
    const user = await usersCollection.findOne({
      _id: new ObjectId(authResult.user.id)
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Create submission record
    const submission = {
      _id: new ObjectId(),
      userId: new ObjectId(authResult.user.id),
      userName: user.name,
      userEmail: user.email,
      listingData: {
        ...listingData,
        contact: {
          ...listingData.contact,
          email: user.email // Ensure contact email matches user email
        }
      },
      status: 'pending_review',
      submittedAt: new Date(),
      adminReview: null,
      listingId: null
    };

    const result = await userSubmissionsCollection.insertOne(submission);

    console.log(`[${timestamp}] ✅ User listing submitted for review: ${submission.listingData.title}`);

    return res.status(201).json({
      success: true,
      message: 'Listing submitted for admin review successfully',
      data: {
        submissionId: result.insertedId,
        status: 'pending_review',
        estimatedReviewTime: '24-48 hours'
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] Submit listing error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit listing for review',
      error: error.message
    });
  }
}

// === GET USER'S OWN SUBMISSIONS ===
if (path === '/api/user/my-submissions' && req.method === 'GET') {
  console.log(`[${timestamp}] → GET USER SUBMISSIONS`);
  
  try {
    const authResult = await verifyUserToken(req);
    if (!authResult.success) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const { ObjectId } = await import('mongodb');
    const userSubmissionsCollection = db.collection('usersubmissions');

    const submissions = await userSubmissionsCollection
      .find({ userId: new ObjectId(authResult.user.id) })
      .sort({ submittedAt: -1 })
      .toArray();

    console.log(`[${timestamp}] ✅ Found ${submissions.length} user submissions`);

    return res.status(200).json({
      success: true,
      data: submissions,
      count: submissions.length
    });

  } catch (error) {
    console.error(`[${timestamp}] Get user submissions error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch your submissions',
      error: error.message
    });
  }
}


















  

 

 











    

// === FIXED STATS ENDPOINT WITH DEBUGGING ===
if ((path === '/api/stats/dashboard' || path === '/stats/dashboard') && req.method === 'GET') {
  console.log(`[${timestamp}] → DASHBOARD STATS (with debugging - ${path})`);
  
  try {
    const listingsCollection = db.collection('listings');
    const dealersCollection = db.collection('dealers');
    const serviceProvidersCollection = db.collection('serviceproviders');
    const rentalsCollection = db.collection('rentalvehicles');
    const transportCollection = db.collection('transportroutes');
    
    // ADD DEBUGGING: Check what's actually in the database
    const totalServiceProviders = await serviceProvidersCollection.countDocuments({});
    const activeServiceProviders = await serviceProvidersCollection.countDocuments({ status: 'active' });
    const allStatusServiceProviders = await serviceProvidersCollection.countDocuments({ 
      status: { $in: ['active', 'inactive', 'suspended'] } 
    });
    
    console.log(`[${timestamp}] Service Providers Debug:`, {
      total: totalServiceProviders,
      active: activeServiceProviders,
      allValidStatus: allStatusServiceProviders
    });
    
    // FIXED QUERIES
    const [
      carListings,
      dealerCount,
      serviceProviders, // FIXED: Use correct status values
      transportProviders, // FIXED: Count only transport companies
      rentalCount,
      transportRoutes
    ] = await Promise.all([
      listingsCollection.countDocuments({ status: { $ne: 'deleted' } }),
      dealersCollection.countDocuments({ status: { $ne: 'deleted' } }),
      // FIX: Count all service providers with valid statuses
      serviceProvidersCollection.countDocuments({ 
        status: { $in: ['active', 'inactive', 'suspended'] } 
      }),
      // FIX: Count only transport service providers
      serviceProvidersCollection.countDocuments({ 
        status: { $in: ['active', 'inactive', 'suspended'] },
        providerType: { $in: ['public_transport', 'transport', 'bus', 'taxi'] }
      }),
      rentalsCollection.countDocuments({ status: { $ne: 'deleted' } }),
      transportCollection.countDocuments({})
    ]);
    
    console.log(`[${timestamp}] Final Stats:`, {
      carListings,
      dealerCount, 
      serviceProviders,
      transportProviders,
      rentalCount,
      transportRoutes
    });
    
    const happyCustomers = Math.floor((carListings + serviceProviders) * 1.5) || 150;
    const verifiedDealers = Math.floor(dealerCount * 0.8) || Math.min(dealerCount, 20);
    
    const statsData = {
      carListings,
      happyCustomers,
      verifiedDealers,
      transportProviders, // Should show 2 transport companies
      dealerCount,
      serviceProviders, // Should show total service providers
      rentalCount,
      transportCount: transportRoutes,
      totalListings: carListings,
      totalDealers: dealerCount,
      totalProviders: serviceProviders,
      totalRentals: rentalCount,
      totalTransport: transportRoutes
    };
    
    return res.status(200).json(statsData);
    
  } catch (error) {
    console.error(`[${timestamp}] Dashboard stats error:`, error);
    return res.status(200).json({
      carListings: 6,
      happyCustomers: 450,
      verifiedDealers: 20,
      transportProviders: 2, // Fixed fallback
      dealerCount: 25,
      serviceProviders: 0, // Will show actual count after fix
      rentalCount: 12,
      transportCount: 4
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
    
   

    // === RENTALS ===
  // === FIX 3: ENHANCE YOUR EXISTING GENERAL RENTALS ENDPOINT ===
// Replace your existing general /rentals GET endpoint with this enhanced version:

if (path === '/rentals' && req.method === 'GET') {
  console.log(`[${timestamp}] → ENHANCED RENTALS WITH SERVER-SIDE FILTERING`);
  
  try {
    const rentalsCollection = db.collection('rentalvehicles');
    
    // Build enhanced filter with server-side filtering
    let filter = { status: { $ne: 'deleted' } };
    
    // Apply status filter
    const status = searchParams.get('status');
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    // Apply availability filter
    const availability = searchParams.get('availability');
    if (availability && availability !== 'all') {
      filter.availability = availability;
    }
    
    // Apply provider filter
    const providerId = searchParams.get('providerId');
    if (providerId) {
      const { ObjectId } = await import('mongodb');
      if (providerId.length === 24 && /^[0-9a-fA-F]{24}$/.test(providerId)) {
        try {
          filter.providerId = new ObjectId(providerId);
        } catch (error) {
          filter.providerId = providerId;
        }
      } else {
        filter.providerId = providerId;
      }
    }
    
    // Apply featured filter
    const featured = searchParams.get('featured');
    if (featured === 'true') {
      filter.featured = true;
    }
    
    // Enhanced Search functionality
    const search = searchParams.get('search');
    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      filter.$or = [
        { name: searchRegex },
        { title: searchRegex },
        { description: searchRegex },
        { 'specifications.make': searchRegex },
        { 'specifications.model': searchRegex },
        { 'provider.businessName': searchRegex },
        { 'provider.name': searchRegex }
      ];
    }
    
    // Enhanced Vehicle Type Filtering (Server-Side)
    if (searchParams.get('vehicleType') && searchParams.get('vehicleType') !== 'All') {
      const vehicleType = searchParams.get('vehicleType');
      filter.$or = [
        ...(filter.$or || []),
        { category: vehicleType },
        { 'specifications.category': vehicleType },
        { type: vehicleType },
        { vehicleType: vehicleType }
      ];
    }
    
    // Enhanced Transmission Filtering (Server-Side)  
    if (searchParams.get('transmission') && searchParams.get('transmission') !== 'All') {
      const transmission = searchParams.get('transmission');
      filter.$or = [
        ...(filter.$or || []),
        { 'specifications.transmission': { $regex: transmission, $options: 'i' } },
        { transmission: { $regex: transmission, $options: 'i' } }
      ];
    }
    
    // Enhanced Price Range Filtering (Server-Side)
    if (searchParams.get('priceRange') && searchParams.get('priceRange') !== 'All') {
      const priceRange = searchParams.get('priceRange');
      let minPrice = 0;
      let maxPrice = Infinity;
      
      if (priceRange === 'Economy') {
        maxPrice = 500;
      } else if (priceRange === 'Mid-range') {
        minPrice = 500;
        maxPrice = 1000;
      } else if (priceRange === 'Premium') {
        minPrice = 1000;
      }
      
      filter.$or = [
        ...(filter.$or || []),
        { dailyRate: { $gte: minPrice, $lte: maxPrice } },
        { 'rates.daily': { $gte: minPrice, $lte: maxPrice } }
      ];
    }
    
    // Location/City filtering
    const city = searchParams.get('city');
    if (city) {
      const cityRegex = { $regex: city, $options: 'i' };
      filter.$or = [
        ...(filter.$or || []),
        { 'location.city': cityRegex },
        { 'provider.location.city': cityRegex }
      ];
    }
    
    // Pagination
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 20;
    const skip = (page - 1) * limit;
    
    // Sorting
    const sortParam = searchParams.get('sort') || '-createdAt';
    let sort = {};
    if (sortParam.startsWith('-')) {
      sort[sortParam.substring(1)] = -1;
    } else {
      sort[sortParam] = 1;
    }
    
    console.log(`[${timestamp}] ENHANCED RENTALS QUERY:`, filter);
    
    // Get total count
    const total = await rentalsCollection.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);
    
    // Get rentals
    const rentals = await rentalsCollection
      .find(filter)
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .toArray();
    
    // Enhanced formatting for frontend
    const formattedRentals = rentals.map(rental => ({
      _id: rental._id,
      id: rental._id,
      name: rental.name || rental.title || 'Rental Vehicle',
      title: rental.title || rental.name || 'Rental Vehicle',
      description: rental.description || '',
      specifications: rental.specifications || {},
      features: Array.isArray(rental.features) ? rental.features : [],
      rates: rental.rates || {},
      images: Array.isArray(rental.images) ? rental.images : [],
      primaryImage: rental.images && rental.images.length > 0 ? 
        (rental.images.find(img => img.isPrimary)?.url || rental.images[0]?.url || null) : null,
      status: String(rental.status || 'available'),
      availability: String(rental.availability || 'available'),
      providerId: rental.providerId,
      provider: rental.provider || {},
      location: rental.location || {},
      contact: rental.contact || {},
      averageRating: rental.averageRating || 0,
      totalReviews: rental.reviews ? rental.reviews.length : 0,
      views: rental.views || 0,
      bookings: rental.bookings || 0,
      featured: Boolean(rental.featured),
      verified: Boolean(rental.verified),
      createdAt: rental.createdAt ? new Date(rental.createdAt).toISOString() : null,
      updatedAt: rental.updatedAt ? new Date(rental.updatedAt).toISOString() : null
    }));
    
    console.log(`[${timestamp}] ✅ Enhanced rentals query returned ${formattedRentals.length} of ${total} total`);
    
    return res.status(200).json({
      success: true,
      data: formattedRentals,
      vehicles: formattedRentals, // Alternative format
      total: total,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        total: total,
        limit: limit,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      count: formattedRentals.length,
      message: `Found ${formattedRentals.length} rental vehicles`,
      serverSideFiltering: true // Indicator that server-side filtering is active
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Enhanced rentals error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching rental vehicles',
      error: error.message,
      data: [],
      vehicles: [],
      pagination: {
        currentPage: 1,
        totalPages: 0,
        total: 0
      }
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

// 3. MISSING: /api/rentals (frontend calls this with fetch)
if (path === '/api/rentals' && req.method === 'GET') {
  console.log(`[${timestamp}] → API RENTALS`);
  
  try {
    const rentalsCollection = db.collection('rentalvehicles');
    
    let filter = { status: { $ne: 'deleted' } };
    
    if (searchParams.get('status') && searchParams.get('status') !== 'all') {
      filter.status = searchParams.get('status');
    }
    
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 20;
    const skip = (page - 1) * limit;
    
    const total = await rentalsCollection.countDocuments(filter);
    const rentals = await rentalsCollection
      .find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .toArray();
    
    return res.status(200).json({
      success: true,
      data: rentals,
      vehicles: rentals,
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
    console.error(`[${timestamp}] API Rentals error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching rental vehicles',
      error: error.message,
      data: [],
      total: 0
    });
  }
}




















// ==================== ADD THESE MISSING CAR FILTER ENDPOINTS TO YOUR index.js ====================
// Place these BEFORE your "=== NOT FOUND ===" section

// FIXED: Models endpoint - ensure this works properly
if (path.match(/^\/api\/models\/(.+)$/) && req.method === 'GET') {
  const make = decodeURIComponent(path.split('/')[3]);
  console.log(`[${timestamp}] → GET MODELS FOR MAKE: "${make}"`);
  
  try {
    if (!db) {
      await connectToDatabase();
    }
    
    const listingsCollection = db.collection('listings');
    
    // Get models for the specific make (case insensitive)
    const models = await listingsCollection.distinct('specifications.model', {
      'specifications.make': { $regex: new RegExp(`^${make}$`, 'i') },
      status: 'active', // Only get models from active listings
      'specifications.model': { $exists: true, $ne: null, $ne: '' }
    });
    
    // Clean and sort models
    const cleanModels = models
      .filter(Boolean)
      .filter(model => typeof model === 'string' && model.trim().length > 0)
      .map(model => model.trim())
      .sort();
    
    console.log(`Found ${cleanModels.length} models for make "${make}":`, cleanModels);
    
    // If no models found, provide fallback
    if (cleanModels.length === 0) {
      const fallbackModels = {
        'BMW': ['1 Series', '2 Series', '3 Series', '4 Series', '5 Series', '6 Series', '7 Series', 'X1', 'X3', 'X5', 'X6', 'M3', 'M4', 'M5'],
        'Mercedes-Benz': ['A-Class', 'C-Class', 'E-Class', 'S-Class', 'CLA', 'GLA', 'GLC', 'GLE', 'GLS'],
        'Mercedes': ['A-Class', 'C-Class', 'E-Class', 'S-Class', 'CLA', 'GLA', 'GLC', 'GLE', 'GLS'],
        'Toyota': ['Camry', 'Corolla', 'RAV4', 'Highlander', 'Prius', '4Runner', 'Land Cruiser', 'Hilux', 'Prado'],
        'Honda': ['Civic', 'Accord', 'CR-V', 'HR-V', 'Pilot', 'Ridgeline'],
        'Ford': ['F-150', 'Mustang', 'Explorer', 'Escape', 'Ranger', 'Focus', 'Fusion'],
        'Audi': ['A3', 'A4', 'A6', 'A8', 'Q3', 'Q5', 'Q7', 'Q8', 'TT'],
        'Nissan': ['Altima', 'Maxima', 'Sentra', 'Rogue', 'Murano', 'Pathfinder', 'Titan'],
        'Mazda': ['Mazda3', 'Mazda6', 'CX-3', 'CX-5', 'CX-9', 'MX-5'],
        'Volkswagen': ['Golf', 'Jetta', 'Passat', 'Tiguan', 'Atlas', 'Beetle'],
        'Hyundai': ['Elantra', 'Sonata', 'Tucson', 'Santa Fe', 'Genesis', 'Kona'],
        'Kia': ['Forte', 'Optima', 'Sorento', 'Sportage', 'Stinger', 'Telluride']
      };
      
      const fallbackForMake = fallbackModels[make] || [];
      console.log(`Using fallback models for ${make}: ${fallbackForMake.length} models`);
      
      return res.status(200).json({
        success: true,
        data: fallbackForMake,
        message: `Models for ${make} (fallback data)`,
        source: 'fallback'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: cleanModels,
      message: `Found ${cleanModels.length} models for ${make}`,
      source: 'database'
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

// === MISSING: /models/{make} (CarFilter expects this) ===
if (path.match(/^\/models\/(.+)$/) && req.method === 'GET') {
  const make = path.split('/')[2];
  console.log(`[${timestamp}] → GET MODELS FOR MAKE: ${make}`);
  
  try {
    const listingsCollection = db.collection('listings');
    
    // Get unique models for the specified make
    const models = await listingsCollection.distinct('specifications.model', {
      'specifications.make': { $regex: new RegExp(`^${make}$`, 'i') }, // Case-insensitive exact match
      status: { $ne: 'deleted' },
      'specifications.model': { $exists: true, $ne: null, $ne: '' }
    });
    
    // Sort and clean models
    const cleanModels = models.filter(Boolean).sort();
    
    console.log(`[${timestamp}] ✅ Found ${cleanModels.length} models for make: ${make}`);
    
    // If no models found in database, return fallback data
    if (cleanModels.length === 0) {
      const fallbackModels = {
        'BMW': ['1 Series', '2 Series', '3 Series', '4 Series', '5 Series', '6 Series', '7 Series', 'X1', 'X3', 'X5', 'X6', 'M3', 'M4', 'M5'],
        'Mercedes-Benz': ['A-Class', 'C-Class', 'E-Class', 'S-Class', 'GLA', 'GLC', 'GLE', 'GLS', 'AMG GT'],
        'Mercedes': ['A-Class', 'C-Class', 'E-Class', 'S-Class', 'GLA', 'GLC', 'GLE', 'GLS', 'AMG GT'],
        'Toyota': ['Camry', 'Corolla', 'RAV4', 'Highlander', 'Tacoma', 'Tundra', 'Prius', '4Runner', 'Land Cruiser'],
        'Ford': ['F-150', 'Mustang', 'Explorer', 'Escape', 'Edge', 'Ranger', 'Bronco', 'Focus', 'Fusion'],
        'Honda': ['Civic', 'Accord', 'CR-V', 'Pilot', 'Fit', 'HR-V', 'Ridgeline', 'Passport'],
        'Nissan': ['Altima', 'Sentra', 'Rogue', 'Pathfinder', 'Frontier', 'Titan', 'Murano', 'Maxima'],
        'Volkswagen': ['Golf', 'Jetta', 'Passat', 'Tiguan', 'Atlas', 'Beetle', 'Arteon'],
        'Audi': ['A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'Q3', 'Q5', 'Q7', 'Q8', 'TT', 'R8']
      };
      
      const fallbackForMake = fallbackModels[make] || fallbackModels[make.charAt(0).toUpperCase() + make.slice(1).toLowerCase()];
      
      if (fallbackForMake) {
        console.log(`[${timestamp}] Using fallback models for ${make}: ${fallbackForMake.length} models`);
        return res.status(200).json({
          success: true,
          data: fallbackForMake,
          message: `Models for ${make} (fallback data)`
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






 // ==================== SECTION 1: CRITICAL FILTER ENDPOINTS (MUST BE FIRST) ====================


 // ==================== SECTION 2: AUTHENTICATION ENDPOINTS ====================


 // ==================== SECTION 3: ADMIN ENDPOINTS ====================
// ==================== SECTION 3: ADMIN ENDPOINTS ====================
// ==================== SECTION 3: ADMIN ENDPOINTS ====================
// // ==================== SECTION 3: ADMIN ENDPOINTS ====================














// ========================================
// COMPLETE FIXED NEWS ENDPOINTS - PART 1 (Admin Endpoints)
// Add these to your api/index.js file
// FIXED: JWT handling, data structure consistency, proper error handling
// ========================================

// === CREATE ARTICLE (ADMIN ONLY) ===
if (path === '/api/news' && req.method === 'POST') {
  console.log(`[${timestamp}] → CREATE ARTICLE (ADMIN)`);
  
  try {
    // Authentication check
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Admin authentication required' 
      });
    }

    const token = authHeader.substring(7);
    let decoded;
    try {
      const jwt = await import('jsonwebtoken');
      decoded = jwt.default.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid authentication token' 
      });
    }

    const { ObjectId } = await import('mongodb');

    // Get user and check admin role - FIXED: using decoded.userId consistently
    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({ _id: new ObjectId(decoded.userId) });
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Admin access required to create articles' 
      });
    }

    console.log(`📝 ARTICLE CREATION: Authenticated admin ${user.name}`);

    // Parse multipart form data
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);
    
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    
    let articleData = {};
    let featuredImageFile = null;
    
    if (boundaryMatch) {
      // Handle multipart form data
      const boundary = boundaryMatch[1];
      const bodyString = rawBody.toString('binary');
      const parts = bodyString.split(`--${boundary}`);
      
      for (const part of parts) {
        if (part.includes('Content-Disposition: form-data')) {
          const nameMatch = part.match(/name="([^"]+)"/);
          if (nameMatch) {
            const fieldName = nameMatch[1];
            
            if (part.includes('filename=')) {
              // File upload handling
              const filenameMatch = part.match(/filename="([^"]+)"/);
              if (filenameMatch && filenameMatch[1] && filenameMatch[1] !== '""') {
                const filename = filenameMatch[1];
                
                let fileType = 'image/jpeg';
                const contentTypeMatch = part.match(/Content-Type: ([^\r\n]+)/);
                if (contentTypeMatch) {
                  fileType = contentTypeMatch[1].trim();
                }
                
                const doubleCrlfIndex = part.indexOf('\r\n\r\n');
                if (doubleCrlfIndex !== -1) {
                  const fileDataBinary = part.substring(doubleCrlfIndex + 4);
                  const fileBuffer = Buffer.from(fileDataBinary, 'binary');
                  
                  featuredImageFile = {
                    originalname: filename,
                    mimetype: fileType,
                    buffer: fileBuffer,
                    size: fileBuffer.length
                  };
                  
                  console.log(`📸 Featured image received: ${filename} (${fileBuffer.length} bytes)`);
                }
              }
            } else {
              // Regular form field
              const doubleCrlfIndex = part.indexOf('\r\n\r\n');
              if (doubleCrlfIndex !== -1) {
                let fieldValue = part.substring(doubleCrlfIndex + 4).trim();
                fieldValue = fieldValue.replace(/\r\n$/, '');
                
                if (fieldValue) {
                  if (fieldName === 'tags' && fieldValue.startsWith('[')) {
                    try {
                      articleData[fieldName] = JSON.parse(fieldValue);
                    } catch (e) {
                      articleData[fieldName] = fieldValue.split(',').map(tag => tag.trim()).filter(tag => tag);
                    }
                  } else {
                    articleData[fieldName] = fieldValue;
                  }
                }
              }
            }
          }
        }
      }
    } else {
      // Handle JSON data
      try {
        articleData = JSON.parse(rawBody.toString());
      } catch (error) {
        console.error('Error parsing JSON:', error);
        return res.status(400).json({
          success: false,
          message: 'Invalid JSON data'
        });
      }
    }

    console.log('📝 Article data received:', {
      title: articleData.title,
      category: articleData.category,
      status: articleData.status,
      hasImage: !!featuredImageFile
    });

    // Validate required fields
    if (!articleData.title || !articleData.content || !articleData.category) {
      return res.status(400).json({
        success: false,
        message: 'Title, content, and category are required'
      });
    }

    // Handle featured image upload to S3 if provided
    let featuredImageData = null;
    if (featuredImageFile) {
      try {
        const { uploadToS3 } = await import('../utils/s3Upload.js');
        const uploadResult = await uploadToS3(featuredImageFile, 'news');
        
        featuredImageData = {
          url: uploadResult.url,
          key: uploadResult.key,
          size: uploadResult.size,
          mimetype: uploadResult.mimetype,
          caption: articleData.imageCaption || '',
          credit: articleData.imageCredit || ''
        };
        
        console.log('✅ Featured image uploaded to S3:', uploadResult.url);
      } catch (uploadError) {
        console.error('❌ S3 upload failed:', uploadError);
        // Continue without image rather than failing the entire article creation
      }
    }

    // Generate slug from title
    const generateSlug = (title) => {
      return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 150);
    };

    // Prepare article data for database
    const newArticleData = {
      title: articleData.title,
      subtitle: articleData.subtitle || '',
      slug: generateSlug(articleData.title),
      content: articleData.content,
      category: articleData.category,
      tags: articleData.tags || [],
      status: articleData.status || 'draft',
      author: new ObjectId(user._id),
      authorName: user.name || 'Admin User',
      publishDate: articleData.publishDate ? new Date(articleData.publishDate) : new Date(),
      featuredImage: featuredImageData,
      seo: {
        metaTitle: articleData.metaTitle || articleData.title,
        metaDescription: articleData.metaDescription || articleData.subtitle || '',
        metaKeywords: articleData.metaKeywords || ''
      },
      metadata: {
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        readTime: Math.max(1, Math.ceil((articleData.content?.length || 0) / 1000))
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log('💾 Creating article in database...');

    // Insert into MongoDB
    const newsCollection = db.collection('news');
    const result = await newsCollection.insertOne(newArticleData);
    
    console.log(`✅ Article created successfully with ID: ${result.insertedId}`);

    // Get the created article with populated author data
    const createdArticle = await newsCollection.findOne({ _id: result.insertedId });
    
    // Add user data manually since we already have it
    createdArticle.author = {
      _id: user._id,
      name: user.name,
      email: user.email
    };

    return res.status(201).json({
      success: true,
      message: 'Article created successfully',
      data: createdArticle
    });

  } catch (error) {
    console.error(`[${timestamp}] Create article error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create article',
      error: error.message
    });
  }
}

// === GET ARTICLES ===
if (path === '/api/news' && req.method === 'GET') {
  console.log(`[${timestamp}] → GET ARTICLES`);
  
  try {
    const newsCollection = db.collection('news');

    // Parse query parameters
    const url = new URL(req.url, `http://${req.headers.host}`);
    const searchParams = url.searchParams;
    
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 10;
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    // Check if admin is requesting
    let isAdminRequest = false;
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const jwt = await import('jsonwebtoken');
        const decoded = jwt.default.verify(token, process.env.JWT_SECRET);
        const { ObjectId } = await import('mongodb');
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ _id: new ObjectId(decoded.userId) });
        isAdminRequest = user && user.role === 'admin';
      }
    } catch (authError) {
      // Not authenticated or not admin - treat as public request
      isAdminRequest = false;
    }

    // Build query
    let query = {};
    
    if (category && category !== 'all') {
      query.category = category;
    }
    
    if (status && status !== 'all') {
      query.status = status;
    } else if (!isAdminRequest) {
      // For public access, only show published articles
      query.status = 'published';
      query.publishDate = { $lte: new Date() };
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    console.log('📊 Article query:', query, 'Admin request:', isAdminRequest);

    // Get total count
    const total = await newsCollection.countDocuments(query);
    
    // Get articles with pagination
    const articles = await newsCollection.find(query)
      .sort({ publishDate: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    // Populate author data
    const { ObjectId } = await import('mongodb');
    const usersCollection = db.collection('users');
    const articlesWithAuthors = await Promise.all(
      articles.map(async (article) => {
        if (article.author) {
          try {
            const author = await usersCollection.findOne(
              { _id: article.author },
              { projection: { name: 1, email: 1, avatar: 1 } }
            );
            article.author = author || { name: article.authorName || 'Unknown Author' };
          } catch (e) {
            article.author = { name: article.authorName || 'Unknown Author' };
          }
        }
        return article;
      })
    );

    console.log(`📋 Found ${articles.length} articles (${total} total)`);

    return res.status(200).json({
      success: true,
      count: articles.length,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      data: articlesWithAuthors
    });

  } catch (error) {
    console.error(`[${timestamp}] Get articles error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch articles',
      error: error.message
    });
  }
}

// ========================================
// COMPLETE FIXED NEWS ENDPOINTS - PART 2 (Single Article, Update, Delete)
// Continue adding these to your api/index.js file
// FIXED: JWT handling, data structure consistency, proper error handling
// ========================================

// === GET SINGLE ARTICLE ===
if (path.includes('/api/news/') && !path.includes('/api/news/user') && !path.includes('/api/news/pending') && !path.includes('/review') && req.method === 'GET') {
  const articleId = path.replace('/api/news/', '');
  console.log(`[${timestamp}] → GET SINGLE ARTICLE: "${articleId}"`);
  
  try {
    const { ObjectId } = await import('mongodb');
    const newsCollection = db.collection('news');
    let article = null;

    // Try to find by MongoDB ObjectId first
    if (/^[0-9a-fA-F]{24}$/.test(articleId)) {
      try {
        article = await newsCollection.findOne({ _id: new ObjectId(articleId) });
      } catch (e) {
        console.log('Invalid ObjectId format');
      }
    }

    // If not found by ID, try to find by slug
    if (!article) {
      article = await newsCollection.findOne({ slug: articleId });
    }

    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    // Increment views
    await newsCollection.updateOne(
      { _id: article._id },
      { $inc: { 'metadata.views': 1 } }
    );
    article.metadata.views = (article.metadata.views || 0) + 1;

    // Populate author data
    if (article.author) {
      try {
        const usersCollection = db.collection('users');
        const author = await usersCollection.findOne(
          { _id: article.author },
          { projection: { name: 1, email: 1, avatar: 1 } }
        );
        article.author = author || { name: article.authorName || 'Unknown Author' };
      } catch (e) {
        article.author = { name: article.authorName || 'Unknown Author' };
      }
    }

    console.log(`✅ Article found: ${article.title}`);

    return res.status(200).json({
      success: true,
      data: article
    });

  } catch (error) {
    console.error(`[${timestamp}] Get single article error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch article',
      error: error.message
    });
  }
}

// === UPDATE ARTICLE (ADMIN ONLY) ===
if (path.includes('/api/news/') && !path.includes('/api/news/user') && !path.includes('/api/news/pending') && !path.includes('/review') && req.method === 'PUT') {
  const articleId = path.replace('/api/news/', '');
  console.log(`[${timestamp}] → UPDATE ARTICLE (ADMIN): "${articleId}"`);
  
  try {
    // Authentication check
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Admin authentication required' 
      });
    }

    const token = authHeader.substring(7);
    let decoded;
    try {
      const jwt = await import('jsonwebtoken');
      decoded = jwt.default.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid authentication token' 
      });
    }

    const { ObjectId } = await import('mongodb');

    // Get user and check admin role - FIXED: using decoded.userId
    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({ _id: new ObjectId(decoded.userId) });
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Admin access required to update articles' 
      });
    }

    // Parse update data
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);
    
    let updateData = {};
    
    try {
      updateData = JSON.parse(rawBody.toString());
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid JSON data'
      });
    }

    // Find and update article
    const newsCollection = db.collection('news');
    let articleObjectId;
    
    try {
      articleObjectId = new ObjectId(articleId);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid article ID format'
      });
    }

    const existingArticle = await newsCollection.findOne({ _id: articleObjectId });
    if (!existingArticle) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    // Prepare update data
    const updateFields = {
      ...updateData,
      updatedAt: new Date()
    };

    // Update publishDate if status is being changed to published
    if (updateFields.status === 'published' && existingArticle.status !== 'published') {
      updateFields.publishDate = new Date();
    }

    // Remove undefined fields
    Object.keys(updateFields).forEach(key => {
      if (updateFields[key] === undefined) {
        delete updateFields[key];
      }
    });

    // Update article
    const result = await newsCollection.updateOne(
      { _id: articleObjectId },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    // Get updated article
    const updatedArticle = await newsCollection.findOne({ _id: articleObjectId });

    console.log(`✅ Article updated: ${updatedArticle.title}`);

    return res.status(200).json({
      success: true,
      message: 'Article updated successfully',
      data: updatedArticle
    });

  } catch (error) {
    console.error(`[${timestamp}] Update article error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update article',
      error: error.message
    });
  }
}

// === DELETE ARTICLE (ADMIN ONLY) ===
if (path.includes('/api/news/') && !path.includes('/api/news/user') && !path.includes('/api/news/pending') && !path.includes('/review') && req.method === 'DELETE') {
  const articleId = path.replace('/api/news/', '');
  console.log(`[${timestamp}] → DELETE ARTICLE (ADMIN): "${articleId}"`);
  
  try {
    // Authentication check
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Admin authentication required' 
      });
    }

    const token = authHeader.substring(7);
    let decoded;
    try {
      const jwt = await import('jsonwebtoken');
      decoded = jwt.default.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid authentication token' 
      });
    }

    const { ObjectId } = await import('mongodb');

    // Get user and check admin role - FIXED: using decoded.userId
    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({ _id: new ObjectId(decoded.userId) });
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Admin access required to delete articles' 
      });
    }

    const newsCollection = db.collection('news');
    let articleObjectId;
    
    try {
      articleObjectId = new ObjectId(articleId);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid article ID format'
      });
    }

    // Find article first to get image info for cleanup
    const article = await newsCollection.findOne({ _id: articleObjectId });
    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    // Delete from database
    const result = await newsCollection.deleteOne({ _id: articleObjectId });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    console.log(`✅ Article deleted: ${article.title}`);

    return res.status(200).json({
      success: true,
      message: 'Article deleted successfully'
    });

  } catch (error) {
    console.error(`[${timestamp}] Delete article error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete article',
      error: error.message
    });
  }
}

// ========================================
// USER & JOURNALIST ENDPOINTS - FIXED DATA STRUCTURE
// ========================================

// === CREATE ARTICLE (USER/JOURNALIST) ===
if (path === '/api/news/user' && req.method === 'POST') {
  console.log(`[${timestamp}] → CREATE USER/JOURNALIST ARTICLE`);
  
  try {
    // Authentication check for any logged-in user
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required to create articles' 
      });
    }

    const token = authHeader.substring(7);
    let decoded;
    try {
      const jwt = await import('jsonwebtoken');
      decoded = jwt.default.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid authentication token' 
      });
    }

    const { ObjectId } = await import('mongodb');

    // Get user and check permissions - FIXED: using decoded.userId
    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({ _id: new ObjectId(decoded.userId) });
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Check if user has article creation permissions
    const isJournalist = user.role === 'journalist' || 
                        (user.additionalRoles && user.additionalRoles.includes('journalist'));
    const isAdmin = user.role === 'admin';

    console.log(`📝 ARTICLE CREATION: User ${user.name} (${user.role}) - Journalist: ${isJournalist}, Admin: ${isAdmin}`);

    // Parse multipart form data - same pattern as admin endpoint
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);
    
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    
    let articleData = {};
    let featuredImageFile = null;
    
    if (boundaryMatch) {
      // Handle multipart form data
      const boundary = boundaryMatch[1];
      const bodyString = rawBody.toString('binary');
      const parts = bodyString.split(`--${boundary}`);
      
      for (const part of parts) {
        if (part.includes('Content-Disposition: form-data')) {
          const nameMatch = part.match(/name="([^"]+)"/);
          if (nameMatch) {
            const fieldName = nameMatch[1];
            
            if (part.includes('filename=')) {
              // File upload
              const filenameMatch = part.match(/filename="([^"]+)"/);
              if (filenameMatch && filenameMatch[1] && filenameMatch[1] !== '""') {
                const filename = filenameMatch[1];
                
                let fileType = 'image/jpeg';
                const contentTypeMatch = part.match(/Content-Type: ([^\r\n]+)/);
                if (contentTypeMatch) {
                  fileType = contentTypeMatch[1].trim();
                }
                
                const doubleCrlfIndex = part.indexOf('\r\n\r\n');
                if (doubleCrlfIndex !== -1) {
                  const fileDataBinary = part.substring(doubleCrlfIndex + 4);
                  const fileBuffer = Buffer.from(fileDataBinary, 'binary');
                  
                  featuredImageFile = {
                    originalname: filename,
                    mimetype: fileType,
                    buffer: fileBuffer,
                    size: fileBuffer.length
                  };
                  
                  console.log(`📸 Featured image received: ${filename} (${fileBuffer.length} bytes)`);
                }
              }
            } else {
              // Regular form field
              const doubleCrlfIndex = part.indexOf('\r\n\r\n');
              if (doubleCrlfIndex !== -1) {
                let fieldValue = part.substring(doubleCrlfIndex + 4).trim();
                fieldValue = fieldValue.replace(/\r\n$/, '');
                
                if (fieldValue) {
                  if (fieldName === 'tags' && fieldValue.startsWith('[')) {
                    try {
                      articleData[fieldName] = JSON.parse(fieldValue);
                    } catch (e) {
                      articleData[fieldName] = fieldValue.split(',').map(tag => tag.trim()).filter(tag => tag);
                    }
                  } else {
                    articleData[fieldName] = fieldValue;
                  }
                }
              }
            }
          }
        }
      }
    } else {
      // Handle JSON data
      try {
        articleData = JSON.parse(rawBody.toString());
      } catch (error) {
        console.error('Error parsing JSON:', error);
        return res.status(400).json({
          success: false,
          message: 'Invalid JSON data'
        });
      }
    }

    console.log('📝 User article data received:', {
      title: articleData.title,
      category: articleData.category,
      status: articleData.status,
      userRole: user.role,
      hasImage: !!featuredImageFile
    });

    // Validate required fields
    if (!articleData.title || !articleData.content || !articleData.category) {
      return res.status(400).json({
        success: false,
        message: 'Title, content, and category are required'
      });
    }

    // Determine article status based on user permissions
    let articleStatus = 'draft'; // Default for all users
    
    if (articleData.status === 'published') {
      if (isAdmin) {
        // Only admins can publish immediately
        articleStatus = 'published';
      } else {
        // Journalists and regular users need approval
        articleStatus = 'pending';
        console.log(`📋 Non-admin user article submitted for review instead of direct publish`);
      }
    } else if (articleData.status === 'pending') {
      // Anyone can explicitly set to pending for review
      articleStatus = 'pending';
    }

    // Handle featured image upload to S3 if provided
    let featuredImageData = null;
    if (featuredImageFile) {
      try {
        const { uploadToS3 } = await import('../utils/s3Upload.js');
        const uploadResult = await uploadToS3(featuredImageFile, 'news');
        
        featuredImageData = {
          url: uploadResult.url,
          key: uploadResult.key,
          size: uploadResult.size,
          mimetype: uploadResult.mimetype,
          caption: articleData.imageCaption || '',
          credit: articleData.imageCredit || ''
        };
        
        console.log('✅ Featured image uploaded to S3:', uploadResult.url);
      } catch (uploadError) {
        console.error('❌ S3 upload failed:', uploadError);
        // Continue without image rather than failing the entire article creation
      }
    }

    // Generate slug from title
    const generateSlug = (title) => {
      return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 150);
    };

    // Prepare article data for database
    const newArticleData = {
      title: articleData.title,
      subtitle: articleData.subtitle || '',
      slug: generateSlug(articleData.title),
      content: articleData.content,
      category: articleData.category,
      tags: articleData.tags || [],
      status: articleStatus,
      author: new ObjectId(user._id),
      authorName: user.name,
      publishDate: articleStatus === 'published' ? new Date() : 
                   (articleData.publishDate ? new Date(articleData.publishDate) : null),
      featuredImage: featuredImageData,
      seo: {
        metaTitle: articleData.metaTitle || articleData.title,
        metaDescription: articleData.metaDescription || articleData.subtitle || '',
        metaKeywords: articleData.metaKeywords || ''
      },
      metadata: {
        views: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        readTime: Math.max(1, Math.ceil((articleData.content?.length || 0) / 1000))
      },
      // Track submission info
      submissionInfo: {
        submittedBy: user._id,
        submittedByName: user.name,
        submittedByRole: user.role,
        submittedAt: new Date(),
        isJournalist: isJournalist,
        isAdmin: isAdmin
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log('💾 Creating user article in database...');

    // Insert into MongoDB
    const newsCollection = db.collection('news');
    const result = await newsCollection.insertOne(newArticleData);
    
    console.log(`✅ User article created successfully with ID: ${result.insertedId} (Status: ${articleStatus})`);

    // Get the created article
    const createdArticle = await newsCollection.findOne({ _id: result.insertedId });
    
    // Add user data manually
    createdArticle.author = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    // Different success messages based on status
    let successMessage = 'Article saved as draft';
    if (articleStatus === 'published') {
      successMessage = 'Article published successfully';
    } else if (articleStatus === 'pending') {
      successMessage = 'Article submitted for review';
    }

    return res.status(201).json({
      success: true,
      message: successMessage,
      data: createdArticle,
      userPermissions: {
        canPublish: isAdmin, // Only admins can publish directly
        role: user.role,
        status: articleStatus
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] Create user article error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create article',
      error: error.message
    });
  }
}

// ========================================
// COMPLETE FIXED NEWS ENDPOINTS - PART 3 (User Management & Admin Review)
// Continue adding these to your api/index.js file
// FIXED: Data structure consistency for frontend - returns arrays properly
// ========================================

// === GET USER'S OWN ARTICLES - FIXED DATA STRUCTURE ===
if (path === '/api/news/user/my-articles' && req.method === 'GET') {
  console.log(`[${timestamp}] → GET USER'S ARTICLES`);
  
  try {
    // Authentication check
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    const token = authHeader.substring(7);
    let decoded;
    try {
      const jwt = await import('jsonwebtoken');
      decoded = jwt.default.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid authentication token' 
      });
    }

    const { ObjectId } = await import('mongodb');
    const newsCollection = db.collection('news');

    // Parse query parameters
    const url = new URL(req.url, `http://${req.headers.host}`);
    const searchParams = url.searchParams;
    
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 100;
    const status = searchParams.get('status'); // 'draft', 'published', 'pending', 'all'

    // Build query for user's articles only - FIXED: using decoded.userId
    let query = { author: new ObjectId(decoded.userId) };
    
    if (status && status !== 'all') {
      query.status = status;
    }

    console.log('📊 User articles query:', query);

    // Get total count
    const total = await newsCollection.countDocuments(query);
    
    // Get articles with pagination
    const articles = await newsCollection.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    // Get user info for author population - FIXED: using decoded.userId
    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne(
      { _id: new ObjectId(decoded.userId) },
      { projection: { name: 1, email: 1, avatar: 1, role: 1 } }
    );

    // Add author info to all articles
    const articlesWithAuthor = articles.map(article => ({
      ...article,
      author: user || { name: 'Unknown Author' }
    }));

    console.log(`📋 Found ${articles.length} user articles (${total} total)`);

    // FIXED: Return data structure that frontend expects
    return res.status(200).json({
      success: true,
      count: articles.length,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      data: articlesWithAuthor, // This is the array the frontend needs
      userInfo: {
        role: user?.role,
        canPublish: user?.role === 'admin' // Only admins can publish directly
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] Get user articles error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch your articles',
      error: error.message,
      data: [] // Return empty array on error to prevent frontend crashes
    });
  }
}

// === UPDATE USER'S OWN ARTICLE ===
if (path.includes('/api/news/user/') && !path.includes('/api/news/user/my-articles') && req.method === 'PUT') {
  const articleId = path.replace('/api/news/user/', '');
  console.log(`[${timestamp}] → UPDATE USER ARTICLE: "${articleId}"`);
  
  try {
    // Authentication check
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    const token = authHeader.substring(7);
    let decoded;
    try {
      const jwt = await import('jsonwebtoken');
      decoded = jwt.default.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid authentication token' 
      });
    }

    const { ObjectId } = await import('mongodb');

    // Get user info - FIXED: using decoded.userId
    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({ _id: new ObjectId(decoded.userId) });
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Parse update data
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);
    
    let updateData = {};
    
    try {
      updateData = JSON.parse(rawBody.toString());
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid JSON data'
      });
    }

    // Find article and verify ownership
    const newsCollection = db.collection('news');
    let articleObjectId;
    
    try {
      articleObjectId = new ObjectId(articleId);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid article ID format'
      });
    }

    const existingArticle = await newsCollection.findOne({ _id: articleObjectId });
    if (!existingArticle) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    // Check ownership - FIXED: using decoded.userId
    if (existingArticle.author.toString() !== decoded.userId && user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own articles'
      });
    }

    // Handle status changes based on permissions
    if (updateData.status) {
      const isAdmin = user.role === 'admin';
      
      if (updateData.status === 'published' && !isAdmin) {
        // Only admins can publish directly - others need approval
        updateData.status = 'pending';
        console.log(`📋 Non-admin user (${user.role}) attempted to publish, changed to pending review`);
      }
    }

    // Prepare update data
    const updateFields = {
      ...updateData,
      updatedAt: new Date()
    };

    // Update publishDate if status is being changed to published
    if (updateFields.status === 'published' && existingArticle.status !== 'published') {
      updateFields.publishDate = new Date();
    }

    // Remove undefined fields
    Object.keys(updateFields).forEach(key => {
      if (updateFields[key] === undefined) {
        delete updateFields[key];
      }
    });

    // Update article
    const result = await newsCollection.updateOne(
      { _id: articleObjectId },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    // Get updated article
    const updatedArticle = await newsCollection.findOne({ _id: articleObjectId });
    
    // Add author info
    updatedArticle.author = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    console.log(`✅ User article updated: ${updatedArticle.title} (Status: ${updatedArticle.status})`);

    return res.status(200).json({
      success: true,
      message: 'Article updated successfully',
      data: updatedArticle
    });

  } catch (error) {
    console.error(`[${timestamp}] Update user article error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update article',
      error: error.message
    });
  }
}

// === DELETE USER'S OWN ARTICLE ===
if (path.includes('/api/news/user/') && !path.includes('/api/news/user/my-articles') && req.method === 'DELETE') {
  const articleId = path.replace('/api/news/user/', '');
  console.log(`[${timestamp}] → DELETE USER ARTICLE: "${articleId}"`);
  
  try {
    // Authentication check
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required' 
      });
    }

    const token = authHeader.substring(7);
    let decoded;
    try {
      const jwt = await import('jsonwebtoken');
      decoded = jwt.default.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid authentication token' 
      });
    }

    const { ObjectId } = await import('mongodb');

    // Get user info - FIXED: using decoded.userId
    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({ _id: new ObjectId(decoded.userId) });
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const newsCollection = db.collection('news');
    let articleObjectId;
    
    try {
      articleObjectId = new ObjectId(articleId);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid article ID format'
      });
    }

    // Find article and verify ownership
    const article = await newsCollection.findOne({ _id: articleObjectId });
    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    // Check ownership - FIXED: using decoded.userId
    if (article.author.toString() !== decoded.userId && user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own articles'
      });
    }

    // Delete from database
    const result = await newsCollection.deleteOne({ _id: articleObjectId });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    console.log(`✅ User article deleted: ${article.title} by ${user.name}`);

    return res.status(200).json({
      success: true,
      message: 'Article deleted successfully'
    });

  } catch (error) {
    console.error(`[${timestamp}] Delete user article error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete article',
      error: error.message
    });
  }
}

// === GET PENDING ARTICLES (ADMIN REVIEW) ===
if (path === '/api/news/pending' && req.method === 'GET') {
  console.log(`[${timestamp}] → GET PENDING ARTICLES (ADMIN)`);
  
  try {
    // Authentication check - admin only
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Admin authentication required' 
      });
    }

    const token = authHeader.substring(7);
    let decoded;
    try {
      const jwt = await import('jsonwebtoken');
      decoded = jwt.default.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid authentication token' 
      });
    }

    const { ObjectId } = await import('mongodb');

    // Get user and check admin role - FIXED: using decoded.userId
    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({ _id: new ObjectId(decoded.userId) });
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Admin access required' 
      });
    }

    const newsCollection = db.collection('news');

    // Parse query parameters
    const url = new URL(req.url, `http://${req.headers.host}`);
    const searchParams = url.searchParams;
    
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 10;

    // Query for pending articles
    const query = { status: 'pending' };

    console.log('📊 Pending articles query:', query);

    // Get total count
    const total = await newsCollection.countDocuments(query);
    
    // Get articles with pagination
    const articles = await newsCollection.find(query)
      .sort({ createdAt: -1 }) // Newest first for review
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    // Populate author data for all articles
    const articlesWithAuthors = await Promise.all(
      articles.map(async (article) => {
        if (article.author) {
          try {
            const author = await usersCollection.findOne(
              { _id: article.author },
              { projection: { name: 1, email: 1, avatar: 1, role: 1 } }
            );
            article.author = author || { name: article.authorName || 'Unknown Author' };
          } catch (e) {
            article.author = { name: article.authorName || 'Unknown Author' };
          }
        }
        return article;
      })
    );

    console.log(`📋 Found ${articles.length} pending articles (${total} total)`);

    return res.status(200).json({
      success: true,
      count: articles.length,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      data: articlesWithAuthors
    });

  } catch (error) {
    console.error(`[${timestamp}] Get pending articles error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch pending articles',
      error: error.message
    });
  }
}

// === APPROVE/REJECT PENDING ARTICLE (ADMIN) ===
if (path.includes('/api/news/') && path.includes('/review') && req.method === 'PUT') {
  const articleId = path.replace('/api/news/', '').replace('/review', '');
  console.log(`[${timestamp}] → REVIEW ARTICLE: "${articleId}"`);
  
  try {
    // Authentication check - admin only
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Admin authentication required' 
      });
    }

    const token = authHeader.substring(7);
    let decoded;
    try {
      const jwt = await import('jsonwebtoken');
      decoded = jwt.default.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid authentication token' 
      });
    }

    const { ObjectId } = await import('mongodb');

    // Get user and check admin role - FIXED: using decoded.userId
    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({ _id: new ObjectId(decoded.userId) });
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Admin access required' 
      });
    }

    // Parse review data
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);
    
    let reviewData = {};
    
    try {
      reviewData = JSON.parse(rawBody.toString());
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid JSON data'
      });
    }

    const { action, notes } = reviewData; // action: 'approve' or 'reject'
    
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action must be either "approve" or "reject"'
      });
    }

    const newsCollection = db.collection('news');
    let articleObjectId;
    
    try {
      articleObjectId = new ObjectId(articleId);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid article ID format'
      });
    }

    // Find article
    const article = await newsCollection.findOne({ _id: articleObjectId });
    if (!article) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    // Prepare update based on action
    let updateFields = {
      updatedAt: new Date(),
      reviewInfo: {
        reviewedBy: user._id,
        reviewedByName: user.name,
        reviewedAt: new Date(),
        action: action,
        notes: notes || ''
      }
    };

    if (action === 'approve') {
      updateFields.status = 'published';
      updateFields.publishDate = new Date();
    } else {
      updateFields.status = 'rejected';
    }

    // Update article
    const result = await newsCollection.updateOne(
      { _id: articleObjectId },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Article not found'
      });
    }

    // Get updated article
    const updatedArticle = await newsCollection.findOne({ _id: articleObjectId });

    console.log(`✅ Article ${action}d: ${article.title} by admin ${user.name}`);

    return res.status(200).json({
      success: true,
      message: `Article ${action}d successfully`,
      data: updatedArticle,
      action: action
    });

  } catch (error) {
    console.error(`[${timestamp}] Review article error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to review article',
      error: error.message
    });
  }
}

// === GET ADMIN ARTICLE STATS ===
if (path === '/api/news/admin/stats' && req.method === 'GET') {
  console.log(`[${timestamp}] → GET ADMIN ARTICLE STATS`);
  
  try {
    // Authentication check - admin only
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Admin authentication required' 
      });
    }

    const token = authHeader.substring(7);
    let decoded;
    try {
      const jwt = await import('jsonwebtoken');
      decoded = jwt.default.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid authentication token' 
      });
    }

    const { ObjectId } = await import('mongodb');

    // Get user and check admin role - FIXED: using decoded.userId
    const usersCollection = db.collection('users');
    const user = await usersCollection.findOne({ _id: new ObjectId(decoded.userId) });
    
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Admin access required' 
      });
    }

    const newsCollection = db.collection('news');

    // Get article statistics
    const totalArticles = await newsCollection.countDocuments({});
    const publishedArticles = await newsCollection.countDocuments({ status: 'published' });
    const pendingArticles = await newsCollection.countDocuments({ status: 'pending' });
    const draftArticles = await newsCollection.countDocuments({ status: 'draft' });
    const rejectedArticles = await newsCollection.countDocuments({ status: 'rejected' });

    // Get articles by author role
    const pipeline = [
      {
        $lookup: {
          from: 'users',
          localField: 'author',
          foreignField: '_id',
          as: 'authorInfo'
        }
      },
      {
        $unwind: '$authorInfo'
      },
      {
        $group: {
          _id: '$authorInfo.role',
          count: { $sum: 1 }
        }
      }
    ];

    const articlesByRole = await newsCollection.aggregate(pipeline).toArray();

    // Recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentArticles = await newsCollection.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    const recentPending = await newsCollection.countDocuments({
      status: 'pending',
      createdAt: { $gte: thirtyDaysAgo }
    });

    console.log(`✅ Admin article stats retrieved`);

    return res.status(200).json({
      success: true,
      data: {
        totals: {
          total: totalArticles,
          published: publishedArticles,
          pending: pendingArticles,
          draft: draftArticles,
          rejected: rejectedArticles
        },
        byRole: articlesByRole.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        recent: {
          articles: recentArticles,
          pending: recentPending
        }
      }
    });

  } catch (error) {
    console.error(`[${timestamp}] Get admin article stats error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch article statistics',
      error: error.message
    });
  }
}

// ========================================
// END COMPLETE FIXED NEWS ENDPOINTS
// ========================================























































 // ==================== SECTION 4: IMAGES & FILE UPLOADS ====================
 // ==================== SECTION 4: IMAGES & FILE UPLOADS ====================
 // ==================== SECTION 4: IMAGES & FILE UPLOADS ====================
 // ==================== SECTION 4: IMAGES & FILE UPLOADS ====================
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





 // ==================== SECTION 5: LISTINGS ENDPOINTS ====================
// ==================== SECTION 5: LISTINGS ENDPOINTS ====================
// ==================== SECTION 5: LISTINGS ENDPOINTS ====================
// ==================== SECTION 5: LISTINGS ENDPOINTS ====================

// === CREATE LISTING (FRONTEND ENDPOINT) - ENHANCED ===
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

// === UPDATE LISTING (PUT method for full updates) ===
// === UPDATE LISTING (PUT method for full updates) - FIXED VERSION ===
// === UPDATE LISTING (PUT method for full updates) - COMPLETELY FIXED VERSION ===
if (path.match(/^\/listings\/[a-fA-F0-9]{24}$/) && req.method === 'PUT') {
  const listingId = path.split('/')[2];
  console.log(`[${timestamp}] → UPDATE LISTING: ${listingId}`);
  
  try {
    let requestBody = {};
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks).toString();
      if (rawBody) requestBody = JSON.parse(rawBody);
    } catch (parseError) {
      console.error(`[${timestamp}] Body parse error:`, parseError);
      return res.status(400).json({
        success: false,
        message: 'Invalid request body format'
      });
    }
    
    console.log(`[${timestamp}] Request body keys:`, Object.keys(requestBody));
    
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
    
    // EXTRACT LISTING DATA - Handle both formats
    let listingData = {};
    
    if (requestBody.listingData) {
      // Frontend sends data wrapped in listingData field (as JSON string)
      try {
        listingData = typeof requestBody.listingData === 'string' 
          ? JSON.parse(requestBody.listingData)
          : requestBody.listingData;
        console.log(`[${timestamp}] Using wrapped listingData format`);
      } catch (parseError) {
        console.error(`[${timestamp}] Failed to parse listingData:`, parseError);
        return res.status(400).json({
          success: false,
          message: 'Invalid listingData format'
        });
      }
    } else {
      // Direct format (backwards compatibility)
      listingData = requestBody;
      console.log(`[${timestamp}] Using direct data format`);
    }
    
    console.log(`[${timestamp}] Parsed listing data:`, {
      title: listingData.title,
      make: listingData.make,
      model: listingData.model,
      price: listingData.price,
      existingImages: listingData.existingImages?.length || 0,
      uploadedImages: listingData.uploadedImages?.length || 0,
      imagesToDelete: listingData.imagesToDelete?.length || 0
    });
    
    // SLUG GENERATION FUNCTION (same as create)
    const generateSlug = (title) => {
      if (!title) {
        return `listing-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      }
      
      const baseSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      return baseSlug;
    };
    
    // Prepare update fields (only changed fields)
    const updateFields = {};
    
    // Handle title and slug generation
    if (listingData.title && listingData.title !== existingListing.title) {
      updateFields.title = listingData.title;
      
      // Generate new slug from title
      const baseSlug = generateSlug(listingData.title);
      let finalSlug = baseSlug;
      let counter = 0;
      
      // Check for slug uniqueness (exclude current listing)
      while (true) {
        const existingSlugListing = await listingsCollection.findOne({ 
          slug: finalSlug,
          _id: { $ne: new ObjectId(listingId) }
        });
        
        if (!existingSlugListing) break;
        
        counter++;
        finalSlug = `${baseSlug}-${counter}`;
        
        // Prevent infinite loop
        if (counter > 100) {
          finalSlug = `${baseSlug}-${Date.now()}`;
          break;
        }
      }
      
      updateFields.slug = finalSlug;
      console.log(`[${timestamp}] Generated new slug: ${finalSlug}`);
    }
    
    // AUTO-CALCULATE SAVINGS if price or priceOptions changed
    const calculateAndUpdateSavings = (data) => {
      if (!data.priceOptions) {
        data.priceOptions = {};
      }
      
      const { originalPrice, dealerDiscount } = data.priceOptions;
      const currentPrice = data.price;
      
      // Auto-calculate savings if original price is provided
      if (originalPrice && originalPrice > currentPrice) {
        const savingsAmount = originalPrice - currentPrice;
        const savingsPercentage = Math.round((savingsAmount / originalPrice) * 100);
        
        data.priceOptions.savingsAmount = savingsAmount;
        data.priceOptions.savingsPercentage = savingsPercentage;
        data.priceOptions.showSavings = true;
        
        console.log(`[${timestamp}] Auto-calculated savings: P${savingsAmount.toLocaleString()} (${savingsPercentage}%)`);
      }
      // Calculate from dealer discount percentage
      else if (dealerDiscount && dealerDiscount > 0 && currentPrice) {
        const calculatedOriginalPrice = Math.round(currentPrice / (1 - dealerDiscount / 100));
        const savingsAmount = calculatedOriginalPrice - currentPrice;
        const savingsPercentage = dealerDiscount;
        
        data.priceOptions.originalPrice = calculatedOriginalPrice;
        data.priceOptions.savingsAmount = savingsAmount;
        data.priceOptions.savingsPercentage = savingsPercentage;
        data.priceOptions.showSavings = true;
        
        console.log(`[${timestamp}] Calculated from dealer discount: P${savingsAmount.toLocaleString()} (${savingsPercentage}%)`);
      }
      
      return data;
    };
    
    // Apply savings calculations if price or priceOptions are being updated
    if (listingData.price || listingData.priceOptions) {
      const tempData = {
        price: listingData.price || existingListing.price,
        priceOptions: { ...existingListing.priceOptions, ...listingData.priceOptions }
      };
      const updatedData = calculateAndUpdateSavings(tempData);
      listingData.priceOptions = updatedData.priceOptions;
      console.log(`[${timestamp}] Savings recalculated during update`);
    }

    // Handle basic fields (only if they've changed)
    const basicFields = [
      'description', 'shortDescription', 'category', 'condition', 'status', 'featured',
      'price', 'priceType', 'priceOptions', 'make', 'model', 'year', 'mileage',
      'transmission', 'fuelType', 'bodyType', 'specifications', 'features', 
      'location', 'serviceHistory', 'seo', 'dealer', 'primaryImageIndex'
    ];
    
    basicFields.forEach(field => {
      if (listingData[field] !== undefined && 
          JSON.stringify(listingData[field]) !== JSON.stringify(existingListing[field])) {
        updateFields[field] = listingData[field];
        console.log(`[${timestamp}] Field changed: ${field}`);
      }
    });
    
    // Handle dealerId conversion if needed
    if (listingData.dealerId && listingData.dealerId.length === 24) {
      updateFields.dealerId = new ObjectId(listingData.dealerId);
    } else if (listingData.dealerId) {
      updateFields.dealerId = listingData.dealerId;
    }
    
    // HANDLE IMAGES - Combine existing, new, and handle deletions
    if (listingData.existingImages || listingData.uploadedImages || listingData.imagesToDelete) {
      let finalImages = [];
      
      // Start with existing images (not marked for deletion)
      if (Array.isArray(listingData.existingImages)) {
        finalImages = [...listingData.existingImages];
        console.log(`[${timestamp}] Adding ${finalImages.length} existing images`);
      }
      
      // Add new uploaded images
      if (Array.isArray(listingData.uploadedImages)) {
        finalImages = [...finalImages, ...listingData.uploadedImages];
        console.log(`[${timestamp}] Adding ${listingData.uploadedImages.length} new uploaded images`);
      }
      
      // Set primary image based on index
      if (finalImages.length > 0) {
        const primaryIndex = Math.max(0, Math.min(listingData.primaryImageIndex || 0, finalImages.length - 1));
        finalImages.forEach((img, index) => {
          img.isPrimary = index === primaryIndex;
        });
        console.log(`[${timestamp}] Set primary image at index: ${primaryIndex}`);
      }
      
      updateFields.images = finalImages;
    }
    
    // Always update the timestamp
    updateFields.updatedAt = new Date();
    
    // Don't allow changing these protected fields
    delete updateFields.createdAt;
    delete updateFields.views;
    delete updateFields.saves;
    delete updateFields.contacts;
    delete updateFields._id;
    
    console.log(`[${timestamp}] Updating ${Object.keys(updateFields).length} fields:`, Object.keys(updateFields));
    
    // Check if there are any actual changes
    if (Object.keys(updateFields).length === 1 && updateFields.updatedAt) {
      console.log(`[${timestamp}] No changes detected`);
      return res.status(200).json({
        success: true,
        message: 'No changes detected',
        data: existingListing
      });
    }
    
    // Use updateOne with $set instead of replaceOne (safer)
    const result = await listingsCollection.updateOne(
      { _id: new ObjectId(listingId) },
      { $set: updateFields }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found'
      });
    }
    
    if (result.modifiedCount === 0) {
      console.log(`[${timestamp}] No documents were modified`);
      return res.status(200).json({
        success: true,
        message: 'No changes were necessary',
        data: existingListing
      });
    }
    
    // Fetch updated listing
    const updatedListing = await listingsCollection.findOne({ 
      _id: new ObjectId(listingId) 
    });
    
    console.log(`[${timestamp}] ✅ Listing updated successfully: ${updatedListing.title}`);
    
    return res.status(200).json({
      success: true,
      message: 'Listing updated successfully',
      data: updatedListing,
      updatedFields: Object.keys(updateFields).filter(field => field !== 'updatedAt')
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Update listing error:`, error);
    
    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || 'unknown field';
      console.error(`[${timestamp}] Duplicate key error on field: ${duplicateField}`);
      
      return res.status(400).json({
        success: false,
        message: `Duplicate ${duplicateField} - please try a different value`,
        error: 'DUPLICATE_KEY',
        field: duplicateField
      });
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        error: 'VALIDATION_ERROR',
        details: error.message
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Failed to update listing',
      error: error.message,
      timestamp: timestamp
    });
  }
}

// === DELETE LISTING ===
if (path.match(/^\/listings\/[a-fA-F0-9]{24}$/) && req.method === 'DELETE') {
  const listingId = path.split('/')[2];
  console.log(`[${timestamp}] → DELETE LISTING: ${listingId}`);
  
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
    
    // Soft delete (recommended for production)
    const result = await listingsCollection.updateOne(
      { _id: new ObjectId(listingId) },
      { 
        $set: { 
          status: 'deleted',
          deletedAt: new Date(),
          updatedAt: new Date()
        }
      }
    );
    
    console.log(`[${timestamp}] ✅ Listing soft-deleted: ${existingListing.title}`);
    
    return res.status(200).json({
      success: true,
      message: 'Listing deleted successfully',
      data: {
        id: listingId,
        title: existingListing.title,
        status: 'deleted'
      }
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

// === ENHANCED GENERAL LISTINGS ENDPOINT (HYBRID FIX) ===
if (path === '/listings' && req.method === 'GET') {
  console.log(`[${timestamp}] → ENHANCED LISTINGS (INCLUDING USER SUBMISSIONS)`);
  const listingsCollection = db.collection('listings');
  const userSubmissionsCollection = db.collection('usersubmissions');
  const paymentsCollection = db.collection('payments');
  
  // Build comprehensive filter
  let filter = { status: { $ne: 'deleted' } }; // Exclude soft-deleted items
  
  // Status filtering - Include "published" status
  const status = searchParams.get('status');
  if (status && status !== 'all' && status !== '') {
    // If specific status requested, use it
    if (status.includes(',')) {
      // Handle comma-separated statuses like "active,pending"
      filter.status = { $in: status.split(',').map(s => s.trim()) };
    } else {
      filter.status = status;
    }
  } else {
    // ENHANCED: Default behavior - include all non-deleted listings for marketplace
    // This ensures new listings show up immediately
    filter.status = { $in: ['active', 'pending', 'published'] }; // Include published status
  }
  
  // ENHANCED: Advanced search functionality
  const search = searchParams.get('search') || searchParams.get('searchKeyword');
  if (search) {
    const searchRegex = { $regex: search, $options: 'i' };
    filter.$or = [
      { title: searchRegex },
      { description: searchRegex },
      { 'specifications.make': searchRegex },
      { 'specifications.model': searchRegex },
      { features: searchRegex },
      { safetyFeatures: searchRegex },
      { comfortFeatures: searchRegex }
    ];
  }
  
  // ENHANCED: Make filtering
  const make = searchParams.get('make');
  if (make && make !== 'all' && make !== '') {
    filter['specifications.make'] = { $regex: new RegExp(`^${make}$`, 'i') };
  }
  
  // ENHANCED: Model filtering  
  const model = searchParams.get('model');
  if (model && model !== 'all' && model !== '') {
    filter['specifications.model'] = { $regex: new RegExp(`^${model}$`, 'i') };
  }
  
  // ENHANCED: Year filtering
  const year = searchParams.get('year') || searchParams.get('yearRange');
  if (year && year !== 'all' && year !== '') {
    if (year === 'Pre-2020') {
      filter['specifications.year'] = { $lt: 2020 };
    } else if (!isNaN(year)) {
      filter['specifications.year'] = parseInt(year);
    }
  }
  
  // ENHANCED: Price range filtering
  const priceRange = searchParams.get('priceRange');
  const minPrice = searchParams.get('minPrice');
  const maxPrice = searchParams.get('maxPrice');
  
  if (priceRange && priceRange !== 'All Prices') {
    const priceRanges = {
      'Under P10,000': { max: 10000 },
      'P10,000 - P20,000': { min: 10000, max: 20000 },
      'P20,000 - P30,000': { min: 20000, max: 30000 },
      'P30,000 - P50,000': { min: 30000, max: 50000 },
      'P50,000 - P100,000': { min: 50000, max: 100000 },
      'Over P100,000': { min: 100000 }
    };
    
    if (priceRanges[priceRange]) {
      const range = priceRanges[priceRange];
      if (range.min && range.max) {
        filter.price = { $gte: range.min, $lte: range.max };
      } else if (range.min) {
        filter.price = { $gte: range.min };
      } else if (range.max) {
        filter.price = { $lte: range.max };
      }
    }
  } else if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice && !isNaN(minPrice)) filter.price.$gte = parseInt(minPrice);
    if (maxPrice && !isNaN(maxPrice)) filter.price.$lte = parseInt(maxPrice);
  }
  
  // ENHANCED: Condition filtering
  const condition = searchParams.get('condition');
  if (condition && condition !== 'all') {
    filter.condition = condition;
  }
  
  // ENHANCED: Fuel type filtering
  const fuelType = searchParams.get('fuelType');
  if (fuelType && fuelType !== 'all') {
    filter['specifications.fuelType'] = { $regex: new RegExp(`^${fuelType}$`, 'i') };
  }
  
  // ENHANCED: Transmission filtering
  const transmission = searchParams.get('transmission') || searchParams.get('transmissionType');
  if (transmission && transmission !== 'all') {
    filter['specifications.transmission'] = { $regex: new RegExp(`^${transmission}$`, 'i') };
  }
  
  // ENHANCED: Body style filtering
  const bodyStyle = searchParams.get('bodyStyle') || searchParams.get('vehicleType');
  if (bodyStyle && bodyStyle !== 'all') {
    filter.category = { $regex: new RegExp(`^${bodyStyle}$`, 'i') };
  }
  
  // ENHANCED: Dealer filtering
  const dealerId = searchParams.get('dealerId');
  if (dealerId) {
    const { ObjectId } = await import('mongodb');
    try {
      filter.dealerId = new ObjectId(dealerId);
    } catch {
      filter.dealerId = dealerId; // Fallback to string
    }
  }
  
  // ENHANCED: Featured filtering
  const featured = searchParams.get('featured');
  if (featured === 'true') {
    filter.featured = true;
  }
  
  // ENHANCED: Savings filtering
  const hasSavings = searchParams.get('hasSavings');
  if (hasSavings === 'true') {
    filter['priceOptions.showSavings'] = true;
    filter['priceOptions.savingsAmount'] = { $gt: 0 };
  }
  
  // Section-based filtering (from your existing code)
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
  
  // ENHANCED: Pagination
  const page = parseInt(searchParams.get('page')) || 1;
  const limit = Math.min(parseInt(searchParams.get('limit')) || 10, 50); // Cap at 50
  const skip = (page - 1) * limit;
  
  // ENHANCED: Sorting
  let sort = { createdAt: -1 }; // Default: newest first
  const sortBy = searchParams.get('sortBy');
  const sortOrder = searchParams.get('sortOrder') === 'asc' ? 1 : -1;
  
  switch (sortBy) {
    case 'price':
      sort = { price: sortOrder };
      break;
    case 'year':
      sort = { 'specifications.year': sortOrder };
      break;
    case 'mileage':
      sort = { 'specifications.mileage': sortOrder };
      break;
    case 'views':
      sort = { views: sortOrder };
      break;
    case 'featured':
      sort = { featured: -1, createdAt: -1 };
      break;
    default:
      sort = { createdAt: sortOrder };
  }
  
  // DEBUGGING: Log the filter being used
  console.log(`[${timestamp}] Listings filter:`, JSON.stringify(filter));
  
  try {
    // =================================
    // NEW: GET USERSUBMISSIONS
    // =================================
    
    // Build usersubmissions filter based on same criteria
    let userSubmissionsFilter = {
      status: { $in: ['approved', 'listing_created'] } // Only approved submissions
    };
    
    // Apply search to usersubmissions
    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      userSubmissionsFilter.$or = [
        { 'listingData.title': searchRegex },
        { 'listingData.description': searchRegex },
        { 'listingData.specifications.make': searchRegex },
        { 'listingData.specifications.model': searchRegex }
      ];
    }
    
    // Apply make filter to usersubmissions
    if (make && make !== 'all' && make !== '') {
      userSubmissionsFilter['listingData.specifications.make'] = { $regex: new RegExp(`^${make}$`, 'i') };
    }
    
    // Apply model filter to usersubmissions
    if (model && model !== 'all' && model !== '') {
      userSubmissionsFilter['listingData.specifications.model'] = { $regex: new RegExp(`^${model}$`, 'i') };
    }
    
    // Apply year filter to usersubmissions
    if (year && year !== 'all' && year !== '') {
      if (year === 'Pre-2020') {
        userSubmissionsFilter['listingData.specifications.year'] = { $lt: 2020 };
      } else if (!isNaN(year)) {
        userSubmissionsFilter['listingData.specifications.year'] = parseInt(year);
      }
    }
    
    // Apply price filter to usersubmissions
    if (filter.price) {
      userSubmissionsFilter['listingData.pricing.price'] = filter.price;
    }
    
    // Apply condition filter to usersubmissions
    if (condition && condition !== 'all') {
      userSubmissionsFilter['listingData.condition'] = condition;
    }
    
    // Apply fuel type filter to usersubmissions
    if (fuelType && fuelType !== 'all') {
      userSubmissionsFilter['listingData.specifications.fuelType'] = { $regex: new RegExp(`^${fuelType}$`, 'i') };
    }
    
    // Apply transmission filter to usersubmissions
    if (transmission && transmission !== 'all') {
      userSubmissionsFilter['listingData.specifications.transmission'] = { $regex: new RegExp(`^${transmission}$`, 'i') };
    }
    
    // Apply body style filter to usersubmissions
    if (bodyStyle && bodyStyle !== 'all') {
      userSubmissionsFilter['listingData.category'] = { $regex: new RegExp(`^${bodyStyle}$`, 'i') };
    }
    
    console.log(`[${timestamp}] UserSubmissions filter:`, JSON.stringify(userSubmissionsFilter));
    
    // Get approved usersubmissions
    const approvedSubmissions = await userSubmissionsCollection
      .find(userSubmissionsFilter)
      .toArray();
    
    console.log(`[${timestamp}] Found ${approvedSubmissions.length} approved submissions`);
    
    // =================================
    // NEW: FILTER BY PAYMENT STATUS
    // =================================
    
    const eligibleSubmissions = [];
    const { ObjectId } = await import('mongodb');
    
    for (const submission of approvedSubmissions) {
      const isFreeSubmission = submission.selectedTier === 'free' || 
                             submission.paymentRequired === false ||
                             submission.listingData?.selectedPlan === 'free';
      
      if (isFreeSubmission) {
        // Free tier: show if approved
        eligibleSubmissions.push(submission);
        console.log(`[${timestamp}] Including free submission: ${submission.listingData?.title}`);
      } else {
        // Paid tier: check if payment completed
        try {
          const payment = await paymentsCollection.findOne({
            $or: [
              { submissionId: new ObjectId(submission._id) },
              { submissionId: submission._id.toString() },
              { listing: new ObjectId(submission._id) },
              { listing: submission._id.toString() }
            ],
            status: 'completed'
          });
          
          if (payment) {
            eligibleSubmissions.push(submission);
            console.log(`[${timestamp}] Including paid submission (payment confirmed): ${submission.listingData?.title}`);
          } else {
            console.log(`[${timestamp}] Excluding paid submission (no payment): ${submission.listingData?.title}`);
          }
        } catch (paymentCheckError) {
          console.error(`[${timestamp}] Error checking payment for submission ${submission._id}:`, paymentCheckError);
          // Exclude if we can't verify payment
        }
      }
    }
    
    console.log(`[${timestamp}] ${eligibleSubmissions.length} submissions eligible after payment check`);
    
    // =================================
    // NEW: TRANSFORM USERSUBMISSIONS WITH USER PROFILE PICTURES
    // =================================
    
    const usersCollection = db.collection('users');
    
    const transformedSubmissions = await Promise.all(eligibleSubmissions.map(async (submission) => {
      const data = submission.listingData || {};
      
      // Fetch the user's profile picture
      let userProfilePicture = '/images/placeholders/private-seller.jpg'; // Default fallback
      
      try {
        if (submission.userId) {
          const user = await usersCollection.findOne({ 
            _id: new ObjectId(submission.userId) 
          });
          
          if (user) {
            console.log(`[${timestamp}] Found user for submission ${data.title}:`, {
              name: user.name,
              email: user.email,
              hasAvatar: !!user.avatar,
              avatarUrl: user.avatar?.url,
              avatarStructure: user.avatar
            });
            
            // Check for avatar.url (main field used in your system)
            if (user.avatar && user.avatar.url) {
              userProfilePicture = user.avatar.url;
              console.log(`[${timestamp}] ✅ Using user avatar.url for ${data.title}: ${userProfilePicture}`);
            } 
            // Fallback: check if avatar is a string directly
            else if (user.avatar && typeof user.avatar === 'string') {
              userProfilePicture = user.avatar;
              console.log(`[${timestamp}] ✅ Using user avatar string for ${data.title}: ${userProfilePicture}`);
            }
            // Additional fallback checks
            else if (user.profilePicture?.url) {
              userProfilePicture = user.profilePicture.url;
              console.log(`[${timestamp}] ✅ Using user profilePicture.url for ${data.title}: ${userProfilePicture}`);
            }
            else if (user.profilePicture && typeof user.profilePicture === 'string') {
              userProfilePicture = user.profilePicture;
              console.log(`[${timestamp}] ✅ Using user profilePicture string for ${data.title}: ${userProfilePicture}`);
            }
            else {
              console.log(`[${timestamp}] ⚠️ No profile picture found for user ${submission.userId}, using default placeholder`);
            }
          } else {
            console.log(`[${timestamp}] ⚠️ User not found for userId ${submission.userId}`);
          }
        } else {
          console.log(`[${timestamp}] ⚠️ No userId in submission ${submission._id}`);
        }
      } catch (userLookupError) {
        console.error(`[${timestamp}] ❌ Error fetching user profile for submission ${submission._id}:`, userLookupError);
        // Keep default placeholder
      }
      
      return {
        _id: submission._id,
        title: data.title || 'Untitled Listing',
        description: data.description || '',
        price: data.pricing?.price || 0,
        images: data.images || [],
        specifications: data.specifications || {},
        contact: data.contact || {},
        location: data.location || {},
        category: data.category || 'cars',
        condition: data.condition || 'used',
        features: data.features || [],
        safetyFeatures: data.safetyFeatures || [],
        comfortFeatures: data.comfortFeatures || [],
        
        // Standard listing fields
        status: 'active',
        featured: false,
        views: 0,
        createdAt: submission.submittedAt || new Date(),
        updatedAt: submission.submittedAt || new Date(),
        
        // Source identification
        sourceType: 'user_submission',
        submissionId: submission._id,
        tier: submission.selectedTier || 'free',
        
        // Dealer info for compatibility with user's actual profile picture
        dealer: {
          businessName: data.contact?.sellerName || submission.userName || 'Private Seller',
          sellerType: 'private',
          phone: data.contact?.phone,
          email: data.contact?.email || submission.userEmail,
          profile: {
            logo: userProfilePicture // User's actual profile picture
          }
        },
        
        // Price options compatibility
        priceOptions: {
          showSavings: false,
          savingsAmount: 0
        }
      };
    }));
    
    // =================================
    // GET REGULAR LISTINGS (EXISTING)
    // =================================
    
    // Get total count for pagination (regular listings only first)
    const regularTotal = await listingsCollection.countDocuments(filter);
    
    // DEBUGGING: Log the count
    console.log(`[${timestamp}] Total regular listings found with filter: ${regularTotal}`);
    
    // Get regular listings with all filters and sorting
    const regularListings = await listingsCollection.find(filter)
      .sort(sort)
      .toArray(); // Get all for combining
    
    // =================================
    // COMBINE AND SORT ALL LISTINGS
    // =================================
    
    // Combine regular listings + eligible usersubmissions
    const allListings = [...regularListings, ...transformedSubmissions];
    
    // Apply sorting to combined results
    if (sort.createdAt === -1) {
      allListings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sort.createdAt === 1) {
      allListings.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    } else if (sort.price === 1) {
      allListings.sort((a, b) => (a.price || 0) - (b.price || 0));
    } else if (sort.price === -1) {
      allListings.sort((a, b) => (b.price || 0) - (a.price || 0));
    } else if (sort.views === -1) {
      allListings.sort((a, b) => (b.views || 0) - (a.views || 0));
    } else if (sort.views === 1) {
      allListings.sort((a, b) => (a.views || 0) - (b.views || 0));
    } else if (sort.featured === -1) {
      allListings.sort((a, b) => {
        if (a.featured && !b.featured) return -1;
        if (!a.featured && b.featured) return 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    } else if (sort['specifications.year'] === -1) {
      allListings.sort((a, b) => (b.specifications?.year || 0) - (a.specifications?.year || 0));
    } else if (sort['specifications.year'] === 1) {
      allListings.sort((a, b) => (a.specifications?.year || 0) - (b.specifications?.year || 0));
    } else if (sort['specifications.mileage'] === -1) {
      allListings.sort((a, b) => (b.specifications?.mileage || 0) - (a.specifications?.mileage || 0));
    } else if (sort['specifications.mileage'] === 1) {
      allListings.sort((a, b) => (a.specifications?.mileage || 0) - (b.specifications?.mileage || 0));
    }
    
    // Apply pagination to combined results
    const total = allListings.length;
    const paginatedListings = allListings.slice(skip, skip + limit);
    
    // DEBUGGING: Log first few listings
    console.log(`[${timestamp}] Sample combined listings:`, paginatedListings.slice(0, 2).map(l => ({
      id: l._id,
      title: l.title,
      status: l.status,
      sourceType: l.sourceType,
      createdAt: l.createdAt,
      dealerId: l.dealerId,
      hasDealerObject: !!l.dealer,
      dealerBusinessName: l.dealer?.businessName,
      dealerSellerType: l.dealer?.sellerType,
      dealerProfileLogo: l.dealer?.profile?.logo
    })));
    
    // =================================
    // EXISTING DEALER POPULATION LOGIC
    // =================================
    
    // HYBRID FIX: Only populate dealership profiles, leave private sellers alone
    const dealersCollection = db.collection('dealers');
    
    console.log(`[${timestamp}] Starting hybrid dealer population for ${paginatedListings.length} listings...`);
    
    const enhancedListings = await Promise.all(paginatedListings.map(async (listing, index) => {
      // Check if this is a private seller - if so, DON'T TOUCH IT
      if (listing.dealer && listing.dealer.sellerType === 'private') {
        console.log(`[${timestamp}] Listing ${index}: Private seller - leaving data intact for "${listing.title}"`);
        return listing;
      }
      
      // For dealerships, check if they need profile picture population
      const needsProfilePopulation = !listing.dealer?.profile?.logo || 
                                    listing.dealer.profile.logo.includes('placeholder') ||
                                    !listing.dealer.profile.logo.startsWith('http');
      
      // If dealership has profile picture, don't touch it
      if (!needsProfilePopulation) {
        console.log(`[${timestamp}] Listing ${index}: Dealership profile looks good for "${listing.title}"`);
        return listing;
      }
      
      console.log(`[${timestamp}] Listing ${index}: Dealership needs profile population for "${listing.title}"`);
      
      // Fetch dealer information ONLY for dealerships that need profile pics
      let dealerId = listing.dealerId;
      
      // Convert dealerId to ObjectId if needed
      if (typeof dealerId === 'string' && dealerId.length === 24) {
        try {
          dealerId = new ObjectId(dealerId);
        } catch (e) {
          console.warn(`[${timestamp}] Invalid ObjectId: ${dealerId}`);
        }
      }
      
      // Fetch full dealer information
      let fullDealer = null;
      if (dealerId) {
        try {
          fullDealer = await dealersCollection.findOne({ _id: dealerId });
        } catch (e) {
          console.warn(`[${timestamp}] Error fetching dealer ${dealerId}:`, e.message);
        }
      }
      
      // If we found the dealer, ONLY update the profile picture
      if (fullDealer && fullDealer.profile?.logo) {
        // Preserve all existing dealer data, only update the profile
        if (!listing.dealer) {
          listing.dealer = {};
        }
        if (!listing.dealer.profile) {
          listing.dealer.profile = {};
        }
        
        // ONLY update the missing profile picture
        listing.dealer.profile.logo = fullDealer.profile.logo;
        
        console.log(`[${timestamp}] Listing ${index}: Updated dealership profile picture for "${listing.title}" -> ${fullDealer.profile.logo}`);
      } else {
        console.warn(`[${timestamp}] Listing ${index}: Could not find profile picture for dealer ${dealerId}`);
      }
      
      return listing;
    }));
    
    console.log(`[${timestamp}] Hybrid dealer population completed`);
    console.log(`[${timestamp}] ✅ Combined results: ${regularListings.length} regular + ${transformedSubmissions.length} user submissions = ${total} total, showing ${enhancedListings.length}`);
    
    // ENHANCED: Response with comprehensive metadata
    return res.status(200).json({
      success: true,
      data: enhancedListings,
      total,
      count: enhancedListings.length,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total: total,
        limit: limit,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      filters: {
        applied: Object.keys(filter).length > 1 ? filter : null,
        section: section || 'all',
        search: search || null,
        sortBy: sortBy || 'createdAt',
        sortOrder: sortOrder === 1 ? 'asc' : 'desc'
      },
      debug: {
        regularListings: regularListings.length,
        userSubmissions: transformedSubmissions.length,
        totalCombined: total,
        eligibleSubmissions: eligibleSubmissions.length,
        approvedSubmissions: approvedSubmissions.length
      },
      message: `Found ${enhancedListings.length} of ${total} listings (${regularListings.length} regular + ${transformedSubmissions.length} user submissions) with hybrid dealer fix`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Enhanced listings error:`, error);
    
    // FALLBACK: If usersubmissions integration fails, return regular listings only
    try {
      console.log(`[${timestamp}] Falling back to regular listings only due to error`);
      
      const total = await listingsCollection.countDocuments(filter);
      const listings = await listingsCollection.find(filter)
        .skip(skip)
        .limit(limit)
        .sort(sort)
        .toArray();
      
      return res.status(200).json({
        success: true,
        data: listings,
        total,
        count: listings.length,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          total: total,
          limit: limit,
          hasNext: page < Math.ceil(total / limit),
          hasPrev: page > 1
        },
        filters: {
          applied: Object.keys(filter).length > 1 ? filter : null,
          section: section || 'all',
          search: search || null,
          sortBy: sortBy || 'createdAt',
          sortOrder: sortOrder === 1 ? 'asc' : 'desc'
        },
        message: `Found ${listings.length} regular listings (fallback mode)`,
        warning: 'User submissions integration failed, showing regular listings only'
      });
      
    } catch (fallbackError) {
      console.error(`[${timestamp}] Fallback also failed:`, fallbackError);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch listings',
        error: error.message,
        data: [],
        total: 0
      });
    }
  }
}

// === ENHANCED FILTER OPTIONS ENDPOINT ===
if (path === '/listings/filter-options' && req.method === 'GET') {
  console.log(`[${timestamp}] → ENHANCED FILTER OPTIONS`);
  
  try {
    const listingsCollection = db.collection('listings');
    
    // Get all active listings for filter generation
    const activeFilter = { status: { $in: ['active', 'pending'] } };
    
    // ENHANCED: Parallel aggregation for better performance
    const [
      makesResult,
      yearsResult,
      conditionsResult,
      fuelTypesResult,
      transmissionsResult,
      categoriesResult,
      priceStats
    ] = await Promise.all([
      // Unique makes
      listingsCollection.distinct('specifications.make', {
        ...activeFilter,
        'specifications.make': { $exists: true, $ne: null, $ne: '' }
      }),
      
      // Unique years
      listingsCollection.distinct('specifications.year', {
        ...activeFilter,
        'specifications.year': { $exists: true, $ne: null, $gte: 1990 }
      }),
      
      // Unique conditions
      listingsCollection.distinct('condition', {
        ...activeFilter,
        condition: { $exists: true, $ne: null, $ne: '' }
      }),
      
      // Unique fuel types
      listingsCollection.distinct('specifications.fuelType', {
        ...activeFilter,
        'specifications.fuelType': { $exists: true, $ne: null, $ne: '' }
      }),
      
      // Unique transmissions
      listingsCollection.distinct('specifications.transmission', {
        ...activeFilter,
        'specifications.transmission': { $exists: true, $ne: null, $ne: '' }
      }),
      
      // Unique categories/body styles
      listingsCollection.distinct('category', {
        ...activeFilter,
        category: { $exists: true, $ne: null, $ne: '' }
      }),
      
      // Price statistics for dynamic price ranges
      listingsCollection.aggregate([
        { $match: { ...activeFilter, price: { $exists: true, $gt: 0 } } },
        {
          $group: {
            _id: null,
            minPrice: { $min: '$price' },
            maxPrice: { $max: '$price' },
            avgPrice: { $avg: '$price' }
          }
        }
      ]).toArray()
    ]);
    
    // Process and clean the results
    const makes = makesResult.filter(Boolean).sort();
    const years = yearsResult.filter(year => year && year > 1990).sort((a, b) => b - a);
    const conditions = conditionsResult.filter(Boolean).sort();
    const fuelTypes = fuelTypesResult.filter(Boolean).sort();
    const transmissions = transmissionsResult.filter(Boolean).sort();
    const categories = categoriesResult.filter(Boolean).sort();
    
    // ENHANCED: Dynamic price ranges based on actual data
    const priceStatsData = priceStats[0];
    let priceRanges = [
      { label: 'All Prices', min: 0, max: null }
    ];
    
    if (priceStatsData) {
      const { minPrice, maxPrice, avgPrice } = priceStatsData;
      
      // Generate dynamic price ranges
      const ranges = [
        { label: `Under P${Math.round(avgPrice * 0.5 / 1000)}k`, min: 0, max: Math.round(avgPrice * 0.5) },
        { label: `P${Math.round(avgPrice * 0.5 / 1000)}k - P${Math.round(avgPrice / 1000)}k`, min: Math.round(avgPrice * 0.5), max: Math.round(avgPrice) },
        { label: `P${Math.round(avgPrice / 1000)}k - P${Math.round(avgPrice * 1.5 / 1000)}k`, min: Math.round(avgPrice), max: Math.round(avgPrice * 1.5) },
        { label: `P${Math.round(avgPrice * 1.5 / 1000)}k - P${Math.round(avgPrice * 2 / 1000)}k`, min: Math.round(avgPrice * 1.5), max: Math.round(avgPrice * 2) },
        { label: `Over P${Math.round(avgPrice * 2 / 1000)}k`, min: Math.round(avgPrice * 2), max: null }
      ];
      
      priceRanges = [...priceRanges, ...ranges];
    } else {
      // Fallback static ranges
      priceRanges = [
        { label: 'All Prices', min: 0, max: null },
        { label: 'Under P10,000', min: 0, max: 10000 },
        { label: 'P10,000 - P20,000', min: 10000, max: 20000 },
        { label: 'P20,000 - P30,000', min: 20000, max: 30000 },
        { label: 'P30,000 - P50,000', min: 30000, max: 50000 },
        { label: 'P50,000 - P100,000', min: 50000, max: 100000 },
        { label: 'Over P100,000', min: 100000, max: null }
      ];
    }
    
    const filterOptions = {
      makes,
      years,
      conditions,
      fuelTypes,
      transmissionTypes: transmissions,
      bodyStyles: categories,
      priceRanges,
      
      // ENHANCED: Additional metadata
      stats: priceStatsData ? {
        totalListings: makes.length > 0 ? await listingsCollection.countDocuments(activeFilter) : 0,
        priceRange: {
          min: priceStatsData.minPrice,
          max: priceStatsData.maxPrice,
          average: Math.round(priceStatsData.avgPrice)
        }
      } : null,
      
      // ENHANCED: Counts for each filter option
      counts: {
        makes: makes.length,
        years: years.length,
        conditions: conditions.length,
        fuelTypes: fuelTypes.length,
        transmissions: transmissions.length,
        categories: categories.length
      }
    };
    
    console.log(`[${timestamp}] ✅ Enhanced filter options: ${makes.length} makes, ${years.length} years, ${conditions.length} conditions`);
    
    return res.status(200).json({
      success: true,
      data: filterOptions,
      message: 'Enhanced filter options retrieved successfully',
      generated: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Enhanced filter options error:`, error);
    
    // ENHANCED: Better fallback with more comprehensive options
    const fallbackOptions = {
      makes: ['BMW', 'Mercedes-Benz', 'Toyota', 'Ford', 'Honda', 'Nissan', 'Volkswagen', 'Audi', 'Lexus', 'Hyundai'],
      years: [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013, 2012, 2011, 2010],
      conditions: ['new', 'used', 'certified', 'demo'],
      fuelTypes: ['petrol', 'diesel', 'hybrid', 'electric', 'plugin-hybrid'],
      transmissionTypes: ['automatic', 'manual', 'cvt'],
      bodyStyles: ['Sedan', 'SUV', 'Hatchback', 'Coupe', 'Convertible', 'Pickup', 'Wagon', 'Minivan'],
      priceRanges: [
        { label: 'All Prices', min: 0, max: null },
        { label: 'Under P10,000', min: 0, max: 10000 },
        { label: 'P10,000 - P20,000', min: 10000, max: 20000 },
        { label: 'P20,000 - P30,000', min: 20000, max: 30000 },
        { label: 'P30,000 - P50,000', min: 30000, max: 50000 },
        { label: 'P50,000 - P100,000', min: 50000, max: 100000 },
        { label: 'Over P100,000', min: 100000, max: null }
      ],
      counts: {
        makes: 10,
        years: 15,
        conditions: 4,
        fuelTypes: 5,
        transmissions: 3,
        categories: 8
      }
    };
    
    return res.status(200).json({
      success: true,
      data: fallbackOptions,
      message: 'Filter options retrieved (enhanced fallback data)',
      fallback: true,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}



// === FEATURED LISTINGS (ENHANCED) ===
// === FEATURED LISTINGS (FIXED - ORIGINAL LOGIC + ENHANCEMENTS) ===
if (path === '/listings/featured') {
  console.log(`[${timestamp}] → FEATURED LISTINGS (FIXED)`);
  
  try {
    const listingsCollection = db.collection('listings');
    const { ObjectId } = await import('mongodb');
    
    const limit = parseInt(searchParams.get('limit')) || 6;
    
    // STEP 1: Try to find listings marked as featured (ORIGINAL LOGIC)
    let featuredListings = await listingsCollection.find({ 
      featured: true,
      status: 'active'
    }).limit(limit).sort({ createdAt: -1 }).toArray();
    
    console.log(`[${timestamp}] Found ${featuredListings.length} listings with featured=true`);
    
    // STEP 2: ENHANCED - Also look for listings with featured addon payments
    if (featuredListings.length < limit) {
      const paymentsCollection = db.collection('payments');
      
      // Find completed payments with featured addon
      const featuredPayments = await paymentsCollection.find({
        status: 'completed',
        $or: [
          { isFeatured: true },
          { 'addons.key': 'featured' }
        ]
      }).toArray();
      
      const featuredListingIds = featuredPayments.map(p => p.listing).filter(Boolean);
      
      if (featuredListingIds.length > 0) {
        console.log(`[${timestamp}] Found ${featuredListingIds.length} listings with featured addon payments`);
        
        // Get additional featured listings from payments
        const additionalFeatured = await listingsCollection.find({
          _id: { $in: featuredListingIds },
          status: 'active',
          featured: { $ne: true } // Don't duplicate existing featured listings
        }).limit(limit - featuredListings.length).sort({ createdAt: -1 }).toArray();
        
        console.log(`[${timestamp}] Found ${additionalFeatured.length} additional featured listings from payments`);
        
        // Merge with existing featured listings
        featuredListings = [...featuredListings, ...additionalFeatured];
      }
    }
    
    // STEP 3: ORIGINAL FALLBACK LOGIC - High-value listings if still not enough
    if (featuredListings.length === 0) {
      console.log(`[${timestamp}] No featured listings found, using fallback to high-value listings`);
      
      featuredListings = await listingsCollection.find({
        $or: [
          { price: { $gte: 300000 } },
          { 'priceOptions.showSavings': true }
        ],
        status: 'active'
      }).limit(limit).sort({ price: -1, createdAt: -1 }).toArray();
      
      console.log(`[${timestamp}] Fallback found ${featuredListings.length} high-value listings`);
    }
    
    // Enhanced logging for debugging
    featuredListings.forEach((listing, index) => {
      console.log(`[${timestamp}] Featured listing ${index + 1}: ${listing.title} (featured: ${listing.featured}, price: ${listing.price})`);
    });
    
    return res.status(200).json({
      success: true,
      count: featuredListings.length,
      data: featuredListings,
      message: `Found ${featuredListings.length} featured listings`,
      debug: {
        timestamp: new Date().toISOString(),
        enhanced: true,
        originalLogicMaintained: true
      }
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Featured listings error:`, error);
    
    // FALLBACK: Return empty array to avoid breaking frontend
    return res.status(200).json({
      success: true,
      count: 0,
      data: [],
      message: 'Featured listings temporarily unavailable',
      error: error.message
    });
  }
}

// @desc    Sync featured listings from payment data
// @route   POST /admin/sync-featured-listings
// @access  Private/Admin  
if (path === '/admin/sync-featured-listings' && req.method === 'POST') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] → SYNC FEATURED LISTINGS`);
  
  try {
    const { ObjectId } = await import('mongodb');
    const listingsCollection = db.collection('listings');
    const paymentsCollection = db.collection('payments');
    
    // Find all completed payments with featured addon
    const featuredPayments = await paymentsCollection.find({
      status: 'completed',
      $or: [
        { isFeatured: true },
        { 'addons.key': 'featured' }
      ]
    }).toArray();
    
    console.log(`[${timestamp}] Found ${featuredPayments.length} featured payments to sync`);
    
    let syncedCount = 0;
    
    for (const payment of featuredPayments) {
      if (payment.listing) {
        const result = await listingsCollection.updateOne(
          { 
            _id: payment.listing,
            status: 'published' // Only sync published listings
          },
          { 
            $set: { 
              featured: true,
              'featured.status': 'active',
              'featured.activatedAt': payment.completedAt,
              'featured.paymentId': payment._id,
              updatedAt: new Date()
            }
          }
        );
        
        if (result.modifiedCount > 0) {
          syncedCount++;
          console.log(`[${timestamp}] ✅ Synced featured status for listing: ${payment.listing}`);
        }
      }
    }
    
    return res.status(200).json({
      success: true,
      message: `Synced ${syncedCount} featured listings`,
      syncedCount,
      totalFeaturedPayments: featuredPayments.length,
      timestamp
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Sync featured listings error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync featured listings',
      error: error.message,
      timestamp
    });
  }
}

// === POPULAR LISTINGS (NEW) ===
if (path === '/listings/popular' && req.method === 'GET') {
  console.log(`[${timestamp}] → POPULAR LISTINGS`);
  
  try {
    const listingsCollection = db.collection('listings');
    const limit = parseInt(searchParams.get('limit')) || 6;
    
    // Get popular listings based on views, saves, and contacts
    const popularListings = await listingsCollection.find({
      status: 'active'
    }).sort({
      views: -1,
      saves: -1,
      contacts: -1,
      createdAt: -1
    }).limit(limit).toArray();
    
    return res.status(200).json({
      success: true,
      count: popularListings.length,
      data: popularListings,
      message: `Found ${popularListings.length} popular listings`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Popular listings error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch popular listings',
      error: error.message
    });
  }
}

// === SIMILAR LISTINGS (NEW) ===
if (path.match(/^\/listings\/[a-fA-F0-9]{24}\/similar$/) && req.method === 'GET') {
  const listingId = path.split('/')[2];
  console.log(`[${timestamp}] → SIMILAR LISTINGS: ${listingId}`);
  
  try {
    const listingsCollection = db.collection('listings');
    const { ObjectId } = await import('mongodb');
    const limit = parseInt(searchParams.get('limit')) || 5;
    
    // Get the original listing first
    const originalListing = await listingsCollection.findOne({ 
      _id: new ObjectId(listingId) 
    });
    
    if (!originalListing) {
      return res.status(404).json({
        success: false,
        message: 'Original listing not found'
      });
    }
    
    // Build similarity filter
    let similarityFilter = {
      _id: { $ne: new ObjectId(listingId) }, // Exclude original
      status: 'active'
    };
    
    // Match by make first
    if (originalListing.specifications?.make) {
      similarityFilter['specifications.make'] = originalListing.specifications.make;
    }
    
    let similarListings = await listingsCollection.find(similarityFilter)
      .limit(limit).toArray();
    
    // If not enough results, broaden search by category
    if (similarListings.length < limit && originalListing.category) {
      similarityFilter = {
        _id: { $ne: new ObjectId(listingId) },
        status: 'active',
        category: originalListing.category
      };
      
      similarListings = await listingsCollection.find(similarityFilter)
        .limit(limit).toArray();
    }
    
    // If still not enough, get by price range
    if (similarListings.length < limit && originalListing.price) {
      const priceRange = originalListing.price * 0.3; // 30% price range
      similarityFilter = {
        _id: { $ne: new ObjectId(listingId) },
        status: 'active',
        price: {
          $gte: originalListing.price - priceRange,
          $lte: originalListing.price + priceRange
        }
      };
      
      similarListings = await listingsCollection.find(similarityFilter)
        .limit(limit).toArray();
    }
    
    return res.status(200).json({
      success: true,
      data: similarListings,
      count: similarListings.length,
      originalListingId: listingId,
      message: `Found ${similarListings.length} similar listings`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Similar listings error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch similar listings',
      error: error.message
    });
  }
}

// === INCREMENT VIEW COUNT (NEW) ===
if (path.match(/^\/listings\/[a-fA-F0-9]{24}\/views$/) && req.method === 'POST') {
  const listingId = path.split('/')[2];
  console.log(`[${timestamp}] → INCREMENT VIEWS: ${listingId}`);
  
  try {
    const listingsCollection = db.collection('listings');
    const { ObjectId } = await import('mongodb');
    
    const result = await listingsCollection.updateOne(
      { _id: new ObjectId(listingId) },
      { 
        $inc: { views: 1 },
        $set: { updatedAt: new Date() }
      }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found'
      });
    }
    
    // Get updated view count
    const updatedListing = await listingsCollection.findOne(
      { _id: new ObjectId(listingId) },
      { projection: { views: 1, title: 1 } }
    );
    
    return res.status(200).json({
      success: true,
      message: 'View count incremented',
      data: {
        id: listingId,
        views: updatedListing.views,
        title: updatedListing.title
      }
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Increment views error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to increment view count',
      error: error.message
    });
  }
}

// === BATCH DELETE LISTINGS (NEW) ===
if (path === '/listings/batch-delete' && req.method === 'POST') {
  console.log(`[${timestamp}] → BATCH DELETE LISTINGS`);
  
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
    
    const { ids } = body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of listing IDs'
      });
    }
    
    const listingsCollection = db.collection('listings');
    const { ObjectId } = await import('mongodb');
    
    const objectIds = ids.map(id => new ObjectId(id));
    
    // Soft delete all listings
    const result = await listingsCollection.updateMany(
      { _id: { $in: objectIds } },
      { 
        $set: { 
          status: 'deleted',
          deletedAt: new Date(),
          updatedAt: new Date()
        }
      }
    );
    
    console.log(`[${timestamp}] ✅ Batch deleted ${result.modifiedCount} listings`);
    
    return res.status(200).json({
      success: true,
      message: `Successfully deleted ${result.modifiedCount} listings`,
      deletedCount: result.modifiedCount,
      requestedCount: ids.length
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Batch delete error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to batch delete listings',
      error: error.message
    });
  }
}

// === BATCH STATUS UPDATE (NEW) ===
if (path === '/listings/batch-status' && req.method === 'PATCH') {
  console.log(`[${timestamp}] → BATCH STATUS UPDATE`);
  
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
    
    const { ids, status } = body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of listing IDs'
      });
    }
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a status'
      });
    }
    
    const listingsCollection = db.collection('listings');
    const { ObjectId } = await import('mongodb');
    
    const objectIds = ids.map(id => new ObjectId(id));
    
    const result = await listingsCollection.updateMany(
      { _id: { $in: objectIds } },
      { 
        $set: { 
          status: status,
          updatedAt: new Date()
        }
      }
    );
    
    console.log(`[${timestamp}] ✅ Batch updated ${result.modifiedCount} listings to ${status}`);
    
    return res.status(200).json({
      success: true,
      message: `Successfully updated ${result.modifiedCount} listings to ${status}`,
      updatedCount: result.modifiedCount,
      requestedCount: ids.length,
      newStatus: status
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Batch status update error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to batch update listing status',
      error: error.message
    });
  }
}

// === BUSINESS CARD DEALER LISTINGS (ENHANCED) ===
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
          dealerId: dealerObjectId,
          status: { $ne: 'deleted' } // Exclude deleted listings
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
        const stringListings = await listingsCollection.find({ 
          dealerId: dealerId,
          status: { $ne: 'deleted' }
        }).toArray();
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

// === UPDATE LISTING STATUS (ENHANCED - Support both PUT and PATCH) ===
if (path.match(/^\/listings\/[a-fA-F0-9]{24}\/status\/[a-zA-Z]+$/) && (req.method === 'PUT' || req.method === 'PATCH')) {
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

// === TOGGLE LISTING FEATURED (ENHANCED - Support both PUT and PATCH) ===
if (path.match(/^\/listings\/[a-fA-F0-9]{24}\/featured\/[a-zA-Z]+$/) && (req.method === 'PUT' || req.method === 'PATCH')) {
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

// === GET MODELS BY MAKE (ENHANCED) ===
if (path.match(/^\/models\/(.+)$/) && req.method === 'GET') {
  const make = path.split('/')[2];
  console.log(`[${timestamp}] → GET MODELS FOR MAKE: ${make}`);
  
  try {
    const listingsCollection = db.collection('listings');
    
    const models = await listingsCollection.distinct('specifications.model', {
      'specifications.make': { $regex: new RegExp(`^${make}$`, 'i') },
      status: { $ne: 'deleted' },
      'specifications.model': { $exists: true, $ne: null, $ne: '' }
    });
    
    const cleanModels = models.filter(Boolean).sort();
    
    if (cleanModels.length === 0) {
      const fallbackModels = {
        'BMW': ['1 Series', '2 Series', '3 Series', '4 Series', '5 Series', '6 Series', '7 Series', 'X1', 'X3', 'X5', 'X6'],
        'Mercedes-Benz': ['A-Class', 'C-Class', 'E-Class', 'S-Class', 'GLA', 'GLC', 'GLE', 'GLS'],
        'Mercedes': ['A-Class', 'C-Class', 'E-Class', 'S-Class', 'GLA', 'GLC', 'GLE', 'GLS'],
        'Toyota': ['Camry', 'Corolla', 'RAV4', 'Highlander', 'Prius', '4Runner', 'Land Cruiser'],
        'Ford': ['F-150', 'Mustang', 'Explorer', 'Escape', 'Ranger', 'Bronco'],
        'Honda': ['Civic', 'Accord', 'CR-V', 'Pilot', 'Fit', 'HR-V'],
        'Nissan': ['Altima', 'Sentra', 'Rogue', 'Pathfinder', 'Frontier', 'Murano'],
      };
      
      const fallbackForMake = fallbackModels[make] || fallbackModels[make.charAt(0).toUpperCase() + make.slice(1).toLowerCase()];
      
      if (fallbackForMake) {
        console.log(`[${timestamp}] Using fallback models for ${make}: ${fallbackForMake.length} models`);
        return res.status(200).json({
          success: true,
          data: fallbackForMake,
          message: `Models for ${make} (fallback data)`
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





// === ALTERNATIVE: /listings/models/{make} (in case listingService uses this path) ===
if (path.match(/^\/listings\/models\/(.+)$/) && req.method === 'GET') {
  const make = path.split('/')[3];
  console.log(`[${timestamp}] → GET LISTING MODELS FOR MAKE: ${make}`);
  
  // Redirect to the main models endpoint logic (same as above)
  // This is just an alias for the /models/{make} endpoint
  try {
    const listingsCollection = db.collection('listings');
    
    const models = await listingsCollection.distinct('specifications.model', {
      'specifications.make': { $regex: new RegExp(`^${make}$`, 'i') },
      status: { $ne: 'deleted' },
      'specifications.model': { $exists: true, $ne: null, $ne: '' }
    });
    
    const cleanModels = models.filter(Boolean).sort();
    
    if (cleanModels.length === 0) {
      const fallbackModels = {
        'BMW': ['1 Series', '2 Series', '3 Series', '4 Series', '5 Series', '6 Series', '7 Series', 'X1', 'X3', 'X5', 'X6'],
        'Mercedes-Benz': ['A-Class', 'C-Class', 'E-Class', 'S-Class', 'GLA', 'GLC', 'GLE', 'GLS'],
        'Mercedes': ['A-Class', 'C-Class', 'E-Class', 'S-Class', 'GLA', 'GLC', 'GLE', 'GLS'],
        'Toyota': ['Camry', 'Corolla', 'RAV4', 'Highlander', 'Prius', '4Runner', 'Land Cruiser'],
        'Ford': ['F-150', 'Mustang', 'Explorer', 'Escape', 'Ranger', 'Bronco'],
        'Honda': ['Civic', 'Accord', 'CR-V', 'Pilot', 'Fit', 'HR-V'],
        'Nissan': ['Altima', 'Sentra', 'Rogue', 'Pathfinder', 'Frontier', 'Murano'],
      };
      
      const fallbackForMake = fallbackModels[make] || fallbackModels[make.charAt(0).toUpperCase() + make.slice(1).toLowerCase()];
      
      if (fallbackForMake) {
        return res.status(200).json({
          success: true,
          data: fallbackForMake,
          message: `Models for ${make} via /listings/models (fallback)`
        });
      }
    }
    
    return res.status(200).json({
      success: true,
      data: cleanModels,
      message: `Found ${cleanModels.length} models for ${make} via /listings/models`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Listings models error:`, error);
    return res.status(500).json({
      success: false,
      message: `Failed to get models for ${make}`,
      error: error.message,
      data: []
    });
  }
}

// === ALTERNATIVE MODELS ENDPOINT (query parameter version) ===
if (path === '/listings/models' && req.method === 'GET') {
  const make = searchParams.get('make');
  console.log(`[${timestamp}] → GET MODELS BY MAKE (query): ${make}`);
  
  if (!make) {
    return res.status(400).json({
      success: false,
      message: 'Make parameter is required',
      data: []
    });
  }
  
  try {
    const listingsCollection = db.collection('listings');
    
    const models = await listingsCollection.distinct('specifications.model', {
      'specifications.make': { $regex: new RegExp(`^${make}$`, 'i') },
      status: { $ne: 'deleted' },
      'specifications.model': { $exists: true, $ne: null, $ne: '' }
    });
    
    const cleanModels = models.filter(Boolean).sort();
    
    return res.status(200).json({
      success: true,
      data: cleanModels,
      make: make,
      message: `Found ${cleanModels.length} models for ${make}`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Models query error:`, error);
    return res.status(500).json({
      success: false,
      message: `Failed to get models for ${make}`,
      error: error.message,
      data: []
    });
  }
}

// === TEST API CONNECTION (NEW) ===
if (path === '/listings/test-api' && req.method === 'GET') {
  console.log(`[${timestamp}] → TEST LISTINGS API`);
  
  try {
    const listingsCollection = db.collection('listings');
    const count = await listingsCollection.countDocuments({ status: { $ne: 'deleted' } });
    
    return res.status(200).json({
      success: true,
      message: 'Listings API is working',
      data: {
        timestamp: new Date().toISOString(),
        activeListings: count,
        endpoint: '/listings/test-api'
      }
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Test API error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Listings API test failed',
      error: error.message
    });
  }
}

// === INDIVIDUAL LISTING (ULTRA-ROBUST WITH FULL BACKWARD COMPATIBILITY) ===
if (path.includes('/listings/') && 
    !path.includes('/listings/dealer/') && 
    !path.includes('/listings/featured') && 
    !path.includes('/listings/popular') &&
    !path.includes('/listings/filter-options') &&
    !path.includes('/listings/models') &&
    !path.includes('/listings/batch-') &&
    !path.includes('/listings/test-api') &&
    !path.includes('/similar') &&
    !path.includes('/views') &&
    !path.includes('/status') &&
    !path.includes('/featured') &&
    path !== '/listings') {
  
  const listingId = path.replace('/listings/', '');
  console.log(`[${timestamp}] → INDIVIDUAL LISTING (INCLUDING USER SUBMISSIONS): "${listingId}"`);
  
  try {
    const listingsCollection = db.collection('listings');
    const dealersCollection = db.collection('dealers');
    const userSubmissionsCollection = db.collection('usersubmissions');
    const usersCollection = db.collection('users');
    const paymentsCollection = db.collection('payments');
    const { ObjectId } = await import('mongodb');
    
    let listing = null;
    let isUserSubmission = false;
    
    // ========================================
    // STEP 1: Try to find in regular listings (EXISTING LOGIC)
    // ========================================
    
    // Try string ID first
    listing = await listingsCollection.findOne({ _id: listingId });
    
    // Try ObjectId if string fails
    if (!listing && listingId.length === 24) {
      try {
        listing = await listingsCollection.findOne({ _id: new ObjectId(listingId) });
      } catch (oidError) {
        console.log(`[${timestamp}] Listing ObjectId failed: ${oidError.message}`);
      }
    }
    
    // Try by slug if both ID methods fail
    if (!listing) {
      listing = await listingsCollection.findOne({ slug: listingId });
    }
    
    // ========================================
    // STEP 2: NEW - Try to find in usersubmissions if not found in regular listings
    // ========================================
    
    if (!listing) {
      console.log(`[${timestamp}] Not found in regular listings, searching user submissions...`);
      
      let userSubmission = null;
      
      // Try string ID first for usersubmissions
      try {
        userSubmission = await userSubmissionsCollection.findOne({ _id: listingId });
      } catch (e) {
        // Ignore string ID error
      }
      
      // Try ObjectId for usersubmissions
      if (!userSubmission && listingId.length === 24) {
        try {
          userSubmission = await userSubmissionsCollection.findOne({ _id: new ObjectId(listingId) });
        } catch (oidError) {
          console.log(`[${timestamp}] UserSubmission ObjectId failed: ${oidError.message}`);
        }
      }
      
      if (userSubmission) {
        console.log(`[${timestamp}] Found in usersubmissions: ${userSubmission.listingData?.title}`);
        
        // Check if submission is approved
        if (!['approved', 'listing_created'].includes(userSubmission.status)) {
          return res.status(404).json({
            success: false,
            message: 'Listing not found or not yet approved',
            listingId: listingId
          });
        }
        
        // For paid tiers, check payment status
        const isFreeSubmission = userSubmission.selectedTier === 'free' || 
                               userSubmission.paymentRequired === false ||
                               userSubmission.listingData?.selectedPlan === 'free';
        
        if (!isFreeSubmission) {
          // Check if payment completed for paid tier
          const payment = await paymentsCollection.findOne({
            $or: [
              { submissionId: new ObjectId(userSubmission._id) },
              { submissionId: userSubmission._id.toString() },
              { listing: new ObjectId(userSubmission._id) },
              { listing: userSubmission._id.toString() }
            ],
            status: 'completed'
          });
          
          if (!payment) {
            return res.status(404).json({
              success: false,
              message: 'Listing not found or payment pending',
              listingId: listingId
            });
          }
        }
        
        // Get user profile picture
        let userProfilePicture = '/images/placeholders/private-seller.jpg';
        let userData = null;
        
        try {
          if (userSubmission.userId) {
            userData = await usersCollection.findOne({ 
              _id: new ObjectId(userSubmission.userId) 
            });
            
            if (userData && userData.avatar && userData.avatar.url) {
              userProfilePicture = userData.avatar.url;
              console.log(`[${timestamp}] Using user avatar for detail page: ${userProfilePicture}`);
            }
          }
        } catch (userLookupError) {
          console.error(`[${timestamp}] Error fetching user for detail page:`, userLookupError);
        }
        
        // Transform usersubmission to listing format
        const data = userSubmission.listingData || {};
        listing = {
          _id: userSubmission._id,
          title: data.title || 'Untitled Listing',
          description: data.description || '',
          price: data.pricing?.price || 0,
          images: data.images || [],
          specifications: data.specifications || {},
          contact: data.contact || {},
          location: data.location || {},
          category: data.category || 'cars',
          condition: data.condition || 'used',
          features: data.features || [],
          safetyFeatures: data.safetyFeatures || [],
          comfortFeatures: data.comfortFeatures || [],
          
          // Standard listing fields
          status: 'active',
          featured: false,
          views: 0,
          saves: 0,
          inquiries: 0,
          createdAt: userSubmission.submittedAt || new Date(),
          updatedAt: userSubmission.submittedAt || new Date(),
          
          // Source identification
          sourceType: 'user_submission',
          submissionId: userSubmission._id,
          tier: userSubmission.selectedTier || 'free',
          
          // Dealer info with user's profile picture (compatible with existing frontend expectations)
          dealer: {
            id: userSubmission.userId,
            _id: userSubmission.userId, // For backward compatibility
            name: userData?.name || data.contact?.sellerName || userSubmission.userName || 'Private Seller',
            businessName: data.contact?.sellerName || userSubmission.userName || 'Private Seller',
            sellerType: 'private',
            
            // Contact information (structured like existing listings)
            contact: {
              phone: data.contact?.phone || 'N/A',
              email: data.contact?.email || userSubmission.userEmail || 'N/A',
              website: null
            },
            
            // Location information
            location: {
              city: data.location?.city || 'Unknown',
              state: data.location?.state || null,
              country: data.location?.country || 'Unknown',
              address: data.location?.address || null
            },
            
            // Verification status (private sellers are typically not verified)
            verification: {
              isVerified: false,
              verifiedAt: null,
              status: 'unverified'
            },
            
            // Profile information with user's actual picture
            profile: {
              logo: userProfilePicture,
              banner: null,
              description: data.description || null
            },
            
            // Private seller information
            privateSeller: {
              firstName: userData?.profile?.firstName || userData?.name?.split(' ')[0] || 'User',
              lastName: userData?.profile?.lastName || userData?.name?.split(' ').slice(1).join(' ') || '',
              preferredContactMethod: data.contact?.preferredContactMethod || 'both',
              canShowContactInfo: true
            },
            
            // Metrics (default for new private sellers)
            metrics: {
              totalListings: 1,
              activeSales: 0,
              averageRating: 0,
              totalReviews: 0
            },
            
            // Rating for backward compatibility
            rating: {
              average: 0,
              count: 0
            }
          },
          
          // Price options
          priceOptions: {
            showSavings: false,
            savingsAmount: 0,
            originalPrice: data.pricing?.price || 0
          },
          
          // Subscription info
          subscription: {
            tier: userSubmission.selectedTier || 'free',
            status: 'active',
            expiresAt: null
          }
        };
        
        isUserSubmission = true;
        console.log(`[${timestamp}] ✅ Successfully transformed user submission to listing format`);
      }
    }
    
    // ========================================
    // STEP 3: Check if any listing found
    // ========================================
    
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Listing not found',
        listingId: listingId
      });
    }
    
    // Check if listing is deleted (only for regular listings)
    if (!isUserSubmission && listing.status === 'deleted') {
      return res.status(404).json({
        success: false,
        message: 'Listing not found',
        listingId: listingId
      });
    }

    console.log(`[${timestamp}] Individual listing found: ${listing.title} (${isUserSubmission ? 'user submission' : 'regular listing'})`);
    
    // ========================================
    // STEP 4: Process regular listings with existing logic (UNCHANGED)
    // ========================================
    
    if (!isUserSubmission) {
      // === ENHANCED BACKWARD COMPATIBILITY DETECTION ===
      
      // Detect listing format and data completeness
      const listingAnalysis = {
        hasDealer: !!listing.dealer,
        dealerDataType: listing.dealer ? typeof listing.dealer : 'none',
        dealerSellerType: listing.dealer?.sellerType,
        dealerBusinessName: listing.dealer?.businessName,
        dealerContactPhone: listing.dealer?.contact?.phone,
        dealerContactEmail: listing.dealer?.contact?.email,
        hasProfileLogo: !!listing.dealer?.profile?.logo,
        hasDealerId: !!listing.dealerId,
        dealerId: listing.dealerId,
        // Check for old vs new format indicators
        hasCompleteContactInfo: !!(listing.dealer?.contact?.phone && listing.dealer?.contact?.email && 
                                   listing.dealer?.contact?.phone !== 'N/A' && listing.dealer?.contact?.email !== 'N/A'),
        hasValidProfilePicture: !!(listing.dealer?.profile?.logo && 
                                  listing.dealer?.profile?.logo !== 'placeholder' && 
                                  listing.dealer?.profile?.logo.startsWith('http')),
        // Old listings often have mongoose-populated dealer objects
        isDealerObjectPopulated: !!(listing.dealer && listing.dealer._id),
        // New listings might have basic dealer objects
        hasBasicDealerInfo: !!(listing.dealer?.businessName && listing.dealer?.businessName !== 'Unknown Seller')
      };
      
      console.log(`[${timestamp}] Listing analysis:`, listingAnalysis);
      
      // === DECISION TREE FOR HANDLING DIFFERENT LISTING FORMATS ===
      
      // CASE 1: Private seller - NEVER touch (both old and new should work as-is)
      if (listing.dealer && listing.dealer.sellerType === 'private') {
        console.log(`[${timestamp}] CASE 1: Private seller - preserving original data for "${listing.title}"`);
        
        // Increment views and return as-is
        try {
          await listingsCollection.updateOne({ _id: listing._id }, { $inc: { views: 1 } });
          listing.views = (listing.views || 0) + 1;
        } catch (viewError) {
          console.warn(`[${timestamp}] Error incrementing views:`, viewError.message);
        }
        
        return res.status(200).json({
          success: true,
          data: listing,
          message: `Found listing: ${listing.title}`
        });
      }
      
      // CASE 2: Old listing with complete dealer data - PRESERVE (don't mess with working data)
      if (listingAnalysis.hasCompleteContactInfo && 
          listingAnalysis.hasValidProfilePicture && 
          listingAnalysis.hasBasicDealerInfo) {
        console.log(`[${timestamp}] CASE 2: Old listing with complete data - preserving for "${listing.title}"`);
        
        // Increment views and return as-is
        try {
          await listingsCollection.updateOne({ _id: listing._id }, { $inc: { views: 1 } });
          listing.views = (listing.views || 0) + 1;
        } catch (viewError) {
          console.warn(`[${timestamp}] Error incrementing views:`, viewError.message);
        }
        
        return res.status(200).json({
          success: true,
          data: listing,
          message: `Found listing: ${listing.title}`
        });
      }
      
      // CASE 3: Old listing with mongoose-populated dealer object - PRESERVE but enhance if needed
      if (listingAnalysis.isDealerObjectPopulated && listingAnalysis.hasCompleteContactInfo) {
        console.log(`[${timestamp}] CASE 3: Old populated dealer object - minimal enhancement for "${listing.title}"`);
        
        // Only add missing profile picture if needed
        if (!listingAnalysis.hasValidProfilePicture && listing.dealerId) {
          try {
            let dealerId = listing.dealerId;
            if (typeof dealerId === 'string' && dealerId.length === 24) {
              dealerId = new ObjectId(dealerId);
            }
            
            const fullDealer = await dealersCollection.findOne({ _id: dealerId });
            if (fullDealer?.profile?.logo && !listing.dealer.profile) {
              listing.dealer.profile = { logo: fullDealer.profile.logo };
              console.log(`[${timestamp}] Added missing profile picture to old listing`);
            }
          } catch (e) {
            console.warn(`[${timestamp}] Could not enhance old listing profile:`, e.message);
          }
        }
        
        // Increment views and return
        try {
          await listingsCollection.updateOne({ _id: listing._id }, { $inc: { views: 1 } });
          listing.views = (listing.views || 0) + 1;
        } catch (viewError) {
          console.warn(`[${timestamp}] Error incrementing views:`, viewError.message);
        }
        
        return res.status(200).json({
          success: true,
          data: listing,
          message: `Found listing: ${listing.title}`
        });
      }
      
      // CASE 4: New listing or old listing with incomplete data - POPULATE FULLY
      console.log(`[${timestamp}] CASE 4: New/incomplete listing - full population needed for "${listing.title}"`);
      
      // Fetch complete dealer information
      let dealerId = listing.dealerId;
      
      if (!dealerId) {
        console.warn(`[${timestamp}] No dealerId found for listing - cannot populate dealer data`);
        
        // Return listing as-is if no dealerId
        try {
          await listingsCollection.updateOne({ _id: listing._id }, { $inc: { views: 1 } });
          listing.views = (listing.views || 0) + 1;
        } catch (viewError) {
          console.warn(`[${timestamp}] Error incrementing views:`, viewError.message);
        }
        
        return res.status(200).json({
          success: true,
          data: listing,
          message: `Found listing: ${listing.title}`
        });
      }
      
      // Convert dealerId to ObjectId if needed
      if (typeof dealerId === 'string' && dealerId.length === 24) {
        try {
          dealerId = new ObjectId(dealerId);
        } catch (e) {
          console.warn(`[${timestamp}] Invalid ObjectId: ${dealerId}`);
        }
      }
      
      // Fetch full dealer information from database
      let fullDealer = null;
      try {
        fullDealer = await dealersCollection.findOne({ _id: dealerId });
        console.log(`[${timestamp}] Found dealer in database:`, {
          id: fullDealer?._id,
          businessName: fullDealer?.businessName,
          sellerType: fullDealer?.sellerType,
          hasProfile: !!fullDealer?.profile,
          hasContact: !!fullDealer?.contact,
          hasLocation: !!fullDealer?.location
        });
      } catch (e) {
        console.warn(`[${timestamp}] Error fetching dealer ${dealerId}:`, e.message);
      }
      
      if (!fullDealer) {
        console.warn(`[${timestamp}] Could not find dealer ${dealerId} - returning listing as-is`);
        
        // Return listing as-is if dealer not found
        try {
          await listingsCollection.updateOne({ _id: listing._id }, { $inc: { views: 1 } });
          listing.views = (listing.views || 0) + 1;
        } catch (viewError) {
          console.warn(`[${timestamp}] Error incrementing views:`, viewError.message);
        }
        
        return res.status(200).json({
          success: true,
          data: listing,
          message: `Found listing: ${listing.title}`
        });
      }
      
      // === FULL DEALER DATA POPULATION FOR NEW LISTINGS ===
      
      const isPrivateSeller = fullDealer.sellerType === 'private';
      
      // Calculate display name based on seller type
      let displayName;
      let contactName;
      
      if (isPrivateSeller && fullDealer.privateSeller) {
        displayName = `${fullDealer.privateSeller.firstName} ${fullDealer.privateSeller.lastName}`;
        contactName = displayName;
      } else {
        displayName = fullDealer.businessName || 'Unknown Seller';
        contactName = fullDealer.user?.name || fullDealer.businessName || 'Unknown';
      }
      
      // Create complete dealer object (for new listings or incomplete old listings)
      listing.dealer = {
        ...listing.dealer, // Preserve any existing data
        
        // Core identification
        id: fullDealer._id,
        _id: fullDealer._id, // For backward compatibility with old frontend code
        name: contactName,
        businessName: displayName,
        sellerType: fullDealer.sellerType || 'dealership',
        
        // Contact information
        contact: {
          phone: fullDealer.contact?.phone || 'N/A',
          email: fullDealer.contact?.email || 'N/A',
          website: (!isPrivateSeller && fullDealer.contact?.website) ? fullDealer.contact.website : null
        },
        
        // Location information
        location: {
          city: fullDealer.location?.city || 'Unknown',
          state: fullDealer.location?.state || null,
          country: fullDealer.location?.country || 'Unknown',
          address: fullDealer.location?.address || null
        },
        
        // Verification status
        verification: {
          isVerified: fullDealer.verification?.status === 'verified',
          verifiedAt: fullDealer.verification?.verifiedAt || null,
          status: fullDealer.verification?.status || 'unverified' // For old frontend compatibility
        },
        
        // Profile information
        profile: {
          logo: fullDealer.profile?.logo || null,
          banner: fullDealer.profile?.banner || null,
          description: fullDealer.profile?.description || null,
          ...listing.dealer?.profile // Preserve any existing profile data
        },
        
        // Include private seller information if applicable
        ...(isPrivateSeller && fullDealer.privateSeller && {
          privateSeller: {
            firstName: fullDealer.privateSeller.firstName,
            lastName: fullDealer.privateSeller.lastName,
            preferredContactMethod: fullDealer.privateSeller.preferredContactMethod || 'both',
            canShowContactInfo: fullDealer.privateSeller.canShowContactInfo !== false
          }
        }),
        
        // Include business type for dealerships
        ...((!isPrivateSeller && fullDealer.businessType) && {
          businessType: fullDealer.businessType
        }),
        
        // Include working hours for dealerships
        ...((!isPrivateSeller && fullDealer.profile?.workingHours) && {
          workingHours: fullDealer.profile.workingHours
        }),
        
        // Include metrics if available
        ...(fullDealer.metrics && {
          metrics: {
            totalListings: fullDealer.metrics.totalListings || 0,
            activeSales: fullDealer.metrics.activeSales || 0,
            averageRating: fullDealer.metrics.averageRating || 0,
            totalReviews: fullDealer.metrics.totalReviews || 0
          }
        }),
        
        // For old frontend compatibility - add these fields if they might be expected
        rating: fullDealer.rating || {
          average: fullDealer.metrics?.averageRating || 0,
          count: fullDealer.metrics?.totalReviews || 0
        }
      };
      
      console.log(`[${timestamp}] Fully populated dealer data for "${listing.title}"`);
      console.log(`[${timestamp}] Final dealer object:`, {
        businessName: listing.dealer.businessName,
        phone: listing.dealer.contact?.phone,
        email: listing.dealer.contact?.email,
        logo: listing.dealer.profile?.logo,
        city: listing.dealer.location?.city,
        isVerified: listing.dealer.verification?.isVerified
      });
    }
    
    // ========================================
    // STEP 5: Increment views and return (for both regular and user submissions)
    // ========================================
    
    // Increment views for regular listings only (user submissions don't have view tracking yet)
    if (!isUserSubmission) {
      try {
        await listingsCollection.updateOne({ _id: listing._id }, { $inc: { views: 1 } });
        listing.views = (listing.views || 0) + 1;
      } catch (viewError) {
        console.warn(`[${timestamp}] Error incrementing views:`, viewError.message);
      }
    }
    
    return res.status(200).json({
      success: true,
      data: listing,
      debug: {
        sourceType: isUserSubmission ? 'user_submission' : 'regular_listing',
        listingId: listingId,
        title: listing.title,
        hasDealer: !!listing.dealer,
        dealerType: listing.dealer?.sellerType,
        timestamp: timestamp
      },
      message: `Found listing: ${listing.title} (${isUserSubmission ? 'user submission' : 'regular listing'})`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Individual listing lookup failed:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching listing',
      error: error.message
    });
  }
}
































































    


 // ==================== SECTION 6: DEALERS ENDPOINTS ====================
 // ==================== SECTION 6: DEALERS ENDPOINTS ====================
 // ==================== SECTION 6: DEALERS ENDPOINTS ====================
 // ==================== SECTION 6: DEALERS ENDPOINTS ====================
  
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

// ADD THESE MISSING ENDPOINTS TO YOUR index.js FILE

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






































   // === FRONTEND COMPATIBLE /dealers ENDPOINTS ===
    // These endpoints match what your dealerService.js expects
    
    // === CREATE DEALER (FRONTEND ENDPOINT) ===
 
    
    
    
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










































 // ==================== SECTION 7: SERVICE PROVIDERS ENDPOINTS ====================
 // ==================== SECTION 7: SERVICE PROVIDERS ENDPOINTS ====================
 // ==================== SECTION 7: SERVICE PROVIDERS ENDPOINTS ====================
 // ==================== SECTION 7: SERVICE PROVIDERS ENDPOINTS ====================
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

// 2. MISSING: /api/providers (frontend calls this with fetch)
if (path === '/api/providers' && req.method === 'GET') {
  console.log(`[${timestamp}] → API PROVIDERS`);
  
  try {
    const serviceProvidersCollection = db.collection('serviceproviders');
    
    let filter = { status: { $ne: 'deleted' } };
    
    if (searchParams.get('status') && searchParams.get('status') !== 'all') {
      filter.status = searchParams.get('status');
    }
    
    if (searchParams.get('providerType')) {
      filter.providerType = searchParams.get('providerType');
    }
    
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 12;
    const skip = (page - 1) * limit;
    
    const total = await serviceProvidersCollection.countDocuments(filter);
    const providers = await serviceProvidersCollection
      .find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ businessName: 1 })
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
    console.error(`[${timestamp}] API Providers error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching service providers',
      error: error.message,
      data: [],
      total: 0
    });
  }
}



// === PROVIDERS/PAGE (FRONTEND EXPECTS THIS PATH) ===
if (path === '/providers/page' && req.method === 'GET') {
  console.log(`[${timestamp}] → PROVIDERS/PAGE (frontend alias)`);
  
  // Redirect to the main providers endpoint logic
  // Just change the path temporarily and reuse existing logic
  const originalPath = path;
  path = '/providers';
  
  // Your existing /providers logic here...
  // (copy the entire existing /providers block or redirect to it)
  
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
    
    // Execute query
    const providers = await serviceProvidersCollection.find(filter)
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .toArray();
    
    const total = await serviceProvidersCollection.countDocuments(filter);
    
    console.log(`[${timestamp}] Found ${providers.length} providers via /providers/page alias (${total} total)`);
    
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
    console.error(`[${timestamp}] Providers page error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching providers',
      error: error.message
    });
  }
}

// 1. PROVIDERS/ALL (NEW ENDPOINT - DON'T TOUCH EXISTING /providers)
if (path === '/providers/all' && req.method === 'GET') {
  console.log(`[${timestamp}] → PROVIDERS/ALL (new endpoint)`);
  
  try {
    const serviceProvidersCollection = db.collection('serviceproviders');
    
    let filter = { status: 'active' };
    
    // Handle type filter for transport providers
    if (searchParams.get('type') === 'public_transport') {
      filter.providerType = { $in: ['public_transport', 'transport', 'bus', 'taxi'] };
    }
    
    const providers = await serviceProvidersCollection.find(filter)
      .sort({ businessName: 1 })
      .toArray();
    
    return res.status(200).json({
      success: true,
      providers: providers, // Frontend expects 'providers' not 'data'
      total: providers.length
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Providers/all error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching transport providers',
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


   // === SERVICES ALIAS ENDPOINTS (FOR ADMIN COMPATIBILITY) ===
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
      total: total,  // <- ADD THIS
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











// ==================== SECTION 8: RENTAL VEHICLES ENDPOINTS ====================
// ==================== SECTION 8: RENTAL VEHICLES ENDPOINTS ====================
// ==================== SECTION 8: RENTAL VEHICLES ENDPOINTS ====================
// ==================== SECTION 8: RENTAL VEHICLES ENDPOINTS ====================

// === HELPER FUNCTIONS FOR PRODUCTION (ADD THESE AT THE TOP) ===
const sanitizeRentalInput = (data) => {
  const sanitizeString = (str) => {
    if (typeof str !== 'string') return str;
    return str
      .trim()
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  };
  
  return {
    ...data,
    name: sanitizeString(data.name || ''),
    title: sanitizeString(data.title || ''),
    description: sanitizeString(data.description || ''),
    shortDescription: sanitizeString(data.shortDescription || ''),
    specifications: data.specifications ? {
      ...data.specifications,
      make: sanitizeString(data.specifications.make || ''),
      model: sanitizeString(data.specifications.model || ''),
      color: sanitizeString(data.specifications.color || '')
    } : {}
  };
};

const validateImageFile = (file) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  if (!allowedTypes.includes(file.mimetype)) {
    throw new Error(`Invalid file type: ${file.mimetype}. Allowed: ${allowedTypes.join(', ')}`);
  }
  
  if (file.size > maxSize) {
    throw new Error(`File too large: ${Math.round(file.size / 1024 / 1024)}MB. Maximum: 10MB`);
  }
  
  return true;
};

// === NEW: MISSING /api/rentals ENDPOINT (Frontend Compatibility) ===

if (path === '/api/rentals' && req.method === 'GET') {
  console.log(`[${timestamp}] → API RENTALS (frontend compatibility)`);
  
  try {
    const rentalsCollection = db.collection('rentalvehicles');
    const serviceProvidersCollection = db.collection('serviceproviders');
    
    let filter = { status: { $ne: 'deleted' } };
    
    // Enhanced filtering
    if (searchParams.get('status') && searchParams.get('status') !== 'all') {
      filter.status = searchParams.get('status');
    } else {
      filter.status = { $in: ['available', 'active'] };
    }
    
    if (searchParams.get('category')) {
      filter.category = searchParams.get('category');
    }
    
    if (searchParams.get('providerId')) {
      const providerId = searchParams.get('providerId');
      try {
        const { ObjectId } = await import('mongodb');
        if (providerId.length === 24) {
          filter.$or = [
            { providerId: providerId },
            { providerId: new ObjectId(providerId) }
          ];
        } else {
          filter.providerId = providerId;
        }
      } catch (e) {
        filter.providerId = providerId;
      }
    }
    
    if (searchParams.get('featured') === 'true') {
      filter.featured = true;
    }
    
    // Price filtering
    if (searchParams.get('minPrice') || searchParams.get('maxPrice')) {
      const priceFilter = {};
      if (searchParams.get('minPrice')) {
        priceFilter.$gte = Number(searchParams.get('minPrice'));
      }
      if (searchParams.get('maxPrice')) {
        priceFilter.$lte = Number(searchParams.get('maxPrice'));
      }
      
      filter.$or = [
        { dailyRate: priceFilter },
        { 'rates.daily': priceFilter }
      ];
    }
    
    // Search functionality
    if (searchParams.get('search')) {
      const searchTerm = searchParams.get('search');
      const searchRegex = { $regex: searchTerm, $options: 'i' };
      
      filter.$and = [
        filter.$and || {},
        {
          $or: [
            { name: searchRegex },
            { title: searchRegex },
            { description: searchRegex },
            { 'specifications.make': searchRegex },
            { 'specifications.model': searchRegex },
            { 'provider.businessName': searchRegex }
          ]
        }
      ];
    }
    
    // Pagination
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 20;
    const skip = (page - 1) * limit;
    
    // Sorting
    let sort = { createdAt: -1 };
    const sortParam = searchParams.get('sort');
    if (sortParam) {
      if (sortParam === 'price_asc') sort = { dailyRate: 1 };
      else if (sortParam === 'price_desc') sort = { dailyRate: -1 };
      else if (sortParam === 'name_asc') sort = { name: 1 };
      else if (sortParam === 'name_desc') sort = { name: -1 };
      else if (sortParam === 'rating_desc') sort = { averageRating: -1 };
    }
    
    const total = await rentalsCollection.countDocuments(filter);
    const rentals = await rentalsCollection
      .find(filter)
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .toArray();
    
    // ENHANCED: Provider population with EXACT frontend field mapping
    const { ObjectId } = await import('mongodb');
    
    console.log(`[${timestamp}] Starting provider population for ${rentals.length} rentals...`);
    
    const enhancedRentals = await Promise.all(rentals.map(async (rental, index) => {
      // Always populate provider data for consistency
      let providerId = rental.providerId;
      
      // Convert providerId to ObjectId if needed
      if (typeof providerId === 'string' && providerId.length === 24) {
        try {
          providerId = new ObjectId(providerId);
        } catch (e) {
          console.warn(`[${timestamp}] Invalid ObjectId: ${providerId}`);
        }
      }
      
      // Fetch full provider information
      let fullProvider = null;
      if (providerId) {
        try {
          fullProvider = await serviceProvidersCollection.findOne({ _id: providerId });
        } catch (e) {
          console.warn(`[${timestamp}] Error fetching provider ${providerId}:`, e.message);
        }
      }
      
      // CRITICAL: Frontend-compatible rental formatting
      const frontendRental = {
        _id: rental._id,
        id: rental._id,
        name: rental.name || rental.title || 'Rental Vehicle',
        title: rental.title || rental.name || 'Rental Vehicle',
        description: rental.description || '',
        shortDescription: rental.shortDescription || rental.description?.substring(0, 150) || '',
        
        // Vehicle specifications
        make: rental.specifications?.make || '',
        model: rental.specifications?.model || '',
        year: rental.specifications?.year || new Date().getFullYear(),
        transmission: rental.specifications?.transmission || 'automatic',
        fuelType: rental.specifications?.fuelType || 'petrol',
        seats: rental.specifications?.seats || 5,
        doors: rental.specifications?.doors || 4,
        color: rental.specifications?.color || '',
        category: rental.category || 'Car',
        
        // Pricing (handle both formats)
        dailyRate: rental.dailyRate || rental.rates?.daily || 0,
        weeklyRate: rental.weeklyRate || rental.rates?.weekly || 0,
        monthlyRate: rental.monthlyRate || rental.rates?.monthly || 0,
        currency: rental.currency || 'BWP',
        
        // CRITICAL: RentalCard expects these specific fields
        providerLogo: fullProvider?.profile?.logo || rental.provider?.profile?.logo || rental.provider?.logo || '',
        provider: fullProvider?.businessName || rental.provider?.businessName || rental.provider?.name || 'Unknown Provider',
        providerLocation: fullProvider?.location?.city || rental.provider?.location?.city || rental.location?.city || '',
        providerId: rental.providerId,
        
        // Provider object for detailed access
        providerData: fullProvider ? {
          _id: fullProvider._id,
          id: fullProvider._id,
          name: fullProvider.businessName || fullProvider.name || 'Service Provider',
          businessName: fullProvider.businessName || fullProvider.name || 'Service Provider',
          logo: fullProvider.profile?.logo || '',
          profile: {
            logo: fullProvider.profile?.logo || ''
          },
          contact: {
            phone: fullProvider.contact?.phone || '',
            email: fullProvider.contact?.email || '',
            website: fullProvider.contact?.website || ''
          },
          location: {
            address: fullProvider.location?.address || '',
            city: fullProvider.location?.city || '',
            state: fullProvider.location?.state || '',
            country: fullProvider.location?.country || 'Botswana'
          },
          verification: {
            isVerified: Boolean(fullProvider.verification?.isVerified)
          },
          providerType: fullProvider.providerType || 'CAR_RENTAL'
        } : null,
        
        // Images with proper fallbacks
        images: Array.isArray(rental.images) ? rental.images : [],
        primaryImage: (() => {
          if (!Array.isArray(rental.images) || rental.images.length === 0) return null;
          const primary = rental.images.find(img => img.isPrimary);
          return primary?.url || rental.images[0]?.url || null;
        })(),
        
        // Features
        features: Array.isArray(rental.features) ? rental.features : [],
        
        // Status and availability - RentalCard expects these
        status: rental.status || 'available',
        availability: rental.availability || rental.status || 'available',
        
        // Location
        location: rental.location || { city: '', country: 'Botswana' },
        
        // Rates object for detailed pricing
        rates: {
          daily: Number(rental.dailyRate || rental.rates?.daily || 0),
          weekly: Number(rental.weeklyRate || rental.rates?.weekly || 0),
          monthly: Number(rental.monthlyRate || rental.rates?.monthly || 0),
          security: Number(rental.rates?.security || 0)
        },
        
        // Metadata
        featured: Boolean(rental.featured),
        verified: Boolean(rental.verified),
        averageRating: Number(rental.averageRating || 0),
        totalReviews: rental.reviews?.length || 0,
        views: rental.views || 0,
        
        // Timestamps
        createdAt: rental.createdAt ? new Date(rental.createdAt).toISOString() : null,
        updatedAt: rental.updatedAt ? new Date(rental.updatedAt).toISOString() : null
      };
      
      if (fullProvider) {
        console.log(`[${timestamp}] Rental ${index}: Enhanced "${rental.name}" with provider: ${fullProvider.businessName}, logo: ${fullProvider.profile?.logo || 'none'}`);
      } else {
        console.warn(`[${timestamp}] Rental ${index}: Could not find provider ${rental.providerId} for "${rental.name}"`);
      }
      
      return frontendRental;
    }));
    
    console.log(`[${timestamp}] ✅ API Rentals: ${enhancedRentals.length} of ${total} total with frontend compatibility`);
    
    return res.status(200).json({
      success: true,
      data: enhancedRentals,
      vehicles: enhancedRentals, // Alternative format for backward compatibility
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total: total,
        limit: limit,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      },
      count: enhancedRentals.length,
      total: total,
      message: `Found ${enhancedRentals.length} rental vehicles`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] API Rentals error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching rental vehicles',
      error: error.message,
      data: [],
      vehicles: [],
      pagination: { currentPage: 1, totalPages: 0, total: 0 }
    });
  }
}


// === NEW: MISSING /api/rentals/{id} ENDPOINT (Frontend Compatibility) ===
if (path.match(/^\/api\/rentals\/[a-fA-F0-9]{24}$/) && req.method === 'GET') {
  const rentalId = path.split('/')[3]; // Note: /api/rentals/{id} has different path split
  console.log(`[${timestamp}] → API RENTAL DETAIL: ${rentalId}`);
  
  try {
    const rentalsCollection = db.collection('rentalvehicles');
    const serviceProvidersCollection = db.collection('serviceproviders');
    const { ObjectId } = await import('mongodb');
    
    let rental = null;
    
    // Try both ObjectId and string lookup
    if (rentalId.length === 24 && /^[0-9a-fA-F]{24}$/.test(rentalId)) {
      try {
        rental = await rentalsCollection.findOne({ _id: new ObjectId(rentalId) });
      } catch (objectIdError) {
        rental = await rentalsCollection.findOne({ _id: rentalId });
      }
    } else {
      rental = await rentalsCollection.findOne({ _id: rentalId });
    }
    
    if (!rental || rental.status === 'deleted') {
      return res.status(404).json({
        success: false,
        message: 'Rental vehicle not found',
        rentalId: rentalId
      });
    }
    
    // Increment view count
    try {
      const updateFilter = rentalId.length === 24 && /^[0-9a-fA-F]{24}$/.test(rentalId)
        ? { _id: new ObjectId(rentalId) }
        : { _id: rentalId };
        
      await rentalsCollection.updateOne(updateFilter, {
        $inc: { views: 1 },
        $set: { lastViewed: new Date() }
      });
    } catch (viewError) {
      console.warn(`[${timestamp}] View count update failed:`, viewError.message);
    }
    
    // ENHANCED: Full provider population (like individual listings)
    let fullProvider = null;
    if (rental.providerId) {
      try {
        let providerId = rental.providerId;
        if (typeof providerId === 'string' && providerId.length === 24) {
          providerId = new ObjectId(providerId);
        }
        
        fullProvider = await serviceProvidersCollection.findOne({ _id: providerId });
        console.log(`[${timestamp}] Found provider: ${fullProvider?.businessName || 'Unknown'}`);
      } catch (e) {
        console.warn(`[${timestamp}] Error fetching provider:`, e.message);
      }
    }
    
    // Use the same safe formatting from the main individual endpoint but with enhanced provider
    const safeRental = {
      _id: String(rental._id),
      id: String(rental._id),
      name: String(rental.name || rental.title || 'Rental Vehicle'),
      title: String(rental.title || rental.name || 'Rental Vehicle'),
      slug: String(rental.slug || rentalId),
      description: String(rental.description || ''),
      shortDescription: String(rental.shortDescription || rental.description || ''),
      category: String(rental.category || 'Car'),
      
      // ENHANCED: Complete provider object (like listings)
      provider: fullProvider ? {
        _id: String(fullProvider._id),
        id: String(fullProvider._id),
        name: String(fullProvider.businessName || fullProvider.name || 'Service Provider'),
        businessName: String(fullProvider.businessName || fullProvider.name || 'Service Provider'),
        logo: String(fullProvider.profile?.logo || '/images/placeholders/provider-logo.jpg'),
        contact: {
          phone: String(fullProvider.contact?.phone || ''),
          email: String(fullProvider.contact?.email || ''),
          website: String(fullProvider.contact?.website || '')
        },
        location: {
          address: String(fullProvider.location?.address || ''),
          city: String(fullProvider.location?.city || ''),
          state: String(fullProvider.location?.state || ''),
          country: String(fullProvider.location?.country || 'Botswana')
        },
        verification: {
          isVerified: Boolean(fullProvider.verification?.isVerified),
          verifiedAt: fullProvider.verification?.verifiedAt || null
        },
        providerType: String(fullProvider.providerType || 'CAR_RENTAL'),
        description: String(fullProvider.description || ''),
        operatingHours: fullProvider.operatingHours || {},
        services: Array.isArray(fullProvider.services) ? fullProvider.services : [],
        // Rating and review info
        averageRating: Number(fullProvider.metrics?.averageRating || 0),
        totalReviews: Number(fullProvider.metrics?.totalReviews || 0),
        // Social links
        socialLinks: fullProvider.socialLinks || {}
      } : rental.provider || { businessName: 'Unknown Provider' },
      
      specifications: {
        make: String(rental.specifications?.make || ''),
        model: String(rental.specifications?.model || ''),
        year: Number(rental.specifications?.year || new Date().getFullYear()),
        color: String(rental.specifications?.color || ''),
        transmission: String(rental.specifications?.transmission || 'automatic'),
        fuelType: String(rental.specifications?.fuelType || 'petrol'),
        engineSize: String(rental.specifications?.engineSize || ''),
        seats: Number(rental.specifications?.seats || 5),
        doors: Number(rental.specifications?.doors || 4),
        mileage: Number(rental.specifications?.mileage || 0)
      },
      
      rates: {
        daily: Number(rental.rates?.daily || rental.dailyRate || 0),
        weekly: Number(rental.rates?.weekly || rental.weeklyRate || 0),
        monthly: Number(rental.rates?.monthly || rental.monthlyRate || 0),
        security: Number(rental.rates?.security || 0),
        includesVAT: Boolean(rental.rates?.includesVAT !== false)
      },
      
      // Backward compatibility pricing
      dailyRate: Number(rental.dailyRate || rental.rates?.daily || 0),
      weeklyRate: Number(rental.weeklyRate || rental.rates?.weekly || 0),
      monthlyRate: Number(rental.monthlyRate || rental.rates?.monthly || 0),
      currency: String(rental.currency || 'BWP'),
      
      features: Array.isArray(rental.features) ? rental.features.map(f => String(f)) : [],
      
      images: Array.isArray(rental.images) ? rental.images.map((img, index) => ({
        url: String(img?.url || ''),
        thumbnail: String(img?.thumbnail || img?.url || ''),
        isPrimary: Boolean(img?.isPrimary || index === 0),
        key: String(img?.key || ''),
        size: Number(img?.size || 0),
        mimetype: String(img?.mimetype || 'image/jpeg')
      })) : [],
      
      primaryImage: (() => {
        if (!Array.isArray(rental.images) || rental.images.length === 0) return null;
        const primary = rental.images.find(img => img?.isPrimary);
        return primary?.url || rental.images[0]?.url || null;
      })(),
      
      status: String(rental.status || 'available'),
      availability: String(rental.availability || 'available'),
      
      location: {
        address: String(rental.location?.address || ''),
        city: String(rental.location?.city || ''),
        state: String(rental.location?.state || ''),
        country: String(rental.location?.country || 'Botswana'),
        coordinates: {
          lat: Number(rental.location?.coordinates?.lat || 0),
          lng: Number(rental.location?.coordinates?.lng || 0)
        }
      },
      
      rentalTerms: {
        minimumAge: Number(rental.rentalTerms?.minimumAge || 21),
        minimumRentalPeriod: Number(rental.rentalTerms?.minimumRentalPeriod || 1),
        depositRequired: Boolean(rental.rentalTerms?.depositRequired !== false),
        licenseRequired: Boolean(rental.rentalTerms?.licenseRequired !== false),
        fuelPolicy: String(rental.rentalTerms?.fuelPolicy || 'full-to-full'),
        mileageLimit: Number(rental.rentalTerms?.mileageLimit || 0)
      },
      
      featured: Boolean(rental.featured),
      verified: Boolean(rental.verified),
      
      reviews: Array.isArray(rental.reviews) ? rental.reviews : [],
      averageRating: Number(rental.averageRating || 0),
      totalReviews: rental.reviews?.length || 0,
      views: Number(rental.views || 0) + 1, // Include the current view
      
      createdAt: rental.createdAt ? new Date(rental.createdAt).toISOString() : null,
      updatedAt: rental.updatedAt ? new Date(rental.updatedAt).toISOString() : null
    };
    
    return res.status(200).json({
      success: true,
      data: safeRental,
      message: `Rental details: ${safeRental.title}`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] API Rental detail error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching rental details',
      error: error.message,
      rentalId: rentalId
    });
  }
}

// === CREATE CAR RENTAL (WITH MULTIPLE IMAGES) ===
if (path === '/rentals' && req.method === 'POST') {
  try {
    console.log(`[${timestamp}] → CREATE CAR RENTAL WITH IMAGES`);
    
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);
    
    const contentType = req.headers['content-type'] || '';
    let rentalData = {};
    const uploadedImages = [];
    
    if (contentType.includes('application/json')) {
      // Handle JSON request (no images)
      console.log(`[${timestamp}] Processing JSON car rental request`);
      try {
        const rawBodyString = rawBody.toString();
        if (rawBodyString) rentalData = JSON.parse(rawBodyString);
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          message: 'Invalid JSON format'
        });
      }
      
    } else if (contentType.includes('multipart/form-data')) {
      // Handle FormData request (with images)
      console.log(`[${timestamp}] Processing FormData car rental request with images`);
      
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
      
      const files = {};
      
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
              
              if (fileBuffer.length > 100) {
                const fileObj = {
                  filename: filename,
                  buffer: fileBuffer,
                  mimetype: fileType,
                  size: fileBuffer.length
                };
                
                // ENHANCED: Validate file before processing
                try {
                  validateImageFile(fileObj);
                  files[fieldName] = fileObj;
                  console.log(`[${timestamp}] Valid car image: ${fieldName} (${filename}, ${fileBuffer.length} bytes)`);
                } catch (validationError) {
                  console.warn(`[${timestamp}] Invalid file ${fieldName}: ${validationError.message}`);
                  // Skip invalid files instead of failing entire request
                }
              }
            }
          } else {
            // Handle regular form field
            const dataStart = part.indexOf('\r\n\r\n');
            if (dataStart !== -1) {
              const fieldValue = part.substring(dataStart + 4).replace(/\r\n$/, '').trim();
              
              // Try to parse JSON fields first
              if (fieldName === 'vehicleData') {
                try {
                  const vehicleDataParsed = JSON.parse(fieldValue);
                  rentalData = { ...rentalData, ...vehicleDataParsed };
                  console.log(`[${timestamp}] Parsed vehicleData from FormData`);
                } catch (e) {
                  console.log(`[${timestamp}] Failed to parse vehicleData, treating as regular field`);
                  rentalData[fieldName] = fieldValue;
                }
              } else if (['specifications', 'features', 'rates', 'location', 'provider', 'rentalTerms'].includes(fieldName)) {
                try {
                  rentalData[fieldName] = JSON.parse(fieldValue);
                } catch (e) {
                  rentalData[fieldName] = fieldValue;
                }
              } else {
                rentalData[fieldName] = fieldValue;
              }
            }
          }
        }
      }
      
      // Upload car images to S3
      if (Object.keys(files).length > 0) {
        const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
        const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
        const awsBucket = process.env.AWS_S3_BUCKET_NAME || 'bw-car-culture-images';
        const awsRegion = process.env.AWS_S3_REGION || 'us-east-1';
        
        if (awsAccessKey && awsSecretKey) {
          try {
            const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
            
            const s3Client = new S3Client({
              region: awsRegion,
              credentials: {
                accessKeyId: awsAccessKey,
                secretAccessKey: awsSecretKey,
              },
            });
            
            let imageIndex = 0;
            for (const [fieldName, file] of Object.entries(files)) {
              try {
                const timestamp_ms = Date.now();
                const randomString = Math.random().toString(36).substring(2, 8);
                const fileExtension = file.filename.split('.').pop() || 'jpg';
                const s3Filename = `images/rentals/car-${timestamp_ms}-${randomString}-${imageIndex}.${fileExtension}`;
                
                const uploadCommand = new PutObjectCommand({
                  Bucket: awsBucket,
                  Key: s3Filename,
                  Body: file.buffer,
                  ContentType: file.mimetype,
                });
                
                await s3Client.send(uploadCommand);
                
                const imageUrl = `https://${awsBucket}.s3.amazonaws.com/${s3Filename}`;
                
                uploadedImages.push({
                  url: imageUrl,
                  key: s3Filename,
                  size: file.size,
                  mimetype: file.mimetype,
                  isPrimary: imageIndex === 0,
                  thumbnail: imageUrl,
                  filename: file.filename
                });
                
                console.log(`[${timestamp}] ✅ Uploaded car image: ${imageUrl}`);
                imageIndex++;
              } catch (fileError) {
                console.error(`[${timestamp}] Failed to upload ${fieldName}:`, fileError.message);
              }
            }
          } catch (s3Error) {
            console.error(`[${timestamp}] S3 setup error:`, s3Error.message);
          }
        } else {
          // Mock URLs for development
          let imageIndex = 0;
          for (const [fieldName, file] of Object.entries(files)) {
            uploadedImages.push({
              url: `https://${awsBucket}.s3.amazonaws.com/images/rentals/mock-car-${Date.now()}-${imageIndex}.jpg`,
              key: `images/rentals/mock-car-${Date.now()}-${imageIndex}.jpg`,
              size: file.size,
              mimetype: file.mimetype,
              isPrimary: imageIndex === 0,
              thumbnail: `https://${awsBucket}.s3.amazonaws.com/images/rentals/mock-car-${Date.now()}-${imageIndex}.jpg`,
              filename: file.filename
            });
            imageIndex++;
          }
        }
      }
      
    } else {
      return res.status(400).json({
        success: false,
        message: 'Content-Type must be application/json or multipart/form-data'
      });
    }
    
    // ENHANCED: Sanitize input data
    rentalData = sanitizeRentalInput(rentalData);
    
    console.log(`[${timestamp}] Final rental data:`, {
      hasName: !!rentalData.name,
      hasTitle: !!rentalData.title,
      hasDailyRate: !!rentalData.dailyRate,
      hasRates: !!rentalData.rates,
      hasProviderId: !!rentalData.providerId,
      imagesUploaded: uploadedImages.length,
      allFields: Object.keys(rentalData)
    });
    
    // ✅ FIXED: Flexible validation to match frontend field names
    const vehicleName = rentalData.name || rentalData.title || rentalData.vehicleName;
    const dailyRate = rentalData.dailyRate || rentalData.rates?.daily || rentalData.price;
    const providerId = rentalData.providerId || rentalData.provider?.id || rentalData.provider;
    
    if (!vehicleName) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle name is required',
        received: {
          name: rentalData.name,
          title: rentalData.title,
          vehicleName: rentalData.vehicleName
        }
      });
    }
    
    if (!dailyRate) {
      return res.status(400).json({
        success: false,
        message: 'Daily rental rate is required',
        received: {
          dailyRate: rentalData.dailyRate,
          price: rentalData.price,
          rates: rentalData.rates
        }
      });
    }
    
    if (!providerId) {
      return res.status(400).json({
        success: false,
        message: 'Service provider ID is required',
        received: {
          providerId: rentalData.providerId,
          provider: rentalData.provider
        }
      });
    }
    
    // ✅ FIXED: Fetch actual provider data to populate rental
    console.log(`[${timestamp}] Fetching provider data for ID: ${providerId}`);
    
    const serviceProvidersCollection = db.collection('serviceproviders');
    const { ObjectId } = await import('mongodb');
    
    let actualProvider = null;
    try {
      if (providerId.length === 24) {
        actualProvider = await serviceProvidersCollection.findOne({ 
          _id: new ObjectId(providerId) 
        });
      }
      
      if (!actualProvider) {
        actualProvider = await serviceProvidersCollection.findOne({ 
          _id: providerId 
        });
      }
    } catch (providerError) {
      console.error(`[${timestamp}] Provider lookup error:`, providerError.message);
    }
    
    if (!actualProvider) {
      return res.status(400).json({
        success: false,
        message: `Service provider not found with ID: ${providerId}`,
        providerId: providerId
      });
    }
    
    console.log(`[${timestamp}] ✅ Found provider: ${actualProvider.businessName}`);
    
    // Generate unique slug for the rental
    const generateSlug = (title) => {
      if (!title) {
        return `rental-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      }
      
      const baseSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      return `${baseSlug}-${Date.now()}`;
    };
    
    const slug = generateSlug(vehicleName);
    
    // Create car rental with proper structure
    const rentalsCollection = db.collection('rentalvehicles');
    
    const newRental = {
      _id: new ObjectId(),
      
      // ✅ FIXED: Use flexible field mapping
      name: vehicleName,
      title: vehicleName,
      slug: slug,
      description: rentalData.description || rentalData.shortDescription || '',
      shortDescription: rentalData.shortDescription || rentalData.description || '',
      category: rentalData.category || 'Car',
      
      // ✅ FIXED: Handle provider ID and populate with actual data
      providerId: actualProvider._id,
      provider: {
        _id: actualProvider._id,
        name: actualProvider.businessName || actualProvider.name || 'Service Provider',
        businessName: actualProvider.businessName || actualProvider.name || 'Service Provider',
        logo: actualProvider.profile?.logo || '',
        contact: {
          phone: actualProvider.contact?.phone || '',
          email: actualProvider.contact?.email || ''
        },
        location: {
          address: actualProvider.location?.address || '',
          city: actualProvider.location?.city || '',
          state: actualProvider.location?.state || '',
          country: actualProvider.location?.country || 'Botswana'
        }
      },
      
      // ✅ FIXED: Flexible specifications handling with safe defaults
      specifications: {
        make: rentalData.specifications?.make || rentalData.make || '',
        model: rentalData.specifications?.model || rentalData.model || '',
        year: Number(rentalData.specifications?.year || rentalData.year || new Date().getFullYear()),
        color: rentalData.specifications?.color || rentalData.color || '',
        transmission: rentalData.specifications?.transmission || rentalData.transmission || 'automatic',
        fuelType: rentalData.specifications?.fuelType || rentalData.fuelType || 'petrol',
        engineSize: rentalData.specifications?.engineSize || rentalData.engineSize || '',
        seats: Number(rentalData.specifications?.seats || rentalData.seats || 5),
        doors: Number(rentalData.specifications?.doors || rentalData.doors || 4),
        mileage: Number(rentalData.specifications?.mileage || rentalData.mileage || 0),
        fuelEconomy: rentalData.specifications?.fuelEconomy || '',
        exteriorColor: rentalData.specifications?.exteriorColor || rentalData.specifications?.color || '',
        interiorColor: rentalData.specifications?.interiorColor || ''
      },
      
      // ✅ FIXED: Flexible pricing handling with safe numbers
      rates: {
        daily: Number(dailyRate),
        weekly: Number(rentalData.rates?.weekly || rentalData.weeklyRate || dailyRate * 6),
        monthly: Number(rentalData.rates?.monthly || rentalData.monthlyRate || dailyRate * 25),
        security: Number(rentalData.rates?.security || rentalData.deposit || dailyRate * 2),
        includesVAT: Boolean(rentalData.rates?.includesVAT !== false)
      },
      
      // Backward compatibility fields
      dailyRate: Number(dailyRate),
      weeklyRate: Number(rentalData.weeklyRate || dailyRate * 6),
      monthlyRate: Number(rentalData.monthlyRate || dailyRate * 25),
      currency: rentalData.currency || 'BWP',
      
      // Features and amenities - ensure it's always an array
      features: Array.isArray(rentalData.features) ? rentalData.features : [],
      
      // ✅ FIXED: Uploaded images with proper structure
      images: uploadedImages.length > 0 ? uploadedImages : [],
      
      // Availability
      status: rentalData.status || 'available',
      availability: rentalData.availability || 'available',
      
      // ✅ FIXED: Location with provider fallback
      location: {
        address: rentalData.location?.address || actualProvider.location?.address || '',
        city: rentalData.location?.city || actualProvider.location?.city || '',
        state: rentalData.location?.state || actualProvider.location?.state || '',
        country: rentalData.location?.country || actualProvider.location?.country || 'Botswana',
        postalCode: rentalData.location?.postalCode || '',
        coordinates: rentalData.location?.coordinates || { lat: 0, lng: 0 }
      },
      
      // ✅ FIXED: Rental terms with safe defaults
      rentalTerms: {
        minimumAge: Number(rentalData.rentalTerms?.minimumAge || 21),
        minimumRentalPeriod: Number(rentalData.rentalTerms?.minimumRentalPeriod || 1),
        depositRequired: Boolean(rentalData.rentalTerms?.depositRequired !== false),
        licenseRequired: Boolean(rentalData.rentalTerms?.licenseRequired !== false),
        fuelPolicy: rentalData.rentalTerms?.fuelPolicy || 'full-to-full',
        mileageLimit: Number(rentalData.rentalTerms?.mileageLimit || 0),
        lateFeeRate: Number(rentalData.rentalTerms?.lateFeeRate || 0),
        additionalDriverFee: Number(rentalData.rentalTerms?.additionalDriverFee || 0),
        insuranceOptions: Array.isArray(rentalData.rentalTerms?.insuranceOptions) ? 
          rentalData.rentalTerms.insuranceOptions : []
      },
      
      // Status and metadata - safe defaults
      featured: Boolean(rentalData.featured),
      verified: Boolean(rentalData.verified),
      usageType: rentalData.usageType || 'Both',
      
      // Reviews and metrics - safe defaults
      reviews: [],
      averageRating: 0,
      bookings: [],
      
      // ✅ FIXED: SEO with safe defaults
      seo: {
        metaTitle: rentalData.seo?.metaTitle || `${vehicleName} - Car Rental`,
        metaDescription: rentalData.seo?.metaDescription || rentalData.description || '',
        keywords: Array.isArray(rentalData.seo?.keywords) ? rentalData.seo.keywords : []
      },
      
      // Timestamps
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await rentalsCollection.insertOne(newRental);
    
    console.log(`[${timestamp}] ✅ Car rental created: ${newRental.name} (${uploadedImages.length} images) for provider: ${actualProvider.businessName}`);
    
    return res.status(201).json({
      success: true,
      message: `Car rental created successfully${uploadedImages.length > 0 ? ` with ${uploadedImages.length} images` : ''}`,
      data: { ...newRental, _id: result.insertedId }
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Create car rental error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create car rental',
      error: error.message
    });
  }
}

// === GET ALL CAR RENTALS (ENHANCED WITH PROVIDER POPULATION) ===
if (path === '/rentals' && req.method === 'GET') {
  console.log(`[${timestamp}] → GET CAR RENTALS (frontend compatible)`);
  
  try {
    const rentalsCollection = db.collection('rentalvehicles');
    const serviceProvidersCollection = db.collection('serviceproviders');
    
    let filter = {};
    
    // Handle filters
    if (searchParams.get('status') && searchParams.get('status') !== 'all') {
      filter.status = searchParams.get('status');
    } else {
      filter.status = { $in: ['available', 'active'] };
    }
    
    if (searchParams.get('category')) {
      filter.category = searchParams.get('category');
    }
    
    if (searchParams.get('providerId')) {
      const providerId = searchParams.get('providerId');
      if (providerId.length === 24) {
        try {
          const { ObjectId } = await import('mongodb');
          filter.$or = [
            { providerId: providerId },
            { providerId: new ObjectId(providerId) }
          ];
        } catch (e) {
          filter.providerId = providerId;
        }
      } else {
        filter.providerId = providerId;
      }
    }
    
    if (searchParams.get('transmission')) {
      filter['specifications.transmission'] = searchParams.get('transmission');
    }
    
    if (searchParams.get('fuelType')) {
      filter['specifications.fuelType'] = searchParams.get('fuelType');
    }
    
    if (searchParams.get('minPrice') || searchParams.get('maxPrice')) {
      filter.$or = [
        { dailyRate: {} },
        { 'rates.daily': {} }
      ];
      
      if (searchParams.get('minPrice')) {
        const minPrice = Number(searchParams.get('minPrice'));
        filter.$or[0].dailyRate.$gte = minPrice;
        filter.$or[1]['rates.daily'].$gte = minPrice;
      }
      if (searchParams.get('maxPrice')) {
        const maxPrice = Number(searchParams.get('maxPrice'));
        filter.$or[0].dailyRate.$lte = maxPrice;
        filter.$or[1]['rates.daily'].$lte = maxPrice;
      }
    }
    
    if (searchParams.get('search')) {
      const searchTerm = searchParams.get('search');
      const searchRegex = { $regex: searchTerm, $options: 'i' };
      
      filter.$or = [
        ...(filter.$or || []),
        { name: searchRegex },
        { title: searchRegex },
        { description: searchRegex },
        { 'specifications.make': searchRegex },
        { 'specifications.model': searchRegex },
        { 'provider.businessName': searchRegex }
      ];
    }
    
    // Pagination
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 12;
    const skip = (page - 1) * limit;
    
    const rentals = await rentalsCollection.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .toArray();
    
    const total = await rentalsCollection.countDocuments(filter);
    
    // ENHANCED: Provider population with frontend compatibility
    const { ObjectId } = await import('mongodb');
    
    console.log(`[${timestamp}] Starting provider population for ${rentals.length} rentals...`);
    
    const formattedRentals = await Promise.all(rentals.map(async (rental, index) => {
      // Always populate provider for consistency
      let providerId = rental.providerId;
      
      if (typeof providerId === 'string' && providerId.length === 24) {
        try {
          providerId = new ObjectId(providerId);
        } catch (e) {
          console.warn(`[${timestamp}] Invalid ObjectId: ${providerId}`);
        }
      }
      
      // Fetch full provider information
      let fullProvider = null;
      if (providerId) {
        try {
          fullProvider = await serviceProvidersCollection.findOne({ _id: providerId });
        } catch (e) {
          console.warn(`[${timestamp}] Error fetching provider ${providerId}:`, e.message);
        }
      }
      
      // CRITICAL: Use same frontend-compatible format as /api/rentals
      const formattedRental = {
        _id: rental._id,
        id: rental._id,
        name: rental.name || rental.title || 'Rental Vehicle',
        title: rental.title || rental.name || 'Rental Vehicle',
        description: rental.description || '',
        
        // Vehicle details
        make: rental.specifications?.make || '',
        model: rental.specifications?.model || '',
        year: rental.specifications?.year || new Date().getFullYear(),
        transmission: rental.specifications?.transmission || 'automatic',
        fuelType: rental.specifications?.fuelType || 'petrol',
        seats: rental.specifications?.seats || 5,
        doors: rental.specifications?.doors || 4,
        category: rental.category || 'Car',
        
        // Pricing - handle both formats
        dailyRate: rental.dailyRate || rental.rates?.daily || 0,
        weeklyRate: rental.weeklyRate || rental.rates?.weekly || 0,
        monthlyRate: rental.monthlyRate || rental.rates?.monthly || 0,
        currency: rental.currency || 'BWP',
        
        // CRITICAL: Frontend expects these exact fields
        providerLogo: fullProvider?.profile?.logo || rental.provider?.profile?.logo || rental.provider?.logo || '',
        provider: fullProvider?.businessName || rental.provider?.businessName || rental.provider?.name || 'Unknown Provider',
        providerLocation: fullProvider?.location?.city || rental.provider?.location?.city || rental.location?.city || '',
        providerId: rental.providerId,
        
        // Provider object for detailed access
        providerData: fullProvider ? {
          _id: fullProvider._id,
          businessName: fullProvider.businessName || fullProvider.name || 'Service Provider',
          logo: fullProvider.profile?.logo || '',
          profile: {
            logo: fullProvider.profile?.logo || ''
          },
          contact: {
            phone: fullProvider.contact?.phone || '',
            email: fullProvider.contact?.email || ''
          },
          location: {
            city: fullProvider.location?.city || '',
            country: fullProvider.location?.country || 'Botswana'
          },
          verification: {
            isVerified: Boolean(fullProvider.verification?.isVerified)
          }
        } : null,
        
        // Images
        images: Array.isArray(rental.images) ? rental.images : [],
        primaryImage: Array.isArray(rental.images) && rental.images.length > 0 ? 
          rental.images.find(img => img.isPrimary)?.url || rental.images[0].url : null,
        
        // Features
        features: Array.isArray(rental.features) ? rental.features : [],
        
        // Availability
        status: rental.status || 'available',
        availability: rental.availability || 'available',
        
        // Location
        location: rental.location || { city: '', country: 'Botswana' },
        
        // Rates object
        rates: {
          daily: Number(rental.dailyRate || rental.rates?.daily || 0),
          weekly: Number(rental.weeklyRate || rental.rates?.weekly || 0),
          monthly: Number(rental.monthlyRate || rental.rates?.monthly || 0),
          security: Number(rental.rates?.security || 0)
        },
        
        // Metadata
        featured: Boolean(rental.featured),
        verified: Boolean(rental.verified),
        averageRating: Number(rental.averageRating || 0),
        createdAt: rental.createdAt,
        updatedAt: rental.updatedAt
      };
      
      if (fullProvider) {
        console.log(`[${timestamp}] Rental ${index}: "${rental.name}" enhanced with provider: ${fullProvider.businessName}, logo: ${fullProvider.profile?.logo || 'none'}`);
      }
      
      return formattedRental;
    }));
    
    console.log(`[${timestamp}] Found ${formattedRentals.length} car rentals (${total} total) with frontend compatibility`);
    
    return res.status(200).json({
      success: true,
      data: formattedRentals,
      vehicles: formattedRentals, // Alternative format for backward compatibility
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total: total
      },
      count: formattedRentals.length,
      total: total,
      message: `Found ${formattedRentals.length} car rentals`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Get car rentals error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching car rentals',
      error: error.message,
      data: [],
      vehicles: [],
      pagination: { currentPage: 1, totalPages: 0, total: 0 }
    });
  }
}

// === FEATURED RENTALS ===
if (path === '/rentals/featured' && req.method === 'GET') {
  console.log(`[${timestamp}] → FEATURED RENTALS`);
  
  try {
    const rentalsCollection = db.collection('rentalvehicles');
    const limit = parseInt(searchParams.get('limit')) || 6;
    
    const rentals = await rentalsCollection.find({
      featured: true,
      status: 'available'
    })
    .limit(limit)
    .sort({ createdAt: -1 })
    .toArray();
    
    // Format for frontend
    const formattedRentals = rentals.map(rental => ({
      _id: rental._id,
      id: rental._id,
      name: rental.name || rental.title || 'Rental Vehicle',
      title: rental.title || rental.name || 'Rental Vehicle',
      dailyRate: rental.dailyRate || rental.rates?.daily || 0,
      currency: rental.currency || 'BWP',
      make: rental.specifications?.make || '',
      model: rental.specifications?.model || '',
      year: rental.specifications?.year || new Date().getFullYear(),
      primaryImage: Array.isArray(rental.images) && rental.images.length > 0 ? 
        (rental.images.find(img => img.isPrimary)?.url || rental.images[0].url || null) : null,
      status: rental.status || 'available'
    }));
    
    return res.status(200).json({
      success: true,
      data: formattedRentals,
      vehicles: formattedRentals,
      count: formattedRentals.length,
      message: `Found ${formattedRentals.length} featured rentals`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Featured rentals error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching featured rentals',
      error: error.message,
      data: [],
      vehicles: []
    });
  }
}

// === NEW: ENHANCED SEARCH ENDPOINT ===
if (path === '/rentals/search' && req.method === 'GET') {
  console.log(`[${timestamp}] → RENTAL SEARCH`);
  
  try {
    const rentalsCollection = db.collection('rentalvehicles');
    
    const searchTerm = searchParams.get('q') || searchParams.get('search') || '';
    const make = searchParams.get('make');
    const transmission = searchParams.get('transmission');
    const fuelType = searchParams.get('fuelType');
    const minPrice = searchParams.get('minPrice');
    const maxPrice = searchParams.get('maxPrice');
    const location = searchParams.get('location');
    
    let filter = { status: { $in: ['available', 'active'] } };
    
    // Build search query
    const searchConditions = [];
    
    if (searchTerm) {
      const searchRegex = { $regex: searchTerm, $options: 'i' };
      searchConditions.push({
        $or: [
          { name: searchRegex },
          { title: searchRegex },
          { description: searchRegex },
          { 'specifications.make': searchRegex },
          { 'specifications.model': searchRegex }
        ]
      });
    }
    
    if (make) {
      searchConditions.push({ 'specifications.make': { $regex: make, $options: 'i' } });
    }
    
    if (transmission) {
      searchConditions.push({ 'specifications.transmission': transmission });
    }
    
    if (fuelType) {
      searchConditions.push({ 'specifications.fuelType': fuelType });
    }
    
    if (minPrice || maxPrice) {
      const priceCondition = {};
      if (minPrice) priceCondition.$gte = Number(minPrice);
      if (maxPrice) priceCondition.$lte = Number(maxPrice);
      
      searchConditions.push({
        $or: [
          { dailyRate: priceCondition },
          { 'rates.daily': priceCondition }
        ]
      });
    }
    
    if (location) {
      const locationRegex = { $regex: location, $options: 'i' };
      searchConditions.push({
        $or: [
          { 'location.city': locationRegex },
          { 'location.state': locationRegex },
          { 'provider.location.city': locationRegex }
        ]
      });
    }
    
    if (searchConditions.length > 0) {
      filter.$and = searchConditions;
    }
    
    // Pagination
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 12;
    const skip = (page - 1) * limit;
    
    // Sorting
    let sort = { averageRating: -1, createdAt: -1 };
    const sortParam = searchParams.get('sort');
    if (sortParam === 'price_asc') sort = { dailyRate: 1 };
    else if (sortParam === 'price_desc') sort = { dailyRate: -1 };
    else if (sortParam === 'newest') sort = { createdAt: -1 };
    else if (sortParam === 'oldest') sort = { createdAt: 1 };
    
    const total = await rentalsCollection.countDocuments(filter);
    const rentals = await rentalsCollection
      .find(filter)
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .toArray();
    
    const formattedRentals = rentals.map(rental => ({
      _id: rental._id,
      id: rental._id,
      name: rental.name || rental.title || 'Rental Vehicle',
      title: rental.title || rental.name || 'Rental Vehicle',
      dailyRate: rental.dailyRate || rental.rates?.daily || 0,
      currency: rental.currency || 'BWP',
      make: rental.specifications?.make || '',
      model: rental.specifications?.model || '',
      year: rental.specifications?.year || new Date().getFullYear(),
      transmission: rental.specifications?.transmission || 'automatic',
      fuelType: rental.specifications?.fuelType || 'petrol',
      seats: rental.specifications?.seats || 5,
      primaryImage: rental.images?.find(img => img.isPrimary)?.url || rental.images?.[0]?.url || null,
      provider: rental.provider || { businessName: 'Unknown Provider' },
      location: rental.location || {},
      averageRating: rental.averageRating || 0,
      totalReviews: rental.reviews?.length || 0,
      featured: Boolean(rental.featured),
      status: rental.status || 'available'
    }));
    
    return res.status(200).json({
      success: true,
      data: formattedRentals,
      vehicles: formattedRentals,
      search: {
        query: searchTerm,
        filters: { make, transmission, fuelType, minPrice, maxPrice, location }
      },
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total: total
      },
      count: formattedRentals.length,
      message: `Found ${formattedRentals.length} rental vehicles matching search criteria`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Rental search error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error searching rental vehicles',
      error: error.message,
      data: [],
      vehicles: []
    });
  }
}

// === NEW: RENTAL STATISTICS ENDPOINT ===
if (path === '/rentals/stats' && req.method === 'GET') {
  console.log(`[${timestamp}] → RENTAL STATISTICS`);
  
  try {
    const rentalsCollection = db.collection('rentalvehicles');
    
    // Get basic counts
    const totalRentals = await rentalsCollection.countDocuments({});
    const availableRentals = await rentalsCollection.countDocuments({ status: 'available' });
    const rentedVehicles = await rentalsCollection.countDocuments({ status: 'rented' });
    const featuredRentals = await rentalsCollection.countDocuments({ featured: true });
    
    // Get most popular makes
    const makeStats = await rentalsCollection.aggregate([
      { $match: { status: { $ne: 'deleted' } } },
      { $group: { _id: '$specifications.make', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]).toArray();
    
    // Get providers with most rentals
    const providerStats = await rentalsCollection.aggregate([
      { $match: { status: { $ne: 'deleted' } } },
      { $group: { 
        _id: '$providerId', 
        count: { $sum: 1 },
        providerName: { $first: '$provider.businessName' }
      }},
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]).toArray();
    
    // Average pricing
    const pricingStats = await rentalsCollection.aggregate([
      { $match: { 
        status: { $ne: 'deleted' },
        $or: [
          { dailyRate: { $gt: 0 } },
          { 'rates.daily': { $gt: 0 } }
        ]
      }},
      { $project: {
        dailyRate: { 
          $ifNull: [
            '$dailyRate', 
            { $ifNull: ['$rates.daily', 0] }
          ]
        }
      }},
      { $group: {
        _id: null,
        averageDaily: { $avg: '$dailyRate' },
        minDaily: { $min: '$dailyRate' },
        maxDaily: { $max: '$dailyRate' }
      }}
    ]).toArray();
    
    const stats = {
      overview: {
        total: totalRentals,
        available: availableRentals,
        rented: rentedVehicles,
        featured: featuredRentals,
        utilizationRate: totalRentals > 0 ? ((rentedVehicles / totalRentals) * 100).toFixed(1) : 0
      },
      popularMakes: makeStats.map(item => ({
        make: item._id || 'Unknown',
        count: item.count
      })),
      topProviders: providerStats.map(item => ({
        providerId: item._id,
        providerName: item.providerName || 'Unknown Provider',
        vehicleCount: item.count
      })),
      pricing: pricingStats.length > 0 ? {
        averageDaily: Math.round(pricingStats[0].averageDaily || 0),
        minDaily: pricingStats[0].minDaily || 0,
        maxDaily: pricingStats[0].maxDaily || 0,
        currency: 'BWP'
      } : {
        averageDaily: 0,
        minDaily: 0,
        maxDaily: 0,
        currency: 'BWP'
      }
    };
    
    return res.status(200).json({
      success: true,
      data: stats,
      message: 'Rental vehicle statistics retrieved successfully'
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Rental stats error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching rental statistics',
      error: error.message
    });
  }
}

// === RENTALS BY PROVIDER (ENHANCED) ===
if (path.match(/^\/rentals\/provider\/[a-fA-F0-9]{24}$/) && req.method === 'GET') {
  const providerId = path.split('/')[3];
  console.log(`[${timestamp}] → RENTALS BY PROVIDER: ${providerId}`);
  
  try {
    const rentalsCollection = db.collection('rentalvehicles');
    const { ObjectId } = await import('mongodb');
    
    // Build filter for provider
    let filter = { status: { $ne: 'deleted' } };
    
    // Try ObjectId filter first
    if (providerId.length === 24 && /^[0-9a-fA-F]{24}$/.test(providerId)) {
      try {
        filter.providerId = new ObjectId(providerId);
      } catch (objectIdError) {
        filter.providerId = providerId;
      }
    } else {
      filter.providerId = providerId;
    }
    
    // Add additional filters from query params
    const status = searchParams.get('status');
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    // Get pagination params
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 10;
    const skip = (page - 1) * limit;
    
    // Get sorting
    const sortParam = searchParams.get('sort') || '-createdAt';
    let sort = {};
    if (sortParam.startsWith('-')) {
      sort[sortParam.substring(1)] = -1;
    } else {
      sort[sortParam] = 1;
    }
    
    // Get total count
    const total = await rentalsCollection.countDocuments(filter);
    const totalPages = Math.ceil(total / limit);
    
    // Get rentals with pagination
    const rentals = await rentalsCollection
      .find(filter)
      .skip(skip)
      .limit(limit)
      .sort(sort)
      .toArray();
    
    // Format for frontend (enhanced formatting)
    const safeRentals = rentals.map(rental => ({
      _id: rental._id,
      id: rental._id,
      name: rental.name || rental.title || 'Rental Vehicle',
      title: rental.title || rental.name || 'Rental Vehicle',
      description: rental.description || '',
      specifications: rental.specifications || {},
      features: Array.isArray(rental.features) ? rental.features : [],
      rates: rental.rates || {},
      images: Array.isArray(rental.images) ? rental.images : [],
      primaryImage: rental.images && rental.images.length > 0 ? 
        (rental.images.find(img => img.isPrimary)?.url || rental.images[0]?.url || null) : null,
      status: String(rental.status || 'available'),
      availability: String(rental.availability || 'available'),
      providerId: rental.providerId,
      averageRating: rental.averageRating || 0,
      totalReviews: rental.reviews ? rental.reviews.length : 0,
      views: rental.views || 0,
      featured: Boolean(rental.featured),
      createdAt: rental.createdAt ? new Date(rental.createdAt).toISOString() : null
    }));
    
    return res.status(200).json({
      success: true,
      data: safeRentals,
      vehicles: safeRentals, // Alternative format
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        total: total,
        limit: limit,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      count: safeRentals.length,
      message: `Found ${safeRentals.length} rentals for provider`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Rentals by provider error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching rentals by provider',
      error: error.message,
      data: [],
      vehicles: [],
      pagination: {
        currentPage: 1,
        totalPages: 0,
        total: 0
      }
    });
  }
}

// === UPDATE RENTAL STATUS ENDPOINT ===
if (path.match(/^\/rentals\/[a-fA-F0-9]{24}\/status$/) && req.method === 'PATCH') {
  const rentalId = path.split('/')[2];
  console.log(`[${timestamp}] → UPDATE RENTAL STATUS: ${rentalId}`);
  
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);
    
    let requestData = {};
    try {
      const rawBodyString = rawBody.toString();
      if (rawBodyString) requestData = JSON.parse(rawBodyString);
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid JSON format'
      });
    }
    
    const { status } = requestData;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }
    
    const validStatuses = ['available', 'rented', 'maintenance', 'inactive'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }
    
    const rentalsCollection = db.collection('rentalvehicles');
    const { ObjectId } = await import('mongodb');
    
    const updateData = {
      status: status,
      updatedAt: new Date()
    };
    
    let result;
    
    if (rentalId.length === 24 && /^[0-9a-fA-F]{24}$/.test(rentalId)) {
      try {
        result = await rentalsCollection.updateOne(
          { _id: new ObjectId(rentalId) },
          { $set: updateData }
        );
      } catch (objectIdError) {
        result = await rentalsCollection.updateOne(
          { _id: rentalId },
          { $set: updateData }
        );
      }
    } else {
      result = await rentalsCollection.updateOne(
        { _id: rentalId },
        { $set: updateData }
      );
    }
    
    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Rental vehicle not found'
      });
    }
    
    // Get updated rental
    let updatedRental;
    if (rentalId.length === 24 && /^[0-9a-fA-F]{24}$/.test(rentalId)) {
      try {
        updatedRental = await rentalsCollection.findOne({ _id: new ObjectId(rentalId) });
      } catch (error) {
        updatedRental = await rentalsCollection.findOne({ _id: rentalId });
      }
    } else {
      updatedRental = await rentalsCollection.findOne({ _id: rentalId });
    }
    
    return res.status(200).json({
      success: true,
      data: updatedRental,
      message: `Rental status updated to ${status}`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Update rental status error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update rental status',
      error: error.message
    });
  }
}

// === NEW: BATCH OPERATIONS FOR ADMIN ===
if (path === '/rentals/batch' && req.method === 'PATCH') {
  console.log(`[${timestamp}] → RENTAL BATCH OPERATIONS`);
  
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);
    
    let requestData = {};
    try {
      const rawBodyString = rawBody.toString();
      if (rawBodyString) requestData = JSON.parse(rawBodyString);
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid JSON format'
      });
    }
    
    const { action, rentalIds, data } = requestData;
    
    if (!action || !Array.isArray(rentalIds) || rentalIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Action and rentalIds array are required'
      });
    }
    
    const rentalsCollection = db.collection('rentalvehicles');
    const { ObjectId } = await import('mongodb');
    
    // Convert rentalIds to ObjectIds where possible
    const objectIds = rentalIds.map(id => {
      try {
        return id.length === 24 ? new ObjectId(id) : id;
      } catch (e) {
        return id;
      }
    });
    
    let updateData = {};
    let result = null;
    
    switch (action) {
      case 'updateStatus':
        if (!data?.status) {
          return res.status(400).json({
            success: false,
            message: 'Status is required for updateStatus action'
          });
        }
        
        updateData = {
          status: data.status,
          updatedAt: new Date()
        };
        
        result = await rentalsCollection.updateMany(
          { _id: { $in: objectIds } },
          { $set: updateData }
        );
        break;
        
      case 'toggleFeatured':
        // Get current featured status and toggle
        const rentalsToToggle = await rentalsCollection.find(
          { _id: { $in: objectIds } },
          { projection: { _id: 1, featured: 1 } }
        ).toArray();
        
        const togglePromises = rentalsToToggle.map(rental => 
          rentalsCollection.updateOne(
            { _id: rental._id },
            { 
              $set: { 
                featured: !rental.featured,
                updatedAt: new Date()
              }
            }
          )
        );
        
        await Promise.all(togglePromises);
        result = { modifiedCount: rentalsToToggle.length };
        break;
        
      case 'delete':
        updateData = {
          status: 'deleted',
          deletedAt: new Date(),
          updatedAt: new Date()
        };
        
        result = await rentalsCollection.updateMany(
          { _id: { $in: objectIds } },
          { $set: updateData }
        );
        break;
        
      default:
        return res.status(400).json({
          success: false,
          message: `Invalid action: ${action}. Supported actions: updateStatus, toggleFeatured, delete`
        });
    }
    
    return res.status(200).json({
      success: true,
      data: {
        action: action,
        processedCount: result.modifiedCount || 0,
        rentalIds: rentalIds
      },
      message: `Batch ${action} completed successfully. ${result.modifiedCount || 0} rentals updated.`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Rental batch operations error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error performing batch operations',
      error: error.message
    });
  }
}

// === UPDATE RENTAL VEHICLE ===
if (path.match(/^\/rentals\/[a-fA-F0-9]{24}$/) && req.method === 'PUT') {
  const rentalId = path.split('/')[2];
  console.log(`[${timestamp}] → UPDATE RENTAL: ${rentalId}`);
  
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);
    
    const contentType = req.headers['content-type'] || '';
    let rentalData = {};
    let uploadedImages = [];
    
    // Parse request body similar to create endpoint
    if (contentType.includes('application/json')) {
      try {
        const rawBodyString = rawBody.toString();
        if (rawBodyString) rentalData = JSON.parse(rawBodyString);
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          message: 'Invalid JSON format'
        });
      }
    } else if (contentType.includes('multipart/form-data')) {
      // Handle FormData parsing (similar to create)
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
      
      // Parse form data similar to create endpoint
      for (const part of parts) {
        if (part.includes('Content-Disposition: form-data')) {
          const nameMatch = part.match(/name="([^"]+)"/);
          if (!nameMatch) continue;
          
          const fieldName = nameMatch[1];
          const dataStart = part.indexOf('\r\n\r\n');
          if (dataStart !== -1) {
            const fieldValue = part.substring(dataStart + 4).replace(/\r\n$/, '').trim();
            
            if (fieldName === 'vehicleData') {
              try {
                const vehicleDataParsed = JSON.parse(fieldValue);
                rentalData = { ...rentalData, ...vehicleDataParsed };
              } catch (e) {
                rentalData[fieldName] = fieldValue;
              }
            } else {
              rentalData[fieldName] = fieldValue;
            }
          }
        }
      }
    }
    
    // Sanitize input data
    rentalData = sanitizeRentalInput(rentalData);
    
    const rentalsCollection = db.collection('rentalvehicles');
    const { ObjectId } = await import('mongodb');
    
    // Find existing rental
    const existingRental = await rentalsCollection.findOne({ 
      _id: new ObjectId(rentalId) 
    });
    
    if (!existingRental) {
      return res.status(404).json({
        success: false,
        message: 'Rental vehicle not found'
      });
    }
    
    // Prepare update data
    const updateData = {
      ...rentalData,
      updatedAt: new Date()
    };
    
    // Update rental
    const result = await rentalsCollection.updateOne(
      { _id: new ObjectId(rentalId) },
      { $set: updateData }
    );
    
    const updatedRental = await rentalsCollection.findOne({ 
      _id: new ObjectId(rentalId) 
    });
    
    console.log(`[${timestamp}] ✅ Rental updated: ${rentalId}`);
    
    return res.status(200).json({
      success: true,
      message: 'Rental vehicle updated successfully',
      data: updatedRental
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Update rental error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update rental vehicle',
      error: error.message
    });
  }
}

// === DELETE RENTAL VEHICLE ===
if (path.match(/^\/rentals\/[a-fA-F0-9]{24}$/) && req.method === 'DELETE') {
  const rentalId = path.split('/')[2];
  console.log(`[${timestamp}] → DELETE RENTAL: ${rentalId}`);
  
  try {
    const rentalsCollection = db.collection('rentalvehicles');
    const { ObjectId } = await import('mongodb');
    
    // Find existing rental
    const existingRental = await rentalsCollection.findOne({ 
      _id: new ObjectId(rentalId) 
    });
    
    if (!existingRental) {
      return res.status(404).json({
        success: false,
        message: 'Rental vehicle not found'
      });
    }
    
    // Soft delete - mark as deleted
    const updateData = {
      status: 'deleted',
      deletedAt: new Date(),
      updatedAt: new Date()
    };

    let result;
    if (rentalId.length === 24 && /^[0-9a-fA-F]{24}$/.test(rentalId)) {
      try {
        result = await rentalsCollection.updateOne(
          { _id: new ObjectId(rentalId) },
          { $set: updateData }
        );
      } catch (objectIdError) {
        result = await rentalsCollection.updateOne(
          { _id: rentalId },
          { $set: updateData }
        );
      }
    } else {
      result = await rentalsCollection.updateOne(
        { _id: rentalId },
        { $set: updateData }
      );
    }
    
    console.log(`[${timestamp}] ✅ Rental deleted: ${existingRental.name}`);
    
    return res.status(200).json({
      success: true,
      message: 'Rental vehicle deleted successfully',
      data: { 
        id: rentalId, 
        name: existingRental.name,
        deletedAt: new Date() 
      }
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Delete rental error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete rental vehicle',
      error: error.message
    });
  }
}

// === INDIVIDUAL RENTAL DETAIL (ENHANCED WITH FULL PROVIDER POPULATION) ===
// This handles both /rentals/{id} and must support multiple ID formats like listings
if (path.match(/^\/rentals\/[^\/]+$/) && req.method === 'GET' && 
    !path.includes('/featured') && 
    !path.includes('/search') && 
    !path.includes('/stats') && 
    !path.includes('/batch') && 
    !path.includes('/provider/') &&
    !path.includes('/api/') &&
    path !== '/rentals') {
  
  const rentalId = path.replace('/rentals/', '');
  console.log(`[${timestamp}] → INDIVIDUAL RENTAL (frontend): "${rentalId}"`);
  
  try {
    const rentalsCollection = db.collection('rentalvehicles');
    const serviceProvidersCollection = db.collection('serviceproviders');
    const { ObjectId } = await import('mongodb');
    
    let rental = null;
    
    // Try multiple lookup methods (like listings do)
    // 1. Try string ID first
    try {
      rental = await rentalsCollection.findOne({ _id: rentalId });
    } catch (e) {
      console.log(`[${timestamp}] String ID lookup failed`);
    }
    
    // 2. Try ObjectId if string fails and looks like ObjectId
    if (!rental && rentalId.length === 24 && /^[0-9a-fA-F]{24}$/.test(rentalId)) {
      try {
        rental = await rentalsCollection.findOne({ _id: new ObjectId(rentalId) });
      } catch (oidError) {
        console.log(`[${timestamp}] ObjectId lookup failed: ${oidError.message}`);
      }
    }
    
    // 3. Try by slug if both ID methods fail
    if (!rental) {
      try {
        rental = await rentalsCollection.findOne({ slug: rentalId });
      } catch (slugError) {
        console.log(`[${timestamp}] Slug lookup failed: ${slugError.message}`);
      }
    }
    
    if (!rental) {
      console.error(`[${timestamp}] Rental not found with ID/slug: ${rentalId}`);
      return res.status(404).json({
        success: false,
        message: 'Rental vehicle not found',
        rentalId: rentalId
      });
    }
    
    // Check if rental is deleted
    if (rental.status === 'deleted') {
      return res.status(404).json({
        success: false,
        message: 'Rental vehicle not found',
        rentalId: rentalId
      });
    }

    console.log(`[${timestamp}] ✅ Individual rental found: ${rental.name || rental.title}`);
    
    // Fetch complete provider data
    let fullProvider = null;
    if (rental.providerId) {
      try {
        let providerId = rental.providerId;
        if (typeof providerId === 'string' && providerId.length === 24) {
          providerId = new ObjectId(providerId);
        }
        
        fullProvider = await serviceProvidersCollection.findOne({ _id: providerId });
        console.log(`[${timestamp}] Provider lookup: ${fullProvider ? fullProvider.businessName : 'not found'}`);
      } catch (e) {
        console.warn(`[${timestamp}] Error fetching provider:`, e.message);
      }
    }
    
    // CRITICAL: Frontend-compatible individual rental formatting
    const frontendRental = {
      // Essential IDs
      _id: String(rental._id),
      id: String(rental._id),
      
      // Basic info
      name: String(rental.name || rental.title || 'Rental Vehicle'),
      title: String(rental.title || rental.name || 'Rental Vehicle'),
      slug: String(rental.slug || rentalId),
      description: String(rental.description || ''),
      shortDescription: String(rental.shortDescription || rental.description || ''),
      category: String(rental.category || 'Car'),
      
      // CRITICAL: Frontend expects these provider fields
      providerLogo: fullProvider?.profile?.logo || rental.provider?.profile?.logo || rental.provider?.logo || '',
      provider: fullProvider?.businessName || rental.provider?.businessName || rental.provider?.name || 'Unknown Provider',
      providerLocation: fullProvider?.location?.city || rental.provider?.location?.city || rental.location?.city || '',
      providerId: rental.providerId,
      
      // Complete provider object
      providerData: fullProvider ? {
        _id: String(fullProvider._id),
        id: String(fullProvider._id),
        name: String(fullProvider.businessName || fullProvider.name || 'Service Provider'),
        businessName: String(fullProvider.businessName || fullProvider.name || 'Service Provider'),
        logo: String(fullProvider.profile?.logo || ''),
        profile: {
          logo: String(fullProvider.profile?.logo || ''),
          banner: String(fullProvider.profile?.banner || '')
        },
        contact: {
          phone: String(fullProvider.contact?.phone || ''),
          email: String(fullProvider.contact?.email || ''),
          website: String(fullProvider.contact?.website || '')
        },
        location: {
          address: String(fullProvider.location?.address || ''),
          city: String(fullProvider.location?.city || ''),
          state: String(fullProvider.location?.state || ''),
          country: String(fullProvider.location?.country || 'Botswana')
        },
        verification: {
          isVerified: Boolean(fullProvider.verification?.isVerified),
          verifiedAt: fullProvider.verification?.verifiedAt || null
        },
        providerType: String(fullProvider.providerType || 'CAR_RENTAL'),
        description: String(fullProvider.description || ''),
        // Rating and review info
        averageRating: Number(fullProvider.metrics?.averageRating || 0),
        totalReviews: Number(fullProvider.metrics?.totalReviews || 0)
      } : rental.provider || null,
      
      // Vehicle specifications
      specifications: {
        make: String(rental.specifications?.make || ''),
        model: String(rental.specifications?.model || ''),
        year: Number(rental.specifications?.year || new Date().getFullYear()),
        color: String(rental.specifications?.color || ''),
        transmission: String(rental.specifications?.transmission || 'automatic'),
        fuelType: String(rental.specifications?.fuelType || 'petrol'),
        engineSize: String(rental.specifications?.engineSize || ''),
        seats: Number(rental.specifications?.seats || 5),
        doors: Number(rental.specifications?.doors || 4),
        mileage: Number(rental.specifications?.mileage || 0)
      },
      
      // Pricing
      rates: {
        daily: Number(rental.rates?.daily || rental.dailyRate || 0),
        weekly: Number(rental.rates?.weekly || rental.weeklyRate || 0),
        monthly: Number(rental.rates?.monthly || rental.monthlyRate || 0),
        security: Number(rental.rates?.security || 0),
        includesVAT: Boolean(rental.rates?.includesVAT !== false)
      },
      
      // Backward compatibility pricing
      dailyRate: Number(rental.dailyRate || rental.rates?.daily || 0),
      weeklyRate: Number(rental.weeklyRate || rental.rates?.weekly || 0),
      monthlyRate: Number(rental.monthlyRate || rental.rates?.monthly || 0),
      currency: String(rental.currency || 'BWP'),
      
      // Features
      features: Array.isArray(rental.features) ? rental.features.map(f => String(f)) : [],
      
      // Images with safety
      images: Array.isArray(rental.images) ? rental.images.map((img, index) => ({
        url: String(img?.url || ''),
        thumbnail: String(img?.thumbnail || img?.url || ''),
        isPrimary: Boolean(img?.isPrimary || index === 0),
        key: String(img?.key || ''),
        size: Number(img?.size || 0),
        mimetype: String(img?.mimetype || 'image/jpeg')
      })) : [],
      
      // Primary image
      primaryImage: (() => {
        if (!Array.isArray(rental.images) || rental.images.length === 0) return null;
        const primary = rental.images.find(img => img?.isPrimary);
        return primary?.url || rental.images[0]?.url || null;
      })(),
      
      // Status
      status: String(rental.status || 'available'),
      availability: String(rental.availability || rental.status || 'available'),
      
      // Location
      location: {
        address: String(rental.location?.address || ''),
        city: String(rental.location?.city || ''),
        state: String(rental.location?.state || ''),
        country: String(rental.location?.country || 'Botswana'),
        coordinates: {
          lat: Number(rental.location?.coordinates?.lat || 0),
          lng: Number(rental.location?.coordinates?.lng || 0)
        }
      },
      
      // Rental terms
      rentalTerms: {
        minimumAge: Number(rental.rentalTerms?.minimumAge || 21),
        minimumRentalPeriod: Number(rental.rentalTerms?.minimumRentalPeriod || 1),
        depositRequired: Boolean(rental.rentalTerms?.depositRequired !== false),
        licenseRequired: Boolean(rental.rentalTerms?.licenseRequired !== false),
        fuelPolicy: String(rental.rentalTerms?.fuelPolicy || 'full-to-full'),
        mileageLimit: Number(rental.rentalTerms?.mileageLimit || 0)
      },
      
      // Metadata
      featured: Boolean(rental.featured),
      verified: Boolean(rental.verified),
      
      // Reviews
      reviews: Array.isArray(rental.reviews) ? rental.reviews : [],
      averageRating: Number(rental.averageRating || 0),
      totalReviews: rental.reviews?.length || 0,
      views: Number(rental.views || 0),
      
      // Timestamps
      createdAt: rental.createdAt ? new Date(rental.createdAt).toISOString() : null,
      updatedAt: rental.updatedAt ? new Date(rental.updatedAt).toISOString() : null
    };
    
    // Increment view count
    try {
      const updateFilter = rentalId.length === 24 && /^[0-9a-fA-F]{24}$/.test(rentalId)
        ? { _id: new ObjectId(rentalId) }
        : { _id: rentalId };
        
      await rentalsCollection.updateOne(updateFilter, {
        $inc: { views: 1 },
        $set: { lastViewed: new Date() }
      });
      frontendRental.views = frontendRental.views + 1;
    } catch (viewError) {
      console.warn(`[${timestamp}] View tracking failed:`, viewError.message);
    }
    
    console.log(`[${timestamp}] ✅ Frontend-compatible rental: ${frontendRental.title}, provider: ${frontendRental.provider}, logo: ${frontendRental.providerLogo || 'none'}`);
    
    return res.status(200).json({
      success: true,
      data: frontendRental,
      message: `Found rental: ${frontendRental.title}`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Individual rental lookup failed:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching rental',
      error: error.message
    });
  }
}


// ==================== SECTION 9: TRANSPORT ENDPOINTS (PRODUCTION-READY) ====================
// ==================== COMPLETE TRANSPORT ENDPOINTS FOR PRODUCTION ====================
// ==================== COMPATIBLE WITH FRONTEND & MOBILE-OPTIMIZED ====================

// === UTILITY FUNCTIONS FOR DATA SANITIZATION (REACT-SAFE) ===
const sanitizeRouteData = (route, includeFullDetails = false) => {
  if (!route) return null;
  
  const routeId = String(route._id || route.id || `temp-${Date.now()}`);
  
  // Base safe route object for React rendering
  const safeRoute = {
    // Essential identifiers
    _id: routeId,
    id: routeId,
    slug: String(route.slug || routeId),
    
    // Basic route info (ensure strings for React)
    title: String(route.title || route.routeName || `${route.origin || 'Unknown'} to ${route.destination || 'Unknown'}`),
    routeName: String(route.routeName || route.title || 'Unnamed Route'),
    description: String(route.description || ''),
    
    // Route path (mobile-friendly)
    origin: String(route.origin || 'Unknown Origin'),
    destination: String(route.destination || 'Unknown Destination'),
    
    // Mobile-optimized stops (simplified for mobile)
    stops: Array.isArray(route.stops) ? route.stops.slice(0, includeFullDetails ? 50 : 8).map((stop, index) => {
      if (typeof stop === 'string') {
        return {
          name: String(stop),
          order: Number(index + 1)
        };
      }
      return {
        name: String(stop?.name || `Stop ${index + 1}`),
        order: Number(stop?.order || index + 1),
        estimatedTime: includeFullDetails ? String(stop?.estimatedTime || '') : undefined,
        coordinates: includeFullDetails && stop?.coordinates ? {
          lat: Number(stop.coordinates.lat || 0),
          lng: Number(stop.coordinates.lng || 0)
        } : undefined
      };
    }) : [],
    
    // Pricing (ensure numbers)
    fare: Number(route.pricing?.baseFare || route.fare || 0),
    currency: String(route.pricing?.currency || route.currency || 'BWP'),
    
    // Status (ensure strings)
    status: String(route.operationalStatus || route.status || 'active'),
    operationalStatus: String(route.operationalStatus || route.status || 'active'),
    
    // Route classification
    routeType: String(route.routeType || 'Bus'),
    serviceType: String(route.serviceType || 'Regular'),
    vehicleType: String(route.vehicleType || 'bus'),
    
    // Provider info (safe for React)
    provider: {
      name: String(route.provider?.name || route.provider?.businessName || route.operatorName || 'Unknown Provider'),
      businessName: String(route.provider?.businessName || route.provider?.name || route.operatorName || 'Unknown Provider'),
      logo: String(route.provider?.logo || ''),
      contact: {
        phone: String(route.provider?.contact?.phone || route.contact?.phone || ''),
        email: String(route.provider?.contact?.email || route.contact?.email || '')
      }
    },
    operatorName: String(route.operatorName || route.provider?.businessName || 'Unknown Provider'),
    
    // Schedule (mobile-optimized)
    schedule: {
      frequency: String(route.schedule?.frequency || 'Daily'),
      startTime: String(route.schedule?.startTime || '06:00'),
      endTime: String(route.schedule?.endTime || '18:00'),
      
      // Mobile: show only first 5 departure times
      departureTimes: Array.isArray(route.schedule?.departureTimes) && route.schedule.departureTimes.length > 0 
        ? route.schedule.departureTimes.slice(0, includeFullDetails ? 50 : 5).map(time => String(time))
        : ['06:00', '12:00', '18:00'],
        
      // Operating days (boolean for React)
      operatingDays: {
        monday: Boolean(route.schedule?.operatingDays?.monday !== false),
        tuesday: Boolean(route.schedule?.operatingDays?.tuesday !== false),
        wednesday: Boolean(route.schedule?.operatingDays?.wednesday !== false),
        thursday: Boolean(route.schedule?.operatingDays?.thursday !== false),
        friday: Boolean(route.schedule?.operatingDays?.friday !== false),
        saturday: Boolean(route.schedule?.operatingDays?.saturday !== false),
        sunday: Boolean(route.schedule?.operatingDays?.sunday !== false)
      }
    },
    
    // Mobile-optimized images (max 3 for mobile, all for details)
    images: Array.isArray(route.images) ? route.images.slice(0, includeFullDetails ? 20 : 3).map(img => {
      if (typeof img === 'string') {
        return { url: String(img), isPrimary: false };
      }
      return {
        url: String(img?.url || ''),
        thumbnail: String(img?.thumbnail || img?.url || ''),
        isPrimary: Boolean(img?.isPrimary)
      };
    }) : [],
    
    // Route details
    distance: String(route.distance || ''),
    estimatedDuration: String(route.estimatedDuration || ''),
    
    // Ratings
    averageRating: Number(route.averageRating || 0),
    totalReviews: Number(route.reviews?.length || route.totalReviews || 0),
    
    // Timestamps (ISO strings for consistency)
    createdAt: route.createdAt ? new Date(route.createdAt).toISOString() : null,
    updatedAt: route.updatedAt ? new Date(route.updatedAt).toISOString() : null,
    
    // Flags
    featured: Boolean(route.featured)
  };
  
  // Add full details only when requested (detail page)
  if (includeFullDetails) {
    safeRoute.fullDescription = String(route.fullDescription || route.description || '');
    safeRoute.amenities = Array.isArray(route.amenities) ? route.amenities.map(a => String(a)) : [];
    safeRoute.paymentMethods = Array.isArray(route.paymentMethods) ? route.paymentMethods.map(p => String(p)) : ['Cash'];
    
    safeRoute.accessibility = {
      wheelchairAccessible: Boolean(route.accessibility?.wheelchairAccessible),
      lowFloor: Boolean(route.accessibility?.lowFloor),
      audioAnnouncements: Boolean(route.accessibility?.audioAnnouncements)
    };
    
    safeRoute.pricing = {
      baseFare: Number(route.pricing?.baseFare || route.fare || 0),
      currency: String(route.pricing?.currency || 'BWP'),
      childFare: Number(route.pricing?.childFare || (route.fare || 0) * 0.5),
      seniorFare: Number(route.pricing?.seniorFare || (route.fare || 0) * 0.8),
      paymentMethods: Array.isArray(route.pricing?.paymentMethods) ? route.pricing.paymentMethods : ['cash']
    };
  }
  
  return safeRoute;
};

// === ENHANCED: CREATE TRANSPORT ROUTE (PRODUCTION-READY WITH IMAGE UPLOAD) ===
if (path === '/transport' && req.method === 'POST') {
  try {
    console.log(`[${timestamp}] → CREATE TRANSPORT ROUTE`);
    
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);
    
    const contentType = req.headers['content-type'] || '';
    let routeData = {};
    const uploadedImages = [];
    
    // Handle both JSON and FormData requests
    if (contentType.includes('application/json')) {
      try {
        const rawBodyString = rawBody.toString();
        if (rawBodyString) routeData = JSON.parse(rawBodyString);
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          message: 'Invalid JSON format'
        });
      }
      
    } else if (contentType.includes('multipart/form-data')) {
      console.log(`[${timestamp}] Processing FormData with images`);
      
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
      const files = {};
      
      // Parse multipart data
      for (const part of parts) {
        if (part.includes('Content-Disposition: form-data')) {
          const nameMatch = part.match(/name="([^"]+)"/);
          if (!nameMatch) continue;
          
          const fieldName = nameMatch[1];
          const isFile = part.includes('filename=');
          
          if (isFile) {
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
              
              if (fileBuffer.length > 100) {
                files[fieldName] = {
                  filename: filename,
                  buffer: fileBuffer,
                  mimetype: fileType,
                  size: fileBuffer.length
                };
              }
            }
          } else {
            const dataStart = part.indexOf('\r\n\r\n');
            if (dataStart !== -1) {
              const fieldValue = part.substring(dataStart + 4).replace(/\r\n$/, '').trim();
              
              // Parse JSON fields
              if (['origin', 'destination', 'stops', 'schedule', 'pricing', 'accessibility', 'contact'].includes(fieldName)) {
                try {
                  routeData[fieldName] = JSON.parse(fieldValue);
                } catch (e) {
                  routeData[fieldName] = fieldValue;
                }
              } else {
                routeData[fieldName] = fieldValue;
              }
            }
          }
        }
      }
      
      // Upload images to S3 if configured
      if (Object.keys(files).length > 0) {
        const awsAccessKey = process.env.AWS_ACCESS_KEY_ID;
        const awsSecretKey = process.env.AWS_SECRET_ACCESS_KEY;
        const awsBucket = process.env.AWS_S3_BUCKET_NAME || 'bw-car-culture-images';
        const awsRegion = process.env.AWS_S3_REGION || 'us-east-1';
        
        if (awsAccessKey && awsSecretKey) {
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
                const s3Filename = `images/transport/${timestamp_ms}-${randomString}-${fieldName}.${fileExtension}`;
                
                const uploadCommand = new PutObjectCommand({
                  Bucket: awsBucket,
                  Key: s3Filename,
                  Body: file.buffer,
                  ContentType: file.mimetype,
                });
                
                await s3Client.send(uploadCommand);
                
                const imageUrl = `https://${awsBucket}.s3.amazonaws.com/${s3Filename}`;
                
                uploadedImages.push({
                  url: imageUrl,
                  key: s3Filename,
                  size: file.size,
                  mimetype: file.mimetype,
                  isPrimary: uploadedImages.length === 0
                });
                
                console.log(`[${timestamp}] ✅ Uploaded: ${imageUrl}`);
              } catch (fileError) {
                console.error(`[${timestamp}] Upload failed ${fieldName}:`, fileError.message);
              }
            }
          } catch (s3Error) {
            console.error(`[${timestamp}] S3 setup error:`, s3Error.message);
          }
        }
      }
      
    } else {
      return res.status(400).json({
        success: false,
        message: 'Content-Type must be application/json or multipart/form-data'
      });
    }
    
    // Validate required fields
    if (!routeData.routeName) {
      return res.status(400).json({
        success: false,
        message: 'Route name is required'
      });
    }
    
    if (!routeData.operatorName) {
      return res.status(400).json({
        success: false,
        message: 'Operator name is required'
      });
    }
    
    // Generate unique slug
    const generateSlug = (routeName, routeNumber) => {
      let baseSlug = routeName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      if (routeNumber) {
        baseSlug = `${routeNumber.toLowerCase()}-${baseSlug}`;
      }
      
      return `${baseSlug}-${Date.now()}`;
    };
    
    const slug = generateSlug(routeData.routeName, routeData.routeNumber);
    
    // Create transport route
    const transportCollection = db.collection('transportroutes');
    const { ObjectId } = await import('mongodb');
    
    const newRoute = {
      _id: new ObjectId(),
      routeName: routeData.routeName,
      routeNumber: routeData.routeNumber || '',
      slug: slug,
      operatorName: routeData.operatorName,
      operatorType: routeData.operatorType || 'public_transport',
      
      origin: routeData.origin || { name: '', address: '', coordinates: { lat: 0, lng: 0 } },
      destination: routeData.destination || { name: '', address: '', coordinates: { lat: 0, lng: 0 } },
      stops: Array.isArray(routeData.stops) ? routeData.stops : [],
      
      schedule: {
        startTime: routeData.schedule?.startTime || '06:00',
        endTime: routeData.schedule?.endTime || '22:00',
        frequency: routeData.schedule?.frequency || '30',
        operatingDays: routeData.schedule?.operatingDays || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        departureTimes: routeData.schedule?.departureTimes || ['06:00', '12:00', '18:00']
      },
      
      pricing: {
        baseFare: Number(routeData.pricing?.baseFare) || 0,
        currency: routeData.pricing?.currency || 'BWP',
        discounts: routeData.pricing?.discounts || {},
        paymentMethods: routeData.pricing?.paymentMethods || ['cash']
      },
      
      images: uploadedImages,
      
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
      operationalStatus: routeData.status || 'active',
      featured: Boolean(routeData.featured),
      
      verification: {
        status: 'pending',
        verifiedAt: null,
        verifiedBy: null
      },
      
      createdAt: new Date(),
      updatedAt: new Date(),
      __v: 0
    };
    
    const result = await transportCollection.insertOne(newRoute);
    
    console.log(`[${timestamp}] ✅ Transport route created: ${newRoute.routeName}`);
    
    return res.status(201).json({
      success: true,
      message: `Transport route created successfully${uploadedImages.length > 0 ? ` with ${uploadedImages.length} images` : ''}`,
      data: sanitizeRouteData({ ...newRoute, _id: result.insertedId }, true)
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Create transport route error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create transport route',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
}

// === ENHANCED: GET ALL TRANSPORT ROUTES (MOBILE-OPTIMIZED) ===
if (path === '/transport-routes' && req.method === 'GET') {
  console.log(`[${timestamp}] → TRANSPORT-ROUTES (mobile-optimized)`);
  
  try {
    const transportCollection = db.collection('transportroutes');
    
    let filter = {};
    
    // Enhanced status filtering
    if (searchParams.get('status') && searchParams.get('status') !== 'all') {
      filter.operationalStatus = searchParams.get('status');
    } else {
      filter.operationalStatus = { $in: ['active', 'seasonal'] };
    }
    
    // Enhanced search with stops support
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
        { 'stops.name': searchRegex },
        { 'stops': searchRegex }
      ];
    }
    
    // Destination filtering
    if (searchParams.get('destination') && searchParams.get('destination') !== 'All') {
      const destination = searchParams.get('destination');
      const destRegex = { $regex: destination, $options: 'i' };
      filter.$or = [
        ...(filter.$or || []),
        { destination: destRegex },
        { 'stops.name': destRegex }
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
    
    // City/location filtering
    if (searchParams.get('city')) {
      const cityRegex = { $regex: searchParams.get('city'), $options: 'i' };
      filter.$or = [
        ...(filter.$or || []),
        { origin: cityRegex },
        { destination: cityRegex },
        { 'stops.name': cityRegex }
      ];
    }
    
    // Origin and destination specific search
    if (searchParams.get('origin')) {
      filter.origin = { $regex: searchParams.get('origin'), $options: 'i' };
    }
    
    if (searchParams.get('destination')) {
      filter.destination = { $regex: searchParams.get('destination'), $options: 'i' };
    }
    
    // Pagination (mobile-friendly smaller pages)
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 12; // Smaller for mobile
    const skip = (page - 1) * limit;
    
    // Sorting
    let sortOptions = { createdAt: -1 };
    const sortBy = searchParams.get('sort');
    if (sortBy) {
      if (sortBy === '-createdAt' || sortBy === 'newest') sortOptions = { createdAt: -1 };
      else if (sortBy === 'createdAt' || sortBy === 'oldest') sortOptions = { createdAt: 1 };
      else if (sortBy === 'fare' || sortBy === 'priceAsc') sortOptions = { 'pricing.baseFare': 1 };
      else if (sortBy === '-fare' || sortBy === 'priceDesc') sortOptions = { 'pricing.baseFare': -1 };
    }
    
    console.log(`[${timestamp}] Transport routes query:`, filter);
    
    const [routes, total] = await Promise.all([
      transportCollection.find(filter)
        .skip(skip)
        .limit(limit)
        .sort(sortOptions)
        .toArray(),
      transportCollection.countDocuments(filter)
    ]);
    
    // Mobile-optimized formatting (reduced data)
    const mobileOptimizedRoutes = routes.map(route => sanitizeRouteData(route, false));
    
    console.log(`[${timestamp}] ✅ Found ${mobileOptimizedRoutes.length} of ${total} transport routes`);
    
    return res.status(200).json({
      success: true,
      data: mobileOptimizedRoutes,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total: total
      },
      count: mobileOptimizedRoutes.length,
      message: `Found ${mobileOptimizedRoutes.length} transport routes`,
      serverSideFiltering: true
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Transport routes error:`, error);
    return res.status(200).json({
      success: true,
      data: [],
      pagination: { currentPage: 1, totalPages: 0, total: 0 },
      message: 'No transport routes available',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// === MISSING: /api/transport-routes (FRONTEND COMPATIBILITY) ===
if (path === '/api/transport-routes' && req.method === 'GET') {
  console.log(`[${timestamp}] → API TRANSPORT-ROUTES (frontend endpoint)`);
  
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
    
    // Advanced filtering
    if (searchParams.get('destination') && searchParams.get('destination') !== 'All') {
      const destination = searchParams.get('destination');
      const destRegex = { $regex: destination, $options: 'i' };
      filter.$or = [...(filter.$or || []), { destination: destRegex }, { 'stops.name': destRegex }];
    }
    
    if (searchParams.get('routeType') && searchParams.get('routeType') !== 'All') {
      filter.routeType = { $regex: searchParams.get('routeType'), $options: 'i' };
    }
    
    if (searchParams.get('transportType') && searchParams.get('transportType') !== 'All') {
      filter.serviceType = { $regex: searchParams.get('transportType'), $options: 'i' };
    }
    
    if (searchParams.get('city')) {
      const cityRegex = { $regex: searchParams.get('city'), $options: 'i' };
      filter.$or = [...(filter.$or || []), { origin: cityRegex }, { destination: cityRegex }];
    }
    
    // Pagination
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 12;
    const skip = (page - 1) * limit;
    
    // Sorting
    let sortOptions = { createdAt: -1 };
    const sortBy = searchParams.get('sort');
    if (sortBy) {
      if (sortBy === '-createdAt') sortOptions = { createdAt: -1 };
      else if (sortBy === 'createdAt') sortOptions = { createdAt: 1 };
      else if (sortBy === 'fare') sortOptions = { 'pricing.baseFare': 1 };
      else if (sortBy === '-fare') sortOptions = { 'pricing.baseFare': -1 };
    }
    
    const [routes, total] = await Promise.all([
      transportCollection.find(filter).skip(skip).limit(limit).sort(sortOptions).toArray(),
      transportCollection.countDocuments(filter)
    ]);
    
    const formattedRoutes = routes.map(route => sanitizeRouteData(route, false));
    
    return res.status(200).json({
      success: true,
      data: formattedRoutes,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total: total
      },
      message: `Found ${formattedRoutes.length} transport routes`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] API Transport routes error:`, error);
    return res.status(200).json({
      success: true,
      data: [],
      pagination: { currentPage: 1, totalPages: 0, total: 0 },
      message: 'No transport routes available',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// === NEW: FEATURED TRANSPORT ROUTES (MISSING ENDPOINT) ===
if (path === '/transport/featured' && req.method === 'GET') {
  console.log(`[${timestamp}] → FEATURED TRANSPORT ROUTES`);
  
  try {
    const transportCollection = db.collection('transportroutes');
    const limit = parseInt(searchParams.get('limit')) || 6;
    
    let filter = {
      featured: true,
      operationalStatus: 'active'
    };
    
    const routes = await transportCollection
      .find(filter)
      .limit(limit)
      .sort({ createdAt: -1 })
      .toArray();
    
    const featuredRoutes = routes.map(route => sanitizeRouteData(route, false));
    
    console.log(`[${timestamp}] ✅ Found ${featuredRoutes.length} featured routes`);
    
    return res.status(200).json({
      success: true,
      data: featuredRoutes,
      count: featuredRoutes.length,
      message: `Found ${featuredRoutes.length} featured transport routes`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Featured routes error:`, error);
    return res.status(200).json({
      success: true,
      data: [],
      count: 0,
      message: 'No featured routes available'
    });
  }
}

// === ENHANCED: TRANSPORT BY PROVIDER (PRODUCTION-SAFE) ===
if (path.includes('/transport/provider/') && req.method === 'GET') {
  const providerId = path.split('/provider/')[1];
  console.log(`[${timestamp}] → TRANSPORT BY PROVIDER: ${providerId}`);
  
  try {
    const transportCollection = db.collection('transportroutes');
    const { ObjectId } = await import('mongodb');
    
    let filter = {};
    
    // Handle both providerId and serviceProvider fields
    if (providerId && providerId.length === 24) {
      try {
        const objectId = new ObjectId(providerId);
        filter.$or = [
          { providerId: providerId },
          { providerId: objectId },
          { serviceProvider: providerId },
          { serviceProvider: objectId }
        ];
      } catch (e) {
        filter.$or = [
          { providerId: providerId },
          { serviceProvider: providerId }
        ];
      }
    } else {
      filter.$or = [
        { providerId: providerId },
        { serviceProvider: providerId }
      ];
    }
    
    // Only active routes
    filter.operationalStatus = { $in: ['active', 'seasonal'] };
    
    // Pagination
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 10;
    const skip = (page - 1) * limit;
    
    // Sorting
    let sortOptions = { createdAt: -1 };
    const sortBy = searchParams.get('sort');
    if (sortBy) {
      if (sortBy === '-createdAt') sortOptions = { createdAt: -1 };
      else if (sortBy === 'createdAt') sortOptions = { createdAt: 1 };
    }
    
    console.log(`[${timestamp}] Provider routes filter:`, JSON.stringify(filter, null, 2));
    
    const [routes, total] = await Promise.all([
      transportCollection.find(filter).skip(skip).limit(limit).sort(sortOptions).toArray(),
      transportCollection.countDocuments(filter)
    ]);
    
    console.log(`[${timestamp}] Found ${routes.length} routes for provider ${providerId}`);
    
    // Safe formatting without circular references
    const sanitizedRoutes = routes.map(route => sanitizeRouteData(route, false));
    
    console.log(`[${timestamp}] ✅ Sanitized ${sanitizedRoutes.length} routes for provider`);
    
    return res.status(200).json({
      success: true,
      data: sanitizedRoutes,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total: total
      },
      message: `Found ${sanitizedRoutes.length} routes for provider`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Transport by provider error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching routes by provider',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      data: [],
      pagination: { currentPage: 1, totalPages: 0, total: 0 }
    });
  }
}

// === ENHANCED: INDIVIDUAL TRANSPORT ROUTE DETAIL (FULL DATA) ===
if (path.match(/^\/transport\/[a-fA-F0-9]{24}$/) && req.method === 'GET') {
  const routeId = path.split('/')[2];
  console.log(`[${timestamp}] → TRANSPORT ROUTE DETAIL: ${routeId}`);
  
  try {
    const transportCollection = db.collection('transportroutes');
    const { ObjectId } = await import('mongodb');
    
    let route = null;
    
    // Try ObjectId lookup first
    try {
      route = await transportCollection.findOne({ _id: new ObjectId(routeId) });
    } catch (objectIdError) {
      try {
        route = await transportCollection.findOne({ _id: routeId });
      } catch (stringError) {
        console.log(`[${timestamp}] Route lookup failed:`, stringError.message);
      }
    }
    
    if (!route) {
      console.log(`[${timestamp}] ❌ Transport route not found: ${routeId}`);
      return res.status(404).json({
        success: false,
        message: 'Transport route not found',
        routeId: routeId,
        error: 'ROUTE_NOT_FOUND'
      });
    }
    
    console.log(`[${timestamp}] ✅ Found route: ${route.title || route.routeName}`);
    
    // Full detail formatting (includes all data)
    const detailedRoute = sanitizeRouteData(route, true);
    
    console.log(`[${timestamp}] ✅ Route detail ready: ${detailedRoute.title}`);
    
    return res.status(200).json({
      success: true,
      data: detailedRoute,
      message: `Transport route details: ${detailedRoute.title}`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Transport route detail error:`, error);
    
    return res.status(500).json({
      success: false,
      message: 'Error fetching transport route details',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      routeId: routeId
    });
  }
}

// === INDIVIDUAL TRANSPORT ROUTE (ALTERNATIVE PATH) ===
if (path.includes('/transport-routes/') && path !== '/transport-routes') {
  const routeId = path.replace('/transport-routes/', '').split('?')[0];
  console.log(`[${timestamp}] → TRANSPORT ROUTE (alt path): ${routeId}`);
  
  try {
    const transportCollection = db.collection('transportroutes');
    const { ObjectId } = await import('mongodb');
    
    let route = null;
    
    try {
      if (routeId.length === 24 && /^[0-9a-fA-F]{24}$/.test(routeId)) {
        route = await transportCollection.findOne({ _id: new ObjectId(routeId) });
      } else {
        route = await transportCollection.findOne({ 
          $or: [
            { _id: routeId },
            { slug: routeId }
          ]
        });
      }
    } catch (error) {
      console.log(`[${timestamp}] Route lookup failed:`, error.message);
    }
    
    if (!route) {
      return res.status(404).json({
        success: false,
        message: 'Transport route not found',
        data: null
      });
    }
    
    const formattedRoute = sanitizeRouteData(route, true);
    
    return res.status(200).json({
      success: true,
      data: formattedRoute,
      message: `Transport route: ${formattedRoute.title}`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Individual route error:`, error);
    return res.status(404).json({
      success: false,
      message: 'Transport route not found',
      data: null
    });
  }
}

// === NEW: SEARCH ROUTES BY ORIGIN/DESTINATION ===
if (path === '/transport/search' && req.method === 'GET') {
  console.log(`[${timestamp}] → SEARCH TRANSPORT ROUTES`);
  
  try {
    const transportCollection = db.collection('transportroutes');
    
    const origin = searchParams.get('origin');
    const destination = searchParams.get('destination');
    const date = searchParams.get('date');
    
    let filter = {
      operationalStatus: 'active'
    };
    
    if (origin) {
      filter.$or = [
        ...(filter.$or || []),
        { origin: { $regex: origin, $options: 'i' } },
        { 'stops.name': { $regex: origin, $options: 'i' } }
      ];
    }
    
    if (destination) {
      filter.$or = [
        ...(filter.$or || []),
        { destination: { $regex: destination, $options: 'i' } },
        { 'stops.name': { $regex: destination, $options: 'i' } }
      ];
    }
    
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 10;
    const skip = (page - 1) * limit;
    
    const [routes, total] = await Promise.all([
      transportCollection.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }).toArray(),
      transportCollection.countDocuments(filter)
    ]);
    
    const searchResults = routes.map(route => sanitizeRouteData(route, false));
    
    console.log(`[${timestamp}] ✅ Found ${searchResults.length} routes for search`);
    
    return res.status(200).json({
      success: true,
      data: searchResults,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total: total
      },
      searchParams: { origin, destination, date },
      message: `Found ${searchResults.length} routes`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Search routes error:`, error);
    return res.status(200).json({
      success: true,
      data: [],
      pagination: { currentPage: 1, totalPages: 0, total: 0 },
      message: 'No routes found'
    });
  }
}

// === NEW: GET DESTINATION CITIES ===
if (path === '/transport/destinations' && req.method === 'GET') {
  console.log(`[${timestamp}] → GET DESTINATION CITIES`);
  
  try {
    const transportCollection = db.collection('transportroutes');
    
    const destinations = await transportCollection.aggregate([
      { $match: { operationalStatus: 'active' } },
      {
        $group: {
          _id: null,
          destinations: { $addToSet: '$destination' },
          origins: { $addToSet: '$origin' }
        }
      }
    ]).toArray();

    if (!destinations || destinations.length === 0) {
      return res.status(200).json({
        success: true,
        data: ['Gaborone', 'Francistown', 'Maun', 'Kasane', 'Serowe'] // Default cities
      });
    }

    const allCities = [...new Set([
      ...destinations[0].destinations,
      ...destinations[0].origins
    ])].filter(Boolean).sort();

    return res.status(200).json({
      success: true,
      count: allCities.length,
      data: allCities
    });
  } catch (error) {
    console.error(`[${timestamp}] Error getting destination cities:`, error);
    return res.status(200).json({
      success: true,
      data: ['Gaborone', 'Francistown', 'Maun', 'Kasane', 'Serowe'] // Fallback
    });
  }
}

// === UPDATE TRANSPORT ROUTE STATUS ===
if (path.match(/^\/transport\/[a-fA-F0-9]{24}\/status$/) && req.method === 'PATCH') {
  const routeId = path.split('/')[2];
  console.log(`[${timestamp}] → UPDATE ROUTE STATUS: ${routeId}`);
  
  try {
    let body = {};
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString();
    if (rawBody) body = JSON.parse(rawBody);
    
    const transportCollection = db.collection('transportroutes');
    const { ObjectId } = await import('mongodb');
    
    const result = await transportCollection.updateOne(
      { _id: new ObjectId(routeId) },
      { 
        $set: { 
          operationalStatus: body.status,
          status: body.status,
          updatedAt: new Date() 
        } 
      }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Route not found' 
      });
    }
    
    const updatedRoute = await transportCollection.findOne({ _id: new ObjectId(routeId) });
    
    return res.status(200).json({
      success: true,
      data: sanitizeRouteData(updatedRoute, false),
      message: 'Status updated successfully'
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Update status error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update status',
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
      data: sanitizeRouteData(updatedRoute, true)
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
          operationalStatus: 'deleted',
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

// === BULK UPLOAD TRANSPORT ROUTES ===
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
    
    const generateSlug = (routeName, routeNumber, index) => {
      let baseSlug = routeName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      if (routeNumber) {
        baseSlug = `${routeNumber.toLowerCase()}-${baseSlug}`;
      }
      
      return `${baseSlug}-${Date.now()}-${index}`;
    };
    
    const results = {
      inserted: [],
      errors: [],
      duplicates: []
    };
    
    // Process routes one by one
    for (let i = 0; i < routes.length; i++) {
      const routeData = routes[i];
      
      try {
        if (!routeData.routeName || !routeData.operatorName) {
          results.errors.push({
            index: i,
            route: routeData.routeName || 'Unknown',
            error: 'Missing required fields: routeName and operatorName'
          });
          continue;
        }
        
        const slug = generateSlug(routeData.routeName, routeData.routeNumber, i);
        
        const newRoute = {
          _id: new ObjectId(),
          routeName: routeData.routeName,
          routeNumber: routeData.routeNumber || '',
          slug: slug,
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
            departureTimes: routeData.schedule?.departureTimes || ['06:00', '12:00', '18:00']
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
          
          operationalStatus: routeData.status || 'active',
          status: routeData.status || 'active',
          featured: Boolean(routeData.featured),
          
          verification: {
            status: 'pending',
            verifiedAt: null,
            verifiedBy: null
          },
          
          createdAt: new Date(),
          updatedAt: new Date(),
          __v: 0
        };
        
        const insertResult = await transportCollection.insertOne(newRoute);
        
        results.inserted.push({
          index: i,
          route: routeData.routeName,
          operator: routeData.operatorName,
          id: insertResult.insertedId,
          slug: slug
        });
        
      } catch (routeError) {
        console.error(`[${timestamp}] Error processing route ${i}:`, routeError);
        
        results.errors.push({
          index: i,
          route: routeData.routeName || 'Unknown',
          error: routeError.message
        });
      }
    }
    
    console.log(`[${timestamp}] ✅ Bulk upload complete: ${results.inserted.length} inserted, ${results.errors.length} errors`);
    
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

// === MISSING: /api/transport (FRONTEND COMPATIBILITY) ===
// UPDATE: api/index.js
// Replace your /api/transport endpoint with this complete version

if (path === '/api/transport' && req.method === 'GET') {
  console.log(`[${timestamp}] → API TRANSPORT (frontend compatibility)`);
  
  try {
    const transportCollection = db.collection('transportroutes');
    const { ObjectId } = await import('mongodb');
    
    // Build filter
    let filter = {
      operationalStatus: { $in: ['active', 'seasonal'] }
    };
    
    // FIXED: Add missing providerId filtering (same as main /transport endpoint)
    if (searchParams.get('providerId')) {
      const providerId = searchParams.get('providerId');
      console.log(`[${timestamp}] Filtering API transport routes by provider: ${providerId}`);
      
      if (providerId.length === 24 && /^[0-9a-fA-F]{24}$/.test(providerId)) {
        try {
          const objectId = new ObjectId(providerId);
          filter.$or = [
            { providerId: providerId },
            { providerId: objectId }
          ];
        } catch (e) {
          filter.providerId = providerId;
        }
      } else {
        filter.providerId = providerId;
      }
    }
    
    // Apply search if provided
    if (searchParams.get('search')) {
      const searchTerm = searchParams.get('search');
      const searchConditions = [
        { origin: { $regex: searchTerm, $options: 'i' } },
        { destination: { $regex: searchTerm, $options: 'i' } },
        { title: { $regex: searchTerm, $options: 'i' } },
        { description: { $regex: searchTerm, $options: 'i' } },
        { 'provider.businessName': { $regex: searchTerm, $options: 'i' } }
      ];
      
      if (filter.$or) {
        // Combine providerId and search filters with AND logic
        filter.$and = [
          { $or: filter.$or },
          { $or: searchConditions }
        ];
        delete filter.$or;
      } else {
        filter.$or = searchConditions;
      }
    }
    
    // Apply other filters
    if (searchParams.get('origin')) {
      filter.origin = { $regex: searchParams.get('origin'), $options: 'i' };
    }
    
    if (searchParams.get('destination')) {
      filter.destination = { $regex: searchParams.get('destination'), $options: 'i' };
    }
    
    if (searchParams.get('routeType')) {
      filter.routeType = searchParams.get('routeType');
    }
    
    if (searchParams.get('serviceType')) {
      filter.serviceType = searchParams.get('serviceType');
    }
    
    if (searchParams.get('status') && searchParams.get('status') !== 'all') {
      filter.operationalStatus = searchParams.get('status');
    }
    
    // Pagination
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 10;
    const skip = (page - 1) * limit;
    
    // Sorting
    let sortOptions = { createdAt: -1 };
    const sortBy = searchParams.get('sort');
    if (sortBy) {
      if (sortBy === '-createdAt' || sortBy === 'newest') sortOptions = { createdAt: -1 };
      else if (sortBy === 'createdAt' || sortBy === 'oldest') sortOptions = { createdAt: 1 };
      else if (sortBy === 'fare' || sortBy === 'priceAsc') sortOptions = { 'pricing.baseFare': 1 };
      else if (sortBy === '-fare' || sortBy === 'priceDesc') sortOptions = { 'pricing.baseFare': -1 };
    }
    
    console.log(`[${timestamp}] API Transport routes filter:`, JSON.stringify(filter, null, 2));
    
    // Count total matching routes
    const total = await transportCollection.countDocuments(filter);
    
    // Fetch routes
    const routes = await transportCollection
      .find(filter)
      .skip(skip)
      .limit(limit)
      .sort(sortOptions)
      .toArray();
    
    console.log(`[${timestamp}] Found ${routes.length} API transport routes (filtered by providerId: ${searchParams.get('providerId') || 'none'})`);
    
    // FIXED: Use sanitizeRouteData if available, otherwise simple mapping
    let sanitizedRoutes;
    if (typeof sanitizeRouteData === 'function') {
      sanitizedRoutes = routes.map(route => sanitizeRouteData(route, false));
    } else {
      // Fallback simple sanitization
      sanitizedRoutes = routes.map(route => ({
        _id: String(route._id),
        id: String(route._id),
        title: String(route.title || route.routeName || `${route.origin} to ${route.destination}`),
        origin: String(route.origin || 'Unknown'),
        destination: String(route.destination || 'Unknown'),
        providerId: String(route.providerId),
        provider: route.provider || { businessName: 'Transport Provider' },
        operationalStatus: String(route.operationalStatus || 'active'),
        routeType: String(route.routeType || 'Bus'),
        serviceType: String(route.serviceType || 'Standard'),
        fare: route.fare || route.pricing?.baseFare || 0,
        images: Array.isArray(route.images) ? route.images : [],
        createdAt: route.createdAt,
        updatedAt: route.updatedAt
      }));
    }
    
    const pagination = {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      total: total
    };
    
    console.log(`[${timestamp}] ✅ Returning ${sanitizedRoutes.length} API transport routes`);
    
    return res.status(200).json({
      success: true,
      data: sanitizedRoutes,
      routes: sanitizedRoutes, // Alternative format
      pagination: pagination,
      count: sanitizedRoutes.length,
      total: total,
      message: `Found ${sanitizedRoutes.length} transport routes`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] API Transport routes error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching transport routes',
      error: error.message,
      data: [],
      total: 0
    });
  }
}

// === GENERAL TRANSPORT ENDPOINT (FALLBACK) ===
// UPDATE: api/index.js
// Find the /transport endpoint and add the missing providerId filtering

if (path === '/transport' && req.method === 'GET') {
  console.log(`[${timestamp}] → TRANSPORT ROUTES (general)`);
  
  try {
    const transportCollection = db.collection('transportroutes');
    const { ObjectId } = await import('mongodb');
    
    // Build filter
    let filter = {
      operationalStatus: { $in: ['active', 'seasonal'] }
    };
    
    // FIXED: Add missing providerId filtering
    if (searchParams.get('providerId')) {
      const providerId = searchParams.get('providerId');
      console.log(`[${timestamp}] Filtering transport routes by provider: ${providerId}`);
      
      if (providerId.length === 24 && /^[0-9a-fA-F]{24}$/.test(providerId)) {
        try {
          const objectId = new ObjectId(providerId);
          filter.$or = [
            { providerId: providerId },
            { providerId: objectId }
          ];
        } catch (e) {
          filter.providerId = providerId;
        }
      } else {
        filter.providerId = providerId;
      }
    }
    
    // Apply search if provided
    if (searchParams.get('search')) {
      const searchTerm = searchParams.get('search');
      const searchConditions = [
        { origin: { $regex: searchTerm, $options: 'i' } },
        { destination: { $regex: searchTerm, $options: 'i' } },
        { title: { $regex: searchTerm, $options: 'i' } },
        { description: { $regex: searchTerm, $options: 'i' } },
        { 'provider.businessName': { $regex: searchTerm, $options: 'i' } }
      ];
      
      if (filter.$or) {
        // Combine providerId and search filters with AND logic
        filter.$and = [
          { $or: filter.$or },
          { $or: searchConditions }
        ];
        delete filter.$or;
      } else {
        filter.$or = searchConditions;
      }
    }
    
    // Apply other filters
    if (searchParams.get('origin')) {
      filter.origin = { $regex: searchParams.get('origin'), $options: 'i' };
    }
    
    if (searchParams.get('destination')) {
      filter.destination = { $regex: searchParams.get('destination'), $options: 'i' };
    }
    
    if (searchParams.get('routeType')) {
      filter.routeType = searchParams.get('routeType');
    }
    
    if (searchParams.get('serviceType')) {
      filter.serviceType = searchParams.get('serviceType');
    }
    
    // Pagination
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 10;
    const skip = (page - 1) * limit;
    
    // Sorting
    let sortOptions = { createdAt: -1 };
    const sortBy = searchParams.get('sort');
    if (sortBy) {
      if (sortBy === '-createdAt' || sortBy === 'newest') sortOptions = { createdAt: -1 };
      else if (sortBy === 'createdAt' || sortBy === 'oldest') sortOptions = { createdAt: 1 };
      else if (sortBy === 'fare' || sortBy === 'priceAsc') sortOptions = { 'pricing.baseFare': 1 };
      else if (sortBy === '-fare' || sortBy === 'priceDesc') sortOptions = { 'pricing.baseFare': -1 };
    }
    
    console.log(`[${timestamp}] Transport routes filter:`, JSON.stringify(filter, null, 2));
    
    // Count total matching routes
    const total = await transportCollection.countDocuments(filter);
    
    // Fetch routes
    const routes = await transportCollection
      .find(filter)
      .skip(skip)
      .limit(limit)
      .sort(sortOptions)
      .toArray();
    
    console.log(`[${timestamp}] Found ${routes.length} transport routes (filtered by providerId: ${searchParams.get('providerId') || 'none'})`);
    
    // FIXED: Use sanitizeRouteData if available, otherwise simple mapping
    let sanitizedRoutes;
    if (typeof sanitizeRouteData === 'function') {
      sanitizedRoutes = routes.map(route => sanitizeRouteData(route, false));
    } else {
      // Fallback simple sanitization
      sanitizedRoutes = routes.map(route => ({
        _id: String(route._id),
        id: String(route._id),
        title: String(route.title || route.routeName || `${route.origin} to ${route.destination}`),
        origin: String(route.origin || 'Unknown'),
        destination: String(route.destination || 'Unknown'),
        providerId: String(route.providerId),
        provider: route.provider || { businessName: 'Transport Provider' },
        operationalStatus: String(route.operationalStatus || 'active'),
        routeType: String(route.routeType || 'Bus'),
        serviceType: String(route.serviceType || 'Standard'),
        fare: route.fare || route.pricing?.baseFare || 0,
        images: Array.isArray(route.images) ? route.images : [],
        createdAt: route.createdAt,
        updatedAt: route.updatedAt
      }));
    }
    
    const pagination = {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      total: total
    };
    
    console.log(`[${timestamp}] ✅ Returning ${sanitizedRoutes.length} transport routes`);
    
    return res.status(200).json({
      success: true,
      data: sanitizedRoutes,
      routes: sanitizedRoutes, // Alternative format
      pagination: pagination,
      count: sanitizedRoutes.length,
      total: total,
      message: `Found ${sanitizedRoutes.length} transport routes`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Transport routes error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching transport routes',
      error: error.message,
      data: [],
      total: 0
    });
  }
}

 // ==================== SECTION 10: VIDEOS ENDPOINTS ====================
  // ==================== SECTION 10: VIDEOS ENDPOINTS ====================
   // ==================== SECTION 10: VIDEOS ENDPOINTS ====================
    // ==================== SECTION 10: VIDEOS ENDPOINTS ====================

// ==================== VIDEO ENDPOINTS ====================
// Add these to your index.js file where the other API endpoints are located

// === GET ALL VIDEOS ===
if (path === '/videos' && req.method === 'GET') {
  console.log(`[${timestamp}] → GET VIDEOS`);
  
  try {
    const videosCollection = db.collection('videos');
    
    // Build filter
    let filter = { status: 'published' }; // Only show published videos to public
    
    // Admin can see all videos
    if (req.headers.authorization) {
      try {
        const token = req.headers.authorization.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await db.collection('users').findOne({ _id: new ObjectId(decoded.id) });
        if (user && user.role === 'admin') {
          filter = {}; // Admin sees all videos
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
    
    // Handle subscription tier filter
    if (searchParams.get('subscriptionTier') && searchParams.get('subscriptionTier') !== 'all') {
      filter.subscriptionTier = searchParams.get('subscriptionTier');
    }
    
    // Handle search filter
    if (searchParams.get('search')) {
      const searchRegex = { $regex: searchParams.get('search'), $options: 'i' };
      filter.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { tags: { $in: [searchRegex] } }
      ];
    }
    
    // Handle pagination
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 10;
    const skip = (page - 1) * limit;
    
    // Handle sorting
    let sort = { publishDate: -1, createdAt: -1 };
    const sortParam = searchParams.get('sort');
    if (sortParam) {
      switch (sortParam) {
        case 'newest':
          sort = { createdAt: -1 };
          break;
        case 'oldest':
          sort = { createdAt: 1 };
          break;
        case 'popular':
          sort = { 'metadata.views': -1 };
          break;
        case 'featured':
          sort = { featured: -1, publishDate: -1 };
          break;
      }
    }
    
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
      videos: videos, // Some components expect this property
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        total: total
      },
      total: total,
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
    } else if (contentType.includes('multipart/form-data')) {
      // Handle multipart form data for file uploads
      const formData = new FormData();
      // This is a simplified version - you might need a proper multipart parser
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
    
    const createdVideo = { ...newVideo, _id: result.insertedId };
    
    console.log(`[${timestamp}] ✅ Video created: ${videoData.title} (ID: ${result.insertedId})`);
    
    return res.status(201).json({
      success: true,
      data: createdVideo,
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

// === UPDATE VIDEO (ADMIN ONLY) ===
if (path.match(/^\/videos\/([a-f\d]{24})$/) && req.method === 'PUT') {
  const videoId = path.split('/')[2];
  console.log(`[${timestamp}] → UPDATE VIDEO: ${videoId}`);
  
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
    
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const updateData = JSON.parse(Buffer.concat(chunks).toString());
    
    // Extract YouTube video ID if URL changed
    if (updateData.youtubeUrl && !updateData.youtubeVideoId) {
      const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
      const match = updateData.youtubeUrl.match(regExp);
      
      if (match && match[2].length === 11) {
        updateData.youtubeVideoId = match[2];
        
        // Update thumbnail if not explicitly provided
        if (!updateData.thumbnail?.url) {
          updateData.thumbnail = {
            url: `https://img.youtube.com/vi/${match[2]}/maxresdefault.jpg`,
            size: 0,
            mimetype: 'image/jpeg'
          };
        }
      }
    }
    
    updateData.updatedAt = new Date();
    
    const videosCollection = db.collection('videos');
    const result = await videosCollection.findOneAndUpdate(
      { _id: new ObjectId(videoId) },
      { $set: updateData },
      { returnDocument: 'after' }
    );
    
    if (!result.value) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: result.value,
      message: 'Video updated successfully'
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Update video error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update video',
      error: error.message
    });
  }
}

// === DELETE VIDEO (ADMIN ONLY) ===
if (path.match(/^\/videos\/([a-f\d]{24})$/) && req.method === 'DELETE') {
  const videoId = path.split('/')[2];
  console.log(`[${timestamp}] → DELETE VIDEO: ${videoId}`);
  
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
    
    const videosCollection = db.collection('videos');
    const video = await videosCollection.findOne({ _id: new ObjectId(videoId) });
    
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }
    
    // TODO: Delete custom thumbnail from S3 if it exists
    // if (video.thumbnail?.key) {
    //   await deleteFromS3(video.thumbnail.key);
    // }
    
    await videosCollection.deleteOne({ _id: new ObjectId(videoId) });
    
    return res.status(200).json({
      success: true,
      data: {},
      message: 'Video deleted successfully'
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Delete video error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete video',
      error: error.message
    });
  }
}

// === GET FEATURED VIDEOS ===
if (path === '/videos/featured' && req.method === 'GET') {
  console.log(`[${timestamp}] → GET FEATURED VIDEOS`);
  
  try {
    const limit = parseInt(searchParams.get('limit')) || 4;
    const videosCollection = db.collection('videos');
    
    const videos = await videosCollection
      .find({
        featured: true,
        status: 'published'
      })
      .sort({ publishDate: -1 })
      .limit(limit)
      .toArray();
    
    return res.status(200).json({
      success: true,
      count: videos.length,
      data: videos
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Get featured videos error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch featured videos',
      error: error.message
    });
  }
}

// === GET VIDEOS BY CATEGORY ===
if (path.match(/^\/videos\/category\/(.+)$/) && req.method === 'GET') {
  const category = path.split('/')[3];
  console.log(`[${timestamp}] → GET VIDEOS BY CATEGORY: ${category}`);
  
  try {
    const limit = parseInt(searchParams.get('limit')) || 10;
    const videosCollection = db.collection('videos');
    
    const videos = await videosCollection
      .find({
        category: category,
        status: 'published'
      })
      .sort({ publishDate: -1 })
      .limit(limit)
      .toArray();
    
    return res.status(200).json({
      success: true,
      count: videos.length,
      data: videos
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Get videos by category error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch videos by category',
      error: error.message
    });
  }
}

// === TOGGLE FEATURED STATUS (ADMIN ONLY) ===
if (path.match(/^\/videos\/([a-f\d]{24})\/featured$/) && req.method === 'PATCH') {
  const videoId = path.split('/')[2];
  console.log(`[${timestamp}] → TOGGLE FEATURED: ${videoId}`);
  
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
    
    const videosCollection = db.collection('videos');
    const video = await videosCollection.findOne({ _id: new ObjectId(videoId) });
    
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }
    
    const newFeaturedStatus = !video.featured;
    
    const result = await videosCollection.findOneAndUpdate(
      { _id: new ObjectId(videoId) },
      { 
        $set: { 
          featured: newFeaturedStatus,
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    );
    
    return res.status(200).json({
      success: true,
      data: result.value,
      message: `Video ${newFeaturedStatus ? 'featured' : 'unfeatured'} successfully`
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Toggle featured error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to toggle featured status',
      error: error.message
    });
  }
}

// ==================== ADDITIONAL MISSING ENDPOINTS ====================
// Add these additional endpoints to your index.js file

// === GET DEALER VIDEOS ===
if (path.match(/^\/videos\/dealer\/([a-f\d]{24})$/) && req.method === 'GET') {
  const dealerId = path.split('/')[3];
  console.log(`[${timestamp}] → GET DEALER VIDEOS: ${dealerId}`);
  
  try {
    const limit = parseInt(searchParams.get('limit')) || 10;
    const videosCollection = db.collection('videos');
    
    const videos = await videosCollection
      .find({
        relatedDealerId: dealerId,
        status: 'published'
      })
      .sort({ publishDate: -1 })
      .limit(limit)
      .toArray();
    
    return res.status(200).json({
      success: true,
      count: videos.length,
      data: videos
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Get dealer videos error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch dealer videos',
      error: error.message
    });
  }
}

// === GET LISTING VIDEOS ===
if (path.match(/^\/videos\/listing\/([a-f\d]{24})$/) && req.method === 'GET') {
  const listingId = path.split('/')[3];
  console.log(`[${timestamp}] → GET LISTING VIDEOS: ${listingId}`);
  
  try {
    const limit = parseInt(searchParams.get('limit')) || 10;
    const videosCollection = db.collection('videos');
    
    const videos = await videosCollection
      .find({
        relatedListingId: listingId,
        status: 'published'
      })
      .sort({ publishDate: -1 })
      .limit(limit)
      .toArray();
    
    return res.status(200).json({
      success: true,
      count: videos.length,
      data: videos
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Get listing videos error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch listing videos',
      error: error.message
    });
  }
}

// === LIKE VIDEO ===
if (path.match(/^\/videos\/([a-f\d]{24})\/like$/) && req.method === 'PUT') {
  const videoId = path.split('/')[2];
  console.log(`[${timestamp}] → LIKE VIDEO: ${videoId}`);
  
  try {
    // Check authentication (optional for likes, but recommended)
    let userId = null;
    if (req.headers.authorization) {
      try {
        const token = req.headers.authorization.replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id;
      } catch (e) {
        // Continue without user ID if token invalid
      }
    }
    
    const videosCollection = db.collection('videos');
    const video = await videosCollection.findOne({ _id: new ObjectId(videoId) });
    
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }
    
    // Increment like count
    const result = await videosCollection.findOneAndUpdate(
      { _id: new ObjectId(videoId) },
      { 
        $inc: { 'metadata.likes': 1 },
        $set: { updatedAt: new Date() }
      },
      { returnDocument: 'after' }
    );
    
    return res.status(200).json({
      success: true,
      data: result.value,
      message: 'Video liked successfully'
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Like video error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to like video',
      error: error.message
    });
  }
}

// === VIDEO ANALYTICS (ADMIN ONLY) ===
if (path.match(/^\/videos\/([a-f\d]{24})\/analytics$/) && req.method === 'GET') {
  const videoId = path.split('/')[2];
  console.log(`[${timestamp}] → GET VIDEO ANALYTICS: ${videoId}`);
  
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
    
    const videosCollection = db.collection('videos');
    const video = await videosCollection.findOne({ _id: new ObjectId(videoId) });
    
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }
    
    // Calculate analytics
    const publishDate = new Date(video.publishDate || video.createdAt);
    const daysSincePublish = Math.max(1, Math.ceil((new Date() - publishDate) / (1000 * 60 * 60 * 24)));
    
    const analytics = {
      views: video.metadata?.views || 0,
      likes: video.metadata?.likes || 0,
      publishDate: publishDate,
      viewsPerDay: (video.metadata?.views || 0) / daysSincePublish,
      engagementRate: video.metadata?.views > 0 ? 
        ((video.metadata?.likes || 0) / video.metadata.views) * 100 : 0
    };
    
    return res.status(200).json({
      success: true,
      data: analytics
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Get video analytics error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch video analytics',
      error: error.message
    });
  }
}

// === UPDATE VIDEO STATUS ===
if (path.match(/^\/videos\/([a-f\d]{24})\/status$/) && req.method === 'PATCH') {
  const videoId = path.split('/')[2];
  console.log(`[${timestamp}] → UPDATE VIDEO STATUS: ${videoId}`);
  
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
    
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const { status } = JSON.parse(Buffer.concat(chunks).toString());
    
    if (!status || !['draft', 'published', 'archived'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid status (draft, published, archived)'
      });
    }
    
    const videosCollection = db.collection('videos');
    const result = await videosCollection.findOneAndUpdate(
      { _id: new ObjectId(videoId) },
      { 
        $set: { 
          status: status,
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    );
    
    if (!result.value) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }
    
    return res.status(200).json({
      success: true,
      data: result.value,
      message: 'Video status updated successfully'
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Update video status error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update video status',
      error: error.message
    });
  }
}



// ==================== SECTION 11: UTILITY ENDPOINTS ====================
// ==================== SECTION 11: UTILITY ENDPOINTS ====================
// ==================== CLEAN ANALYTICS ENDPOINTS - NO MOCK DATA ====================
// Replace the analytics section in your index.js with these clean endpoints



// ==================== MONGODB CONFLICT FIX ====================
// Replace your /analytics/track endpoint with this fixed version

if ((path === '/analytics/track' || path === '/api/analytics/track') && req.method === 'POST') {
  console.log(`[${timestamp}] → ANALYTICS TRACK (Fixed Unique Visitors)`);
  
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
      return res.status(400).json({
        success: false,
        message: 'Invalid JSON in request body'
      });
    }
    
    // Extract tracking data
    const {
      eventType = 'page_view',
      page = '/',
      sessionId = `session-${Date.now()}`,
      userId = null,
      metadata = {}
    } = body;
    
    // Clean up page path
    let cleanPage = page;
    if (typeof page === 'object' || page.includes('[object') || page.includes('Object]')) {
      cleanPage = '/';
    }
    
    // ==================== IMPROVED VISITOR IDENTIFICATION ====================
    
    // Create visitor fingerprint for unique visitor tracking
    const userAgent = req.headers['user-agent'] || 'unknown';
    const clientIP = req.ip || req.connection?.remoteAddress || 'unknown';
    
    // Create a consistent visitor ID based on IP + User Agent
    // This will be the same for the same person across sessions
    const crypto = await import('crypto');
    const visitorFingerprint = crypto.createHash('md5')
      .update(`${clientIP}-${userAgent}`)
      .digest('hex')
      .substring(0, 16);
    
    const visitorId = `visitor_${visitorFingerprint}`;
    
    console.log(`[${timestamp}] Visitor identification:`, {
      sessionId,
      visitorId,
      userId: userId || 'anonymous'
    });
    
    // ==================== SESSION MANAGEMENT ====================
    
    try {
      // Check for existing session
      const existingSession = await db.collection('analyticssessions').findOne({
        sessionId: sessionId
      });
      
      if (existingSession) {
        // Update existing session
        await db.collection('analyticssessions').updateOne(
          { sessionId: sessionId },
          { 
            $set: {
              lastActivity: new Date(),
              isActive: true,
              visitorId: visitorId,  // Add visitor ID to session
              userId: userId
            },
            $inc: { totalPageViews: 1 }
          }
        );
        console.log(`[${timestamp}] ✅ Updated existing session`);
      } else {
        // Create new session
        const newSessionData = {
          sessionId: sessionId,
          visitorId: visitorId,  // Link session to visitor
          userId: userId,
          startTime: new Date(),
          lastActivity: new Date(),
          isActive: true,
          userAgent: userAgent,
          ip: clientIP,
          country: 'Botswana',
          city: 'Gaborone',
          device: {
            type: metadata.deviceType || 'unknown',
            browser: metadata.browser || 'unknown',
            os: metadata.os || 'unknown'
          },
          pages: [cleanPage],
          totalPageViews: 1,
          duration: 0,
          isNewVisitor: true  // Flag for first-time tracking
        };
        
        await db.collection('analyticssessions').insertOne(newSessionData);
        console.log(`[${timestamp}] ✅ Created new session for visitor: ${visitorId}`);
      }
      
    } catch (sessionError) {
      console.error(`[${timestamp}] Session error:`, sessionError.message);
    }
    
    // ==================== VISITOR TRACKING ====================
    
    try {
      // Check if this visitor exists
      const existingVisitor = await db.collection('analyticsvisitors').findOne({
        visitorId: visitorId
      });
      
      if (existingVisitor) {
        // Update existing visitor
        await db.collection('analyticsvisitors').updateOne(
          { visitorId: visitorId },
          { 
            $set: {
              lastSeen: new Date(),
              userId: userId,  // Update if user logs in
              lastUserAgent: userAgent,
              lastIP: clientIP
            },
            $inc: { 
              totalSessions: existingSession ? 0 : 1,  // Only increment for new sessions
              totalPageViews: 1
            }
          }
        );
        console.log(`[${timestamp}] ✅ Updated returning visitor: ${visitorId}`);
      } else {
        // Create new visitor record
        const newVisitorData = {
          visitorId: visitorId,
          userId: userId,
          firstSeen: new Date(),
          lastSeen: new Date(),
          userAgent: userAgent,
          lastUserAgent: userAgent,
          ip: clientIP,
          lastIP: clientIP,
          country: 'Botswana',
          city: 'Gaborone',
          totalSessions: 1,
          totalPageViews: 1,
          isReturning: false
        };
        
        await db.collection('analyticsvisitors').insertOne(newVisitorData);
        console.log(`[${timestamp}] ✅ Created new visitor record: ${visitorId}`);
      }
      
    } catch (visitorError) {
      console.error(`[${timestamp}] Visitor tracking error:`, visitorError.message);
    }
    
    // ==================== PAGE VIEW CREATION ====================
    
    if (eventType === 'page_view' || eventType === 'pageview') {
      try {
        const pageViewData = {
          sessionId: sessionId,
          visitorId: visitorId,  // Link page view to visitor
          userId: userId,
          page: cleanPage,
          title: metadata.title || null,
          timestamp: new Date(),
          userAgent: userAgent,
          ip: clientIP,
          loadTime: metadata.loadTime || null,
          referrer: metadata.referrer || null,
          timeOnPage: metadata.timeOnPage || null,
          exitPage: false,
          bounced: false
        };
        
        await db.collection('analyticspageviews').insertOne(pageViewData);
        console.log(`[${timestamp}] ✅ Page view created for: ${cleanPage}`);
      } catch (pageViewError) {
        console.error(`[${timestamp}] Page view error:`, pageViewError.message);
      }
    }
    
    // ==================== INTERACTION CREATION ====================
    
    try {
      const interactionData = {
        sessionId: sessionId,
        visitorId: visitorId,  // Link interaction to visitor
        userId: userId,
        eventType: eventType,
        category: metadata.category || 'general',
        page: cleanPage,
        timestamp: new Date(),
        metadata: metadata
      };
      
      await db.collection('analyticsinteractions').insertOne(interactionData);
      console.log(`[${timestamp}] ✅ Interaction created: ${eventType}`);
    } catch (interactionError) {
      console.error(`[${timestamp}] Interaction error:`, interactionError.message);
    }
    
    // ==================== SUCCESS RESPONSE ====================
    
    return res.status(200).json({
      success: true,
      message: 'Analytics data tracked successfully',
      timestamp: new Date().toISOString(),
      tracked: {
        eventType,
        page: cleanPage,
        sessionId,
        visitorId,
        userId: userId || 'anonymous'
      }
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Analytics tracking error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Analytics tracking failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
// ==================== TEST ENDPOINT TO MANUALLY CREATE SESSION ====================

if ((path === '/analytics/test-session' || path === '/api/analytics/test-session') && req.method === 'POST') {
  console.log(`[${timestamp}] → TEST SESSION CREATION`);
  
  try {
    const testSessionId = `test-session-${Date.now()}`;
    
    // Create test session
    const sessionData = {
      sessionId: testSessionId,
      startTime: new Date(),
      lastActivity: new Date(),
      isActive: true,
      userAgent: req.headers['user-agent'] || 'test-user-agent',
      ip: req.ip || 'test-ip',
      country: 'Botswana',
      city: 'Gaborone',
      device: {
        type: 'desktop',
        browser: 'Chrome',
        os: 'Windows'
      },
      pages: ['/test'],
      totalPageViews: 1,
      duration: 0
    };
    
    const sessionResult = await db.collection('analyticssessions').insertOne(sessionData);
    console.log(`[${timestamp}] Test session created:`, sessionResult.insertedId);
    
    // Create test page view
    const pageViewData = {
      sessionId: testSessionId,
      page: '/test-page',
      title: 'Test Page',
      timestamp: new Date(),
      userAgent: req.headers['user-agent'] || 'test-user-agent',
      ip: req.ip || 'test-ip',
      loadTime: 1500,
      timeOnPage: 30
    };
    
    const pageViewResult = await db.collection('analyticspageviews').insertOne(pageViewData);
    console.log(`[${timestamp}] Test page view created:`, pageViewResult.insertedId);
    
    // Create test interaction
    const interactionData = {
      sessionId: testSessionId,
      eventType: 'page_view',
      category: 'test',
      page: '/test-page',
      timestamp: new Date(),
      metadata: {
        test: true,
        source: 'manual_test'
      }
    };
    
    const interactionResult = await db.collection('analyticsinteractions').insertOne(interactionData);
    console.log(`[${timestamp}] Test interaction created:`, interactionResult.insertedId);
    
    return res.status(200).json({
      success: true,
      message: 'Test session created successfully',
      testData: {
        sessionId: testSessionId,
        sessionInsertedId: sessionResult.insertedId,
        pageViewInsertedId: pageViewResult.insertedId,
        interactionInsertedId: interactionResult.insertedId
      }
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Test session creation error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Test session creation failed',
      error: error.message
    });
  }
}

// PERFORMANCE TRACKING ENDPOINT (this is what's missing!)
if ((path === '/analytics/track/performance' || path === '/api/analytics/track/performance') && req.method === 'POST') {
  console.log(`[${timestamp}] → ANALYTICS PERFORMANCE TRACKING`);
  
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
      console.warn(`[${timestamp}] Performance tracking parsing warning:`, parseError.message);
      return res.status(400).json({
        success: false,
        message: 'Invalid JSON in request body'
      });
    }
    
    console.log(`[${timestamp}] Performance data received:`, body);
    
    const {
      sessionId = `session-${Date.now()}`,
      page = '/',
      metrics = {},
      timestamp: eventTimestamp = new Date().toISOString()
    } = body;
    
    // Clean page path
    let cleanPage = typeof page === 'string' ? page : '/';
    
    // Create performance metric record
    const performanceData = {
      sessionId: sessionId,
      page: cleanPage,
      timestamp: new Date(eventTimestamp),
      loadTime: metrics.loadTime || null,
      metrics: {
        // Core Web Vitals
        firstContentfulPaint: metrics.fcp || metrics.firstContentfulPaint || null,
        largestContentfulPaint: metrics.lcp || metrics.largestContentfulPaint || null,
        firstInputDelay: metrics.fid || metrics.firstInputDelay || null,
        cumulativeLayoutShift: metrics.cls || metrics.cumulativeLayoutShift || null,
        
        // Loading metrics
        loadTime: metrics.loadTime || null,
        domContentLoaded: metrics.domContentLoaded || null,
        timeToFirstByte: metrics.ttfb || metrics.timeToFirstByte || null,
        
        // Custom metrics
        timeToInteractive: metrics.tti || metrics.timeToInteractive || null,
        speedIndex: metrics.speedIndex || null
      },
      connection: {
        effectiveType: metrics.connectionType || null,
        downlink: metrics.downlink || null,
        rtt: metrics.rtt || null
      },
      device: {
        type: metrics.deviceType || 'unknown',
        memory: metrics.deviceMemory || null,
        hardwareConcurrency: metrics.hardwareConcurrency || null
      }
    };
    
    // Insert into performance metrics collection
    await db.collection('analyticsperformancemetrics').insertOne(performanceData);
    console.log(`[${timestamp}] Performance metrics saved for: ${cleanPage}`);
    
    // Also create an interaction record
    const interactionData = {
      sessionId: sessionId,
      userId: null,
      eventType: 'performance_measurement',
      category: 'performance',
      page: cleanPage,
      timestamp: new Date(eventTimestamp),
      metadata: {
        loadTime: metrics.loadTime,
        fcp: metrics.fcp,
        lcp: metrics.lcp,
        source: 'performance_observer'
      }
    };
    
    await db.collection('analyticsinteractions').insertOne(interactionData);
    
    return res.status(200).json({
      success: true,
      message: 'Performance metrics tracked successfully',
      timestamp: new Date().toISOString(),
      tracked: {
        page: cleanPage,
        sessionId: sessionId,
        metricsCount: Object.keys(performanceData.metrics).filter(key => 
          performanceData.metrics[key] !== null
        ).length
      }
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Performance tracking error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Performance tracking failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// GENERIC TRACK ENDPOINT (catches other tracking paths)
if (path.startsWith('/track/') && req.method === 'POST') {
  console.log(`[${timestamp}] → GENERIC TRACKING: ${path}`);
  
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
      console.warn(`[${timestamp}] Generic tracking parsing warning:`, parseError.message);
    }
    
    // Extract event type from path
    const eventType = path.replace('/track/', '');
    
    console.log(`[${timestamp}] Generic tracking for event: ${eventType}`, body);
    
    const {
      sessionId = `session-${Date.now()}`,
      page = '/',
      metadata = {}
    } = body;
    
    // Clean page path
    let cleanPage = typeof page === 'string' ? page : '/';
    
    // Create interaction record
    const interactionData = {
      sessionId: sessionId,
      userId: body.userId || null,
      eventType: eventType,
      category: 'tracking',
      page: cleanPage,
      timestamp: new Date(),
      metadata: {
        ...metadata,
        originalPath: path,
        source: 'generic_tracker'
      }
    };
    
    await db.collection('analyticsinteractions').insertOne(interactionData);
    console.log(`[${timestamp}] Generic event tracked: ${eventType}`);
    
    return res.status(200).json({
      success: true,
      message: `Event '${eventType}' tracked successfully`,
      timestamp: new Date().toISOString(),
      tracked: {
        eventType,
        page: cleanPage,
        sessionId
      }
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Generic tracking error:`, error);
    return res.status(200).json({
      success: true,
      message: 'Tracking attempted with warnings',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// API ANALYTICS TRACK ENDPOINTS (handles /api/analytics/track/*)
if (path.startsWith('/api/analytics/track/') && req.method === 'POST') {
  console.log(`[${timestamp}] → API ANALYTICS TRACKING: ${path}`);
  
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
      console.warn(`[${timestamp}] API analytics parsing warning:`, parseError.message);
    }
    
    // Extract event type from path
    const eventType = path.replace('/api/analytics/track/', '');
    
    console.log(`[${timestamp}] API analytics for event: ${eventType}`, body);
    
    const {
      sessionId = `session-${Date.now()}`,
      page = '/',
      metadata = {}
    } = body;
    
    // Clean page path
    let cleanPage = typeof page === 'string' ? page : '/';
    
    // Handle specific event types
    if (eventType === 'performance') {
      // Redirect to performance endpoint logic
      const performanceData = {
        sessionId: sessionId,
        page: cleanPage,
        timestamp: new Date(),
        loadTime: metadata.loadTime || null,
        metrics: metadata.metrics || {}
      };
      
      await db.collection('analyticsperformancemetrics').insertOne(performanceData);
    }
    
    // Create interaction record
    const interactionData = {
      sessionId: sessionId,
      userId: body.userId || null,
      eventType: eventType,
      category: 'api_tracking',
      page: cleanPage,
      timestamp: new Date(),
      metadata: {
        ...metadata,
        originalPath: path,
        source: 'api_tracker'
      }
    };
    
    await db.collection('analyticsinteractions').insertOne(interactionData);
    console.log(`[${timestamp}] API event tracked: ${eventType}`);
    
    return res.status(200).json({
      success: true,
      message: `API event '${eventType}' tracked successfully`,
      timestamp: new Date().toISOString(),
      tracked: {
        eventType,
        page: cleanPage,
        sessionId
      }
    });
    
  } catch (error) {
    console.error(`[${timestamp}] API tracking error:`, error);
    return res.status(200).json({
      success: true,
      message: 'API tracking attempted with warnings',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}

// ==================== COMPLETE ANALYTICS ENDPOINTS - PART 1 ====================
// Add these to your analytics section for complete analytics functionality

// REAL DASHBOARD DATA - Direct Collection Queries
if ((path === '/analytics/dashboard' || path === '/api/analytics/dashboard') && req.method === 'GET') {
  console.log(`[${timestamp}] → ANALYTICS DASHBOARD (Fixed Unique Visitors)`);
  
  try {
    const days = parseInt(req.query?.days) || 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const endDate = new Date();
    
    // Get real counts from your collections
    const [carListings, serviceProviders, dealers] = await Promise.all([
      db.collection('listings').countDocuments({ 
        status: { $ne: 'deleted' },
        createdAt: { $gte: startDate }
      }).catch(() => 0),
      db.collection('serviceproviders').countDocuments({ 
        status: { $in: ['active', 'inactive', 'suspended'] },
        createdAt: { $gte: startDate }
      }).catch(() => 0),
      db.collection('dealers').countDocuments({ 
        status: { $ne: 'deleted' },
        createdAt: { $gte: startDate }
      }).catch(() => 0)
    ]);

    console.log(`[${timestamp}] Basic collection counts:`, { carListings, serviceProviders, dealers });

    // ==================== CORRECTED ANALYTICS QUERIES ====================
    
    const [
      totalSessions,
      uniqueVisitors,
      totalPageViews,
      avgSessionData,
      businessConversions,
      topPagesData
    ] = await Promise.all([
      // Total sessions in period
      db.collection('analyticssessions').countDocuments({ 
        startTime: { $gte: startDate, $lte: endDate } 
      }).catch(() => 0),
      
      // FIXED: Unique visitors from visitor collection or distinct visitor IDs
      db.collection('analyticsvisitors').countDocuments({ 
        lastSeen: { $gte: startDate, $lte: endDate } 
      }).catch(async () => {
        // Fallback: count distinct visitor IDs from sessions
        try {
          const distinctVisitors = await db.collection('analyticssessions').distinct('visitorId', { 
            startTime: { $gte: startDate, $lte: endDate } 
          });
          return distinctVisitors.length;
        } catch {
          // Final fallback: distinct IP addresses (less accurate but better than session count)
          try {
            const distinctIPs = await db.collection('analyticssessions').distinct('ip', { 
              startTime: { $gte: startDate, $lte: endDate } 
            });
            return distinctIPs.length;
          } catch {
            return 0;
          }
        }
      }),
      
      // Total page views
      db.collection('analyticspageviews').countDocuments({ 
        timestamp: { $gte: startDate, $lte: endDate } 
      }).catch(() => 0),
      
      // Average session duration
      db.collection('analyticssessions').aggregate([
        { $match: { startTime: { $gte: startDate, $lte: endDate }, duration: { $gt: 0 } } },
        { $group: { _id: null, avgDuration: { $avg: '$duration' } } }
      ]).toArray().catch(() => []),
      
      // Business conversions
      db.collection('analyticsbusinessevents').aggregate([
        { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
        { 
          $group: {
            _id: '$eventType',
            count: { $sum: 1 },
            totalValue: { $sum: '$conversionValue' }
          }
        }
      ]).toArray().catch(() => []),
      
      // Top pages
      db.collection('analyticspageviews').aggregate([
        { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
        { 
          $group: {
            _id: '$page',
            views: { $sum: 1 },
            uniqueVisitors: { $addToSet: '$visitorId' }  // Use visitor ID instead of session ID
          }
        },
        {
          $project: {
            page: '$_id',
            views: 1,
            uniqueVisitors: { $size: '$uniqueVisitors' }
          }
        },
        { $sort: { views: -1 } },
        { $limit: 10 }
      ]).toArray().catch(() => [])
    ]);

    console.log(`[${timestamp}] Analytics query results:`, {
      sessions: totalSessions,
      visitors: uniqueVisitors,
      pageViews: totalPageViews,
      avgSessionResults: avgSessionData.length,
      conversions: businessConversions.length,
      topPages: topPagesData.length
    });

    // Calculate trends (compare with previous period)
    const previousStartDate = new Date(startDate.getTime() - (days * 24 * 60 * 60 * 1000));
    
    const [prevSessions, prevPageViews, prevVisitors] = await Promise.all([
      db.collection('analyticssessions').countDocuments({ 
        startTime: { $gte: previousStartDate, $lt: startDate } 
      }).catch(() => 0),
      db.collection('analyticspageviews').countDocuments({ 
        timestamp: { $gte: previousStartDate, $lt: startDate } 
      }).catch(() => 0),
      // FIXED: Previous unique visitors calculation
      db.collection('analyticsvisitors').countDocuments({ 
        lastSeen: { $gte: previousStartDate, $lt: startDate } 
      }).catch(() => 0)
    ]);

    console.log(`[${timestamp}] Previous period data:`, { prevSessions, prevPageViews, prevVisitors });

    // Calculate trends
    const sessionsTrend = prevSessions > 0 ? 
      ((totalSessions - prevSessions) / prevSessions * 100).toFixed(1) : 
      (totalSessions > 0 ? "100" : "0");
    const pageViewsTrend = prevPageViews > 0 ? 
      ((totalPageViews - prevPageViews) / prevPageViews * 100).toFixed(1) : 
      (totalPageViews > 0 ? "100" : "0");
    const visitorsTrend = prevVisitors > 0 ? 
      ((uniqueVisitors - prevVisitors) / prevVisitors * 100).toFixed(1) : 
      (uniqueVisitors > 0 ? "100" : "0");

    // Format average session duration
    const avgDuration = avgSessionData.length > 0 ? avgSessionData[0].avgDuration : 0;
    const avgDurationFormatted = formatDuration(avgDuration);

    // Process business conversions
    const conversions = {
      dealerContacts: businessConversions.find(c => c._id === 'dealer_contact')?.count || 0,
      phoneCallClicks: businessConversions.find(c => c._id === 'phone_call')?.count || 0,
      listingInquiries: businessConversions.find(c => c._id === 'listing_view')?.count || 0,
      conversionRate: totalSessions > 0 ? 
        ((businessConversions.reduce((sum, c) => sum + c.count, 0) / totalSessions) * 100).toFixed(1) : "0"
    };

    // Calculate bounce rate (single page sessions)
    let bounceRate = "0%";
    try {
      const singlePageSessions = await db.collection('analyticssessions').countDocuments({
        startTime: { $gte: startDate, $lte: endDate },
        totalPageViews: { $lte: 1 }
      });
      
      if (totalSessions > 0) {
        bounceRate = ((singlePageSessions / totalSessions) * 100).toFixed(1) + "%";
      }
    } catch (bounceError) {
      console.warn('Bounce rate calculation error:', bounceError.message);
    }

    const analyticsData = {
      overview: {
        uniqueVisitors: { 
          value: uniqueVisitors, 
          trend: `${parseFloat(visitorsTrend) > 0 ? '+' : ''}${visitorsTrend}%` 
        },
        pageViews: { 
          value: totalPageViews, 
          trend: `${parseFloat(pageViewsTrend) > 0 ? '+' : ''}${pageViewsTrend}%` 
        },
        sessions: { 
          value: totalSessions, 
          trend: `${parseFloat(sessionsTrend) > 0 ? '+' : ''}${sessionsTrend}%` 
        },
        avgSessionDuration: { 
          value: avgDurationFormatted, 
          trend: "0%"
        },
        bounceRate: { 
          value: bounceRate, 
          trend: "0%" 
        }
      },
      conversions: {
        dealerContacts: { value: conversions.dealerContacts, trend: "0%" },
        phoneCallClicks: { value: conversions.phoneCallClicks, trend: "0%" },
        listingInquiries: { value: conversions.listingInquiries, trend: "0%" },
        conversionRate: { value: `${conversions.conversionRate}%`, trend: "0%" }
      },
      topPages: topPagesData || []
    };

    console.log(`[${timestamp}] Final analytics data:`, analyticsData);

    return res.status(200).json({
      success: true,
      data: analyticsData,
      message: 'Analytics dashboard data retrieved successfully',
      period: `${days} days`,
      dataSource: 'Real analytics database (direct queries)',
      summary: {
        totalListings: carListings,
        totalServiceProviders: serviceProviders,
        totalDealers: dealers,
        totalSessions: totalSessions,
        totalPageViews: totalPageViews,
        totalUniqueVisitors: uniqueVisitors
      }
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Dashboard error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching dashboard data',
      error: error.message
    });
  }
}

// Helper function to format duration in seconds to MM:SS
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}


  // REAL TRAFFIC DATA - Direct Collection Queries
  if ((path === '/analytics/traffic' || path === '/api/analytics/traffic') && req.method === 'GET') {
    console.log(`[${timestamp}] → ANALYTICS TRAFFIC (Direct DB Queries)`);
    
    try {
      const days = parseInt(req.query?.days) || 30;
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const endDate = new Date();
      
      console.log(`[${timestamp}] Traffic query for period: ${startDate.toISOString()} to ${endDate.toISOString()}`);
      
      const [
        trafficOverTimeData,
        deviceBreakdownData,
        geographicData
      ] = await Promise.all([
        // Traffic over time (daily aggregation)
        db.collection('analyticspageviews').aggregate([
          { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
          {
            $group: {
              _id: {
                year: { $year: '$timestamp' },
                month: { $month: '$timestamp' },
                day: { $dayOfMonth: '$timestamp' }
              },
              pageViews: { $sum: 1 },
              sessions: { $addToSet: '$sessionId' },
              visitors: { $addToSet: '$userId' }
            }
          },
          {
            $project: {
              date: {
                $dateFromParts: {
                  year: '$_id.year',
                  month: '$_id.month',
                  day: '$_id.day'
                }
              },
              pageViews: 1,
              sessions: { $size: '$sessions' },
              visitors: { $size: '$visitors' }
            }
          },
          { $sort: { date: 1 } }
        ]).toArray().catch(err => {
          console.warn('Traffic over time error:', err.message);
          return [];
        }),
        
        // Device breakdown from sessions
        db.collection('analyticssessions').aggregate([
          { $match: { startTime: { $gte: startDate, $lte: endDate } } },
          {
            $group: {
              _id: '$device.type',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } }
        ]).toArray().catch(err => {
          console.warn('Device breakdown error:', err.message);
          return [];
        }),
        
        // Geographic data from sessions
        db.collection('analyticssessions').aggregate([
          { 
            $match: { 
              startTime: { $gte: startDate, $lte: endDate },
              country: { $ne: 'Unknown', $exists: true, $ne: null, $ne: '' }
            } 
          },
          {
            $group: {
              _id: { country: '$country', city: '$city' },
              uniqueVisitors: { $sum: 1 },
              sessions: { $sum: 1 }
            }
          },
          {
            $project: {
              country: '$_id.country',
              city: '$_id.city',
              uniqueVisitors: 1,
              pageViews: '$sessions' // Approximate page views from sessions
            }
          },
          { $sort: { uniqueVisitors: -1 } },
          { $limit: 10 }
        ]).toArray().catch(err => {
          console.warn('Geographic data error:', err.message);
          return [];
        })
      ]);

      console.log(`[${timestamp}] Traffic query results:`, {
        trafficDays: trafficOverTimeData.length,
        devices: deviceBreakdownData.length,
        countries: geographicData.length
      });

      // Process traffic over time - fill in missing days with zeros
      const trafficOverTime = [];
      const startDateObj = new Date(startDate);
      
      for (let i = 0; i < days; i++) {
        const currentDate = new Date(startDateObj);
        currentDate.setDate(startDateObj.getDate() + i);
        const dateString = currentDate.toISOString().split('T')[0];
        
        const dayData = trafficOverTimeData.find(item => 
          item.date.toISOString().split('T')[0] === dateString
        );
        
        trafficOverTime.push({
          date: dateString,
          visitors: dayData?.visitors || 0,
          pageViews: dayData?.pageViews || 0,
          sessions: dayData?.sessions || 0
        });
      }

      // Process device breakdown
      const deviceBreakdown = {};
      const totalDevices = deviceBreakdownData.reduce((sum, item) => sum + item.count, 0);
      
      if (totalDevices > 0) {
        deviceBreakdownData.forEach(item => {
          const deviceType = item._id || 'unknown';
          const percentage = Math.round((item.count / totalDevices) * 100);
          deviceBreakdown[deviceType] = percentage;
        });
      }

      const trafficData = {
        trafficOverTime,
        deviceBreakdown,
        geographicData
      };

      return res.status(200).json({
        success: true,
        data: trafficData,
        message: 'Traffic data retrieved successfully',
        period: `${days} days`,
        dataSource: 'Real analytics database (direct queries)',
        summary: {
          totalDays: trafficOverTime.length,
          daysWithData: trafficOverTime.filter(day => day.pageViews > 0).length,
          totalDeviceTypes: Object.keys(deviceBreakdown).length,
          totalCountries: geographicData.length
        }
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Traffic error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching traffic data',
        error: error.message
      });
    }
  }

  // REAL CONTENT DATA - Direct Collection Queries
  if ((path === '/analytics/content' || path === '/api/analytics/content') && req.method === 'GET') {
    console.log(`[${timestamp}] → ANALYTICS CONTENT (Direct DB Queries)`);
    
    try {
      const days = parseInt(req.query?.days) || 30;
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const endDate = new Date();
      
      const [
        popularPagesData,
        searchAnalyticsData,
        contentEngagementData,
        exitPagesData
      ] = await Promise.all([
        // Popular pages with engagement metrics
        db.collection('analyticspageviews').aggregate([
          { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
          {
            $group: {
              _id: '$page',
              views: { $sum: 1 },
              uniqueVisitors: { $addToSet: '$sessionId' },
              avgTimeOnPage: { $avg: '$timeOnPage' },
              totalLoadTime: { $sum: '$loadTime' },
              loadTimeCount: { $sum: { $cond: [{ $gt: ['$loadTime', 0] }, 1, 0] } }
            }
          },
          {
            $project: {
              page: '$_id',
              title: {
                $switch: {
                  branches: [
                    { case: { $eq: ['$_id', '/'] }, then: 'Home' },
                    { case: { $eq: ['$_id', '/marketplace'] }, then: 'Car Marketplace' },
                    { case: { $eq: ['$_id', '/services'] }, then: 'Car Services' },
                    { case: { $eq: ['$_id', '/news'] }, then: 'Car News' },
                    { case: { $eq: ['$_id', '/dealers'] }, then: 'Dealers' },
                    { case: { $eq: ['$_id', '/about'] }, then: 'About Us' },
                    { case: { $eq: ['$_id', '/contact'] }, then: 'Contact' },
                    { case: { $regexMatch: { input: '$_id', regex: '/listing/' } }, then: 'Car Listing' },
                    { case: { $regexMatch: { input: '$_id', regex: '/dealer/' } }, then: 'Dealer Profile' }
                  ],
                  default: { 
                    $cond: [
                      { $eq: ['$_id', '/[object%20Object]'] },
                      'Unknown Page',
                      { $substr: ['$_id', 1, 50] }
                    ]
                  }
                }
              },
              views: 1,
              uniqueVisitors: { $size: '$uniqueVisitors' },
              avgTimeOnPage: {
                $cond: [
                  { $gt: ['$avgTimeOnPage', 0] },
                  {
                    $concat: [
                      { $toString: { $floor: { $divide: ['$avgTimeOnPage', 60] } } },
                      ':',
                      {
                        $let: {
                          vars: {
                            seconds: { $floor: { $mod: ['$avgTimeOnPage', 60] } }
                          },
                          in: {
                            $cond: [
                              { $lt: ['$$seconds', 10] },
                              { $concat: ['0', { $toString: '$$seconds' }] },
                              { $toString: '$$seconds' }
                            ]
                          }
                        }
                      }
                    ]
                  },
                  '0:00'
                ]
              },
              avgLoadTime: {
                $cond: [
                  { $gt: ['$loadTimeCount', 0] },
                  { $round: [{ $divide: ['$totalLoadTime', '$loadTimeCount'] }, 0] },
                  null
                ]
              }
            }
          },
          { $sort: { views: -1 } },
          { $limit: 15 }
        ]).toArray().catch(err => {
          console.warn('Popular pages error:', err.message);
          return [];
        }),
        
        // Search analytics from interactions
        db.collection('analyticsinteractions').aggregate([
          {
            $match: {
              eventType: { $in: ['search', 'site_search'] },
              timestamp: { $gte: startDate, $lte: endDate },
              'metadata.query': { $exists: true, $ne: '', $ne: null }
            }
          },
          {
            $group: {
              _id: '$metadata.query',
              searches: { $sum: 1 },
              avgResults: { $avg: '$metadata.resultsCount' },
              successRate: {
                $avg: {
                  $cond: [
                    { $gt: ['$metadata.resultsCount', 0] },
                    100,
                    0
                  ]
                }
              }
            }
          },
          {
            $project: {
              query: '$_id',
              searches: 1,
              avgResultsCount: { $round: ['$avgResults', 0] },
              successRate: { $round: ['$successRate', 1] }
            }
          },
          { $sort: { searches: -1 } },
          { $limit: 10 }
        ]).toArray().catch(err => {
          console.warn('Search analytics error:', err.message);
          return [];
        }),
        
        // Content engagement from interactions
        db.collection('analyticsinteractions').aggregate([
          {
            $match: {
              timestamp: { $gte: startDate, $lte: endDate },
              eventType: { $in: ['listing_view', 'news_read', 'dealer_contact', 'listing_favorite', 'phone_call', 'email_click'] }
            }
          },
          {
            $group: {
              _id: '$eventType',
              count: { $sum: 1 },
              uniqueUsers: { $addToSet: '$sessionId' },
              pages: { $addToSet: '$page' }
            }
          },
          {
            $project: {
              eventType: '$_id',
              count: 1,
              uniqueUsers: { $size: '$uniqueUsers' },
              pagesAffected: { $size: '$pages' }
            }
          },
          { $sort: { count: -1 } }
        ]).toArray().catch(err => {
          console.warn('Content engagement error:', err.message);
          return [];
        }),

        // Exit pages (pages where sessions end)
        db.collection('analyticspageviews').aggregate([
          { 
            $match: { 
              timestamp: { $gte: startDate, $lte: endDate },
              exitPage: true
            } 
          },
          {
            $group: {
              _id: '$page',
              exits: { $sum: 1 }
            }
          },
          {
            $project: {
              page: '$_id',
              exits: 1
            }
          },
          { $sort: { exits: -1 } },
          { $limit: 10 }
        ]).toArray().catch(err => {
          console.warn('Exit pages error:', err.message);
          return [];
        })
      ]);

      console.log(`[${timestamp}] Content query results:`, {
        popularPages: popularPagesData.length,
        searches: searchAnalyticsData.length,
        engagements: contentEngagementData.length,
        exitPages: exitPagesData.length
      });

      const contentData = {
        popularPages: popularPagesData,
        searchAnalytics: searchAnalyticsData,
        engagement: {
          totalInteractions: contentEngagementData.reduce((sum, item) => sum + item.count, 0),
          breakdown: contentEngagementData,
          topEngagementTypes: contentEngagementData.slice(0, 5)
        },
        exitPages: exitPagesData,
        contentHealth: {
          totalPages: popularPagesData.length,
          pagesWithGoodEngagement: popularPagesData.filter(page => page.views > 5).length,
          averageTimeOnPage: popularPagesData.length > 0 ? 
            popularPagesData.reduce((sum, page) => {
              const timeStr = page.avgTimeOnPage || '0:00';
              const [minutes, seconds] = timeStr.split(':').map(Number);
              return sum + (minutes * 60 + seconds);
            }, 0) / popularPagesData.length : 0
        }
      };

      return res.status(200).json({
        success: true,
        data: contentData,
        message: 'Content analytics retrieved successfully',
        period: `${days} days`,
        dataSource: 'Real analytics database (direct queries)',
        summary: {
          totalPopularPages: popularPagesData.length,
          totalSearchQueries: searchAnalyticsData.length,
          totalEngagementEvents: contentEngagementData.reduce((sum, item) => sum + item.count, 0),
          totalExitPages: exitPagesData.length
        }
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Content error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching content analytics',
        error: error.message
      });
    }
  }

  // ==================== COMPLETE ANALYTICS ENDPOINTS - PART 2 ====================
// Add these to your analytics section for complete analytics functionality

  // REAL PERFORMANCE DATA - Direct Collection Queries
  if ((path === '/analytics/performance' || path === '/api/analytics/performance') && req.method === 'GET') {
    console.log(`[${timestamp}] → ANALYTICS PERFORMANCE (Direct DB Queries)`);
    
    try {
      const days = parseInt(req.query?.days) || 7;
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const endDate = new Date();
      
      const [
        pageLoadTimesData,
        performanceOverTimeData,
        slowestPagesData,
        performanceMetricsData
      ] = await Promise.all([
        // Page load times by page from page views
        db.collection('analyticspageviews').aggregate([
          { 
            $match: { 
              timestamp: { $gte: startDate, $lte: endDate },
              loadTime: { $gt: 0 }
            } 
          },
          {
            $group: {
              _id: '$page',
              avgLoadTime: { $avg: '$loadTime' },
              minLoadTime: { $min: '$loadTime' },
              maxLoadTime: { $max: '$loadTime' },
              samples: { $sum: 1 }
            }
          },
          {
            $project: {
              page: '$_id',
              avgLoadTime: { $round: [{ $divide: ['$avgLoadTime', 1000] }, 2] }, // Convert to seconds
              minLoadTime: { $round: [{ $divide: ['$minLoadTime', 1000] }, 2] },
              maxLoadTime: { $round: [{ $divide: ['$maxLoadTime', 1000] }, 2] },
              samples: 1
            }
          },
          { $sort: { avgLoadTime: -1 } },
          { $limit: 10 }
        ]).toArray().catch(err => {
          console.warn('Page load times error:', err.message);
          return [];
        }),
        
        // Performance over time from page views
        db.collection('analyticspageviews').aggregate([
          { 
            $match: { 
              timestamp: { $gte: startDate, $lte: endDate },
              loadTime: { $gt: 0 }
            } 
          },
          {
            $group: {
              _id: {
                year: { $year: '$timestamp' },
                month: { $month: '$timestamp' },
                day: { $dayOfMonth: '$timestamp' }
              },
              avgLoadTime: { $avg: '$loadTime' },
              pageCount: { $sum: 1 }
            }
          },
          {
            $project: {
              date: {
                $dateFromParts: {
                  year: '$_id.year',
                  month: '$_id.month',
                  day: '$_id.day'
                }
              },
              avgLoadTime: { $round: [{ $divide: ['$avgLoadTime', 1000] }, 2] },
              pageCount: 1
            }
          },
          { $sort: { date: 1 } }
        ]).toArray().catch(err => {
          console.warn('Performance over time error:', err.message);
          return [];
        }),
        
        // Slowest pages with issues
        db.collection('analyticspageviews').aggregate([
          { 
            $match: { 
              timestamp: { $gte: startDate, $lte: endDate },
              loadTime: { $gt: 3000 } // Pages slower than 3 seconds
            } 
          },
          {
            $group: {
              _id: '$page',
              avgLoadTime: { $avg: '$loadTime' },
              slowLoads: { $sum: 1 },
              maxLoadTime: { $max: '$loadTime' }
            }
          },
          {
            $project: {
              page: '$_id',
              avgLoadTime: { $round: [{ $divide: ['$avgLoadTime', 1000] }, 2] },
              maxLoadTime: { $round: [{ $divide: ['$maxLoadTime', 1000] }, 2] },
              issuesCount: '$slowLoads'
            }
          },
          { $sort: { avgLoadTime: -1 } },
          { $limit: 5 }
        ]).toArray().catch(err => {
          console.warn('Slowest pages error:', err.message);
          return [];
        }),

        // Performance metrics from dedicated collection if it exists
        db.collection('analyticsperformancemetrics').aggregate([
          { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
          {
            $group: {
              _id: null,
              avgLoadTime: { $avg: '$loadTime' },
              avgLCP: { $avg: '$metrics.largestContentfulPaint' },
              avgFCP: { $avg: '$metrics.firstContentfulPaint' },
              avgFID: { $avg: '$metrics.firstInputDelay' },
              avgCLS: { $avg: '$metrics.cumulativeLayoutShift' },
              count: { $sum: 1 }
            }
          }
        ]).toArray().catch(err => {
          console.warn('Performance metrics error:', err.message);
          return [];
        })
      ]);

      console.log(`[${timestamp}] Performance query results:`, {
        pageLoadTimes: pageLoadTimesData.length,
        performanceDays: performanceOverTimeData.length,
        slowPages: slowestPagesData.length,
        metricsAvailable: performanceMetricsData.length > 0
      });

      // Fill in missing days for performance over time with zeros
      const performanceOverTime = [];
      for (let i = 0; i < days; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        const dateString = currentDate.toISOString().split('T')[0];
        
        const dayData = performanceOverTimeData.find(item => 
          item.date.toISOString().split('T')[0] === dateString
        );
        
        performanceOverTime.push({
          date: dateString,
          avgLoadTime: dayData?.avgLoadTime || 0,
          pageCount: dayData?.pageCount || 0
        });
      }

      // Process Core Web Vitals if available
      let coreWebVitals = {
        LCP: { value: 0, rating: "no-data" },
        FCP: { value: 0, rating: "no-data" },
        FID: { value: 0, rating: "no-data" },
        CLS: { value: 0, rating: "no-data" }
      };

      if (performanceMetricsData.length > 0) {
        const metrics = performanceMetricsData[0];
        
        if (metrics.avgLCP) {
          const lcpSeconds = metrics.avgLCP / 1000;
          coreWebVitals.LCP = {
            value: parseFloat(lcpSeconds.toFixed(2)),
            rating: lcpSeconds < 2.5 ? "good" : lcpSeconds < 4.0 ? "needs-improvement" : "poor"
          };
        }
        
        if (metrics.avgFCP) {
          const fcpSeconds = metrics.avgFCP / 1000;
          coreWebVitals.FCP = {
            value: parseFloat(fcpSeconds.toFixed(2)),
            rating: fcpSeconds < 1.8 ? "good" : fcpSeconds < 3.0 ? "needs-improvement" : "poor"
          };
        }
        
        if (metrics.avgFID) {
          coreWebVitals.FID = {
            value: Math.round(metrics.avgFID),
            rating: metrics.avgFID < 100 ? "good" : metrics.avgFID < 300 ? "needs-improvement" : "poor"
          };
        }
        
        if (metrics.avgCLS) {
          coreWebVitals.CLS = {
            value: parseFloat(metrics.avgCLS.toFixed(3)),
            rating: metrics.avgCLS < 0.1 ? "good" : metrics.avgCLS < 0.25 ? "needs-improvement" : "poor"
          };
        }
      }

      const performanceData = {
        pageLoadTimes: pageLoadTimesData,
        coreWebVitals,
        performanceOverTime,
        slowestPages: slowestPagesData,
        performanceSummary: {
          totalPagesWithLoadTimes: pageLoadTimesData.reduce((sum, page) => sum + page.samples, 0),
          averageLoadTime: pageLoadTimesData.length > 0 ? 
            (pageLoadTimesData.reduce((sum, page) => sum + page.avgLoadTime, 0) / pageLoadTimesData.length).toFixed(2) : 0,
          pagesWithSlowLoads: slowestPagesData.length,
          performanceScore: calculatePerformanceScore(pageLoadTimesData, coreWebVitals)
        }
      };

      return res.status(200).json({
        success: true,
        data: performanceData,
        message: 'Performance data retrieved successfully',
        period: `${days} days`,
        dataSource: 'Real analytics database (direct queries)',
        summary: {
          totalPagesAnalyzed: pageLoadTimesData.length,
          totalLoadTimeSamples: pageLoadTimesData.reduce((sum, page) => sum + page.samples, 0),
          slowestPagesCount: slowestPagesData.length
        }
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Performance error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching performance data',
        error: error.message
      });
    }
  }

  // COMPREHENSIVE ANALYTICS HEALTH CHECK
  if ((path === '/analytics/health' || path === '/api/analytics/health') && req.method === 'GET') {
    console.log(`[${timestamp}] → ANALYTICS HEALTH CHECK (Comprehensive)`);
    
    try {
      const healthData = {
        status: 'unknown',
        timestamp: new Date().toISOString(),
        database: {},
        collections: {},
        recentActivity: {},
        dataQuality: {},
        endpoints: {
          dashboard: 'operational',
          realtime: 'operational',
          traffic: 'operational',
          content: 'operational',
          performance: 'operational',
          health: 'operational'
        }
      };

      if (db) {
        healthData.database.connected = true;
        
        // Check all analytics collections
        const [
          sessionsCount,
          pageViewsCount,
          interactionsCount,
          businessEventsCount,
          performanceMetricsCount,
          dailyMetricsCount,
          recentSessions,
          recentPageViews,
          recentInteractions,
          lastSession,
          lastPageView,
          lastInteraction
        ] = await Promise.all([
          db.collection('analyticssessions').countDocuments().catch(() => 0),
          db.collection('analyticspageviews').countDocuments().catch(() => 0),
          db.collection('analyticsinteractions').countDocuments().catch(() => 0),
          db.collection('analyticsbusinessevents').countDocuments().catch(() => 0),
          db.collection('analyticsperformancemetrics').countDocuments().catch(() => 0),
          db.collection('analyticsdailymetrics').countDocuments().catch(() => 0),
          
          // Recent activity (last 24 hours)
          db.collection('analyticssessions').countDocuments({
            startTime: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
          }).catch(() => 0),
          db.collection('analyticspageviews').countDocuments({
            timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
          }).catch(() => 0),
          db.collection('analyticsinteractions').countDocuments({
            timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
          }).catch(() => 0),
          
          // Last entries
          db.collection('analyticssessions').findOne({}, { sort: { startTime: -1 } }).catch(() => null),
          db.collection('analyticspageviews').findOne({}, { sort: { timestamp: -1 } }).catch(() => null),
          db.collection('analyticsinteractions').findOne({}, { sort: { timestamp: -1 } }).catch(() => null)
        ]);

        healthData.collections = {
          sessions: sessionsCount,
          pageViews: pageViewsCount,
          interactions: interactionsCount,
          businessEvents: businessEventsCount,
          performanceMetrics: performanceMetricsCount,
          dailyMetrics: dailyMetricsCount
        };

        healthData.recentActivity = {
          last24Hours: {
            sessions: recentSessions,
            pageViews: recentPageViews,
            interactions: recentInteractions
          },
          lastEntries: {
            session: lastSession ? {
              date: lastSession.startTime,
              daysAgo: Math.floor((new Date() - new Date(lastSession.startTime)) / (1000 * 60 * 60 * 24))
            } : null,
            pageView: lastPageView ? {
              date: lastPageView.timestamp,
              daysAgo: Math.floor((new Date() - new Date(lastPageView.timestamp)) / (1000 * 60 * 60 * 24))
            } : null,
            interaction: lastInteraction ? {
              date: lastInteraction.timestamp,
              daysAgo: Math.floor((new Date() - new Date(lastInteraction.timestamp)) / (1000 * 60 * 60 * 24))
            } : null
          }
        };

        // Data quality assessment
        const totalCollections = Object.values(healthData.collections).reduce((sum, count) => sum + count, 0);
        const activeCollections = Object.values(healthData.collections).filter(count => count > 0).length;
        const hasRecentActivity = recentSessions > 0 || recentPageViews > 0 || recentInteractions > 0;
        
        healthData.dataQuality = {
          totalRecords: totalCollections,
          activeCollections: activeCollections,
          hasRecentActivity: hasRecentActivity,
          dataFreshness: hasRecentActivity ? 'fresh' : 'stale',
          collectionHealth: {
            sessions: sessionsCount > 0 ? 'healthy' : 'empty',
            pageViews: pageViewsCount > 0 ? 'healthy' : 'empty',
            interactions: interactionsCount > 0 ? 'healthy' : 'empty'
          }
        };

        // Overall health status
        if (activeCollections >= 3 && hasRecentActivity) {
          healthData.status = 'healthy';
        } else if (activeCollections >= 3 && totalCollections > 1000) {
          healthData.status = 'stale-data';
        } else if (activeCollections > 0) {
          healthData.status = 'partial-data';
        } else {
          healthData.status = 'no-data';
        }

      } else {
        healthData.database.connected = false;
        healthData.status = 'database-disconnected';
      }

      return res.status(200).json({
        success: true,
        ...healthData,
        message: `Analytics health check completed - Status: ${healthData.status}`,
        recommendations: generateHealthRecommendations(healthData)
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Health check error:`, error);
      return res.status(500).json({
        success: false,
        status: 'unhealthy',
        message: 'Analytics health check failed',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // ANALYTICS SUMMARY ENDPOINT
  if ((path === '/analytics/summary' || path === '/api/analytics/summary') && req.method === 'GET') {
    console.log(`[${timestamp}] → ANALYTICS SUMMARY`);
    
    try {
      const days = parseInt(req.query?.days) || 30;
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      
      const [
        totalSessions,
        totalPageViews,
        totalInteractions,
        totalBusinessEvents,
        uniquePages,
        topCountries
      ] = await Promise.all([
        db.collection('analyticssessions').countDocuments({ startTime: { $gte: startDate } }).catch(() => 0),
        db.collection('analyticspageviews').countDocuments({ timestamp: { $gte: startDate } }).catch(() => 0),
        db.collection('analyticsinteractions').countDocuments({ timestamp: { $gte: startDate } }).catch(() => 0),
        db.collection('analyticsbusinessevents').countDocuments({ timestamp: { $gte: startDate } }).catch(() => 0),
        db.collection('analyticspageviews').distinct('page', { timestamp: { $gte: startDate } }).catch(() => []),
        db.collection('analyticssessions').aggregate([
          { $match: { startTime: { $gte: startDate } } },
          { $group: { _id: '$country', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 }
        ]).toArray().catch(() => [])
      ]);

      const summary = {
        period: `${days} days`,
        totals: {
          sessions: totalSessions,
          pageViews: totalPageViews,
          interactions: totalInteractions,
          businessEvents: totalBusinessEvents,
          uniquePages: uniquePages.length
        },
        averages: {
          pageViewsPerSession: totalSessions > 0 ? (totalPageViews / totalSessions).toFixed(2) : 0,
          interactionsPerSession: totalSessions > 0 ? (totalInteractions / totalSessions).toFixed(2) : 0,
          sessionsPerDay: (totalSessions / days).toFixed(1)
        },
        topCountries: topCountries.map(country => ({
          country: country._id || 'Unknown',
          sessions: country.count
        }))
      };

      return res.status(200).json({
        success: true,
        data: summary,
        message: 'Analytics summary retrieved successfully',
        dataSource: 'Real analytics database (direct queries)'
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Summary error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching analytics summary',
        error: error.message
      });
    }
  }

// Helper function to calculate performance score
function calculatePerformanceScore(pageLoadTimes, coreWebVitals) {
  let score = 100;
  
  // Deduct points for slow load times
  const avgLoadTime = pageLoadTimes.length > 0 ? 
    pageLoadTimes.reduce((sum, page) => sum + page.avgLoadTime, 0) / pageLoadTimes.length : 0;
  
  if (avgLoadTime > 3) score -= 30;
  else if (avgLoadTime > 2) score -= 15;
  else if (avgLoadTime > 1) score -= 5;
  
  // Deduct points for poor Core Web Vitals
  if (coreWebVitals.LCP.rating === 'poor') score -= 20;
  else if (coreWebVitals.LCP.rating === 'needs-improvement') score -= 10;
  
  if (coreWebVitals.FID.rating === 'poor') score -= 15;
  else if (coreWebVitals.FID.rating === 'needs-improvement') score -= 7;
  
  if (coreWebVitals.CLS.rating === 'poor') score -= 15;
  else if (coreWebVitals.CLS.rating === 'needs-improvement') score -= 7;
  
  return Math.max(0, Math.min(100, score));
}

// Helper function to generate health recommendations
function generateHealthRecommendations(healthData) {
  const recommendations = [];
  
  if (healthData.status === 'stale-data' || !healthData.recentActivity?.last24Hours?.sessions) {
    recommendations.push({
      issue: "No recent analytics data",
      solution: "Check frontend analytics tracking implementation",
      priority: "HIGH"
    });
  }
  
  if (healthData.collections?.pageViews === 0) {
    recommendations.push({
      issue: "No page view tracking",
      solution: "Implement page view tracking on frontend",
      priority: "HIGH"
    });
  }
  
  if (healthData.collections?.sessions > 0 && healthData.collections?.pageViews > 0) {
    const ratio = healthData.collections.pageViews / healthData.collections.sessions;
    if (ratio < 1.5) {
      recommendations.push({
        issue: "Low page views per session ratio",
        solution: "Check if page view tracking is working correctly",
        priority: "MEDIUM"
      });
    }
  }
  
  return recommendations;
}

// ==================== COMPLETE ANALYTICS ENDPOINTS - PART 3 ====================
// Add these final endpoints to complete your analytics suite

  // ENHANCED REALTIME DATA - Direct Collection Queries  
  if ((path === '/analytics/realtime' || path === '/api/analytics/realtime') && req.method === 'GET') {
    console.log(`[${timestamp}] → ANALYTICS REALTIME (Enhanced Direct Queries)`);
    
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const [
        activeSessions,
        activePageData,
        recentInteractions,
        browserData,
        deviceData,
        recentPageViews,
        activeCountries
      ] = await Promise.all([
        // Active sessions in last 5 minutes
        db.collection('analyticssessions').countDocuments({
          isActive: true,
          lastActivity: { $gte: fiveMinutesAgo }
        }).catch(() => 0),
        
        // Active pages with users in last 5 minutes
        db.collection('analyticspageviews').aggregate([
          { $match: { timestamp: { $gte: fiveMinutesAgo } } },
          { 
            $group: {
              _id: '$page',
              activeUsers: { $addToSet: '$sessionId' },
              recentViews: { $sum: 1 }
            }
          },
          {
            $project: {
              page: '$_id',
              activeUsers: { $size: '$activeUsers' },
              recentViews: 1
            }
          },
          { $sort: { activeUsers: -1 } },
          { $limit: 10 }
        ]).toArray().catch(() => []),
        
        // Recent events in last hour
        db.collection('analyticsinteractions').find({
          timestamp: { $gte: oneHourAgo }
        })
        .sort({ timestamp: -1 })
        .limit(25)
        .toArray()
        .catch(() => []),
        
        // Browser breakdown from sessions in last 24 hours
        db.collection('analyticssessions').aggregate([
          { $match: { startTime: { $gte: oneDayAgo } } },
          { 
            $group: {
              _id: '$device.browser',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } }
        ]).toArray().catch(() => []),

        // Device breakdown from sessions in last 24 hours
        db.collection('analyticssessions').aggregate([
          { $match: { startTime: { $gte: oneDayAgo } } },
          { 
            $group: {
              _id: '$device.type',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } }
        ]).toArray().catch(() => []),

        // Recent page views summary
        db.collection('analyticspageviews').countDocuments({
          timestamp: { $gte: oneHourAgo }
        }).catch(() => 0),

        // Active countries
        db.collection('analyticssessions').aggregate([
          { $match: { startTime: { $gte: oneDayAgo } } },
          {
            $group: {
              _id: '$country',
              sessions: { $sum: 1 },
              activeSessions: {
                $sum: {
                  $cond: [
                    { $gte: ['$lastActivity', fiveMinutesAgo] },
                    1,
                    0
                  ]
                }
              }
            }
          },
          { $match: { _id: { $ne: 'Unknown' } } },
          { $sort: { sessions: -1 } },
          { $limit: 5 }
        ]).toArray().catch(() => [])
      ]);

      console.log(`[${timestamp}] Realtime query results:`, {
        activeSessions,
        activePages: activePageData.length,
        recentEvents: recentInteractions.length,
        browsers: browserData.length,
        recentPageViews
      });

      // Process browser data
      const browserBreakdown = {};
      const totalBrowserSessions = browserData.reduce((sum, item) => sum + item.count, 0);
      
      if (totalBrowserSessions > 0) {
        browserData.forEach(item => {
          const browserName = item._id || 'Unknown';
          const percentage = Math.round((item.count / totalBrowserSessions) * 100);
          browserBreakdown[browserName] = percentage;
        });
      }

      // Process device data
      const deviceBreakdown = {};
      const totalDeviceSessions = deviceData.reduce((sum, item) => sum + item.count, 0);
      
      if (totalDeviceSessions > 0) {
        deviceData.forEach(item => {
          const deviceType = item._id || 'unknown';
          const percentage = Math.round((item.count / totalDeviceSessions) * 100);
          deviceBreakdown[deviceType] = percentage;
        });
      }

      // Format recent events
      const formattedEvents = recentInteractions.map(interaction => ({
        type: interaction.eventType || 'unknown',
        page: interaction.page || '/',
        timestamp: interaction.timestamp ? interaction.timestamp.toISOString() : new Date().toISOString(),
        category: interaction.category || 'general',
        sessionId: interaction.sessionId,
        details: interaction.metadata || {}
      }));

      const realtimeData = {
        activeUsers: activeSessions,
        activePages: activePageData,
        recentEvents: formattedEvents,
        browserBreakdown,
        deviceBreakdown,
        summary: {
          pageViewsLastHour: recentPageViews,
          eventsLastHour: recentInteractions.length,
          topActiveCountries: activeCountries,
          totalActiveSessions: activeSessions
        },
        activityTimeline: {
          last5Minutes: {
            activeSessions: activeSessions,
            activePages: activePageData.length
          },
          lastHour: {
            pageViews: recentPageViews,
            interactions: recentInteractions.length
          }
        }
      };

      return res.status(200).json({
        success: true,
        data: realtimeData,
        message: 'Real-time analytics retrieved successfully',
        timestamp: new Date().toISOString(),
        dataSource: 'Real analytics database (direct queries)',
        refreshRate: '30 seconds recommended'
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Realtime error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching real-time data',
        error: error.message
      });
    }
  }

  // BUSINESS INTELLIGENCE ENDPOINT
  if ((path === '/analytics/business' || path === '/api/analytics/business') && req.method === 'GET') {
    console.log(`[${timestamp}] → ANALYTICS BUSINESS INTELLIGENCE`);
    
    try {
      const days = parseInt(req.query?.days) || 30;
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const endDate = new Date();
      
      const [
        conversionEvents,
        listingPerformance,
        dealerEngagement,
        revenueMetrics,
        userJourney
      ] = await Promise.all([
        // Conversion events analysis
        db.collection('analyticsbusinessevents').aggregate([
          { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
          {
            $group: {
              _id: '$eventType',
              count: { $sum: 1 },
              totalValue: { $sum: '$conversionValue' },
              avgValue: { $avg: '$conversionValue' },
              uniqueUsers: { $addToSet: '$userId' }
            }
          },
          {
            $project: {
              eventType: '$_id',
              count: 1,
              totalValue: { $round: ['$totalValue', 2] },
              avgValue: { $round: ['$avgValue', 2] },
              uniqueUsers: { $size: '$uniqueUsers' }
            }
          },
          { $sort: { count: -1 } }
        ]).toArray().catch(() => []),

        // Listing performance analysis
        db.collection('analyticsinteractions').aggregate([
          {
            $match: {
              eventType: 'listing_view',
              timestamp: { $gte: startDate, $lte: endDate },
              'metadata.listingId': { $exists: true }
            }
          },
          {
            $group: {
              _id: '$metadata.listingId',
              views: { $sum: 1 },
              uniqueViewers: { $addToSet: '$sessionId' },
              avgEngagement: { $avg: '$metadata.timeOnPage' }
            }
          },
          {
            $project: {
              listingId: '$_id',
              views: 1,
              uniqueViewers: { $size: '$uniqueViewers' },
              avgEngagement: { $round: ['$avgEngagement', 0] }
            }
          },
          { $sort: { views: -1 } },
          { $limit: 10 }
        ]).toArray().catch(() => []),

        // Dealer engagement analysis
        db.collection('analyticsinteractions').aggregate([
          {
            $match: {
              eventType: { $in: ['dealer_contact', 'phone_call'] },
              timestamp: { $gte: startDate, $lte: endDate },
              'metadata.dealerId': { $exists: true }
            }
          },
          {
            $group: {
              _id: '$metadata.dealerId',
              contacts: { $sum: 1 },
              uniqueContacts: { $addToSet: '$sessionId' },
              contactMethods: { $addToSet: '$metadata.contactMethod' }
            }
          },
          {
            $project: {
              dealerId: '$_id',
              contacts: 1,
              uniqueContacts: { $size: '$uniqueContacts' },
              contactMethods: 1
            }
          },
          { $sort: { contacts: -1 } },
          { $limit: 10 }
        ]).toArray().catch(() => []),

        // Revenue-related metrics
        db.collection('analyticsbusinessevents').aggregate([
          {
            $match: {
              timestamp: { $gte: startDate, $lte: endDate },
              conversionValue: { $gt: 0 }
            }
          },
          {
            $group: {
              _id: {
                year: { $year: '$timestamp' },
                month: { $month: '$timestamp' },
                day: { $dayOfMonth: '$timestamp' }
              },
              dailyRevenue: { $sum: '$conversionValue' },
              conversions: { $sum: 1 }
            }
          },
          {
            $project: {
              date: {
                $dateFromParts: {
                  year: '$_id.year',
                  month: '$_id.month',
                  day: '$_id.day'
                }
              },
              revenue: { $round: ['$dailyRevenue', 2] },
              conversions: 1
            }
          },
          { $sort: { date: 1 } }
        ]).toArray().catch(() => []),

        // User journey analysis
        db.collection('analyticsinteractions').aggregate([
          {
            $match: {
              timestamp: { $gte: startDate, $lte: endDate }
            }
          },
          {
            $group: {
              _id: '$sessionId',
              events: { $push: { eventType: '$eventType', timestamp: '$timestamp', page: '$page' } },
              totalEvents: { $sum: 1 },
              duration: { $max: '$timestamp' }
            }
          },
          {
            $match: { totalEvents: { $gte: 3 } } // Focus on engaged users
          },
          { $limit: 100 }
        ]).toArray().catch(() => [])
      ]);

      console.log(`[${timestamp}] Business intelligence results:`, {
        conversionEvents: conversionEvents.length,
        topListings: listingPerformance.length,
        activeDealers: dealerEngagement.length,
        revenuePoints: revenueMetrics.length
      });

      const businessData = {
        conversions: {
          events: conversionEvents,
          totalConversions: conversionEvents.reduce((sum, event) => sum + event.count, 0),
          totalValue: conversionEvents.reduce((sum, event) => sum + event.totalValue, 0),
          conversionRate: 0 // Calculate based on total sessions
        },
        listings: {
          topPerforming: listingPerformance,
          totalViews: listingPerformance.reduce((sum, listing) => sum + listing.views, 0),
          avgViewsPerListing: listingPerformance.length > 0 ? 
            (listingPerformance.reduce((sum, listing) => sum + listing.views, 0) / listingPerformance.length).toFixed(1) : 0
        },
        dealers: {
          topEngaged: dealerEngagement,
          totalContacts: dealerEngagement.reduce((sum, dealer) => sum + dealer.contacts, 0),
          avgContactsPerDealer: dealerEngagement.length > 0 ?
            (dealerEngagement.reduce((sum, dealer) => sum + dealer.contacts, 0) / dealerEngagement.length).toFixed(1) : 0
        },
        revenue: {
          timeline: revenueMetrics,
          totalRevenue: revenueMetrics.reduce((sum, day) => sum + day.revenue, 0),
          avgDailyRevenue: revenueMetrics.length > 0 ?
            (revenueMetrics.reduce((sum, day) => sum + day.revenue, 0) / revenueMetrics.length).toFixed(2) : 0
        },
        userBehavior: {
          engagedSessions: userJourney.length,
          avgEventsPerSession: userJourney.length > 0 ?
            (userJourney.reduce((sum, session) => sum + session.totalEvents, 0) / userJourney.length).toFixed(1) : 0
        }
      };

      return res.status(200).json({
        success: true,
        data: businessData,
        message: 'Business intelligence data retrieved successfully',
        period: `${days} days`,
        dataSource: 'Real analytics database (direct queries)',
        insights: generateBusinessInsights(businessData)
      });
      
    } catch (error) {
      console.error(`[${timestamp}] Business intelligence error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error fetching business intelligence data',
        error: error.message
      });
    }
  }

  // ANALYTICS EXPORT ENDPOINT
  if ((path === '/analytics/export' || path === '/api/analytics/export') && req.method === 'GET') {
    console.log(`[${timestamp}] → ANALYTICS DATA EXPORT`);
    
    try {
      const days = parseInt(req.query?.days) || 30;
      const format = req.query?.format || 'json';
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const endDate = new Date();
      
      const [
        sessions,
        pageViews,
        interactions
      ] = await Promise.all([
        db.collection('analyticssessions').find({
          startTime: { $gte: startDate, $lte: endDate }
        }).limit(1000).toArray().catch(() => []),
        
        db.collection('analyticspageviews').find({
          timestamp: { $gte: startDate, $lte: endDate }
        }).limit(1000).toArray().catch(() => []),
        
        db.collection('analyticsinteractions').find({
          timestamp: { $gte: startDate, $lte: endDate }
        }).limit(1000).toArray().catch(() => [])
      ]);

      const exportData = {
        exportInfo: {
          generatedAt: new Date().toISOString(),
          period: `${days} days`,
          recordsIncluded: {
            sessions: sessions.length,
            pageViews: pageViews.length,
            interactions: interactions.length
          }
        },
        data: {
          sessions,
          pageViews,
          interactions
        }
      };

      // Set appropriate headers for download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="analytics-export-${days}days-${new Date().toISOString().split('T')[0]}.json"`);

      return res.status(200).json(exportData);
      
    } catch (error) {
      console.error(`[${timestamp}] Export error:`, error);
      return res.status(500).json({
        success: false,
        message: 'Error exporting analytics data',
        error: error.message
      });
    }
  }

// Helper function to generate business insights
function generateBusinessInsights(businessData) {
  const insights = [];
  
  if (businessData.conversions.totalConversions === 0) {
    insights.push({
      type: "warning",
      message: "No conversions recorded in this period",
      recommendation: "Review conversion tracking implementation"
    });
  }
  
  if (businessData.listings.topPerforming.length > 0) {
    const topListing = businessData.listings.topPerforming[0];
    insights.push({
      type: "info",
      message: `Top performing listing has ${topListing.views} views`,
      recommendation: "Analyze what makes this listing successful"
    });
  }
  
  if (businessData.dealers.totalContacts > 0) {
    insights.push({
      type: "success",
      message: `${businessData.dealers.totalContacts} dealer contacts generated`,
      recommendation: "Follow up on dealer contact quality"
    });
  }
  
  if (businessData.revenue.totalRevenue > 0) {
    insights.push({
      type: "success",
      message: `$${businessData.revenue.totalRevenue} in tracked revenue`,
      recommendation: "Optimize high-value conversion paths"
    });
  }
  
  return insights;
}


 // ==================== SECTION 12: SERVICES & ALIASES ====================
  // ==================== SECTION 12: SERVICES & ALIASES ====================
   // ==================== SECTION 12: SERVICES & ALIASES ====================
    // ==================== SECTION 12: SERVICES & ALIASES ====================

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


// === MISSING: /trailers (trailer rentals) ===
if (path === '/trailers' && req.method === 'GET') {
  console.log(`[${timestamp}] → TRAILERS (trailer rentals)`);
  
  try {
    // Since you don't have a specific trailers collection, return empty for now
    // Or redirect to rentals with trailer filter
    return res.status(200).json({
      success: true,
      data: [],
      vehicles: [],
      pagination: {
        currentPage: 1,
        totalPages: 0,
        total: 0
      },
      message: 'Trailer rentals coming soon'
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Trailers error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching trailer rentals',
      error: error.message,
      data: [],
      vehicles: []
    });
  }
}

// === MISSING: /api/trailers (trailer rentals API) ===
if (path === '/api/trailers' && req.method === 'GET') {
  console.log(`[${timestamp}] → API TRAILERS`);
  
  try {
    // Same as above - return empty for now
    return res.status(200).json({
      success: true,
      data: [],
      vehicles: [],
      pagination: {
        currentPage: 1,
        totalPages: 0,
        total: 0
      },
      message: 'Trailer rentals API coming soon'
    });
    
  } catch (error) {
    console.error(`[${timestamp}] API Trailers error:`, error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching trailer rentals',
      error: error.message,
      data: [],
      vehicles: []
    });
  }
}


  // ==================== SECTION 13: NOT FOUND ====================
    // ==================== SECTION 13: NOT FOUND ====================
  // ==================== SECTION 13: NOT FOUND ====================
      // ==================== SECTION 13: NOT FOUND ====================
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
  '=== ADMIN NEWS ENDPOINTS ===',
  '/api/news (GET) - Get all articles',
  '/api/news (POST) - Create article [REQUIRES ADMIN TOKEN]',
  '/api/news/{id} (GET) - Get single article',
  '/api/news/{id} (PUT) - Update article [REQUIRES ADMIN TOKEN]',
  '/api/news/{id} (DELETE) - Delete article [REQUIRES ADMIN TOKEN]',
  '/api/news/pending (GET) - Get pending articles [REQUIRES ADMIN TOKEN]',
  '/api/news/{id}/review (PUT) - Approve/Reject article [REQUIRES ADMIN TOKEN]',
  '=== USER/JOURNALIST NEWS ENDPOINTS ===',
  '/api/news/user (POST) - Create article [REQUIRES USER/JOURNALIST TOKEN]',
  '/api/news/user/my-articles (GET) - Get user\'s own articles [REQUIRES TOKEN]',
  '/api/news/user/{id} (PUT) - Update user\'s own article [REQUIRES TOKEN]',
  '/api/news/user/{id} (DELETE) - Delete user\'s own article [REQUIRES TOKEN]',
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
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
      timestamp: new Date().toISOString(),
      path: req.url
    });
  }
}



