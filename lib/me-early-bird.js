// me-early-bird.js — early-bird daily structure (MEB.*)
// Extras din market-events (I-201). Pure: computeEarlyBird pe hist OHLCV daily.
// Globals de compat: computeEarlyBird, _ebSignalText, _ebSparkSvg, _etDateStr, EB_*
(function(global){
  'use strict';

  const EB_EXPIRY = { pct: 4, days: 7 };
  const EB_RAN_PCT = 3;
  const EB_RUN_FROM_LOW_PCT = 3;

function _ema(arr, period){
  const out = new Array(arr.length).fill(null);
  if (arr.length < period) return out;
  const k = 2 / (period + 1);
  let ema = arr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = ema;
  for (let i = period; i < arr.length; i++){
    ema = arr[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}
function _rsi(closes, period = 14){
  const out = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++){
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgG = gain / period, avgL = loss / period;
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < closes.length; i++){
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + (d > 0 ? d : 0)) / period;
    avgL = (avgL * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}
// Data calendaristică + minutele zilei în fusul ET — pentru proiecția volumului intraday
function _etDateStr(ms){
  try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(ms)); }
  catch(e){ return new Date(ms).toISOString().slice(0, 10); }
}
function _etMinutes(){
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', hour:'2-digit', minute:'2-digit', hour12:false }).formatToParts(new Date());
    const g = t => +(p.find(x => x.type === t) || {}).value;
    return g('hour') * 60 + g('minute');
  } catch(e){ return null; }
}
function computeEarlyBird(hist, antiExtPct, anchor){
  const c = hist.closes, v = hist.vols, lo = hist.lows;
  const n = c.length;
  if (n < 22) return null;
  const ema9 = _ema(c, 9), ema21 = _ema(c, 21), rsi = _rsi(c, 14);
  const last = n - 1;
  const price = c[last], e21 = ema21[last];
  if (e21 == null) return null;

  // 🔒 GARDĂ HARD anti-extins: peste EMA21 dar nu mai mult de antiExtPct%
  const extPct = (price - e21) / e21 * 100;
  const antiExt = extPct <= antiExtPct && price >= e21 * 0.97;

  // ====== REDESIGN „early = ÎNCEPUT de drum" (cerere Marius 2026-06-12) ======
  // Vechiul 🌱 se aprindea pe cross-uri EMA/RSI — confirmări care vin INERENT cu
  // +3-5% în spate („tot ce semnalizează au deja 4-5%"). Acum:
  //   🌱 EARLY     = fostul Forming cu verificări de rigoare: preț încă lipit de EMA21,
  //                  după un pullback REAL, RSI care abia urcă, cross neformat sau abia
  //                  format, scăderea oprită. SINGURUL tier cu alerte + ancoră + ledger.
  //   🌳 CONFIRMAT = vechiul „early" (cross-urile au avut loc) — vizual, fără alerte:
  //                  validare pentru un 🌱 anterior, NU intrare early.

  // Context obligatoriu: a existat pullback/downtrend REAL în ultimele 10 zile — fără
  // el, orice consolidare dintr-un uptrend matur ar semnaliza fals „început de drum".
  let wasDown = false;
  for (let i = Math.max(0, last - 9); i <= last; i++){
    if ((ema21[i] != null && c[i] < ema21[i])
     || (ema9[i] != null && ema21[i] != null && ema9[i] < ema21[i])) { wasDown = true; break; }
  }

  // Cross-uri — folosite DOAR pentru tier-ul 🌳 Confirmat
  let freshCross = false; // EMA9 a tăiat peste EMA21 în ultimele 3 zile
  for (let i = Math.max(1, last - 2); i <= last; i++){
    if (ema9[i-1] != null && ema21[i-1] != null && ema9[i] != null && ema21[i] != null
        && ema9[i-1] <= ema21[i-1] && ema9[i] > ema21[i]) { freshCross = true; break; }
  }
  let rsiCross = false; // RSI tocmai a trecut peste 50
  for (let i = Math.max(1, last - 2); i <= last; i++){
    if (rsi[i-1] != null && rsi[i] != null && rsi[i-1] < 50 && rsi[i] >= 50) { rsiCross = true; break; }
  }
  let higherLow = false; // PRIMUL higher-low după o scădere (nu oricare) — cere wasDown
  if (n >= 12){
    const recentLow = Math.min(...lo.slice(n - 5));
    const priorLow  = Math.min(...lo.slice(n - 12, n - 5));
    higherLow = wasDown && recentLow > priorLow;
  }

  // Semnale de calitate (scor, nu obligatorii)
  // RVOL corect = volum azi vs media zilelor ANTERIOARE. Excludem ziua curentă (v[last]) din medie,
  // altfel o zi cu volum extrem se auto-include în numitor și RVOL iese sistematic subestimat.
  const volWin = v.slice(Math.max(0, n - 21), n - 1); // 20 zile dinainte de azi
  const avgVol20 = volWin.length ? volWin.reduce((a, b) => a + b, 0) / volWin.length : 0;
  // Bara de azi e PARȚIALĂ în sesiunea regulară → proiectează volumul liniar la
  // 390 min (cap 8×) înainte de comparații; sub 45 min de sesiune e prea zgomotos
  // (volum U-shaped la open) → azi nu se evaluează deloc. Altfel RVOL ieșea
  // subestimat dimineața și volConfirm rata confirmarea (fix paralel cu
  // watchlist-monitor v126).
  const lastBarIsToday = hist.lastBarTs != null && _etDateStr(hist.lastBarTs * 1000) === _etDateStr(Date.now());
  let vLast = v[last], vLastValid = true, rvolProj = false;
  if (lastBarIsToday){
    const mins = _etMinutes();
    if (mins != null && mins >= 9 * 60 + 30 && mins < 16 * 60){
      const elapsed = mins - (9 * 60 + 30);
      if (elapsed < 45) vLastValid = false;
      else { vLast = v[last] * Math.min(8, 390 / elapsed); rvolProj = true; }
    }
  }
  let volConfirm = false; // volum pe o zi verde recentă > media 20z
  for (let i = last; i >= Math.max(1, last - 2); i--){
    if (i === last && !vLastValid) continue; // azi prea devreme — nu evalua bara parțială
    const vi = i === last ? vLast : v[i];
    if (c[i] > c[i-1] && avgVol20 > 0 && vi > avgVol20 * 1.1) { volConfirm = true; break; }
  }
  const rsiNow = rsi[last];

  // 🥀 INVALIDARE — calculată ÎNAINTE de tiers (early-ul nou o folosește ca veto)
  let freshCrossDown = false; // EMA9 a tăiat SUB EMA21 în ultimele 3 zile
  for (let i = Math.max(1, last - 2); i <= last; i++){
    if (ema9[i-1] != null && ema21[i-1] != null && ema9[i] != null && ema21[i] != null
        && ema9[i-1] >= ema21[i-1] && ema9[i] < ema21[i]) { freshCrossDown = true; break; }
  }
  let brokeLow = false; // a rupt sub minimul ultimelor 10 zile (fără ziua curentă)
  if (n >= 12) brokeLow = price < Math.min(...lo.slice(n - 11, n - 1));

  // 🌱 EARLY — TOATE verificările obligatorii (rigoare > cantitate):
  const nearEma   = extPct >= -3 && extPct <= 2.5;                        // lipit de EMA21 (ușor sub = baza)
  const rsiBand   = rsiNow != null && rsiNow >= 40 && rsiNow <= 57;       // întors din slăbiciune, nu deja fierbinte
  const rsiRising = rsiNow != null && rsi[last - 3] != null && rsiNow > rsi[last - 3];
  const preOrFreshCross = ema9[last] != null && ema9[last] <= e21 * 1.01; // cross neformat sau ABIA format
  const stabilized = higherLow || (n >= 3 && c[last] > c[last - 1] && c[last - 1] > c[last - 2]); // scăderea s-a OPRIT (anti-falling-knife)
  const volWake = volConfirm || (vLastValid && avgVol20 > 0 && vLast > avgVol20 * 1.2);
  const earlyBase = wasDown && nearEma && rsiBand && rsiRising && preOrFreshCross && stabilized
                && !freshCrossDown && !brokeLow;

  // VETO „a fugit": Δzi pe bara de azi SAU urcare consumată de la minimul 5z — mișcarea
  // pe care voiai s-o prinzi s-a făcut deja; HARD veto pe early (nu doar pe alerte).
  let ranToday = null;
  if (lastBarIsToday && n >= 2 && c[last-1] > 0){
    const dayChg = (c[last] - c[last-1]) / c[last-1] * 100;
    if (dayChg > EB_RAN_PCT) ranToday = dayChg;
  }
  const lo5 = n >= 5 ? Math.min(...lo.slice(n - 5)) : null;
  const riseFromLow = (lo5 && lo5 > 0) ? (price - lo5) / lo5 * 100 : null;
  const ranVeto = ranToday != null || (riseFromLow != null && riseFromLow >= EB_RUN_FROM_LOW_PCT);

  let isEarly = earlyBase && !ranVeto;

  // P2: expirare ancorată pe PRIMUL semnal — early-ul nu rămâne aprins pe climb-uri lente
  let expired = false, sincePct = null, ageDays = null;
  if (anchor && anchor.p > 0){
    sincePct = (price - anchor.p) / anchor.p * 100;
    ageDays = Math.floor((Date.now() - anchor.t) / 86400000);
    if (isEarly && (sincePct > EB_EXPIRY.pct || ageDays > EB_EXPIRY.days)){ isEarly = false; expired = true; }
  }

  // 🏃 „ar fi early, dar a fugit" — badge separat, vizibil în Toate, EXCLUS din filtrul
  // Early; pe o zi calmă (fără veto) redevine candidat 🌱 normal.
  const isRanBlocked = earlyBase && ranVeto && !expired;

  // 🌳 CONFIRMAT — vechiul „early": cross-urile au avut loc, mișcarea e deja pornită.
  // Vizual (validează un 🌱 anterior sau arată ce ai ratat), fără alerte/ancoră/ledger.
  const isConfirmed = !isEarly && !isRanBlocked && !expired
    && antiExt
    && (freshCross || rsiCross || higherLow)
    && !freshCrossDown && !brokeLow;

  const signals = { nearEma, stabilized, higherLow, rsiRising, volWake, preCross: preOrFreshCross };
  // Scor de CALITATE al early-ului (0-5) — diferențiază între early-uri, nu numără trigger-e:
  const score = [
    higherLow,                                                            // structura cea mai solidă de întoarcere
    volWake,                                                              // volumul se trezește
    rsiNow != null && rsi[last - 3] != null && rsiNow - rsi[last - 3] >= 3, // momentum RSI real, nu drift
    Math.abs(extPct) <= 1.5,                                              // chiar lipit de medie — entry-ul cel mai bun
    rsiNow != null && rsiNow >= 44 && rsiNow <= 54                        // mijlocul benzii = loc maxim de drum în sus
  ].filter(Boolean).length;

  const isWilting = !isEarly && (freshCrossDown || brokeLow);
  const wiltReason = [freshCrossDown ? 'EMA9 a recăzut sub EMA21' : '', brokeLow ? 'a rupt minimul ultimelor 10z' : ''].filter(Boolean).join(' · ');

  // RVOL = volum azi vs media 20z (pentru badge dedicat — confirmă mișcarea reală)
  const rvol = (avgVol20 > 0 && vLastValid && vLast > 0) ? (vLast / avgVol20) : null;

  return { isEarly, isConfirmed, isRanBlocked, score, signals, extPct, rsiNow, rvol, rvolProj, antiExt, isWilting, wiltReason, price, expired, sincePct, ageDays, ranToday, riseFromLow, spark: c.slice(Math.max(0, n - 20)) };
}
function _ebSignalText(eb){
  if (!eb) return '';
  const s = eb.signals, parts = [];
  if (s.nearEma)    parts.push('✓ lipit de EMA21');
  if (s.stabilized) parts.push(s.higherLow ? '✓ higher-low' : '✓ scăderea oprită (2 închideri verzi)');
  if (s.rsiRising)  parts.push('✓ RSI în urcare (' + (eb.rsiNow != null ? eb.rsiNow.toFixed(0) : '?') + ')');
  if (s.volWake)    parts.push('✓ volumul se trezește');
  if (s.preCross)   parts.push('✓ pre/abia-cross EMA9≈EMA21');
  return parts.join(' · ') + ` · ${eb.extPct >= 0 ? '+' : ''}${eb.extPct.toFixed(1)}% vs EMA21`;
}
function _ebSparkSvg(data){
  if (!data || data.length < 2) return '';
  const w = 100, h = 16;
  const min = Math.min(...data), max = Math.max(...data), rng = (max - min) || 1;
  const pts = data.map((val, i) =>
    `${(i / (data.length - 1) * w).toFixed(1)},${(h - ((val - min) / rng) * h).toFixed(1)}`).join(' ');
  const up = data[data.length - 1] >= data[0];
  const col = up ? '#22d66b' : '#ff6b6b';
  return `<svg class="eb-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.4"/></svg>`;
}

  global.MEB = {
    computeEarlyBird,
    ebSignalText: _ebSignalText,
    ebSparkSvg: _ebSparkSvg,
    etDateStr: _etDateStr,
    etMinutes: _etMinutes,
    EXPIRY: EB_EXPIRY,
    RAN_PCT: EB_RAN_PCT,
    RUN_FROM_LOW: EB_RUN_FROM_LOW_PCT,
    _ema,
    _rsi
  };
  // Compat page: aceleași nume ca înainte de extract
  global.computeEarlyBird = computeEarlyBird;
  global._ebSignalText = _ebSignalText;
  global._ebSparkSvg = _ebSparkSvg;
  global._etDateStr = _etDateStr;
  global._etMinutes = _etMinutes;
  global.EB_EXPIRY = EB_EXPIRY;
  global.EB_RAN_PCT = EB_RAN_PCT;
  global.EB_RUN_FROM_LOW_PCT = EB_RUN_FROM_LOW_PCT;
})(typeof window !== 'undefined' ? window : globalThis);
