// 20.10.2026 (I-724): starea suitei de teste după un push — citește jurnalele `node --test` și `unittest` din robotul `.github/workflows/teste.yml`
// și scrie health/generated/suita.json (Health îl arată: verde / roșu, cifre, testele picate, commitul, ora). Partea de citire e pură (testată).
// node tools/suita-stare.mjs <jurnal-node> <jurnal-python> <outcome-node> <outcome-python> <commit> <url-rulare>
import { readFileSync } from 'node:fs';

/** Rezumatul `node --test` (reporter spec): cifrele „ℹ tests / pass / fail / skipped / duration_ms” și numele testelor picate (după „✖ failing tests:”). */
export function citesteNode(log, outcome = null) {
  const text = String(log || ''), num = (k) => { const m = new RegExp('^\\s*ℹ ' + k + ' (\\d+(?:\\.\\d+)?)\\s*$', 'm').exec(text); return m ? Number(m[1]) : null; };
  const tests = num('tests'), pass = num('pass'), fail = num('fail'), skipped = num('skipped'), durataMs = num('duration_ms');
  const picate = [];
  const idx = text.indexOf('✖ failing tests:');
  if (idx >= 0) for (const line of text.slice(idx).split('\n').slice(1)) { const m = /^\s*✖ (.+?)(?: \(\d+(?:\.\d+)?ms\))?\s*$/.exec(line); if (m) picate.push(m[1].trim()); }
  const rulat = tests != null && pass != null && fail != null;
  return { rulat, tests, pass, fail, skipped: skipped ?? 0, durataMs, picate: [...new Set(picate)], ok: rulat ? fail === 0 && outcome !== 'failure' : outcome === 'success' };
}
/** Rezumatul `python -m unittest`: „Ran N tests” + OK / FAILED (errors=…, failures=…). */
export function citestePython(log, outcome = null) {
  const text = String(log || ''), ran = /^Ran (\d+) tests?/m.exec(text), ok = /^OK\b/m.test(text), failed = /^FAILED \((.+)\)/m.exec(text);
  return { rulat: !!ran, tests: ran ? Number(ran[1]) : null, ok: ran ? ok && !failed && outcome !== 'failure' : outcome === 'success', detaliu: failed ? failed[1] : null };
}
export function stare({ nodeLog, pythonLog, nodeOutcome = null, pythonOutcome = null, commit = null, run = null, now = Date.now() } = {}) {
  const node = citesteNode(nodeLog, nodeOutcome), python = citestePython(pythonLog, pythonOutcome);
  return { version: 'suita-v1', la: new Date(now).toISOString(), commit: commit || null, run: run || null, verde: node.ok && python.ok, node, python };
}
if (process.argv[1] && /suita-stare\.mjs$/.test(process.argv[1].replace(/\\/g, '/'))) {
  const [nodeLog, pythonLog, nodeOutcome, pythonOutcome, commit, run] = process.argv.slice(2);
  const rd = (p) => { try { return readFileSync(p, 'utf8'); } catch (_) { return ''; } };
  process.stdout.write(JSON.stringify(stare({ nodeLog: rd(nodeLog), pythonLog: rd(pythonLog), nodeOutcome, pythonOutcome, commit, run }), null, 1) + '\n');
}
