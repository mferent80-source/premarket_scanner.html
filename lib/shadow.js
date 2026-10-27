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
  // 27.10.2026 (I-754): minutul New York al semnalului și închiderea sesiunii lui (calendarul SUA când e încărcat, altfel 16:00)
  function minutNY(ts){
    try { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone:'America/New_York', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(new Date(ts)).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)])); return p.hour * 60 + p.minute; }
    catch(e){ return 0; }
  }
  function inchidereNY(day){
    try { const s = global.ExchangeCalendar && global.ExchangeCalendar.session ? global.ExchangeCalendar.session('US', day) : null; return s && finite(s.close) ? s.close : 960; } catch(e){ return 960; }
  }
  function marcheazaNeverificabil(id, motiv){
    const arr = all(), i = arr.findIndex(x => x && x.id === id);
    if (i < 0) return false;
    arr[i] = Object.assign({}, arr[i], { neverificabil: { motiv, la: Date.now() } });
    return save(arr);
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

  // 18.10.2026 (revizia Shadow): semnalele din aceeași zi se mișcă împreună (30 dintr-o zi ≠ 30 de dovezi) ⇒ testul semnelor pe ZILE:
  // media pe zi, apoi câte zile pozitive din câte nenule; p bilateral exact. Mărimea e verificată prin simulare (tools/jurnal-revizie.test.mjs).
  function pSemneBilateral(k, n){
    if (n <= 0) return 1;
    let c = 1, sus = 0, jos = 0;
    for (let x = 0; x <= n; x++){ if (x > 0) c = c * (n - x + 1) / x; if (x >= k) sus += c; if (x <= k) jos += c; }
    return Math.min(1, 2 * Math.min(sus, jos) / Math.pow(2, n));
  }
  function zile(evals){
    const pe = Object.create(null);
    evals.forEach(x => { const d = String(x.day || '').slice(0, 10) || '?'; (pe[d] = pe[d] || []).push(x.evalPct); });
    const medii = Object.values(pe).map(v => v.reduce((s, y) => s + y, 0) / v.length).filter(m => m !== 0);
    const pos = medii.filter(m => m > 0).length;
    return { days: Object.keys(pe).length, daysPos: pos, daysN: medii.length, pDays: pSemneBilateral(pos, medii.length) };
  }
  const ZILE_MIN = 12;
  // 19.10.2026 (I-699): direcția din zile (cele cu medie nenulă), aceeași măsură pe care o judecă testul semnelor — nu din media
  // pe semnale, pe care câteva zile extreme o pot întoarce.
  function directie(s){ const n = s.daysN || 0; return !n || s.daysPos * 2 === n ? 0 : s.daysPos * 2 > n ? 1 : -1; }
  // 19.10.2026 (I-699): corecția Holm când mai multe filtre au destule zile — fiecare filtru e încă o încercare.
  function holm(ps){
    const ord = ps.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p), out = new Array(ps.length);
    let max = 0; ord.forEach((x, j) => { max = Math.max(max, Math.min(1, (ps.length - j) * x.p)); out[x.i] = max; });
    return out;
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
        small: evals.length < 10,
        ...zile(evals)
      };
    });
    return out;
  }

  // filterEdge — ipoteză: filtrul „a salvat" dacă avg eval blocat < 0 (ai evitat pierderi)
  function filterEdge(){
    const stats = statsByFilter();
    const allEval = all().filter(evaluated);
    const baseline = allEval.length ? allEval.reduce((s, x) => s + x.evalPct, 0) / allEval.length : null;
    const entries = Object.entries(stats), testate = entries.filter(([, s]) => !s.small && s.avgPct != null && s.days >= ZILE_MIN);
    const pHolm = holm(testate.map(([, s]) => s.pDays)), adj = Object.create(null);
    testate.forEach(([k], i) => { adj[k] = pHolm[i]; });
    const m = testate.length;
    return entries.map(([k, s]) => {
      const p = adj[k] != null ? adj[k] : s.pDays, dir = directie(s), probat = adj[k] != null && p <= 0.05 && dir !== 0;
      const pText = m > 1 ? 'p Holm = ' + p.toFixed(3) + ' pe ' + m + ' filtre' : 'p = ' + p.toFixed(3);
      // zilele în care semnalele blocate au scăzut ⇒ filtrul a ferit de pierderi (util); au crescut ⇒ a costat
      const opus = probat && s.avgPct != null && (dir < 0 ? s.avgPct > 0 : s.avgPct < 0) ? ' · media pe semnale are semn opus (câteva zile extreme)' : '';
      return {
        filter: k,
        n: s.n,
        nEval: s.nEval,
        avgPct: s.avgPct,
        avgR: s.avgR,
        vsBaseline: (baseline != null && s.avgPct != null) ? s.avgPct - baseline : null,
        verdict: s.small ? 'eșantion insuficient' : s.avgPct == null ? '—'
          : s.days < ZILE_MIN ? 'neprobat · media ' + s.avgPct.toFixed(2) + '% pe ' + s.days + (s.days === 1 ? ' zi' : ' zile') + ' (trebuie ≥ ' + ZILE_MIN + ' zile)'
          : probat ? (dir < 0 ? 'filtru util (probat pe zile, ' : 'filtru costisitor (probat pe zile, ') + pText + ', ' + s.daysPos + ' din ' + s.daysN + ' zile pe plus)' + opus
          : 'neprobat · media ' + s.avgPct.toFixed(2) + '%, ' + (m > 1 ? 'p Holm = ' + p.toFixed(2) + ' pe ' + m + ' filtre' : 'p = ' + p.toFixed(2)) + ' pe ' + s.days + ' zile',
        // 19.10.2026 (I-699): culoarea pe pagină — verde doar „util”, roșu doar „costisitor”, restul neutru
        tone: probat ? (dir < 0 ? 'useful' : 'costly') : 'neutral',
        small: s.small, days: s.days, pDays: s.pDays, pHolm: adj[k] != null ? adj[k] : null
      };
    }).sort((a, b) => (a.avgPct ?? 0) - (b.avgPct ?? 0));
  }

  function statsTaken(){ return { n: ledgerTaken().length }; }

  // 19.10.2026 (I-699): `range:'max'` cu `interval:'1d'` întoarce de la Yahoo bare de 3 LUNI (AAPL: 169 de bare, dataGranularity 3mo).
  // Intervalul se alege din vechimea semnalului (1y / 2y / 5y / 10y, toate zilnice), iar un semnal se evaluează doar după ce au trecut
  // destule zile lucrătoare cât să existe `horizon` sesiuni închise după el — altfel nu se cere nimic.
  function zileLucratoareDupa(day, now){
    const azi = etDay(now), d = new Date(String(day || '').slice(0, 10) + 'T12:00:00Z');
    if (!finite(d.getTime())) return 0;
    let n = 0; d.setUTCDate(d.getUTCDate() + 1);
    while (d.toISOString().slice(0, 10) < azi && n < 400){ if (d.getUTCDay() % 6) n++; d.setUTCDate(d.getUTCDate() + 1); }
    return n;
  }
  function due(e, now){
    const horizon = Number(e && e.horizon || 5);
    return !!e && finite(e.ts) && Number.isInteger(horizon) && zileLucratoareDupa(e.day || etDay(e.ts), now || Date.now()) >= horizon;
  }
  function rangeFor(ts, now){
    const zile = ((now || Date.now()) - ts) / 86400000 + 10;   // + o săptămână înaintea semnalului (bara de referință)
    return zile <= 360 ? '1y' : zile <= 725 ? '2y' : zile <= 1820 ? '5y' : '10y';
  }
  // bare zilnice: mediana pașilor dintre bare sub 5 zile calendaristice (trimestrialele au ~90)
  function zilnice(bars){
    if (bars.length < 2) return true;
    const pasi = bars.slice(1).map((b, i) => b.t - bars[i].t).sort((a, b) => a - b);
    return pasi[Math.floor(pasi.length / 2)] <= 5 * 86400000;
  }

  async function evaluateOne(id, fetchStock){
    const e = all().find(x => x && x.id === id);
    if (!e || !fetchStock || !finite(e.ts) || !finite(e.price) || e.price <= 0) return null;
    const horizon = Number(e.horizon || 5);
    if (!Number.isInteger(horizon) || horizon < 1 || horizon > 252) return null;
    if (e.sl != null && (!finite(e.sl) || e.sl <= 0 || (e.dir === 'short' ? e.sl <= e.price : e.sl >= e.price))) return null;
    if (!due(e, Date.now())) return null;
    try {
      const bars = await fetchStock(e.sym, { range: rangeFor(e.ts, Date.now()), interval: '1d', ttl: 3600 });
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
      if (!zilnice(closed)) return null;
      // Require historical coverage around the signal, not a later truncated series.
      const before = closed.filter(b => b.t <= e.ts).at(-1);
      if (!before || e.ts - before.t > 7 * 86400000) return null;
      const after = closed.filter(b => b.t > e.ts);
      if (after.length < horizon) return null;
      const window = after.slice(0, horizon);
      let exit = window[horizon - 1].c;
      let exitTs = window[horizon - 1].t;
      let exitReason = 'horizon-close';
      const short = e.dir === 'short', ziua = e.day || etDay(e.ts);
      // I-754: semnal venit ÎN ședință ⇒ minimul barei zilei poate fi după el; stopul se judecă și acolo (varianta mai proastă: ieșire la stop, nu la deschidere)
      if (e.sl != null && etDay(before.t) === ziua && minutNY(e.ts) < inchidereNY(ziua) && (short ? before.h >= e.sl : before.l <= e.sl)){
        exit = e.sl; exitTs = before.t; exitReason = 'stop-ziua-semnalului';
      }
      if (e.sl != null && exitReason !== 'stop-ziua-semnalului'){
        for (const bar of window){
          if (short ? bar.h >= e.sl : bar.l <= e.sl){
            exit = short ? Math.max(bar.o, e.sl) : Math.min(bar.o, e.sl);
            exitTs = bar.t; exitReason = 'stop'; break;
          }
        }
      }
      // I-754: evenimentele corporative (Yahoo, `events=div,splits`): un split între semnal și ieșire reajustează istoricul, dar prețul semnalului
      // a rămas cel vechi ⇒ evaluarea e NEVERIFICABILĂ (nu −50 % fals în statistici). Dividendul nu ajustează OHLC-ul; doar se notează.
      const evenimente = bars.meta && Array.isArray(bars.meta.corporateEvents) ? bars.meta.corporateEvents : [];
      const inFereastra = x => x && finite(x.at) && x.at >= e.ts - 86400000 && x.at <= exitTs + 86400000;
      const split = evenimente.find(x => inFereastra(x) && /^split/i.test(String(x.type || '')));
      if (split){
        const raport = finite(split.numerator) && finite(split.denominator) ? split.numerator + ':' + split.denominator : '?';
        const motiv = 'neverificabil: split ' + raport + ' pe ' + etDay(split.at) + ' între semnal și ieșire — istoricul e reajustat, prețul semnalului nu';
        if (!marcheazaNeverificabil(id, motiv)) return null;
        return { neverificabil: true, motiv };
      }
      const dividend = evenimente.find(x => inFereastra(x) && /^div/i.test(String(x.type || '')));
      const evalPct = simReturn(e.price, exit, e.dir);
      const evalR = simR(e.price, exit, e.sl, e.dir, 1);
      const details = { exitPrice: exit, exitTs, exitReason, evaluatedSessions: horizon, ...(dividend ? { evalNota: 'dividend în fereastră' + (finite(dividend.amount) ? ' (' + dividend.amount + ')' : '') + ' — randamentul e fără dividend' } : {}) };
      if (!updateEval(id, evalPct, evalR, details)) return null;
      return { evalPct, evalR, ...details };
    } catch(err){ return null; }
  }

  async function evaluateAll(fetchStock, onProgress){
    const now = Date.now(), pending = all().filter(x => !evaluated(x) && !x.neverificabil && due(x, now));   // I-699: doar cele ajunse la orizont; I-754: nu și cele neverificabile
    let done = 0;
    let completed = 0;
    for (const e of pending){
      const r = await evaluateOne(e.id, fetchStock);
      if (r && !r.neverificabil) completed++;   // I-754: neverificabil (split) ≠ evaluat
      done++;
      if (onProgress) onProgress(done, pending.length);
      await new Promise(r => setTimeout(r, 120));
    }
    return completed;
  }

  function remove(id){ return save(all().filter(x => x && x.id !== id)); }

  global.SH = {
    evaluated, EVAL_METHOD, all, log, save, ingestPayload, ingestText, updateEval, statsByFilter, filterEdge,
    statsTaken, evaluateOne, evaluateAll, remove, ledgerTaken, KEY, simReturn, simR, due, rangeFor
  };
})(typeof window !== 'undefined' ? window : globalThis);