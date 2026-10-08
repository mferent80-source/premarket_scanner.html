import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
function setup(){const store=new Map();const context={localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)}};vm.createContext(context);vm.runInContext(readFileSync('lib/trading212-snapshot.js','utf8'),context);vm.runInContext(readFileSync('lib/trading212-journal.js','utf8'),context);context.T212J._store=store;return context.T212J;}
const fill={id:'f1',ticker:'AAPL_US_EQ',date:'2026-10-02T15:00:00Z',side:'BUY',quantity:0.5,price:230,priceCurrency:'USD',currency:'EUR',realized:null};
test('broker fills deduplicate and retain currencies and isolated accounts',()=>{const j=setup();j.merge('live:a','live',[fill],null,fill.date);j.merge('live:a','live',[fill,{...fill,id:'f2',side:'SELL',realized:3}],null,fill.date);j.merge('demo:a','demo',[fill],null,fill.date);j.merge('live:b','live',[fill],null,fill.date);const data=j.read();assert.equal(data.accounts['live:a'].items.length,2);assert.equal(data.accounts['demo:a'].items.length,1);assert.equal(data.accounts['live:b'].items.length,1);assert.equal(data.accounts['live:a'].items[0].realized,null);assert.equal(data.accounts['live:a'].items[0].priceCurrency,'USD');assert.equal(data.accounts['live:a'].items[0].currency,'EUR');});
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
