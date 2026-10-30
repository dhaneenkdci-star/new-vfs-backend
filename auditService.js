const AuditLog = require('../models/AuditLog');

exports.logAuditAction = async (req, action, entityType, entityId, oldValue, newValue) => {
  try {
    await AuditLog.create({
      action,
      performedBy: req.user._id,
      userId: req.user._id,
      entityType,
      entityId: entityId ? entityId.toString() : '',
      oldValue,
      newValue,
      ipAddress: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });
  } catch (error) {
    console.error('Failed to write audit log:', error.message);
  }
};
