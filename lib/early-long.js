// early-long.js — Early Long engine (EL.*)
// Structure = daily arming · Trigger = bare 5m ÎNCHISE (anti-repaint) · States ARMED/FIRE/MANAGE/DEAD
// Pragurile sunt IPOTEZE — validează OOS via LEDGER me-fire (n≥10, pe regim).
(function (global) {
  'use strict';

  const STATE_KEY = 'me_el_states_v1';
  const CFG = {
    // Scor: Structure(0–5) + Trigger(0–5) + Regime(0–3) − penalties
    fireMinTotal: 6,
    fireMinTrigger: 3,
    // ORB: primele N bare RTH de 5m (3 = 15m)
    orbBars: 3,
    // Gap pre deja consumat → nu FIRE pe chase
    maxGapArmPct: 3.5,
    // Fereastră hibrid: PRE + open până 10:15 ET; după = path late (fără ORB fresh)
    preStartMin: 4 * 60,
    rthStartMin: 9 * 60 + 30,
    openEndMin: 10 * 60 + 15,
    rthEndMin: 16 * 60,
    barMs: 5 * 60 * 1000,
    // Poll cache 5m
    barsTtlSec: 45,
    // MANAGE → DEAD
    manageMaxPct: 6,
    manageMaxMin: 180
  };

  // ── time ET ──────────────────────────────────────────────────
  function etParts(ms) {
    try {
      const p = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, weekday: 'short'
      }).formatToParts(new Date(ms || Date.now()));
      const g = (t) => (p.find((x) => x.type === t) || {}).value;
      return {
        y: +g('year'), mo: +g('month'), d: +g('day'),
        h: +g('hour') % 24, mi: +g('minute'), s: +g('second'),
        wd: g('weekday'),
        dateStr: g('year') + '-' + g('month') + '-' + g('day')
      };
    } catch (e) {
      const d = new Date(ms || Date.now());
      return {
        y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(),
        h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(),
        wd: '?', dateStr: d.toISOString().slice(0, 10)
      };
    }
  }
  function etMinutes(ms) {
    const p = etParts(ms);
    return p.h * 60 + p.mi;
  }
  function isWeekendET(ms) {
    const w = etParts(ms).wd;
    return w === 'Sat' || w === 'Sun';
  }
  /** @returns {'pre_orb'|'late'|'closed'} */
  function sessionPath(ms) {
    if (isWeekendET(ms)) return 'closed';
    const m = etMinutes(ms);
    if (m >= CFG.preStartMin && m < CFG.rthStartMin) return 'pre_orb';
    if (m >= CFG.rthStartMin && m < CFG.openEndMin) return 'pre_orb';
    if (m >= CFG.openEndMin && m < CFG.rthEndMin) return 'late';
    return 'closed';
  }
  function sessionLabel(ms) {
    const path = sessionPath(ms);
    const m = etMinutes(ms);
    if (path === 'closed') {
      if (isWeekendET(ms)) return 'Weekend';
      if (m < CFG.preStartMin) return 'Închis · pre 04:00 ET';
      return 'After-hours / închis';
    }
    if (m < CFG.rthStartMin) return 'PRE · path ORB';
    if (m < CFG.openEndMin) return 'OPEN window · ORB activ';
    return 'RTH late · fără ORB fresh';
  }

  // ── bars ─────────────────────────────────────────────────────
  /** Păstrează doar bare 5m închise (anti-repaint). */
  function closedBars(bars, nowMs) {
    nowMs = nowMs || Date.now();
    if (!Array.isArray(bars) || !bars.length) return [];
    return bars.filter((b) => b && b.t != null && b.t + CFG.barMs <= nowMs + 2000);
  }

  function etDateOfBar(tMs) {
    return etParts(tMs).dateStr;
  }

  /** Bare RTH (09:30–16:00 ET) din sesiunea calendaristică curentă ET. */
  function rthBarsToday(bars, nowMs) {
    const today = etParts(nowMs).dateStr;
    return bars.filter((b) => {
      if (etDateOfBar(b.t) !== today) return false;
      const m = etMinutes(b.t);
      return m >= CFG.rthStartMin && m < CFG.rthEndMin;
    });
  }

  /** Bare premarket azi (04:00–09:30 ET). */
  function preBarsToday(bars, nowMs) {
    const today = etParts(nowMs).dateStr;
    return bars.filter((b) => {
      if (etDateOfBar(b.t) !== today) return false;
      const m = etMinutes(b.t);
      return m >= CFG.preStartMin && m < CFG.rthStartMin;
    });
  }

  function vwap(bars) {
    let pv = 0, vv = 0;
    for (const b of bars) {
      const typ = (b.h + b.l + b.c) / 3;
      const v = b.v || 0;
      pv += typ * v;
      vv += v;
    }
    return vv > 0 ? pv / vv : null;
  }

  function atrLike(bars, n) {
    n = n || 14;
    if (bars.length < 2) return null;
    const slice = bars.slice(-Math.min(bars.length, n + 1));
    let sum = 0, cnt = 0;
    for (let i = 1; i < slice.length; i++) {
      const tr = Math.max(
        slice[i].h - slice[i].l,
        Math.abs(slice[i].h - slice[i - 1].c),
        Math.abs(slice[i].l - slice[i - 1].c)
      );
      sum += tr;
      cnt++;
    }
    return cnt ? sum / cnt : null;
  }

  // ── structure from daily early-bird (eb object) ──────────────
  /**
   * Map computeEarlyBird → arming.
   * ARMED candidate dacă isEarly (început de drum); isRanBlocked → nu arm.
   */
  function structureFromEb(eb) {
    if (!eb) return { ok: false, score: 0, reason: 'fără daily' };
    if (eb.isRanBlocked) return { ok: false, score: 0, reason: '🏃 a fugit', ran: true };
    if (eb.expired) return { ok: false, score: 0, reason: 'expirat' };
    if (eb.isWilting) return { ok: false, score: 0, reason: '🥀 ' + (eb.wiltReason || 'invalid') };
    if (eb.isEarly) {
      const sc = Math.min(5, (eb.score | 0) + 1); // 1–5, early are deja 0–5
      return {
        ok: true,
        score: Math.max(1, sc),
        reason: '🌱 structure daily',
        extPct: eb.extPct,
        rsi: eb.rsiNow,
        price: eb.price
      };
    }
    // Confirmed = nu e early entry, dar poate fi urmărit vizual (nu ARMED hard)
    if (eb.isConfirmed) {
      return { ok: false, score: 2, reason: '🌳 confirmat (nu early entry)', confirmed: true };
    }
    return { ok: false, score: 0, reason: 'fără structure' };
  }

  // ── trigger 5m ───────────────────────────────────────────────
  /**
   * @returns {{ score: number, tags: string[], detail: object }}
   */
  function computeTrigger(barsClosed, path, nowMs) {
    const tags = [];
    let score = 0;
    const detail = {};
    if (!barsClosed.length) return { score: 0, tags: ['no-bars'], detail };

    const last = barsClosed[barsClosed.length - 1];
    const atr = atrLike(barsClosed, 14);
    detail.last = last.c;
    detail.atr = atr;

    // Gap vs prev daily-ish: use close before today if available
    const today = etParts(nowMs).dateStr;
    let prevClose = null;
    for (let i = barsClosed.length - 1; i >= 0; i--) {
      if (etDateOfBar(barsClosed[i].t) !== today) {
        prevClose = barsClosed[i].c;
        break;
      }
    }
    const gapPct = prevClose ? ((last.c - prevClose) / prevClose) * 100 : null;
    detail.gapPct = gapPct;
    if (gapPct != null && gapPct > CFG.maxGapArmPct) {
      tags.push('gap-ran');
      detail.gapBlock = true;
      // nu dăm trigger pe chase; scor 0
      return { score: 0, tags, detail };
    }

    const rth = rthBarsToday(barsClosed, nowMs);
    const pre = preBarsToday(barsClosed, nowMs);

    // VWAP pe barele de azi (pre+rth)
    const todayBars = barsClosed.filter((b) => etDateOfBar(b.t) === today);
    const vw = vwap(todayBars.length ? todayBars : barsClosed.slice(-20));
    detail.vwap = vw;

    // 1) ORB break (doar path pre_orb)
    if (path === 'pre_orb' && rth.length >= CFG.orbBars) {
      const orbSlice = rth.slice(0, CFG.orbBars);
      const orbHigh = Math.max(...orbSlice.map((b) => b.h));
      const orbLow = Math.min(...orbSlice.map((b) => b.l));
      detail.orbHigh = orbHigh;
      detail.orbLow = orbLow;
      // break pe bare DUPĂ formarea ORB
      const after = rth.slice(CFG.orbBars);
      if (after.length) {
        const br = after[after.length - 1];
        if (br.c > orbHigh) {
          score += 3;
          tags.push('ORB↑');
          detail.orbBreak = true;
        }
      }
    } else if (path === 'pre_orb' && pre.length >= 2 && rth.length === 0) {
      // PRE: reclaim high pre pe ultimele 2 bare verzi + vol
      const hi = Math.max(...pre.map((b) => b.h));
      detail.preHigh = hi;
      if (last.c >= hi * 0.998 && last.c > last.o) {
        score += 2;
        tags.push('PRE-reclaim');
      }
      // 2 bare verzi consecutive pre
      if (pre.length >= 2) {
        const a = pre[pre.length - 2], b = pre[pre.length - 1];
        if (a.c > a.o && b.c > b.o && b.c > a.c) {
          score += 1;
          tags.push('PRE-HL');
        }
      }
    }

    // 2) VWAP reclaim (orice path deschis)
    if (vw != null && barsClosed.length >= 3) {
      const a = barsClosed[barsClosed.length - 3];
      const b = barsClosed[barsClosed.length - 2];
      const c = last;
      const wasBelow = a.c < vw || b.c < vw;
      const nowAbove = c.c > vw && c.c > c.o;
      if (wasBelow && nowAbove) {
        score += 2;
        tags.push('VWAP↑');
        detail.vwapReclaim = true;
      } else if (c.c > vw && c.c > c.o) {
        score += 1;
        tags.push('>VWAP');
      }
    }

    // 3) First higher-low + impuls vol (2–3 bare)
    if (barsClosed.length >= 5) {
      const s = barsClosed.slice(-5);
      const lows = s.map((b) => b.l);
      const hl = lows[4] > lows[2] && lows[3] > lows[1];
      const greens = s.slice(-3).filter((b) => b.c > b.o).length;
      const vols = s.map((b) => b.v || 0);
      const avgV = vols.slice(0, -1).reduce((a, b) => a + b, 0) / Math.max(1, vols.length - 1);
      const volOk = avgV > 0 && vols[vols.length - 1] > avgV * 1.15;
      if (hl && greens >= 2) {
        score += volOk ? 2 : 1;
        tags.push(volOk ? 'HL+vol' : 'HL');
        detail.higherLow = true;
      }
    }

    // Cap trigger 0–5
    score = Math.min(5, score);
    return { score, tags, detail };
  }

  // ── regime / gates ───────────────────────────────────────────
  function regimeScore(ctx) {
    // ctx: { regimeLabel, vix, spyChg }
    let s = 1; // neutral default
    const tags = [];
    const lab = String((ctx && ctx.regimeLabel) || '');
    if (/RISK-ON|LEAN/i.test(lab)) { s = 3; tags.push('risk-on'); }
    else if (/NEUTRAL/i.test(lab)) { s = 2; tags.push('neutral'); }
    else if (/CAUTIOUS/i.test(lab)) { s = 1; tags.push('cautious'); }
    else if (/RISK-OFF|STRESS/i.test(lab)) { s = 0; tags.push('risk-off'); }
    else tags.push('regime-n/a');

    if (ctx && typeof ctx.vix === 'number') {
      if (ctx.vix >= 25) { s = Math.max(0, s - 2); tags.push('VIX≥25'); }
      else if (ctx.vix >= 20) { s = Math.max(0, s - 1); tags.push('VIX≥20'); }
    }
    return { score: Math.min(3, Math.max(0, s)), tags };
  }

  function earningsGate(earn) {
    // earn: { daysToEarnings, when: 'bmo'|'amc'|null } optional
    if (!earn || earn.daysToEarnings == null) return { block: false, penalty: 0, tag: null };
    const d = earn.daysToEarnings;
    const when = String(earn.when || '').toLowerCase();
    // BMO same day or AMC overnight / today
    if (d === 0 && (when === 'bmo' || when === 'time-pre-market' || when.includes('pre'))) {
      return { block: true, penalty: 99, tag: 'EARN BMO azi' };
    }
    if (d === 0) return { block: true, penalty: 99, tag: 'EARN azi' };
    if (d === 1 && (when === 'amc' || when.includes('after'))) {
      return { block: false, penalty: 2, tag: 'EARN AMC mâine' };
    }
    if (d <= 1) return { block: false, penalty: 1, tag: 'EARN ≤1z' };
    return { block: false, penalty: 0, tag: null };
  }

  // ── state machine ────────────────────────────────────────────
  function loadStates() {
    try {
      const o = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
      return o && typeof o === 'object' ? o : {};
    } catch (e) { return {}; }
  }
  function saveStates(st) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(st)); } catch (e) {}
  }

  /**
   * @param {object} input
   * @param {string} input.symbol
   * @param {object|null} input.eb — computeEarlyBird result
   * @param {Array} input.bars5m — raw bars from D.fetchStock
   * @param {object} [input.regime]
   * @param {object} [input.earnings]
   * @param {object} [input.prev] — prior persisted state for symbol
   */
  function evaluate(input) {
    const now = Date.now();
    const sym = String(input.symbol || '').toUpperCase();
    const path = sessionPath(now);
    const struct = structureFromEb(input.eb);
    const bars = closedBars(input.bars5m || [], now);
    const trig = path === 'closed'
      ? { score: 0, tags: ['sesiune-închisă'], detail: {} }
      : computeTrigger(bars, path, now);
    const reg = regimeScore(input.regime || {});
    const eg = earningsGate(input.earnings || null);

    let penalty = eg.penalty || 0;
    if (trig.detail && trig.detail.gapBlock) penalty += 3;

    const total = struct.score + trig.score + reg.score - penalty;
    const prev = input.prev || null;

    let state = 'IDLE';
    let reason = struct.reason || '';
    const reasons = [];

    if (eg.block) {
      state = 'DEAD';
      reason = eg.tag || 'earnings gate';
    } else if (struct.ran) {
      state = 'DEAD';
      reason = '🏃 a fugit';
    } else if (prev && prev.state === 'FIRE' || prev && prev.state === 'MANAGE') {
      // manage lifecycle
      const firePx = prev.firePrice || (trig.detail && trig.detail.last);
      const lastPx = (trig.detail && trig.detail.last) || (struct.price) || firePx;
      const since = prev.fireTs ? (now - prev.fireTs) / 60000 : 0;
      const chg = firePx && lastPx ? ((lastPx - firePx) / firePx) * 100 : 0;
      const deadStruct = !struct.ok && !struct.confirmed;
      if (deadStruct || chg <= -2 || since > CFG.manageMaxMin || chg >= CFG.manageMaxPct) {
        state = 'DEAD';
        reason = deadStruct ? 'structure lost' : (chg <= -2 ? 'stop logic −2%' : 'time/target exit band');
      } else {
        state = 'MANAGE';
        reason = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '% de la FIRE · ' + Math.round(since) + 'm';
      }
    } else if (struct.ok && path !== 'closed' && !eg.block) {
      if (trig.score >= CFG.fireMinTrigger && total >= CFG.fireMinTotal && !trig.detail.gapBlock) {
        state = 'FIRE';
        reason = trig.tags.join(' · ') || 'trigger';
      } else {
        state = 'ARMED';
        reason = 'structure OK · așteaptă trigger 5m (' + trig.score + '/' + CFG.fireMinTrigger + ')';
      }
    } else if (struct.confirmed) {
      state = 'IDLE';
      reason = struct.reason;
    } else {
      state = 'IDLE';
      reason = struct.reason || 'idle';
    }

    if (eg.tag && state !== 'DEAD') reasons.push(eg.tag);
    reasons.push(...(trig.tags || []));
    reasons.push(...(reg.tags || []));

    const lastPx = (trig.detail && trig.detail.last) || struct.price || null;
    const out = {
      symbol: sym,
      state,
      path,
      sessionLabel: sessionLabel(now),
      structure: struct,
      trigger: trig,
      regime: reg,
      earnings: eg,
      score: { structure: struct.score, trigger: trig.score, regime: reg.score, penalty, total },
      reason,
      tags: reasons.filter(Boolean),
      price: lastPx,
      firePrice: state === 'FIRE' ? lastPx : (prev && (prev.state === 'FIRE' || prev.state === 'MANAGE') ? prev.firePrice : null),
      fireTs: state === 'FIRE'
        ? (prev && prev.state === 'FIRE' ? prev.fireTs : now)
        : (state === 'MANAGE' && prev ? prev.fireTs : null),
      invalid: trig.detail && trig.detail.orbLow != null ? trig.detail.orbLow
        : (trig.detail && trig.detail.vwap != null ? trig.detail.vwap * 0.995 : null),
      ts: now,
      // ipoteză explicită
      disclaimer: 'Praguri ipoteză — validează OOS (me-fire)'
    };
    return out;
  }

  // ── fetch + scan ─────────────────────────────────────────────
  async function fetchBars5m(symbol) {
    if (!global.D || typeof global.D.fetchStock !== 'function') {
      throw new Error('D.fetchStock indisponibil');
    }
    // 5d × 5m acoperă ORB + pre; includePrePost pentru PRE
    return global.D.fetchStock(symbol, {
      range: '5d',
      interval: '5m',
      prePost: true,
      ttl: CFG.barsTtlSec
    });
  }

  /**
   * Evaluează o listă de simboluri (WL). opts.ebMap[sym] = early bird cache.
   * opts.earnMap[sym] = { daysToEarnings, when }
   * opts.regime = { regimeLabel, vix }
   */
  async function scanList(symbols, opts) {
    opts = opts || {};
    const ebMap = opts.ebMap || {};
    const earnMap = opts.earnMap || {};
    const regime = opts.regime || readRegimeFromStorage();
    const states = loadStates();
    const list = (symbols || []).map((s) => String(s).toUpperCase()).filter(Boolean);
    const results = [];
    const queue = list.slice();
    const concurrency = opts.concurrency || 3;

    async function worker() {
      while (queue.length) {
        const sym = queue.shift();
        try {
          const bars = await fetchBars5m(sym);
          const eb = ebMap[sym] || ebMap[sym.toLowerCase()] || null;
          const ev = evaluate({
            symbol: sym,
            eb,
            bars5m: bars,
            regime,
            earnings: earnMap[sym] || null,
            prev: states[sym] || null
          });
          // persist state
          const prev = states[sym];
          const becameFire = ev.state === 'FIRE' && (!prev || prev.state !== 'FIRE' && prev.state !== 'MANAGE');
          states[sym] = {
            state: ev.state,
            firePrice: ev.firePrice,
            fireTs: ev.fireTs,
            score: ev.score.total,
            reason: ev.reason,
            ts: ev.ts
          };
          if (becameFire && global.LEDGER && ev.price > 0) {
            try { global.LEDGER.log('me-fire', sym, ev.price, '▶ FIRE ' + (ev.trigger.tags || []).join('+')); } catch (e) {}
          }
          results.push(ev);
        } catch (e) {
          results.push({
            symbol: sym,
            state: 'IDLE',
            path: sessionPath(),
            sessionLabel: sessionLabel(),
            structure: { ok: false, score: 0, reason: 'err' },
            trigger: { score: 0, tags: ['fetch-err'], detail: {} },
            regime: { score: 0, tags: [] },
            earnings: { block: false, penalty: 0 },
            score: { structure: 0, trigger: 0, regime: 0, penalty: 0, total: 0 },
            reason: (e && e.message) || 'fetch fail',
            tags: ['error'],
            price: null,
            error: true,
            ts: Date.now()
          });
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    saveStates(states);
    // sort: FIRE, MANAGE, ARMED, rest
    const rank = { FIRE: 0, MANAGE: 1, ARMED: 2, DEAD: 3, IDLE: 4 };
    results.sort((a, b) => (rank[a.state] ?? 9) - (rank[b.state] ?? 9) || (b.score.total - a.score.total));
    return results;
  }

  function readRegimeFromStorage() {
    try {
      const raw = localStorage.getItem('md_risk_regime');
      if (!raw) return { regimeLabel: null, vix: null };
      const o = JSON.parse(raw);
      // format flexible
      const label = o.label || o.regime || o.name || (typeof o === 'string' ? o : null);
      const vix = o.vix != null ? +o.vix : (o.VIX != null ? +o.VIX : null);
      return { regimeLabel: label, vix: isFinite(vix) ? vix : null };
    } catch (e) {
      return { regimeLabel: null, vix: null };
    }
  }

  function counts(results) {
    const c = { FIRE: 0, MANAGE: 0, ARMED: 0, DEAD: 0, IDLE: 0 };
    for (const r of results || []) {
      if (c[r.state] != null) c[r.state]++;
      else c.IDLE++;
    }
    return c;
  }

  global.EL = {
    CFG,
    STATE_KEY,
    etMinutes,
    etParts,
    sessionPath,
    sessionLabel,
    closedBars,
    structureFromEb,
    computeTrigger,
    regimeScore,
    earningsGate,
    evaluate,
    fetchBars5m,
    scanList,
    loadStates,
    saveStates,
    readRegimeFromStorage,
    counts
  };
})(typeof window !== 'undefined' ? window : globalThis);
