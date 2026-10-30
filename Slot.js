const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema({
  centerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Center', required: true },
  date: { type: String, required: true }, // format "YYYY-MM-DD"
  startTime: { type: String, required: true }, // e.g., "08:30"
  endTime: { type: String, required: true }, // e.g., "08:45"
  capacity: { type: Number, required: true, default: 5 },
  bookedCount: { type: Number, default: 0, min: 0 },
  lockedCount: { type: Number, default: 0, min: 0 },
  availableCount: { type: Number, default: 5, min: 0 },
  status: { type: String, enum: ['AVAILABLE', 'BLOCKED'], default: 'AVAILABLE' }
}, {
  timestamps: true
});

slotSchema.pre('save', function(next) {
  if (this.isModified('capacity') || this.isModified('bookedCount') || this.isModified('lockedCount')) {
    this.availableCount = Math.max(0, this.capacity - this.bookedCount - this.lockedCount);
  }
  next();
});

// Compound index to speed up slot searches and enforce uniqueness per time range per center
slotSchema.index({ centerId: 1, date: 1, startTime: 1, endTime: 1 }, { unique: true });
slotSchema.index({ centerId: 1, date: 1, status: 1 });

module.exports = mongoose.model('Slot', slotSchema);
