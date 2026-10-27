import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const ctx={URLSearchParams,Date,Intl};vm.runInNewContext(readFileSync('lib/app-search.js','utf8'),ctx);const api=ctx.TTAppSearch;
const storage=record=>({getItem:key=>Object.hasOwn(record,key)?JSON.stringify(record[key]):null});
const modules=[{u:'today/',n:'Astăzi',group:'PRINCIPAL',i:'◫'},{u:'journal/#exec',n:'Jurnal',group:'PRINCIPAL',i:'▤'}];
test('search accepts Romanian text without requiring diacritics',()=>{assert.equal(api.search(storage({}),modules,'astazi')[0].u,'today/');});
test('only the active live account contributes holding hits',()=>{
 const data={tt_trading212_portfolio_v1:{archived:{environment:'live',fetchedAt:'2026-10-14T10:00:00Z',positions:[{ticker:'OLD_US_EQ',quantity:1}]},active:{active:true,environment:'live',fetchedAt:'2026-10-14T09:00:00Z',positions:[{ticker:'CAT_US_EQ',quantity:2,name:'Caterpillar'}]},demo:{active:true,environment:'demo',positions:[{ticker:'DEMO_US_EQ',quantity:1}]}}};
 const found=api.search(storage(data),modules,'cat');assert.equal(found.length,1);assert.equal(found[0].target.scope,'active');assert.equal(found[0].target.environment,'live');assert.equal(api.search(storage(data),modules,'OLD').length,0);assert.equal(api.search(storage(data),modules,'DEMO').length,0);
});
test('stored URLs and invalid ticker shapes cannot become result destinations',()=>{
 const bad={tt_independent_scanner_v1:{items:[{symbol:'https://evil.test',u:'https://evil.test'},{symbol:'AAPL',u:'https://evil.test',href:'javascript:alert(1)'}]},ce_results_v2:{momentum:[{symbol:'AAPL\" onclick=alert(1)'},{symbol:'AAPL',mode:'reversal',u:'https://evil.test'}]},tt_journal_v1:[{sym:'<script>alert(1)</script>'}]};
 const rows=api.search(storage(bad),modules,'AAPL');assert.equal(rows.length,2);for(const row of rows){assert.ok(['candidate-engine/','scanner-verdicts/'].includes(row.u));assert.match(row.query,/symbol=AAPL/);assert.doesNotMatch(row.query,/evil|onclick|javascript/);}
});
test('malformed registries fail independently without preventing module search',()=>{const s={getItem:()=>'{broken'};assert.equal(api.search(s,modules,'jurnal')[0].u,'journal/#exec');});
test('journal ticker hits describe both execution states and retain distinct sources',()=>{
 const s=storage({tt_journal_v1:[{sym:'AAPL',source:'manual',exit:null},{sym:'AAPL',source:'stl',exit:110,status:'closed'},{sym:'AAPL',source:'stl',exit:112,status:'closed'},{sym:'MSFT',source:'macro',exit:210,status:'closed'}]});
 const hits=api.search(s,modules,'AAPL'),row=hits.find(r=>r.group==='Jurnal');assert.equal(hits.length,1);assert.equal(row.u,'journal/#exec');assert.equal(row.query,'symbol=AAPL');
 assert.match(row.detail,/În curs: 1/);assert.match(row.detail,/Închise: 2/);assert.match(row.detail,/Surse: stl, manual/);
 const closed=api.search(s,modules,'MSFT')[0];assert.match(closed.detail,/În curs: 0 · Închise: 1/);assert.match(closed.detail,/macro/);
});
test('journal search discloses when counts cover only the most recent 5,000 executions',()=>{
 const journal=Array.from({length:5001},()=>({sym:'AAPL',source:'manual',exit:110,status:'closed'}));
 const row=api.search(storage({tt_journal_v1:journal}),modules,'AAPL')[0];assert.match(row.detail,/În ultimele 5\.000 execuții/);assert.match(row.detail,/Închise: 5000/);
});
test('sync never infers a current successful reconciliation from authentication alone',()=>{
 assert.equal(api.cloudStatus({connected:true,ready:true}).kind,'pending');assert.equal(api.cloudStatus({connected:true,ready:true,conflicts:['a'],lastSync:Date.now()}).kind,'conflict');assert.equal(api.cloudStatus({connected:true,ready:true,error:'failed',lastSync:Date.now()}).kind,'error');assert.equal(api.cloudStatus({connected:true,ready:true,lastSync:Date.now()},false).kind,'offline');assert.equal(api.cloudStatus({connected:true,ready:true,lastSync:Date.now(),pending:true}).kind,'pending');assert.match(api.cloudStatus({connected:true,ready:true,lastSync:Date.now()}).label,/^Sincronizat la /);
});
// 27.10.2026 (lotul A, audit [3] + I-748): fără rețea starea e „offline”, nu „eroare” — chiar dacă pornirea a lăsat o eroare de rețea în urmă; rețeaua slabă se vede
test('offline sau fără răspuns de la rețea ⇒ „date locale”, nu „Eroare de sincronizare”; rețeaua slabă se recunoaște',()=>{
 assert.equal(api.cloudStatus({connected:true,ready:true,error:'network_error'},false).kind,'offline','offline înaintea erorii');
 const fara=api.cloudStatus({connected:false,ready:false,error:'network_error'},true);assert.equal(fara.kind,'offline');assert.match(fara.label,/date locale/);
 assert.equal(api.cloudStatus({connected:true,ready:true,error:'cloud_unavailable'},true).kind,'error','alte erori rămân erori');
 assert.match(api.cloudStatus({connected:true,ready:true,error:'network_error'},true,true).label,/Rețea slabă/);
 assert.equal(api.reteaSlaba({connection:{saveData:true}}),true);assert.equal(api.reteaSlaba({connection:{effectiveType:'2g'}}),true);assert.equal(api.reteaSlaba({connection:{effectiveType:'slow-2g'}}),true);assert.equal(api.reteaSlaba({connection:{effectiveType:'3g'}}),true);
 assert.equal(api.reteaSlaba({connection:{effectiveType:'4g',saveData:false}}),false);assert.equal(api.reteaSlaba({}),false);assert.equal(api.reteaSlaba(undefined),false);
});
