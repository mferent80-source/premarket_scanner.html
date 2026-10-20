/* 17.10.2026 — Jurnal → fila „Raport”: raportul de execuție din execuțiile Trading 212 importate (registrul local), totul la vedere.
   - calatorii(): fiecare vânzare cu rezultatul raportat de broker, legată de cumpărările ei (primul intrat, primul ieșit — ExecutionReview.fifo):
     prețul mediu de intrare, zilele ținute, mișcarea %, mărimea poziției în moneda contului (aproximativ, la cursul BNR din ziua intrării), costurile;
   - stat(): rata de câștig, raportul câștig / pierdere, factorul de profit, speranța pe tranzacție, scăderea de la vârf, seriile, obiceiurile;
   - ideile 1–6: rezultatul în R (stopul din „Analize înaintea intrării” sau din Portofoliu), cât a mers prețul împotriva ta / în favoarea ta
     în timpul tranzacției și după ieșire (barele zilnice), rezultatul pe tipul analizei, limita de pierdere pe lună, ora intrării.
   Pur: pagina dă execuțiile, cursul, stopurile, analizele și barele. Nimic inventat: ce nu se poate calcula apare ca „—” cu motivul. */
(function (g) {
  'use strict';
  const fin = Number.isFinite, DAY = 86400000;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const F_N1 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), n1 = (v) => (fin(v) ? F_N1.format(v) : '—');
  const LEI = { RON: 'lei', EUR: '€', USD: '$', GBP: '£' };
  const bani = (v, c, semn = true) => (fin(v) ? (semn && v > 0 ? '+' : v < 0 ? '−' : '') + n1(Math.abs(v)) + ' ' + (LEI[c] || c || '') : '—').trim();
  const pc = (v) => (fin(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + n1(Math.abs(v)) + '%' : '—');
  const rr = (v) => (fin(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + n1(Math.abs(v)) + ' R' : '—');
  // 17.10 (pagina se bloca): toLocaleDateString cu fus orar creează un formator nou la FIECARE apel (~30 µs); la sute de vânzări × mii de bare = zeci de secunde
  // ⇒ formatoare create o singură dată + zilele barelor calculate o dată pe serie (WeakMap)
  const F_NY = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/New_York' }), F_RO = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Bucharest' });
  const dayNY = (t) => F_NY.format(t), dayRO = (t) => F_RO.format(t), ZILE = new WeakMap();
  const zileBare = (bars) => { let z = ZILE.get(bars); if (!z) { z = bars.map((b) => dayNY(b.t)); ZILE.set(bars, z); } return z; };
  const F_ZI = new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'Europe/Bucharest' }), zi = (t) => F_ZI.format(t);
  const F_ORA = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const sym = (ticker) => /^([A-Z][A-Z0-9.-]{0,23})_US_EQ$/.exec(ticker || '')?.[1] || (ticker || '').replace(/_[A-Z]{2}_EQ$/, '');
  const symYahoo = (ticker) => /^([A-Z][A-Z0-9.-]{0,23})_US_EQ$/.exec(ticker || '')?.[1]?.replace('.', '-') || null; // doar SUA: la celelalte bursele Yahoo au alt simbol
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const med = (xs) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  /** Lei pentru o unitate din moneda m în ziua t (ultima zi publicată, cel mult 10 zile înapoi). GBX = pence. */
  function cursLa(curs, m, t) {
    if (m === 'RON') return 1; if (m === 'GBX' || m === 'GBp') { const r = cursLa(curs, 'GBP', t); return fin(r) ? r / 100 : null; }
    if (!curs) return null; const d = dayRO(t), zile = Object.keys(curs).filter((z) => z <= d).sort();
    for (let i = zile.length - 1; i >= 0 && i >= zile.length - 10; i--) { const r = curs[zile[i]]?.[m]; if (fin(r)) return r; }
    return null;
  }
  const costuri = (f, moneda) => (Array.isArray(f?.taxes) ? f.taxes.filter((t) => t && t.currency === moneda && fin(t.quantity)).reduce((a, t) => a + Math.abs(t.quantity), 0) : 0);

  /** Tranzacțiile închise: o vânzare = un rând. rows = execuțiile (forma T212Performance / registrul local). */
  function calatorii(rows, { curs = null, moneda = null, fifo = g.ExecutionReview?.fifo } = {}) {
    const items = (rows || []).filter((x) => x && x.id != null && (x.type == null || x.type === 'TRADE') && ['BUY', 'SELL'].includes(x.side) && typeof x.ticker === 'string' && fin(Date.parse(x.date)));
    // revizia 17.10: un split / alt eveniment corporativ între intrare și ieșire schimbă cantitatea și prețul ⇒ intrarea, mișcarea și mărimea nu se mai pot calcula (rezultatul rămâne)
    const evenimente = (rows || []).filter((x) => x && x.type != null && x.type !== 'TRADE' && typeof x.ticker === 'string' && fin(Date.parse(x.date))).map((x) => ({ ticker: x.ticker, t: Date.parse(x.date) }));
    // începutul poziției deschise ACUM pe fiecare ticker (după ultima închidere completă) — stopul din Portofoliu e al ei, nu al tranzacțiilor vechi
    const deschisa = {}, cant = {}; for (const x of items.slice().sort((a, b) => Date.parse(a.date) - Date.parse(b.date))) { const q0 = cant[x.ticker] || 0, q1 = q0 + (x.side === 'BUY' ? 1 : -1) * (Number(x.quantity) || 0); if (q0 <= 1e-9 && q1 > 1e-9) deschisa[x.ticker] = Date.parse(x.date); cant[x.ticker] = Math.max(0, q1); if (q1 <= 1e-9) deschisa[x.ticker] = null; }
    const vanzari = items.filter((x) => x.side === 'SELL' && fin(x.realized) && /^[A-Z]{3}$/.test(x.currency || ''));
    if (!moneda) { const n = new Map(); for (const x of vanzari) n.set(x.currency, (n.get(x.currency) || 0) + 1); moneda = [...n].sort((a, b) => b[1] - a[1])[0]?.[0] || null; }
    const potriviri = typeof fifo === 'function' ? fifo(items.map((x) => ({ ...x, id: String(x.id) }))).matches : [], peVanzare = new Map(), cump = new Map(items.filter((x) => x.side === 'BUY').map((x) => [String(x.id), x]));
    for (const m of potriviri) { const k = String(m.sellId); if (!peVanzare.has(k)) peVanzare.set(k, []); peVanzare.get(k).push(m); }
    const out = []; let alteMonede = 0, faraCumparare = 0, partiale = 0, corporative = 0;
    for (const s of vanzari) {
      if (s.currency !== moneda) { alteMonede++; continue; }
      const ms = peVanzare.get(String(s.id)) || [], q = ms.reduce((a, m) => a + m.quantity, 0), t = Date.parse(s.date);
      const entry = q > 0 ? ms.reduce((a, m) => a + m.entry * m.quantity, 0) / q : null, intrare = ms.length ? Math.min(...ms.map((m) => Date.parse(m.opened))) : null;
      const zile = q > 0 ? ms.reduce((a, m) => a + (t - Date.parse(m.opened)) * m.quantity, 0) / q / DAY : null;
      if (!ms.length) faraCumparare++;
      const partial = ms.length > 0 && q < s.quantity - 1e-9 * Math.max(1, s.quantity), corp = intrare != null && evenimente.some((e) => e.ticker === s.ticker && e.t >= intrare && e.t <= t);
      if (partial) partiale++; if (corp) corporative++;
      const fx = intrare != null ? cursLa(curs, s.priceCurrency, intrare) : null, fxC = cursLa(curs, moneda, intrare ?? t);
      const cost = entry != null && !partial && !corp && fin(fx) && fin(fxC) && fxC > 0 ? (q * entry * fx) / fxC : null; // parțial: mărimea vânzării întregi nu e cunoscută
      const fees = costuri(s, moneda) + ms.reduce((a, m) => { const b = cump.get(String(m.buyId)); return a + (b && b.quantity > 0 ? costuri(b, moneda) * (m.quantity / b.quantity) : 0); }, 0);
      out.push({ id: String(s.id), ticker: s.ticker, sym: sym(s.ticker), iesire: t, intrare, zile, qty: s.quantity, entry: corp ? null : entry, exit: s.price, pc: s.priceCurrency || null,
        pct: entry && !corp ? (s.price / entry - 1) * 100 : null, cost, fees, rez: s.realized, moneda, partial, corp, buyIds: ms.map((m) => String(m.buyId)) });
    }
    return { rows: out.sort((a, b) => a.iesire - b.iesire), moneda, alteMonede, faraCumparare, partiale, corporative, deschisa };
  }

  /** Cifrele unei liste de tranzacții (crescător după ieșire). */
  function stat(tr) {
    const w = tr.filter((x) => x.rez > 0), l = tr.filter((x) => x.rez <= 0), sum = (xs) => xs.reduce((a, x) => a + x.rez, 0);
    const brutC = sum(w), brutP = -sum(l), aw = avg(w.map((x) => x.rez)), al = avg(l.map((x) => -x.rez));
    let c = 0, peak = 0, dd = 0, ddDe = null, ddLa = null, pk = tr.length ? tr[0].iesire : null; const curba = []; // fără vârf pe plus: scăderea se socotește de la prima vânzare
    for (const x of tr) { c += x.rez; if (c > peak) { peak = c; pk = x.iesire; } const d = peak - c; if (d > dd) { dd = d; ddDe = pk; ddLa = x.iesire; } curba.push({ t: x.iesire, c, d, x }); }
    let sW = 0, sL = 0, cW = 0, cL = 0; for (const x of tr) { if (x.rez > 0) { cW++; cL = 0; } else { cL++; cW = 0; } sW = Math.max(sW, cW); sL = Math.max(sL, cL); }
    const dupa2 = []; for (let i = 2; i < tr.length; i++) if (tr[i - 1].rez <= 0 && tr[i - 2].rez <= 0) dupa2.push(tr[i]);
    const zw = w.filter((x) => fin(x.zile)), zl = l.filter((x) => fin(x.zile));
    return { n: tr.length, w, l, net: brutC - brutP, brutC, brutP, rata: tr.length ? (w.length / tr.length) * 100 : null, aw, al, raport: aw && al ? aw / al : null, pf: brutP > 0 ? brutC / brutP : null,
      sp: tr.length ? (brutC - brutP) / tr.length : null, dd, ddDe, ddLa, curba, sW, sL, dupa2, fee: tr.reduce((a, x) => a + (x.fees || 0), 0),
      zw: avg(zw.map((x) => x.zile)), zl: avg(zl.map((x) => x.zile)), nZile: zw.length + zl.length };
  }

  /** Idea 1 — R: (ieșire − intrare) / (intrare − stop), în moneda acțiunii. Stopul: analiza salvată înaintea intrării (prioritar) sau Portofoliul. */
  function rDin(row, stop) { return fin(row?.entry) && fin(row?.exit) && fin(stop) && stop > 0 && stop < row.entry ? (row.exit - row.entry) / (row.entry - stop) : null; }
  function stopuriR(rows, { analize = [], teze = {}, deschisa = null, istoricStop = {} } = {}) {
    // 17.10: stopul pus din fereastra de pe Astăzi / Portofoliu în primele 24 h după intrare (și înainte de ieșire) = stopul LA INTRARE (fără privit în viitor)
    const laIntrare = (r) => { if (r.intrare == null) return null; const xs = (istoricStop?.[r.ticker] || []).filter((h) => h.at >= r.intrare - 3600000 && h.at <= r.intrare + 86400000 && h.at < r.iesire); return xs.length ? { stop: xs[0].stop, tinta: xs[0].tinta, sursa: 'la-intrare' } : null; };
    const dinAnaliza = new Map(); for (const o of analize || []) for (const id of o?.sellIds || []) if (fin(o?.record?.stop)) dinAnaliza.set(String(id), { stop: o.record.stop, tinta: fin(o.record.target) ? o.record.target : null, tip: o.record.verdict?.title || o.record.verdict?.code || 'analiză', sursa: 'analiza' });
    // revizia 17.10: stopul pus ACUM în Portofoliu e al poziției deschise acum ⇒ doar vânzările ei parțiale (intrate după deschiderea ei); tranzacțiile vechi nu primesc un R inventat
    const ePozitiaDeAcum = (r) => !deschisa || (fin(deschisa[r.ticker]) && r.intrare != null && r.intrare >= deschisa[r.ticker]);
    return rows.map((r) => { const a = dinAnaliza.get(r.id), li = a ? null : laIntrare(r), s = a || li || (fin(teze?.[r.ticker]) && ePozitiaDeAcum(r) ? { stop: teze[r.ticker], sursa: 'portofoliu' } : null); return { ...r, stop: s?.stop ?? null, tinta: a?.tinta ?? li?.tinta ?? null, stopSursa: s?.sursa || null, tip: a?.tip || null, R: rDin(r, s?.stop) }; });
  }
  /** Ideile 2 și 3 — cât a mers prețul împotriva ta / în favoarea ta în timpul tranzacției și unde era la 5 sesiuni după ieșire (bare zilnice {t,h,l,c}). */
  function excursie(row, bars) {
    if (!row || !fin(row.entry) || row.intrare == null || !Array.isArray(bars) || !bars.length) return null;
    const d0 = dayNY(row.intrare), d1 = dayNY(row.iesire), zb = zileBare(bars), in_ = bars.filter((b, i) => zb[i] >= d0 && zb[i] <= d1 && fin(b.h) && fin(b.l));
    if (!in_.length) return null;
    const hiT = Math.max(...in_.map((b) => b.h)), loT = Math.min(...in_.map((b) => b.l));
    if (row.entry > hiT * 1.3 || row.entry < loT * 0.7) return { nepotrivit: true }; // prețurile Yahoo nu se potrivesc (split / altă bursă)
    // revizia 17.10: zilele DINTRE intrare și ieșire întregi; în ziua intrării și a ieșirii contează prețul tău (altfel intră și prețurile de dinainte de cumpărare / de după vânzare)
    const mijloc = bars.filter((b, i) => zb[i] > d0 && zb[i] < d1 && fin(b.h) && fin(b.l)), capete = [row.entry, fin(row.exit) ? row.exit : row.entry];
    const hi = Math.max(...capete, ...mijloc.map((b) => b.h)), lo = Math.min(...capete, ...mijloc.map((b) => b.l));
    const dupa = bars.filter((b, i) => zb[i] > d1 && fin(b.c)), b5 = dupa[4] || null;
    let iE = -1, iX = -1; for (let i = 0; i < zb.length; i++) { if (iE < 0 && zb[i] >= d0) iE = i; if (zb[i] <= d1) iX = i; }
    const daca = iE >= 0 && iX > iE && fin(row.pct) ? dacaReguli(row, bars, iE, iX) : null;
    return { mfe: (hi / row.entry - 1) * 100, mae: (lo / row.entry - 1) * 100, dupa5: b5 && fin(row.exit) ? (b5.c / row.exit - 1) * 100 : null, daca };
  }
  /** Idea 6 — ora intrării, la New York. */
  const ORE = ['înainte de deschidere', '9:30–10:30', '10:30–12:00', '12:00–14:00', '14:00–16:00', 'după închidere'];
  function ora(t) { const p = F_ORA.format(t).split(':').map(Number), m = p[0] * 60 + p[1];
    return m < 570 ? 0 : m < 630 ? 1 : m < 720 ? 2 : m < 840 ? 3 : m < 960 ? 4 : 5; }
  /** Idea 5 — rezultatul lunii curente față de limita de pierdere pe lună (în moneda contului). */
  function limitaLuna(tr, limita, now = Date.now()) {
    const luna = dayRO(now).slice(0, 7), xs = tr.filter((x) => dayRO(x.iesire).slice(0, 7) === luna), rez = xs.reduce((a, x) => a + x.rez, 0);
    if (!fin(limita) || limita <= 0) return { luna, rez, n: xs.length, limita: null, folosit: null, stare: 'nesetat' };
    const folosit = rez < 0 ? (-rez / limita) * 100 : 0;
    return { luna, rez, n: xs.length, limita, folosit, stare: folosit >= 100 ? 'depasit' : folosit >= 75 ? 'aproape' : 'ok' };
  }


  // ---------- I-690..I-695 (17.10.2026): etichete, planul față de execuție, S&P în aceleași zile, încrederea, „ce-ar fi fost dacă” ----------
  /** I-690 — etichetele unei tranzacții (aceleași idei ca jurnalul manual din lib/journal.js), ținute pe id-ul vânzării. */
  const ETICHETE = [['plan', 'am respectat planul'], ['good-exec', 'execuție bună'], ['no-plan', 'fără plan'], ['fomo', 'FOMO'], ['chase', 'am fugit după preț'], ['revenge', 'răzbunare după pierdere'], ['early-exit', 'ieșire prea devreme'], ['late-exit', 'ieșire prea târziu'], ['stop-mutat', 'am mutat stopul']];
  const ET = Object.fromEntries(ETICHETE);
  function cuEtichete(rows, harta = {}) { return rows.map((r) => { const v = harta?.[r.id], xs = Array.isArray(v) ? v : Array.isArray(v?.e) ? v.e : []; return { ...r, etichete: xs.filter((k) => ET[k]) }; }); }
  function peEticheta(tr) {
    const m = new Map(); for (const x of tr) for (const k of x.etichete || []) { const o = m.get(k) || { k, n: 0, v: 0, w: 0, R: [] }; o.n++; o.v += x.rez; o.w += x.rez > 0; if (fin(x.R)) o.R.push(x.R); m.set(k, o); }
    return { randuri: [...m.values()].sort((a, b) => a.v - b.v), fara: tr.filter((x) => !(x.etichete || []).length).length };
  }
  /** I-691 — ieșirea față de planul din analiza salvată: la țintă / între stop și țintă (manual) / la stop / sub stop (stop nerespectat sau salt de preț). */
  function planVsExecutie(tr) {
    const G = { tinta: [], manual: [], stop: [], subStop: [] };
    for (const x of tr) {
      if (!['analiza', 'la-intrare'].includes(x.stopSursa) || ![x.tinta, x.stop, x.entry, x.exit].every(fin) || !(x.tinta > x.entry) || !(x.stop < x.entry)) continue;
      const risc = x.entry - x.stop, drum = (x.exit - x.entry) / (x.tinta - x.entry);
      G[x.exit >= x.tinta ? 'tinta' : x.exit > x.stop ? 'manual' : x.exit >= x.stop - 0.1 * risc ? 'stop' : 'subStop'].push({ ...x, drum });
    }
    return G;
  }
  /** I-694 — SPY între ultima sesiune ÎNCHEIATĂ la intrare și ultima încheiată la ieșire (fără privit în viitor); doar acțiunile din SUA. */
  const F_ORA_NY = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', hourCycle: 'h23' });
  function inchisLa(bars, t) { const z = zileBare(bars), d = dayNY(t), dupa = Number(F_ORA_NY.format(t).slice(0, 2)) >= 16; let lo = 0, hi = z.length - 1, r = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (dupa ? z[mid] <= d : z[mid] < d) { r = mid; lo = mid + 1; } else hi = mid - 1; } return r; }
  function fataDeSpy(row, spy) {
    if (!row || row.intrare == null || !fin(row.pct) || !Array.isArray(spy) || spy.length < 2 || !symYahoo(row.ticker)) return null;
    const a = inchisLa(spy, row.intrare), b = inchisLa(spy, row.iesire); if (a < 0 || b < 0 || !fin(spy[a].c) || !fin(spy[b].c)) return null;
    const s = (spy[b].c / spy[a].c - 1) * 100; return { spy: s, peste: row.pct - s, lei: fin(row.cost) ? row.rez - (row.cost * s) / 100 : null };
  }
  /** I-693 — bootstrap pe tranzacții (mulberry32, sămânță fixă ⇒ aceleași cifre la fiecare desen) și Monte Carlo pe următoarele 50. */
  function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // 19.10.2026 (perf): cele 2000 de extrageri rulau la fiecare desen (filtre, etichete, bare citite…) pe aceleași rezultate ⇒ ținut minte
  let incMemo = null;
  function incredere(tr, { extrageri = 2000, viitoare = 50, samanta = 20261017 } = {}) {
    const v = tr.map((x) => x.rez).filter(fin), n = v.length; if (n < 10) return null;
    const cheie = extrageri + '|' + viitoare + '|' + samanta + '|' + v.join(',');
    if (incMemo && incMemo.cheie === cheie) return incMemo.rez;
    const rez = incredereCalc(v, n, extrageri, viitoare, samanta); incMemo = { cheie, rez }; return rez;
  }
  function incredereCalc(v, n, extrageri, viitoare, samanta) {
    const rnd = mulberry32(samanta + n), medii = new Float64Array(extrageri), dds = new Float64Array(extrageri); let neg = 0;
    for (let i = 0; i < extrageri; i++) {
      let s = 0; for (let j = 0; j < n; j++) s += v[(rnd() * n) | 0]; medii[i] = s / n;
      let c = 0, pk = 0, dd = 0; for (let j = 0; j < viitoare; j++) { c += v[(rnd() * n) | 0]; if (c > pk) pk = c; if (pk - c > dd) dd = pk - c; } dds[i] = dd; if (c < 0) neg++;
    }
    // I-730 (20.10.2026): bootstrap PE BLOCURI de 5 tranzacții consecutive (seriile de pierderi se păstrează) ⇒ scăderea și seria de pierderi la rând
    // la percentila 95 pe următoarele `viitoare`, de pus față de pragurile Governor (DD rolling, cooldown). Extragerile simple de mai sus rămân neschimbate.
    const L = 5, ddsBloc = new Float64Array(extrageri), serii = new Float64Array(extrageri);
    for (let i = 0; i < extrageri; i++) {
      let c = 0, pk = 0, dd = 0, run = 0, best = 0, k = 0;
      while (k < viitoare) { const start = (rnd() * n) | 0; for (let j = 0; j < L && k < viitoare; j++, k++) { const x = v[(start + j) % n]; c += x; if (c > pk) pk = c; if (pk - c > dd) dd = pk - c; if (x <= 0) { run++; if (run > best) best = run; } else run = 0; } }
      ddsBloc[i] = dd; serii[i] = best;
    }
    medii.sort(); dds.sort(); ddsBloc.sort(); serii.sort(); const q = (a, p) => a[Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))))];
    const m = v.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)), trebuie = m > 0 && sd > 0 ? Math.ceil(((1.645 * sd) / m) ** 2) : null;
    return { n, medie: m, lo: q(medii, 0.05), hi: q(medii, 0.95), ddMed: q(dds, 0.5), dd95: q(dds, 0.95), pNeg: (neg / extrageri) * 100, viitoare, trebuie, maiTrebuie: trebuie != null ? Math.max(0, trebuie - n) : null,
      bloc: L, ddBlocMed: q(ddsBloc, 0.5), ddBloc95: q(ddsBloc, 0.95), serieMed: q(serii, 0.5), serie95: q(serii, 0.95) };
  }
  /** I-695 — 3 reguli refăcute pe barele zilnice (ziua intrării nu se folosește: ordinea în zi nu se știe; în ziua ieșirii — varianta mai proastă). */
  function dacaReguli(row, bars, iE, iX) {
    const e = row.entry, real = row.pct, out = { stop1R: null, prag3: real, zile5: real };
    if (['analiza', 'la-intrare'].includes(row.stopSursa) && fin(row.stop) && row.stop < e) { out.stop1R = real; for (let j = iE + 1; j <= iX; j++) { const b = bars[j]; if (!fin(b.l) || b.l > row.stop) continue; const px = fin(b.o) && b.o < row.stop ? b.o : row.stop, p = (px / e - 1) * 100; out.stop1R = j === iX ? Math.min(p, real) : p; break; } }
    let armat = false; for (let j = iE + 1; j <= iX; j++) { const b = bars[j]; if (armat && fin(b.l) && b.l <= e) { const px = fin(b.o) && b.o < e ? b.o : e, p = (px / e - 1) * 100; out.prag3 = j === iX ? Math.min(p, real) : p; break; } if (fin(b.h) && b.h >= e * 1.03) armat = true; }
    if (iX - iE > 5 && fin(bars[iE + 5]?.c)) out.zile5 = (bars[iE + 5].c / e - 1) * 100;
    return out;
  }

  // ---------- 20.10.2026 (I-726 / I-729): disciplina din execuțiile reale și alunecarea la intrare ----------
  /** Planul scris pentru o cumpărare: analiza salvată (TradeEvidence, legată de BUY prin buyIds) sau planul Shadow pe același simbol din cele 30 de minute dinainte. */
  const FEREASTRA_PLAN = 1800000, TOLERANTA_MARIME = 1.05;
  function planPentru(fill, { analize = [], plans = [] } = {}) {
    const id = String(fill.id), t = Date.parse(fill.date);
    const a = (analize || []).find((o) => (o?.buyIds || []).map(String).includes(id)) || null;
    const p = (plans || []).filter((x) => x && typeof x.symbol === 'string' && x.symbol + '_US_EQ' === fill.ticker && fin(x.createdAt) && x.createdAt <= t && t - x.createdAt <= FEREASTRA_PLAN && ['PLANNED', 'TRIGGERED', 'CLOSED'].includes(x.status)).sort((x, y) => y.createdAt - x.createdAt)[0] || null;
    if (!a && !p) return null;
    const r = a?.record;
    return { sursa: a ? 'analiza' : 'plan', entry: fin(r?.entryHigh) ? r.entryHigh : fin(p?.entry) ? p.entry : null, stop: fin(r?.stop) ? r.stop : fin(p?.stop) ? p.stop : null, shares: fin(p?.shares) ? p.shares : null, la: a ? r.createdAt : p.createdAt };
  }
  /** I-726 — registrul încălcărilor: fiecare BUY real față de verdictul Governor DE ATUNCI (jurnalul append-only GV.jurnal), limita lunară,
      planul scris în 30 de minute înainte și mărimea față de plan. Intrările de dinaintea primului verdict notat nu se judecă. */
  function disciplina(rows, { jurnal = [], analize = [], plans = [], now = Date.now() } = {}) {
    const j = (Array.isArray(jurnal) ? jurnal : []).filter((e) => e && fin(e.ts)).sort((a, b) => a.ts - b.ts), deLa = j.length ? j[0].ts : null;
    const buys = (rows || []).filter((x) => x && x.id != null && (x.type == null || x.type === 'TRADE') && x.side === 'BUY' && typeof x.ticker === 'string' && fin(Date.parse(x.date)) && Date.parse(x.date) <= now && deLa != null && Date.parse(x.date) >= deLa).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    const randuri = buys.map((f) => {
      const t = Date.parse(f.date); let v = null; for (const e of j) { if (e.ts <= t) v = e; else break; }
      const plan = planPentru(f, { analize, plans }), inc = [];
      if (v && ['HALTED', 'NEVERIFICAT'].includes(v.verdict)) inc.push('halted');
      if (v && v.luna === 'depasit') inc.push('limita');
      if (!plan) inc.push('fara-plan');
      else if (fin(plan.shares) && fin(f.quantity) && f.quantity > plan.shares * TOLERANTA_MARIME) inc.push('peste-plan');
      return { id: String(f.id), ticker: f.ticker, sym: sym(f.ticker), t, verdict: v ? v.verdict : null, luna: v ? v.luna : null, plan, incalcari: inc };
    });
    const cnt = (k) => randuri.filter((r) => r.incalcari.includes(k)).length;
    return { deLa, n: randuri.length, cuPlan: randuri.filter((r) => r.plan).length, faraVerdict: randuri.filter((r) => !r.verdict).length, incalcari: { halted: cnt('halted'), limita: cnt('limita'), faraPlan: cnt('fara-plan'), pestePlan: cnt('peste-plan'), total: randuri.filter((r) => r.incalcari.length).length }, randuri };
  }
  /** Rezultatul tranzacțiilor închise pornite dintr-o cumpărare cu încălcări față de cele pornite curat. */
  function disciplinaRezultat(tr, d) {
    const rele = new Set((d?.randuri || []).filter((r) => r.incalcari.length).map((r) => r.id)), bune = new Set((d?.randuri || []).filter((r) => !r.incalcari.length).map((r) => r.id));
    const a = (tr || []).filter((x) => (x.buyIds || []).some((id) => rele.has(String(id)))), b = (tr || []).filter((x) => (x.buyIds || []).length && (x.buyIds || []).every((id) => bune.has(String(id))));
    return { cuIncalcari: { n: a.length, medie: avg(a.map((x) => x.rez)), total: a.reduce((s, x) => s + x.rez, 0) }, fara: { n: b.length, medie: avg(b.map((x) => x.rez)), total: b.reduce((s, x) => s + x.rez, 0) } };
  }
  /** I-729 — alunecarea la intrare: prețul executat față de intrarea planului, în puncte de bază și în R (față de intrare − stop).
      Pragul (media ultimelor 10 peste 0,1 R) e scris ACUM, înainte de date — separă „regula e proastă” de „execuția e proastă”. */
  const PRAG_ALUNECARE_R = 0.1;
  function alunecare(rows, { analize = [], plans = [], now = Date.now(), prag = PRAG_ALUNECARE_R } = {}) {
    const buys = (rows || []).filter((x) => x && x.id != null && (x.type == null || x.type === 'TRADE') && x.side === 'BUY' && typeof x.ticker === 'string' && fin(x.price) && x.price > 0 && fin(Date.parse(x.date)) && Date.parse(x.date) <= now).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    const randuri = [];
    for (const f of buys) { const p = planPentru(f, { analize, plans }); if (!p || !fin(p.entry) || p.entry <= 0) continue; const bps = ((f.price - p.entry) / p.entry) * 10000, R = fin(p.stop) && p.stop < p.entry ? (f.price - p.entry) / (p.entry - p.stop) : null; randuri.push({ id: String(f.id), ticker: f.ticker, sym: sym(f.ticker), t: Date.parse(f.date), fill: f.price, entry: p.entry, stop: p.stop, bps, R, sursa: p.sursa, ora: symYahoo(f.ticker) ? ora(Date.parse(f.date)) : null }); }
    const cuR = randuri.filter((r) => fin(r.R)), ultimele = cuR.slice(-10), m10 = avg(ultimele.map((r) => r.R));
    const grup = (cheie) => { const m = new Map(); for (const r of randuri) { const k = cheie(r); if (k == null) continue; const o = m.get(k) || { k, n: 0, bps: [], R: [] }; o.n++; o.bps.push(r.bps); if (fin(r.R)) o.R.push(r.R); m.set(k, o); } return [...m.values()].map((o) => ({ k: o.k, n: o.n, bps: avg(o.bps), R: avg(o.R) })); };
    return { n: randuri.length, faraPlan: buys.length - randuri.length, bps: avg(randuri.map((r) => r.bps)), bpsMed: med(randuri.map((r) => r.bps)), R: avg(cuR.map((r) => r.R)), RMed: med(cuR.map((r) => r.R)), ultimele10: { n: ultimele.length, R: m10, alerta: ultimele.length >= 5 && fin(m10) && m10 > prag }, prag, peTicker: grup((r) => r.ticker).sort((a, b) => (b.R ?? -Infinity) - (a.R ?? -Infinity)), peOra: grup((r) => r.ora).sort((a, b) => a.k - b.k), randuri };
  }

  // ---------- grafice (SVG ca text; data-tip = textul care apare la atingere) ----------
  const tip = (s) => ` data-tip="${esc(s)}"`;
  // revizia 17.10: valori aproape de zero (0,1 + 0,2 − 0,3) dădeau un pas de 1e-18 și o buclă de sute de milioane de pași ⇒ sub un ban = un singur reper, marjă relativă, cel mult 50
  function ticks(lo, hi, n = 4) { if (!fin(lo) || !fin(hi)) return []; if (hi - lo < 0.005) return [0]; const s0 = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(s0)), st = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= s0); const o = []; for (let v = Math.ceil(lo / st) * st; v <= hi + st * 1e-6 && o.length < 50; v += st) o.push(+v.toFixed(6)); return o; }
  const scurt = (v) => (Math.abs(v) >= 1000 ? (v < 0 ? '−' : '') + n1(Math.abs(v) / 1000) + ' k' : (v < 0 ? '−' : '') + Math.round(Math.abs(v)));
  const bara = (x, y0, y1, w, cls) => { const h = Math.abs(y1 - y0), r = Math.min(4, w / 2, h), up = y1 < y0, top = Math.min(y0, y1); if (h < 0.5) return '';
    return `<path class="${cls}" d="${up ? `M${x} ${y0} V${top + r} Q${x} ${top} ${x + r} ${top} H${x + w - r} Q${x + w} ${top} ${x + w} ${top + r} V${y0} Z` : `M${x} ${y0} V${y1 - r} Q${x} ${y1} ${x + r} ${y1} H${x + w - r} Q${x + w} ${y1} ${x + w} ${y1 - r} V${y0} Z`}"/>`; };
  function svgCurba(s, m) {
    if (!s.curba.length) return '<p class="jrr-gol">Nicio vânzare în perioada aleasă.</p>';
    const W = 900, H = 300, L = 58, R = 14, T = 12, H1 = 190, T2 = 214, H2 = 70, t0 = s.curba[0].t - DAY, t1 = s.curba.at(-1).t, X = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R);
    const lo = Math.min(0, ...s.curba.map((p) => p.c)), hi = Math.max(0, ...s.curba.map((p) => p.c)), Y = (v) => T + ((hi - v) / (hi - lo || 1)) * H1, ddMax = Math.max(1e-9, ...s.curba.map((p) => p.d)), Y2 = (d) => T2 + (d / ddMax) * H2;
    const pts = [{ t: t0, c: 0, d: 0 }, ...s.curba], dP = pts.map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.c).toFixed(1)).join(' '), dD = pts.map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y2(p.d).toFixed(1)).join(' ');
    let o = `<svg class="jrr-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Rezultatul realizat cumulat și scăderea de la vârf">`;
    for (const v of ticks(lo, hi)) o += `<line class="ax" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${scurt(v)}</text>`;
    o += `<path class="arie" d="${dP} L${X(t1).toFixed(1)} ${Y(0)} L${X(t0)} ${Y(0)} Z"/><path class="linie" d="${dP}"/><line class="zero" x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}"/>`;
    o += `<circle class="punct" cx="${X(t1)}" cy="${Y(s.curba.at(-1).c)}" r="4.5"/>`;
    o += `<text x="${L}" y="${T2 - 6}">scăderea de la vârf</text><line class="ax" x1="${L}" x2="${W - R}" y1="${T2}" y2="${T2}"/><text x="${L - 8}" y="${T2 + 4}" text-anchor="end">0</text><text x="${L - 8}" y="${T2 + H2 + 4}" text-anchor="end">${scurt(-ddMax)}</text>`;
    o += `<path class="dd" d="${dD} L${X(t1).toFixed(1)} ${T2} L${X(t0)} ${T2} Z"/>`;
    const d0 = new Date(t0); for (let k = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1), i = 0; k <= t1 && i < 40; i++, k = Date.UTC(new Date(k).getUTCFullYear(), new Date(k).getUTCMonth() + 1, 1)) o += `<text x="${X(k)}" y="${H - 2}" text-anchor="middle">${new Date(k).toLocaleDateString('ro-RO', { month: 'short', timeZone: 'UTC' }).replace('.', '')}</text>`;
    s.curba.forEach((p, i) => { const a = i ? (X(s.curba[i - 1].t) + X(p.t)) / 2 : L, b = i < s.curba.length - 1 ? (X(p.t) + X(s.curba[i + 1].t)) / 2 : W - R;
      o += `<rect class="hit" x="${a.toFixed(1)}" y="0" width="${Math.max(1, b - a).toFixed(1)}" height="${H}"${tip(`${zi(p.t)} · ${p.x.sym} ${bani(p.x.rez, m)}\ncumulat ${bani(p.c, m)}\nsub vârf ${bani(-p.d, m)}`)}/>`; });
    return o + '</svg>';
  }
  function svgBare(items, { W = 440, H = 230, fmt = scurt, eticheta = 'grafic cu bare' } = {}) {
    items = items.map((i) => ({ ...i, v: fin(i.v) ? Math.round(i.v * 100) / 100 : i.v }));
    const L = 46, R = 8, T = 12, B = 26, ph = H - T - B, vals = items.map((i) => i.v).filter(fin); if (!vals.length) return '<p class="jrr-gol">—</p>';
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), Y = (v) => T + ((hi - v) / (hi - lo || 1)) * ph, bw = (W - L - R) / items.length;
    let o = `<svg class="jrr-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(eticheta)}">`;
    for (const v of ticks(lo, hi)) o += `<line class="ax" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
    items.forEach((it, i) => { const x = L + i * bw + 2, w = Math.max(2, bw - 4); if (fin(it.v)) o += bara(x, Y(0), Y(it.v), w, it.v >= 0 ? 'gain' : 'loss');
      o += `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${esc(it.k)}</text><rect class="hit" x="${L + i * bw}" y="${T}" width="${bw}" height="${ph}"${tip(it.tip)}/>`; });
    return o + `<line class="zero" x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}"/></svg>`;
  }
  function svgDist(s, tr, m) {
    if (tr.length < 2) return '<p class="jrr-gol">Prea puține tranzacții pentru distribuție.</p>';
    const W = 440, H = 230, L = 34, R = 8, T = 12, B = 26, ph = H - T - B, mxAbs = Math.max(...tr.map((x) => Math.abs(x.rez))), step0 = mxAbs / 6, mag = 10 ** Math.floor(Math.log10(step0 || 1)), step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= step0) || 1;
    const lo = Math.floor(Math.min(0, ...tr.map((x) => x.rez)) / step) * step, hi = Math.max(Math.ceil(Math.max(0, ...tr.map((x) => x.rez)) / step) * step, lo + step), bins = [];
    for (let a = lo; a < hi - 1e-9; a += step) bins.push({ a, b: a + step, n: tr.filter((x) => x.rez >= a && (x.rez < a + step || (a + step >= hi && x.rez <= hi))).length });
    const mx = Math.max(1, ...bins.map((b) => b.n)), X = (v) => L + ((v - lo) / (hi - lo)) * (W - L - R), Y = (n) => T + (1 - n / mx) * ph;
    let o = `<svg class="jrr-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Distribuția rezultatelor pe tranzacție">`;
    for (const v of ticks(0, mx, 3)) o += `<line class="ax" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
    for (const b of bins) { if (b.n) o += bara(X(b.a) + 1, T + ph, Y(b.n), X(b.b) - X(b.a) - 2, b.b <= 0 ? 'loss' : 'gain'); o += `<rect class="hit" x="${X(b.a)}" y="${T}" width="${X(b.b) - X(b.a)}" height="${ph}"${tip(`${scurt(b.a)} … ${scurt(b.b)} ${LEI[m] || m}\n${b.n} tranzacții`)}/>`; }
    for (const v of ticks(lo, hi, 5)) o += `<text x="${X(v)}" y="${H - 8}" text-anchor="middle">${scurt(v)}</text>`;
    o += `<line class="zero" x1="${X(0)}" x2="${X(0)}" y1="${T}" y2="${T + ph}"/>`;
    for (const [v, nm] of [[-s.al, 'pierderea medie'], [s.aw, 'câștigul mediu']]) if (fin(v)) o += `<line class="medie" x1="${X(v)}" x2="${X(v)}" y1="${T}" y2="${T + ph}"/><text class="medie-t" x="${X(v) + (v < 0 ? -4 : 4)}" y="${T + 10}" text-anchor="${v < 0 ? 'end' : 'start'}">${nm}</text>`;
    return o + '</svg>';
  }
  function svgPuncte(tr, m) {
    const p = tr.filter((x) => fin(x.cost) && fin(x.pct)); if (p.length < 3) return '<p class="jrr-gol">Mărimea pozițiilor nu se poate calcula încă (lipsește cursul BNR sau cumpărările).</p>';
    const W = 900, H = 240, L = 46, R = 10, T = 10, B = 26, x1 = Math.max(...p.map((x) => x.cost)) * 1.05, y0 = Math.min(0, ...p.map((x) => x.pct)), y1 = Math.max(0, ...p.map((x) => x.pct));
    const X = (v) => L + (v / x1) * (W - L - R), Y = (v) => T + ((y1 - v) / (y1 - y0 || 1)) * (H - T - B);
    let o = `<svg class="jrr-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mărimea poziției față de mișcarea procentuală">`;
    for (const v of ticks(y0, y1)) o += `<line class="ax" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${(v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v)}%</text>`;
    for (const v of ticks(0, x1, 4)) o += `<text x="${X(v)}" y="${H - 8}" text-anchor="middle">${scurt(v)}</text>`;
    o += `<line class="zero" x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}"/>`;
    for (const x of p) o += `<circle class="${x.rez > 0 ? 'gain' : 'loss'} dot" cx="${X(x.cost).toFixed(1)}" cy="${Y(x.pct).toFixed(1)}" r="5"${tip(`${x.sym} · ${x.intrare ? zi(x.intrare) + ' → ' : ''}${zi(x.iesire)}\npoziție ~${bani(x.cost, m, false)} · ${pc(x.pct)}\nrezultat ${bani(x.rez, m)}`)}/>`;
    return o + '</svg>';
  }
  function calendar(tr, m, now = Date.now()) {
    const zile = new Map(); for (const x of tr) { const k = dayRO(x.iesire); const o = zile.get(k) || { v: 0, n: 0, t: [] }; o.v += x.rez; o.n++; o.t.push(x.sym); zile.set(k, o); }
    const mx = Math.max(1e-9, ...[...zile.values()].map((o) => Math.abs(o.v))), azi = dayRO(now), y = +azi.slice(0, 4), mo = +azi.slice(5, 7) - 1, out = [];
    for (let k = 5; k >= 0; k--) { const f = new Date(Date.UTC(y, mo - k, 1)), nz = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth() + 1, 0)).getUTCDate(), off = (f.getUTCDay() + 6) % 7; let c = '<span class="gol"></span>'.repeat(off);
      for (let d = 1; d <= nz; d++) { const dt = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), d)), key = dt.toISOString().slice(0, 10), o = zile.get(key), wd = dt.getUTCDay();
        if (o) { const a = Math.round((0.35 + 0.65 * Math.min(1, Math.abs(o.v) / mx)) * 100); c += `<span class="${o.v < 0 ? 'z-loss' : 'z-gain'}" style="--a:${a}%"${tip(`${zi(dt.getTime() + 43200000)}\n${bani(o.v, m)} · ${o.n} ${o.n === 1 ? 'vânzare' : 'vânzări'}\n${o.t.join(', ')}`)} tabindex="0"></span>`; }
        else c += `<span class="${wd === 0 || wd === 6 ? 'weekend' : ''}"></span>`; }
      out.push(`<div class="jrr-luna"><h4>${f.toLocaleDateString('ro-RO', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</h4><div class="jrr-dz"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div><div class="jrr-zile">${c}</div></div>`); }
    return `<div class="jrr-cal">${out.join('')}</div>`;
  }

  /** I-730 — cozile din propriile date față de pragurile Governor: scăderea la 95 % (blocuri) față de pragul DD rolling; seria de pierderi la 95 % față de cooldown. */
  function coziHtml(inc, md, m) {
    if (!inc) return '';
    const gov = md.gov || null, cont = fin(md.cont) && md.cont > 0 ? md.cont : null, ddPct = cont ? (inc.ddBloc95 / cont) * 100 : null, dd = gov && fin(gov.maxDdPctRolling) ? gov.maxDdPctRolling : null, cd = gov && fin(gov.cooldownAfterLosses) ? gov.cooldownAfterLosses : null;
    let txt = '';
    if (ddPct != null && dd != null) txt += ddPct > dd ? `⚠ Pragul DD de ${n1(dd)} % e SUB scăderea din ghinion normal (${n1(ddPct)} % din cont în 5 % din lumi, pe următoarele ${inc.viitoare}): te-ar opri fără să fi greșit — pragul de revizuire e în docs/politica-de-risc.md.` : `✓ Pragul DD de ${n1(dd)} % e peste scăderea din ghinion normal (${n1(ddPct)} % din cont în 5 % din lumi).`;
    else if (dd != null) txt += 'Contul nu e citit în moneda raportului: scăderea nu se poate pune față de pragul DD.';
    if (cd != null) txt += (txt ? ' ' : '') + (inc.serie95 >= cd ? `⚠ În 95 % din lumi ajungi la ${inc.serie95} pierderi la rând ≥ cooldown ${cd}: cooldown-ul se va declanșa des din zgomot, nu din greșeală.` : `✓ Seria de pierderi din zgomot (cel mult ${inc.serie95} în 95 % din lumi) stă sub cooldown (${cd}).`);
    return `<div class="jrr-r-cifre jrr-cozi"><div><small>Pe blocuri de ${inc.bloc} · scăderea în 5 % cele mai rele lumi</small><b class="neg">${bani(-inc.ddBloc95, m)}</b><span class="jrr-sub">${ddPct != null ? n1(ddPct) + ' % din cont' : 'contul nu e citit'}${dd != null ? ' · pragul DD ' + n1(dd) + ' %' : ''} · tipic ${bani(-inc.ddBlocMed, m)}</span></div><div><small>Pierderi la rând · în 95 % din lumi cel mult</small><b class="${cd != null && inc.serie95 >= cd ? 'neg' : ''}">${inc.serie95}</b><span class="jrr-sub">${cd != null ? 'cooldown la ' + cd : ''} · tipic ${inc.serieMed}</span></div></div>` + (txt ? `<p class="jrr-semnal-txt">${txt}</p>` : '');
  }
  // ---------- raportul întreg ----------
  /** model: { tr (filtrate), toate, moneda, perioada, ticker, ex (Map id→excursie), limita, stare, faraCumparare, alteMonede, tickere,
      rows (execuțiile brute), jurnal (GV.jurnal), analize (toate TradeEvidence.evaluate), plans (Shadow), gov (GV.cfg), cont (valoarea contului în moneda raportului) } */
  function render(md) {
    const tr = md.tr || [], m = md.moneda, s = stat(tr), K = (titlu, val, sub, cls = '', extra = '') => `<div class="jrr-kpi${cls}"><small>${titlu}</small><b>${val}</b><span>${sub}</span>${extra}</div>`;
    const per = [[30, '30 de zile'], [90, '90 de zile'], [365, '12 luni'], [0, 'Tot']].map(([z, t]) => `<button type="button" data-jrr-per="${z}" class="${md.perioada === z ? 'on' : ''}" aria-pressed="${md.perioada === z}">${t}</button>`).join('');
    const opt = ['<option value="">Toate tickerele</option>'].concat((md.tickere || []).map((t) => `<option value="${esc(t)}"${t === md.ticker ? ' selected' : ''}>${esc(sym(t))}</option>`)).join('');
    const head = `<header class="jrr-head"><div><h2>Raportul de execuție</h2><p>${esc(md.ticker ? sym(md.ticker) + ' · ' : '')}${md.perioada ? (md.perioada === 365 ? 'ultimele 12 luni' : 'ultimele ' + md.perioada + ' de zile') : 'tot istoricul'} · ${tr.length} tranzacții închise. Fiecare vânzare e legată de cumpărările ei (primul intrat, primul ieșit); rezultatul e cel raportat de Trading 212, în ${esc(LEI[m] || m || '—')}.${md.stare ? ' ' + esc(md.stare) : ''}</p></div>` +
      `<div class="jrr-filtre"><div class="jrr-seg" role="group" aria-label="Perioada">${per}</div><select id="jrrTicker" aria-label="Ticker">${opt}</select></div></header>`;
    if (!tr.length) return head + `<p class="jrr-gol">${md.toate?.length ? 'Nicio vânzare în perioada sau la tickerul ales.' : 'Nicio vânzare cu rezultat raportat de broker încă. Raportul apare după primele vânzări importate din Trading 212 (Cont & sincronizare).'}</p>`;
    const kp = `<section class="jrr-kpis" aria-label="Cifrele perioadei">` +
      K('Rezultat net realizat', `<span class="${s.net >= 0 ? 'pos' : 'neg'}">${bani(s.net, m)}</span>`, `${s.n} tranzacții închise · costuri ${bani(-s.fee, m)}`, ' mare') +
      K('Rata de câștig', n1(s.rata) + '%', `${s.w.length} câștigătoare · ${s.l.length} pierzătoare`, '', `<div class="jrr-bara" aria-hidden="true"><i class="gain" style="width:${n1(s.rata).replace(',', '.')}%"></i><i class="loss" style="flex:1"></i></div>`) +
      K('Raport câștig / pierdere', fin(s.raport) ? n1(s.raport) + ' : 1' : '—', `câștig mediu ${bani(s.aw, m, false)} · pierdere medie ${bani(s.al, m, false)}`) +
      K('Factor de profit', n1(s.pf), `câștiguri ${bani(s.brutC, m, false)} ÷ pierderi ${bani(s.brutP, m, false)}`) +
      K('Speranța pe tranzacție', `<span class="${s.sp >= 0 ? 'pos' : 'neg'}">${bani(s.sp, m)}</span>`, 'media rezultatului, cu tot cu pierderi') +
      K('Cea mai mare scădere de la vârf', `<span class="neg">${bani(-s.dd, m)}</span>`, s.ddDe ? zi(s.ddDe) + ' → ' + zi(s.ddLa) : 'fără scădere') +
      K('Cea mai lungă serie', `${s.sW} <em>câștiguri</em> · ${s.sL} <em>pierderi</em>`, 'la rând, după data vânzării') +
      K('Ținute în medie', `${n1(s.zw)} <em>zile</em> / ${n1(s.zl)} <em>zile</em>`, `câștigătoarele / pierzătoarele${s.nZile < s.n ? ' · ' + (s.n - s.nZile) + ' fără cumpărarea în istoric' : ''}`) + '</section>';
    // ce spun cifrele
    const fr = [], peTk = [...new Set(tr.map((x) => x.ticker))].map((t) => ({ t, v: tr.filter((x) => x.ticker === t).reduce((a, x) => a + x.rez, 0) })).sort((a, b) => a.v - b.v);
    if (fin(s.rata) && fin(s.raport)) { const be = 100 / (1 + s.raport); fr.push(`Câștigi în ${n1(s.rata)}% din tranzacții, iar câștigul mediu e ${n1(s.raport)} din pierderea medie. La raportul ăsta, pragul de rentabilitate e o rată de ${n1(be)}%: ești ${s.rata >= be ? 'peste' : 'sub'} el, de aceea rezultatul e ${bani(s.net, m)}.`); }
    if (fin(s.zw) && fin(s.zl) && s.zw > 0 && s.zl > s.zw * 1.3) fr.push(`Ții pierzătoarele de ${n1(s.zl / s.zw)} ori mai mult decât câștigătoarele (${n1(s.zl)} față de ${n1(s.zw)} zile): pierderile sunt lăsate să crească.`);
    if (s.dupa2.length >= 3) fr.push(`După două pierderi la rând, tranzacția următoare a adus în medie ${bani(avg(s.dupa2.map((x) => x.rez)), m)} (${s.dupa2.length} cazuri), față de ${bani(s.sp, m)} în general.`);
    if (peTk.length > 1) fr.push(`${esc(sym(peTk.at(-1).t))} a adus cel mai mult (${bani(peTk.at(-1).v, m)}); ${esc(sym(peTk[0].t))} a costat cel mai mult (${bani(peTk[0].v, m)}).`);
    const cuR = tr.filter((x) => fin(x.R)); if (cuR.length >= 3) fr.push(`Pe cele ${cuR.length} tranzacții cu stop cunoscut, rezultatul mediu e ${rr(avg(cuR.map((x) => x.R)))} pe tranzacție.`);
    const concl = `<section class="jrr-concl" aria-labelledby="jrrCc"><h3 id="jrrCc">Ce spun cifrele</h3><ol>${fr.map((x) => `<li>${x}</li>`).join('')}</ol><p class="jrr-nota">${s.n < 30 ? `Doar ${s.n} tranzacții: cifrele descriu ce s-a întâmplat, nu dovedesc un obicei.` : `${s.n} tranzacții, descriptiv. Un tipar devine credibil când se repetă și în perioada următoare.`}</p></section>`;
    // limita pe lună (idea 5)
    const lim = limitaLuna(md.toate || tr, md.limita, md.now), luna = new Date(Date.parse(lim.luna + '-15T12:00:00Z')).toLocaleDateString('ro-RO', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const limHtml = `<section class="jrr-panel jrr-limita stare-${lim.stare}" aria-labelledby="jrrLim"><header><h3 id="jrrLim">Limita de pierdere pe lună</h3><p>${esc(luna)} · ${lim.n} vânzări · rezultat <b class="${lim.rez >= 0 ? 'pos' : 'neg'}">${bani(lim.rez, m)}</b></p></header>` +
      (lim.limita ? `<div class="jrr-lim-bara" role="img" aria-label="Folosit ${n1(Math.min(lim.folosit, 999))}% din limită"><i style="width:${Math.min(100, lim.folosit).toFixed(1)}%"></i></div><p>${lim.stare === 'depasit' ? '⛔ <b>Limita e depășită.</b> Pauză de la intrări noi până luna viitoare — regula ta, scrisă dinainte.' : lim.stare === 'aproape' ? `⚠ <b>Ai folosit ${n1(lim.folosit)}% din limită.</b> Mai ai ${bani(lim.limita + Math.min(0, lim.rez), m, false)} până la ea.` : `Folosit ${n1(lim.folosit)}% din ${bani(lim.limita, m, false)}.`}</p>` : '<p>Pune-ți o limită: când pierderile lunii o ating, raportul îți spune să iei pauză.</p>') +
      `<label class="jrr-lim-in">Limita lunară (${esc(LEI[m] || m)}) <input id="jrrLimita" type="number" inputmode="decimal" min="0" step="50" value="${lim.limita ?? ''}" placeholder="ex. 1000"></label></section>`;
    // curba, luni, distribuție
    const lun = new Map(); for (const x of tr) { const k = dayRO(x.iesire).slice(0, 7); const o = lun.get(k) || { v: 0, n: 0, w: 0 }; o.v += x.rez; o.n++; o.w += x.rez > 0; lun.set(k, o); }
    const luniIt = [...lun].sort().map(([k, o]) => { const d = new Date(Date.parse(k + '-15T12:00:00Z')); return { k: d.toLocaleDateString('ro-RO', { month: 'short', timeZone: 'UTC' }).replace('.', ''), v: o.v, tip: `${d.toLocaleDateString('ro-RO', { month: 'long', year: 'numeric', timeZone: 'UTC' })}\n${bani(o.v, m)} · ${o.n} tranzacții\ncâștigătoare ${o.w} din ${o.n}` }; });
    const grafice = `<section class="jrr-panel" aria-labelledby="jrrCurba"><header><h3 id="jrrCurba">Rezultatul cumulat și scăderea de la vârf</h3><p>atinge graficul pentru fiecare vânzare</p></header>${svgCurba(s, m)}<div class="jrr-leg"><span><i class="k-acc"></i>rezultat cumulat</span><span><i class="k-dd"></i>scădere de la vârf</span></div></section>` +
      `<div class="jrr-doua"><section class="jrr-panel" aria-labelledby="jrrLuni"><header><h3 id="jrrLuni">Pe luni</h3><p>rezultat net</p></header>${svgBare(luniIt, { eticheta: 'Rezultatul net pe luni' })}</section>` +
      `<section class="jrr-panel" aria-labelledby="jrrDist"><header><h3 id="jrrDist">Distribuția rezultatelor</h3><p>câte tranzacții în fiecare treaptă</p></header>${svgDist(s, tr, m)}<div class="jrr-leg"><span><i class="k-gain"></i>câștig</span><span><i class="k-loss"></i>pierdere</span><span><i class="k-med"></i>medii: ${bani(-s.al, m)} / ${bani(s.aw, m)}</span></div></section></div>`;
    // câștigătoare vs pierzătoare + obiceiuri
    const rv = (nm, a, b) => `<div>${nm}</div><div class="r">${a}</div><div class="r">${b}</div>`, w = s.w, l = s.l, mxw = w.length ? Math.max(...w.map((x) => x.rez)) : null, mnl = l.length ? Math.min(...l.map((x) => x.rez)) : null;
    const k = fin(s.zl) && fin(s.zw) && s.zw > 0 ? s.zl / s.zw : null;
    const vs = `<section class="jrr-panel" aria-labelledby="jrrVs"><header><h3 id="jrrVs">Câștigătoare față de pierzătoare</h3></header><div class="jrr-vs"><div class="h"></div><div class="h r pos">Câștigătoare</div><div class="h r neg">Pierzătoare</div>` +
      rv('Număr', w.length, l.length) + rv('Medie', bani(s.aw, m), bani(fin(s.al) ? -s.al : null, m)) + rv('Mediană', bani(med(w.map((x) => x.rez)), m), bani(med(l.map((x) => x.rez)), m)) + rv('Cea mai mare', bani(mxw, m), bani(mnl, m)) +
      rv('Mișcarea medie', pc(avg(w.filter((x) => fin(x.pct)).map((x) => x.pct))), pc(avg(l.filter((x) => fin(x.pct)).map((x) => x.pct)))) + rv('Ținută în medie', fin(s.zw) ? n1(s.zw) + ' zile' : '—', fin(s.zl) ? n1(s.zl) + ' zile' : '—') +
      rv('Mărimea medie', bani(avg(w.filter((x) => fin(x.cost)).map((x) => x.cost)), m, false), bani(avg(l.filter((x) => fin(x.cost)).map((x) => x.cost)), m, false)) + '</div>' +
      (fin(k) ? `<div class="jrr-semnal">${k > 1.3 ? `<b class="neg">⚠ ${n1(k)}×</b><span>Pierzătoarele stau mai mult în cont decât câștigătoarele. Un stop pus la intrare și respectat le scurtează.</span>` : '<b class="pos">✓</b><span>Pierzătoarele nu sunt ținute mai mult decât câștigătoarele.</span>'}</div>` : '') + '</section>';
    const sfert = Math.max(1, Math.round(tr.filter((x) => fin(x.cost)).length / 4)), cuCost = tr.filter((x) => fin(x.cost)), mari = cuCost.slice().sort((a, b) => b.cost - a.cost).slice(0, sfert), mici = cuCost.slice().sort((a, b) => a.cost - b.cost).slice(0, sfert);
    const rapide = tr.filter((x) => fin(x.zile) && x.zile < 1.5), ob = [];
    const rd = (ic, t) => `<div class="jrr-semnal"><b>${ic}</b><span>${t}</span></div>`;
    if (s.dupa2.length) ob.push(rd('↺', `<b>După 2 pierderi la rând</b>: următoarea a adus în medie ${bani(avg(s.dupa2.map((x) => x.rez)), m)} în ${s.dupa2.length} cazuri (media generală ${bani(s.sp, m)}).`));
    if (cuCost.length >= 4) ob.push(rd('▣', `<b>Pozițiile mari</b> (sfertul cel mai mare): rată ${n1((mari.filter((x) => x.rez > 0).length / mari.length) * 100)}%, total ${bani(mari.reduce((a, x) => a + x.rez, 0), m)}. <b>Cele mici</b>: rată ${n1((mici.filter((x) => x.rez > 0).length / mici.length) * 100)}%, total ${bani(mici.reduce((a, x) => a + x.rez, 0), m)}.`));
    if (rapide.length) ob.push(rd('⏱', `<b>Ieșite în aceeași zi sau a doua zi</b>: ${rapide.length} tranzacții, total ${bani(rapide.reduce((a, x) => a + x.rez, 0), m)}.`));
    ob.push(rd('€', `<b>Costurile</b> raportate (conversia valutară și taxele): ${bani(-s.fee, m)}${s.brutC > 0 ? `, adică ${n1((s.fee / s.brutC) * 100)}% din câștigurile brute` : ''}.`));
    const obic = `<section class="jrr-panel" aria-labelledby="jrrOb"><header><h3 id="jrrOb">Obiceiuri</h3><p>descriptiv, din tranzacțiile tale</p></header><div class="jrr-lista">${ob.join('')}</div></section>`;
    // ziua și ora intrării (idea 6) + mărimea
    const cuIntrare = tr.filter((x) => x.intrare != null), cuIntrareUS = cuIntrare.filter((x) => symYahoo(x.ticker)), Z = ['luni', 'marți', 'miercuri', 'joi', 'vineri'];
    const ziSapt = (t) => new Date(dayRO(t) + 'T12:00:00Z').getUTCDay();
    const zileIt = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi'].map((kk, i) => { const xs = cuIntrare.filter((x) => ziSapt(x.intrare) === i + 1); return { k: kk + ' · ' + xs.length, v: avg(xs.map((x) => x.rez)), tip: `Intrări ${Z[i]}\n${xs.length} tranzacții · medie ${bani(avg(xs.map((x) => x.rez)), m)}\ncâștigătoare ${xs.filter((x) => x.rez > 0).length} din ${xs.length}` }; });
    const oreIt = ORE.map((nm, i) => { const xs = cuIntrareUS.filter((x) => ora(x.intrare) === i); return { k: ['pre', '9:30', '10:30', '12', '14', 'după'][i] + ' · ' + xs.length, v: avg(xs.map((x) => x.rez)), tip: `Intrări ${nm} (ora New York)\n${xs.length} tranzacții · medie ${bani(avg(xs.map((x) => x.rez)), m)}\ncâștigătoare ${xs.filter((x) => x.rez > 0).length} din ${xs.length} · total ${bani(xs.reduce((a, x) => a + x.rez, 0), m)}` }; });
    const timp = `<div class="jrr-doua"><section class="jrr-panel" aria-labelledby="jrrZi"><header><h3 id="jrrZi">Ziua intrării</h3><p>rezultat mediu · câte tranzacții</p></header>${svgBare(zileIt, { H: 210, eticheta: 'Rezultatul mediu după ziua intrării' })}</section>` +
      `<section class="jrr-panel" aria-labelledby="jrrOra"><header><h3 id="jrrOra">Ora intrării</h3><p>acțiunile din SUA · ora New York · rezultat mediu · câte tranzacții</p></header>${svgBare(oreIt, { H: 210, eticheta: 'Rezultatul mediu după ora intrării, ora New York' })}</section></div>` +
      `<section class="jrr-panel" aria-labelledby="jrrMar"><header><h3 id="jrrMar">Mărimea poziției și rezultatul</h3><p>fiecare punct = o tranzacție · mărimea aproximată în ${esc(LEI[m] || m)} la cursul BNR din ziua intrării</p></header>${svgPuncte(tr, m)}</section>`;
    // R (idea 1)
    const rTot = tr.filter((x) => fin(x.R)), rItems = rTot.length ? [['< −1 R', (x) => x.R < -1], ['−1…0', (x) => x.R >= -1 && x.R < 0], ['0…1', (x) => x.R >= 0 && x.R < 1], ['1…2', (x) => x.R >= 1 && x.R < 2], ['2…3', (x) => x.R >= 2 && x.R < 3], ['≥ 3 R', (x) => x.R >= 3]].map(([kk, f]) => { const xs = rTot.filter(f); return { k: kk, v: xs.length * (kk.startsWith('<') || kk.startsWith('−') ? -1 : 1), tip: `${kk}: ${xs.length} tranzacții\n${xs.map((x) => x.sym + ' ' + rr(x.R)).slice(0, 6).join(', ')}` }; }) : [];
    const rHtml = `<section class="jrr-panel" aria-labelledby="jrrR"><header><h3 id="jrrR">Rezultatul în R</h3><p>câștigul sau pierderea măsurate în riscul de la intrare (intrare − stop)</p></header>` +
      (rTot.length ? `<div class="jrr-r-cifre"><div><small>R mediu pe tranzacție</small><b class="${avg(rTot.map((x) => x.R)) >= 0 ? 'pos' : 'neg'}">${rr(avg(rTot.map((x) => x.R)))}</b></div><div><small>Tranzacții cu stop cunoscut</small><b>${rTot.length} din ${tr.length}</b></div><div><small>Pierderi mai mari de 1 R</small><b class="${rTot.some((x) => x.R < -1) ? 'neg' : ''}">${rTot.filter((x) => x.R < -1).length}</b></div><div><small>Câștiguri de peste 2 R</small><b>${rTot.filter((x) => x.R >= 2).length}</b></div></div>${svgBare(rItems, { H: 190, fmt: (v) => String(Math.abs(v)), eticheta: 'Câte tranzacții în fiecare treaptă de R' })}<p class="jrr-nota">Bare în jos = pierderi (în R), în sus = câștiguri; înălțimea = câte tranzacții. Stopul vine din analiza salvată înaintea intrării (${tr.filter((x) => x.stopSursa === 'analiza').length}), din stopul pus în primele 24 de ore după intrare (${tr.filter((x) => x.stopSursa === 'la-intrare').length}) sau, pentru poziția deschisă acum, din stopul din Portofoliu (${tr.filter((x) => x.stopSursa === 'portofoliu').length}). „Pierderi mai mari de 1 R” = stopul n-a fost respectat sau a sărit prețul.</p>`
        : `<p class="jrr-gol">Nicio tranzacție cu stop cunoscut în perioadă. R apare pentru tranzacțiile intrate după o analiză salvată (Desk) sau cu stopul pus în Portofoliu.</p>`) + '</section>';
    // excursia (ideile 2 și 3)
    const ex = md.ex || new Map(), cuEx = tr.map((x) => ({ x, e: ex.get(x.id) })).filter((o) => o.e && !o.e.nepotrivit), nUS = tr.filter((x) => symYahoo(x.ticker) && x.intrare != null).length;
    const exW = cuEx.filter((o) => o.x.rez > 0), exL = cuEx.filter((o) => o.x.rez <= 0), mEx = (xs, f) => avg(xs.map(f).filter(fin));
    const exHtml = `<section class="jrr-panel" aria-labelledby="jrrEx"><header><h3 id="jrrEx">Cât a mers prețul împotriva ta și în favoarea ta</h3><p>din barele zilnice, între intrare și ieșire, față de prețul tău de intrare</p></header>` +
      (cuEx.length ? `<div class="jrr-vs"><div class="h"></div><div class="h r pos">Câștigătoare</div><div class="h r neg">Pierzătoare</div>` +
        rv('Cel mai jos în timpul tranzacției', pc(mEx(exW, (o) => o.e.mae)), pc(mEx(exL, (o) => o.e.mae))) + rv('Cel mai sus în timpul tranzacției', pc(mEx(exW, (o) => o.e.mfe)), pc(mEx(exL, (o) => o.e.mfe))) +
        rv('Cât din cel mai sus ai prins', fin(mEx(exW, (o) => o.e.mfe)) && mEx(exW, (o) => o.e.mfe) > 0 ? n1((mEx(exW, (o) => o.x.pct) / mEx(exW, (o) => o.e.mfe)) * 100) + '%' : '—', '—') +
        rv('Prețul la 5 sesiuni după ieșire', pc(mEx(exW, (o) => o.e.dupa5)), pc(mEx(exL, (o) => o.e.dupa5))) + '</div>' +
        `<div class="jrr-lista">${[(() => { const c = exL.filter((o) => o.e.mfe > 3); return c.length ? `<div class="jrr-semnal"><b>↗</b><span><b>${c.length} din ${exL.length} pierzătoare au fost pe plus cu peste 3%</b> înainte să le închizi pe minus. O regulă de mutare a stopului pe prag la +3% le-ar fi oprit pe zero.</span></div>` : ''; })(),
          (() => { const d = mEx(exW, (o) => o.e.dupa5); return fin(d) ? `<div class="jrr-semnal"><b>${d > 0 ? '💸' : '✓'}</b><span>${d > 0 ? `După ce ai vândut câștigătoarele, prețul a mai urcat în medie <b class="pos">${pc(d)}</b> în 5 sesiuni (bani lăsați pe masă).` : `După ce ai vândut câștigătoarele, prețul a scăzut în medie <b>${pc(d)}</b> în 5 sesiuni: ieșirile au fost la timp.`}</span></div>` : ''; })(),
          (() => { const d = mEx(exL, (o) => o.e.dupa5); return fin(d) ? `<div class="jrr-semnal"><b>${d < 0 ? '🛡' : '↺'}</b><span>${d < 0 ? `După pierzătoare, prețul a mai scăzut <b class="neg">${pc(d)}</b> în 5 sesiuni: ieșirea te-a protejat.` : `După pierzătoare, prețul și-a revenit <b>${pc(d)}</b> în 5 sesiuni: stopurile pot fi prea strânse.`}</span></div>` : ''; })()].join('')}</div>` +
        `<p class="jrr-nota">${cuEx.length} din ${tr.length} tranzacții cu barele citite (doar acțiunile din SUA${nUS > cuEx.length ? '; restul se încarcă sau nu au bare potrivite' : ''}). Zilele dintre intrare și ieșire contează întregi; în ziua intrării și a ieșirii contează prețul tău.</p>`
        : `<p class="jrr-gol">${md.exStare || (nUS ? 'Se citesc barele zilnice pentru tranzacțiile din SUA…' : 'Doar acțiunile din SUA au bare zilnice potrivite; în perioadă nu e niciuna.')}</p>`) + '</section>';
    // pe tipul analizei (idea 4)
    const tipuri = new Map(); for (const x of tr) { const kk = x.tip || 'fără analiză salvată'; const o = tipuri.get(kk) || { n: 0, w: 0, v: 0, R: [] }; o.n++; o.w += x.rez > 0; o.v += x.rez; if (fin(x.R)) o.R.push(x.R); tipuri.set(kk, o); }
    const tipHtml = `<section class="jrr-panel" aria-labelledby="jrrTip"><header><h3 id="jrrTip">Rezultatul pe tipul intrării</h3><p>tranzacțiile intrate după o analiză salvată (Desk → „Analize înaintea intrării”), pe verdictul analizei</p></header><div class="jrr-scroll"><table class="jrr-tab"><thead><tr><th>Tipul intrării</th><th>Tranzacții</th><th>Rata de câștig</th><th>Total</th><th>Medie</th><th>R mediu</th></tr></thead><tbody>` +
      [...tipuri].sort((a, b) => b[1].v - a[1].v).map(([kk, o]) => `<tr><td>${esc(kk)}</td><td>${o.n}</td><td>${n1((o.w / o.n) * 100)}%</td><td class="${o.v >= 0 ? 'pos' : 'neg'}">${bani(o.v, m)}</td><td>${bani(o.v / o.n, m)}</td><td>${rr(avg(o.R))}</td></tr>`).join('') + `</tbody></table></div>${tipuri.size === 1 && tipuri.has('fără analiză salvată') ? '<p class="jrr-nota">Nicio tranzacție nu a pornit încă dintr-o analiză salvată. Salvează analiza în Desk înainte de cumpărare (maximum 30 de minute înainte) și aici apare pe ce tip de semnal câștigi.</p>' : ''}</section>`;
    // calendar, tickere, listă
    const cal = `<section class="jrr-panel" aria-labelledby="jrrCal"><header><h3 id="jrrCal">Calendarul zilelor de vânzare</h3><p>verde = zi cu câștig, portocaliu cu liniuță = zi cu pierdere; mai intens = mai mare</p></header>${calendar(tr, m, md.now)}</section>`;
    const pt = new Map(); for (const x of tr) { const o = pt.get(x.ticker) || { t: x.ticker, n: 0, w: 0, v: 0, b: -Infinity, s: Infinity, z: [] }; o.n++; o.w += x.rez > 0; o.v += x.rez; o.b = Math.max(o.b, x.rez); o.s = Math.min(o.s, x.rez); if (fin(x.zile)) o.z.push(x.zile); pt.set(x.ticker, o); }
    const ptr = [...pt.values()].sort((a, b) => b.v - a.v), mx = Math.max(1e-9, ...ptr.map((r) => Math.abs(r.v)));
    const tks = `<section class="jrr-panel" aria-labelledby="jrrTk"><header><h3 id="jrrTk">Pe ticker</h3><p>apasă pe un ticker ca să filtrezi tot raportul</p></header><div class="jrr-scroll"><table class="jrr-tab"><thead><tr><th>Ticker</th><th>Tranzacții</th><th>Rata de câștig</th><th>Total</th><th></th><th>Medie</th><th>Cea mai bună</th><th>Cea mai slabă</th><th>Ținută în medie</th></tr></thead><tbody>` +
      ptr.map((r) => `<tr><td><button type="button" class="jrr-tk" data-jrr-tk="${esc(r.t)}">${esc(sym(r.t))}</button></td><td>${r.n}</td><td>${n1((r.w / r.n) * 100)}%</td><td class="${r.v >= 0 ? 'pos' : 'neg'}">${bani(r.v, m)}</td><td class="l"><i class="jrr-mini ${r.v >= 0 ? 'gain' : 'loss'}" style="width:${Math.round((Math.abs(r.v) / mx) * 110)}px"></i></td><td>${bani(r.v / r.n, m)}</td><td class="pos">${bani(r.b, m)}</td><td class="neg">${bani(r.s, m)}</td><td>${r.z.length ? n1(avg(r.z)) + ' zile' : '—'}</td></tr>`).join('') + '</tbody></table></div></section>';
    const toateR = md.toateRandurile ? tr.slice().reverse() : tr.slice().reverse().slice(0, 15);
    // I-693: cât de sigur e rezultatul
    const inc = incredere(tr);
    const incHtml = `<section class="jrr-panel" aria-labelledby="jrrInc"><header><h3 id="jrrInc">Cât de sigur e rezultatul tău</h3><p>din tranzacțiile perioadei, trase la întâmplare de 2.000 de ori</p></header>` +
      (inc ? `<div class="jrr-r-cifre"><div><small>Speranța pe tranzacție</small><b class="${inc.medie >= 0 ? 'pos' : 'neg'}">${bani(inc.medie, m)}</b><span class="jrr-sub">între ${bani(inc.lo, m)} și ${bani(inc.hi, m)} (90%)</span></div><div><small>Următoarele ${inc.viitoare}: scăderea tipică</small><b class="neg">${bani(-inc.ddMed, m)}</b><span class="jrr-sub">într-o serie proastă (5%): ${bani(-inc.dd95, m)}</span></div><div><small>Șansa ca următoarele ${inc.viitoare} să iasă pe minus</small><b>${n1(inc.pNeg)}%</b></div><div><small>Câte tranzacții mai trebuie</small><b>${inc.maiTrebuie == null ? '—' : inc.maiTrebuie === 0 ? 'deja destule' : inc.maiTrebuie}</b><span class="jrr-sub">${inc.trebuie == null ? 'speranța nu e pe plus' : 'ca intervalul să nu mai cuprindă zero, la aceeași medie'}</span></div></div>` +
        `<p class="jrr-semnal-txt">${inc.lo > 0 ? '✓ Intervalul e tot pe plus: rezultatul nu pare doar noroc (pe tranzacțiile de până acum).' : inc.hi < 0 ? '⛔ Intervalul e tot pe minus: pierderea nu e doar ghinion.' : '≈ Intervalul cuprinde zero: din cifrele de până acum nu se poate spune dacă ai un avantaj sau doar noroc.'}</p>` + coziHtml(inc, md, m) +
        `<p class="jrr-nota">Cifrele de sus tratează tranzacțiile ca independente; cozile de jos păstrează seriile (blocuri de ${inc.bloc}). Sub 30 de tranzacții cozile sunt zgomot. Descrie trecutul; un avantaj se confirmă pe tranzacțiile de după.</p>`
        : `<p class="jrr-gol">Cel puțin 10 tranzacții în perioadă pentru interval și Monte Carlo (acum ${tr.length}).</p>`) + '</section>';
    // I-690: etichetele și ce te-au costat
    const pe = peEticheta(tr);
    const etHtml = `<section class="jrr-panel" aria-labelledby="jrrEt"><header><h3 id="jrrEt">Ce te-a costat fiecare greșeală</h3><p>din etichetele puse pe tranzacții (în lista de jos, butonul 🏷)</p></header>` +
      (pe.randuri.length ? `<div class="jrr-scroll"><table class="jrr-tab"><thead><tr><th>Eticheta</th><th>Tranzacții</th><th>Câștigătoare</th><th>Total</th><th>Medie</th><th>R mediu</th></tr></thead><tbody>` +
        pe.randuri.map((o) => `<tr><td>${esc(ET[o.k])}</td><td>${o.n}</td><td>${o.w} din ${o.n}</td><td class="${o.v >= 0 ? 'pos' : 'neg'}">${bani(o.v, m)}</td><td>${bani(o.v / o.n, m)}</td><td>${rr(avg(o.R))}</td></tr>`).join('') + `</tbody></table></div>` : '<p class="jrr-gol">Nicio tranzacție etichetată încă. Apasă 🏷 pe o tranzacție din listă și alege ce s-a întâmplat (FOMO, ieșire prea devreme, am respectat planul…).</p>') +
      `<p class="jrr-nota">${pe.fara} din ${tr.length} tranzacții fără etichetă. Etichetele se pun după rezultat, deci sunt subiective; se sincronizează cu celelalte dispozitive odată cu setările jurnalului.</p></section>`;
    // I-726: disciplina din execuțiile reale
    const dsc = disciplina(md.rows || [], { jurnal: md.jurnal, analize: md.analize, plans: md.plans, now: md.now }), dscR = disciplinaRezultat(md.toate || tr, dsc), NUME_INC = { halted: 'Governor nu permitea', limita: 'limita lunară depășită', 'fara-plan': 'fără plan scris', 'peste-plan': 'peste mărimea planului' };
    const dscHtml = `<section class="jrr-panel" aria-labelledby="jrrDsc"><header><h3 id="jrrDsc">Disciplina: regulile față de intrările reale</h3><p>fiecare cumpărare Trading 212 față de verdictul Governor de atunci, limita lunară, planul scris în 30 de minute înainte și mărimea planului</p></header>` +
      (dsc.deLa == null ? '<p class="jrr-gol">Registrul verdictelor începe la activarea acestei versiuni (20.10.2026): intrările de dinainte n-au verdict notat. De aici încolo fiecare cumpărare se verifică singură.</p>'
        : dsc.n ? `<div class="jrr-r-cifre"><div><small>Intrări cu plan scris</small><b class="${dsc.cuPlan === dsc.n ? 'pos' : ''}">${n1((dsc.cuPlan / dsc.n) * 100)}%</b><span class="jrr-sub">${dsc.cuPlan} din ${dsc.n} cumpărări de la ${zi(dsc.deLa)}</span></div><div><small>Încălcări</small><b class="${dsc.incalcari.total ? 'neg' : 'pos'}">${dsc.incalcari.total}</b><span class="jrr-sub">Governor ${dsc.incalcari.halted} · limita lunară ${dsc.incalcari.limita} · fără plan ${dsc.incalcari.faraPlan} · peste plan ${dsc.incalcari.pestePlan}</span></div><div><small>Rezultatul intrărilor cu încălcări</small><b class="${fin(dscR.cuIncalcari.medie) && dscR.cuIncalcari.medie < 0 ? 'neg' : ''}">${dscR.cuIncalcari.n ? bani(dscR.cuIncalcari.medie, m) : '—'}</b><span class="jrr-sub">${dscR.cuIncalcari.n} închise · față de ${dscR.fara.n ? bani(dscR.fara.medie, m) : '—'} la cele curate (${dscR.fara.n})</span></div></div>` +
          (dsc.incalcari.total ? `<div class="jrr-scroll"><table class="jrr-tab"><thead><tr><th>Data</th><th>Ticker</th><th>Verdictul de atunci</th><th>Plan</th><th>Încălcări</th></tr></thead><tbody>${dsc.randuri.filter((r) => r.incalcari.length).slice(-15).reverse().map((r) => `<tr><td>${zi(r.t)}</td><td><b>${esc(r.sym)}</b></td><td>${esc(r.verdict || 'nenotat')}${r.luna === 'depasit' ? ' · limită depășită' : ''}</td><td>${r.plan ? (r.plan.sursa === 'analiza' ? 'analiză salvată' : 'plan Shadow') : '—'}</td><td class="neg">${r.incalcari.map((k) => NUME_INC[k]).join(', ')}</td></tr>`).join('')}</tbody></table></div>` : '<p class="jrr-semnal-txt">✓ Nicio încălcare notată: toate intrările au avut verdict permisiv și plan scris.</p>') +
          `<p class="jrr-nota">Verdictul e cel notat pe acest aparat în momentul cumpărării (jurnalul append-only al Governor). ${dsc.faraVerdict ? dsc.faraVerdict + ' intrări fără verdict notat (alt aparat sau jurnal pornit după). ' : ''}Planul = analiza salvată în Desk sau planul Shadow pe același simbol în 30 de minute înainte. Etichetele manuale rămân pentru nuanțe.</p>`
        : `<p class="jrr-gol">Nicio cumpărare de la ${zi(dsc.deLa)} încoace.</p>`) + '</section>';
    // I-729: alunecarea la intrare
    const al = alunecare(md.rows || [], { analize: md.analize, plans: md.plans, now: md.now }), pragTxt = String(al.prag).replace('.', ',');
    const alHtml = `<section class="jrr-panel" aria-labelledby="jrrAl"><header><h3 id="jrrAl">Alunecarea la intrare</h3><p>prețul executat față de intrarea din planul scris (analiza salvată sau planul Shadow), în puncte de bază și în R</p></header>` +
      (al.n ? `<div class="jrr-r-cifre"><div><small>Alunecarea medie</small><b class="${al.bps > 0 ? 'neg' : 'pos'}">${al.bps > 0 ? '+' : ''}${n1(al.bps)} bps</b><span class="jrr-sub">mediana ${al.bpsMed > 0 ? '+' : ''}${n1(al.bpsMed)} bps · ${al.n} intrări cu plan${al.faraPlan ? ' · ' + al.faraPlan + ' fără plan (nemăsurate)' : ''}</span></div><div><small>În R (față de intrare − stop)</small><b class="${al.R > 0 ? 'neg' : 'pos'}">${rr(al.R)}</b><span class="jrr-sub">mediana ${rr(al.RMed)}</span></div><div><small>Ultimele ${al.ultimele10.n} intrări</small><b class="${al.ultimele10.alerta ? 'neg' : ''}">${rr(al.ultimele10.R)}</b><span class="jrr-sub">pragul scris înainte: ${pragTxt} R</span></div></div>` +
          `<p class="jrr-semnal-txt">${al.ultimele10.alerta ? `⚠ Media ultimelor ${al.ultimele10.n} intrări depășește ${pragTxt} R: pierzi din R la intrare — regula poate fi bună și execuția proastă (urmărești prețul, cumperi peste limită).` : al.ultimele10.n >= 5 ? '✓ Alunecarea la intrare e sub prag: execuția nu mănâncă planul.' : 'Prea puține intrări cu plan ca să se judece (minimum 5).'}</p>` +
          (al.peTicker.length > 1 || al.peOra.length > 1 ? `<div class="jrr-scroll"><table class="jrr-tab"><thead><tr><th>Pe ticker</th><th>Intrări</th><th>bps</th><th>R</th></tr></thead><tbody>${al.peTicker.slice(0, 8).map((o) => `<tr><td>${esc(sym(o.k))}</td><td>${o.n}</td><td>${n1(o.bps)}</td><td>${rr(o.R)}</td></tr>`).join('')}</tbody></table><table class="jrr-tab"><thead><tr><th>Pe ora intrării (NY)</th><th>Intrări</th><th>bps</th><th>R</th></tr></thead><tbody>${al.peOra.map((o) => `<tr><td>${esc(ORE[o.k] || String(o.k))}</td><td>${o.n}</td><td>${n1(o.bps)}</td><td>${rr(o.R)}</td></tr>`).join('')}</tbody></table></div>` : '')
        : '<p class="jrr-gol">Nicio cumpărare legată de un plan scris încă (analiză salvată în Desk sau plan Shadow în 30 de minute înainte). Intrările libere rămân fără alunecare măsurată.</p>') + '</section>';
    // I-691: planul față de execuție
    const pv = planVsExecutie(tr), pvN = pv.tinta.length + pv.manual.length + pv.stop.length + pv.subStop.length, gr = (nm, xs, cls) => `<tr><td>${nm}</td><td>${xs.length}</td><td class="${xs.reduce((a, x) => a + x.rez, 0) >= 0 ? 'pos' : 'neg'}">${xs.length ? bani(xs.reduce((a, x) => a + x.rez, 0), m) : '—'}</td><td>${xs.length ? n1(avg(xs.map((x) => x.drum * 100))) + '%' : '—'}</td></tr>`;
    const planHtml = `<section class="jrr-panel" aria-labelledby="jrrPlan"><header><h3 id="jrrPlan">Planul față de execuție</h3><p>tranzacțiile cu stop și țintă puse la intrare (analiza salvată sau fereastra de stop)</p></header>` +
      (pvN ? `<div class="jrr-scroll"><table class="jrr-tab"><thead><tr><th>Ieșirea</th><th>Tranzacții</th><th>Total</th><th>Din drumul până la țintă</th></tr></thead><tbody>${gr('la țintă sau peste', pv.tinta)}${gr('între stop și țintă (manual)', pv.manual)}${gr('la stop', pv.stop)}${gr('sub stop (stop nerespectat / salt)', pv.subStop)}</tbody></table></div>` +
        `<p class="jrr-semnal-txt">${pv.subStop.length ? `⛔ <b>${pv.subStop.length} din ${pvN}</b> au ieșit sub stop: stopul nu a fost respectat sau prețul a sărit peste el.` : pv.manual.length > pv.tinta.length ? `⚠ Mai multe ieșiri manuale (${pv.manual.length}) decât la țintă (${pv.tinta.length}): analiza pare bună, ieșirea vine prea devreme.` : '✓ Ieșirile urmează planul.'}</p>`
        : `<p class="jrr-gol">Nicio tranzacție cu analiză salvată (stop + țintă) în perioadă. Salvează analiza în Desk înainte de cumpărare și aici apare dacă ai ieșit unde ai plănuit.</p>`) + '</section>';
    // I-694: tu față de S&P în aceleași zile
    const spyM = new Map(); for (const x of tr) { const f = fataDeSpy(x, md.spy); if (f) spyM.set(x.id, f); }
    const spyL = [...spyM.values()], batut = spyL.filter((f) => f.peste > 0).length, leiPeste = spyL.filter((f) => fin(f.lei)), totPeste = leiPeste.reduce((a, f) => a + f.lei, 0);
    const spyHtml = `<section class="jrr-panel" aria-labelledby="jrrSpy"><header><h3 id="jrrSpy">Tu față de S&amp;P în aceleași zile</h3><p>ce ar fi făcut SPY între intrarea și ieșirea fiecărei tranzacții</p></header>` +
      (spyL.length ? `<div class="jrr-r-cifre"><div><small>Ai bătut piața</small><b>${batut} din ${spyL.length}</b></div><div><small>Mișcarea ta față de S&amp;P, în medie</small><b class="${avg(spyL.map((f) => f.peste)) >= 0 ? 'pos' : 'neg'}">${pc(avg(spyL.map((f) => f.peste)))}</b></div><div><small>Plusul tău peste piață</small><b class="${totPeste >= 0 ? 'pos' : 'neg'}">${leiPeste.length ? bani(totPeste, m) : '—'}</b><span class="jrr-sub">${leiPeste.length} tranzacții cu mărimea cunoscută</span></div></div>` +
        `<p class="jrr-nota">Doar acțiunile din SUA. SPY de la ultima închidere dinaintea intrării la ultima închidere dinaintea ieșirii; beta acțiunii și cursul valutar nu sunt ajustate.</p>`
        : `<p class="jrr-gol">${md.spy ? 'Nicio tranzacție din SUA cu intrarea cunoscută în perioadă.' : md.spyEsuat ? 'Seria S&amp;P nu a putut fi citită acum (rețea / Yahoo). Reîncarcă mai târziu.' : 'Se citește seria S&amp;P…'}</p>`) + '</section>';
    // I-695: ce-ar fi fost dacă
    const reg = [['stop1R', 'Stop la −1 R (stopul pus la intrare)'], ['prag3', 'Stopul mutat pe prag după +3%'], ['zile5', 'Ieșire după cel mult 5 sesiuni']].map(([k, nm]) => { const xs = cuEx.filter((o) => o.e.daca && fin(o.e.daca[k]) && fin(o.x.cost) && fin(o.x.pct)); const real = xs.reduce((a, o) => a + o.x.rez, 0), alt = xs.reduce((a, o) => a + o.x.rez + (o.x.cost * (o.e.daca[k] - o.x.pct)) / 100, 0); return { nm, n: xs.length, real, alt }; });
    const dacaHtml = `<section class="jrr-panel" aria-labelledby="jrrDaca"><header><h3 id="jrrDaca">Ce-ar fi fost dacă</h3><p>3 reguli refăcute pe barele zilnice ale tranzacțiilor din SUA</p></header>` +
      (reg.some((r) => r.n) ? `<div class="jrr-scroll"><table class="jrr-tab"><thead><tr><th>Regula</th><th>Tranzacții</th><th>Rezultatul real</th><th>Cu regula</th><th>Diferența</th></tr></thead><tbody>` +
        reg.map((r) => `<tr><td>${r.nm}</td><td>${r.n}</td><td>${r.n ? bani(r.real, m) : '—'}</td><td>${r.n ? bani(r.alt, m) : '—'}</td><td class="${r.alt - r.real >= 0 ? 'pos' : 'neg'}">${r.n ? bani(r.alt - r.real, m) : '—'}</td></tr>`).join('') + '</tbody></table></div>'
        : `<p class="jrr-gol">${cuEx.length ? 'Lipsește mărimea pozițiilor (cursul BNR) pentru calcul.' : 'Apare după ce se citesc barele zilnice (secțiunea de mai sus).'}</p>`) +
      `<p class="jrr-nota">Ipoteză, nu dovadă: regulile sunt alese după ce s-au văzut tranzacțiile, deci se judecă doar pe tranzacțiile de după (3 reguli = 3 încercări). Barele zilnice nu arată ordinea din zi: ziua intrării nu se folosește, iar în ziua ieșirii se ia varianta mai proastă.</p></section>`;
    const lst = `<section class="jrr-panel" aria-labelledby="jrrLst"><header><h3 id="jrrLst">Tranzacțiile închise</h3><div class="jrr-btns"><button type="button" class="btn ghost" id="jrrCsv">Descarcă CSV (${tr.length})</button>${tr.length > 15 ? `<button type="button" class="btn ghost" id="jrrToate">${md.toateRandurile ? 'Arată doar ultimele 15' : 'Arată toate ' + tr.length}</button>` : ''}</div></header><div class="jrr-scroll"><table class="jrr-tab"><thead><tr><th>Ticker</th><th>Intrare</th><th>Ieșire</th><th>Zile</th><th>Poziție</th><th>Mișcare</th><th>R</th><th>Față de S&amp;P</th><th>Costuri</th><th>Rezultat</th><th>Etichete</th></tr></thead><tbody>` +
      toateR.map((x) => `<tr><td><b>${esc(x.sym)}</b></td><td>${x.intrare ? zi(x.intrare) : '—'}</td><td>${zi(x.iesire)}</td><td>${fin(x.zile) ? Math.round(x.zile) : '—'}</td><td>${fin(x.cost) ? '~' + bani(x.cost, m, false) : '—'}</td><td class="${x.pct >= 0 ? 'pos' : 'neg'}">${pc(x.pct)}</td><td>${rr(x.R)}</td><td>${spyM.has(x.id) ? pc(spyM.get(x.id).peste) : '—'}</td><td>${bani(-x.fees, m)}</td><td class="${x.rez >= 0 ? 'pos' : 'neg'}"><b>${bani(x.rez, m)}</b></td>` +
        `<td class="l">${(x.etichete || []).map((k) => `<span class="jrr-chip">${esc(ET[k])}</span>`).join('')}<button type="button" class="jrr-et-btn" data-jrr-et-ed="${esc(x.id)}" aria-expanded="${md.editez === x.id}" aria-label="Etichete pentru ${esc(x.sym)} din ${zi(x.iesire)}">🏷</button></td></tr>` +
        (md.editez === x.id ? `<tr class="jrr-et-rand"><td colspan="11"><div class="jrr-et" role="group" aria-label="Etichete">${ETICHETE.map(([k, t]) => `<button type="button" data-jrr-et="${k}" data-jrr-id="${esc(x.id)}" aria-pressed="${(x.etichete || []).includes(k)}">${esc(t)}</button>`).join('')}<button type="button" class="jrr-et-gata" data-jrr-et-ed="">Gata</button></div></td></tr>` : '')).join('') + '</tbody></table></div>' +
      `<p class="jrr-nota">${md.faraCumparare ? md.faraCumparare + ' vânzări fără cumpărarea în istoricul importat: intră în rezultat, fără zile și mișcare. ' : ''}${md.partiale ? md.partiale + ' vânzări acoperite doar parțial de cumpărările din istoric: fără mărimea poziției. ' : ''}${md.corporative ? md.corporative + ' tranzacții cu un split sau alt eveniment corporativ între intrare și ieșire: fără intrare, mișcare și R. ' : ''}${md.alteMonede ? md.alteMonede + ' vânzări în altă monedă decât ' + esc(m) + ' nu intră în raport. ' : ''}Mărimea poziției e aproximată la cursul BNR din ziua intrării; rezultatul e exact cel raportat de broker.</p></section>`;
    return head + kp + concl + incHtml + limHtml + grafice + `<div class="jrr-doua">${vs}${obic}</div>` + etHtml + dscHtml + rHtml + planHtml + alHtml + exHtml + dacaHtml + spyHtml + timp + tipHtml + cal + tks + lst;
  }
  function csv(tr, m) {
    const q = (v) => '"' + String(v).replace(/"/g, '""') + '"', f = (v, d = 2) => (fin(v) ? v.toFixed(d).replace('.', ',') : '');
    return ['Ticker;Intrare;Ieșire;Zile;Cantitate;Preț intrare;Preț ieșire;Moneda prețului;Mișcare %;R;Poziție (~' + m + ');Costuri ' + m + ';Rezultat ' + m + ';Etichete']
      .concat(tr.map((x) => [q(x.ticker), x.intrare ? dayRO(x.intrare) : '', dayRO(x.iesire), f(x.zile, 1), f(x.qty, 6), f(x.entry, 4), f(x.exit, 4), x.pc || '', f(x.pct, 2), f(x.R, 2), f(x.cost, 2), f(x.fees, 2), f(x.rez, 2), q((x.etichete || []).map((k) => ET[k] || k).join(', '))].join(';'))).join('\r\n');
  }
  g.JournalReport = { calatorii, stat, rDin, stopuriR, excursie, ora, ORE, limitaLuna, render, csv, cursLa, symYahoo, sym, ETICHETE, cuEtichete, peEticheta, planVsExecutie, fataDeSpy, incredere, dacaReguli, planPentru, disciplina, disciplinaRezultat, alunecare, PRAG_ALUNECARE_R, coziHtml };
})(typeof window !== 'undefined' ? window : globalThis);
