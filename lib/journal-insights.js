// journal-insights.js — leak report, R săptămână, earnings 48h, export CSV (JI.*)
(function(global){
  'use strict';

  const LEAK_TAGS = ['fomo', 'chase', 'no-plan', 'revenge', 'contra-regim', 'broke-rules', 'early-exit', 'late-exit', 'news-trap', 'oversize'];
  const EARN_CACHE_KEY = 'tt_jr_earnings_cal';
  const EARN_TTL = 1800000;
  let earnMap = null;
  let earnFetchBusy = false;

  function esc(s){
    return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function monthStartMs(){
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  }

  function leakReportMonth(){
    if (!global.JR) return [];
    const start = monthStartMs();
    const byTag = {};
    JR.listClosed().forEach(e => {
      if ((e.closeTs || 0) < start) return;
      const tags = (e.tags || []).filter(t => LEAK_TAGS.includes(t));
      if (!tags.length) return;
      const p = JR.pnl(e);
      tags.forEach(t => {
        if (!byTag[t]) byTag[t] = { tag: t, n: 0, pnl: 0 };
        byTag[t].n++;
        byTag[t].pnl += p != null ? p : 0;
      });
    });
    return Object.values(byTag).sort((a, b) => a.pnl - b.pnl);
  }

  function weekRStats(){
    if (!global.JR || !global.CT) return { netR: null, lossR: 0, n: 0, budgetR: 5, weekBudgetPct: null };
    const start = CT.weekStartMs();
    const closed = JR.listClosed().filter(e => (e.closeTs || 0) >= start);
    let netR = 0, lossR = 0, n = 0;
    closed.forEach(e => {
      const r = JR.rMult(e);
      if (r == null) return;
      n++;
      netR += r;
      if (r < 0) lossR += -r;
    });
    const s = JR.getSettings ? JR.getSettings() : {};
    const budgetR = s.weeklyRBudget != null ? +s.weeklyRBudget : 5;
    let weekBudgetPct = null;
    if (global.GV && GV.status) {
      const st = GV.status();
      weekBudgetPct = st.weekBudgetUsedPct;
    }
    return { netR, lossR, n, budgetR, weekBudgetPct };
  }

  function etToday(){
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    } catch (e) { return new Date().toISOString().slice(0, 10); }
  }

  function daysUntil(dateStr){
    const a = new Date(etToday() + 'T12:00:00');
    const b = new Date(String(dateStr).slice(0, 10) + 'T12:00:00');
    return Math.round((b - a) / 86400000);
  }

  function loadEarnCache(){
    if (earnMap) return earnMap;
    try {
      const raw = JSON.parse(localStorage.getItem(EARN_CACHE_KEY) || 'null');
      if (raw && raw.ts && Date.now() - raw.ts < EARN_TTL && raw.map) {
        earnMap = raw.map;
        return earnMap;
      }
    } catch (e) {}
    earnMap = {};
    return earnMap;
  }

  function earningsBadge(sym){
    const m = loadEarnCache();
    const d = m[String(sym || '').toUpperCase()];
    if (!d || d.days > 2 || d.days < 0) return null;
    return d.days === 0 ? 'EARN AZI' : 'EARN ' + d.days + 'z';
  }

  function earningsBadgeHtml(sym){
    const b = earningsBadge(sym);
    if (!b) return '';
    return ' <span class="tag exp" title="Earnings în ≤48h — risc binar">' + esc(b) + '</span>';
  }

  async function refreshEarningsCalendar(symbols){
    symbols = (symbols || []).map(s => String(s).toUpperCase()).filter(Boolean);
    if (!symbols.length) return loadEarnCache();
    loadEarnCache();
    if (earnFetchBusy) return earnMap;
    // TTL pe fetch: fara guard-ul asta, ET.render (chemat ~7x/min din
    // lantul hub:market -> HT.render) facea fetch /calendar/earnings
    // NECONDITIONAT la fiecare render -> quota Finnhub erodata permanent
    try {
      const raw = JSON.parse(localStorage.getItem(EARN_CACHE_KEY) || 'null');
      if (raw && raw.ts && Date.now() - raw.ts < EARN_TTL) {
        if (raw.map) earnMap = raw.map;
        return earnMap;
      }
    } catch (e) {}
    const key = global.FH_KEY && FH_KEY.get ? FH_KEY.get() : '';
    if (!key) return earnMap;
    earnFetchBusy = true;
    try {
      const to = new Date();
      to.setDate(to.getDate() + 7);
      const toStr = to.toISOString().slice(0, 10);
      const url = 'https://finnhub.io/api/v1/calendar/earnings?from=' + etToday() + '&to=' + toStr + '&token=' + encodeURIComponent(key);
      const r = await fetch(url);
      if (!r.ok) return earnMap;
      const data = await r.json();
      const want = new Set(symbols);
      const map = {};
      (data.earningsCalendar || []).forEach(e => {
        const sym = String(e.symbol || '').toUpperCase().split('.')[0];
        if (!want.has(sym)) return;
        const days = daysUntil(e.date);
        if (days < 0 || days > 7) return;
        if (!map[sym] || days < map[sym].days) map[sym] = { date: e.date, days, hour: e.hour || '' };
      });
      earnMap = map;
      try { localStorage.setItem(EARN_CACHE_KEY, JSON.stringify({ ts: Date.now(), map })); } catch (e) {}
    } catch (e) {}
    finally { earnFetchBusy = false; }
    return earnMap;
  }

  function renderLeakPanel(hostId){
    const el = document.getElementById(hostId);
    if (!el) return;
    const rows = leakReportMonth();
    if (!rows.length) {
      el.style.display = 'none';
      el.innerHTML = '';
      return;
    }
    const month = new Date().toLocaleString('ro-RO', { month: 'short' });
    const fmt$ = v => (v < 0 ? '−$' : '$') + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
    const total = rows.reduce((s, r) => s + r.pnl, 0);
    const totalCls = total >= 0 ? 'pos' : 'neg';
    el.style.display = '';
    el.innerHTML =
      '<span class="leak-lbl">🩸 Leak ' + esc(month) + '</span>' +
      '<div class="leak-chips">' + rows.map(r =>
        '<span class="leak-chip">' + esc(r.tag) + ' <b>' + r.n + '×</b> ' +
        '<span class="' + (r.pnl >= 0 ? 'pos' : 'neg') + '">' + (r.pnl >= 0 ? '+' : '') + fmt$(r.pnl) + '</span></span>'
      ).join('') +
      '<span class="leak-chip" style="border-color:var(--b2)"><b>Σ</b> <span class="' + totalCls + '">' + (total >= 0 ? '+' : '') + fmt$(total) + '</span></span>' +
      '</div>';
  }

  function _csvCell(v){
    if (v == null) return '';
    let s = String(v);
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return s;
  }

  function exportCsv(){
    if (!global.JR) return '';
    const rows = JR.all();
    const hdr = 'id,sym,dir,entry,exit,size,fees,slAtEntry,pnl_usd,r_mult,source,regime,tags,status,openTs,closeTs,ruleOk,wouldRepeat,notes';
    const lines = rows.map(e => {
      const p = JR.pnl(e), r = JR.rMult(e);
      return [
        e.id, e.sym, e.dir, e.entry, e.exit, e.size, e.fees, e.slAtEntry,
        p != null ? p.toFixed(2) : '', r != null ? r.toFixed(3) : '',
        e.source, e.regime, (e.tags || []).join('|'), e.status,
        e.openTs || '', e.closeTs || '',
        e.ruleOk === true ? 'yes' : e.ruleOk === false ? 'no' : '',
        e.wouldRepeat || '', e.notes || ''
      ].map(_csvCell).join(',');
    });
    return hdr + '\n' + lines.join('\n');
  }

  function downloadCsv(){
    const csv = exportCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'journal_exec_' + etToday() + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 500);
  }

  global.JI = {
    LEAK_TAGS, leakReportMonth, weekRStats, earningsBadge, earningsBadgeHtml,
    refreshEarningsCalendar, renderLeakPanel, exportCsv, downloadCsv
  };
})(typeof window !== 'undefined' ? window : global);