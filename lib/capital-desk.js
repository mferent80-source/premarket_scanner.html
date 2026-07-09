// ═══════════════════════════════════════════════════════════════════
// capital-desk.js v4 — statistici unificate Equity + Journal + Portfolio (CD.*)
// I-089..I-112: live risk, gate, export JSON, alertă risc, post-trade sync
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';

  const LIVE_KEY = 'tt_cd_live_v1';
  const WEEKLY_SNAP_KEY = 'tt_weekly_capital_v1';
  const RISK_FLAG_KEY = 'tt_capital_risk_flag_v1';
  const RISK_ALERT_KEY = 'tt_capital_risk_alert_day';
  const RESCAN_KEY = 'tt_cd_rescan_v1';
  const BC_CHANNEL = 'tt-capital-desk';
  const LIVE_STALE_MS = 30 * 60 * 1000;
  const RISK_HALT_PCT = 4;
  const RISK_WARN_PCT = 2;

  let _bc = null;
  try { if (typeof BroadcastChannel !== 'undefined') _bc = new BroadcastChannel(BC_CHANNEL); } catch (e) {}

  function accountSize(){
    if (global.ACCT && typeof ACCT.get === 'function') return ACCT.get().value || 0;
    if (global.EQ && typeof EQ.cfgAccount === 'function') return EQ.cfgAccount();
    return 10000;
  }

  function fmtUsd(v){
    if (v == null || !isFinite(v)) return '—';
    return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) < 1 ? 2 : 0 });
  }

  function etDay(ts){
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(ts ? new Date(ts) : new Date()); }
    catch (e) { return new Date(ts || Date.now()).toISOString().slice(0, 10); }
  }

  function isoWeekKey(ts){
    const d = new Date(ts || Date.now());
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = x.getDay() || 7;
    x.setDate(x.getDate() + 4 - day);
    const y = x.getFullYear();
    const w = Math.floor((x - new Date(y, 0, 1)) / 604800000) + 1;
    return y + '-W' + String(w).padStart(2, '0');
  }

  function weekStartMs(){
    const now = new Date();
    const et = etDay(now);
    const d = new Date(et + 'T12:00:00');
    const dow = d.getDay() || 7;
    d.setDate(d.getDate() - (dow - 1));
    d.setHours(0, 0, 0, 0);
    return d.getTime() - 86400000;
  }

  function journalAll(){
    if (global.JR && typeof JR.all === 'function') return JR.all();
    try {
      const a = JSON.parse(localStorage.getItem('tt_journal_v1') || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) { return []; }
  }

  function isOpen(e){
    return !!e && (e.status === 'open' || e.exit == null);
  }

  function readLive(){
    try {
      const o = JSON.parse(localStorage.getItem(LIVE_KEY) || 'null');
      if (!o || !o.ts) return null;
      if (Date.now() - o.ts > LIVE_STALE_MS) return Object.assign({}, o, { stale: true });
      return o;
    } catch (e) { return null; }
  }

  function writeLiveRisk(data){
    const rec = Object.assign({ ts: Date.now() }, data || {});
    try { localStorage.setItem(LIVE_KEY, JSON.stringify(rec)); } catch (e) {}
    writeRiskFlag();
    notifyChange();
    return rec;
  }

  function writeRiskFlag(){
    const b = unified();
    const pf = b.portfolio;
    const halt = pf.riskPct != null && pf.riskPct >= RISK_HALT_PCT;
    const payload = {
      halt, warn: pf.riskPct != null && pf.riskPct >= RISK_WARN_PCT,
      riskPct: pf.riskPct, riskUsd: pf.riskUse, account: b.account,
      openCount: pf.count, liveStale: pf.liveStale, verdict: b.governor.verdict,
      ts: Date.now()
    };
    try { localStorage.setItem(RISK_FLAG_KEY, JSON.stringify(payload)); } catch (e) {}
    return payload;
  }

  function serverRiskPayload(){
    const b = unified();
    const pf = b.portfolio;
    return {
      armed: !!(pf.riskPct != null && pf.riskPct >= RISK_HALT_PCT),
      riskPct: pf.riskPct,
      riskUsd: pf.riskUse,
      account: b.account,
      openCount: pf.count,
      verdict: b.governor.verdict,
      topRisk: (b.topRisk || []).map(t => ({ sym: t.sym, risk: t.risk })),
      updatedAt: new Date().toISOString(),
      note: 'Paste into tools/capital-risk.json — check-alerts.mjs sends Telegram when armed:true'
    };
  }

  async function copyServerRiskPayload(){
    const payload = serverRiskPayload();
    const txt = JSON.stringify(payload, null, 2);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(txt);
        return true;
      }
    } catch (e) {}
    try {
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch (e) { return false; }
  }

  async function maybeNotifyRisk(){
    const flag = writeRiskFlag();
    if (!flag.halt || !global.TG) return false;
    const gv = global.GV && GV.cfg ? GV.cfg() : null;
    if (gv && gv.tgOnRiskHalt === false) return false;
    const day = etDay();
    try {
      if (localStorage.getItem(RISK_ALERT_KEY) === day) return false;
      const top = (unified().topRisk || []).slice(0, 3).map(t => t.sym + ' ' + fmtUsd(t.risk)).join(' · ');
      const msg = `🛡️ <b>Risc agregat ≥${RISK_HALT_PCT}%</b>\nRisc @SL: <b>${fmtUsd(flag.riskUsd)}</b> · <b>${flag.riskPct != null ? flag.riskPct.toFixed(1) : '?'}%</b> cont\n${flag.openCount} poz open${top ? '\n' + top : ''}${flag.verdict === 'HALTED' ? '\n🛑 Desk HALTED' : ''}`;
      const ok = await TG.send(msg, { force: false });
      if (ok) localStorage.setItem(RISK_ALERT_KEY, day);
      return ok;
    } catch (e) { return false; }
  }

  function exportBundle(opts){
    opts = opts || {};
    const b = unified(opts);
    return {
      schema: 'capital-desk-v1',
      suite: global.SUITE_VERSION_SHORT || 'tt-v?',
      exportedAt: new Date().toISOString(),
      bundle: b
    };
  }

  function exportJson(opts){
    return JSON.stringify(exportBundle(opts), null, 2);
  }

  function downloadExport(opts){
    const blob = new Blob([exportJson(opts)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'capital-desk-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return true;
  }

  function markRescanNeeded(reason){
    try {
      localStorage.setItem(RESCAN_KEY, JSON.stringify({ ts: Date.now(), reason: reason || 'journal' }));
    } catch (e) {}
  }

  function needsPortfolioRescan(){
    try {
      const o = JSON.parse(localStorage.getItem(RESCAN_KEY) || 'null');
      return !!(o && o.ts && Date.now() - o.ts < 86400000);
    } catch (e) { return false; }
  }

  function clearRescanFlag(){
    try { localStorage.removeItem(RESCAN_KEY); } catch (e) {}
  }

  function onPostTrade(trade){
    saveWeeklySnapshot();
    writeRiskFlag();
    if (trade && trade.status === 'closed') markRescanNeeded('close:' + (trade.sym || ''));
    notifyChange();
  }

  function portfolioStatic(){
    const open = journalAll().filter(isOpen);
    let totNotional = 0, totRisk = 0, count = 0, noSl = 0;
    const rows = [];
    open.forEach(e => {
      const entry = parseFloat(e.entry), size = parseFloat(e.size), sl = parseFloat(e.slAtEntry);
      if (!(entry > 0) || !(size > 0)) return;
      count++;
      const notional = entry * size;
      totNotional += notional;
      let risk = null;
      if (sl != null && isFinite(sl)) {
        risk = e.dir === 'short' ? Math.max(0, (sl - entry) * size) : Math.max(0, (entry - sl) * size);
        totRisk += risk;
      } else noSl++;
      rows.push({ id: e.id, sym: e.sym, dir: e.dir, entry, size, sl: isFinite(sl) ? sl : null, notional, riskAtSl: risk });
    });
    const acct = accountSize();
    const live = readLive();
    let totRiskLive = live && !live.stale ? live.totRisk : null;
    let totNotionalLive = live && !live.stale ? live.totNotional : null;
    if (totRiskLive == null && live && live.stale) totRiskLive = live.totRisk;
    const riskUse = totRiskLive != null ? totRiskLive : totRisk;
    const riskPct = acct > 0 ? riskUse / acct * 100 : null;
    const staticPct = acct > 0 ? totRisk / acct * 100 : null;
    return {
      count, totNotional, totRisk, totNotionalLive, totRiskLive, riskUse,
      noSl, rows, live, liveStale: !!(live && live.stale),
      exposurePct: acct > 0 ? (totNotionalLive != null ? totNotionalLive : totNotional) / acct * 100 : null,
      riskPct, staticPct,
      riskDeltaPct: (totRiskLive != null && totRisk > 0) ? ((totRiskLive - totRisk) / totRisk * 100) : null
    };
  }

  function topRiskRows(pf, n){
    n = n || 3;
    const live = pf.live;
    const map = {};
    if (live && live.rows) {
      live.rows.forEach(r => { if (r.sym) map[r.sym] = r.riskNow; });
    }
    const items = (pf.rows || []).map(r => {
      const risk = map[r.sym] != null ? map[r.sym] : r.riskAtSl;
      return { sym: r.sym, risk: risk || 0, id: r.id, live: map[r.sym] != null };
    }).filter(x => x.risk > 0).sort((a, b) => b.risk - a.risk);
    const total = items.reduce((s, x) => s + x.risk, 0);
    return items.slice(0, n).map(x => Object.assign({}, x, { pct: total > 0 ? x.risk / total * 100 : 0 }));
  }

  function rUsdMedian(){
    const closed = journalAll().filter(e => e && e.exit != null && e.slAtEntry != null);
    const rs = [];
    closed.forEach(e => {
      const r0 = Math.abs(e.entry - e.slAtEntry) * e.size;
      if (r0 > 0) rs.push(r0);
    });
    if (rs.length >= 5) {
      const sorted = rs.slice().sort((a, b) => a - b);
      return sorted[Math.floor(sorted.length / 2)];
    }
    const acct = accountSize();
    return acct > 0 ? acct * 0.01 : 100;
  }

  function feesStats(){
    const closed = journalAll().filter(e => e && e.exit != null);
    let fees = 0, grossWins = 0, grossLoss = 0;
    closed.forEach(e => {
      fees += parseFloat(e.fees) || 0;
      const raw = (e.dir === 'short' ? (e.entry - e.exit) : (e.exit - e.entry)) * e.size;
      if (raw > 0) grossWins += raw;
      else grossLoss += -raw;
    });
    const gross = grossWins + grossLoss;
    return {
      fees, n: closed.length,
      pctOfGross: gross > 0 ? fees / gross * 100 : null,
      pctOfWins: grossWins > 0 ? fees / grossWins * 100 : null,
      warn: grossWins > 0 && fees / grossWins > 0.15
    };
  }

  function journalSlice(){
    const all = journalAll();
    const closed = all.filter(e => e && e.exit != null);
    const open = all.filter(isOpen);
    const stats = global.JR && typeof JR.stats === 'function' ? JR.stats(closed) : { n: 0 };
    let todayPnl = 0;
    if (global.GV && typeof GV.todayEntries === 'function') {
      GV.todayEntries().forEach(e => {
        const p = GV.pnlOf ? GV.pnlOf(e) : null;
        if (p != null) todayPnl += p;
      });
    }
    const ws = weekStartMs();
    let weekPnl = 0;
    closed.forEach(e => {
      if ((e.closeTs || 0) >= ws) {
        const p = global.JR && JR.pnl ? JR.pnl(e) : null;
        if (p != null) weekPnl += p;
      }
    });
    return { total: all.length, closed: closed.length, open: open.length, stats, todayPnl, weekPnl };
  }

  function equitySlice(unrealized){
    if (!global.EQ) {
      return {
        simulated: accountSize(), estimated: accountSize(), currentDdPct: 0, maxDdPct: 0,
        driftPct: null, driftWarn: false, realized: 0, unrealized: unrealized || 0, hasSnapshot: false
      };
    }
    const dd = EQ.drawdownStats();
    const dr = EQ.drift();
    const unreal = unrealized || 0;
    return {
      simulated: dd.current,
      estimated: dd.current + unreal,
      currentDdPct: dd.currentDdPct,
      maxDdPct: dd.maxDdPct,
      daysInDd: dd.daysInDd,
      driftPct: dr.driftPct,
      driftUsd: dr.driftUsd,
      driftWarn: dr.warn,
      driftStale: dr.stale,
      realized: EQ.realizedTotal(),
      unrealized: unreal,
      hasSnapshot: !!dr.snapshot,
      snapshotAgeDays: dr.snapshotAgeDays
    };
  }

  function governorSlice(){
    if (!global.GV || typeof GV.status !== 'function') return { verdict: null, label: '—', cls: '' };
    const s = GV.status();
    const lb = GV.labelOf ? GV.labelOf(s.verdict) : { text: s.verdict, cls: 'trade' };
    return {
      verdict: s.verdict,
      label: lb.text,
      cls: lb.cls,
      consecutiveLosses: s.consecutiveLosses,
      rollingDdPct: s.rollingDdPct,
      budgetUsedPct: s.budgetUsedPct,
      weekPnl: s.weekPnl,
      maxLossWeekUsd: s.maxLossWeekUsd,
      weekBudgetUsedPct: s.weekBudgetUsedPct,
      maxLossUsd: s.maxLossUsd,
      todayPnl: s.todayPnl
    };
  }

  function rBudgetSlice(pf, gov){
    const rUsd = rUsdMedian();
    const maxLoss = gov && gov.maxLossUsd != null ? gov.maxLossUsd : (global.GV ? GV.status().maxLossUsd : accountSize() * 0.02);
    const todayPnl = gov && gov.todayPnl != null ? gov.todayPnl : (global.GV ? GV.status().todayPnl : 0);
    const leftUsd = Math.max(0, maxLoss + todayPnl);
    const rLeft = rUsd > 0 ? leftUsd / rUsd : null;
    const openR = rUsd > 0 && pf.riskUse > 0 ? pf.riskUse / rUsd : null;
    return { rUsd, rLeft, openR, leftUsd };
  }

  function hubLinks(){
    const root = (typeof location !== 'undefined' && location.pathname && location.pathname.indexOf('/shell/') >= 0) ? '../' : './';
    return {
      journal: root + 'journal/',
      equity: root + 'equity/',
      portfolio: root + 'portfolio/',
      desk: root + 'journal/#desk',
      hub: root
    };
  }

  function unified(opts){
    opts = opts || {};
    const pf = portfolioStatic();
    const govRaw = global.GV && GV.status ? GV.status() : null;
    const gov = governorSlice();
    const jr = journalSlice();
    const fees = feesStats();
    const rBudget = rBudgetSlice(pf, govRaw);
    const topRisk = topRiskRows(pf, 3);
    return {
      ts: Date.now(),
      weekKey: isoWeekKey(),
      account: accountSize(),
      journal: jr,
      equity: equitySlice(opts.unrealized),
      portfolio: pf,
      governor: gov,
      fees,
      rBudget,
      topRisk,
      links: hubLinks()
    };
  }

  function riskCls(pct){
    if (pct == null) return '';
    if (pct >= RISK_HALT_PCT) return 'neg';
    if (pct >= RISK_WARN_PCT) return 'warn';
    return 'pos';
  }

  function railCells(bundle, page){
    const b = bundle || unified();
    const eq = b.equity;
    const pf = b.portfolio;
    const jr = b.journal;
    const s = jr.stats || {};
    const gov = b.governor || {};
    const rb = b.rBudget || {};
    const fees = b.fees || {};
    const riskVal = pf.totRiskLive != null && !pf.liveStale ? pf.totRiskLive : pf.totRisk;
    const riskLbl = pf.totRiskLive != null ? (pf.liveStale ? 'live (stale)' : 'live') : 'static';
    let riskSub = pf.riskPct != null ? pf.riskPct.toFixed(1) + '% cont · ' + riskLbl : '—';
    if (pf.totRiskLive != null && pf.totRisk > 0 && Math.abs(pf.riskDeltaPct) >= 15) {
      riskSub += ' · Δ' + (pf.riskDeltaPct >= 0 ? '+' : '') + pf.riskDeltaPct.toFixed(0) + '%';
    }
    if (pf.noSl) riskSub += ' · ' + pf.noSl + ' fără SL';

    const weekSub = gov.weekBudgetUsedPct != null
      ? gov.weekBudgetUsedPct.toFixed(0) + '% buget · ' + (jr.weekPnl >= 0 ? '+' : '') + fmtUsd(jr.weekPnl)
      : (jr.weekPnl >= 0 ? '+' : '') + fmtUsd(jr.weekPnl);

    return [
      { key: 'equity', lbl: 'EQUITY EST.', val: fmtUsd(eq.estimated), sub: 'sim ' + fmtUsd(eq.simulated), cls: '', href: b.links.equity, active: page === 'equity' },
      { key: 'dd', lbl: 'DD CURENT', val: (eq.currentDdPct || 0).toFixed(1) + '%', sub: 'max ' + (eq.maxDdPct || 0).toFixed(1) + '%', cls: eq.currentDdPct > 5 ? 'warn' : '', href: b.links.equity },
      { key: 'desk', lbl: 'RISK DESK', val: gov.label || '—', sub: gov.verdict === 'HALTED' ? (gov.consecutiveLosses + ' pierderi / DD') : (gov.budgetUsedPct != null ? gov.budgetUsedPct.toFixed(0) + '% buget zi' : '—'), cls: gov.verdict === 'HALTED' ? 'neg' : gov.verdict === 'CAUTION' ? 'warn' : 'pos', href: b.links.desk },
      { key: 'risk', lbl: 'RISC @ SL', val: fmtUsd(riskVal), sub: riskSub, cls: riskCls(pf.riskPct), href: b.links.portfolio, active: page === 'portfolio' },
      { key: 'rleft', lbl: 'R RĂMAS AZI', val: rb.rLeft != null ? rb.rLeft.toFixed(1) + 'R' : '—', sub: rb.openR != null ? 'open ≈ ' + rb.openR.toFixed(1) + 'R' : 'fără SL = incomplet', cls: rb.rLeft != null && rb.rLeft < 0.5 ? 'neg' : '', href: b.links.desk },
      { key: 'expect', lbl: 'EXP. R', val: s.expectancyR != null ? (s.expectancyR >= 0 ? '+' : '') + s.expectancyR.toFixed(2) + 'R' : '—', sub: 'n=' + (s.n || 0) + (fees.warn ? ' · fees!' : ''), cls: s.expectancyR == null ? '' : s.expectancyR >= 0 ? 'pos' : 'neg', href: b.links.journal, active: page === 'journal' },
      { key: 'week', lbl: 'SĂPTĂMÂNA', val: (jr.weekPnl >= 0 ? '+' : '') + fmtUsd(jr.weekPnl), sub: weekSub, cls: jr.weekPnl < 0 ? 'neg' : 'pos', href: b.links.equity },
      { key: 'today', lbl: 'PnL AZI', val: (jr.todayPnl >= 0 ? '+' : '') + fmtUsd(jr.todayPnl), sub: fees.fees > 0 ? 'fees ' + fmtUsd(fees.fees) + (fees.pctOfWins != null ? ' · ' + fees.pctOfWins.toFixed(0) + '% wins' : '') : 'journal azi', cls: jr.todayPnl >= 0 ? 'pos' : 'neg', href: b.links.desk },
      { key: 'drift', lbl: 'DRIFT', val: eq.driftPct != null ? (eq.driftPct >= 0 ? '+' : '') + eq.driftPct.toFixed(1) + '%' : '—', sub: eq.hasSnapshot ? 'vs snapshot' : 'fără snap', cls: eq.driftWarn ? 'warn' : '', href: b.links.equity },
      { key: 'exposure', lbl: 'EXPUNERE', val: fmtUsd(pf.totNotionalLive != null ? pf.totNotionalLive : pf.totNotional), sub: pf.exposurePct != null ? pf.exposurePct.toFixed(0) + '% · ' + pf.count + ' poz' : pf.count + ' poz', cls: pf.exposurePct > 100 ? 'warn' : '', href: b.links.portfolio }
    ];
  }

  function renderTopRisk(el, bundle){
    if (!el) return;
    const b = bundle || unified();
    const top = b.topRisk || [];
    const pf = b.portfolio;
    const total = pf.riskUse || 0;
    if (!top.length) { el.innerHTML = ''; el.style.display = 'none'; return; }
    el.style.display = '';
    const warn = top[0] && top[0].pct > 50 && top.length >= 2;
    el.innerHTML = '<div class="cd-top-lbl">Concentrare risc</div>' + top.map(t =>
      '<a href="' + b.links.portfolio + '?sym=' + encodeURIComponent(t.sym) + '" class="cd-top-row" title="' + t.sym + '">' +
      '<span class="cd-top-sym">' + t.sym + '</span>' +
      '<span class="cd-top-bar"><span style="width:' + Math.min(100, t.pct) + '%"></span></span>' +
      '<span class="cd-top-val">' + fmtUsd(t.risk) + ' · ' + t.pct.toFixed(0) + '%</span></a>'
    ).join('') + (warn ? '<div class="cd-top-warn">⚠ ' + top[0].sym + ' = ' + top[0].pct.toFixed(0) + '% din risc total</div>' : '') +
      (pf.noSl ? '<div class="cd-top-warn">' + pf.noSl + ' poz fără SL — risc incomplet</div>' : '');
  }

  function injectStyles(){
    if (document.getElementById('cd-rail-style')) return;
    const st = document.createElement('style');
    st.id = 'cd-rail-style';
    st.textContent = [
      '.cd-rail{background:var(--panel,#141a28);border:1px solid var(--b1,#2a3247);border-radius:var(--r,12px);padding:11px 13px;margin-bottom:12px}',
      '.cd-rail-hdr{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:9px}',
      '.cd-title{font-size:12.5px;font-weight:800;font-family:var(--head,Sora,sans-serif)}',
      '.cd-nav{margin-left:auto;display:flex;gap:5px}',
      '.cd-tab{display:inline-flex;align-items:center;justify-content:center;width:30px;height:28px;border-radius:6px;border:1px solid var(--b1,#2a3247);background:var(--panel2,#1d2537);text-decoration:none;font-size:14px;opacity:.75}',
      '.cd-tab.on,.cd-tab:hover{opacity:1;border-color:var(--accent,#5bb0ff);background:rgba(91,176,255,.12)}',
      '.cd-cells{display:grid;grid-template-columns:repeat(auto-fit,minmax(108px,1fr));gap:8px}',
      '.cd-cell{display:block;background:var(--panel2,#1d2537);border:1px solid var(--b1,#2a3247);border-radius:var(--rs,8px);padding:9px 10px;text-decoration:none;color:inherit;transition:border-color .15s,transform .15s}',
      '.cd-cell:hover{border-color:var(--accent,#5bb0ff);transform:translateY(-1px)}',
      '.cd-cell.active{border-color:rgba(91,176,255,.45);box-shadow:0 0 0 1px rgba(91,176,255,.2)}',
      '.cd-cell.warn{border-color:rgba(212,137,44,.5)}',
      '.cd-cell.neg{border-color:rgba(255,77,77,.45)}',
      '.cd-cell.pos .cd-val{color:var(--bull-s,#22d66b)}',
      '.cd-cell.neg .cd-val{color:var(--bear-s,#ff4d4d)}',
      '.cd-cell.warn .cd-val{color:var(--warn,#d4892c)}',
      '.cd-lbl{font-family:var(--mono,monospace);font-size:9.5px;color:var(--t3,#a3adc1);font-weight:700;letter-spacing:.04em}',
      '.cd-val{font-family:var(--head,Sora,sans-serif);font-size:17px;font-weight:800;margin-top:2px;line-height:1.1}',
      '.cd-sub{font-family:var(--mono,monospace);font-size:9.5px;color:var(--t2,#cdd5e2);margin-top:2px}',
      '.cd-top{margin-top:10px;padding-top:8px;border-top:1px solid rgba(42,50,71,.5)}',
      '.cd-top-lbl{font-family:var(--mono,monospace);font-size:9px;color:var(--t3);margin-bottom:6px;font-weight:700}',
      '.cd-top-row{display:flex;align-items:center;gap:8px;margin:4px 0;text-decoration:none;color:inherit;font-family:var(--mono,monospace);font-size:10px}',
      '.cd-top-sym{width:42px;font-weight:800;color:var(--accent,#5bb0ff)}',
      '.cd-top-bar{flex:1;height:6px;background:var(--panel3,#222b40);border-radius:4px;overflow:hidden}',
      '.cd-top-bar span{display:block;height:100%;background:var(--warn,#d4892c);border-radius:4px}',
      '.cd-top-val{color:var(--t2);white-space:nowrap}',
      '.cd-top-warn{font-family:var(--mono,monospace);font-size:9.5px;color:var(--warn,#d4892c);margin-top:4px}',
      '.cd-hub{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:6px;margin-top:8px}',
      '.cd-hub a{display:block;padding:8px 9px;border-radius:8px;border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.2);text-decoration:none;color:inherit;font-family:var(--mono,monospace);font-size:10px}',
      '.cd-hub a:hover{border-color:var(--accent,#5bb0ff)}',
      '.cd-hub .hv{font-size:14px;font-weight:800;font-family:var(--head,Sora,sans-serif);margin-top:2px}',
      '.cd-gate{padding:10px 12px;border-radius:8px;margin-bottom:10px;font-family:var(--mono,monospace);font-size:11px;line-height:1.45}',
      '.cd-gate.bad{background:rgba(255,77,77,.12);border:1px solid rgba(255,77,77,.4);color:#ff8a8a}',
      '.cd-gate.warn{background:rgba(212,137,44,.1);border:1px solid rgba(212,137,44,.35);color:#e8b86d}'
    ].join('');
    document.head.appendChild(st);
  }

  function renderRail(el, page, opts){
    injectStyles();
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return null;
    const b = unified(opts);
    const cells = railCells(b, page);
    const tabs = [
      { id: 'journal', icon: '📓', href: b.links.journal },
      { id: 'equity', icon: '📈', href: b.links.equity },
      { id: 'portfolio', icon: '🛡️', href: b.links.portfolio }
    ];
    el.className = (el.className ? el.className + ' ' : '') + 'cd-rail';
    if (page) el.dataset.cdPage = page;
    el.innerHTML =
      '<div class="cd-rail-hdr"><span class="cd-title">💰 Capital Desk</span>' +
      '<button type="button" class="cd-tab" id="cdBtnExport" title="Export JSON Capital Desk" style="cursor:pointer;font-size:11px;width:auto;padding:0 8px">📥</button>' +
      '<span class="cd-nav">' +
      tabs.map(t => '<a href="' + t.href + '" class="cd-tab' + (page === t.id ? ' on' : '') + '" title="' + t.id + '">' + t.icon + '</a>').join('') +
      '</span></div><div class="cd-cells">' +
      cells.map(c =>
        '<a href="' + c.href + '" class="cd-cell' + (c.cls ? ' ' + c.cls : '') + (c.active ? ' active' : '') + '">' +
        '<div class="cd-lbl">' + c.lbl + '</div><div class="cd-val">' + c.val + '</div><div class="cd-sub">' + c.sub + '</div></a>'
      ).join('') + '</div><div class="cd-top" id="cdTopRisk"></div>';
    renderTopRisk(el.querySelector('#cdTopRisk'), b);
    const expBtn = el.querySelector('#cdBtnExport');
    if (expBtn && !expBtn.dataset.wired) {
      expBtn.dataset.wired = '1';
      expBtn.addEventListener('click', ev => { ev.preventDefault(); downloadExport(opts); });
    }
    writeRiskFlag();
    return b;
  }

  function renderHubStrip(el, opts){
    injectStyles();
    if (typeof el === 'string') el = document.getElementById(el);
    if (!el) return null;
    const b = unified(opts);
    const eq = b.equity;
    const pf = b.portfolio;
    const gov = b.governor || {};
    const s = b.journal.stats || {};
    const cells = [
      { l: 'Equity', v: fmtUsd(eq.estimated), s: 'DD ' + (eq.currentDdPct || 0).toFixed(1) + '%', href: b.links.equity, cls: eq.currentDdPct > 5 ? 'warn' : '' },
      { l: 'Risc SL', v: fmtUsd(pf.riskUse), s: (pf.riskPct != null ? pf.riskPct.toFixed(1) + '%' : '—') + ' · Exp.R ' + (s.expectancyR != null ? s.expectancyR.toFixed(2) : '—'), href: b.links.portfolio, cls: riskCls(pf.riskPct) },
      { l: 'Desk', v: gov.label || '—', s: gov.verdict === 'HALTED' ? 'STOP' : 'PnL azi ' + fmtUsd(b.journal.todayPnl), href: b.links.desk, cls: gov.verdict === 'HALTED' ? 'neg' : gov.verdict === 'CAUTION' ? 'warn' : '' },
      { l: 'Săpt.', v: (b.journal.weekPnl >= 0 ? '+' : '') + fmtUsd(b.journal.weekPnl), s: 'drift ' + (eq.driftPct != null ? eq.driftPct.toFixed(1) + '%' : '—'), href: b.links.equity, cls: b.journal.weekPnl < 0 ? 'neg' : '' }
    ];
    el.innerHTML = '<div class="cd-hub">' + cells.map(c =>
      '<a href="' + c.href + '" class="' + (c.cls || '') + '"><div>' + c.l + '</div><div class="hv">' + c.v + '</div><div style="opacity:.75;margin-top:2px">' + c.s + '</div></a>'
    ).join('') + '<a href="' + b.links.journal + '" style="grid-column:span 1"><div>Capital Desk →</div><div class="hv" style="font-size:11px">📓 📈 🛡️</div></a></div>';
    return b;
  }

  function canAddRisk(estRiskUsd){
    estRiskUsd = parseFloat(estRiskUsd);
    if (!isFinite(estRiskUsd) || estRiskUsd <= 0) estRiskUsd = accountSize() * 0.01;
    const b = unified();
    const pf = b.portfolio;
    const reasons = [];
    let ok = true, halt = false, caution = false;
    const riskOpen = pf.riskUse || 0;
    const totalAfter = riskOpen + estRiskUsd;
    const pct = b.account > 0 ? totalAfter / b.account * 100 : null;
    if (pct != null && pct >= RISK_HALT_PCT) {
      ok = false; halt = true;
      reasons.push('Risc open+nou ' + pct.toFixed(1) + '% ≥ ' + RISK_HALT_PCT + '% cont');
    } else if (pct != null && pct >= RISK_WARN_PCT) {
      caution = true;
      reasons.push('Risc agregat ' + pct.toFixed(1) + '% — aproape de prag');
    }
    const gov = b.governor;
    if (gov.verdict === 'HALTED') { ok = false; halt = true; reasons.push('Risk Desk HALTED'); }
    else if (gov.verdict === 'CAUTION') { caution = true; reasons.push('Risk Desk CAUTION'); }
    if (gov.weekBudgetUsedPct != null && gov.weekBudgetUsedPct >= 100) {
      ok = false; halt = true; reasons.push('Buget pierdere săptămânal consumat');
    } else if (gov.weekBudgetUsedPct != null && gov.weekBudgetUsedPct >= 75) {
      caution = true; reasons.push('Buget săptămână ' + gov.weekBudgetUsedPct.toFixed(0) + '%');
    }
    if (b.equity.driftWarn) { caution = true; reasons.push('Equity drift ≥2% — reconciliază'); }
    return { ok, halt, caution, reasons, estRiskUsd, riskOpen, riskPct: pct, totalAfter };
  }

  function gateBannerHtml(gate){
    if (!gate || (!gate.halt && !gate.caution)) return '';
    const cls = gate.halt ? 'bad' : 'warn';
    const title = gate.halt ? '⛔ Pre-trade gate: STOP' : '⚠ Pre-trade gate: atenție';
    return '<div class="cd-gate ' + cls + '">' + title + '<br>' + gate.reasons.map(r => '· ' + r).join('<br>') + '</div>';
  }

  function saveWeeklySnapshot(){
    const b = unified();
    const wk = b.weekKey;
    let store = {};
    try { store = JSON.parse(localStorage.getItem(WEEKLY_SNAP_KEY) || '{}') || {}; } catch (e) {}
    store[wk] = {
      ts: Date.now(),
      equity: b.equity.estimated,
      ddPct: b.equity.currentDdPct,
      riskPct: b.portfolio.riskPct,
      weekPnl: b.journal.weekPnl,
      expR: b.journal.stats.expectancyR,
      verdict: b.governor.verdict
    };
    try { localStorage.setItem(WEEKLY_SNAP_KEY, JSON.stringify(store)); } catch (e) {}
    const prevKey = getPrevWeekKey(wk);
    return { current: store[wk], prev: prevKey ? store[prevKey] || null : null };
  }

  function weekTrend(){
    const wk = isoWeekKey();
    const store = loadWeeklySnapshots();
    let cur = store[wk];
    if (!cur) cur = saveWeeklySnapshot().current;
    const prevKey = getPrevWeekKey(wk);
    const prev = prevKey ? store[prevKey] : null;
    const deltas = (cur && prev) ? {
      equity: (cur.equity != null && prev.equity != null) ? cur.equity - prev.equity : null,
      ddPct: (cur.ddPct != null && prev.ddPct != null) ? cur.ddPct - prev.ddPct : null,
      riskPct: (cur.riskPct != null && prev.riskPct != null) ? cur.riskPct - prev.riskPct : null,
      weekPnl: (cur.weekPnl != null && prev.weekPnl != null) ? cur.weekPnl - prev.weekPnl : null,
      expR: (cur.expR != null && prev.expR != null) ? cur.expR - prev.expR : null
    } : null;
    return { weekKey: wk, prevKey, current: cur, prev, deltas };
  }

  function getPrevWeekKey(wk){
    const m = /^(\d+)-W(\d+)$/.exec(wk || '');
    if (!m) return null;
    let y = +m[1], w = +m[2] - 1;
    if (w < 1) { y--; w = 52; }
    return y + '-W' + String(w).padStart(2, '0');
  }

  function loadWeeklySnapshots(){
    try { return JSON.parse(localStorage.getItem(WEEKLY_SNAP_KEY) || '{}') || {}; } catch (e) { return {}; }
  }

  function notifyChange(){
    try {
      if (_bc) _bc.postMessage({ type: 'cd-refresh', ts: Date.now() });
      localStorage.setItem('tt_cd_ping', String(Date.now()));
    } catch (e) {}
  }

  function initListener(fn){
    if (typeof fn !== 'function') return;
    if (_bc) _bc.onmessage = ev => { if (ev.data && ev.data.type === 'cd-refresh') fn(); };
    window.addEventListener('storage', ev => {
      const k = ev.key || '';
      if (k === 'tt_cd_ping' || k === LIVE_KEY || k === 'tt_journal_v1' ||
          k === 'tt_account_size_v1' || k === 'tt_pf_account' ||
          k === 'tt_equity_snapshots_v1' || k === 'tt_equity_events_v1' ||
          k === RESCAN_KEY) fn();
    });
  }

  function hubCmdCell(){
    const b = unified();
    const pf = b.portfolio;
    const rb = b.rBudget;
    const gov = b.governor;
    const lvl = pf.riskPct >= RISK_HALT_PCT ? 'bear' : pf.riskPct >= RISK_WARN_PCT ? 'warn' : 'ok';
    return {
      label: 'Capital',
      val: pf.riskPct != null ? pf.riskPct.toFixed(1) + '%' : '—',
      sub: (rb.rLeft != null ? rb.rLeft.toFixed(1) + 'R · ' : '') + (gov.label || '—'),
      lvl,
      href: b.links.journal
    };
  }

  function healthProbe(){
    const b = unified();
    const pf = b.portfolio;
    const live = pf.live;
    const issues = [];
    let cls = 'ok';
    if (pf.riskPct != null && pf.riskPct >= RISK_HALT_PCT){ issues.push('risc ' + pf.riskPct.toFixed(1) + '% ≥ ' + RISK_HALT_PCT + '%'); cls = 'err'; }
    else if (pf.riskPct != null && pf.riskPct >= RISK_WARN_PCT){ issues.push('risc ' + pf.riskPct.toFixed(1) + '%'); cls = 'warn'; }
    if (pf.noSl > 0){ issues.push(pf.noSl + ' open fără SL'); if (cls === 'ok') cls = 'warn'; }
    if (pf.count > 0 && (!live || live.stale)){ issues.push('scan Portfolio >30m sau lipsă'); if (cls === 'ok') cls = 'warn'; }
    if (b.governor.verdict === 'HALTED'){ issues.push('Desk HALTED'); cls = 'err'; }
    else if (b.governor.verdict === 'CAUTION'){ issues.push('Desk CAUTION'); if (cls === 'ok') cls = 'warn'; }
    if (b.governor.weekBudgetUsedPct >= 100){ issues.push('buget săpt. consumat'); cls = 'err'; }
    return { cls, issues, bundle: b };
  }

  global.CD = {
    unified, railCells, renderRail, renderHubStrip, renderTopRisk, hubCmdCell, healthProbe,
    portfolioStatic, journalSlice, equitySlice, governorSlice,
    writeLiveRisk, readLive, canAddRisk, gateBannerHtml,
    saveWeeklySnapshot, loadWeeklySnapshots, weekTrend, getPrevWeekKey, topRiskRows, rUsdMedian, feesStats,
    exportBundle, exportJson, downloadExport, serverRiskPayload, copyServerRiskPayload,
    writeRiskFlag, maybeNotifyRisk, onPostTrade,
    needsPortfolioRescan, clearRescanFlag, markRescanNeeded,
    fmtUsd, accountSize, injectStyles, notifyChange, initListener,
    LIVE_KEY, WEEKLY_SNAP_KEY, RISK_FLAG_KEY, RESCAN_KEY, RISK_HALT_PCT, RISK_WARN_PCT
  };

  if (typeof document !== 'undefined') {
    initListener(function(){
      const el = document.getElementById('capitalRail');
      if (el && el.classList.contains('cd-rail')) {
        const page = el.dataset.cdPage || '';
        renderRail(el, page);
      }
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);