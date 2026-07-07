const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const earnings = require('../controllers/earningsController');

router.get('/summary', authenticateToken, earnings.getEarnings);

module.exports = router;
