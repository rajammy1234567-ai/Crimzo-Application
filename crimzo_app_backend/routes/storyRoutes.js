const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const { flexibleSingle } = require('../middleware/uploadFlexible');
const story = require('../controllers/storyController');

router.post('/presign', authenticateToken, story.getPresignedUrl);   // direct-to-S3 upload URL
router.post('/confirm', authenticateToken, story.confirmUpload);    // save to DB after S3 upload
router.post('/upload', authenticateToken, flexibleSingle(), story.uploadStory);
router.get('/', authenticateToken, story.getAllStories);
router.get('/user/:userId', authenticateToken, story.getUserStories);
router.delete('/:storyId', authenticateToken, story.deleteStory);

module.exports = router;
