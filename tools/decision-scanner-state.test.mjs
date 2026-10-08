import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

for(const [file,toggle] of [['candidate-engine/engine.js','setScanning'],['europe-stocks/engine.js','setBusy']]){
 test(file+' replaces the in-progress verdict when a scan finishes without matching candidates',()=>{
  const source=readFileSync(file,'utf8'),nodes={},reports=[];
  const c={state:{scanning:false,selected:null,updatedAt:1,verified:12,hasScan:true,analyses:Array(12)},requested:null,
   $:id=>nodes[id]||(nodes[id]={classList:{toggle(){}},style:{}}),TTDecisionPanel:{set:input=>reports.push(input)},console};
  c.window=c;c.g=c;vm.createContext(c);
  const fn=name=>source.match(new RegExp('function '+name+'\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n  \\}'))[0];
  vm.runInContext(fn('renderDetail')+'\n'+fn(toggle),c);
  c[toggle](true);assert.match(reports.at(-1).empty.title,/Analizez/);
  c[toggle](false);assert.equal(c.state.scanning,false);
  assert.match(reports.at(-1).empty.title,/Niciun candidat/);
  assert.doesNotMatch(reports.at(-1).empty.next,/Așteaptă finalizarea|Așteaptă terminarea/);
 });
}
