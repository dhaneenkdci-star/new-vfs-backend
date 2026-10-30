const Redis = require('ioredis');
const Slot = require('../models/Slot');
const SlotLock = require('../models/SlotLock');

let redis = null;
let useRedis = false;

if (process.env.REDIS_URL) {
  try {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectTimeout: 2000
    });
    
    redis.on('connect', () => {
      console.log('Redis Connected for Slot Locking.');
      useRedis = true;
    });
    
    redis.on('error', (err) => {
      console.warn('Redis Connection failed, falling back to MongoDB slot_locks locking:', err.message);
      useRedis = false;
    });
  } catch (err) {
    console.warn('Redis setup failed, falling back to MongoDB slot_locks locking:', err.message);
    useRedis = false;
  }
}

exports.acquireLock = async (slotId, userId, slot) => {
  const lockKey = `LOCK:SLOT:${slotId}:${userId}`;
  const ttlSeconds = 600; // 10 minutes
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  // 1. Try acquiring lock in Redis first if active
  if (useRedis && redis) {
    try {
      const result = await redis.set(lockKey, userId, 'NX', 'EX', ttlSeconds);
      if (result !== 'OK') {
        return false;
      }
    } catch (err) {
      console.error('Redis lock acquisition failed:', err.message);
    }
  }

  // 2. Perform atomic capacity check and reservation in MongoDB
  try {
    const updatedSlot = await Slot.findOneAndUpdate(
      {
        _id: slotId,
        availableCount: { $gt: 0 },
        status: 'AVAILABLE'
      },
      {
        $inc: {
          lockedCount: 1,
          availableCount: -1
        }
      },
      { new: true }
    );

    if (!updatedSlot) {
      // Rollback Redis lock if it was acquired
      if (useRedis && redis) {
        try { await redis.del(lockKey); } catch (e) {}
      }
      return false;
    }

    // 3. Create SlotLock record
    await SlotLock.create({
      slotId,
      userId,
      expiresAt
    });

    return true;
  } catch (err) {
    console.error('MongoDB SlotLock acquisition error:', err.message);
    // Rollback Redis lock if it was acquired
    if (useRedis && redis) {
      try { await redis.del(lockKey); } catch (e) {}
    }
    return false;
  }
};

exports.releaseLock = async (slotId, userId) => {
  const lockKey = `LOCK:SLOT:${slotId}:${userId}`;

  if (useRedis && redis) {
    try {
      const owner = await redis.get(lockKey);
      if (owner === userId) {
        await redis.del(lockKey);
      }
    } catch (err) {
      console.error('Redis lock release error:', err.message);
    }
  }

  try {
    // Delete slot lock document
    const deleted = await SlotLock.findOneAndDelete({ slotId, userId });
    
    // Decrement lockedCount and increment availableCount dynamically if deleted
    if (deleted) {
      await Slot.findOneAndUpdate(
        { _id: slotId, lockedCount: { $gt: 0 } },
        {
          $inc: {
            lockedCount: -1,
            availableCount: 1
          }
        }
      );
    }
  } catch (err) {
    console.error('DB lock release error:', err.message);
  }
};

exports.isLockOwner = async (slotId, userId) => {
  const lockKey = `LOCK:SLOT:${slotId}:${userId}`;

  if (useRedis && redis) {
    try {
      const owner = await redis.get(lockKey);
      if (owner === userId) return true;
    } catch (err) {
      console.error('Redis lock owner check error:', err.message);
    }
  }

  try {
    // Find active lock record in database
    const activeLock = await SlotLock.findOne({
      slotId,
      userId,
      expiresAt: { $gt: new Date() }
    });
    return !!activeLock;
  } catch (err) {
    console.error('DB lock owner verification check error:', err.message);
    return false;
  }
};
