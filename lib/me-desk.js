// me-desk.js — politici + UI helpers Early Long Desk (MED.*)
// Soft gates / RS / concentrație / heatmap — pure functions + localStorage.
// Praguri = ipoteze (trader.md).
(function (global) {
  'use strict';

  const CFG = {
    maxFirePerSector: 2,       // soft cap: al 3-lea+ FIRE → ARMED + badge
    riskFireMin: 3,            // banner + Telegram la ≥3 pe același sector
    riskShare: 0.5,            // sau ≥50% din FIRE pe un sector (min 2)
    rsWeakPts: 1,              // dayChg ≤ spyChg − 1pp → RS weak
    riskTgKey: 'me_el_risk_tg_v1'
  };

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (m) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  /**
   * Soft cap: max N FIRE pe sector. Primii N (după scor) rămân FIRE;
   * restul devin ARMED cu tag cap-sector (nu se șterg din listă).
   */
  function applySectorFireCap(results, maxPer) {
    maxPer = maxPer != null ? maxPer : CFG.maxFirePerSector;
    const list = (results || []).slice();
    const bySec = new Map();
    list.forEach((r) => {
      if (!r || r.state !== 'FIRE') return;
      const sec = r.sector || 'Necunoscut';
      if (!bySec.has(sec)) bySec.set(sec, []);
      bySec.get(sec).push(r);
    });
    bySec.forEach((arr) => {
      arr.sort((a, b) => ((b.score && b.score.total) || 0) - ((a.score && a.score.total) || 0));
      arr.forEach((r, i) => {
        if (i < maxPer) return;
        r.state = 'ARMED';
        r.sectorCap = true;
        r.reason = (r.reason ? r.reason + ' · ' : '') + 'cap sector (max ' + maxPer + ' FIRE)';
        r.tags = (r.tags || []).concat(['cap-sector']);
        if (r._becameFire) r._becameFire = false; // nu spam Telegram pe demote
      });
    });
    return list;
  }

  /**
   * Atașează dayChg (din trigger detail gapPct sau price vs prev) și RS vs SPY.
   * Soft: FIRE cu RS slab (dayChg < spy − rsWeakPts) → ARMED + rs-weak.
   */
  function attachRelativeSpy(results, spyChg) {
    const spy = (typeof spyChg === 'number' && isFinite(spyChg)) ? spyChg : null;
    (results || []).forEach((r) => {
      let dayChg = null;
      if (r.trigger && r.trigger.detail && r.trigger.detail.gapPct != null) {
        dayChg = +r.trigger.detail.gapPct;
      }
      r.dayChg = dayChg;
      if (spy == null || dayChg == null) {
        r.rsSpy = null;
        r.rsWeak = false;
        return;
      }
      r.rsSpy = dayChg - spy;
      r.rsWeak = dayChg < spy - CFG.rsWeakPts;
      if (r.rsWeak && r.state === 'FIRE') {
        r.state = 'ARMED';
        r.reason = (r.reason ? r.reason + ' · ' : '') + 'RS slab vs SPY';
        r.tags = (r.tags || []).concat(['rs-weak']);
        if (r._becameFire) r._becameFire = false;
      }
    });
    return results;
  }

  /** Stats concentrație pentru banner + TG */
  function concentrationStats(groups, activeList) {
    const fires = (activeList || []).filter((r) => r && r.state === 'FIRE');
    if (fires.length < 2) return null;
    let best = null;
    (groups || []).forEach((g) => {
      if (!best || g.fire > best.fire) best = g;
    });
    if (!best || best.fire < 2) return null;
    const share = best.fire / fires.length;
    const hitHard = best.fire >= CFG.riskFireMin;
    const hitShare = share >= CFG.riskShare && best.fire >= 2;
    if (!hitHard && !hitShare) return null;
    return {
      sector: best.sector,
      fire: best.fire,
      totalFire: fires.length,
      pct: Math.round(share * 100),
      symbols: fires.filter((r) => (r.sector || '') === best.sector).map((r) => r.symbol)
    };
  }

  /**
   * Telegram o dată pe zi ET când apare concentrație.
   * @returns {boolean} true dacă a trimis acum
   */
  function maybeTelegramConcentration(stats, TG) {
    if (!stats || !TG || typeof TG.send !== 'function') return false;
    let day = '';
    try {
      day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    } catch (e) {
      day = new Date().toISOString().slice(0, 10);
    }
    try {
      const prev = JSON.parse(localStorage.getItem(CFG.riskTgKey) || '{}');
      if (prev.day === day && prev.sector === stats.sector) return false;
      localStorage.setItem(CFG.riskTgKey, JSON.stringify({ day, sector: stats.sector, ts: Date.now() }));
    } catch (e) {}
    const syms = (stats.symbols || []).slice(0, 8).join(', ');
    TG.send(
      `⚠ <b>Concentrare sector · Early Long</b>\n`
      + `<b>${esc(stats.sector)}</b>: ${stats.fire}/${stats.totalFire} FIRE (${stats.pct}%)\n`
      + (syms ? `tickers: ${esc(syms)}\n` : '')
      + `Risc corelație — nu oversize pe același theme.\n`
      + `<a href="https://mferent80-source.github.io/premarket_scanner.html/market-events/">Desk</a>`
    );
    return true;
  }

  /** HTML bare concentrație FIRE pe sector */
  function heatmapHtml(groups, opts) {
    opts = opts || {};
    const g = (groups || []).filter((x) => x.fire > 0 || x.armed > 0).slice(0, 8);
    if (!g.length) return '';
    const max = Math.max(1, ...g.map((x) => x.fire + x.armed * 0.35));
    return g.map((x) => {
      const w = Math.max(6, Math.round(((x.fire + x.armed * 0.35) / max) * 100));
      const active = opts.focus === x.sector ? ' active' : '';
      const label = x.sector.length > 16 ? x.sector.slice(0, 15) + '…' : x.sector;
      return `<button type="button" class="el-heat-row${active}" data-sector="${esc(x.sector)}" title="${esc(x.sector)}">
        <span class="el-heat-lab">${esc(label)}</span>
        <span class="el-heat-track"><span class="el-heat-bar" style="width:${w}%"></span></span>
        <span class="el-heat-n"><b class="f">${x.fire}</b>/${x.n}</span>
      </button>`;
    }).join('');
  }

  /**
   * Ordonează listă cu hero: primul FIRE (scor max) pe poziția 0 cu flag hero.
   */
  function markHero(results) {
    let best = null;
    (results || []).forEach((r) => {
      if (r.state !== 'FIRE') return;
      if (!best || ((r.score && r.score.total) || 0) > ((best.score && best.score.total) || 0)) best = r;
    });
    (results || []).forEach((r) => { r.hero = !!(best && r === best); });
    return results;
  }

  /** Preset sensibilitate (ipoteze) — aplicate pe EL.CFG */
  const SENS = {
    strict: { fireMinTotal: 8, fireMinTrigger: 4, label: 'Strict', hint: 'puține semnale, calitate' },
    normal: { fireMinTotal: 6, fireMinTrigger: 3, label: 'Normal', hint: 'default' },
    wide: { fireMinTotal: 4, fireMinTrigger: 2, label: 'Wide', hint: 'mai multe ARMED/FIRE (zgomot↑)' }
  };

  function applySensitivity(elCfg, mode) {
    const m = SENS[mode] || SENS.normal;
    if (!elCfg) return m;
    elCfg.fireMinTotal = m.fireMinTotal;
    elCfg.fireMinTrigger = m.fireMinTrigger;
    return m;
  }

  /**
   * Funnel: unde se blochează pipeline-ul (util când 0 FIRE).
   */
  function funnelStats(results, elCfg, path) {
    const list = results || [];
    const n = list.length;
    let structure = 0, soft = 0, nearT = 0, fire = 0, armed = 0, cap = 0, rsw = 0, err = 0;
    const minT = (elCfg && elCfg.fireMinTrigger) || 3;
    const minTot = (elCfg && elCfg.fireMinTotal) || 6;
    const near = [];
    list.forEach((r) => {
      if (!r) return;
      if (r.error) { err++; return; }
      if (r.state === 'FIRE') fire++;
      if (r.state === 'ARMED' || r.state === 'MANAGE') armed++;
      if (r.sectorCap) cap++;
      if (r.rsWeak) rsw++;
      const st = r.structure || {};
      if (st.ok) structure++;
      if (st.soft) soft++;
      const t = (r.score && r.score.trigger) || 0;
      const tot = (r.score && r.score.total) || 0;
      // near-miss: are structure, trigger aproape, nu e FIRE
      if (st.ok && r.state !== 'FIRE' && (t >= minT - 1 || tot >= minTot - 2)) {
        nearT++;
        near.push({
          symbol: r.symbol,
          t: t,
          total: tot,
          needT: minT,
          needTot: minTot,
          reason: r.reason || '',
          path: r.path || path || '',
          tags: r.tags || []
        });
      }
    });
    near.sort((a, b) => (b.total - a.total) || (b.t - a.t));
    // why no fire — mesaj onest pe sesiune
    const why = [];
    if (path === 'closed') why.push('Sesiune închisă — trigger 5m inactiv.');
    else if (path === 'pre_orb') {
      why.push('PRE/open window: ORB se formează după 09:30 ET (primele 3 bare RTH).');
      why.push('În PRE, FIRE vine doar din PRE-reclaim / HL+vol, nu din ORB.');
    } else if (path === 'late') {
      why.push('După 10:15 ET path late: fără ORB fresh — doar VWAP/HL.');
    }
    if (n && structure === 0) why.push('Nicio structure daily/soft pe hot-list (🌱 rar = normal).');
    if (structure > 0 && fire === 0) why.push('Structure există, dar trigger T < ' + minT + ' sau total < ' + minTot + '.');
    if (cap) why.push(cap + ' demotate de cap sector (max 2 FIRE/sector).');
    if (rsw) why.push(rsw + ' demotate de RS slab vs SPY.');
    if (!n) why.push('Hot-list gol — rulează Scan sau umple watchlist.');
    if (!why.length && fire === 0) why.push('Nicio bară 5m închisă nu a atins pragul — așteaptă sau treci pe Wide.');

    return {
      n, structure, soft, nearT, fire, armed, cap, rsw, err,
      minT, minTot, path: path || '',
      near: near.slice(0, 8),
      why,
      quiet: fire === 0 // UI poate ascunde heat/chips
    };
  }

  function funnelHtml(fun, opts) {
    opts = opts || {};
    if (!fun) return '';
    const steps = [
      { k: 'n', lab: 'Hot', v: fun.n },
      { k: 'structure', lab: 'Struct', v: fun.structure },
      { k: 'nearT', lab: 'Near', v: fun.nearT },
      { k: 'armed', lab: 'ARM', v: fun.armed },
      { k: 'fire', lab: 'FIRE', v: fun.fire }
    ];
    const stepsHtml = steps.map((s, i) =>
      `<span class="el-fun-step${s.v ? '' : ' zero'}"><b>${s.v}</b>${esc(s.lab)}</span>`
      + (i < steps.length - 1 ? '<span class="el-fun-arr">→</span>' : '')
    ).join('');
    const whyHtml = (fun.why || []).slice(0, 4).map((w) => `<li>${esc(w)}</li>`).join('');
    let nearHtml = '';
    if (fun.near && fun.near.length) {
      nearHtml = '<div class="el-near-title">Near-miss (aproape de FIRE)</div><div class="el-near-list">'
        + fun.near.map((x) =>
          `<div class="el-near-row"><span class="sym">${esc(x.symbol)}</span>`
          + `<span class="sc">T${x.t}/${x.needT} · Σ${x.total}/${x.needTot}</span>`
          + `<span class="why">${esc((x.reason || '').slice(0, 48))}</span></div>`
        ).join('')
        + '</div>';
    }
    return `<div class="el-funnel${fun.quiet ? ' quiet' : ''}" id="elFunnel">
      <div class="el-fun-steps">${stepsHtml}</div>
      <div class="el-fun-path">path: <b>${esc(fun.path || '—')}</b> · prag T≥${fun.minT} Σ≥${fun.minTot}</div>
      ${whyHtml ? `<ul class="el-fun-why">${whyHtml}</ul>` : ''}
      ${nearHtml}
    </div>`;
  }

  // ── Countdown ORB / fereastră open (ET) ─────────────────────
  function sessionClock(nowMs, elCfg) {
    nowMs = nowMs || Date.now();
    const rth = (elCfg && elCfg.rthStartMin) != null ? elCfg.rthStartMin : 9 * 60 + 30;
    const openEnd = (elCfg && elCfg.openEndMin) != null ? elCfg.openEndMin : 10 * 60 + 15;
    const preStart = (elCfg && elCfg.preStartMin) != null ? elCfg.preStartMin : 4 * 60;
    let parts;
    try {
      const p = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, weekday: 'short'
      }).formatToParts(new Date(nowMs));
      const g = (t) => +(p.find((x) => x.type === t) || {}).value;
      const wd = (p.find((x) => x.type === 'weekday') || {}).value;
      parts = { h: g('hour') % 24, mi: g('minute'), s: g('second'), wd };
    } catch (e) {
      const d = new Date(nowMs);
      parts = { h: d.getUTCHours(), mi: d.getUTCMinutes(), s: d.getUTCSeconds(), wd: '?' };
    }
    const mins = parts.h * 60 + parts.mi + parts.s / 60;
    const weekend = parts.wd === 'Sat' || parts.wd === 'Sun';
    function fmtLeft(secTotal) {
      if (secTotal <= 0) return '00:00';
      const h = Math.floor(secTotal / 3600);
      const m = Math.floor((secTotal % 3600) / 60);
      const s = Math.floor(secTotal % 60);
      if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
      return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    if (weekend) {
      return { phase: 'weekend', label: 'Weekend', sub: 'Fără RTH', leftSec: null, leftTxt: '—', pct: 0, orbActive: false };
    }
    // secunde până la un minut-of-day țintă (aceeași zi ET)
    function secUntil(targetMin) {
      const nowSec = parts.h * 3600 + parts.mi * 60 + parts.s;
      const tgt = targetMin * 60;
      return tgt - nowSec;
    }
    if (mins < preStart) {
      const left = secUntil(preStart);
      return { phase: 'pre-pre', label: 'Înainte de PRE', sub: 'PRE de la 04:00 ET', leftSec: left, leftTxt: fmtLeft(left), pct: 0, orbActive: false };
    }
    if (mins < rth) {
      const left = secUntil(rth);
      const span = (rth - preStart) * 60;
      const done = span - left;
      return {
        phase: 'pre',
        label: 'PRE → Open',
        sub: 'ORB după 09:30 ET (3×5m)',
        leftSec: left,
        leftTxt: fmtLeft(left),
        pct: Math.max(0, Math.min(100, Math.round((done / span) * 100))),
        orbActive: false
      };
    }
    if (mins < openEnd) {
      const left = secUntil(openEnd);
      const span = (openEnd - rth) * 60;
      const done = span - left;
      return {
        phase: 'orb',
        label: 'Fereastră ORB',
        sub: '09:30–10:15 ET · trigger ORB activ',
        leftSec: left,
        leftTxt: fmtLeft(left),
        pct: Math.max(0, Math.min(100, Math.round((done / span) * 100))),
        orbActive: true
      };
    }
    if (mins < 16 * 60) {
      return {
        phase: 'late',
        label: 'RTH late',
        sub: 'Fără ORB fresh · VWAP/HL',
        leftSec: secUntil(16 * 60),
        leftTxt: fmtLeft(secUntil(16 * 60)) + ' → close',
        pct: 100,
        orbActive: false
      };
    }
    return { phase: 'ah', label: 'After-hours / închis', sub: 'Trigger 5m limitat', leftSec: null, leftTxt: '—', pct: 0, orbActive: false };
  }

  function clockHtml(clk) {
    if (!clk) return '';
    const cls = clk.phase === 'orb' ? ' orb' : (clk.phase === 'pre' ? ' pre' : '');
    return `<div class="el-clock${cls}" id="elClock">
      <div class="el-clock-main">
        <span class="el-clock-lab">${esc(clk.label)}</span>
        <span class="el-clock-left">${esc(clk.leftTxt)}</span>
      </div>
      <div class="el-clock-sub">${esc(clk.sub)}</div>
      <div class="el-clock-bar"><span style="width:${clk.pct || 0}%"></span></div>
    </div>`;
  }

  // ── Near-miss → FIRE tracker (light, 30 min window) ────────
  const NM_KEY = 'me_el_nearmiss_track_v1';
  const NM_WINDOW_MS = 30 * 60 * 1000;

  function loadNmTrack() {
    try {
      const o = JSON.parse(localStorage.getItem(NM_KEY) || '{}');
      return o && typeof o === 'object' ? o : {};
    } catch (e) { return {}; }
  }
  function saveNmTrack(t) {
    try { localStorage.setItem(NM_KEY, JSON.stringify(t)); } catch (e) {}
  }

  /** Înregistrează near-miss; marchează hit dacă devine FIRE în 30 min. */
  function trackNearMiss(funnelNear, fireSymbols) {
    const now = Date.now();
    const track = loadNmTrack();
    const fireSet = new Set((fireSymbols || []).map((s) => String(s).toUpperCase()));
    // prune > 24h
    Object.keys(track).forEach((k) => {
      if (now - (track[k].ts || 0) > 24 * 3600000) delete track[k];
    });
    (funnelNear || []).forEach((n) => {
      const sym = String(n.symbol || '').toUpperCase();
      if (!sym) return;
      if (!track[sym] || now - track[sym].ts > NM_WINDOW_MS) {
        track[sym] = { ts: now, t: n.t, total: n.total, hit: false };
      }
    });
    Object.keys(track).forEach((sym) => {
      if (track[sym].hit) return;
      if (fireSet.has(sym) && now - track[sym].ts <= NM_WINDOW_MS) {
        track[sym].hit = true;
        track[sym].hitTs = now;
      }
    });
    saveNmTrack(track);
    return nearMissStats(track);
  }

  function nearMissStats(track) {
    track = track || loadNmTrack();
    const now = Date.now();
    let n = 0, hit = 0, pending = 0;
    Object.keys(track).forEach((k) => {
      const e = track[k];
      if (now - (e.ts || 0) > 24 * 3600000) return;
      n++;
      if (e.hit) hit++;
      else if (now - e.ts <= NM_WINDOW_MS) pending++;
    });
    const rate = n ? Math.round((hit / n) * 100) : null;
    return { n, hit, pending, rate, noise: n < 10 };
  }

  function nmStatsHtml(st) {
    if (!st || !st.n) {
      return '<div class="el-nm-stats">Near→FIRE 30m: <b>—</b> (fără eșantion)</div>';
    }
    const rateTxt = st.rate == null ? '—' : st.rate + '%';
    const warn = st.noise ? ' <span class="el-nm-noise">n&lt;10 zgomot</span>' : '';
    return `<div class="el-nm-stats">Near→FIRE 30m: <b>${rateTxt}</b> · hit ${st.hit}/${st.n} · pending ${st.pending}${warn}</div>`;
  }

  global.MED = {
    CFG,
    SENS,
    esc,
    applySectorFireCap,
    attachRelativeSpy,
    concentrationStats,
    maybeTelegramConcentration,
    heatmapHtml,
    markHero,
    applySensitivity,
    funnelStats,
    funnelHtml,
    sessionClock,
    clockHtml,
    trackNearMiss,
    nearMissStats,
    nmStatsHtml,
    loadNmTrack
  };
})(typeof window !== 'undefined' ? window : globalThis);
