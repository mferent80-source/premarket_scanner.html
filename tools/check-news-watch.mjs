// ═══════════════════════════════════════════════════════════════════
// check-news-watch.mjs — news pe simbol + evenimente viitoare (earnings)
//
// Citește tools/news-watch.json, fetch Finnhub (company-news / crypto news),
// filtrează DOAR știri mari (scor keywords + anti-zgomot + surse),
// alertează earnings viitoare (T-14 disc / T-1 / T-0),
// trimite pe Telegram, persistă state.
//
// Secrets: TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, FINNHUB_API_KEY
// ═══════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./news-watch.json', import.meta.url);
const SEEN_CAP = 300;
const EVENT_SEEN_CAP = 80;
const MAX_NEW_PER_WATCH = 3;
const LOOKBACK_DAYS = 3;
const EARNINGS_HORIZON_DAYS = 21;
const BIG_MIN_SCORE = 5; // prag „știre mare”

const TOKEN = process.env.TELEGRAM_TOKEN || '';
const CHAT = process.env.TELEGRAM_CHAT_ID || '';
const FH_KEY = process.env.FINNHUB_API_KEY || process.env.FINNHUB_TOKEN || '';

const tgEsc = s => String(s ?? '').replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));

// ── Big-news scoring ──────────────────────────────────────────────
// Scor pe keywords de catalizator. Noise keywords = reject hard.
const BIG_KW = [
  // earnings / guidance
  ['raises guidance', 9], ['cuts guidance', 9], ['lowers guidance', 9],
  ['raises full-year', 8], ['cuts full-year', 8],
  ['beat estimates', 7], ['misses estimates', 7], ['miss estimates', 7],
  ['earnings', 5], ['eps ', 4], ['revenue', 3], ['guidance', 6], ['outlook', 4],
  ['beats', 5], ['misses', 5], ['topped estimates', 6], ['fell short', 5],
  // M&A / deals
  ['acquisition', 7], ['acquire', 6], ['merger', 7], ['buyout', 7],
  ['takeover', 7], ['to buy ', 5], ['all-cash deal', 7], ['all-stock deal', 6],
  // analyst
  ['upgrade', 5], ['downgrade', 5], ['price target', 4], ['initiates coverage', 5],
  ['raised to buy', 6], ['cut to sell', 6],
  // corporate action
  ['stock split', 6], ['buyback', 5], ['share repurchase', 5], ['dividend', 4],
  ['spin-off', 6], ['spinoff', 6], ['delist', 7], ['secondary offering', 5],
  // leadership / legal / reg
  ['ceo resign', 7], ['cfo resign', 7], ['steps down', 5], ['appointed ceo', 5],
  ['sec charges', 7], ['sec probe', 6], ['lawsuit', 5], ['investigation', 6],
  ['fraud', 7], ['whistleblower', 6],
  // product / regulatory
  ['fda approval', 8], ['fda rejects', 8], ['fda ', 5], ['approval', 3],
  ['antitrust', 5], ['sanction', 5],
  // extreme / market structure
  ['trading halt', 7], ['halted', 5], ['bankruptcy', 9], ['chapter 11', 9],
  ['short squeeze', 6], [' plunges', 4], [' surges', 3], ['soars', 3],
  // crypto
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

function scoreArticle(a) {
  const headline = String(a.headline || '');
  const text = (headline + ' ' + (a.summary || '')).toLowerCase();
  const src = String(a.source || '').toLowerCase();
  if (NOISE_RE.some(re => re.test(text))) return { score: 0, tags: ['noise'], big: false };
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
  // multi-ticker roundups often name many symbols without being company-specific
  if (/\b(and|,)\s+[A-Z]{2,5}\b/.test(headline) && /stocks?/i.test(headline)) score -= 2;
  return { score, tags: [...new Set(tags)].slice(0, 5), big: score >= BIG_MIN_SCORE };
}

async function sendTelegram(html) {
  if (!TOKEN || !CHAT) {
    console.log('⚠ TELEGRAM_TOKEN/TELEGRAM_CHAT_ID lipsesc — mesaj nesent:\n' + html);
    return false;
  }
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      }),
      signal: AbortSignal.timeout(12000)
    });
    if (!r.ok) console.log('⚠ Telegram HTTP ' + r.status + ': ' + await r.text());
    return r.ok;
  } catch (e) {
    console.log('⚠ Telegram: ' + e.message);
    return false;
  }
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function articleId(a) {
  if (a.id != null && a.id !== '') return 'id:' + a.id;
  const u = String(a.url || '').trim();
  if (u) return 'u:' + u.slice(0, 180);
  return 'h:' + String(a.headline || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120);
}

function keywordsFor(w) {
  const raw = (Array.isArray(w.keywords) ? w.keywords : [])
    .map(k => String(k).trim())
    .filter(Boolean);
  if (raw.length) return raw.map(k => k.toLowerCase());
  const s = String(w.symbol || '').toUpperCase();
  const base = s.replace(/USDT$/, '').replace(/-USD$/, '').replace(/USD$/, '');
  return [s.toLowerCase(), base.toLowerCase()].filter((v, i, a) => v && a.indexOf(v) === i);
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

function normSym(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/-USD$/, '')
    .replace(/USDT$/, '')
    .trim();
}

async function fetchArticles(w) {
  if (!FH_KEY) throw new Error('FINNHUB_API_KEY lipsește din secrets');
  const kws = keywordsFor(w);
  const to = new Date();
  const from = new Date(Date.now() - LOOKBACK_DAYS * 864e5);
  let list = [];

  if (w.kind === 'crypto') {
    const url = `https://finnhub.io/api/v1/news?category=crypto&token=${encodeURIComponent(FH_KEY)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('Finnhub crypto news HTTP ' + r.status);
    const j = await r.json();
    list = Array.isArray(j) ? j : [];
    list = list.filter(a => matchKw((a.headline || '') + ' ' + (a.summary || ''), kws));
  } else {
    const sym = normSym(w.symbol);
    const url =
      `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(sym)}` +
      `&from=${isoDate(from)}&to=${isoDate(to)}&token=${encodeURIComponent(FH_KEY)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('Finnhub company-news HTTP ' + r.status);
    const j = await r.json();
    list = Array.isArray(j) ? j : [];
    if ((w.keywords || []).length) {
      list = list.filter(a => matchKw((a.headline || '') + ' ' + (a.summary || ''), kws));
    }
  }

  list.sort((a, b) => (b.datetime || 0) - (a.datetime || 0));
  return list.slice(0, 50);
}

/** Un singur call calendar/earnings → map symbol → [{date, hour, epsEstimate, revenueEstimate}] */
async function fetchEarningsCalendarMap(stockSymbols) {
  const map = new Map();
  if (!stockSymbols.length || !FH_KEY) return map;
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
    const want = new Set(stockSymbols.map(normSym));
    for (const e of arr) {
      const sym = normSym(e.symbol);
      if (!want.has(sym)) continue;
      if (!e.date) continue;
      if (!map.has(sym)) map.set(sym, []);
      map.get(sym).push({
        date: String(e.date).slice(0, 10),
        hour: String(e.hour || '').toLowerCase() || '',
        epsEstimate: e.epsEstimate ?? null,
        revenueEstimate: e.revenueEstimate ?? null
      });
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

function daysUntil(iso) {
  const t = Date.parse(iso + 'T12:00:00Z');
  if (!Number.isFinite(t)) return null;
  const today = Date.parse(isoDate(new Date()) + 'T12:00:00Z');
  return Math.round((t - today) / 864e5);
}

function hourLabel(h) {
  if (h === 'bmo') return 'BMO';
  if (h === 'amc') return 'AMC';
  if (h === 'dmh') return 'during market';
  return h ? h.toUpperCase() : '—';
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

// ── main ──
let cfg;
try {
  cfg = JSON.parse(readFileSync(FILE, 'utf8'));
} catch (e) {
  console.log('tools/news-watch.json lipsește sau e invalid — nimic de făcut.');
  process.exit(0);
}

const watches = Array.isArray(cfg.watches) ? cfg.watches : [];
if (!watches.length) {
  console.log('Niciun news watch în tools/news-watch.json.');
  process.exit(0);
}

if (!FH_KEY) {
  console.log('⚠ FINNHUB_API_KEY lipsește — skip news watch (setează secret-ul în repo).');
  process.exit(0);
}

// pre-fetch earnings o dată pentru toate stock watches due
const stockDueSyms = watches
  .filter(w => w.kind !== 'crypto' && w.armed !== false && dueForCheck(w))
  .map(w => normSym(w.symbol))
  .filter(Boolean);
const earningsMap = await fetchEarningsCalendarMap([...new Set(stockDueSyms)]);

let changed = false;
let totalNew = 0;
let totalEvents = 0;
let totalNoise = 0;
let checked = 0;
let errors = 0;

for (const w of watches) {
  const sym = String(w.symbol || '').toUpperCase();
  if (!sym) continue;
  if (w.armed === false) {
    console.log(`⏸ ${sym} paused`);
    continue;
  }
  if (!dueForCheck(w)) {
    console.log(`⏭ ${sym} nu e due (interval ${w.intervalMin || 15}m, last=${w.lastCheck || '—'})`);
    continue;
  }

  checked++;
  try {
    const arts = await fetchArticles(w);
    const seen = new Set(Array.isArray(w.seen) ? w.seen : []);
    const eventSeen = new Set(Array.isArray(w.eventSeen) ? w.eventSeen : []);
    const freshBig = [];
    let noiseHere = 0;

    for (const a of arts) {
      const id = articleId(a);
      if (seen.has(id)) continue;
      seen.add(id);
      const sc = scoreArticle(a);
      if (!sc.big) {
        noiseHere++;
        continue;
      }
      freshBig.push({
        id,
        headline: a.headline || '(fără titlu)',
        url: a.url || '',
        source: a.source || '',
        datetime: a.datetime || 0,
        score: sc.score,
        tags: sc.tags
      });
    }

    for (const a of arts) seen.add(articleId(a));
    freshBig.sort((a, b) => (b.score - a.score) || ((b.datetime || 0) - (a.datetime || 0)));
    totalNoise += noiseHere;

    w.seen = [...seen].slice(-SEEN_CAP);
    w.lastCheck = new Date().toISOString();
    w.lastNewCount = freshBig.length;
    w.lastFiltered = noiseHere;
    changed = true;

    if (freshBig.length) {
      totalNew += freshBig.length;
      const show = freshBig.slice(0, MAX_NEW_PER_WATCH);
      const lines = show.map(h => {
        const when = fmtWhen(h.datetime);
        const title = tgEsc(h.headline.slice(0, 140));
        const link = h.url
          ? `<a href="${tgEsc(h.url)}">${title}</a>`
          : title;
        const tagStr = (h.tags || []).filter(t => t !== 'src' && t !== 'noise').slice(0, 3).join(', ');
        return `• ${link}` +
          (tagStr ? `\n  <i>⭐ ${tgEsc(tagStr)} · sc${h.score}</i>` : `\n  <i>sc${h.score}</i>`) +
          (when ? ` · <i>${tgEsc(when)}</i>` : '');
      }).join('\n');
      const more = freshBig.length > MAX_NEW_PER_WATCH
        ? `\n… +${freshBig.length - MAX_NEW_PER_WATCH} altele (mari)`
        : '';
      const kindTag = w.kind === 'crypto' ? 'crypto' : 'stock';
      await sendTelegram(
        `⭐ <b>Big News · ${tgEsc(sym)}</b> <i>(${kindTag})</i>\n` +
        `${freshBig.length} știre${freshBig.length > 1 ? 'i' : ''} mare\n` +
        lines + more
      );
      console.log(`⭐ ${sym}: ${freshBig.length} big → Telegram (scanned ${arts.length}, noise ${noiseHere})`);
    } else {
      console.log(`✓ ${sym}: 0 big (${arts.length} scanned, noise ${noiseHere})`);
    }

    // ── Earnings events ──
    if (w.kind !== 'crypto') {
      const events = earningsMap.get(normSym(sym)) || [];
      const upcoming = [];
      for (const ev of events) {
        const dLeft = daysUntil(ev.date);
        if (dLeft == null || dLeft < 0 || dLeft > EARNINGS_HORIZON_DAYS) continue;
        const phases = [];
        if (dLeft <= 14) phases.push('disc');
        if (dLeft <= 1) phases.push('t1');
        if (dLeft === 0) phases.push('t0');
        for (const phase of phases) {
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
          const whenTxt =
            u.dLeft === 0 ? 'AZI' :
            u.dLeft === 1 ? 'MÂINE' :
            `în ${u.dLeft} zile`;
          const emoji = u.dLeft <= 1 ? '🚨' : '📅';
          const eps = u.epsEstimate != null ? `EPS est ${fmtNum(u.epsEstimate)}` : '';
          const rev = u.revenueEstimate != null ? `Rev est ${fmtNum(u.revenueEstimate)}` : '';
          const stats = [eps, rev].filter(Boolean).join(' · ');
          await sendTelegram(
            `${emoji} <b>Event · ${tgEsc(sym)}</b>\n` +
            `Earnings <b>${tgEsc(u.date)}</b> (${tgEsc(hourLabel(u.hour))}) — <b>${whenTxt}</b>` +
            (stats ? `\n${tgEsc(stats)}` : '') +
            `\n<i>alertă automată din News Watch</i>`
          );
          console.log(`📅 ${sym}: earnings ${u.date} (${u.phase}, T-${u.dLeft}) → Telegram`);
        }
        const nearest = ordered[0];
        w.nextEarnings = nearest
          ? { date: nearest.date, hour: nearest.hour, dLeft: nearest.dLeft }
          : null;
      } else if (events.length) {
        const first = events[0];
        w.nextEarnings = { date: first.date, hour: first.hour, dLeft: daysUntil(first.date) };
      }

      w.eventSeen = [...eventSeen].slice(-EVENT_SEEN_CAP);
    }
  } catch (e) {
    errors++;
    console.log(`⚠ ${sym}: ${e.message || e}`);
  }

  await new Promise(r => setTimeout(r, 400));
}

if (changed) {
  const out = {
    _doc: cfg._doc || 'News Watch server-side — big news filter + earnings events. Gestionat din /alerts/.',
    version: cfg.version || 1,
    watches
  };
  writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(
    `Persisted news-watch.json · checked=${checked} · big=${totalNew} · events=${totalEvents}` +
    ` · noise=${totalNoise} · err=${errors}`
  );
} else {
  console.log(`Nicio schimbare · checked=${checked} · err=${errors}`);
}
