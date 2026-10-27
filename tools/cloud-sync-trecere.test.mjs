// 19.10.2026 (I-706): trecerea de la 30 s nu mai recalculează toate cheile; copia locală doar pentru registrele scrise de om, cel mult una pe oră;
// la 409 o reîncercare imediată; configurația cerută cu termen; mărimea fiecărei chei în stare (p.3).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {KEYS,mergeRecord,validateValue,EvidenceCloud,ForecastCloud,LAST_WRITE_WINS,FillsCloud} from '../lib/cloud-sync-model.mjs';

const source=readFileSync(new URL('../app/cloud-sync.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/,'');
const {create:planStore}=createRequire(import.meta.url)('../lib/trade-plan-store.js');
const {create:fillsStore}=createRequire(import.meta.url)('../lib/trading212-fills-store.js');
const status={enabled:true,protocol:'tt-cloud-sync-v1',clientId:'test.apps.googleusercontent.com',checks:{database:true,google:true,encryption:true,schema:true},supportedKeys:KEYS,records:{protocol:'tt-cloud-records-v2',maxKeys:1}};
const plain=x=>JSON.parse(JSON.stringify(x)),settle=async()=>{for(let i=0;i<30;i++)await new Promise(r=>setImmediate(r));};
async function setup({local={},remote={},baseline={},onKey,configHangs=false,backups}={}){
 const storage=new Map(Object.entries(local)),privateStore=new Map([['session',{token:'token',subject:'123',email:'me@example.test'}],['baseline:123',baseline],['owner',null]]),calls=[],merged=[];
 if(backups)privateStore.set('backups:123',backups);
 const records=structuredClone(remote);let updated=100;
 const localStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 const window={addEventListener(){},dispatchEvent(){},T212Vault:{read:async()=>null,save:async()=>{},clear:async()=>{}},TTCloudStore:{get:async k=>structuredClone(privateStore.get(k)??null),put:async(k,v)=>{privateStore.set(k,structuredClone(v));},remove:async k=>{privateStore.delete(k);}},
  T212FillsStore:fillsStore(localStorage,{durable:null,notify:false}),TTPlanStore:{create:()=>planStore(localStorage,{durable:null,notify:false})}};
 const json=(data,http=200)=>({ok:http===200,status:http,json:async()=>data});
 const c={KEYS,LAST_WRITE_WINS,validateValue,EvidenceCloud,ForecastCloud,FillsCloud,mergeRecord:(key,...a)=>{merged.push(key);return mergeRecord(key,...a);},window,localStorage,
  document:{hidden:false,addEventListener(){},querySelectorAll:()=>[],getElementById:()=>null},navigator:{onLine:true},location:{origin:'https://mferent80-source.github.io',href:'https://mferent80-source.github.io/app/'},
  URL,URLSearchParams,Date,AbortController,CustomEvent:class{},StorageEvent:class{},clearTimeout,setInterval:()=>{},setTimeout:(f,ms)=>setTimeout(f,configHangs&&ms===10000?0:ms),
  fetch:async(url,opts={})=>{calls.push({url,method:opts.method||'GET',key:opts.body?JSON.parse(opts.body).key:null});
   if(url==='cloud-sync-config.json'){if(configHangs)return new Promise((_,reject)=>opts.signal.addEventListener('abort',()=>reject(Object.assign(Error('aborted'),{name:'AbortError'}))));return json({enabled:true,endpoint:'https://premarket-scanner-html.mferent80.workers.dev'});}
   if(url.endsWith('/status'))return json(status);if(url.endsWith('/session'))return json({subject:'123'});
   if(/\/records\?index=[123]$/.test(url))return json({protocol:'tt-cloud-records-v2',records:Object.fromEntries(Object.entries(records).map(([k,r])=>[k,{revision:r.revision,updated:r.updated}]))});
   if(url.includes('/records?key=')){const key=new URL(url).searchParams.get('key');const o=onKey?await onKey(records,key):undefined;if(o?.__http)return json({error:o.error},o.__http);return json({records:records[key]?{[key]:structuredClone(records[key])}:{}});}
   if(url.endsWith('/record')){const b=JSON.parse(opts.body);if((records[b.key]?.revision||0)!==b.revision)return json({error:'revision_conflict'},409);records[b.key]={revision:b.revision+1,value:b.value,updated:++updated};return json({revision:b.revision+1,updated});}
   throw Error(url);}};
 c.window.localStorage=localStorage;vm.createContext(c);vm.runInContext(readFileSync(new URL('../app/failure-info.js',import.meta.url),'utf8'),c);vm.runInContext(source,c);await settle();
 return {api:window.TTCloud,storage,privateStore,records,calls,merged,fills:window.T212FillsStore,reset(){calls.length=0;merged.length=0;}};
}
const fill=i=>({id:'f'+i,ticker:'AAPL_US_EQ',date:new Date(Date.UTC(2026,0,1)+i*60000).toISOString(),side:'BUY',quantity:1,price:100});
const fills=n=>({accounts:{'live:x':{environment:'live',fetchedAt:'2026-10-19T10:00:00Z',complete:true,items:Array.from({length:n},(_,i)=>fill(i))}}});

test('trecerea fără schimbări nu mai unește nicio cheie; o schimbare locală sau în cont reface doar cheia ei',async()=>{
 const s=await setup({local:{tt_journal_v1:'[{"id":"a"}]',wl_stocks:'["AAPL"]',tt_theme:'dark',tt_trading212_fills_v1:JSON.stringify(fills(30))}});
 assert.equal(s.api.state().error,'');assert.ok(s.merged.length>90,'prima trecere unește toate cheile active ('+s.merged.length+')');
 s.reset();await s.api.sync();assert.equal(s.api.state().error,'');
 assert.deepEqual(s.merged,['cloud_credentials'],'doar conexiunea T212 (se verifică mereu)');assert.ok(!s.calls.some(c=>c.method==='PUT'));
 s.reset();s.storage.set('wl_stocks','["AAPL","MSFT"]');await s.api.sync();
 assert.deepEqual(s.merged.filter(k=>k!=='cloud_credentials'),['wl_stocks']);assert.deepEqual(s.records.wl_stocks.value,['AAPL','MSFT']);
 s.reset();await s.api.sync();assert.deepEqual(s.merged,['cloud_credentials'],'după urcare, cheia e iar „neschimbată”');
 s.reset();s.records.tt_journal_v1={revision:s.records.tt_journal_v1.revision+1,updated:999,value:[{id:'a'},{id:'telefon'}]};await s.api.sync();
 assert.deepEqual(s.merged.filter(k=>k!=='cloud_credentials'),['tt_journal_v1']);assert.equal(JSON.parse(s.storage.get('tt_journal_v1')).length,2);
 s.reset();await s.api.sync();assert.deepEqual(s.merged.filter(k=>k!=='cloud_credentials'),['tt_journal_v1'],'aplicată local ⇒ se mai verifică o dată');
 s.reset();await s.api.sync();assert.deepEqual(s.merged,['cloud_credentials']);
 s.reset();await s.fills.mutate(d=>{d.accounts['live:x'].items.unshift(fill(99));return d;});await s.api.sync();
 const touched=s.merged.filter(k=>k!=='cloud_credentials');assert.ok(touched.every(k=>FillsCloud.isKey(k)||k==='tt_trading212_fills_v1'),touched.join());
 assert.deepEqual(s.calls.filter(c=>c.method==='PUT').map(c=>c.key),[FillsCloud.bucket('live:x','f99')]);
});

test('o cheie revenită la valoarea dinaintea unei aplicări din cont nu e sărită',async()=>{
 const s=await setup({remote:{wl_stocks:{revision:1,updated:5,value:['AAPL']}}});assert.equal(s.storage.get('wl_stocks'),'["AAPL"]');
 s.storage.delete('wl_stocks');await s.api.sync();assert.equal(s.records.wl_stocks.value,null,'ștergerea locală e văzută (nu sărită pe amprenta veche)');
});

test('copia locală: doar registrele scrise de om, înaintea FIECĂREI schimbări venite din cont (revizia 19.10); execuțiile și portofoliul de la broker nu o declanșează',async()=>{
 const s=await setup({remote:{tt_trading212_portfolio_v1:{revision:1,updated:5,value:{'live:x':{fetchedAt:'2026-10-19T10:00:00Z',positions:[]}}},tt_trading212_fills_v1:{revision:1,updated:5,value:fills(3)}}});
 assert.equal(s.api.state().error,'');assert.equal(s.privateStore.get('backups:123'),undefined,'datele brokerului nu fac copie');
 s.records.tt_journal_v1={revision:1,updated:6,value:[{id:'telefon'}]};s.storage.set('tt_holdings_theses_v1','{"AAPL":{"t":1}}');await s.api.sync();
 const list=s.privateStore.get('backups:123');assert.equal(list.length,1);assert.ok(!list[0].keys.includes('tt_journal_v1')&&list[0].keys.includes('tt_holdings_theses_v1'),'27.10: jurnalul nu exista local la prima copie ⇒ nu intră în lista cheilor (restaurarea nu-l mai șterge); tezele existau ⇒ intră');
 for(const k of ['tt_trading212_fills_v1','tt_trading212_portfolio_v1','tt_trading212_cash_v1'])assert.ok(!list[0].keys.includes(k)&&!(k in list[0].snapshot),k);
 s.records.tt_journal_v1={revision:2,updated:7,value:[{id:'telefon'},{id:'doi'}]};await s.api.sync();assert.equal(s.privateStore.get('backups:123').length,2,'revizia 19.10: și a doua schimbare din cont are copia ei (altfel restaurarea pierdea ce scrisese între timp)');
 // restaurarea unei copii noi nu atinge execuțiile
 const before=JSON.stringify((await s.fills.read()).data);await s.api.restore();assert.equal(JSON.stringify((await s.fills.read()).data),before);assert.deepEqual(JSON.parse(s.storage.get('tt_journal_v1')),[{id:'telefon'}],'jurnalul revine la starea dinaintea ultimei schimbări venite din cont');assert.equal(s.storage.get('tt_holdings_theses_v1'),'{"AAPL":{"t":1}}');
});

// 27.10.2026 (audit A 🔴): restaurarea NU mai șterge registrele care nu erau în copie (teze/stopuri scrise după copie, watchlist…) — ștergerea pleca în cont și pe celălalt aparat
test('o copie veche (fără lista cheilor) pune înapoi doar ce avea; registrele absente din copie rămân și sunt numite',async()=>{
 const s=await setup({backups:[{at:1,snapshot:{tt_journal_v1:[{id:'vechi'}]}}],local:{tt_journal_v1:'[{"id":"nou"}]',wl_stocks:'["X"]'}});
 await s.api.restore();assert.deepEqual(JSON.parse(s.storage.get('tt_journal_v1')),[{id:'vechi'}]);assert.equal(s.storage.get('wl_stocks'),'["X"]','watchlist-ul creat după copie rămâne');assert.match(s.api.state().error,/neatinse.*wl_stocks/);
});
test('copia nu înregistrează registrele absente la momentul ei, iar restaurarea nu le șterge pe cele scrise între timp',async()=>{
 const s=await setup({remote:{tt_journal_v1:{revision:1,updated:6,value:[{id:'telefon'}]}}});
 const list=s.privateStore.get('backups:123');assert.ok(list&&list.length,'copia s-a făcut la schimbarea venită din cont');assert.equal(list[0].keys.includes('tt_holdings_theses_v1'),false,'tezele nu existau ⇒ nu intră în lista cheilor');
 s.storage.set('tt_holdings_theses_v1','{"MU":{"stop":90}}');await s.api.restore();assert.equal(s.storage.get('tt_holdings_theses_v1'),'{"MU":{"stop":90}}','tezele scrise după copie rămân');
});

test('409 în timpul citirii: o reîncercare imediată; abia a doua cădere ajunge la eroare',async()=>{
 const s=await setup({remote:{wl_stocks:{revision:1,updated:1,value:['A']}},onKey:(records,key)=>{if(key==='wl_stocks')records.wl_stocks={revision:records.wl_stocks.revision+1,updated:records.wl_stocks.updated+1,value:['A']};}});
 assert.match(s.api.state().error,/modificate pe celălalt dispozitiv/);assert.equal(s.calls.filter(c=>/records\?index=/.test(c.url)).length,2,'exact două încercări');
});

test('configurația fără răspuns: verificarea se încheie cu eroare de termen, nu rămâne agățată',async()=>{
 const s=await setup({configHangs:true});for(let i=0;i<40&&(s.api.state().checking||!s.api.state().error);i++)await settle(); // 27.10: termenul (setTimeout 0) și abort-ul se așază după câteva ture de setImmediate — se așteaptă starea, nu un număr fix de ture (testul clipea)
 assert.equal(s.api.state().checking,false);assert.match(s.api.state().error,/nu a răspuns în 10 s/);assert.equal(s.api.state().failure.code,'timeout');assert.equal(s.calls.length,1);
});

test('p.3: starea arată mărimea în octeți a fiecărei chei din cont și limita de 1 MB',async()=>{
 const s=await setup({local:{tt_journal_v1:JSON.stringify([{id:'ă',text:'x'.repeat(1000)}]),tt_theme:'dark'}});const st=plain(s.api.state());
 assert.equal(st.recordLimit,1000000);assert.equal(st.sizes.tt_journal_v1,Buffer.byteLength(JSON.stringify([{id:'ă',text:'x'.repeat(1000)}])));assert.equal(st.sizes.tt_theme,Buffer.byteLength(JSON.stringify('dark')));
});

test('p.2: o cheie a cărei citire e respinsă (400) e sărită și raportată, nu tratată ca absentă; celelalte se sincronizează',async()=>{
 let refuse=true;const s=await setup({local:{tt_theme:'dark'},remote:{wl_stocks:{revision:3,updated:5,value:['AAPL']},tt_journal_v1:{revision:1,updated:5,value:[{id:'a'}]}},onKey:(_,key)=>key==='wl_stocks'&&refuse?{__http:400,error:'invalid_query'}:undefined});
 const st=plain(s.api.state());assert.deepEqual(st.skipped,[{key:'wl_stocks',code:'invalid_query'}]);assert.equal(st.error,'invalid_query');assert.equal(st.failure.key,'wl_stocks');assert.equal(st.lastSync,null);
 assert.ok(!s.calls.some(c=>c.method==='PUT'&&c.key==='wl_stocks'),'nicio scriere peste o cheie necitită');assert.equal(s.records.wl_stocks.revision,3);
 assert.deepEqual(JSON.parse(s.storage.get('tt_journal_v1')),[{id:'a'}]);assert.equal(s.records.tt_theme.value,'dark');
 refuse=false;await s.api.sync();assert.equal(s.api.state().error,'');assert.deepEqual(JSON.parse(s.storage.get('wl_stocks')),['AAPL']);
});
