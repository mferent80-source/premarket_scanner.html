import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function setup(enabled){
 const elements=new Map(),events={};
 function el(id){if(!elements.has(id))elements.set(id,{value:'',hidden:false,disabled:false,textContent:'',innerHTML:'',handlers:{},replaceChildren(){this.innerHTML=''},addEventListener(name,fn){this.handlers[name]=fn}});return elements.get(id)}
 const document={getElementById:el,querySelectorAll:()=>[]};const window={addEventListener:(name,fn)=>events[name]=fn};const calls=[];
 const fetch=async(u,options)=>{if(String(u).includes('trading212-config'))return {json:async()=>({enabled,endpoint:'https://owned-private.workers.dev',directCredentials:true})};calls.push({url:String(u),options});return {ok:true,json:async()=>({source:'Trading 212',environment:'live',fetchedAt:new Date().toISOString(),data:String(u).endsWith('/summary')?{currency:'EUR',available:5}:String(u).endsWith('/positions')?[]:{items:[],nextCursor:null}})}};
 await new AsyncFunction('document','window','fetch','setInterval','btoa','AbortController',readFileSync('broker/broker.js','utf8'))(document,window,fetch,()=>{},btoa,AbortController);
 return {el,events,calls};
}
test('inactive online relay does not request or send API keys',async()=>{const s=await setup(false);for(const id of ['apiKey','apiSecret','connectButton'])assert.equal(s.el(id).disabled,true);await s.el('connect').handlers.submit({preventDefault(){}});assert.equal(s.calls.length,0);assert.match(s.el('status').textContent,/nu este încă activată/)});
test('one simple form sends session credentials to configured HTTPS relay and clears fields',async()=>{const s=await setup(true);s.el('apiKey').value='test-key';s.el('apiSecret').value='test-secret';s.el('brokerEnvironment').value='live';await s.el('connect').handlers.submit({preventDefault(){}});assert.equal(s.calls.length,3);for(const c of s.calls){assert.ok(c.url.startsWith('https://owned-private.workers.dev/api/trading212/'));assert.equal(c.options.headers.Authorization,'Basic '+btoa('test-key:test-secret'));assert.equal(c.options.headers['X-T212-Environment'],'live');assert.equal(c.options.cache,'no-store');assert.equal(c.url.includes('test-key'),false)}assert.equal(s.el('apiKey').value,'');assert.equal(s.el('apiSecret').value,'');s.el('disconnect').onclick();assert.equal(s.el('account').hidden,true);assert.equal(s.el('metrics').innerHTML,'')});
