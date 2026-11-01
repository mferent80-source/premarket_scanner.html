import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';

const source=readFileSync('today/view.js','utf8'),html=readFileSync('today/index.html','utf8'),css=readFileSync('today/style.css','utf8');
const NOW=Date.parse('2026-10-15T12:00:00Z'),DAY=86400000;
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
const account=(extra={})=>({state:'ready',scope:'live-A',currency:'RON',total:42000,available:1000,invested:41000,unrealized:200,realized:30,at:NOW,fresh:true,positions:[],points:[{at:NOW-DAY,value:41800},{at:NOW,value:42000}],chartCurrency:'RON',historyReason:'Observații locale.',cashWarning:'Include depuneri și retrageri; nu este randament.',newsSymbols:['UHS'],issues:[],...extra});
function setup({a=account(),embedded=true,search='',market={items:[],breadth:{state:'error',points:[],reason:'Sursă indisponibilă'}},news={state:'error',items:[],reason:'Flux neconfirmat'},activity={state:'ready',items:[],reason:'Nicio vânzare confirmată.'},snapshot,extra={}}={}){
 const nodes=new Map(),listeners=new Map(),timers=new Map(),channels=[],sent=[],session=new Map(),calls={account:0,market:0,news:0,activity:0,writes:0,theme:0};let timer=0,current=a,currentSnapshot=snapshot;
 const element=id=>{if(!nodes.has(id))nodes.set(id,{id,textContent:'',innerHTML:'',className:'',disabled:false,hidden:false,dataset:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(type,fn){listeners.set(id+':'+type,fn);}});return nodes.get(id);};
 const controls=new Map([['[data-chart-tab]',['account','SPY','breadth'].map(value=>({dataset:{chartTab:value},setAttribute(){}}))],['[data-period]',[30,90,365].map(value=>({dataset:{period:String(value)},setAttribute(){}}))]]);
 const doc={hidden:false,getElementById:element,querySelectorAll:q=>controls.get(q)||[],addEventListener:(type,fn)=>listeners.set('document:'+type,fn),documentElement:{dataset:{theme:'dark'}}};
 const parent={postMessage:(data,origin)=>sent.push({data,origin}),document:{title:''}},model={account(options){calls.account++;calls.accountOptions=options;return structuredClone(current);},market(options){calls.market++;calls.marketOptions=options;return typeof market==='function'?market():Promise.resolve(market);},news(options){calls.news++;calls.newsOptions=options;return typeof news==='function'?news():Promise.resolve(news);},activity(options){calls.activity++;calls.activityOptions=options;return typeof activity==='function'?activity(options):Promise.resolve(activity);}};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[NOW]));}static now(){return NOW;}}
 const c={document:doc,Date:Clock,Intl,URL,URLSearchParams,Map,Set,Number,Promise,location:{origin:'https://example.test',href:'https://example.test/project/today/'+(embedded?'?app=decision-mobile-v2&':'?')+search,search:(embedded?'?app=decision-mobile-v2&':'?')+search},crypto:{randomUUID:()=> 'nonce-live-123456'},sessionStorage:{getItem:key=>session.get(key)??null,setItem:(key,value)=>{calls.navigationWrites=(calls.navigationWrites||0)+1;session.set(key,value);}},localStorage:{getItem(){throw Error('UI must use the shared model');},setItem(){calls.writes++;}},addEventListener:(type,fn)=>listeners.set('window:'+type,fn),setTimeout:(fn,ms)=>{timers.set(++timer,{fn,ms});return timer;},clearTimeout:id=>timers.delete(id),setInterval:(fn,ms)=>{calls.interval={fn,ms};return 1;},BroadcastChannel:class{constructor(name){this.name=name;channels.push(this);}postMessage(){throw Error('The dashboard channel must be read-only');}close(){this.closed=true;}},TodayDashboardModel:{create:()=>model},ExchangeCalendar:{date:()=> '2026-10-15',session:()=>({state:'open',open:570,close:960})},T212Snapshot:{read:()=>currentSnapshot,fresh:s=>s?.fetchedAt===new Date(NOW).toISOString()},TTTheme:{set:value=>{calls.theme++;doc.documentElement.dataset.theme=value;}}};
 Object.assign(c,extra);c.window=c;c.parent=embedded?parent:c;vm.createContext(c);vm.runInContext(readFileSync('lib/holding-handoff.js','utf8'),c);vm.runInContext(source,c);
 const click=({dataset={},href,target,holding=false,...flags}={})=>{const anchor=href?{dataset,getAttribute:key=>key==='href'?href:key==='target'?target:null,hasAttribute:()=>false}:null,event={defaultPrevented:false,button:0,...flags,preventDefault(){this.defaultPrevented=true;},target:{closest(selector){if(selector==='[data-holding-ticker]'&&holding)return anchor;if(selector==='[data-chart-tab]'&&dataset.chartTab)return {dataset};if(selector==='[data-period]'&&dataset.period)return {dataset};if(selector==='a[href]')return anchor;return null;}}};listeners.get('document:click')(event);return event;};
 const runTimers=ms=>{for(const [id,t] of [...timers])if(t.ms===ms){timers.delete(id);t.fn();}};
 return {c,ui:c.TodayDashboardUI,doc,element,calls,sent,session,channels,timers,click,parent,runTimers,setAccount:value=>{current=value;},setSnapshot:value=>{currentSnapshot=value;},refresh:()=>listeners.get('refreshButton:click')(),event:(type,data={})=>(listeners.get('window:'+type)||listeners.get('document:'+type))?.(data),message:data=>listeners.get('window:message')({origin:c.location.origin,source:parent,data})};
}

test('live startup immediately reads the real model without a demonstration mode or fictional fallback',async()=>{
 const s=setup();assert.equal(s.calls.account,1);await flush();assert.equal(s.calls.market,1);assert.equal(s.calls.news,1);assert.equal(s.calls.activityOptions.scope,'live-A');assert.equal(s.calls.activityOptions.side,'SELL');assert.match(s.element('accountSummary').innerHTML,/42\.000,00/);assert.equal(s.calls.writes,0);assert.equal(s.ui.fixture,undefined);assert.doesNotMatch(source,/function fixture|mode:'demo'|data-mode|DATE ILUSTRATIVE|Math\.sin|28340|ALFA/);assert.doesNotMatch(html,/DATE ILUSTRATIVE|data-mode|PROTOTIP|Propunere pentru/);
});
test('only embedded Today hides its own rail and header while standalone retains navigation',()=>{
 const child=setup(),standalone=setup({embedded:false});assert.equal(child.doc.documentElement.dataset.embedded,'true');assert.equal(child.ui.state().embedded,true);assert.equal(standalone.doc.documentElement.dataset.embedded,undefined);assert.equal(standalone.ui.state().embedded,false);assert.match(css,/:root\[data-embedded=true\] \.rail,:root\[data-embedded=true\] \.topbar\{display:none\}/);assert.match(html,/window\.parent!==window/);
});
// 27.10.2026 (audit B 🔴): alertele pe pozițiile reale (fără stop, pe hârtie, split, abatere surse…) se stingeau când copia contului era mai veche de 5 min
// (state 'stale'), adică aproape tot timpul pe aparatul care nu citește brokerul. Acum se dau și pe copia veche, cu vechimea copiei spusă.
test('alertele pe poziții se dau și pe copia veche a contului (stale), cu vechimea copiei în rând',async()=>{
 const TA={alerte:({positions})=>positions.map(p=>({grav:5,sever:true,ticker:p.ticker,text:'⛔ '+p.ticker+': fără stop pus în Portofoliu'})),stopuri:()=>new Set()};
 const s=setup({a:account({state:'stale',fresh:false,at:NOW-23*60000,positions:[{ticker:'MU_US_EQ',value:1000,quantity:1}]}),extra:{TodayAttention:TA}});await flush();
 assert.match(s.element('attentionStrip').innerHTML,/fără stop pus/,'alerta pe poziție apare și pe copia veche');assert.match(s.element('attentionStrip').innerHTML,/copia contului de acum 23 min/);
 const lipsa=setup({a:account({state:'missing',scope:null,total:null,positions:[{ticker:'MU_US_EQ',value:1000}],points:[]}),extra:{TodayAttention:TA}});await flush();
 assert.doesNotMatch(lipsa.element('attentionStrip').innerHTML,/fără stop pus/,'fără cont nu se inventează alerte');
 const proaspat=setup({a:account({positions:[{ticker:'MU_US_EQ',value:1000,quantity:1}]}),extra:{TodayAttention:TA}});await flush();
 assert.match(proaspat.element('attentionStrip').innerHTML,/fără stop pus/);assert.doesNotMatch(proaspat.element('attentionStrip').innerHTML,/copia contului de acum/,'copia proaspătă nu poartă vechimea');
});
// 27.10.2026 (lot B, contractul cu lotul E): kill switch-ul tt_governor_oprire_v1 (scris de „Oprește tot”) ⇒ Astăzi arată primul rândul „OPRIT: …”
// (doar citire, prin TodayAttention.oprire) și îl reface la evenimentul window `tt-oprire` și la `storage` pe cheie.
test('rândul OPRIT din kill switch e primul în „Ce necesită atenție”, trimite la pagina contului și se reface la tt-oprire',async()=>{
 let oprit=null;const TA={alerte:({positions})=>positions.map(p=>({grav:5,sever:true,ticker:p.ticker,text:'⛔ '+p.ticker+': fără stop pus în Portofoliu'})),stopuri:()=>new Set(),oprire:()=>oprit};
 const s=setup({a:account({positions:[{ticker:'MU_US_EQ',value:1000,quantity:1}]}),extra:{TodayAttention:TA}});await flush();
 assert.doesNotMatch(s.element('attentionStrip').innerHTML,/OPRIT/,'fără cheie nu se inventează oprirea');
 oprit={activ:true,text:'⛔ OPRIT: pierdere peste limită (16:03, 27.10, laptop) · 1 ordin anulat',la:'2026-10-27T14:03:00Z'};
 s.event('tt-oprire',{detail:{activ:true}});await flush();
 const html=s.element('attentionStrip').innerHTML;assert.match(html,/OPRIT: pierdere peste limită/);
 assert.ok(html.indexOf('OPRIT')<html.indexOf('fără stop pus'),'OPRIT e înaintea alertelor pe poziții');
 assert.match(html,/<div class="attention-row oprit"><p><strong>Ce necesită atenție<\/strong> ⛔ OPRIT/);assert.match(html,/module=broker%2F">Vezi contul ↗<\/a>/);
 assert.doesNotMatch(html,/#stopPanel">Pune stopul ↓<\/a><\/div><div class="attention-row sever"><p><strong>/,'rândul OPRIT nu trimite la fereastra stopului');
 oprit=null;s.event('tt-oprire',{detail:{activ:false}});await flush();assert.doesNotMatch(s.element('attentionStrip').innerHTML,/OPRIT/,'re-armat (activ=false) ⇒ rândul dispare');
 assert.match(readFileSync('today/view.js','utf8'),/e\.key==='tt_governor_oprire_v1'\)\{try\{renderAttention\(\);renderVerdict\(\);/,'și evenimentul storage pe cheie reface rândul și foaia (harness-ul ține un singur ascultător pe tip)');
});
test('missing and stale account states preserve known data and do not become fabricated zero balances',async()=>{
 const missing=setup({a:account({state:'missing',scope:null,total:null,positions:[],points:[]})});await flush();assert.match(missing.element('accountSummary').innerHTML,/Conectează contul/);assert.match(missing.element('chartHost').innerHTML,/Nu există încă observații/);assert.doesNotMatch(missing.element('accountSummary').innerHTML,/0,00/);
 const stale=setup({a:account({state:'stale',at:NOW-DAY,fresh:false})});await flush();assert.match(stale.element('accountSummary').innerHTML,/42\.000,00/);assert.match(stale.element('accountSummary').innerHTML,/de actualizat/);assert.equal(stale.element('accountState').textContent,'De actualizat');
});
test('manual update requests the trusted parent broker once and independently refreshes public sources',async()=>{
 const s=setup();await flush();s.refresh();await flush();assert.equal(s.sent.length,1);assert.equal(s.sent[0].origin,'https://example.test');assert.equal(s.sent[0].data.ttRefreshBroker,true);assert.deepEqual(Object.keys(s.sent[0].data),['ttRefreshBroker']);assert.equal(s.calls.marketOptions.force,true);assert.match(s.element('brokerRefreshStatus').textContent,/solicitat/);
 const standalone=setup({embedded:false});await flush();standalone.refresh();await flush();assert.equal(standalone.sent.length,0);assert.match(standalone.element('brokerRefreshStatus').textContent,/conexiunea Trading 212/);
});
test('broker callbacks require the exact same-origin parent and never expose untrusted message text',async()=>{
 const s=setup();await flush();const before=s.calls.account;s.event('message',{origin:'https://evil.test',source:s.parent,data:{ttBrokerRefresh:{state:'ready'}}});s.event('message',{origin:s.c.location.origin,source:{},data:{ttShellVisible:true}});s.runTimers(150);await flush();assert.equal(s.calls.account,before);s.message({ttBrokerRefresh:{state:'loading',message:'<img src=x secret-token>'}});assert.equal(s.ui.state().brokerBusy,true);assert.equal(s.element('refreshButton').disabled,true);assert.doesNotMatch(s.element('brokerRefreshStatus').textContent,/secret-token|<img/);s.message({ttBrokerRefresh:{state:'not-supported'}});assert.equal(s.ui.state().brokerBusy,true);
});
test('terminal busy/error responses re-enable the control without waiting for a reply that never arrives',async()=>{
 const s=setup();await flush();s.message({ttBrokerRefresh:{state:'loading'}});assert.equal(s.element('refreshButton').disabled,true);s.message({ttBrokerRefresh:{state:'busy'}});assert.equal(s.ui.state().brokerBusy,false);assert.equal(s.element('refreshButton').disabled,false);assert.match(s.element('brokerRefreshStatus').textContent,/ocupat|limita/);s.message({ttBrokerRefresh:{state:'loading'}});s.message({ttBrokerRefresh:{state:'error'}});assert.equal(s.element('refreshButton').disabled,false);assert.equal([...s.timers.values()].filter(t=>t.ms===65000).length,0);
});
test('a missing terminal broker reply expires after a bounded wait without inventing account freshness',async()=>{
 const s=setup({a:account({state:'stale',at:NOW-DAY,fresh:false})});await flush();s.message({ttBrokerRefresh:{state:'loading'}});assert.equal([...s.timers.values()].filter(t=>t.ms===65000).length,1);s.runTimers(65000);assert.equal(s.element('refreshButton').disabled,false);assert.equal(s.ui.state().brokerBusy,false);assert.match(s.element('brokerRefreshStatus').textContent,/nu a fost confirmată/);assert.equal(s.element('accountState').textContent,'De actualizat');
});
test('ready and partial broker replies reread the selected account and ledger together without issuing another broker request',async()=>{
 const s=setup();await flush();s.setAccount(account({scope:'live-B',total:9100}));s.message({ttBrokerRefresh:{state:'ready'}});s.runTimers(150);await flush();assert.match(s.element('accountSummary').innerHTML,/9\.100,00/);assert.equal(s.calls.activityOptions.scope,'live-B');assert.equal(s.sent.length,0);s.setAccount(account({scope:'live-C',total:8100,state:'partial'}));s.message({ttBrokerRefresh:{state:'partial'}});s.runTimers(150);await flush();assert.equal(s.calls.activityOptions.scope,'live-C');assert.equal(s.element('accountState').textContent,'Citire parțială');assert.match(s.element('brokerRefreshStatus').textContent,/parțială/);
});
test('confirmed ledger channel metadata refreshes after quota prevents a localStorage event and remains read-only',async()=>{
 const s=setup();await flush();const channel=s.channels[0],before=s.calls.activity;assert.equal(channel.name,'tt-trading212-fills-changed-v1');for(const data of [{key:'other',revision:1},{key:'tt_trading212_fills_v1',revision:-1},{key:'tt_trading212_fills_v1',revision:2,raw:'financial payload'}])channel.onmessage({data});s.runTimers(150);await flush();assert.equal(s.calls.activity,before);channel.onmessage({data:{key:'tt_trading212_fills_v1',revision:3}});s.runTimers(150);await flush();assert.equal(s.calls.activity,before+1);assert.equal(s.sent.length,0);assert.equal(s.calls.writes,0);
});
test('pagehide cancels broker timers and closes the channel; back-forward restoration reopens the listener',async()=>{
 const s=setup();await flush();s.message({ttBrokerRefresh:{state:'loading'}});s.event('pagehide');assert.equal(s.channels[0].closed,true);assert.equal(s.ui.state().brokerBusy,false);assert.equal([...s.timers.values()].filter(t=>t.ms===65000).length,0);s.event('pageshow',{persisted:true});s.runTimers(150);await flush();assert.equal(s.channels.length,2);assert.equal(s.channels[1].closed,undefined);
});
test('storage, focus and trusted shell visibility refresh snapshots but never trigger a broker request',async()=>{
 const s=setup();await flush();let count=s.calls.account;s.event('storage',{key:'unrelated'});s.runTimers(150);await flush();assert.equal(s.calls.account,count);for(const action of [()=>s.event('storage',{key:'tt_trading212_fills_v1'}),()=>s.event('focus'),()=>s.message({ttShellVisible:true})]){action();s.runTimers(150);await flush();assert.equal(s.calls.account,++count);}assert.equal(s.sent.length,0);assert.equal(s.calls.interval.ms,60000);
});
test('a late response for an older account cannot overwrite a newer period or storage refresh',async()=>{
 const old=defer();let reads=0;const s=setup({activity:()=>++reads===1?old.promise:Promise.resolve({state:'ready',items:[{id:'b',ticker:'SECOND',side:'SELL',at:NOW,quantity:1,price:2,currency:'USD'}]})});await flush();s.setAccount(account({scope:'live-B',total:7000}));s.click({dataset:{period:'90'}});await flush();old.resolve({state:'ready',items:[{id:'a',ticker:'FIRST',side:'SELL',at:NOW,quantity:1,price:2,currency:'USD'}]});await flush();assert.equal(s.ui.state().days,90);assert.equal(s.calls.activityOptions.scope,'live-B');assert.match(s.element('activityList').innerHTML,/SECOND/);assert.doesNotMatch(s.element('activityList').innerHTML,/FIRST/);
});
test('canonical navigation preserves scanner symbols and Journal hashes through the shell',async()=>{
 const s=setup({search:'symbol=UHS'});await flush();const event=s.click({href:'../app/?module=journal%2F%23exec&symbol=UHS'});assert.equal(event.defaultPrevented,true);assert.equal(s.sent[0].data.ttOpen,'journal/#exec');assert.equal(s.sent[0].data.ttQuery,'symbol=UHS');assert.equal(s.sent[0].origin,s.c.location.origin);assert.match(s.element('scannerWindows').innerHTML,/symbol=UHS/);const before=s.sent.length;s.click({href:'https://evil.test/project/app/?module=holdings%2F'});s.click({href:'../app/?module=macro-dashboard%2F'});s.click({href:'../app/?module=holdings%2F',ctrlKey:true});s.click({href:'https://example.test/story',target:'_blank'});assert.equal(s.sent.length,before);
});
test('position navigation binds the exact current live scope to a handoff nonce; modified clicks keep a generic safe fallback',async()=>{
 const ticker='UHS_US_EQ',at=new Date(NOW).toISOString(),position={ticker,quantity:1,value:1000,currency:'RON',unrealized:10},s=setup({a:account({positions:[position]}),snapshot:['live-A',{environment:'live',fetchedAt:at,positions:[position]}]});await flush();assert.match(s.element('positionsList').innerHTML,/data-holding-ticker="UHS_US_EQ"/);assert.doesNotMatch(s.element('positionsList').innerHTML,/[?&](?:ticker|symbol)=/);const event=s.click({holding:true,dataset:{holdingTicker:ticker},href:'../app/?module=holdings%2F'});assert.equal(event.defaultPrevented,true);assert.equal(s.sent[0].data.ttOpenModule,'holdings/');assert.match(s.sent[0].data.ttQuery,/holding=nonce-live-123456/);const saved=JSON.parse(s.session.get('tt_holding_navigation_v1'));assert.deepEqual(saved.target,{scope:'live-A',ticker,environment:'live'});assert.equal(s.calls.navigationWrites,1);s.click({holding:true,dataset:{holdingTicker:ticker},href:'../app/?module=holdings%2F',ctrlKey:true});assert.equal(s.calls.navigationWrites,1);
});
test('stale, missing and changed-account position context fails visibly without silently selecting another holding',async()=>{
 const ticker='UHS_US_EQ',p={ticker,quantity:1,value:1000,currency:'RON',unrealized:987.65},s=setup({a:account({positions:[p]}),snapshot:['other-account',{environment:'live',fetchedAt:new Date(NOW).toISOString(),positions:[p]}]});await flush();s.click({holding:true,dataset:{holdingTicker:ticker},href:'../app/?module=holdings%2F'});assert.equal(s.sent.length,0);assert.equal(s.calls.navigationWrites,undefined);assert.equal(s.element('positionNavigationStatus').hidden,false);assert.match(s.element('positionNavigationStatus').textContent,/Poziția nu poate fi deschisă/);s.setSnapshot(['live-A',{environment:'live',fetchedAt:new Date(NOW-DAY).toISOString(),positions:[p]}]);s.click({holding:true,dataset:{holdingTicker:ticker},href:'../app/?module=holdings%2F'});assert.equal(s.sent.length,0);
});
test('standalone exact-position navigation reaches the nonce consumer without an app-shell query loss',async()=>{
 const ticker='UHS_US_EQ',position={ticker,quantity:1,value:1000,currency:'RON',unrealized:10},s=setup({embedded:false,a:account({positions:[position]}),snapshot:['live-A',{environment:'live',fetchedAt:new Date(NOW).toISOString(),positions:[position]}]});await flush();
 s.click({holding:true,dataset:{holdingTicker:ticker},href:'../app/?module=holdings%2F'});
 assert.equal(s.c.location.href,'../holdings/?holding=nonce-live-123456');assert.equal(s.sent.length,0);assert.equal(s.calls.navigationWrites,1);
 const destination=new URL(s.c.location.href,'https://example.test/project/today/'),handoff=s.c.HoldingHandoff.resolve(s.c.sessionStorage,destination.searchParams.get('holding'),NOW);assert.equal(destination.pathname,'/project/holdings/');assert.equal(handoff.ok,true);assert.equal(handoff.target.ticker,ticker);assert.equal(handoff.target.scope,'live-A');assert.equal(handoff.target.environment,'live');
});
test('charts and failed data remain accessible, source-labelled and explicit about missing observations',async()=>{
 const s=setup({a:account({points:[{at:NOW,value:42000}]})});await flush();const chart=s.element('chartHost').innerHTML;assert.match(chart,/role="img" aria-labelledby=/);assert.match(chart,/<table>/);assert.match(chart,/1 OBSERVAȚIE/);assert.match(chart,/nu este randament/);assert.doesNotMatch(chart,/class="series"/);assert.equal(s.element('newsCount').textContent,'Flux indisponibil');assert.match(s.element('refreshStatus').textContent,/Actualizare parțială/);assert.match(s.element('accountSource').textContent,/Trading 212/);
});
test('the single standalone theme control uses the suite API and all local assets resolve',()=>{
 const s=setup({embedded:false});s.element('themeToggle');s.event('unused');assert.match(source,/TTTheme\?\.set/);assert.match(css,/#ttThemeBtn\{display:none!important\}/);
 for(const m of html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"/gi)){const value=m[1];if(/^(https?:|data:)/.test(value))continue;assert.ok(existsSync(resolve(dirname('today/index.html'),value.split(/[?#]/,1)[0])),value);}assert.doesNotMatch(html,/trading212-fills-store\.js|trading212-journal\.js|broker\.js/);assert.match(html,/holding-handoff\.js/);assert.match(css,/grid-template-areas:"account" "market" "context"/);assert.match(css,/min-height:44px/);assert.doesNotMatch(source,/localStorage\.setItem|indexedDB\.open|fetch\(/);
});

// 15.10.2026 — reproiectarea din demo: „Azi, pe scurt”, ceasul sesiunii, procente cu o zecimală, graficul pe SPY când contul lipsește.
test('brief: contul lipsă cere conectarea, fără sold inventat; graficul pornește pe SPY și păstrează starea goală a contului',async()=>{
 const s=setup({a:account({state:'missing',scope:null,total:null,positions:[],points:[]})});await flush();
 assert.match(s.element('briefAccount').innerHTML,/Conectează contul/);assert.match(s.element('briefAccount').innerHTML,/Cont neconectat/);assert.doesNotMatch(s.element('briefAccount').innerHTML,/0,00/);
 assert.match(s.element('chartHost').innerHTML,/Nu există încă observații confirmate<\/b> pentru cont/);assert.match(s.element('chartHost').innerHTML,/Aștept seria EOD confirmată/);
 assert.match(s.element('briefIdeas').innerHTML,/Nicio scanare salvată/);assert.match(s.element('attentionStrip').innerHTML,/Nicio scanare salvată în cele două motoare/);
});
test('brief: contul citit arată soldul, P&L-ul la ban și cea mai mare pondere cu o zecimală',async()=>{
 const s=setup({a:account({positions:[{ticker:'AAA_US_EQ',quantity:1,value:100,currency:'RON',unrealized:5,weight:29.06},{ticker:'BBB_US_EQ',quantity:1,value:50,currency:'RON',unrealized:-1,weight:11}]})});await flush();
 const h=s.element('briefAccount').innerHTML;assert.match(h,/42\.000,00 RON/);assert.match(h,/\+200,00 RON/);assert.match(h,/2 poziții · cea mai mare <b>29,1%<\/b>/);assert.match(h,/ · AAA/);assert.match(h,/Disponibil <b>1\.000,00 RON<\/b>/);assert.match(h,/Citit /);
 assert.match(s.element('pageTitle').innerHTML,/Ziua ta de investiții<span>\.<\/span>/);assert.match(s.element('pageLead').textContent,/Contul și piața/);assert.equal(s.doc.title,'Astăzi — Trading Tools');
});
test('acasă: titlul ia ziua, iar ideile numesc simbolurile deja scanate',async()=>{
 const MV={compute(){return {label:{id:'prudent',text:'Prudent',tone:'warn'},indicatori:[{score:-1,why:'participarea e slabă',name:'Participarea'},{score:0,name:'VIX'},{score:0,name:'Dobândă'}],foaia:{titlu:'Mai mult stai',ton:'warn',spus:'Planuri noi cu riscul redus la trei sferturi (×0,75).',deCe:'Nu e zi bună de trading, pentru că participarea e slabă.',unde:'Conduc energie.',randuri:[]}};},render(v){return '<p>'+v.label.text+'</p>';},raportBreadth:()=>new Promise(()=>{}),robotFile:()=>new Promise(()=>{}),extraData:()=>new Promise(()=>{}),symbolOf:()=>null};
 const R={primary:()=>({items:[{symbol:'MPC',mode:'momentum',passed:4,total:6},{symbol:'PSX',mode:'reversal',passed:3,total:6},{symbol:'<x>',mode:'momentum'}]}),independent:()=>({items:[{symbol:'XOM',passed:5,total:7}]}),reportState:()=>({text:'Citit',tone:'ok'}),label:()=>'trece',emptyResult:()=>({title:'gol',text:'nimic'})};
 const market={at:NOW,items:[],breadth:{state:'ready',above50:55,above200:50,asOf:'2026-10-14',source:'M',coverage:'S',points:[]}};
 const s=setup({a:account({positions:[{ticker:'MPC_US_EQ',quantity:1,value:500,currency:'RON',weight:12},{ticker:'ZZZ_US_EQ',quantity:1,value:10,weight:1}]}),market,news:{state:'ready',items:[],reason:''},extra:{MarketVerdict:MV,ScannerResults:R}});await flush();
 assert.match(s.element('pageTitle').innerHTML,/Mai mult stai<span>\.<\/span>/);
 assert.equal(s.element('pageLead').textContent,'Nu e zi bună de trading, pentru că participarea e slabă.');
 assert.equal(s.doc.title,'Mai mult stai — Trading Tools');
 assert.equal(s.parent.document.title,'Mai mult stai · Trading Tools');
 assert.equal(s.parent.__ttDayTitle,'Mai mult stai');
 assert.match(s.element('briefMarket').innerHTML,/>Prudent</);
 assert.match(s.element('briefMarket').innerHTML,/riscul redus/);
 assert.doesNotMatch(s.element('pageTitle').innerHTML,/>Prudent</);
 assert.match(s.element('briefIdeas').innerHTML,/În Premarket: <b>MPC, PSX<\/b>/);
 assert.match(s.element('briefIdeas').innerHTML,/În V1: <b>XOM<\/b>/);
 assert.match(s.element('briefIdeas').innerHTML,/Deja în cont: <b>MPC<\/b>/);
 assert.doesNotMatch(s.element('briefIdeas').innerHTML,/Deja în cont:.*(?:XOM|ZZZ)/);
 assert.doesNotMatch(s.element('briefIdeas').innerHTML,/&lt;x&gt;|<x>/);
});
test('fără cont, foaia spune că nu știe pozițiile; contul gol nu inventează fraza',async()=>{
 const ctx={URL,Intl};vm.createContext(ctx);vm.runInContext(readFileSync('lib/market-verdict.js','utf8'),ctx);
 const market={at:NOW,items:[],breadth:{state:'ready',above50:55,above200:50,asOf:'2026-10-14',source:'M',coverage:'S',points:[]}};
 const news={state:'ready',items:[],reason:''};
 const lipsa=setup({a:account({state:'missing',scope:null,total:null,available:null,positions:[],points:[]}),market,news,extra:{MarketVerdict:ctx.MarketVerdict}});await flush();
 assert.match(lipsa.element('marketVerdict').innerHTML,/Fără cont conectat, foaia nu știe pozițiile tale/);
 assert.match(lipsa.element('briefMarket').innerHTML,/nu știe pozițiile/);
 const cu=setup({a:account({positions:[]}),market,news,extra:{MarketVerdict:ctx.MarketVerdict}});await flush();
 assert.doesNotMatch(cu.element('marketVerdict').innerHTML,/nu știe pozițiile/);
});
test('reperele: procentele zilei au o zecimală, prețurile rămân la două, sursa comună apare o singură dată',async()=>{
 const item=(symbol,label,unit,price,changePct)=>({symbol,label,unit,price,changePct,state:'ready',source:'Yahoo Finance · sesiuni încheiate',asOf:'2026-10-14',points:[],indicators:{}});
 const s=setup({market:{items:[item('SPY','S&P 500 · ETF SPY','USD',769.6,-1.084),item('QQQ','Nasdaq 100 · ETF QQQ','USD',728.95,-1.97),item('^VIX','Volatilitate · VIX','puncte',16.87,10.48),item('^TNX','Randament SUA · 10 ani','%',5.19,0.3)],breadth:{state:'ready',above50:35.8,above200:51.2,asOf:'2026-10-14',source:'Market Breadth',coverage:'S&P 500',points:[{at:NOW-2*DAY,value:40},{at:NOW-DAY,value:35.8}]}}});await flush();
 const m=s.element('marketStrip').innerHTML;assert.match(m,/769,60 USD/);assert.match(m,/-1,1%/);assert.match(m,/\+10,5%/);assert.doesNotMatch(m,/-1,08%/);assert.match(m,/5,19%/);
 assert.equal(m.split('EOD 2026-10-14 · Yahoo Finance').length-1,1);assert.match(m,/class="move-bar"/);
 assert.match(s.element('briefMarket').innerHTML,/Participare sub jumătate/);assert.match(s.element('briefMarket').innerHTML,/Amploare 35,8%/);
 assert.match(s.element('marketContext').innerHTML,/Peste SMA 200/);assert.match(s.element('marketContext').innerHTML,/class="breadth-spark"/);assert.equal(s.element('contextAsOf').textContent,'EOD 14.10');
});
test('ceasul sesiunii folosește programul calendarului și arată ora României',async()=>{
 const s=setup();await flush();
 assert.match(s.element('clockReg').textContent,/^Sesiunea 16:30–23:00$/);assert.match(s.element('clockPost').textContent,/^After-hours până la /);assert.match(s.element('sessionWhen').textContent,/^Deschide în 1 h 30 min, la 16:30$/);assert.equal(s.element('clockNow').hidden,false);assert.match(s.element('clockNow').dataset.t,/acum 15:00/);assert.match(css,/\.clock-track>div\{font-size:10\.5px;padding:4px 6px;white-space:normal/);
 assert.doesNotMatch(s.element('todayDate').textContent,/^[A-ZĂÂÎȘȚ ,0-9]+$/);
});

// 15.10.2026 (el: „în demo dacă schimbăm perioada arată informațiile perioadei, aici nu arată nimic”): istoricul contului are 11 zile,
// deci 1M/3M/1A desenau aceleași puncte fără nicio explicație. Graficul spune acum de unde începe istoricul și rezumă intervalul.
test('perioada mai lungă decât istoricul contului spune de unde începe istoricul și rezumă intervalul, fără randament',async()=>{
 const s=setup({a:account({points:[{at:NOW-11*DAY,value:40000},{at:NOW-5*DAY,value:41000},{at:NOW,value:42000}]})});await flush();
 s.click({dataset:{period:'90'}});await flush();
 const h=s.element('chartHost').innerHTML;
 assert.match(h,/Istoricul contului începe la 04\.10\.2026 · 3 observații; perioada aleasă \(3 luni\) arată tot ce există până acum\./);
 assert.match(h,/De la 04\.10\.2026: 40\.000,00 → 42\.000,00 RON · \+2\.000,00 RON \(\+5,0%\) · include depuneri și retrageri; nu este randament\./);
});
test('amploarea rezumă intervalul în puncte procentuale, nu în procente relative',async()=>{
 const s=setup({market:{items:[],breadth:{state:'ready',above50:35.8,above200:51.2,asOf:'2026-10-14',source:'Market Breadth',coverage:'S&P 500',points:[{at:NOW-20*DAY,value:52},{at:NOW-DAY,value:35.8}]}}});await flush();
 s.click({dataset:{chartTab:'breadth'}});
 assert.match(s.element('chartHost').innerHTML,/52,0% → 35,8% · -16,2 pp/);
});

// 15.10.2026 (el: „la câteva secunde pare că își face refresh pagina”): conectorul Trading 212 scrie la 12–15 s, iar fiecare scriere
// reîncărca tot ecranul cu „Se verifică…”. Reîmprospătarea din fundal păstrează datele vizibile și nu rescrie ce nu s-a schimbat.
test('reîmprospătarea din fundal păstrează reperele și știrile pe ecran până sosesc cele noi; „Actualizează” arată în continuare încărcarea',async()=>{
 const spy={symbol:'SPY',label:'S&P 500 · ETF SPY',unit:'USD',price:769.6,changePct:-1.08,state:'ready',source:'Yahoo Finance · sesiuni încheiate',asOf:'2026-10-14',points:[],indicators:{}};
 const later=defer();let reads=0;
 const s=setup({market:()=>++reads===1?Promise.resolve({items:[spy],breadth:{state:'error',points:[],reason:'x'}}):later.promise});await flush();
 assert.match(s.element('marketStrip').innerHTML,/769,60 USD/);
 s.event('storage',{key:'tt_trading212_fills_v1'});s.runTimers(150);await flush();
 assert.equal(reads,2,'piața se recitește');assert.match(s.element('marketStrip').innerHTML,/769,60 USD/);assert.doesNotMatch(s.element('marketStrip').innerHTML,/Se verifică/);assert.doesNotMatch(s.element('refreshStatus').textContent,/^Citesc/);
 later.resolve({items:[spy],breadth:{state:'error',points:[],reason:'x'}});await flush();
 s.refresh();assert.match(s.element('marketStrip').innerHTML,/Se verifică/,'„Actualizează” cerut de om pornește de la zero');
});
test('o secțiune cu același conținut nu e rescrisă la reîmprospătare (graficul nu reclipește, tabelele deschise rămân deschise)',async()=>{
 const s=setup();await flush();
 const host=s.element('chartHost');let value=host.innerHTML,writes=0;Object.defineProperty(host,'innerHTML',{get:()=>value,set:x=>{writes++;value=x;}});
 s.event('focus');s.runTimers(150);await flush();
 assert.equal(writes,0);
 s.click({dataset:{chartTab:'SPY'}});assert.equal(writes,1,'o schimbare reală se desenează');
});

test('brief-ul pune verdictul deasupra și desparte semnalele deja scrise; lățimea veche nu e un punct live',async()=>{
 const ctx={URL,Intl};vm.createContext(ctx);vm.runInContext(readFileSync('lib/market-verdict.js','utf8'),ctx);
 const serie=n=>Array.from({length:n},(_,i)=>({at:i,value:100}));
 const item=(symbol,price,changePct,points)=>({symbol,label:symbol,unit:'USD',price,changePct,state:'ready',source:'Yahoo Finance',asOf:'2026-10-14',points:points||[],indicators:{}});
 const market={at:NOW,items:[item('SPY',120,-0.4,serie(260)),item('QQQ',120,-0.2,serie(260)),item('^VIX',13,1),item('^TNX',4,0,serie(60).map((p,i)=>({at:i,value:4.4-i*0.01})))],breadth:{state:'ready',above50:72,above200:60,asOf:'2026-10-14',source:'Market Breadth',coverage:'S&P 500',points:[{at:NOW-DAY,value:70}]}};
 const v=ctx.MarketVerdict.compute({market,now:NOW});
 ctx.MarketVerdict.raportBreadth=()=>new Promise(()=>{});ctx.MarketVerdict.robotFile=()=>new Promise(()=>{});ctx.MarketVerdict.extraData=()=>new Promise(()=>{});
 const s=setup({market,news:{state:'ready',items:[],reason:''},extra:{MarketVerdict:ctx.MarketVerdict}});await flush();
 const h=s.element('briefMarket').innerHTML;
 assert.match(h,new RegExp('>'+v.label.text+'<'));
 assert.match(h,/Participare peste jumătate/);assert.match(h,/Amploare 72,0%/);assert.doesNotMatch(h,/· veche/);
 assert.match(h,/nu un semnal de cumpărare și nu o probabilitate/);
 if(v.indicatori.some(x=>x.score>0))assert.match(h,/În favoare:/);
 if(v.indicatori.some(x=>x.score<0))assert.match(h,/De urmărit:/);
 const stale=setup({market:{...market,breadth:{...market.breadth,state:'stale',above50:72}},news:{state:'ready',items:[],reason:''},extra:{MarketVerdict:ctx.MarketVerdict}});await flush();
 const hs=stale.element('briefMarket').innerHTML;
 assert.match(hs,/Date breadth de reverificat/);assert.match(hs,/nu participarea de azi/);assert.match(hs,/· veche · 14\.10/);
 assert.doesNotMatch(hs,/Participare peste jumătate/);assert.doesNotMatch(hs,/majoritatea acțiunilor participă/);
 assert.match(stale.element('marketContext').innerHTML,/Peste SMA 50 · ultima valoare, nu contextul de azi · 14\.10/);
 assert.match(stale.element('marketContext').innerHTML,/Peste SMA 200 · ultima valoare, nu contextul de azi · 14\.10/);
 assert.doesNotMatch(s.element('marketContext').innerHTML,/ultima valoare, nu contextul de azi/);
 if(v.foaia){assert.match(s.element('pageTitle').innerHTML,new RegExp('^'+v.foaia.titlu.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'<span>\\.</span>$'));assert.equal(s.element('pageLead').textContent,v.foaia.deCe);assert.match(v.foaia.deCe,/Da\. E zi bună de trading/);assert.match(s.element('briefMarket').innerHTML,/riscul obișnuit/);assert.match(s.element('marketVerdict').innerHTML,/mv-day-why/);}
 assert.match(stale.element('pageLead').textContent,/Lățimea nu e de azi/);
 assert.doesNotMatch(stale.element('pageLead').textContent,/majoritatea acțiunilor participă/);
});
test('brief-ul se rescrie când sursele lente mută verdictul',async()=>{
 const MV={compute(input){return input.extra?{label:{id:'prudent',text:'Prudent'},indicatori:[{score:1,why:'majoritatea acțiunilor participă',name:'Participarea'},{score:-1,why:'creditul slăbește',name:'Dobânzi și credit'},{score:-1,why:'regimul macro e prudent',name:'Regimul macro'}]}:{label:{id:'neutru',text:'Neutru'},indicatori:[{score:1,why:'majoritatea acțiunilor participă',name:'Participarea'},{score:0,name:'Volatilitatea'},{score:0,name:'Dobânzi'}]};},render(v){return '<p>'+v.label.text+'</p>';},raportBreadth:()=>Promise.resolve(null),robotFile:()=>Promise.resolve(null),extraData:()=>Promise.resolve({hy:1}),symbolOf:()=>null};
 const market={at:NOW,items:[],breadth:{state:'ready',above50:61.4,above200:55,asOf:'2026-10-14',source:'Market Breadth',coverage:'S&P 500',points:[]}};
 const s=setup({market,news:{state:'ready',items:[],reason:''},extra:{MarketVerdict:MV}});await flush();
 const h=s.element('briefMarket').innerHTML;
 assert.match(h,/>Prudent</);assert.match(s.element('marketVerdict').innerHTML,/Prudent/);
 assert.doesNotMatch(h,/>Neutru</);assert.match(h,/De urmărit: creditul slăbește/);
});
test('oprirea activă bate foaia zilei și pe brief, și pe panou',async()=>{
 const MV={compute(){return {label:{id:'favorabil',text:'Favorabil',tone:'ok'},indicatori:[{score:1,why:'majoritatea acțiunilor participă',name:'Participarea'},{score:1,why:'conduc sectoarele ciclice',name:'Sectoarele'},{score:0,name:'Volatilitatea'}],foaia:{titlu:'Zi de trade',ton:'ok',spus:'Planuri noi cu riscul obișnuit.',unde:'Dacă cercetezi ceva nou, rotația citită stă pe tehnologie.',randuri:[]}};},render(v){return '<h3 class="mv-day-title">'+v.foaia.titlu+'</h3><p>'+v.foaia.unde+'</p>';},raportBreadth:()=>new Promise(()=>{}),robotFile:()=>new Promise(()=>{}),extraData:()=>new Promise(()=>{}),symbolOf:()=>null};
 const market={at:NOW,items:[],breadth:{state:'ready',above50:72,above200:60,asOf:'2026-10-14',source:'Market Breadth',coverage:'S&P 500',points:[]}};
 const s=setup({market,news:{state:'ready',items:[],reason:''},extra:{MarketVerdict:MV,TodayAttention:{oprire:()=>({activ:true,text:'OPRIT'})}}});await flush();
 assert.match(s.element('briefMarket').innerHTML,/Oprirea e activă/);
 assert.match(s.element('marketVerdict').innerHTML,/Oprirea e activă/);
 assert.doesNotMatch(s.element('briefMarket').innerHTML,/Zi de trade/);
 assert.match(s.element('briefMarket').innerHTML,/>Favorabil</);
 assert.match(s.element('pageTitle').innerHTML,/Oprirea e activă<span>\.<\/span>/);
 assert.match(s.element('pageLead').textContent,/Nu se deschid planuri noi/);
 assert.doesNotMatch(s.element('pageLead').textContent,/zi bună de trading/);
 assert.equal(s.doc.title,'Oprirea e activă — Trading Tools');
 assert.doesNotMatch(s.element('pageTitle').innerHTML,/Zi de trade/);
});
test('ștampila spune dacă sursele au fost recitite sau au venit din cache, la ora payload-ului',async()=>{
 const gata={state:'ready',items:[],reason:''};
 const cache=setup({market:{items:[],breadth:{state:'error',points:[],reason:'x'},at:NOW-2*3600000},news:gata});await flush();
 assert.match(cache.element('refreshStatus').textContent,/Actualizare parțială/);
 assert.match(cache.element('refreshStatus').textContent,/încercare încheiată/);
 assert.match(cache.element('refreshStatus').textContent,/din cache-ul de 10 minute/);
 assert.match(cache.element('refreshStatus').textContent,/06:00/);
 assert.match(cache.element('refreshStatus').textContent,/ora New York/);
 assert.doesNotMatch(cache.element('refreshStatus').textContent,/13:00/);
 const proaspat=setup({market:{items:[{symbol:'SPY',label:'S&P',unit:'USD',price:1,changePct:0.1,state:'ready',source:'Yahoo',asOf:'2026-10-14',points:[],indicators:{}}],breadth:{state:'ready',above50:50,above200:50,asOf:'2026-10-14',source:'M',coverage:'S',points:[]},at:NOW},news:gata});await flush();
 assert.match(proaspat.element('refreshStatus').textContent,/Surse publice citite la /);
 assert.match(proaspat.element('refreshStatus').textContent,/08:00/);
 assert.match(proaspat.element('refreshStatus').textContent,/ora New York/);
 assert.match(proaspat.element('refreshStatus').textContent,/recitite acum/);
 assert.doesNotMatch(proaspat.element('refreshStatus').textContent,/din cache/);
 assert.doesNotMatch(proaspat.element('refreshStatus').textContent,/^Citesc/);
});
