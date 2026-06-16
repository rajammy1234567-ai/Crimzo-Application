const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const messages = require('../controllers/messageController');

router.get('/conversations', authenticateToken, messages.getConversations);
router.get('/gift-presets', authenticateToken, messages.getGiftPresets);
router.get('/unread', authenticateToken, messages.getUnreadCount);
router.post('/gift', authenticateToken, messages.sendDiamondGift);
router.get('/:userId', authenticateToken, messages.getMessages);
router.post('/send', authenticateToken, messages.sendMessage);

module.exports = router;
