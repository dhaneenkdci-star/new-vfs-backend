const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, unique: true, required: true },
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true, index: true },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', required: true },
  pdfData: { type: String } // Stores base64 of the generated PDF invoice
}, {
  timestamps: true
});

module.exports = mongoose.model('Invoice', invoiceSchema);
