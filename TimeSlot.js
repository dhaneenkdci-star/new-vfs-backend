const mongoose = require('mongoose');

const timeSlotSchema = new mongoose.Schema({
  date: { type: String, required: true }, // Store as "YYYY-MM-DD" string for simple exact date matching
  time: { type: String, required: true }, // e.g., "08:30"
  capacity: { type: Number, default: 5 },
  bookedCount: { type: Number, default: 0 }
}, {
  timestamps: true
});

// Create index for fast lookups
timeSlotSchema.index({ date: 1, time: 1 }, { unique: true });

module.exports = mongoose.model('TimeSlot', timeSlotSchema);
