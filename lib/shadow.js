// ═══════════════════════════════════════════════════════════════════
// shadow.js — Shadow Book: semnale blocate / ratate, atribuire filtre (SH.*)
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';
  const KEY = 'tt_shadow_book_v1';
  const MAX = 800;

  function etDay(ts){
    try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(ts ? new Date(ts) : new Date()); }
    catch(e){ return new Date(ts || Date.now()).toISOString().slice(0,10); }
  }

  function all(){
    try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  function save(arr){
    try { localStorage.setItem(KEY, JSON.stringify(arr)); return true; } catch(e){ return false; }
  }

  function log(e){
    const sym = String(e.sym || e.symbol || e.ticker || '').trim().toUpperCase();
    const price = parseFloat(e.price != null ? e.price : e.entry);
    if (!sym || !(price > 0)) return null;
    const rec = {
      id: 'sh_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      sym,
      dir: e.dir === 'short' || e.dir === 'SHORT' ? 'short' : 'long',
      price,
      sl: e.sl != null ? parseFloat(e.sl) : (e.slAtEntry != null ? parseFloat(e.slAtEntry) : null),
      blockedBy: String(e.blockedBy || e.filter || e.gate || 'unknown'),
      reason: String(e.reason || e.note || ''),
      src: String(e.src || e.source || 'manual'),
      ts: e.ts || Date.now(),
      day: etDay(e.ts),
      evalPct: null,
      evalR: null,
      evalTs: null,
      horizon: e.horizon || 5
    };
    const arr = all();
    arr.unshift(rec);
    while (arr.length > MAX) arr.pop();
    return save(arr) ? rec : null;
  }

  function ingestPayload(obj){
    if (!obj || typeof obj !== 'object') return null;
    const ev = String(obj.event || '');
    const isDistRev = obj.deck === 'ZL_DISTREV' || String(obj.src || obj.source || '').toLowerCase() === 'distrev' || ev.indexOf('ZL_DISTREV') === 0;
    // I-259: DistRev blocked + reverse signals as shadow ledger rows
    const isBlocked = obj.blocked || obj.shadow || obj.status === 'blocked' || obj.gate === 'blocked' || ev === 'ZL_DISTREV_BLOCKED';
    const isRevSig = isDistRev && (ev === 'ZL_DISTREV_REV' || ev === 'ZL_DISTREV_PB' || ev === 'ZL_DISTREV_WARN');
    if (isBlocked || isRevSig){
      const side = String(obj.side || obj.dir || '').toUpperCase();
      const dir = side === 'SHORT' || side === 'S' ? 'short' : 'long';
      const tier = obj.tier || '';
      const why = obj.blockedBy || obj.filter || obj.gateReason || (isBlocked ? 'distrev-block' : (ev || 'distrev'));
      const reason = [
        ev || '',
        tier ? 'tier=' + tier : '',
        obj.revScore != null ? 'revScore=' + obj.revScore : '',
        obj.distAtr != null ? 'dist=' + obj.distAtr : '',
        obj.mode || '',
        obj.reason || obj.msg || ''
      ].filter(Boolean).join(' · ');
      return log({
        sym: obj.sym || obj.symbol || obj.ticker,
        price: obj.entry || obj.price || obj.close,
        sl: obj.sl || obj.slAtEntry,
        dir,
        blockedBy: isBlocked ? why : ('distrev:' + (tier || ev || 'sig')),
        reason,
        src: obj.src || obj.source || obj.indicator || (isDistRev ? 'distrev' : 'pine'),
        ts: obj.ts ? (obj.ts < 1e12 ? obj.ts * 1000 : obj.ts) : (obj.time_utc ? Date.parse(obj.time_utc) : Date.now())
      });
    }
    return null;
  }

  function ingestText(text){
    const lines = String(text || '').split(/\n+/).filter(Boolean);
    let n = 0;
    lines.forEach(line => {
      try {
        const o = JSON.parse(line.trim());
        if (ingestPayload(o)) n++;
      } catch(e){
        try {
          const o = JSON.parse(line.trim().replace(/^[^[{]*/, ''));
          if (ingestPayload(o)) n++;
        } catch(e2){}
      }
    });
    return n;
  }

  function updateEval(id, evalPct, evalR){
    const arr = all();
    const i = arr.findIndex(x => x && x.id === id);
    if (i < 0) return false;
    arr[i] = Object.assign({}, arr[i], { evalPct, evalR, evalTs: Date.now() });
    return save(arr);
  }

  function ledgerTaken(){
    if (!global.LEDGER) return [];
    return LEDGER.all();
  }

  function simReturn(entry, exit, dir){
    if (!(entry > 0) || !(exit > 0)) return null;
    return dir === 'short' ? (entry - exit) / entry * 100 : (exit - entry) / entry * 100;
  }

  function simR(entry, exit, sl, dir, size){
    size = size || 1;
    if (sl == null || !(sl > 0)) return null;
    const pnl = dir === 'short' ? (entry - exit) * size : (exit - entry) * size;
    const r0 = Math.abs(entry - sl) * size;
    return r0 > 0 ? pnl / r0 : null;
  }

  function statsByFilter(entries){
    entries = entries || all();
    const groups = {};
    entries.forEach(e => {
      const k = e.blockedBy || '?';
      (groups[k] = groups[k] || []).push(e);
    });
    const out = {};
    Object.keys(groups).forEach(k => {
      const g = groups[k];
      const evals = g.filter(x => x.evalPct != null);
      const rs = g.filter(x => x.evalR != null);
      out[k] = {
        n: g.length,
        nEval: evals.length,
        avgPct: evals.length ? evals.reduce((s, x) => s + x.evalPct, 0) / evals.length : null,
        avgR: rs.length ? rs.reduce((s, x) => s + x.evalR, 0) / rs.length : null,
        hitPct: evals.length ? evals.filter(x => x.evalPct > 0).length / evals.length * 100 : null,
        small: g.length < 10
      };
    });
    return out;
  }

  // filterEdge — ipoteză: filtrul „a salvat" dacă avg eval blocat < 0 (ai evitat pierderi)
  function filterEdge(){
    const stats = statsByFilter();
    const allEval = all().filter(x => x.evalPct != null);
    const baseline = allEval.length ? allEval.reduce((s, x) => s + x.evalPct, 0) / allEval.length : null;
    return Object.entries(stats).map(([k, s]) => ({
      filter: k,
      n: s.n,
      avgPct: s.avgPct,
      avgR: s.avgR,
      vsBaseline: (baseline != null && s.avgPct != null) ? s.avgPct - baseline : null,
      verdict: s.avgPct == null ? '—' : (s.avgPct < 0 ? 'filtru util (evitat)' : 'filtru costisitor (ratat)'),
      small: s.small
    })).sort((a, b) => (a.avgPct ?? 0) - (b.avgPct ?? 0));
  }

  function statsTaken(){ return { n: ledgerTaken().length }; }

  async function evaluateOne(id, fetchStock){
    const e = all().find(x => x && x.id === id);
    if (!e || !fetchStock) return null;
    try {
      const bars = await fetchStock(e.sym, { range: '3mo', interval: '1d', ttl: 3600 });
      const after = bars.filter(b => b.t >= e.ts);
      const h = Math.min(e.horizon || 5, after.length);
      if (!h) return null;
      const exitBar = after[h - 1] || after[after.length - 1];
      const evalPct = simReturn(e.price, exitBar.c, e.dir);
      const evalR = simR(e.price, exitBar.c, e.sl, e.dir, 1);
      updateEval(id, evalPct, evalR);
      return { evalPct, evalR };
    } catch(err){ return null; }
  }

  async function evaluateAll(fetchStock, onProgress){
    const pending = all().filter(x => x.evalPct == null);
    let done = 0;
    for (const e of pending){
      await evaluateOne(e.id, fetchStock);
      done++;
      if (onProgress) onProgress(done, pending.length);
      await new Promise(r => setTimeout(r, 120));
    }
    return done;
  }

  function remove(id){ return save(all().filter(x => x && x.id !== id)); }

  global.SH = {
    all, log, save, ingestPayload, ingestText, updateEval, statsByFilter, filterEdge,
    statsTaken, evaluateOne, evaluateAll, remove, ledgerTaken, KEY, simReturn, simR
  };
})(typeof window !== 'undefined' ? window : globalThis);