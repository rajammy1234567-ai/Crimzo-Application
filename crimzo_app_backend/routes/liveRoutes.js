const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const live = require('../controllers/liveController');
const liveTalk = require('../controllers/liveTalkController');

// Factory function — needs io for the endLive event emission
module.exports = (io) => {
  router.post('/start', authenticateToken, live.startLive);
  router.post('/end/:sessionId', authenticateToken, live.createEndLive(io));
  router.get('/active', authenticateToken, live.getActiveStreams);
  router.get('/users', authenticateToken, live.getLiveUsers);
  router.post('/join/:sessionId', authenticateToken, live.joinLive);

  router.get('/talk/check', authenticateToken, liveTalk.checkTalkEligibility);
  router.post('/talk/request', authenticateToken, liveTalk.requestTalk);
  router.post('/talk/respond', authenticateToken, liveTalk.respondTalk);
  router.get('/talk/status/:sessionId', authenticateToken, liveTalk.getTalkStatus);
  router.post('/talk/start', authenticateToken, liveTalk.startTalkBilling);
  router.post('/talk/tick', authenticateToken, liveTalk.tickTalkBilling);
  router.post('/talk/end', authenticateToken, liveTalk.endTalkBilling);

  return router;
};
