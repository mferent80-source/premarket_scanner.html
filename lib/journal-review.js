/* 17.10.2026 (I-682 / I-686 / I-688) — „Bilanțul tău” în Jurnal: din execuțiile Trading 212 importate (registrul local), fără nimic inventat.
   - saptamana(): cumpărările / vânzările săptămânii, rezultatul realizat, cea mai bună / slabă vânzare, intrările cu stop pus și cele din zile „Prudent / Defensiv”;
   - verdictTranzactii(): fiecare vânzare cu rezultat, legată de ultima cumpărare a aceluiași ticker; verdictul din ziua intrării = cel notat de robot
     (de la 16.10) sau, pentru trecut, verdictul PARȚIAL refăcut fără privit în viitor (trendul SPY / QQQ + VIX, doar barele de până în acea zi);
   - fiscal(): vânzările unui an cu rezultatul realizat raportat de broker (cost mediu), în lei la cursul MEDIU ANUAL BNR (revizia 17.10:
     veniturile din străinătate — Trading 212 e broker nerezident — se transformă la cursul mediu anual comunicat de BNR, Codul fiscal art. 130);
     cursul din ziua vânzării rămâne alături ca a doua variantă. Informativ, de verificat cu contabilul.
   Funcțiile sunt pure; pagina dă datele (execuțiile, seriile, istoricul verdictului, cursul BNR). */
(function (g) {
  'use strict';
  const fin = Number.isFinite, DAY = 86400000;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v, d = 2) => (fin(v) ? v.toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const sgn = (v, d = 2) => (fin(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + num(Math.abs(v), d) : '—');
  // 17.10 (pagina se bloca): toLocaleDateString cu fus orar creează un formator nou la FIECARE apel (~30 µs); la sute de vânzări × mii de bare = zeci de secunde
  // ⇒ formatoare create o singură dată + zilele barelor calculate o dată pe serie (WeakMap)
  const F_NY = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/New_York' }), F_RO = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bucharest' });
  const dayNY = (t) => F_NY.format(t), dayRO = (t) => F_RO.format(t), ZILE = new WeakMap();
  const zileBare = (bars) => { let z = ZILE.get(bars); if (!z) { z = bars.map((b) => dayNY(b.t)); ZILE.set(bars, z); } return z; };
  const sym = (ticker) => /^([A-Z][A-Z0-9.-]{0,23})_US_EQ$/.exec(ticker || '')?.[1] || (ticker || '').replace(/_[A-Z]{2}_EQ$/, '');

  /** Execuțiile confirmate ale unui cont, toate, crescător după dată. */
  function tranzactii(data, scope) {
    const a = data?.accounts && (scope && data.accounts[scope] ? data.accounts[scope] : Object.values(data.accounts).find((x) => x && x.environment === 'live'));
    if (!a || !Array.isArray(a.items)) return [];
    const seen = new Map();
    for (const x of a.items) {
      const at = typeof x?.date === 'number' ? x.date : Date.parse(x?.date);
      if (!x || x.id == null || (x.type != null && x.type !== 'TRADE') || typeof x.ticker !== 'string' || !['BUY', 'SELL'].includes(x.side) || !fin(at) || !fin(x.quantity) || x.quantity <= 0 || !fin(x.price) || x.price <= 0) continue;
      seen.set(String(x.id), { id: String(x.id), ticker: x.ticker, symbol: sym(x.ticker), side: x.side, at, quantity: x.quantity, price: x.price, priceCurrency: x.priceCurrency || null, realized: fin(x.realized) ? x.realized : null, currency: /^[A-Z]{3}$/.test(x.currency || '') ? x.currency : null });
    }
    return [...seen.values()].sort((p, q) => p.at - q.at);
  }
  /** Ultima sesiune ÎNCHEIATĂ la momentul t (revizia 17.10): o intrare înainte de 16:00 la New York vede doar sesiunile de până ieri —
      verdictul notat pe ziua intrării și închiderea ei se calculează după intrare (privit în viitor). */
  const F_ORA = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' });
  function cunoscutLa(t) {
    const d = dayNY(t), ora = Number(F_ORA.format(t).slice(0, 2));
    return { d, inclusiv: ora >= 16 };
  }
  const panaLa = (z, k) => (k.inclusiv ? z <= k.d : z < k.d);
  /** Verdictul (eticheta) din ziua unei intrări: întâi cel notat de robot pe ultima sesiune încheiată, altfel cel parțial. */
  function verdictLa(t, istoric, serii) {
    const k = cunoscutLa(t), d = k.d, notat = (istoric || []).filter((x) => x && panaLa(x.asOf, k)).at(-1);
    if (notat && Date.parse(d + 'T12:00:00Z') - Date.parse(notat.asOf + 'T12:00:00Z') <= 4 * DAY) return { label: notat.label, sursa: 'robot' };
    return partial(k, serii);
  }
  /** Verdictul parțial: trendul SPY / QQQ (media de 50 și 200 de zile) + nivelul VIX, doar din sesiunile încheiate până atunci (fără privit în viitor).
      k = cunoscutLa(t); un șir „AAAA-LL-ZZ” = sfârșitul acelei zile (inclusiv). */
  function partial(k, serii) {
    if (typeof k === 'string') k = { d: k, inclusiv: true };
    // ultimul indice cu ziua ≤ (sau <) ziua de referință — barele sunt crescătoare după dată
    const ultim = (bars) => { if (!Array.isArray(bars) || !bars.length) return -1; const z = zileBare(bars); let lo = 0, hi = z.length - 1, r = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (panaLa(z[mid], k)) { r = mid; lo = mid + 1; } else hi = mid - 1; } return r; };
    const sma = (bars, i, n) => { if (i + 1 < n) return null; let s = 0; for (let j = i - n + 1; j <= i; j++) s += bars[j].c; return s / n; };
    let sc = 0, citite = 0;
    for (const s of ['SPY', 'QQQ']) { const b = serii?.[s], i = ultim(b); if (i < 0) continue; const m50 = sma(b, i, 50), m200 = sma(b, i, 200); if (!fin(m50) || !fin(m200)) continue; const p = b[i].c; citite++; sc += p > m50 && p > m200 ? 0.5 : p < m50 && p < m200 ? -0.5 : 0; }
    const bv = serii?.['^VIX'], iv = ultim(bv), v = iv >= 0 ? bv[iv].c : null; if (fin(v)) { citite++; sc += v < 16 ? 1 : v <= 22 ? 0 : v <= 30 ? -1 : -2; }
    if (citite < 2) return { label: null, sursa: 'necitit' };
    sc = Math.sign(sc) * Math.round(Math.abs(sc)); // simetric (revizia 17.10)
    return { label: sc >= 1 ? 'favorabil' : sc === 0 ? 'neutru' : sc === -1 ? 'prudent' : 'defensiv', sursa: 'partial' };
  }
  /** I-682: rezultatele realizate, pe tipul zilei de intrare. */
  function verdictTranzactii(tx, istoric, serii) {
    /* 27.10.2026 (audit C 🔵 16): vânzarea se leagă de DESCHIDEREA poziției (prima cumpărare după ce cantitatea era 0), ca Raportul (FIFO) — la scalare,
       verdictul „din ziua intrării” nu mai e al ultimei adăugiri; cantitatea se urmărește pe ticker, poziția închisă complet pornește una nouă */
    const deschidere = new Map(), cant = new Map(), rows = [];
    for (const x of tx) {
      const q0 = cant.get(x.ticker) || 0;
      if (x.side === 'BUY') { if (q0 <= 1e-9) deschidere.set(x.ticker, x); cant.set(x.ticker, q0 + x.quantity); continue; }
      const b = deschidere.get(x.ticker), q1 = Math.max(0, q0 - x.quantity); cant.set(x.ticker, q1); if (q1 <= 1e-9) deschidere.delete(x.ticker);
      if (!fin(x.realized) || !x.currency) continue;
      if (!b) continue;
      const v = verdictLa(b.at, istoric, serii); if (!v.label) continue;
      rows.push({ ticker: x.ticker, intrare: b.at, iesire: x.at, realized: x.realized, currency: x.currency, label: v.label, sursa: v.sursa });
    }
    const grup = (k) => rows.filter((r) => (k === 'redus' ? r.label === 'prudent' || r.label === 'defensiv' : r.label === 'neutru' || r.label === 'favorabil'));
    const stat = (xs) => ({ n: xs.length, total: xs.reduce((a, r) => a + r.realized, 0), medie: xs.length ? xs.reduce((a, r) => a + r.realized, 0) / xs.length : null, castigatoare: xs.filter((r) => r.realized > 0).length });
    const monede = [...new Set(rows.map((r) => r.currency))];
    return { rows, redus: stat(grup('redus')), normal: stat(grup('normal')), moneda: monede.length === 1 ? monede[0] : null, monedeAmestecate: monede.length > 1, dinRobot: rows.filter((r) => r.sursa === 'robot').length };
  }
  /** Începutul săptămânii (luni 00:00, ora României). */
  function inceputSaptamana(now) {
    const azi = dayRO(now), w = (new Date(azi + 'T12:00:00Z').getUTCDay() + 6) % 7, luni = new Date(Date.parse(azi + 'T12:00:00Z') - w * DAY).toISOString().slice(0, 10);
    const ora = Number(new Date(Date.parse(luni + 'T12:00:00Z')).toLocaleString('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', hourCycle: 'h23' })); // 15 vara, 14 iarna
    return Date.parse(luni + 'T00:00:00Z') - (ora - 12) * 3600000;
  }
  /** I-688: bilanțul săptămânii. stops: Set de tickere cu stop pus (acum); istoric: verdictele notate. */
  function saptamana(tx, { now = Date.now(), stops = null, istoric = [], serii = null } = {}) {
    const de = inceputSaptamana(now), aleSapt = tx.filter((x) => x.at >= de && x.at <= now), buys = aleSapt.filter((x) => x.side === 'BUY'), sells = aleSapt.filter((x) => x.side === 'SELL');
    const cuRez = sells.filter((x) => fin(x.realized) && x.currency), monede = [...new Set(cuRez.map((x) => x.currency))], total = monede.length === 1 ? cuRez.reduce((a, x) => a + x.realized, 0) : null;
    const sortat = monede.length === 1 ? cuRez.slice().sort((a, b) => b.realized - a.realized) : []; // monede diferite: nu se compară
    const zileRele = buys.filter((b) => { const v = verdictLa(b.at, istoric, serii); return v.label === 'prudent' || v.label === 'defensiv'; }).length;
    const spy = (serii?.SPY || []).filter((b) => b.t <= now), spyDe = spy.filter((b) => b.t < de).at(-1), spyAcum = spy.at(-1), spyChg = spyDe && spyAcum && spyAcum.t >= de ? (spyAcum.c / spyDe.c - 1) * 100 : null;
    return { de, cumparari: buys.length, vanzari: sells.length, total, moneda: monede.length === 1 ? monede[0] : null, cea_mai_buna: sortat[0] || null, cea_mai_slaba: sortat.length > 1 ? sortat.at(-1) : null,
      cuStop: stops ? buys.filter((b) => stops.has(b.ticker)).length : null, inZileRele: zileRele, spy: spyChg, monedeAmestecate: monede.length > 1 };
  }
  /** Cursul BNR (lei pentru o unitate) în ziua t sau în ultima zi publicată dinainte. */
  function cursLa(curs, moneda, t) {
    if (moneda === 'RON') return 1; if (!curs) return null; const d = dayRO(t), zile = Object.keys(curs).filter((z) => z <= d).sort();
    for (let i = zile.length - 1; i >= 0 && i >= zile.length - 10; i--) { const r = curs[zile[i]]?.[moneda]; if (fin(r)) return r; }
    return null;
  }
  /** Cursul mediu anual (media cursurilor zilnice BNR din anul an); provizoriu cât anul nu s-a încheiat sau lipsesc zile. */
  function cursMediu(curs, moneda, an) {
    if (moneda === 'RON') return { r: 1, zile: 365, provizoriu: false }; if (!curs) return null;
    const xs = Object.keys(curs).filter((z) => z.startsWith(an + '-')).map((z) => curs[z]?.[moneda]).filter(fin); if (!xs.length) return null;
    const ultima = Object.keys(curs).filter((z) => z.startsWith(an + '-')).sort().at(-1);
    return { r: xs.reduce((a, b) => a + b, 0) / xs.length, zile: xs.length, provizoriu: !(ultima >= an + '-12-28' && xs.length >= 240) };
  }
  /** I-686: vânzările anului, în lei — la cursul mediu anual (principal) și la cursul zilei (a doua variantă). */
  function fiscal(tx, { an, curs } = {}) {
    const rows = [], lipsa = [], medii = {};
    for (const x of tx) {
      if (x.side !== 'SELL' || Number(dayRO(x.at).slice(0, 4)) !== an) continue;
      if (!fin(x.realized) || !x.currency) { lipsa.push(x); continue; }
      if (!(x.currency in medii)) medii[x.currency] = cursMediu(curs, x.currency, an);
      const med = medii[x.currency], r = cursLa(curs, x.currency, x.at); if (!med) { lipsa.push(x); continue; }
      rows.push({ zi: dayRO(x.at), ticker: x.ticker, cantitate: x.quantity, realized: x.realized, moneda: x.currency, cursMediu: med.r, lei: x.realized * med.r, curs: fin(r) ? r : null, leiZi: fin(r) ? x.realized * r : null });
    }
    const suma = (k, semn) => rows.filter((r) => fin(r[k]) && (semn > 0 ? r[k] > 0 : r[k] < 0)).reduce((a, r) => a + r[k], 0);
    const castig = suma('lei', 1), pierdere = suma('lei', -1), zi = { castig: suma('leiZi', 1), pierdere: suma('leiZi', -1) }; zi.net = zi.castig + zi.pierdere;
    return { an, rows, castig, pierdere, net: castig + pierdere, lipsa: lipsa.length, zi, medii, provizoriu: Object.values(medii).some((m) => m && m.provizoriu) };
  }
  function csv(f) {
    const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    return ['Data;Ticker;Cantitate;Rezultat realizat;Moneda;Curs mediu anual BNR;Rezultat în lei (curs mediu anual);Curs BNR din ziua vânzării;Rezultat în lei (cursul zilei)'].concat(f.rows.map((r) => [r.zi, q(r.ticker), String(r.cantitate).replace('.', ','), num(r.realized, 2), r.moneda, num(r.cursMediu, 4), num(r.lei, 2), num(r.curs, 4), num(r.leiZi, 2)].join(';'))).concat(['', `Total câștiguri;;;;;;${num(f.castig, 2)};;${num(f.zi?.castig, 2)}`, `Total pierderi;;;;;;${num(f.pierdere, 2)};;${num(f.zi?.pierdere, 2)}`, `Net;;;;;;${num(f.net, 2)};;${num(f.zi?.net, 2)}`]).concat(f.provizoriu ? ['', 'Cursul mediu anual e provizoriu: anul nu s-a încheiat sau lipsesc zile.'] : []).join('\r\n');
  }
  const T = { favorabil: 'Favorabil', neutru: 'Neutru', prudent: 'Prudent', defensiv: 'Defensiv' };
  function render({ sapt, vt, fisc, stare = '', ani = [] } = {}) {
    const m = (v, c) => (fin(v) ? sgn(v) + (c ? ' ' + esc(c) : '') : '—'), zi = (t) => new Date(t).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' });
    const s = sapt ? '<article class="jrv-card"><h3>Săptămâna aceasta <small>de luni ' + esc(zi(sapt.de)) + '</small></h3><ul>' +
      `<li><b>${sapt.cumparari}</b> ${sapt.cumparari === 1 ? 'cumpărare' : 'cumpărări'} · <b>${sapt.vanzari}</b> ${sapt.vanzari === 1 ? 'vânzare' : 'vânzări'}` + (fin(sapt.total) ? ` · rezultat realizat <b class="${sapt.total >= 0 ? 'pos' : 'neg'}">${m(sapt.total, sapt.moneda)}</b>` : '') + '</li>' +
      (sapt.monedeAmestecate ? '<li>Vânzări în monede diferite: rezultatele nu se adună și nu se compară.</li>' : '') +
      (fin(sapt.spy) ? `<li>S&P în aceeași perioadă: <b>${sgn(sapt.spy, 1)}%</b></li>` : '') +
      (sapt.cea_mai_buna ? `<li>${sapt.cea_mai_slaba ? 'Cea mai bună vânzare' : 'Vânzarea săptămânii'}: <b>${esc(sym(sapt.cea_mai_buna.ticker))}</b> ${m(sapt.cea_mai_buna.realized, sapt.cea_mai_buna.currency)}` + (sapt.cea_mai_slaba ? ` · cea mai slabă: <b>${esc(sym(sapt.cea_mai_slaba.ticker))}</b> ${m(sapt.cea_mai_slaba.realized, sapt.cea_mai_slaba.currency)}` : '') + '</li>' : '') +
      (sapt.cumparari ? `<li>Intrări cu stop pus (acum): <b>${sapt.cuStop === null ? '—' : sapt.cuStop + ' din ' + sapt.cumparari}</b> · în zile „Prudent / Defensiv”: <b>${sapt.inZileRele}</b></li>` : '<li>Nicio cumpărare săptămâna aceasta.</li>') + '</ul></article>' : '';
    const ok = vt && !vt.monedeAmestecate, g = (x, nume) => `<tr><th>${nume}</th><td>${x.n}</td><td>${x.n ? Math.round(100 * x.castigatoare / x.n) + '%' : '—'}</td><td class="${ok && fin(x.medie) && x.medie < 0 ? 'neg' : 'pos'}">${ok && fin(x.medie) ? m(x.medie, vt?.moneda) : '—'}</td><td>${m(ok && x.n ? x.total : null, vt?.moneda)}</td></tr>`;
    const v = vt ? '<article class="jrv-card"><h3>Verdictul pieței față de tranzacțiile tale</h3>' + (vt.rows.length ? `<table class="jrv-tab"><thead><tr><th>Ziua intrării</th><th>Vânzări</th><th>Câștigătoare</th><th>Medie</th><th>Total</th></tr></thead><tbody>${g(vt.normal, 'Neutru / Favorabil')}${g(vt.redus, 'Prudent / Defensiv')}</tbody></table>` +
      `<p class="jrv-note">${vt.rows.length} vânzări cu rezultat, legate de deschiderea poziției (prima cumpărare după ce poziția era închisă). Verdictul notat de robot: ${vt.dinRobot}; restul — verdict parțial refăcut din trendul SPY / QQQ și VIX de atunci (fără privit în viitor). Descriptiv: puține tranzacții nu sunt o dovadă.` + (vt.monedeAmestecate ? ' Vânzări în monede diferite: media și totalul nu se adună (—).' : '') + '</p>' : '<p class="jrv-note">Nicio vânzare cu rezultat raportat de broker încă.</p>') + '</article>' : '';
    const alegeAn = ani.length > 1 ? ' <select id="jrvAn" aria-label="Anul raportului">' + ani.map((a) => `<option value="${a}"${a === fisc?.an ? ' selected' : ''}>${a}</option>`).join('') + '</select>' : '';
    const f = fisc ? `<article class="jrv-card"><h3>Raportul fiscal ${fisc.an}${alegeAn} <small>pentru Declarația unică</small></h3><ul><li>Câștiguri: <b class="pos">${num(fisc.castig)} lei</b> · pierderi: <b class="neg">${sgn(fisc.pierdere)} lei</b> · net: <b>${sgn(fisc.net)} lei</b></li><li>${fisc.rows.length} vânzări la cursul mediu anual BNR` + (fisc.provizoriu ? ' <b>(provizoriu — anul nu s-a încheiat)</b>' : '') + (fisc.lipsa ? ` · <span class="neg">${fisc.lipsa} fără rezultat sau fără curs</span>` : '') + `</li><li>La cursul din ziua fiecărei vânzări: net <b>${sgn(fisc.zi?.net)} lei</b></li></ul><p class="jrv-note">Rezultatul realizat e cel raportat de Trading 212 (cost mediu). Veniturile din străinătate se transformă în lei la cursul mediu anual comunicat de BNR (Codul fiscal, art. 130); varianta la cursul zilei e alături, pentru comparație. Dividendele nu sunt în execuții. Informativ — regula de conversie, cota și anul se verifică cu contabilul.</p><button class="btn ghost" type="button" id="jrvCsv"${fisc.rows.length ? '' : ' disabled'}>Descarcă CSV (${fisc.rows.length} rânduri)</button></article>` : '';
    return '<header class="jrv-head"><h2>Bilanțul tău</h2><p>Din execuțiile Trading 212 importate pe acest dispozitiv' + (stare ? ' · ' + esc(stare) : '') + '.</p></header><div class="jrv-grid">' + s + v + f + '</div>';
  }
  /** Cursul BNR din fișierul publicat de robot (candidate-engine/generated/curs-bnr.json). */
  function cursFile(url = '../candidate-engine/generated/curs-bnr.json', fetchImpl = g.fetch) { return typeof fetchImpl === 'function' ? fetchImpl(url + '?v=' + Math.floor(Date.now() / 3600000), { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((j) => j?.curs || null).catch(() => null) : Promise.resolve(null); }
  /** Stopurile puse acum (Portofoliu → tezele pozițiilor), ca Set de tickere. */
  function stopuri(scope, storage = g.localStorage) { try { const t = JSON.parse(storage.getItem('tt_holdings_theses_v1') || '{}'), out = new Set(); for (const [k, v] of Object.entries(t)) { const [s, tk] = k.includes('|') ? k.split('|') : [null, k]; if ((!scope || !s || s === scope) && fin(Number(v?.stop)) && Number(v.stop) > 0) out.add(tk); } return out; } catch (_) { return null; } }
  /** Anii cu vânzări (pentru alegerea raportului fiscal), cel mai nou primul. */
  function ani(tx) { return [...new Set(tx.filter((x) => x.side === 'SELL').map((x) => Number(dayRO(x.at).slice(0, 4))))].sort((a, b) => b - a); }
  g.JournalReview = { ani, tranzactii, cunoscutLa, cursMediu, verdictLa, partial, verdictTranzactii, saptamana, inceputSaptamana, cursLa, fiscal, csv, render, cursFile, stopuri, sym };
})(typeof window !== 'undefined' ? window : globalThis);
