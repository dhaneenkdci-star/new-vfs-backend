const mongoose = require('mongoose');

const agentNotificationSchema = new mongoose.Schema({
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, required: true }, // e.g. REGISTRATION_APPROVED, SUBSCRIPTION_EXPIRING
  read: { type: Boolean, default: false }
}, {
  timestamps: true
});

module.exports = mongoose.model('AgentNotification', agentNotificationSchema);
