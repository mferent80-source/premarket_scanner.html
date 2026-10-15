import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';

const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const origin='https://app.example';
async function flush(){for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));}
async function setup(options={}){
 let time=Date.parse('2026-10-15T06:00:00Z');class Clock extends Date{constructor(...a){super(...(a.length?a:[time]));}static now(){return time;}}
 const elements=new Map(),events={},calls=[],messages=[],store=new Map();
 function el(id){if(!elements.has(id))elements.set(id,{value:'',hidden:false,disabled:false,textContent:'',innerHTML:'',handlers:{},querySelectorAll:()=>[],setAttribute(k,v){this[k]=v;},replaceChildren(){this.innerHTML='';},addEventListener(n,f){this.handlers[n]=f;}});return elements.get(id);}
 const document={visibilityState:'visible',getElementById:el,querySelectorAll:()=>[]},storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
 const journal={saveSnapshot(scope,environment,summary,positions,fetchedAt){store.set('tt_trading212_portfolio_v1',JSON.stringify({[scope]:{environment,summary,positions,fetchedAt,active:true}}));},merge(){return {count:1,complete:true};},read(){return {accounts:{}};},...options.journal};
 const parent={postMessage:(data,target)=>messages.push({data,target})};
 const window={parent,T212J:journal,T212Vault:{read:async()=>null},addEventListener:(n,f)=>events[n]=f};
 const context=vm.createContext({window,Intl,Date:Clock,localStorage:storage});
 for(const file of ['daily-series','holding-evolution','trading212-performance','trading212-portfolio','trading212-daily','holdings-pulse','position-history','holding-handoff','trading212-snapshot'])vm.runInContext(readFileSync('lib/'+file+'.js','utf8'),context);
 window.ViewRefresh={patchList:(host,items,key,markup)=>host.innerHTML=items.map(markup).join('')};
 let override=null;
 const fetch=async(u,request)=>{
  if(String(u).includes('trading212-config'))return {json:async()=>({enabled:options.enabled!==false,endpoint:'https://owned-private.workers.dev',directCredentials:true})};
  const name=new URL(u).pathname.split('/').at(-1);calls.push({name,u:String(u),request});
  const body={source:'Trading 212',environment:request.headers['X-T212-Environment'],fetchedAt:new Date(time).toISOString(),data:name==='summary'?{currency:'RON',totalValue:100,available:5}:name==='positions'?[]:{items:[{id:'sale',ticker:'UHS_US_EQ',side:'SELL'}],nextCursor:null}};
  return override?override(name,body,request):{ok:true,json:async()=>body};
 };
 await new AsyncFunction('document','window','fetch','setInterval','btoa','AbortController','crypto','setTimeout','clearTimeout','Date','navigator','location','localStorage','sessionStorage',readFileSync('broker/broker.js','utf8'))(document,window,fetch,()=>{},btoa,AbortController,webcrypto,setTimeout,clearTimeout,Clock,{onLine:true},{origin,search:options.preview?'?demo=1':''},storage,storage);
 return {el,calls,messages,journal,store,advance:ms=>time+=ms,override:fn=>override=fn,send:(data={ttRefreshBroker:true},source=parent,messageOrigin=origin)=>events.message({data,source,origin:messageOrigin}),async connect(environment='live'){el('apiKey').value='never-publish-this-key';el('apiSecret').value='never-publish-this-secret';el('brokerEnvironment').value=environment;await el('connect').handlers.submit({preventDefault(){}});},states:()=>messages.map(m=>m.data.ttBrokerRefresh.state)};
}

test('Today refresh refuses disabled, disconnected and illustrative broker contexts without a broker request',async()=>{
 for(const options of [{enabled:false},{},{preview:true}]){const s=await setup(options);s.send();await flush();assert.equal(s.calls.length,0);assert.deepEqual(s.states(),['error']);}
});
test('Today refresh refuses Trading 212 demo credentials and accepts only the exact same-origin parent',async()=>{
 const s=await setup();await s.connect('demo');s.advance(12000);const count=s.calls.length;s.send();await flush();assert.equal(s.calls.length,count);assert.deepEqual(s.states(),['error']);
 const live=await setup();await live.connect();live.advance(12000);const before=live.calls.length;live.send({ttRefreshBroker:true},{});live.send({ttRefreshBroker:true},undefined,'https://foreign.test');live.send({ttRefreshBroker:'true'});await flush();assert.equal(live.calls.length,before);assert.deepEqual(live.states(),[]);
});
test('Today refresh reports loading and ready only after account snapshot and recent orders are persisted',async()=>{
 const s=await setup();await s.connect();s.advance(12000);const before=s.calls.length;s.send();await flush();assert.deepEqual(s.states(),['loading','ready']);assert.deepEqual(s.calls.slice(before).map(c=>c.name),['summary','positions','orders']);
 assert.match(s.store.get('tt_trading212_portfolio_v1'),/"totalValue":100/);for(const m of s.messages){assert.equal(m.target,origin);assert.deepEqual(Object.keys(m.data.ttBrokerRefresh).sort(),['message','state']);assert.doesNotMatch(JSON.stringify(m),/never-publish|Authorization|totalValue|UHS/);}
});
test('repeated refreshes during a route cooldown issue no requests',async()=>{
 const s=await setup();await s.connect();const before=s.calls.length;s.send();s.send();await flush();assert.equal(s.calls.length,before);assert.deepEqual(s.states(),['busy','busy']);
});
test('an in-flight refresh rejects a duplicate without starting a second account read',async()=>{
 const s=await setup();await s.connect();s.advance(12000);const releases=[];s.override((name,body)=>name==='orders'?{ok:true,json:async()=>body}:new Promise(resolve=>releases.push(()=>resolve({ok:true,json:async()=>body}))));
 const before=s.calls.length;s.send();await flush();assert.equal(releases.length,2);s.send();await flush();assert.equal(s.calls.length,before+2);assert.deepEqual(s.states(),['loading','busy']);releases.forEach(release=>release());await flush();assert.equal(s.states().at(-1),'ready');
});
for(const route of ['summary','positions'])test('a failed '+route+' read is partial even when the other route succeeds',async()=>{
 const s=await setup();await s.connect();s.advance(12000);s.override((name,body)=>{if(name===route)throw Error('private endpoint detail');return {ok:true,json:async()=>body};});s.send();await flush();assert.deepEqual(s.states(),['loading','partial']);assert.doesNotMatch(JSON.stringify(s.messages),/private endpoint/);
});
test('a snapshot quota failure cannot be reported as ready',async()=>{
 const s=await setup();await s.connect();s.advance(12000);s.journal.saveSnapshot=()=>{throw Error('QuotaExceededError: private-account');};s.send();await flush();assert.deepEqual(s.states(),['loading','partial']);assert.doesNotMatch(JSON.stringify(s.messages),/QuotaExceeded|private-account/);
});
test('failed durable recent-order persistence cannot be reported as ready',async()=>{
 const s=await setup();await s.connect();s.advance(12000);s.journal.merge=()=>{throw Error('IndexedDB persistence failed');};s.send();await flush();assert.deepEqual(s.states(),['loading','partial']);
});
test('an extended broker orders cooldown is reported as partial then busy without repeated requests',async()=>{
 const s=await setup();await s.connect();s.advance(12000);s.override((name,body)=>name==='orders'?{ok:false,status:429,json:async()=>({retryAfter:60})}:{ok:true,json:async()=>body});s.send();await flush();assert.deepEqual(s.states(),['loading','partial']);const count=s.calls.length;s.advance(12000);s.send();await flush();assert.equal(s.calls.length,count);assert.equal(s.states().at(-1),'busy');
});
test('both unavailable account endpoints are an error even if recent orders can be imported',async()=>{
 const s=await setup();await s.connect();s.advance(12000);s.override((name,body)=>{if(name!=='orders')throw Error('unavailable');return {ok:true,json:async()=>body};});s.send();await flush();assert.deepEqual(s.states(),['loading','error']);
});
test('disconnect during delayed account replies reports an error without saving the old session',async()=>{
 const s=await setup();await s.connect();s.advance(12000);const previous=s.store.get('tt_trading212_portfolio_v1'),releases=[];s.override((name,body)=>new Promise(resolve=>releases.push(()=>resolve({ok:true,json:async()=>body}))));s.send();await flush();assert.equal(releases.length,2);s.el('disconnect').onclick();releases.forEach(release=>release());await flush();assert.deepEqual(s.states(),['loading','error']);assert.equal(s.store.get('tt_trading212_portfolio_v1'),previous);assert.equal(s.el('account').hidden,true);
});
test('disconnect during a durable recent-order save cannot report ready from the old session',async()=>{
 const s=await setup();await s.connect();s.advance(12000);let confirm;s.journal.merge=()=>new Promise(resolve=>confirm=()=>resolve({count:2,complete:true}));s.send();await flush();assert.equal(typeof confirm,'function');s.el('disconnect').onclick();confirm();await flush();assert.deepEqual(s.states(),['loading','error']);assert.equal(s.el('account').hidden,true);assert.equal(s.el('history').innerHTML,'');
});
test('disconnect during an awaited snapshot save cannot report ready from the old session',async()=>{
 const s=await setup();await s.connect();s.advance(12000);let confirm;s.journal.saveSnapshot=()=>new Promise(resolve=>confirm=resolve);s.send();await flush();assert.equal(typeof confirm,'function');s.el('disconnect').onclick();confirm();await flush();assert.deepEqual(s.states(),['loading','error']);assert.equal(s.el('account').hidden,true);
});

test('persisted but incompatible recent executions remain partial',async()=>{
 const s=await setup();await s.connect();s.advance(12000);s.journal.merge=()=>({count:1,complete:false,rejected:1});s.send();await flush();assert.deepEqual(s.states(),['loading','partial']);
});
