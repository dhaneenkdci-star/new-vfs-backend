const mongoose = require('mongoose');
const Appointment = require('../models/Appointment');
const Agent = require('../models/Agent');
const Slot = require('../models/Slot');
const Center = require('../models/Center');
const SlotBlock = require('../models/SlotBlock');
const SlotLock = require('../models/SlotLock');
const EmergencyClosure = require('../models/EmergencyClosure');
const AuditLog = require('../models/AuditLog');
const Payment = require('../models/Payment');
const Subscription = require('../models/Subscription');
const Invoice = require('../models/Invoice');
const RenewalHistory = require('../models/RenewalHistory');
const AgentNotification = require('../models/AgentNotification');

const { logAuditAction } = require('../services/auditService');
const mailService = require('../services/mailService');
const socketService = require('../services/socketService');
const { isSlotBlocked, DEFAULT_SLOTS, getActiveLocksMap } = require('../services/slotAvailabilityService');

// ==========================================
// LEGACY COMPATIBLE ENDPOINTS
// ==========================================

// Get all appointments (Admin/Supervisor only)
exports.getAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find()
      .populate('userId', 'agencyName ownerName email mobile')
      .populate('centerId', 'name city')
      .sort({ createdAt: -1 });
    res.json(appointments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update appointment status (Admin only)
exports.updateAppointmentStatus = async (req, res) => {
  const { applicationStatus } = req.body;
  const validStatuses = ['Processing', 'Proceed', 'Delivered', 'Delayed'];

  if (!validStatuses.includes(applicationStatus)) {
    return res.status(400).json({ message: 'Invalid status' });
  }

  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid Appointment ID' });
  }

  try {
    const appointment = await Appointment.findById(req.params.id);
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    const oldStatus = appointment.applicationStatus;
    appointment.applicationStatus = applicationStatus;
    await appointment.save();

    await logAuditAction(req, 'UPDATE_APPOINTMENT_STATUS', 'Appointment', appointment._id, { status: oldStatus }, { status: applicationStatus });

    res.json(appointment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get admin stats (Admin/Supervisor only)
exports.getStats = async (req, res) => {
  try {
    const totalAppointments = await Appointment.countDocuments();
    const appointments = await Appointment.find();

    let totalRevenue = 0;
    const servicesCount = {};

    appointments.forEach(appt => {
      totalRevenue += appt.totalAmount || 0;
      appt.servicesSelected.forEach(service => {
        servicesCount[service.name] = (servicesCount[service.name] || 0) + 1;
      });
    });

    res.json({ totalAppointments, totalRevenue, servicesCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all registered users (Admin only)
exports.getUsers = async (req, res) => {
  try {
    const users = await Agent.find({ role: { $ne: 'SUPER_ADMIN' } }).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// AUDIT LOGS
// ==========================================

// Get Audit Logs with Filters
exports.getAuditLogs = async (req, res) => {
  const { country, centerId, adminUser, actionType, startDate, endDate } = req.query;
  const query = {};

  if (actionType) {
    if (actionType === 'Block Created') {
      query.action = 'BLOCK_SLOTS_HIERARCHICAL';
    } else if (actionType === 'Block Removed') {
      query.action = { $in: ['UNBLOCK_SLOTS_HIERARCHICAL', 'UNBLOCK_SLOTS_BULK'] };
    } else if (actionType === 'Capacity Modified') {
      query.action = 'UPDATE_CAPACITY';
    }
  } else {
    query.action = { $in: ['BLOCK_SLOTS_HIERARCHICAL', 'UNBLOCK_SLOTS_HIERARCHICAL', 'UNBLOCK_SLOTS_BULK', 'UPDATE_CAPACITY'] };
  }

  if (adminUser && mongoose.Types.ObjectId.isValid(adminUser)) {
    query.performedBy = adminUser;
  }

  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
  }

  try {
    const logs = await AuditLog.find(query)
      .populate('performedBy', 'name email')
      .sort({ timestamp: -1 });

    const populatedLogs = await Promise.all(
      logs.map(async log => {
        let centerName = '';
        if (log.newValue && log.newValue.centerId) {
          const center = await Center.findById(log.newValue.centerId);
          if (center) centerName = center.name;
        }
        return {
          _id: log._id,
          action: log.action,
          performedBy: log.performedBy,
          timestamp: log.timestamp,
          ipAddress: log.ipAddress,
          countryCode: log.newValue?.countryCode || 'N/A',
          centerName: centerName || log.newValue?.centerName || 'All Centers',
          date: log.newValue?.date || 'N/A',
          timeSlot: log.newValue?.timeSlot || 'N/A',
          previousValue: log.newValue?.previousValue || (log.oldValue ? JSON.stringify(log.oldValue) : 'N/A'),
          newValue: log.newValue?.newValue || (log.newValue ? JSON.stringify(log.newValue) : 'N/A'),
          reason: log.newValue?.reason || 'N/A'
        };
      })
    );

    let filteredLogs = populatedLogs;
    if (country) {
      filteredLogs = filteredLogs.filter(l => l.countryCode.toLowerCase() === country.toLowerCase());
    }
    if (centerId) {
      filteredLogs = filteredLogs.filter(l => l.centerName.toLowerCase().includes(centerId.toLowerCase()));
    }

    res.json(filteredLogs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// SLOT MANAGEMENT
// ==========================================

// Create Slot
exports.createSlot = async (req, res) => {
  const { centerId, date, startTime, endTime, capacity } = req.body;
  if (!centerId || !date || !startTime || !endTime) {
    return res.status(400).json({ message: 'All slot parameters are required' });
  }

  try {
    const center = await Center.findById(centerId);
    if (!center) {
      return res.status(404).json({ message: 'Center not found' });
    }
    if (!center.active) {
      return res.status(400).json({ message: 'Cannot allocate slots to an inactive center' });
    }

    const existing = await Slot.findOne({ centerId, date, startTime, endTime });
    if (existing) {
      return res.status(400).json({ message: 'A slot for this date and time range already exists.' });
    }

    const newSlot = new Slot({
      centerId,
      date,
      startTime,
      endTime,
      capacity: capacity || 5,
      bookedCount: 0,
      status: 'AVAILABLE'
    });
    await newSlot.save();

    await logAuditAction(req, 'CREATE_SLOT', 'Slot', newSlot._id, null, newSlot);

    res.status(201).json(newSlot);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Block slots for full date
exports.blockDate = async (req, res) => {
  const { centerId, date } = req.body;
  if (!centerId || !date) {
    return res.status(400).json({ message: 'centerId and date are required' });
  }

  if (!mongoose.Types.ObjectId.isValid(centerId)) {
    return res.status(400).json({ message: 'Invalid Center ID' });
  }

  try {
    await Slot.updateMany({ centerId, date }, { $set: { status: 'BLOCKED' } });

    await logAuditAction(req, 'BLOCK_DATE', 'Center', centerId, null, { centerId, date });

    res.json({ message: `Successfully blocked all slots on ${date}` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Capacity configuration update
exports.updateCapacity = async (req, res) => {
  const { slotId, newCapacity } = req.body;
  if (!slotId || newCapacity === undefined) {
    return res.status(400).json({ message: 'slotId and newCapacity are required' });
  }

  if (!mongoose.Types.ObjectId.isValid(slotId)) {
    return res.status(400).json({ message: 'Invalid Slot ID' });
  }

  try {
    const slot = await Slot.findById(slotId);
    if (!slot) {
      return res.status(404).json({ message: 'Slot not found' });
    }

    if (newCapacity < slot.bookedCount) {
      return res.status(400).json({ message: `New capacity cannot be lower than current bookings (${slot.bookedCount})` });
    }

    const oldCapacity = slot.capacity;
    slot.capacity = newCapacity;
    await slot.save();

    const centerObj = await Center.findById(slot.centerId);
    await logAuditAction(req, 'UPDATE_CAPACITY', 'Slot', slot._id, null, {
      countryCode: 'All',
      centerId: slot.centerId,
      centerName: centerObj ? centerObj.name : 'Unknown',
      date: slot.date,
      timeSlot: `${slot.startTime} - ${slot.endTime}`,
      reason: 'Capacity Configured',
      previousValue: `Capacity: ${oldCapacity}`,
      newValue: `Capacity: ${newCapacity}`
    });

    await socketService.broadcastSlotUpdate(slot);

    res.json({ message: 'Capacity configured successfully.', slot });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Emergency closure (cancel bookings, reset counts, trigger logs) - simple center+date variant
exports.emergencyClose = async (req, res) => {
  const { centerId, date } = req.body;
  if (!centerId || !date) {
    return res.status(400).json({ message: 'centerId and date are required' });
  }

  if (!mongoose.Types.ObjectId.isValid(centerId)) {
    return res.status(400).json({ message: 'Invalid Center ID' });
  }

  try {
    const slots = await Slot.find({ centerId, date });
    const slotIds = slots.map(s => s._id);

    const activeAppointments = await Appointment.find({
      slotId: { $in: slotIds },
      status: { $in: ['LOCKED', 'BOOKED'] }
    });

    for (const appt of activeAppointments) {
      appt.status = 'CANCELLED';
      appt.paymentStatus = 'REFUNDED';
      await appt.save();

      console.log(`Emergency Closure simulation: Refunded / Cancelled appointment ${appt.referenceNumber}`);
    }

    await Slot.updateMany({ centerId, date }, { $set: { status: 'BLOCKED', bookedCount: 0 } });

    await SlotLock.deleteMany({ slotId: { $in: slotIds } });

    await logAuditAction(req, 'EMERGENCY_CLOSURE', 'Center', centerId, null, { centerId, date, cancelledBookingsCount: activeAppointments.length });

    slots.forEach(slot => {
      socketService.broadcastSlotEvent({
        slotId: slot._id,
        bookedCount: 0,
        lockedCount: 0,
        capacity: slot.capacity
      });
    });

    res.json({
      message: `Emergency closure processed. Cancelled ${activeAppointments.length} appointments, refunded transactions, and blocked dates.`,
      cancelledCount: activeAppointments.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Bulk upload slots via CSV text parsing
exports.bulkUploadSlots = async (req, res) => {
  const { centerId, csvText } = req.body;
  if (!centerId || !csvText) {
    return res.status(400).json({ message: 'centerId and csvText are required' });
  }

  if (!mongoose.Types.ObjectId.isValid(centerId)) {
    return res.status(400).json({ message: 'Invalid Center ID' });
  }

  try {
    const center = await Center.findById(centerId);
    if (!center) {
      return res.status(404).json({ message: 'Center not found' });
    }
    if (!center.active) {
      return res.status(400).json({ message: 'Cannot upload slots to an inactive center.' });
    }

    const lines = csvText.split('\n');
    let totalRecords = 0;
    let successCount = 0;
    let failedCount = 0;
    const errorDetails = [];
    const slotsCreated = [];

    let startIndex = 0;
    if (lines.length > 0 && lines[0].toLowerCase().includes('date')) {
      startIndex = 1;
    }

    for (let i = startIndex; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) continue;

      totalRecords++;

      const parts = line.split(',');
      if (parts.length < 4) {
        failedCount++;
        errorDetails.push({ line: i + 1, detail: 'Invalid format. Expected: date,startTime,endTime,capacity' });
        continue;
      }

      const [dateStr, startTimeStr, endTimeStr, capacityStr] = parts;
      const date = dateStr.trim();
      const startTime = startTimeStr.trim();
      const endTime = endTimeStr.trim();
      const capacity = parseInt(capacityStr.trim(), 10);

      if (!date || !startTime || !endTime || isNaN(capacity)) {
        failedCount++;
        errorDetails.push({ line: i + 1, detail: 'Invalid fields: check date, times, and capacity values.' });
        continue;
      }

      const existing = await Slot.findOne({ centerId, date, startTime, endTime });
      if (existing) {
        failedCount++;
        errorDetails.push({ line: i + 1, detail: `Duplicate slot: ${date} ${startTime}-${endTime} already exists.` });
        continue;
      }

      try {
        const slot = new Slot({
          centerId,
          date,
          startTime,
          endTime,
          capacity,
          bookedCount: 0,
          status: 'AVAILABLE'
        });
        await slot.save();
        slotsCreated.push(slot);
        successCount++;
      } catch (err) {
        failedCount++;
        errorDetails.push({ line: i + 1, detail: err.message });
      }
    }

    await logAuditAction(req, 'BULK_UPLOAD_SLOTS', 'Center', centerId, null, { centerId, count: slotsCreated.length });

    res.json({
      message: `Bulk upload completed: ${successCount} successful, ${failedCount} failed.`,
      totalRecords,
      successCount,
      failedCount,
      errorDetails,
      slots: slotsCreated
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// HIERARCHICAL SLOT BLOCKING
// ==========================================

// Hierarchical Block Endpoint
exports.blockSlotsHierarchical = async (req, res) => {
  const { countryCode, centerId, blockType, startDate, endDate, startTime, endTime, reason } = req.body;
  if (!countryCode || !blockType || !reason) {
    return res.status(400).json({ message: 'countryCode, blockType, and reason are required' });
  }

  const cCode = countryCode.trim().toUpperCase();

  try {
    if (blockType !== 'COUNTRY' && !centerId) {
      return res.status(400).json({ message: 'centerId is required for center, date, or slot level blocking' });
    }

    if (centerId) {
      if (!mongoose.Types.ObjectId.isValid(centerId)) {
        return res.status(400).json({ message: 'Invalid Center ID' });
      }
      const center = await Center.findById(centerId);
      if (!center) {
        return res.status(404).json({ message: 'Center not found' });
      }
      if (!center.active) {
        return res.status(400).json({ message: 'Cannot apply block to an inactive center.' });
      }
    }

    const duplicate = await SlotBlock.findOne({
      countryCode: cCode,
      centerId: centerId || null,
      blockType,
      startDate: startDate || '',
      endDate: endDate || '',
      startTime: startTime || '',
      endTime: endTime || '',
      active: true
    });

    if (duplicate) {
      return res.status(400).json({ message: 'A duplicate active blocking record already exists.' });
    }

    const countryBlock = await SlotBlock.findOne({ countryCode: cCode, blockType: 'COUNTRY', active: true });
    if (countryBlock) {
      return res.status(400).json({ message: `A country-level block is already active for ${cCode}.` });
    }

    if (blockType !== 'COUNTRY') {
      const centerBlock = await SlotBlock.findOne({ countryCode: cCode, centerId, blockType: 'CENTER', active: true });
      if (centerBlock) {
        return res.status(400).json({ message: `A center-level block is already active for this center under country ${cCode}.` });
      }
    }

    if (blockType === 'DATE' || blockType === 'SLOT') {
      const dateBlocks = await SlotBlock.find({
        countryCode: cCode,
        centerId,
        blockType: 'DATE',
        active: true
      });

      for (const db of dateBlocks) {
        const reqStart = startDate;
        const reqEnd = blockType === 'DATE' ? endDate : startDate;

        if (reqStart <= db.endDate && reqEnd >= db.startDate) {
          return res.status(400).json({ message: `The date range overlaps with an active Date Block (${db.startDate} to ${db.endDate}).` });
        }
      }
    }

    if (blockType === 'SLOT') {
      const matchingSlotBlock = await SlotBlock.findOne({
        countryCode: cCode,
        centerId,
        blockType: 'SLOT',
        startDate,
        startTime,
        endTime,
        active: true
      });
      if (matchingSlotBlock) {
        return res.status(400).json({ message: `The slot ${startTime} - ${endTime} is already blocked.` });
      }
    }

    const blockRecord = new SlotBlock({
      countryCode: cCode,
      centerId: centerId || null,
      blockType,
      startDate: startDate || '',
      endDate: endDate || '',
      startTime: startTime || '',
      endTime: endTime || '',
      reason,
      blockedBy: req.user._id,
      active: true
    });
    await blockRecord.save();

    const CenterObj = centerId ? await Center.findById(centerId) : null;
    await logAuditAction(req, 'BLOCK_SLOTS_HIERARCHICAL', 'SlotBlock', blockRecord._id, null, {
      countryCode: blockRecord.countryCode,
      centerId: blockRecord.centerId,
      centerName: CenterObj ? CenterObj.name : 'All Centers',
      date: blockRecord.startDate ? (blockRecord.startDate === blockRecord.endDate ? blockRecord.startDate : `${blockRecord.startDate} to ${blockRecord.endDate}`) : 'All Dates',
      timeSlot: blockRecord.startTime ? `${blockRecord.startTime} - ${blockRecord.endTime}` : 'All Day',
      reason: blockRecord.reason,
      previousValue: 'Available',
      newValue: 'Blocked'
    });

    socketService.broadcastSlotEvent({ blockCreated: true });

    res.status(201).json({ message: 'Slots blocked successfully', blockRecord });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Unblock Endpoint
exports.unblockSlotsHierarchical = async (req, res) => {
  const { blockId } = req.body;
  if (!blockId) {
    return res.status(400).json({ message: 'blockId is required' });
  }

  if (!mongoose.Types.ObjectId.isValid(blockId)) {
    return res.status(400).json({ message: 'Invalid Block ID' });
  }

  try {
    const blockRecord = await SlotBlock.findById(blockId);
    if (!blockRecord) {
      return res.status(404).json({ message: 'Blocking record not found' });
    }

    if (!blockRecord.active) {
      return res.status(400).json({ message: 'This blocking record is already inactive.' });
    }

    blockRecord.active = false;
    blockRecord.unblockedBy = req.user._id;
    blockRecord.unblockedAt = new Date();
    await blockRecord.save();

    const CenterObj = blockRecord.centerId ? await Center.findById(blockRecord.centerId) : null;
    await logAuditAction(req, 'UNBLOCK_SLOTS_HIERARCHICAL', 'SlotBlock', blockRecord._id, null, {
      countryCode: blockRecord.countryCode,
      centerId: blockRecord.centerId,
      centerName: CenterObj ? CenterObj.name : 'All Centers',
      date: blockRecord.startDate ? (blockRecord.startDate === blockRecord.endDate ? blockRecord.startDate : `${blockRecord.startDate} to ${blockRecord.endDate}`) : 'All Dates',
      timeSlot: blockRecord.startTime ? `${blockRecord.startTime} - ${blockRecord.endTime}` : 'All Day',
      reason: 'Unblocked by Admin',
      previousValue: 'Blocked',
      newValue: 'Available'
    });

    socketService.broadcastSlotEvent({ blockReleased: true });

    res.json({ message: 'Slots unblocked successfully', blockRecord });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Bulk Unblock Endpoint
exports.unblockSlotsBulk = async (req, res) => {
  const { blockIds } = req.body;
  if (!blockIds || !Array.isArray(blockIds)) {
    return res.status(400).json({ message: 'blockIds array is required' });
  }

  try {
    const result = await SlotBlock.updateMany(
      { _id: { $in: blockIds }, active: true },
      {
        $set: {
          active: false,
          unblockedBy: req.user._id,
          unblockedAt: new Date()
        }
      }
    );

    await logAuditAction(req, 'UNBLOCK_SLOTS_BULK', 'SlotBlock', null, null, {
      countryCode: 'Multiple',
      centerName: 'Multiple Centers',
      date: 'N/A',
      timeSlot: 'N/A',
      reason: `Bulk Unblocked ${result.modifiedCount} records`,
      previousValue: 'Blocked',
      newValue: 'Available'
    });

    socketService.broadcastSlotEvent({ blockReleased: true });

    res.json({ message: `Successfully unblocked ${result.modifiedCount} slot restrictions.`, count: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET slots month-summary for calendar view
exports.getMonthSummary = async (req, res) => {
  const { month, centerId, countryCode } = req.query;
  if (!month || !centerId || !countryCode) {
    return res.status(400).json({ message: 'month, centerId, and countryCode parameters are required' });
  }

  try {
    const year = parseInt(month.split('-')[0], 10);
    const monthIndex = parseInt(month.split('-')[1], 10) - 1;

    const startDate = new Date(year, monthIndex, 1);
    const endDate = new Date(year, monthIndex + 1, 0);

    const dates = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0]);
    }

    const activeBlocks = await SlotBlock.find({ countryCode: countryCode.trim().toUpperCase(), active: true });

    const summaries = {};

    for (const date of dates) {
      const day = new Date(date).getDay();
      if (day === 0 || day === 6) {
        summaries[date] = 'Closed';
        continue;
      }

      let slots = await Slot.find({ centerId, date });
      if (slots.length === 0) {
        slots = DEFAULT_SLOTS.map(s => ({
          centerId,
          date,
          startTime: s.startTime,
          endTime: s.endTime,
          capacity: 5,
          bookedCount: 0,
          lockedCount: 0,
          status: 'AVAILABLE'
        }));
      }

      const locksMap = await getActiveLocksMap(slots.map(s => s._id));

      let totalSlots = slots.length;
      let blockedCount = 0;
      let fullCount = 0;

      slots.forEach(s => {
        const lockedCount = locksMap[s._id?.toString()] || 0;
        const blocked = isSlotBlocked(s, activeBlocks);
        if (blocked || s.status === 'BLOCKED') {
          blockedCount++;
        } else {
          const avail = Math.max(0, s.capacity - s.bookedCount - lockedCount);
          if (avail === 0) {
            fullCount++;
          }
        }
      });

      let status = 'Available';
      if (blockedCount === totalSlots) {
        status = 'Fully Blocked';
      } else if (blockedCount > 0) {
        status = 'Partially Blocked';
      } else if (fullCount === totalSlots) {
        status = 'Capacity Full';
      }

      summaries[date] = status;
    }

    res.json(summaries);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Blocks History Endpoint
exports.getBlocksHistory = async (req, res) => {
  try {
    const blocks = await SlotBlock.find()
      .populate('blockedBy', 'name email')
      .populate('unblockedBy', 'name email')
      .populate('centerId', 'name city')
      .sort({ createdAt: -1 });
    res.json(blocks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update Slot Availability by ID (toggles or updates status/capacity)
exports.updateSlotAvailability = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ success: false, message: 'Invalid Slot ID' });
  }
  const { status, capacity } = req.body;

  try {
    const slot = await Slot.findById(req.params.id);
    if (!slot) {
      return res.status(404).json({ success: false, message: 'Slot not found' });
    }

    const oldVal = { capacity: slot.capacity, status: slot.status };

    if (capacity !== undefined) {
      const parsedCapacity = parseInt(capacity, 10);
      if (isNaN(parsedCapacity) || parsedCapacity < 0) {
        return res.status(400).json({ success: false, message: 'Invalid capacity count' });
      }
      if (parsedCapacity < slot.bookedCount) {
        return res.status(400).json({ success: false, message: `Capacity cannot be lower than booked count (${slot.bookedCount})` });
      }
      slot.capacity = parsedCapacity;
    }

    if (status !== undefined) {
      if (!['AVAILABLE', 'BLOCKED'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      slot.status = status;
    }

    await slot.save();
    await logAuditAction(req, 'UPDATE_SLOT', 'Slot', slot._id, oldVal, { capacity: slot.capacity, status: slot.status });

    await socketService.broadcastSlotUpdate(slot, { status: slot.status });

    res.json({ success: true, message: 'Slot availability updated successfully', slot });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// GENERIC DYNAMIC SLOT ENDPOINTS (/:id)
// ==========================================

// Update Slot (POST - legacy compatibility)
exports.updateSlotLegacyPost = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid Slot ID' });
  }
  const { capacity, status } = req.body;

  try {
    const slot = await Slot.findById(req.params.id);
    if (!slot) {
      return res.status(404).json({ message: 'Slot not found' });
    }

    const oldVal = { capacity: slot.capacity, status: slot.status };
    if (capacity !== undefined) slot.capacity = capacity;
    if (status !== undefined) slot.status = status;

    await slot.save();

    await logAuditAction(req, 'UPDATE_SLOT', 'Slot', slot._id, oldVal, { capacity: slot.capacity, status: slot.status });

    await socketService.broadcastSlotUpdate(slot);

    res.json(slot);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update Slot (PUT - REST spec)
exports.updateSlot = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid Slot ID' });
  }
  const { capacity, status } = req.body;

  try {
    const slot = await Slot.findById(req.params.id);
    if (!slot) {
      return res.status(404).json({ message: 'Slot not found' });
    }

    const oldVal = { capacity: slot.capacity, status: slot.status };
    if (capacity !== undefined) slot.capacity = capacity;
    if (status !== undefined) slot.status = status;

    await slot.save();

    await logAuditAction(req, 'UPDATE_SLOT', 'Slot', slot._id, oldVal, { capacity: slot.capacity, status: slot.status });

    await socketService.broadcastSlotUpdate(slot);

    res.json(slot);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete Slot (Super Admin only!)
exports.deleteSlot = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Invalid Slot ID' });
  }
  try {
    const slot = await Slot.findById(req.params.id);
    if (!slot) {
      return res.status(404).json({ message: 'Slot not found' });
    }

    if (slot.bookedCount > 0) {
      return res.status(400).json({ message: 'Cannot delete a slot with active bookings' });
    }

    await Slot.deleteOne({ _id: req.params.id });

    await logAuditAction(req, 'DELETE_SLOT', 'Slot', slot._id, slot, null);

    res.json({ message: 'Slot deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// EMERGENCY CLOSURE (COUNTRY / CENTER LEVEL)
// ==========================================

// Declare emergency closure
exports.declareEmergencyClosure = async (req, res) => {
  const { countryCode, centerId, reason, startDate, endDate, closureType, startTime, endTime } = req.body;
  if (!countryCode || !reason || !startDate || !endDate) {
    return res.status(400).json({ message: 'countryCode, reason, startDate, and endDate are required' });
  }

  try {
    let centerIds = [];
    if (centerId) {
      if (!mongoose.Types.ObjectId.isValid(centerId)) {
        return res.status(400).json({ message: 'Invalid Center ID' });
      }
      const center = await Center.findById(centerId);
      if (!center) {
        return res.status(404).json({ message: 'Center not found' });
      }
      if (!center.active) {
        return res.status(400).json({ message: 'Center is currently inactive.' });
      }
      centerIds.push(center._id);
    } else {
      const activeCenters = await Center.find({ countryCode: countryCode.trim().toUpperCase(), active: true });
      if (activeCenters.length === 0) {
        return res.status(400).json({ message: `No active centers found under country code ${countryCode}` });
      }
      centerIds = activeCenters.map(c => c._id);
    }

    const slotQuery = {
      centerId: { $in: centerIds },
      date: { $gte: startDate, $lte: endDate }
    };

    if (startTime && endTime) {
      slotQuery.startTime = { $gte: startTime };
      slotQuery.endTime = { $lte: endTime };
    }

    const slots = await Slot.find(slotQuery);
    const slotIds = slots.map(s => s._id);

    const cType = closureType || (centerId ? (startTime && endTime ? 'PARTIAL_DAY' : 'FULL_DAY') : 'COUNTRY_WIDE');

    const closure = new EmergencyClosure({
      countryCode: countryCode.trim().toUpperCase(),
      centerId: centerId ? centerId : null,
      closureType: cType,
      reason,
      startDate,
      endDate,
      startTime: startTime || null,
      endTime: endTime || null,
      impactedSlotsCount: slots.length,
      declaredBy: req.user._id,
      status: 'ACTIVE'
    });
    await closure.save();

    await Slot.updateMany({ _id: { $in: slotIds } }, { $set: { status: 'BLOCKED' } });

    const { processEmergencyClosureJobs } = require('../services/queueService');
    const result = await processEmergencyClosureJobs(slotIds, reason, req.user._id);

    await logAuditAction(req, 'EMERGENCY_CLOSURE', 'EmergencyClosure', closure._id, null, closure);

    res.status(201).json({
      message: centerId
        ? `Emergency closure declared successfully. Cancelled ${result.cancelledLocks + result.reviewQueueCount} appointments and blocked slots.`
        : `Emergency closure declared successfully for all active centers under country ${countryCode}. Cancelled ${result.cancelledLocks + result.reviewQueueCount} appointments and blocked slots.`,
      closure,
      affectedSlotsCount: slots.length,
      cancelledLocks: result.cancelledLocks,
      reviewQueueCount: result.reviewQueueCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Reopen center
exports.reopenEmergencyClosure = async (req, res) => {
  const { closureId } = req.body;
  if (!closureId) {
    return res.status(400).json({ message: 'closureId is required' });
  }

  if (!mongoose.Types.ObjectId.isValid(closureId)) {
    return res.status(400).json({ message: 'Invalid Closure ID' });
  }

  try {
    const closure = await EmergencyClosure.findById(closureId);
    if (!closure) {
      return res.status(404).json({ message: 'Closure record not found' });
    }

    if (closure.status === 'REOPENED') {
      return res.status(400).json({ message: 'Center/Country is already reopened' });
    }

    closure.status = 'REOPENED';
    await closure.save();

    let slotQuery = {
      date: { $gte: closure.startDate, $lte: closure.endDate }
    };

    if (closure.centerId) {
      slotQuery.centerId = closure.centerId;
    } else {
      const centers = await Center.find({ countryCode: closure.countryCode });
      slotQuery.centerId = { $in: centers.map(c => c._id) };
    }

    if (closure.startTime && closure.endTime) {
      slotQuery.startTime = { $gte: closure.startTime };
      slotQuery.endTime = { $lte: closure.endTime };
    }

    const slots = await Slot.find(slotQuery);
    const slotIds = slots.map(s => s._id);

    await Slot.updateMany({ _id: { $in: slotIds } }, { $set: { status: 'AVAILABLE' } });

    const logEntityId = closure.centerId ? closure.centerId : null;
    await logAuditAction(req, 'REOPEN_CENTER', 'Center', logEntityId, null, {
      countryCode: closure.countryCode,
      centerId: closure.centerId,
      startDate: closure.startDate,
      endDate: closure.endDate
    });

    const locksMap = await getActiveLocksMap(slotIds);
    slots.forEach(slot => {
      const lockedCount = locksMap[slot._id.toString()] || 0;
      socketService.broadcastSlotEvent({
        slotId: slot._id,
        bookedCount: slot.bookedCount,
        lockedCount,
        capacity: slot.capacity,
        status: 'AVAILABLE'
      });
    });

    res.json({ message: 'Center reopened successfully and slot schedules restored.', closure });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get all emergency closures
exports.getEmergencyClosures = async (req, res) => {
  try {
    const closures = await EmergencyClosure.find()
      .populate('centerId', 'name city countryName countryCode countryFlag')
      .sort({ createdAt: -1 });

    const { GOING_TO_COUNTRIES } = require('../config/masterData');
    const countryMap = {};
    GOING_TO_COUNTRIES.forEach(c => {
      countryMap[c.code] = c;
    });

    const populatedClosures = closures.map(closure => {
      const plain = closure.toObject();
      const country = countryMap[plain.countryCode];
      plain.countryName = country ? country.name : plain.countryCode;
      plain.countryFlag = country ? country.flag : '🏳️';
      return plain;
    });

    res.json(populatedClosures);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get blocking & emergency dashboard metrics (Admin/Supervisor only)
exports.getBlockingStats = async (req, res) => {
  try {
    const totalBlocked = await Slot.countDocuments({ status: 'BLOCKED' });
    const vipBlocked = await SlotBlock.countDocuments({ reason: 'VIP', active: true });
    const diplomaticBlocked = await SlotBlock.countDocuments({ reason: 'DIPLOMATIC', active: true });
    const activeClosures = await EmergencyClosure.countDocuments({ status: 'ACTIVE' });
    const refundPendingAppts = await Appointment.countDocuments({ status: 'REFUND_PENDING' });
    const rescheduleRequiredAppts = await Appointment.countDocuments({ status: 'RESCHEDULE_REQUIRED' });

    res.json({
      totalBlocked,
      vipBlocked,
      diplomaticBlocked,
      activeClosures,
      refundPendingAppts,
      rescheduleRequiredAppts
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// PAYMENT VERIFICATION (BOOKING PAYMENTS)
// ==========================================

// GET /payments-verification - Retrieve appointments pending manual UPI verification
exports.getPaymentsVerification = async (req, res) => {
  try {
    const appointments = await Appointment.find({ status: 'Pending Verification' })
      .populate('userId', 'name email mobile')
      .populate('centerId', 'name city')
      .sort({ createdAt: -1 });

    const result = [];
    for (const appt of appointments) {
      const payment = await Payment.findOne({ appointmentId: appt._id });
      result.push({ appointment: appt, payment });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

function buildAppointmentConfirmationHtml({ appointment, center }) {
  return `
    <div style="font-family: Arial, sans-serif; padding: 25px; color: #0c2340; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #0c2340; border-bottom: 2px solid #dfa015; padding-bottom: 15px; margin-top: 0;">Appointment Confirmed</h2>
      <p style="font-size: 15px; line-height: 1.5; color: #334155;">Dear Applicant,</p>
      <p style="font-size: 15px; line-height: 1.5; color: #334155;">
        We are pleased to inform you that your UPI payment for appointment reference <strong>${appointment.referenceNumber}</strong> has been verified successfully.
      </p>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #0c2340; font-size: 16px; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px;">Appointment Details Summary</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155;">
          <tr>
            <td style="padding: 6px 0; font-weight: bold; width: 35%;">Reference Number:</td>
            <td style="padding: 6px 0; color: #e67e22; font-weight: bold;">${appointment.referenceNumber}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold;">Application Centre:</td>
            <td style="padding: 6px 0; font-weight: bold;">${center ? center.name : 'Visa Application Centre'}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold; vertical-align: top;">Centre Address:</td>
            <td style="padding: 6px 0; line-height: 1.4;">${center && center.address ? center.address : 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold;">Appointment Date:</td>
            <td style="padding: 6px 0;">${new Date(appointment.bookingDate).toLocaleDateString('en-GB', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold;">Appointment Time:</td>
            <td style="padding: 6px 0; font-weight: bold;">${appointment.bookingTime}</td>
          </tr>
        </table>
      </div>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 15px; margin: 20px 0;">
        <h3 style="margin-top: 0; color: #0c2340; font-size: 16px; border-bottom: 1px solid #cbd5e1; padding-bottom: 8px;">Selected Services & Pricing Summary</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #334155; margin-bottom: 10px;">
          <thead>
            <tr style="border-bottom: 1px solid #cbd5e1;">
              <th style="text-align: left; padding: 6px 0; font-weight: bold;">Service Name</th>
              <th style="text-align: right; padding: 6px 0; font-weight: bold;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${
              appointment.servicesSelected && appointment.servicesSelected.length > 0
                ? appointment.servicesSelected
                    .map(
                      s => `
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                      <td style="padding: 6px 0;">${s.name}</td>
                      <td style="padding: 6px 0; text-align: right; font-weight: bold;">INR ${s.price.toFixed(2)}</td>
                    </tr>
                  `
                    )
                    .join('')
                : `
                    <tr>
                      <td style="padding: 6px 0; color: #64748b; font-style: italic;">No additional services selected</td>
                      <td style="padding: 6px 0; text-align: right; font-weight: bold;">INR 0.00</td>
                    </tr>
                  `
            }
          </tbody>
        </table>

        <div style="border-top: 1px solid #cbd5e1; padding-top: 8px; font-size: 13.5px; color: #334155;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 3px 0;">Services Subtotal:</td>
              <td style="padding: 3px 0; text-align: right; font-weight: bold;">INR ${(appointment.selectedServicesTotal || 0).toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding: 3px 0;">Appointment Fee:</td>
              <td style="padding: 3px 0; text-align: right; font-weight: bold;">INR ${(appointment.appointmentFee || 0).toFixed(2)}</td>
            </tr>
            <tr style="font-size: 15px; color: #0c2340; font-weight: bold; border-top: 1.5px solid #0c2340;">
              <td style="padding: 8px 0 0 0;">Grand Total:</td>
              <td style="padding: 8px 0 0 0; text-align: right; color: #e67e22;">INR ${(appointment.totalAmount || 0).toFixed(2)}</td>
            </tr>
          </table>
        </div>
      </div>

      <p style="font-size: 15px; line-height: 1.5; color: #334155;">
        Your biometric appointment is now confirmed. Please find your official <strong>Appointment Confirmation Letter</strong> attached as a PDF to this email.
      </p>
      <p style="font-size: 15px; line-height: 1.5; color: #334155;">
        Thank you for choosing Dream Catcher Immigrations.
      </p>
      <hr style="border: 0; border-top: 1px solid #cbd5e1; margin: 20px 0;" />
      <p style="font-size: 12px; color: #64748b; line-height: 1.4; margin: 0;">
        This is an automated email from Dream Catcher Immigrations. Please do not reply directly to this message.
      </p>
    </div>
  `;
}

// POST /payments-verification/:id/approve - Approve UPI payment, confirm appointment, generate PDF, and send confirmation email
exports.approvePaymentVerification = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id).populate('userId', 'name email mobile');
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (appointment.status !== 'Pending Verification') {
      return res.status(400).json({ message: 'This appointment is not pending verification.' });
    }

    const slot = await Slot.findById(appointment.slotId);
    if (!slot) {
      return res.status(404).json({ message: 'Slot not found' });
    }

    const center = await Center.findById(appointment.centerId);

    const payment = await Payment.findOne({ appointmentId: appointment._id });
    if (payment) {
      payment.status = 'SUCCESS';
      await payment.save();
    }

    appointment.status = 'BOOKED';
    appointment.paymentStatus = 'Paid';
    await appointment.save();

    const lockingService = require('../services/lockingService');
    await lockingService.releaseLock(appointment.slotId.toString(), appointment.userId._id.toString());

    slot.bookedCount += 1;
    await slot.save();

    await logAuditAction(
      req,
      'VERIFY_PAYMENT_SUCCESS',
      'Appointment',
      appointment._id,
      { status: 'Pending Verification', paymentStatus: 'Pending Verification' },
      { status: 'BOOKED', paymentStatus: 'Paid' }
    );

    await socketService.broadcastSlotUpdate(slot);

    const pdfService = require('../services/pdfService');
    const pdfBuffer = await pdfService.generateConfirmationPDF(appointment, payment, slot, center);

    const applicantEmail =
      appointment.applicantDetails && appointment.applicantDetails[0] ? appointment.applicantDetails[0].email : appointment.userId.email;

    const userEmail = appointment.userId ? appointment.userId.email : '';
    const recipients = [applicantEmail];
    if (userEmail && userEmail !== applicantEmail) {
      recipients.push(userEmail);
    }

    await mailService.sendMail(
      {
        to: recipients.join(', '),
        subject: 'Appointment Confirmation – Dream Catcher Immigrations',
        html: buildAppointmentConfirmationHtml({ appointment, center }),
        attachments: [
          {
            filename: `Appointment_Confirmation_${appointment.referenceNumber}.pdf`,
            content: pdfBuffer
          }
        ]
      },
      'Dream Catcher Immigrations'
    );

    res.json({ message: 'Appointment approved and confirmation email sent.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /payments-verification/:id/reject - Reject UPI payment, release slot capacity, and notify applicant
exports.rejectPaymentVerification = async (req, res) => {
  const { reason } = req.body;
  const displayReason = reason || 'The transaction reference number or payment screenshot provided could not be verified with our bank records.';

  try {
    const appointment = await Appointment.findById(req.params.id).populate('userId', 'name email mobile');
    if (!appointment) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    if (appointment.status !== 'Pending Verification') {
      return res.status(400).json({ message: 'This appointment is not pending verification.' });
    }

    const slot = await Slot.findById(appointment.slotId);
    if (!slot) {
      return res.status(404).json({ message: 'Slot not found' });
    }

    const payment = await Payment.findOne({ appointmentId: appointment._id });
    if (payment) {
      payment.status = 'REJECTED';
      await payment.save();
    }

    appointment.status = 'Payment Rejected';
    appointment.paymentStatus = 'Payment Rejected';
    await appointment.save();

    const lockingService = require('../services/lockingService');
    await lockingService.releaseLock(appointment.slotId.toString(), appointment.userId._id.toString());

    await logAuditAction(
      req,
      'VERIFY_PAYMENT_REJECT',
      'Appointment',
      appointment._id,
      { status: 'Pending Verification', paymentStatus: 'Pending Verification' },
      { status: 'Payment Rejected', paymentStatus: 'Payment Rejected' }
    );

    await socketService.broadcastSlotUpdate(slot);

    const applicantEmail =
      appointment.applicantDetails && appointment.applicantDetails[0] ? appointment.applicantDetails[0].email : appointment.userId.email;

    const userEmail = appointment.userId ? appointment.userId.email : '';
    const recipients = [applicantEmail];
    if (userEmail && userEmail !== applicantEmail) {
      recipients.push(userEmail);
    }

    await mailService.sendMail(
      {
        to: recipients.join(', '),
        subject: 'Payment Verification Unsuccessful – Dream Catcher Immigrations',
        html: `
        <div style="font-family: Arial, sans-serif; padding: 25px; color: #0c2340; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #ef4444; border-bottom: 2px solid #ef4444; padding-bottom: 15px; margin-top: 0;">Payment Verification Unsuccessful</h2>
          <p style="font-size: 15px; line-height: 1.5; color: #334155;">Dear Applicant,</p>
          <p style="font-size: 15px; line-height: 1.5; color: #334155;">
            We regret to inform you that your payment verification for appointment reference <strong>${appointment.referenceNumber}</strong> was unsuccessful.
          </p>
          <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <strong style="display: block; font-size: 14px; color: #991b1b; margin-bottom: 5px;">Reason for Rejection:</strong>
            <span style="font-size: 13.5px; color: #7f1d1d; line-height: 1.5;">${displayReason}</span>
          </div>
          <p style="font-size: 15px; line-height: 1.5; color: #334155;">
            As a result, your slot has been released back to the general booking pool. You will need to book a new appointment and submit a valid payment.
          </p>
          <p style="font-size: 15px; line-height: 1.5; color: #334155;">
            If you believe this was an error, please contact our support team.
          </p>
          <hr style="border: 0; border-top: 1px solid #cbd5e1; margin: 20px 0;" />
          <p style="font-size: 12px; color: #64748b; line-height: 1.4; margin: 0;">
            This is an automated email from Dream Catcher Immigrations. Please do not reply directly to this message.
          </p>
        </div>
      `
      },
      'Dream Catcher Immigrations'
    );

    res.json({ message: 'Appointment payment verification rejected and email notification sent.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// B2B SAAS AGENT & SUBSCRIPTION ENDPOINTS
// ==========================================

// Get all agent & subscription stats for Admin Dashboard
exports.getB2BStats = async (req, res) => {
  try {
    const totalAgents = await Agent.countDocuments({ role: 'Agent' });
    const verifiedAgents = await Agent.countDocuments({ role: 'Agent', status: 'Verified' });
    const pendingAgents = await Agent.countDocuments({ role: 'Agent', status: 'Pending' });
    const blockedAgents = await Agent.countDocuments({ role: 'Agent', status: 'Blocked' });
    const activeAgents = await Agent.countDocuments({ role: 'Agent', status: 'Active' });
    const expiredAgents = await Agent.countDocuments({ role: 'Agent', status: { $in: ['Expired', 'Subscription Expired'] } });

    const subscribedAgents = await Subscription.distinct('agentId', { subscriptionStatus: 'Active', paymentStatus: 'Paid' });

    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);

    const recentSubs = await Subscription.find({
      paymentStatus: 'Paid',
      paymentDate: { $gte: thirtyDaysAgo }
    });

    let monthlyRevenue = 0;
    let gstCollected = 0;
    recentSubs.forEach(sub => {
      monthlyRevenue += sub.planAmount || 0;
      gstCollected += sub.gstAmount || 0;
    });

    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(today.getDate() + 7);
    const upcomingRenewalsCount = await Subscription.countDocuments({
      subscriptionStatus: 'Active',
      paymentStatus: 'Paid',
      expiryDate: { $gte: today, $lte: sevenDaysFromNow }
    });

    const topAgents = await Appointment.aggregate([
      { $match: { status: { $in: ['BOOKED', 'Pending Verification'] } } },
      { $group: { _id: '$userId', bookingCount: { $sum: 1 } } },
      { $sort: { bookingCount: -1 } },
      { $limit: 5 }
    ]);

    const topPerformingAgents = [];
    for (const item of topAgents) {
      if (item._id) {
        const agent = await Agent.findById(item._id).select('agencyName ownerName email mobile');
        if (agent) {
          topPerformingAgents.push({ agent, bookingCount: item.bookingCount });
        }
      }
    }

    res.json({
      totalAgents,
      verifiedAgents,
      pendingAgents,
      blockedAgents,
      activeAgents,
      expiredAgents,
      subscribedAgentsCount: subscribedAgents.length,
      monthlyRevenue,
      gstCollected,
      upcomingRenewalsCount,
      topPerformingAgents
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Approve Agent Profile
exports.approveAgent = async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    const oldStatus = agent.status;
    agent.status = 'Verified';
    await agent.save();

    await AgentNotification.create({
      agentId: agent._id,
      title: 'Profile Approved',
      message: 'Your travel agency profile has been approved! You can now subscribe to start booking.',
      type: 'REGISTRATION_APPROVED'
    });

    await logAuditAction(req, 'APPROVE_AGENT', 'Agent', agent._id, { status: oldStatus }, { status: 'Verified' });
    res.json({ message: 'Agent approved successfully', agent });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Reject Agent Profile
exports.rejectAgent = async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    const oldStatus = agent.status;
    agent.status = 'Rejected';
    await agent.save();

    await AgentNotification.create({
      agentId: agent._id,
      title: 'Profile Rejected',
      message: 'Your travel agency profile was rejected. Please review details and resubmit.',
      type: 'REGISTRATION_REJECTED'
    });

    await logAuditAction(req, 'REJECT_AGENT', 'Agent', agent._id, { status: oldStatus }, { status: 'Rejected' });
    res.json({ message: 'Agent rejected successfully', agent });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Block Agent
exports.blockAgent = async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    const oldStatus = agent.status;
    agent.status = 'Blocked';
    await agent.save();

    await logAuditAction(req, 'BLOCK_AGENT', 'Agent', agent._id, { status: oldStatus }, { status: 'Blocked' });
    res.json({ message: 'Agent blocked successfully', agent });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Unblock Agent
exports.unblockAgent = async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    const activeSub = await Subscription.findOne({ agentId: agent._id, subscriptionStatus: 'Active', paymentStatus: 'Paid' });
    const oldStatus = agent.status;
    agent.status = activeSub ? 'Active' : 'Verified';
    await agent.save();

    await logAuditAction(req, 'UNBLOCK_AGENT', 'Agent', agent._id, { status: oldStatus }, { status: agent.status });
    res.json({ message: 'Agent unblocked successfully', agent });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Grant Complimentary Subscription Days
exports.grantComplimentaryDays = async (req, res) => {
  const { days } = req.body;
  if (!days || isNaN(days)) return res.status(400).json({ message: 'Please provide valid days count.' });

  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    let sub = await Subscription.findOne({ agentId: agent._id, paymentStatus: 'Paid' }).sort({ expiryDate: -1 });

    const today = new Date();
    let newExpiry;

    if (sub) {
      const baseDate = sub.expiryDate > today ? sub.expiryDate : today;
      newExpiry = new Date(baseDate);
      newExpiry.setDate(newExpiry.getDate() + parseInt(days));
      sub.expiryDate = newExpiry;
      sub.renewalDate = newExpiry;
      sub.subscriptionStatus = 'Active';
      await sub.save();
    } else {
      newExpiry = new Date();
      newExpiry.setDate(today.getDate() + parseInt(days));
      sub = new Subscription({
        agentId: agent._id,
        planName: 'Professional Agent Plan (Complimentary)',
        planAmount: 0,
        gstAmount: 0,
        totalAmount: 0,
        invoiceNumber: 'COMP-' + Date.now(),
        paymentStatus: 'Paid',
        subscriptionStatus: 'Active',
        paymentDate: today,
        startDate: today,
        expiryDate: newExpiry,
        renewalDate: newExpiry,
        createdBy: req.user._id
      });
      await sub.save();
    }

    agent.status = 'Active';
    await agent.save();

    await AgentNotification.create({
      agentId: agent._id,
      title: 'Complimentary Days Granted',
      message: `Admin granted you ${days} complimentary subscription days. Valid until ${newExpiry.toLocaleDateString('en-GB')}.`,
      type: 'SUBSCRIPTION_ACTIVATED'
    });

    await logAuditAction(req, 'GRANT_COMPLIMENTARY_DAYS', 'Agent', agent._id, {}, { days, newExpiry });
    res.json({ message: `Granted ${days} complimentary days successfully.`, agent, subscription: sub });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Cancel Subscription (Suspend/Cancel agent's billing cycle)
exports.cancelAgentSubscription = async (req, res) => {
  try {
    const agent = await Agent.findById(req.params.id);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    await Subscription.updateMany({ agentId: agent._id, subscriptionStatus: 'Active' }, { subscriptionStatus: 'Cancelled' });

    const oldStatus = agent.status;
    agent.status = 'Verified';
    await agent.save();

    await AgentNotification.create({
      agentId: agent._id,
      title: 'Subscription Cancelled',
      message: 'Your active monthly subscription has been suspended/cancelled by the administrator.',
      type: 'SUBSCRIPTION_CANCELLED'
    });

    await logAuditAction(req, 'CANCEL_SUBSCRIPTION', 'Agent', agent._id, { status: oldStatus }, { status: 'Verified' });
    res.json({ message: 'Subscription cancelled successfully.', agent });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==========================================================
// ADMIN SUBSCRIPTION PAYMENT VERIFICATION ROUTES
// ==========================================================

// Get all Agent Subscription payment requests for verification
exports.getSubscriptionPayments = async (req, res) => {
  try {
    const list = await Subscription.find({
      subscriptionStatus: { $in: ['Verification Pending', 'Active', 'Rejected'] }
    })
      .populate('agentId', 'agencyName ownerName email mobile')
      .sort({ createdAt: -1 });
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Approve subscription payment request
exports.approveSubscriptionPayment = async (req, res) => {
  try {
    const pdfService = require('../services/pdfService');

    const sub = await Subscription.findById(req.params.id);
    if (!sub) return res.status(404).json({ message: 'Subscription request not found' });
    if (sub.subscriptionStatus === 'Active') {
      return res.status(400).json({ message: 'Subscription is already active.' });
    }

    const agent = await Agent.findById(sub.agentId);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    const lastSub = await Subscription.findOne({
      agentId: sub.agentId,
      paymentStatus: 'Paid',
      subscriptionStatus: 'Active',
      _id: { $ne: sub._id }
    }).sort({ expiryDate: -1 });

    const today = new Date();
    let startDate = new Date();
    let previousExpiryDate = null;

    if (lastSub && lastSub.expiryDate > today) {
      previousExpiryDate = lastSub.expiryDate;
      startDate = new Date(lastSub.expiryDate);
    }

    const expiryDate = new Date(startDate);
    expiryDate.setDate(expiryDate.getDate() + 30);

    const finalInvoiceNumber = `INV-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    sub.paymentStatus = 'Paid';
    sub.subscriptionStatus = 'Active';
    sub.paymentDate = today;
    sub.startDate = startDate;
    sub.expiryDate = expiryDate;
    sub.renewalDate = expiryDate;
    sub.invoiceNumber = finalInvoiceNumber;
    await sub.save();

    const payment = new Payment({
      appointmentId: new mongoose.Types.ObjectId(), // Dummy ID
      amount: sub.totalAmount,
      transactionId: sub.transactionId,
      screenshot: sub.screenshot,
      gatewayResponse: { subscriptionId: sub._id, type: 'SubscriptionManualVerify' },
      status: 'SUCCESS'
    });
    await payment.save();

    if (previousExpiryDate) {
      await RenewalHistory.create({
        agentId: agent._id,
        subscriptionId: sub._id,
        previousExpiryDate,
        newExpiryDate: expiryDate
      });
    }

    agent.status = 'Active';
    await agent.save();

    let pdfBuffer;
    try {
      pdfBuffer = await pdfService.generateGSTInvoicePDF(agent, sub, payment);
      const invoice = new Invoice({
        invoiceNumber: finalInvoiceNumber,
        agentId: agent._id,
        subscriptionId: sub._id,
        pdfData: pdfBuffer.toString('base64')
      });
      await invoice.save();
    } catch (pdfErr) {
      console.error('Invoice PDF generation failed during verification:', pdfErr.message);
    }

    await AgentNotification.create({
      agentId: agent._id,
      title: 'Subscription Activated',
      message: `Your payment was verified. Your Professional Agent Plan is active. Valid until ${expiryDate.toLocaleDateString('en-GB')}.`,
      type: 'SUBSCRIPTION_ACTIVATED'
    });

    await logAuditAction(req, 'APPROVE_SUBSCRIPTION_PAYMENT', 'Subscription', sub._id, { status: 'Verification Pending' }, { status: 'Active' });

    try {
      const mailOptions = {
        to: agent.email,
        subject: 'Visa Booking Portal - Subscription Activated',
        html: `
          <div style="font-family: Arial, sans-serif; padding: 25px; color: #0c2340; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #0c2340; border-bottom: 2px solid #dfa015; padding-bottom: 10px;">Subscription Activated</h2>
            <p>Dear ${agent.ownerName},</p>
            <p>Your subscription payment has been verified. Your agency is now authorized to search slots and book visa appointments.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Invoice Number:</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${finalInvoiceNumber}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">Expiry Date:</td>
                <td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${expiryDate.toLocaleDateString('en-GB')}</td>
              </tr>
            </table>
            <p>Your Tax Invoice PDF has been attached to this email.</p>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="font-size: 11px; color: #94a3b8; text-align: center;">This is an automated billing email. Please do not reply.</p>
          </div>
        `
      };

      if (pdfBuffer) {
        mailOptions.attachments = [
          {
            filename: `Invoice_${finalInvoiceNumber}.pdf`,
            content: pdfBuffer
          }
        ];
      }

      await mailService.sendMail(mailOptions, 'Dream Catcher SaaS Billing');
    } catch (emailErr) {
      console.error('Failed to send confirmation email:', emailErr.message);
    }

    res.json({ message: 'Subscription payment approved successfully.', subscription: sub });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Reject subscription payment request
exports.rejectSubscriptionPayment = async (req, res) => {
  const { remarks } = req.body;
  if (!remarks || !remarks.trim()) {
    return res.status(400).json({ message: 'Please provide rejection remarks/reason.' });
  }

  try {
    const sub = await Subscription.findById(req.params.id);
    if (!sub) return res.status(404).json({ message: 'Subscription request not found' });
    if (sub.subscriptionStatus === 'Active') {
      return res.status(400).json({ message: 'Cannot reject an already approved active subscription.' });
    }

    const agent = await Agent.findById(sub.agentId);
    if (!agent) return res.status(404).json({ message: 'Agent not found' });

    sub.paymentStatus = 'Rejected';
    sub.subscriptionStatus = 'Rejected';
    sub.rejectionRemarks = remarks;
    await sub.save();

    if (agent.status === 'Verification Pending') {
      agent.status = 'Verified';
      await agent.save();
    }

    await AgentNotification.create({
      agentId: agent._id,
      title: 'Payment Proof Rejected',
      message: `Your payment proof was rejected. Remarks: ${remarks}. Please upload a new proof.`,
      type: 'REGISTRATION_REJECTED'
    });

    await logAuditAction(req, 'REJECT_SUBSCRIPTION_PAYMENT', 'Subscription', sub._id, { status: 'Verification Pending' }, { status: 'Rejected', remarks });

    try {
      await mailService.sendMail(
        {
          to: agent.email,
          subject: 'Visa Booking Portal - Subscription Payment Rejected',
          html: `
          <div style="font-family: Arial, sans-serif; padding: 25px; color: #0c2340; max-width: 600px; margin: 0 auto; border: 1px solid #fee2e2; border-radius: 8px;">
            <h2 style="color: #b91c1c; border-bottom: 2px solid #ef4444; padding-bottom: 10px;">Payment Verification Failed</h2>
            <p>Dear ${agent.ownerName},</p>
            <p>We were unable to verify your subscription payment proof. Rejection Remarks:</p>
            <div style="background-color: #fef2f2; padding: 15px; border-left: 4px solid #ef4444; color: #991b1b; font-weight: bold; margin: 15px 0;">
              ${remarks}
            </div>
            <p>Please log in to your Agent Dashboard, review your payment credentials, and resubmit the payment proof screenshot.</p>
            <hr style="border: 0; border-top: 1px solid #fee2e2; margin: 20px 0;" />
            <p style="font-size: 11px; color: #94a3b8; text-align: center;">This is an automated billing email. Please do not reply.</p>
          </div>
        `
        },
        'Dream Catcher SaaS Billing'
      );
    } catch (emailErr) {
      console.error('Failed to send rejection email:', emailErr.message);
    }

    res.json({ message: 'Subscription payment rejected. Remarks saved.', subscription: sub });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};