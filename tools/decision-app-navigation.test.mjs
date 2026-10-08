import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
const script=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].find(m=>m[2].includes('var GROUPS='))[2];
function boot(search=''){
 const elements={},events={},child={postMessage(){}};
 const el=id=>elements[id]||(elements[id]={value:'',hidden:false,contentWindow:child,contains:()=>false,querySelectorAll:()=>[],getAttribute(k){return this[k]||null;},focus(){},blur(){}});
 const document={documentElement:{dataset:{appVersion:"release-test"}},getElementById:el,addEventListener(){}};
 const ctx={document,location:{origin:'https://example.test',href:'https://example.test/project/app/',search},localStorage:{setItem(){}},window:{addEventListener:(n,f)=>events[n]=f},Intl,Date,URLSearchParams,URL};
 vm.runInNewContext(script,ctx);
 return {elements,send:data=>events.message({origin:ctx.location.origin,source:child,data}),events,ctx};
}
test('opens new Decision Desk and exposes no classic navigation',()=>{const b=boot();assert.match(b.elements.frame.src,/desk\/\?app=/);assert.doesNotMatch(b.elements.nav.innerHTML,/Hub clasic|SHELL CLASIC|Smart Trade|Nasdaq Scanner/);});
test('selected ticker and strategy reach the new plan ticket',()=>{const b=boot();b.send({ttOpenModule:'smart-trade-long/',ttQuery:'symbol=CAT&mode=reversal'});assert.equal(b.elements.frame.src,'../desk/?app=decision-mobile-v2&v=release-test&symbol=CAT&mode=reversal&ticket=1');});
test('legacy hash message resolves portfolio within this app',()=>{const b=boot();b.send({ttOpen:'journal/',ttHash:'portfolio'});assert.equal(b.elements.frame.src,'../journal/?app=decision-mobile-v2&v=release-test#portfolio');});
test('unrecognized module and other message senders cannot change route',()=>{const b=boot();const initial=b.elements.frame.src;b.send({ttOpenModule:'hub-clasic/'});assert.equal(b.elements.frame.src,initial);b.events.message({origin:b.ctx.location.origin,source:{},data:{ttOpenModule:'journal/'}});assert.equal(b.elements.frame.src,initial);});
test('reload targets the active module',()=>{const b=boot();b.send({ttOpenModule:'shadow-book/'});b.elements.reloadModule.onclick();assert.match(b.elements.frame.src,/^\.\.\/shadow-book\/\?app=decision-mobile-v2&v=release-test&reload=\d+$/);});
test('search only offers new app modules',()=>{const b=boot();b.elements.search.value='Long';b.elements.search.oninput();assert.match(b.elements.palette.innerHTML,/Long &amp; Reversal/);assert.doesNotMatch(b.elements.palette.innerHTML,/Macro|Hub|Smart Trade/);});
test('all module routes exist and inline app scripts compile',()=>{for(const m of html.matchAll(/\{u:'([^']+)'/g)){assert.ok(fs.existsSync(new URL('../'+m[1].split('#')[0]+'index.html',import.meta.url)));}for(const p of ['../app/index.html','../desk/index.html','../candidate-engine/index.html','../command-center/index.html','../app/coach/index.html','../app/status/index.html']){const s=fs.readFileSync(new URL(p,import.meta.url),'utf8');for(const m of s.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/src=/.test(m[1]))new vm.Script(m[2]);}});

test('journal opens execution tab and support routes use app pages',()=>{const b=boot();b.send({ttOpenModule:'journal/'});assert.equal(b.elements.frame.src,'../journal/?app=decision-mobile-v2&v=release-test#exec');b.send({ttOpenModule:'guide/'});assert.equal(b.elements.frame.src,'../app/coach/?app=decision-mobile-v2&v=release-test');b.send({ttOpenModule:'health/'});assert.equal(b.elements.frame.src,'../app/status/?app=decision-mobile-v2&v=release-test');});

test('broker frame persists across module navigation without restarting connection',()=>{const b=boot();const initial=b.elements.brokerFrame.src;b.send({ttOpenModule:'broker/'});assert.equal(b.elements.brokerFrame.src,initial);assert.equal(b.elements.brokerFrame.hidden,false);assert.equal(b.elements.frame.hidden,true);b.send({ttOpenModule:'journal/'});assert.equal(b.elements.brokerFrame.hidden,true);assert.equal(b.elements.brokerFrame.src,initial);b.send({ttOpenModule:'broker/'});assert.equal(b.elements.brokerFrame.src,initial);});

test('reselecting an open module preserves its document, while explicit reload navigates',()=>{
 const b=boot('?module=holdings%2F');let writes=0,src=b.elements.frame.src;
 Object.defineProperty(b.elements.frame,'src',{get:()=>src,set:v=>{writes++;src=v;}});
 b.send({ttOpenModule:'holdings/'});assert.equal(writes,0);b.elements.reloadModule.onclick();assert.equal(writes,1);assert.match(src,/reload=/);
});

test('fragment navigation reuses a loaded journal document and dismisses the spinner',()=>{const b=boot();b.send({ttOpenModule:'journal/#desk'});b.elements.frame.onload.call(b.elements.frame);assert.equal(b.elements.loading.hidden,true);b.send({ttOpenModule:'journal/#portfolio'});assert.match(b.elements.frame.src,/#portfolio$/);assert.equal(b.elements.loading.hidden,true);b.send({ttOpenModule:'journal/#exec'});assert.equal(b.elements.loading.hidden,true);b.elements.reloadModule.onclick();assert.equal(b.elements.loading.hidden,false);});
