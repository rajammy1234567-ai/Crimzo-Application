const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateAdmin } = require('../middleware/adminAuth');

// Public route for admin login
router.post('/login', adminController.adminLogin);

// Protected routes (require admin token)
router.use(authenticateAdmin);

// Dashboard
router.get('/dashboard', adminController.getDashboardStats);

// Billing (video call + live talk)
router.get('/billing/settings', adminController.getBillingSettings);
router.put('/billing/settings', adminController.updateBillingSettings);
router.get('/billing/sessions', adminController.getBillingSessions);
router.get('/billing/earnings', adminController.getBillingEarnings);

// Withdrawals (manual UPI/bank payouts)
router.get('/withdrawals', adminController.getWithdrawals);
router.put('/withdrawals/:id/complete', adminController.completeWithdrawal);
router.put('/withdrawals/:id/reject', adminController.rejectWithdrawal);

// Users
router.get('/users', adminController.getUsers);
router.get('/users/:id/transactions', adminController.getUserTransactions);
router.put('/users/:id/ban', adminController.toggleBanUser);
router.put('/users/:id/diamonds', adminController.updateDiamonds);

// Streams
router.get('/streams', adminController.getStreams);
router.put('/streams/:id/terminate', adminController.terminateStream);

// Reels
router.get('/reels', adminController.getReels);
router.delete('/reels/:id', adminController.deleteReel);

// Stickers
router.get('/stickers', adminController.getStickers);
router.post('/stickers', adminController.createSticker);
router.put('/stickers/:id', adminController.updateSticker);
router.delete('/stickers/:id', adminController.deleteSticker);

// Levels (user level ladder)
router.get('/levels', adminController.getLevels);
router.post('/levels', adminController.createLevel);
router.put('/levels/:id', adminController.updateLevel);
router.delete('/levels/:id', adminController.deleteLevel);

// Tasks (My Tasks — user rewards)
router.get('/tasks', adminController.getTasks);
router.post('/tasks', adminController.createTask);
router.put('/tasks/:id', adminController.updateTask);
router.delete('/tasks/:id', adminController.deleteTask);

module.exports = router;
