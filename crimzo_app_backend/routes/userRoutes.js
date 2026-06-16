const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const user = require('../controllers/userController');

router.get('/profile/full', authenticateToken, user.getFullProfile);
router.get('/search', authenticateToken, user.searchUsers);
router.post('/follow', authenticateToken, user.followUser);
router.put('/profile', authenticateToken, user.updateProfile);
router.get('/followers/:userId', authenticateToken, user.getFollowers);
router.get('/following/:userId', authenticateToken, user.getFollowing);

module.exports = router;
