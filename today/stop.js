/* 17.10.2026 — Astăzi: fereastra „Pune stopul acum” pentru pozițiile fără stop (lib/stop-setter.js). Se reface la schimbarea tezelor
   (Portofoliu, alt cadru al aplicației, sincronizare) și anunță rândul de atenție să se refacă (evenimentul tt-stop-salvat). */
(function () {
  'use strict';
  const S = window.StopSetter, host = document.getElementById('stopPanel'); if (!S || !host) return;
  const atr = {}, ultim = {}, alese = {}; let stare = '', cerut = new Set(), discord = '';
  // 18.10.2026: ordinul de stop REAL în Trading 212 (lib/t212-orders.js) — butonul apare doar cu conexiunea salvată pe dispozitiv; confirmare în pagină
  let ordine = null, confirm = null, trimitOrdin = false;
  // alarma pe Discord (worker-ul Paznicului) află ce poziții au stop: lista pleacă la fiecare schimbare
  const MES = { 'fara-cheie': 'Alarma pe Discord nu știe de stopurile tale: pune cheia de citire în Alerte (pe acest dispozitiv).', 'cheie-gresita': 'Alarma pe Discord: cheia de citire din Alerte nu e bună.', retea: 'Alarma pe Discord: lista stopurilor n-a putut fi trimisă acum (rețea); se reîncearcă.' };
  function trimite(fortat) { S.trimiteLista({ fortat }).then((r) => { const m = MES[r.stare] || ''; if (m !== discord) { discord = m; desen(); } }); }
  // stopurile valide = puse DUPĂ deschiderea poziției de acum (revizia 18.10) + cele din Trading 212 / stopul fix din Radar (poza colectorului)
  let externe = new Set();
  const stops = (scope) => { try { const d = date(), th = JSON.parse(localStorage.getItem('tt_holdings_theses_v1') || '{}'), s = S.stopuriValide(th, scope, d ? d.snapshot.positions : []); for (const t of externe) s.add(t); return s; } catch (_) { return new Set(externe); } };
  async function pozaExterna() {
    let cheie = '', url = 'https://paznic-radar.mferent80.workers.dev'; try { cheie = String(localStorage.getItem('radar_cheie') || '').trim(); const u = String(localStorage.getItem('radar_url') || '').trim(); if (/^https:\/\/[^\s/?#]+\.[^\s/?#]+/i.test(u)) url = u.replace(/\/+$/, ''); } catch (_) { return; }
    if (!cheie) return; try { const r = await fetch(url + '/poza', { headers: { authorization: 'Bearer ' + cheie }, cache: 'no-store' }); if (!r.ok) return; const e = S.stopuriExterne(await r.json()); if ([...e].sort().join() !== [...externe].sort().join()) { externe = e; window.__stopuriExterne = e; desen(); window.dispatchEvent(new Event('tt-stop-salvat')); } } catch (_) { /* fără poză: doar stopurile din aplicație */ }
  }
  function date() { const snap = window.T212Snapshot?.read?.('live'); return snap ? { scope: snap[0], snapshot: snap[1] } : null; }
  function desen() {
    const d = date(); if (!d) { host.innerHTML = ''; return; }
    const scris = {}; host.querySelectorAll('[data-stop-ticker]').forEach((a) => { scris[a.dataset.stopTicker] = { alt: a.querySelector('[data-stop-alt]')?.value || '', tinta: a.querySelector('[data-stop-tinta]')?.value || '' }; });
    const activ = document.activeElement && host.contains(document.activeElement) ? { tk: document.activeElement.closest('[data-stop-ticker]')?.dataset.stopTicker, camp: document.activeElement.hasAttribute('data-stop-alt') ? 'data-stop-alt' : document.activeElement.hasAttribute('data-stop-tinta') ? 'data-stop-tinta' : null } : null;
    const poz = S.faraStop(d.snapshot, stops(d.scope)); host.innerHTML = S.render(poz, { atr, ultim, alese, ordine, confirm, trimite: trimitOrdin, stare: [stare, poz.length ? (discord || 'Pe Discord vine alarma la fiecare 15 minute până pui stopul (luni–vineri, 08:00–22:00; în rest tace).') : ''].filter(Boolean).join(' ') }); host.hidden = !poz.length;
    host.querySelectorAll('[data-stop-ticker]').forEach((a) => { const v = scris[a.dataset.stopTicker]; if (!v) return; const x = a.querySelector('[data-stop-alt]'), y = a.querySelector('[data-stop-tinta]'); if (x) x.value = v.alt; if (y) y.value = v.tinta; });
    if (activ && activ.tk && activ.camp) host.querySelector('[data-stop-ticker="' + CSS.escape(activ.tk) + '"] [' + activ.camp + ']')?.focus();
    const fetchStock = window.D?.fetchStock; if (typeof fetchStock !== 'function') return;
    for (const p of poz) { const s = S.symYahoo(p.ticker); if (!s || cerut.has(s)) continue; cerut.add(s);
      fetchStock(s, { range: '3mo', interval: '1d', ttl: 21600 }).then((b) => { atr[s] = S.atrPct(b); const c = Array.isArray(b) ? b.filter((x) => Number.isFinite(x?.c) && x.c > 0).at(-1)?.c : null; ultim[s] = c ?? null; }, () => { atr[s] = null; ultim[s] = null; }).then(desen); }
  }
  host.addEventListener('click', (ev) => {
    const art = ev.target.closest('[data-stop-ticker]'); if (!art) return; const tk = art.dataset.stopTicker, v = ev.target.closest('[data-stop-var]');
    if (v) { alese[tk] = v.dataset.stopVar; art.querySelectorAll('[data-stop-var]').forEach((b) => b.setAttribute('aria-checked', String(b === v))); return; }
    if (ev.target.closest('[data-stop-t212-nu]')) { confirm = null; desen(); return; }
    if (ev.target.closest('[data-stop-t212-da]')) { trimiteOrdin(); return; }
    const vreaOrdin = !!ev.target.closest('[data-stop-t212]');
    if (!vreaOrdin && !ev.target.closest('[data-stop-save]')) return;
    const d = date(), poz = d && (d.snapshot.positions || []).find((p) => p.ticker === tk); if (!poz) return;
    // 19.10.2026 (I-711): „Alt stop” nevalid ⇒ eroare, nimic salvat / trimis (înainte cădea tăcut pe varianta −5 %)
    const altEl = art.querySelector('[data-stop-alt]'), ales = art.querySelector(`[data-stop-var="${alese[tk] || 'fix'}"]`) || art.querySelector('[data-stop-var]');
    const ales2 = S.stopDinFormular(altEl?.value, !!altEl?.validity?.badInput, ales?.dataset.stopPret);
    if (ales2.eroare) { stare = '⚠ ' + ales2.eroare; confirm = null; desen(); return; }
    const stop = ales2.stop, tv = art.querySelector('[data-stop-tinta]')?.value, tinta = tv ? Number(tv) : null;
    const sy = S.symYahoo(tk), px = S.preturi(poz, sy ? ultim[sy] : null);
    if (vreaOrdin) { const r = window.T212Orders?.rezumat(poz, stop, px.acum, d.snapshot.summary?.currency); if (!r) { stare = '⚠ Alege o variantă de stop sau scrie stopul, apoi apasă din nou.'; confirm = null; } else { confirm = { ...r, scope: d.scope, tinta, intrare: px.intrare }; stare = ''; } desen(); return; }
    const err = S.salveaza({ scope: d.scope, poz: { ...poz, averagePrice: px.intrare ?? poz.averagePrice, currentPrice: px.acum ?? poz.currentPrice }, stop, tinta });
    // I-711: confirmarea spune valoarea SALVATĂ (rotunjită la 4 zecimale, ca în teză), în moneda acțiunii
    stare = err ? '⚠ ' + err : '✓ Stopul pentru ' + tk.replace(/_US_EQ$|_[A-Z]{2}_EQ$/, '') + ' e salvat în Portofoliu: ' + new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(+stop.toFixed(4)) + ' ' + (S.moneda(poz) || '') + '.';
    desen(); window.dispatchEvent(new Event('tt-stop-salvat')); if (!err) trimite(true);
  });
  async function trimiteOrdin() {
    if (trimitOrdin || !confirm || !window.T212Orders) return; const c = confirm; trimitOrdin = true; desen();
    const r = await window.T212Orders.pune({ ticker: c.ticker, quantity: c.qty, stopPrice: c.stop }); trimitOrdin = false; confirm = null;
    if (r.ok) {
      const d = date(), poz = d && (d.snapshot.positions || []).find((p) => p.ticker === c.ticker);
      const err = poz ? S.salveaza({ scope: c.scope, poz: { ...poz, averagePrice: c.intrare ?? poz.averagePrice, currentPrice: r.data.currentPrice || c.acum || poz.currentPrice }, stop: r.data.stopPrice, tinta: c.tinta }) : 'poziția nu mai e în copia contului';
      stare = '✓ Ordinul STOP pentru ' + c.simbol + ' e în Trading 212 (stop ' + r.data.stopPrice + (r.data.status ? ', ' + r.data.status : '') + ').' + (err ? ' Nu l-am putut salva și în Portofoliu: ' + err : ' L-am salvat și în Portofoliu.');
      window.dispatchEvent(new Event('tt-stop-salvat')); trimite(true);
    } else stare = '⚠ ' + r.mesaj;
    desen();
  }
  window.addEventListener('storage', (e) => { if (e.key === 'tt_holdings_theses_v1' || e.key === 'tt_trading212_portfolio_v1') { desen(); trimite(false); } });
  if (window.T212Orders) window.T212Orders.disponibil().then((r) => { ordine = r; desen(); });
  // 19.10.2026 (I-702): parcată în aplicație (TTShell ascuns) nu mai întreabă worker-ul la 5 minute; la revenire o dată
  desen(); trimite(false); pozaExterna(); if (window.TTShell) window.TTShell.every(pozaExterna, 300000); else setInterval(() => { if (!document.hidden) pozaExterna(); }, 300000);
  setTimeout(desen, 4000); // copia contului poate sosi după prima citire (pagina contului din fundal)
})();
