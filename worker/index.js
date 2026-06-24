/**
 * KeywordTool Cloudflare Worker
 * Acts as a stealthy proxy for fetching Google/Naver pages.
 * Bypasses IP blocks using Cloudflare's global network.
 */

const ALLOWED_SECRET = WORKER_SECRET; // Set in CF dashboard as env var

const ALLOWED_HOSTS = [
  'www.google.com',
  'google.com',
  'trends.google.com',
  'suggestqueries.google.com',
  'search.naver.com',
  'datalab.naver.com',
  'ac.search.naver.com',
  'shopping.naver.com',
  'manage.searchad.naver.com'
];

const ROTATING_UA = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
];

function randomUA() {
  return ROTATING_UA[Math.floor(Math.random() * ROTATING_UA.length)];
}

function isAllowedHost(url) {
  try {
    const host = new URL(url).hostname;
    return ALLOWED_HOSTS.some(h => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env, ctx) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Worker-Secret'
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Auth check
    const secret = request.headers.get('X-Worker-Secret');
    if (secret !== (env.WORKER_SECRET || ALLOWED_SECRET)) {
      return new Response('Forbidden', { status: 403 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response('Invalid JSON', { status: 400 });
    }

    const { url, headers: extraHeaders = {}, method = 'GET' } = body;

    if (!url) return new Response('url required', { status: 400 });
    if (!isAllowedHost(url)) return new Response('Host not allowed', { status: 403 });

    // Build stealth headers
    const fetchHeaders = {
      'User-Agent': randomUA(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1',
      ...extraHeaders
    };

    try {
      const response = await fetch(url, {
        method,
        headers: fetchHeaders,
        redirect: 'follow',
        cf: {
          // Use Cloudflare's caching
          cacheTtl: 300,
          cacheEverything: false,
          // Bypass origin's cache
          cacheKey: url + '_' + Date.now()
        }
      });

      const contentType = response.headers.get('content-type') || 'text/html';
      const body = await response.arrayBuffer();

      return new Response(body, {
        status: response.status,
        headers: {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'X-Proxy-Status': response.status.toString()
        }
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
};
