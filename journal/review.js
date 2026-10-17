// 17.10.2026 (I-682 / I-686 / I-688) — „Bilanțul tău” în Jurnal → Execuții: săptămâna, verdictul față de tranzacțiile tale, raportul fiscal.
// Datele: registrul execuțiilor Trading 212 (local), seriile SPY / QQQ / VIX (sursa de prețuri a paginii), istoricul verdictului și cursul BNR
// (fișierele robotului de noapte). Nimic nu se scrie; exportul CSV se descarcă pe dispozitiv.
(function () {
  'use strict';
  const host = document.getElementById('jrvBilant'), J = window.JournalReview, MV = window.MarketVerdict;
  if (!host || !J) return;
  const snap = window.T212Snapshot?.read?.('live'), scope = snap?.[0] || null;
  let tx = [], an = null, curs = null, sapt = null, vt = null, stare = '';
  function desen() {
    const fisc = an ? J.fiscal(tx, { an, curs }) : null;
    host.innerHTML = J.render({ sapt, vt, fisc, stare, ani: J.ani(tx) });
    host.querySelector('#jrvAn')?.addEventListener('change', (e) => { an = Number(e.target.value); desen(); });
    host.querySelector('#jrvCsv')?.addEventListener('click', () => {
      const blob = new Blob(['\ufeff' + J.csv(fisc)], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'raport-fiscal-' + fisc.an + '.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
  }
  (async () => {
    let data = null; try { data = (await window.T212FillsStore?.read?.())?.data || null; } catch (_) { data = null; }
    tx = J.tranzactii(data || { accounts: {} }, scope);
    if (!tx.length) { host.innerHTML = J.render({ stare: 'nicio execuție importată încă — conectează Trading 212 în Cont & sincronizare' }); return; }
    const stops = J.stopuri(scope); an = J.ani(tx)[0] || new Date().getFullYear();
    stare = tx.length + ' execuții · se citesc seriile pieței…'; sapt = J.saptamana(tx, { stops }); desen();
    const fetchStock = window.D?.fetchStock, serii = {};
    if (typeof fetchStock === 'function') await Promise.allSettled(['SPY', 'QQQ', '^VIX'].map(async (s) => { try { const b = await fetchStock(s, { range: '5y', interval: '1d', ttl: 6 * 3600000 }); if (Array.isArray(b)) serii[s] = b.map((x) => ({ t: x.t, c: x.c })); } catch (_) { /* fără serie: verdictul parțial nu se poate reface */ } }));
    const [robot, c] = await Promise.all([MV?.robotFile ? MV.robotFile() : Promise.resolve(null), J.cursFile()]);
    curs = c; const istoric = robot?.istoric || [];
    sapt = J.saptamana(tx, { stops, istoric, serii }); vt = J.verdictTranzactii(tx, istoric, serii);
    stare = tx.length + ' execuții' + (curs ? '' : ' · cursul BNR nu e încă publicat de robot');
    desen();
  })();
})();
