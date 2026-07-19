// ═══════════════════════════════════════════════════════════════════
// check-news-watch.mjs — news pe simbol, SERVER-SIDE (GitHub Actions)
//
// Citește tools/news-watch.json, fetch Finnhub (company-news / crypto news),
// trimite pe Telegram doar headlines noi (dedupe pe seen), persistă state.
// Rulează din .github/workflows/price-alerts.yml (același cron ca price alerts).
//
// Secrets:
//   TELEGRAM_TOKEN, TELEGRAM_CHAT_ID  — ca la price alerts
//   FINNHUB_API_KEY                   — cheie Finnhub free (obligatoriu)
//
// Contract watches[] (paritate cu demo-ul din /alerts/):
//   { id, symbol, kind:'stock'|'crypto', keywords:[], intervalMin,
//     sources:[], seen:[], lastCheck, armed }
// ═══════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./news-watch.json', import.meta.url);
const SEEN_CAP = 300;
const MAX_NEW_PER_WATCH = 3;   // anti-spam Telegram per rulare
const LOOKBACK_DAYS = 3;

const TOKEN = process.env.TELEGRAM_TOKEN || '';
const CHAT = process.env.TELEGRAM_CHAT_ID || '';
const FH_KEY = process.env.FINNHUB_API_KEY || process.env.FINNHUB_TOKEN || '';

const tgEsc = s => String(s ?? '').replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));

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
    const sym = String(w.symbol || '')
      .toUpperCase()
      .replace(/-USD$/, '')
      .replace(/USDT$/, '');
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
  return list.slice(0, 40);
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

let changed = false;
let totalNew = 0;
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
    const fresh = [];
    for (const a of arts) {
      const id = articleId(a);
      if (seen.has(id)) continue;
      fresh.push({
        id,
        headline: a.headline || '(fără titlu)',
        url: a.url || '',
        source: a.source || '',
        datetime: a.datetime || 0
      });
      seen.add(id);
    }

    // marchează și restul batch-ului ca seen (fără notificare) ca să nu reapară
    for (const a of arts) seen.add(articleId(a));

    w.seen = [...seen].slice(-SEEN_CAP);
    w.lastCheck = new Date().toISOString();
    w.lastNewCount = fresh.length;
    changed = true;

    if (fresh.length) {
      totalNew += fresh.length;
      const show = fresh.slice(0, MAX_NEW_PER_WATCH);
      const lines = show.map(h => {
        const when = fmtWhen(h.datetime);
        const title = tgEsc(h.headline.slice(0, 140));
        const link = h.url
          ? `<a href="${tgEsc(h.url)}">${title}</a>`
          : title;
        return `• ${link}${when ? '\n  <i>' + tgEsc(when) + '</i>' : ''}`;
      }).join('\n');
      const more = fresh.length > MAX_NEW_PER_WATCH
        ? `\n… +${fresh.length - MAX_NEW_PER_WATCH} altele`
        : '';
      const kindTag = w.kind === 'crypto' ? 'crypto' : 'stock';
      await sendTelegram(
        `📰 <b>News Watch · ${tgEsc(sym)}</b> <i>(${kindTag})</i>\n` +
        `${fresh.length} știre${fresh.length > 1 ? 'i' : ''} nouă\n` +
        lines + more
      );
      console.log(`📰 ${sym}: ${fresh.length} new → Telegram`);
    } else {
      console.log(`✓ ${sym}: 0 new (${arts.length} scanned)`);
    }
  } catch (e) {
    errors++;
    console.log(`⚠ ${sym}: ${e.message || e}`);
  }

  // menajează Finnhub free tier
  await new Promise(r => setTimeout(r, 400));
}

if (changed) {
  const out = {
    _doc: cfg._doc || 'News Watch server-side — gestionat din /alerts/.',
    version: cfg.version || 1,
    watches
  };
  writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n', 'utf8');
  console.log(`Persisted news-watch.json · checked=${checked} · new=${totalNew} · err=${errors}`);
} else {
  console.log(`Nicio schimbare · checked=${checked} · err=${errors}`);
}
