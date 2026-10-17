#!/usr/bin/env node
// I-684 (17.10.2026) — rezumatul de dimineață pe Discord, înainte de deschiderea SUA (zilele de bursă, ~12:00 UTC):
// verdictul pieței notat noaptea și ce s-a schimbat față de sesiunea precedentă, evenimentele zilei, marile companii care raportează
// azi / mâine, futures acum. Doar din fișierul robotului + Yahoo; pozițiile tale nu intră (sunt doar pe telefon, criptate).
//   node tools/verdict-dimineata.mjs           trimite (dacă există DISCORD_WEBHOOK)
//   node tools/verdict-dimineata.mjs --uscat   doar afișează
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { adu } from './clasificator-date.mjs';

const T = { favorabil: 'Favorabil', neutru: 'Neutru', prudent: 'Prudent', defensiv: 'Defensiv' };
const EVENT_RO = { 'FOMC Rate Decision': 'Fed — decizia de dobândă', 'Non-Farm Payrolls + Unemployment Rate': 'Locurile de muncă (NFP)', 'CPI YoY + Core CPI': 'Inflația (CPI)', 'PPI YoY': 'Prețurile producției (PPI)', 'Initial Jobless Claims': 'Cererile de șomaj', 'Retail Sales MoM': 'Vânzările cu amănuntul', 'ISM Manufacturing PMI': 'Industria (ISM)' };
const pct = (v) => (Number.isFinite(v) ? (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1).replace('.', ',') + '%' : '—');

/** Mesajul (pur, testabil). j = verdict-piata.json; zi = ziua de azi la New York; ev = evenimentele calendarului; fut = { es, nq }. */
export function mesaj(j, { zi, ev = [], fut = null, oraRO = (t) => new Date(t).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' }) } = {}) {
  if (!j || !j.label) return null;
  const ist = (j.istoric || []).filter((x) => x.asOf < j.asOf), ieri = ist.at(-1);
  const sch = ieri && ieri.label !== j.label ? `${T[ieri.label] || ieri.label} → **${T[j.label] || j.label}**` : `**${T[j.label] || j.label}**` + (ieri ? ' (la fel ca ieri)' : '');
  const azi = ev.filter((e) => new Date(e.d).toLocaleDateString('sv-SE', { timeZone: 'America/New_York' }) === zi && (e.impact === 'high' || e.impact === 'med') && e.event !== 'FOMC Press Conference').map((e) => `${EVENT_RO[e.event] || e.event} la ${oraRO(e.d)}`);
  const maine = new Date(Date.parse(zi + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
  const mari = (j.rezultateMari || []).filter((x) => x.date === zi || x.date === maine).map((x) => `${x.symbol}${x.date === zi ? (x.cand ? ' (' + x.cand + ')' : ' (azi)') : ' (mâine)'}`);
  const linii = [`**Verdictul pieței** · ${sch} · scor ${j.score > 0 ? '+' : j.score < 0 ? '−' : ''}${Math.abs(j.score)} (după sesiunea ${j.asOf})`, j.fraza];
  if (fut && (Number.isFinite(fut.es) || Number.isFinite(fut.nq))) linii.push(`Futures acum: S&P ${pct(fut.es)} · Nasdaq ${pct(fut.nq)}`);
  linii.push(azi.length ? `Azi: ${azi.join(' · ')}` : 'Azi: niciun eveniment macro important.');
  if (mari.length) linii.push(`Rezultate mari: ${mari.slice(0, 8).join(', ')}`);
  linii.push('Context, nu semnal. Detaliile pe Astăzi.');
  return linii.filter(Boolean).join('\n').slice(0, 1900);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const c = { console, Intl, Date, Math, JSON, URL }; c.window = c; vm.createContext(c);
  for (const f of ['lib/exchange-calendar.js', 'lib/daily-series.js', 'lib/macro-context.js']) vm.runInContext(readFileSync(f, 'utf8'), c, { filename: f });
  const now = Date.now(), zi = new Date(now).toLocaleDateString('sv-SE', { timeZone: 'America/New_York' }), ses = c.ExchangeCalendar.session('US', zi);
  if (ses.state !== 'open' && ses.state !== 'hours-unknown') { console.log(`${zi}: bursa SUA e închisă — fără mesaj.`); process.exit(0); }
  const j = existsSync('candidate-engine/generated/verdict-piata.json') ? JSON.parse(readFileSync('candidate-engine/generated/verdict-piata.json', 'utf8')) : null;
  let fut = null; try { const f = async (s) => { const b = await adu(s, { range: '5d' }); return b.length >= 2 ? (b.at(-1).c / b.at(-2).c - 1) * 100 : null; }; fut = { es: await f('ES=F'), nq: await f('NQ=F') }; } catch (e) { console.log('Futures ✗ ' + e.message); }
  let ev = []; try { ev = c.MCTX.hardcodedEvents(); } catch (_) { ev = []; }
  const m = mesaj(j, { zi, ev, fut }); if (!m) { console.log('Fișierul verdictului lipsește — fără mesaj.'); process.exit(0); }
  console.log(m);
  if (process.env.DISCORD_WEBHOOK && !process.argv.includes('--uscat')) { const r = await fetch(process.env.DISCORD_WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: m }), signal: AbortSignal.timeout(20000) }); console.log('Discord: ' + r.status); }
}
