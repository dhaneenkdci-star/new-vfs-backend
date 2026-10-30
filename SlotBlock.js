const mongoose = require('mongoose');

const slotBlockSchema = new mongoose.Schema({
  countryCode: { type: String, required: true },
  centerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Center', default: null },
  blockType: { type: String, enum: ['SLOT', 'DATE', 'CENTER', 'COUNTRY'], required: true },
  startDate: { type: String, default: '' },
  endDate: { type: String, default: '' },
  startTime: { type: String, default: '' },
  endTime: { type: String, default: '' },
  reason: { type: String, required: true },
  blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  active: { type: Boolean, default: true },
  unblockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  unblockedAt: { type: Date, default: null }
}, {
  timestamps: true
});

slotBlockSchema.index({ countryCode: 1, active: 1 });
slotBlockSchema.index({ centerId: 1, active: 1 });

module.exports = mongoose.model('SlotBlock', slotBlockSchema);
