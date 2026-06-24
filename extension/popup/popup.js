const API_BASE = 'http://localhost:4000'; // Change to production URL
let token = null;
let user  = null;
let portal = 'google';

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const stored = await chrome.storage.local.get(['kl_token', 'kl_user']);
  token = stored.kl_token || null;
  user  = stored.kl_user || null;

  if (!token) {
    document.getElementById('auth-prompt').style.display = 'block';
  } else {
    document.getElementById('main-ui').style.display = 'block';
    document.getElementById('plan-badge').textContent = planLabel(user?.plan || 'free');
    loadUsage();
    // Auto-fill keyword from active tab
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        const kw = extractKeywordFromURL(tab.url);
        if (kw) {
          document.getElementById('kw-input').value = kw;
          // Detect portal from URL
          if (tab.url.includes('naver.com')) setPortal('naver');
          else setPortal('google');
        }
      }
    } catch {}
  }
});

function planLabel(p) {
  return { free: 'Free', starter: 'Starter', pro: 'Pro', business: 'Business', enterprise: 'Enterprise' }[p] || 'Free';
}

function extractKeywordFromURL(url) {
  try {
    const u = new URL(url);
    return u.searchParams.get('q') || u.searchParams.get('query') || '';
  } catch { return ''; }
}

function setPortal(p) {
  portal = p;
  document.getElementById('pb-google').classList.toggle('active', p === 'google');
  document.getElementById('pb-naver').classList.toggle('active', p === 'naver');
}

function openLogin() {
  chrome.tabs.create({ url: `${API_BASE}/?ext=1` });
}

function openSite() {
  const kw = document.getElementById('kw-input')?.value?.trim() || '';
  chrome.tabs.create({ url: `${API_BASE}/${kw ? '?q=' + encodeURIComponent(kw) + '&portal=' + portal : ''}` });
}

async function loadUsage() {
  if (!token) return;
  try {
    const res = await apiFetch('/api/user/profile');
    const u = res.usage;
    document.getElementById('usage-text').textContent = `오늘 ${u.today}/${u.daily_limit}회 사용`;
  } catch {}
}

// ── Analysis ──────────────────────────────────────────────────────────────────
async function analyze() {
  const kw = document.getElementById('kw-input').value.trim();
  if (!kw) return;

  setResults('<div class="loading"><div class="spin"></div><br/>분석 중...</div>');

  try {
    const res = await apiFetch('/api/keywords/analyze', 'POST', { keyword: kw, portal, period: 'monthly' });
    renderResults(res.data, res.plan_limits);
    loadUsage();
  } catch (e) {
    if (e.status === 429) {
      const data = e.data || {};
      setResults(`
        <div style="padding:20px;text-align:center;color:#F87171;font-size:12px">
          <div style="font-size:20px;margin-bottom:8px">⚠️</div>
          <div>${data.error || '이용 한도 초과'}</div>
          <button onclick="openSite()" style="margin-top:12px;padding:6px 16px;background:#2563EB;color:white;border:none;border-radius:8px;cursor:pointer;font-size:12px">업그레이드</button>
        </div>
      `);
    } else {
      setResults(`<div style="padding:20px;text-align:center;color:#F87171;font-size:12px">분석 실패: ${e.message}</div>`);
    }
  }
}

function setResults(html) {
  document.getElementById('results').innerHTML = html;
}

function renderResults(d, limits) {
  const score = d.overall_score || 0;
  const scoreClass = score >= 70 ? 'high' : score >= 40 ? 'mid' : 'low';

  const isNaver = d.portal === 'naver';

  let html = `
    <!-- KPI Grid -->
    <div class="kpi-grid">
      <div class="kpi">
        <div class="kpi-label">월간 검색량</div>
        <div class="kpi-value blue">${fmtNum(d.monthly_volume)}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">종합 점수</div>
        <div class="kpi-value ${score>=70?'green':score>=40?'amber':'red'}">${score}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">평균 CPC</div>
        <div class="kpi-value purple">${d.cpc_avg ? '₩'+fmtNum(d.cpc_avg) : 'N/A'}</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">난이도</div>
        <div class="kpi-value ${(d.difficulty_score||0)<40?'green':(d.difficulty_score||0)<70?'amber':'red'}">${d.difficulty_score || 0}</div>
      </div>
    </div>

    <div class="section-title">검색량 분석</div>
    ${barRow('일간', d.daily_volume, 100000, '#60A5FA')}
    ${barRow('주간', d.weekly_volume, 500000, '#60A5FA')}
    ${barRow('월간', d.monthly_volume, 1000000, '#60A5FA')}

    <div class="section-title">점수 지표</div>
    ${barRow('기회 지수', d.opportunity_score, 100, '#22C55E')}
    ${barRow('경쟁 점수', d.competition_score, 100, '#EF4444')}
    ${barRow('롱테일', d.longtail_score, 100, '#A78BFA')}
    ${isNaver ? barRow('포화도', d.content_saturation, 100, '#F59E0B') : ''}

    <div class="section-title">상세 정보</div>
    <div class="metric-row"><span class="metric-label">검색 의도</span><span class="metric-value">${intentLabel(d.intent)}</span></div>
    ${isNaver ? `
    <div class="metric-row"><span class="metric-label">블로그 수</span><span class="metric-value">${fmtNum(d.blog_count||0)}</span></div>
    <div class="metric-row"><span class="metric-label">카페 수</span><span class="metric-value">${fmtNum(d.cafe_count||0)}</span></div>
    <div class="metric-row"><span class="metric-label">PC 비율</span><span class="metric-value">${d.pc_ratio||38}%</span></div>
    ` : `
    <div class="metric-row"><span class="metric-label">유료 광고 수</span><span class="metric-value">${d.paid_results_count||0}개</span></div>
    <div class="metric-row"><span class="metric-label">Featured Snippet</span><span class="metric-value">${d.featured_snippet?'있음':'없음'}</span></div>
    <div class="metric-row"><span class="metric-label">CPC 범위</span><span class="metric-value">₩${fmtNum(d.cpc_low||0)}~₩${fmtNum(d.cpc_high||0)}</span></div>
    `}
  `;

  // Related keywords
  const related = [...(d.autocomplete_suggestions||[]), ...(d.related_keywords||[])].slice(0, limits?.related || 10);
  if (related.length > 0) {
    html += `
      <div class="section-title">연관 검색어</div>
      <div class="tags">
        ${related.map(r => `<span class="tag" onclick="searchKw('${esc(r.keyword||r)}')">${esc(r.keyword||r)}</span>`).join('')}
      </div>
    `;
  }

  setResults(html);

  // Animate bars
  setTimeout(() => {
    document.querySelectorAll('.bar-fill[data-w]').forEach(el => {
      el.style.width = el.dataset.w;
    });
  }, 30);
}

function barRow(label, value, max, color) {
  const pct = Math.min(100, Math.round((value || 0) / max * 100));
  return `
    <div class="bar-row">
      <span class="bar-label">${label}</span>
      <div class="bar-track">
        <div class="bar-fill" style="background:${color};width:0%" data-w="${pct}%"></div>
      </div>
      <span class="bar-num">${fmtNum(value||0)}</span>
    </div>
  `;
}

function searchKw(kw) {
  document.getElementById('kw-input').value = kw;
  analyze();
}

function intentLabel(type) {
  return { transactional: '구매 의도', informational: '정보 탐색', commercial: '비교 탐색', navigational: '사이트 탐색' }[type] || type || '-';
}

function fmtNum(n) {
  if (!n && n !== 0) return '0';
  if (n >= 100000000) return (n/100000000).toFixed(1)+'억';
  if (n >= 10000) return (n/10000).toFixed(1)+'만';
  return n.toLocaleString('ko-KR');
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function apiFetch(path, method='GET', body=null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);

  const res = await fetch(API_BASE + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
