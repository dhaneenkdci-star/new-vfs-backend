const mongoose = require('mongoose');
const crypto = require('crypto');
const Center = require('../models/Center');
const Slot = require('../models/Slot');
const Appointment = require('../models/Appointment');
const Payment = require('../models/Payment');
const SlotBlock = require('../models/SlotBlock');
const SlotLock = require('../models/SlotLock');
const EmailVerification = require('../models/EmailVerification');
const AuditLog = require('../models/AuditLog');
const lockingService = require('../services/lockingService');
const queueService = require('../services/queueService');
const mailService = require('../services/mailService');
const feeService = require('../services/feeService');
const socketService = require('../services/socketService');
const { DEFAULT_SLOTS, isSlotBlocked, getActiveLocksMap } = require('../services/slotAvailabilityService');

// ==========================================
// PUBLIC LOOKUP ENDPOINTS
// ==========================================

exports.getCenters = async (req, res) => {
  try {
    const centers = await Center.find({ active: true });
    res.json(centers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getCountries = async (req, res) => {
  try {
    const { GOING_TO_COUNTRIES } = require('../config/masterData');
    res.json(GOING_TO_COUNTRIES);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getCentersConfig = async (req, res) => {
  try {
    const { CENTRES_CONFIG } = require('../config/masterData');
    res.json(CENTRES_CONFIG);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getCentersByCountry = async (req, res) => {
  const countryCode = req.query.countryCode ? req.query.countryCode.trim().toUpperCase() : null;
  if (!countryCode) {
    return res.status(400).json({ message: 'countryCode is required' });
  }

  try {
    const filteredCenters = await Center.find({ countryCode, active: true });
    res.json(filteredCenters);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET slots for a center/date, auto-initializing defaults and applying
// hierarchical block rules + active lock counts.
exports.getSlots = async (req, res) => {
  const { centerId, date } = req.query; // YYYY-MM-DD
  if (!centerId || !date) {
    return res.status(400).json({ message: 'centerId and date parameters are required' });
  }

  try {
    const center = await Center.findById(centerId);
    if (!center) {
      return res.status(404).json({ message: 'Visa Application Center not found.' });
    }
    if (!center.active) {
      return res.status(400).json({ message: 'The selected Visa Application Center is currently inactive.' });
    }

    let slots = await Slot.find({ centerId, date });

    // If no slots exist for this date, automatically initialize default slots (to support demo/testing)
    if (slots.length === 0) {
      const slotsToCreate = DEFAULT_SLOTS.map(s => ({
        centerId,
        date,
        startTime: s.startTime,
        endTime: s.endTime,
        capacity: 5,
        bookedCount: 0,
        status: 'AVAILABLE'
      }));
      slots = await Slot.insertMany(slotsToCreate);
    }

    const slotIds = slots.map(s => s._id);
    const locksMap = await getActiveLocksMap(slotIds);

    const countryCode = req.query.countryCode ? req.query.countryCode.trim().toUpperCase() : null;
    let activeBlocks = [];
    if (countryCode) {
      activeBlocks = await SlotBlock.find({ countryCode, active: true });
    }

    const formattedSlots = slots.map(s => {
      const lockedCount = locksMap[s._id.toString()] || 0;
      const blocked = isSlotBlocked(s, activeBlocks);
      const capacity = blocked ? 0 : s.capacity;
      return {
        _id: s._id,
        centerId: s.centerId,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        time: s.startTime, // fallback for legacy compatibility
        capacity,
        bookedCount: s.bookedCount,
        lockedCount,
        availableCount: blocked ? 0 : Math.max(0, capacity - s.bookedCount - lockedCount),
        status: blocked || s.status === 'BLOCKED' ? 'BLOCKED' : 'AVAILABLE'
      };
    });

    res.json(formattedSlots);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// EMAIL OTP VERIFICATION
// ==========================================

// Send OTP code to email
exports.sendOtp = async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ message: 'Email address is required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'Invalid email address format.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    let record = await EmailVerification.findOne({ email: normalizedEmail });
    if (!record) {
      record = new EmailVerification({ email: normalizedEmail });
    } else {
      record.verified = false;
    }

    if (record.blockUntil && record.blockUntil > new Date()) {
      const minutesLeft = Math.ceil((record.blockUntil - new Date()) / (60 * 1000));
      return res.status(400).json({
        message: `Too many attempts. Requests are blocked. Please try again after ${minutesLeft} minute(s).`
      });
    }

    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    if (record.lastSentAt && record.lastSentAt > tenMinutesAgo) {
      if (record.sendAttempts >= 3) {
        record.blockUntil = new Date(now.getTime() + 10 * 60 * 1000);
        record.sendAttempts = 0;
        await record.save();
        return res.status(400).json({
          message: 'Resend limit exceeded (maximum 3 attempts in 10 minutes). Requests blocked for 10 minutes.'
        });
      }
    } else {
      record.sendAttempts = 0;
    }

    if (record.lastSentAt && now - record.lastSentAt < 60 * 1000) {
      const secondsLeft = Math.ceil((60 * 1000 - (now - record.lastSentAt)) / 1000);
      return res.status(400).json({
        message: `Please wait ${secondsLeft} second(s) before requesting another OTP.`
      });
    }

    if (record.verified) {
      return res.json({ alreadyVerified: true, message: 'Email address is already verified.' });
    }

    const otpCode = crypto.randomInt(100000, 999999).toString();
    const otpHash = crypto.createHash('sha256').update(otpCode).digest('hex');

    record.otpHash = otpHash;
    record.otpExpiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes validity
    record.verifyAttempts = 0;
    record.sendAttempts += 1;
    record.lastSentAt = now;
    await record.save();

    await mailService.sendMail(
      {
        to: normalizedEmail,
        subject: 'VFS Global - Email Verification Code',
        html: `
        <div style="font-family: Arial, sans-serif; padding: 25px; color: #0c2340; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="color: #0c2340; margin: 0; font-size: 24px; font-weight: bold; border-bottom: 2px solid #dfa015; padding-bottom: 15px;">VFS Global</h2>
          </div>
          <p style="font-size: 16px; line-height: 1.5; color: #334155;">Dear Applicant,</p>
          <p style="font-size: 15px; line-height: 1.6; color: #334155;">To continue with your UK Visa Application Centre appointment booking, please verify your email address using the One-Time Password (OTP) below:</p>
          <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 20px; text-align: center; margin: 25px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #dfa015; font-family: monospace;">${otpCode}</span>
          </div>
          <p style="font-size: 14px; line-height: 1.5; color: #64748b; margin-top: 20px;">
            This code is highly sensitive and will expire in <strong>5 minutes</strong>. If you did not initiate this request, please secure your account immediately.
          </p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
          <p style="font-size: 12px; color: #94a3b8; text-align: center;">This is an automated notification. Please do not reply directly to this mail.</p>
        </div>
      `
      },
      'VFS Global Visa Booking'
    );
    console.log(`OTP sent successfully to ${normalizedEmail}`);

    res.json({ success: true, message: 'Verification code sent to your email address.' });
  } catch (err) {
    console.error('SMTP/OTP Send Error:', err.message);
    res.status(500).json({ message: 'Failed to send verification email. Please try again later.' });
  }
};

// Verify OTP code
exports.verifyOtp = async (req, res) => {
  const { email, otpCode } = req.body;
  if (!email || !otpCode) {
    return res.status(400).json({ message: 'Email and verification code are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const record = await EmailVerification.findOne({ email: normalizedEmail });
    if (!record || !record.otpHash) {
      return res.status(400).json({ message: 'No active OTP verification session found. Please request a code first.' });
    }

    if (new Date() > record.otpExpiresAt) {
      record.otpHash = undefined;
      record.otpExpiresAt = undefined;
      await record.save();
      return res.status(400).json({ message: 'Verification code has expired. Please request a new code.' });
    }

    if (record.verifyAttempts >= 5) {
      record.otpHash = undefined;
      record.otpExpiresAt = undefined;
      await record.save();
      return res.status(400).json({ message: 'Too many verification failures. Code has been invalidated. Please request a new OTP.' });
    }

    const incomingHash = crypto.createHash('sha256').update(otpCode.trim()).digest('hex');
    if (incomingHash === record.otpHash) {
      record.verified = true;
      record.otpHash = undefined;
      record.otpExpiresAt = undefined;
      record.verifyAttempts = 0;
      record.sendAttempts = 0;
      await record.save();

      console.log(`Email successfully verified: ${normalizedEmail}`);
      res.json({ success: true, message: 'Email address verified successfully.' });
    } else {
      record.verifyAttempts += 1;
      await record.save();

      const attemptsLeft = Math.max(0, 5 - record.verifyAttempts);
      res.status(400).json({
        message: `Incorrect code. ${attemptsLeft} attempt(s) remaining before code is invalidated.`
      });
    }
  } catch (err) {
    console.error('OTP Verification Error:', err.message);
    res.status(500).json({ message: 'Verification failed. Please try again.' });
  }
};

// Shared helper: verify every applicant's email has completed OTP verification.
async function assertApplicantsVerified(applicantDetails) {
  for (const applicant of applicantDetails || []) {
    const verification = await EmailVerification.findOne({
      email: applicant.email.trim().toLowerCase(),
      verified: true
    });
    if (!verification) {
      return `Email address ${applicant.email} must be verified via OTP before booking.`;
    }
  }
  return null;
}

// Shared helper: does an active SlotBlock cover this slot for the given country?
async function checkDynamicBlock(slot, countryCode) {
  if (!countryCode) return false;
  const activeBlocks = await SlotBlock.find({ countryCode, active: true });
  return isSlotBlocked(slot, activeBlocks);
}

// ==========================================
// LOCK / PAYMENT / CANCEL FLOW
// ==========================================

// 3. Lock slot during checkout flow
exports.lockSlot = async (req, res) => {
  const { slotId, applicantDetails, servicesSelected, totalAmount, idempotencyKey, supportingDocuments, internalNotes } = req.body;
  const userId = req.user._id;

  if (!slotId) {
    return res.status(400).json({ message: 'slotId is required' });
  }

  const primaryApplicant = applicantDetails && applicantDetails[0];
  if (!primaryApplicant || !primaryApplicant.email) {
    return res.status(400).json({ message: 'Primary applicant email is required' });
  }

  try {
    const verificationError = await assertApplicantsVerified(applicantDetails);
    if (verificationError) {
      return res.status(400).json({ message: verificationError });
    }

    if (idempotencyKey) {
      const existing = await Appointment.findOne({ idempotencyKey });
      if (existing) {
        return res.status(200).json({
          message: 'Duplicate request resolved from idempotency cache',
          appointment: existing,
          expiresAt: Date.now() + 10 * 60 * 1000
        });
      }
    }

    const slot = await Slot.findById(slotId);
    if (!slot) {
      return res.status(404).json({ message: 'Slot not found' });
    }

    const countryCode = req.body.countryCode ? req.body.countryCode.trim().toUpperCase() : null;
    if (await checkDynamicBlock(slot, countryCode)) {
      return res.status(400).json({ message: 'This slot is currently blocked and unavailable for booking.' });
    }

    if (slot.status === 'BLOCKED') {
      return res.status(400).json({ message: 'This time slot is blocked' });
    }

    const acquired = await lockingService.acquireLock(slotId, userId.toString(), slot);
    if (!acquired) {
      return res.status(400).json({ message: 'Selected time slot is already fully reserved or locked.' });
    }

    let referenceNumber;
    let exists = true;
    while (exists) {
      const randNum = Math.floor(100000 + Math.random() * 900000);
      referenceNumber = `VFS-GBR-${randNum}`;
      const existingAppt = await Appointment.findOne({ referenceNumber });
      if (!existingAppt) exists = false;
    }

    const center = await Center.findById(slot.centerId);
    const centerCountryCode = center ? center.countryCode : '';
    const centerName = center ? center.name : '';

    const applicantCount = (applicantDetails || []).length || 1;
    const { scaledServicesSelected, selectedServicesTotal, appointmentFee, gstAmount, calculatedTotal } =
      feeService.buildLockPricing(applicantCount, centerCountryCode, centerName);

    const appointment = new Appointment({
      referenceNumber,
      userId,
      agencyName: req.user.agencyName,
      agentEmail: req.user.email,
      agentPhone: req.user.mobile,
      bookedBy: req.user.ownerName,
      supportingDocuments: supportingDocuments || [],
      internalNotes: internalNotes || '',
      centerId: slot.centerId,
      slotId: slot._id,
      applicantDetails: applicantDetails || [],
      servicesSelected: scaledServicesSelected,
      selectedServicesTotal,
      appointmentFee,
      gstAmount,
      bookingDate: new Date(slot.date),
      bookingTime: slot.startTime,
      totalAmount: calculatedTotal,
      paymentStatus: 'Pending',
      status: 'LOCKED',
      applicationStatus: 'Processing',
      idempotencyKey: idempotencyKey || null
    });

    await appointment.save();

    await queueService.addExpirationJob(appointment._id.toString(), slotId);

    const refreshedSlot = await Slot.findById(slotId);
    await socketService.broadcastSlotUpdate(refreshedSlot);

    res.status(201).json({
      message: 'Slot locked successfully',
      appointment,
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 4. Complete booking with Simulated Payment
exports.submitPayment = async (req, res) => {
  const { appointmentId, transactionId, screenshot } = req.body;
  const userId = req.user._id;

  if (!transactionId) {
    return res.status(400).json({ message: 'Transaction / Reference ID is required.' });
  }
  if (!screenshot) {
    return res.status(400).json({ message: 'Payment screenshot is required.' });
  }

  try {
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (appointment.status !== 'LOCKED') {
      return res.status(400).json({ message: 'Lock on this appointment slot has expired or already completed' });
    }

    const isOwner = await lockingService.isLockOwner(appointment.slotId.toString(), userId.toString());
    if (!isOwner) {
      return res.status(403).json({ message: 'Unauthorized. You do not hold the lock on this slot.' });
    }

    const slot = await Slot.findById(appointment.slotId);
    if (!slot) {
      return res.status(404).json({ message: 'Slot not found' });
    }

    const existingPayment = await Payment.findOne({ transactionId });
    if (existingPayment) {
      return res.status(400).json({ message: 'This Transaction/Reference ID has already been submitted.' });
    }

    appointment.status = 'Pending Verification';
    appointment.paymentStatus = 'Pending Verification';
    await appointment.save();

    const payment = new Payment({
      appointmentId,
      amount: appointment.totalAmount,
      transactionId,
      screenshot,
      gatewayResponse: { manualVerification: true },
      status: 'PENDING_VERIFICATION'
    });
    await payment.save();

    // Extend SlotLock expiration to 7 days so it doesn't expire during admin review
    await SlotLock.findOneAndUpdate(
      { slotId: appointment.slotId, userId },
      { expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) }
    );

    await AuditLog.create({
      action: 'SUBMIT_PAYMENT_PROOF',
      performedBy: userId,
      userId,
      entityType: 'Appointment',
      entityId: appointment._id.toString(),
      newValue: { appointmentId, amount: appointment.totalAmount, transactionId },
      ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    await socketService.broadcastSlotUpdate(slot);

    res.json({
      message: 'Payment proof submitted successfully. Pending admin verification.',
      appointment,
      payment
    });
  } catch (error) {
    try {
      await AuditLog.create({
        action: 'PAYMENT_FAILURE',
        performedBy: userId,
        userId,
        entityType: 'Appointment',
        entityId: appointmentId,
        newValue: { error: error.message },
        ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
        userAgent: req.headers['user-agent'] || ''
      });
    } catch (auditErr) {}
    res.status(500).json({ message: error.message });
  }
};

// 5. Cancel Appointment
exports.cancelAppointment = async (req, res) => {
  const { appointmentId } = req.body;

  try {
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (appointment.status === 'CANCELLED') {
      return res.status(400).json({ message: 'Appointment is already cancelled' });
    }

    appointment.status = 'CANCELLED';
    await appointment.save();

    await AuditLog.create({
      action: 'CANCEL_BOOKING',
      performedBy: req.user._id,
      userId: req.user._id,
      entityType: 'Appointment',
      entityId: appointment._id.toString(),
      ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    const slot = await Slot.findById(appointment.slotId);
    if (slot && slot.bookedCount > 0) {
      slot.bookedCount -= 1;
      await slot.save();
      await socketService.broadcastSlotUpdate(slot);
    }

    res.json({ message: 'Appointment cancelled successfully.', appointment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 6. Get user history
exports.getHistory = async (req, res) => {
  try {
    const appointments = await Appointment.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 7. Legacy mapping for backwards compatibility
exports.getMyAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Legacy slot creation mapper - maps a direct booking wizard submit into a
// single lock + pay sequence.
exports.createLegacyBooking = async (req, res) => {
  const { applicantDetails, servicesSelected, bookingDate, bookingTime, totalAmount, supportingDocuments, internalNotes } = req.body;

  const primaryApplicant = applicantDetails && applicantDetails[0];
  if (!primaryApplicant || !primaryApplicant.email) {
    return res.status(400).json({ message: 'Primary applicant email is required' });
  }

  try {
    const verificationError = await assertApplicantsVerified(applicantDetails);
    if (verificationError) {
      return res.status(400).json({ message: verificationError });
    }

    let slot = await Slot.findOne({ date: bookingDate, startTime: bookingTime });
    if (!slot) {
      const defaultCenter = (await Center.findOne()) || { _id: new mongoose.Types.ObjectId() };
      slot = new Slot({
        centerId: defaultCenter._id,
        date: bookingDate,
        startTime: bookingTime,
        endTime: bookingTime,
        capacity: 5,
        bookedCount: 0,
        lockedCount: 0,
        status: 'AVAILABLE'
      });
      await slot.save();
    }

    const countryCode = req.body.countryCode ? req.body.countryCode.trim().toUpperCase() : null;
    if (await checkDynamicBlock(slot, countryCode)) {
      return res.status(400).json({ message: 'This slot is currently blocked and unavailable for booking.' });
    }

    if (slot.status === 'BLOCKED') {
      return res.status(400).json({ message: 'This time slot is blocked' });
    }

    const acquired = await lockingService.acquireLock(slot._id.toString(), req.user._id.toString(), slot);
    if (!acquired) {
      return res.status(400).json({ message: 'Selected time slot is already fully reserved.' });
    }

    let referenceNumber;
    let exists = true;
    while (exists) {
      const randNum = Math.floor(100000 + Math.random() * 900000);
      referenceNumber = `VFS-GBR-${randNum}`;
      const existingAppt = await Appointment.findOne({ referenceNumber });
      if (!existingAppt) exists = false;
    }

    const applicantCount = (applicantDetails || []).length || 1;
    const { scaledServicesSelected, selectedServicesTotal, appointmentFee, gstAmount, calculatedTotal } =
      feeService.buildCreatePricing(applicantCount, servicesSelected);

    const appointment = new Appointment({
      referenceNumber,
      userId: req.user._id,
      agencyName: req.user.agencyName,
      agentEmail: req.user.email,
      agentPhone: req.user.mobile,
      bookedBy: req.user.ownerName,
      supportingDocuments: supportingDocuments || [],
      internalNotes: internalNotes || '',
      centerId: slot.centerId,
      slotId: slot._id,
      applicantDetails,
      servicesSelected: scaledServicesSelected,
      selectedServicesTotal,
      appointmentFee,
      gstAmount,
      bookingDate: new Date(bookingDate),
      bookingTime,
      totalAmount: calculatedTotal,
      paymentStatus: 'Paid',
      status: 'BOOKED',
      applicationStatus: 'Processing'
    });
    await appointment.save();

    slot.bookedCount += 1;
    await slot.save();

    const payment = new Payment({
      appointmentId: appointment._id,
      amount: totalAmount,
      transactionId: `TXN-${Math.floor(10000000 + Math.random() * 90000000)}`,
      status: 'SUCCESS'
    });
    await payment.save();

    await lockingService.releaseLock(slot._id.toString(), req.user._id.toString());

    await socketService.broadcastSlotUpdate(slot);

    res.status(201).json(appointment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};