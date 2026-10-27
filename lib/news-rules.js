/* 27.10.2026 (I-756, audit E Y5) — regulile News Watch într-un singur loc: pagina Alerte (<script src>) și robotul de pe server
   (tools/check-news-watch.mjs, `import '../lib/news-rules.js'`) citesc ACELEAȘI liste. Înainte robotul avea 8 cuvinte în plus
   (antitrust, sanction, cut to sell, raised to buy, secondary offering, all-stock deal, listing on, approval), iar aceeași știre era
   „big” pe server și zgomot în pagină. Listele sunt cele ale robotului (mulțimea mai mare). Pur: nimic din rețea aici. */
(function (g) {
  'use strict';
  const MODE_MIN = Object.freeze({ strict: 8, normal: 5, loose: 3 });
  const STRICT_SOURCES = Object.freeze(['reuters', 'bloomberg', 'wall street journal', 'wsj', 'financial times', 'cnbc', 'dow jones', 'associated press', 'barron', 'the information']);
  const BIG_KW = Object.freeze([
    ['raises guidance', 9], ['cuts guidance', 9], ['lowers guidance', 9],
    ['raises full-year', 8], ['cuts full-year', 8],
    ['beat estimates', 7], ['misses estimates', 7], ['miss estimates', 7],
    ['earnings', 5], ['eps ', 4], ['revenue', 3], ['guidance', 6], ['outlook', 4],
    ['beats', 5], ['misses', 5], ['topped estimates', 6], ['fell short', 5],
    ['acquisition', 7], ['acquire', 6], ['merger', 7], ['buyout', 7],
    ['takeover', 7], ['to buy ', 5], ['all-cash deal', 7], ['all-stock deal', 6],
    ['upgrade', 5], ['downgrade', 5], ['price target', 4], ['initiates coverage', 5],
    ['raised to buy', 6], ['cut to sell', 6],
    ['stock split', 6], ['buyback', 5], ['share repurchase', 5], ['dividend', 4],
    ['spin-off', 6], ['spinoff', 6], ['delist', 7], ['secondary offering', 5],
    ['ceo resign', 7], ['cfo resign', 7], ['steps down', 5], ['appointed ceo', 5],
    ['sec charges', 7], ['sec probe', 6], ['lawsuit', 5], ['investigation', 6],
    ['fraud', 7], ['whistleblower', 6],
    ['fda approval', 8], ['fda rejects', 8], ['fda ', 5], ['approval', 3],
    ['antitrust', 5], ['sanction', 5],
    ['trading halt', 7], ['halted', 5], ['bankruptcy', 9], ['chapter 11', 9],
    ['short squeeze', 6], [' plunges', 4], [' surges', 3], ['soars', 3],
    ['spot etf', 7], ['etf approval', 8], ['hacked', 7], ['exploit', 6],
    ['delisting', 6], ['listing on', 4], ['sec approves', 8]
  ].map((x) => Object.freeze(x)));
  const NOISE_RE = Object.freeze([
    /what to watch/i, /stocks? to watch/i, /top \d+ stocks/i, /best stocks/i,
    /stock movers/i, /pre-?market movers/i, /after-?hours movers/i,
    /why (this|shares|the stock)/i, /\d+ things /i, /here are \d+/i,
    /roundup/i, /morning brief/i, /closing bell/i, /stock of the day/i,
    /market wrap/i, /midday update/i, /these stocks/i, /could be a/i,
    /might be/i, /are hot/i, /zacks rank/i, /according to tipranks/i,
    /most active stocks/i, /gainers and losers/i, /stocks moving/i,
    /weekly recap/i, /daily recap/i, /newsletter/i
  ]);
  const QUALITY_SRC = Object.freeze([
    ['reuters', 3], ['bloomberg', 3], ['wall street journal', 3], ['wsj', 2],
    ['financial times', 3], ['cnbc', 2], ['barron', 2], ['associated press', 2],
    ['dow jones', 2], ['marketwatch', 1], ['the information', 2], ['semafor', 1],
    ['coindesk', 2], ['the block', 2], ['decrypt', 1]
  ].map((x) => Object.freeze(x)));
  // EU / străine ⇒ simbolul US/ADR din Finnhub (gratuit) pentru știri; watch.newsSymbol bate harta
  const EU_NEWS_MAP = Object.freeze({ 'NFC.F': 'NFLX', 'NFC.DE': 'NFLX', 'RHM.DE': 'RNMBY', 'RHM.F': 'RNMBY', '1QZ.DE': '1QZ.DE', 'MIGA.MU': 'MIGA.MU' });
  const BULL_RE = /\b(beat|beats|raise[sd]?|upgrade|surge|soar|approv|record|buyback|outperform|strong|growth|rally|jump)\b/i;
  const BEAR_RE = /\b(miss|misses|cut[s]?|downgrade|plunge|lawsuit|fraud|halt|bankruptcy|reject|underperform|probe|investigat|slash|weak|slump|crash)\b/i;

  function normSym(s) { return String(s || '').toUpperCase().replace(/-USD$/, '').replace(/USDT$/, '').trim(); }
  function resolveNewsSymbol(w) {
    const sym = String((w && w.symbol) || '').toUpperCase();
    if (w && w.newsSymbol) return String(w.newsSymbol).toUpperCase();
    if (EU_NEWS_MAP[sym] && EU_NEWS_MAP[sym] !== sym) return EU_NEWS_MAP[sym];
    return normSym(sym);
  }
  function classifySeverity(tags, score, text) {
    const t = (tags || []).join(' ') + ' ' + String(text || '').toLowerCase();
    if (/guidance|raises full|cuts full|lowers guidance|raises guidance/.test(t)) return { sev: 'GUIDANCE', why: 'guidance change — gap risk' };
    if (/acquisition|merger|buyout|takeover|all-cash|all-stock/.test(t)) return { sev: 'M&A', why: 'deal news — binary move' };
    if (/lawsuit|sec charges|sec probe|fraud|investigation|whistleblower|antitrust/.test(t)) return { sev: 'LEGAL', why: 'legal/reg risk' };
    if (/upgrade|downgrade|price target|initiates coverage|raised to buy|cut to sell/.test(t)) return { sev: 'ANALYST', why: 'rating/target change' };
    if (/fda|approval|approves/.test(t)) return { sev: 'PRODUCT', why: 'regulatory/product catalyst' };
    if (/halt|bankruptcy|chapter 11|short squeeze/.test(t)) return { sev: 'EXTREME', why: 'structure event — high vol' };
    if (/spot etf|hacked|exploit|delisting|etf approval/.test(t)) return { sev: 'CRYPTO', why: 'crypto catalyst' };
    if (/earnings|eps|beats|misses|revenue|outlook/.test(t)) return { sev: 'EARNINGS', why: 'results-related' };
    if (score >= 10) return { sev: 'CATALYST', why: 'high-score catalyst' };
    return { sev: 'CATALYST', why: 'material company news' };
  }
  function sentimentOf(text) {
    const s = String(text || ''), b = BULL_RE.test(s) ? 1 : 0, r = BEAR_RE.test(s) ? 1 : 0;
    return b && !r ? 'bull' : r && !b ? 'bear' : b && r ? 'mixed' : 'neut';
  }
  /** Scorul unei știri: { score, tags, big, sev, why, sentiment }. opt = { minScore, strict }. */
  function scoreArticle(a, opt = {}) {
    const headline = String((a && a.headline) || ''), summary = String((a && a.summary) || '');
    const text = (headline + ' ' + summary).toLowerCase(), src = String((a && a.source) || '').toLowerCase();
    const minScore = Number.isFinite(opt.minScore) ? opt.minScore : MODE_MIN.normal;
    if (NOISE_RE.some((re) => re.test(text))) return { score: 0, tags: ['noise'], big: false, sev: '', why: '', sentiment: 'neut' };
    if (opt.strict && !STRICT_SOURCES.some((s) => src.includes(s))) return { score: 0, tags: ['src-gate'], big: false, sev: '', why: '', sentiment: 'neut' };
    let score = 0; const tags = [];
    for (const [kw, pts] of BIG_KW) if (text.includes(kw)) { score += pts; if (tags.length < 6) tags.push(kw.trim()); }
    for (const [s, pts] of QUALITY_SRC) if (src.includes(s)) { score += pts; tags.push('src'); break; }
    if (headline.length < 22) score -= 2;
    if (/\b(and|,)\s+[A-Z]{2,5}\b/.test(headline) && /stocks?/i.test(headline)) score -= 2;
    const { sev, why } = classifySeverity(tags, score, text);
    return { score, tags: [...new Set(tags)].slice(0, 5), big: score >= minScore, sev, why, sentiment: sentimentOf(headline + ' ' + summary) };
  }
  g.NewsRules = Object.freeze({ MODE_MIN, STRICT_SOURCES, BIG_KW, NOISE_RE, QUALITY_SRC, EU_NEWS_MAP, BULL_RE, BEAR_RE, normSym, resolveNewsSymbol, classifySeverity, sentimentOf, scoreArticle });
})(typeof window !== 'undefined' ? window : globalThis);
