// 28.10.2026 (revizia F2, 🟡1, 🔵6, 🔵13): fluxurile probelor salvau fișierele înghețate cu UN singur `git add a b 2>/dev/null || true`.
// Cât timp unul lipsește, git iese cu 128 ÎNAINTE să adauge ceva, iar `|| true` ascunde eroarea ⇒ înghețul nu se salvează și fiecare noapte
// reface tot jurnalul pe un runner curat (vechiul 🔴2). Acum fiecare fișier trece separat prin `tools/git-add-existente.mjs`.
// Tot aici: `cmd | tee` fără `pipefail` întoarce codul lui tee (0) ⇒ a doua încercare și alarma Discord nu porneau niciodată;
// push-ul probelor reîncearcă de 3 ori (o cursă cu alt robot nu mai pierde ziua).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const UNEALTA = resolve('tools/git-add-existente.mjs');
function depozit() {
  const d = mkdtempSync(join(tmpdir(), 'git-add-'));
  const g = (...a) => spawnSync('git', a, { cwd: d, encoding: 'utf8' });
  g('init', '-q'); g('config', 'user.email', 'robot@test'); g('config', 'user.name', 'robot');
  mkdirSync(join(d, 'gen'));
  return { d, g, staged: () => g('diff', '--cached', '--name-only').stdout.split(/\r?\n/).filter(Boolean), sterge: () => rmSync(d, { recursive: true, force: true }) };
}
const ruleaza = (cwd, ...cai) => spawnSync(process.execPath, [UNEALTA, ...cai], { cwd, encoding: 'utf8' });

test('tiparul vechi: un singur `git add` pe două fișiere, unul lipsă ⇒ git iese cu 128 și NU adaugă nici fișierul existent', () => {
  const r = depozit();
  try {
    writeFileSync(join(r.d, 'gen', 'v1-inghetat.jsonl'), '{"tip":"perioada"}\n');
    const x = r.g('add', 'gen/v1-inghetat.jsonl', 'gen/premarket-inghetat.jsonl');
    assert.equal(x.status, 128); assert.deepEqual(r.staged(), []);
  } finally { r.sterge(); }
});

test('unealta adaugă fiecare fișier existent separat; cel lipsă se sare cu mesaj, pasul nu pică', () => {
  const r = depozit();
  try {
    writeFileSync(join(r.d, 'gen', 'v1-inghetat.jsonl'), '{"tip":"perioada"}\n');
    const x = ruleaza(r.d, 'gen/premarket-inghetat.jsonl', 'gen/v1-inghetat.jsonl');
    assert.equal(x.status, 0, x.stderr); assert.deepEqual(r.staged(), ['gen/v1-inghetat.jsonl']);
    assert.match(x.stdout, /lipsește[^\n]*gen\/premarket-inghetat\.jsonl/);
    writeFileSync(join(r.d, 'gen', 'premarket-inghetat.jsonl'), '{"tip":"judecata"}\n');
    assert.equal(ruleaza(r.d, 'gen/premarket-inghetat.jsonl', 'gen/v1-inghetat.jsonl').status, 0);
    assert.deepEqual(r.staged().sort(), ['gen/premarket-inghetat.jsonl', 'gen/v1-inghetat.jsonl']);
  } finally { r.sterge(); }
});

test('o eroare REALĂ a lui git (nu „lipsește”) oprește pasul — închis la eroare', () => {
  const d = mkdtempSync(join(tmpdir(), 'git-add-fara-depozit-'));
  try {
    writeFileSync(join(d, 'a.jsonl'), '{}\n');
    const x = spawnSync(process.execPath, [UNEALTA, 'a.jsonl'], { cwd: d, encoding: 'utf8', env: { ...process.env, GIT_CEILING_DIRECTORIES: tmpdir() } });
    assert.notEqual(x.status, 0, 'în afara unui depozit git, pasul trebuie să pice');
  } finally { rmSync(d, { recursive: true, force: true }); }
});

const FLUXURI = readdirSync('.github/workflows').filter((n) => n.endsWith('.yml')).map((n) => ({ n, y: readFileSync(join('.github/workflows', n), 'utf8') }));

test('în niciun flux: `git add` cu mai multe fișiere și eroarea ascunsă cu `|| true`', () => {
  for (const { n, y } of FLUXURI) for (const linie of y.split(/\r?\n/)) {
    if (/^\s*#/.test(linie)) continue; // comentariile pot pomeni tiparul vechi
    const m =linie.match(/git add\s+((?:[^\s|&;]+\s+)+?)(?:2>\/dev\/null\s*)?\|\|\s*true/);
    if (!m) continue;
    const cai = m[1].trim().split(/\s+/).filter((c) => !c.startsWith('-'));
    assert.ok(cai.length <= 1, n + ': ' + linie.trim());
  }
});

test('fișierele înghețate ale probelor trec prin unealtă (V1, Top Long, umbra, Trend)', () => {
  const y = (n) => FLUXURI.find((f) => f.n === n).y;
  assert.match(y('v1-proba.yml'), /node tools\/git-add-existente\.mjs[^\n]*v1-inghetat\.jsonl/);
  assert.match(y('v1-proba.yml'), /node tools\/git-add-existente\.mjs[^\n]*premarket-inghetat\.jsonl/);
  assert.match(y('trend-12-1-bilant.yml'), /node tools\/git-add-existente\.mjs[^\n]*trend-12-1-inghetat\.jsonl/);
});

test('`| tee` doar cu `set -o pipefail` în același pas (altfel a doua încercare și alarma nu pornesc)', () => {
  for (const { n, y } of FLUXURI) {
    const linii = y.split(/\r?\n/);
    linii.forEach((l, i) => {
      if (/^\s*#/.test(l) || !/\|\s*tee\b/.test(l)) return;
      const fereastra = linii.slice(Math.max(0, i - 4), i + 1).join('\n');
      assert.match(fereastra, /set -o pipefail/, n + ':' + (i + 1) + ' ' + l.trim());
    });
  }
});

test('push-ul probelor reîncearcă de 3 ori și pică vizibil (V1 / Top Long și Trend)', () => {
  for (const n of ['v1-proba.yml', 'trend-12-1-bilant.yml']) {
    const y = FLUXURI.find((f) => f.n === n).y;
    assert.match(y, /for i in 1 2 3; do if git pull --rebase origin main && git push origin HEAD:main; then ok=1; break; fi/, n);
    assert.match(y, /\[ "\$ok" = 1 \] \|\| \{ echo 'Push eșuat de 3 ori\.'; exit 1; \}/, n);
  }
});
