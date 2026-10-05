import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const now=Date.parse('2026-10-04T17:00:00Z');
function setup(){
 const data=new Map(),controls=new Map(),dialogs=[];let groups=[],refreshes=0,checks=0,exports;
 function element(){let html='';return {dataset:{},disabled:false,hidden:false,textContent:'',get innerHTML(){return html;},set innerHTML(v){html=v;if(v.includes('data-backup-group'))groups=[...v.matchAll(/data-backup-group value="([^"]+)" checked/g)].map(m=>({value:m[1],checked:true,disabled:false}));},querySelectorAll:q=>q==='[data-backup-group]'?groups:[]};}
 const document={querySelectorAll:q=>controls.get(q)||[],body:{appendChild:d=>d.isConnected=true},createElement(){const fields=new Map(),d={isConnected:false,setAttribute(){},querySelector(q){if(!fields.has(q))fields.set(q,element());return fields.get(q);},querySelectorAll:q=>q==='[data-backup-group]'?groups:[],showModal(){d.open=true;},close(){d.open=false;d.onclose?.();},remove(){d.isConnected=false;}};dialogs.push(d);return d;}};
 const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)},core={Date:class extends Date{static now(){return now;}},document,HoldingsNeuralUI:{refresh:()=>refreshes++,exportReport:r=>exports=r},HoldingsForecastUI:{NAMES:{neural:'Neural',quantile:'Cuantile',garch:'GARCH'},check(){checks++;}}};
 vm.createContext(core);for(const file of ['lib/daily-series.js','lib/holdings-forecast.js','lib/holdings-forecast-backup.js','holdings/forecast-backup.js'])vm.runInContext(readFileSync(file,'utf8'),core);
 const F=core.HoldingsForecast,B=core.HoldingsForecastBackup,ui=core.HoldingsForecastBackupUI,p={ticker:'TEST_US_EQ',instrumentCurrency:'USD'},ctx={scope:'private-account',demo:false,positions:[p],model:()=>({currency:'USD'}),symbol:()=> 'TEST'},e={scope:ctx.scope,ticker:p.ticker,symbol:'TEST',currency:'USD',kind:'market'};
 ui.setContext(ctx,storage);
 function row(model){const at=Date.parse('2026-09-25T21:00:00Z');return F.project({model,modelVersion:F.VERSIONS[model],trainedAt:at-1000,state:'limited',source:{t:Date.parse('2026-09-25T13:30:00Z'),asOf:'2026-09-25',timezone:'America/New_York',closeMinutes:960,close:100,atrPct:2},estimate:model==='quantile'?{prices:[98,100,104],baselinePrices:[97,99,103]}:{classIndex:2,baselineClass:1}},e,at);}
 const raw=JSON.stringify(B.create(e,[row('neural'),row('quantile')],now));
 function button(attr){const b={isConnected:true,focus(){},dataset:{[attr.replace(/-([a-z])/g,(_,s)=>s.toUpperCase())]:'0'}};controls.set('[data-'+attr+']',[b]);ui.bind();return b;}
 const open=()=>{button('forecast-backup').onclick();return dialogs.at(-1);};
 async function file(dialog,text=raw,size=text.length){await dialog.querySelector('[data-backup-file]').onchange({target:{files:[{size,text:()=>Promise.resolve(text)}]}});}
 return {ui,F,B,p,ctx,e,data,storage,raw,open,file,row,button,groups:()=>groups,dialogs,checks:()=>checks,exports:()=>exports,refreshes:()=>refreshes};
}
test('file selection is read-only and restore applies only the models selected in preview',async()=>{
 const s=setup(),d=s.open();await s.file(d);assert.equal(s.data.size,0);assert.equal(s.groups().length,2);s.groups().find(x=>x.value==='quantile|5').checked=false;s.groups()[0].onchange();assert.match(d.querySelector('[data-backup-count]').textContent,/1 estimare selectată/);
 d.querySelector('[data-backup-apply]').onclick();const rows=JSON.parse(s.data.get(s.F.key(s.e))).entries;assert.equal(rows.length,1);assert.equal(rows[0].model,'neural');assert.equal(d.querySelector('[data-backup-verify]').hidden,false);assert.ok(s.refreshes()>0);d.querySelector('[data-backup-verify]').onclick();assert.equal(s.checks(),1);assert.equal(d.open,false);
});
test('invalid, oversized and wrong-currency files cannot enable restoration',async()=>{
 for(const mode of ['malformed','large','currency']){const s=setup(),d=s.open();let raw=mode==='malformed'?'{bad':s.raw;if(mode==='currency'){const b=JSON.parse(raw);b.currency='EUR';raw=JSON.stringify(b);}await s.file(d,raw,mode==='large'?s.B.MAX_FILE_BYTES+1:raw.length);assert.equal(d.querySelector('[data-backup-apply]').disabled,true);assert.equal(s.data.size,0);}
});
test('changing accounts while reading a file closes the dialog and discards its later result',async()=>{
 const s=setup(),d=s.open();let resolve;const reading=d.querySelector('[data-backup-file]').onchange({target:{files:[{size:100,text:()=>new Promise(r=>resolve=r)}]}});s.ui.setContext({...s.ctx,scope:'other-account'},s.storage);assert.equal(d.open,false);resolve(s.raw);await reading;assert.equal(s.data.size,0);assert.equal(d.querySelector('[data-backup-preview]').innerHTML,'');
});
test('changing listing identity invalidates the selected backup without writing either registry',async()=>{
 const s=setup(),d=s.open();await s.file(d);s.ui.setContext({...s.ctx,symbol:()=> 'OTHER'},s.storage);d.querySelector('[data-backup-apply]').onclick();assert.equal(s.data.size,0);assert.equal(d.open,false);
});
test('a delayed earlier file cannot replace a newer validated preview',async()=>{
 const s=setup(),d=s.open();let resolve;const first=d.querySelector('[data-backup-file]').onchange({target:{files:[{size:100,text:()=>new Promise(r=>resolve=r)}]}});await s.file(d);resolve('{bad');await first;assert.match(d.querySelector('[data-backup-preview]').innerHTML,/Previzualizare/);assert.equal(d.querySelector('[data-backup-apply]').disabled,false);
});
test('a changed registry after preview is preserved and the stale action reports its conflict',async()=>{
 const s=setup(),d=s.open();await s.file(d);const newer=JSON.stringify({version:s.F.VERSION,entries:[s.row('neural')]});s.data.set(s.F.key(s.e),newer);d.querySelector('[data-backup-apply]').onclick();assert.equal(s.data.get(s.F.key(s.e)),newer);assert.match(d.querySelector('[data-backup-status]').textContent,/s-a schimbat/);assert.equal(d.querySelector('[data-backup-apply]').disabled,true);
});
test('undo handler removes restored estimates and archive export omits the account identity',async()=>{
 const s=setup(),d=s.open();await s.file(d);d.querySelector('[data-backup-apply]').onclick();d.close();s.button('forecast-undo').onclick();assert.equal(JSON.parse(s.data.get(s.F.key(s.e))).entries.length,0);s.button('forecast-archive').onclick();assert.equal(s.exports().result.records.length,2);assert.ok(!JSON.stringify(s.exports()).includes(s.e.scope));assert.match(s.ui.markup(s.p,0),/estimări restaurate eliminate/);
});
test('all backup modules load before the forecast UI and the native dialog has accessible file and action controls',()=>{
 const html=readFileSync('holdings/index.html','utf8'),start=html.indexOf('src="forecast.js');assert.ok(html.indexOf('src="../lib/holdings-forecast-backup.js')<start);assert.ok(html.indexOf('src="forecast-backup.js')<start);assert.ok(html.includes('forecast-backup.css'));
 const s=setup(),d=s.open();assert.equal(d.open,true);d.querySelector('[data-backup-cancel]').onclick();assert.equal(d.open,false);assert.equal(s.data.size,0);
 assert.match(readFileSync('holdings/forecast-backup.js','utf8'),/dialog\.showModal\(\)/);assert.match(readFileSync('holdings/forecast-backup.js','utf8'),/aria-labelledby/);
});
