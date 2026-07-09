// ═══════════════════════════════════════════════════════════════════
// governor.js — Risk Governor: kill switch zilnic, buget pierdere, max trades (GV.*)
// Citește execuțiile din tt_journal_v1; nu blochează brokerul — frână disciplinară.
// Folosire: <script src="../lib/governor.js"></script>  GV.status(); GV.cfg();
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';
  const CFG_KEY = 'tt_governor_cfg_v1';
  const STATE_KEY = 'tt_governor_state_v1';

  const DEFAULTS = {
    accountSize: 10000,
    maxLossPctDay: 2,
    maxTradesDay: 5,
    maxOpenPositions: 4,
    cooldownAfterLosses: 3,
    slippageEstPct: 0.05
  };

  function etDay(ts){
    try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(ts ? new Date(ts) : new Date()); }
    catch(e){ return new Date(ts || Date.now()).toISOString().slice(0,10); }
  }

  function cfg(){
    try {
      const c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
      return Object.assign({}, DEFAULTS, c || {});
    } catch(e){ return Object.assign({}, DEFAULTS); }
  }
  function saveCfg(patch){
    const c = Object.assign(cfg(), patch || {});
    try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); return c; } catch(e){ return c; }
  }

  function journalEntries(){
    if (global.JR && typeof JR.all === 'function') return JR.all();
    try { const a = JSON.parse(localStorage.getItem('tt_journal_v1') || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }

  function pnlOf(e){
    if (global.JR && typeof JR.pnl === 'function') return JR.pnl(e);
    if (e.exit == null) return null;
    const raw = (e.dir === 'short' ? (e.entry - e.exit) : (e.exit - e.entry)) * e.size;
    return raw - (e.fees || 0);
  }

  function todayEntries(){
    const day = etDay();
    return journalEntries().filter(e => {
      if (!e) return false;
      const ts = e.closeTs || e.openTs;
      if (!ts) return false;
      return etDay(ts) === day;
    });
  }

  function openCount(){
    return journalEntries().filter(e => e && (e.status === 'open' || e.exit == null)).length;
  }

  function status(){
    const c = cfg();
    const today = todayEntries();
    const closedToday = today.filter(e => e.exit != null);
    const openedToday = today.filter(e => e.openTs && etDay(e.openTs) === etDay());
    const todayPnl = closedToday.reduce((s, e) => { const p = pnlOf(e); return s + (p != null ? p : 0); }, 0);
    const todayTrades = Math.max(closedToday.length, openedToday.length);
    const maxLossUsd = c.accountSize * (c.maxLossPctDay / 100);
    const lossPct = c.accountSize > 0 ? (-todayPnl / c.accountSize * 100) : 0;

    let consecutiveLosses = 0;
    const sorted = journalEntries()
      .filter(e => e && e.exit != null)
      .sort((a, b) => (b.closeTs || 0) - (a.closeTs || 0));
    for (const e of sorted){
      const p = pnlOf(e);
      if (p == null) continue;
      if (p < 0) consecutiveLosses++;
      else break;
    }

    const reasons = [];
    let verdict = 'TRADE';

    if (todayPnl <= -maxLossUsd){
      verdict = 'HALTED';
      reasons.push(`Pierdere zilnică ${todayPnl.toFixed(2)}$ ≥ buget −${maxLossUsd.toFixed(2)}$ (−${c.maxLossPctDay}%)`);
    }
    if (todayTrades >= c.maxTradesDay){
      if (verdict !== 'HALTED') verdict = 'CAUTION';
      reasons.push(`Trade-uri azi: ${todayTrades}/${c.maxTradesDay}`);
      if (todayTrades > c.maxTradesDay){ verdict = 'HALTED'; reasons.push('Max trade-uri/zi depășit'); }
    }
    const open = openCount();
    if (open >= c.maxOpenPositions){
      if (verdict === 'TRADE') verdict = 'CAUTION';
      reasons.push(`Poziții deschise: ${open}/${c.maxOpenPositions}`);
      if (open > c.maxOpenPositions){ verdict = 'HALTED'; }
    }
    if (consecutiveLosses >= c.cooldownAfterLosses){
      verdict = 'HALTED';
      reasons.push(`${consecutiveLosses} pierderi consecutive — cooldown activ`);
    }

    const out = {
      verdict,
      reasons,
      todayPnl,
      todayTrades,
      todayLossPct: lossPct,
      maxLossUsd,
      openCount: open,
      consecutiveLosses,
      cfg: c,
      day: etDay(),
      updatedAt: Date.now()
    };
    try { localStorage.setItem(STATE_KEY, JSON.stringify(out)); } catch(e){}
    return out;
  }

  function canTrade(){
    const s = status();
    return s.verdict !== 'HALTED';
  }

  function labelOf(v){
    if (v === 'HALTED') return { text: 'HALTED', cls: 'halted' };
    if (v === 'CAUTION') return { text: 'CAUTION', cls: 'caution' };
    return { text: 'TRADE', cls: 'trade' };
  }

  global.GV = { cfg, saveCfg, status, canTrade, etDay, labelOf, CFG_KEY, STATE_KEY, DEFAULTS };
})(typeof window !== 'undefined' ? window : globalThis);