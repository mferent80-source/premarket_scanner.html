// ═══════════════════════════════════════════════════════════════════
// governor.js — Risk Governor: kill switch zilnic, buget pierdere, max trades (GV.*)
// Citește execuțiile din tt_journal_v1; nu blochează brokerul — frână disciplinară.
// Folosire: <script src="../lib/governor.js"></script>  GV.status(); GV.cfg();
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';
  const CFG_KEY = 'tt_governor_cfg_v1';
  const STATE_KEY = 'tt_governor_state_v1';
  const ALERT_KEY = 'tt_governor_alert_day';

  const DEFAULTS = {
    accountSize: 10000,
    maxLossPctDay: 2,
    maxTradesDay: 5,
    maxOpenPositions: 4,
    cooldownAfterLosses: 3,
    slippageEstPct: 0.05,
    tgOnHalt: true,
    maxDdPctRolling: 10,
    ddRollingOn: true
  };

  function etDay(ts){
    try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(ts ? new Date(ts) : new Date()); }
    catch(e){ return new Date(ts || Date.now()).toISOString().slice(0,10); }
  }

  function cfg(){
    try {
      const c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
      const out = Object.assign({}, DEFAULTS, c || {});
      if (global.ACCT && typeof ACCT.get === 'function') out.accountSize = ACCT.get().value;
      return out;
    } catch(e){ return Object.assign({}, DEFAULTS); }
  }
  function saveCfg(patch){
    const c = Object.assign({}, cfg(), patch || {});
    try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch(e){}
    if (patch && patch.accountSize != null && global.ACCT && typeof ACCT.syncAll === 'function')
      ACCT.syncAll(patch.accountSize, 'governor');
    return c;
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

  function isToday(e){
    if (!e) return false;
    const day = etDay();
    if (e.openTs && etDay(e.openTs) === day) return true;
    if (e.closeTs && etDay(e.closeTs) === day) return true;
    return false;
  }

  function todayEntries(){
    return journalEntries().filter(isToday);
  }

  function todayTradeCount(){
    const day = etDay();
    const ids = new Set();
    journalEntries().forEach(e => {
      if (!e) return;
      if (e.openTs && etDay(e.openTs) === day) ids.add(e.id);
      if (e.closeTs && etDay(e.closeTs) === day) ids.add(e.id);
    });
    return ids.size;
  }

  function openCount(){
    return journalEntries().filter(e => e && (e.status === 'open' || e.exit == null)).length;
  }

  function status(){
    const c = cfg();
    const day = etDay();
    const closedToday = todayEntries().filter(e => e.exit != null);
    const todayPnl = closedToday.reduce((s, e) => { const p = pnlOf(e); return s + (p != null ? p : 0); }, 0);
    const todayTrades = todayTradeCount();
    const maxLossUsd = c.accountSize * (c.maxLossPctDay / 100);
    const budgetUsedPct = maxLossUsd > 0 ? Math.max(0, (-todayPnl / maxLossUsd) * 100) : 0;
    const budgetLeftUsd = Math.max(0, maxLossUsd + todayPnl);

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
    } else if (budgetUsedPct >= 75){
      verdict = 'CAUTION';
      reasons.push(`Buget zilnic consumat ${budgetUsedPct.toFixed(0)}%`);
    }
    if (todayTrades >= c.maxTradesDay){
      if (verdict === 'TRADE') verdict = 'CAUTION';
      reasons.push(`Trade-uri azi: ${todayTrades}/${c.maxTradesDay}`);
      if (todayTrades >= c.maxTradesDay){ verdict = 'HALTED'; reasons.push('Max trade-uri/zi atins'); }
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

    let rollingDdPct = null;
    if (c.ddRollingOn && global.EQ && typeof EQ.drawdownStats === 'function'){
      rollingDdPct = EQ.drawdownStats().currentDdPct;
      if (rollingDdPct >= c.maxDdPctRolling){
        verdict = 'HALTED';
        reasons.push(`DD rolling ${rollingDdPct.toFixed(1)}% ≥ prag ${c.maxDdPctRolling}%`);
      } else if (rollingDdPct >= c.maxDdPctRolling * 0.75){
        if (verdict === 'TRADE') verdict = 'CAUTION';
        reasons.push(`DD rolling ${rollingDdPct.toFixed(1)}% — aproape de prag`);
      }
    }

    const out = {
      verdict,
      reasons,
      todayPnl,
      todayTrades,
      tradesRemaining: Math.max(0, c.maxTradesDay - todayTrades),
      todayLossPct: c.accountSize > 0 ? (-todayPnl / c.accountSize * 100) : 0,
      maxLossUsd,
      budgetUsedPct,
      budgetLeftUsd,
      openCount: open,
      consecutiveLosses,
      rollingDdPct,
      cfg: c,
      day,
      updatedAt: Date.now()
    };
    try { localStorage.setItem(STATE_KEY, JSON.stringify(out)); } catch(e){}
    return out;
  }

  async function maybeNotifyHalted(s){
    s = s || status();
    if (s.verdict !== 'HALTED' || !s.cfg.tgOnHalt || !global.TG) return false;
    try {
      if (localStorage.getItem(ALERT_KEY) === s.day) return false;
      const ok = await TG.send(
        `🛑 <b>Governor HALTED</b>\nPnL azi: <b>${s.todayPnl.toFixed(2)}$</b>\n${s.reasons.slice(0, 3).join('\n')}`,
        { force: false }
      );
      if (ok) localStorage.setItem(ALERT_KEY, s.day);
      return ok;
    } catch(e){ return false; }
  }

  function canTrade(){
    return status().verdict !== 'HALTED';
  }

  function labelOf(v){
    if (v === 'HALTED') return { text: 'HALTED', cls: 'halted' };
    if (v === 'CAUTION') return { text: 'CAUTION', cls: 'caution' };
    return { text: 'TRADE', cls: 'trade' };
  }

  global.GV = {
    cfg, saveCfg, status, canTrade, etDay, labelOf, maybeNotifyHalted,
    todayEntries, todayTradeCount, pnlOf,
    CFG_KEY, STATE_KEY, DEFAULTS
  };
})(typeof window !== 'undefined' ? window : globalThis);