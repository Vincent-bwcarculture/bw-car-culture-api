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

  // Simple admin registration response (no database yet)
  if (req.method === 'POST' && req.url.includes('/auth/register')) {
    const { fullName, email, password } = req.body;

    return res.status(201).json({
      success: true,
      message: 'Registration endpoint working - database connection coming next',
      user: {
        fullName,
        email,
        role: 'admin'
      },
      note: 'This is a test response - database integration next step'
    });
  }

  // Health check
  return res.status(200).json({
    status: 'success',
    message: 'BW Car Culture API is working',
    timestamp: new Date().toISOString(),
    endpoints: {
      registration: 'POST /auth/register',
      health: 'GET /'
    }
  });
}
