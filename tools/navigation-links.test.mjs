import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const ROOT='https://example.test/premarket_scanner.html/';
const read=path=>readFileSync(path,'utf8');
const inline=path=>[...read(path).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!m[1].includes('src=')&&m[2].trim()).map(m=>m[2]);
const node=()=>({nodeType:1,dataset:{},style:{},hidden:false,textContent:'',innerHTML:'',className:'',addEventListener(){},setAttribute(){},querySelector(){return null;},classList:{toggle(){},add(){}}});
function context(path='hub-clasic/',values={}){
 const nodes=new Map(),store=new Map(Object.entries(values));
 const c={URL,URLSearchParams,console,Intl,Date,setTimeout(){},clearTimeout(){},setInterval(){},location:new URL(path,ROOT),navigator:{},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},document:{currentScript:{src:ROOT+'lib/app-routes.js'},getElementById:id=>nodes.get(id)||null,querySelectorAll:()=>[],addEventListener(){},documentElement:{}},addEventListener(){}};
 c.window=c;c.self=c;c.top=c;vm.createContext(c);vm.runInContext(read('lib/app-routes.js'),c);
 return {c,nodes,store};
}
function anchor(href){
 const attrs=new Map([['href',href]]),a=node();
 return Object.assign(a,{getAttribute:k=>attrs.get(k)??null,setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k),hasAttribute:k=>attrs.has(k),matches:s=>s==='a[href]'&&attrs.has('href'),querySelectorAll:()=>[],target:''});
}
function navigation(anchors,{iframe=false,path='hub-clasic/'}={}){
 const {c,nodes}=context(path),listeners=new Map(),messages=[],scripts=[];let observer;
 c.document.currentScript={src:ROOT+'nav.js?v=884'};
 c.document.querySelectorAll=()=>anchors.filter(a=>a.hasAttribute('href'));
 c.document.addEventListener=(name,fn)=>listeners.set(name,fn);
 c.document.head={appendChild:s=>scripts.push(s)};
 c.document.createElement=()=>({});
 c.MutationObserver=class {constructor(fn){observer=fn;}observe(){}};
 nodes.set('tt-dock',{}); // Existing dock isolates the shared link policy from dock presentation.
 if(iframe){c.top={};c.parent={postMessage:(message,origin)=>messages.push({message,origin})};}
 vm.runInContext(read('nav.js'),c);
 return {c,messages,scripts,mutate:changes=>observer(changes),click(a,extra={}){let prevented=false;listeners.get('click')?.({target:{closest:()=>a},preventDefault(){prevented=true;},stopPropagation(){},...extra});return prevented;}};
}

test('standalone and iframe cleanup retain Journal data, normalize aliases, and hide unavailable CTAs',()=>{
 for(const iframe of [false,true]){
  const journal=anchor('./journal/?sym=AAPL#exec'),capital=anchor('../equity/'),retired=anchor('../macro-dashboard/'),missing=anchor('./router/'),external=anchor('https://mau.tail9144fe.ts.net:8443/journal/'),fragment=anchor('#local-details');
  const nav=navigation([journal,capital,retired,missing,external,fragment],{iframe,path:'hub-clasic/index.html'});
  assert.equal(journal.getAttribute('href'),ROOT+'journal/?sym=AAPL#exec');assert.equal(journal.hidden,false);
  assert.equal(capital.getAttribute('href'),ROOT+'journal/#capital');assert.equal(capital.hidden,false);
  for(const a of [retired,missing]){assert.equal(a.hidden,true);assert.equal(a.hasAttribute('href'),false);}
  assert.equal(external.getAttribute('href'),'https://mau.tail9144fe.ts.net:8443/journal/');assert.equal(fragment.getAttribute('href'),'#local-details');
  const dynamic=anchor('./governor/');nav.mutate([{type:'childList',addedNodes:[dynamic]}]);assert.equal(dynamic.getAttribute('href'),ROOT+'journal/#desk');
  const immediate=anchor('./cockpit/');assert.equal(nav.click(immediate),true);assert.equal(immediate.hidden,true);
  missing.setAttribute('href','./journal/#portfolio');nav.mutate([{type:'attributes',target:missing}]);assert.equal(missing.hidden,false);assert.equal(missing.getAttribute('href'),ROOT+'journal/#portfolio');
 }
});

test('iframe clicks preserve canonical Journal tab and symbol query and keep external links external',()=>{
 const journal=anchor('../journal/?sym=BRK.B#setup'),external=anchor('https://mau.tail9144fe.ts.net:8443/'),fragment=anchor('#local');
 const nav=navigation([journal,external,fragment],{iframe:true,path:'alerts/'});
 assert.equal(nav.click(journal),true);assert.equal(nav.messages.length,1);
 assert.equal(nav.messages[0].message.ttOpen,'journal/#setup');assert.equal(nav.messages[0].message.ttQuery,'sym=BRK.B');assert.equal(nav.messages[0].message.ttHash,'setup');assert.equal(nav.messages[0].origin,'https://example.test');
 assert.equal(nav.click(external),false);assert.equal(nav.click(fragment),false);assert.equal(nav.click(journal,{ctrlKey:true}),false);assert.equal(nav.messages.length,1);
});

test('registry loader uses the original nav script base on deeply nested pages',()=>{
 const {c}=context('missing/deep/page/'),scripts=[];c.TTAppRoutes=undefined;
 c.document.currentScript={src:ROOT+'nav.js?v=884'};c.document.createElement=()=>({});c.document.head={appendChild:s=>scripts.push(s)};
 vm.runInContext(read('nav.js'),c);assert.equal(scripts.length,1);assert.equal(scripts[0].src,ROOT+'lib/app-routes.js?v=884');
});

const baseState={session:'rth',verdict:'TRADE',govReasons:[],riskPct:1,trustPct:100,mktAgeMin:1,gapsFresh:false,gapList:[],openN:0,goCls:'caution',goScore:50,goLabel:'WAIT',freeze:false,strategy:'—'};
const cases=[['halt',{verdict:'HALTED'}],['risk',{riskPct:5}],['freeze',{freeze:true}],['trust',{trustPct:20}],['gap',{session:'pre',gapsFresh:true,gapList:[{sym:'BRK.B',gapPct:4}]}],['manage',{verdict:'CAUTION',openN:1}],['go',{goCls:'go'}],['review',{session:'closed'}],['default',{}]];

test('all live next-action branches link to available tasks from the canonical app root',()=>{
 const {c}=context();vm.runInContext(read('lib/hub-next-action.js'),c);
 for(const [id,override] of cases){const {action,winnerId}=c.HNA.evaluate({...baseState,...override});assert.equal(winnerId,id);
  for(const link of [action.cta,action.sec]){assert.equal(c.TTAppRoutes.resolve(link.href).kind,'active',id+' '+link.label);assert.ok(link.href.startsWith(ROOT));assert.doesNotMatch(link.href,/hub-clasic/);assert.doesNotMatch(link.label,/Router|Weekly|Watchlist|STL|Calendar Macro/);}
  if(id==='gap'){assert.equal(new URL(action.cta.href).searchParams.get('sym'),'BRK.B');assert.equal(new URL(action.cta.href).hash,'#setup');}
 }
});

test('legacy tableau preserves metric cards and current Journal links without unavailable feature anchors',()=>{
 const {c,nodes}=context('hub-clasic/',{tt_fng_cache_v1:JSON.stringify({v:42,label:'Neutral',ts:Date.now()})});
 for(const id of ['hubTableau','htGridSlot','htPills','htGoldAct','htStaleSlot'])nodes.set(id,node());
 vm.runInContext(read('lib/hub-tableau.js'),c);c.HT.render();
 const grid=nodes.get('htGridSlot').innerHTML;
 assert.match(grid,/<div[^>]*id="htGoCard"/);assert.match(grid,/<div[^>]*id="wSPY"/);assert.match(grid,/<div[^>]*id="wWL"/);
 assert.match(grid,/<a href="https:\/\/example\.test\/premarket_scanner\.html\/journal\/#portfolio"[^>]*id="htCardRisk"/);
 assert.match(grid,/id="htCardRisk"[\s\S]*?agregat @ SL/);
 for(const [,href] of grid.matchAll(/href="([^"]+)"/g))assert.equal(c.TTAppRoutes.resolve(href).kind,'active',href);
});

test('full legacy tableau keeps Macro numbers and opens Crypto Radar as an external destination',()=>{
 const {c,nodes}=context();for(const id of ['hubTableau','htGridSlot','htPills','htGoldAct','htStaleSlot'])nodes.set(id,node());
 const state={...baseState,layout:'full',actionPhrases:[],verdictRaw:'TRADE',rWeek:'1.2R',driftPct:0,sessionLabel:'RTH',sessionSub:'Open',sessionLvl:'ok',macro:{regime:{label:'RISK-ON',composite:4},danger:{score:12,mult:'1.0'},source:'snapshot',tiles:{fng:{v:'42',sub:'Neutral'},earnings:{v:'3',sub:'7z'},dxy:{v:'102',sub:'index'}}}};
 c.HS=new Proxy({hubState:()=>state,marketHref:()=>null,dataTrust:()=>null},{get:(target,key)=>key in target?target[key]:()=> 'neut'});
 vm.runInContext(read('lib/hub-tableau.js'),c);c.HT.render();const grid=nodes.get('htGridSlot').innerHTML;
 assert.match(grid,/<div[^>]*id="htCardRegime"[\s\S]*?RISK-ON/);assert.match(grid,/<div[^>]*id="htCardDanger"[\s\S]*?12/);
 assert.match(grid,/<a href="https:\/\/mau\.tail9144fe\.ts\.net:8443\/"[^>]*id="htCardEarn"[^>]*target="_blank"[^>]*rel="noopener"/);assert.match(grid,/Crypto Radar/);
 for(const [,href] of grid.matchAll(/href="([^"]+)"/g))assert.ok(['active','external'].includes(c.TTAppRoutes.resolve(href).kind),href);
});

test('stale audit reports missing Macro data without a retired CTA and keeps capital recovery active',()=>{
 const {c}=context();vm.runInContext(read('lib/hub-state.js'),c);const audit=c.HS.staleAudit();
 assert.equal(audit.items.find(x=>x.id==='macro').href,null);assert.equal(audit.items.find(x=>x.id==='equity').href,ROOT+'journal/#capital');assert.equal(c.HS.marketHref('SPY'),null);
});

test('all demo scenarios keep valid CTAs and visible data cells',()=>{
 const script=inline('hub-demo/index.html').find(s=>s.includes('const DEMO_SC_KEY'));
 for(const scenario of ['pre','halt','risk','freeze','stale','manage','go','review']){
  const {c,nodes}=context('hub-demo/',{tt_hub_demo_scenario_v1:scenario});c.document.getElementById=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);};
  vm.runInContext(script,c);
  for(const link of [c.__demoNa.cta,c.__demoNa.sec])assert.equal(c.TTAppRoutes.resolve(link.href).kind,'active',scenario+' '+link.label);
  const grid=nodes.get('decisionGrid').innerHTML;assert.match(grid,/class="cell hero[^>]*>[\s\S]*?GO/);assert.match(grid,/Risc @ SL/);
  for(const [,href] of grid.matchAll(/href="([^"]+)"/g))assert.equal(c.TTAppRoutes.resolve(href).kind,'active',href);
  assert.doesNotMatch(nodes.get('gappersStrip').innerHTML,/nasdaq-scanner/);
 }
});

test('static legacy CTAs and nested 404 recovery have no missing destinations',()=>{
 const unavailable=new Set(['router','cockpit','market-events','earnings-hub','macro-dashboard','sector-rotation','watchlist-monitor','nasdaq-scanner','mfx-screener','factor-lab','markov-lab','weekly','postmortem','pump-radar','smart-trade-long']);
 for(const path of ['hub-clasic/index.html','hub-demo/index.html']){
  const html=read(path);for(const [,href] of html.matchAll(/<a\b[^>]*href="([^"]+)"/g)){const route=href.replace(/^\.\.\//,'').split('/')[0];assert.equal(unavailable.has(route),false,path+' '+href);}
  for(const script of inline(path))new vm.Script(script,{filename:path});
 }
 const recovery=read('404.html').match(/id="appHome" href="([^"]+)"/)[1];
 for(const path of ['missing/','missing/deep/page/'])assert.equal(new URL(recovery,new URL(path,ROOT)).href,ROOT+'app/?module=today%2F');
});
