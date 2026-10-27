#!/usr/bin/env node
// 27.10.2026 — I-741 (lotul F al auditului): puterea probelor Reguli V1 și Top Long, calculată prin simulare ÎNAINTE de orice rezultat al
// protocolului v2 și scrisă în docs/proba-putere-2026-10-27.json (cifrele din protocoale și din PROTOCOL.putere.rezultate vin de aici).
// Lumi sintetice cu înregistrări ZILNICE (ca jurnalul real), grupurile ca în jurnal, +x % pe perioadă pentru grupul SUS, testul semnelor
// cu judecată unică la N perioade (eșantion fix); mulberry32, sămânță fixă ⇒ aceleași cifre la fiecare rulare.
//   node tools/proba-putere.mjs --proba v1 --k 20 [--lumi 2000] [--out fișier.json]
//   node tools/proba-putere.mjs --proba toplong --k 5 --lumi 200
//   node tools/proba-putere.mjs --marime [--lumi 20000] [--scrie]   mărimea judecății unice cu persistență (AR(1)), la N cerut și la 8;
//                                                                 --scrie o pune în docs/proba-putere-2026-10-27.json (cheia `marime`)
import { writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { putere, perioadeNecesare, marimeSemneAR, sigmaZiPentru, PROTOCOL } from '../lib/v1-proba.mjs';

export const DOC = 'docs/proba-putere-2026-10-27.json', RHO = Object.freeze([0, 0.1, 0.2, 0.3]);
/** Mărimea sub H0 (fără avantaj) a judecății unice, pe orizonturi: la N cerut de protocol și la 8 (v1), pentru autocorelările din RHO. */
export function marime({ lumi = 20000, samanta = PROTOCOL.putere.samanta } = {}) {
  const out = {};
  for (const k of PROTOCOL.orizonturi) {
    const N = PROTOCOL.perioadeCerute[k], rho = {}, la8 = {};
    if (!N) continue;   // 27.10.2026 (revizia F, decizia (a)): orizontul doar de monitorizare n-are judecată, deci nici mărime
    for (const r of RHO) { rho[String(r)] = marimeSemneAR({ rho: r, N, lumi, samanta }); la8[String(r)] = marimeSemneAR({ rho: r, N: 8, lumi, samanta }); }
    out[k] = { N, lumi, samanta, rho, la8 };
  }
  return out;
}

/** Cele două probe care împart evaluatorul: grupurile din jurnalul real (23.10.2026: V1 65 verificate, 16 SUS; Top Long 66 verificate, 10 în top). */
export const PROBE = Object.freeze({
  v1: Object.freeze({ nume: 'Reguli V1', cod: 'trecute', verificate: 65, sus: 16 }),
  toplong: Object.freeze({ nume: 'Top Long', cod: 'm', verificate: 66, sus: 10 })
});
export const GRILA = Object.freeze({ 5: Object.freeze([8, 12, 16, 20, 24, 30, 36, 48]), 20: Object.freeze([8, 12, 16, 20, 24, 30, 36, 48, 60, 72, 96]) });
/** 27.10.2026 (revizia F, 🟡6): `sigmaPerioada` = abaterea pe perioadă MĂSURATĂ (motorul real pe Core85, docs/proba-putere-2026-10-27.json,
 *  cheia `revizie`) ⇒ abaterea zilnică a lumilor se alege s-o reproducă; `verificate` / `sus` = grupurile medii măsurate; `grila` se poate da. */
export function ruleaza({ proba, k, lumi = PROTOCOL.putere.lumi, samanta = PROTOCOL.putere.samanta, sigmaPerioada = null, verificate = null, sus = null, grila = null }) {
  const p0 = PROBE[proba]; if (!p0) throw Error('Proba necunoscută: ' + proba);
  const p = { ...p0, verificate: verificate || p0.verificate, sus: sus || p0.sus }, sigmaZi = sigmaPerioada ? sigmaZiPentru(sigmaPerioada, { k, sus: p.sus, jos: p.verificate - p.sus }) : PROTOCOL.putere.sigmaZi;
  const r = putere({ k, lumi, samanta, cod: p.cod, verificate: p.verificate, sus: p.sus, grila: [...(grila || GRILA[k])], sigmaZi });
  return { proba, nume: p.nume, k, lumi, samanta, sigmaZi, sigmaPerioadaTinta: sigmaPerioada, grup: { sus: p.sus, jos: p.verificate - p.sus }, sigmaPerioada: r.sigmaPerioada, grila: r.grila, laPlus: r.laPlus, rezultate: r.rezultate,
    cerute: { laPlus1: perioadeNecesare(r, 1, 0.5), laPlus05: perioadeNecesare(r, 0.5, 0.5) }, scrisLa: new Date().toISOString() };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
  if (process.argv.includes('--marime')) {
    const m = marime({ lumi: Number(arg('lumi', 20000)) });
    for (const k of Object.keys(m)) console.log(`k=${k} · N=${m[k].N} · ${m[k].lumi} lumi · ` + RHO.map((r) => `ρ ${r}: ${(100 * m[k].rho[String(r)]).toFixed(1)} % (la 8: ${(100 * m[k].la8[String(r)]).toFixed(1)} %)`).join(' · '));
    if (process.argv.includes('--scrie')) { const d = JSON.parse(readFileSync(DOC, 'utf8')); /* 27.10.2026 (revizia F): mărimea la N-ul nou intră în `revizie`; `marime` (lotul F) rămâne ca istoric */ d.revizie = d.revizie || {}; d.revizie.marime = { ce: 'rata „ajută” fals a judecății unice (testul semnelor, p ≤ 0,05) sub H0, când diferențele perioadelor au autocorelare ρ (AR(1) gaussian); ρ = 0 = coada binomială exactă', ...m }; writeFileSync(DOC, JSON.stringify(d, null, 1).replace(/\n/g, '\r\n') + '\r\n'); console.log('scris: ' + DOC); }
    process.exit(0);
  }
  const proba = arg('proba', 'v1'), k = Number(arg('k', 20)), lumi = Number(arg('lumi', PROTOCOL.putere.lumi)), out = arg('out', null), t0 = Date.now();
  const sp = arg('sigmaPerioada', null), gr = arg('grila', null);
  const r = ruleaza({ proba, k, lumi, sigmaPerioada: sp ? Number(sp) : null, verificate: arg('verificate', null) ? Number(arg('verificate')) : null, sus: arg('sus', null) ? Number(arg('sus')) : null, grila: gr ? gr.split(',').map(Number) : null });
  console.log(`${r.nume} · k=${k} · ${lumi} lumi · ${((Date.now() - t0) / 1000).toFixed(0)} s · σ perioadă sub H0 = ${(100 * r.sigmaPerioada).toFixed(2)} %`);
  for (const N of r.grila) console.log(`  N=${String(N).padStart(3)}: fals ${(100 * r.rezultate[N]['0']).toFixed(1)} % · +0,5 % ⇒ ${(100 * r.rezultate[N]['0.5']).toFixed(1)} % · +1 % ⇒ ${(100 * r.rezultate[N]['1']).toFixed(1)} %`);
  console.log(`  perioade cerute (≥ 50 % la +1 %/perioadă): ${r.cerute.laPlus1} · la +0,5 %: ${r.cerute.laPlus05}`);
  if (out) { writeFileSync(out, JSON.stringify(r, null, 1) + '\n'); console.log('scris: ' + out); }
}
