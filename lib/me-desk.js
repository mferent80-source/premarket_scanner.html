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

  global.MED = {
    CFG,
    esc,
    applySectorFireCap,
    attachRelativeSpy,
    concentrationStats,
    maybeTelegramConcentration,
    heatmapHtml,
    markHero
  };
})(typeof window !== 'undefined' ? window : globalThis);
