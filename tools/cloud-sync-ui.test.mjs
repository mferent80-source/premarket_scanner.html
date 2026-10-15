import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const syncScript=readFileSync(new URL('../app/sync/sync.js',import.meta.url),'utf8');
const failureScript=readFileSync(new URL('../app/failure-info.js',import.meta.url),'utf8');
function diagnosticUi({error='cloud_response_invalid',failure,version='26.10.14.2209',helper=true,verification=false}={}){
 const nodes=new Map(),events=new Map(),downloads=[],calls={sync:0,recheck:0,writes:0};
 const node=tag=>({tag,children:[],textContent:'',hidden:false,disabled:false,style:{},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},click(){this.onclick?.();},remove(){},set innerHTML(_value){throw Error('UI must render diagnostic text with textContent');}});
 const element=id=>{if(!nodes.has(id))nodes.set(id,node('div'));return nodes.get(id);};
 const state={ready:true,connected:true,email:'PRIVATE_IDENTITY',busy:false,checking:false,setup:null,error,failure:failure??{code:'cloud_response_invalid',operation:'read-record',key:'tt_journal_v1',httpStatus:503,at:Date.now()},lastSync:null,conflicts:[],supportedKeys:[],trading212:{local:true,cloud:true}};
 const cloud={state:()=>state,sync:async()=>{calls.sync++;state.error='';state.failure=null;},recheck:async()=>{calls.recheck++;}};
 const listen=(name,fn)=>{const handlers=events.get(name)||[];handlers.push(fn);events.set(name,handlers);};
 const context={Date,Intl,Blob,parent:{TTCloud:cloud,document:{documentElement:{dataset:{appVersion:version}}}},location:{origin:'https://example.test'},document:{getElementById:element,createElement:node,head:node('head'),body:node('body'),documentElement:{dataset:{appVersion:'26.10.14.0000'}},addEventListener:listen,hidden:false},navigator:{onLine:true},localStorage:{getItem:()=>null,setItem(){calls.writes++;}},URL:{createObjectURL:blob=>{downloads.push(blob);return 'blob:diagnostic';},revokeObjectURL(){}},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,addEventListener:listen};
 context.window=context;vm.createContext(context);
 if(helper)vm.runInContext(failureScript,context);
 vm.runInContext(syncScript,context);
 if(verification){vm.runInContext(readFileSync(new URL('../lib/operational-checks.js',import.meta.url),'utf8'),context);vm.runInContext(readFileSync(new URL('../app/sync/verification.js',import.meta.url),'utf8'),context);}
 const broadcast=({source=context.parent,origin=context.location.origin}={})=>(events.get('message')||[]).forEach(fn=>fn({source,origin,data:{ttCloudState:state}}));
 return {context,state,cloud,calls,element,broadcast,downloads};
}

test('sync failures show their operation, register, HTTP code and parent app version while Google remains connected',async()=>{
 const u=diagnosticUi();
 assert.equal(u.element('syncFailure').hidden,false);
 assert.equal(u.element('syncFailureDetail').textContent,u.context.TTCloudFailure.describe(u.state.failure));
 assert.match(u.element('syncFailureDetail').textContent,/Citire registru cloud.*Jurnal manual.*\[cloud_response_invalid\].*HTTP 503/);
 assert.equal(u.element('syncFailureVersion').textContent,'Versiunea aplicației: 26.10.14.2209');
 assert.match(u.element('status').textContent,/Citirea cloud a returnat date incomplete/);
 assert.equal(u.element('identity').textContent,'Cont: PRIVATE_IDENTITY');
 assert.equal(u.element('googleButton').hidden,true);
 assert.equal(u.element('prepare').hidden,true);
 assert.equal(u.element('sync').disabled,false);
 assert.equal(u.element('logout').hidden,false);
 assert.deepEqual(u.calls,{sync:0,recheck:0,writes:0},'showing diagnostics cannot invoke sync or mutate data');
 u.state.busy=true;u.broadcast();
 assert.equal(u.element('syncFailure').hidden,false,'an in-progress state cannot obscure an existing failure');
 assert.match(u.element('status').textContent,/Citirea cloud a returnat date incomplete/);
 u.state.busy=false;u.state.failure={code:'rate_limited',operation:'write-record',key:'tt_trading212_fills_v1',httpStatus:429,at:Date.now()};u.broadcast();
 assert.match(u.element('syncFailureDetail').textContent,/Salvare registru cloud.*Execuții Trading 212.*HTTP 429/);
 await u.element('sync').onclick();
 assert.equal(u.calls.sync,1,'the existing action still delegates directly to TTCloud');
 assert.equal(u.element('syncFailure').hidden,true);
 assert.equal(u.element('syncFailureDetail').textContent,'');
 assert.equal(u.element('syncFailureVersion').textContent,'');
 assert.match(u.element('status').textContent,/Cont conectat/);
});

test('the reported broker-fill storage failure identifies Trading 212 fills without requiring an HTTP response',()=>{
 const u=diagnosticUi({error:'localStorage.setItem tt_trading212_fills_v1 exceeds quota',failure:{code:'client_error',operation:'sync',key:'tt_trading212_fills_v1',httpStatus:null,at:Date.now()}});
 assert.equal(u.element('syncFailure').hidden,false);
 assert.match(u.element('syncFailureDetail').textContent,/Sincronizare.*Execuții Trading 212.*\[client_error\]/);
 assert.doesNotMatch(u.element('syncFailureDetail').textContent,/HTTP/);
 assert.equal(u.element('syncFailureVersion').textContent,'Versiunea aplicației: 26.10.14.2209');
 assert.equal(u.element('status').textContent,'localStorage.setItem tt_trading212_fills_v1 exceeds quota');
 assert.equal(u.element('googleButton').hidden,true);
 assert.equal(u.element('sync').disabled,false);
});

test('diagnostic rendering excludes unapproved failure fields and never turns error or version data into markup',()=>{
 const secret='PRIVATE_PAYLOAD_<img src=x onerror=alert(1)>',u=diagnosticUi({version:secret});
 Object.assign(u.state.failure,{payload:secret,identity:secret,token:secret,response:{body:secret}});u.broadcast();
 assert.equal(u.element('syncFailureVersion').textContent,'Versiunea aplicației: neconfirmată');
 assert.equal(u.element('syncFailureDetail').textContent.includes(secret),false);
 u.state.failure={code:secret,operation:'read-record',key:'tt_journal_v1',httpStatus:500,at:Date.now()};u.broadcast();
 assert.match(u.element('syncFailureDetail').textContent,/nu sunt încă disponibile/);
 assert.equal(u.element('syncFailureDetail').textContent.includes(secret),false);
 u.state.error='<script>error text</script>';u.state.failure=null;u.broadcast();
 assert.equal(u.element('status').textContent,'<script>error text</script>','the original raw status remains readable text');
 assert.equal(u.element('syncFailure').hidden,false);
 u.context.parent.document.documentElement.dataset.appVersion='26.10.14.2244';u.broadcast();
 assert.equal(u.element('syncFailureVersion').textContent,'Versiunea aplicației: 26.10.14.2244');
});

test('the diagnostic card follows only trusted cloud broadcasts and stays visible when metadata is unavailable',()=>{
 const u=diagnosticUi({helper:false});
 assert.equal(u.element('syncFailure').hidden,false);
 assert.match(u.element('syncFailureDetail').textContent,/nu sunt încă identificate/);
 const before=u.element('syncFailureDetail').textContent;
 u.state.error='';u.broadcast({source:{}});u.broadcast({origin:'https://foreign.test'});
 assert.equal(u.element('syncFailure').hidden,false);
 assert.equal(u.element('syncFailureDetail').textContent,before);
 u.broadcast();assert.equal(u.element('syncFailure').hidden,true);
 u.state.error='cloud_response_invalid';u.state.checking=true;u.broadcast();
 assert.equal(u.element('syncFailure').hidden,false);
 assert.match(u.element('status').textContent,/Verific disponibilitatea/,'readiness status is preserved independently');
});

test('diagnostic JSON download remains enabled during sync failure and preserves the sanitized current context',async()=>{
 const u=diagnosticUi({verification:true});u.state.busy=true;u.broadcast();
 assert.equal(u.element('operationalExport').disabled,false);
 u.element('operationalExport').onclick();
 assert.equal(u.downloads.length,1);
 const report=JSON.parse(await u.downloads[0].text());
 assert.equal(report.appVersion,'26.10.14.2209');
 assert.equal(report.rows.find(item=>item.id==='sync').state,'blocked');
 assert.equal(report.synchronizationFailure.operation,'read-record');
 assert.equal(report.synchronizationFailure.key,'tt_journal_v1');
 assert.equal(report.synchronizationFailure.httpStatus,503);
 assert.equal(JSON.stringify(report).includes('PRIVATE_IDENTITY'),false);
 assert.deepEqual(u.calls,{sync:0,recheck:0,writes:0},'download is read-only and does not retry an errored request');
});

test('Sync page loads the safe failure formatter before its UI and places diagnostics immediately below status',()=>{
 const page=readFileSync(new URL('../app/sync/index.html',import.meta.url),'utf8');
 assert.match(page,/<div id="status"[^>]*>[^<]*<\/div><section id="syncFailure"/);
 assert.ok(page.indexOf('../failure-info.js?')<page.indexOf('src="sync.js?'));
 assert.ok(page.indexOf('../failure-info.js?')<page.indexOf('../../lib/operational-checks.js?'));
 assert.match(page,/id="syncFailure"[^>]*hidden[^>]*aria-live="polite"/);
});

test('Google steps and auth errors survive cloud broadcasts; retry cannot reset the GIS client',async()=>{
 const elements=new Map(),listeners=new Map();let initialized=0,challengeCount=0,reloads=0,googleOptions,buttonOptions;
 const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',hidden:false,disabled:false,replaceChildren(){},append(){}});return elements.get(id);};
 const state={ready:true,connected:false,email:null,busy:false,checking:false,setup:null,error:'',lastSync:null,conflicts:[],supportedKeys:[]};
 const cloud={clientId:'test.apps.googleusercontent.com',state:()=>state,challenge:async()=>{challengeCount++;return {nonce:'fresh-nonce'};},login:async()=>{throw Error('challenge_expired');}};
 const parent={TTCloud:cloud},context={parent,window:{addEventListener:(name,fn)=>listeners.set(name,fn)},location:{origin:'https://example.test',reload:()=>{reloads++;}},document:{getElementById:element,createElement:()=>({}),head:{append:script=>script.onload()}},google:{accounts:{id:{initialize:options=>{initialized++;googleOptions=options;},renderButton:(_,options)=>{buttonOptions=options;}}}},setTimeout:()=>1,clearTimeout(){}};
 vm.createContext(context);vm.runInContext(readFileSync(new URL('../app/sync/sync.js',import.meta.url),'utf8'),context);
 const pending=element('prepare').onclick();assert.equal(element('prepare').disabled,true);await pending;
 assert.match(element('status').textContent,/Apasă butonul alb Google/);assert.equal(initialized,1);assert.equal(challengeCount,1);
 listeners.get('message')({source:parent,origin:'https://example.test',data:{ttCloudState:state}});
 assert.match(element('status').textContent,/Apasă butonul alb Google/);
 buttonOptions.click_listener();assert.match(element('status').textContent,/Alege contul în fereastra Google/);
 await googleOptions.callback({credential:'test-credential'});
 assert.match(element('status').textContent,/a expirat/);
 listeners.get('message')({source:parent,origin:'https://example.test',data:{ttCloudState:state}});
 assert.match(element('status').textContent,/a expirat/);
 await element('prepare').onclick();assert.equal(reloads,1);assert.equal(initialized,1);assert.equal(challengeCount,1);
});

test('broker credential actions show progress, confirmed results and useful errors across cloud broadcasts',async()=>{
 const elements=new Map(),listeners=new Map();let release,saveCalls=0,restoreCalls=0;
 const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',hidden:false,disabled:false,replaceChildren(){},append(){}});return elements.get(id);};
 const state={ready:true,connected:true,email:'fixture@example.test',busy:false,checking:false,setup:null,error:'',lastSync:1,conflicts:[],supportedKeys:[],trading212:{local:true,cloud:false,synced:false,environment:'live',checkedAt:1,message:''}};
 const cloud={state:()=>state,publishCredentials:async()=>{saveCalls++;state.busy=true;await new Promise(r=>{release=r;});state.busy=false;state.trading212={...state.trading212,cloud:true,synced:true,message:'Conexiune salvată și verificată.'};},restoreCredentials:async()=>{restoreCalls++;state.trading212.message='Conexiune preluată din cloud.';}};
 const parent={TTCloud:cloud},context={parent,window:{addEventListener:(name,fn)=>listeners.set(name,fn)},location:{origin:'https://example.test'},document:{getElementById:element},setTimeout:()=>1,clearTimeout(){}};
 vm.createContext(context);vm.runInContext(readFileSync(new URL('../app/sync/sync.js',import.meta.url),'utf8'),context);
 assert.match(element('credentialsState').textContent,/salvată pe acest dispozitiv/);assert.equal(element('publishKey').disabled,false);assert.equal(element('restoreKey').disabled,true);
 const pending=element('publishKey').onclick();assert.match(element('credentialsState').textContent,/Salvez și verific/);
 listeners.get('message')({source:parent,origin:'https://example.test',data:{ttCloudState:state}});assert.equal(element('publishKey').disabled,true);assert.match(element('credentialsState').textContent,/Salvez și verific/);
 release();await pending;assert.equal(saveCalls,1);assert.match(element('credentialsState').textContent,/salvată și verificată/);assert.equal(element('restoreKey').disabled,false);
 await element('restoreKey').onclick();assert.equal(restoreCalls,1);assert.match(element('credentialsState').textContent,/preluată/);
 cloud.restoreCredentials=async()=>{throw Error('cloud_credentials_missing');};await element('restoreKey').onclick();assert.match(element('credentialsState').textContent,/Nu există o conexiune Trading 212 salvată în cloud/);
 listeners.get('message')({source:parent,origin:'https://example.test',data:{ttCloudState:state}});assert.match(element('credentialsState').textContent,/Nu există o conexiune/);
});

