const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const videoCall = require('../controllers/videoCallController');

router.get('/rate', authenticateToken, videoCall.getRateInfo);
router.get('/check', authenticateToken, videoCall.checkEligibility);
router.post('/start', authenticateToken, videoCall.startSession);
router.post('/tick', authenticateToken, videoCall.tickBilling);
router.post('/end', authenticateToken, videoCall.endSession);

module.exports = router;