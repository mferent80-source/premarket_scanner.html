#!/usr/bin/env node
// I-638 (16.10.2026) — robotul de noapte al Clasificatorului Long / Hold / Short.
// Clasifică universul scannerului (US_CORE din candidate-engine/engine.js) cu ACELAȘI motor ca pagina și scrie
// candidate-engine/generated/clasificator.json; Planuri îl citește întâi și calculează pe telefon doar ce lipsește.
// Rezumatul pe simbol e făcut de aceeași funcție ca în pagină (TTDeskClassifier.compact), deci forma e identică.
//   node tools/clasificator-robot.mjs            scrie fișierul și jurnalul
//   node tools/clasificator-robot.mjs --uscat    doar afișează rezumatul
//   node tools/clasificator-robot.mjs --umbra    I-674: motorul al doilea (tools/motoare/<versiune>/) notează doar jurnalul lui
import { writeFileSync, readFileSync, existsSync, mkdirSync, appendFileSync, readdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { motor, adu, aduCache, aduNasdaq, universScanner, clasifica } from './clasificator-date.mjs';
import { univers } from './clasificator-univers.mjs';
import { PROBA, PRAG, regim, ziua, adauga, incarca, incheie, deScris, sesiuniDupa, bilantDoua, nopti, mesajZilnic, schimbari, raportVerdict, amprentaJudecator, contractClasificator, cuNotat } from './clasificator-jurnal.mjs';
import { amprentaFisier, inlocuiriDin, inregistrat } from './clasificator-amprenta.mjs';

export const FISIER = 'candidate-engine/generated/clasificator.json', VERSIUNE = 'clasificator-robot-v1', COMUN_MAX = 150, MOTOARE = 'tools/motoare';
/** I-658: universul robotului = cele ~600 de acțiuni ale robotului Trend (univers-sua.json, după capitalizare) + scannerul (US_CORE). */
export function universRobot(radacina = '.') {
  const scanner = universScanner(radacina), cap = new Map(); let lista = [];
  try { const u = JSON.parse(readFileSync(radacina + '/candidate-engine/generated/univers-sua.json', 'utf8')); lista = (u.l || []).filter((x) => x && typeof x.s === 'string').sort((a, b) => (b.cap || 0) - (a.cap || 0)).map((x) => { cap.set(x.s, x.cap || 0); return x.s; }); } catch { /* fără univers ⇒ doar scannerul */ }
  return { simboluri: [...new Set(scanner.concat(lista))], scanner: new Set(scanner), cap };
}
/** I-674: dosarul motorului al doilea (o copie înghețată a lib/holdings-classifier.js, altă versiune decât pagina), dacă există. */
export function dosarUmbra(radacina = '.', versiuneaPaginii) {
  if (!existsSync(radacina + '/' + MOTOARE)) return null;
  for (const d of readdirSync(radacina + '/' + MOTOARE).sort()) { const f = `${MOTOARE}/${d}/holdings-classifier.js`; if (existsSync(radacina + '/' + f) && d !== versiuneaPaginii) return `${MOTOARE}/${d}`; }
  return null;
}
const dorm = (ms) => new Promise((r) => setTimeout(r, ms));

export async function ruleaza({ c = motor('.', ['lib/desk-classifier.js']), simboluri = universScanner('.'), scanner = null, cap = new Map(), sursa, now = Date.now(), log = () => {}, comun = true, spy = null, jurnal = { voturi: [], rezultate: [] }, minute = Infinity, pauza = 0, reia = { asteapta: 15, incercari: 3 }, umbra = false, martor = null, aduSpy = null } = {}) {
  const C = c.HoldingsClassifier, D = c.TTDeskClassifier, cal = c.ExchangeCalendar, entries = {}, picate = [], serii = {}, intregi = {}, entries20 = {}, start = Date.now();
  const dateOf = (t) => c.DailySeries.date(t, 'America/New_York'), scurs = () => (Date.now() - start) / 60000;
  // Pentru rezultate contează doar sesiunile încheiate; o serie „veche” (bara zilei întârzie) e bună pentru zilele trecute.
  const incheiate = (raw) => { let lim; try { lim = cal.latest(now, 'US').day; } catch { return raw; } const zile = new Map(); for (const b of raw) { const d = dateOf(b.t); if (d > lim || cal.session('US', d).state === 'closed') continue; if (!zile.has(d) || zile.get(d).t < b.t) zile.set(d, b); } return [...zile.values()].sort((x, y) => x.t - y.t); };
  const citesteSerie = async (s) => { if (sursa) return sursa(s); const raw = await adu(s); try { return c.DailySeries.read(raw, s, now); } catch (e) { e.bare = incheiate(raw); throw e; } };
  const una = async (s, k) => {
    try {
      const src = await citesteSerie(s); intregi[s] = src.bars; // seria rămâne pentru rezultate chiar dacă modelul nu poate clasifica
      entries[s] = D.compact(s, src, clasifica(c, src.bars, { now }), now); serii[s] = { bars: c.HoldingsBars.prepare(src.bars).bars };
      // I-650: a doua țintă, scrisă dinainte (±2 ATR la 20 de sesiuni); dacă pică doar ea, simbolul rămâne cu ținta de 5.
      try { entries20[s] = D.compact(s, src, clasifica(c, src.bars, { now, spec: { horizon: 20, atr: 2 } }), now); } catch (e) { log(`${s} ținta 20 ✗ ${e && e.message}`); }
      log(`${k + 1}/${simboluri.length} ${s} ${entries[s].state}`);
    } catch (e) {
      if (e && e.bare) intregi[s] = e.bare; let motiv = String(e && e.message || e).slice(0, 120);
      // I-665: listată de curând ⇒ câte sesiuni are, ca pagina să poată spune când revine („⏳ dată”).
      if (/Sunt necesare .* sesiuni/.test(motiv) && intregi[s]) motiv = `Istoric scurt (listată de curând): doar ${intregi[s].length} sesiuni; modelele cer ${c.HoldingsBars.MINIMUM}. Revine singură când istoricul ajunge.`;
      picate.push({ simbol: s, motiv }); log(`${k + 1}/${simboluri.length} ${s} ✗ ${motiv}`);
    }
  };
  const TIMP = 'Timp depășit în rularea de noapte; reluat la rularea următoare.';
  for (const [k, s] of simboluri.entries()) {
    // Limita de timp: ce nu s-a apucat se notează, fișierul se scrie oricum.
    if (scurs() > minute) { picate.push({ simbol: s, motiv: TIMP }); continue; }
    if (pauza && k) await dorm(pauza);
    await una(s, k);
  }
  // I-666: Yahoo dă uneori târziu bara zilei (17.10: 614 din 616 „DATE STALE” la 01:20 UTC) ⇒ aștept și le reiau doar pe cele vechi.
  const vechi = () => picate.filter((p) => /DATE STALE/.test(p.motiv)); let reluari = 0;
  while (reluari < reia.incercari && vechi().length > simboluri.length / 2 && scurs() + reia.asteapta < minute) {
    const lista = vechi().map((p) => p.simbol); reluari++;
    log(`${lista.length} acțiuni au încă bara veche (Yahoo întârzie); reiau peste ${reia.asteapta} minute (reluarea ${reluari}).`);
    await dorm(reia.asteapta * 60000);
    for (const s of lista) { const i = picate.findIndex((p) => p.simbol === s); if (i >= 0) picate.splice(i, 1); if (scurs() > minute) { picate.push({ simbol: s, motiv: TIMP }); continue; } if (pauza) await dorm(pauza); await una(s, simboluri.indexOf(s)); }
  }
  const zile = {}; for (const e of Object.values(entries)) zile[e.asOf] = (zile[e.asOf] || 0) + 1;
  const asOf = Object.entries(zile).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0]?.[0] || null;
  const durata = () => ({ minute: Math.round(scurs() * 10) / 10, timpDepasit: picate.filter((p) => p.motiv === TIMP).length, reluari, vechi: vechi().length });
  if (aduSpy && asOf && !regim(spy, asOf, dateOf)) { try { spy = await aduSpy(); log('SPY reluat pentru regimul zilei.'); } catch (e) { log('SPY tot indisponibil: ' + (e && e.message)); } }
  const linie = ziua({ asOf, generat: new Date(now).toISOString(), motor: C.VERSION, entries, tinta20: { entries: entries20 } }, regim(spy, asOf, dateOf)); // jurnalul notează TOT universul
  const { linii, nou } = adauga(jurnal.voturi, linie); // prima notare rămâne; o rulare ulterioară completează doar acțiunile lipsă
  if (umbra) return { motor: C.VERSION, asOf, simboluri: simboluri.length, clasificate: Object.keys(entries).length, picate, durata: durata(), jurnalNou: { voturi: nou, rezultate: [] } };

  // I-641: modelul comun pe primele COMUN_MAX după capitalizare; dacă pică, fișierul rămâne valabil fără el.
  let comunRez = null;
  const ordine = Object.keys(serii).sort((a, b) => (cap.get(b) || 0) - (cap.get(a) || 0) || (a < b ? -1 : 1)).slice(0, COMUN_MAX), seriiComun = Object.fromEntries(ordine.map((s) => [s, serii[s]]));
  if (comun) { try { comunRez = univers(c, seriiComun, { now, log, spy, dateOf }); } catch (e) { comunRez = { eroare: String(e && e.message || e).slice(0, 160) }; log('model comun ✗ ' + comunRez.eroare); } }
  const inScanner = (es) => (scanner ? Object.fromEntries(Object.entries(es).filter(([s]) => scanner.has(s))) : es);
  const j = { version: VERSIUNE, motor: C.VERSION, generat: new Date(now).toISOString(), asOf, simboluri: simboluri.length, clasificate: Object.keys(entries).length, entries: inScanner(entries), picate, univers: comunRez, tinta20: { orizont: 20, prag: 2, entries: inScanner(entries20) } };
  // I-649: clasamentul zilei după probabilitatea „Long” a votului (aceeași regulă ca în jurnal).
  const rang = (es) => Object.values(es).map((e) => ({ s: e.symbol, p: e.algos.vote.support[2] })).sort((a, b) => b.p - a.p || (a.s < b.s ? -1 : 1)).map((x, i) => ({ loc: i + 1, s: x.s, long: Math.round(x.p * 1e4) / 1e4 }));
  j.clasament = rang(entries); j.clasament20 = rang(entries20); // a doua listă: aceeași regulă pe ținta de 20 de sesiuni
  // I-672: seriile acțiunilor cu voturi încă nejudecate care nu mai sunt în universul de azi (ieșite din listă, delistate).
  const fac = new Set(jurnal.rezultate.map((r) => r.m + '|' + r.asOf + '|' + r.h + '|' + r.s)), lipsa = new Set();
  for (const L of linii) for (const [ch, h] of [['voturi', 5], ['voturi20', 20]]) for (const s of Object.keys(L[ch] || {})) if (!intregi[s] && !fac.has(L.motor + '|' + L.asOf + '|' + h + '|' + s)) lipsa.add(s);
  for (const s of lipsa) { if (scurs() > minute + 5) break; try { intregi[s] = (await citesteSerie(s)).bars; } catch (e) { if (e && e.bare) intregi[s] = e.bare; } }
  // I-672: rezultatele înghețate în noaptea în care se încheie orizontul; I-660/668: bilanțul doar pe motorul în probă, notat la timp.
  // 27.10.2026 (auditul F, 🔵): rezultatele noi poartă ora notării
  const rezNoi = cuNotat(incheie(linii, jurnal.rezultate, intregi, dateOf, { sesiuniDupa: sesiuniDupa(cal, now) }), now), rezultate = jurnal.rezultate.concat(rezNoi);
  const { b5, b20 } = bilantDoua(linii, rezultate, { motor: PROBA, cal, now, faraUltima: PROBA !== C.VERSION }); // motorul în probă ca al doilea ⇒ ziua lui vine din jobul paralel
  // 27.10.2026 (I-743 / I-744): judecătorul amprentat (docs/clasificator-versiuni.md) + putere / primulVerdict / judecata pe fiecare țintă
  const azi = dateOf(now), c5 = contractClasificator(b5, { linii, cal, azi, h: 5, minim: PRAG.zileMinime }), c20 = contractClasificator(b20, { linii, cal, azi, h: 20, minim: PRAG.zileMinime20 });
  j.jurnal = { ...b5, ...c5 }; j.jurnal20 = { ...b20, ...c20 }; j.nopti = nopti(linii, cal, now, PROBA); j.durata = durata();
  j.judecator = amprentaJudecator(); j.putere = c5.putere; j.primulVerdict = c5.primulVerdict; j.judecata = c5.judecata;
  if (martor) j.martor = await martor(j, intregi, dateOf);
  return { ...j, jurnalNou: { voturi: nou, rezultate: rezNoi } };
}

/** I-675: compară închiderea zilei pe un eșantion fix (primele 20 după capitalizare, fără clase de acțiuni) cu Nasdaq. */
export function compara(yahoo, nasdaq, asOf, dateOf, prag = 0.5) {
  const b = yahoo && yahoo.find((x) => dateOf(x.t) === asOf), n = nasdaq && nasdaq[asOf];
  if (!b || !n) return null; const dif = (b.c / n - 1) * 100; return { yahoo: b.c, nasdaq: n, dif: Math.round(dif * 100) / 100, abatere: Math.abs(dif) > prag };
}
export function martorNasdaq(cap, { aduN = aduNasdaq, n = 20 } = {}) {
  return async (j, intregi, dateOf) => {
    const lista = Object.keys(intregi).filter((s) => /^[A-Z]+$/.test(s)).sort((a, b) => (cap.get(b) || 0) - (cap.get(a) || 0) || (a < b ? -1 : 1)).slice(0, n), de = new Date(Date.parse(j.asOf + 'T12:00:00Z') - 10 * 86400000).toISOString().slice(0, 10);
    let verificate = 0, indisponibile = 0; const abateri = [];
    for (const s of lista) { try { const x = compara(intregi[s], await aduN(s, de), j.asOf, dateOf); if (!x) { indisponibile++; continue; } verificate++; if (x.abatere) abateri.push({ s, ...x }); } catch { indisponibile++; } }
    return { sursa: 'Nasdaq', asOf: j.asOf, verificate, indisponibile, abateri };
  };
}

/** Garda de formă a fișierului publicat; întoarce lista problemelor (goală = bun). */
export function valideaza(j, motorVersiune) {
  const p = [], fin = Number.isFinite, prob = (x) => Array.isArray(x) && x.length === 3 && x.every((v) => fin(v) && v >= 0 && v <= 1) && Math.abs(x.reduce((a, b) => a + b, 0) - 1) < 1e-6;
  if (!j || j.version !== VERSIUNE) p.push('versiune'); if (motorVersiune && j?.motor !== motorVersiune) p.push('motor diferit de pagină');
  if (!j?.entries || typeof j.entries !== 'object') return p.concat('fără intrări');
  const clasificate = Number.isInteger(j.clasificate) ? j.clasificate : Object.keys(j.entries).length;
  if (!Number.isInteger(j.simboluri) || clasificate + (j.picate || []).length !== j.simboluri || Object.keys(j.entries).length > clasificate) p.push('numărătoare');
  for (const [s, e] of Object.entries(j.entries)) {
    if (e.symbol !== s || !/^\d{4}-\d{2}-\d{2}$/.test(e.asOf) || typeof e.timezone !== 'string' || !fin(e.closeMinutes) || !fin(e.trainedAt)) { p.push(s + ': identitate'); continue; }
    for (const id of ['boost', 'forest', 'svm', 'vote']) { const a = e.algos?.[id]; if (!a || !prob(a.support) || ![0, 1, 2].includes(a.classIndex) || !fin(a.loss) || !fin(a.p)) p.push(s + ': ' + id); }
    if (!['drift', 'uncertain', 'no-edge', 'fragile', 'research'].includes(e.state)) p.push(s + ': stare');
    if (!['long', 'short', 'always'].every((k) => Number.isInteger(e.money?.[k]?.n))) p.push(s + ': bani');
  }
  const u = j.univers;
  if (u && !u.eroare) {
    if (!['research', 'fragile', 'no-edge'].includes(u.state) || typeof u.message !== 'string' || !u.algos?.vote || !u.curent) p.push('model comun: formă');
    else for (const [s, x] of Object.entries(u.curent)) if (!prob(x.vote?.support)) p.push('model comun: ' + s);
  }
  return p;
}
/** I-666: motivul eșecului, în cuvinte (pentru mesajul de pe Discord). */
export function motivEsec(j) {
  const stale = (j.picate || []).filter((p) => /DATE STALE/.test(p.motiv)), m = stale.length && /sesiune așteptată (\d{4}-\d{2}-\d{2})/.exec(stale[0].motiv);
  if (stale.length > (j.simboluri || 0) / 2) return `Yahoo n-a publicat încă bara de ${m ? m[1] : 'azi'} pentru ${stale.length} din ${j.simboluri} acțiuni (după ${j.durata?.reluari || 0} reluări în ${j.durata?.minute ?? '?'} minute). Câinele de pază reîncearcă dimineața.`;
  return `Doar ${j.clasificate} din ${j.simboluri} acțiuni clasificate; motive: ${[...new Set((j.picate || []).map((p) => p.motiv.slice(0, 50)))].slice(0, 3).join(' · ')}.`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--cache'), dir = i > 0 ? process.argv[i + 1] : null, umbra = process.argv.includes('--umbra'), uscat = process.argv.includes('--uscat'); // --cache: doar pentru rulări locale repetate
  const pagina = motor('.').HoldingsClassifier.VERSION, du = umbra ? dosarUmbra('.', pagina) : null;
  if (umbra && !du) { console.log('Fără motor al doilea în ' + MOTOARE + '; nimic de făcut.'); process.exit(0); }
  const inloc = du ? inlocuiriDin('.', du) : {}, c = motor('.', ['lib/desk-classifier.js'], inloc), amp = amprentaFisier('.', inloc), bun = inregistrat('.', c.HoldingsClassifier.VERSION, amp);
  if (!bun) console.error(`Motorul ${c.HoldingsClassifier.VERSION} (amprenta ${amp}) nu e în docs/clasificator-versiuni.md: fișierul se scrie, dar jurnalul NU notează ziua (I-661).`);
  const vechi = existsSync(FISIER) ? (() => { try { return JSON.parse(readFileSync(FISIER, 'utf8')); } catch { return null; } })() : null;
  let spy = null; try { spy = dir ? await aduCache('SPY', dir) : await adu('SPY'); } catch (e) { console.log('SPY indisponibil: ' + e.message); }
  const jurnal = incarca({ existsSync, readdirSync, readFileSync }, '.');
  const U = universRobot('.'), max = Number(process.env.CLASIFICATOR_MAX || 0), sim = max ? U.simboluri.slice(0, max) : U.simboluri;
  const { jurnalNou, ...j } = await ruleaza({ c, simboluri: sim, scanner: U.scanner, cap: U.cap, minute: Number(process.env.CLASIFICATOR_MINUTE || 55), pauza: dir ? 0 : 150, log: console.log, spy, jurnal, umbra,
    reia: { asteapta: dir ? 0 : 15, incercari: 3 }, aduSpy: dir ? null : () => adu('SPY'), martor: dir || umbra ? null : martorNasdaq(U.cap), ...(dir ? { sursa: async (s) => c.DailySeries.read(await aduCache(s, dir), s) } : {}) });
  if (!bun) jurnalNou.voturi = []; // motor neînregistrat: voturile lui nu intră în probă (rezultatele voturilor vechi se notează în continuare)
  const n = j.clasificate, scrieJurnal = () => { for (const [p, t] of deScris(jurnalNou)) { mkdirSync(dirname(p), { recursive: true }); appendFileSync(p, t); } };
  console.log(`\n${n} din ${j.simboluri} clasificate · EOD ${j.asOf} · picate ${j.picate.length} · ${j.durata.minute} minute · reluări ${j.durata.reluari}` + (umbra ? ` · motorul al doilea ${j.motor}` : ` · experimentale ${Object.values(j.entries).filter((e) => e.state === 'research').length}`));
  // Prea puține ⇒ rețea / Yahoo picat: nu înlocuiesc fișierul bun de ieri cu unul aproape gol; motivul merge pe Discord (pasul de eșec).
  if (n < Math.ceil(j.simboluri * 0.5)) { const m = motivEsec(j); console.error('Prea puține simboluri clasificate; fișierul vechi rămâne. ' + m); writeFileSync('clasificator-motiv.txt', m); process.exit(1); }
  if (umbra) { if (!bun && process.env.DISCORD_WEBHOOK && !uscat) { try { await fetch(process.env.DISCORD_WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: `**Clasificatorul — motorul al doilea neînregistrat** · ${c.HoldingsClassifier.VERSION} (amprenta ${amp}); ziua ${j.asOf} NU s-a notat.` }), signal: AbortSignal.timeout(20000) }); } catch { /* fără Discord */ } }
    if (!uscat) scrieJurnal(); console.log('Jurnalul motorului al doilea: ' + (jurnalNou.voturi.length ? 'ziua ' + j.asOf + ' notată' : 'ziua era deja notată')); process.exit(0); }
  const probleme = valideaza(j, c.HoldingsClassifier.VERSION);
  if (probleme.length) { console.error('Fișier respins: ' + probleme.slice(0, 10).join(' · ')); writeFileSync('clasificator-motiv.txt', 'Fișierul generat nu a trecut garda: ' + probleme.slice(0, 3).join(' · ')); process.exit(1); }
  console.log('Jurnal: ' + j.jurnal.zileNotate + ' zile notate · ' + j.jurnal.zileVerificate + ' verificate · rezultate noi ' + jurnalNou.rezultate.length + ' · ' + j.jurnal.mesaj + ' ' + j.jurnal.nota);
  if (j.martor) console.log(`Martor ${j.martor.sursa}: ${j.martor.verificate} verificate, ${j.martor.abateri.length} abateri, ${j.martor.indisponibile} indisponibile.`);
  const raport = raportVerdict(vechi, j), caleRaport = raport ? `docs/clasificator-verdict-${j.asOf}.md` : null;
  if (!uscat) { writeFileSync(FISIER, JSON.stringify(j) + '\n'); scrieJurnal(); if (raport) writeFileSync(caleRaport, raport); }
  // Discord: un mesaj la orice schimbare de verdict (cele 4), raportul la verdict (I-663) și rezumatul zilnic DOAR când un verdict e pozitiv (I-657).
  const trimite = async (content) => { try { const r = await fetch(process.env.DISCORD_WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content }), signal: AbortSignal.timeout(20000) }); console.log('Discord: ' + r.status); } catch (e) { console.log('Discord: ' + e.message); } };
  if (process.env.DISCORD_WEBHOOK && !uscat) {
    if (!bun) await trimite(`**Clasificatorul — motor neînregistrat** · ${c.HoldingsClassifier.VERSION} (amprenta ${amp}) nu e în registrul versiunilor; ziua ${j.asOf} NU s-a notat în jurnal. Scrie rândul în docs/clasificator-versiuni.md (sau urcă versiunea).`);
    const sch = schimbari(vechi, j); if (sch.length) await trimite('**Clasificatorul — verdict nou** · ' + sch.join(' · ') + ' · ' + j.jurnal.mesaj);
    if (raport) await trimite('**Clasificatorul — raportul la verdict** (' + j.asOf + '): https://github.com/mferent80-source/premarket_scanner.html/blob/main/' + caleRaport);
    const zi = mesajZilnic(j); if (zi && vechi?.asOf !== j.asOf) await trimite(zi);
  }
}
