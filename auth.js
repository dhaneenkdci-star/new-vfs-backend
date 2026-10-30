const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { validateAgentRegister, validateLogin } = require('../middleware/validators');
const { asyncHandler } = require('../utils/asyncHandler');
const {
  registerAgent,
  loginAgent,
  googleAuth,
  adminLogin,
  getProfile,
} = require('../controllers/authController');

router.post('/register', validateAgentRegister, asyncHandler(registerAgent));
router.post('/login', validateLogin, asyncHandler(loginAgent));
router.post('/google', asyncHandler(googleAuth));
router.post('/admin-login', asyncHandler(adminLogin));
router.get('/me', protect, asyncHandler(getProfile));

module.exports = router;
