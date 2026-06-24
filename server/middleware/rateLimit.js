const { getUsageToday, logUsage } = require('../services/db');
const { checkCooldown, getPlanLimits } = require('../services/keywordAnalyzer');

function rateLimitMiddleware(req, res, next) {
  // Only apply to keyword search endpoints
  if (!req.path.includes('/analyze')) return next();

  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const plan = user.plan || 'free';
  const limits = getPlanLimits(plan);

  // Daily limit check
  const usedToday = getUsageToday(user.id);
  if (usedToday >= limits.daily) {
    return res.status(429).json({
      error: 'Daily limit reached',
      limit: limits.daily,
      used: usedToday,
      plan,
      upgrade_url: '/pricing'
    });
  }

  // Cooldown check
  const cooldownResult = checkCooldown(user.id, plan);
  if (!cooldownResult.ok) {
    return res.status(429).json({
      error: 'Please wait before next search',
      wait_ms: cooldownResult.waitMs,
      plan
    });
  }

  next();
}

module.exports = { rateLimitMiddleware };
