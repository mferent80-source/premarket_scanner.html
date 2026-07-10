// event-tape.js — bandă evenimente high-impact hub (ET.*)
(function(global){
  'use strict';

  const RETAIN_MS = 12 * 3600000;
  const FUTURE_MS = 7 * 86400000;
  const IMMINENT_MS = 24 * 3600000;
  const LIVE_MS = 15 * 60000;

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

  function findSeen(seen, timeKey, event){
    const key = timeKey + '|' + event;
    if (seen[key]) return seen[key];
    const prefix = timeKey + '|';
    for (const k of Object.keys(seen)){
      if (k.startsWith(prefix)) return seen[k];
    }
    return null;
  }

  function tilLabel(ms){
    if (ms < 0) return 'PUBLICAT';
    if (ms < 3600000) return 'T-' + Math.round(ms / 60000) + 'min';
    if (ms < 86400000) return 'T-' + Math.round(ms / 3600000) + 'h';
    return 'T-' + Math.round(ms / 86400000) + 'z';
  }

  function shortEvent(name){
    return String(name || '').replace(' + Unemployment Rate', '').replace(' YoY + Core CPI', '');
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

      const seenEntry = findSeen(seen, timeKey, e.event);
      if (seenEntry && seenEntry.ts){
        if (now - seenEntry.ts > RETAIN_MS) continue;
        used.add(uid);
        out.push({
          phase: 'result',
          t,
          event: e.event,
          hm: e.hm,
          roTime: e.d.toLocaleTimeString('ro-RO', { hour:'2-digit', minute:'2-digit' }),
          actual: seenEntry.actual,
          ts: seenEntry.ts,
          tilMs: t - now
        });
        continue;
      }

      if (t > now && t < now + FUTURE_MS){
        let phase = 'scheduled';
        if (t - now < IMMINENT_MS) phase = 'imminent';
        if (t - now < LIVE_MS && t >= now) phase = 'live';
        used.add(uid);
        out.push({
          phase,
          t,
          event: e.event,
          hm: e.hm,
          roTime: e.d.toLocaleTimeString('ro-RO', { hour:'2-digit', minute:'2-digit' }),
          tilMs: t - now
        });
        continue;
      }

      if (t <= now && now - t < RETAIN_MS){
        let phase = Math.abs(now - t) < LIVE_MS ? 'live' : 'imminent';
        used.add(uid);
        out.push({
          phase,
          t,
          event: e.event,
          hm: e.hm,
          roTime: e.d.toLocaleTimeString('ro-RO', { hour:'2-digit', minute:'2-digit' }),
          tilMs: t - now
        });
      }
    }

    return out.sort((a, b) => {
      const order = { live: 0, imminent: 1, result: 2, scheduled: 3 };
      const da = order[a.phase] ?? 9, db = order[b.phase] ?? 9;
      if (da !== db) return da - db;
      return a.t - b.t;
    }).slice(0, 8);
  }

  function cardHtml(it){
    const cls = 'ht-tape-card ph-' + it.phase;
    const title = esc(shortEvent(it.event));
    if (it.phase === 'result'){
      return `<div class="${cls}"><span class="ht-tape-ico">✓</span><span class="ht-tape-title">${title}</span>` +
        `<span class="ht-tape-meta">Actual <b>${esc(String(it.actual))}</b></span></div>`;
    }
    if (it.phase === 'live'){
      return `<div class="${cls}"><span class="ht-tape-pulse">●</span><span class="ht-tape-title">${title}</span>` +
        `<span class="ht-tape-meta">PUBLICARE… · ${esc(it.roTime)} RO</span></div>`;
    }
    const dateLbl = fmtDateET(new Date(it.t)) === MCTX.todayET() ? 'Azi' : fmtDateET(new Date(it.t)).slice(5);
    return `<div class="${cls}"><span class="ht-tape-title">${title}</span>` +
      `<span class="ht-tape-meta">${esc(dateLbl)} · ${esc(it.hm)} ET · <b>${tilLabel(it.tilMs)}</b></span></div>`;
  }

  function render(el){
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return;
    const items = buildItems();
    if (!items.length){
      el.innerHTML = '<div class="ht-tape-empty">📭 Niciun eveniment high-impact în fereastra 7z — deschide <a href="./macro-dashboard/">Macro</a> pentru calendar complet.</div>';
      return;
    }
    el.innerHTML = '<div class="ht-tape-scroll">' + items.map(cardHtml).join('') + '</div>';
  }

  global.ET = { buildItems, render };
})(typeof window !== 'undefined' ? window : global);