const SlotLock = require('../models/SlotLock');

exports.broadcastSlotEvent = (payload) => {
  if (!global.io) return;
  global.io.emit('slot-update', payload);
};

exports.broadcastSlotUpdate = async (slot, extra = {}) => {
  if (!global.io || !slot) return;

  const activeLocksCount = await SlotLock.countDocuments({
    slotId: slot._id,
    expiresAt: { $gt: new Date() }
  });

  global.io.emit('slot-update', {
    slotId: slot._id,
    centerId: slot.centerId,
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
    bookedCount: slot.bookedCount,
    lockedCount: activeLocksCount,
    capacity: slot.capacity,
    status: slot.status,
    ...extra
  });
};
