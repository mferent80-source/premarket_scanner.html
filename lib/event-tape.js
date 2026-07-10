// event-tape.js — bandă evenimente high-impact hub (ET.*)
(function(global){
  'use strict';

  const RETAIN_MS = 12 * 3600000;
  const FUTURE_MS = 7 * 86400000;
  const IMMINENT_MS = 24 * 3600000;
  const LIVE_MS = 15 * 60000;
  const MACRO_HREF = './macro-dashboard/';

  function esc(s){
    return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function fmtDateET(d){
    try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(d); }
    catch (e) { return d.toISOString().slice(0, 10); }
  }

  function loadSeen(){
    try { return JSON.parse(localStorage.getItem('md_seen_actual') || '{}') || {}; }
    catch (e) { return {}; }
  }

  function findSeen(seen, timeKey){
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

  function buildItems(){
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

      const seenEntry = findSeen(seen, timeKey);
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
        out.push({ phase, t, event: e.event, hm: e.hm, tilMs: t - now });
        continue;
      }

      if (t <= now && now - t < RETAIN_MS){
        const phase = Math.abs(now - t) < LIVE_MS ? 'live' : 'imminent';
        used.add(uid);
        out.push({ phase, t, event: e.event, hm: e.hm, tilMs: t - now });
      }
    }

    return out.sort((a, b) => {
      const order = { live: 0, imminent: 1, result: 2, scheduled: 3 };
      return (order[a.phase] ?? 9) - (order[b.phase] ?? 9) || a.t - b.t;
    }).slice(0, 6);
  }

  function emptyHtml(){
    const now = Date.now();
    let hasFuture = false;
    if (global.MCTX && MCTX.hardcodedEvents){
      hasFuture = MCTX.hardcodedEvents().some(e =>
        e.impact === 'high' && e.d.getTime() > now && e.d.getTime() < now + FUTURE_MS);
    }
    const meta = hasFuture ? 'în afara ferestrei 7z' : 'fără HIGH în 7z';
    return '<a href="' + MACRO_HREF + '" class="ht-ev ph-scheduled"><span class="ht-ev-name">Calendar</span>' +
      '<span class="ht-ev-meta">' + esc(meta) + ' →</span></a>';
  }

  function cardHtml(it){
    const title = esc(shortEvent(it.event));
    const when = fmtDateET(new Date(it.t)) === MCTX.todayET() ? 'Azi ' + it.hm : it.hm + ' ET';
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
    return open + '<span class="ht-ev-name">' + title + '</span>' +
      '<span class="ht-ev-meta">' + esc(when) + ' · T-' + tilLabel(it.tilMs) + '</span>' + close;
  }

  function render(el){
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return;
    const items = buildItems();
    if (!items.length){
      el.innerHTML = emptyHtml();
      return;
    }
    el.innerHTML = items.map(cardHtml).join('');
  }

  global.ET = { buildItems, render };
})(typeof window !== 'undefined' ? window : global);