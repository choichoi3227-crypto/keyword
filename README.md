# KeyLens — 키워드 분석 툴

구글·네이버 키워드 검색량, CPC, 경쟁도, 연관 검색어를 **30가지 지표**로 분석하는 완전한 SaaS 툴입니다.

---

## 프로젝트 구조

```
keylens/
├── server/               # Node.js Express 백엔드
│   ├── index.js          # 서버 진입점 + WebSocket
│   ├── routes/
│   │   ├── auth.js       # 회원가입 / 로그인 / 프로필
│   │   ├── keywords.js   # 키워드 분석 API
│   │   ├── payment.js    # PayPal 결제
│   │   ├── trends.js     # 실시간 인기 검색어
│   │   └── user.js       # 사용자 정보
│   ├── services/
│   │   ├── db.js              # SQLite 데이터베이스
│   │   ├── keywordAnalyzer.js # 핵심 분석 로직 (30+ 지표)
│   │   ├── cloudflareProxy.js # CF Worker 프록시
│   │   ├── trendCrawler.js    # 실시간 트렌드 크롤러
│   │   └── pythonBridge.js    # Python 분석기 연동
│   ├── middleware/
│   │   ├── auth.js       # JWT 인증
│   │   └── rateLimit.js  # 플랜별 이용 제한
│   └── wasm/
│       └── bridge.js     # Rust/WASM 브릿지
├── worker/               # Cloudflare Worker (프록시)
│   ├── index.js
│   └── wrangler.toml
├── public/               # 프론트엔드
│   ├── index.html
│   ├── css/main.css
│   └── js/app.js
├── extension/            # Chrome 확장 프로그램
│   ├── manifest.json
│   ├── popup/
│   ├── background/
│   └── content/
├── python/
│   └── analyzer.py       # Python 심화 분석기
└── wasm-src/             # Rust WASM 소스
    └── src/lib.rs
```

---

## 분석 지표 (30가지+)

| 카테고리 | 지표 |
|---------|------|
| **검색량** | 월간·주간·일간·연간 검색량, PC/모바일 분리(네이버), YoY 성장률 |
| **광고** | 평균 CPC, 최저/최고 CPC, 광고 경쟁도, 노출 점유율, 유료 광고 수 |
| **경쟁** | 경쟁 점수, 난이도 점수, 평균 도메인 권위도, 상위 노출 도메인 |
| **콘텐츠(네이버)** | 블로그 수, 카페 수, 뉴스 수, 콘텐츠 포화도 |
| **SEO** | 기회 지수, 롱테일 지수, Featured Snippet, Knowledge Panel, SERP 기능 |
| **의도** | 검색 의도 분류(정보/구매/비교/탐색), 신뢰도 |
| **인구통계** | 연령 분포(6구간), 성별 분포, 기기 분포, 지역 분포(8개 시도) |
| **쇼핑(네이버)** | 상품 수, 평균가·최저가·최고가, 상업적 의도 점수 |
| **커뮤니티** | 커뮤니티 활성도, 계절성 지수 |
| **종합** | 종합 점수, 연관 검색어, PAA(People Also Ask), 자동완성 추천어 |

---

## 요금제

| | Free | Starter ($19) | Pro ($29) | Business ($47) | Enterprise ($79) |
|--|--|--|--|--|--|
| 일일 분석 | 5회 | 50회 | 200회 | 999회 | 무제한 |
| 쿨타임 | 60초 | 10초 | 3초 | 1초 | 없음 |
| 연관 키워드 | 5개 | 20개 | 50개 | 100개 | 무제한 |
| 동시 분석 | ✗ | ✗ | ✓ | ✓ | ✓ |
| 벌크 분석 | ✗ | ✗ | ✗ | 20개 | 100개 |
| CSV 내보내기 | ✗ | ✓ | ✓ | ✓ | ✓ |
| Python 분석 | ✗ | ✗ | ✓ | ✓ | ✓ |

---

## 설치 및 실행

### 1. 의존성 설치
```bash
npm run install:all
```

### 2. 환경변수 설정
```bash
cp server/.env.example server/.env
# .env 파일에서 JWT_SECRET, PayPal 키, CF Worker URL 설정
```

### 3. WASM 빌드 (선택사항 — JS 폴백 내장)
```bash
# Rust + wasm-pack 설치 후
npm run build:wasm
```

### 4. Cloudflare Worker 배포 (선택사항)
```bash
# wrangler 설치 후
npm run deploy:worker
```

### 5. 서버 실행
```bash
npm run dev      # 개발 모드 (nodemon)
npm start        # 프로덕션
```

서버가 기동되면 `http://localhost:4000` 에서 사이트에 접근할 수 있습니다.

---

## Chrome 확장 프로그램 설치

1. Chrome에서 `chrome://extensions` 열기
2. **개발자 모드** 활성화
3. **압축해제된 확장 프로그램 로드** → `extension/` 폴더 선택
4. 구글/네이버에서 검색하면 우측에 KeyLens 패널이 자동 표시됩니다.

---

## Python 분석기 직접 실행

```bash
python3 python/analyzer.py --keyword "다이어트" --portal naver --period monthly
```

출력 예시:
```json
{
  "keyword": "다이어트",
  "portal": "naver",
  "monthly_volume": 185000,
  "difficulty_score": 72,
  "opportunity_score": 63,
  ...
}
```

---

## 아키텍처

```
Browser / Extension
       │
       ▼
Express (Node.js) ─────── SQLite (users, cache, history)
       │
       ├── Cloudflare Worker ──► Google / Naver (stealth proxy)
       │
       ├── Python Bridge ──► analyzer.py (심화 분석)
       │
       └── Rust/WASM ──► 고성능 점수 계산, 텍스트 처리
```

- **Cloudflare Worker**: 글로벌 IP 풀을 활용해 구글/네이버 크롤링 차단 우회
- **Rust/WASM**: 배치 키워드 스코어링, HTML 파싱, 슬러그 생성을 JS 대비 ~5× 빠르게 처리
- **Python**: 더 정교한 스크레이핑과 NLP 전처리
- **WebSocket**: 실시간 인기 검색어를 10분마다 브로드캐스트

---

## 환경변수 설명

| 변수 | 설명 |
|------|------|
| `JWT_SECRET` | 64자 이상 랜덤 문자열 |
| `CF_WORKER_URL` | 배포한 Cloudflare Worker URL |
| `CF_WORKER_SECRET` | Worker 인증 시크릿 |
| `PAYPAL_CLIENT_ID` | PayPal Developer 앱 Client ID |
| `PAYPAL_CLIENT_SECRET` | PayPal Developer 앱 Secret |
| `PAYPAL_ENV` | `sandbox` 또는 `live` |
