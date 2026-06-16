const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const payment = require('../controllers/paymentController');

router.get('/status', payment.getPaymentStatus);
router.get('/bank', authenticateToken, payment.getLinkedBank);
router.get('/method', authenticateToken, payment.getLinkedBank);
router.post('/method/setup', authenticateToken, payment.setupPaymentMethod);
router.post('/method/verify', authenticateToken, payment.verifyPaymentMethod);
router.post('/method/resend-otp', authenticateToken, payment.resendPaymentOtp);
router.post('/bank/link', authenticateToken, payment.setupPaymentMethod);
router.delete('/bank', authenticateToken, payment.unlinkBank);
router.delete('/method', authenticateToken, payment.unlinkBank);
router.get('/wallet', authenticateToken, payment.getWallet);
router.get('/packages', authenticateToken, payment.getPackages);
router.post('/topup/create-order', authenticateToken, payment.createTopupOrder);
router.post('/topup/verify', authenticateToken, payment.verifyTopup);
router.post('/purchase', authenticateToken, payment.purchaseWithWallet);
router.get('/withdraw/info', authenticateToken, payment.getWithdrawInfo);
router.post('/withdraw', authenticateToken, payment.requestWithdraw);
router.get('/history', authenticateToken, payment.getPaymentHistory);

module.exports = router;