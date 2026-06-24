const express = require('express');
const { analyzeGoogle, analyzeNaver, getPlanLimits } = require('../services/keywordAnalyzer');
const { analyzeWithPython } = require('../services/pythonBridge');
const { logUsage, saveHistory, getHistory } = require('../services/db');

const router = express.Router();

// POST /api/keywords/analyze
router.post('/analyze', async (req, res) => {
  try {
    const { keyword, portal = 'google', period = 'monthly', use_python = false } = req.body;
    if (!keyword || keyword.trim().length < 1) return res.status(400).json({ error: 'Keyword required' });
    if (keyword.length > 100) return res.status(400).json({ error: 'Keyword too long' });

    const kw = keyword.trim();
    const user = req.user;
    const plan = user.plan || 'free';
    const limits = getPlanLimits(plan);

    logUsage(user.id, 'keyword_search', kw, portal);

    let result;

    if (use_python && plan !== 'free') {
      // Enhanced analysis with Python
      const pyResult = await analyzeWithPython(kw, portal, period);
      if (pyResult) {
        result = pyResult;
      }
    }

    if (!result) {
      if (portal === 'naver') {
        result = await analyzeNaver(kw, period);
      } else {
        result = await analyzeGoogle(kw, period);
      }
    }

    // Filter related keywords based on plan
    if (result.related_keywords) {
      result.related_keywords = result.related_keywords.slice(0, limits.related);
    }

    // Save history
    saveHistory(user.id, kw, portal, result);

    res.json({ success: true, data: result, plan_limits: limits });
  } catch (e) {
    console.error('[Keywords] analyze error:', e);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// POST /api/keywords/analyze-both  (Google + Naver at once)
router.post('/analyze-both', async (req, res) => {
  try {
    const { keyword, period = 'monthly' } = req.body;
    if (!keyword) return res.status(400).json({ error: 'Keyword required' });

    const kw = keyword.trim();
    const user = req.user;
    const plan = user.plan || 'free';

    if (plan === 'free') {
      return res.status(403).json({ error: 'Dual-portal analysis requires a paid plan', upgrade_url: '/pricing' });
    }

    logUsage(user.id, 'keyword_search_both', kw, 'both');

    const [google, naver] = await Promise.all([
      analyzeGoogle(kw, period),
      analyzeNaver(kw, period)
    ]);

    saveHistory(user.id, kw, 'both', { google, naver });

    res.json({ success: true, data: { google, naver } });
  } catch (e) {
    console.error('[Keywords] analyze-both error:', e);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// POST /api/keywords/bulk  (multiple keywords)
router.post('/bulk', async (req, res) => {
  try {
    const { keywords, portal = 'google', period = 'monthly' } = req.body;
    const user = req.user;
    const plan = user.plan || 'free';

    if (plan === 'free' || plan === 'starter') {
      return res.status(403).json({ error: 'Bulk analysis requires Pro plan or higher', upgrade_url: '/pricing' });
    }

    if (!Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ error: 'Keywords array required' });
    }

    const maxBulk = plan === 'business' ? 100 : 20;
    const toAnalyze = keywords.slice(0, maxBulk).map(k => k.trim()).filter(Boolean);

    const results = await Promise.all(
      toAnalyze.map(kw =>
        (portal === 'naver' ? analyzeNaver(kw, period) : analyzeGoogle(kw, period))
          .catch(() => ({ keyword: kw, error: 'Analysis failed' }))
      )
    );

    res.json({ success: true, data: results, count: results.length });
  } catch (e) {
    console.error('[Keywords] bulk error:', e);
    res.status(500).json({ error: 'Bulk analysis failed' });
  }
});

// GET /api/keywords/related?q=keyword&portal=google
router.get('/related', async (req, res) => {
  try {
    const { q, portal = 'google' } = req.query;
    if (!q) return res.status(400).json({ error: 'q param required' });

    const plan = req.user.plan || 'free';
    const limits = getPlanLimits(plan);

    const result = portal === 'naver'
      ? await analyzeNaver(q.trim(), 'monthly')
      : await analyzeGoogle(q.trim(), 'monthly');

    const related = (result.related_keywords || []).slice(0, limits.related);
    res.json({ success: true, data: related });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch related keywords' });
  }
});

// GET /api/keywords/history
router.get('/history', (req, res) => {
  try {
    const history = getHistory(req.user.id, 100);
    res.json({ success: true, data: history });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

module.exports = router;
