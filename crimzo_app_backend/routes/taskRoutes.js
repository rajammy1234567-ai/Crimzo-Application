const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const task = require('../controllers/taskController');

router.get('/', authenticateToken, task.getTasks);
router.post('/checkin', authenticateToken, task.checkIn);
router.post('/claim', authenticateToken, task.claimReward);
router.post('/complete', authenticateToken, task.completeTask);

module.exports = router;