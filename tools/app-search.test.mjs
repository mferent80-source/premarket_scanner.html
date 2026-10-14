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
test('sync never infers a current successful reconciliation from authentication alone',()=>{
 assert.equal(api.cloudStatus({connected:true,ready:true}).kind,'pending');assert.equal(api.cloudStatus({connected:true,ready:true,conflicts:['a'],lastSync:Date.now()}).kind,'conflict');assert.equal(api.cloudStatus({connected:true,ready:true,error:'failed',lastSync:Date.now()}).kind,'error');assert.equal(api.cloudStatus({connected:true,ready:true,lastSync:Date.now()},false).kind,'offline');assert.equal(api.cloudStatus({connected:true,ready:true,lastSync:Date.now(),pending:true}).kind,'pending');assert.match(api.cloudStatus({connected:true,ready:true,lastSync:Date.now()}).label,/^Sincronizat la /);
});
