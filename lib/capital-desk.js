// ═══════════════════════════════════════════════════════════════════
// capital-desk.js — statistici unificate Equity + Journal + Portfolio (CD.*)
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';

  function accountSize(){
    if (global.ACCT && typeof ACCT.get === 'function') return ACCT.get().value || 0;
    if (global.EQ && typeof EQ.cfgAccount === 'function') return EQ.cfgAccount();
    return 10000;
  }

  function fmtUsd(v){
    if (v == null || !isFinite(v)) return '—';
    return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) < 1 ? 2 : 0 });
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
    return {
      count, totNotional, totRisk, noSl, rows,
      exposurePct: acct > 0 ? totNotional / acct * 100 : null,
      riskPct: acct > 0 && totRisk > 0 ? totRisk / acct * 100 : (acct > 0 ? 0 : null)
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
    return { total: all.length, closed: closed.length, open: open.length, stats, todayPnl };
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

  function unified(opts){
    opts = opts || {};
    return {
      ts: Date.now(),
      account: accountSize(),
      journal: journalSlice(),
      equity: equitySlice(opts.unrealized),
      portfolio: portfolioStatic(),
      links: {
        journal: '../journal/',
        equity: '../equity/',
        portfolio: '../portfolio/',
        desk: '../journal/#desk'
      }
    };
  }

  function riskCls(pct){
    if (pct == null) return '';
    if (pct >= 4) return 'neg';
    if (pct >= 2) return 'warn';
    return 'pos';
  }

  function railCells(bundle, page){
    const b = bundle || unified();
    const eq = b.equity;
    const pf = b.portfolio;
    const jr = b.journal;
    const s = jr.stats || {};

    return [
      { key: 'equity', lbl: 'EQUITY EST.', val: fmtUsd(eq.estimated), sub: 'sim ' + fmtUsd(eq.simulated), cls: '', href: b.links.equity, active: page === 'equity' },
      { key: 'dd', lbl: 'DD CURENT', val: (eq.currentDdPct || 0).toFixed(1) + '%', sub: 'max ' + (eq.maxDdPct || 0).toFixed(1) + '%', cls: eq.currentDdPct > 5 ? 'warn' : '', href: b.links.equity },
      { key: 'drift', lbl: 'DRIFT', val: eq.driftPct != null ? (eq.driftPct >= 0 ? '+' : '') + eq.driftPct.toFixed(1) + '%' : '—', sub: eq.hasSnapshot ? 'vs snapshot' : 'fără snap', cls: eq.driftWarn ? 'warn' : '', href: b.links.equity },
      { key: 'risk', lbl: 'RISC @ SL', val: fmtUsd(pf.totRisk), sub: pf.riskPct != null ? pf.riskPct.toFixed(1) + '% cont' + (pf.noSl ? ' · ' + pf.noSl + ' fără SL' : '') : '—', cls: riskCls(pf.riskPct), href: b.links.portfolio, active: page === 'portfolio' },
      { key: 'exposure', lbl: 'EXPUNERE', val: fmtUsd(pf.totNotional), sub: pf.exposurePct != null ? pf.exposurePct.toFixed(0) + '% cont · ' + pf.count + ' poz' : pf.count + ' poz', cls: pf.exposurePct > 100 ? 'warn' : '', href: b.links.portfolio },
      { key: 'expect', lbl: 'EXP. R', val: s.expectancyR != null ? (s.expectancyR >= 0 ? '+' : '') + s.expectancyR.toFixed(2) + 'R' : '—', sub: 'n=' + (s.n || 0) + ' închise', cls: s.expectancyR == null ? '' : s.expectancyR >= 0 ? 'pos' : 'neg', href: b.links.journal, active: page === 'journal' },
      { key: 'today', lbl: 'PnL AZI', val: (jr.todayPnl >= 0 ? '+' : '') + fmtUsd(jr.todayPnl), sub: 'journal azi', cls: jr.todayPnl >= 0 ? 'pos' : 'neg', href: b.links.desk },
      { key: 'realized', lbl: 'REALIZAT', val: (eq.realized >= 0 ? '+' : '') + fmtUsd(eq.realized), sub: 'închis net fees', cls: eq.realized >= 0 ? 'pos' : 'neg', href: b.links.equity }
    ];
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
      '.cd-cells{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:8px}',
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
      '.cd-sub{font-family:var(--mono,monospace);font-size:9.5px;color:var(--t2,#cdd5e2);margin-top:2px}'
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
    el.innerHTML =
      '<div class="cd-rail-hdr"><span class="cd-title">💰 Capital Desk</span><span class="cd-nav">' +
      tabs.map(t => '<a href="' + t.href + '" class="cd-tab' + (page === t.id ? ' on' : '') + '" title="' + t.id + '">' + t.icon + '</a>').join('') +
      '</span></div><div class="cd-cells">' +
      cells.map(c =>
        '<a href="' + c.href + '" class="cd-cell' + (c.cls ? ' ' + c.cls : '') + (c.active ? ' active' : '') + '">' +
        '<div class="cd-lbl">' + c.lbl + '</div><div class="cd-val">' + c.val + '</div><div class="cd-sub">' + c.sub + '</div></a>'
      ).join('') + '</div>';
    return b;
  }

  global.CD = {
    unified, railCells, renderRail, portfolioStatic, journalSlice, equitySlice,
    fmtUsd, accountSize, injectStyles
  };
})(typeof window !== 'undefined' ? window : globalThis);