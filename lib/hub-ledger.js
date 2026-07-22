// hub-ledger.js — Signal Ledger scorecard (HB_LEDGER.*)
(function(global){
  'use strict';

  const $ = id => document.getElementById(id);
  const escHtml = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const SRC_META = {
    'wlm-strongbuy': '👁 Watchlist Monitor · STRONG BUY nou',
    'me-early': '📊 Market Events · 🌱 Early-bird daily (structure ARMED)',
    'me-fire': '📊 Market Events · ▶ FIRE 5m (early long trigger)',
    'me-confirmed': '📊 Market Events · 🌳 Confirmat (cross) — referință A/B pt 🌱',
    'me-insider': '📊 Market Events · 🏛️ Insider cluster nou',
    'stl-ready': '🎯 Smart Trade Long · READY',
    'nasdaq-opp80': '📈 Nasdaq · Oportunități buy ≥80'
  };
  const histCache = {};
  let loaded = false;
  let inited = false;

  function idlePlaceholder(){
    const sc = $('slScorecard'), rc = $('slRecent');
    const msg = '<div class="pb-empty">Deschide secțiunea sau apasă 🔄 Refresh — scorecard-ul se încarcă la expand (lazy).</div>';
    if (sc && sc.querySelector('.pb-loading')) sc.innerHTML = msg;
    if (rc && rc.querySelector('.pb-loading')) rc.innerHTML = '<div class="pb-empty">—</div>';
  }

  async function getCloses(sym){
    if (histCache[sym] !== undefined) return histCache[sym];
    let out = null;
    try {
      if (!global.D || typeof D.fetchJSON !== 'function') { histCache[sym] = null; return null; }
      const j = await D.fetchJSON(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1y`,
        { ttl: 1800, cacheKey: `sl:1y:${sym}` }
      );
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

  function fwdReturn(days, entryDay, entryPrice, n){
    // semnal mai vechi decat fereastra de istoric (range=1y) -> idx=0 ar
    // returna close-uri de la INCEPUTUL ferestrei prezentate ca "+Nz de la
    // semnal" — cifre fictive care intrau in medii/win-rate. Exclus onest.
    if (!days.length || entryDay < days[0].day) return null;
    let idx = -1;
    for (let i = 0; i < days.length; i++){ if (days[i].day > entryDay){ idx = i; break; } }
    if (idx < 0) return null;
    const j = idx + (n - 1);
    if (j >= days.length) return null;
    return (days[j].close - entryPrice) / entryPrice * 100;
  }

  const fmtR = v => v == null ? '—' : `<span class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : ''}${v.toFixed(1)}%</span>`;

  function estRiskUsd(sym){
    const s = String(sym || '').toUpperCase();
    const open = (global.JR && JR.all) ? JR.all().filter(e => e && e.sym === s && (e.status === 'open' || e.exit == null)) : [];
    if (open.length){
      let tot = 0;
      open.forEach(e => {
        const sl = parseFloat(e.slAtEntry), entry = parseFloat(e.entry), size = parseFloat(e.size);
        if (sl != null && isFinite(sl) && entry > 0 && size > 0) {
          tot += e.dir === 'short' ? Math.max(0, (sl - entry) * size) : Math.max(0, (entry - sl) * size);
        }
      });
      if (tot > 0) return tot;
    }
    const acct = (global.CD && CD.accountSize) ? CD.accountSize() : (global.ACCT && ACCT.get ? (ACCT.get().value || 0) : 0);
    return acct > 0 ? acct * 0.01 : null;
  }

  async function slLoad(){
    const cnt = $('slCnt'), sc = $('slScorecard'), rc = $('slRecent');
    if (!cnt || !sc || !rc) return;
    try {
      if (!global.LEDGER || typeof LEDGER.all !== 'function'){
        sc.innerHTML = '<div class="pb-empty warn">⚠ lib/ledger.js lipsă — reîncarcă pagina.</div>';
        rc.innerHTML = '';
        return;
      }
      const entries = LEDGER.all().slice().reverse();
      cnt.textContent = entries.length;
      if (!entries.length){
        sc.innerHTML = '<div class="pb-empty">📭 Niciun semnal consemnat încă. Se populează automat din: STRONG BUY nou (Watchlist Monitor), 🌱 early-bird nou (Market Events), READY (Smart Trade Long), oportunități buy ≥80 (Nasdaq). Lasă scannerele să ruleze câteva zile.</div>';
        rc.innerHTML = '<div class="pb-empty">—</div>';
        slMiniReview();
        return;
      }
      sc.innerHTML = '<div class="pb-loading">se evaluează…</div>';
      const allSyms = [...new Set(entries.map(e => e.sym))];
      const uniq = allSyms.slice(0, 40);
      const capped = allSyms.length > uniq.length;
      await Promise.all(uniq.map(sym => getCloses(sym).catch(() => null)));
      const evald = entries.map(e => {
        const days = histCache[e.sym];
        const px = Number(e.price) || 0;
        return Object.assign({}, e, {
          r5: days && px > 0 ? fwdReturn(days, e.day, px, 5) : null,
          r20: days && px > 0 ? fwdReturn(days, e.day, px, 20) : null,
          cur: days && days.length && px > 0 ? (days[days.length - 1].close - px) / px * 100 : null
        });
      });
      const bySrc = {};
      evald.forEach(e => { (bySrc[e.src] = bySrc[e.src] || []).push(e); });
      const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
      sc.innerHTML = `<table class="pb-table">
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
        <div style="font-size:10.5px;color:var(--t3);margin-top:6px;font-family:var(--mono)">+Nz = zile de TRANZACȚIONARE de la semnal · „—" = prea recent, istoric indisponibil sau semnal mai vechi de 1 an · win = % semnale pe plus la +5z. Onest: sub n=10 e zgomot, nu statistică.${capped ? ` <span style="color:#d4892c">⚠ istoric încărcat doar pt cele mai noi 40 din ${allSyms.length} simboluri — mediile acoperă subsetul, nu tot registrul.</span>` : ''}</div>`;
      rc.innerHTML = `<table class="pb-table">
        <thead><tr><th>Data</th><th>Sursă</th><th>Ticker</th><th>La semnal</th><th>Est.Risc</th><th>+5z</th><th>+20z</th><th>Acum</th></tr></thead>
        <tbody>${evald.slice(0, 14).map(e => {
          const er = estRiskUsd(e.sym);
          const erTxt = er != null ? '$' + Math.round(er).toLocaleString() : '—';
          const px = Number(e.price);
          return `<tr>
            <td class="pb-time">${escHtml(e.day)}</td>
            <td style="font-size:11px">${escHtml((SRC_META[e.src] || e.src).split('·')[0].trim())}</td>
            <td class="sym"><a href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(e.sym)}" target="_blank">${escHtml(e.sym)}</a> <a href="./journal/?sym=${encodeURIComponent(e.sym)}&source=${encodeURIComponent(e.src)}&notes=ledger" style="font-size:9px;color:var(--accent);margin-left:4px" title="Planifică execuție">📓</a></td>
            <td>${isFinite(px) ? '$' + px.toFixed(2) : '—'}</td>
            <td style="font-size:10px;color:var(--t2)" title="SL journal sau 1% cont">${erTxt}</td>
            <td>${fmtR(e.r5)}</td>
            <td>${fmtR(e.r20)}</td>
            <td>${fmtR(e.cur)}</td>
          </tr>`;
        }).join('')}</tbody></table>`;
      slMiniReview();
    } catch (e) {
      if (sc) sc.innerHTML = '<div class="pb-empty warn">⚠ Eroare Signal Ledger: ' + escHtml(e.message || String(e)) + '</div>';
      console.error('Signal Ledger', e);
    }
  }

  function slMiniReview(){
    const el = $('hubSlMini');
    if (!el) return;
    const entries = (global.LEDGER && LEDGER.all) ? LEDGER.all().slice() : [];
    if (!entries.length){ el.innerHTML = '<span class="hub-sl-empty">Ledger gol</span>'; return; }
    const bySrc = {};
    entries.forEach(e => { (bySrc[e.src] = bySrc[e.src] || []).push(e); });
    const top = Object.keys(bySrc).sort((a, b) => bySrc[b].length - bySrc[a].length).slice(0, 3);
    el.innerHTML = top.map(s => '<span class="hub-sl-chip">' + escHtml(s) + ' <b>' + bySrc[s].length + '</b></span>').join('') +
      ' <a href="#slWrap" class="hub-sl-link">Ledger →</a>';
  }

  function init(){
    if (inited) return;
    inited = true;
    idlePlaceholder();
    slMiniReview();
    const wrap = $('slWrap');
    if (!wrap) return;
    wrap.addEventListener('toggle', () => {
      try { localStorage.setItem('sl_open', wrap.open ? '1' : '0'); } catch (e) {}
      if (wrap.open){ loaded = true; slLoad(); }
      else idlePlaceholder();
    });
    const refBtn = $('slRefreshBtn');
    if (refBtn) refBtn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      if (!wrap.open) wrap.open = true;
      loaded = true;
      // esecurile (null) se golesc ca Refresh sa reincerce real — inainte
      // un moment offline lasa "—" permanent pe sesiune, iar butonul mintea
      Object.keys(histCache).forEach(k => { if (histCache[k] == null) delete histCache[k]; });
      slLoad();
    });
    const clearBtn = $('slClearBtn');
    if (clearBtn) clearBtn.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      if (!confirm('Golești tot registrul de semnale? (ireversibil)')) return;
      if (global.LEDGER) LEDGER.clear();
      Object.keys(histCache).forEach(k => delete histCache[k]);
      slLoad();
    });
    try {
      if (localStorage.getItem('sl_open') === '1'){
        wrap.open = true;
        loaded = true;
        slLoad();
      }
    } catch (e) {}
  }

  global.HB_SL_MINI = { renderReview: slMiniReview };
  global.HB_LEDGER = { load: slLoad, init, review: slMiniReview };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);