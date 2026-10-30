const SlotLock = require('../models/SlotLock');

const DEFAULT_SLOTS = [
  { startTime: '09:00', endTime: '09:30' },
  { startTime: '09:30', endTime: '10:00' },
  { startTime: '10:00', endTime: '10:30' },
  { startTime: '10:30', endTime: '11:00' },
  { startTime: '11:00', endTime: '11:30' },
  { startTime: '11:30', endTime: '12:00' },
  { startTime: '12:00', endTime: '12:30' },
  { startTime: '12:30', endTime: '13:00' },
  { startTime: '13:00', endTime: '13:30' },
  { startTime: '13:30', endTime: '14:00' },
  { startTime: '14:00', endTime: '14:30' },
  { startTime: '14:30', endTime: '15:00' },
  { startTime: '15:00', endTime: '15:30' },
  { startTime: '15:30', endTime: '16:00' }
];

function isSameCenter(block, slot) {
  return block.centerId && slot.centerId && block.centerId.toString() === slot.centerId.toString();
}

function isSlotBlocked(slot, blocks = []) {
  return blocks.some((block) => {
    if (!block.active) return false;
    if (block.blockType === 'COUNTRY') return true;
    if (block.blockType === 'CENTER') return isSameCenter(block, slot);

    if (block.blockType === 'DATE' && isSameCenter(block, slot)) {
      return slot.date >= block.startDate && slot.date <= block.endDate;
    }

    if (block.blockType === 'SLOT' && isSameCenter(block, slot)) {
      return slot.date === block.startDate && slot.startTime >= block.startTime && slot.endTime <= block.endTime;
    }

    return false;
  });
}

async function getActiveLocksMap(slotIds = []) {
  if (!slotIds.length) return {};

  const locks = await SlotLock.find({
    slotId: { $in: slotIds },
    expiresAt: { $gt: new Date() }
  }).select('slotId');

  return locks.reduce((map, lock) => {
    const key = lock.slotId.toString();
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});
}

module.exports = {
  DEFAULT_SLOTS,
  isSlotBlocked,
  getActiveLocksMap
};
