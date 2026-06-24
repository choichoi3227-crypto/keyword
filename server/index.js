require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const authRoutes = require('./routes/auth');
const keywordRoutes = require('./routes/keywords');
const paymentRoutes = require('./routes/payment');
const trendRoutes = require('./routes/trends');
const userRoutes = require('./routes/user');

const { initDB } = require('./services/db');
const { startTrendCrawler } = require('./services/trendCrawler');
const { rateLimitMiddleware } = require('./middleware/rateLimit');
const { authMiddleware } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws/trends' });

// Security & performance
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/keywords', authMiddleware, rateLimitMiddleware, keywordRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/trends', trendRoutes);
app.use('/api/user', authMiddleware, userRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ts: Date.now() });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// WebSocket - realtime trends
const trendClients = new Set();
wss.on('connection', (ws) => {
  trendClients.add(ws);
  ws.on('close', () => trendClients.delete(ws));
  ws.on('error', () => trendClients.delete(ws));
});

global.broadcastTrends = (data) => {
  const msg = JSON.stringify(data);
  for (const client of trendClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
};

const PORT = process.env.PORT || 4000;

async function main() {
  await initDB();
  startTrendCrawler();
  server.listen(PORT, () => {
    console.log(`[KeywordTool] Server running on port ${PORT}`);
  });
}

main().catch(console.error);
