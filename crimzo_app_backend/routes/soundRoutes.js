const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const { authenticateAdmin } = require('../middleware/adminAuth');
const { flexibleSingle } = require('../middleware/uploadFlexible');
const sound = require('../controllers/soundController');

router.get('/browse', authenticateToken, sound.browseSounds);
router.get('/languages', authenticateToken, sound.getLanguages);
router.get('/resolve/:source/:id', authenticateToken, sound.resolveStream);
router.get('/', authenticateToken, sound.listSounds);
router.get('/trending', authenticateToken, sound.getTrendingSounds);
router.post('/import-from-video', authenticateToken, flexibleSingle(), sound.importFromVideo);
router.post('/webhooks/soundstripe', (_req, res) => {
  res.status(200).json({ received: true });
});
router.post('/admin/upload', authenticateAdmin, flexibleSingle(), sound.adminUploadSound);

module.exports = router;