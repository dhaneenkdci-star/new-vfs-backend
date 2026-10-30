const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const Agent = require('../models/Agent');
const { generateToken, normalizeEmail, buildAuthResponse } = require('../utils/authUtils');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || '');

const registerAgent = async (req, res, next) => {
  const {
    agencyName,
    ownerName,
    email,
    password,
    mobile,
    gstNumber,
    panNumber,
    businessRegNumber,
    address,
    city,
    state,
    country,
    logo,
    clerkId,
  } = req.body;

  try {
    if (!password || password.trim().length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long.' });
    }

    const cleanEmail = normalizeEmail(email);
    const cleanGst = (gstNumber || '').trim().toUpperCase();

    const emailExists = await Agent.findOne({ email: cleanEmail });
    if (emailExists) {
      return res.status(400).json({ message: 'Email is already registered. Please sign in instead.' });
    }

    const gstExists = await Agent.findOne({ gstNumber: cleanGst });
    if (gstExists && cleanGst !== 'N/A') {
      return res.status(400).json({ message: 'GST Number is already registered.' });
    }

    const isFirstAdmin = cleanEmail === (process.env.ADMIN_EMAIL || 'admindci@gmail.com').toLowerCase().trim();

    const agent = await Agent.create({
      clerkId,
      agencyName,
      ownerName,
      email: cleanEmail,
      password: password.trim(),
      mobile,
      gstNumber: cleanGst,
      panNumber,
      businessRegNumber,
      address,
      city,
      state,
      country,
      logo,
      role: isFirstAdmin ? 'SUPER_ADMIN' : 'Agent',
      status: isFirstAdmin ? 'Active' : 'Pending',
    });

    const token = generateToken(agent._id);
    res.status(201).json(buildAuthResponse(agent, token));
  } catch (error) {
    next(error);
  }
};

const loginAgent = async (req, res, next) => {
  const { email, password } = req.body;

  try {
    const searchKey = normalizeEmail(email);
    const agent = await Agent.findOne({ email: searchKey });

    if (!agent) {
      return res.status(400).json({ message: 'Account not found. Please register before logging in.' });
    }

    if (!(await agent.matchPassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    if (agent.isActive === false || agent.status === 'Blocked') {
      return res.status(403).json({ message: 'Your account is blocked or inactive. Please contact support.' });
    }

    const token = generateToken(agent._id);
    res.json(buildAuthResponse(agent, token));
  } catch (error) {
    next(error);
  }
};

const googleAuth = async (req, res, next) => {
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ message: 'Google Credential token is required' });
  }

  try {
    let payload;
    if (process.env.GOOGLE_CLIENT_ID) {
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } else {
      return res.status(503).json({ message: 'Google authentication is not configured' });
    }

    if (!payload || !payload.email) {
      return res.status(400).json({ message: 'Invalid token payload' });
    }

    const { email, name } = payload;
    let agent = await Agent.findOne({ email: normalizeEmail(email) });

    if (!agent) {
      const randomPassword = crypto.randomBytes(16).toString('hex') + 'A1!';
      const isFirstAdmin = normalizeEmail(email) === (process.env.ADMIN_EMAIL || 'admindci@gmail.com').toLowerCase().trim();

      agent = await Agent.create({
        clerkId: payload.sub || `google-mock-${Date.now()}`,
        agencyName: isFirstAdmin ? 'Dream Catcher Immigrations' : `Google Agency ${name}`,
        ownerName: name || email.split('@')[0],
        email: normalizeEmail(email),
        password: randomPassword,
        mobile: 'Not Provided',
        gstNumber: isFirstAdmin ? 'N/A' : 'GST-MOCK-GOOGLE',
        address: 'Google Address',
        city: 'Google City',
        state: 'Google State',
        country: 'Google Country',
        role: isFirstAdmin ? 'SUPER_ADMIN' : 'Agent',
        status: isFirstAdmin ? 'Active' : 'Pending',
      });
    }

    if (agent.isActive === false || agent.status === 'Blocked') {
      return res.status(403).json({ message: 'Your account is blocked or inactive. Please contact support.' });
    }

    const token = generateToken(agent._id);
    res.json(buildAuthResponse(agent, token));
  } catch (error) {
    next(error);
  }
};

const adminLogin = async (req, res, next) => {
  const { email, password } = req.body;

  try {
    const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL || 'admindci@gmail.com');
    if (normalizeEmail(email) !== adminEmail) {
      return res.status(401).json({ message: 'Invalid admin credentials or unauthorized role.' });
    }

    const agent = await Agent.findOne({ email: adminEmail });
    if (!agent) {
      return res.status(401).json({ message: 'Admin account is not configured yet.' });
    }

    if (!(await agent.matchPassword(password))) {
      return res.status(401).json({ message: 'Invalid admin credentials or unauthorized role.' });
    }

    if (agent.isActive === false || agent.status === 'Blocked') {
      return res.status(403).json({ message: 'Your account is blocked or inactive.' });
    }

    const token = generateToken(agent._id);
    res.json(buildAuthResponse(agent, token));
  } catch (error) {
    next(error);
  }
};

const getProfile = (req, res) => {
  res.json(req.user);
};

module.exports = {
  registerAgent,
  loginAgent,
  googleAuth,
  adminLogin,
  getProfile,
};
