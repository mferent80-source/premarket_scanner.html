// ═══════════════════════════════════════════════════════════════════
// governor.js — Risk Governor: kill switch zilnic, buget pierdere, max trades (GV.*)
// Citește jurnalul manual și controlul Invest, separat pe monedă; frână disciplinară, fără ordine către broker.
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
    tgOnRiskHalt: true,
    maxDdPctRolling: 10,
    ddRollingOn: true,
    maxLossPctWeek: 3,
    maxInstrumentPct: 20,
    maxTotalStopPct: 5
  };

  function etDay(ts){
    if (ts != null && (!Number.isFinite(ts) || ts <= 0)) return null;
    if (global.CT && typeof CT.etDay === 'function') { try { return CT.etDay(ts); } catch(e){ return null; } }
    try { return new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(ts ? new Date(ts) : new Date()); }
    catch(e){ return new Date(ts || Date.now()).toISOString().slice(0,10); }
  }

  function cfg(){
    let raw = {}, issues = [];
    try {
      raw = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('shape');
    } catch(e){ raw = {}; issues.push('configurație ilizibilă'); }
    const out = Object.assign({}, DEFAULTS, raw);
    if (global.ACCT && typeof ACCT.get === 'function') {
      try { out.accountSize = ACCT.get().value; } catch(e){ issues.push('capital neverificat'); }
    }
    issues.push(...cfgIssues(out));
    for (const key of cfgIssues(out)) out[key] = DEFAULTS[key];
    return { ...out, configIssues: issues };
  }
  function cfgIssues(c){
    const issues = [];
    for (const k of ['accountSize','maxLossPctDay','maxLossPctWeek','maxDdPctRolling','maxTradesDay','maxOpenPositions','cooldownAfterLosses','slippageEstPct','maxInstrumentPct','maxTotalStopPct']) {
      const v=c[k], count=['maxTradesDay','maxOpenPositions','cooldownAfterLosses'].includes(k);
      if (!Number.isFinite(v) || (k==='slippageEstPct'?v<0:v<=0) || v>Number.MAX_SAFE_INTEGER || (count&&!Number.isInteger(v)) || (/Pct/.test(k)&&v>100)) issues.push(k);
    }
    for (const k of ['ddRollingOn','tgOnHalt','tgOnRiskHalt']) if (typeof c[k]!=='boolean') issues.push(k);
    return issues;
  }
  function saveCfg(patch){
    const c = Object.assign({}, cfg(), patch || {});
    delete c.configIssues;
    if (cfgIssues(c).length) return null;
    try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch(e){ return null; }
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
    if (!e || ![e.entry,e.exit,e.size].every(v=>Number.isFinite(v)&&v>0) || (e.fees!=null&&(!Number.isFinite(e.fees)||e.fees<0)) || (e.quoteCurrency&&e.quoteCurrency!=='USD') || /\.[A-Z]{2,}$/.test(e.sym||'')) return null;
    const raw = (e.dir === 'short' ? (e.entry - e.exit) : (e.exit - e.entry)) * e.size;
    const net = raw - (e.fees || 0); return Number.isFinite(net) ? net : null;
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
    });
    return ids.size;
  }

  function openCount(){
    return journalEntries().filter(e => e && (e.status === 'open' || e.exit == null)).length;
  }

  function weekStartDay(){
    const et = etDay();
    const d = new Date(et + 'T12:00:00Z');
    const dow = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() - (dow - 1));
    return d.toISOString().slice(0, 10);
  }

  function weekPnl(){
    const start = weekStartDay();
    return journalEntries()
      .filter(e => e && e.exit != null && Number.isFinite(e.closeTs) && e.closeTs <= Date.now() && etDay(e.closeTs) >= start)
      .reduce((s, e) => { const p = pnlOf(e); return s + (p != null ? p : 0); }, 0);
  }

  function status(){
    const c = cfg();
    const day = etDay();
    const entries = journalEntries();
    const invalid = entries.filter(e => !e || !e.id || (global.JR?.validateEntry ? !JR.validateEntry(e).ok : ![e.entry,e.size].every(v=>Number.isFinite(v)&&v>0)) || (e.exit != null && (!Number.isFinite(e.closeTs)||e.closeTs<=0)));
    const duplicateIds = entries.filter(e=>e&&e.id).length - new Set(entries.filter(e=>e&&e.id).map(e=>String(e.id))).size;
    let unreadable=false; try { const a=JSON.parse(localStorage.getItem('tt_journal_v1')||'[]');unreadable=!Array.isArray(a); } catch(e){unreadable=true;}
    const closedToday = entries.filter(e => e && e.exit != null && Number.isFinite(e.closeTs) && e.closeTs <= Date.now() && etDay(e.closeTs) === day);
    const todayPnl = closedToday.reduce((s, e) => { const p = pnlOf(e); return s + (p != null ? p : 0); }, 0);
    const todayTrades = todayTradeCount();
    const maxLossUsd = c.accountSize * (c.maxLossPctDay / 100);
    const maxLossWeekUsd = c.accountSize * ((c.maxLossPctWeek || 3) / 100);
    const wkPnl = weekPnl();
    const weekBudgetUsedPct = maxLossWeekUsd > 0 ? Math.max(0, (-wkPnl / maxLossWeekUsd) * 100) : 0;
    const budgetUsedPct = maxLossUsd > 0 ? Math.max(0, (-todayPnl / maxLossUsd) * 100) : 0;
    const budgetLeftUsd = Math.max(0, maxLossUsd + todayPnl);

    // Streak de pierderi = cooldown pe FEREASTRA RECENTĂ (48h), nu peste tot
    // istoricul: altfel 3 pierderi eșalonate pe zile țineau HALT-ul activ la
    // nesfârșit (până la un câștig), contrazicând „kill switch zilnic".
    let consecutiveLosses = 0;
    const CONSEC_WINDOW_MS = 48 * 3600000;
    const nowMs = Date.now();
    const sorted = journalEntries()
      .filter(e => e && e.exit != null && Number.isFinite(e.closeTs) && e.closeTs <= nowMs)
      .sort((a, b) => (b.closeTs || 0) - (a.closeTs || 0));
    for (const e of sorted){
      if (nowMs - (e.closeTs || 0) > CONSEC_WINDOW_MS) break; // în afara ferestrei → cooldown expirat
      const p = pnlOf(e);
      if (p == null) continue;
      if (p < 0) consecutiveLosses++;
      else break;
    }

    const reasons = [];
    let verdict = 'TRADE';
    const recent = entries.filter(e => e && (e.exit == null || !e.closeTs || Date.now() - e.closeTs <= 7 * 86400000));
    const fxMissing = global.JR && JR.valuationIssues ? JR.valuationIssues(recent).length : recent.filter(e=>e.exit!=null&&pnlOf(e)==null).length;
    if (c.configIssues.length || invalid.length || duplicateIds || unreadable) {
      verdict='HALTED';
      if(c.configIssues.length)reasons.push('Limite Governor invalide: '+c.configIssues.join(', '));
      if(invalid.length||duplicateIds||unreadable)reasons.push('Jurnal neverificat: '+invalid.length+' rânduri invalide, '+duplicateIds+' ID-uri duplicate'+(unreadable?', stocare ilizibilă':''));
    }

    if (todayPnl <= -maxLossUsd){
      verdict = 'HALTED';
      reasons.push(`Pierdere zilnică ${todayPnl.toFixed(2)}$ ≥ buget −${maxLossUsd.toFixed(2)}$ (−${c.maxLossPctDay}%)`);
    } else if (budgetUsedPct >= 75){
      if (verdict === 'TRADE') verdict = 'CAUTION';
      reasons.push(`Buget zilnic consumat ${budgetUsedPct.toFixed(0)}%`);
    }
    if (wkPnl <= -maxLossWeekUsd){
      verdict = 'HALTED';
      reasons.push(`Pierdere săptămână ${wkPnl.toFixed(2)}$ ≥ buget −${maxLossWeekUsd.toFixed(2)}$ (−${c.maxLossPctWeek || 3}%)`);
    } else if (weekBudgetUsedPct >= 75){
      if (verdict === 'TRADE') verdict = 'CAUTION';
      reasons.push(`Buget săptămână consumat ${weekBudgetUsedPct.toFixed(0)}%`);
    }
    if (todayTrades >= c.maxTradesDay){
      if (verdict === 'TRADE') verdict = 'CAUTION';
      reasons.push(`Trade-uri azi: ${todayTrades}/${c.maxTradesDay}`);
      if (todayTrades >= c.maxTradesDay){ verdict = 'HALTED'; reasons.push('Max trade-uri/zi atins'); }
    }
    const open = openCount();
    if (open >= c.maxOpenPositions){
      verdict = 'HALTED';
      reasons.push(`Poziții deschise: ${open}/${c.maxOpenPositions} — max atins`);
    }
    if (consecutiveLosses >= c.cooldownAfterLosses){
      verdict = 'HALTED';
      reasons.push(`${consecutiveLosses} pierderi consecutive — cooldown activ`);
    }

    let rollingDdPct = null;
    if (c.ddRollingOn && global.EQ && typeof EQ.drawdownStats === 'function'){
      try { rollingDdPct = EQ.drawdownStats().currentDdPct; } catch(e){ verdict='HALTED';reasons.push('Drawdown rolling nu poate fi verificat'); }
      if (rollingDdPct != null && !Number.isFinite(rollingDdPct)) { verdict='HALTED';reasons.push('Drawdown rolling invalid'); }
      if (rollingDdPct >= c.maxDdPctRolling){
        verdict = 'HALTED';
        reasons.push(`DD rolling ${rollingDdPct.toFixed(1)}% ≥ prag ${c.maxDdPctRolling}%`);
      } else if (rollingDdPct >= c.maxDdPctRolling * 0.75){
        if (verdict === 'TRADE') verdict = 'CAUTION';
        reasons.push(`DD rolling ${rollingDdPct.toFixed(1)}% — aproape de prag`);
      }
    }

    if (fxMissing) { verdict = 'HALTED'; reasons.push(fxMissing + ' execuții cu monedă/FX incomplete — bugetul USD nu poate fi verificat'); }
    const broker = global.T212Capital?.read(c) || null;
    if (broker) {
      if (broker.verdict==='HALTED') verdict='HALTED';
      else if (broker.verdict==='CAUTION'&&verdict==='TRADE') verdict='CAUTION';
      reasons.push(...broker.reasons.map(r=>'Invest: '+r));
    }
    const out = {
      broker, source:broker?'Jurnal manual USD + Trading 212 Invest':'Jurnal manual USD', manualOpenCount:open,
      fxMissing,
      invalidEntries: invalid.length, duplicateIds, unreadable,
      verdict,
      reasons,
      todayPnl,
      todayTrades,
      tradesRemaining: Math.max(0, c.maxTradesDay - todayTrades),
      todayLossPct: c.accountSize > 0 ? (-todayPnl / c.accountSize * 100) : 0,
      maxLossUsd,
      budgetUsedPct,
      budgetLeftUsd:broker?.state==='ready'&&broker.currency==='USD'?Math.min(budgetLeftUsd,Math.max(0,broker.budgetLeft-broker.totalStopRisk),Math.max(0,broker.weekBudgetLeft-broker.totalStopRisk),broker.stopBudgetLeft):budgetLeftUsd,
      weekPnl: wkPnl,
      maxLossWeekUsd,
      weekBudgetUsedPct,
      openCount: broker?.positions??open,
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
