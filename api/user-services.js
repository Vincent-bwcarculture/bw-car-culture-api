
// api/user-services.js
// Ultra-simple version that cannot crash

exports.default = async function handler(req, res) {
  // Set CORS headers first
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Simple response - no complex logic
  return res.status(200).json({
    success: true,
    message: "🔥 USER-SERVICES IS WORKING!",
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
    source: "user-services.js"
  });
};