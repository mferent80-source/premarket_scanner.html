// 27.10.2026 (lotul A): pagina Cont & sincronizare (app/sync/sync.js) — starea de securitate la vedere (audit [9], I-748), mesajele de rețea
// (audit [3]), confirmarea cu lista registrelor înainte de „Restaurează ultima copie locală” (audit [29]), textele aliniate cu codul (audit [21]).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const syncScript=readFileSync(new URL('../app/sync/sync.js',import.meta.url),'utf8');
const failureScript=readFileSync(new URL('../app/failure-info.js',import.meta.url),'utf8');
function pagina({error='',security={allowlist:false,sessions:null,lastLogin:null},setup={database:true,google:true,encryption:true,schema:true},preview={at:Date.parse('2026-10-27T10:00:00Z'),keys:['tt_journal_v1','tt_trade_plans_v1']},confirmă=true}={}){
 const nodes=new Map(),events=new Map(),calls={sync:0,restore:0,confirm:[]};
 const node=tag=>({tag,children:[],textContent:'',hidden:false,disabled:false,className:'',style:{},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},click(){return this.onclick?.();},remove(){},set innerHTML(_value){throw Error('UI must render with textContent');}});
 const element=id=>{if(!nodes.has(id))nodes.set(id,node('div'));return nodes.get(id);};
 const state={ready:true,connected:true,email:'PRIVATE_IDENTITY',busy:false,checking:false,setup,security,error,failure:null,lastSync:null,conflicts:[],supportedKeys:[],trading212:{local:true,cloud:true}};
 const cloud={state:()=>state,sync:async()=>{calls.sync++;},recheck:async()=>{},restore:async()=>{calls.restore++;},restorePreview:async()=>preview};
 const listen=(name,fn)=>{const handlers=events.get(name)||[];handlers.push(fn);events.set(name,handlers);};
 const context={Date,Intl,parent:{TTCloud:cloud,document:{documentElement:{dataset:{appVersion:'26.10.27.1759'}}}},location:{origin:'https://example.test'},document:{getElementById:element,createElement:node,head:node('head'),body:node('body'),documentElement:{dataset:{appVersion:'26.10.27.1759'}},addEventListener:listen,hidden:false},navigator:{onLine:true},localStorage:{getItem:()=>null,setItem(){}},confirm:text=>{calls.confirm.push(text);return confirmă;},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,addEventListener:listen};
 context.window=context;vm.createContext(context);vm.runInContext(failureScript,context);vm.runInContext(syncScript,context);
 const text=id=>element(id).children.map(c=>c.textContent).join('\n');
 return {context,state,calls,element,text};
}

test('audit [9] / I-748: allowlist-ul Google LIPSĂ se vede roșu în lista serviciului; sesiunile active și ultimul login lângă cont',()=>{
 const u=pagina();
 assert.match(u.text('checks'),/Allowlist Google · LIPSĂ/);
 assert.match(u.text('checks'),/orice cont Google/);
 const ok=pagina({security:{allowlist:true,sessions:2,lastLogin:Date.parse('2026-10-26T08:00:00Z')}});
 assert.match(ok.text('checks'),/Allowlist Google · verificat/);
 assert.match(ok.element('identity').textContent,/Sesiuni active: 2/);
 assert.match(ok.element('identity').textContent,/ultimul login/);
 assert.ok(!/PRIVATE_IDENTITY/.test(ok.text('checks')));
});

test('audit [3]: fără rețea pagina spune că datele rămân local, nu „network_error” sau „Failed to fetch”',()=>{
 const u=pagina({error:'network_error'});
 assert.match(u.element('status').textContent,/rețea/i);assert.ok(!/network_error|Failed to fetch/.test(u.element('status').textContent));
 const t=pagina({error:'timeout'});assert.ok(!/^timeout$/.test(t.element('status').textContent));
});

test('audit [29]: „Restaurează ultima copie locală” cere confirmare cu lista registrelor și ora copiei; „Nu” nu restaurează',async()=>{
 const nu=pagina({confirmă:false});await nu.element('restore').click();await new Promise(r=>setImmediate(r));
 assert.equal(nu.calls.confirm.length,1);assert.match(nu.calls.confirm[0],/Jurnal manual/);assert.match(nu.calls.confirm[0],/Planuri de tranzacționare/);assert.match(nu.calls.confirm[0],/27\.10\.2026|2026/);assert.equal(nu.calls.restore,0);
 const da=pagina({confirmă:true});await da.element('restore').click();await new Promise(r=>setImmediate(r));assert.equal(da.calls.restore,1);
 const gol=pagina({preview:null});await gol.element('restore').click();await new Promise(r=>setImmediate(r));assert.equal(gol.calls.confirm.length,0);assert.equal(gol.calls.restore,0);assert.match(gol.element('status').textContent,/Nu există o copie/);
});

test('audit [21] / [29]: textele paginii și README-ul spun ce face codul; acțiunile cu pierdere de date au stil distinct',()=>{
 const html=readFileSync(new URL('../app/sync/index.html',import.meta.url),'utf8'),readme=readFileSync(new URL('../tools/cloud-sync-README.md',import.meta.url),'utf8');
 assert.ok(!/cel mult una pe oră|ultimele cinci/.test(html),'textul vechi al copiei de siguranță a dispărut');
 assert.ok(/înaintea fiecărei schimbări venite din cont/i.test(html),'copia: mereu înaintea unei schimbări din cont');assert.ok(/ultimele 10/.test(html),'10 copii');
 assert.ok(/<button id="restore" class="danger"/.test(html),'restaurarea are stil distinct');assert.ok(/<button id="deleteKey" class="danger"/.test(html),'ștergerea conexiunii are stil distinct');
 assert.ok(!/style="margin-top:20px"/.test(html),'fără stiluri inline repetate (audit [20])');
 assert.ok(!/\?index=1/.test(readme)&&/index=3/.test(readme),'README: indexul cerut de clientul de azi');
 assert.ok(!/cinci copii/.test(readme)&&/10 copii/.test(readme));
 assert.ok(!/120 cereri\/min/.test(readme)&&/600 cereri\/min/.test(readme));
});
