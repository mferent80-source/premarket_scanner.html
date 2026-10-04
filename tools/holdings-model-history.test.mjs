import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const core={};vm.createContext(core);
for(const path of ['lib/holdings-model-summary.js','lib/holdings-model-history.js'])vm.runInContext(readFileSync(path,'utf8'),core);
const H=core.HoldingsModelHistory,now=Date.parse('2026-10-04T13:00:00Z');
const identity={scope:'account-a',symbol:'TEST',currency:'USD',kind:'market'};
function fixture(t=now,demo=false){
 const expected={symbol:'TEST',currency:'USD',asOf:'2026-10-02',demo},record=result=>({...expected,kind:demo?'synthetic':'market',trainedAt:t-1000,result});
 return core.HoldingsModelSummary.build({expected,now:t,neural:{usable:true,record:record({version:'holdings-mlp-v3',classIndex:2,comparison:{status:'evaluated',boosting:{version:'holdings-gbt-v1',classIndex:2}}}),assessment:{state:'research',message:'Neural validat.'},comparison:{state:'research',message:'Acord experimental.'}},hmm:{usable:true,record:record({version:'holdings-hmm-v1',current:{state:0},profiles:[{label:'Ascendent'}]}),assessment:{state:'descriptive',message:'Regim descriptiv.'}},isolation:{usable:true,record:record({version:'holdings-isolation-v1',current:{score:.4,votes:0},threshold:.6}),assessment:{state:'ordinary',message:'Nu confirmă siguranța.'}}});
}
function setup(){const writes=new Map();return {writes,store:H.createStore({getItem:k=>writes.get(k)||null,setItem:(k,v)=>writes.set(k,v)})};}
const clone=x=>JSON.parse(JSON.stringify(x));
test('history persists only compact projected summaries, not account fields or model parameters',()=>{
 const {writes,store}=setup(),s=fixture();Object.assign(s,{accountId:'PRIVATE',quantity:123,apiKey:'SECRET',network:{weights:[99]}});Object.assign(s.cards[0],{accountId:'PRIVATE',quantity:123});
 const r=store.save(s,identity,now);assert.equal(r.status,'saved');const raw=writes.get(H.key(identity));assert.ok(!/PRIVATE|SECRET|accountId|quantity|apiKey|network|weights/.test(raw));assert.ok(raw.length<6000);
 assert.equal(store.read(identity,now).entries[0].summary.cards[0].value,'Avans');
});
test('repeated render timestamps do not create duplicate snapshots',()=>{
 const {store}=setup();store.save(fixture(),identity,now);const s=fixture();s.generatedAt=now+1000;
 const r=store.save(s,identity,now+1000);assert.equal(r.status,'duplicate');assert.equal(r.entries.length,1);assert.equal(r.entries[0].savedAt,now);
});
test('a reanalysis on the same EOD is retained but is not an independent market observation',()=>{
 const {store}=setup(),a=fixture();store.save(a,identity,now);const b=fixture(now+1000);assert.equal(store.save(b,identity,now+1000).status,'saved');
 const c=H.compare(a,b,identity,now+1000);assert.equal(c.status,'compared');assert.equal(c.sameSession,true);assert.equal(c.changed,0);assert.ok(c.rows.every(r=>r.retrained));assert.match(c.limits,/Reantrenarea nu este dovadă independentă/);
});
test('different EOD dates are marked explicitly',()=>{
 const a=fixture(),b=fixture(now+86400000);b.asOf='2026-10-05';const c=H.compare(a,b,identity,now+86400000);assert.equal(c.status,'compared');assert.equal(c.sameSession,false);assert.equal(c.from,'2026-10-02');assert.equal(c.to,'2026-10-05');
});
test('account, ticker, currency and demo kind have separate storage keys',()=>{
 const {store}=setup();store.save(fixture(),identity,now);
 for(const e of [{...identity,scope:'account-b'},{...identity,symbol:'OTHER'},{...identity,currency:'EUR'},{...identity,kind:'synthetic'}])assert.equal(store.read(e,now).entries.length,0);
 assert.notEqual(H.key({...identity,scope:'a|b',symbol:'c'}),H.key({...identity,scope:'a',symbol:'b|c'}));
});
test('cross-instrument, currency or demo comparisons are rejected',()=>{
 for(const change of [{symbol:'OTHER'},{currency:'EUR'},{kind:'synthetic'}]){const b=fixture();Object.assign(b,change);assert.equal(H.compare(fixture(),b,identity,now).status,'incompatible');}
});
test('busy, empty, future, expired or malformed summaries cannot be archived',()=>{
 const mutations=[s=>s.busy=true,s=>s.generatedAt=now+1,s=>s.generatedAt=now-1800001,s=>s.asOf='2026-02-30',s=>s.asOf='2026-10-05',s=>s.cards[0].trainedAt=now+1,s=>s.cards[3].score=NaN,s=>s.cards[3].threshold=0,s=>s.cards[0].state='buy',s=>s.cards[1].version='unknown',s=>s.available=0,s=>s.kind='synthetic'];
 for(const mutate of mutations){const {store,writes}=setup(),s=clone(fixture());mutate(s);assert.equal(store.save(s,identity,now).status,'blocked');assert.equal(writes.size,0);}
});
test('incomplete summaries can be retained and loss of availability is explicit',()=>{
 const a=fixture(),b=clone(fixture(now+1000));Object.assign(b.cards[0],{available:false,state:'unavailable',trainedAt:null,version:null,value:'Expirat / incompatibil'});b.available=3;b.state='incomplete';
 const {store}=setup();assert.equal(store.save(b,identity,now+1000).status,'saved');const c=H.compare(a,b,identity,now+1000);assert.equal(c.changed,1);assert.equal(c.rows[0].availability,true);assert.equal(c.afterAvailable,3);
});
test('historical snapshots stay historical after models expire; current comparison must be fresh',()=>{
 const {store}=setup(),a=fixture();store.save(a,identity,now);assert.equal(store.read(identity,now+86400000).entries.length,1);
 assert.equal(H.compare(a,a,identity,now+86400000).status,'incompatible');
});
test('older EOD or earlier analyses cannot be treated as newer changes',()=>{
 const a=fixture(),b=fixture(now+1000);b.asOf='2026-10-01';assert.equal(H.compare(a,b,identity,now+1000).status,'older');
 assert.equal(H.compare(fixture(now+1000),a,identity,now+1000).status,'older');
});
test('direction, regime and anomaly state changes are reported individually',()=>{
 const a=fixture(),b=clone(fixture(now+1000));b.cards[0].value='Declin';b.cards[2].value='Deteriorare';b.cards[3].state='anomaly';b.cards[3].value='Anomalie de revizuit';b.cards[3].score=.8;b.cards[3].votes=3;
 const c=H.compare(a,b,identity,now+1000);assert.equal(c.changed,3);assert.equal(c.rows[1].changed,false);
});
test('Isolation score and threshold changes do not become a risk trend',()=>{
 const a=fixture(),b=clone(fixture(now+1000));b.cards[3].score=.5;b.cards[3].threshold=.7;const c=H.compare(a,b,identity,now+1000);
 assert.equal(c.rows[3].changed,false);assert.equal('risk' in c,false);assert.equal('confidence' in c,false);assert.match(c.limits,/nu măsoară riscul/);
});
test('running analysis cannot show a completed change comparison',()=>{
 const b=fixture(now+1000);b.busy=true;b.state='running';assert.equal(H.compare(fixture(),b,identity,now+1000).status,'running');
});
test('history is bounded to 20 entries and IDs remain unique on same-millisecond saves',()=>{
 const {store}=setup();for(let i=0;i<30;i++){const s=fixture();s.cards[0].detail='Analiză '+i;assert.equal(store.save(s,identity,now).status,'saved');}
 const r=store.read(identity,now);assert.equal(r.status,'ok');assert.equal(r.entries.length,20);assert.equal(new Set(r.entries.map(x=>x.id)).size,20);assert.equal(r.entries[0].summary.cards[0].detail,'Analiză 29');
});
test('corrupted, future, duplicated or mismatched history is preserved rather than overwritten',()=>{
 const mutations=[()=>'{broken',d=>{d.version='other';return JSON.stringify(d);},d=>{d.entries[0].savedAt=now+100000;return JSON.stringify(d);},d=>{d.entries.push(d.entries[0]);return JSON.stringify(d);},d=>{d.entries[0].summary.symbol='OTHER';return JSON.stringify(d);},()=> 'x'.repeat(256001)];
 for(const mutate of mutations){const {store,writes}=setup();store.save(fixture(),identity,now);const k=H.key(identity),raw=mutate(JSON.parse(writes.get(k)));writes.set(k,raw);assert.equal(store.read(identity,now).status,'unavailable');assert.equal(store.save(fixture(now+1000),identity,now+1000).status,'unavailable');assert.equal(writes.get(k),raw);}
});
test('failed writes never report saved and keep the previous log',()=>{
 const {writes,store}=setup();store.save(fixture(),identity,now);const old=writes.get(H.key(identity));const failed=H.createStore({getItem:k=>writes.get(k),setItem:()=>{throw Error('QuotaExceeded');}});
 const r=failed.save(fixture(now+1000),identity,now+1000);assert.equal(r.status,'write-failed');assert.equal(r.entries.length,1);assert.equal(writes.get(H.key(identity)),old);
 const blocked=H.createStore({getItem:()=>{throw Error('SecurityError');},setItem:()=>{throw Error('SecurityError');}});assert.equal(blocked.save(fixture(),identity,now).status,'unavailable');
});
test('saved summaries are immutable copies and UI text is escaped',()=>{
 const {store}=setup(),s=fixture();store.save(s,identity,now);s.cards[0].value='MUTATED';assert.equal(store.read(identity,now).entries[0].summary.cards[0].value,'Avans');
 const sandbox={HoldingsModelHistory:H,localStorage:{getItem:()=>null,setItem(){}},document:{querySelectorAll:()=>[]}};vm.createContext(sandbox);vm.runInContext(readFileSync('holdings/model-history.js','utf8'),sandbox);
 sandbox.HoldingsModelHistoryUI.setContext({scope:'account-a',demo:false,positions:[{}],symbol:()=> 'TEST',model:()=>({currency:'USD'})});const html=sandbox.HoldingsModelHistoryUI.markup(fixture(),0);assert.match(html,/Păstrează sinteza/);assert.match(html,/Istoric și comparație/);
});
test('demo history stays in memory and saves the freshly rebuilt selected instrument',()=>{
 let calls=0,saves=0,refreshes=0;const button={dataset:{modelHistorySave:'0'}},sandbox={HoldingsModelHistory:H,localStorage:{getItem:()=>{calls++;return null;},setItem:()=>calls++},document:{querySelectorAll:q=>q==='[data-model-history-save]'?[button]:[]}};
 vm.createContext(sandbox);vm.runInContext(readFileSync('holdings/model-history.js','utf8'),sandbox);sandbox.HoldingsModelHistoryUI.setContext({scope:'demo',demo:true,positions:[{}],symbol:()=> 'TEST',model:()=>({currency:'USD'})});
 sandbox.HoldingsModelHistoryUI.bind(i=>{saves++;assert.equal(i,0);return fixture(Date.now(),true);},()=>refreshes++);button.onclick();assert.equal(calls,0);assert.equal(saves,1);assert.equal(refreshes,1);assert.match(sandbox.HoldingsModelHistoryUI.markup(fixture(Date.now(),true),0),/1 sinteze păstrate|Sinteză păstrată local/);
});
test('history UI escapes stored titles and values and retains real data across new instances',()=>{
 const {store,writes}=setup(),t=Date.now(),a=fixture(t);a.title='<script>danger</script>';a.cards[0].value='<img onerror=alert(1)>';store.save(a,identity,t);
 const sandbox={HoldingsModelHistory:H,localStorage:{getItem:k=>writes.get(k)||null,setItem:(k,v)=>writes.set(k,v)},document:{querySelectorAll:()=>[]}};vm.createContext(sandbox);vm.runInContext(readFileSync('holdings/model-history.js','utf8'),sandbox);
 sandbox.HoldingsModelHistoryUI.setContext({scope:'account-a',demo:false,positions:[{}],symbol:()=> 'TEST',model:()=>({currency:'USD'})});const html=sandbox.HoldingsModelHistoryUI.markup(fixture(Date.now()),0);
 assert.ok(html.includes('&lt;script&gt;danger&lt;/script&gt;'));assert.ok(html.includes('&lt;img onerror=alert(1)&gt;'));assert.ok(!html.includes('<script>danger'));
 sandbox.HoldingsModelHistoryUI.setContext({scope:'account-b',demo:false,positions:[{}],symbol:()=> 'TEST',model:()=>({currency:'USD'})});assert.match(sandbox.HoldingsModelHistoryUI.markup(fixture(Date.now()),0),/Nu ai sinteze păstrate/);
});
test('save controls do not reuse a previous account identity when context changes',()=>{
 const writes=new Map(),b={dataset:{modelHistorySave:'0'}},sandbox={HoldingsModelHistory:H,localStorage:{getItem:k=>writes.get(k)||null,setItem:(k,v)=>writes.set(k,v)},document:{querySelectorAll:q=>q==='[data-model-history-save]'?[b]:[]}};vm.createContext(sandbox);vm.runInContext(readFileSync('holdings/model-history.js','utf8'),sandbox);
 const ctx=scope=>({scope,demo:false,positions:[{}],symbol:()=> 'TEST',model:()=>({currency:'USD'})});sandbox.HoldingsModelHistoryUI.setContext(ctx('account-a'));sandbox.HoldingsModelHistoryUI.bind(()=>fixture(Date.now()),()=>{});sandbox.HoldingsModelHistoryUI.setContext(ctx('account-b'));b.onclick();assert.equal(writes.has(H.key(identity)),false);assert.equal(writes.has(H.key({...identity,scope:'account-b'})),true);
});
