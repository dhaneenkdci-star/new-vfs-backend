const Agent = require('../models/Agent');
const Subscription = require('../models/Subscription');
const Invoice = require('../models/Invoice');
const AgentNotification = require('../models/AgentNotification');
const AgentActivity = require('../models/AgentActivity');

function getRequestMeta(req) {
  return {
    ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
    userAgent: req.headers['user-agent'] || ''
  };
}

async function submitProof(req, res, { activity, notificationTitle, notificationMessage, successMessage }) {
  const { transactionId, screenshot, notes, paymentDateTime } = req.body;
  const agentId = req.user._id;

  if (!transactionId || !screenshot) {
    return res.status(400).json({ message: 'Transaction ID and Payment Proof Screenshot are required.' });
  }

  try {
    const duplicateTx = await Subscription.findOne({
      transactionId,
      subscriptionStatus: { $in: ['Active', 'Verification Pending'] }
    });
    if (duplicateTx) {
      return res.status(400).json({ message: 'This Transaction/Reference ID has already been used.' });
    }

    const pendingSub = await Subscription.findOne({ agentId, subscriptionStatus: 'Verification Pending' });
    if (pendingSub) {
      return res.status(400).json({ message: 'You already have a subscription payment verification request pending review.' });
    }

    let subscription;
    const rejectedSub = await Subscription.findOne({ agentId, subscriptionStatus: 'Rejected' });
    if (rejectedSub) {
      rejectedSub.paymentStatus = 'Pending Verification';
      rejectedSub.subscriptionStatus = 'Verification Pending';
      rejectedSub.transactionId = transactionId;
      rejectedSub.screenshot = screenshot;
      rejectedSub.notes = notes || '';
      rejectedSub.paymentDateTime = paymentDateTime || '';
      rejectedSub.rejectionRemarks = '';
      subscription = await rejectedSub.save();
    } else {
      const invoiceNumber = `REQ-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      subscription = new Subscription({
        agentId,
        planName: 'Professional Agent Plan',
        planAmount: 0.85,
        gstAmount: 0.15,
        totalAmount: 1,
        invoiceNumber,
        paymentStatus: 'Pending Verification',
        subscriptionStatus: 'Verification Pending',
        transactionId,
        screenshot,
        notes: notes || '',
        paymentDateTime: paymentDateTime || '',
        createdBy: agentId
      });
      await subscription.save();
    }

    const agent = await Agent.findById(agentId);
    if (agent && agent.status !== 'Active') {
      agent.status = 'Verification Pending';
      await agent.save();
    }

    const { ipAddress, userAgent } = getRequestMeta(req);
    await AgentActivity.create({ agentId, activity, ipAddress, userAgent });

    await AgentNotification.create({
      agentId,
      title: notificationTitle,
      message: notificationMessage,
      type: 'SUBSCRIPTION_EXPIRING'
    });

    res.status(200).json({ message: successMessage, subscription });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

// Purchase Monthly Subscription (Simulated payment / UPI screenshot)
exports.purchase = (req, res) =>
  submitProof(req, res, {
    activity: 'SUBMIT_SUBSCRIPTION_PROOF',
    notificationTitle: 'Payment Proof Submitted',
    notificationMessage:
      'Your subscription payment verification request has been submitted. Booking features will unlock upon approval.',
    successMessage: 'Payment proof submitted successfully! Awaiting administrator verification.'
  });

// Renew Subscription Request (Simulated UPI proof - manual verification)
exports.renew = (req, res) =>
  submitProof(req, res, {
    activity: 'SUBMIT_RENEWAL_PROOF',
    notificationTitle: 'Renewal Proof Submitted',
    notificationMessage: 'Your subscription renewal payment proof has been submitted and is pending verification.',
    successMessage: 'Renewal payment proof submitted successfully! Awaiting administrator verification.'
  });

// Get Subscription & Invoice History for Agent
exports.getHistory = async (req, res) => {
  try {
    const subscriptions = await Subscription.find({ agentId: req.user._id }).sort({ createdAt: -1 });
    res.json(subscriptions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Invoices for Agent
exports.getInvoices = async (req, res) => {
  try {
    const invoices = await Invoice.find({ agentId: req.user._id }).sort({ createdAt: -1 });
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Download Invoice PDF
exports.downloadInvoice = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }

    if (invoice.agentId.toString() !== req.user._id.toString() && req.user.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ message: 'Unauthorized access to invoice.' });
    }

    if (!invoice.pdfData) {
      return res.status(400).json({ message: 'Invoice PDF not generated for this billing cycle.' });
    }

    const pdfBuffer = Buffer.from(invoice.pdfData, 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Invoice_${invoice.invoiceNumber}.pdf`);
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get Agent Notifications
exports.getNotifications = async (req, res) => {
  try {
    const notifications = await AgentNotification.find({ agentId: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Mark Notification as Read
exports.markNotificationRead = async (req, res) => {
  try {
    const notification = await AgentNotification.findOneAndUpdate(
      { _id: req.params.id, agentId: req.user._id },
      { read: true },
      { new: true }
    );
    res.json(notification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get active subscription statistics for dashboard widget
exports.getStats = async (req, res) => {
  try {
    const activeSub = await Subscription.findOne({
      agentId: req.user._id,
      subscriptionStatus: 'Active',
      paymentStatus: 'Paid'
    }).sort({ expiryDate: -1 });

    let daysRemaining = 0;
    if (activeSub) {
      const today = new Date();
      const diffTime = activeSub.expiryDate - today;
      daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
    }

    res.json({
      status: req.user.status,
      daysRemaining,
      activeSubscription: activeSub
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};