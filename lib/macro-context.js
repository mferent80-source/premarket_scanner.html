// macro-context.js — citire read-only cache Macro + calendar hardcodat 2026 (MCTX.*)
(function(global){
  'use strict';

  const REGIME_TTL_MS = 6 * 3600000;

  function todayET(){
    try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }

  function etWall(dateStr, hm){
    for (const off of ['-04:00', '-05:00']){
      const d = new Date(`${dateStr}T${hm}:00${off}`);
      try {
        const p = new Intl.DateTimeFormat('en-GB', { timeZone:'America/New_York', hour:'2-digit', minute:'2-digit', hour12:false }).format(d);
        if (p === hm) return d;
      } catch (e) {}
    }
    return new Date(`${dateStr}T${hm}:00-04:00`);
  }

  // ultima dată REALĂ din calendarele hardcodate — după ea, „fără evenimente"
  // ar fi fals liniștitor; consumatorii verifică calendarExpired()
  const CAL_LAST_DATE = '2026-12-16';
  function calendarExpired(){ return todayET() > CAL_LAST_DATE; }

  function hardcodedEvents(){
    const out = [];
    // approx=true = dată DERIVATĂ aritmetic (nu citită dintr-un calendar real);
    // UI-urile o afișează cu „~" ca să nu prezinte estimarea drept fapt
    const push = (dateStr, hm, event, impact, approx) => out.push({ d: etWall(dateStr, hm), hm, event, impact, approx: !!approx });
    ['2026-01-28','2026-03-18','2026-04-29','2026-06-17','2026-07-29','2026-09-16','2026-11-04','2026-12-16'].forEach(ds => {
      push(ds, '14:00', 'FOMC Rate Decision', 'high');
      push(ds, '14:30', 'FOMC Press Conference', 'high');
    });
    ['2026-01-09','2026-02-06','2026-03-06','2026-04-03','2026-05-08','2026-06-05','2026-07-02','2026-08-07','2026-09-04','2026-10-02','2026-11-06','2026-12-04']
      .forEach(ds => push(ds, '08:30', 'Non-Farm Payrolls + Unemployment Rate', 'high'));
    const CPI_2026 = ['2026-01-13','2026-02-11','2026-03-11','2026-04-10','2026-05-12','2026-06-10','2026-07-14','2026-08-12','2026-09-11','2026-10-14','2026-11-10','2026-12-10'];
    CPI_2026.forEach(ds => push(ds, '08:30', 'CPI YoY + Core CPI', 'high'));
    const base = new Date(todayET() + 'T00:00:00Z');
    const iso = d => d.toISOString().slice(0, 10);
    const skipWE = d => { while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1); return d; };
    CPI_2026.forEach(ds => {
      const ppi = skipWE(new Date(new Date(ds + 'T00:00:00Z').getTime() + 86400000));
      push(iso(ppi), '08:30', 'PPI YoY', 'med', true);
    });
    for (let m = 0; m < 2; m++){
      const month = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + m, 1));
      const d = new Date(month);
      while (d.getUTCMonth() === month.getUTCMonth()){
        if (d.getUTCDay() === 4) push(iso(d), '08:30', 'Initial Jobless Claims', 'med');
        d.setUTCDate(d.getUTCDate() + 1);
      }
      const retail = skipWE(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 15)));
      push(iso(retail), '08:30', 'Retail Sales MoM', 'med', true);
      const ism = skipWE(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1)));
      push(iso(ism), '10:00', 'ISM Manufacturing PMI', 'med', true);
    }
    return out;
  }

  function etDateOf(dt){
    try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(dt); }
    catch (e) { return ''; }
  }

  function regimeColor(label){
    const l = String(label || '');
    if (/RISK-ON|LEAN/.test(l)) return '#22d66b';
    if (/NEUTRAL/.test(l)) return '#f0f4fa';
    if (/CAUTIOUS/.test(l)) return '#d4892c';
    if (/RISK-OFF|STRESS/.test(l)) return '#ff4d4d';
    return '#a3adc1';
  }

  function regimeEmoji(label){
    const l = String(label || '');
    if (/RISK-ON|LEAN/.test(l)) return '🟢';
    if (/NEUTRAL/.test(l)) return '⚪';
    if (/CAUTIOUS/.test(l)) return '🟠';
    if (/RISK-OFF|STRESS/.test(l)) return '🔴';
    return '⚪';
  }

  function dangerBand(score){
    if (typeof score !== 'number' || isNaN(score)) return { band: 'n/a', mult: null, color: '#a3adc1' };
    if (score >= 70) return { band: 'PERICULOS · 0.25-0.5x', mult: '0.25-0.5x', color: '#ff4d4d' };
    if (score >= 45) return { band: 'RIDICAT · 0.5x', mult: '0.5x', color: '#d4892c' };
    if (score >= 25) return { band: 'MODERAT · 0.75x', mult: '0.75x', color: '#5bb0ff' };
    return { band: 'CALM · 1x', mult: '1x', color: '#22d66b' };
  }

  function regime(){
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem('md_risk_regime') || 'null'); } catch (e) {}
    if (!raw || !raw.label){
      return { label: null, composite: null, ts: null, stale: true, streak: 0, fresh: false };
    }
    const ts = raw.ts || 0;
    const ageStale = !ts || (Date.now() - ts > REGIME_TTL_MS);
    let streak = 0;
    try {
      const rh = JSON.parse(localStorage.getItem('md_regime_daily') || '[]');
      const lbl = String(raw.label).trim();
      if (Array.isArray(rh)){
        for (let i = rh.length - 1; i >= 0; i--){
          if (rh[i] && rh[i].label === lbl) streak++;
          else break;
        }
      }
    } catch (e) {}
    return {
      label: String(raw.label).trim(),
      composite: typeof raw.composite === 'number' ? raw.composite : null,
      ts,
      stale: ageStale,
      streak,
      fresh: !ageStale
    };
  }

  function danger(){
    const today = todayET();
    let h = [];
    try { h = JSON.parse(localStorage.getItem('md_danger_daily') || '[]'); } catch (e) {}
    if (!Array.isArray(h) || !h.length){
      return { score: null, band: 'n/a', mult: null, dateET: null, stale: true, fresh: false, color: '#a3adc1' };
    }
    const last = h[h.length - 1];
    const score = typeof last.score === 'number' ? last.score : null;
    const dateET = last.dateET ? String(last.dateET) : null;
    const stale = !dateET || dateET !== today;
    const b = dangerBand(score);
    return {
      score,
      band: b.band,
      mult: b.mult,
      dateET,
      stale,
      fresh: !stale && score != null,
      color: b.color
    };
  }

  function eventsUpcoming(opts){
    const limit = (opts && opts.limit) || 10;
    const now = Date.now();
    const winPast = (opts && opts.winPastMs) != null ? opts.winPastMs : 30 * 60000;
    const winFuture = (opts && opts.winFutureMs) != null ? opts.winFutureMs : 26 * 3600000;
    return hardcodedEvents()
      .filter(e => e.d.getTime() > now - winPast && e.d.getTime() < now + winFuture)
      .sort((a, b) => a.d - b.d)
      .slice(0, limit)
      .map(e => ({
        d: e.d,
        hm: e.hm,
        event: e.event,
        impact: e.impact,
        approx: !!e.approx,
        tilMs: e.d.getTime() - now,
        roTime: e.d.toLocaleTimeString('ro-RO', { hour:'2-digit', minute:'2-digit' })
      }));
  }

  function eventsTodayHigh(){
    const today = todayET();
    return hardcodedEvents()
      .filter(e => e.impact === 'high' && etDateOf(e.d) === today)
      .sort((a, b) => a.d - b.d)
      .map(e => ({
        d: e.d,
        hm: e.hm,
        event: e.event,
        impact: e.impact,
        approx: !!e.approx,
        tilMs: e.d.getTime() - Date.now(),
        roTime: e.d.toLocaleTimeString('ro-RO', { hour:'2-digit', minute:'2-digit' })
      }));
  }

  function actionLine(){
    const highToday = eventsTodayHigh();
    const phrases = [];
    let sizing = null;
    let noEntryWindow = null;
    const snap = hubSnapshot();
    let mult = null, sizingStale = false, sizingDate = null;
    if (snap && !snap.stale && snap.danger && snap.danger.mult) mult = snap.danger.mult;
    if (!mult){
      const dng = danger();
      mult = dng.mult;
      // fallback-ul cade FIX cand snapshot-ul e vechi (>6h, ex. luni dimineata)
      // — sizing-ul din danger-ul de ieri nu se prezinta ca al zilei fara marcaj
      if (mult && dng.stale){ sizingStale = true; sizingDate = dng.dateET; }
    }
    if (mult) sizing = mult;
    if (mult) phrases.push('sizing ' + mult + (sizingStale ? ' (📦 din ' + (sizingDate || '?') + ')' : ''));

    if (highToday.length){
      const e0 = highToday[0];
      noEntryWindow = e0.roTime;
      phrases.push('fără intrări noi ±15min de ' + e0.roTime + ' RO');
    }

    return { sizing, sizingStale, sizingDate, noEntryWindow, phrases, highToday };
  }

  function marketTone(){
    let m = null;
    try { m = global.__hubMkt; } catch (e) {}
    if (!m || !m.quotes) return null;
    const spy = m.quotes.SPY, qqq = m.quotes.QQQ, vix = m.quotes.VIX;
    // filter(Boolean) lăsa să treacă quotes fără chgPct → „Piață plată NaN%"
    const pair = [spy, qqq].filter(q => q && Number.isFinite(q.chgPct));
    if (!pair.length) return null;
    const avg = pair.reduce((s, q) => s + q.chgPct, 0) / pair.length;
    const vixStr = vix && typeof vix.chgPct === 'number' ? ` · VIX ${vix.chgPct >= 0 ? '+' : ''}${vix.chgPct.toFixed(1)}%` : '';
    if (avg >= 0.35) return { tone: `Piață +${avg.toFixed(2)}%${vixStr}`, cls: 'up' };
    if (avg <= -0.35) return { tone: `Piață ${avg.toFixed(2)}%${vixStr}`, cls: 'down' };
    return { tone: `Piață plată ${avg >= 0 ? '+' : ''}${avg.toFixed(2)}%${vixStr}`, cls: 'flat' };
  }

  function isFresh(){
    return regime().fresh && danger().fresh;
  }

  const HUB_SNAP_TTL_MS = 6 * 3600000;

  function hubSnapshot(){
    let s = null;
    try { s = JSON.parse(localStorage.getItem('md_hub_macro_v1') || 'null'); } catch (e) {}
    if (!s || !s.ts) return null;
    const age = Date.now() - s.ts;
    return { ...s, stale: age > HUB_SNAP_TTL_MS, ageMin: Math.round(age / 60000) };
  }

  global.MCTX = {
    todayET,
    etWall,
    hardcodedEvents,
    calendarExpired,
    CAL_LAST_DATE,
    regimeColor,
    regimeEmoji,
    dangerBand,
    regime,
    danger,
    eventsUpcoming,
    eventsTodayHigh,
    actionLine,
    marketTone,
    isFresh,
    hubSnapshot
  };
})(typeof window !== 'undefined' ? window : global);