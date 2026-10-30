const jwt = require('jsonwebtoken');

const getJwtSecret = () => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV !== 'production') return 'dev-secret-change-in-production';
  return null;
};

const generateToken = (id) => {
  const secret = getJwtSecret();
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  return jwt.sign({ id }, secret, {
    expiresIn: '30d',
  });
};

const normalizeEmail = (email) => (email || '').toLowerCase().trim();

const buildAuthResponse = (agent, token) => ({
  _id: agent._id,
  agencyName: agent.agencyName,
  ownerName: agent.ownerName,
  email: agent.email,
  role: agent.role,
  status: agent.status,
  token,
});

module.exports = {
  getJwtSecret,
  generateToken,
  normalizeEmail,
  buildAuthResponse,
};
