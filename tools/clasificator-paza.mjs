#!/usr/bin/env node
// I-667 (17.10.2026) — câinele de pază al robotului Clasificator. GitHub poate sări o rulare programată (17.10: încercarea
// de la 03:40 UTC n-a pornit deloc), iar atunci nu pleacă nici mesajul de eșec. Dimineața, de câteva ori, verifică dacă
// fișierul robotului are ultima sesiune încheiată; dacă nu și nimic nu rulează, pornește robotul O SINGURĂ dată pe sesiune.
//   node tools/clasificator-paza.mjs     (în Actions: GH_TOKEN, GITHUB_REPOSITORY, DISCORD_WEBHOOK)
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { motor } from './clasificator-date.mjs';
import { PROBA, incarca } from './clasificator-jurnal.mjs';
import { readdirSync } from 'node:fs';

export const WORKFLOW = 'clasificator.yml', BOT = 'github-actions[bot]';
/** Decizia: 'ok' (sesiunea e notată) · 'ruleaza' (o rulare e în curs) · 'deja' (am pornit-o o dată pentru sesiunea asta) · 'porneste'.
 *  `dupa` = momentul de la care contează rulările pentru sesiune (închiderea ei). */
export function decide({ asOf, asteptata, rulari = [], dupa }) {
  if (!asteptata || asOf === asteptata) return 'ok';
  if (rulari.some((r) => ['queued', 'in_progress', 'waiting', 'requested', 'pending'].includes(r.status))) return 'ruleaza';
  if (rulari.some((r) => r.event === 'workflow_dispatch' && r.triggering_actor?.login === BOT && Date.parse(r.created_at) >= dupa)) return 'deja';
  return 'porneste';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const c = motor('.'); let s; try { s = c.ExchangeCalendar.latest(Date.now(), 'US'); } catch (e) { console.log('Calendarul nu poate spune sesiunea: ' + e.message); process.exit(0); }
  const j = existsSync('candidate-engine/generated/clasificator.json') ? JSON.parse(readFileSync('candidate-engine/generated/clasificator.json', 'utf8')) : {};
  // Revizia din 17.10: când pagina are alt motor decât cel în probă, proba vine din jobul „umbra” — verific și linia ei din jurnal.
  if (c.HoldingsClassifier.VERSION !== PROBA) { const z = incarca({ existsSync, readdirSync, readFileSync }, '.').voturi.filter((l) => l.motor === PROBA).map((l) => l.asOf).sort().at(-1) || null; if (!z || !j.asOf || z < j.asOf) j.asOf = z; }
  const repo = process.env.GITHUB_REPOSITORY, h = { authorization: 'Bearer ' + process.env.GH_TOKEN, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' };
  const api = (p, o = {}) => fetch('https://api.github.com/repos/' + repo + p, { ...o, headers: { ...h, ...(o.headers || {}) }, signal: AbortSignal.timeout(20000) });
  const rulari = (await (await api(`/actions/workflows/${WORKFLOW}/runs?per_page=20`)).json()).workflow_runs || [];
  // O pornire a câinelui după prânzul (UTC) zilei sesiunii contează pentru sesiunea asta: cel mult una pe sesiune.
  const d = decide({ asOf: j.asOf, asteptata: s.day, rulari, dupa: Date.parse(s.day + 'T12:00:00Z') });
  console.log(`Sesiunea așteptată ${s.day} · fișierul are ${j.asOf || '—'} · decizia: ${d}`);
  if (d !== 'porneste') process.exit(0);
  const r = await api(`/actions/workflows/${WORKFLOW}/dispatches`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ref: 'main' }) });
  console.log('Pornire: ' + r.status); if (r.status !== 204) process.exit(1);
  if (process.env.DISCORD_WEBHOOK) { try { await fetch(process.env.DISCORD_WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: `**Câinele de pază · Clasificator** — robotul n-a notat sesiunea ${s.day} (ultimul fișier: ${j.asOf || '—'}); l-am pornit acum. Dacă pică și reluarea, vine mesajul lui de eșec.` }), signal: AbortSignal.timeout(20000) }); } catch (e) { console.log('Discord: ' + e.message); } }
}
