const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
  planName: { type: String, default: 'Professional Agent Plan' },
  planAmount: { type: Number, default: 0.85 },
  gstAmount: { type: Number, default: 0.15 },
  totalAmount: { type: Number, default: 1 },
  invoiceNumber: { type: String, unique: true, required: true },
  paymentStatus: { 
    type: String, 
    enum: ['Pending', 'Paid', 'Failed', 'Pending Verification', 'Rejected'], 
    default: 'Pending' 
  },
  subscriptionStatus: { 
    type: String, 
    enum: ['Pending', 'Active', 'Expired', 'Cancelled', 'Verification Pending', 'Rejected'], 
    default: 'Pending' 
  },
  paymentDate: { type: Date },
  startDate: { type: Date },
  expiryDate: { type: Date },
  renewalDate: { type: Date },
  sentReminders: [{ type: String }], // keeps track of sent reminders e.g., '30_DAYS', '15_DAYS', etc.
  transactionId: { type: String },
  screenshot: { type: String }, // Base64 payment proof screenshot
  paymentDateTime: { type: String }, // optional time description
  notes: { type: String }, // optional remarks from agent
  rejectionRemarks: { type: String }, // remarks from admin if rejected
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent' }
}, {
  timestamps: true
});

module.exports = mongoose.model('Subscription', subscriptionSchema);
