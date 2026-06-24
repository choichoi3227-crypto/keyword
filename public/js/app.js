// ── State ────────────────────────────────────────────────────────────────────
const API = '';  // Same origin
let token = localStorage.getItem('kl_token') || null;
let user  = JSON.parse(localStorage.getItem('kl_user') || 'null');
let currentPortal = 'google';
let acTimer = null;
let ws = null;

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateAuthUI();
  showPage('home');
  loadTrends();
  connectWS();
  loadPaypalSDK();
});

// ── Navigation ────────────────────────────────────────────────────────────────
function showPage(name) {
  ['home', 'trends', 'pricing', 'history'].forEach(p => {
    document.getElementById('page-' + p)?.classList.toggle('hidden', p !== name);
  });
  if (name === 'trends')  loadTrends();
  if (name === 'pricing') loadPricing();
  if (name === 'history') loadHistory();
}

// ── Auth UI ──────────────────────────────────────────────────────────────────
function updateAuthUI() {
  const loggedIn = !!token && !!user;
  document.getElementById('nav-auth').classList.toggle('hidden', loggedIn);
  document.getElementById('nav-user').classList.toggle('hidden', !loggedIn);
  const hiddenEl = document.getElementById('nav-user');
  if (hiddenEl) hiddenEl.classList.toggle('flex', loggedIn);
  if (loggedIn && user) {
    const planEl = document.getElementById('nav-plan-badge');
    const nameEl = document.getElementById('nav-username');
    if (planEl) planEl.textContent = planLabel(user.plan);
    if (nameEl) nameEl.textContent = user.name || user.email;
  }
}

function planLabel(plan) {
  const labels = { free: 'Free', starter: 'Starter', pro: 'Pro', business: 'Business', enterprise: 'Enterprise' };
  return labels[plan] || 'Free';
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function showModal(name) {
  document.getElementById('modal-overlay').classList.remove('hidden');
  ['login', 'register', 'payment'].forEach(m => {
    document.getElementById('modal-' + m)?.classList.toggle('hidden', m !== name);
  });
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// ── Auth ──────────────────────────────────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pw    = document.getElementById('login-pw').value;
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');

  if (!email || !pw) { showErr(errEl, '이메일과 비밀번호를 입력하세요.'); return; }

  try {
    const res = await apiFetch('/api/auth/login', 'POST', { email, password: pw });
    token = res.token;
    user  = res.user;
    localStorage.setItem('kl_token', token);
    localStorage.setItem('kl_user', JSON.stringify(user));
    updateAuthUI();
    closeModal();
  } catch (e) {
    showErr(errEl, e.message || '로그인 실패');
  }
}

async function doRegister() {
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pw    = document.getElementById('reg-pw').value;
  const errEl = document.getElementById('reg-error');
  errEl.classList.add('hidden');

  if (!email || !pw) { showErr(errEl, '이메일과 비밀번호를 입력하세요.'); return; }
  if (pw.length < 8) { showErr(errEl, '비밀번호는 8자 이상이어야 합니다.'); return; }

  try {
    const res = await apiFetch('/api/auth/register', 'POST', { email, password: pw, name });
    token = res.token;
    user  = res.user;
    localStorage.setItem('kl_token', token);
    localStorage.setItem('kl_user', JSON.stringify(user));
    updateAuthUI();
    closeModal();
  } catch (e) {
    showErr(errEl, e.message || '회원가입 실패');
  }
}

function logout() {
  token = null; user = null;
  localStorage.removeItem('kl_token');
  localStorage.removeItem('kl_user');
  updateAuthUI();
  showPage('home');
}

// ── Portal ────────────────────────────────────────────────────────────────────
function setPortal(p) {
  currentPortal = p;
  ['google', 'naver'].forEach(portal => {
    const btn = document.getElementById('btn-portal-' + portal);
    const active = portal === p;
    btn.classList.toggle('text-white', active);
    btn.classList.toggle('bg-primary/20', active);
    btn.classList.toggle('text-muted', !active);
  });
}

// ── Autocomplete ──────────────────────────────────────────────────────────────
function onSearchInput(value) {
  clearTimeout(acTimer);
  const list = document.getElementById('autocomplete-list');
  if (!value || value.length < 1) { list.classList.add('hidden'); return; }
  acTimer = setTimeout(() => fetchAutocomplete(value), 200);
}

async function fetchAutocomplete(q) {
  const list = document.getElementById('autocomplete-list');
  try {
    const url = currentPortal === 'naver'
      ? `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(q)}&st=100&r_format=json&r_enc=UTF-8&_callback=`
      : `https://suggestqueries.google.com/complete/search?client=firefox&hl=ko&gl=kr&q=${encodeURIComponent(q)}`;

    // Use our API proxy to avoid CORS
    const res = await apiFetch(`/api/keywords/related?q=${encodeURIComponent(q)}&portal=${currentPortal}`, 'GET', null, true);
    const suggestions = res.data?.slice(0, 8) || [];

    if (suggestions.length === 0) { list.classList.add('hidden'); return; }

    list.innerHTML = suggestions.map(s => `
      <div class="ac-item" onclick="selectAC('${escHtml(s.keyword)}')">
        <svg class="w-3.5 h-3.5 text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
        <span>${escHtml(s.keyword)}</span>
      </div>
    `).join('');
    list.classList.remove('hidden');
  } catch {
    list.classList.add('hidden');
  }
}

function selectAC(kw) {
  document.getElementById('search-input').value = kw;
  document.getElementById('autocomplete-list').classList.add('hidden');
  runAnalysis();
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#hero-search')) {
    document.getElementById('autocomplete-list')?.classList.add('hidden');
  }
});

// ── Analysis ──────────────────────────────────────────────────────────────────
function quickSearch(kw) {
  document.getElementById('search-input').value = kw;
  runAnalysis();
}

async function runAnalysis() {
  const kw = document.getElementById('search-input').value.trim();
  if (!kw) return;

  if (!token) { showModal('login'); return; }

  const period = document.getElementById('period-select').value;
  const area = document.getElementById('results-area');
  const loading = document.getElementById('results-loading');
  const errEl = document.getElementById('results-error');
  const content = document.getElementById('results-content');

  area.classList.remove('hidden');
  loading.classList.remove('hidden');
  errEl.classList.add('hidden');
  content.classList.add('hidden');
  document.getElementById('autocomplete-list').classList.add('hidden');

  try {
    const res = await apiFetch('/api/keywords/analyze', 'POST', {
      keyword: kw,
      portal: currentPortal,
      period
    });

    loading.classList.add('hidden');
    content.classList.remove('hidden');
    renderResults(res.data, res.plan_limits);
    content.classList.add('fade-up');
  } catch (e) {
    loading.classList.add('hidden');
    errEl.classList.remove('hidden');
    document.getElementById('error-msg').textContent = e.message || '분석에 실패했습니다.';

    if (e.status === 429) {
      document.getElementById('error-msg').textContent = e.data?.error || '이용 한도에 도달했습니다. 플랜을 업그레이드하세요.';
    }
  }
}

// ── Results Renderer ──────────────────────────────────────────────────────────
function renderResults(d, limits) {
  const content = document.getElementById('results-content');

  const portalColor = d.portal === 'naver' ? '#03C75A' : '#4285F4';
  const score = d.overall_score || 0;
  const scoreColor = score >= 70 ? '#22C55E' : score >= 40 ? '#F59E0B' : '#EF4444';

  const periodLabel = { monthly: '월', weekly: '주', daily: '일', yearly: '연' };
  const pl = periodLabel[d.period] || '월';

  content.innerHTML = `
    <!-- Header -->
    <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <div class="flex items-center gap-3 mb-1">
          <h2 class="text-2xl font-bold">"${escHtml(d.keyword)}"</h2>
          <span class="text-xs px-2.5 py-0.5 rounded-full font-medium" style="background:${portalColor}20;color:${portalColor}">
            ${d.portal === 'naver' ? '네이버' : '구글'}
          </span>
          <span class="text-xs px-2.5 py-0.5 rounded-full bg-panel border border-border text-muted">
            ${pl}간 기준
          </span>
        </div>
        <p class="text-muted text-sm">분석 완료 · ${new Date(d.analyzed_at).toLocaleTimeString('ko-KR')}</p>
      </div>
      <div class="flex gap-2">
        <button onclick="exportCSV()" class="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border text-muted hover:text-white hover:border-primary transition-colors">
          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          CSV 저장
        </button>
        <button onclick="runAnalysisBoth()" class="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-primary text-primary hover:bg-primary/10 transition-colors">
          구글+네이버 동시분석
        </button>
      </div>
    </div>

    <!-- KPI row -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      ${kpiCard('검색량 (' + pl + '간)', fmtNum(d.monthly_volume || d.volume), '${pl}간 총 검색량', '#38BDF8')}
      ${kpiCard('전체 점수', score + '점', '기회·난이도 종합', scoreColor)}
      ${kpiCard('평균 CPC', d.cpc_avg ? '₩' + fmtNum(d.cpc_avg) : 'N/A', '광고 클릭 단가', '#A78BFA')}
      ${kpiCard('난이도', (d.difficulty_score || 0) + '점', '낮을수록 진입 쉬움', '#F87171')}
    </div>

    <!-- Volume breakdown (naver has pc/mobile split) -->
    ${d.portal === 'naver' ? `
    <div class="grid grid-cols-3 gap-4 mb-6">
      ${kpiCard('PC 검색', fmtNum(d.monthly_pc || 0), 'PC 월간', '#60A5FA')}
      ${kpiCard('모바일 검색', fmtNum(d.monthly_mobile || 0), '모바일 월간', '#34D399')}
      ${kpiCard('모바일 비율', (d.mobile_ratio || 0) + '%', '전체 대비', '#FBBF24')}
    </div>` : ''}

    <!-- Main grid -->
    <div class="grid lg:grid-cols-3 gap-5 mb-6">

      <!-- Score rings -->
      <div class="metric-card">
        <h3 class="text-sm font-semibold mb-4 text-muted uppercase tracking-wide">점수 요약</h3>
        <div class="space-y-3">
          ${scoreBar('기회 지수', d.opportunity_score || 0, '#22C55E')}
          ${scoreBar('경쟁 지수', d.competition_score || 0, '#EF4444')}
          ${scoreBar('롱테일 지수', d.longtail_score || 0, '#A78BFA')}
          ${d.portal === 'naver' ? scoreBar('포화도', d.content_saturation || 0, '#F59E0B') : ''}
          ${d.portal === 'naver' ? scoreBar('커뮤니티 활성도', d.community_activity || 0, '#38BDF8') : ''}
          ${d.portal === 'naver' ? scoreBar('상업적 의도', d.commercial_intent || 0, '#FB923C') : ''}
          ${d.portal === 'google' ? scoreBar('광고 경쟁', d.ad_competition || 0, '#FB923C') : ''}
        </div>
      </div>

      <!-- Volume chart -->
      <div class="metric-card">
        <h3 class="text-sm font-semibold mb-4 text-muted uppercase tracking-wide">검색량 분석</h3>
        <div class="space-y-2.5">
          ${volRow('일간', d.daily_volume || 0)}
          ${volRow('주간', d.weekly_volume || 0)}
          ${volRow('월간', d.monthly_volume || 0)}
          ${volRow('연간', d.yearly_volume || 0)}
        </div>
        <div class="mt-4 pt-4 border-t border-border">
          <div class="flex justify-between text-xs text-muted mb-1">
            <span>검색 의도</span>
            <span class="text-white capitalize">${intentLabel(d.intent)} (${d.intent_confidence || 0}%)</span>
          </div>
          ${d.portal === 'google' ? `
          <div class="flex justify-between text-xs text-muted">
            <span>CPC 범위</span>
            <span class="text-white">₩${fmtNum(d.cpc_low || 0)} ~ ₩${fmtNum(d.cpc_high || 0)}</span>
          </div>` : `
          <div class="flex justify-between text-xs text-muted">
            <span>PC : 모바일</span>
            <span class="text-white">${d.pc_ratio || 38}% : ${d.mobile_ratio || 62}%</span>
          </div>`}
        </div>
      </div>

      <!-- Demographics -->
      <div class="metric-card">
        <h3 class="text-sm font-semibold mb-4 text-muted uppercase tracking-wide">인구통계 (추정)</h3>
        ${renderAgeChart(d.age_distribution || {})}
        <div class="mt-3 flex gap-3">
          <div class="flex-1 text-center text-xs">
            <div class="text-muted mb-1">성별</div>
            ${renderGenderBar(d.gender_distribution || {})}
          </div>
        </div>
      </div>
    </div>

    <!-- 2nd row -->
    <div class="grid lg:grid-cols-2 gap-5 mb-6">

      <!-- Naver-specific content -->
      ${d.portal === 'naver' ? `
      <div class="metric-card">
        <h3 class="text-sm font-semibold mb-4 text-muted uppercase tracking-wide">콘텐츠 포화도</h3>
        <div class="space-y-3">
          ${contentRow('블로그', d.blog_count || 0, '#60A5FA')}
          ${contentRow('카페', d.cafe_count || 0, '#34D399')}
          ${contentRow('뉴스', d.news_count || 0, '#A78BFA')}
          <div class="pt-2 border-t border-border text-xs text-muted flex justify-between">
            <span>총 콘텐츠 수</span>
            <span class="text-white font-semibold">${fmtNum(d.total_content_count || 0)}개</span>
          </div>
        </div>
        ${d.avg_price > 0 ? `
        <div class="mt-4 pt-4 border-t border-border">
          <h4 class="text-xs text-muted mb-2">쇼핑 데이터</h4>
          <div class="grid grid-cols-3 gap-2 text-center text-xs">
            <div><div class="text-white font-semibold">₩${fmtNum(d.min_price)}</div><div class="text-muted">최저가</div></div>
            <div><div class="text-white font-semibold">₩${fmtNum(d.avg_price)}</div><div class="text-muted">평균가</div></div>
            <div><div class="text-white font-semibold">₩${fmtNum(d.max_price)}</div><div class="text-muted">최고가</div></div>
          </div>
        </div>` : ''}
      </div>` : ''}

      <!-- Google SERP features -->
      ${d.portal === 'google' ? `
      <div class="metric-card">
        <h3 class="text-sm font-semibold mb-4 text-muted uppercase tracking-wide">SERP 분석</h3>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between"><span class="text-muted">유료 광고 수</span><span>${d.paid_results_count || 0}개</span></div>
          <div class="flex justify-between"><span class="text-muted">Featured Snippet</span><span class="${d.featured_snippet ? 'text-success' : 'text-muted'}">${d.featured_snippet ? '있음' : '없음'}</span></div>
          <div class="flex justify-between"><span class="text-muted">Knowledge Panel</span><span class="${d.knowledge_panel ? 'text-success' : 'text-muted'}">${d.knowledge_panel ? '있음' : '없음'}</span></div>
          <div class="flex justify-between"><span class="text-muted">연간 성장률</span><span class="${(d.search_volume_growth_yoy||0)>=0?'text-success':'text-danger'}">${(d.search_volume_growth_yoy||0)>=0?'+':''}${d.search_volume_growth_yoy||0}%</span></div>
        </div>
        ${d.serp_features?.length ? `
        <div class="mt-4">
          <div class="text-xs text-muted mb-2">SERP 기능</div>
          <div class="flex flex-wrap gap-1.5">
            ${d.serp_features.map(f => `<span class="kw-tag">${serpFeatureLabel(f)}</span>`).join('')}
          </div>
        </div>` : ''}
        ${d.top_domains?.length ? `
        <div class="mt-4">
          <div class="text-xs text-muted mb-2">상위 도메인</div>
          <div class="space-y-1">
            ${d.top_domains.slice(0,5).map((dom,i) => `
              <div class="flex items-center gap-2 text-xs">
                <span class="text-muted w-4">${i+1}</span>
                <span class="text-white">${escHtml(dom)}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}
      </div>` : ''}

      <!-- Region distribution -->
      <div class="metric-card">
        <h3 class="text-sm font-semibold mb-4 text-muted uppercase tracking-wide">지역별 분포 (추정)</h3>
        <div class="space-y-2">
          ${renderRegionChart(d.region_distribution || {})}
        </div>
      </div>
    </div>

    <!-- People Also Ask -->
    ${d.people_also_ask?.length ? `
    <div class="metric-card mb-6">
      <h3 class="text-sm font-semibold mb-3 text-muted uppercase tracking-wide">함께 묻는 질문 (PAA)</h3>
      <div class="grid sm:grid-cols-2 gap-2">
        ${d.people_also_ask.slice(0,8).map(q => `
          <div class="flex items-center gap-2 p-3 rounded-lg bg-surface text-sm cursor-pointer hover:bg-slate-800 transition-colors" onclick="quickSearch('${escHtml(q)}')">
            <svg class="w-3.5 h-3.5 text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <span>${escHtml(q)}</span>
          </div>`).join('')}
      </div>
    </div>` : ''}

    <!-- Related keywords -->
    ${(d.related_keywords?.length || d.autocomplete_suggestions?.length) ? `
    <div class="metric-card">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-semibold text-muted uppercase tracking-wide">연관 검색어</h3>
        <span class="text-xs text-muted">${(d.related_keywords?.length || 0) + (d.autocomplete_suggestions?.length || 0)}개</span>
      </div>
      <div class="flex flex-wrap gap-2">
        ${[...(d.autocomplete_suggestions||[]), ...(d.related_keywords||[])].slice(0, limits?.related || 20).map(r =>
          `<button class="kw-tag" onclick="quickSearch('${escHtml(r.keyword || r)}')">${escHtml(r.keyword || r)}</button>`
        ).join('')}
      </div>
    </div>` : ''}
  `;

  // Animate bars after render
  setTimeout(() => {
    document.querySelectorAll('.bar-fill[data-width]').forEach(el => {
      el.style.width = el.dataset.width;
    });
  }, 50);

  // Store for export
  window._lastResult = d;
}

// ── Component helpers ─────────────────────────────────────────────────────────

function kpiCard(label, value, tip, color) {
  return `
    <div class="metric-card" data-tip="${escHtml(tip)}">
      <div class="text-xs text-muted mb-1">${label}</div>
      <div class="text-2xl font-bold" style="color:${color}">${value}</div>
    </div>
  `;
}

function scoreBar(label, value, color) {
  return `
    <div>
      <div class="flex justify-between text-xs mb-1">
        <span class="text-muted">${label}</span>
        <span class="font-semibold" style="color:${color}">${value}</span>
      </div>
      <div class="h-1.5 rounded-full bg-surface overflow-hidden">
        <div class="bar-fill h-full rounded-full" style="background:${color};width:0%" data-width="${value}%"></div>
      </div>
    </div>
  `;
}

function volRow(label, value) {
  const maxVal = 10000000;
  const pct = Math.min(100, (value / maxVal) * 100 * 10);
  return `
    <div class="flex items-center gap-3 text-sm">
      <span class="text-muted w-10 text-xs">${label}</span>
      <div class="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
        <div class="bar-fill h-full rounded-full bg-accent" style="width:0%" data-width="${pct}%"></div>
      </div>
      <span class="text-white w-16 text-right text-xs font-mono">${fmtNum(value)}</span>
    </div>
  `;
}

function contentRow(label, value, color) {
  const max = 1000000;
  const pct = Math.min(100, (value / max) * 100 * 2);
  return `
    <div class="flex items-center gap-3 text-sm">
      <span class="text-muted w-10 text-xs">${label}</span>
      <div class="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
        <div class="bar-fill h-full rounded-full" style="background:${color};width:0%" data-width="${pct}%"></div>
      </div>
      <span class="text-white w-16 text-right text-xs font-mono">${fmtNum(value)}</span>
    </div>
  `;
}

function renderAgeChart(ages) {
  const keys = ['13-17','18-24','25-34','35-44','45-54','55+'];
  const colors = ['#60A5FA','#34D399','#A78BFA','#FBBF24','#F87171','#94A3B8'];
  return `
    <div class="space-y-1.5">
      ${keys.map((k,i) => `
        <div class="flex items-center gap-2 text-xs">
          <span class="text-muted w-10">${k}</span>
          <div class="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
            <div class="bar-fill h-full rounded-full" style="background:${colors[i]};width:0%" data-width="${ages[k]||0}%"></div>
          </div>
          <span class="text-white w-7 text-right">${ages[k]||0}%</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderGenderBar(g) {
  const male = g.male || 48;
  const female = g.female || 52;
  return `
    <div class="flex rounded-full overflow-hidden h-2 mt-1">
      <div style="width:${male}%;background:#60A5FA"></div>
      <div style="width:${female}%;background:#F472B6"></div>
    </div>
    <div class="flex justify-between text-xs mt-1">
      <span class="text-blue-400">남 ${male}%</span>
      <span class="text-pink-400">여 ${female}%</span>
    </div>
  `;
}

function renderRegionChart(regions) {
  const max = Math.max(...Object.values(regions), 1);
  return Object.entries(regions).map(([region, pct]) => `
    <div class="flex items-center gap-3 text-xs">
      <span class="text-muted w-8">${region}</span>
      <div class="flex-1 h-1.5 rounded-full bg-surface overflow-hidden">
        <div class="bar-fill h-full rounded-full bg-accent" style="width:0%" data-width="${(pct/max*100).toFixed(0)}%"></div>
      </div>
      <span class="text-white w-8 text-right">${pct}%</span>
    </div>
  `).join('');
}

function intentLabel(type) {
  const l = { transactional: '구매 의도', informational: '정보 탐색', commercial: '비교 탐색', navigational: '사이트 탐색' };
  return l[type] || type;
}

function serpFeatureLabel(f) {
  const l = { featured_snippet: 'Featured', knowledge_panel: 'Knowledge', image_pack: '이미지', video_results: '동영상', shopping: '쇼핑', people_also_ask: 'PAA' };
  return l[f] || f;
}

// ── Trends ────────────────────────────────────────────────────────────────────
async function loadTrends() {
  try {
    const res = await apiFetch('/api/trends/both', 'GET', null, true);
    renderTrendList('google-trends-list', res.data?.google || []);
    renderTrendList('naver-trends-list', res.data?.naver || []);
  } catch {}
}

function renderTrendList(elId, trends) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!trends || trends.length === 0) {
    el.innerHTML = '<div class="text-muted text-sm text-center py-6">데이터 없음</div>';
    return;
  }
  el.innerHTML = trends.map((t, i) => `
    <div class="trend-item" onclick="trendSearch('${escHtml(t.keyword)}')">
      <span class="trend-rank ${i < 3 ? 'top3' : ''}">${t.rank || i + 1}</span>
      <span class="text-sm flex-1">${escHtml(t.keyword)}</span>
      ${t.traffic ? `<span class="text-xs text-muted">${t.traffic}</span>` : ''}
    </div>
  `).join('');
}

function trendSearch(kw) {
  document.getElementById('search-input').value = kw;
  showPage('home');
  setTimeout(runAnalysis, 100);
}

// WebSocket for realtime trends
function connectWS() {
  try {
    ws = new WebSocket(`ws://${location.host}/ws/trends`);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.portal === 'google') renderTrendList('google-trends-list', data.trends);
      if (data.portal === 'naver')  renderTrendList('naver-trends-list', data.trends);
    };
    ws.onerror = () => {};
    ws.onclose = () => setTimeout(connectWS, 5000);
  } catch {}
}

// ── Pricing ───────────────────────────────────────────────────────────────────
async function loadPricing() {
  try {
    const res = await apiFetch('/api/payment/plans', 'GET', null, true);
    renderPricingCards(res.plans || []);
  } catch {}
}

function renderPricingCards(plans) {
  const container = document.getElementById('pricing-cards');
  if (!container) return;
  container.innerHTML = plans.map(p => `
    <div class="pricing-card ${p.popular ? 'popular' : ''}">
      ${p.popular ? '<div class="popular-badge">가장 인기</div>' : ''}
      <div class="text-sm text-muted mb-1">${p.name}</div>
      <div class="text-3xl font-bold mb-1">$${p.price}<span class="text-base font-normal text-muted">/월</span></div>
      <div class="h-px bg-border my-4"></div>
      <ul class="space-y-2.5 mb-6">
        ${p.features.map(f => `
          <li class="flex items-start gap-2 text-sm">
            <svg class="w-4 h-4 text-success flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
            <span class="text-slate-300">${escHtml(f)}</span>
          </li>
        `).join('')}
      </ul>
      <button onclick="startPayment('${p.id}', '${p.name}', ${p.price})"
        class="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${p.popular ? 'bg-primary hover:bg-primary-hover text-white' : 'border border-border hover:border-primary text-white hover:text-primary'}">
        ${p.id === 'free' ? '무료 시작' : '구독 시작'}
      </button>
    </div>
  `).join('');
}

// ── Payment ───────────────────────────────────────────────────────────────────
function loadPaypalSDK() {
  const clientId = window.PAYPAL_CLIENT_ID || 'sb';  // Set via server-rendered config
  const script = document.createElement('script');
  script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD`;
  script.onload = () => { window._paypalReady = true; };
  document.head.appendChild(script);
}

let currentPlanForPayment = null;

async function startPayment(planId, planName, price) {
  if (!token) { showModal('login'); return; }

  currentPlanForPayment = planId;
  document.getElementById('payment-plan-title').textContent = planName + ' 구독';
  document.getElementById('payment-plan-desc').textContent = `월 $${price} · PayPal 결제`;
  document.getElementById('paypal-button-container').innerHTML = '';
  showModal('payment');

  if (!window._paypalReady || !window.paypal) {
    document.getElementById('paypal-button-container').innerHTML = '<div class="text-muted text-sm text-center py-4">PayPal 로딩 중...</div>';
    await new Promise(r => setTimeout(r, 1500));
  }

  if (window.paypal) {
    paypal.Buttons({
      createOrder: async () => {
        const res = await apiFetch('/api/payment/create-order', 'POST', { plan: planId });
        return res.orderId;
      },
      onApprove: async (data) => {
        try {
          await apiFetch('/api/payment/capture', 'POST', { orderId: data.orderID, plan: planId });
          user.plan = planId;
          localStorage.setItem('kl_user', JSON.stringify(user));
          updateAuthUI();
          closeModal();
          alert('결제가 완료되었습니다! 플랜이 활성화되었습니다.');
        } catch (e) {
          alert('결제 확인 실패: ' + (e.message || '다시 시도해주세요.'));
        }
      },
      onError: (err) => {
        console.error('PayPal error:', err);
        alert('PayPal 오류가 발생했습니다. 다시 시도해주세요.');
      }
    }).render('#paypal-button-container');
  }
}

// ── History ───────────────────────────────────────────────────────────────────
async function loadHistory() {
  const container = document.getElementById('history-list');
  if (!token) { container.innerHTML = '<div class="text-muted text-sm">로그인 후 이용 가능합니다.</div>'; return; }

  try {
    const res = await apiFetch('/api/user/history', 'GET');
    const items = res.data || [];
    if (items.length === 0) {
      container.innerHTML = '<div class="text-muted text-sm">분석 기록이 없습니다.</div>';
      return;
    }
    container.innerHTML = items.map(h => `
      <div class="flex items-center gap-4 py-3 px-4 rounded-xl bg-panel border border-border hover:border-primary cursor-pointer transition-colors"
           onclick="quickHistSearch('${escHtml(h.keyword)}', '${h.portal}')">
        <span class="text-xs px-2 py-0.5 rounded-full ${h.portal === 'naver' ? 'bg-green-900/30 text-green-400' : 'bg-blue-900/30 text-blue-400'}">${h.portal}</span>
        <span class="flex-1 text-sm">${escHtml(h.keyword)}</span>
        <span class="text-xs text-muted">${new Date(h.created_at * 1000).toLocaleDateString('ko-KR')}</span>
      </div>
    `).join('');
  } catch {
    container.innerHTML = '<div class="text-danger text-sm">기록을 불러올 수 없습니다.</div>';
  }
}

function quickHistSearch(kw, portal) {
  document.getElementById('search-input').value = kw;
  setPortal(portal);
  showPage('home');
  setTimeout(runAnalysis, 100);
}

// ── Export ────────────────────────────────────────────────────────────────────
function exportCSV() {
  const d = window._lastResult;
  if (!d) return;

  const rows = [
    ['항목', '값'],
    ['키워드', d.keyword],
    ['포털', d.portal],
    ['월간 검색량', d.monthly_volume],
    ['주간 검색량', d.weekly_volume],
    ['일간 검색량', d.daily_volume],
    ['연간 검색량', d.yearly_volume],
    ['평균 CPC', d.cpc_avg],
    ['CPC 최저', d.cpc_low],
    ['CPC 최고', d.cpc_high],
    ['광고 경쟁도', d.ad_competition],
    ['경쟁 점수', d.competition_score],
    ['난이도 점수', d.difficulty_score],
    ['기회 점수', d.opportunity_score],
    ['롱테일 점수', d.longtail_score],
    ['포화도', d.content_saturation],
    ['블로그 수', d.blog_count],
    ['카페 수', d.cafe_count],
    ['뉴스 수', d.news_count],
    ['검색 의도', d.intent],
    ['의도 신뢰도', d.intent_confidence],
    ['PC 비율', d.pc_ratio],
    ['모바일 비율', d.mobile_ratio],
    ['상업적 의도', d.commercial_intent],
    ['커뮤니티 활성도', d.community_activity],
    ['Featured Snippet', d.featured_snippet],
    ['Knowledge Panel', d.knowledge_panel],
    ['YoY 성장률', d.search_volume_growth_yoy],
    ['종합 점수', d.overall_score],
    ['분석 시각', new Date(d.analyzed_at).toLocaleString('ko-KR')],
  ].filter(r => r[1] !== undefined && r[1] !== null);

  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `keylens_${d.keyword}_${d.portal}_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function runAnalysisBoth() {
  const kw = document.getElementById('search-input').value.trim();
  if (!kw) return;
  if (!token) { showModal('login'); return; }

  try {
    const res = await apiFetch('/api/keywords/analyze-both', 'POST', { keyword: kw, period: document.getElementById('period-select').value });
    // Show both in sequence
    renderResults(res.data.google, {});
    // Append naver below
    const naver = res.data.naver;
    const extra = document.createElement('div');
    extra.className = 'mt-8';
    extra.innerHTML = `<h3 class="text-lg font-semibold mb-4 text-green-400">네이버 분석 결과</h3>`;
    document.getElementById('results-content').appendChild(extra);
  } catch (e) {
    if (e.status === 403) {
      alert('동시 분석은 Pro 플랜 이상에서 이용 가능합니다.');
      showPage('pricing');
    }
  }
}

// ── API helper ────────────────────────────────────────────────────────────────
async function apiFetch(path, method = 'GET', body = null, noAuth = false) {
  const headers = { 'Content-Type': 'application/json' };
  if (!noAuth && token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);

  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function fmtNum(n) {
  if (!n && n !== 0) return '0';
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '억';
  if (n >= 10000) return (n / 10000).toFixed(1) + '만';
  return n.toLocaleString('ko-KR');
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function showErr(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}
