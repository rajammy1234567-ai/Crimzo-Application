const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const { flexibleSingle } = require('../middleware/uploadFlexible');
const user = require('../controllers/userController');

router.get('/profile/full', authenticateToken, user.getFullProfile);
router.get('/search', authenticateToken, user.searchUsers);
router.post('/follow', authenticateToken, user.followUser);
router.post('/follow/accept', authenticateToken, user.acceptFollowRequest);
router.post('/follow/reject', authenticateToken, user.rejectFollowRequest);
router.get('/follow-requests', authenticateToken, user.getFollowRequests);
router.get('/blocked', authenticateToken, user.getBlockedUsers);
router.post('/block', authenticateToken, user.blockUser);
router.post('/unblock', authenticateToken, user.unblockUser);
router.put('/profile', authenticateToken, user.updateProfile);
router.post('/avatar', authenticateToken, flexibleSingle(), user.uploadAvatar);
router.get('/followers/:userId', authenticateToken, user.getFollowers);
router.get('/following/:userId', authenticateToken, user.getFollowing);
router.get('/friends/:userId', authenticateToken, user.getFriends);

module.exports = router;
