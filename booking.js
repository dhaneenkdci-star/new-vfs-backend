const express = require('express');
const router = express.Router();
const { protect, verifyActiveSubscription } = require('../middleware/authMiddleware');
const bookingController = require('../controllers/Bookingcontroller');

// Public lookup endpoints
router.get('/centers', bookingController.getCenters);
router.get('/countries', bookingController.getCountries);
router.get('/centers-config', bookingController.getCentersConfig);
router.get('/centers-by-country', bookingController.getCentersByCountry);

// Slot availability
router.get('/slots', protect, verifyActiveSubscription, bookingController.getSlots);

// Email OTP verification
router.post('/otp/send', protect, bookingController.sendOtp);
router.post('/otp/verify', protect, bookingController.verifyOtp);

// Lock / payment / cancel flow
router.post('/lock', protect, verifyActiveSubscription, bookingController.lockSlot);
router.post('/payment', protect, verifyActiveSubscription, bookingController.submitPayment);
router.post('/cancel', protect, verifyActiveSubscription, bookingController.cancelAppointment);

// History
router.get('/history', protect, bookingController.getHistory);
router.get('/my-appointments', protect, bookingController.getMyAppointments); // legacy alias

// Legacy direct-create mapper
router.post('/create', protect, verifyActiveSubscription, bookingController.createLegacyBooking);

module.exports = router;
