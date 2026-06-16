const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const notification = require('../controllers/notificationController');

router.get('/', authenticateToken, notification.getNotifications);
router.get('/unread-count', authenticateToken, notification.getUnreadCount);
router.post('/mark-read', authenticateToken, notification.markRead);

module.exports = router;