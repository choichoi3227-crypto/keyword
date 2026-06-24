/**
 * WASM Bridge for Node.js
 * Loads the compiled Rust/WASM module and exports typed wrappers.
 * Falls back to pure JS if WASM is not available.
 */

let wasm = null;

async function loadWasm() {
  if (wasm) return wasm;
  try {
    wasm = await import('./wasm/keyword_wasm.js');
    await wasm.default?.();
    console.log('[WASM] Module loaded successfully');
    return wasm;
  } catch (e) {
    console.warn('[WASM] Not available, using JS fallback:', e.message);
    return null;
  }
}

// ── Exported functions with JS fallbacks ──────────────────────────────────────

async function generateSlug(keyword) {
  const w = await loadWasm();
  if (w?.generate_slug) return w.generate_slug(keyword);
  // JS fallback
  return keyword.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9가-힣-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function scoreKeyword(keyword) {
  const w = await loadWasm();
  if (w?.score_keyword) {
    const result = w.score_keyword(keyword);
    return typeof result === 'object' ? result : JSON.parse(result);
  }
  // JS fallback
  const words = keyword.trim().split(/\s+/).length;
  const chars = keyword.length;
  let longtail = 0;
  if (words >= 3) longtail += 40;
  else if (words === 2) longtail += 20;
  if (chars > 8) longtail += 20;
  return { keyword, longtail_score: Math.min(100, longtail), word_count: words, char_count: chars, is_korean: /[가-힣]/.test(keyword) };
}

async function batchScoreKeywords(keywords) {
  const w = await loadWasm();
  if (w?.batch_score_keywords) {
    const json = w.batch_score_keywords(JSON.stringify(keywords));
    return JSON.parse(json);
  }
  // JS fallback
  return Promise.all(keywords.map(kw => scoreKeyword(kw)));
}

async function stripHtml(html) {
  const w = await loadWasm();
  if (w?.strip_html) return w.strip_html(html);
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function parseKoreanNumber(str) {
  const w = await loadWasm();
  if (w?.parse_korean_number) return w.parse_korean_number(str);
  // JS fallback
  if (str.includes('억')) return parseFloat(str) * 100000000;
  if (str.includes('만')) return parseFloat(str) * 10000;
  return parseFloat(str.replace(/,/g, '')) || 0;
}

async function calcOpportunity(monthlyVolume, difficulty, longtail) {
  const w = await loadWasm();
  if (w?.calc_opportunity) return w.calc_opportunity(monthlyVolume, difficulty, longtail);
  const volScore = Math.min(100, Math.log10(monthlyVolume + 1) * 15);
  return Math.min(100, Math.round(volScore * 0.4 + (100 - difficulty) * 0.4 + longtail * 0.2));
}

async function calcDifficulty(paidAds, contentCount, avgDA) {
  const w = await loadWasm();
  if (w?.calc_difficulty) return w.calc_difficulty(paidAds, contentCount, avgDA);
  const adFactor = Math.min(40, paidAds * 8);
  const contentFactor = Math.min(40, Math.log10(contentCount + 1) * 5);
  const daFactor = Math.min(20, avgDA / 5);
  return Math.min(100, Math.round(adFactor + contentFactor + daFactor));
}

module.exports = {
  loadWasm,
  generateSlug,
  scoreKeyword,
  batchScoreKeywords,
  stripHtml,
  parseKoreanNumber,
  calcOpportunity,
  calcDifficulty
};
