import test from 'node:test';
import assert from 'node:assert/strict';
import {createArchive,readArchive,createController,groupFor,digest,MAX_BYTES} from '../lib/system-backup.mjs';

const now=Date.parse('2026-10-09T15:30:00Z');
const copy=x=>structuredClone(x), id=e=>JSON.stringify([e.target,e.key]);
const entry=(key,value,target='local')=>({target,key,value:typeof value==='string'?value:JSON.stringify(value)});
const journal=note=>entry('tt_journal_v1',[{id:'trade-1',note}]);
async function archive(rows,options={}) {return JSON.stringify(await createArchive(rows,{now,appVersion:'26.10.09.1830',...options}));}
function memory(rows=[]) {
  const data=new Map(rows.map(e=>[id(e),copy(e)]));let recovery=null,fault=null,archived=false;
  const adapter={snapshot:async()=>[...data.values()].map(copy),recovery:async()=>copy(recovery),saveRecovery:async value=>{if(fault?.journal)throw Error('Journal refused');recovery=copy(value);archived=true;},exclusive:fn=>fn(),replace:async(target,changes)=>{
    assert.equal(archived,true,'a recovery transaction must finish before any mutation');
    for(const e of changes){assert.deepEqual(data.get(id(e))?.value??null,e.before);if(fault?.key===e.key){fault=null;throw Error('QuotaExceededError');}if(e.after===null)data.delete(id(e));else data.set(id(e),{target,key:e.key,value:copy(e.after)});}
  }};
  const controller=createController(adapter,{now:()=>now});
  return {controller,adapter,data,setFault:f=>fault=f,get recovery(){return recovery;},set recovery(r){recovery=copy(r);archived=true;}};
}
const selected=plan=>plan.rows.filter(r=>!['invalid','same'].includes(r.status)).map(r=>r.id);

test('full export includes durable reports and histories but visits no credential addresses',async()=>{
  const rows=[journal('saved'),entry('tt_holdings_neural_v1:account|TEST_US_EQ',{trainedAt:now-1000,symbol:'TEST',currency:'USD',result:{version:'holdings-mlp-v3'}},'models'),entry('tt_holdings_learning_v1:account|TEST_US_EQ|TEST|USD|market',{version:'holdings-learning-v1',champion:null},'history')];
  const text=await archive([...rows,entry('tt_cloud_owner','private-owner'),entry('tt_tg_config',{token:'secret'}),entry('tt_custom_proxy','https://secret'),entry('cloud_credentials',{key:'secret'}),entry('ce_results_v2',{quotes:'old'})]);
  assert.equal((await readArchive(text,{now})).entries.length,3);assert.ok(!text.includes('secret'));assert.equal(JSON.parse(text).manifest.entries,3);
});
test('integrity covers multibyte content, each registry and the aggregate manifest',async()=>{
  const text=await archive([journal('închidere · 🟢')]),a=await readArchive(text,{now});assert.equal(a.entries[0].valid,true);
  const damaged=JSON.parse(text);damaged.entries[0].value=damaged.entries[0].value.replace('închidere','deschidere');await assert.rejects(readArchive(JSON.stringify(damaged),{now}),/Integritatea/);
  const wrong=JSON.parse(text);wrong.manifest.entries++;await assert.rejects(readArchive(JSON.stringify(wrong),{now}),/Manifestul/);
});
test('unknown addresses, format, duplicate addresses and prototype properties are rejected',async()=>{
  const text=await archive([journal('test')]);
  for(const change of [a=>a.entries[0].target='private',a=>a.entries[0].key='tt_tg_config',a=>a.format='new-version',a=>a.entries.push(copy(a.entries[0]))]){const a=JSON.parse(text);change(a);await assert.rejects(readArchive(JSON.stringify(a),{now}));}
  await assert.rejects(readArchive(text.replace('"format":','"__proto__":{},"format":'),{now}));
  assert.equal(groupFor('models','tt_theme'),null);assert.equal(groupFor('history','tt_trading212_fills_v1'),null);
});
test('semantic validation is rerun instead of trusting the exported valid flag',async()=>{
  const a=JSON.parse(await archive([entry('tt_theme','purple')]));assert.equal(a.entries[0].valid,false);
  a.entries[0].valid=true;a.entries[0].error=null;const actual=await readArchive(JSON.stringify(a),{now});assert.equal(actual.entries[0].valid,false);
});
test('damaged originals remain exportable but cannot be restored',async()=>{
  const m=memory([journal('original')]),text=await archive([entry('tt_journal_v1','{damaged')]),plan=await m.controller.preview(text);
  assert.equal(plan.rows[0].status,'invalid');await assert.rejects(m.controller.restore(plan,[plan.rows[0].id]),/incompatibilă/);assert.equal(m.recovery,null);assert.match(m.data.get(id(journal(''))) .value,/original/);
});
test('owner-bound backup requires the same established device owner',async()=>{
  const text=await archive([journal('private')],{owner:'google-subject'});
  await assert.rejects(readArchive(text,{now}),/cont Google/);await assert.rejects(readArchive(text,{now,owner:'another'}),/cont Google/);
  assert.equal((await readArchive(text,{now,owner:'google-subject'})).owner,'google-subject');
});
test('future dates and oversized files are rejected before restoration',async()=>{
  const a=JSON.parse(await archive([journal('x')]));a.exportedAt=now+60001;await assert.rejects(readArchive(JSON.stringify(a),{now}),/Format/);
  await assert.rejects(readArchive(' '.repeat(MAX_BYTES+1),{now}),/128 MB/);
});
test('preview is read-only and distinguishes identical, missing and different registers',async()=>{
  const m=memory([journal('old'),entry('tt_theme','dark')]),p=await m.controller.preview(await archive([journal('new'),entry('tt_theme','dark'),entry('wl_stocks',['QCOM'])]));
  assert.deepEqual(new Set(p.rows.map(r=>r.status)),new Set(['same','new','different']));assert.equal(m.recovery,null);assert.match(m.data.get(id(journal(''))).value,/old/);
});
test('selected registers are restored with undo, unselected and absent data preserved',async()=>{
  const original=journal('old'),m=memory([original,entry('tt_theme','light'),entry('wl_stocks',['LOCAL'])]),p=await m.controller.preview(await archive([journal('new'),entry('tt_theme','dark')]));
  const out=await m.controller.restore(p,[p.rows.find(r=>r.key==='tt_journal_v1').id]);assert.equal(out.saved,1);assert.equal(m.recovery.state,'committed');
  assert.equal(m.data.get(id(entry('tt_theme',''))).value,'light');assert.equal(m.data.get(id(entry('wl_stocks',''))).value,'["LOCAL"]');
  const recovered=await m.controller.undo();assert.equal(recovered.pending,0);assert.deepEqual(m.data.get(id(original)),original);assert.equal(m.recovery.state,'undone');
});
test('new registers are removed by undo without deleting unrelated data',async()=>{
  const m=memory([journal('old')]),p=await m.controller.preview(await archive([entry('wl_stocks',['NEW'])]));await m.controller.restore(p,selected(p));assert.equal(m.data.size,2);await m.controller.undo();assert.equal(m.data.size,1);
});
test('a changed local register invalidates the preview before recovery or writes',async()=>{
  const m=memory([journal('old')]),p=await m.controller.preview(await archive([journal('new')]));m.data.set(id(journal('')),journal('concurrent'));
  await assert.rejects(m.controller.restore(p,selected(p)),/după previzualizare/);assert.equal(m.recovery,null);assert.match(m.data.get(id(journal(''))).value,/concurrent/);
});
test('external callers cannot mutate the trusted preview or invent selections',async()=>{
  const m=memory([journal('old')]),p=await m.controller.preview(await archive([journal('new')]));p.rows[0].after='attacker';await m.controller.restore(p,selected(p));assert.match(m.data.get(id(journal(''))).value,/new/);
  await assert.rejects(m.controller.restore(p,selected(p)),/previzualizarea/);
});
test('saving the recovery copy is mandatory before touching the original',async()=>{
  const m=memory([journal('old')]),p=await m.controller.preview(await archive([journal('new')]));m.setFault({journal:true});await assert.rejects(m.controller.restore(p,selected(p)),/Journal refused/);assert.match(m.data.get(id(journal(''))).value,/old/);
});
test('quota failure during the local batch rolls back all completed writes',async()=>{
  const initial=[journal('old'),entry('tt_theme','light')],m=memory(initial),p=await m.controller.preview(await archive([journal('new'),entry('tt_theme','dark')]));m.setFault({key:'tt_theme'});
  await assert.rejects(m.controller.restore(p,selected(p)),/anterioare au fost recuperate/);assert.equal(m.recovery.state,'rolled-back');assert.deepEqual([...m.data.values()],initial);
});
test('failed local write also rolls back an already committed durable report',async()=>{
  const report=entry('tt_holdings_neural_v1:account|TEST_US_EQ',{trainedAt:now-1000,symbol:'TEST',currency:'USD',result:{version:'holdings-mlp-v3'}},'models');
  const m=memory([journal('old')]),p=await m.controller.preview(await archive([report,journal('new')]));m.setFault({key:'tt_journal_v1'});
  await assert.rejects(m.controller.restore(p,selected(p)),/recuperate/);assert.equal(m.data.size,1);assert.equal(m.recovery.state,'rolled-back');
});
test('interrupted restore is recoverable after a new controller is created',async()=>{
  const old=journal('old'),next=journal('new'),m=memory([next]);m.recovery={version:'tt-system-backup-v1',at:now,owner:null,state:'applying',changes:[{...old,before:old.value,after:next.value}]};
  const c=createController(m.adapter,{now:()=>now});const out=await c.undo();assert.equal(out.pending,0);assert.deepEqual(m.data.get(id(old)),old);assert.equal(m.recovery.state,'rolled-back');
});
test('a pending recovery blocks another restore',async()=>{
  const m=memory([journal('old')]),p=await m.controller.preview(await archive([journal('new')]));m.recovery={state:'applying',owner:null,changes:[]};await assert.rejects(m.controller.restore(p,selected(p)),/întreruptă/);
});
test('undo preserves subsequent edits and reports the still recoverable conflict',async()=>{
  const m=memory([journal('old')]),p=await m.controller.preview(await archive([journal('new')]));await m.controller.restore(p,selected(p));m.data.set(id(journal('')),journal('later edit'));
  const out=await m.controller.undo();assert.equal(out.pending,1);assert.equal(m.recovery.state,'recovery-needed');assert.match(m.data.get(id(journal(''))).value,/later edit/);
});
test('owner changes after preview cannot apply or undo another account',async()=>{
  const m=memory([journal('old')]);let subject=null;const c=createController(m.adapter,{owner:async()=>subject,now:()=>now}),p=await c.preview(await archive([journal('new')]));subject='other';await assert.rejects(c.restore(p,selected(p)),/Contul s-a schimbat/);assert.equal(m.recovery,null);
});
test('an export changing during capture is refused rather than called complete',async()=>{
  const m=memory([journal('old')]);let count=0;const original=m.adapter.snapshot;m.adapter.snapshot=async()=>++count===1?original():[journal('updated')];await assert.rejects(m.controller.export(),/timpul exportului/);
});
test('legacy and durable plan copies restore as one coherent register',async()=>{
  const legacy=entry('tt_trade_plans_v1',[{id:'old'}]),durable={target:'plans',key:'tt_trade_plans_v1',value:{revision:3,raw:'[{"id":"new"},{"id":"old"}]',localRaw:legacy.value}};
  const m=memory(),p=await m.controller.preview(await archive([legacy,durable]));await assert.rejects(m.controller.restore(p,[p.rows[0].id]),/împreună/);
  await m.controller.restore(p,selected(p));const local=m.data.get(id(legacy)).value,db=m.data.get(id(durable)).value;assert.equal(local,db.raw);assert.equal(db.localRaw,local);assert.equal(globalThis.TTPlanStore.reconcile(db,local).plans.length,2);await m.controller.undo();assert.equal(m.data.size,0);
});
test('a legacy-only plan backup also replaces the durable authority',async()=>{
  const durable={target:'plans',key:'tt_trade_plans_v1',value:{revision:4,raw:'[{"id":"device"}]',localRaw:null}},m=memory([durable]),p=await m.controller.preview(await archive([entry('tt_trade_plans_v1',[{id:'backup'}]) ]));
  assert.equal(p.rows.length,2);await m.controller.restore(p,selected(p));assert.match(m.data.get(id(durable)).value.raw,/backup/);assert.equal(m.data.get(id(durable)).value.revision,5);
});
function forecast() {
  const F=globalThis.HoldingsForecast,e={scope:'private',ticker:'TEST_US_EQ',symbol:'TEST',currency:'USD',kind:'market'},at=Date.parse('2026-10-02T21:00:00Z');
  const row=F.project({model:'neural',modelVersion:F.VERSIONS.neural,trainedAt:at-1000,state:'limited',source:{t:Date.parse('2026-10-02T13:30:00Z'),asOf:'2026-10-02',timezone:'America/New_York',closeMinutes:960,close:100,atrPct:2},estimate:{classIndex:2,baselineClass:1}},e,at);
  assert.ok(row);return {F,e,row,key:F.key(e)};
}
test('new forecast imports are marked restored, reset verification and keep source timestamps',async()=>{
  const {key,row}=forecast(),m=memory(),p=await m.controller.preview(await archive([entry(key,{version:'holdings-forecast-v1',entries:[row]},'history')]));
  await m.controller.restore(p,selected(p));const imported=JSON.parse(m.data.get(id({target:'history',key})).value).entries[0];assert.equal(imported.restoredAt,now);assert.deepEqual(imported.source,row.source);assert.equal(imported.verification.checkedAt,null);assert.equal(imported.verification.state,'pending');
});
test('existing forecast originals survive conflicting restored estimates',async()=>{
  const {key,row}=forecast(),local=entry(key,{version:'holdings-forecast-v1',entries:[row]},'history'),incoming=copy(row);incoming.estimate.classIndex=0;
  const m=memory([local]),p=await m.controller.preview(await archive([entry(key,{version:'holdings-forecast-v1',entries:[incoming]},'history')]));await m.controller.restore(p,selected(p));assert.deepEqual(JSON.parse(m.data.get(id(local)).value).entries,[row]);
});
test('duplicate selections and invalid or identical rows cannot be applied',async()=>{
  const m=memory([journal('same')]),p=await m.controller.preview(await archive([journal('same'),entry('tt_theme','dark')]));
  const changed=p.rows.find(r=>r.status==='new').id,same=p.rows.find(r=>r.status==='same').id;for(const list of [[changed,changed],[same],['unknown'],[]])await assert.rejects(m.controller.restore(p,list));assert.equal(m.recovery,null);
});
