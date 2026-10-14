import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
const script=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].find(m=>m[2].includes('var GROUPS='))[2];
function boot(search='',savedModule=null){
 const elements={},events={},child={postMessage(){}},brokerChild={postMessage(){}},storage=new Map(savedModule?[['tt_app_active_v1',savedModule]]:[]);
 const el=id=>elements[id]||(elements[id]={value:'',hidden:false,dataset:{},contentWindow:id==='brokerFrame'?brokerChild:child,contains:()=>false,querySelectorAll:()=>[],getAttribute(k){return this[k]||null;},setAttribute(k,v){this[k]=v;},focus(){},blur(){}});
 const document={documentElement:{dataset:{appVersion:"release-test"}},getElementById:el,addEventListener(){}};
 const location={origin:'https://example.test',href:'https://example.test/project/app/'+search,search};
 const route=(state,url)=>{location.href=url;location.search=new URL(url).search;};
 const ctx={document,location,history:{state:null,pushed:[],replaceState(state,_,url){this.state=state;route(state,url);},pushState(state,_,url){this.state=state;this.pushed.push({state,url});route(state,url);}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},navigator:{onLine:true},addEventListener:(n,f)=>events[n]=f,Intl,Date,URLSearchParams,URL};
 ctx.window=ctx;
 vm.runInNewContext(fs.readFileSync(new URL('../lib/app-search.js',import.meta.url),'utf8'),ctx);
 vm.runInNewContext(script,ctx);
 return {elements,storage,send:data=>events.message({origin:ctx.location.origin,source:elements.brokerFrame.hidden===false?brokerChild:child,data}),events,ctx};
}
test('a fresh profile opens Astăzi and keeps both scanners accessible',()=>{const b=boot();assert.match(b.elements.frame.src,/today\/\?app=/);assert.equal(b.elements.pageName.textContent,'Astăzi');assert.match(b.elements.nav.innerHTML,/Long &amp; Reversal/);assert.match(b.elements.nav.innerHTML,/Două verdicte/);assert.match(b.elements.nav.innerHTML,/Instrumente &amp; suport/);});
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

test('a full reload returns to the current module and retains the release query',()=>{
 const b=boot('?module=candidate-engine%2F&v=release-test');b.send({ttOpenModule:'journal/#portfolio'});
 const url=new URL(b.ctx.location.href);assert.equal(url.searchParams.get('module'),'journal/#portfolio');assert.equal(url.searchParams.get('v'),'release-test');
 const next=boot(url.search);assert.match(next.elements.frame.src,/#portfolio$/);
 b.send({ttOpenModule:'broker/'});assert.equal(new URL(b.ctx.location.href).searchParams.get('module'),'broker/');
});
test('unrecognized routes never replace the current URL and handoff details stay out of it',()=>{
 const b=boot();const before=b.ctx.location.href;b.send({ttOpenModule:'https://untrusted.test/'});assert.equal(b.ctx.location.href,before);
 b.send({ttOpenModule:'holdings/',ttQuery:'holding=temporary-handoff'});assert.equal(new URL(b.ctx.location.href).searchParams.get('module'),'holdings/');assert.doesNotMatch(b.ctx.location.href,/temporary-handoff/);
});

test('an internal example link keeps its demo query when opened through the shell',()=>{
 const b=boot(),anchor={textContent:'Vezi exemplul',style:{},getAttribute:()=> '../shadow-book/?demo=ai-strategy',addEventListener(_,fn){this.click=fn;}};
 b.elements.frame.src='https://example.test/project/desk/?app=decision-mobile-v2';
 b.elements.frame.contentDocument={createElement:()=>({}),head:{appendChild(){}},querySelectorAll:()=>[anchor]};
 b.elements.frame.onload.call(b.elements.frame);assert.equal(typeof anchor.click,'function');
 anchor.click({preventDefault(){}});assert.match(b.elements.frame.src,/shadow-book\/\?app=.*&demo=ai-strategy$/);
 assert.doesNotMatch(b.ctx.location.href,/demo=ai-strategy/);
});

test('remembered modules are respected and explicit valid queries take precedence',()=>{
 assert.match(boot('', 'holdings/').elements.frame.src,/holdings\//);
 assert.match(boot('?module=journal%2F%23exec','holdings/').elements.frame.src,/#exec$/);
 assert.match(boot('?module=https%3A%2F%2Fforeign.test','holdings/').elements.frame.src,/holdings\//);
 assert.match(boot('', 'https://foreign.test').elements.frame.src,/today\//);
});

test('browser Back restores route and its private query without adding another entry',()=>{
 const b=boot();b.send({ttOpenModule:'candidate-engine/',ttQuery:'symbol=CAT&mode=reversal'});
 const previous=b.ctx.history.pushed.at(-1);b.send({ttOpenModule:'holdings/'});const count=b.ctx.history.pushed.length;
 b.ctx.location.href=previous.url;b.ctx.location.search=new URL(previous.url).search;b.events.popstate({state:previous.state});
 assert.match(b.elements.frame.src,/symbol=CAT&mode=reversal/);assert.equal(b.ctx.history.pushed.length,count);assert.equal(b.elements.pageName.textContent,'Long & Reversal');assert.doesNotMatch(b.ctx.location.href,/symbol=CAT/);
});

test('trusted journal tab changes update shell state without reloading the iframe',()=>{
 const b=boot('?module=journal%2F%23exec');let writes=0,src=b.elements.frame.src;
 Object.defineProperty(b.elements.frame,'src',{get:()=>src,set:v=>{writes++;src=v;}});
 b.send({ttModuleState:{module:'journal/',hash:'#capital'}});assert.equal(writes,0);assert.equal(b.elements.pageName.textContent,'Mișcări de capital');assert.equal(b.ctx.history.pushed.length,1);
 assert.equal(new URL(b.ctx.location.href).searchParams.get('module'),'journal/#capital');
 b.send({ttModuleState:{module:'journal/',hash:'#capital'}});assert.equal(b.ctx.history.pushed.length,1);
 b.send({ttModuleState:{module:'journal/',hash:'#unknown'}});assert.equal(b.ctx.history.pushed.length,1);
 b.events.message({origin:b.ctx.location.origin,source:b.elements.brokerFrame.contentWindow,data:{ttModuleState:{module:'journal/',hash:'#desk'}}});assert.equal(b.elements.pageName.textContent,'Mișcări de capital');
});

test('authentication and synchronization display separate visible states',()=>{
 const b=boot();b.events['tt-cloud-state']({detail:{ready:true,connected:true,lastSync:Date.now(),conflicts:['tt_journal_v1']}});
 assert.equal(b.elements.googleAccountLabel.textContent,'Google conectat');assert.equal(b.elements.syncStatus.textContent,'Conflict de sincronizare');assert.equal(b.elements.syncStatus.dataset.state,'conflict');
 b.events['tt-cloud-state']({detail:{ready:true,connected:true,lastSync:Date.now(),error:'network_failed'}});assert.equal(b.elements.syncStatus.textContent,'Eroare de sincronizare');
 b.ctx.navigator.onLine=false;b.events.offline();assert.equal(b.elements.syncStatus.textContent,'Eroare de sincronizare');
 b.events['tt-cloud-state']({detail:{ready:true,connected:true,lastSync:Date.now()}});assert.equal(b.elements.syncStatus.textContent,'Offline · date locale');
 b.ctx.navigator.onLine=true;b.events.online();assert.match(b.elements.syncStatus.textContent,/Sincronizat la/);
});

test('local symbol search groups results and never renders stored markup',()=>{
 const b=boot();b.storage.set('ce_results_v2',JSON.stringify({momentum:[{symbol:'CAT',mode:'momentum',reason:'<img src=x onerror=alert(1)>'}]}));b.storage.set('tt_independent_scanner_v1',JSON.stringify({items:[{symbol:'CAT',reason:'Reguli independente'}]}));b.storage.set('tt_journal_v1',JSON.stringify([{sym:'CAT'}]));
 b.elements.search.value='CAT';b.elements.search.oninput();const html=b.elements.palette.innerHTML;
 assert.match(html,/Premarket Scanner/);assert.match(html,/Verdict independent/);assert.match(html,/Jurnal/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);
});

test('the mobile bar contains all four useful actions and grouped menu headings stay visible',()=>{
 const b=boot();assert.equal((b.elements.mobileNav.innerHTML.match(/<button/g)||[]).length,4);
 for(const label of ['Astăzi','Portofoliu','Jurnal','Mai multe'])assert.ok(b.elements.mobileNav.innerHTML.includes(label));
 const css=fs.readFileSync(new URL('../app/layout.css',import.meta.url),'utf8');assert.match(css,/\.mobile-menu \.group\{display:block/);assert.doesNotMatch(css,/\.group[^}]*display:none/);
});

