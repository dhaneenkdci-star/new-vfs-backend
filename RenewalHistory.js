const mongoose = require('mongoose');

const renewalHistorySchema = new mongoose.Schema({
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', required: true },
  previousExpiryDate: { type: Date },
  newExpiryDate: { type: Date },
  renewedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

module.exports = mongoose.model('RenewalHistory', renewalHistorySchema);
