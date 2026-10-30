const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const subscriptionController = require('../controllers/Subscriptioncontroller');

router.post('/purchase', protect, subscriptionController.purchase);
router.post('/renew', protect, subscriptionController.renew);
router.get('/history', protect, subscriptionController.getHistory);
router.get('/invoices', protect, subscriptionController.getInvoices);
router.get('/invoices/:id/download', protect, subscriptionController.downloadInvoice);
router.get('/notifications', protect, subscriptionController.getNotifications);
router.put('/notifications/:id/read', protect, subscriptionController.markNotificationRead);
router.get('/stats', protect, subscriptionController.getStats);

module.exports = router;
