/* 17.10.2026 — Astăzi: fereastra „Pune stopul acum” pentru pozițiile fără stop (lib/stop-setter.js). Se reface la schimbarea tezelor
   (Portofoliu, alt cadru al aplicației, sincronizare) și anunță rândul de atenție să se refacă (evenimentul tt-stop-salvat). */
(function () {
  'use strict';
  const S = window.StopSetter, host = document.getElementById('stopPanel'); if (!S || !host) return;
  const atr = {}, ultim = {}, alese = {}; let stare = '', cerut = new Set(), discord = '';
  // alarma pe Discord (worker-ul Paznicului) află ce poziții au stop: lista pleacă la fiecare schimbare
  const MES = { 'fara-cheie': 'Alarma pe Discord nu știe de stopurile tale: pune cheia de citire în Alerte (pe acest dispozitiv).', 'cheie-gresita': 'Alarma pe Discord: cheia de citire din Alerte nu e bună.', retea: 'Alarma pe Discord: lista stopurilor n-a putut fi trimisă acum (rețea); se reîncearcă.' };
  function trimite(fortat) { S.trimiteLista({ fortat }).then((r) => { const m = MES[r.stare] || ''; if (m !== discord) { discord = m; desen(); } }); }
  const stops = (scope) => { try { return window.TodayAttention?.stopuri?.(scope) || new Set(); } catch (_) { return new Set(); } };
  function date() { const snap = window.T212Snapshot?.read?.('live'); return snap ? { scope: snap[0], snapshot: snap[1] } : null; }
  function desen() {
    const d = date(); if (!d) { host.innerHTML = ''; return; }
    const poz = S.faraStop(d.snapshot, stops(d.scope)); host.innerHTML = S.render(poz, { atr, ultim, alese, stare: [stare, poz.length ? (discord || 'Pe Discord vine alarma la fiecare 15 minute până pui stopul.') : ''].filter(Boolean).join(' ') }); host.hidden = !poz.length;
    const fetchStock = window.D?.fetchStock; if (typeof fetchStock !== 'function') return;
    for (const p of poz) { const s = S.symYahoo(p.ticker); if (!s || cerut.has(s)) continue; cerut.add(s);
      fetchStock(s, { range: '3mo', interval: '1d', ttl: 21600 }).then((b) => { atr[s] = S.atrPct(b); const c = Array.isArray(b) ? b.filter((x) => Number.isFinite(x?.c) && x.c > 0).at(-1)?.c : null; ultim[s] = c ?? null; }, () => { atr[s] = null; ultim[s] = null; }).then(desen); }
  }
  host.addEventListener('click', (ev) => {
    const art = ev.target.closest('[data-stop-ticker]'); if (!art) return; const tk = art.dataset.stopTicker, v = ev.target.closest('[data-stop-var]');
    if (v) { alese[tk] = v.dataset.stopVar; art.querySelectorAll('[data-stop-var]').forEach((b) => b.setAttribute('aria-checked', String(b === v))); return; }
    if (!ev.target.closest('[data-stop-save]')) return;
    const d = date(), poz = d && (d.snapshot.positions || []).find((p) => p.ticker === tk); if (!poz) return;
    const alt = Number(art.querySelector('[data-stop-alt]')?.value), ales = art.querySelector(`[data-stop-var="${alese[tk] || 'fix'}"]`) || art.querySelector('[data-stop-var]');
    const stop = alt > 0 ? alt : Number(ales?.dataset.stopPret), tv = art.querySelector('[data-stop-tinta]')?.value, tinta = tv ? Number(tv) : null;
    const sy = S.symYahoo(tk), px = S.preturi(poz, sy ? ultim[sy] : null);
    const err = S.salveaza({ scope: d.scope, poz: { ...poz, averagePrice: px.intrare ?? poz.averagePrice, currentPrice: px.acum ?? poz.currentPrice }, stop, tinta });
    stare = err ? '⚠ ' + err : '✓ Stopul pentru ' + tk.replace(/_US_EQ$|_[A-Z]{2}_EQ$/, '') + ' e salvat în Portofoliu.';
    desen(); window.dispatchEvent(new Event('tt-stop-salvat')); if (!err) trimite(true);
  });
  window.addEventListener('storage', (e) => { if (e.key === 'tt_holdings_theses_v1' || e.key === 'tt_trading212_portfolio_v1') { desen(); trimite(false); } });
  desen(); trimite(false);
  setTimeout(desen, 4000); // copia contului poate sosi după prima citire (pagina contului din fundal)
})();
