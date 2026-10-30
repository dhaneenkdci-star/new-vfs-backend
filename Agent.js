const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const agentSchema = new mongoose.Schema({
  clerkId: { type: String, unique: true, sparse: true, index: true },
  agencyName: { type: String, required: true },
  ownerName: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String }, // optional for Clerk, used for local mock/fallback login
  mobile: { type: String, required: true },
  gstNumber: { type: String, required: true },
  panNumber: { type: String },
  businessRegNumber: { type: String },
  address: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  country: { type: String, required: true },
  logo: { type: String }, // stores base64 company logo
  status: { 
    type: String, 
    enum: ['Pending', 'Verified', 'Rejected', 'Blocked', 'Subscription Expired', 'Active'], 
    default: 'Pending' 
  },
  role: { type: String, enum: ['SUPER_ADMIN', 'Agent'], default: 'Agent' },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

// Match password
agentSchema.methods.matchPassword = async function(enteredPassword) {
  if (!this.password) return false;
  return await bcrypt.compare(enteredPassword, this.password);
};

// Encrypt password before saving
agentSchema.pre('save', async function(next) {
  if (!this.password || !this.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('Agent', agentSchema);
