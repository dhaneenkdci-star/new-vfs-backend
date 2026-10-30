const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');

// Track application status
router.get('/track', async (req, res) => {
  const { referenceNumber, lastName } = req.query;

  if (!referenceNumber || !lastName) {
    return res.status(400).json({ message: 'Reference number and last name are required' });
  }

  try {
    const appointment = await Appointment.findOne({ referenceNumber });

    if (!appointment) {
      return res.status(404).json({ message: 'Application not found with the provided details' });
    }

    const applicant = appointment.applicantDetails && appointment.applicantDetails[0];
    if (!applicant) {
      return res.status(404).json({ message: 'Application details not found' });
    }

    const match = applicant.lastName.trim().toLowerCase() === lastName.trim().toLowerCase();

    if (!match) {
      return res.status(404).json({ message: 'Application not found with the provided details' });
    }

    res.json({
      referenceNumber: appointment.referenceNumber,
      applicantName: `${applicant.firstName} ${applicant.lastName}`,
      visaCategory: applicant.visaCategory,
      bookingDate: appointment.bookingDate,
      bookingTime: appointment.bookingTime,
      applicationStatus: appointment.applicationStatus,
      updatedAt: appointment.updatedAt
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
