import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function setup(entries){
 const store={tt_desk_classifier_v1:JSON.stringify(entries)},c={localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=v;}},DailySeries:{expected:()=>'2026-10-15'}};c.window=c;vm.createContext(c);
 for(const name of ['holdings-neural','holdings-neural-evaluation','holdings-classifier','desk-classifier'])vm.runInContext(readFileSync('lib/'+name+'.js','utf8'),c);return c.TTDeskClassifier;
}
const algo=(p,k=2)=>({support:k===2?[.1,.2,.7]:[.4,.35,.25],classIndex:k,loss:1,balanced:.4,wins:3,holmPass:true,p});
const entry=(symbol,p,state='research')=>({version:'holdings-clf-v4',symbol,asOf:'2026-10-15',timezone:'America/New_York',closeMinutes:960,close:100,trainedAt:1,state,message:'m',maxZ:1,money:{long:{n:3,mean:.5,median:.4,win:.66},short:{n:0,mean:null,median:null,win:null},always:{n:40,mean:.1,median:.05,win:.5}},refs:{constant:{loss:1.05,balanced:.33},momentum:{loss:1.2,balanced:.4}},algos:{boost:algo(p),forest:algo(p),svm:algo(p),vote:algo(p)}});

test('I-639: pe o listă de 10, un p de 0,03 nu mai trece (prag 2/10 × 10% = 0,02); un p de 0,001 trece (Benjamini-Hochberg, 10%)',()=>{
 const xs={};['A','B','C','D','E','F','G','H','I','J'].forEach((s,i)=>xs[s]=entry(s,i===0?.001:i===1?.03:.6));const D=setup(xs);
 D.setList(Object.keys(xs));
 assert.deepEqual(JSON.parse(JSON.stringify(D.listCheck('A'))),{m:10,tries:40,pass:true});
 assert.equal(D.listCheck('B').pass,false);
 assert.match(D.chip('A'),/clf-chip long"/);assert.match(D.chip('B'),/muted/);assert.match(D.chip('B'),/nu trece corecția pe listă \(40 de încercări\)/);
 assert.match(D.panel('B'),/10 candidați × 4 modele = 40 de încercări · votul nu trece/);
});
test('I-639: un singur candidat ⇒ corecția nu mai strică nimic; I-642 apare în panou',()=>{
 const D=setup({A:entry('A',.02)});D.setList(['A']);assert.equal(D.listCheck('A').pass,true);assert.match(D.chip('A'),/clf-chip long"/);
 assert.match(D.panel('A'),/În bani, după vot:<\/b> zile Long — 3 zile · medie \+0,5% · mediana \+0,4% · pe plus 66%/);
});
test('intrare stricată sau fără direcție: semn neutru, lista nu cade',()=>{
 const bad=entry('A',.001);bad.algos.vote.support=null;const D=setup({A:bad,B:entry('B',.5,'no-edge')});D.setList(['A','B']);
 assert.equal(D.chip('A'),'');assert.match(D.chip('B'),/>—</);
});
test('I-653: picatele robotului nu se mai calculează pe telefon și spun din ce zi revin', () => {
  const store = {}, c = { localStorage: { getItem: () => null, setItem: () => {} }, DailySeries: { expected: () => '2026-10-15' } }; c.window = c; vm.createContext(c);
  for (const name of ['holdings-bars', 'holdings-neural', 'holdings-neural-evaluation', 'holdings-classifier', 'desk-classifier']) vm.runInContext(readFileSync('lib/' + name + '.js', 'utf8'), c);
  const D = c.TTDeskClassifier, A = entry('A', .5, 'no-edge');
  D.acceptRobot({ version: 'clasificator-robot-v1', motor: c.HoldingsClassifier.VERSION, generat: 'x', entries: { A }, picate: [{ simbol: 'COIN', motiv: 'Ultimul salt peste 25% (2024-11-06, +31,1%) lasă doar 486 sesiuni după el; modelele cer 510.' }, { simbol: 'X', motiv: 'Yahoo 404' }] });
  assert.match(D.chip('COIN'), /⏳ \d\d\.\d\d/); assert.match(D.chip('X'), />!</); assert.equal(D.status('COIN').phase, 'error');
  assert.match(D.panel('COIN'), /Revine estimat din <b>\d{4}-\d\d-\d\d<\/b> \(încă 24 sesiuni\)/);
});
test('★ doar pentru candidații din primele 10 pe ambele clasamente ale robotului', () => {
  const c = { localStorage: { getItem: () => null, setItem: () => {} }, DailySeries: { expected: () => '2026-10-15' } }; c.window = c; vm.createContext(c);
  for (const name of ['holdings-bars', 'holdings-neural', 'holdings-neural-evaluation', 'holdings-classifier', 'desk-classifier']) vm.runInContext(readFileSync('lib/' + name + '.js', 'utf8'), c);
  const D = c.TTDeskClassifier, A = entry('A', .5, 'no-edge'), B = entry('B', .5, 'no-edge');
  D.acceptRobot({ version: 'clasificator-robot-v1', motor: c.HoldingsClassifier.VERSION, generat: 'x', entries: { A, B }, clasament: [{ loc: 1, s: 'A', long: .5 }, { loc: 11, s: 'B', long: .4 }], clasament20: [{ loc: 2, s: 'A', long: .5 }, { loc: 1, s: 'B', long: .6 }] });
  assert.match(D.chip('A'), /—\s★/); assert.doesNotMatch(D.chip('B'), /★/); assert.match(D.panel('A'), /locul 1 din 2 pe 5 sesiuni.*locul 2 din 2 pe 20 de sesiuni.*★ în primele 10 pe ambele ținte/);
});
