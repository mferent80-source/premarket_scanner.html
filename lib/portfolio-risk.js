// portfolio-risk.js — risc agregat poziții OPEN din journal (PF.*)
(function(global){
  'use strict';

  const K_RISK = 'tt_pf_riskpct';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const fmt$ = v => (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) < 1 ? 4 : 2 });
  const fmtK = v => Math.abs(v) >= 1e6 ? (v/1e6).toFixed(2)+'M' : Math.abs(v) >= 1e3 ? (v/1e3).toFixed(1)+'K' : v.toFixed(0);

  let cfg = {
    journalHref: '../journal/#portfolio',
    symHref: sym => '../journal/#portfolio&sym=' + encodeURIComponent(sym)
  };
  let focusSym = '';
  let scanning = false;

  function $(id){ return document.getElementById(id); }

  function openPositions(){
    try {
      const j = JSON.parse(localStorage.getItem('tt_journal_v1') || '[]') || [];
      return j.filter(e => e && (e.status === 'open' || e.exit == null) && e.sym && +e.size > 0 && +e.entry > 0)
        .map(e => ({ ...e, id: e.id, ticker: e.sym, entry: e.entry, sl: e.slAtEntry, tp: null, size: e.size, status: 'open', dir: e.dir === 'short' ? 'short' : 'long', source: 'journal', notes: e.notes || '' }));
    } catch (e) { return []; }
  }

  function trackerOpenNotInJournal(){
    if (global.JR && JR.reconcileTracker) {
      const r = JR.reconcileTracker();
      if (!r.openOrphan) return [];
      try {
        const plans = JSON.parse(localStorage.getItem('trade_plans_v1') || '[]') || [];
        const j = JSON.parse(localStorage.getItem('tt_journal_v1') || '[]') || [];
        const haveSrc = new Set(j.filter(e => e && (e.status === 'open' || e.exit == null)).map(x => x.srcId).filter(Boolean));
        return plans.filter(p => p && p.status === 'open' && !haveSrc.has(p.id));
      } catch (e) { return []; }
    }
    return [];
  }

  function sectorOf(sym){
    try {
      const c = JSON.parse(localStorage.getItem('wl_profile_cache') || '{}');
      const d = c[sym];
      return (d && d.sector) ? d.sector : (d && d.data && d.data.sector) ? d.data.sector : '';
    } catch (e) { return ''; }
  }

  function macroSens(sym){
    if (/-usd$/i.test(sym)) return { tag: 'crypto', rate: true };
    const s = (sectorOf(sym) || '').toLowerCase();
    if (/tech|semiconductor|software|communication/.test(s)) return { tag: 'growth', rate: true };
    if (/financ|bank|insurance/.test(s)) return { tag: 'banks', rate: false };
    if (/energy|oil|gas/.test(s)) return { tag: 'energy', rate: false };
    return { tag: 'other', rate: false };
  }

  function regimeComposite(){
    try { const r = JSON.parse(localStorage.getItem('md_risk_regime') || 'null'); return (r && typeof r.composite === 'number') ? r.composite : null; } catch (e) { return null; }
  }

  function dangerMult(){
    try {
      const h = JSON.parse(localStorage.getItem('md_danger_daily') || '[]');
      const s = Array.isArray(h) && h.length ? h[h.length-1].score : null;
      if (typeof s !== 'number') return null;
      return { score: s, mult: s >= 70 ? 0.375 : s >= 45 ? 0.5 : s >= 25 ? 0.75 : 1 };
    } catch (e) { return null; }
  }

  async function livePrice(sym){
    const key = String(sym || '').toUpperCase();
    // I-214: bus cross-pagini (hub a scris SPY/open pos) — zero rețea dacă <30s
    if (global.QB && key) {
      try {
        const hit = QB.get(key, 30000);
        if (hit && Number.isFinite(hit.price) && hit.price > 0) return hit.price;
      } catch (e) {}
    }
    if (!global.D || typeof D.fetchJSON !== 'function') return null;
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=1m&range=1d&includePrePost=true';
    const j = await global.D.fetchJSON(url, { ttl: 30, timeout: 9000 });
    const res = j && j.chart && j.chart.result && j.chart.result[0];
    if (!res) return null;
    const closes = (res.indicators && res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close) || [];
    let price = null;
    for (let i = closes.length - 1; i >= 0; i--){
      if (closes[i] != null && isFinite(closes[i]) && closes[i] > 0) { price = closes[i]; break; }
    }
    const m = res.meta || {};
    if (price == null) price = m.regularMarketPrice || null;
    // scrie bus pentru alte taburi (scanner/hub)
    if (price != null && global.QB && key) {
      try {
        const prev = m.chartPreviousClose || m.previousClose || m.regularMarketPrice;
        const chgPct = (prev && prev > 0) ? ((price - prev) / prev) * 100 : undefined;
        QB.set(key, { price, chgPct, src: 'portfolio' });
      } catch (e) {}
    }
    return price;
  }

  function dailyRets(bars){
    const out = [];
    for (let i = 1; i < bars.length; i++){ if (bars[i-1].c > 0) out.push(bars[i].c / bars[i-1].c - 1); }
    return out;
  }

  function betaOf(retsS, retsQ){
    const n = Math.min(retsS.length, retsQ.length);
    if (n < 30) return null;
    const s = retsS.slice(-n), q = retsQ.slice(-n);
    const mS = s.reduce((a, b) => a + b, 0) / n, mQ = q.reduce((a, b) => a + b, 0) / n;
    let cov = 0, varQ = 0;
    for (let i = 0; i < n; i++){ cov += (s[i] - mS) * (q[i] - mQ); varQ += (q[i] - mQ) ** 2; }
    return varQ > 0 ? cov / varQ : null;
  }

  function render(rows){
    const acctEl = $('jrPfAcct');
    const acct = acctEl ? +(acctEl.value) || 0 : (global.ACCT ? ACCT.get().value : 0) || 0;
    const comp = regimeComposite();
    const adverse = comp != null && comp <= -2;
    const jHref = cfg.journalHref;
    const symLink = sym => {
      if (cfg.symHref) return cfg.symHref(sym);
      return jHref + (String(jHref).indexOf('?') >= 0 ? '&' : '?') + 'sym=' + encodeURIComponent(sym);
    };

    $('jrPfTblWrap').innerHTML = '<table>' +
      '<thead><tr><th>Ticker</th><th>Size</th><th>Entry</th><th>Live</th><th>PnL</th><th>SL</th><th>Risc→SL</th><th>R</th><th>β QQQ</th><th>Sector</th></tr></thead>' +
      '<tbody>' + rows.map(r => {
        const pnlCls = r.pnl == null ? '' : r.pnl >= 0 ? 'pos' : 'neg';
        const expFlag = adverse && r.sens.rate ? ' <span class="tag exp" title="Sector sensibil la dobânzi în regim macro advers — dublu risc">⚠</span>' : '';
        const hl = focusSym && r.sym === focusSym ? ' style="background:rgba(91,176,255,.12)"' : '';
        const earnFlag = global.JI && JI.earningsBadgeHtml ? JI.earningsBadgeHtml(r.sym) : '';
        return '<tr' + hl + '>' +
          '<td class="sym"><a href="https://www.tradingview.com/chart/?symbol=' + esc(r.sym) + '" target="_blank" rel="noopener">' + esc(r.sym) + '</a> <a href="' + symLink(r.sym) + '" style="color:var(--accent);font-size:10px;text-decoration:none" title="Editează în Journal">📓</a>' + earnFlag + expFlag + (r.slBreached ? ' <span class="tag exp">SL DEPĂȘIT</span>' : '') + '</td>' +
          '<td>' + r.size + '</td><td>' + JR.quotePrice(r, r.entry) + '</td>' +
          '<td>' + (r.last != null ? JR.quotePrice(r, r.last) : '<span class="wrn">n/a</span>') + '</td>' +
          '<td class="' + pnlCls + '">' + (r.pnl != null ? (r.pnl >= 0 ? '+' : '') + fmt$(r.pnl).replace('$-','-$') : '—') + '</td>' +
          '<td>' + (r.sl != null ? JR.quotePrice(r, r.sl) : '—') + '</td>' +
          '<td class="' + (r.riskNow != null && r.riskNow > 0 ? 'neg' : '') + '">' + (r.riskNow != null ? fmt$(r.riskNow) : '—') + '</td>' +
          '<td>' + (r.rMult != null ? (r.rMult >= 0 ? '+' : '') + r.rMult.toFixed(2) + 'R' : '—') + '</td>' +
          '<td>' + (r.beta != null ? r.beta.toFixed(2) : '—') + '</td>' +
          '<td style="text-align:left;font-size:10.5px;color:var(--t2)">' + esc(r.sector) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<div class="note">PnL fără comision/slippage. Risc→SL = ce mai poți pierde de la prețul LIVE până la stop. β pe ~6 luni randamente zilnice, n≥30.</div>';

    const totN = rows.reduce((a, r) => a + r.notional, 0);
    const totPnl = rows.reduce((a, r) => a + (r.pnl || 0), 0);
    const totRisk = rows.reduce((a, r) => a + (r.riskNow || 0), 0);
    const withBeta = rows.filter(r => r.beta != null);
    const stress = withBeta.reduce((a, r) => a + r.beta * -0.03 * r.notional, 0);

    $('jrPfN').textContent = rows.length;
    $('jrPfNSub').textContent = rows.filter(r => r.slBreached).length ? rows.filter(r => r.slBreached).length + ' cu SL depășit!' : 'toate peste SL';
    $('jrPfNot').textContent = '$' + fmtK(totN);
    $('jrPfNotSub').textContent = acct > 0 ? (totN / acct * 100).toFixed(0) + '% din cont' + (totN > acct ? ' (LEVIER?)' : '') : 'setează contul pt %';
    $('jrPfPnl').textContent = (totPnl >= 0 ? '+' : '') + fmt$(totPnl).replace('$-','-$');
    $('jrPfPnl').className = 'val ' + (totPnl >= 0 ? 'pos' : 'neg');
    $('jrPfRisk').textContent = fmt$(totRisk);
    const dm = dangerMult();
    if (acct > 0){
      const pct = totRisk / acct * 100;
      const cls = pct < 2 ? 'pos' : pct < 4 ? 'wrn' : 'neg';
      $('jrPfRisk').className = 'val ' + cls;
      $('jrPfRiskSub').textContent = pct.toFixed(1) + '% din cont' + (dm ? ' · Danger ' + dm.score + ' → sizing ' + dm.mult + 'x pe intrări NOI' : '');
      $('jrPfRiskBar').style.width = Math.min(100, pct / 4 * 100) + '%';
      $('jrPfRiskBar').style.background = cls === 'pos' ? 'var(--bull-s)' : cls === 'wrn' ? 'var(--warn)' : 'var(--bear-s)';
    } else {
      $('jrPfRisk').className = 'val';
      $('jrPfRiskSub').textContent = 'setează contul pt % și praguri';
      $('jrPfRiskBar').style.width = '0%';
    }
    $('jrPfStress').textContent = withBeta.length ? fmt$(stress).replace('$-','-$') : 'n/a (β lipsă)';
    $('jrPfStress').className = 'val ' + (stress < 0 ? 'neg' : '');
    $('jrPfStrip').style.display = '';

    if (global.CD) {
      CD.writeLiveRisk({
        totRisk, totNotional: totN, totPnl,
        rows: rows.map(r => ({ sym: r.sym, riskNow: r.riskNow || 0 }))
      });
      CD.clearRescanFlag();
      showRescanBanner();
    }

    const bySec = {};
    rows.forEach(r => { const k = r.sector || '?'; bySec[k] = (bySec[k] || 0) + r.notional; });
    const secs = Object.entries(bySec).sort((a, b) => b[1] - a[1]);
    const rateCount = rows.filter(r => r.sens.rate).length;
    let warn = '';
    if (secs.length && totN > 0 && secs[0][1] / totN > 0.5 && rows.length >= 2)
      warn += '<div class="note" style="color:var(--warn)">⚠ ' + esc(secs[0][0]) + ' = ' + (secs[0][1]/totN*100).toFixed(0) + '% din expunere — concentrare mare.</div>';
    if (adverse && rateCount >= 3)
      warn += '<div class="note" style="color:var(--bear-s)">⚠ ' + rateCount + ' poziții rate-sensibile în regim macro ADVERS.</div>';
    $('jrPfConcBody').innerHTML = secs.map(([s, v]) =>
      '<span class="tag sec">' + esc(s) + ' · $' + fmtK(v) + ' (' + (totN > 0 ? (v/totN*100).toFixed(0) : 0) + '%)</span>').join('') + warn;
    $('jrPfConc').style.display = '';
    const foreignN = rows.filter(r => r.foreign).length;
    if (foreignN) { for (const id of ['jrPfNot','jrPfPnl','jrPfRisk','jrPfStress']) $(id).textContent = '— FX incomplet'; }
    $('jrPfFoot').textContent = (foreignN ? '⚠ ' + foreignN + ' positions non-USD: FX live indisponibil. ' : '') + '🔄 scan: ' + new Date().toLocaleTimeString('ro-RO') + ' · prețuri = ultima bară 1m (include pre/after)';
  }

  async function scan(){
    if (scanning) return;
    const btn = $('jrPfBtnScan');
    scanning = true;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ scan…'; }
    try {
      const pos = openPositions();
      if (!pos.length){
        $('jrPfStrip').style.display = 'none';
        $('jrPfConc').style.display = 'none';
        $('jrPfTblWrap').innerHTML = '<div class="empty">📭 Nicio poziție OPEN în Journal.<br>Adaugă în tab <a href="#exec" data-jtab-link="exec" style="color:var(--accent)">Execuții</a>.</div>';
        $('jrPfFoot').textContent = '—';
        bindJtabLinks($('jrPfTblWrap'));
        return;
      }
      $('jrPfTblWrap').innerHTML = '<div class="empty">⏳ ' + pos.length + ' poziții — prețuri live + β…</div>';

      let retsQ = null;
      try { retsQ = dailyRets(await global.D.fetchStock('QQQ', { range: '6mo', ttl: 1800 })); } catch (e) {}

      const rows = [];
      for (const p of pos){
        const sym = String(p.ticker).toUpperCase();
        let last = null, beta = null;
        try { last = await livePrice(sym); } catch (e) {}
        if (retsQ){
          try { beta = betaOf(dailyRets(await global.D.fetchStock(sym, { range: '6mo', ttl: 1800 })), retsQ); } catch (e) {}
        }
        const size = +p.size, entry = +p.entry, sl = +p.sl || null;
        const dir = p.dir === 'short' ? 'short' : 'long';
        const foreign = !global.JR || JR.quoteCurrency(p) !== 'USD';
        const notional = foreign ? null : (last ?? entry) * size;
        const pnl = !foreign && last != null ? (dir === 'short' ? (entry - last) : (last - entry)) * size : null;
        const riskNow = foreign ? null : (sl != null && last != null)
          ? Math.max(0, dir === 'short' ? (sl - last) * size : (last - sl) * size)
          : (sl != null ? Math.max(0, dir === 'short' ? (sl - entry) * size : (entry - sl) * size) : null);
        const slBreached = sl != null && last != null && (dir === 'short' ? last >= sl : last <= sl);
        const r0 = sl != null ? Math.abs(entry - sl) : null;
        const rMult = (!foreign && r0 && last != null) ? (dir === 'short' ? (entry - last) : (last - entry)) / r0 : null;
        rows.push({ id: p.id, sym, dir, size, entry, last, sl, tp: null, quoteCurrency: global.JR ? JR.quoteCurrency(p) : 'UNKNOWN', foreign, notional, pnl, riskNow, slBreached, rMult, beta, sens: macroSens(sym), sector: sectorOf(sym) || '?', notes: p.notes || '' });
      }
      render(rows);
    } finally {
      scanning = false;
      if (btn) { btn.disabled = false; btn.textContent = '🔄 Scan poziții'; }
    }
  }

  function bindJtabLinks(root){
    if (!root) return;
    root.querySelectorAll('[data-jtab-link]').forEach(a => {
      a.addEventListener('click', ev => {
        ev.preventDefault();
        if (global.setJTab) setJTab(a.dataset.jtabLink);
        else location.hash = a.dataset.jtabLink;
      });
    });
  }

  function showMigrateBanner(){
    const orphans = trackerOpenNotInJournal();
    const el = $('jrPfMigrate');
    if (!el) return;
    if (!orphans.length){ el.style.display = 'none'; return; }
    el.style.display = '';
    el.innerHTML = '⚠ ' + orphans.length + ' plan(uri) legacy fără Journal: <b>' + orphans.map(p => esc(String(p.ticker).toUpperCase())).join(', ') + '</b>. <button type="button" class="sync-btn" id="jrPfBtnSync">Migrează acum</button>';
    const b = $('jrPfBtnSync');
    if (b) b.onclick = () => {
      if (global.TT && TT.migrateLegacy) TT.migrateLegacy();
      else if (global.JR && JR.syncAllFromTracker) JR.syncAllFromTracker();
      showMigrateBanner();
      scan();
    };
  }

  function showRescanBanner(){
    const b = $('jrPfRescan');
    if (!b || !global.CD) return;
    if (CD.needsPortfolioRescan && CD.needsPortfolioRescan()){
      b.style.display = '';
      b.innerHTML = '⚠ Journal actualizat — riscul live poate fi stale. <button type="button" id="jrPfBtnRescan" style="margin-left:8px;background:var(--warn);border:none;color:#000;padding:4px 10px;border-radius:6px;cursor:pointer;font-weight:700">Scan acum</button>';
      const rb = $('jrPfBtnRescan');
      if (rb) rb.onclick = () => scan();
    } else b.style.display = 'none';
  }

  function syncAccountField(){
    const el = $('jrPfAcct');
    if (!el) return;
    if (global.ACCT) { const g = ACCT.get(); el.value = g.value || ''; }
    else { try { el.value = localStorage.getItem('tt_pf_account') || ''; } catch (e) {} }
  }

  function onJournalUpdate(opts){
    opts = opts || {};
    syncAccountField();
    showMigrateBanner();
    showRescanBanner();
    if (opts.activeTab === 'portfolio') {
      if (global.CD && CD.needsPortfolioRescan && CD.needsPortfolioRescan() && openPositions().length) scan();
      else if (opts.forceScan && openPositions().length) scan();
    }
  }

  function onTabActivate(){
    syncAccountField();
    showMigrateBanner();
    showRescanBanner();
    const pos = openPositions();
    if (!pos.length) {
      $('jrPfStrip').style.display = 'none';
      $('jrPfConc').style.display = 'none';
      $('jrPfTblWrap').innerHTML = '<div class="empty">📭 Nicio poziție OPEN.<br>Adaugă în tab <a href="#exec" data-jtab-link="exec" style="color:var(--accent)">Execuții</a>.</div>';
      bindJtabLinks($('jrPfTblWrap'));
      return;
    }
    if (global.CD && CD.needsPortfolioRescan && CD.needsPortfolioRescan()) scan();
    else if (!$('jrPfFoot').textContent || $('jrPfFoot').textContent === '—') scan();
  }

  function init(userCfg){
    userCfg = userCfg || {};
    cfg = Object.assign({}, cfg, userCfg);
    if (userCfg.focusSym) focusSym = String(userCfg.focusSym).toUpperCase();
    else if (!focusSym) {
      focusSym = (new URLSearchParams(location.search).get('sym') || '').toUpperCase();
      if (!focusSym && location.hash) {
        const hm = location.hash.match(/sym=([^&]+)/i);
        if (hm) focusSym = decodeURIComponent(hm[1]).toUpperCase();
      }
    }

    syncAccountField();
    const acctEl = $('jrPfAcct');
    if (acctEl) {
      acctEl.addEventListener('change', () => {
        if (global.ACCT) ACCT.syncAll(acctEl.value, 'portfolio');
        else try { localStorage.setItem('tt_pf_account', acctEl.value); } catch (e) {}
      });
    }
    const btn = $('jrPfBtnScan');
    if (btn) btn.addEventListener('click', () => { if (global.CD && CD.clearRescanFlag) CD.clearRescanFlag(); scan(); });

    showMigrateBanner();
    showRescanBanner();
  }

  global.PF = {
    init, scan, render, openPositions, showMigrateBanner, showRescanBanner,
    onJournalUpdate, onTabActivate, syncAccountField
  };
})(typeof window !== 'undefined' ? window : global);