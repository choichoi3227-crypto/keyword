const express = require('express');
const { getTrends } = require('../services/db');
const { getLatestTrends } = require('../services/trendCrawler');

const router = express.Router();

// GET /api/trends?portal=google
router.get('/', (req, res) => {
  const { portal = 'google' } = req.query;
  if (!['google', 'naver'].includes(portal)) {
    return res.status(400).json({ error: 'portal must be google or naver' });
  }

  const inMemory = getLatestTrends()[portal] || [];
  if (inMemory.length > 0) {
    return res.json({ success: true, data: inMemory, portal });
  }

  const fromDB = getTrends(portal);
  res.json({ success: true, data: fromDB, portal });
});

// GET /api/trends/both
router.get('/both', (req, res) => {
  const latest = getLatestTrends();
  res.json({
    success: true,
    data: {
      google: latest.google?.length ? latest.google : getTrends('google'),
      naver: latest.naver?.length ? latest.naver : getTrends('naver')
    }
  });
});

module.exports = router;
