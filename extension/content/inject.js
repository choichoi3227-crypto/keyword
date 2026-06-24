// KeyLens Content Script
// Injects a floating analysis panel alongside Google/Naver search results

(function () {
  'use strict';

  if (document.getElementById('keylens-panel')) return;

  const portal = location.hostname.includes('naver') ? 'naver' : 'google';
  const keyword = new URLSearchParams(location.search).get('q') ||
                  new URLSearchParams(location.search).get('query') || '';

  if (!keyword) return;

  // ── Create panel ─────────────────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'keylens-panel';
  panel.innerHTML = `
    <div class="kl-header">
      <div class="kl-logo">
        <span class="kl-logo-icon">K</span>
        <span>KeyLens</span>
      </div>
      <button class="kl-close" title="닫기">✕</button>
    </div>
    <div class="kl-body" id="kl-body">
      <div class="kl-loading">
        <div class="kl-spin"></div>
        <span>분석 중...</span>
      </div>
    </div>
    <div class="kl-footer">
      <a href="http://localhost:4000" target="_blank" class="kl-link">전체 분석 보기 →</a>
    </div>
  `;
  document.body.appendChild(panel);

  // Close button
  panel.querySelector('.kl-close').addEventListener('click', () => {
    panel.remove();
  });

  // ── Fetch analysis ────────────────────────────────────────────────────────────
  chrome.runtime.sendMessage({ type: 'ANALYZE_KEYWORD', keyword, portal }, (res) => {
    const body = document.getElementById('kl-body');
    if (!body) return;

    if (!res || res.error) {
      if (res?.error === 'NOT_LOGGED_IN') {
        body.innerHTML = `
          <div class="kl-auth">
            <p>KeyLens에 로그인하면<br/>검색량·CPC를 바로 확인할 수 있어요.</p>
            <a href="http://localhost:4000" target="_blank" class="kl-btn">로그인하기</a>
          </div>
        `;
      } else {
        body.innerHTML = `<div class="kl-error">분석 실패. 잠시 후 다시 시도해주세요.</div>`;
      }
      return;
    }

    const d = res.data?.data || {};
    const score = d.overall_score || 0;
    const scoreColor = score >= 70 ? '#22C55E' : score >= 40 ? '#F59E0B' : '#EF4444';

    body.innerHTML = `
      <div class="kl-kw">"${esc(keyword)}"</div>

      <div class="kl-grid">
        <div class="kl-metric">
          <div class="kl-m-label">월간 검색량</div>
          <div class="kl-m-val" style="color:#60A5FA">${fmtNum(d.monthly_volume)}</div>
        </div>
        <div class="kl-metric">
          <div class="kl-m-label">종합 점수</div>
          <div class="kl-m-val" style="color:${scoreColor}">${score}점</div>
        </div>
        <div class="kl-metric">
          <div class="kl-m-label">평균 CPC</div>
          <div class="kl-m-val" style="color:#A78BFA">${d.cpc_avg ? '₩'+fmtNum(d.cpc_avg) : 'N/A'}</div>
        </div>
        <div class="kl-metric">
          <div class="kl-m-label">난이도</div>
          <div class="kl-m-val" style="color:#F87171">${d.difficulty_score || 0}</div>
        </div>
      </div>

      <div class="kl-bars">
        ${klBar('기회 지수', d.opportunity_score, '#22C55E')}
        ${klBar('경쟁 점수', d.competition_score, '#EF4444')}
        ${klBar('롱테일 지수', d.longtail_score, '#A78BFA')}
      </div>

      <div class="kl-info-row"><span>검색 의도</span><span>${intentLabel(d.intent)}</span></div>
      ${portal === 'naver' ? `
        <div class="kl-info-row"><span>블로그</span><span>${fmtNum(d.blog_count||0)}개</span></div>
        <div class="kl-info-row"><span>카페</span><span>${fmtNum(d.cafe_count||0)}개</span></div>
      ` : `
        <div class="kl-info-row"><span>유료 광고</span><span>${d.paid_results_count||0}개</span></div>
      `}

      ${d.autocomplete_suggestions?.length ? `
        <div class="kl-sub-title">연관 검색어</div>
        <div class="kl-tags">
          ${d.autocomplete_suggestions.slice(0, 6).map(r =>
            `<span class="kl-tag">${esc(r.keyword||r)}</span>`
          ).join('')}
        </div>
      ` : ''}
    `;

    // Animate bars
    setTimeout(() => {
      panel.querySelectorAll('.kl-bar-fill[data-w]').forEach(el => {
        el.style.width = el.dataset.w;
      });
    }, 50);
  });

  function klBar(label, value, color) {
    const pct = Math.min(100, value || 0);
    return `
      <div class="kl-bar-row">
        <span class="kl-bar-label">${label}</span>
        <div class="kl-bar-track">
          <div class="kl-bar-fill" style="background:${color};width:0%" data-w="${pct}%"></div>
        </div>
        <span class="kl-bar-num">${value || 0}</span>
      </div>
    `;
  }

  function intentLabel(t) {
    return { transactional:'구매 의도', informational:'정보 탐색', commercial:'비교 탐색', navigational:'사이트 탐색' }[t] || '-';
  }

  function fmtNum(n) {
    if (!n && n !== 0) return '0';
    if (n >= 100000000) return (n/100000000).toFixed(1)+'억';
    if (n >= 10000) return (n/10000).toFixed(1)+'만';
    return Number(n).toLocaleString('ko-KR');
  }

  function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
})();
