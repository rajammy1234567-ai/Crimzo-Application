const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const pk = require('../controllers/pkController');

router.post('/create', authenticateToken, pk.createBattle);
router.get('/active', authenticateToken, pk.getActiveBattles);
router.get('/leaderboard', authenticateToken, pk.getLeaderboard);
router.post('/join/:battleId', authenticateToken, pk.joinBattle);
router.get('/resume/:battleId', authenticateToken, pk.resumeBattle);
router.get('/watch/:battleId', authenticateToken, pk.watchBattle);
router.post('/end/:battleId', authenticateToken, pk.endBattle);

module.exports = router;
