// 19.10.2026 — reparațiile din revizia independentă a lotului (după 7f2e3ec3):
// (1) pagina contului pornea doar dacă `src` era gol; suspendarea pentru copie punea „about:blank” ⇒ fără citiri T212 până la reîncărcare;
// (2) un registru care nu s-a putut citi intra în lista copiei fără valoare ⇒ restaurarea îl ștergea.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const shell = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const sync = readFileSync(new URL('../app/cloud-sync.js', import.meta.url), 'utf8');

test('pagina contului pornește și după „about:blank”, dar nu cât e suspendată; reluarea o pornește prin carcasă', () => {
  const start = shell.match(/function startBroker\(\)\{[^\n]*\}/)[0];
  assert.match(start, /brokerFrame\.src==='about:blank'/);
  assert.match(start, /backupPaused\)return/);
  assert.match(shell, /window\.ttStartBroker=startBroker;/);
  const resume = sync.match(/async function resumeAfterBackup\(\)\{[^\n]*/)[0];
  assert.match(resume, /else window\.ttStartBroker\?\.\(\)/);
  assert.match(sync, /if\(broker\.src&&broker\.src!=='about:blank'\)brokerBeforeBackup=broker\.src;/);
});

test('copia: doar registrele citite intră în listă; copie înaintea fiecărei schimbări venite din cont', () => {
  const b = sync.match(/async function backup\([^\n]*/)[0];
  assert.match(b, /try\{v=await value\(k\);\}catch\{continue;\}if\(v===undefined\)continue;keys\.push\(k\);/, 'cheia necitită (și, din 27.10, cea absentă) nu intră în listă');
  assert.match(sync, /humanKey\(key\)\)\{await backup\(\[\],true\);/);
});
