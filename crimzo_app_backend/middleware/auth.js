const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    if (decoded?.id) {
      const user = await User.findById(decoded.id).select('is_banned').lean();
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      if (user.is_banned) {
        return res.status(403).json({ error: 'Account suspended', code: 'BANNED' });
      }
    }

    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

module.exports = { authenticateToken };