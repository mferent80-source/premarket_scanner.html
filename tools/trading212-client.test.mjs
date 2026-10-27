import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function setup(enabled,vault=null,options={}){
 const elements=new Map(),events={},intervals=[];
 function el(id){if(!elements.has(id))elements.set(id,{value:'',hidden:false,disabled:false,textContent:'',innerHTML:'',handlers:{},querySelectorAll:()=>[],setAttribute(k,v){this[k]=v;},replaceChildren(){this.innerHTML=''},scrollIntoView(){this.scrolled=true},addEventListener(name,fn){this.handlers[name]=fn}});return elements.get(id)}
 const kinds=['orders','dividends','transactions'].map(kind=>Object.assign(el('kind-'+kind),{dataset:{kind}}));
 const document={visibilityState:'visible',getElementById:el,querySelectorAll:selector=>selector==='[data-kind]'?kinds:[]},Clock=options.Date||Date;
 const saved=options.saved||new Map(),storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},sessionItems=new Map(),sessionStorage={getItem:k=>sessionItems.get(k)||null,setItem:(k,v)=>sessionItems.set(k,v)};
 const window={crypto:webcrypto,T212Vault:vault,T212J:options.journal,addEventListener:(name,fn)=>events[name]=fn},calls=[];
 window.parent=options.parent||window;
 const context=vm.createContext({window,Intl,Date:Clock,localStorage:storage});for(const file of ['lib/daily-series.js','lib/holding-evolution.js','lib/trading212-performance.js','lib/trading212-portfolio.js','lib/trading212-daily.js','lib/holdings-pulse.js','lib/position-history.js','lib/holding-handoff.js','lib/trading212-snapshot.js',...(options.journal==='real'?['lib/trading212-journal.js']:[]),...(options.extra||[])])vm.runInContext(readFileSync(file,'utf8'),context);
 window.ViewRefresh={patchList:(host,items,key,markup)=>{host.innerHTML=items.map(markup).join('');}};
 const fetch=async(u,request)=>{
  if(String(u).includes('trading212-config'))return {json:async()=>({enabled,endpoint:'https://owned-private.workers.dev',directCredentials:true})};
  calls.push({url:String(u),options:request});if(options.fetch)return options.fetch(u,request);
  const name=new URL(u).pathname.split('/').at(-1),data=name==='summary'?{currency:'EUR',available:5}:name==='positions'?[]:{items:[],nextCursor:null};
  const body={source:'Trading 212',environment:'live',fetchedAt:new Date(Clock.now()).toISOString(),data};
  return {ok:true,json:async()=>options.response?options.response(body,name,u):body};
 };
 await new AsyncFunction('document','window','fetch','setInterval','btoa','AbortController','crypto','setTimeout','clearTimeout','Date','navigator','location','localStorage','sessionStorage',readFileSync('broker/broker.js','utf8'))(document,window,fetch,(fn,ms)=>intervals.push({fn,ms}),btoa,AbortController,options.crypto||webcrypto,options.setTimeout||setTimeout,options.clearTimeout||clearTimeout,Clock,{onLine:true},options.location||{search:''},storage,sessionStorage);
 el('autoSync').checked=true;
 const connect=()=>{el('apiKey').value='test-key';el('apiSecret').value='test-secret';el('brokerEnvironment').value='live';return el('connect').handlers.submit({preventDefault(){}});};
 return {el,events,calls,intervals,connect,window,saved,sessionStorage};
}
test('inactive online relay does not request or send API keys',async()=>{const s=await setup(false);for(const id of ['apiKey','apiSecret','connectButton'])assert.equal(s.el(id).disabled,true);await s.el('connect').handlers.submit({preventDefault(){}});assert.equal(s.calls.length,0);assert.match(s.el('status').textContent,/nu este încă activată/)});
test('broker evolution filters show monetary recovery and technical weakness while preserving portfolio totals',async()=>{const s=await setup(false,null,{location:{search:'?demo=1'}});assert.match(s.el('positions').innerHTML,/Pe minus · pierderea se reduce/);assert.match(s.el('positions').innerHTML,/Pe plus · direcția tehnică slăbește/);const before=s.el('portfolioSummary').innerHTML;s.el('positionEvolution').value='weakening';s.el('positionEvolution').handlers.change();assert.match(s.el('positions').innerHTML,/FICTIV_B_US_EQ/);assert.doesNotMatch(s.el('positions').innerHTML,/FICTIV_A_US_EQ/);assert.equal(s.el('portfolioSummary').innerHTML,before);});
test('opening a ranked position clears evolution and stop filters that would hide it',async()=>{const s=await setup(false,null,{location:{search:'?demo=1'}});s.el('positionEvolution').value='weakening';s.el('positionAttention').value='stop';s.el('positionFilter').value='gain';s.el('portfolioSummary').handlers.click({target:{closest:()=>({dataset:{position:'FICTIV_A_US_EQ'}})}});assert.equal(s.el('positionEvolution').value,'all');assert.equal(s.el('positionAttention').value,'all');assert.equal(s.el('positionFilter').value,'all');assert.match(s.el('positions').innerHTML,/FICTIV_A_US_EQ/);});
test('expiry updates monetary labels without a page reload or broker request',async()=>{let t=Date.parse('2026-10-08T18:00:00Z');class Clock extends Date{constructor(...args){super(...(args.length?args:[t]));}static now(){return t;}}const s=await setup(false,null,{Date:Clock,location:{search:'?demo=1'}});assert.match(s.el('positions').innerHTML,/Pe minus · pierderea se reduce/);t+=360000;s.intervals.find(x=>x.ms===30000).fn();assert.match(s.el('positions').innerHTML,/Citire broker veche/);assert.doesNotMatch(s.el('positions').innerHTML,/Pe minus · pierderea se reduce/);assert.equal(s.calls.length,0);});
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

test('background sync retains the visible account until both requests settle',async()=>{let time=Date.now(),defer=false,releases=[];class Clock extends Date{static now(){return time;}}const s=await setup(true,null,{Date:Clock,fetch:(u)=>{const name=new URL(u).pathname.split('/').at(-1),body={source:'Trading 212',environment:'live',fetchedAt:new Date(time).toISOString(),data:name==='summary'?{currency:'EUR',totalValue:100}:name==='positions'?[]:{items:[],nextCursor:null}},response={ok:true,json:async()=>body};return defer&&['summary','positions'].includes(name)?new Promise(resolve=>releases.push(()=>resolve(response))):Promise.resolve(response);}});await s.connect();assert.equal(s.el('account').hidden,false);s.el('metrics').innerHTML='previous balance';time+=61000;defer=true;const job=s.el('refresh').onclick();while(releases.length<2)await new Promise(r=>setImmediate(r));assert.equal(s.el('account').hidden,false);assert.equal(s.el('metrics').innerHTML,'previous balance');assert.equal(s.el('account')['aria-busy'],'true');releases.forEach(fn=>fn());await job;assert.equal(s.el('account')['aria-busy'],'false');});

test('broker position action hands the exact selected account to analysis and rejects changed or stale accounts',async()=>{
 let time=Date.now();class Clock extends Date{static now(){return time;}}const saved=new Map(),opened=[],position={ticker:'EXACT_US_EQ',quantity:2,averagePrice:80,currentPrice:90,instrumentCurrency:'USD',currency:'EUR',value:180,unrealized:20};
 const journal={saveSnapshot(scope,environment,summary,positions,fetchedAt){saved.set('tt_trading212_portfolio_v1',JSON.stringify({[scope]:{environment,summary,positions,fetchedAt,active:true}}));}};
 const s=await setup(true,null,{Date:Clock,saved,journal,parent:{postMessage:(data,origin)=>opened.push({data,origin})},location:{search:'',origin:'https://app.example'},response:(body,name)=>name==='positions'?{...body,data:[position]}:body});await s.connect();
 const click=()=>s.el('positions').handlers.click({target:{closest:()=>({dataset:{analyzePosition:position.ticker},hasAttribute:()=>false})}});
 assert.match(s.el('positions').innerHTML,/Analizează această poziție/);click();assert.equal(opened.length,1);assert.equal(opened[0].origin,'https://app.example');assert.equal(opened[0].data.ttOpenModule,'holdings/');
 const nonce=new URLSearchParams(opened[0].data.ttQuery).get('holding'),resolved=s.window.HoldingHandoff.resolve(s.sessionStorage,nonce,time),scope=Object.keys(JSON.parse(saved.get('tt_trading212_portfolio_v1')))[0];assert.equal(resolved.target.scope,scope);assert.equal(resolved.target.ticker,position.ticker);
 time+=600000;click();assert.equal(opened.length,1);assert.match(s.el('positionCoverage').textContent,/Sincronizează/);
 saved.set('tt_trading212_portfolio_v1',JSON.stringify({other:{environment:'live',active:true,positions:[position],fetchedAt:new Date(time).toISOString()}}));click();assert.equal(opened.length,1);assert.match(s.el('positionCoverage').textContent,/Contul selectat s-a schimbat/);
});


async function flushBroker(){for(let i=0;i<8;i++)await new Promise(resolve=>setImmediate(resolve));}
test('durable journal pages cannot advance the history cursor before confirmed persistence',async()=>{
 let time=Date.now(),confirm;class Clock extends Date{static now(){return time;}}
 const journal={saveSnapshot(){},merge(scope,environment,items,next){return new Promise(resolve=>{confirm=()=>resolve({count:items.length,complete:!next});});}},s=await setup(true,null,{Date:Clock,journal,response:(b,name)=>name==='orders'?{...b,data:{items:[{id:'confirmed-only',ticker:'A'}],nextCursor:'next-page'}}:b});
 const pending=s.connect();while(!confirm)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(s.el('history').innerHTML,'');assert.equal(s.el('more').hidden,true);assert.doesNotMatch(s.el('journalState').textContent,/execuții în jurnal/);
 time+=12000;s.intervals.find(x=>x.ms===12000).fn();await flushBroker();assert.equal(s.calls.filter(x=>x.url.includes('/orders')).length,1);
 time-=12000;confirm();await pending;assert.match(s.el('journalState').textContent,/1 execuții în jurnal/);assert.match(s.el('history').innerHTML,/A/);assert.equal(s.el('more').hidden,false);
});
test('rejected durable page leaves its unconfirmed cursor eligible for a full retry',async()=>{
 let time=Date.now(),merges=0;class Clock extends Date{static now(){return time;}}
 const states=[],journal={saveSnapshot(){},async importState(scope,environment,state){states.push(state);},async merge(scope,environment,items,next){if(++merges===1)throw Error('IndexedDB commit failed');return {count:items.length,complete:!next};}},s=await setup(true,null,{Date:Clock,journal,response:(b,name)=>name==='orders'?{...b,data:{items:[{id:'unconfirmed',ticker:'A'}],nextCursor:'not-yet-confirmed'}}:b});
 await s.connect();assert.match(s.el('historyState').textContent,/IndexedDB commit failed/);assert.equal(s.el('history').innerHTML,'');assert.equal(s.el('more').hidden,true);assert.deepEqual(states,['error']);
 time+=12000;s.intervals.find(x=>x.ms===12000).fn();await flushBroker();const orders=s.calls.filter(x=>x.url.includes('/orders'));
 assert.equal(orders.length,2);assert.equal(new URL(orders[1].url).searchParams.has('cursor'),false);assert.match(s.el('journalState').textContent,/1 execuții în jurnal/);
});
test('loading state is confirmed before the next broker journal page is requested',async()=>{
 let time=Date.now(),confirm;class Clock extends Date{static now(){return time;}}
 const journal={saveSnapshot(){},merge(){return {count:1,complete:false};},importState(){return new Promise(resolve=>{confirm=resolve;});}},s=await setup(true,null,{Date:Clock,journal,response:(b,name)=>name==='orders'?{...b,data:{items:[{id:'first'}],nextCursor:'next'}}:b});
 await s.connect();time+=12000;s.intervals.find(x=>x.ms===12000).fn();await flushBroker();assert.equal(typeof confirm,'function');assert.equal(s.calls.filter(x=>x.url.includes('/orders')).length,1);
 confirm();await flushBroker();const orders=s.calls.filter(x=>x.url.includes('/orders'));assert.equal(orders.length,2);assert.equal(new URL(orders[1].url).searchParams.get('cursor'),'next');
});
test('disconnect during durable persistence cannot render or advance the old journal session',async()=>{
 let confirm;const journal={saveSnapshot(){},merge(){return new Promise(resolve=>{confirm=()=>resolve({count:1,complete:true});});}},s=await setup(true,null,{journal});
 const pending=s.connect();while(!confirm)await new Promise(resolve=>setImmediate(resolve));s.el('disconnect').onclick();confirm();await pending;
 assert.equal(s.el('account').hidden,true);assert.equal(s.el('history').innerHTML,'');assert.equal(s.el('more').hidden,true);assert.doesNotMatch(s.el('journalState').textContent,/1 execuții în jurnal/);
});

for(const [code,expected] of [['fills_loading',/Se încarcă istoricul execuțiilor Trading 212/],['fills_unreadable',/Istoricul contului selectat nu poate fi citit/]])test('broker realized results distinguish '+code+' during durable history reads',async()=>{
 const journal={saveSnapshot(){},merge(){return {count:0,complete:false};},read(){throw Object.assign(Error('date indisponibile'),{code});}},s=await setup(true,null,{journal,response:(body,name)=>name==='summary'?{...body,data:{currency:'EUR',totalValue:100}}:body});
 await s.connect();assert.match(s.el('realizedSummary').textContent,expected);assert.equal(s.el('realizedSummary').innerHTML,'');
});

test('manual synchronization imports yesterday’s UHS sale before the automatic five-minute refresh',async()=>{
 let time=Date.now(),arrived=false;class Clock extends Date{static now(){return time;}}
 const old={id:'old-buy',ticker:'UHS_US_EQ',side:'BUY',quantity:0.25,price:210,date:new Date(time-172800000).toISOString(),priceCurrency:'USD',currency:'EUR'},sale={...old,id:'yesterday-uhs-sell',side:'SELL',price:225,realized:3,date:new Date(time-86400000).toISOString()};
 const s=await setup(true,null,{Date:Clock,journal:'real',response:(b,name)=>name==='orders'?{...b,data:{items:arrived?[sale,old]:[old],nextCursor:null}}:b});
 await s.connect();assert.equal(s.calls.filter(x=>x.url.includes('/orders')).length,1);assert.doesNotMatch(s.el('history').innerHTML,/SELL/);
 arrived=true;time+=12000;await s.el('refresh').onclick();
 const orders=s.calls.filter(x=>x.url.includes('/orders')),account=Object.values(s.window.T212J.read().accounts)[0];
 assert.equal(orders.length,2);assert.equal(new URL(orders[1].url).searchParams.has('cursor'),false);assert.equal(account.items.find(x=>x.id===sale.id).side,'SELL');assert.equal(account.items.length,2);assert.equal(account.complete,true);assert.match(s.el('history').innerHTML,/SELL/);assert.match(s.el('history').innerHTML,/225 USD/);assert.equal((s.el('history').innerHTML.match(/<article/g)||[]).length,2);
 time+=12000;s.intervals.find(x=>x.ms===12000).fn();await flushBroker();assert.equal(s.calls.filter(x=>x.url.includes('/orders')).length,2);
});

test('manual latest-order sampling preserves an unfinished historical cursor even when the head has no next page',async()=>{
 let time=Date.now(),fresh=false;class Clock extends Date{static now(){return time;}}const imported=[];
 const journal={saveSnapshot(){},merge(scope,environment,items,next,at,options){imported.push({items,next,options});return {count:imported.length,complete:!next};}},s=await setup(true,null,{Date:Clock,journal,response:(b,name,u)=>name==='orders'?{...b,data:new URL(u).searchParams.has('cursor')?{items:[{id:'older-fill'}],nextCursor:null}:fresh?{items:[{id:'UHS-sell',ticker:'UHS_US_EQ'}],nextCursor:null}:{items:[{id:'old-head',ticker:'OLD_US_EQ'}],nextCursor:'older-cursor'}}:b});
 await s.connect();fresh=true;time+=12000;await s.el('refresh').onclick();
 assert.equal(imported[1].items[0].id,'UHS-sell');assert.equal(imported[1].next,'older-cursor');assert.equal(imported[1].options.restart,false);assert.match(s.el('journalState').textContent,/import în curs/);assert.match(s.el('history').innerHTML,/UHS_US_EQ/);assert.match(s.el('history').innerHTML,/OLD_US_EQ/);assert.equal(s.el('more').hidden,false);
 time+=12000;s.intervals.find(x=>x.ms===12000).fn();await flushBroker();
 assert.equal(new URL(s.calls.filter(x=>x.url.includes('/orders'))[2].url).searchParams.get('cursor'),'older-cursor');assert.equal(imported[2].items[0].id,'older-fill');assert.equal(imported[2].next,null);assert.match(s.el('journalState').textContent,/parcurs integral/);
});

test('long automatic backfills sample recent sales every five minutes without restarting older-page progress',async()=>{
 let time=Date.now();class Clock extends Date{static now(){return time;}}const imported=[];
 const journal={saveSnapshot(){},merge(scope,environment,items,next,at,options){imported.push({items,next,options});return {count:imported.length,complete:!next};}},s=await setup(true,null,{Date:Clock,journal,response:(b,name,u)=>{if(name!=='orders')return b;const cursor=new URL(u).searchParams.get('cursor');return {...b,data:cursor?{items:[{id:'older-'+cursor}],nextCursor:cursor==='page-1'?'page-2':'page-3'}:{items:[{id:imported.length?'recent-UHS-sell':'first'}],nextCursor:'page-1'}};}});
 await s.connect();const tick=s.intervals.find(x=>x.ms===12000).fn;
 time+=12000;tick();await flushBroker();assert.equal(imported[1].next,'page-2');
 time+=288000;tick();await flushBroker();assert.equal(imported[2].items[0].id,'recent-UHS-sell');assert.equal(imported[2].next,'page-2');assert.equal(imported[2].options.restart,false);
 time+=12000;tick();await flushBroker();const orders=s.calls.filter(x=>x.url.includes('/orders'));assert.deepEqual(orders.map(x=>new URL(x.url).searchParams.get('cursor')),[null,'page-1',null,'page-2']);
});

test('refreshing recent sales leaves the selected cash-history page intact',async()=>{
 let time=Date.now(),arrived=false;class Clock extends Date{static now(){return time;}}
 const buy={id:'old-buy',ticker:'UHS_US_EQ',side:'BUY',quantity:1,price:210,date:new Date(time-172800000).toISOString()},sale={...buy,id:'UHS-sell',side:'SELL',price:225,date:new Date(time-86400000).toISOString()};
 const s=await setup(true,null,{Date:Clock,journal:'real',response:(b,name)=>name==='orders'?{...b,data:{items:arrived?[sale,buy]:[buy],nextCursor:null}}:name==='dividends'?{...b,data:{items:[{id:'cash-row',type:'DIVIDEND',date:new Date(time).toISOString(),amount:2,currency:'EUR'}],nextCursor:'cash-next'}}:b});
 await s.connect();s.el('kind-dividends').onclick();await flushBroker();const html=s.el('history').innerHTML,state=s.el('historyState').textContent;assert.match(html,/DIVIDEND/);assert.equal(s.el('more').hidden,false);
 arrived=true;time+=12000;await s.el('refresh').onclick();assert.equal(s.el('history').innerHTML,html);assert.equal(s.el('historyState').textContent,state);assert.equal(s.el('more').hidden,false);assert.ok(Object.values(s.window.T212J.read().accounts)[0].items.some(x=>x.id===sale.id));
});

test('manual recent-sale refresh reports cooldowns and honors an extended Trading 212 429 delay',async()=>{
 let time=Date.now(),orderReads=0;class Clock extends Date{static now(){return time;}}
 const journal={saveSnapshot(){},merge(){return {count:1,complete:true};}},s=await setup(true,null,{Date:Clock,journal,fetch:async u=>{const name=new URL(u).pathname.split('/').at(-1);if(name==='orders'&&++orderReads===2)return {ok:false,status:429,json:async()=>({retryAfter:60})};return {ok:true,json:async()=>({source:'Trading 212',environment:'live',fetchedAt:new Date(time).toISOString(),data:name==='summary'?{currency:'EUR',available:5}:name==='positions'?[]:{items:[{id:'order'}],nextCursor:null}})};}});
 await s.connect();time+=6000;await s.el('refresh').onclick();assert.equal(orderReads,1);assert.match(s.el('journalState').textContent,/Import parțial.*Așteaptă 5 secunde/);
 time+=5000;await s.el('refresh').onclick();assert.equal(orderReads,2);assert.match(s.el('journalState').textContent,/Import parțial.*Limita Trading 212/);
 time+=12000;await s.el('refresh').onclick();assert.equal(orderReads,2);assert.match(s.el('journalState').textContent,/Așteaptă 48 secunde/);
 time+=48000;await s.el('refresh').onclick();assert.equal(orderReads,3);assert.match(s.el('journalState').textContent,/parcurs integral/);
});

test('failed persistence of a recent sale preserves the older cursor and remains retryable',async()=>{
 let time=Date.now(),merges=0;class Clock extends Date{static now(){return time;}}const confirmed=[];
 const journal={saveSnapshot(){},merge(scope,environment,items,next){if(++merges===2)throw Error('IndexedDB commit failed');confirmed.push(items[0].id);return {count:confirmed.length,complete:!next};}},s=await setup(true,null,{Date:Clock,journal,response:(b,name,u)=>name==='orders'?{...b,data:new URL(u).searchParams.has('cursor')?{items:[{id:'older-fill'}],nextCursor:null}:{items:[{id:merges?'UHS-sell':'old-head',ticker:merges?'UHS_US_EQ':'OLD_US_EQ'}],nextCursor:'older-cursor'}}:b});
 await s.connect();const html=s.el('history').innerHTML;time+=12000;await s.el('refresh').onclick();assert.match(s.el('journalState').textContent,/Import parțial.*IndexedDB commit failed/);assert.deepEqual(confirmed,['old-head']);assert.equal(s.el('history').innerHTML,html);
 time+=12000;s.intervals.find(x=>x.ms===12000).fn();await flushBroker();assert.equal(new URL(s.calls.filter(x=>x.url.includes('/orders'))[2].url).searchParams.get('cursor'),'older-cursor');assert.deepEqual(confirmed,['old-head','older-fill']);
 time+=12000;await s.el('refresh').onclick();assert.deepEqual(confirmed,['old-head','older-fill','UHS-sell']);assert.match(s.el('history').innerHTML,/UHS_US_EQ/);
});

test('disconnect during a recent-sale durable save cannot publish progress from the old session',async()=>{
 let time=Date.now(),merges=0,confirm;class Clock extends Date{static now(){return time;}}
 const journal={saveSnapshot(){},merge(){if(++merges===1)return {count:1,complete:true};return new Promise(resolve=>{confirm=()=>resolve({count:2,complete:true});});}},s=await setup(true,null,{Date:Clock,journal,response:(b,name)=>name==='orders'?{...b,data:{items:[{id:merges?'UHS-sell':'old',ticker:merges?'UHS_US_EQ':'OLD_US_EQ'}],nextCursor:null}}:b});
 await s.connect();const html=s.el('history').innerHTML;time+=12000;const pending=s.el('refresh').onclick();while(!confirm)await flushBroker();assert.equal(s.el('history').innerHTML,html);assert.doesNotMatch(s.el('history').innerHTML,/UHS_US_EQ/);const refused=await s.el('refresh').onclick();assert.equal(refused,false);assert.match(s.el('journalState').textContent,/salvare este încă în curs/);
 s.el('disconnect').onclick();confirm();await pending;assert.equal(s.el('account').hidden,true);assert.equal(s.el('history').innerHTML,'');assert.equal(s.el('more').hidden,true);assert.doesNotMatch(s.el('journalState').textContent,/2 execuții/);
});

test('manual refresh still imports recent sales if balance and current-position reads fail',async()=>{
 let time=Date.now(),failed=false,merges=0;class Clock extends Date{static now(){return time;}}
 const journal={saveSnapshot(){},merge(){return {count:++merges,complete:true};}},s=await setup(true,null,{Date:Clock,journal,fetch:async u=>{const name=new URL(u).pathname.split('/').at(-1);if(failed&&name!=='orders')throw Error('portfolio temporarily unavailable');return {ok:true,json:async()=>({source:'Trading 212',environment:'live',fetchedAt:new Date(time).toISOString(),data:name==='summary'?{currency:'EUR',available:5}:name==='positions'?[]:{items:[{id:failed?'UHS-sell':'old'}],nextCursor:null}})};}});
 await s.connect();failed=true;time+=12000;await s.el('refresh').onclick();assert.equal(merges,2);assert.equal(s.calls.filter(x=>x.url.includes('/orders')).length,2);assert.match(s.el('status').textContent,/Conectare nereușită/);assert.match(s.el('journalState').textContent,/2 execuții/);
});

test('confirmed recent orders update visible matches once and preserve the visible older-page cursor',async()=>{
 let time=Date.now(),fresh=false;class Clock extends Date{static now(){return time;}}
 const old={id:'old',ticker:'OLD_US_EQ',side:'BUY',price:210,priceCurrency:'USD',date:new Date(time-172800000).toISOString()},tail={...old,id:'tail',ticker:'TAIL_US_EQ',date:new Date(time-259200000).toISOString()},sale={...old,id:'UHS-sell',ticker:'UHS_US_EQ',side:'SELL',price:225,date:new Date(time-86400000).toISOString()};
 const journal={saveSnapshot(){},merge(scope,environment,items,next){return {count:items.length,complete:!next};}},s=await setup(true,null,{Date:Clock,journal,response:(b,name,u)=>name==='orders'?{...b,data:new URL(u).searchParams.has('cursor')?{items:[{...tail,id:'older-extra',ticker:'OLDER_US_EQ'}],nextCursor:null}:fresh?{items:[sale,{...old,price:925}],nextCursor:'different-head-cursor'}:{items:[old,tail],nextCursor:'visible-older-cursor'}}:b});
 await s.connect();fresh=true;time+=12000;await s.el('refresh').onclick();
 const html=s.el('history').innerHTML;assert.equal((html.match(/<article/g)||[]).length,3);const oldCard=html.split('<article').find(x=>x.includes('<h3>OLD_US_EQ</h3>'));assert.match(oldCard,/925 USD/);assert.doesNotMatch(oldCard,/210 USD/);assert.ok(html.indexOf('UHS_US_EQ')<html.indexOf('OLD_US_EQ'));assert.match(html,/TAIL_US_EQ/);assert.equal(s.el('more').hidden,false);
 time+=12000;await s.el('more').onclick();assert.equal(new URL(s.calls.filter(x=>x.url.includes('/orders'))[2].url).searchParams.get('cursor'),'visible-older-cursor');assert.match(s.el('history').innerHTML,/OLDER_US_EQ/);assert.equal((s.el('history').innerHTML.match(/<article/g)||[]).length,4);
});

// 15.10.2026 (el: 429/502 pe /api/trading212/transactions?cursor=019ef2b7… ore în șir): o pagină veche care pică repetat
// bloca importul pe același cursor la nesfârșit, iar prima pagină (tranzacțiile noi) nu se mai citea deloc.
async function cursorScenario(failure){
 let time=Date.now();class Clock extends Date{static now(){return time;}}
 const ok=data=>({ok:true,json:async()=>({source:'Trading 212',environment:'live',fetchedAt:new Date(time).toISOString(),data})});
 const s=await setup(true,null,{Date:Clock,journal:'real',fetch:u=>{const url=new URL(u),name=url.pathname.split('/').at(-1),cursor=url.searchParams.get('cursor');
  if(name==='transactions'){if(cursor==='bad')return failure;return ok({items:[{id:'t-'+time,type:'DEPOSIT',date:new Date(time).toISOString(),amount:100,currency:'EUR'}],nextCursor:'bad'});}
  return ok(name==='summary'?{currency:'EUR',available:5}:name==='positions'?[]:{items:[],nextCursor:null});}});
 await s.connect();await flushBroker();
 const tick=async(ms=16000)=>{time+=ms;s.intervals.find(x=>x.ms===15000).fn();await flushBroker();};
 const transactions=()=>s.calls.filter(x=>x.url.includes('/transactions')).map(x=>new URL(x.url).searchParams.get('cursor'));
 for(let i=0;i<4;i++)await tick();
 assert.deepEqual(transactions(),[null,'bad'],'prima pagină, apoi pagina veche care pică');
 await tick(301000);await tick();
 return transactions();
}
test('o pagină veche de tranzacții care pică nu mai blochează importul: următoarea încercare reia de la prima pagină',async()=>{
 const seen=await cursorScenario({ok:false,status:502,json:async()=>({error:'broker_unavailable'})});
 assert.equal(seen.length,3);assert.equal(seen[2],null,'reia de la prima pagină, nu bate iar în cursorul stricat');
});
test('limita temporară Trading 212 (429) păstrează cursorul paginii vechi',async()=>{
 const seen=await cursorScenario({ok:false,status:429,json:async()=>({error:'rate_limited',retryAfter:30})});
 assert.equal(seen.length,3);assert.equal(seen[2],'bad');
});

// 27.10.2026 (I-759, partea client): după fiecare citire a brokerului, copiile (snapshot, jurnalul execuțiilor, ordinele) sunt comparate cu ce a
// spus Trading 212 ⇒ tt_reconciliere_v1 (contractul cu C: CAUTION la ok=false; cu A: Health) și panoul din pagina contului.
test('I-759: după sincronizare pagina scrie tt_reconciliere_v1 pentru contul citit și arată rezultatul în panoul de reconciliere',async()=>{
 const s=await setup(true,null,{journal:'real',extra:['lib/t212-pending.js','lib/trading212-reconciliere.js'],response:(b,name)=>({...b,data:name==='summary'?{currency:'EUR',totalValue:1000,available:100,reserved:0}:name==='positions'?[{ticker:'A_US_EQ',quantity:1,currency:'EUR',instrumentCurrency:'USD',value:900,unrealized:0,averagePrice:1,currentPrice:1}]:name==='orders-pending'?[]:b.data})});
 await s.connect();await flushBroker();
 const r=JSON.parse(s.saved.get('tt_reconciliere_v1'));assert.equal(r.ok,true);assert.ok(/^live:[0-9a-f]{64}$/.test(r.scope));assert.ok(Number.isFinite(Date.parse(r.la)));assert.deepEqual(r.diferente,[]);assert.equal(r.verificat.ordine,true);
 assert.match(s.el('reconciliere').innerHTML,/fără diferențe/i);
 const rau=await setup(true,null,{journal:'real',extra:['lib/t212-pending.js','lib/trading212-reconciliere.js'],response:(b,name)=>({...b,data:name==='summary'?{currency:'EUR',totalValue:1500,available:100,reserved:0}:name==='positions'?[{ticker:'A_US_EQ',quantity:1,currency:'EUR',instrumentCurrency:'USD',value:900,unrealized:0,averagePrice:1,currentPrice:1}]:name==='orders-pending'?[]:b.data})});
 await rau.connect();await flushBroker();const r2=JSON.parse(rau.saved.get('tt_reconciliere_v1'));assert.equal(r2.ok,false);assert.equal(r2.diferente[0].tip,'numerar');assert.match(rau.el('reconciliere').innerHTML,/1 diferență/);
});
// 27.10.2026 (I-757): butonul „Oprește tot” din pagina contului — confirmare în două trepte (prima deschide caseta cu motivul, a doua anulează), starea
// scrisă de TTOprire e la vedere la încărcare și după apăsare.
test('I-757: „Oprește tot” cere confirmarea a doua, trimite motivul la TTOprire.opreste și arată starea OPRIT',async()=>{
 const apeluri=[];let stare=null;
 const s=await setup(true,null,{response:(b,name)=>({...b,data:name==='summary'?{currency:'EUR',totalValue:1000,available:100}:name==='positions'?[]:b.data})});
 s.window.TTOprire={citeste:()=>stare,text:(x)=>x?'OPRIT · '+x.motiv:'Nu e oprit.',opreste:async({motiv})=>{apeluri.push(motiv);stare={activ:true,motiv,ordineAnulate:[]};return {ok:true,stare,mesaj:'gata'};}};
 await s.connect();s.window.TTOprire.randeaza?.();
 assert.equal(s.el('opresteTot').handlers.click===undefined,false,'butonul are ascultător');
 assert.equal(s.el('oprireConfirm').hidden,true);s.el('opresteTot').handlers.click({preventDefault(){}});assert.equal(s.el('oprireConfirm').hidden,false);assert.equal(apeluri.length,0,'prima apăsare nu anulează nimic');
 s.el('opresteNu').handlers.click({preventDefault(){}});assert.equal(s.el('oprireConfirm').hidden,true);
 s.el('opresteTot').handlers.click({preventDefault(){}});s.el('oprireMotiv').value='ordin greșit';await s.el('opresteConfirmDa').handlers.click({preventDefault(){}});await flushBroker();
 assert.deepEqual(apeluri,['ordin greșit']);assert.match(s.el('oprireStare').textContent,/OPRIT · ordin greșit/);assert.equal(s.el('oprireConfirm').hidden,true);
});
// 27.10.2026 (I-764): a doua cheie Trading 212 (cu „Orders: Execute”) se pune separat, doar pe acest aparat, pentru același cont ca cea de citire.
test('I-764: cheia cu ordine se salvează separat în seif pentru contul conectat, câmpurile se golesc, ștergerea o scoate',async()=>{
 const ordine=[];let clears=0;const vault={read:async()=>null,save:async()=>{},clear:async()=>{},saveOrdine:async(p)=>{ordine.push(p);},clearOrdine:async()=>{clears++;},readOrdine:async()=>ordine.at(-1)||null};
 const s=await setup(true,vault,{response:(b,name)=>({...b,data:name==='summary'?{currency:'EUR',totalValue:1000,available:100}:name==='positions'?[]:b.data})});await s.connect();
 s.el('ordineKey').value=' cheie-ordine ';s.el('ordineSecret').value='secret-ordine';await s.el('salveazaOrdine').handlers.click({preventDefault(){}});await flushBroker();
 assert.deepEqual(ordine,[{key:'cheie-ordine',secret:'secret-ordine',environment:'live'}]);assert.equal(s.el('ordineKey').value,'');assert.equal(s.el('ordineSecret').value,'');assert.match(s.el('ordineStare').textContent,/salvată|pusă/i);
 await s.el('stergeOrdine').handlers.click({preventDefault(){}});await flushBroker();assert.equal(clears,1);assert.match(s.el('ordineStare').textContent,/nicio cheie|lipsește|ștears/i);
});
