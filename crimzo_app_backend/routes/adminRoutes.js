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

// Users
router.get('/users', adminController.getUsers);
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

module.exports = router;
