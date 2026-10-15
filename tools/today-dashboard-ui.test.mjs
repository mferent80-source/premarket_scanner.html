import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';

const source=readFileSync('today-demo/view.js','utf8'),html=readFileSync('today-demo/index.html','utf8'),css=readFileSync('today-demo/style.css','utf8');
const NOW=Date.parse('2026-10-15T12:00:00Z'),DAY=86400000;
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function account(overrides={}){return {state:'stale',scope:'account-A',currency:'RON',total:42000,available:1000,invested:41000,unrealized:200,realized:30,at:NOW-DAY,fresh:false,positions:[],points:[{at:NOW-DAY,value:42000}],chartCurrency:'RON',historyReason:'O singură observație confirmată.',cashWarning:'Include depuneri; nu este randament.',newsSymbols:['UHS'],issues:[],...overrides};}
function setup({a=account(),market={items:[],breadth:{state:'error',points:[],reason:'Sursă indisponibilă'}},news={state:'error',items:[],reason:'Știrile nu pot fi verificate.'},activity={state:'ready',items:[],reason:'Nicio vânzare confirmată.'}}={}){
 const nodes=new Map(),listeners=new Map(),buttons=new Map(),calls={creates:0,account:0,market:0,news:0,activity:0,writes:0};
 const el=id=>{if(!nodes.has(id))nodes.set(id,{id,textContent:'',innerHTML:'',className:'',disabled:false,dataset:{},attrs:{},setAttribute(k,v){this.attrs[k]=v;},addEventListener(type,fn){listeners.set(id+':'+type,fn);}});return nodes.get(id);};
 const choices=(key,values)=>values.map(value=>{const b=el(key+value);b.dataset[key]=String(value);return b;});
 buttons.set('[data-chart-tab]',choices('chartTab',['account','SPY','breadth']));buttons.set('[data-period]',choices('period',[30,90,365]));
 let current=a;const model={account(){calls.account++;return structuredClone(current);},market(){calls.market++;return typeof market==='function'?market():Promise.resolve(market);},news(){calls.news++;return typeof news==='function'?news():Promise.resolve(news);},activity(options){calls.activity++;calls.activityOptions=options;return typeof activity==='function'?activity(options):Promise.resolve(activity);}};
 const doc={getElementById:el,querySelectorAll:q=>buttons.get(q)||[],addEventListener:(type,fn)=>listeners.set('document:'+type,fn),documentElement:{dataset:{theme:'dark'}}};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[NOW]));}static now(){return NOW;}}
 const context={document:doc,Date:Clock,Intl,URL,URLSearchParams,Map,Set,Number,Promise,addEventListener:(type,fn)=>listeners.set('window:'+type,fn),TodayDashboardModel:{create(){calls.creates++;return model;}},localStorage:{getItem(){throw Error('UI must not access storage directly');},setItem(){calls.writes++;}},ExchangeCalendar:{date:()=> '2026-10-15',session:()=>({state:'open',open:570,close:960})}};
 context.window=context;vm.createContext(context);vm.runInContext(source,context);
 const click=dataset=>listeners.get('document:click')({target:{closest(selector){if(selector==='[data-mode]'&&dataset.mode)return {dataset};if(selector==='[data-chart-tab]'&&dataset.chartTab)return {dataset};if(selector==='[data-period]'&&dataset.period)return {dataset};return null;}}});
 return {context,ui:context.TodayDashboardUI,nodes,el,calls,click,setAccount:value=>{current=value;},event:(type,value={})=>(listeners.get('window:'+type)||listeners.get('document:'+type))?.(value),refresh:()=>listeners.get('refreshButton:click')(),input:(value)=>listeners.get('document:input')({target:{id:'chartCursor',value,setAttribute(k,v){el('cursor').attrs[k]=v;}}})};
}

test('preview starts with explicit fictional content and performs no financial or market reads',()=>{
 const s=setup();assert.equal(s.ui.state().mode,'demo');assert.match(s.el('modeLabel').textContent,/DATE ILUSTRATIVE/);assert.match(s.el('accountSummary').innerHTML,/28\.340,00/);assert.match(s.el('newsFeed').innerHTML,/EXEMPLU DE ASPECT/);assert.doesNotMatch(s.el('newsFeed').innerHTML,/<a |<time /);assert.equal(s.calls.creates,0);assert.equal(s.calls.market,0);assert.equal(s.calls.writes,0);
 for(const id of ['accountSource','positionsSource','activitySource','indicatorSource'])assert.match(s.el(id).textContent,/ILUSTRATIVE/);assert.match(s.el('scannerWindows').innerHTML,/DATE ILUSTRATIVE/);
});
test('actual mode retains a stale account amount with its own timestamp and never fills missing sources with examples',async()=>{
 const s=setup();s.click({mode:'actual'});await flush();assert.match(s.el('accountSummary').innerHTML,/42\.000,00/);assert.match(s.el('accountSummary').innerHTML,/de actualizat/);assert.equal(s.el('accountState').textContent,'De actualizat');assert.match(s.el('newsFeed').innerHTML,/Știrile nu pot fi verificate/);assert.doesNotMatch(s.el('newsFeed').innerHTML,/Exemplu de aspect|ALFA/);assert.doesNotMatch(s.el('scannerWindows').innerHTML,/GAMA|DELTA/);assert.equal(s.calls.writes,0);assert.equal(s.calls.activityOptions.side,'SELL');assert.equal(s.calls.activityOptions.scope,'account-A');
});
test('one confirmed point draws a dot with no fabricated flat line or investment return',async()=>{
 const s=setup();s.click({mode:'actual'});await flush();const markup=s.el('chartHost').innerHTML;assert.match(markup,/class="single-dot"/);assert.doesNotMatch(markup,/class="series"/);assert.match(markup,/O singură observație/);assert.match(markup,/1 OBSERVAȚII/);assert.match(markup,/nu este randament/);assert.match(markup,/disabled/);assert.doesNotMatch(markup,/DATE ILUSTRATIVE/);
});
test('chart data is keyboard accessible and includes a table and bounded date/value series',()=>{
 const s=setup(),markup=s.ui.chartMarkup([{at:NOW-DAY,value:100},{at:NOW,value:105}],{label:'Serie de test',unit:'RON',reason:'Valori observate'});assert.match(markup,/role="img" aria-labelledby="chartTitle chartDesc"/);assert.match(markup,/<title id="chartTitle">Serie de test/);assert.match(markup,/type="range"/);assert.match(markup,/aria-valuetext=/);assert.match(markup,/<table>/);assert.match(markup,/scope="col"/);assert.equal((markup.match(/<tr><td>/g)||[]).length,2);assert.match(markup,/class="series"/);
 const invalid=s.ui.chartMarkup([{at:NOW,value:1},{at:NOW-DAY,value:2}]);assert.match(invalid,/nu poate fi verificată/);assert.doesNotMatch(invalid,/<svg/);
});
test('range input updates its accessible value and readable observation',()=>{
 const s=setup();s.input(0);assert.match(s.el('chartReadout').textContent,/RON/);assert.match(s.el('cursor').attrs['aria-valuetext'],/RON/);
});
test('late actual market/news/ledger responses cannot overwrite a return to illustrative mode',async()=>{
 const m=deferred(),n=deferred(),ledger=deferred(),s=setup({market:()=>m.promise,news:()=>n.promise,activity:()=>ledger.promise});s.click({mode:'actual'});await flush();s.click({mode:'demo'});m.resolve({items:[{label:'Private old result',price:999,source:'Old response',points:[]}],breadth:{}});n.resolve({items:[{title:'Late real headline',url:'https://example.com/story',publisher:'Real',publishedAt:NOW}]});ledger.resolve({items:[{ticker:'LATE',side:'SELL'}]});await flush();assert.equal(s.ui.state().mode,'demo');assert.match(s.el('marketStrip').innerHTML,/ILUSTRATIV/);assert.doesNotMatch(s.el('marketStrip').innerHTML,/Private old result/);assert.doesNotMatch(s.el('newsFeed').innerHTML,/Late real headline/);assert.doesNotMatch(s.el('activityList').innerHTML,/LATE/);assert.match(s.el('refreshStatus').textContent,/Date ilustrative/);
});
test('a changed account during a period selection reloads the whole financial view and ignores old ledger work',async()=>{
 const old=deferred();let reads=0;const s=setup({activity:()=>++reads===1?old.promise:Promise.resolve({state:'ready',items:[{id:'b',ticker:'SECOND',side:'SELL',at:NOW,quantity:1,price:10,currency:'USD'}],reason:'Cont B'})});s.click({mode:'actual'});await flush();s.setAccount(account({scope:'account-B',total:7000,points:[{at:NOW-DAY,value:6900},{at:NOW,value:7000}]}));s.click({period:'90'});await flush();old.resolve({state:'ready',items:[{id:'a',ticker:'FIRST',side:'SELL',at:NOW,quantity:1,price:2,currency:'USD'}]});await flush();assert.match(s.el('accountSummary').innerHTML,/7\.000,00/);assert.match(s.el('chartHost').innerHTML,/7\.000,00/);assert.match(s.el('activityList').innerHTML,/SECOND/);assert.doesNotMatch(s.el('activityList').innerHTML,/FIRST/);assert.equal(s.calls.activityOptions.scope,'account-B');assert.equal(s.ui.state().days,90);
});
test('a position profit without confirmed currency is never displayed as a monetary amount',async()=>{
 const s=setup({a:account({positions:[{ticker:'BAD',name:'No currency',quantity:1,value:1234,unrealized:987.65,currency:null,weight:null}]})});s.click({mode:'actual'});await flush();assert.doesNotMatch(s.el('positionsList').innerHTML,/987,65/);assert.match(s.el('positionsList').innerHTML,/Neverificat/);
});
test('public news requires safe HTTPS URLs and markup is escaped',async()=>{
 const s=setup({news:{state:'partial',reason:'O sursă indisponibilă',items:[{title:'<img src=x onerror=alert(1)>',url:'https://example.com/news?a=1&b=2',publisher:'Reporter',publishedAt:NOW,symbol:'UHS',source:'Yahoo Finance'},{title:'Unsafe item',url:'javascript:alert(1)',publisher:'X',publishedAt:NOW},{title:'Credentials',url:'https://user:pass@example.com/',publisher:'X',publishedAt:NOW}]}});s.click({mode:'actual'});await flush();const markup=s.el('newsFeed').innerHTML;assert.match(markup,/&lt;img/);assert.doesNotMatch(markup,/<img|javascript:|Unsafe item|user:pass|Credentials/);assert.match(markup,/target="_blank" rel="noopener noreferrer"/);assert.match(markup,/datetime=/);assert.match(markup,/O sursă indisponibilă/);
});
test('HTTP/session/reader errors leave actual mode honest and do not become zero balances',async()=>{
 const s=setup({a:account({state:'error',total:null,available:null,invested:null,unrealized:null,realized:null,positions:[],points:[],issues:['Date locale ilizibile']}),market:()=>Promise.reject(Error('network')),news:()=>Promise.reject(Error('network')),activity:()=>Promise.reject(Error('storage'))});s.click({mode:'actual'});await flush();assert.match(s.el('accountSummary').innerHTML,/Citire nereușită/);assert.doesNotMatch(s.el('accountSummary').innerHTML,/0,00/);assert.match(s.el('chartHost').innerHTML,/Nu există încă observații/);assert.match(s.el('marketStrip').innerHTML,/Indisponibil/);assert.match(s.el('activityList').innerHTML,/păstrate/);assert.match(s.el('attentionStrip').innerHTML,/Date locale ilizibile/);assert.equal(s.ui.state().busy,false);
});
test('failed news and public refresh do not claim zero articles or successful verification',async()=>{
 const s=setup();s.click({mode:'actual'});await flush();assert.equal(s.el('newsCount').textContent,'Flux indisponibil');assert.match(s.el('refreshStatus').textContent,/Actualizare parțială/);assert.match(s.el('refreshStatus').textContent,/încercare încheiată/);assert.doesNotMatch(s.el('refreshStatus').textContent,/Surse publice verificate/);
 const partial=setup({news:{state:'partial',items:[],reason:'O parte din flux nu a răspuns.'}});partial.click({mode:'actual'});await flush();assert.equal(partial.el('newsCount').textContent,'Flux parțial');
});
test('returning from broker and storage changes refresh the same account across all panels only in actual mode',async()=>{
 const s=setup();s.event('focus');s.event('storage',{key:'tt_trading212_portfolio_v1'});s.event('visibilitychange');assert.equal(s.calls.account,0);s.click({mode:'actual'});await flush();s.setAccount(account({scope:'account-returned',total:12300,points:[{at:NOW-DAY,value:12300}]}));s.event('focus');await flush();assert.match(s.el('accountSummary').innerHTML,/12\.300,00/);assert.equal(s.calls.activityOptions.scope,'account-returned');const count=s.calls.account;s.event('storage',{key:'unrelated-setting'});assert.equal(s.calls.account,count);s.setAccount(account({scope:'account-stored',total:8700}));s.event('storage',{key:'tt_trading212_portfolio_v1'});await flush();assert.match(s.el('accountSummary').innerHTML,/8\.700,00/);assert.equal(s.calls.activityOptions.scope,'account-stored');s.click({mode:'demo'});const frozen=s.calls.account;s.event('focus');s.event('visibilitychange');s.event('storage',{key:null});await flush();assert.equal(s.calls.account,frozen);
});
test('chart tabs and period controls switch independent series without labelling public prices as account returns',async()=>{
 const s=setup({market:{items:[{symbol:'SPY',label:'SPY',price:610,changePct:1,unit:'USD',state:'ready',source:'Yahoo Finance',asOf:'2026-10-14',points:[{at:NOW-2*DAY,value:600},{at:NOW-DAY,value:610}],indicators:{}}],breadth:{state:'ready',above50:55,above200:50,asOf:'2026-10-14',source:'Seria originală',coverage:'S&P 500',points:[{at:NOW-2*DAY,value:54},{at:NOW-DAY,value:55}]}}});s.click({mode:'actual'});await flush();s.click({chartTab:'SPY'});assert.match(s.el('chartHost').innerHTML,/SPY · închideri de sesiune/);assert.match(s.el('chartHost').innerHTML,/USD/);s.click({chartTab:'breadth'});assert.match(s.el('chartHost').innerHTML,/S&amp;P 500 peste SMA 50/);assert.match(s.el('chartHost').innerHTML,/Seria originală/);assert.doesNotMatch(s.el('chartHost').innerHTML,/DATE ILUSTRATIVE/);
});
test('TNX yield is shown in percent without confusing its relative change for percentage points',async()=>{
 const s=setup({market:{items:[{symbol:'^TNX',label:'Randament SUA · 10 ani',price:4.2,changePct:99,unit:'%',state:'ready',asOf:'2026-10-14',source:'Yahoo Finance',points:[]}],breadth:{state:'error',points:[]}}});s.click({mode:'actual'});await flush();assert.match(s.el('marketStrip').innerHTML,/4,20%/);assert.doesNotMatch(s.el('marketStrip').innerHTML,/99,00/);
});
test('all app links point to allowed canonical destinations and unsafe routes are rejected',()=>{
 const s=setup();assert.equal(s.ui.appURL('macro-dashboard/'),null);assert.equal(s.ui.appURL('javascript:alert(1)'),null);assert.equal(s.ui.safeURL('http://example.com'),null);assert.equal(s.ui.safeURL('https://user:pass@example.com'),null);
 for(const m of html.matchAll(/href="(\.\.\/app\/\?[^\"]+)"/g)){const url=new URL(m[1],'https://example.test/project/today-demo/'),route=url.searchParams.get('module');assert.ok(s.ui.appURL(route),route);assert.equal(url.origin,'https://example.test');}
});
test('preview assets exist, exclude financial writers and keep account first on narrow screens',()=>{
 for(const m of html.matchAll(/(?:src|href)="([^"#][^"]*)"/g)){const value=m[1];if(/^(https?:|data:|\.\.\/app\/\?)/.test(value))continue;assert.ok(existsSync(resolve(dirname('today-demo/index.html'),value.split(/[?#]/,1)[0])),value);}
 assert.doesNotMatch(html,/trading212-fills-store\.js|trading212-journal\.js|broker\.js|account-performance\.js/);assert.ok(html.indexOf('class="panel account-panel"')<html.indexOf('id="marketStrip"'));assert.match(css,/grid-template-areas:"account" "market" "context"/);assert.match(css,/min-height:44px/);assert.match(css,/prefers-reduced-motion/);assert.match(html,/data-mode="actual" aria-pressed="false"/);assert.match(html,/<noscript>/);assert.doesNotMatch(source,/localStorage\.setItem|indexedDB\.open|fetch\(/);
});
