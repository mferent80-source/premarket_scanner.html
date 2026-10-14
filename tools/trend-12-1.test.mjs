// Robotul „Trend 12 luni” (14.10.2026): funcțiile pure din tools/trend-12-1-lib.mjs.
// Semnalul probat pe 14.10: top 20 % după randamentul pe lunile 2–12 (ultima lună sărită), față de ALTE acțiuni în aceeași zi.
import test from 'node:test';
import assert from 'node:assert/strict';
import { curataUnivers, clasament, regim, liniaIstoric, adaugaIstoric } from './trend-12-1-lib.mjs';

// o serie de bare zilnice doar în zile lucrătoare, preț cu creștere constantă pe zi
function serie(n, pantaZi, { vol = 1e6, pret0 = 100, taie = 0 } = {}) {
  const out = []; let t = Date.UTC(2025, 0, 1), c = pret0;
  while (out.length < n) { t += 86400000; const zi = new Date(t).getUTCDay(); if (zi === 0 || zi === 6) continue; c = c * (1 + pantaZi); out.push({ t, o: c, h: c * 1.01, l: c * 0.99, c, v: vol }); }
  return taie ? out.slice(0, out.length - taie) : out;
}

test('curataUnivers: SUA, fara preferentiale/warrants/^, cap >= minim, BRK/B -> BRK-B, sortat dupa cap, cel mult n', () => {
  const rows = [
    { symbol: 'AAA', name: 'Aaa Inc. Common Stock', marketCap: '5000000000', country: 'United States', sector: 'Tech' },
    { symbol: 'BBB^P', name: 'Bbb Preferred', marketCap: '9000000000', country: 'United States', sector: 'Fin' },
    { symbol: 'CCC', name: 'Ccc Warrants', marketCap: '9000000000', country: 'United States', sector: 'Fin' },
    { symbol: 'DDD', name: 'Ddd plc', marketCap: '9000000000', country: 'Ireland', sector: 'Health' },
    { symbol: 'EEE', name: 'Eee Common Stock', marketCap: '1000000000', country: 'United States', sector: 'Tech' },
    { symbol: 'BRK/B', name: 'Berkshire Hathaway Class B', marketCap: '900000000000', country: 'United States', sector: 'Fin' },
    { symbol: 'FFF', name: 'Fff Common Stock', marketCap: '7000000000', country: 'United States', sector: 'Energy' },
  ];
  const u = curataUnivers(rows, { minCap: 2e9, n: 2 });
  assert.deepEqual(u.map((x) => x.s), ['BRK-B', 'FFF']);
  assert.equal(curataUnivers(rows, { minCap: 2e9, n: 10 }).length, 3);
  assert.equal(curataUnivers(rows, { minCap: 2e9, n: 10 })[2].sector, 'Tech');
});

test('clasament: ordonat dupa mom 12-1 (ultima luna sarita), rang = pozitia / numar, exclude pret < 5, bani putini, serii scurte si serii vechi', () => {
  const spy = serie(300, 0.0005);
  const serii = {
    TARE: serie(300, 0.004), MEDIU: serie(300, 0.001), SLAB: serie(300, -0.001),
    IEFTIN: serie(300, 0.004, { pret0: 1 }), SUBTIRE: serie(300, 0.004, { vol: 10 }), SCURT: serie(200, 0.004), VECHI: serie(300, 0.004, { taie: 3 }),
  };
  const r = clasament(serii, spy, { top: 10, minPret: 5, minDolari: 1e7 });
  assert.equal(r.dataUltimei, new Date(spy[spy.length - 1].t).toISOString().slice(0, 10));
  assert.deepEqual(r.clasament.map((x) => x.s), ['TARE', 'MEDIU']);           // SLAB are mom < 0 ⇒ nu e „top”
  assert.equal(r.n, 3);                                                       // TARE, MEDIU, SLAB au intrat în clasare
  assert.deepEqual(r.excluse, { pret: 1, bani: 1, scurt: 1, vechi: 1 });
  const b = serii.TARE, n = b.length, asteptat = b[n - 22].c / b[n - 253].c - 1;
  assert.ok(Math.abs(r.clasament[0].m12 - asteptat) < 1e-12, 'm12 = C[t-21] / C[t-252] - 1');
  assert.ok(Math.abs(r.clasament[0].m6 - (b[n - 22].c / b[n - 127].c - 1)) < 1e-12, 'm6 = C[t-21] / C[t-126] - 1');
  assert.equal(r.clasament[0].rang, 0); assert.ok(Math.abs(r.clasament[1].rang - 1 / 3) < 1e-12);
  assert.equal(r.clasament[0].pret, b[n - 1].c);
});

test('clasament: „top” taie la numarul cerut si doar cu mom > 0', () => {
  const spy = serie(300, 0.0005), serii = {};
  for (let i = 0; i < 8; i++) serii['S' + i] = serie(300, 0.0005 * (i + 1));
  serii.NEG = serie(300, -0.002);
  const r = clasament(serii, spy, { top: 3 });
  assert.deepEqual(r.clasament.map((x) => x.s), ['S7', 'S6', 'S5']);
  assert.equal(r.n, 9);
});

test('regim: SPY peste / sub media simpla pe 200 de zile', () => {
  const sus = regim(serie(260, 0.001)), jos = regim(serie(260, -0.001));
  assert.equal(sus.peste, true); assert.equal(jos.peste, false);
  assert.ok(sus.inchidere > sus.sma200 && jos.inchidere < jos.sma200);
  assert.equal(regim(serie(100, 0.001)).peste, null, 'sub 200 de bare: regim necunoscut');
});

test('istoricul: o linie pe zi de date, nu se dubleaza', () => {
  const rez = { dataUltimei: '2026-10-14', n: 500, clasament: Array.from({ length: 30 }, (_, i) => ({ s: 'S' + i, m12: 1 - i / 100 })) };
  const l = liniaIstoric(rez, { peste: true });
  assert.equal(l.d, '2026-10-14'); assert.equal(l.regim, true); assert.equal(l.n, 500); assert.equal(l.top.length, 20); assert.deepEqual(l.top[0], ['S0', 1]);
  const t1 = adaugaIstoric('', l);
  assert.equal(t1.trim().split('\n').length, 1);
  assert.equal(adaugaIstoric(t1, l), t1, 'aceeasi zi ⇒ neschimbat');
  const t2 = adaugaIstoric(t1, { ...l, d: '2026-10-15' });
  assert.equal(t2.trim().split('\n').length, 2);
  assert.equal(JSON.parse(t2.trim().split('\n')[1]).d, '2026-10-15');
});
