// 19.10.2026 — audit Long & Reversal: îmbunătățirile din afara funcțiilor înghețate de proba Top Long.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const load = (f, extra = {}) => { const c = {console, Number, Date, Math, JSON, Map, ...extra}; c.window = c; c.globalThis = c; vm.createContext(c); vm.runInContext(readFileSync(new URL('../' + f, import.meta.url), 'utf8'), c); return c; };
const AAPL = {symbol: 'AAPL', entryLow: 342.43, entryHigh: 344.49, stop: 335.09};

test('prețul de acum: peste zonă ⇒ riscul real × (AAPL la 350: 14,91 față de 9,40); în zonă; sub stop; fără preț = neverificat', () => {
  const P = load('lib/pret-viu.js').TTPretViu, now = Date.now();
  const sus = P.evalueaza(AAPL, {pret: 350, la: now}, now);
  assert.equal(sus.stare, 'peste'); assert.equal(sus.raport.toFixed(2), '1.59'); assert.match(sus.text, /×1,59/);
  assert.equal(P.evalueaza(AAPL, {pret: 343, la: now}, now).stare, 'in-zona');
  assert.equal(P.evalueaza(AAPL, {pret: 330, la: now}, now).stare, 'sub-stop');
  assert.equal(P.evalueaza(AAPL, {pret: 340, la: now}, now).stare, 'sub');
  assert.equal(P.evalueaza(AAPL, null, now).stare, 'neverificat');
  assert.match(P.evalueaza(AAPL, {pret: 343, la: now - 3600000}, now).text, /piața e probabil închisă/);
});

test('dimensionarea: costul de schimb (0,3 % dus-întors) intră în riscul pe acțiune; planul ține costul și eticheta probei', () => {
  const T = load('lib/trade-plans.js').TradePlans;
  const x = {currency: 'USD', entryLow: 100, entryHigh: 100, stop: 97, target: 106, capital: 10000, riskPct: 1};
  const fara = T.size(x), cu = T.size({...x, costPct: 0.3});
  assert.equal(fara.shares, 33); assert.equal(cu.unitRisk, 3.3); assert.equal(cu.shares, 30, 'cu costul, mai puține acțiuni pentru același risc');
  const cand = {...x, symbol: 'X', mode: 'momentum', actionable: true, ts: Date.now(), score: 80, sourceDate: '2026-10-16'};
  const p = T.create(cand, 10000, 1, {costPct: 0.3, proba: 'în probă · 0/8'});
  assert.equal(p.costPct, 0.3); assert.equal(p.proba, 'în probă · 0/8');
});

test('Planuri: costul de schimb când contul nu e în moneda acțiunii; eticheta probei mereu în tichet; prețul de acum verificat', () => {
  const h = readFileSync(new URL('../desk/index.html', import.meta.url), 'utf8');
  assert.match(h, /costPct:g\.broker&&g\.broker\.currency&&g\.broker\.currency!==x\.currency\?0\.3:0/);
  // 27.10.2026 (I-742): eticheta probei se salvează și pentru Early Reversal („în probă · nejudecat”), iar nota din tichet o arată la amândouă
  assert.match(h, /proba:\(x\.mode==='momentum'\|\|x\.mode==='reversal'\)&&window\.TTProbaTopLong\?TTProbaTopLong\.tag\(x\):''/);
  assert.match(h, /function ticketNote\(x,riskPct,s\)\{var out='',rev=x&&x\.mode==='reversal',tag=x&&\(x\.mode==='momentum'\|\|rev\)\?/);
  assert.match(h, /lib\/pret-viu\.js\?v=/); assert.match(h, /TTPretViu\.verifica\(/);
});

test('scannerul: data sesiunii la vedere, Europa fără buton de plan în USD, verdictul pieței anunțat, reper lipsă anunțat', () => {
  const e = readFileSync(new URL('../candidate-engine/engine.js', import.meta.url), 'utf8');
  assert.match(e, /\$\('dFresh'\)\.textContent = 'EOD ' \+ \(x\.sourceDate \|\| '—'\)/);
  assert.match(e, /x\.currency !== 'USD'/);
  assert.match(e, /function notaVerdictPiata\(/);
  assert.match(e, /Reperul SUA \(SPY\/IVV\) nu s-a putut citi/);
  const h = readFileSync(new URL('../candidate-engine/index.html', import.meta.url), 'utf8');
  assert.match(h, /id="verdictNota"/);
});

test('funcțiile înghețate de proba Top Long au rămas neatinse (amprenta pm-cb956aef5680)', async () => {
  const {versiune} = await import('../lib/premarket-proba.mjs');
  const {motor} = await import('./premarket-jurnal.mjs');
  assert.equal(versiune(motor().hooks), 'pm-cb956aef5680');
});

test('I-714: sub nivelurile planului, cifrele măsurate ale regulii (limită de risc, nu promisiune)', () => {
  const e = readFileSync(new URL('../candidate-engine/engine.js', import.meta.url), 'utf8'), h = readFileSync(new URL('../candidate-engine/index.html', import.meta.url), 'utf8');
  assert.match(e, /var PLAN_MASURAT = 'Regula 1,25 ATR \/ 2R, măsurată pe 4 ani/); assert.match(e, /\$\('planNota'\)\.textContent = PLAN_MASURAT/);
  assert.match(h, /id="planNota"/);
});

test('I-714 în tichet: candidații scannerului primesc cifrele măsurate ale regulii', () => {
  const h = readFileSync(new URL('../desk/index.html', import.meta.url), 'utf8');
  assert.match(h, /x\.mode==='momentum'\|\|x\.mode==='reversal'\)\)out\+=' · Regula 1,25 ATR \/ 2R, măsurată pe 4 ani/);
});
