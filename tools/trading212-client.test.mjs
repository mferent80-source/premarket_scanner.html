import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function setup(enabled,vault=null,options={}){
 const elements=new Map(),events={},intervals=[];
 function el(id){if(!elements.has(id))elements.set(id,{value:'',hidden:false,disabled:false,textContent:'',innerHTML:'',handlers:{},replaceChildren(){this.innerHTML=''},scrollIntoView(){this.scrolled=true},addEventListener(name,fn){this.handlers[name]=fn}});return elements.get(id)}
 const document={visibilityState:'visible',getElementById:el,querySelectorAll:()=>[]},Clock=options.Date||Date;
 const window={T212Vault:vault,T212J:options.journal,addEventListener:(name,fn)=>events[name]=fn},calls=[];
 const context=vm.createContext({window,Intl,Date:Clock});for(const file of ['lib/trading212-performance.js','lib/trading212-portfolio.js'])vm.runInContext(readFileSync(file,'utf8'),context);
 const fetch=async(u,request)=>{
  if(String(u).includes('trading212-config'))return {json:async()=>({enabled,endpoint:'https://owned-private.workers.dev',directCredentials:true})};
  calls.push({url:String(u),options:request});if(options.fetch)return options.fetch(u,request);
  const name=new URL(u).pathname.split('/').at(-1),data=name==='summary'?{currency:'EUR',available:5}:name==='positions'?[]:{items:[],nextCursor:null};
  const body={source:'Trading 212',environment:'live',fetchedAt:new Date(Clock.now()).toISOString(),data};
  return {ok:true,json:async()=>options.response?options.response(body,name,u):body};
 };
 await new AsyncFunction('document','window','fetch','setInterval','btoa','AbortController','crypto','setTimeout','clearTimeout','Date','navigator','location',readFileSync('broker/broker.js','utf8'))(document,window,fetch,(fn,ms)=>intervals.push({fn,ms}),btoa,AbortController,options.crypto||webcrypto,options.setTimeout||setTimeout,options.clearTimeout||clearTimeout,Clock,{onLine:true},options.location||{search:''});
 el('autoSync').checked=true;
 const connect=()=>{el('apiKey').value='test-key';el('apiSecret').value='test-secret';el('brokerEnvironment').value='live';return el('connect').handlers.submit({preventDefault(){}});};
 return {el,events,calls,intervals,connect};
}
test('inactive online relay does not request or send API keys',async()=>{const s=await setup(false);for(const id of ['apiKey','apiSecret','connectButton'])assert.equal(s.el(id).disabled,true);await s.el('connect').handlers.submit({preventDefault(){}});assert.equal(s.calls.length,0);assert.match(s.el('status').textContent,/nu este încă activată/)});
test('one simple form sends session credentials to configured HTTPS relay and clears fields',async()=>{const s=await setup(true);s.el('apiKey').value='test-key';s.el('apiSecret').value='test-secret';s.el('brokerEnvironment').value='live';await s.el('connect').handlers.submit({preventDefault(){}});assert.equal(s.calls.length,3);for(const c of s.calls){assert.ok(c.url.startsWith('https://owned-private.workers.dev/api/trading212/'));assert.equal(c.options.headers.Authorization,'Basic '+btoa('test-key:test-secret'));assert.equal(c.options.headers['X-T212-Environment'],'live');assert.equal(c.options.cache,'no-store');assert.equal(c.url.includes('test-key'),false)}assert.equal(s.el('apiKey').value,'');assert.equal(s.el('apiSecret').value,'');assert.equal(s.el('connectionSettings').open,false);s.el('disconnect').onclick();assert.equal(s.el('account').hidden,true);assert.equal(s.el('metrics').innerHTML,'')});

test('saved connection restores without exposing API fields or saving another copy',async()=>{let writes=0;const vault={read:async()=>({key:'saved-key',secret:'saved-secret',environment:'live'}),save:async()=>writes++,clear:async()=>{}};const s=await setup(true,vault);assert.equal(s.calls.length,3);assert.equal(s.el('apiKey').value,'');assert.equal(s.el('apiSecret').value,'');assert.equal(s.el('connectionSettings').open,false);assert.equal(writes,0);assert.equal(s.calls[0].options.headers.Authorization,'Basic '+btoa('saved-key:saved-secret'));});

for(const [label,change] of [
 ['wrong environment',b=>({...b,environment:'demo'})],
 ['future timestamp',b=>({...b,fetchedAt:new Date(Date.now()+3600000).toISOString()})],
 ['expired timestamp',b=>({...b,fetchedAt:new Date(Date.now()-3600000).toISOString()})],
 ['incompatible schema',b=>({...b,data:'invalid'})]
])test('rejects '+label+' without saving connection or portfolio',async()=>{
 let writes=0;const vault={read:async()=>null,save:async()=>writes++},journal={saveSnapshot:()=>writes++};
 const s=await setup(true,vault,{journal,response:b=>change(b)});await s.connect();assert.equal(writes,0);assert.match(s.el('status').textContent,/Conectare nereușită/);assert.equal(s.el('account').hidden,true);
});
test('disconnect while account hash is pending cannot restart a connection',async()=>{
 let release,writes=0;const crypto={subtle:{digest:async(...args)=>{await new Promise(r=>release=r);return webcrypto.subtle.digest(...args);}}},vault={read:async()=>null,save:async()=>writes++};
 const s=await setup(true,vault,{crypto}),pending=s.connect();s.el('disconnect').onclick();release();await pending;assert.equal(s.calls.length,0);assert.equal(writes,0);assert.equal(s.el('account').hidden,true);
});
test('forget during late broker replies aborts immediately and cannot save the old key',async()=>{
 const replies=[];let writes=0,clears=0;
 const vault={read:async()=>null,save:async()=>writes++,clear:async()=>clears++},s=await setup(true,vault,{fetch:(u,request)=>new Promise(r=>replies.push({u,request,resolve:r}))});
 const pending=s.connect();while(replies.length<2)await new Promise(r=>setImmediate(r));const forget=s.el('forgetConnection').onclick();assert.ok(replies.every(r=>r.request.signal.aborted));
 for(const reply of replies)reply.resolve({ok:true,json:async()=>({source:'Trading 212',environment:'live',fetchedAt:new Date().toISOString(),data:String(reply.u).endsWith('/summary')?{currency:'EUR',available:5}:[]})});
 await Promise.all([pending,forget]);assert.equal(writes,0);assert.equal(clears,1);assert.equal(s.el('account').hidden,true);assert.match(s.el('configState').textContent,/eliminată/);
});
test('browser deadline releases hung relay requests without persisting credentials',async()=>{
 const timers=[];let writes=0;const s=await setup(true,{read:async()=>null,save:async()=>writes++},{setTimeout:(fn,ms)=>{assert.equal(ms,25000);timers.push(fn);return fn;},clearTimeout:()=>{},fetch:(u,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new DOMException('aborted','AbortError'))))});
 const pending=s.connect();while(timers.length<2)await new Promise(r=>setImmediate(r));timers.forEach(fn=>fn());await pending;assert.equal(writes,0);assert.match(s.el('status').textContent,/25 de secunde/);assert.equal(s.el('connectButton').disabled,false);
});
test('known execution on first import page cannot hide a backfilled execution on the next page',async()=>{
 let time=Date.now();class Clock extends Date{static now(){return time;}}const imported=[];
 const journal={saveSnapshot(){},merge(scope,environment,items,next,at,options){imported.push({items,next,options});return {count:imported.length,complete:!next,rejected:0,excluded:0};}};
 const s=await setup(true,null,{Date:Clock,journal,response:(b,name,u)=>name==='orders'?{...b,data:new URL(u).searchParams.has('cursor')?{items:[{id:'backfill'}],nextCursor:null}:{items:[{id:'known'}],nextCursor:'late-page'}}:b});
 await s.connect();const tick=s.intervals.find(x=>x.ms===12000).fn;
 assert.equal(imported.length,1);assert.equal(imported[0].items[0].id,'known');assert.match(s.el('journalState').textContent,/Performance Control/);
 time+=12000;tick();for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));assert.equal(imported[0].next,'late-page');
 time+=12000;tick();for(let i=0;i<10;i++)await new Promise(r=>setImmediate(r));assert.equal(imported[1].items[0].id,'backfill');assert.equal(imported[1].next,null);assert.match(s.el('journalState').textContent,/parcurs integral/);
});

test('numeric strings in portfolio balances cannot become accepted weights or prices',async()=>{
 let writes=0;const s=await setup(true,{read:async()=>null,save:async()=>writes++},{response:(b,name)=>({...b,data:name==='summary'?{currency:'EUR',available:5,totalValue:'100'}:[{ticker:'A',quantity:1,currentPrice:'10'}]})});await s.connect();assert.equal(writes,0);assert.equal(s.el('account').hidden,true);
});


test('portfolio filters preserve currency units and reset with account disconnect',async()=>{
 const s=await setup(true,null,{response:(b,name)=>({...b,data:name==='positions'?[
  {ticker:'LOSS_US_EQ',name:'Loss',quantity:1,currency:'EUR',instrumentCurrency:'USD',value:90,unrealized:-10,averagePrice:100,currentPrice:90},
  {ticker:'WIN_US_EQ',name:'Winner',quantity:2,currency:'EUR',instrumentCurrency:'EUR',value:220,unrealized:20,averagePrice:100,currentPrice:110}
 ]:b.data})});await s.connect();
 assert.match(s.el('portfolioSummary').innerHTML,/-10 EUR/);assert.match(s.el('positions').innerHTML,/LOSS_US_EQ/);
 s.el('positionFilter').value='gain';s.el('positionFilter').handlers.change();assert.doesNotMatch(s.el('positions').innerHTML,/LOSS_US_EQ/);assert.match(s.el('positions').innerHTML,/WIN_US_EQ/);
 assert.match(s.el('portfolioSummary').innerHTML,/-10 EUR/);s.el('disconnect').onclick();assert.equal(s.el('portfolioSummary').innerHTML,'');assert.equal(s.el('realizedSummary').innerHTML,'');assert.equal(s.el('positionSearch').value,'');
});
test('summary failure leaves current position P&L visible with missing weights',async()=>{
 const s=await setup(true,null,{fetch:async u=>{if(String(u).endsWith('/summary'))throw Error('summary unavailable');return {ok:true,json:async()=>({source:'Trading 212',environment:'live',fetchedAt:new Date().toISOString(),data:String(u).endsWith('/positions')?[{ticker:'A',quantity:1,currency:'EUR',unrealized:-8,value:92}]:{items:[],nextCursor:null}})};}});
 await s.connect();assert.match(s.el('portfolioSummary').innerHTML,/-8 EUR/);assert.match(s.el('portfolioState').textContent,/Sumar lipsă/);assert.match(s.el('positions').innerHTML,/Pondere din cont<\/dt><dd>—/);
});
test('position read failure cannot display old position rankings',async()=>{
 let time=Date.now(),failed=false;class Clock extends Date{static now(){return time;}}
 const s=await setup(true,null,{Date:Clock,fetch:async u=>{const name=String(u).split('/').at(-1);if(failed&&name==='positions')throw Error('positions unavailable');return {ok:true,json:async()=>({source:'Trading 212',environment:'live',fetchedAt:new Date(time).toISOString(),data:name==='summary'?{currency:'EUR',totalValue:100}:name==='positions'?[{ticker:'OLD',quantity:1,currency:'EUR',value:80,unrealized:-20}]:{items:[],nextCursor:null}})};}});
 await s.connect();assert.match(s.el('portfolioSummary').innerHTML,/OLD/);failed=true;time+=60000;await s.el('refresh').onclick();assert.doesNotMatch(s.el('portfolioSummary').innerHTML,/OLD/);assert.match(s.el('portfolioState').textContent,/indisponibles|indisponibile/);
});
test('fictitious preview never reads credentials, fetches broker data or saves snapshots',async()=>{
 let touched=0;const s=await setup(true,{read:async()=>{touched++;return {key:'real-key',secret:'real-secret',environment:'live'}}},{location:{search:'?demo=1'},journal:{saveSnapshot(){touched++},read(){touched++;return {accounts:{}}}}});
 assert.equal(touched,0);assert.equal(s.calls.length,0);assert.equal(s.el('previewBanner').hidden,false);assert.match(s.el('status').textContent,/DEMO FICTIV/);assert.match(s.el('positions').innerHTML,/FICTIV_A/);assert.match(s.el('realizedSummary').innerHTML,/-50 EUR/);await s.connect();assert.equal(s.calls.length,0);assert.equal(touched,0);
});
test('realized attribution consumes only the current credential scope',async()=>{
 const s=await setup(true,null,{journal:{saveSnapshot(){},merge(){return {count:0,complete:true}},read(){return {accounts:{unrelated:{environment:'live',items:[{ticker:'SECRET_OTHER',side:'SELL',realized:999}],complete:true,fetchedAt:new Date().toISOString()}}}}},response:(b,name)=>({...b,data:name==='summary'?{currency:'EUR',totalValue:100}:b.data})});
 await s.connect();assert.doesNotMatch(s.el('realizedSummary').innerHTML,/SECRET_OTHER|999/);assert.match(s.el('realizedSummary').innerHTML,/încă nu a fost importat/);
});
