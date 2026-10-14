import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync('index.html','utf8');
const inline=html.match(/<script>\s*'use strict';([\s\S]*?)<\/script>/)[1];
const script="'use strict';"+inline.split("$('reia').addEventListener")[0];

function render(at,{session=true,override}={}){
 const nodes=new Map();
 class Clock extends Date {constructor(...args){super(...(args.length?args:[at]));}static now(){return Date.parse(at);}}
 const context={Date:Clock,Intl,console,document:{getElementById(id){if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);}}};
 context.window=context;vm.createContext(context);
 if(session)vm.runInContext(readFileSync('lib/suite-sessions.js','utf8'),context);
 if(override)context.SES={info:()=>override};
 vm.runInContext(readFileSync('lib/piata.js','utf8'),context);
 vm.runInContext(script+`;S.macro={VIX:{val:15,chg:0}};S.sect=Array.from({length:11},(_,i)=>({sym:'S'+i,chg1s:2,chg1l:3,cadran:{key:'lead',label:'LEADING'}}));S.rot={spread:1,amandouaPierd:false};deseneaza();`,context);
 return {nodes,session:context.SES?.info()};
}

test('regular trading hours preserve the evidence-based verdict and sizing',()=>{
 const {nodes,session}=render('2026-10-16T14:00:00Z');
 assert.equal(session.state,'rth');assert.equal(nodes.get('verdict').textContent,'RISC PORNIT');assert.match(nodes.get('kick').textContent,/mărime întreagă/);
});

for(const [state,at] of [
 ['weekend','2026-10-17T14:00:00Z'],
 ['holiday','2026-11-26T15:00:00Z'],
 ['pre','2026-10-16T12:00:00Z'],
 ['after','2026-10-16T21:00:00Z'],
 ['closed','2026-10-16T07:00:00Z'],
 ['after','2026-11-27T18:30:00Z']
])test('no execution verdict or sizing while market is '+state+' at '+at,()=>{
 const {nodes,session}=render(at);assert.equal(session.state,state);
 assert.equal(nodes.get('verdict').textContent,'Piața e închisă');
 assert.doesNotMatch(nodes.get('kick').textContent,/mărime întreagă|jumătate de mărime/);
 assert.match(nodes.get('dece').textContent,/nimic de executat/);
});

test('canonical state controls execution even if the display label changes',()=>{
 const {nodes}=render('2026-10-17T14:00:00Z',{override:{state:'weekend',label:'Personalized label'}});
 assert.equal(nodes.get('verdict').textContent,'Piața e închisă');
});

test('missing or incomplete session data cannot authorize execution',()=>{
 for(const options of [{session:false},{override:{label:'RTH'}}]){
  const {nodes}=render('2026-10-16T14:00:00Z',options);
  assert.equal(nodes.get('verdict').textContent,'Sesiune necunoscută');
  assert.doesNotMatch(nodes.get('kick').textContent,/mărime întreagă|jumătate de mărime/);
 }
});
