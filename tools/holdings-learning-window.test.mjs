import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const c={Date,Intl,Math,JSON,Number,Object,Array,String,Map,Set,Error,console};c.window=c;vm.createContext(c);
vm.runInContext(readFileSync('lib/exchange-calendar.js','utf8'),c);vm.runInContext(readFileSync('holdings/learning.js','utf8'),c);
const W=c.HoldingsAutoLearningUI.captureWindow,src={asOf:'2026-10-14',timezone:'America/New_York',closeMinutes:960};
const iso=t=>new Date(t).toISOString();

test('seara, în timpul sesiunii de 15.10: fereastra pentru EOD 14.10 e închisă, următoarea e 15.10 23:00 → 16.10 16:30 (ora României)',()=>{
 const w=W(src,Date.parse('2026-10-15T18:00:00Z'));
 assert.equal(w.open,false);assert.equal(iso(w.closesAt),'2026-10-15T13:30:00.000Z');
 assert.equal(iso(w.nextOpensAt),'2026-10-15T20:15:00.000Z','închiderea + 15 minute, când apare lumânarea EOD');assert.equal(iso(w.nextClosesAt),'2026-10-16T13:30:00.000Z');
});
test('dimineața, înainte de deschidere: fereastra e deschisă, la fel ca regula HoldingsForecast.timely',()=>{
 const w=W(src,Date.parse('2026-10-15T05:00:00Z'));assert.equal(w.open,true);
 assert.equal(c.ExchangeCalendar.beforeNextOpen({...src},Date.parse('2026-10-15T05:00:00Z')),true);
 assert.equal(c.ExchangeCalendar.beforeNextOpen({...src},Date.parse('2026-10-15T18:00:00Z')),false);
});
test('înainte de închiderea zilei EOD fereastra nu e încă deschisă',()=>{
 assert.equal(W(src,Date.parse('2026-10-14T19:00:00Z')).open,false);assert.equal(W(src,Date.parse('2026-10-14T20:10:00Z')).open,false,'la 23:10 lumânarea nu există încă');assert.equal(W(src,Date.parse('2026-10-14T20:16:00Z')).open,true);
});
test('vineri: fereastra ține peste weekend până luni la deschidere',()=>{
 const w=W({...src,asOf:'2026-10-16'},Date.parse('2026-10-17T10:00:00Z'));
 assert.equal(w.open,true);assert.equal(iso(w.closesAt),'2026-10-19T13:30:00.000Z');
});
test('fără calendar sau sursă incompletă nu se afișează nimic',()=>{
 assert.equal(W({asOf:'2026-10-14'},Date.now()),null);
});
