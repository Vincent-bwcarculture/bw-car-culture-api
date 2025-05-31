// server/middleware/cors.js
const corsMiddleware = (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
      return;
    }
    next();
  };
  
  export default corsMiddleware;