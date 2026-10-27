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
 const parent={postMessage:(data,origin)=>sent.push({data,origin})},model={account(options){calls.account++;calls.accountOptions=options;return structuredClone(current);},market(options){calls.market++;calls.marketOptions=options;return typeof market==='function'?market():Promise.resolve(market);},news(options){calls.news++;calls.newsOptions=options;return typeof news==='function'?news():Promise.resolve(news);},activity(options){calls.activity++;calls.activityOptions=options;return typeof activity==='function'?activity(options):Promise.resolve(activity);}};
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
 const h=s.element('briefAccount').innerHTML;assert.match(h,/42\.000,00 RON/);assert.match(h,/\+200,00 RON/);assert.match(h,/2 poziții · cea mai mare <b>29,1%<\/b>/);assert.match(h,/Citit /);
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
 assert.match(s.element('clockReg').textContent,/^Sesiunea 16:30–23:00$/);assert.match(s.element('sessionWhen').textContent,/^Deschide în 1 h 30 min, la 16:30$/);assert.equal(s.element('clockNow').hidden,false);assert.match(s.element('clockNow').dataset.t,/acum 15:00/);
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
