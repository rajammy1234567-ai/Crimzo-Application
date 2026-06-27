const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const { authenticateAdmin } = require('../middleware/adminAuth');
const { flexibleSingle } = require('../middleware/uploadFlexible');
const sound = require('../controllers/soundController');

router.get('/', authenticateToken, sound.listSounds);
router.get('/trending', authenticateToken, sound.getTrendingSounds);
router.post('/admin/upload', authenticateAdmin, flexibleSingle(), sound.adminUploadSound);

module.exports = router;