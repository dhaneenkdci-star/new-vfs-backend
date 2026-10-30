const mongoose = require('mongoose');

const emailVerificationSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true, 
    lowercase: true 
  },
  verified: { 
    type: Boolean, 
    default: false 
  },
  otpHash: { 
    type: String 
  },
  otpExpiresAt: { 
    type: Date 
  },
  sendAttempts: { 
    type: Number, 
    default: 0 
  },
  verifyAttempts: { 
    type: Number, 
    default: 0 
  },
  lastSentAt: { 
    type: Date 
  },
  blockUntil: { 
    type: Date 
  }
}, { 
  timestamps: true 
});

module.exports = mongoose.model('EmailVerification', emailVerificationSchema);
