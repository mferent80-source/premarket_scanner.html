import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const NOW = Date.parse('2026-10-20T18:00:00Z');
const source = readFileSync('lib/setup-builder.js','utf8');
function draft(overrides={}){
  return {id:'draft',ticker:'TEST',dir:'long',dateET:'2026-10-12',createdAt:Date.parse('2026-10-12T12:00:00Z'),
    entry:100,sl:90,r:10,tp1:110,tp2:120,tp3:130,...overrides};
}
function closes(prices,start='2026-10-12'){
  const first=Date.parse(start+'T20:00:00Z');
  return prices.map((close,i)=>({ts:(first+i*86400000)/1000,close}));
}
async function render(entries,series){
  const raw=JSON.stringify(entries),store=new Map([['md_signal_journal',raw]]);
  const nodes={journalList:{innerHTML:''},journalScorecard:{innerHTML:''}};
  class Clock extends Date {constructor(...args){super(...(args.length?args:[NOW]));}static now(){return NOW;}}
  const context={Date:Clock,console,document:{getElementById:id=>nodes[id]},
    localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)},
    SL:{getReactionSeries:async ticker=>Array.isArray(series)?series:series[ticker]}};
  context.window=context;vm.createContext(context);vm.runInContext(source,context);
  await context.SB.renderSignalJournal();
  assert.equal(store.get('md_signal_journal'),raw,'evaluation must preserve the saved draft');
  return {list:nodes.journalList.innerHTML,score:nodes.journalScorecard.innerHTML};
}

test('a long draft reaching +1R before its stop closes as a loss',async()=>{
  const result=await render([draft()],closes([100,110,90]));
  assert.match(result.list,/❌ -1\.0R/);
  assert.doesNotMatch(result.list,/✅/);
  assert.match(result.score,/Win rate \(draft\).*?0%/);
  assert.match(result.score,/Expectancy.*?-1\.00R/);
});
test('an unfinished long draft reports its current return and contributes no closed statistics',async()=>{
  const result=await render([draft()],closes([100,110,105]));
  assert.match(result.list,/⏳ 0\.5R/);
  assert.doesNotMatch(result.list,/✅/);
  assert.equal(result.score,'');
});
test('TP2 remains a milestone; the first TP3 close fixes the target result',async()=>{
  const open=await render([draft()],closes([100,120,115]));
  assert.match(open.list,/⏳ 1\.5R/);
  assert.equal(open.score,'');
  const closed=await render([draft()],closes([100,120,130,90]));
  assert.match(closed.list,/✅ \+3\.0R/);
  assert.match(closed.score,/Expectancy.*?\+3\.00R/);
});
test('a short draft reaching +1R before its stop closes as a loss',async()=>{
  const result=await render([draft({dir:'short',sl:110,tp1:90,tp2:80,tp3:70})],closes([100,90,110]));
  assert.match(result.list,/❌ -1\.0R/);
  assert.match(result.score,/Win rate \(draft\).*?0%/);
});
test('unfinished short drafts stay open after a favorable milestone',async()=>{
  const result=await render([draft({dir:'short',sl:110,tp1:90,tp2:80,tp3:70})],closes([100,90,95]));
  assert.match(result.list,/⏳ 0\.5R/);
  assert.equal(result.score,'');
});
test('stop gaps use observed closes for both directions and ignore later recovery',async()=>{
  for(const [entry,prices] of [[draft(),[100,80,140]],
    [draft({dir:'short',sl:110,tp1:90,tp2:80,tp3:70}),[100,120,60]]]){
    const result=await render([entry],closes(prices));
    assert.match(result.list,/❌ -2\.0R/);
    assert.match(result.score,/Expectancy.*?-2\.00R/);
    assert.doesNotMatch(result.list,/✅/);
  }
});
test('target gaps cap profit at the saved TP3 for both directions',async()=>{
  for(const [entry,prices] of [[draft(),[100,140]],
    [draft({dir:'short',sl:110,tp1:90,tp2:80,tp3:70}),[100,60]]]){
    const result=await render([entry],closes(prices));
    assert.match(result.list,/✅ \+3\.0R/);
    assert.match(result.score,/Expectancy.*?\+3\.00R/);
  }
});
test('a custom saved TP3 determines the exit and its R result',async()=>{
  const result=await render([draft({tp3:125})],closes([100,125,90]));
  assert.match(result.list,/✅ \+2\.5R/);
  assert.match(result.score,/Expectancy.*?\+2\.50R/);
});
test('legacy drafts without TP3 retain a fixed final target at 3R',async()=>{
  const open=await render([draft({tp3:undefined})],closes([100,125]));
  assert.match(open.list,/⏳ 2\.5R/);
  assert.equal(open.score,'');
  const closed=await render([draft({tp3:undefined})],closes([100,130]));
  assert.match(closed.list,/✅ \+3\.0R/);
});
test('invalid saved levels remain unverifiable and cannot enter statistics',async()=>{
  for(const change of [{tp3:'130'},{tp3:90},{sl:110},{r:5},{dir:'other'},{dateET:''}]){
    const result=await render([draft(change)],closes([100,140,80]));
    assert.match(result.list,/· n\/a/);
    assert.equal(result.score,'');
  }
});
test('prices before the draft date cannot close a new draft',async()=>{
  const result=await render([draft()],closes([140,100,105],'2026-10-11'));
  assert.match(result.list,/⏳ 0\.5R/);
  assert.equal(result.score,'');
});
test('invalid trailing points and future prices cannot replace the last usable close',async()=>{
  const points=[...closes([100,110,105]),{ts:NaN,close:140},{ts:Date.parse('2026-10-15T20:00:00Z')/1000,close:NaN},
    {ts:Date.parse('2026-10-21T20:00:00Z')/1000,close:140}];
  const result=await render([draft()],points);
  assert.match(result.list,/⏳ 0\.5R/);
  assert.equal(result.score,'');
});
test('the active scorecard excludes an open draft from win rate, expectancy and profit factor',async()=>{
  const result=await render([draft({id:'win',ticker:'WIN'}),draft({id:'loss',ticker:'LOSS'}),draft({id:'open',ticker:'OPEN'})],
    {WIN:closes([100,130]),LOSS:closes([100,90]),OPEN:closes([100,110])});
  assert.match(result.list,/⏳ 1\.0R/);
  assert.match(result.score,/Win rate \(draft\).*?50%/);
  assert.match(result.score,/Expectancy.*?\+1\.00R/);
  assert.match(result.score,/PF.*?3\.00/);
  assert.match(result.score,/închidere la SL sau TP3.*?Pozițiile în curs sunt excluse/);
});
