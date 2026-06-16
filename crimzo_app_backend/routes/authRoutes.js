const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const auth = require('../controllers/authController');
const { upload } = require('../config/cloudinary');

router.post('/guest', auth.guestLogin);
router.post('/phone/send-otp', auth.sendOtp);
router.post('/phone/verify-otp', auth.verifyOtp);
router.post('/google', auth.googleLogin);
router.post('/register', upload.single('avatar'), auth.register);
router.post('/login', auth.login);

// Email OTP auth (new proper flow)
router.post('/email/send-otp', auth.sendEmailOtp);
router.post('/email/verify-otp', auth.verifyEmailOtp);
router.post('/email/complete-registration', auth.completeEmailRegistration);

router.get('/me', authenticateToken, auth.getMe);

module.exports = router;
