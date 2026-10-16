import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const c={};vm.createContext(c);for(const f of ['lib/exchange-calendar.js','lib/daily-series.js','lib/holdings-neural.js','lib/holdings-neural-evaluation.js','lib/holdings-classifier.js','lib/holdings-forecast.js'])vm.runInContext(readFileSync(f,'utf8'),c);
const F=c.HoldingsForecast,C=c.HoldingsClassifier;
test('I-637: votul clasificatorului se notează înghețat, se verifică după 5 sesiuni și se punctează față de reperul lui',()=>{
 const e={scope:'account',ticker:'TEST_US_EQ',symbol:'TEST',currency:'USD',kind:'market'},t=Date.parse('2026-10-02T13:30:00Z'),capturedAt=t+8*3600000;
 const input={model:'classifier',modelVersion:C.VERSION,trainedAt:capturedAt-1000,state:'no-edge',source:{t,asOf:'2026-10-02',timezone:'America/New_York',closeMinutes:960,close:100,atrPct:1},estimate:{classIndex:2,baselineClass:1,probabilities:[.2,.3,.5]}};
 const r=F.project(input,e,capturedAt);assert.ok(r);assert.ok(F.validEntry(r,e,capturedAt));input.estimate.classIndex=0;assert.equal(r.estimate.classIndex,2);
 const days=['02','05','06','07','08','09'],later=Date.parse('2026-10-09T22:00:00Z'),b=days.map((day,i)=>({t:Date.parse('2026-10-'+day+'T13:30:00Z'),o:100+i,h:102+i,l:99+i,c:100+i,v:10000})),out=F.verify(r,{symbol:e.symbol,currency:e.currency,timezone:r.source.timezone,bars:b,asOf:'2026-10-09',closeMinutes:960,retrievedAt:later},later);
 assert.equal(F.metric(out).correct,true);assert.equal(F.report([out]).find(x=>x.model==='classifier').n,1);
});
test('I-637: clasificatorul e în registru, dar NU în modelele verdictului (cele 7 carduri rămân neschimbate)',()=>{
 assert.equal(F.LEDGER.classifier,C.VERSION);assert.equal(Object.hasOwn(F.VERSIONS,'classifier'),false);
 const bad={model:'classifier',modelVersion:'holdings-clf-v1',trainedAt:1,state:'x',source:{},estimate:{classIndex:2,baselineClass:1}};assert.equal(F.project(bad,{scope:'a',ticker:'T',symbol:'T',currency:'USD',kind:'synthetic'},2),null);
});
