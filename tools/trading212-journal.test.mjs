import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function setup(options={}){const store=new Map();const context={document:options.document,addEventListener(){},setInterval(){},T212FillsStore:options.fillsStore,ExecutionReview:options.executionReview,TTStorageWrite:options.storageWrite,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>{if(options.quota?.(k))throw Object.assign(Error('Storage quota exceeded'),{name:'QuotaExceededError'});store.set(k,v);}}};vm.createContext(context);vm.runInContext(readFileSync('lib/trading212-snapshot.js','utf8'),context);vm.runInContext(readFileSync('lib/trading212-daily.js','utf8'),context);vm.runInContext(readFileSync('lib/trading212-journal.js','utf8'),context);context.T212J._store=store;return context.T212J;}
const fill={id:'f1',ticker:'AAPL_US_EQ',date:'2026-10-02T15:00:00Z',side:'BUY',quantity:0.5,price:230,priceCurrency:'USD',currency:'EUR',realized:null};
test('broker fills deduplicate and retain currencies and isolated accounts',()=>{const j=setup();j.merge('live:a','live',[fill],null,fill.date);j.merge('live:a','live',[fill,{...fill,id:'f2',side:'SELL',realized:3}],null,fill.date);j.merge('demo:a','demo',[fill],null,fill.date);j.merge('live:b','live',[fill],null,fill.date);const data=j.read();assert.equal(data.accounts['live:a'].items.length,2);assert.equal(data.accounts['demo:a'].items.length,1);assert.equal(data.accounts['live:b'].items.length,1);assert.equal(data.accounts['live:a'].items[0].realized,null);assert.equal(data.accounts['live:a'].items[0].priceCurrency,'USD');assert.equal(data.accounts['live:a'].items[0].currency,'EUR');});
// 27.10.2026 (audit C 🟡): istoricul zilnic al contului se grupează pe ziua NEW YORK (ca reperul MTM), nu pe ziua UTC — citirea de după 20:00 NY nu mai cade în ziua următoare
test('daily account observations are bucketed by New York day, so a post-close reading survives the UTC midnight',()=>{const j=setup();
 j.saveSnapshot('a','live',{currency:'EUR',totalValue:100},[],'2026-10-20T19:30:00Z'); // 15:30 NY, 20.10
 j.saveSnapshot('a','live',{currency:'EUR',totalValue:101},[],'2026-10-21T01:00:00Z'); // 21:00 NY, tot 20.10 (UTC e deja 21.10)
 j.saveSnapshot('a','live',{currency:'EUR',totalValue:102},[],'2026-10-21T14:00:00Z'); // 10:00 NY, 21.10
 const xs=JSON.parse(j._store.get('tt_trading212_account_history_v1')).a;assert.equal(xs.length,2,'două zile NY, nu trei zile UTC');assert.equal(xs[0].total,101,'ultima citire din 20.10 NY este cea de după închidere');assert.equal(xs[0].at,'2026-10-21T01:00:00Z');assert.equal(xs[1].total,102);});
test('malformed executions prevent complete coverage even on final page',()=>{const j=setup();const r=j.merge('live:a','live',[fill,{...fill,id:null},{...fill,id:'bad',quantity:0}], 'next',fill.date);assert.equal(r.count,1);assert.equal(r.skipped,2);assert.equal(r.complete,false);j.merge('live:a','live',[],null,fill.date);assert.equal(j.read().accounts['live:a'].complete,false);assert.equal(j.read().accounts['live:a'].rejected,2);});

test('portfolio snapshot replaces failed fields with null instead of retaining stale balances',()=>{const j=setup();j.saveSnapshot('live:a','live',{currency:'EUR',totalValue:100},[{ticker:'AAPL',quantity:1}],fill.date);j.saveSnapshot('live:a','live',null,[],fill.date);const data=JSON.parse(j._store.get('tt_trading212_portfolio_v1'));assert.equal(data['live:a'].summary,null);assert.deepEqual(data['live:a'].positions,[]);assert.equal(JSON.stringify(data).includes('secret'),false);});
test('cash import isolates accounts, deduplicates pages and retains errors without deleting income',()=>{const j=setup(),x={id:'d1',ticker:'AAPL',amount:2,currency:'EUR',date:fill.date};j.mergeCash('live:a','live','dividends',[x],'next',fill.date);j.mergeCash('live:a','live','dividends',[x],null,fill.date);j.cashError('live:a','live','dividends','Permission missing');j.mergeCash('demo:a','demo','dividends',[{...x,amount:10}],null,fill.date);const data=JSON.parse(j._store.get('tt_trading212_cash_v1'));assert.equal(data['live:a'].dividends.items.length,1);assert.equal(data['live:a'].dividends.error,'Permission missing');assert.equal(data['demo:a'].dividends.items[0].amount,10);});
test('invalid monetary rows cannot certify complete history',()=>{const j=setup();const a=j.mergeCash('a','live','transactions',[{id:'bad',amount:null,currency:'EUR',date:fill.date}],null,fill.date);assert.equal(a.complete,false);assert.equal(a.skipped,1);});
test('daily account observations require complete snapshot and do not overwrite with older values',()=>{const j=setup();j.saveSnapshot('a','live',{currency:'EUR',totalValue:120},[],fill.date);j.saveSnapshot('a','live',{currency:'EUR',totalValue:100},[], '2026-10-02T14:00:00Z');j.saveSnapshot('a','live',null,[],fill.date);const xs=JSON.parse(j._store.get('tt_trading212_account_history_v1')).a;assert.equal(xs.length,1);assert.equal(xs[0].total,120);});

test('last complete copy survives a partial sync without masquerading as current data',()=>{
 const j=setup();j.saveSnapshot('a','live',{currency:'EUR',totalValue:100},[{ticker:'A',quantity:1}],fill.date);
 j.saveSnapshot('a','live',{currency:'EUR',totalValue:110},null,'2026-10-03T12:00:00Z');
 j.saveSnapshot('a','live',null,null,'2026-10-03T12:01:00Z');
 const a=JSON.parse(j._store.get('tt_trading212_portfolio_v1')).a;
 assert.equal(a.positions,null);assert.equal(a.summary,null);assert.equal(a.lastComplete.summary.totalValue,100);assert.equal(a.lastComplete.fetchedAt,fill.date);
});
test('selection follows the accepted account even when its timestamp is earlier or snapshot is partial',()=>{
 const j=setup();j.saveSnapshot('old','live',{currency:'EUR'},[], '2026-10-03T12:00:00Z');
 j.saveSnapshot('current','live',{currency:'EUR'},null,'2026-10-03T11:59:50Z');
 const data=JSON.parse(j._store.get('tt_trading212_portfolio_v1'));
 assert.equal(data.old.active,false);assert.equal(data.current.active,true);
});
test('unexecuted cancelled orders do not corrupt coverage; damaged, string-valued and future fills do',()=>{
 const j=setup(),cancelled={id:null,orderId:'o1',quantity:null,price:null,status:'CANCELLED'};
 let r=j.merge('a','live',[fill,cancelled],null,fill.date,{restart:true});assert.equal(r.complete,true);assert.equal(r.excluded,1);
 r=j.merge('a','live',[{...fill,id:'string',quantity:'1'},{...fill,id:'future',date:new Date(Date.now()+3600000).toISOString()}], 'next',fill.date,{restart:true});assert.equal(r.rejected,2);
 r=j.merge('a','live',[],null,fill.date);assert.equal(r.complete,false);assert.equal(r.count,1);
 r=j.merge('a','live',[{...fill,id:'recovered',quantity:1}],null,fill.date,{restart:true});assert.equal(r.complete,true);assert.equal(r.count,2);
});

test('legacy malformed rows are retained but cannot certify complete coverage until corrected',()=>{
 const j=setup();j._store.set('tt_trading212_fills_v1',JSON.stringify({accounts:{a:{environment:'live',items:[{...fill,quantity:'1'}],complete:true}}}));
 let r=j.merge('a','live',[],null,fill.date,{restart:true});assert.equal(r.complete,false);assert.equal(r.rejected,1);assert.equal(j.read().accounts.a.items.length,1);
 r=j.merge('a','live',[fill],null,fill.date,{restart:true});assert.equal(r.complete,true);assert.equal(r.count,1);
});
test('history import errors retain the previous fills and a successful page clears the error',()=>{
 const j=setup();j.merge('a','live',[fill],null,fill.date);j.importState('a','live','error');assert.equal(j.read().accounts.a.items.length,1);assert.equal(j.read().accounts.a.syncError,'Import întrerupt');j.merge('a','live',[fill],null,fill.date,{restart:true});assert.equal(j.read().accounts.a.syncError,null);assert.equal(j.read().accounts.a.syncStatus,'complete');
});

test('only complete snapshots enter exact-account daily position history',()=>{const j=setup(),at=new Date().toISOString(),p={ticker:'A',quantity:1,currentPrice:10,averagePrice:9,instrumentCurrency:'USD',currency:'EUR',unrealized:1};j.saveSnapshot('a','live',{currency:'EUR',totalValue:100},[p],at);j.saveSnapshot('a','live',null,[{...p,currentPrice:100}],at);j.saveSnapshot('d','demo',{currency:'EUR',totalValue:500},[{...p,currentPrice:20}],at);const data=JSON.parse(j._store.get('tt_trading212_position_history_v1'));assert.equal(data.accounts.a.days[0].positions[0].currentPrice,10);assert.equal(data.accounts.d.environment,'demo');assert.equal(data.accounts.d.days[0].positions[0].currentPrice,20);});


function durableStore(initial={accounts:{}}){
 const clone=value=>JSON.parse(JSON.stringify(value));let data=clone(initial),revision=0,pending=null;
 return {peek:()=>({data:clone(data),revision,state:'ready',raw:JSON.stringify(data)}),
  mutate(fn){const next=fn(clone(data));return new Promise((resolve,reject)=>{pending={next,resolve,reject};});},
  confirm(){data=clone(pending.next);revision++;pending.resolve(this.peek());pending=null;},
  reject(){pending.reject(Error('IndexedDB commit failed'));pending=null;}
 };
}
test('durable fills remain complete when the legacy Storage quota is exhausted',async()=>{
 const items=Array.from({length:1600},(_,i)=>({...fill,id:'retained-'+i,amount:i,fxRate:1.08,taxes:[{name:'FX',quantity:0.02,currency:'EUR'}]}));
 const store=durableStore({accounts:{a:{environment:'live',items,complete:true},demo:{environment:'demo',items:[fill]}}}),j=setup({fillsStore:store,quota:()=>true});
 const pending=j.merge('a','live',[{...fill,id:'new',side:'SELL',realized:15}],null,fill.date,{restart:true});
 assert.equal(j.read().accounts.a.items.length,1600);store.confirm();const result=await pending;
 assert.equal(result.count,1601);assert.equal(result.complete,true);assert.equal(j.read().accounts.demo.items.length,1);assert.equal(j._store.has('tt_trading212_fills_v1'),false);
 const retained=j.read().accounts.a.items.find(x=>x.id==='retained-21');assert.equal(retained.amount,21);assert.equal(retained.fxRate,1.08);assert.equal(retained.taxes[0].currency,'EUR');
});
test('a failed durable merge cannot expose unconfirmed fills or complete coverage',async()=>{
 const store=durableStore({accounts:{a:{environment:'live',items:[fill],nextCursor:'unread',complete:false}}}),j=setup({fillsStore:store});
 const pending=j.merge('a','live',[{...fill,id:'unconfirmed'}],null,fill.date);store.reject();await assert.rejects(pending,/IndexedDB commit failed/);
 const account=j.read().accounts.a;assert.equal(account.items.length,1);assert.equal(account.nextCursor,'unread');assert.equal(account.complete,false);
});
test('durable import state is visible only after its transaction succeeds',async()=>{
 const store=durableStore({accounts:{a:{environment:'live',items:[fill],syncStatus:'complete',syncError:null}}}),j=setup({fillsStore:store});
 const failed=j.importState('a','live','error');assert.equal(j.read().accounts.a.syncStatus,'complete');store.reject();await assert.rejects(failed,/IndexedDB commit failed/);assert.equal(j.read().accounts.a.syncError,null);
 const saved=j.importState('a','live','error');store.confirm();await saved;assert.equal(j.read().accounts.a.syncError,'Import întrerupt');assert.equal(j.read().accounts.a.items.length,1);
});
test('snapshot and cash writes use safe quota recovery when the shared writer is available',()=>{
 const writes=[],j=setup({storageWrite:{setItem(storage,key,raw){writes.push(key);storage.setItem(key,raw);}}});
 j.saveSnapshot('a','live',{currency:'EUR',totalValue:100},[],fill.date);j.mergeCash('a','live','dividends',[{id:'d',amount:2,currency:'EUR',date:fill.date}],null,fill.date);j.cashError('a','live','dividends','unavailable');
 assert.ok(writes.includes('tt_trading212_portfolio_v1'));assert.ok(writes.includes('tt_trading212_account_history_v1'));assert.equal(writes.filter(x=>x==='tt_trading212_cash_v1').length,2);
});

for(const [code,expected] of [['fills_loading',/Se încarcă istoricul execuțiilor Trading 212/],['fills_unreadable',/Jurnalul brokerului nu poate fi citit: date indisponibile/]])test('broker journal distinguishes '+code+' from loaded account history',async()=>{
 const host={textContent:'',innerHTML:''},error=Object.assign(Error('date indisponibile'),{code}),fillsStore={peek(){throw error;},ready:async()=>{throw error;}};
 setup({fillsStore,document:{getElementById:id=>id==='t212Journal'?host:null}});await Promise.resolve();
 assert.match(host.textContent,expected);assert.equal(host.innerHTML,'');
});

function journalView(initial={accounts:{}},options={}){
 const nodes={},listeners={};
 for(const [id,value] of [['t212JournalTicker',''],['t212JournalSide','ALL'],['t212JournalReset','']]){
  nodes[id]={value,addEventListener(type,fn){(listeners[id+':'+type]||=[]).push(fn);}};
 }
 const host=nodes.t212Journal={innerHTML:'',textContent:''},data=JSON.parse(JSON.stringify(initial)),store={peek(){if(options.error)throw options.error;return {data:JSON.parse(JSON.stringify(data)),state:'ready'};},ready:async()=>store.peek()};
 const j=setup({document:{getElementById:id=>nodes[id]||null},fillsStore:store,executionReview:options.executionReview});
 return {j,host,nodes,data,change(id,value,type){nodes[id].value=value;for(const fn of listeners[id+':'+type]||[])fn();},listeners};
}
const account=items=>({environment:'live',items,complete:true,fetchedAt:fill.date});
test('broker journal finds yesterday UHS SELL in the full confirmed ledger and reset restores every execution',()=>{
 const initial={accounts:{live:account([{...fill,id:'u1',ticker:'UHS_US_EQ',side:'SELL'},{...fill,id:'u2',ticker:'UHS_US_EQ'},fill])}},v=journalView(initial),before=JSON.stringify(v.data);
 // A stale quota-limited legacy mirror must never decide the visible executions.
 v.j._store.set('tt_trading212_fills_v1',JSON.stringify({accounts:{live:account([fill])}}));
 assert.match(v.host.innerHTML,/Afișate: 3 din 3 execuții/);assert.match(v.host.innerHTML,/<td>SELL<\/td>/);
 v.change('t212JournalTicker',' uhs ','input');v.change('t212JournalSide','SELL','change');
 assert.match(v.host.innerHTML,/Afișate: 1 din 3 execuții/);assert.match(v.host.innerHTML,/<td>UHS_US_EQ<\/td><td>SELL<\/td>/);assert.doesNotMatch(v.host.innerHTML,/<td>AAPL_US_EQ<\/td>/);assert.doesNotMatch(v.host.innerHTML,/<td>BUY<\/td>/);
 v.change('t212JournalReset','','click');assert.equal(v.nodes.t212JournalTicker.value,'');assert.equal(v.nodes.t212JournalSide.value,'ALL');assert.match(v.host.innerHTML,/Afișate: 3 din 3 execuții/);assert.equal(JSON.stringify(v.data),before);
 assert.equal(v.listeners['t212JournalTicker:input'].length,1);
});
test('broker journal distinguishes an empty ticker filter from no imported history',()=>{
 const v=journalView({accounts:{live:account([{...fill,ticker:'UHS_US_EQ',side:'SELL'}])}});
 v.change('t212JournalTicker','UHS','input');v.change('t212JournalSide','BUY','change');
 assert.match(v.host.innerHTML,/Afișate: 0 din 1 execuții/);assert.match(v.host.innerHTML,/Nicio execuție nu corespunde filtrelor/);assert.doesNotMatch(v.host.innerHTML,/Nu există încă execuții importate/);
 const empty=journalView({accounts:{live:account([])}});assert.match(empty.host.innerHTML,/Afișate: 0 din 0 execuții/);assert.match(empty.host.innerHTML,/Nu există încă execuții importate pentru acest cont/);assert.doesNotMatch(empty.host.innerHTML,/Nicio execuție nu corespunde filtrelor/);
});
test('ticker filters preserve active-account and live/demo isolation',()=>{
 const v=journalView({accounts:{old:account([{...fill,ticker:'OLD_ACCOUNT'}]),current:account([{...fill,ticker:'UHS_US_EQ',side:'SELL'}]),demo:{...account([{...fill,ticker:'DEMO_ONLY'}]),environment:'demo'}}});
 v.j._store.set('tt_trading212_portfolio_v1',JSON.stringify({old:{environment:'live',active:false,fetchedAt:'2026-10-03T12:00:00Z'},current:{environment:'live',active:true,fetchedAt:fill.date}}));v.j.render();
 assert.doesNotMatch(v.host.innerHTML,/<td>OLD_ACCOUNT<\/td>/);assert.match(v.host.innerHTML,/<td>DEMO_ONLY<\/td>/);assert.match(v.host.innerHTML,/Trading 212 · INVEST · 1 execuții/);assert.match(v.host.innerHTML,/Trading 212 · DEMO · 1 execuții/);
 v.change('t212JournalTicker','UHS','input');assert.match(v.host.innerHTML,/Afișate: 1 din 1 execuții/);assert.match(v.host.innerHTML,/Afișate: 0 din 1 execuții/);assert.doesNotMatch(v.host.innerHTML,/<td>DEMO_ONLY<\/td>/);
 v.j._store.set('tt_trading212_portfolio_v1',JSON.stringify({new:{environment:'live',active:true,fetchedAt:fill.date}}));v.j.render();assert.match(v.host.innerHTML,/Trading 212 · INVEST · 0 execuții/);assert.doesNotMatch(v.host.innerHTML,/<td>UHS_US_EQ<\/td>/);assert.doesNotMatch(v.host.innerHTML,/<td>OLD_ACCOUNT<\/td>/);
});
test('ticker search treats characters literally and safely escapes broker row text',()=>{
 const ticker='UHS[<img src=x onerror=alert(1)>',v=journalView({accounts:{live:account([{...fill,ticker,side:'SELL'}])}});
 v.change('t212JournalTicker','[','input');assert.match(v.host.innerHTML,/Afișate: 1 din 1 execuții/);assert.match(v.host.innerHTML,/UHS\[&lt;img src=x onerror=alert\(1\)&gt;/);assert.doesNotMatch(v.host.innerHTML,/<img/);
 v.change('t212JournalSide','unknown','change');assert.match(v.host.innerHTML,/Afișate: 1 din 1 execuții/);
});
test('broker filtering leaves FIFO review based on the full confirmed account',()=>{
 const sizes=[],items=[{...fill,id:'buy',ticker:'UHS_US_EQ'},{...fill,id:'sell',ticker:'UHS_US_EQ',side:'SELL'},fill],v=journalView({accounts:{live:account(items)}},{executionReview:{fifo(xs){sizes.push(xs.length);return {matches:[],open:[],unmatched:[]};}}});
 v.change('t212JournalTicker','UHS','input');v.change('t212JournalSide','SELL','change');assert.match(v.host.innerHTML,/Afișate: 1 din 3 execuții/);assert.ok(sizes.every(n=>n===3));assert.equal(JSON.stringify(v.data.accounts.live.items),JSON.stringify(items));
});
for(const code of ['fills_loading','fills_unreadable'])test('filter changes cannot turn '+code+' into an empty or stale ledger',()=>{
 const v=journalView({accounts:{live:account([{...fill,ticker:'UHS_US_EQ',side:'SELL'}])}},{error:Object.assign(Error('date indisponibile'),{code})});
 v.j._store.set('tt_trading212_fills_v1',JSON.stringify({accounts:{live:account([fill])}}));v.change('t212JournalTicker','UHS','input');v.change('t212JournalSide','SELL','change');
 assert.match(v.host.textContent,code==='fills_loading'?/Se încarcă istoricul/:/Jurnalul brokerului nu poate fi citit/);assert.equal(v.host.innerHTML,'');
});
test('journal exposes labelled ticker and side controls and explains where broker sales appear',()=>{
 const html=readFileSync('journal/index.html','utf8');assert.match(html,/for="t212JournalTicker">Caută ticker/);assert.match(html,/id="t212JournalTicker"[^>]+type="search"/);assert.match(html,/id="t212JournalSide"[^>]*><option value="ALL">Toate operațiile/);assert.match(html,/<option value="SELL">Vânzări · SELL/);assert.match(html,/Vânzările brokerului apar aici ca <strong>SELL<\/strong>/);assert.match(html,/Secțiunea „Închise” de mai jos aparține jurnalului manual/);
});

for(const [state,caption] of [[{syncStatus:'loading',syncError:null},/Actualizare în curs · execuțiile confirmate sunt păstrate/],[{syncStatus:'error',syncError:'latest head unavailable'},/Import întrerupt · execuțiile confirmate sunt păstrate/]])test('broker journal shows incomplete refresh honestly while retaining confirmed execution values: '+state.syncStatus,()=>{
 const data={accounts:{live:{...account([{...fill,ticker:'UHS_US_EQ',side:'SELL',realized:3}]),...state}}},v=journalView(data),before=JSON.stringify(v.data);
 assert.match(v.host.innerHTML,caption);assert.doesNotMatch(v.host.innerHTML,/Istoricul disponibil a fost parcurs integral/);assert.match(v.host.innerHTML,/<td>UHS_US_EQ<\/td><td>SELL<\/td>/);assert.match(v.host.innerHTML,/<td>3 EUR<\/td>/);assert.doesNotMatch(v.host.innerHTML,/execuții incompatibile/);v.change('t212JournalSide','SELL','change');assert.equal(JSON.stringify(v.data),before);
});

// 15.10.2026 (el: „de ce apar doar cumpărările și nu și vânzările”; contul lui: BUY 1365, SELL 0, respinse 1118):
// Trading 212 trimite vânzările cu cantitate negativă, iar validExecution cerea quantity>0 ⇒ toate vânzările erau respinse tăcut.
test('o vânzare Trading 212 cu cantitate negativă intră în jurnal ca SELL cu cantitatea pozitivă',()=>{
 const j=setup(),sale={...fill,id:'s1',side:'SELL',quantity:-2,price:240,realized:12};
 const r=j.merge('live:a','live',[fill,sale],null,fill.date,{restart:true});
 assert.equal(r.count,2);assert.equal(r.rejected,0);assert.equal(r.complete,true);
 const stored=j.read().accounts['live:a'].items.find(x=>x.id==='s1');assert.equal(stored.side,'SELL');assert.equal(stored.quantity,2);assert.equal(stored.realized,12);
});
test('cantitățile ambigue rămân respinse: cumpărare negativă, zero sau sens lipsă',()=>{
 const j=setup();
 const r=j.merge('live:a','live',[{...fill,id:'b-neg',quantity:-1},{...fill,id:'s-zero',side:'SELL',quantity:0},{...fill,id:'no-side',side:null,quantity:-1}],null,fill.date,{restart:true});
 assert.equal(r.count,0);assert.equal(r.rejected,3);assert.equal(r.complete,false);
});
test('tabelul execuțiilor arată data în ora României, prețul la ban și rezultatele cu o zecimală (fără ISO brut sau 391.40000000000003)',()=>{
 const x={...fill,id:'x1',ticker:'MSFT_US_EQ',side:'SELL',date:'2026-09-19T14:30:00Z',quantity:0.123456,price:391.40000000000003,realized:12.345,amount:48.3219};
 const v=journalView({accounts:{live:account([x])}}),html=v.host.innerHTML;
 assert.match(html,/<td>19\.09\.2026, 17:30<\/td>/);assert.doesNotMatch(html,/2026-09-19T14:30/);
 assert.match(html,/<td>0,123456<\/td>/);assert.match(html,/<td>391,4 USD<\/td>/);assert.doesNotMatch(html,/391\.4000/);
 assert.match(html,/<td>12,3 EUR<\/td>/);assert.match(html,/<td>48,3 EUR<\/td>/);
});
