const express = require('express');
const bcrypt = require('bcryptjs');
const { createUser, getUserByEmail, updateLastLogin } = require('../services/db');
const { signToken, authMiddleware } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });

    const existing = getUserByEmail(email);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 12);
    const userId = createUser(email.toLowerCase(), hashed, name || '');
    const token = signToken(userId);

    res.json({ token, user: { id: userId, email, name: name || '', plan: 'free' } });
  } catch (e) {
    console.error('[Auth] register error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = getUserByEmail(email.toLowerCase());
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    updateLastLogin(user.id);
    const token = signToken(user.id);

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, plan: user.plan }
    });
  } catch (e) {
    console.error('[Auth] login error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const u = req.user;
  res.json({
    id: u.id,
    email: u.email,
    name: u.name,
    plan: u.plan,
    plan_expires_at: u.plan_expires_at
  });
});

module.exports = router;
