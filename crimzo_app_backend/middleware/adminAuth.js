const jwt = require('jsonwebtoken');

const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Admin access required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'jwt_secret_fallback', (err, admin) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid admin token' });
    }
    
    if (!admin.is_admin) {
      return res.status(403).json({ error: 'Forbidden. Not an admin' });
    }
    
    req.admin = admin;
    next();
  });
};

module.exports = { authenticateAdmin };
