const express = require('express');
const { getHistory, getUsageToday } = require('../services/db');
const { getPlanLimits } = require('../services/keywordAnalyzer');

const router = express.Router();

// GET /api/user/profile
router.get('/profile', (req, res) => {
  const u = req.user;
  const limits = getPlanLimits(u.plan);
  const usedToday = getUsageToday(u.id);

  res.json({
    id: u.id,
    email: u.email,
    name: u.name,
    plan: u.plan,
    plan_expires_at: u.plan_expires_at,
    usage: {
      today: usedToday,
      daily_limit: limits.daily,
      remaining: Math.max(0, limits.daily - usedToday)
    },
    limits
  });
});

// GET /api/user/history
router.get('/history', (req, res) => {
  const history = getHistory(req.user.id, 100);
  res.json({ success: true, data: history });
});

module.exports = router;
