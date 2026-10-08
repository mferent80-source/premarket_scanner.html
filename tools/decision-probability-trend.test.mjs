import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {core,fixture,plain} from './holdings-learning-fixtures.mjs';
const NOW=Date.parse('2026-10-08T12:00:00Z');
function boot(){return core(['lib/holdings-forecast-monitor.js','lib/decision-validation.js','lib/decision-verdict.js','lib/decision-insights.js']);}
function market(c,n=60,options={}){const item=plain(fixture(c,n,options));item.identity.kind='market';for(const r of item.ledger.entries){r.kind='market';r.verification.checkedAt=NOW;r.outcome.checkedAt=NOW;r.outcome.retrievedAt=NOW;}return item;}
function bars(n=240){return Array.from({length:n},(_,i)=>({t:i+1,o:88.05+i*.05,h:88.35+i*.05,l:87.85+i*.05,c:88.05+i*.05,v:1e6}));}
function packet(c,extra={}){const t=c.TTDecisionVerdict.trend(bars());return {symbol:'TEST',currency:'USD',kind:'market',mode:'momentum',ts:NOW,sourceDate:'2026-10-07',sourceTimezone:'America/New_York',sourceCloseMinutes:960,price:t.price,atr:2,rs:3,rvol:1.4,actionable:true,state:'ARMED',entryLow:99,entryHigh:101,stop:95,target:113,trend:t,...extra};}
const ids=['neural','boosting','hmm','isolation','quantile','garch','knn'];
function model(c,x=packet(c)){return {symbol:x.symbol,currency:x.currency,kind:x.kind,asOf:x.sourceDate,generatedAt:NOW,historyKey:x.trend.historyKey,available:7,total:7,state:'up',title:'Raport actual',direction:2,cards:ids.map(id=>({id,name:id,available:true,eligible:true,direction:2,...(['neural','boosting'].includes(id)?{probabilities:[.1,.2,.7]}:{}),...(id==='knn'?{neighborSupport:[.1,.2,.7]}:{})}))};}
function verdict(c,x=packet(c),extra={}){return c.TTDecisionVerdict.build({purpose:'entry',candidate:x,risk:{verdict:'TRADE'},...extra},NOW);}

test('prospective probability scores expose an overconfident model despite 75 percent class accuracy',()=>{
 const c=boot(),item=market(c,80),v=c.TTDecisionValidation.build(item,{now:NOW}),r=v.rows.find(r=>r.model==='neural');
 assert.equal(r.report.accuracy,.75);assert.equal(r.probability.enough,true);assert.equal(r.probability.noEdge,true);assert.ok(r.probability.loss>r.probability.referenceLoss);assert.ok(r.probability.brier<r.probability.referenceBrier);assert.equal(r.canSupportProbability,false);
 const band=r.probability.bins[4];assert.equal(band.n,80);assert.equal(band.correct,60);assert.equal(band.observed,.75);assert.ok(Math.abs(band.mean-.98)<1e-12);
});
test('better probability scores remain descriptive and do not recalibrate the original percentages',()=>{
 const c=boot(),item=market(c,80);for(const r of item.ledger.entries)r.estimate.probabilities=[0,1,2].map(k=>k===r.estimate.classIndex?.65:.175);
 const before=JSON.stringify(item),p=c.TTDecisionValidation.build(item,{now:NOW}).rows.find(r=>r.model==='neural').probability;
 assert.equal(p.state,'observed');assert.ok(p.loss<p.referenceLoss);assert.ok(p.brier<p.referenceBrier);assert.equal(p.bins[3].n,80);assert.equal(JSON.stringify(item),before);
});
test('the reference uses only already known class outcomes and has an exact chronological score',()=>{
 const c=boot(),item=market(c,6),p=c.TTDecisionValidation.build(item,{now:NOW}).rows.find(r=>r.model==='neural').probability;
 const expected=-(Math.log(1/3)+Math.log(1/4)+Math.log(1/5)+Math.log(2/6)+Math.log(2/7)+Math.log(2/8))/6;
 assert.ok(Math.abs(p.referenceLoss-expected)<1e-12);assert.equal(p.enough,false);assert.equal(p.state,'limited');
});
test('overlap, restored rows, legacy versions and missing probability vectors cannot inflate probability evidence',()=>{
 const c=boot(),item=market(c,40,{step:1}),v=c.TTDecisionValidation.build(item,{now:NOW});assert.ok(v.rows.find(r=>r.model==='neural').probability.n<20);
 const restored=market(c,40);restored.ledger.entries.forEach(r=>r.restoredAt=NOW);assert.equal(c.TTDecisionValidation.build(restored,{now:NOW}).rows.find(r=>r.model==='neural').probability.n,0);
 const legacy=market(c,40);for(const r of legacy.ledger.entries)delete r.estimate.probabilities;const p=c.TTDecisionValidation.build(legacy,{now:NOW}).rows.find(r=>r.model==='neural').probability;assert.equal(p.n,0);assert.equal(p.missing,40);
});
test('Wilson limits match the published formula, stay bounded at extremes and reject invalid samples',()=>{
 const w=boot().TTDecisionValidation.wilson;const [lo,hi]=w(80,100);assert.ok(Math.abs(lo-.7111708344)<1e-8);assert.ok(Math.abs(hi-.8666330667)<1e-8);
 assert.equal(w(0,0),null);assert.equal(w(11,10),null);assert.ok(w(0,10)[0]>=0);assert.ok(w(10,10)[1]<=1);
});
test('current account evidence detects poor probabilities without using foreign, stale or synthetic results',()=>{
 const c=boot(),v={...c.TTDecisionValidation.build(market(c,80),{now:NOW}),readAt:NOW},x=packet(c),m=model(c,x);
 const r=verdict(c,x,{ai:m,validation:v,validationScope:v.identity.scope});assert.equal(r.code,'WATCH');assert.ok(r.cautions.some(x=>x.id==='ai-probability'));
 for(const change of [{readAt:NOW-60001},{simulation:true},{identity:{...v.identity,scope:'foreign'}}]){const clean=verdict(c,x,{ai:m,validation:{...v,...change},validationScope:v.identity.scope});assert.equal(clean.code,'PLAN');assert.equal(clean.probabilities[0].quality,null);}
 assert.doesNotMatch(JSON.stringify(c.TTDecisionVerdict.publicFacts(r)),/private-account|ai-probability|Brier|referenceLoss|probability-audit/);
});
test('probability distributions keep KNN frequencies distinct and omit malformed vectors',()=>{
 const c=boot(),x=packet(c),m=model(c,x),r=verdict(c,x,{ai:m});assert.equal(r.probabilities.length,3);assert.match(r.probabilities.find(p=>p.id==='knn').calibration,/necalibrate/);assert.ok(Math.abs(r.probabilities[0].gap-.5)<1e-12);
 m.cards[0].probabilities=[.8,.8,.8];assert.equal(verdict(c,x,{ai:m}).probabilities.length,2);
});
test('a below-stop scenario is blocked and a price beyond maximum entry requires a new plan',()=>{
 const c=boot(),x=packet(c);assert.equal(verdict(c,x).canPlan,true);
 const below=verdict(c,{...x,entryLow:105,entryHigh:106,stop:101,target:118});assert.equal(below.code,'BLOCKED');assert.equal(below.canPlan,false);assert.ok(below.blockers.some(x=>x.id==='price-invalidated'));
 const beyond=verdict(c,{...x,entryLow:98,entryHigh:99,stop:95,target:110});assert.equal(beyond.code,'WATCH');assert.equal(beyond.canPlan,false);assert.ok(beyond.cautions.some(x=>x.id==='price-extension'));
 const stale=verdict(c,{...x,ts:NOW-1800001,entryLow:105,entryHigh:106,stop:101,target:118});assert.equal(stale.code,'VERIFY');assert.ok(!stale.blockers.some(x=>x.id==='price-invalidated'));
});
test('trend compares two disjoint return windows and counts only verified directions',()=>{
 const c=boot(),x=packet(c),r=verdict(c,x),t=r.technical;assert.equal(r.trendDetail.agreement,3);assert.equal(r.trendDetail.known,3);assert.equal(r.trendDetail.comparison.changes.length,0);
 const b=bars(),expected=(b.at(-6).c/b.at(-11).c-1)*100;assert.ok(Math.abs(t.comparison.ret5-expected)<1e-12);
 const short=c.TTDecisionVerdict.trend(bars(60)),d=c.TTDecisionVerdict.trendDetail({atr:2},short);assert.equal(d.known,2);assert.equal(d.agreement,2);assert.equal(short.long,'unknown');assert.equal(short.comparison.medium,'up');
});
test('pullbacks and rebounds are distinguished from a reversal of the medium trend',()=>{
 const c=boot(),V=c.TTDecisionVerdict;
 assert.match(V.trendDetail({atr:2},{short:'down',medium:'up',long:'up',price:99,ema21:100,slope21:-.1}).regime,/Retragere/);
 assert.match(V.trendDetail({atr:2},{short:'up',medium:'down',long:'down',price:101,ema21:100,slope21:.1}).regime,/Revenire/);
 assert.equal(V.trendDetail({},packet(c).trend).moveATR,null);
});
test('tracker describes additions and resolved obstacles without writing history or mixing accounts and setups',()=>{
 const c=boot(),tracker=c.TTDecisionInsights.createTracker(),base=verdict(c),watch=verdict(c,packet(c,{rvol:.8}));
 assert.equal(tracker.observe(base,'a'),null);const change=tracker.observe(watch,'a');assert.equal(change.from,'PLAN');assert.equal(change.to,'WATCH');assert.match(change.added[0],/Volumul/);
 const resolved=tracker.observe(base,'a');assert.match(resolved.resolved[0],/Volumul/);assert.equal(tracker.observe(watch,'b'),null);assert.equal(tracker.observe({...watch,setup:'reversal'},'a'),null);
 tracker.clear();assert.equal(tracker.observe(base,'a'),null);
});
test('compact probability disclosures suppress low-sample frequencies and escape all labels',()=>{
 const c=boot(),x=packet(c),m=model(c,x),v={...c.TTDecisionValidation.build(market(c,6),{now:NOW}),readAt:NOW};m.cards[0].name='<img src=x>';const r=verdict(c,x,{ai:m,validation:v,validationScope:v.identity.scope}),html=c.TTDecisionInsights.probabilities(r);
 assert.match(html,/&lt;img src=x&gt;/);assert.doesNotMatch(html,/<img/);assert.match(html,/observații necesare/);assert.doesNotMatch(html,/Wilson 95%:/);assert.match(html,/Nu estimează atingerea țintei înaintea stopului/);assert.match(html,/<meter/);
 assert.match(c.TTDecisionInsights.trend(r),/Direcțiile verificate sunt aceleași/);assert.doesNotMatch(c.TTDecisionInsights.trend(r),/<details[^>]*\bopen/);
});
