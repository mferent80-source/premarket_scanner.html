// 19.10.2026 (I-708): calendarul burselor Europa — anul următor la toate piețele, ziua scurtă fără eroare, fusul indicelui după simbol.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

function load(files=['lib/exchange-calendar.js','lib/daily-series.js']){
  const c={console,Intl,Date,Map,Set,Math,Number,Array,Object,Error,JSON,String,RegExp};c.window=c;vm.createContext(c);
  for(const file of files)vm.runInContext(readFileSync(file,'utf8'),c,{filename:file});
  return c;
}
const at=s=>Date.parse(s);
// Piețele cerute de Acțiuni Europa (universe.js) ⇒ id-ul din calendar.
const EUROPE={DE:'XETRA',FR:'PARIS',NL:'AMSTERDAM',IT:'MILAN',ES:'MADRID',UK:'LSE',CH:'SIX',DK:'COPENHAGEN',AT:'VIENNA',IE:'DUBLIN'};

// Ce ani lipsesc la data `now`: anul curent mereu; de la 1 noiembrie și anul următor.
function missing(markets,now){
  const d=new Date(now),y=d.getUTCFullYear(),need=d.getUTCMonth()>=10?[y,y+1]:[y];
  return Object.entries(markets).flatMap(([id,m])=>need.filter(year=>!m.years.includes(year)).map(year=>id+':'+year));
}

test('I-708: de la 1 noiembrie fiecare piață are și anul următor (azi și la 01.11.2026)',()=>{
  const C=load(['lib/exchange-calendar.js']).ExchangeCalendar;
  assert.deepEqual(missing(C.markets,Date.now()),[],'Adaugă anul următor în lib/exchange-calendar.js din calendarele oficiale');
  assert.deepEqual(missing(C.markets,at('2026-11-01T00:00:00Z')),[]);
});

test('I-708: un an provizoriu (calendar oficial nepublicat) trebuie reconfirmat până la 1 decembrie al anului dinainte',()=>{
  const C=load(['lib/exchange-calendar.js']).ExchangeCalendar;
  const now=new Date();
  for(const [id,m] of Object.entries(C.markets))for(const year of Object.keys(m.provisional||{})){
    assert.ok(now<new Date(Date.UTC(Number(year)-1,11,1)),id+' '+year+': calendarul oficial trebuie verificat și marcat definitiv');
    assert.equal(C.session(id,year+'-03-01').provisional,true);
  }
});

test('I-708: în 2027 toate acțiunile Europa au calendar (Paștele 28.03 ⇒ 26.03 și 29.03 închise)',()=>{
  const C=load(['lib/exchange-calendar.js']).ExchangeCalendar;
  for(const id of Object.values(EUROPE)){
    assert.doesNotThrow(()=>C.latest(at('2027-01-05T19:00:00Z'),id),id);
    for(const day of ['2027-01-01','2027-03-26','2027-03-29'])assert.equal(C.session(id,day).state,'closed',id+' '+day);
    assert.equal(C.session(id,'2027-03-30').state,'open',id);
  }
  // zile specifice, din sursele oficiale
  assert.equal(C.session('VIENNA','2027-10-26').state,'closed');
  assert.equal(C.session('COPENHAGEN','2027-03-25').state,'closed');assert.equal(C.session('COPENHAGEN','2027-05-07').state,'closed');
  assert.equal(C.session('SIX','2027-05-06').state,'closed');assert.equal(C.session('SIX','2027-05-17').state,'closed');
  assert.equal(C.session('LSE','2027-05-03').state,'closed');assert.equal(C.session('LSE','2027-08-30').state,'closed');assert.equal(C.session('LSE','2027-12-28').state,'closed');
  assert.equal(C.session('DUBLIN','2027-05-03').state,'closed');assert.equal(C.session('MILAN','2027-12-31').state,'closed');
  assert.equal(C.session('PARIS','2027-05-03').state,'open');
  // anul fără calendar rămâne închis pe „necunoscut”, nu ghicit
  assert.throws(()=>C.latest(at('2028-02-01T18:00:00Z'),'PARIS'),/indisponibil/);
});

test('I-708: ziua scurtă cu ora neverificată (Euronext 24.12/31.12) nu mai dă eroare toată ziua — așteaptă închiderea obișnuită',()=>{
  const C=load(['lib/exchange-calendar.js']).ExchangeCalendar;
  for(const id of ['PARIS','AMSTERDAM','BRUSSELS','DUBLIN','LISBON']){
    const z=C.markets[id];
    // înainte de închiderea normală + 15 min: ultima sesiune sigur încheiată e cea de dinainte
    assert.equal(C.latest(at('2026-12-24T11:00:00Z'),id).day,'2026-12-23',id);
    assert.equal(C.latest(at('2026-12-31T11:00:00Z'),id).day,'2026-12-30',id);
    // după ora normală de închidere + 15 min, ziua scurtă e sigur încheiată
    assert.equal(C.latest(at('2026-12-24T19:00:00Z'),id).day,'2026-12-24',id);
    assert.ok(z.close>0);
  }
  assert.equal(C.latest(at('2026-12-24T15:00:00Z'),'PARIS').day,'2026-12-23');
  // Madrid: BME a publicat 14:00 pentru 24 și 31.12.2026
  assert.equal(C.latest(at('2026-12-24T13:14:00Z'),'MADRID').day,'2026-12-23');
  assert.equal(C.latest(at('2026-12-24T13:15:00Z'),'MADRID').day,'2026-12-24');
  // Xetra 30.12: ore „pot diferi” ⇒ tot limita de sus, fără eroare
  assert.equal(C.latest(at('2026-12-30T12:00:00Z'),'XETRA').day,'2026-12-29');
});

test('I-707 (c): indicele se rezolvă după simbol — Yahoo dă ^ATX pe Amsterdam și ^OMXC25 pe New York',()=>{
  const C=load(['lib/exchange-calendar.js']).ExchangeCalendar;
  assert.equal(C.resolve({symbol:'^ATX',exchange:'VIE',timezone:'Europe/Amsterdam'}),'VIENNA');
  assert.equal(C.resolve({symbol:'^OMXC25',exchange:'NIM',timezone:'America/New_York'}),'COPENHAGEN');
  assert.equal(C.resolve({symbol:'^GDAXI',exchange:'GER',timezone:'Europe/Berlin'}),'XETRA');
  // acțiunile rămân pe regula veche (bursă + fus)
  assert.equal(C.resolve({symbol:'SAP.DE',exchange:'GER',timezone:'America/New_York'}),null);
});

test('I-707 (c): ATX pe 26.10 (sărbătoare la Viena, Amsterdam deschis) nu mai cere o sesiune inexistentă',()=>{
  const c=load(),now=at('2026-10-26T18:00:00Z');
  const days=['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23'];
  const bars=days.map(d=>({t:at(d+'T06:55:00Z'),o:100,h:101,l:99,c:100,v:0}));
  bars.meta={symbol:'^ATX',exchange:'VIE',timezone:'Europe/Amsterdam',currency:'EUR',regularEnd:at('2026-10-26T15:35:00Z')};
  const s=c.DailySeries.read(bars,'^ATX',now);
  assert.equal(s.asOf,'2026-10-23');assert.equal(s.calendarId,'VIENNA');
  const omx=['2026-10-15','2026-10-16'].map(d=>({t:at(d+'T13:30:00Z'),o:100,h:101,l:99,c:100,v:0}));
  omx.meta={symbol:'^OMXC25',exchange:'NIM',timezone:'America/New_York',currency:'DKK',regularEnd:at('2026-10-16T20:00:00Z')};
  // Copenhaga închide la 17:00 ⇒ la 16:30 UTC (18:30 Copenhaga) sesiunea de vineri 16.10 e încheiată
  assert.equal(c.DailySeries.read(omx,'^OMXC25',at('2026-10-16T16:30:00Z')).calendarId,'COPENHAGEN');
});
