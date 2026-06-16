const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const agora = require('../controllers/agoraController');

router.post('/token', authenticateToken, agora.generateToken);
router.post('/call-token', authenticateToken, agora.generateCallToken);

module.exports = router;
