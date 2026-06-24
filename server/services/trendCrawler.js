const cron = require('node-cron');
const { fetchViaWorker } = require('./cloudflareProxy');
const { saveTrends, getTrends } = require('./db');

let latestTrends = { google: [], naver: [] };

async function crawlGoogleTrends() {
  try {
    const url = 'https://trends.google.com/trending/rss?geo=KR';
    const xml = await fetchViaWorker(url, { headers: { 'Accept': 'application/rss+xml' } });
    if (!xml) return;

    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    const trends = items.slice(0, 20).map((item, i) => {
      const title = item.match(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>/)?.[1] 
                 || item.match(/<title>([^<]+)<\/title>/)?.[1] 
                 || '';
      const traffic = item.match(/<ht:approx_traffic>([^<]+)<\/ht:approx_traffic>/)?.[1] || '';
      return { keyword: title.trim(), rank: i + 1, traffic };
    }).filter(t => t.keyword);

    if (trends.length > 0) {
      latestTrends.google = trends;
      saveTrends('google', trends);
      global.broadcastTrends?.({ portal: 'google', trends });
    }
  } catch (e) {
    console.error('[TrendCrawler] Google error:', e.message);
  }
}

async function crawlNaverTrends() {
  try {
    // Naver DataLab popular keywords
    const url = 'https://datalab.naver.com/';
    const html = await fetchViaWorker(url, {
      headers: {
        'Referer': 'https://www.naver.com/',
        'Accept-Language': 'ko-KR,ko;q=0.9'
      }
    });
    
    const trends = [];
    
    if (html) {
      // Try to extract from DataLab main page
      const rankMatches = html.match(/<a[^>]*class="[^"]*keyword[^"]*"[^>]*>([^<]+)<\/a>/g) || [];
      for (let i = 0; i < Math.min(20, rankMatches.length); i++) {
        const kw = rankMatches[i].replace(/<[^>]+>/g, '').trim();
        if (kw) trends.push({ keyword: kw, rank: i + 1 });
      }
    }

    // Fallback: Naver Shopping trends
    if (trends.length === 0) {
      const shopUrl = 'https://shopping.naver.com/';
      const shopHtml = await fetchViaWorker(shopUrl, {
        headers: { 'Accept-Language': 'ko-KR' }
      });
      if (shopHtml) {
        const matches = shopHtml.match(/<span[^>]*class="[^"]*keyword[^"]*"[^>]*>([^<]{2,20})<\/span>/g) || [];
        for (let i = 0; i < Math.min(20, matches.length); i++) {
          const kw = matches[i].replace(/<[^>]+>/g, '').trim();
          if (kw && !trends.find(t => t.keyword === kw)) {
            trends.push({ keyword: kw, rank: trends.length + 1 });
          }
        }
      }
    }

    if (trends.length > 0) {
      latestTrends.naver = trends;
      saveTrends('naver', trends);
      global.broadcastTrends?.({ portal: 'naver', trends });
    }
  } catch (e) {
    console.error('[TrendCrawler] Naver error:', e.message);
  }
}

function startTrendCrawler() {
  // Initial crawl
  crawlGoogleTrends();
  crawlNaverTrends();

  // Every 10 minutes
  cron.schedule('*/10 * * * *', () => {
    crawlGoogleTrends();
    crawlNaverTrends();
  });

  console.log('[TrendCrawler] Started — refresh every 10 min');
}

function getLatestTrends() {
  return latestTrends;
}

module.exports = { startTrendCrawler, getLatestTrends, crawlGoogleTrends, crawlNaverTrends };
