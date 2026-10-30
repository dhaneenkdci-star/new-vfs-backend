const { Queue } = require('bullmq');
const Redis = require('ioredis');
const Appointment = require('../models/Appointment');
const Slot = require('../models/Slot');

let lockQueue = null;
let useRedis = false;

if (process.env.REDIS_URL) {
  try {
    const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
    lockQueue = new Queue('lock-expiration-queue', { connection });
    useRedis = true;
    console.log('BullMQ Expiration Queue initialized.');
  } catch (err) {
    console.warn('BullMQ initialization failed, falling back to database sweep:', err.message);
  }
}

// Service initialization starts database background sweep if Redis is offline
exports.initQueueService = (io) => {
  if (!useRedis) {
    console.log('Starting background database sweep for expired locks (Interval: 10s)');
    setInterval(async () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      try {
        const expiredLocks = await Appointment.find({
          status: 'LOCKED',
          createdAt: { $lt: tenMinutesAgo }
        });

        for (const appt of expiredLocks) {
          appt.status = 'EXPIRED';
          appt.paymentStatus = 'PAYMENT_FAILED';
          await appt.save();

          // Delete lock document
          const SlotLock = require('../models/SlotLock');
          const deletedLock = await SlotLock.findOneAndDelete({ slotId: appt.slotId, userId: appt.userId });
          
          if (deletedLock) {
            await Slot.findOneAndUpdate(
              { _id: appt.slotId, lockedCount: { $gt: 0 } },
              { $inc: { lockedCount: -1, availableCount: 1 } }
            );
          }

          const slot = await Slot.findById(appt.slotId);

          console.log(`Fallback Expiration: Appointment ${appt._id} lock expired.`);

          // Broadcast real-time slot count update
          if (slot && io) {
            const activeLocksCount = await SlotLock.countDocuments({
              slotId: slot._id,
              expiresAt: { $gt: new Date() }
            });
            io.emit('slot-update', {
              slotId: slot._id,
              bookedCount: slot.bookedCount,
              lockedCount: activeLocksCount,
              capacity: slot.capacity
            });
          }
        }
      } catch (err) {
        console.error('Error during fallback lock expiration sweep:', err.message);
      }
    }, 10000); // Check every 10 seconds
  }

  // Global Subscription Expiry Sweeper
  console.log('Starting global background sweeper for Agent subscription expiry (Interval: 30s)');
  setInterval(async () => {
    try {
      const today = new Date();
      const Subscription = require('../models/Subscription');
      const Agent = require('../models/Agent');
      const AgentNotification = require('../models/AgentNotification');
      const AgentActivity = require('../models/AgentActivity');
      const nodemailer = require('nodemailer');

      // 1. Process Expired Subscriptions
      const expiredSubs = await Subscription.find({
        subscriptionStatus: 'Active',
        expiryDate: { $lte: today }
      });

      for (const sub of expiredSubs) {
        sub.subscriptionStatus = 'Expired';
        await sub.save();

        const agent = await Agent.findById(sub.agentId);
        if (agent && agent.status === 'Active') {
          agent.status = 'Expired';
          await agent.save();

          await AgentActivity.create({
            agentId: agent._id,
            activity: 'SUBSCRIPTION_EXPIRED',
            ipAddress: '127.0.0.1',
            userAgent: 'Background Sweeper'
          });

          await AgentNotification.create({
            agentId: agent._id,
            title: 'Subscription Expired',
            message: 'Your Professional Agent Plan has expired. Please renew your subscription to resume client bookings.',
            type: 'SUBSCRIPTION_EXPIRED'
          });

          // Send Email
          try {
            const transporter = nodemailer.createTransport({
              service: 'gmail',
              auth: {
                user: process.env.EMAIL_USER || 'dreamcatcherimmigration25@gmail.com',
                pass: process.env.EMAIL_PASS || 'csiz fkyl mnxu tfap'
              }
            });

            const mailOptions = {
              from: `"Dream Catcher SaaS Billing" <${process.env.EMAIL_USER || 'dreamcatcherimmigration25@gmail.com'}>`,
              to: agent.email,
              subject: 'URGENT: Visa Booking Subscription Expired',
              html: `
                <div style="font-family: Arial, sans-serif; padding: 25px; color: #0c2340; max-width: 600px; margin: 0 auto; border: 1px solid #fee2e2; border-radius: 8px;">
                  <h2 style="color: #b91c1c; border-bottom: 2px solid #ef4444; padding-bottom: 10px;">Subscription Expired</h2>
                  <p>Dear ${agent.ownerName},</p>
                  <p>Your subscription for <strong>Professional Agent Plan</strong> expired on ${sub.expiryDate.toLocaleDateString('en-GB')}.</p>
                  <p>Please renew your subscription to resume booking visa appointments for your clients.</p>
                  <hr style="border: 0; border-top: 1px solid #fee2e2; margin: 20px 0;" />
                  <p style="font-size: 11px; color: #94a3b8; text-align: center;">This is an automated system email. Please do not reply.</p>
                </div>
              `
            };
            await transporter.sendMail(mailOptions);
            console.log(`Email subscription expired notice sent to ${agent.email}`);
          } catch (mailErr) {
            console.error('Failed to send expiration email:', mailErr.message);
          }
        }
      }

      // 2. Process Renewal Reminders (15, 7, 3, 1 Days)
      const activeSubs = await Subscription.find({
        subscriptionStatus: 'Active',
        paymentStatus: 'Paid'
      });

      for (const sub of activeSubs) {
        const diffTime = sub.expiryDate - today;
        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const sendReminder = async (label, subjectText, messageText) => {
          if (sub.sentReminders.includes(label)) return;

          sub.sentReminders.push(label);
          await sub.save();

          const agent = await Agent.findById(sub.agentId);
          if (!agent) return;

          await AgentNotification.create({
            agentId: agent._id,
            title: 'Subscription Renewal Reminder',
            message: messageText,
            type: 'SUBSCRIPTION_EXPIRING'
          });

          try {
            const transporter = nodemailer.createTransport({
              service: 'gmail',
              auth: {
                user: process.env.EMAIL_USER || 'dreamcatcherimmigration25@gmail.com',
                pass: process.env.EMAIL_PASS || 'csiz fkyl mnxu tfap'
              }
            });

            const mailOptions = {
              from: `"Dream Catcher SaaS Billing" <${process.env.EMAIL_USER || 'dreamcatcherimmigration25@gmail.com'}>`,
              to: agent.email,
              subject: subjectText,
              html: `
                <div style="font-family: Arial, sans-serif; padding: 25px; color: #0c2340; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
                  <h2 style="color: #0c2340; border-bottom: 2px solid #dfa015; padding-bottom: 10px;">Subscription Renewal Reminder</h2>
                  <p>Dear ${agent.ownerName},</p>
                  <p>${messageText}</p>
                  <p>Expiry Date: <strong>${sub.expiryDate.toLocaleDateString('en-GB')}</strong></p>
                  <p>Please renew your subscription from your agent portal dashboard before it expires to avoid any service interruption.</p>
                  <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
                  <p style="font-size: 11px; color: #94a3b8; text-align: center;">This is an automated reminder. Please do not reply.</p>
                </div>
              `
            };
            await transporter.sendMail(mailOptions);
            console.log(`Sent renewal reminder (${label}) to ${agent.email}`);
          } catch (mailErr) {
            console.error(`Failed to send ${label} reminder email:`, mailErr.message);
          }
        };

        if (daysLeft <= 1 && daysLeft > 0) {
          await sendReminder('1_DAY', 'ALERT: Subscription Expires Tomorrow', 'Your monthly booking subscription expires tomorrow.');
        } else if (daysLeft <= 3 && daysLeft > 1) {
          await sendReminder('3_DAYS', 'Urgent: Subscription Expires in 3 Days', 'Your monthly booking subscription expires in 3 days.');
        } else if (daysLeft <= 7 && daysLeft > 3) {
          await sendReminder('7_DAYS', 'Reminder: Subscription Expires in 7 Days', 'Your monthly booking subscription expires in 7 days.');
        } else if (daysLeft <= 15 && daysLeft > 7) {
          await sendReminder('15_DAYS', 'Reminder: Subscription Expires in 15 Days', 'Your monthly booking subscription expires in 15 days.');
        }
      }

    } catch (err) {
      console.error('Error during global subscription background sweep:', err.message);
    }
  }, 30000); // Sweep every 30 seconds
};

exports.addExpirationJob = async (appointmentId, slotId) => {
  const ttl = 600000; // 10 minutes in milliseconds

  if (useRedis && lockQueue) {
    try {
      await lockQueue.add('lock-expiration', { appointmentId, slotId }, { delay: ttl });
      return;
    } catch (err) {
      console.error('BullMQ add job failed, relying on db sweep:', err.message);
    }
  }
};

exports.processEmergencyClosureJobs = async (slotIds, reason, performedBy) => {
  const Appointment = require('../models/Appointment');
  const Slot = require('../models/Slot');
  const AuditLog = require('../models/AuditLog');
  const Center = require('../models/Center');

  let cancelledLocks = 0;
  let reviewQueueCount = 0;

  try {
    // 1. Fetch appointments affected
    const appointments = await Appointment.find({
      slotId: { $in: slotIds },
      status: { $in: ['LOCKED', 'BOOKED'] }
    });

    for (const appt of appointments) {
      if (appt.status === 'LOCKED') {
        appt.status = 'CANCELLED';
        appt.paymentStatus = 'PAYMENT_FAILED';
        await appt.save();

        // Release lock from SlotLock
        const SlotLock = require('../models/SlotLock');
        const deletedLock = await SlotLock.findOneAndDelete({ slotId: appt.slotId, userId: appt.userId });
        if (deletedLock) {
          await Slot.findOneAndUpdate(
            { _id: appt.slotId, lockedCount: { $gt: 0 } },
            { $inc: { lockedCount: -1, availableCount: 1 } }
          );
        }
        cancelledLocks++;
      } else if (appt.status === 'BOOKED') {
        // BOOKED appointments enter review queue as REFUND_PENDING
        appt.status = 'REFUND_PENDING';
        appt.paymentStatus = 'Refunded'; // simulating payment refund trigger
        await appt.save();

        // Release capacity on slot
        await Slot.updateOne(
          { _id: appt.slotId, bookedCount: { $gt: 0 } },
          { $inc: { bookedCount: -1 } }
        );

        reviewQueueCount++;

        // 2. Fetch Center details to format notification
        const center = await Center.findById(appt.centerId);
        const centerName = center ? center.name : 'VFS Visa Application Centre';
        
        // 3. Simulate SMS & Email notification prints to logs
        console.log(`
=========================================
SIMULATED CUSTOMER NOTIFICATION
=========================================
TO: ${appt.applicantDetails && appt.applicantDetails.length > 0 ? appt.applicantDetails[0].email : 'applicant@gmail.com'}
CHANNEL: EMAIL & SMS
MESSAGE:
Dear Applicant,
Please be informed that the ${centerName} is temporarily CLOSED on ${new Date(appt.bookingDate).toLocaleDateString('en-GB')} due to: ${reason}.
Your appointment (Ref: ${appt.referenceNumber}) has been moved to REFUND_PENDING.
You may reschedule your appointment using the following link:
http://localhost:5173/book?reschedule=true&appt=${appt._id}
For support, please contact our helpline.
=========================================
        `);
      }
    }

    // 4. Create Audit Log
    if (slotIds.length > 0) {
      const firstSlot = await Slot.findById(slotIds[0]);
      const centerId = firstSlot ? firstSlot.centerId : null;

      await AuditLog.create({
        action: 'EMERGENCY_CLOSURE',
        performedBy,
        userId: performedBy,
        entityType: 'Center',
        entityId: centerId ? centerId.toString() : '',
        newValue: {
          centerId,
          reason,
          affectedSlots: slotIds.length,
          affectedAppointments: cancelledLocks + reviewQueueCount,
          cancelledLocks,
          reviewQueueCount
        },
        ipAddress: '127.0.0.1',
        userAgent: 'Background Worker'
      });
    }

    // Broadcast updates via websocket
    if (global.io) {
      for (const slotId of slotIds) {
        const slot = await Slot.findById(slotId);
        if (slot) {
          global.io.emit('slot-update', {
            slotId: slot._id,
            bookedCount: slot.bookedCount,
            lockedCount: slot.lockedCount,
            capacity: slot.capacity,
            status: slot.status
          });
        }
      }
    }

    return { cancelledLocks, reviewQueueCount };

  } catch (error) {
    console.error('Error processing emergency closure background queue jobs:', error.message);
    throw error;
  }
};
