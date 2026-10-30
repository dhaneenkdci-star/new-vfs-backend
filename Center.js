const mongoose = require('mongoose');

const centerSchema = new mongoose.Schema({
  name: { type: String, required: true },
  city: { type: String, required: true },
  timezone: { type: String, default: 'UTC' },
  address: { type: String, required: false },
  active: { type: Boolean, default: true },
  countryName: { type: String, required: true },
  countryCode: { type: String, required: true },
  countryFlag: { type: String, required: true }
}, {
  timestamps: true
});

centerSchema.index({ city: 1, active: 1 });
centerSchema.index({ countryCode: 1, active: 1 });

module.exports = mongoose.model('Center', centerSchema);
