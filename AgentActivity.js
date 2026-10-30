const mongoose = require('mongoose');

const agentActivitySchema = new mongoose.Schema({
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
  activity: { type: String, required: true },
  ipAddress: { type: String },
  userAgent: { type: String }
}, {
  timestamps: true
});

module.exports = mongoose.model('AgentActivity', agentActivitySchema);
