const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { createPayment, updatePaymentStatus, updateUserPlan } = require('../services/db');

const router = express.Router();

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';
const PAYPAL_BASE = process.env.PAYPAL_ENV === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

const PLANS = {
  starter:  { price: 19, name: 'Starter Plan',  days: 30 },
  pro:      { price: 29, name: 'Pro Plan',       days: 30 },
  business: { price: 47, name: 'Business Plan',  days: 30 },
  enterprise:{ price: 79, name: 'Enterprise Plan', days: 30 }
};

async function getPayPalToken() {
  const creds = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const data = await res.json();
  return data.access_token;
}

// POST /api/payment/create-order
router.post('/create-order', authMiddleware, async (req, res) => {
  try {
    const { plan } = req.body;
    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });

    const planInfo = PLANS[plan];
    const token = await getPayPalToken();

    const orderRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: {
            currency_code: 'USD',
            value: planInfo.price.toFixed(2)
          },
          description: planInfo.name
        }],
        application_context: {
          return_url: `${process.env.BASE_URL}/payment/success`,
          cancel_url: `${process.env.BASE_URL}/pricing`,
          brand_name: 'KeywordTool',
          landing_page: 'BILLING',
          user_action: 'PAY_NOW'
        }
      })
    });

    const order = await orderRes.json();
    if (!order.id) return res.status(500).json({ error: 'PayPal order creation failed', detail: order });

    createPayment(req.user.id, order.id, plan, planInfo.price);

    res.json({ orderId: order.id, plan });
  } catch (e) {
    console.error('[Payment] create-order error:', e);
    res.status(500).json({ error: 'Payment initialization failed' });
  }
});

// POST /api/payment/capture
router.post('/capture', authMiddleware, async (req, res) => {
  try {
    const { orderId, plan } = req.body;
    if (!orderId || !plan) return res.status(400).json({ error: 'orderId and plan required' });
    if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });

    const token = await getPayPalToken();
    const captureRes = await fetch(`${PAYPAL_BASE}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const capture = await captureRes.json();
    if (capture.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'Payment not completed', status: capture.status });
    }

    const planInfo = PLANS[plan];
    const expiresAt = Math.floor(Date.now() / 1000) + planInfo.days * 86400;

    updatePaymentStatus(orderId, 'completed', null);
    updateUserPlan(req.user.id, plan, expiresAt, null);

    res.json({ success: true, plan, expires_at: expiresAt });
  } catch (e) {
    console.error('[Payment] capture error:', e);
    res.status(500).json({ error: 'Payment capture failed' });
  }
});

// GET /api/payment/plans  (public)
router.get('/plans', (req, res) => {
  res.json({
    plans: [
      {
        id: 'starter',
        name: 'Starter',
        price: 19,
        period: 'month',
        features: [
          '일 50회 키워드 분석',
          '연관 키워드 20개',
          '검색량 + CPC 데이터',
          '분석 내역 100개',
          '실시간 인기 검색어',
          'CSV 내보내기',
          '10초 쿨타임'
        ],
        limits: { daily: 50, related: 20, cooldown_sec: 10 }
      },
      {
        id: 'pro',
        name: 'Pro',
        price: 29,
        period: 'month',
        popular: true,
        features: [
          '일 200회 키워드 분석',
          '연관 키워드 50개',
          '구글 + 네이버 동시 분석',
          '분석 내역 500개',
          '실시간 인기 검색어',
          'CSV / Excel 내보내기',
          'Python 심화 분석',
          '3초 쿨타임'
        ],
        limits: { daily: 200, related: 50, cooldown_sec: 3 }
      },
      {
        id: 'business',
        name: 'Business',
        price: 47,
        period: 'month',
        features: [
          '일 999회 키워드 분석',
          '연관 키워드 100개',
          '벌크 분석 (20개 동시)',
          '구글 + 네이버 동시 분석',
          '분석 내역 무제한',
          '모든 내보내기 형식',
          'Python 심화 분석',
          '1초 쿨타임'
        ],
        limits: { daily: 999, related: 100, cooldown_sec: 1 }
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: 79,
        period: 'month',
        features: [
          '무제한 키워드 분석',
          '연관 키워드 무제한',
          '벌크 분석 (100개 동시)',
          '구글 + 네이버 동시 분석',
          '분석 내역 무제한',
          '모든 내보내기 형식',
          'Python 심화 분석',
          'API 직접 접근',
          '쿨타임 없음'
        ],
        limits: { daily: 9999, related: 999, cooldown_sec: 0 }
      }
    ]
  });
});

// PayPal webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const event = JSON.parse(req.body);
    if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
      const orderId = event.resource?.supplementary_data?.related_ids?.order_id;
      if (orderId) {
        updatePaymentStatus(orderId, 'completed', null);
      }
    }
    res.json({ received: true });
  } catch (e) {
    res.status(400).json({ error: 'Webhook error' });
  }
});

module.exports = router;
