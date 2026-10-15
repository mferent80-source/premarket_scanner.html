import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const B=createRequire(import.meta.url)('../holdings/brief.js');
const snapshot={fetchedAt:'2026-10-15T17:14:20Z',summary:{currency:'USD',totalValue:10000}};
const positions=[{ticker:'EXEMPLU_US_EQ',name:'Companie fictivă',currency:'USD',value:1416,unrealized:168},{ticker:'FICTIVB_US_EQ',name:'B <b>',currency:'USD',value:860,unrealized:-130.26},{ticker:'EUROX_EQ',name:'Listare în EUR',currency:'EUR',value:500,unrealized:12}];
const models=[{medium:'Ascendent',attention:['RSI peste 70'],asOf:'2026-10-14'},{medium:'Descendent',attention:['Slăbiciune','Volum mic'],asOf:'2026-10-14'},null];

test('rezumatul: totaluri doar în moneda contului, ponderea față de valoarea contului, analizele lipsă numărate',()=>{
 const s=B.summary({positions,models,snapshot});
 assert.equal(s.invested,2276);assert.equal(Math.round(s.pnl*100)/100,37.74);assert.equal(s.pnlCovered,2,'poziția în EUR nu intră în totalul USD');
 assert.equal(s.up,1);assert.equal(s.down,1);assert.equal(s.missing,1);assert.equal(s.biggest.p.ticker,'EXEMPLU_US_EQ');
 assert.equal(s.rows[2].weight,null,'fără pondere când moneda diferă');
 assert.deepEqual(s.attention.map(r=>r.p.ticker),['FICTIVB_US_EQ','EXEMPLU_US_EQ'],'întâi cea cu mai multe motive');
});
test('pagina păstrează etichetele vechi ale plăcilor și rezultatele au o singură zecimală',()=>{
 const html=B.markup({positions,models,snapshot});
 for(const label of ['Poziții în snapshot','Trend mediu ascendent','Necesită atenție','Date indisponibile'])assert.ok(html.includes(label),label);
 assert.ok(html.includes('+37,7 USD'),'P&L cu o zecimală');assert.ok(html.includes('14,2%'));assert.ok(!html.includes('−130,26'));
 assert.ok(html.includes('B &lt;b&gt;'),'numele sunt escapate');assert.ok(!html.includes('B <b>'));
});
test('fără poziții: starea goală are aceleași patru etichete, cu zero',()=>{
 const html=B.markup({positions:[],models:[],snapshot:null});
 for(const label of ['Poziții în snapshot','Trend mediu ascendent','Necesită atenție','Date indisponibile'])assert.ok(html.includes(label+' <b>0</b>'),label);
});
test('„De urmărit” arată cel mult trei poziții, restul rămân în listă',()=>{
 const many=Array.from({length:5},(_,i)=>({ticker:'T'+i+'_US_EQ',currency:'USD',value:100,unrealized:1})),ms=many.map(()=>({medium:'Ascendent',attention:['x'],asOf:'2026-10-14'}));
 const html=B.markup({positions:many,models:ms,snapshot});
 assert.equal((html.match(/pf-watch-item/g)||[]).length,3);assert.ok(html.includes('încă 2 în listă'));
});
test('pagina încarcă brief.js înaintea holdings.js și foaia astazi.css ultima',()=>{
 const html=readFileSync('holdings/index.html','utf8');
 assert.ok(html.indexOf('brief.js')>0&&html.indexOf('brief.js')<html.indexOf('holdings.js?'));
 assert.ok(html.lastIndexOf('<link rel="stylesheet"')===html.indexOf('<link rel="stylesheet" href="astazi.css'));
});
test('revizie: −0 nu apare cu roșu, sumele parțiale spun câte poziții acoperă, citirea veche nu e verde',()=>{
 const ps=[{ticker:'A_US_EQ',currency:'USD',value:100,unrealized:-0.04},{ticker:'B_US_EQ',currency:'USD',value:null,unrealized:null}];
 const html=B.markup({positions:ps,models:[null,null],snapshot:{fetchedAt:'2026-10-13T10:00:00Z',summary:{currency:'USD',totalValue:1000}},now:Date.parse('2026-10-15T12:00:00Z')});
 assert.ok(html.includes('<b class="">0 USD</b>'),'zero fără semn și fără ton');assert.ok(!html.includes('−0'));
 assert.equal((html.match(/acoperit 1\/2/g)||[]).length,2,'P&L și Investit acoperă 1 din 2');
 assert.ok(html.includes('De actualizat · '),'citirea de acum două zile');assert.ok(html.includes('pill warn">De actualizat'));
 assert.ok(html.includes('>—</span>'),'rândul fără valoare arată „—”, nu „— USD”');
});
test('revizie: valoarea contului 0 nu afișează „0 USD” mare și nu promite ponderi',()=>{
 const html=B.markup({positions:[{ticker:'A_US_EQ',currency:'USD',value:100,unrealized:1}],models:[null],snapshot:{fetchedAt:'2026-10-15T10:00:00Z',summary:{currency:'USD',totalValue:0}}});
 assert.ok(html.includes('Valoare neverificată'));assert.ok(html.includes('Ponderi neverificate'));
});
