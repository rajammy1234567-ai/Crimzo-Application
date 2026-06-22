const router = require('express').Router();
const settings = require('../controllers/settingsController');

router.get('/billing', settings.getPublicBillingSettings);

module.exports = router;