const { Worker } = require('bullmq');
const Redis = require('ioredis');
const mongoose = require('mongoose');
const Slot = require('../models/Slot');
const Appointment = require('../models/Appointment');

let worker = null;

const startExpirationWorker = (io) => {
  if (!process.env.REDIS_URL) return;

  try {
    const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
    
    worker = new Worker('lock-expiration-queue', async (job) => {
      const { appointmentId, slotId } = job.data;
      
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const appointment = await Appointment.findById(appointmentId).session(session);
        
        if (appointment && appointment.status === 'LOCKED') {
          appointment.status = 'EXPIRED';
          appointment.paymentStatus = 'PAYMENT_FAILED';
          await appointment.save({ session });

          const SlotLock = require('../models/SlotLock');
          const deletedLock = await SlotLock.findOneAndDelete({ slotId, userId: appointment.userId }).session(session);
          
          if (deletedLock) {
            await Slot.findOneAndUpdate(
              { _id: slotId, lockedCount: { $gt: 0 } },
              { $inc: { lockedCount: -1, availableCount: 1 } }
            ).session(session);
          }

          const slot = await Slot.findById(slotId).session(session);

          await session.commitTransaction();
          console.log(`BullMQ Worker: Appointment ${appointmentId} lock expired.`);

          if (slot && io) {
            const activeLocksCount = await SlotLock.countDocuments({
              slotId,
              expiresAt: { $gt: new Date() }
            });
            io.emit('slot-update', {
              slotId: slot._id,
              bookedCount: slot.bookedCount,
              lockedCount: activeLocksCount,
              capacity: slot.capacity
            });
          }
        } else {
          await session.abortTransaction();
        }
      } catch (err) {
        await session.abortTransaction();
        console.error('BullMQ worker transaction error:', err.message);
        throw err;
      } finally {
        session.endSession();
      }
    }, { connection });

    worker.on('failed', (job, err) => {
      console.error(`BullMQ Expiration Job ${job.id} failed:`, err.message);
    });

    console.log('BullMQ Expiration Worker started.');
  } catch (err) {
    console.warn('BullMQ Expiration Worker failed to start:', err.message);
  }
};

module.exports = { startExpirationWorker };
