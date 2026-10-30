const mongoose = require('mongoose');

const emergencyClosureSchema = new mongoose.Schema({
  countryCode: { type: String, required: true },
  centerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Center', required: false }, // null means country-wide
  closureType: { type: String, enum: ['COUNTRY_WIDE', 'FULL_DAY', 'MULTI_DAY', 'PARTIAL_DAY', 'CENTER_WIDE'], required: true },
  reason: { type: String, required: true },
  startDate: { type: String, required: true }, // format "YYYY-MM-DD"
  endDate: { type: String, required: true }, // format "YYYY-MM-DD"
  startTime: { type: String, required: false }, // format "HH:MM", optional for partial day
  endTime: { type: String, required: false }, // format "HH:MM", optional for partial day
  impactedSlotsCount: { type: Number, default: 0 },
  declaredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  declaredAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['ACTIVE', 'REOPENED'], default: 'ACTIVE' }
}, {
  timestamps: true
});

emergencyClosureSchema.index({ countryCode: 1, centerId: 1, status: 1 });

module.exports = mongoose.model('EmergencyClosure', emergencyClosureSchema);
