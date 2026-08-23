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
//   TRAILING:   { "symbol":"NVDA", "kind":"ref", "trail":true, "pct":2, "base":180.5,
//               "peak":190, "trailFired":false, "note":"..." }
//               // referința urmează vârful; alertă când prețul scade ≥pct% din maximul atins (trailing-stop mental).
//   VARIAȚIA ZILEI: { "symbol":"NVDA", "kind":"day", "pct":5, "rearm":false, "armed":true, "note":"..." }
//               // alertă când |variația zilei| ≥ pct% (față de chartPreviousClose), bidirecțional.
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
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const PD = require('../lib/price-day.js');

const FILE = new URL('./alerts.json', import.meta.url);
const REARM_HYST = 0.003;
// Perechile USDT (crypto, des sub 1$) → 4 zecimale: acolo se vede mișcarea reală. Restul → 2.
const dec = sym => /USDT$/.test(String(sym || '').toUpperCase()) ? 4 : 2;

let cfg;
try { cfg = JSON.parse(readFileSync(FILE, 'utf8')); }
catch (e) { console.log('tools/alerts.json lipsește sau e invalid — nimic de făcut.'); process.exit(0); }

const alerts = Array.isArray(cfg.alerts) ? cfg.alerts : [];
if (!alerts.length) console.log('Niciun price alert în tools/alerts.json — verific doar equity drift (dacă e armat).');

const TOKEN = process.env.TELEGRAM_TOKEN || '';
const CHAT = process.env.TELEGRAM_CHAT_ID || '';

// Preț: aceeași formulă ca pagina /alerts/ (lib/price-day.js). Crypto rămâne pe
// open 00:00 UTC (Yahoo chartPreviousClose e N−2 pe 24/7). Stocks: yahooQuote
// alege last/prev după sesiunea ET — noaptea = close oficial, nu ultima bară AH.
async function fetchPrice(sym){
  // Yahoo nu cunoaște perechile Binance USDT (ONDOUSDT) — convertim la forma lui (ONDO-USD).
  // Binance.com e geo-blocat pe runnerele GitHub (IP US → 451), deci server-side rămânem pe Yahoo.
  const ySym = /USDT$/.test(sym) ? sym.replace(/USDT$/, '-USD') : sym;
  const crypto = isCrypto(sym);
  const range = crypto ? '2d' : '1d';
  try {
    const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySym)}?interval=5m&range=${range}&includePrePost=true`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (price-alerts-bot)' }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    if (!res) return null;
    const q = res.indicators?.quote?.[0] || {};
    const closes = q.close || [];
    const opens = q.open || [];
    const ts = res.timestamp || [];
    let lastBar = null, lastBarTs = null;
    for (let i = closes.length - 1; i >= 0; i--) {
      if (closes[i] != null) { lastBar = closes[i]; lastBarTs = Number.isFinite(ts[i]) ? ts[i] * 1000 : null; break; }
    }
    if (crypto) {
      if (lastBar == null) lastBar = res.meta?.regularMarketPrice ?? null;
      if (lastBar == null) return null;
      const dayStart = Math.floor(Date.now() / 86400000) * 86400;
      let prev = null;
      for (let i = 0; i < ts.length; i++) if (ts[i] >= dayStart && opens[i] != null) { prev = opens[i]; break; }
      if (prev == null) prev = res.meta?.chartPreviousClose ?? null;
      return { last: lastBar, prev };
    }
    const isEU = /\./.test(ySym);
    const ses = isEU ? 'rth' : PD.usSessionEt();
    if (lastBar == null && ses === 'pre') { lastBar = res.meta?.preMarketPrice ?? null; lastBarTs = null; }
    if (lastBar == null && ses === 'after') { lastBar = res.meta?.postMarketPrice ?? null; lastBarTs = null; }
    if (lastBar == null) { lastBar = res.meta?.regularMarketPrice ?? null; lastBarTs = null; }
    // lastBarTs: la open, meta Yahoo stă pe close-ul de IERI — fără ora barei, botul
    // trimitea pe Telegram prețul de ieri ca și cum ar fi de azi (aceeași cauză ca în pagină).
    const out = PD.yahooQuote(res.meta || {}, lastBar, ses, isEU, lastBarTs);
    if (!out || !Number.isFinite(out.last)) return null;
    return { last: out.last, prev: out.prev };
  } catch (e) { return null; }
}

const tgEsc = s => String(s ?? '').replace(/[&<>]/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[m]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function sendTelegram(html){
  if (!TOKEN || !CHAT) { console.log('⚠ TELEGRAM_TOKEN/TELEGRAM_CHAT_ID lipsesc din secrets — mesaj nesent:\n' + html); return { ok: false, err: 'secrets lipsesc' }; }
  const post = (text, parseMode) => fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT, text, parse_mode: parseMode || undefined, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10000)
  });
  let lastErr = '';
  for (let i = 0; i < 3; i++) {
    try {
      const r = await post(html, 'HTML');
      if (r.ok) { console.log('Telegram OK'); return { ok: true, err: null }; }
      lastErr = 'HTTP ' + r.status + ': ' + (await r.text()).slice(0, 240);
      console.log('⚠ Telegram ' + lastErr);
      // HTML invalid (notă/simbol) → o dată ca text simplu
      if (r.status === 400 && i === 0) {
        const plain = String(html).replace(/<[^>]+>/g, '');
        const r2 = await post(plain, undefined);
        if (r2.ok) { console.log('Telegram OK (plain fallback)'); return { ok: true, err: null }; }
        lastErr = 'HTTP ' + r2.status + ' plain: ' + (await r2.text()).slice(0, 240);
      }
      await sleep(r.status === 429 ? 1600 : 700);
    } catch (e) {
      lastErr = e.message || String(e);
      console.log('⚠ Telegram: ' + lastErr);
      await sleep(700);
    }
  }
  return { ok: false, err: lastErr || 'send failed' };
}

// Equity drift alert (I-074) — armed via Hub Review → commit tools/equity-drift.json
try {
  const driftCfg = JSON.parse(readFileSync(new URL('./equity-drift.json', import.meta.url), 'utf8'));
  if (driftCfg && driftCfg.armed && driftCfg.driftPct != null && Math.abs(driftCfg.driftPct) >= 2) {
    const age = driftCfg.snapshotAgeDays != null ? driftCfg.snapshotAgeDays + 'z' : '?';
    await sendTelegram(`⚖️ <b>Equity drift</b>\nSim: <b>$${Number(driftCfg.simulated || 0).toFixed(0)}</b> vs snapshot: <b>$${Number(driftCfg.snapshotEquity || 0).toFixed(0)}</b>\nΔ <b>${driftCfg.driftPct >= 0 ? '+' : ''}${Number(driftCfg.driftPct).toFixed(1)}%</b> · snapshot ${age}`);
    driftCfg.armed = false;
    writeFileSync(new URL('./equity-drift.json', import.meta.url), JSON.stringify(driftCfg, null, 2) + '\n', 'utf8');
    console.log('Equity drift alert trimis.');
  }
} catch (e) { /* opțional */ }

// Capital risk alert (I-107) — armed via Hub Review → commit tools/capital-risk.json
try {
  const riskCfg = JSON.parse(readFileSync(new URL('./capital-risk.json', import.meta.url), 'utf8'));
  if (riskCfg && riskCfg.armed && riskCfg.riskPct != null && riskCfg.riskPct >= 4) {
    const top = Array.isArray(riskCfg.topRisk) ? riskCfg.topRisk.slice(0, 3).map(t => t.sym + ' $' + Number(t.risk || 0).toFixed(0)).join(' · ') : '';
    await sendTelegram(`🛡️ <b>Risc agregat ≥4%</b>\nRisc @SL: <b>$${Number(riskCfg.riskUsd || 0).toFixed(0)}</b> · <b>${Number(riskCfg.riskPct).toFixed(1)}%</b> cont\n${riskCfg.openCount != null ? riskCfg.openCount + ' poz open' : ''}${top ? '\n' + top : ''}${riskCfg.verdict === 'HALTED' ? '\n🛑 Desk HALTED' : ''}`);
    riskCfg.armed = false;
    writeFileSync(new URL('./capital-risk.json', import.meta.url), JSON.stringify(riskCfg, null, 2) + '\n', 'utf8');
    console.log('Capital risk alert trimis.');
  }
} catch (e) { /* opțional */ }

// Hub stale morning digest (I-160) — 1×/zi 07-09 ET, din fișiere repo + items opțional
try {
  const DIGEST_FILE = new URL('./hub-stale-digest.json', import.meta.url);
  const etDayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const etHour = () => parseInt(new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }), 10);
  let dig = { enabled: true, lastSent: null, items: [] };
  try { dig = JSON.parse(readFileSync(DIGEST_FILE, 'utf8')); } catch (e) {}
  if (dig.enabled !== false && etHour() >= 7 && etHour() <= 9 && dig.lastSent !== etDayKey()) {
    const lines = [];
    try {
      const drift = JSON.parse(readFileSync(new URL('./equity-drift.json', import.meta.url), 'utf8'));
      if (drift && drift.snapshotAgeDays != null && drift.snapshotAgeDays > 7)
        lines.push('Equity snapshot ' + drift.snapshotAgeDays + 'z' + (drift.driftPct != null ? ' · drift ' + Number(drift.driftPct).toFixed(1) + '%' : ''));
      else if (drift && drift.driftPct != null && Math.abs(drift.driftPct) >= 2)
        lines.push('Equity drift ' + (drift.driftPct >= 0 ? '+' : '') + Number(drift.driftPct).toFixed(1) + '%');
    } catch (e) {}
    try {
      const risk = JSON.parse(readFileSync(new URL('./capital-risk.json', import.meta.url), 'utf8'));
      if (risk && risk.riskPct != null && risk.riskPct >= 2)
        lines.push('Risc agregat ' + Number(risk.riskPct).toFixed(1) + '%' + (risk.verdict === 'HALTED' ? ' · Desk HALTED' : ''));
    } catch (e) {}
    if (Array.isArray(dig.items)) {
      dig.items.forEach(it => { if (it && it.label) lines.push(it.label); });
    }
    if (lines.length) {
      const ok = (await sendTelegram('☀️ <b>Hub morning digest</b>\n' + lines.map(l => '• ' + tgEsc(l)).join('\n'))).ok;
      if (ok) {
        dig.lastSent = etDayKey();
        writeFileSync(DIGEST_FILE, JSON.stringify(dig, null, 2) + '\n', 'utf8');
        console.log('Hub morning digest trimis.');
      }
    }
  }
} catch (e) { /* opțional */ }

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
const changes = {};   // variația zilei % per simbol (din chartPreviousClose)
for (const sym of uniq){
  const q = await fetchPrice(sym);
  prices[sym] = q?.last ?? null;
  if (q?.prev > 0 && q?.last != null) changes[sym] = (q.last - q.prev) / q.prev * 100;
  await new Promise(r => setTimeout(r, 300)); // menajează Yahoo
}
console.log('Prețuri:', JSON.stringify(prices));
// Heartbeat diagnostic: fă vizibile eșecurile tăcute (Yahoo gol / baseline lipsă) în Actions log.
{
  const nPrice = Object.values(prices).filter(v => v == null).length;
  const nPrev = uniq.filter(s => changes[s] == null).length;
  console.log(`Heartbeat: ${uniq.length} simboluri · ${nPrice} fără preț · ${nPrev} fără variația zilei`);
}

const fired = [];
let changed = false;
const kept = [];
for (const a of alerts){
  const sym = String(a.symbol || '').toUpperCase();
  const p = prices[sym];
  if (p == null){ kept.push(a); continue; }
  // ── Snooze: alertă amânată — o sărim cât timp nu a expirat; la expirare se trezește ──
  if (a.snoozeUntil){
    if (Date.now() < Number(a.snoozeUntil)){ kept.push(a); continue; }
    delete a.snoozeUntil; changed = true;
  }
  // ── Alertă REFERINȚĂ (preț de creare = 0%: pas cumulat ±pct% sus/jos + water-marks) ──
  if (a.kind === 'ref'){
    const pct = Number(a.pct);
    if (!(pct > 0)){ kept.push(a); continue; }
    if (a.trail){
      // Trailing: referința urmează vârful; alertă când prețul scade ≥pct% din maximul atins.
      if (a.base == null){ a.base = +p.toFixed(4); a.peak = +p.toFixed(4); a.trailFired = false; changed = true; kept.push(a); continue; }
      if (a.peak == null) a.peak = a.base;
      if (p > a.peak){ a.peak = +p.toFixed(4); a.trailFired = false; changed = true; }   // nou vârf → re-armăm
      const dd = (a.peak - p) / a.peak * 100;
      if (!a.trailFired && dd >= pct){
        fired.push({ sym, kind:'ref', trail:true, pct, base: a.base, peak: a.peak, dd, price: p, note: a.note || '' });
        a.trailFired = true; changed = true;
      }
      kept.push(a);
      continue;
    }
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
  // ── Alertă VARIAȚIA ZILEI ±% (bidirecțional, față de închiderea de ieri) ──
  if (a.kind === 'day'){
    const pct = Number(a.pct);
    if (!(pct > 0)){ kept.push(a); continue; }
    const dc = changes[sym];
    if (dc == null){ kept.push(a); continue; }                 // n-avem variația zilei
    const armed = a.armed !== false;
    if (armed && Math.abs(dc) >= pct){
      fired.push({ sym, kind:'day', pct, dc, price: p, note: a.note || '', rearm: !!a.rearm });
      changed = true;
      if (a.rearm){ a.armed = false; kept.push(a); }            // re-arm → dezarmat, rămâne
      // one-shot → dispare
    } else if (!armed && a.rearm){
      if (Math.abs(dc) < pct * 0.9){ a.armed = true; changed = true; }   // re-arm când variația revine sub prag
      kept.push(a);
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
      ? (f.trail
        ? ({ symbol: f.sym, kind: 'ref', trail: true, pct: f.pct, base: +Number(f.base).toFixed(4), peak: +Number(f.peak).toFixed(4), dd: +f.dd.toFixed(2), moved: +(-f.dd).toFixed(2), dir: 'below', price: +f.price.toFixed(4), note: f.note, at: new Date().toISOString() })
        : ({ symbol: f.sym, kind: 'ref', pct: f.pct, base: +Number(f.base).toFixed(4), moved: +f.moved.toFixed(2), step: f.step, dir: f.moved >= 0 ? 'above' : 'below', price: +f.price.toFixed(4), note: f.note, at: new Date().toISOString() }))
      : f.kind === 'anchor'
      ? ({ symbol: f.sym, kind: 'anchor', sub: f.sub, pct: f.pct, base: +Number(f.base).toFixed(4), target: f.target != null ? +Number(f.target).toFixed(4) : null, stop: f.stop != null ? +Number(f.stop).toFixed(4) : null, moved: +f.moved.toFixed(2), prog: f.prog != null ? +f.prog.toFixed(0) : undefined, dir: f.sub === 'stop' ? 'below' : (f.sub === 'step' ? (f.moved >= 0 ? 'above' : 'below') : 'above'), price: +f.price.toFixed(4), note: f.note, rearm: f.rearm, at: new Date().toISOString() })
      : f.kind === 'pct'
      ? ({ symbol: f.sym, kind: 'pct', pct: f.pct, base: +Number(f.base).toFixed(4), moved: +f.moved.toFixed(2), dir: f.moved >= 0 ? 'above' : 'below', price: +f.price.toFixed(4), note: f.note, rearm: f.rearm, at: new Date().toISOString() })
      : f.kind === 'day'
      ? ({ symbol: f.sym, kind: 'day', pct: f.pct, dc: +f.dc.toFixed(2), moved: +f.dc.toFixed(2), dir: f.dc >= 0 ? 'above' : 'below', price: +f.price.toFixed(4), note: f.note, rearm: f.rearm, at: new Date().toISOString() })
      : ({ symbol: f.sym, level: f.lvl, dir: f.dir, price: +f.price.toFixed(4), note: f.note, rearm: f.rearm, at: new Date().toISOString() })),
    ...(Array.isArray(cfg.triggered) ? cfg.triggered : [])
  ].slice(0, 50);
  const lines = fired.map(f => f.kind === 'ref'
    ? (f.trail
      ? `📉 <b>${tgEsc(f.sym)}</b> TRAILING −${f.dd.toFixed(2)}% din vârf $${Number(f.peak).toFixed(dec(f.sym))} → $${f.price.toFixed(dec(f.sym))}${f.note ? ' · ' + tgEsc(f.note) : ''}`
      : `📊 <b>${tgEsc(f.sym)}</b> ${f.moved >= 0 ? '▲' : '▼'} ${f.moved >= 0 ? '+' : ''}${f.moved.toFixed(2)}% (pas ${f.step > 0 ? '+' : ''}${f.step}×${f.pct}%) → $${f.price.toFixed(dec(f.sym))} (de la $${Number(f.base).toFixed(dec(f.sym))})${f.note ? ' · ' + tgEsc(f.note) : ''}`)
    : f.kind === 'anchor'
    ? (f.sub === 'target' ? `🎯 <b>${tgEsc(f.sym)}</b> ȚINTĂ $${Number(f.target).toFixed(dec(f.sym))} atinsă → $${f.price.toFixed(dec(f.sym))} (${f.moved >= 0 ? '+' : ''}${f.moved.toFixed(2)}% de la $${Number(f.base).toFixed(dec(f.sym))})${f.note ? ' · ' + tgEsc(f.note) : ''}`
      : f.sub === 'near' ? `🔔 <b>${tgEsc(f.sym)}</b> ${Number(f.prog).toFixed(0)}% spre țintă $${Number(f.target).toFixed(dec(f.sym))} → $${f.price.toFixed(dec(f.sym))}`
      : f.sub === 'stop' ? `🛑 <b>${tgEsc(f.sym)}</b> STOP $${Number(f.stop).toFixed(dec(f.sym))} atins → $${f.price.toFixed(dec(f.sym))}${f.note ? ' · ' + tgEsc(f.note) : ''}`
      : `🪜 <b>${tgEsc(f.sym)}</b> ${f.moved >= 0 ? '+' : ''}${f.moved.toFixed(2)}% (pas ${f.step}×${f.pct}%) → $${f.price.toFixed(dec(f.sym))} (de la $${Number(f.base).toFixed(dec(f.sym))})`)
    : f.kind === 'pct'
    ? `${f.moved >= 0 ? '▲' : '▼'} <b>${tgEsc(f.sym)}</b> ${f.moved >= 0 ? '+' : ''}${f.moved.toFixed(2)}% → $${f.price.toFixed(dec(f.sym))} (de la $${Number(f.base).toFixed(dec(f.sym))})${f.rearm ? ' (re-arm)' : ''}${f.note ? ' · ' + tgEsc(f.note) : ''}`
    : f.kind === 'day'
    ? `📅 <b>${tgEsc(f.sym)}</b> variația zilei ${f.dc >= 0 ? '▲' : '▼'} ${f.dc >= 0 ? '+' : ''}${f.dc.toFixed(2)}% (prag ±${f.pct}%) → $${f.price.toFixed(dec(f.sym))}${f.rearm ? ' (re-arm)' : ''}${f.note ? ' · ' + tgEsc(f.note) : ''}`
    : `${f.dir === 'below' ? '▼' : '▲'} <b>${tgEsc(f.sym)}</b> $${f.price.toFixed(dec(f.sym))} — prag $${Number(f.lvl).toFixed(dec(f.sym))}${f.rearm ? ' (re-arm)' : ''}${f.note ? ' · ' + tgEsc(f.note) : ''}`);
  const tg = await sendTelegram(`🔔 <b>Price Alert (server-side · ${fired.length})</b>\n${lines.join('\n')}`);
  cfg._bot = {
    lastCheck: new Date().toISOString(),
    lastFire: new Date().toISOString(),
    lastTelegramOk: !!tg.ok,
    lastTelegramErr: tg.ok ? null : (tg.err || 'send failed'),
    firedThisRun: fired.length,
    symbols: uniq.length
  };
  changed = true;
  if (!tg.ok) console.log('⚠ Telegram FAILED after retries — alerta e în triggered, pagina o arată pe ☁️.');
  console.log(`🔔 ${fired.length} alerte declanșate · Telegram ${tg.ok ? 'OK' : 'FAIL'}.`);
} else {
  console.log('Niciun prag atins.');
}

if (changed){
  cfg.alerts = kept;
  if (!cfg._bot) {
    cfg._bot = { lastCheck: new Date().toISOString(), lastFire: null, lastTelegramOk: null, lastTelegramErr: null, firedThisRun: 0, symbols: uniq.length };
  } else if (!fired.length) {
    cfg._bot.lastCheck = new Date().toISOString();
    cfg._bot.symbols = uniq.length;
    cfg._bot.firedThisRun = 0;
  }
  writeFileSync(FILE, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  console.log('Stare actualizată în tools/alerts.json (workflow-ul o comite înapoi).');
}
