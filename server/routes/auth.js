const jwt = require('jsonwebtoken');
const { getUserById } = require('../services/db');

const JWT_SECRET = process.env.JWT_SECRET || 'kwt-secret-please-change-in-prod';

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = getUserById(payload.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });

    // Check plan expiry
    if (user.plan !== 'free' && user.plan_expires_at && user.plan_expires_at < Math.floor(Date.now() / 1000)) {
      // Downgrade to free if expired
      user.plan = 'free';
    }

    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = getUserById(payload.userId) || null;
    } catch {}
  }
  next();
}

function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
}

module.exports = { authMiddleware, optionalAuth, signToken };
