const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

let db;

function initDB() {
  db = new Database(path.join(__dirname, '../../data/keywordtool.db'));
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT,
      plan TEXT DEFAULT 'free',
      plan_expires_at INTEGER,
      paypal_subscription_id TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      last_login INTEGER
    );

    CREATE TABLE IF NOT EXISTS keyword_history (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      keyword TEXT NOT NULL,
      portal TEXT NOT NULL,
      result TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS keyword_cache (
      cache_key TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      ttl INTEGER DEFAULT 3600
    );

    CREATE TABLE IF NOT EXISTS user_usage (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      keyword TEXT,
      portal TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      paypal_order_id TEXT,
      paypal_subscription_id TEXT,
      plan TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      status TEXT DEFAULT 'pending',
      created_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS trends_cache (
      id TEXT PRIMARY KEY,
      portal TEXT NOT NULL,
      keyword TEXT NOT NULL,
      rank INTEGER NOT NULL,
      category TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_kh_user ON keyword_history(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_kc_key ON keyword_cache(cache_key);
    CREATE INDEX IF NOT EXISTS idx_uu_user ON user_usage(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_tc_portal ON trends_cache(portal, created_at DESC);
  `);

  // Clean expired cache every 10 min
  setInterval(() => {
    const now = Math.floor(Date.now() / 1000);
    db.prepare('DELETE FROM keyword_cache WHERE created_at + ttl < ?').run(now);
    db.prepare('DELETE FROM trends_cache WHERE created_at < ?').run(now - 600);
  }, 600000);

  return Promise.resolve();
}

function getDB() {
  return db;
}

// Users
function createUser(email, hashedPassword, name) {
  const id = uuidv4();
  db.prepare('INSERT INTO users (id, email, password, name) VALUES (?, ?, ?, ?)').run(id, email, hashedPassword, name || '');
  return id;
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function updateUserPlan(userId, plan, expiresAt, subscriptionId) {
  db.prepare('UPDATE users SET plan = ?, plan_expires_at = ?, paypal_subscription_id = ? WHERE id = ?')
    .run(plan, expiresAt, subscriptionId, userId);
}

function updateLastLogin(userId) {
  db.prepare('UPDATE users SET last_login = strftime(\'%s\',\'now\') WHERE id = ?').run(userId);
}

// Cache
function getCached(key) {
  const now = Math.floor(Date.now() / 1000);
  const row = db.prepare('SELECT data FROM keyword_cache WHERE cache_key = ? AND created_at + ttl > ?').get(key, now);
  return row ? JSON.parse(row.data) : null;
}

function setCache(key, data, ttl = 3600) {
  db.prepare('INSERT OR REPLACE INTO keyword_cache (cache_key, data, ttl) VALUES (?, ?, ?)')
    .run(key, JSON.stringify(data), ttl);
}

// History
function saveHistory(userId, keyword, portal, result) {
  const id = uuidv4();
  db.prepare('INSERT INTO keyword_history (id, user_id, keyword, portal, result) VALUES (?, ?, ?, ?, ?)')
    .run(id, userId, keyword, portal, JSON.stringify(result));
}

function getHistory(userId, limit = 50) {
  return db.prepare('SELECT keyword, portal, created_at FROM keyword_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(userId, limit);
}

// Usage tracking
function logUsage(userId, action, keyword, portal) {
  const id = uuidv4();
  db.prepare('INSERT INTO user_usage (id, user_id, action, keyword, portal) VALUES (?, ?, ?, ?, ?)')
    .run(id, userId, action, keyword, portal);
}

function getUsageToday(userId) {
  const startOfDay = Math.floor(new Date().setHours(0,0,0,0) / 1000);
  return db.prepare('SELECT COUNT(*) as count FROM user_usage WHERE user_id = ? AND action = \'keyword_search\' AND created_at >= ?')
    .get(userId, startOfDay).count;
}

// Payments
function createPayment(userId, orderId, plan, amount) {
  const id = uuidv4();
  db.prepare('INSERT INTO payments (id, user_id, paypal_order_id, plan, amount) VALUES (?, ?, ?, ?, ?)')
    .run(id, userId, orderId, plan, amount);
  return id;
}

function updatePaymentStatus(orderId, status, subscriptionId) {
  db.prepare('UPDATE payments SET status = ?, paypal_subscription_id = ? WHERE paypal_order_id = ?')
    .run(status, subscriptionId, orderId);
}

// Trends
function saveTrends(portal, trends) {
  const del = db.prepare('DELETE FROM trends_cache WHERE portal = ?');
  const ins = db.prepare('INSERT INTO trends_cache (id, portal, keyword, rank, category) VALUES (?, ?, ?, ?, ?)');
  const tx = db.transaction(() => {
    del.run(portal);
    for (const t of trends) {
      ins.run(uuidv4(), portal, t.keyword, t.rank, t.category || null);
    }
  });
  tx();
}

function getTrends(portal) {
  return db.prepare('SELECT keyword, rank, category FROM trends_cache WHERE portal = ? ORDER BY rank ASC LIMIT 20').all(portal);
}

module.exports = {
  initDB, getDB,
  createUser, getUserByEmail, getUserById, updateUserPlan, updateLastLogin,
  getCached, setCache,
  saveHistory, getHistory,
  logUsage, getUsageToday,
  createPayment, updatePaymentStatus,
  saveTrends, getTrends
};
