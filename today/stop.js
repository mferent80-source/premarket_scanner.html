/* 17.10.2026 — Astăzi: fereastra „Pune stopul acum” pentru pozițiile fără stop (lib/stop-setter.js). Se reface la schimbarea tezelor
   (Portofoliu, alt cadru al aplicației, sincronizare) și anunță rândul de atenție să se refacă (evenimentul tt-stop-salvat). */
(function () {
  'use strict';
  const S = window.StopSetter, host = document.getElementById('stopPanel'); if (!S || !host) return;
  const atr = {}, alese = {}; let stare = '', cerut = new Set();
  const stops = (scope) => { try { return window.TodayAttention?.stopuri?.(scope) || new Set(); } catch (_) { return new Set(); } };
  function date() { const snap = window.T212Snapshot?.read?.('live'); return snap ? { scope: snap[0], snapshot: snap[1] } : null; }
  function desen() {
    const d = date(); if (!d) { host.innerHTML = ''; return; }
    const poz = S.faraStop(d.snapshot, stops(d.scope)); host.innerHTML = S.render(poz, { atr, alese, stare }); host.hidden = !poz.length;
    const fetchStock = window.D?.fetchStock; if (typeof fetchStock !== 'function') return;
    for (const p of poz) { const s = S.symYahoo(p.ticker); if (!s || cerut.has(s)) continue; cerut.add(s);
      fetchStock(s, { range: '3mo', interval: '1d', ttl: 21600 }).then((b) => { atr[s] = S.atrPct(b); }, () => { atr[s] = null; }).then(desen); }
  }
  host.addEventListener('click', (ev) => {
    const art = ev.target.closest('[data-stop-ticker]'); if (!art) return; const tk = art.dataset.stopTicker, v = ev.target.closest('[data-stop-var]');
    if (v) { alese[tk] = v.dataset.stopVar; art.querySelectorAll('[data-stop-var]').forEach((b) => b.setAttribute('aria-checked', String(b === v))); return; }
    if (!ev.target.closest('[data-stop-save]')) return;
    const d = date(), poz = d && (d.snapshot.positions || []).find((p) => p.ticker === tk); if (!poz) return;
    const alt = Number(art.querySelector('[data-stop-alt]')?.value), ales = art.querySelector(`[data-stop-var="${alese[tk] || 'fix'}"]`) || art.querySelector('[data-stop-var]');
    const stop = alt > 0 ? alt : Number(ales?.dataset.stopPret), tv = art.querySelector('[data-stop-tinta]')?.value, tinta = tv ? Number(tv) : null;
    const err = S.salveaza({ scope: d.scope, poz, stop, tinta });
    stare = err ? '⚠ ' + err : '✓ Stopul pentru ' + tk.replace(/_US_EQ$|_[A-Z]{2}_EQ$/, '') + ' e salvat în Portofoliu.';
    desen(); window.dispatchEvent(new Event('tt-stop-salvat'));
  });
  window.addEventListener('storage', (e) => { if (e.key === 'tt_holdings_theses_v1' || e.key === 'tt_trading212_portfolio_v1') desen(); });
  desen();
  setTimeout(desen, 4000); // copia contului poate sosi după prima citire (pagina contului din fundal)
})();
