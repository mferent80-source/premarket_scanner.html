// 27.10.2026 (lotul A — auditul carcasei + I-746/I-748/I-749): clientul de sincronizare (app/cloud-sync.js) încărcat într-un context vm, ca în
// tools/cloud-sync-client.test.mjs, cu un server simulat. Aici: cheile noi doar când serverul le anunță; limitele Governor fără capital;
// cache-ul contului persistat în IndexedDB + citiri în paralel (I-746); offline ≠ eroare (audit [3]); restaurarea peste 1 MB (audit [5]);
// copia locală mereu înaintea unei schimbări din cont, cu plafon (audit [2]); starea de securitate (audit [9], I-748).
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';import {createRequire} from 'node:module';import {KEYS,mergeRecord,validateValue,EvidenceCloud,ForecastCloud,LAST_WRITE_WINS,FillsCloud} from '../lib/cloud-sync-model.mjs';
const {create:planStore}=createRequire(import.meta.url)('../lib/trade-plan-store.js');
const source=readFileSync(new URL('../app/cloud-sync.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/,'');
const ORD='tt_trading212_orders_pending_v1',CFG='tt_governor_cfg_v1',plain=v=>JSON.parse(JSON.stringify(v));
const boundedStatus=(over={})=>({enabled:true,protocol:'tt-cloud-sync-v1',clientId:'test.apps.googleusercontent.com',checks:{database:true,google:true,encryption:true,schema:true},allowlist:true,supportedKeys:KEYS,records:{protocol:'tt-cloud-records-v2',maxKeys:1},...over});
async function setup({local={},remote={},baseline={},privateStore=null,status=boundedStatus(),session={subject:'123',sessions:2,createdAt:1790000000},configFails=false,readDelayMs=0,onKey,onPut,ticks=15}={}){
 const storage=new Map(Object.entries(local)),priv=privateStore||new Map([['session',{token:'token',subject:'123',email:'me@example.test'}],['baseline:123',baseline],['owner',null]]),calls=[],records=structuredClone(remote);
 let inFlight=0,maxInFlight=0;
 const window={addEventListener(){},dispatchEvent(){},T212Vault:{read:async()=>null,save:async()=>{},clear:async()=>{}},TTCloudStore:{get:async k=>structuredClone(priv.get(k)??null),put:async(k,v)=>{priv.set(k,structuredClone(v));},remove:async k=>{priv.delete(k);}},TTCloudFailure:null};
 const c={KEYS,mergeRecord,validateValue,EvidenceCloud,ForecastCloud,LAST_WRITE_WINS,FillsCloud,window,localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>{storage.set(k,String(v));},removeItem:k=>storage.delete(k),key:i=>[...storage.keys()][i]??null,get length(){return storage.size;}},document:{hidden:false,addEventListener(){},querySelectorAll:()=>[],getElementById:()=>null},navigator:{onLine:true},location:{origin:'https://mferent80-source.github.io',href:'https://mferent80-source.github.io/app/'},URL,URLSearchParams,Date,AbortController,CustomEvent:class{},StorageEvent:class{},setTimeout,clearTimeout,setInterval:()=>{},TextEncoder,
  fetch:async(url,opts)=>{calls.push({url,opts});if(configFails)throw new TypeError('Failed to fetch');let data,http=200;
   if(url==='cloud-sync-config.json')data={enabled:true,autoActivate:false,endpoint:'https://premarket-scanner-html.mferent80.workers.dev'};
   else if(url.endsWith('/status'))data=typeof status==='function'?status():status;
   else if(url.endsWith('/session'))data=session;
   else if(/\/records\?index=[123]$/.test(url))data={protocol:'tt-cloud-records-v2',records:Object.fromEntries(Object.entries(records).map(([k,r])=>[k,{revision:r.revision,updated:r.updated}]))};
   else if(url.includes('/records?key=')){const key=new URL(url).searchParams.get('key');inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);if(readDelayMs)await new Promise(r=>setTimeout(r,readDelayMs));inFlight--;const override=onKey?await onKey(records,key):undefined;data=override===undefined?{records:records[key]?{[key]:structuredClone(records[key])}:{}}:override;}
   else if(url.endsWith('/record')){const b=JSON.parse(opts.body);if(onPut)await onPut(storage,b);assert.equal(b.revision,records[b.key]?.revision||0);records[b.key]={revision:b.revision+1,value:b.value,updated:10};data={revision:b.revision+1,updated:10};}
   else throw Error(url);return {ok:http===200,status:http,json:async()=>data};}};
 window.localStorage=c.localStorage;window.navigator=c.navigator;vm.createContext(c);
 for(const file of ['../lib/storage-write.js','../app/failure-info.js','../lib/trading212-fills-store.js'])vm.runInContext(readFileSync(new URL(file,import.meta.url),'utf8'),c);
 const planLedger=planStore(c.localStorage,{durable:null,notify:false});window.TTPlanStore={create:()=>planLedger};
 const fillsLedger=window.T212FillsStore.create(c.localStorage,{durable:null,notify:false});await fillsLedger.ready().catch(()=>{});window.T212FillsStore={...window.T212FillsStore,...fillsLedger};
 vm.runInContext(source,c);for(let i=0;i<ticks;i++)await new Promise(r=>setImmediate(r));
 const settled=async()=>{for(let i=0;i<60&&(c.window.TTCloud.state().busy||c.window.TTCloud.state().checking);i++)await new Promise(r=>setTimeout(r,5));};await settled();
 return {api:window.TTCloud,storage,priv,records,calls,reads:()=>calls.filter(x=>x.url.includes('/records?key=')),puts:()=>calls.filter(x=>x.opts?.method==='PUT'),maxInFlight:()=>maxInFlight,settled};
}

test('cheile noi (ordine în așteptare, kill switch, Governor) intră în sincronizare DOAR când serverul le anunță în supportedKeys (un worker vechi nu le vede)',async()=>{
 const ordine={'live:abc':{environment:'live',items:[{id:'1',ticker:'MU_US_EQ',type:'STOP',side:'SELL',quantity:4,stopPrice:90,limitPrice:null}],fetchedAt:'2026-10-27T10:00:00Z'}};
 const vechi=await setup({local:{[ORD]:JSON.stringify(ordine)},status:boundedStatus({supportedKeys:KEYS.filter(k=>![ORD,CFG,'tt_governor_oprire_v1','tt_governor_limite_jurnal_v1','tt_t212_cititori_v1'].includes(k))})});
 assert.equal(vechi.api.state().error,'');assert.equal(vechi.puts().length,0,'serverul vechi nu primește cheia');assert.ok(!vechi.api.state().supportedKeys.includes(ORD));
 const nou=await setup({local:{[ORD]:JSON.stringify(ordine)}});
 assert.equal(nou.api.state().error,'');assert.deepEqual(nou.records[ORD].value,ordine,'serverul nou o primește');assert.ok(nou.api.state().supportedKeys.includes(ORD));
});

test('ordinele în așteptare vin pe aparatul pasiv prin sincronizare (telefonul nu mai e mereu „necitit”)',async()=>{
 const ordine={'live:abc':{environment:'live',items:[{id:'1',ticker:'MU_US_EQ',type:'STOP',side:'SELL',quantity:4,stopPrice:90,limitPrice:null}],fetchedAt:'2026-10-27T10:00:00Z'}};
 const s=await setup({remote:{[ORD]:{revision:1,updated:9,value:ordine}}});
 assert.deepEqual(JSON.parse(s.storage.get(ORD)),ordine);assert.equal(s.puts().length,0);
});

test('limitele Governor pleacă în cont FĂRĂ accountSize / _accountBasis și vin din cont fără să atingă capitalul local',async()=>{
 const localCfg={accountSize:12000,_accountBasis:'manual',maxHeatPct:4,maxTradesDay:5};
 const s=await setup({local:{[CFG]:JSON.stringify(localCfg)}});
 assert.equal(s.api.state().error,'');assert.deepEqual(s.records[CFG].value,{maxHeatPct:4,maxTradesDay:5},'în cont: doar limitele');
 assert.deepEqual(JSON.parse(s.storage.get(CFG)),localCfg,'local nimic schimbat');
 // celălalt aparat schimbă o limită
 s.records[CFG]={revision:2,updated:11,value:{maxHeatPct:3,maxTradesDay:5}};await s.api.sync();await s.settled();
 assert.equal(s.api.state().error,'');assert.deepEqual(JSON.parse(s.storage.get(CFG)),{accountSize:12000,_accountBasis:'manual',maxHeatPct:3,maxTradesDay:5},'limita vine, capitalul local rămâne');
 // schimbarea lui aici (doar capitalul) nu trimite nimic
 s.storage.set(CFG,JSON.stringify({accountSize:15000,_accountBasis:'manual',maxHeatPct:3,maxTradesDay:5}));const n=s.puts().length;await s.api.sync();await s.settled();assert.equal(s.puts().length,n,'capitalul nu circulă prin cheia limitelor');
});

test('I-746: cache-ul contului e persistat (IndexedDB) — la a doua pornire se citește doar indexul, iar cheile neschimbate nu se mai descarcă',async()=>{
 const remote={tt_journal_v1:{revision:3,updated:9,value:[{id:'a'}]},wl_stocks:{revision:1,updated:8,value:['AAPL']},tt_holdings_theses_v1:{revision:2,updated:7,value:{'x|MU_US_EQ':{stop:90}}}};
 const prima=await setup({remote});
 assert.equal(prima.reads().length,3);assert.equal(prima.api.state().error,'');
 const cache=prima.priv.get('records:123');assert.ok(cache&&cache.records&&cache.records.tt_journal_v1,'copia exactă a contului e în stocarea privată');
 assert.equal(cache.records.tt_journal_v1.revision,3);
 // a doua pornire: același aparat, aceeași stocare privată (baseline + cache), stocare locală cu valorile deja aplicate
 const aDoua=await setup({remote,privateStore:prima.priv,local:Object.fromEntries([...prima.storage])});
 assert.equal(aDoua.reads().length,0,'nicio cheie descărcată: indexul confirmă reviziile din cache');assert.equal(aDoua.api.state().error,'');assert.ok(aDoua.api.state().lastSync>0);
 aDoua.records.tt_journal_v1={revision:4,updated:12,value:[{id:'a'},{id:'b'}]};await aDoua.api.sync();await aDoua.settled();
 assert.equal(aDoua.reads().length,1,'doar cheia schimbată');assert.equal(JSON.parse(aDoua.storage.get('tt_journal_v1')).length,2);
 assert.equal(aDoua.priv.get('records:123').records.tt_journal_v1.revision,4,'cache-ul persistat ține pasul');
});

test('I-746 (securitate): cache-ul persistat NU ține valoarea conexiunii Trading 212 și nici cheia Radarului; la deconectare și la ștergerea conexiunii cache-ul dispare',async()=>{
 const remote={cloud_credentials:{revision:2,updated:9,value:{key:'fixture-key',secret:'fixture-secret',environment:'live'}},tt_radar_access_v1:{revision:1,updated:8,value:{cheie:'abcdefghijklmnop',parola:'p'}},wl_stocks:{revision:1,updated:7,value:['AAPL']}};
 const s=await setup({remote});
 const cache=s.priv.get('records:123').records;
 assert.ok(cache.wl_stocks&&'value' in cache.wl_stocks,'registrele obișnuite stau cu valoare');
 assert.ok(!cache.cloud_credentials||!('value' in cache.cloud_credentials),'conexiunea Trading 212 nu stă în clar în cache');
 assert.ok(!cache.tt_radar_access_v1||!('value' in cache.tt_radar_access_v1),'cheia Radarului nu stă în clar în cache');
 assert.ok(!/fixture-secret|abcdefghijklmnop/.test(JSON.stringify(s.priv.get('records:123'))));
 // după repornire, conexiunea se recitește din cont (nu e în cache), restul nu
 const again=await setup({remote,privateStore:s.priv,local:Object.fromEntries([...s.storage])});
 assert.deepEqual(again.reads().map(c=>new URL(c.url).searchParams.get('key')).sort(),['cloud_credentials','tt_radar_access_v1']);
 // ștergerea conexiunii șterge cache-ul persistat; sincronizarea de după îl reface din cont, tot fără secrete
 const sterse=[],sterge=again.priv.delete.bind(again.priv);again.priv.delete=k=>{sterse.push(k);return sterge(k);};
 await again.api.deleteCredentials();await again.settled();assert.ok(sterse.includes('records:123'),'ștergerea conexiunii curăță cache-ul');
 assert.ok(!/fixture-secret|abcdefghijklmnop/.test(JSON.stringify(again.priv.get('records:123')??null)),'cache-ul refăcut după ștergere nu ține secrete');
 const t=await setup({remote});await t.api.logout();assert.ok(!t.priv.has('records:123'),'deconectarea curăță cache-ul');
 // un cache vechi (dinaintea corecturii) cu valoarea conexiunii nu se mai încarcă în memorie din stocare: valoarea se recitește din cont
 const vechi=new Map([['session',{token:'token',subject:'123',email:'me@example.test'}],['baseline:123',{}],['owner',null],['records:123',{subject:'123',at:1,records:{cloud_credentials:{revision:2,updated:9,value:{key:'fixture-key',secret:'fixture-secret',environment:'live'}}}}]]);
 const u=await setup({remote,privateStore:vechi});assert.ok(u.reads().some(c=>c.url.endsWith('key=cloud_credentials')),'conexiunea se recitește din cont');
 assert.ok(!/fixture-secret/.test(JSON.stringify(u.priv.get('records:123'))),'cache-ul vechi cu secretul e rescris fără el');
});

test('I-746: cache-ul persistat al ALTUI cont nu se folosește (owner-ul contului)',async()=>{
 const remote={tt_journal_v1:{revision:3,updated:9,value:[{id:'a'}]}};
 const prima=await setup({remote});
 const strain=new Map([...prima.priv]);strain.set('session',{token:'token',subject:'999',email:'x@example.test'});strain.set('baseline:999',{});strain.set('owner',null);
 const s=await setup({remote,privateStore:strain,session:{subject:'999'}});
 assert.equal(s.reads().length,1,'contul 999 nu are cache ⇒ citește');
});

test('I-746: cheile schimbate se descarcă în paralel, cel mult 6 odată',async()=>{
 const remote={};for(let i=0;i<10;i++)remote['tt_trade_evidence_v1:'+i.toString(16).padStart(2,'0')]={revision:1,updated:1,value:{version:1,entries:[]}};
 remote.tt_journal_v1={revision:1,updated:1,value:[]};remote.wl_stocks={revision:1,updated:1,value:['A']};
 const s=await setup({remote,readDelayMs:15,onKey:(r,k)=>k.startsWith('tt_trade_evidence_v1:')?{records:{}}:undefined,ticks:60});
 assert.ok(s.reads().length>=2);assert.ok(s.maxInFlight()>=2,'citirile merg în paralel (în zbor: '+s.maxInFlight()+')');assert.ok(s.maxInFlight()<=6,'cel mult 6 odată (în zbor: '+s.maxInFlight()+')');
});

test('I-746: o citire picată în paralel nu aplică nimic din cont (cheile citite bune rămân în cache pentru reîncercare)',async()=>{
 const key='tt_journal_v1',before=JSON.stringify([{id:'a',notes:'base'}]);let fail=true;
 const s=await setup({local:{[key]:before},baseline:{[key]:{revision:1,value:JSON.parse(before)}},remote:{[key]:{revision:2,updated:9,value:[{id:'a',notes:'phone'}]},wl_stocks:{revision:1,updated:8,value:['AAPL']},tt_holdings_symbols_v1:{revision:1,updated:8,value:{}}},onKey:(_,k)=>{if(k==='wl_stocks'&&fail)throw Error('network fixture');}});
 assert.equal(s.storage.get(key),before);assert.equal(s.api.state().lastSync,null);assert.equal(s.puts().length,0);
 fail=false;await s.api.sync();await s.settled();assert.equal(s.api.state().error,'');assert.equal(JSON.parse(s.storage.get(key))[0].notes,'phone');
 assert.equal(s.reads().filter(c=>c.url.endsWith('key='+key)).length,1,'jurnalul citit bun prima dată nu se mai descarcă');
});

test('audit [3]: pornită fără rețea, aplicația nu arată „Failed to fetch” — codul e network_error, iar starea e „offline”, nu „eroare”',async()=>{
 const s=await setup({configFails:true});
 assert.equal(s.api.state().error,'network_error');assert.equal(s.api.state().failure?.code,'network_error');
 assert.ok(!/Failed to fetch/.test(JSON.stringify(s.api.state())));
});

test('audit [5]: restaurarea copiei locale trece peste limita de 1 MB a contului (limita e doar la trimitere)',async()=>{
 const mare=Array.from({length:30000},(_,i)=>({id:'x'+i,sym:'AAPL',note:'o execuție notată destul de lung ca să treacă de un megaoctet'}));
 const priv=new Map([['session',{token:'token',subject:'123',email:'me@example.test'}],['baseline:123',{}],['owner',null],['backups:123',[{at:Date.now()-60000,keys:['tt_journal_v1'],snapshot:{tt_journal_v1:mare}}]]]);
 const s=await setup({privateStore:priv});
 assert.ok(JSON.stringify(mare).length>1000000);
 await s.api.restore();assert.equal(JSON.parse(s.storage.get('tt_journal_v1')).length,30000);assert.match(s.api.state().error,/restaurată \(1 registre/);
 assert.deepEqual(plain(await s.api.restorePreview()),{at:priv.get('backups:123')[0].at,keys:['tt_journal_v1']});
});

test('audit [2]: copia locală se face ÎNAINTEA fiecărei schimbări venite din cont la registrele scrise de om; cel mult 10 copii și sub plafonul de octeți',async()=>{
 const vechi=Array.from({length:10},(_,i)=>({at:Date.now()-(i+1)*60000,keys:['tt_journal_v1'],snapshot:{tt_journal_v1:[{id:'copie'+i,note:'x'.repeat(700000)}]}}));
 const priv=new Map([['session',{token:'token',subject:'123',email:'me@example.test'}],['baseline:123',{tt_journal_v1:{revision:1,value:[{id:'a'}]}}],['owner',null],['backups:123',vechi]]);
 const s=await setup({privateStore:priv,local:{tt_journal_v1:JSON.stringify([{id:'a'}])},remote:{tt_journal_v1:{revision:2,updated:9,value:[{id:'a'},{id:'din-cont'}]}}});
 assert.equal(JSON.parse(s.storage.get('tt_journal_v1')).length,2);
 const list=s.priv.get('backups:123');
 assert.deepEqual(list[0].snapshot.tt_journal_v1,[{id:'a'}],'copia nouă (dinaintea schimbării) e prima');
 assert.ok(list.length<=10);const bytes=list.reduce((n,b)=>n+JSON.stringify(b.snapshot).length,0);assert.ok(bytes<=6000000,'plafonul de octeți ține lista sub 6 MB ('+bytes+')');
 assert.ok(list.length<10,'copiile vechi mari au ieșit ca să încapă plafonul');
});

test('audit [9] / I-748: starea de securitate — allowlist-ul Google din /status, sesiunile active și ultimul login din /session',async()=>{
 const s=await setup();
 assert.deepEqual(plain(s.api.state().security),{allowlist:true,sessions:2,lastLogin:1790000000000});
 const fara=await setup({status:boundedStatus({allowlist:false}),session:{subject:'123'}});
 assert.equal(fara.api.state().ready,true,'allowlist-ul lipsă nu oprește sincronizarea — se spune');assert.deepEqual(plain(fara.api.state().security),{allowlist:false,sessions:null,lastLogin:null});
});
