const UserAgent = require('user-agents');

const WORKER_URL = process.env.CF_WORKER_URL || 'https://keyword-proxy.your-worker.workers.dev';
const WORKER_SECRET = process.env.CF_WORKER_SECRET || 'changeme';

// Rotating user agents for stealth
const agents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

let agentIndex = 0;
function getAgent() {
  agentIndex = (agentIndex + 1) % agents.length;
  return agents[agentIndex];
}

/**
 * Fetch a URL through the Cloudflare Worker proxy with stealth headers.
 * Falls back to direct fetch if worker is unavailable.
 */
async function fetchViaWorker(targetUrl, options = {}) {
  const { headers = {}, json = false, stripPrefix = null, timeout = 10000 } = options;

  const proxyPayload = {
    url: targetUrl,
    headers: {
      'User-Agent': getAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      ...headers
    }
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    let response;
    
    // Try via Cloudflare Worker first
    try {
      response = await fetch(WORKER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Worker-Secret': WORKER_SECRET
        },
        body: JSON.stringify(proxyPayload),
        signal: controller.signal
      });
    } catch (workerErr) {
      // Fallback: direct fetch
      response = await fetch(targetUrl, {
        headers: proxyPayload.headers,
        signal: controller.signal
      });
    }

    clearTimeout(timer);
    if (!response.ok) return null;

    if (json) {
      const text = await response.text();
      const clean = stripPrefix ? text.replace(stripPrefix, '') : text;
      try {
        return JSON.parse(clean);
      } catch { return null; }
    }

    const buffer = await response.arrayBuffer();
    // Handle EUC-KR encoded pages (Naver sometimes)
    const text = decodeBuffer(buffer, response.headers.get('content-type') || '');
    if (stripPrefix) return text.replace(stripPrefix, '');
    return text;
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

function decodeBuffer(buffer, contentType) {
  try {
    const iconv = require('iconv-lite');
    if (contentType.includes('euc-kr') || contentType.includes('ks_c_5601')) {
      return iconv.decode(Buffer.from(buffer), 'euc-kr');
    }
    return new TextDecoder('utf-8').decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

module.exports = { fetchViaWorker };
