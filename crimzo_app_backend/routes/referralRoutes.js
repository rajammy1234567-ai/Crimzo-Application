const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const referral = require('../controllers/referralController');

router.get('/me', authenticateToken, referral.getMyReferral);
router.get('/validate/:code', referral.validateReferralCode);

module.exports = router;