import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function setup({available=6,capture=()=>({ok:true,saved:true}),phase='done'}={}){
 const ids=['neural','boosting','hmm','isolation','quantile','garch'],source={symbol:'TEST',currency:'USD',asOf:'2026-10-02',close:100,kind:'synthetic'},p={ticker:'TEST_US_EQ'},elements=new Map(),calls=[],exports=[];let config;
 const report={available,total:6,state:available===6?'weak':'incomplete',title:'Verdict calculat',reasons:['Dovezi insuficiente.'],limits:'Limite',cards:ids.map(id=>({id,name:id,available:id!=='garch'||available===6,state:'limited',value:'Rezultat',detail:'Explicație',trainedAt:Date.now()}))};
 const dialog={focus(){},close(){},remove(){},showModal(){},setAttribute(){},querySelector(q){if(!elements.has(q))elements.set(q,{dataset:{},textContent:'',innerHTML:''});return elements.get(q);}};
 const sandbox={
  document:{createElement:()=>dialog,body:{append(){}},addEventListener(){},querySelectorAll:()=>[],activeElement:null},
  HoldingsVerdict:{IDS:ids,NAMES:{},build:()=>report,accepted:()=>false},
  HoldingsModelRunner:{create(c){config=c;return {stop(){},start(){c.update({phase:'running',source,statuses:{}});c.update({phase,source,statuses:{}});}};}},
  HoldingsForecastUI:{captureVerdict(...args){calls.push(args);return capture(...args);}}
 };
 for(const name of ['Neural','HMM','Isolation','Quantile','Garch'])sandbox['Holdings'+name+'UI']={inspect:()=>({record:{symbol:'TEST',currency:'USD',asOf:'2026-10-02',trainedAt:Date.now(),result:{version:'test-result'},scope:'PRIVATE',quantity:999,apiKey:'SECRET'}}),exportReport:r=>exports.push(r),busy:()=>false,cancelManaged(){},run(){}};
 vm.createContext(sandbox);vm.runInContext(readFileSync('holdings/verdict.js','utf8'),sandbox);const ui=sandbox.HoldingsVerdictUI;
 ui.setContext({scope:'demo',demo:true,positions:[p],symbol:()=>source.symbol,model:()=>({asOf:source.asOf,currency:source.currency,price:source.close}),loadVerdict:async()=>source,refresh(){}});ui.open(p.ticker);
 return {ui,calls,report,source,p,elements,exports,sandbox,update:r=>config.update(r),load:(...args)=>config.load(...args)};
}
test('completed six-model verdict is captured once despite repaint, and retry captures again',()=>{const s=setup();assert.equal(s.calls.length,1);assert.equal(s.calls[0][0],s.p);assert.equal(s.calls[0][1],s.report);assert.equal(s.calls[0][2],s.source);s.ui.refresh();assert.equal(s.calls.length,1);assert.match(s.elements.get('[data-verdict-status]').textContent,/Verdictul final a fost păstrat/);s.elements.get('[data-verdict-retry]').onclick();assert.equal(s.calls.length,2);});
test('unfinished and incomplete runs never store a final conclusion',()=>{for(const options of [{available:5},{phase:'running'},{phase:'stopped'}]){const s=setup(options);assert.equal(s.calls.length,0);assert.doesNotMatch(s.elements.get('[data-verdict-status]').textContent,/a fost păstrat/);}});
test('duplicate capture preserves the original conclusion and says so',()=>{const s=setup({capture:()=>({ok:true,duplicate:true})});assert.match(s.elements.get('[data-verdict-status]').textContent,/primei analize/);assert.doesNotMatch(s.elements.get('[data-verdict-status]').textContent,/a fost păstrat în/);});
test('storage errors leave the completed verdict visible without claiming persistence',()=>{for(const capture of [()=>({ok:false,error:'Registrul este plin.'}),()=>{throw Error('SECRET internal storage error');}]){const s=setup({capture});assert.match(s.elements.get('[data-verdict-final]').innerHTML,/Verdict calculat/);assert.match(s.elements.get('[data-verdict-status]').textContent,/nu a fost salvat/);assert.doesNotMatch(s.elements.get('[data-verdict-status]').textContent,/SECRET|a fost păstrat în/);s.ui.refresh();assert.equal(s.calls.length,1);}});

test('one download includes the verified model reports and verdict while projecting out broker fields',()=>{
 const s=setup();s.sandbox.HoldingsVerdict.accepted=()=>true;s.elements.get('[data-verdict-export]').onclick();assert.equal(s.exports.length,1);const bundle=s.exports[0];assert.equal(bundle.result.version,'holdings-ai-reports-v1');assert.equal(bundle.result.verdict.available,6);assert.equal(Object.keys(bundle.result.models).length,5);assert.ok(!/PRIVATE|SECRET|apiKey|quantity|scope/.test(JSON.stringify(bundle)));
 s.sandbox.HoldingsVerdict.accepted=id=>id==='isolation';s.elements.get('[data-verdict-export]').onclick();assert.deepEqual(Object.keys(s.exports[1].result.models),['isolation']);
});
test('downloads are hidden or refuse output while running or without accepted results',()=>{
 for(const phase of ['loading','running']){const s=setup({phase});assert.equal(s.elements.get('[data-verdict-export]').hidden,true);s.elements.get('[data-verdict-export]').onclick();assert.equal(s.exports.length,0);}
 const s=setup();s.elements.get('[data-verdict-export]').onclick();assert.equal(s.exports.length,0);
});
test('common source loading waits for every report restore and cancels before fetch when the view changes',async()=>{
 for(const cancel of [false,true]){
  const s=setup();let release,fetches=0,active=true;s.sandbox.HoldingsNeuralUI.restore=()=>new Promise(r=>release=r);
  s.ui.setContext({scope:'demo',demo:true,positions:[s.p],symbol:()=>s.source.symbol,model:()=>({asOf:s.source.asOf,currency:s.source.currency,price:s.source.close}),loadVerdict:async()=>{fetches++;return s.source;},refresh(){}});
  const pending=s.load({ticker:s.p.ticker},()=>active);await Promise.resolve();assert.equal(fetches,0);if(cancel)active=false;release();
  if(cancel){await assert.rejects(pending,/anulată/);assert.equal(fetches,0);}else{assert.equal(await pending,s.source);assert.equal(fetches,1);}
 }
});
test('analysis cache refusal is visible independently of saving the final verdict',()=>{
 const s=setup();s.source.cacheWarning='Analiza EOD este disponibilă în această pagină; browserul nu a putut salva copia locală.';s.ui.refresh();assert.match(s.elements.get('[data-verdict-status]').textContent,/nu a putut salva copia locală/);assert.match(s.elements.get('[data-verdict-status]').textContent,/Verdictul final a fost păstrat/);
});
