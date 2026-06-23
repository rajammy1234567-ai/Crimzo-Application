const jwt = require('jsonwebtoken');
const User = require('../models/User');

function attachSocketAuth(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (!decoded?.id) return next(new Error('Invalid token'));

      const user = await User.findById(decoded.id).select('is_banned username').lean();
      if (!user) return next(new Error('User not found'));
      if (user.is_banned) return next(new Error('Account suspended'));

      socket.authenticatedUserId = String(decoded.id);
      socket.authenticatedUsername = user.username || decoded.username || 'User';
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });
}

module.exports = { attachSocketAuth };