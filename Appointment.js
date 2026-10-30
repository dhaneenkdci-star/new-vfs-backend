const mongoose = require('mongoose');

const applicantDetailsSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  passportNumber: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  dob: { type: Date, required: true },
  visaCategory: { type: String, required: true },
  location: { type: String, required: true },
  gender: { type: String, required: true },
  nationality: { type: String, required: true },
  passportDocument: { type: String, required: true },
  emailVerified: { type: Boolean, default: false }
}, { _id: false });

const appointmentSchema = new mongoose.Schema({
  referenceNumber: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', required: true },
  agencyName: { type: String },
  agentEmail: { type: String },
  agentPhone: { type: String },
  bookedBy: { type: String },
  supportingDocuments: [{ type: String }], // Array of base64 document files
  internalNotes: { type: String },
  applicantDetails: [applicantDetailsSchema],
  servicesSelected: [{
    name: { type: String, required: true },
    price: { type: Number, required: true }
  }],
  selectedServicesTotal: { type: Number, default: 0 },
  appointmentFee: { type: Number, default: 0 },
  gstAmount: { type: Number, default: 0 },
  centerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Center' },
  slotId: { type: mongoose.Schema.Types.ObjectId, ref: 'Slot' },
  bookingDate: { type: Date, required: true },
  bookingTime: { type: String, required: true },
  totalAmount: { type: Number, required: true },
  paymentStatus: { type: String, enum: ['Pending', 'Paid', 'Refunded', 'PENDING_PAYMENT', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'REFUND_PENDING', 'REFUNDED', 'Pending Verification', 'Payment Rejected'], default: 'Pending' },
  status: { 
    type: String, 
    enum: ['LOCKED', 'BOOKED', 'CANCELLED', 'EXPIRED', 'RESCHEDULE_REQUIRED', 'REFUND_PENDING', 'REFUNDED', 'PENDING_PAYMENT', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'Pending Verification', 'Payment Rejected'], 
    default: 'LOCKED' 
  },
  idempotencyKey: { type: String, default: null, index: true },
  applicationStatus: { 
    type: String, 
    enum: ['Processing', 'Proceed', 'Delivered', 'Delayed'],
    default: 'Processing'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Appointment', appointmentSchema);
