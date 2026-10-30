const mongoose = require('mongoose');

const slotLockSchema = new mongoose.Schema({
  slotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expiresAt: { type: Date, required: true }
}, {
  timestamps: true
});

// Compound index on slotId and userId to easily locate lock owners
slotLockSchema.index({ slotId: 1, userId: 1 });
// TTL index to automatically delete expired documents
slotLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('SlotLock', slotLockSchema);
