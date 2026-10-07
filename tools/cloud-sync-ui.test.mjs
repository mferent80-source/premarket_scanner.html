import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

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
