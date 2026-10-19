// 19.10.2026 (I-697, p.2–p.3): pagina Cont & sincronizare arată cât ocupă fiecare registru din 1 MB (avertisment peste 80 %) și cheile sărite.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const syncScript=readFileSync(new URL('../app/sync/sync.js',import.meta.url),'utf8'),failureScript=readFileSync(new URL('../app/failure-info.js',import.meta.url),'utf8');
function ui(state){
 const nodes=new Map(),events=new Map();
 const node=tag=>({tag,children:[],textContent:'',className:'',hidden:false,disabled:false,style:{},append(...x){this.children.push(...x);},replaceChildren(...x){this.children=x;},set innerHTML(_v){throw Error('doar textContent');}});
 const element=id=>{if(!nodes.has(id))nodes.set(id,node('div'));return nodes.get(id);};
 const cloud={state:()=>state,conflictView:()=>({local:'',remote:''})};
 const context={Date,Intl,parent:{TTCloud:cloud,document:{documentElement:{dataset:{appVersion:'26.10.19.2000'}}}},location:{origin:'https://example.test'},document:{getElementById:element,createElement:node,head:node('head'),addEventListener(){}},navigator:{onLine:true},localStorage:{getItem:()=>null,setItem(){}},setTimeout:()=>1,clearTimeout(){},addEventListener:(n,f)=>{events.set(n,f);}};
 context.window=context;vm.createContext(context);vm.runInContext(failureScript,context);vm.runInContext(syncScript,context);
 return {element,rerender:()=>events.get('message')({source:context.parent,origin:context.location.origin,data:{ttCloudState:state}})};
}
const base={ready:true,connected:true,email:'x',busy:false,checking:false,setup:null,error:'',failure:null,lastSync:Date.now(),conflicts:[],supportedKeys:['tt_trading212_fills_v1:cont'],trading212:{local:true,cloud:true},recordLimit:1000000};

test('contorul pe chei: o zecimală, avertisment peste 80 %, pachetele execuțiilor grupate după cel mai plin',()=>{
 const u=ui({...base,sizes:{tt_journal_v1:850000,tt_theme:6,'tt_trading212_fills_v1:03':41000,'tt_trading212_fills_v1:0a':60000,'tt_trading212_fills_v1:cont':900,tt_trading212_fills_v1:860507,wl_stocks:0}});
 const card=u.element('cloudSizes'),rows=u.element('cloudSizesList').children.map(x=>x.textContent);
 assert.equal(card.hidden,false);
 assert.deepEqual(rows,['Avertisment · Execuții Trading 212 · cheia veche (doar citire): 860,5 KB din 1.000 KB · 86,1 %','Avertisment · Jurnal manual: 850,0 KB din 1.000 KB · 85,0 %','Execuții Trading 212 · 3 pachete, cel mai plin: pachetul 0a: 60,0 KB din 1.000 KB · 6,0 %','Tema aplicației: 0,0 KB din 1.000 KB · 0,0 %']);
 assert.equal(u.element('cloudSizesList').children[0].className,'size-warn');
 assert.equal(u.element('cloudSizesWarn').hidden,false);assert.match(u.element('cloudSizesWarn').textContent,/Peste 80 %.*Jurnal manual \(85,0 %\)/);
});

test('sub 80 % fără avertisment; fără cont conectat sau fără date contorul e ascuns',()=>{
 const state={...base,sizes:{tt_journal_v1:120000}},u=ui(state);
 assert.equal(u.element('cloudSizesWarn').hidden,true);assert.equal(u.element('cloudSizesList').children[0].className,'');
 state.connected=false;u.rerender();assert.equal(u.element('cloudSizes').hidden,true);
 state.connected=true;state.sizes={};u.rerender();assert.equal(u.element('cloudSizes').hidden,true);
});

test('cheile sărite apar cu numele registrului și motivul, lângă detaliile erorii',()=>{
 const state={...base,error:'2 registre nu s-au sincronizat (record_too_large; invalid_value); celelalte s-au sincronizat.',failure:{code:'record_too_large',operation:'sync',key:'tt_trading212_fills_v1:03',httpStatus:null,at:Date.now()},skipped:[{key:'tt_trading212_fills_v1:03',code:'record_too_large'},{key:'tt_holdings_theses_v1',code:'invalid_value'}],sizes:{}};
 const u=ui(state),items=u.element('syncSkipped').children.map(x=>x.textContent);
 assert.equal(u.element('syncSkipped').hidden,false);assert.equal(u.element('syncFailure').hidden,false);
 assert.deepEqual(items,['Execuții Trading 212 · pachetul 03 · Registru prea mare [record_too_large] · sărit; celelalte registre s-au sincronizat','Ipoteze dețineri · Registru incompatibil [invalid_value] · sărit; celelalte registre s-au sincronizat']);
 assert.match(u.element('syncFailureDetail').textContent,/Execuții Trading 212 · pachetul 03.*\[record_too_large\]/);
 state.error='';state.skipped=[];u.rerender();assert.equal(u.element('syncSkipped').hidden,true);
});

test('o singură cheie prea mare: mesajul explică ce s-a întâmplat, nu doar codul',()=>{
 const u=ui({...base,error:'record_too_large',failure:{code:'record_too_large',operation:'write-record',key:'tt_trading212_fills_v1',httpStatus:400,at:Date.now()},skipped:[{key:'tt_trading212_fills_v1',code:'record_too_large'}],sizes:{}});
 assert.match(u.element('status').textContent,/limita de 1 MB.*rămâne pe acest dispozitiv.*celelalte registre s-au sincronizat/);
});
