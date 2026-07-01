const express = require('express');
const router = express.Router();
const levelController = require('../controllers/levelController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', levelController.getLevels);
router.get('/showcase', levelController.getShowcase);
router.post('/:levelNumber/purchase', levelController.purchaseLevel);
router.post('/equip', levelController.equipLevel);

module.exports = router;