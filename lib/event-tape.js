// event-tape.js — bandă evenimente high-impact hub (ET.*)
(function(global){
  'use strict';

  const RETAIN_MS = 12 * 3600000;
  const FUTURE_MS = 7 * 86400000;
  const IMMINENT_MS = 24 * 3600000;
  const LIVE_MS = 15 * 60000;
  const MACRO_HREF = './macro-dashboard/';
  const EARN_HREF = './earnings-hub/';
  let earnRefreshBusy = false;

  function esc(s){
    return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function etToday(){
    try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }

  function daysUntil(dateStr){
    const a = new Date(etToday() + 'T12:00:00');
    const b = new Date(String(dateStr).slice(0, 10) + 'T12:00:00');
    return Math.round((b - a) / 86400000);
  }

  function fmtDateET(d){
    try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(d); }
    catch (e) { return d.toISOString().slice(0, 10); }
  }

  function getWatchlist(){
    try {
      const a = JSON.parse(localStorage.getItem('wl_stocks') || '[]');
      return (Array.isArray(a) ? a : []).map(x => typeof x === 'string' ? x : ((x && (x.symbol || x.sym)) || '')).filter(Boolean);
    } catch (e) { return []; }
  }

  function loadSeen(){
    try { return JSON.parse(localStorage.getItem('md_seen_actual') || '{}') || {}; }
    catch (e) { return {}; }
  }

  function findSeen(seen, timeKey, event){
    // întâi match exact pe timeKey|event — două evenimente HIGH la aceeași oră
    // (FOMC 14:00 + altceva) nu trebuie să-și împartă „seen"-ul
    if (event && seen[timeKey + '|' + event] != null) return seen[timeKey + '|' + event];
    const prefix = timeKey + '|';
    for (const k of Object.keys(seen)){
      if (k.startsWith(prefix)) return seen[k];
    }
    return null;
  }

  function tilLabel(ms){
    if (ms < 0) return 'done';
    if (ms < 3600000) return Math.round(ms / 60000) + 'm';
    if (ms < 86400000) return Math.round(ms / 3600000) + 'h';
    return Math.round(ms / 86400000) + 'd';
  }

  function shortEvent(name){
    return String(name || '')
      .replace('Non-Farm Payrolls + Unemployment Rate', 'NFP')
      .replace('CPI YoY + Core CPI', 'CPI')
      .replace('FOMC Press Conference', 'FOMC conf')
      .replace('FOMC Rate Decision', 'FOMC');
  }

  function loadWlEarnItems(){
    const wl = new Set(getWatchlist().map(t => String(t).toUpperCase().split('.')[0]));
    const merged = {};
    try {
      const j = JSON.parse(localStorage.getItem('tt_jr_earnings_cal') || 'null');
      if (j?.map) Object.entries(j.map).forEach(([sym, d]) => { merged[sym.toUpperCase()] = d; });
    } catch (e) {}
    try {
      const w = JSON.parse(localStorage.getItem('wl_earnings_cache') || 'null');
      if (w?.map) Object.entries(w.map).forEach(([sym, d]) => {
        const S = sym.toUpperCase();
        if (!merged[S]) merged[S] = { date: d.date, days: daysUntil(d.date), hour: d.hour || '' };
      });
    } catch (e) {}
    const out = [];
    Object.entries(merged).forEach(([sym, d]) => {
      if (wl.size && !wl.has(sym)) return;
      if (!d || !d.date) return;
      // days se recalculeaza MEREU din data — valoarea stocata era cea de la
      // momentul fetch-ului (cache de vineri -> luni "EARN 3d" / chip lipsa
      // cand refresh-ul esua silentios)
      const days = daysUntil(d.date);
      if (!Number.isFinite(days) || days < 0 || days > 2) return;
      const t = new Date(String(d.date).slice(0, 10) + 'T12:00:00').getTime();
      out.push({
        phase: days === 0 ? 'imminent' : 'scheduled',
        t,
        event: 'EARN',
        sym,
        hm: d.hour || '',
        tilMs: Math.max(0, t - Date.now()),
        earn: true,
        days
      });
    });
    return out.sort((a, b) => a.days - b.days).slice(0, 4);
  }

  async function maybeRefreshWlEarnings(){
    if (earnRefreshBusy) return;
    const wl = getWatchlist();
    if (!wl.length) return;
    if (global.JI && JI.refreshEarningsCalendar){
      earnRefreshBusy = true;
      try { await JI.refreshEarningsCalendar(wl.map(t => String(t).toUpperCase())); } catch (e) {}
      finally { earnRefreshBusy = false; }
      return;
    }
    const key = (global.FH_KEY && FH_KEY.get) ? FH_KEY.get() : (localStorage.getItem('finnhub_api_key') || '');
    if (!key) return;
    try {
      const raw = JSON.parse(localStorage.getItem('tt_jr_earnings_cal') || 'null');
      if (raw?.ts && Date.now() - raw.ts < 1800000) return;
    } catch (e) {}
    // backoff persistat (convenția fh_econ_403_until) — fără el, fiecare render
    // (per pagină/minut) relua fetch-ul la nesfârșit după un 403/429
    try { if (Date.now() < (parseInt(localStorage.getItem('fh_earn_fail_until'), 10) || 0)) return; } catch (e) {}
    earnRefreshBusy = true;
    try {
      const to = new Date();
      to.setDate(to.getDate() + 7);
      const url = 'https://finnhub.io/api/v1/calendar/earnings?from=' + etToday() + '&to=' + to.toISOString().slice(0, 10) + '&token=' + encodeURIComponent(key);
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(url, { signal: ctl.signal }).finally(() => clearTimeout(timer));
      if (!r.ok){
        const backoffMs = r.status === 403 ? 24 * 3600000 : 30 * 60000;
        try { localStorage.setItem('fh_earn_fail_until', String(Date.now() + backoffMs)); } catch (e) {}
        return;
      }
      const data = await r.json();
      const want = new Set(wl.map(t => String(t).toUpperCase().split('.')[0]));
      const map = {};
      (data.earningsCalendar || []).forEach(e => {
        const sym = String(e.symbol || '').toUpperCase().split('.')[0];
        if (!want.has(sym)) return;
        const days = daysUntil(e.date);
        if (days < 0 || days > 7) return;
        if (!map[sym] || days < map[sym].days) map[sym] = { date: e.date, days, hour: e.hour || '' };
      });
      try { localStorage.setItem('tt_jr_earnings_cal', JSON.stringify({ ts: Date.now(), map })); } catch (e) {}
    } catch (e) {}
    finally { earnRefreshBusy = false; }
  }

  function buildMacroItems(){
    if (!global.MCTX || !MCTX.hardcodedEvents) return [];
    const now = Date.now();
    const seen = loadSeen();
    const out = [];
    const used = new Set();

    for (const e of MCTX.hardcodedEvents()){
      if (e.impact !== 'high') continue;
      const t = e.d.getTime();
      const timeKey = fmtDateET(e.d) + ' ' + e.hm;
      const uid = timeKey + '|' + e.event;
      if (used.has(uid)) continue;

      const seenEntry = findSeen(seen, timeKey, e.event);
      if (seenEntry && seenEntry.ts){
        if (now - seenEntry.ts > RETAIN_MS) continue;
        used.add(uid);
        out.push({ phase: 'result', t, event: e.event, hm: e.hm, actual: seenEntry.actual, tilMs: t - now });
        continue;
      }

      if (t > now && t < now + FUTURE_MS){
        let phase = 'scheduled';
        if (t - now < IMMINENT_MS) phase = 'imminent';
        if (t - now < LIVE_MS && t >= now) phase = 'live';
        used.add(uid);
        out.push({ phase, t, event: e.event, hm: e.hm, approx: !!e.approx, tilMs: t - now });
        continue;
      }

      if (t <= now && now - t < RETAIN_MS){
        // dupa fereastra live, evenimentul PUBLICAT (fara seen — macro
        // nedeschis) primeste phase 'past' dedicat: NU 'scheduled' (=viitor,
        // ar aparea ca "urmeaza · T-done" si ar conduce banda), NU 'imminent'
        // (styling pending 12h)
        const phase = Math.abs(now - t) < LIVE_MS ? 'live' : 'past';
        used.add(uid);
        out.push({ phase, t, event: e.event, hm: e.hm, tilMs: t - now });
      }
    }
    return out;
  }

  function buildItems(){
    const macro = buildMacroItems();
    const earn = loadWlEarnItems();
    const order = { live: 0, imminent: 1, result: 2, past: 2.5, scheduled: 3 };
    return macro.concat(earn).sort((a, b) => {
      const d = (order[a.phase] ?? 9) - (order[b.phase] ?? 9);
      if (d) return d;
      // 'past' = cel mai recent publicat primul (desc); restul ascendent
      return (a.phase === 'past') ? (b.t - a.t) : (a.t - b.t);
    }).slice(0, 8);
  }

  function emptyHtml(){
    const now = Date.now();
    let hasFuture = false;
    if (global.MCTX && MCTX.hardcodedEvents){
      hasFuture = MCTX.hardcodedEvents().some(e =>
        e.impact === 'high' && e.d.getTime() > now && e.d.getTime() < now + FUTURE_MS);
    }
    // calendar hardcodat expirat = liniște FALSĂ, nu „fără evenimente"
    if (global.MCTX && MCTX.calendarExpired && MCTX.calendarExpired()){
      return '<a href="' + MACRO_HREF + '" class="ht-ev ph-imminent"><span class="ht-ev-name">⚠ Calendar</span>' +
        '<span class="ht-ev-meta">expirat — actualizează MCTX →</span></a>';
    }
    const meta = hasFuture ? 'în afara ferestrei 7z' : 'fără HIGH în 7z';
    return '<a href="' + MACRO_HREF + '" class="ht-ev ph-scheduled"><span class="ht-ev-name">Calendar</span>' +
      '<span class="ht-ev-meta">' + esc(meta) + ' →</span></a>';
  }

  function cardHtml(it){
    if (it.earn){
      // BMO/AMC pe chip: la 10:00 un BMO e deja trecut (reactia e live), un
      // AMC e inca in fata (trebuie iesit pana la close) — distinctie de decizie
      const hm = it.hm === 'bmo' ? ' 🌅BMO' : it.hm === 'amc' ? ' 🌙AMC' : '';
      const meta = (it.days === 0 ? 'EARN azi' : 'EARN ' + it.days + 'd') + hm;
      const href = './nasdaq-scanner/?sym=' + encodeURIComponent(it.sym);
      return '<a href="' + href + '" class="ht-ev ph-' + it.phase + ' ht-ev-earn" title="Earnings watchlist ≤48h">' +
        '<span class="ht-ev-name">' + esc(it.sym) + '</span>' +
        '<span class="ht-ev-meta">' + esc(meta) + '</span></a>';
    }
    // „~" = dată derivată aritmetic (approx în MCTX), nu citită din calendar real
    const title = (it.approx ? '~' : '') + esc(shortEvent(it.event));
    // sufixul ET e OBLIGATORIU și pe „Azi" — 14:00 fără fus se citea ca oră RO
    // (FOMC 14:00 ET = 21:00 RO, eroare de 7h fix pe evenimentul care mișcă piața)
    let when = it.hm + ' ET';
    if (global.MCTX){
      const dET = fmtDateET(new Date(it.t));
      const today = MCTX.todayET();
      if (dET === today) when = 'Azi ' + it.hm + ' ET';
      else {
        const tomorrow = fmtDateET(new Date(Date.now() + 86400000));
        if (dET === tomorrow) when = 'Mâine ' + it.hm + ' ET';
      }
    }
    const open = '<a href="' + MACRO_HREF + '" class="ht-ev ph-' + it.phase + '">';
    const close = '</a>';
    if (it.phase === 'result'){
      return open + '<span class="ht-ev-name">' + title + '</span>' +
        '<span class="ht-ev-meta">A: <b>' + esc(String(it.actual)) + '</b></span>' + close;
    }
    if (it.phase === 'live'){
      return open + '<span class="ht-ev-dot"></span><span class="ht-ev-name">' + title + '</span>' +
        '<span class="ht-ev-meta">live</span>' + close;
    }
    if (it.phase === 'past'){
      // eveniment publicat, fara rezultat consemnat (macro nedeschis) — look
      // consumat, fara countdown mincinos "T-done"
      return open + '<span class="ht-ev-name">' + title + '</span>' +
        '<span class="ht-ev-meta">' + esc(when) + ' · publicat</span>' + close;
    }
    return open + '<span class="ht-ev-name">' + title + '</span>' +
      '<span class="ht-ev-meta">' + esc(when) + ' · T-' + tilLabel(it.tilMs) + '</span>' + close;
  }

  function paint(el){
    const items = buildItems();
    if (!items.length) el.innerHTML = emptyHtml();
    else el.innerHTML = items.map(cardHtml).join('');
  }

  function render(el){
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return;
    // randează IMEDIAT din datele locale (calendarul macro e 100% local) —
    // înainte, un Finnhub agățat lăsa toată banda goală până la timeout
    paint(el);
    maybeRefreshWlEarnings().then(() => paint(el)).catch(() => {});
  }

  global.ET = { buildItems, render, maybeRefreshWlEarnings };
})(typeof window !== 'undefined' ? window : global);