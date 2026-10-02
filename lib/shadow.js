// ═══════════════════════════════════════════════════════════════════
// shadow.js — Shadow Book: semnale blocate / ratate, atribuire filtre (SH.*)
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';
  const KEY = 'tt_shadow_book_v1';
  const EVAL_METHOD = 'daily-stop-v2';
  const finite = x => typeof x === 'number' && Number.isFinite(x);
  const evaluated = e => e && e.evalMethod === EVAL_METHOD && finite(e.evalPct);

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
    const ts = Number(e.ts || Date.now());
    const horizon = Number(e.horizon || 5);
    const slValue = e.sl != null ? Number(e.sl) : (e.slAtEntry != null ? Number(e.slAtEntry) : null);
    const dir = String(e.dir || 'long').toLowerCase();
    if (!sym || !Number.isFinite(price) || !(price > 0) || !Number.isFinite(ts) || ts <= 0 || ts > Date.now()
        || !Number.isInteger(horizon) || horizon < 1 || horizon > 252
        || (slValue != null && (!Number.isFinite(slValue) || slValue <= 0
          || (dir === 'short' ? slValue <= price : slValue >= price)))) return null;
    const rec = {
      id: 'sh_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      sym,
      dir: dir === 'short' ? 'short' : 'long',
      price,
      sl: slValue,
      blockedBy: String(e.blockedBy || e.filter || e.gate || 'unknown'),
      reason: String(e.reason || e.note || ''),
      src: String(e.src || e.source || 'manual'),
      ts,
      day: etDay(ts),
      evalPct: null,
      evalR: null,
      evalTs: null,
      horizon
    };
    const arr = all();
    arr.unshift(rec);
    // Never discard older records to make room for a new signal.
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

  function updateEval(id, evalPct, evalR, details){
    if (!finite(evalPct) || (evalR != null && !finite(evalR))) return false;
    const arr = all();
    const i = arr.findIndex(x => x && x.id === id);
    if (i < 0) return false;
    arr[i] = Object.assign({}, arr[i], { evalPct, evalR, evalTs: Date.now(), evalMethod: EVAL_METHOD, ...details });
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
    const groups = Object.create(null);
    entries.forEach(e => {
      if (!e || typeof e !== 'object') return;
      const k = e.blockedBy || '?';
      (groups[k] = groups[k] || []).push(e);
    });
    const out = Object.create(null);
    Object.keys(groups).forEach(k => {
      const g = groups[k];
      const evals = g.filter(evaluated);
      const rs = g.filter(x => evaluated(x) && finite(x.evalR));
      out[k] = {
        n: g.length,
        nEval: evals.length,
        avgPct: evals.length ? evals.reduce((s, x) => s + x.evalPct, 0) / evals.length : null,
        avgR: rs.length ? rs.reduce((s, x) => s + x.evalR, 0) / rs.length : null,
        hitPct: evals.length ? evals.filter(x => x.evalPct > 0).length / evals.length * 100 : null,
        small: evals.length < 10
      };
    });
    return out;
  }

  // filterEdge — ipoteză: filtrul „a salvat" dacă avg eval blocat < 0 (ai evitat pierderi)
  function filterEdge(){
    const stats = statsByFilter();
    const allEval = all().filter(evaluated);
    const baseline = allEval.length ? allEval.reduce((s, x) => s + x.evalPct, 0) / allEval.length : null;
    return Object.entries(stats).map(([k, s]) => ({
      filter: k,
      n: s.n,
      nEval: s.nEval,
      avgPct: s.avgPct,
      avgR: s.avgR,
      vsBaseline: (baseline != null && s.avgPct != null) ? s.avgPct - baseline : null,
      verdict: s.small ? 'eșantion insuficient' : s.avgPct == null ? '—' : (s.avgPct < 0 ? 'filtru util (evitat)' : 'filtru costisitor (ratat)'),
      small: s.small
    })).sort((a, b) => (a.avgPct ?? 0) - (b.avgPct ?? 0));
  }

  function statsTaken(){ return { n: ledgerTaken().length }; }

  async function evaluateOne(id, fetchStock){
    const e = all().find(x => x && x.id === id);
    if (!e || !fetchStock || !finite(e.ts) || !finite(e.price) || e.price <= 0) return null;
    const horizon = Number(e.horizon || 5);
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > 252) return null;
    if (e.sl != null && (!finite(e.sl) || e.sl <= 0 || (e.dir === 'short' ? e.sl <= e.price : e.sl >= e.price))) return null;
    try {
      const bars = await fetchStock(e.sym, { range: 'max', interval: '1d', ttl: 3600 });
      if (!Array.isArray(bars)) return null;
      // Conservative completion rule: today's daily bar is never a final close.
      const today = new Date().toISOString().slice(0, 10);
      const ordered = bars.slice().sort((a, b) => a.t - b.t);
      const seen = new Set();
      const closed = ordered.filter(b => {
        if (!finite(b.t) || ![b.o,b.h,b.l,b.c].every(x => finite(x) && x > 0)
            || b.h < Math.max(b.o,b.c) || b.l > Math.min(b.o,b.c) || b.h < b.l) return false;
        const day = new Date(b.t).toISOString().slice(0, 10);
        if (day >= today || seen.has(day)) return false;
        seen.add(day); return true;
      });
      // Require historical coverage around the signal, not a later truncated series.
      const before = closed.filter(b => b.t <= e.ts).at(-1);
      if (!before || e.ts - before.t > 7 * 86400000) return null;
      const after = closed.filter(b => b.t > e.ts);
      if (after.length < horizon) return null;
      const window = after.slice(0, horizon);
      let exit = window[horizon - 1].c;
      let exitTs = window[horizon - 1].t;
      let exitReason = 'horizon-close';
      if (e.sl != null){
        for (const bar of window){
          const short = e.dir === 'short';
          if (short ? bar.h >= e.sl : bar.l <= e.sl){
            exit = short ? Math.max(bar.o, e.sl) : Math.min(bar.o, e.sl);
            exitTs = bar.t; exitReason = 'stop'; break;
          }
        }
      }
      const evalPct = simReturn(e.price, exit, e.dir);
      const evalR = simR(e.price, exit, e.sl, e.dir, 1);
      const details = { exitPrice: exit, exitTs, exitReason, evaluatedSessions: horizon };
      if (!updateEval(id, evalPct, evalR, details)) return null;
      return { evalPct, evalR, ...details };
    } catch(err){ return null; }
  }

  async function evaluateAll(fetchStock, onProgress){
    const pending = all().filter(x => !evaluated(x));
    let done = 0;
    let completed = 0;
    for (const e of pending){
      if (await evaluateOne(e.id, fetchStock)) completed++;
      done++;
      if (onProgress) onProgress(done, pending.length);
      await new Promise(r => setTimeout(r, 120));
    }
    return completed;
  }

  function remove(id){ return save(all().filter(x => x && x.id !== id)); }

  global.SH = {
    evaluated, EVAL_METHOD, all, log, save, ingestPayload, ingestText, updateEval, statsByFilter, filterEdge,
    statsTaken, evaluateOne, evaluateAll, remove, ledgerTaken, KEY, simReturn, simR
  };
})(typeof window !== 'undefined' ? window : globalThis);