// MongoDB connection without imports (using dynamic import)
let mongoose;
let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;

  try {
    if (!mongoose) {
      mongoose = await import('mongoose');
    }
    
    await mongoose.default.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    isConnected = true;
    console.log('✅ MongoDB connected successfully');
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    isConnected = false;
    return false;
  }
};

// Simple User schema
const getUserModel = () => {
  if (mongoose?.default?.models?.User) {
    return mongoose.default.models.User;
  }
  
  const userSchema = new mongoose.default.Schema({
    fullName: String,
    email: String,
    password: String,
    role: { type: String, default: 'admin' },
    createdAt: { type: Date, default: Date.now }
  });
  
  return mongoose.default.model('User', userSchema);
};

// CORS helper
const setCORSHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

export default async function handler(req, res) {
  setCORSHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Test database connection
    if (req.url.includes('/test-db') || req.url.includes('/database')) {
      const connected = await connectDB();
      
      if (connected) {
        try {
          const User = getUserModel();
          const userCount = await User.countDocuments();
          const users = await User.find({}).limit(5).select('fullName email role createdAt');
          
          return res.status(200).json({
            success: true,
            message: 'Database connected successfully!',
            database: 'i3wcarculture',
            userCount,
            sampleUsers: users,
            timestamp: new Date().toISOString()
          });
        } catch (dbError) {
          return res.status(200).json({
            success: true,
            message: 'Database connected but no user data found',
            error: dbError.message,
            timestamp: new Date().toISOString()
          });
        }
      } else {
        return res.status(500).json({
          success: false,
          message: 'Could not connect to database',
          timestamp: new Date().toISOString()
        });
      }
    }

    // List all collections endpoint
    if (req.url.includes('/collections')) {
      const connected = await connectDB();
      if (connected) {
        const collections = await mongoose.default.connection.db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        
        return res.status(200).json({
          success: true,
          collections: collectionNames,
          total: collectionNames.length,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Admin registration with database
    if (req.method === 'POST' && req.url.includes('/auth/register')) {
      let body = {};
      try {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const rawBody = Buffer.concat(chunks).toString();
        body = JSON.parse(rawBody);
      } catch (e) {
        console.log('Body parse error:', e);
      }

      const { fullName, email, password } = body;
      
      const connected = await connectDB();
      if (connected) {
        try {
          const User = getUserModel();
          
          // Check if user already exists
          const existingUser = await User.findOne({ email });
          if (existingUser) {
            return res.status(400).json({
              success: false,
              message: 'User already exists with this email'
            });
          }
          
          // Create new user (password should be hashed in production)
          const newUser = new User({
            fullName,
            email,
            password, // In production, hash this with bcrypt
            role: 'admin'
          });
          
          await newUser.save();
          
          return res.status(201).json({
            success: true,
            message: 'Admin registered successfully!',
            user: {
              id: newUser._id,
              fullName: newUser.fullName,
              email: newUser.email,
              role: newUser.role
            }
          });
        } catch (dbError) {
          return res.status(500).json({
            success: false,
            message: 'Database error during registration',
            error: dbError.message
          });
        }
      } else {
        return res.status(500).json({
          success: false,
          message: 'Database connection failed'
        });
      }
    }

    // Default health check
    return res.status(200).json({
      status: 'success',
      message: 'BW Car Culture API with MongoDB',
      timestamp: new Date().toISOString(),
      endpoints: {
        'database-test': 'GET /test-db',
        'collections': 'GET /collections',
        'register': 'POST /auth/register'
      }
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
}
EOFcat > api/index.js << 'EOF'
// MongoDB connection without imports (using dynamic import)
let mongoose;
let isConnected = false;

const connectDB = async () => {
  if (isConnected) return;

  try {
    if (!mongoose) {
      mongoose = await import('mongoose');
    }
    
    await mongoose.default.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    isConnected = true;
    console.log('✅ MongoDB connected successfully');
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    isConnected = false;
    return false;
  }
};

// Simple User schema
const getUserModel = () => {
  if (mongoose?.default?.models?.User) {
    return mongoose.default.models.User;
  }
  
  const userSchema = new mongoose.default.Schema({
    fullName: String,
    email: String,
    password: String,
    role: { type: String, default: 'admin' },
    createdAt: { type: Date, default: Date.now }
  });
  
  return mongoose.default.model('User', userSchema);
};

// CORS helper
const setCORSHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

export default async function handler(req, res) {
  setCORSHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Test database connection
    if (req.url.includes('/test-db') || req.url.includes('/database')) {
      const connected = await connectDB();
      
      if (connected) {
        try {
          const User = getUserModel();
          const userCount = await User.countDocuments();
          const users = await User.find({}).limit(5).select('fullName email role createdAt');
          
          return res.status(200).json({
            success: true,
            message: 'Database connected successfully!',
            database: 'i3wcarculture',
            userCount,
            sampleUsers: users,
            timestamp: new Date().toISOString()
          });
        } catch (dbError) {
          return res.status(200).json({
            success: true,
            message: 'Database connected but no user data found',
            error: dbError.message,
            timestamp: new Date().toISOString()
          });
        }
      } else {
        return res.status(500).json({
          success: false,
          message: 'Could not connect to database',
          timestamp: new Date().toISOString()
        });
      }
    }

    // List all collections endpoint
    if (req.url.includes('/collections')) {
      const connected = await connectDB();
      if (connected) {
        const collections = await mongoose.default.connection.db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        
        return res.status(200).json({
          success: true,
          collections: collectionNames,
          total: collectionNames.length,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Admin registration with database
    if (req.method === 'POST' && req.url.includes('/auth/register')) {
      let body = {};
      try {
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        const rawBody = Buffer.concat(chunks).toString();
        body = JSON.parse(rawBody);
      } catch (e) {
        console.log('Body parse error:', e);
      }

      const { fullName, email, password } = body;
      
      const connected = await connectDB();
      if (connected) {
        try {
          const User = getUserModel();
          
          // Check if user already exists
          const existingUser = await User.findOne({ email });
          if (existingUser) {
            return res.status(400).json({
              success: false,
              message: 'User already exists with this email'
            });
          }
          
          // Create new user (password should be hashed in production)
          const newUser = new User({
            fullName,
            email,
            password, // In production, hash this with bcrypt
            role: 'admin'
          });
          
          await newUser.save();
          
          return res.status(201).json({
            success: true,
            message: 'Admin registered successfully!',
            user: {
              id: newUser._id,
              fullName: newUser.fullName,
              email: newUser.email,
              role: newUser.role
            }
          });
        } catch (dbError) {
          return res.status(500).json({
            success: false,
            message: 'Database error during registration',
            error: dbError.message
          });
        }
      } else {
        return res.status(500).json({
          success: false,
          message: 'Database connection failed'
        });
      }
    }

    // Default health check
    return res.status(200).json({
      status: 'success',
      message: 'BW Car Culture API with MongoDB',
      timestamp: new Date().toISOString(),
      endpoints: {
        'database-test': 'GET /test-db',
        'collections': 'GET /collections',
        'register': 'POST /auth/register'
      }
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
}
