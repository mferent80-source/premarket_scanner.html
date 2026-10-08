import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function setup(){const window={},c=vm.createContext({window,Intl,Date});for(const f of ['lib/trading212-performance.js','lib/trading212-portfolio.js'])vm.runInContext(readFileSync(f,'utf8'),c);return {P:window.T212Portfolio,F:window.T212Performance};}
const p=(ticker,pnl,extra={})=>({ticker,name:ticker,quantity:1,currency:'EUR',instrumentCurrency:'USD',averagePrice:100,currentPrice:80,value:80,unrealized:pnl,...extra});
const wallet={currency:'EUR',totalValue:1000,unrealized:-20};
test('wallet P&L determines winners and losers, independent of instrument price direction',()=>{
 const {P}=setup(),r=P.build([p('A',-20),p('B',-5,{currentPrice:110,value:90}),p('C',10,{currentPrice:90,value:100}),p('D',0),p('E',null)],wallet),s=r.groups[0];
 assert.equal(s.loss,-25);assert.equal(s.gain,10);assert.equal(s.total,-15);assert.equal(s.gains,1);assert.equal(s.losses,2);assert.equal(s.flat,1);assert.equal(s.missing,1);
 assert.equal(r.rows[1].status,'loss');assert.ok(r.rows[1].priceReturn>0);assert.equal(r.rows[2].status,'gain');assert.ok(r.rows[2].priceReturn<0);
 assert.match(P.positionsMarkup(r,{currency:'EUR'}).html,/semne diferite/);assert.equal(s.complete,false);assert.equal(s.gap,null);
});
test('a 20 percent price loss needs 25 percent to regain the average, not 20',()=>{
 const {P}=setup(),a=P.build([p('A',-20)],wallet).rows[0];assert.ok(Math.abs(a.priceReturn+20)<1e-10);assert.equal(a.recovery,25);assert.equal(a.weight,8);
});
test('weights use account equity including cash, never a subtotal of visible holdings',()=>{
 const {P}=setup(),r=P.build([p('A',-20),p('B',30,{value:120})],wallet);assert.equal(r.rows[0].weight,8);assert.equal(r.rows[1].weight,12);
 assert.equal(P.select(r,{currency:'EUR',filter:'gain'})[0].weight,12);assert.equal(r.groups[0].total,10);
});
test('currency groups never combine wallet sums, and foreign balances cannot become account weights',()=>{
 const {P}=setup(),r=P.build([p('EUR',-20),p('USD',200,{currency:'USD',value:1000}),p('BAD',999,{currency:'GBp'})],wallet);
 assert.equal(r.groups.find(x=>x.currency==='EUR').total,-20);assert.equal(r.groups.find(x=>x.currency==='USD').total,200);assert.equal(r.rows[1].weight,null);assert.equal(r.rows[2].pnl,null);assert.equal(r.unknownCurrency,1);
 assert.equal(P.select(r,{currency:'EUR'}).length,1);assert.equal(P.select(r,{currency:'unknown'})[0].ticker,'BAD');
});
test('GBp prices keep their denomination; ratios do not convert pence to pounds or to wallet currency',()=>{
 const {P}=setup(),row=P.build([p('GBp',-2,{instrumentCurrency:'GBp',averagePrice:100,currentPrice:80,value:9})],wallet).rows[0];
 assert.ok(Math.abs(row.priceReturn+20)<1e-10);assert.equal(row.recovery,25);assert.equal(row.pnl,-2);assert.ok(Math.abs(row.weight-.9)<1e-10);
});
test('missing prices, currency and account equity leave percentages unavailable',()=>{
 const {P}=setup();for(const extra of [{averagePrice:null},{averagePrice:0},{currentPrice:null},{instrumentCurrency:null},{averagePrice:'100'},{currentPrice:Infinity}])assert.equal(P.build([p('A',-20,extra)],wallet).rows[0].priceReturn,null);
 for(const summary of [null,{currency:'USD',totalValue:1000},{currency:'EUR',totalValue:0},{currency:'EUR',totalValue:'1000'}])assert.equal(P.build([p('A',-20)],summary).rows[0].weight,null);
 const r=P.build([p('A',0,{currency:null})]);assert.equal(r.rows[0].status,'unknown');assert.match(P.positionsMarkup(r,{currency:'unknown'}).html,/Monedă indisponibilă/);
});
test('zero P&L is neutral, and a zero reported price never produces an infinite recovery',()=>{
 const {P}=setup(),r=P.build([p('A',0),p('B',-100,{currentPrice:0,value:0})],wallet);assert.equal(r.rows[0].status,'flat');assert.equal(r.rows[1].priceReturn,-100);assert.equal(r.rows[1].recovery,null);
 assert.doesNotMatch(P.positionsMarkup(r,{currency:'EUR'}).html,/Infinity|NaN/);
});
test('duplicate instruments and invalid quantities are excluded rather than double-counting',()=>{
 const {P}=setup(),r=P.build([p('D',-20),p('D',-20),p('ZERO',-100,{quantity:0}),p('STR',-100,{quantity:'1'}),p('OK',5)],wallet);
 assert.equal(r.rows.length,1);assert.equal(r.rejected,3);assert.equal(r.groups[0].total,5);assert.equal(r.groups[0].complete,false);
});
test('unknown P&L is visible without becoming a neutral result or invented zero',()=>{
 const {P}=setup(),r=P.build([p('M',null),p('S','-20'),p('N',NaN),p('I',Infinity)],wallet);assert.equal(r.groups[0].known,0);assert.equal(r.groups[0].total,null);
 assert.equal(P.select(r,{currency:'EUR',filter:'unknown'}).length,4);assert.equal(P.select(r,{currency:'EUR',filter:'flat'}).length,0);assert.match(P.summaryMarkup(r,'EUR'),/Acoperire parțială/);
});
test('filters are exact by outcome and currency, sorting puts missing metrics last and never mutates source data',()=>{
 const {P}=setup(),xs=[p('A',-10,{name:'Companie Alfa'}),p('B',25,{currentPrice:120}),p('C',null),p('U',999,{currency:'USD'})],before=JSON.stringify(xs),r=P.build(xs,wallet);
 assert.deepEqual(Array.from(P.select(r,{currency:'EUR',sort:'loss'}),p=>p.ticker),['A','B','C']);
 assert.deepEqual(Array.from(P.select(r,{currency:'EUR',sort:'gain'}),p=>p.ticker),['B','A','C']);
 assert.equal(P.select(r,{currency:'EUR',filter:'gain',search:'alfa'}).length,0);assert.equal(P.select(r,{currency:'EUR',search:'ALFA'})[0].ticker,'A');assert.equal(JSON.stringify(xs),before);
});
test('shares use only same-currency gains or losses, not net P&L which can cancel to zero',()=>{
 const {P}=setup(),r=P.build([p('A',-80),p('B',-20),p('C',100)],wallet),html=P.summaryMarkup(r,'EUR');assert.equal(r.groups[0].total,0);
 assert.match(html,/80 % din pierderile raportate/);assert.match(html,/100 % din câștigurile raportate/);
});
test('reconciliation reports only complete same-currency snapshots and rejects numeric overflow',()=>{
 const {P}=setup(),r=P.build([p('A',-20)],{...wallet,unrealized:-25});assert.equal(r.groups[0].gap,-5);assert.match(P.summaryMarkup(r,'EUR'),/Diferență față/);
 const partial=P.build([p('A',-20),p('B',null)],wallet);assert.equal(partial.groups[0].gap,null);
 const huge=P.build([p('A',1e308),p('B',1e308)],wallet);assert.equal(huge.groups[0].overflow,true);assert.equal(huge.groups[0].gain,null);assert.match(P.summaryMarkup(huge,'EUR'),/limitele numerice/);
});
test('untrusted broker labels cannot inject markup or attributes into cards and rankings',()=>{
 const {P}=setup(),r=P.build([p('A\"><img src=x onerror=alert(1)>',-5,{name:'<script>alert(1)</script>'})],wallet);
 const html=P.summaryMarkup(r,'EUR')+P.positionsMarkup(r,{currency:'EUR'}).html;assert.doesNotMatch(html,/<img|<script|data-position="A">/);assert.match(html,/&lt;script&gt;/);
});
test('realized rankings use exact reported SELL results, period filters and partial-history disclosure',()=>{
 const {P,F}=setup(),d=P.demo(),snapshot={environment:'live',summary:d.summary,positions:d.positions};
 const all=F.build({scope:d.scope,snapshot,account:d.account,selectedCurrency:'EUR'}),a=F.analyse(all);assert.equal(all.total,64.5);assert.equal(a.symbols.find(s=>s.ticker==='FICTIV_A_US_EQ').total,-50);
 const recent=F.build({scope:d.scope,snapshot,account:d.account,days:30});assert.equal(recent.total,30);assert.equal(recent.count,3);
 const partial=F.build({scope:d.scope,snapshot,account:{...d.account,complete:false}});assert.match(P.realizedMarkup(partial),/IMPORT PARȚIAL/);assert.match(P.realizedMarkup(partial),/nu poziții închise/);
});
test('demo broker history requires explicit environment and cannot enter the default Invest report',()=>{
 const {P,F}=setup(),d=P.demo(),snapshot={environment:'demo',summary:d.summary,positions:d.positions},account={...d.account,environment:'demo'};
 assert.equal(F.build({scope:'demo',snapshot,account}).state,'missing');assert.equal(F.build({scope:'demo',snapshot,account,environment:'demo'}).total,64.5);
 assert.equal(F.build({scope:'demo',snapshot,account:{...account,environment:'live'},environment:'demo'}).state,'missing');
});
