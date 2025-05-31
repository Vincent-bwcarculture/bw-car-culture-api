// CORS helper with specific domain support
const setCORSHeaders = (res, origin) => {
  // Allow your specific frontend domain
  const allowedOrigins = [
    'https://bw-car-culture.vercel.app',
    'https://bw-car-culture-1g2voo80m-katso-vincents-projects.vercel.app',
    'http://localhost:3000'
  ];
  
  const allowOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
};

export default async function handler(req, res) {
  const origin = req.headers.origin;
  setCORSHeaders(res, origin);
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  console.log(`${req.method} ${req.url} from ${origin}`);

  try {
    // Parse request body for POST requests
    let body = {};
    if (req.method === 'POST') {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const rawBody = Buffer.concat(chunks).toString();
      try {
        body = JSON.parse(rawBody);
      } catch (e) {
        console.log('Could not parse body:', rawBody);
      }
    }

    // Admin registration endpoint
    if (req.method === 'POST' && (req.url.includes('/auth/register') || req.url.includes('register'))) {
      const { fullName, email, password } = body;

      console.log('Registration attempt:', { fullName, email });

      return res.status(201).json({
        success: true,
        message: 'Registration successful! (Database integration coming next)',
        user: {
          id: '12345',
          fullName,
          email,
          role: 'admin'
        },
        token: 'test-jwt-token-123'
      });
    }

    // Health check
    if (req.method === 'GET') {
      return res.status(200).json({
        status: 'success',
        message: 'BW Car Culture API is working',
        timestamp: new Date().toISOString(),
        endpoints: {
          registration: 'POST /auth/register',
          health: 'GET /'
        },
        cors: 'enabled for frontend'
      });
    }

    // Default response
    return res.status(200).json({
      message: 'BW Car Culture API',
      method: req.method,
      url: req.url
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
}
