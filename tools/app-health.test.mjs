import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const script=[...readFileSync('app/status/index.html','utf8').matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1];
async function setup(scan,portfolio={},cloud=null,options={}){
 const storage=new Map([['ce_results_v2',JSON.stringify(scan)],['tt_trading212_portfolio_v1',JSON.stringify(portfolio)]]),ids=new Map(),element=id=>{if(!ids.has(id))ids.set(id,{});return ids.get(id);};
 const events={};
 const c={Date,URL,AbortController,setTimeout,clearTimeout,navigator:{},addEventListener:(n,fn)=>events[n]=fn,location:{origin:'https://example.test'},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{getElementById:element},TTBreadth:{load:async()=>{throw Error('unavailable');}},fetch:async()=>({ok:true,json:async()=>({enabled:false,autoActivate:true})}),...options};
 c.window=c;c.parent=cloud?{TTCloud:{state:()=>cloud}}:{};c.TTDecisionPanel={set:x=>element('verdict').report=x};
 vm.createContext(c);vm.runInContext(readFileSync('lib/trading212-snapshot.js','utf8'),c);
 if(options.T212Snapshot)c.T212Snapshot=options.T212Snapshot;
 vm.runInContext(script,c);for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));
 element.message=(state,{source=c.parent,origin=c.location.origin}={})=>events.message({source,origin,data:{ttCloudState:state}});element.storage=storage;return element;
}
test('Health cannot label future or string-valued scan timestamps as recent',async()=>{
 for(const updatedAt of [Date.now()+3600000,String(Date.now()),NaN]){const el=await setup({updatedAt});assert.equal(el('scan').textContent,'DATĂ INVALIDĂ');assert.match(el('scanText').textContent,/nu este considerată recentă/);}
 const el=await setup({updatedAt:Date.now()});assert.equal(el('scan').textContent,'0 MIN');
});

test('incompatible broker data is never supporting evidence',async()=>{
 const el=await setup(null,{},null,{T212Snapshot:{read(){throw Error('broken');}}});
 assert.equal(el('broker').textContent,'DATE INCOMPATIBILE');
 assert.equal(el('verdict').report.context.evidence.find(e=>e.id==='broker').role,'unknown');
});

test('module failures name the failed page and never count as supporting evidence',async()=>{
 const el=await setup(null,{},null,{fetch:async(path)=>({ok:!path.includes('holdings'),status:path.includes('holdings')?503:200,json:async()=>({enabled:false})})});
 assert.equal(el('modules').textContent,'9 / 10 ACCESIBILE'); /* 11.10.2026: Market Breadth scoasă din listă (mutată în Crypto Radar) */
 assert.match(el('moduleText').textContent,/Analiza deținerilor/);
 assert.match(el('moduleChecks').textContent,/Analiza deținerilor.*503/);
 assert.equal(el('verdict').report.context.evidence.find(e=>e.id==='modules').role,'unknown');
});

test('a stalled breadth source cannot hold the broker and module checks or disable retries forever',async()=>{
 const timers=new Set();const el=await setup(null,{},null,{
  TTBreadth:{load:()=>new Promise(()=>{})},
  setTimeout(fn){timers.add(fn);return fn;},clearTimeout(fn){timers.delete(fn);}
 });
 assert.equal(el('modules').textContent,'10 / 10 ACCESIBILE');
 assert.equal(el('broker').textContent,'FĂRĂ SNAPSHOT');
 for(const fn of timers)fn();for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));
 assert.equal(el('run').disabled,false);
 assert.equal(el('breadth').textContent,'NEVERIFICAT');
 assert.match(el('breadthText').textContent,/timp/);
});

test('the scan expires at thirty actual minutes rather than thirty rounded minutes',async()=>{
 const el=await setup({updatedAt:Date.now()-30*60000-1000});
 assert.equal(el('scan').textContent,'STALE');
});

test('malformed stored broker data is reported without overwriting the original',async()=>{
 const el=await setup(null);el.storage.set('tt_trading212_portfolio_v1','{broken');
 await el('run').onclick();
 assert.equal(el('broker').textContent,'DATE INCOMPATIBILE');
 assert.equal(el.storage.get('tt_trading212_portfolio_v1'),'{broken');
});
test('Health reports a recent partial broker snapshot as partial using the shared active account',async()=>{
 const el=await setup(null,{archive:{environment:'live',fetchedAt:new Date().toISOString(),summary:{},positions:[]},current:{environment:'live',active:true,fetchedAt:new Date().toISOString(),summary:{currency:'EUR'},positions:null}});
 assert.equal(el('broker').textContent,'SNAPSHOT PARȚIAL');assert.match(el('brokerText').textContent,/PARȚIAL/);
});

test('cloud conflicts are warnings and never supporting evidence of a healthy reconciliation',async()=>{
 const el=await setup(null,{}, {ready:true,connected:true,lastSync:Date.now(),conflicts:['tt_journal_v1'],error:''});
 assert.equal(el('cloud').textContent,'CONFLICTE');assert.equal(el('cloud').className,'value warn');
 assert.equal(el('verdict').report.context.caution,true);
 assert.equal(el('verdict').report.context.evidence.find(e=>e.id==='cloud').role,'unknown');
});

test('health follows delayed cloud readiness and session changes instead of freezing the initial state',async()=>{
 const el=await setup(null);assert.equal(el('cloud').textContent,'VERIFIC SERVICIUL');
 el.message({ready:true,connected:false});assert.equal(el('cloud').textContent,'NECONECTAT');
 el.message({ready:true,connected:true,lastSync:Date.now(),conflicts:[]});assert.equal(el('cloud').textContent,'CONECTAT');assert.equal(el('cloud').className,'value');
 el.message({ready:true,connected:false});assert.equal(el('cloud').textContent,'NECONECTAT');assert.equal(el('verdict').report.context.evidence.find(e=>e.id==='cloud').role,'unknown');
 el.message({ready:true,connected:true},{origin:'https://foreign.test'});assert.equal(el('cloud').textContent,'NECONECTAT');
 el.message({ready:true,connected:true},{source:{}});assert.equal(el('cloud').textContent,'NECONECTAT');
});

// 18.10.2026 (revizia „Starea datelor”): roboții zilnici (verdictul pieței, clasificatorul, Trend 12 luni, probele V1 și Top Long,
// calendarul Europa) alimentează aplicația; dacă unul se oprește, pagina trebuie s-o spună, nu să tacă.
test('daily robots: each data file is listed with its date; one more than a trading day behind is flagged VECHI and named', async () => {
  const azi = new Date(), ieri = new Date(azi), vechi = new Date(azi);
  const zile = (d, n) => { let k = 0; while (k < n) { d.setUTCDate(d.getUTCDate() - 1); if (d.getUTCDay() % 6) k++; } return d.toISOString().slice(0, 10); };
  const f1 = zile(ieri, 1), f2 = zile(vechi, 4);
  const date = { 'verdict-piata.json': { asOf: f1, generat: f1 + 'T13:00:00Z' }, 'clasificator.json': { asOf: f2 }, 'trend-12-1.json': { dataUltimei: f1 }, 'v1-proba.json': { ultimaZi: f1 }, 'premarket-proba.json': { ultimaZi: f1 }, 'calendar.json': { generatedAt: f1 + 'T11:00:00Z' } };
  const el = await setup(null, {}, null, { fetch: async (path) => { const k = Object.keys(date).find((x) => String(path).includes(x)); return { ok: true, status: 200, json: async () => (k ? date[k] : { enabled: false }) }; } });
  assert.equal(el('robots').textContent, '1 VECHI'); assert.match(el('robotsText').textContent, /Clasificator/);
  assert.match(el('robotChecks').textContent, /Verdictul pieței — EOD/); assert.equal(el('verdict').report.context.evidence.find((e) => e.id === 'robots').role, 'unknown');
  const ok = await setup(null, {}, null, { fetch: async (path) => ({ ok: true, status: 200, json: async () => { const k = Object.keys(date).find((x) => String(path).includes(x)); return k === 'clasificator.json' ? { asOf: f1 } : k ? date[k] : { enabled: false }; } }) });
  assert.equal(ok('robots').textContent, '6 / 6 LA ZI');
});
