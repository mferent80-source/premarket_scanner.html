// ═══════════════════════════════════════════════════════════════════
// check-alerts.mjs — verificare alerte preț SERVER-SIDE (GitHub Actions)
//
// Rulează din .github/workflows/price-alerts.yml la fiecare 15 min în orele
// de piață. Citește tools/alerts.json, ia prețurile de pe Yahoo (direct —
// server-side nu există CORS), trimite pe Telegram la prag atins și persistă
// starea înapoi în fișier (one-shot consumate / re-arm dezarmate) printr-un
// commit al botului. Funcționează cu laptopul ÎNCHIS — ăsta e tot rostul.
//
// Secrets necesare în repo (Settings → Secrets and variables → Actions):
//   TELEGRAM_TOKEN   — tokenul botului (de la @BotFather)
//   TELEGRAM_CHAT_ID — chat id-ul destinație
//
// Format tools/alerts.json (tipuri de alertă):
//   REFERINȚĂ:  { "symbol":"NVDA", "kind":"ref", "pct":1, "base":180.5,
//               "lastStep":0, "hi":0, "lo":0, "note":"..." }
//               // referință FIXĂ (preț de creare = 0%): alertă la fiecare pas cumulat ±pct% sus/jos. Tracker persistent.
//   PREȚ PRAG: { "symbol":"NVDA", "level":180, "dir":"above"|"below",
//               "rearm":false, "armed":true, "note":"..." }
//   MIȘCARE ±%: { "symbol":"NVDA", "kind":"pct", "pct":1, "base":180.5,
//               "rearm":false, "note":"..." }   // base = prețul ancoră (null → se ancorează la primul check)
//   ANCORĂ:     { "symbol":"NVDA", "kind":"anchor", "pct":1, "base":180.5, "target":200, "stop":175,
//               "lastStep":0, "tgtHit":false, "nearHit":false, "slHit":false, "rearm":false, "note":"..." }
//               // ancoră FIXĂ: 4 alerte vs base — pas cumulat ±pct%, țintă, aproape ≥90%, stop. Tracker persistent (nu dispare).
//   { "alerts": [ ... ], "triggered": [ ...istoric, scris de script... ] }
// Semantica e identică cu wl_price_alerts din suite: one-shot dispare la
// declanșare; re-arm la preț-prag se dezarmează și se re-armează cu histerezis
// 0.3%; re-arm la mișcare-% se re-ancorează la prețul nou (alertă la fiecare pas de X%).
// ═══════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = new URL('./alerts.json', import.meta.url);
const REARM_HYST = 0.003;
// Perechile USDT (crypto, des sub 1$) → 4 zecimale: acolo se vede mișcarea reală. Restul → 2.
const dec = sym => /USDT$/.test(String(sym || '').toUpperCase()) ? 4 : 2;

let cfg;
try { cfg = JSON.parse(readFileSync(FILE, 'utf8')); }
catch (e) { console.log('tools/alerts.json lipsește sau e invalid — nimic de făcut.'); process.exit(0); }

const alerts = Array.isArray(cfg.alerts) ? cfg.alerts : [];
if (!alerts.length) { console.log('Niciun alert definit în tools/alerts.json.'); process.exit(0); }

const TOKEN = process.env.TELEGRAM_TOKEN || '';
const CHAT = process.env.TELEGRAM_CHAT_ID || '';

// Preț live: ultima bară 5m cu includePrePost (acoperă pre/after) — pattern-ul
// validat în suite (regularMarketPrice e stale în extended hours).
async function fetchPrice(sym){
  // Yahoo nu cunoaște perechile Binance USDT (ONDOUSDT) — convertim la forma lui (ONDO-USD).
  // Binance.com e geo-blocat pe runnerele GitHub (IP US → 451), deci server-side rămânem pe Yahoo.
  const ySym = /USDT$/.test(sym) ? sym.replace(/USDT$/, '-USD') : sym;
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySym)}?interval=5m&range=1d&includePrePost=true`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (price-alerts-bot)' }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    if (!res) return null;
    const closes = res.indicators?.quote?.[0]?.close || [];
    for (let i = closes.length - 1; i >= 0; i--) if (closes[i] != null) return closes[i];
    return res.meta?.regularMarketPrice ?? null;
  } catch (e) { return null; }
}

const tgEsc = s => String(s ?? '').replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
async function sendTelegram(html){
  if (!TOKEN || !CHAT) { console.log('⚠ TELEGRAM_TOKEN/TELEGRAM_CHAT_ID lipsesc din secrets — mesaj nesent:\n' + html); return false; }
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text: html, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) console.log('⚠ Telegram HTTP ' + r.status + ': ' + await r.text());
    return r.ok;
  } catch (e) { console.log('⚠ Telegram: ' + e.message); return false; }
}

// Weekend ET: bursa US e închisă complet (fără pre/after) → prețul stocks e înghețat
// la close-ul de vineri. Sărim complet simbolurile stocks Sat/Sun ca să nu interogăm
// degeaba și să nu trimitem alerte pe preț vechi. Crypto rămâne 24/7.
const isCrypto = s => /USDT$/.test(s) || /-USD$/.test(s) || ['BTC','ETH','SOL'].includes(s);
const etWeekday = new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', weekday:'short' }).format(new Date());
const isWeekend = etWeekday === 'Sat' || etWeekday === 'Sun';
const uniq = [...new Set(alerts.map(a => String(a.symbol || '').toUpperCase()).filter(Boolean))]
  .filter(sym => !isWeekend || isCrypto(sym));
if (isWeekend) console.log('🌙 Weekend ET — stocks sărite (preț înghețat), verific doar crypto.');
const prices = {};
for (const sym of uniq){
  prices[sym] = await fetchPrice(sym);
  await new Promise(r => setTimeout(r, 300)); // menajează Yahoo
}
console.log('Prețuri:', JSON.stringify(prices));

const fired = [];
let changed = false;
const kept = [];
for (const a of alerts){
  const sym = String(a.symbol || '').toUpperCase();
  const p = prices[sym];
  if (p == null){ kept.push(a); continue; }
  // ── Alertă REFERINȚĂ (preț de creare = 0%: pas cumulat ±pct% sus/jos + water-marks) ──
  if (a.kind === 'ref'){
    const pct = Number(a.pct);
    if (!(pct > 0)){ kept.push(a); continue; }
    if (a.base == null){ a.base = +p.toFixed(4); a.lastStep = 0; a.hi = 0; a.lo = 0; changed = true; kept.push(a); continue; } // ancorare la primul preț valid
    const base = Number(a.base);
    const moved = (p - base) / base * 100;
    if (moved > (a.hi || 0)){ a.hi = +moved.toFixed(2); changed = true; }   // high-water-mark
    if (moved < (a.lo || 0)){ a.lo = +moved.toFixed(2); changed = true; }   // low-water-mark
    const step = Math.trunc(moved / pct);
    const prevStep = a.lastStep || 0;
    // alertă doar când banda atinsă e mai depărtată de referință decât ultima raportată
    if (step !== 0 && Math.abs(step) > Math.abs(prevStep)){
      fired.push({ sym, kind:'ref', pct, base, step, moved, price: p, note: a.note || '' });
    }
    if (step !== prevStep){ a.lastStep = step; changed = true; }
    kept.push(a); // referința rămâne mereu (tracker persistent)
    continue;
  }
  // ── Alertă ANCORĂ (ancoră FIXĂ: pas cumulat + țintă + aproape ≥90% + stop) ──
  if (a.kind === 'anchor'){
    const pct = Number(a.pct);
    if (!(pct > 0)){ kept.push(a); continue; }
    if (a.base == null){ a.base = +p.toFixed(4); changed = true; kept.push(a); continue; } // ancorare la primul preț valid
    const base = Number(a.base);
    const moved = (p - base) / base * 100;
    const target = (a.target != null) ? Number(a.target) : null;
    const stop = (a.stop != null) ? Number(a.stop) : null;
    const up = target != null ? target >= base : (stop != null ? stop <= base : true); // direcția trade-ului
    const armed = a.armed !== false;
    // 1) PAS cumulat (alertă doar când |step| crește — fără chop pe aceeași bandă)
    const step = Math.trunc(moved / pct);
    const prevStep = a.lastStep || 0;
    if (armed && step !== 0 && Math.abs(step) > Math.abs(prevStep)){
      fired.push({ sym, kind:'anchor', sub:'step', pct, base, target, stop, step, moved, price: p, note: a.note || '', rearm: !!a.rearm });
    }
    if (step !== prevStep){ a.lastStep = step; changed = true; }
    // 2) ȚINTĂ (one-shot re-armabilă) + 3) APROAPE ≥90% (histerezis re-arm 85%)
    if (target != null && target !== base){
      const tgtReached = up ? p >= target : p <= target;
      if (!a.tgtHit && tgtReached){
        fired.push({ sym, kind:'anchor', sub:'target', pct, base, target, stop, moved, price: p, note: a.note || '', rearm: !!a.rearm });
        a.tgtHit = true; changed = true;
      } else if (a.tgtHit && a.rearm && !tgtReached){ a.tgtHit = false; changed = true; }
      const prog = (p - base) / (target - base) * 100;
      if (!a.nearHit && prog >= 90 && !tgtReached){
        fired.push({ sym, kind:'anchor', sub:'near', pct, base, target, stop, prog, moved, price: p, note: a.note || '', rearm: !!a.rearm });
        a.nearHit = true; changed = true;
      } else if (a.nearHit && prog < 85){ a.nearHit = false; changed = true; }
    }
    // 4) STOP (one-shot re-armabil)
    if (stop != null){
      const stopReached = up ? p <= stop : p >= stop;
      if (!a.slHit && stopReached){
        fired.push({ sym, kind:'anchor', sub:'stop', pct, base, target, stop, moved, price: p, note: a.note || '', rearm: !!a.rearm });
        a.slHit = true; changed = true;
      } else if (a.slHit && a.rearm && !stopReached){ a.slHit = false; changed = true; }
    }
    kept.push(a); // ancora rămâne mereu (tracker persistent)
    continue;
  }
  // ── Alertă MIȘCARE ±% (față de prețul ancoră) ──
  if (a.kind === 'pct'){
    const pct = Number(a.pct);
    if (!(pct > 0)){ kept.push(a); continue; }
    if (a.base == null){ a.base = +p.toFixed(4); changed = true; kept.push(a); continue; } // ancorare la primul preț valid
    const moved = (p - a.base) / a.base * 100;
    if (Math.abs(moved) >= pct){
      fired.push({ sym, kind:'pct', pct, base: a.base, moved, price: p, note: a.note || '', rearm: !!a.rearm });
      changed = true;
      if (a.rearm){ a.base = +p.toFixed(4); kept.push(a); }   // re-arm → re-ancorează la prețul nou
      // one-shot → NU se păstrează (dispare)
    } else { kept.push(a); }
    continue;
  }
  // ── Alertă PREȚ PRAG ──
  const lvl = Number(a.level);
  if (!(lvl > 0)){ kept.push(a); continue; }
  const armed = a.armed !== false;
  const hit = a.dir === 'below' ? p <= lvl : p >= lvl;
  if (armed && hit){
    fired.push({ sym, lvl, dir: a.dir, price: p, note: a.note || '', rearm: !!a.rearm });
    changed = true;
    if (a.rearm){ a.armed = false; kept.push(a); }            // re-arm → dezarmat, rămâne
    // one-shot → NU se păstrează (dispare, ca în suite)
  } else if (!armed && a.rearm){
    const back = a.dir === 'below' ? p >= lvl * (1 + REARM_HYST) : p <= lvl * (1 - REARM_HYST);
    if (back){ a.armed = true; changed = true; }
    kept.push(a);
  } else {
    kept.push(a);
  }
}

if (fired.length){
  cfg.triggered = [
    ...fired.map(f => f.kind === 'ref'
      ? ({ symbol: f.sym, kind: 'ref', pct: f.pct, base: +Number(f.base).toFixed(4), moved: +f.moved.toFixed(2), step: f.step, dir: f.moved >= 0 ? 'above' : 'below', price: +f.price.toFixed(4), note: f.note, at: new Date().toISOString() })
      : f.kind === 'anchor'
      ? ({ symbol: f.sym, kind: 'anchor', sub: f.sub, pct: f.pct, base: +Number(f.base).toFixed(4), target: f.target != null ? +Number(f.target).toFixed(4) : null, stop: f.stop != null ? +Number(f.stop).toFixed(4) : null, moved: +f.moved.toFixed(2), prog: f.prog != null ? +f.prog.toFixed(0) : undefined, dir: f.sub === 'stop' ? 'below' : (f.sub === 'step' ? (f.moved >= 0 ? 'above' : 'below') : 'above'), price: +f.price.toFixed(4), note: f.note, rearm: f.rearm, at: new Date().toISOString() })
      : f.kind === 'pct'
      ? ({ symbol: f.sym, kind: 'pct', pct: f.pct, base: +Number(f.base).toFixed(4), moved: +f.moved.toFixed(2), dir: f.moved >= 0 ? 'above' : 'below', price: +f.price.toFixed(4), note: f.note, rearm: f.rearm, at: new Date().toISOString() })
      : ({ symbol: f.sym, level: f.lvl, dir: f.dir, price: +f.price.toFixed(4), note: f.note, rearm: f.rearm, at: new Date().toISOString() })),
    ...(Array.isArray(cfg.triggered) ? cfg.triggered : [])
  ].slice(0, 50);
  const lines = fired.map(f => f.kind === 'ref'
    ? `📊 <b>${tgEsc(f.sym)}</b> ${f.moved >= 0 ? '▲' : '▼'} ${f.moved >= 0 ? '+' : ''}${f.moved.toFixed(2)}% (pas ${f.step > 0 ? '+' : ''}${f.step}×${f.pct}%) → $${f.price.toFixed(dec(f.sym))} (de la $${Number(f.base).toFixed(dec(f.sym))})${f.note ? ' · ' + tgEsc(f.note) : ''}`
    : f.kind === 'anchor'
    ? (f.sub === 'target' ? `🎯 <b>${tgEsc(f.sym)}</b> ȚINTĂ $${Number(f.target).toFixed(dec(f.sym))} atinsă → $${f.price.toFixed(dec(f.sym))} (${f.moved >= 0 ? '+' : ''}${f.moved.toFixed(2)}% de la $${Number(f.base).toFixed(dec(f.sym))})${f.note ? ' · ' + tgEsc(f.note) : ''}`
      : f.sub === 'near' ? `🔔 <b>${tgEsc(f.sym)}</b> ${Number(f.prog).toFixed(0)}% spre țintă $${Number(f.target).toFixed(dec(f.sym))} → $${f.price.toFixed(dec(f.sym))}`
      : f.sub === 'stop' ? `🛑 <b>${tgEsc(f.sym)}</b> STOP $${Number(f.stop).toFixed(dec(f.sym))} atins → $${f.price.toFixed(dec(f.sym))}${f.note ? ' · ' + tgEsc(f.note) : ''}`
      : `🪜 <b>${tgEsc(f.sym)}</b> ${f.moved >= 0 ? '+' : ''}${f.moved.toFixed(2)}% (pas ${f.step}×${f.pct}%) → $${f.price.toFixed(dec(f.sym))} (de la $${Number(f.base).toFixed(dec(f.sym))})`)
    : f.kind === 'pct'
    ? `${f.moved >= 0 ? '▲' : '▼'} <b>${tgEsc(f.sym)}</b> ${f.moved >= 0 ? '+' : ''}${f.moved.toFixed(2)}% → $${f.price.toFixed(dec(f.sym))} (de la $${Number(f.base).toFixed(dec(f.sym))})${f.rearm ? ' (re-arm)' : ''}${f.note ? ' · ' + tgEsc(f.note) : ''}`
    : `${f.dir === 'below' ? '▼' : '▲'} <b>${tgEsc(f.sym)}</b> $${f.price.toFixed(dec(f.sym))} — prag $${Number(f.lvl).toFixed(dec(f.sym))}${f.rearm ? ' (re-arm)' : ''}${f.note ? ' · ' + tgEsc(f.note) : ''}`);
  await sendTelegram(`🔔 <b>Price Alert (server-side · ${fired.length})</b>\n${lines.join('\n')}`);
  console.log(`🔔 ${fired.length} alerte declanșate.`);
} else {
  console.log('Niciun prag atins.');
}

if (changed){
  cfg.alerts = kept;
  writeFileSync(FILE, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  console.log('Stare actualizată în tools/alerts.json (workflow-ul o comite înapoi).');
}
