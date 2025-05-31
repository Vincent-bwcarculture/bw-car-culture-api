// Vercel serverless function handler for BW Car Culture API
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import mongoose from 'mongoose';

// Create Express app
const app = express();

// Database connection state
let isConnected = false;

// Connect to database
const connectDB = async () => {
  if (isConnected) {
    return;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4
    });

    isConnected = conn.connection.readyState === 1;
    console.log('MongoDB connected for serverless function');
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
};

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      process.env.CLIENT_URL,
      'https://bw-car-culture.vercel.app',
      'http://localhost:3000',
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for now
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'X-Requested-With'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400
};

// Apply middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false
}));

app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await connectDB();
    
    res.status(200).json({
      status: 'success',
      message: 'BW Car Culture API is running',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      database: isConnected ? 'connected' : 'disconnected'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: error.message
    });
  }
});

// Basic auth endpoint
app.post('/api/auth/register', async (req, res) => {
  try {
    await connectDB();
    
    res.status(200).json({
      success: true,
      message: 'Registration endpoint working',
      data: { message: 'Backend connected successfully' }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.status(200).json({ 
    status: 'success', 
    message: 'BW Car Culture Vercel serverless function is working!',
    timestamp: new Date().toISOString()
  });
});

// Default route
app.all('*', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'BW Car Culture API',
    timestamp: new Date().toISOString(),
    path: req.path
  });
});

// Main handler function for Vercel
export default async function handler(req, res) {
  try {
    // Connect to database on each request
    await connectDB();
    
    // Handle the request with Express
    return app(req, res);
  } catch (error) {
    console.error('Serverless function error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
}
EOFcat > api/index.js << 'EOF'
// Vercel serverless function handler for BW Car Culture API
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import mongoose from 'mongoose';

// Create Express app
const app = express();

// Database connection state
let isConnected = false;

// Connect to database
const connectDB = async () => {
  if (isConnected) {
    return;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4
    });

    isConnected = conn.connection.readyState === 1;
    console.log('MongoDB connected for serverless function');
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
};

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      process.env.CLIENT_URL,
      'https://bw-car-culture.vercel.app',
      'http://localhost:3000',
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for now
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control', 'X-Requested-With'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400
};

// Apply middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: false
}));

app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    await connectDB();
    
    res.status(200).json({
      status: 'success',
      message: 'BW Car Culture API is running',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      database: isConnected ? 'connected' : 'disconnected'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Health check failed',
      error: error.message
    });
  }
});

// Basic auth endpoint
app.post('/api/auth/register', async (req, res) => {
  try {
    await connectDB();
    
    res.status(200).json({
      success: true,
      message: 'Registration endpoint working',
      data: { message: 'Backend connected successfully' }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.status(200).json({ 
    status: 'success', 
    message: 'BW Car Culture Vercel serverless function is working!',
    timestamp: new Date().toISOString()
  });
});

// Default route
app.all('*', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'BW Car Culture API',
    timestamp: new Date().toISOString(),
    path: req.path
  });
});

// Main handler function for Vercel
export default async function handler(req, res) {
  try {
    // Connect to database on each request
    await connectDB();
    
    // Handle the request with Express
    return app(req, res);
  } catch (error) {
    console.error('Serverless function error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
  }
}
