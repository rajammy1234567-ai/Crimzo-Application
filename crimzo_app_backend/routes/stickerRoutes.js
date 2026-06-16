const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const sticker = require('../controllers/stickerController');

router.get('/catalog', authenticateToken, sticker.getCatalog);
router.post('/buy', authenticateToken, sticker.buySticker);
router.get('/owned', authenticateToken, sticker.getOwned);
router.get('/collected', authenticateToken, sticker.getCollected);
router.get('/collected/:userId', authenticateToken, sticker.getCollected);
router.post('/send', authenticateToken, sticker.sendSticker);

module.exports = router;
