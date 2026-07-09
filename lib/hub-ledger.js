// hub-ledger.js — Signal Ledger scorecard
(function(global){
'use strict';
// randamentul la +5/+20 bare de tranzacționare după ziua semnalului (closes Yahoo prin D).
(function(){
  const $ = id => document.getElementById(id);
  const escHtml = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const SRC_META = {
    'wlm-strongbuy': '👁 Watchlist Monitor · STRONG BUY nou',
    'me-early': '📊 Market Events · 🌱 Early-bird nou (început de drum)',
    'me-confirmed': '📊 Market Events · 🌳 Confirmat (cross) — referință A/B pt 🌱',
    'me-insider': '📊 Market Events · 🏛️ Insider cluster nou',
    'stl-ready': '🎯 Smart Trade Long · READY',
    'nasdaq-opp80': '📈 Nasdaq · Oportunități buy ≥80'
  };
  const histCache = {};
  async function getCloses(sym){
    if (histCache[sym] !== undefined) return histCache[sym];
    let out = null;
    try {
      const j = (window.D && D.fetchJSON) ? await D.fetchJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1y`, { ttl: 1800, cacheKey: `sl:1y:${sym}` }) : null;
      const r = j?.chart?.result?.[0];
      if (r){
        const ts = r.timestamp || [], cl = r.indicators?.quote?.[0]?.close || [];
        const days = [];
        for (let i = 0; i < ts.length; i++){
          if (cl[i] == null || isNaN(cl[i])) continue;
          days.push({ day: new Intl.DateTimeFormat('en-CA', { timeZone:'America/New_York' }).format(new Date(ts[i]*1000)), close: cl[i] });
        }
        if (days.length) out = days;
      }
    } catch (e) {}
    histCache[sym] = out;
    return out;
  }
  // +n bare de TRANZACȚIONARE după ziua semnalului; null = încă prea recent
  function fwdReturn(days, entryDay, entryPrice, n){
    let idx = -1;
    for (let i = 0; i < days.length; i++){ if (days[i].day > entryDay){ idx = i; break; } }
    if (idx < 0) return null;
    const j = idx + (n - 1);
    if (j >= days.length) return null;
    return (days[j].close - entryPrice) / entryPrice * 100;
  }
  const fmtR = v => v == null ? '—' : `<span class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : ''}${v.toFixed(1)}%</span>`;
  async function slLoad(){
    const entries = (window.LEDGER ? LEDGER.all() : []).slice().reverse();
    $('slCnt').textContent = entries.length;
    if (!entries.length){
      $('slScorecard').innerHTML = '<div class="pb-empty">📭 Niciun semnal consemnat încă. Se populează automat din: STRONG BUY nou (Watchlist Monitor), 🌱 early-bird nou (Market Events), READY (Smart Trade Long), oportunități buy ≥80 (Nasdaq). Lasă scannerele să ruleze câteva zile.</div>';
      $('slRecent').innerHTML = '<div class="pb-empty">—</div>';
      return;
    }
    $('slScorecard').innerHTML = '<div class="pb-loading">se evaluează…</div>';
    const uniq = [...new Set(entries.map(e => e.sym))].slice(0, 40); // cap requests
    await Promise.all(uniq.map(getCloses));
    const evald = entries.map(e => {
      const days = histCache[e.sym];
      return { ...e,
        r5:  days ? fwdReturn(days, e.day, e.price, 5)  : null,
        r20: days ? fwdReturn(days, e.day, e.price, 20) : null,
        cur: days && days.length ? (days[days.length-1].close - e.price) / e.price * 100 : null };
    });
    const bySrc = {};
    evald.forEach(e => (bySrc[e.src] = bySrc[e.src] || []).push(e));
    const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
    $('slScorecard').innerHTML = `<table class="pb-table">
      <thead><tr><th>Sursă</th><th>Semnale</th><th>Medie +5z</th><th>Win +5z</th><th>Medie +20z</th></tr></thead>
      <tbody>${Object.keys(bySrc).map(src => {
        const a = bySrc[src];
        const w5 = a.filter(e => e.r5 != null), w20 = a.filter(e => e.r20 != null);
        const avg5 = avg(w5.map(e => e.r5)), avg20 = avg(w20.map(e => e.r20));
        const win5 = w5.length ? Math.round(w5.filter(e => e.r5 > 0).length / w5.length * 100) : null;
        return `<tr>
          <td>${escHtml(SRC_META[src] || src)}</td>
          <td><b>${a.length}</b></td>
          <td>${fmtR(avg5)}${w5.length ? ` <span style="color:var(--t3);font-size:10px">(n=${w5.length})</span>` : ''}</td>
          <td>${win5 != null ? win5 + '%' : '—'}</td>
          <td>${fmtR(avg20)}${w20.length ? ` <span style="color:var(--t3);font-size:10px">(n=${w20.length})</span>` : ''}</td>
        </tr>`;
      }).join('')}</tbody></table>
      <div style="font-size:10.5px;color:var(--t3);margin-top:6px;font-family:var(--mono)">+Nz = zile de TRANZACȚIONARE de la semnal · „—" = încă prea recent · win = % semnale pe plus la +5z. Onest: sub n=10 e zgomot, nu statistică.</div>`;
    $('slRecent').innerHTML = `<table class="pb-table">
      <thead><tr><th>Data</th><th>Sursă</th><th>Ticker</th><th>La semnal</th><th>+5z</th><th>+20z</th><th>Acum</th></tr></thead>
      <tbody>${evald.slice(0, 14).map(e => `<tr>
        <td class="pb-time">${escHtml(e.day)}</td>
        <td style="font-size:11px">${escHtml((SRC_META[e.src] || e.src).split('·')[0].trim())}</td>
        <td class="sym"><a href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(e.sym)}" target="_blank">${escHtml(e.sym)}</a> <a href="./journal/?sym=${encodeURIComponent(e.sym)}&source=${encodeURIComponent(e.src)}&notes=ledger" style="font-size:9px;color:var(--accent);margin-left:4px" title="Planifică execuție">📓</a></td>
        <td>$${e.price.toFixed(2)}</td>
        <td>${fmtR(e.r5)}</td>
        <td>${fmtR(e.r20)}</td>
        <td>${fmtR(e.cur)}</td>
      </tr>`).join('')}</tbody></table>`;
  }
  let loaded = false;
  const wrap = $('slWrap');
  if (wrap) {
    wrap.addEventListener('toggle', () => {
      try { localStorage.setItem('sl_open', wrap.open ? '1' : '0'); } catch (e) {}
      if (wrap.open && !loaded){ loaded = true; slLoad(); }
    });
    const refBtn = $('slRefreshBtn');
    if (refBtn) refBtn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); if (!wrap.open) wrap.open = true; loaded = true; slLoad(); });
    const clearBtn = $('slClearBtn');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      if (!confirm('Golești tot registrul de semnale? (ireversibil)')) return;
      if (window.LEDGER) LEDGER.clear();
      slLoad();
    });
    try { if (localStorage.getItem('sl_open') === '1'){ wrap.open = true; loaded = true; slLoad(); } } catch (e) {}
  }

  function slMiniReview(){
    const el = $('hubSlMini');
    if (!el) return;
    const entries = (global.LEDGER ? LEDGER.all() : []).slice();
    if (!entries.length){ el.innerHTML = '<span class="hub-sl-empty">Ledger gol</span>'; return; }
    const bySrc = {};
    entries.forEach(e => (bySrc[e.src]=bySrc[e.src]||[]).push(e));
    const top = Object.keys(bySrc).sort((a,b)=>bySrc[b].length-bySrc[a].length).slice(0,3);
    el.innerHTML = top.map(s=>'<span class="hub-sl-chip">'+escHtml(s)+' <b>'+bySrc[s].length+'</b></span>').join('') + ' <a href="#slWrap" class="hub-sl-link">Ledger →</a>';
  }
  global.HB_SL_MINI = { renderReview: slMiniReview };

})(typeof window !== 'undefined' ? window : global);
