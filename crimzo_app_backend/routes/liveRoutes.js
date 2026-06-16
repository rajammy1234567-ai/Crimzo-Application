const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const live = require('../controllers/liveController');

// Factory function — needs io for the endLive event emission
module.exports = (io) => {
  router.post('/start', authenticateToken, live.startLive);
  router.post('/end/:sessionId', authenticateToken, live.createEndLive(io));
  router.get('/active', authenticateToken, live.getActiveStreams);
  router.get('/users', authenticateToken, live.getLiveUsers);
  router.post('/join/:sessionId', authenticateToken, live.joinLive);

  return router;
};
