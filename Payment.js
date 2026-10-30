const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true },
  amount: { type: Number, required: true },
  transactionId: { type: String, required: true, unique: true },
  screenshot: { type: String }, // stores base64 screenshot
  gatewayResponse: { type: mongoose.Schema.Types.Mixed },
  status: { type: String, enum: ['SUCCESS', 'FAILED', 'REFUNDED', 'PENDING_VERIFICATION', 'REJECTED'], required: true }
}, {
  timestamps: true
});

paymentSchema.index({ appointmentId: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
