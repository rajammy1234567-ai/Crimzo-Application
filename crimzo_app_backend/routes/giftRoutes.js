const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const gift = require('../controllers/giftController');

router.get('/history', authenticateToken, gift.getHistory);

module.exports = router;
