const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const { flexibleSingle } = require('../middleware/uploadFlexible');
const reel = require('../controllers/reelController');

router.post('/presign', authenticateToken, reel.getPresignedUrl);   // direct-to-S3 upload URL
router.post('/confirm', authenticateToken, reel.confirmUpload);    // save to DB after S3 upload
router.post('/upload', authenticateToken, flexibleSingle(), reel.uploadReel);
router.get('/feed', authenticateToken, reel.getFeed);
router.get('/me', authenticateToken, reel.getMyReels);
router.post('/:reelId/like', authenticateToken, reel.likeReel);
router.post('/:reelId/comment', authenticateToken, reel.addComment);
router.get('/:reelId/comments', authenticateToken, reel.getComments);
router.get('/user/:userId', authenticateToken, reel.getUserReels);
router.delete('/:reelId', authenticateToken, reel.deleteReel);
router.patch('/:reelId', authenticateToken, reel.updateReel);
router.post('/:reelId/view', authenticateToken, reel.viewReel);

module.exports = router;
