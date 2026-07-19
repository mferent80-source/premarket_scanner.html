// ═══════════════════════════════════════════════════════════════════
// check-news-watch.mjs — pro news desk (server / GitHub Actions)
//
// · big-news filter + severity + why-it-matters
// · cluster dedupe (același eveniment, multe outlets)
// · digest Telegram (batch) + quiet hours + mode strict/normal/loose
// · earnings pre-pack (T-14/T-1/T-0) + auto gap alert în alerts.json
// · EU → US/ADR newsSymbol map
// · portfolio-only (doar tickere din alerts.json)
// · daily / weekly risk digest
// · sentiment delta 24h · audit log
//
// Secrets: TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, FINNHUB_API_KEY
// ═══════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';

const FILE = new URL('./news-watch.json', import.meta.url);
const ALERTS_FILE = new URL('./alerts.json', import.meta.url);
const AUDIT_FILE = new URL('./news-audit.jsonl', import.meta.url);

const SEEN_CAP = 300;
const EVENT_SEEN_CAP = 80;
const MAX_NEW_PER_WATCH = 3;
const LOOKBACK_DAYS = 3;
const EARNINGS_HORIZON_DAYS = 21;
const AUDIT_MAX_LINES = 200;
const TG_CHUNK = 3500;

const TOKEN = process.env.TELEGRAM_TOKEN || '';
const CHAT = process.env.TELEGRAM_CHAT_ID || '';
const FH_KEY = process.env.FINNHUB_API_KEY || process.env.FINNHUB_TOKEN || '';

const DEFAULT_SETTINGS = {
  mode: 'normal',                 // strict | normal | loose
  digest: true,                   // un batch Telegram per run
  quietHours: {
    enabled: true,
    startHour: 23,
    endHour: 7,
    tz: 'Europe/Bucharest'
  },
  maxTelegramPerRun: 8,
  portfolioOnly: false,
  autoGapAlert: true,
  gapPct: 3,
  dailyDigestHour: 8,             // ora locală tz
  weeklyDigestDow: 1,             // 1 = Luni
  postEarnFollowH: 6              // re-boost news după earnings T-0
};

// EU / foreign → Finnhub free (US/ADR) for company-news
const EU_NEWS_MAP = {
  'NFC.F': 'NFLX',
  'NFC.DE': 'NFLX',
  'RHM.DE': 'RNMBY',
  'RHM.F': 'RNMBY',
  // override pe watch.newsSymbol dacă știi mai bine
  '1QZ.DE': '1QZ.DE',
  'MIGA.MU': 'MIGA.MU'
};

const MODE_MIN = { strict: 8, normal: 5, loose: 3 };
const STRICT_SOURCES = [
  'reuters', 'bloomberg', 'wall street journal', 'wsj', 'financial times',
  'cnbc', 'dow jones', 'associated press', 'barron', 'the information'
];

const BIG_KW = [
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
];

const NOISE_RE = [
  /what to watch/i, /stocks? to watch/i, /top \d+ stocks/i, /best stocks/i,
  /stock movers/i, /pre-?market movers/i, /after-?hours movers/i,
  /why (this|shares|the stock)/i, /\d+ things /i, /here are \d+/i,
  /roundup/i, /morning brief/i, /closing bell/i, /stock of the day/i,
  /market wrap/i, /midday update/i, /these stocks/i, /could be a/i,
  /might be/i, /are hot/i, /zacks rank/i, /according to tipranks/i,
  /most active stocks/i, /gainers and losers/i, /stocks moving/i,
  /weekly recap/i, /daily recap/i, /newsletter/i
];

const QUALITY_SRC = [
  ['reuters', 3], ['bloomberg', 3], ['wall street journal', 3], ['wsj', 2],
  ['financial times', 3], ['cnbc', 2], ['barron', 2], ['associated press', 2],
  ['dow jones', 2], ['marketwatch', 1], ['the information', 2], ['semafor', 1],
  ['coindesk', 2], ['the block', 2], ['decrypt', 1]
];

const BULL_RE = /\b(beat|beats|raise[sd]?|upgrade|surge|soar|approv|record|buyback|outperform|strong|growth|rally|jump)\b/i;
const BEAR_RE = /\b(miss|misses|cut[s]?|downgrade|plunge|lawsuit|fraud|halt|bankruptcy|reject|underperform|probe|investigat|slash|weak|slump|crash)\b/i;

const tgEsc = s => String(s ?? '').replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function hourInTz(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz || 'Europe/Bucharest',
      hour: 'numeric',
      hour12: false
    }).formatToParts(new Date());
    return Number(parts.find(p => p.type === 'hour')?.value ?? 12);
  } catch (e) {
    return new Date().getUTCHours();
  }
}

function dowInTz(tz) {
  // 0=Sun … 6=Sat in local tz
  try {
    const wd = new Intl.DateTimeFormat('en-US', {
      timeZone: tz || 'Europe/Bucharest',
      weekday: 'short'
    }).format(new Date());
    return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 1;
  } catch (e) {
    return new Date().getUTCDay();
  }
}

function localDateInTz(tz) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'Europe/Bucharest',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date()); // YYYY-MM-DD
  } catch (e) {
    return isoDate(new Date());
  }
}

function inQuietHours(settings) {
  const q = settings.quietHours || {};
  if (!q.enabled) return false;
  const h = hourInTz(q.tz || 'Europe/Bucharest');
  const start = Number(q.startHour ?? 23);
  const end = Number(q.endHour ?? 7);
  if (start === end) return false;
  if (start > end) return h >= start || h < end; // overnight
  return h >= start && h < end;
}

function mergeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  s.quietHours = { ...DEFAULT_SETTINGS.quietHours, ...(raw?.quietHours || {}) };
  s.mode = ['strict', 'normal', 'loose'].includes(s.mode) ? s.mode : 'normal';
  return s;
}

function resolveNewsSymbol(w) {
  const sym = String(w.symbol || '').toUpperCase();
  if (w.newsSymbol) return String(w.newsSymbol).toUpperCase();
  if (EU_NEWS_MAP[sym] && EU_NEWS_MAP[sym] !== sym) return EU_NEWS_MAP[sym];
  return normSym(sym);
}

function normSym(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/-USD$/, '')
    .replace(/USDT$/, '')
    .trim();
}

function articleId(a) {
  if (a.id != null && a.id !== '') return 'id:' + a.id;
  const u = String(a.url || '').trim();
  if (u) return 'u:' + u.slice(0, 180);
  return 'h:' + String(a.headline || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120);
}

function clusterKey(headline) {
  return String(headline || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(the|a|an|to|of|for|on|in|and|or|with|as|at|by|from|is|are|was|its|has|have|will|after|before|over|under)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 2)
    .slice(0, 8)
    .join(' ');
}

function classifySeverity(tags, score, text) {
  const t = (tags || []).join(' ') + ' ' + String(text || '').toLowerCase();
  if (/guidance|raises full|cuts full|lowers guidance|raises guidance/.test(t))
    return { sev: 'GUIDANCE', why: 'guidance change — gap risk' };
  if (/acquisition|merger|buyout|takeover|all-cash|all-stock/.test(t))
    return { sev: 'M&A', why: 'deal news — binary move' };
  if (/lawsuit|sec charges|sec probe|fraud|investigation|whistleblower|antitrust/.test(t))
    return { sev: 'LEGAL', why: 'legal/reg risk' };
  if (/upgrade|downgrade|price target|initiates coverage|raised to buy|cut to sell/.test(t))
    return { sev: 'ANALYST', why: 'rating/target change' };
  if (/fda|approval|approves/.test(t))
    return { sev: 'PRODUCT', why: 'regulatory/product catalyst' };
  if (/halt|bankruptcy|chapter 11|short squeeze/.test(t))
    return { sev: 'EXTREME', why: 'structure event — high vol' };
  if (/spot etf|hacked|exploit|delisting|etf approval/.test(t))
    return { sev: 'CRYPTO', why: 'crypto catalyst' };
  if (/earnings|eps|beats|misses|revenue|outlook/.test(t))
    return { sev: 'EARNINGS', why: 'results-related' };
  if (score >= 10) return { sev: 'CATALYST', why: 'high-score catalyst' };
  return { sev: 'CATALYST', why: 'material company news' };
}

function sentimentOf(text) {
  const s = String(text || '');
  const b = BULL_RE.test(s) ? 1 : 0;
  const r = BEAR_RE.test(s) ? 1 : 0;
  if (b && !r) return 'bull';
  if (r && !b) return 'bear';
  if (b && r) return 'mixed';
  return 'neut';
}

function scoreArticle(a, minScore, strictSources) {
  const headline = String(a.headline || '');
  const text = (headline + ' ' + (a.summary || '')).toLowerCase();
  const src = String(a.source || '').toLowerCase();
  if (NOISE_RE.some(re => re.test(text))) {
    return { score: 0, tags: ['noise'], big: false, sev: '', why: '', sentiment: 'neut' };
  }
  if (strictSources) {
    const ok = STRICT_SOURCES.some(s => src.includes(s));
    if (!ok) {
      return { score: 0, tags: ['src-gate'], big: false, sev: '', why: '', sentiment: 'neut' };
    }
  }
  let score = 0;
  const tags = [];
  for (const [kw, pts] of BIG_KW) {
    if (text.includes(kw)) {
      score += pts;
      if (tags.length < 6) tags.push(kw.trim());
    }
  }
  for (const [s, pts] of QUALITY_SRC) {
    if (src.includes(s)) {
      score += pts;
      tags.push('src');
      break;
    }
  }
  if (headline.length < 22) score -= 2;
  if (/\b(and|,)\s+[A-Z]{2,5}\b/.test(headline) && /stocks?/i.test(headline)) score -= 2;

  const { sev, why } = classifySeverity(tags, score, text);
  const sentiment = sentimentOf(headline + ' ' + (a.summary || ''));
  return {
    score,
    tags: [...new Set(tags)].slice(0, 5),
    big: score >= minScore,
    sev,
    why,
    sentiment
  };
}

function keywordsFor(w) {
  const raw = (Array.isArray(w.keywords) ? w.keywords : [])
    .map(k => String(k).trim())
    .filter(Boolean);
  if (raw.length) return raw.map(k => k.toLowerCase());
  const s = String(w.symbol || '').toUpperCase();
  const base = s.replace(/USDT$/, '').replace(/-USD$/, '').replace(/USD$/, '');
  const news = resolveNewsSymbol(w);
  return [s.toLowerCase(), base.toLowerCase(), news.toLowerCase()]
    .filter((v, i, a) => v && a.indexOf(v) === i);
}

function matchKw(text, kws) {
  if (!kws.length) return true;
  const t = String(text || '').toLowerCase();
  return kws.some(k => k && t.includes(k));
}

function dueForCheck(w) {
  if (w.armed === false) return false;
  if (!w.lastCheck) return true;
  const min = Math.max(5, Number(w.intervalMin) || 15);
  const t = Date.parse(w.lastCheck);
  if (!Number.isFinite(t)) return true;
  return Date.now() - t >= min * 60 * 1000;
}

async function sendTelegram(html) {
  if (!TOKEN || !CHAT) {
    console.log('⚠ TELEGRAM lipsă — nesent:\n' + html.slice(0, 400));
    return false;
  }
  // split pe lungime
  const chunks = [];
  let rest = html;
  while (rest.length > TG_CHUNK) {
    let cut = rest.lastIndexOf('\n', TG_CHUNK);
    if (cut < TG_CHUNK * 0.5) cut = TG_CHUNK;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, '');
  }
  if (rest) chunks.push(rest);
  let ok = true;
  for (const part of chunks) {
    try {
      const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHAT,
          text: part,
          parse_mode: 'HTML',
          disable_web_page_preview: true
        }),
        signal: AbortSignal.timeout(12000)
      });
      if (!r.ok) {
        console.log('⚠ Telegram HTTP ' + r.status + ': ' + await r.text());
        ok = false;
      }
    } catch (e) {
      console.log('⚠ Telegram: ' + e.message);
      ok = false;
    }
    await new Promise(r => setTimeout(r, 250));
  }
  return ok;
}

function fmtWhen(ts) {
  if (!ts) return '';
  const ms = ts < 2e10 ? ts * 1000 : ts;
  try {
    return new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  } catch (e) {
    return '';
  }
}

function fmtNum(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const x = Number(n);
  if (Math.abs(x) >= 1e9) return (x / 1e9).toFixed(2) + 'B';
  if (Math.abs(x) >= 1e6) return (x / 1e6).toFixed(2) + 'M';
  return String(Math.round(x * 1000) / 1000);
}

function hourLabel(h) {
  if (h === 'bmo') return 'BMO';
  if (h === 'amc') return 'AMC';
  if (h === 'dmh') return 'during market';
  return h ? String(h).toUpperCase() : '—';
}

function daysUntil(iso) {
  const t = Date.parse(iso + 'T12:00:00Z');
  if (!Number.isFinite(t)) return null;
  const today = Date.parse(isoDate(new Date()) + 'T12:00:00Z');
  return Math.round((t - today) / 864e5);
}

function audit(line) {
  try {
    const row = JSON.stringify({ ts: new Date().toISOString(), ...line });
    let prev = '';
    if (existsSync(AUDIT_FILE)) prev = readFileSync(AUDIT_FILE, 'utf8');
    const lines = prev.split('\n').filter(Boolean);
    lines.push(row);
    const keep = lines.slice(-AUDIT_MAX_LINES);
    writeFileSync(AUDIT_FILE, keep.join('\n') + '\n', 'utf8');
  } catch (e) {
    /* ignore */
  }
}

function loadPriceAlertSymbols() {
  try {
    const j = JSON.parse(readFileSync(ALERTS_FILE, 'utf8'));
    const set = new Set();
    for (const a of j.alerts || []) {
      if (a && a.symbol) set.add(String(a.symbol).toUpperCase());
    }
    return set;
  } catch (e) {
    return new Set();
  }
}

function ensureGapAlert(symbol, earnDate, gapPct) {
  try {
    const j = JSON.parse(readFileSync(ALERTS_FILE, 'utf8'));
    const alerts = Array.isArray(j.alerts) ? j.alerts : [];
    const note = `auto gap post-earnings ${earnDate}`;
    const exists = alerts.some(
      a =>
        String(a.symbol || '').toUpperCase() === symbol &&
        a.kind === 'day' &&
        String(a.note || '').includes(earnDate)
    );
    if (exists) return false;
    alerts.push({
      symbol,
      kind: 'day',
      pct: Number(gapPct) || 3,
      rearm: false,
      armed: true,
      note
    });
    j.alerts = alerts;
    writeFileSync(ALERTS_FILE, JSON.stringify(j, null, 2) + '\n', 'utf8');
    console.log(`🔔 gap alert adăugat: ${symbol} day ±${gapPct}% (${earnDate})`);
    audit({ type: 'gap_alert', symbol, earnDate, gapPct });
    return true;
  } catch (e) {
    console.log('⚠ gap alert: ' + (e.message || e));
    return false;
  }
}

async function fetchArticles(w) {
  if (!FH_KEY) throw new Error('FINNHUB_API_KEY lipsește din secrets');
  const kws = keywordsFor(w);
  const to = new Date();
  const from = new Date(Date.now() - LOOKBACK_DAYS * 864e5);
  let list = [];
  const fetchSym = resolveNewsSymbol(w);

  if (w.kind === 'crypto') {
    const url = `https://finnhub.io/api/v1/news?category=crypto&token=${encodeURIComponent(FH_KEY)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('Finnhub crypto news HTTP ' + r.status);
    const j = await r.json();
    list = Array.isArray(j) ? j : [];
    list = list.filter(a => matchKw((a.headline || '') + ' ' + (a.summary || ''), kws));
  } else {
    const url =
      `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(fetchSym)}` +
      `&from=${isoDate(from)}&to=${isoDate(to)}&token=${encodeURIComponent(FH_KEY)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`Finnhub company-news HTTP ${r.status} (${fetchSym})`);
    const j = await r.json();
    list = Array.isArray(j) ? j : [];
    if ((w.keywords || []).length) {
      list = list.filter(a => matchKw((a.headline || '') + ' ' + (a.summary || ''), kws));
    }
  }
  list.sort((a, b) => (b.datetime || 0) - (a.datetime || 0));
  return { list: list.slice(0, 50), fetchSym };
}

async function fetchEarningsCalendarMap(symbols) {
  const map = new Map();
  if (!symbols.length || !FH_KEY) return map;
  const from = isoDate(new Date());
  const to = isoDate(new Date(Date.now() + EARNINGS_HORIZON_DAYS * 864e5));
  const url =
    `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}` +
    `&token=${encodeURIComponent(FH_KEY)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) {
      console.log('⚠ Finnhub calendar/earnings HTTP ' + r.status);
      return map;
    }
    const j = await r.json();
    const arr = Array.isArray(j?.earningsCalendar) ? j.earningsCalendar : [];
    // match pe symbol watch SAU pe newsSymbol
    const want = new Set();
    const alias = new Map(); // newsSym → watchSyms
    for (const s of symbols) {
      want.add(s.watch);
      want.add(s.news);
      if (!alias.has(s.news)) alias.set(s.news, new Set());
      alias.get(s.news).add(s.watch);
      if (!alias.has(s.watch)) alias.set(s.watch, new Set());
      alias.get(s.watch).add(s.watch);
    }
    for (const e of arr) {
      const es = normSym(e.symbol);
      if (!want.has(es) && !alias.has(es)) continue;
      if (!e.date) continue;
      const targets = alias.get(es) || new Set([es]);
      for (const t of targets) {
        if (!map.has(t)) map.set(t, []);
        map.get(t).push({
          date: String(e.date).slice(0, 10),
          hour: String(e.hour || '').toLowerCase() || '',
          epsEstimate: e.epsEstimate ?? null,
          revenueEstimate: e.revenueEstimate ?? null
        });
      }
    }
    for (const [, list] of map) {
      list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    }
    console.log(`📅 Earnings calendar: ${arr.length} raw · matched ${map.size} watches`);
  } catch (e) {
    console.log('⚠ calendar/earnings: ' + (e.message || e));
  }
  return map;
}

function clusterDedupe(items) {
  const by = new Map();
  for (const it of items) {
    const k = clusterKey(it.headline) || it.id;
    const prev = by.get(k);
    if (!prev || it.score > prev.score) by.set(k, it);
  }
  return [...by.values()];
}

// ── main ──
let cfg;
try {
  cfg = JSON.parse(readFileSync(FILE, 'utf8'));
} catch (e) {
  console.log('tools/news-watch.json lipsește sau e invalid — nimic de făcut.');
  process.exit(0);
}

const settings = mergeSettings(cfg.settings);
const watches = Array.isArray(cfg.watches) ? cfg.watches : [];
if (!watches.length) {
  console.log('Niciun news watch.');
  process.exit(0);
}
if (!FH_KEY) {
  console.log('⚠ FINNHUB_API_KEY lipsește — skip.');
  process.exit(0);
}

const minScore = MODE_MIN[settings.mode] ?? 5;
const strictSources = settings.mode === 'strict';
const quiet = inQuietHours(settings);
const priceSyms = loadPriceAlertSymbols();
const quietFloor = 8; // în quiet hours doar score ≥ 8 sau earnings urgent

console.log(
  `⚙ mode=${settings.mode} min=${minScore} digest=${settings.digest} quiet=${quiet}` +
  ` portfolioOnly=${settings.portfolioOnly} gap=${settings.autoGapAlert}`
);

const digestNews = [];
const digestEvents = [];
const allEarnRows = []; // for weekly calendar
let sentDelta = { bull: 0, bear: 0, mixed: 0, neut: 0 };
let tgBudget = Number(settings.maxTelegramPerRun) || 8;
let tgUsed = 0;

async function tg(html, force = false) {
  if (!force && quiet && !html.includes('🚨') && !html.includes('AZI') && !html.includes('MÂINE')) {
    // quiet: doar forțate / urgent
    if (!html.includes('sc≥') && !/sc1[0-9]/.test(html) && !html.includes('EXTREME') && !html.includes('GUIDANCE') && !html.includes('M&A')) {
      // still allow high-score markers
    }
  }
  if (tgUsed >= tgBudget && !force) {
    console.log('⏭ telegram budget epuizat');
    return false;
  }
  const ok = await sendTelegram(html);
  if (ok) tgUsed++;
  return ok;
}

// symbols for earnings
const earnKeys = watches
  .filter(w => w.kind !== 'crypto' && w.armed !== false)
  .filter(w => !settings.portfolioOnly || priceSyms.has(String(w.symbol).toUpperCase()))
  .map(w => ({
    watch: normSym(w.symbol),
    news: resolveNewsSymbol(w)
  }));

const earningsMap = await fetchEarningsCalendarMap(earnKeys);

let changed = false;
let totalNew = 0;
let totalEvents = 0;
let totalNoise = 0;
let totalClusterDrop = 0;
let checked = 0;
let errors = 0;
let skippedPortfolio = 0;

for (const w of watches) {
  const sym = String(w.symbol || '').toUpperCase();
  if (!sym) continue;
  if (w.armed === false) {
    console.log(`⏸ ${sym} paused`);
    continue;
  }
  if (settings.portfolioOnly && !priceSyms.has(sym)) {
    skippedPortfolio++;
    console.log(`⏭ ${sym} skip (portfolioOnly)`);
    continue;
  }
  if (!dueForCheck(w)) {
    // still collect nextEarnings for weekly if present
    if (w.nextEarnings?.date) allEarnRows.push({ symbol: sym, ...w.nextEarnings });
    console.log(`⏭ ${sym} nu e due`);
    continue;
  }

  checked++;
  try {
    const { list: arts, fetchSym } = await fetchArticles(w);
    const mappedVia = fetchSym !== normSym(sym) ? ` via ${fetchSym}` : '';
    const seen = new Set(Array.isArray(w.seen) ? w.seen : []);
    const eventSeen = new Set(Array.isArray(w.eventSeen) ? w.eventSeen : []);
    let noiseHere = 0;
    const freshBig = [];

    // post-earnings follow-up: scor min mai mic 6h după T-0
    let effectiveMin = minScore;
    const ne = w.nextEarnings;
    if (
      ne &&
      ne.date === isoDate(new Date()) &&
      settings.postEarnFollowH > 0
    ) {
      effectiveMin = Math.max(3, minScore - 2);
    }

    for (const a of arts) {
      const id = articleId(a);
      if (seen.has(id)) continue;
      seen.add(id);
      const sc = scoreArticle(a, effectiveMin, strictSources);
      if (!sc.big) {
        noiseHere++;
        continue;
      }
      // quiet hours: doar scor mare
      if (quiet && sc.score < quietFloor) {
        noiseHere++;
        continue;
      }
      freshBig.push({
        id,
        symbol: sym,
        headline: a.headline || '(fără titlu)',
        url: a.url || '',
        source: a.source || '',
        datetime: a.datetime || 0,
        score: sc.score,
        tags: sc.tags,
        sev: sc.sev,
        why: sc.why,
        sentiment: sc.sentiment
      });
    }

    for (const a of arts) seen.add(articleId(a));

    const beforeCluster = freshBig.length;
    const clustered = clusterDedupe(freshBig);
    totalClusterDrop += Math.max(0, beforeCluster - clustered.length);
    clustered.sort((a, b) => (b.score - a.score) || ((b.datetime || 0) - (a.datetime || 0)));

    totalNoise += noiseHere;
    w.seen = [...seen].slice(-SEEN_CAP);
    w.lastCheck = new Date().toISOString();
    w.lastNewCount = clustered.length;
    w.lastFiltered = noiseHere;
    if (fetchSym !== normSym(sym)) w.newsSymbol = w.newsSymbol || fetchSym;
    changed = true;

    if (clustered.length) {
      totalNew += clustered.length;
      for (const h of clustered) {
        sentDelta[h.sentiment] = (sentDelta[h.sentiment] || 0) + 1;
        digestNews.push(h);
        audit({
          type: 'big_news',
          symbol: sym,
          score: h.score,
          sev: h.sev,
          sentiment: h.sentiment,
          headline: h.headline.slice(0, 120)
        });
      }
      console.log(
        `⭐ ${sym}${mappedVia}: ${clustered.length} big` +
        ` (scanned ${arts.length}, noise ${noiseHere}, cluster-drop ${beforeCluster - clustered.length})`
      );
    } else {
      console.log(`✓ ${sym}${mappedVia}: 0 big (${arts.length} scanned, noise ${noiseHere})`);
    }

    // ── Earnings events ──
    if (w.kind !== 'crypto') {
      const events = earningsMap.get(normSym(sym)) || earningsMap.get(fetchSym) || [];
      const upcoming = [];
      for (const ev of events) {
        const dLeft = daysUntil(ev.date);
        if (dLeft == null || dLeft < 0 || dLeft > EARNINGS_HORIZON_DAYS) continue;
        allEarnRows.push({ symbol: sym, date: ev.date, hour: ev.hour, dLeft, epsEstimate: ev.epsEstimate, revenueEstimate: ev.revenueEstimate });
        const phases = [];
        if (dLeft <= 14) phases.push('disc');
        if (dLeft <= 1) phases.push('t1');
        if (dLeft === 0) phases.push('t0');
        // quiet: doar t1/t0
        const usePhases = quiet ? phases.filter(p => p === 't1' || p === 't0') : phases;
        for (const phase of usePhases) {
          const key = `earn:${normSym(sym)}:${ev.date}:${phase}`;
          if (eventSeen.has(key)) continue;
          eventSeen.add(key);
          upcoming.push({ ...ev, dLeft, phase, key });
        }
      }

      if (upcoming.length) {
        const byDate = new Map();
        const prio = { t0: 3, t1: 2, disc: 1 };
        for (const u of upcoming) {
          const prev = byDate.get(u.date);
          if (!prev || prio[u.phase] > prio[prev.phase]) byDate.set(u.date, u);
        }
        const ordered = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
        for (const u of ordered) {
          totalEvents++;
          digestEvents.push({ symbol: sym, ...u });
          audit({ type: 'earnings', symbol: sym, date: u.date, phase: u.phase, dLeft: u.dLeft });
          // auto gap alert pe T-1 / T-0
          if (settings.autoGapAlert && (u.phase === 't1' || u.phase === 't0')) {
            ensureGapAlert(sym, u.date, settings.gapPct);
            changed = true;
          }
        }
        const nearest = ordered[0];
        w.nextEarnings = nearest
          ? {
              date: nearest.date,
              hour: nearest.hour,
              dLeft: nearest.dLeft,
              epsEstimate: nearest.epsEstimate ?? null,
              revenueEstimate: nearest.revenueEstimate ?? null
            }
          : w.nextEarnings || null;
      } else if (events.length) {
        const first = events[0];
        w.nextEarnings = {
          date: first.date,
          hour: first.hour,
          dLeft: daysUntil(first.date),
          epsEstimate: first.epsEstimate ?? null,
          revenueEstimate: first.revenueEstimate ?? null
        };
      }
      w.eventSeen = [...eventSeen].slice(-EVENT_SEEN_CAP);
    }
  } catch (e) {
    errors++;
    console.log(`⚠ ${sym}: ${e.message || e}`);
    audit({ type: 'error', symbol: sym, msg: String(e.message || e).slice(0, 160) });
  }
  await new Promise(r => setTimeout(r, 400));
}

// ── Build & send digests ──
digestNews.sort((a, b) => (b.score - a.score) || ((b.datetime || 0) - (a.datetime || 0)));
const topNews = digestNews.slice(0, 12);

function formatNewsLine(h) {
  const title = tgEsc(h.headline.slice(0, 120));
  const link = h.url ? `<a href="${tgEsc(h.url)}">${title}</a>` : title;
  return (
    `• <b>${tgEsc(h.symbol)}</b> <code>${tgEsc(h.sev)}</code> sc${h.score}\n` +
    `  ${link}\n` +
    `  <i>${tgEsc(h.why)}${h.sentiment && h.sentiment !== 'neut' ? ' · ' + h.sentiment : ''}</i>`
  );
}

function formatEventLine(u) {
  const whenTxt =
    u.dLeft === 0 ? 'AZI' :
    u.dLeft === 1 ? 'MÂINE' :
    `T-${u.dLeft}`;
  const emoji = u.dLeft <= 1 ? '🚨' : '📅';
  const eps = u.epsEstimate != null ? `EPS ${fmtNum(u.epsEstimate)}` : '';
  const rev = u.revenueEstimate != null ? `Rev ${fmtNum(u.revenueEstimate)}` : '';
  const stats = [eps, rev].filter(Boolean).join(' · ');
  return (
    `${emoji} <b>${tgEsc(u.symbol)}</b> earnings <b>${tgEsc(u.date)}</b> (${tgEsc(hourLabel(u.hour))}) — <b>${whenTxt}</b>` +
    (stats ? `\n  ${tgEsc(stats)}` : '') +
    `\n  <i>pre-pack · risk: gap / vol</i>`
  );
}

const sentParts = [];

if (settings.digest) {
  if (topNews.length || digestEvents.length) {
    const head =
      `⭐ <b>News Desk</b> <i>${tgEsc(settings.mode)}${quiet ? ' · quiet' : ''}</i>\n` +
      (topNews.length ? `${topNews.length} big` : '0 big') +
      (digestEvents.length ? ` · ${digestEvents.length} events` : '') +
      `\nΔ sentiment: 🟢${sentDelta.bull || 0} 🔴${sentDelta.bear || 0} ⚪${(sentDelta.neut || 0) + (sentDelta.mixed || 0)}\n`;
    const bodyNews = topNews.map(formatNewsLine).join('\n');
    const bodyEv = digestEvents.map(formatEventLine).join('\n');
    const msg = head + (bodyNews ? '\n' + bodyNews : '') + (bodyEv ? '\n\n' + bodyEv : '');
    await tg(msg, quiet && digestEvents.some(e => e.dLeft <= 1));
    sentParts.push('digest');
  }
} else {
  // per-item (capped)
  for (const h of topNews.slice(0, MAX_NEW_PER_WATCH * 3)) {
    await tg(
      `⭐ <b>Big News · ${tgEsc(h.symbol)}</b> <code>${tgEsc(h.sev)}</code>\n` +
      formatNewsLine(h).replace(/^• /, '')
    );
  }
  for (const u of digestEvents) {
    await tg(formatEventLine(u), u.dLeft <= 1);
  }
}

// Daily risk digest (o dată / zi la ora setată)
const tz = settings.quietHours?.tz || 'Europe/Bucharest';
const localDay = localDateInTz(tz);
const localHour = hourInTz(tz);
if (
  Number(settings.dailyDigestHour) >= 0 &&
  localHour === Number(settings.dailyDigestHour) &&
  cfg._meta?.lastDailyDigest !== localDay
) {
  // unique earnings by symbol
  const bySym = new Map();
  for (const e of allEarnRows) {
    if (e.dLeft == null || e.dLeft < 0 || e.dLeft > 14) continue;
    if (!bySym.has(e.symbol) || e.dLeft < bySym.get(e.symbol).dLeft) bySym.set(e.symbol, e);
  }
  const list = [...bySym.values()].sort((a, b) => a.dLeft - b.dLeft).slice(0, 15);
  const lines = list.length
    ? list.map(e =>
        `• <b>${tgEsc(e.symbol)}</b> ${tgEsc(e.date)} ${tgEsc(hourLabel(e.hour))} · T-${e.dLeft}`
      ).join('\n')
    : '• niciun earnings pe watches în 14z';
  await tg(
    `🗓 <b>Daily risk · ${tgEsc(localDay)}</b>\n` +
    `Watches: ${watches.length} · mode ${tgEsc(settings.mode)}\n` +
    lines,
    true
  );
  cfg._meta = { ...(cfg._meta || {}), lastDailyDigest: localDay };
  changed = true;
  sentParts.push('daily');
  audit({ type: 'daily_digest', day: localDay, n: list.length });
}

// Weekly risk calendar (Luni sau DOW setat, o dată)
const localDow = dowInTz(tz);
const weekKey = localDay.slice(0, 7) + '-W' + Math.ceil(Number(localDay.slice(8, 10)) / 7);
if (
  localDow === Number(settings.weeklyDigestDow ?? 1) &&
  cfg._meta?.lastWeeklyDigest !== weekKey
) {
  const bySym = new Map();
  for (const e of allEarnRows) {
    if (e.dLeft == null || e.dLeft < 0) continue;
    if (!bySym.has(e.symbol) || e.dLeft < bySym.get(e.symbol).dLeft) bySym.set(e.symbol, e);
  }
  const list = [...bySym.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 20);
  const lines = list.length
    ? list.map(e => {
        const eps = e.epsEstimate != null ? ` · EPS ${fmtNum(e.epsEstimate)}` : '';
        return `• <b>${tgEsc(e.symbol)}</b> ${tgEsc(e.date)} ${tgEsc(hourLabel(e.hour))} (T-${e.dLeft})${tgEsc(eps)}`;
      }).join('\n')
    : '• calendar gol pe watches';
  await tg(
    `📆 <b>Weekly risk calendar</b>\n` +
    lines +
    `\n\n<i>sizing: reduce înainte de BMO/AMC pe lista de sus</i>`,
    true
  );
  cfg._meta = { ...(cfg._meta || {}), lastWeeklyDigest: weekKey };
  changed = true;
  sentParts.push('weekly');
  audit({ type: 'weekly_digest', week: weekKey, n: list.length });
}

// store last sentiment on meta
cfg._meta = {
  ...(cfg._meta || {}),
  lastSentiment: sentDelta,
  lastRun: new Date().toISOString(),
  lastBig: totalNew,
  lastEvents: totalEvents
};

if (changed || totalNew || totalEvents) {
  const out = {
    _doc: 'News Watch pro desk — big filter, digest, quiet hours, earnings pre-pack, EU map. Gestionat din /alerts/.',
    version: 2,
    settings,
    _meta: cfg._meta,
    watches
  };
  writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(
    `Persisted · checked=${checked} · big=${totalNew} · events=${totalEvents}` +
    ` · noise=${totalNoise} · clusterDrop=${totalClusterDrop}` +
    ` · portfolioSkip=${skippedPortfolio} · tg=${tgUsed} · err=${errors}` +
    ` · sent=[${sentParts.join(',')}]`
  );
} else {
  console.log(
    `Nicio schimbare · checked=${checked} · err=${errors} · portfolioSkip=${skippedPortfolio}`
  );
}
