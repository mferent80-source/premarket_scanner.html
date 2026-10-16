import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
const script=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].find(m=>m[2].includes('var GROUPS='))[2];
function classes(){const set=new Set();return {add:k=>set.add(k),remove:k=>set.delete(k),contains:k=>set.has(k),toggle:(k,on)=>{const v=on===undefined?!set.has(k):!!on;if(v)set.add(k);else set.delete(k);return v;}};}
function boot(search='',savedModule=null){
 const frames=[],elements={},events={},messages={child:[],broker:[]},child={postMessage:(data,origin)=>messages.child.push({data,origin})},brokerChild={postMessage:(data,origin)=>messages.broker.push({data,origin})},storage=new Map(savedModule?[['tt_app_active_v1',savedModule]]:[]);
 const el=id=>elements[id]||(elements[id]={value:'',hidden:false,dataset:{},contentWindow:id==='brokerFrame'?brokerChild:child,contains:()=>false,querySelectorAll:()=>[],getAttribute(k){return this[k]||null;},setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];},classList:classes(),parentNode:{insertBefore(x){frames.push(x);}},remove(){this.removed=true;},focus(){},blur(){}});
 const document={documentElement:{dataset:{appVersion:"release-test"}},getElementById:el,addEventListener(){},createElement:()=>({value:'',hidden:false,dataset:{},contentWindow:child,contains:()=>false,querySelectorAll:()=>[],getAttribute(k){return this[k]||null;},setAttribute(k,v){this[k]=v;},removeAttribute(k){delete this[k];},classList:classes(),parentNode:{insertBefore(x){frames.push(x);}},remove(){this.removed=true;},focus(){},blur(){}})};
 const location={origin:'https://example.test',href:'https://example.test/project/app/'+search,search};
 const route=(state,url)=>{location.href=url;location.search=new URL(url).search;};
 const ctx={document,location,history:{state:null,pushed:[],replaceState(state,_,url){this.state=state;route(state,url);},pushState(state,_,url){this.state=state;this.pushed.push({state,url});route(state,url);}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},navigator:{onLine:true},addEventListener:(n,f)=>events[n]=f,Intl,Date,URLSearchParams,URL};
 ctx.window=ctx;
 vm.runInNewContext(fs.readFileSync(new URL('../lib/app-routes.js',import.meta.url),'utf8'),ctx);
 vm.runInNewContext(fs.readFileSync(new URL('../lib/app-search.js',import.meta.url),'utf8'),ctx);
 vm.runInNewContext(script,ctx);
 // paginile vii: elements.frame = cadrul activ (marcat de aplicație cu data-tt-active)
 const original=elements.frame;if(!frames.includes(original))frames.unshift(original);Object.defineProperty(elements,'frame',{configurable:true,get(){return frames.find(f=>f.dataset&&f.dataset.ttActive==='1'&&!f.removed)||original;}});elements.__frames=frames;
 return {elements,storage,messages,send:data=>events.message({origin:ctx.location.origin,source:elements.brokerFrame.hidden===false?brokerChild:child,data}),events,ctx};
}
function link(href,attributes={}){
 const values={href,...attributes};
 return {href,textContent:'Vezi exemplul',getAttribute:k=>values[k]??null,hasAttribute:k=>Object.hasOwn(values,k)};
}
function loadChildDocument(b,anchors=[]){
 const clicks=[],doc={createElement:()=>({}),head:{appendChild(){}},querySelectorAll:()=>anchors,addEventListener(type,fn){if(type==='click')clicks.push(fn);}};
 b.elements.frame.contentDocument=doc;b.elements.frame.onload.call(b.elements.frame);
 return {doc,clicks,click(anchor,options={}){let prevented=false;const event={target:{closest:()=>anchor},button:0,preventDefault(){prevented=true;this.defaultPrevented=true;},...options};for(const fn of clicks)fn(event);return prevented;}};
}
test('a fresh profile opens Astăzi with the approved five tasks and active tools',()=>{const b=boot();assert.match(b.elements.frame.src,/today\/\?app=/);assert.equal(b.elements.pageName.textContent,'Astăzi');for(const name of ['Astăzi','Piață','Portofoliu','Jurnal','Risc &amp; capital','Instrumente','Health','Setări'])assert.ok(b.elements.nav.innerHTML.includes(name));assert.equal((b.elements.nav.innerHTML.match(/<button/g)||[]).length,8,'15.10.2026: Health integrat în Spațiu de lucru, la cererea lui');assert.doesNotMatch(b.elements.nav.innerHTML,/Macro|Postmortem|Nasdaq|MFX/);});
test('selected ticker and strategy reach the new plan ticket',()=>{const b=boot();b.send({ttOpenModule:'smart-trade-long/',ttQuery:'symbol=CAT&mode=reversal'});assert.equal(b.elements.frame.src,'../desk/?app=decision-mobile-v2&v=release-test&symbol=CAT&mode=reversal&ticket=1');});
test('legacy hash message resolves portfolio within this app',()=>{const b=boot();b.send({ttOpen:'journal/',ttHash:'portfolio'});assert.equal(b.elements.frame.src,'../journal/?app=decision-mobile-v2&v=release-test#portfolio');});
test('unrecognized module and other message senders cannot change route',()=>{const b=boot();const initial=b.elements.frame.src;b.send({ttOpenModule:'hub-clasic/'});assert.equal(b.elements.frame.src,initial);b.events.message({origin:b.ctx.location.origin,source:{},data:{ttOpenModule:'journal/'}});assert.equal(b.elements.frame.src,initial);});
test('reload targets the active module',()=>{const b=boot();b.send({ttOpenModule:'shadow-book/'});b.elements.reloadModule.onclick();assert.match(b.elements.frame.src,/^\.\.\/shadow-book\/\?app=decision-mobile-v2&v=release-test&reload=\d+$/);});
test('search only offers new app modules',()=>{const b=boot();b.elements.search.value='Long';b.elements.search.oninput();assert.match(b.elements.palette.innerHTML,/Long &amp; Reversal/);assert.doesNotMatch(b.elements.palette.innerHTML,/Macro|Hub|Smart Trade/);});
test('all module routes exist and inline app scripts compile',()=>{const b=boot();assert.ok(b.ctx.TTAppRoutes.all.length>=19);for(const route of b.ctx.TTAppRoutes.all){assert.ok(fs.existsSync(new URL('../'+route.u.split('#')[0]+'index.html',import.meta.url)),route.u);}for(const p of ['../app/index.html','../desk/index.html','../candidate-engine/index.html','../command-center/index.html','../app/coach/index.html','../app/status/index.html']){const s=fs.readFileSync(new URL(p,import.meta.url),'utf8');for(const m of s.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/src=/.test(m[1]))new vm.Script(m[2]);}});

test('journal opens execution tab and support routes use app pages',()=>{const b=boot();b.send({ttOpenModule:'journal/'});assert.equal(b.elements.frame.src,'../journal/?app=decision-mobile-v2&v=release-test#exec');b.send({ttOpenModule:'guide/'});assert.equal(b.elements.frame.src,'../app/coach/?app=decision-mobile-v2&v=release-test');b.send({ttOpenModule:'health/'});assert.equal(b.elements.frame.src,'../health/?app=decision-mobile-v2&v=release-test');});
test('Europe home link returns to Today in the existing workspace',()=>{const b=boot('?module=europe-stocks%2F'),child=loadChildDocument(b);assert.equal(child.click(link('../app/')),true);assert.match(b.elements.frame.src,/^\.\.\/today\/\?app=/);assert.equal(b.elements.pageName.textContent,'Astăzi');});

test('broker frame persists across module navigation without restarting connection',()=>{const b=boot();const initial=b.elements.brokerFrame.src;b.send({ttOpenModule:'broker/'});assert.equal(b.elements.brokerFrame.src,initial);assert.equal(b.elements.brokerFrame.hidden,false);assert.equal(b.elements.frame.classList.contains('parked'),true,'paginile rămân vii, parcate sub conector');b.send({ttOpenModule:'journal/'});assert.equal(b.elements.brokerFrame.hidden,true);assert.equal(b.elements.brokerFrame.src,initial);b.send({ttOpenModule:'broker/'});assert.equal(b.elements.brokerFrame.src,initial);});

test('only the active Today document can request a refresh from the persistent broker',()=>{
 const b=boot(),src=b.elements.brokerFrame.src;
 b.send({ttRefreshBroker:true});assert.deepEqual(JSON.parse(JSON.stringify(b.messages.broker)),[{data:{ttRefreshBroker:true},origin:b.ctx.location.origin}]);assert.equal(b.elements.brokerFrame.src,src);
 b.events.message({origin:'https://untrusted.test',source:b.elements.frame.contentWindow,data:{ttRefreshBroker:true}});
 b.events.message({origin:b.ctx.location.origin,source:{},data:{ttRefreshBroker:true}});assert.equal(b.messages.broker.length,1);
 b.send({ttOpenModule:'journal/'});b.send({ttRefreshBroker:true});assert.equal(b.messages.broker.length,1);
 b.send({ttOpenModule:'broker/'});b.send({ttRefreshBroker:true});assert.equal(b.messages.broker.length,1);
});

test('broker refresh results are accepted from the hidden broker only, stripped to fixed messages, and sent to active Today',()=>{
 const b=boot(),send=(data,source=b.elements.brokerFrame.contentWindow,origin=b.ctx.location.origin)=>b.events.message({origin,source,data});
 for(const state of ['loading','ready','partial','error','busy'])send({ttBrokerRefresh:{state,message:'secret-key',account:{secret:'other-account'}}});
 assert.equal(b.messages.child.length,5);for(const m of b.messages.child){assert.deepEqual(Object.keys(m.data.ttBrokerRefresh).sort(),['message','state']);assert.doesNotMatch(JSON.stringify(m),/secret-key|other-account/);assert.equal(m.origin,b.ctx.location.origin);}
 send({ttBrokerRefresh:{state:'ready'}},b.elements.frame.contentWindow);send({ttBrokerRefresh:{state:'ready'}},{ });send({ttBrokerRefresh:{state:'ready'}},b.elements.brokerFrame.contentWindow,'https://untrusted.test');send({ttBrokerRefresh:{state:'toString'}});assert.equal(b.messages.child.length,5);
 b.send({ttOpenModule:'journal/'});send({ttBrokerRefresh:{state:'ready'}});assert.equal(b.messages.child.length,5);
});

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
 const b=boot(),anchor=link('../shadow-book/?demo=ai-strategy');
 b.elements.frame.src='https://example.test/project/desk/?app=decision-mobile-v2';
 const child=loadChildDocument(b,[anchor]);assert.equal(child.click(anchor),true);assert.match(b.elements.frame.src,/shadow-book\/\?app=.*&demo=ai-strategy$/);
 assert.doesNotMatch(b.ctx.location.href,/demo=ai-strategy/);
});

test('links regenerated after rendering still update the shell and retain selected scanner context',()=>{
 const b=boot('?module=journal%2F%23exec'),child=loadChildDocument(b);
 const regenerated=link('../candidate-engine/?symbol=CAT&mode=reversal');
 assert.equal(child.click(regenerated),true);
 assert.equal(b.elements.pageName.textContent,'Long & Reversal');
 assert.match(b.elements.frame.src,/candidate-engine\/\?app=.*&symbol=CAT&mode=reversal$/);
 assert.equal(new URL(b.ctx.location.href).searchParams.get('module'),'candidate-engine/');
 assert.doesNotMatch(b.ctx.location.href,/symbol=CAT/);
});

test('modifier, middle-click, target and download links retain their original destination and query',()=>{
 for(const options of [{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1},{defaultPrevented:true}]){
  const b=boot('?module=journal%2F%23exec'),anchor=link('../candidate-engine/?symbol=CAT&mode=reversal'),child=loadChildDocument(b,[anchor]),before=b.elements.frame.src;
  assert.equal(anchor.href,'../candidate-engine/?symbol=CAT&mode=reversal');
  assert.equal(child.click(anchor,options),false);assert.equal(b.elements.frame.src,before);
 }
 for(const attributes of [{target:'_blank'},{target:'_top'},{download:'execution.json'}]){
  const b=boot('?module=journal%2F%23exec'),anchor=link('../candidate-engine/?symbol=CAT&mode=reversal',attributes),child=loadChildDocument(b,[anchor]),before=b.elements.frame.src;
  assert.equal(anchor.href,'../candidate-engine/?symbol=CAT&mode=reversal');
  assert.equal(child.click(anchor),false);assert.equal(b.elements.frame.src,before);
 }
});

test('each child document receives one delegated navigation handler and excludes external or fragment links',()=>{
 const b=boot('?module=journal%2F%23exec'),child=loadChildDocument(b);
 b.elements.frame.onload.call(b.elements.frame);assert.equal(child.clicks.length,1);
 const before=b.elements.frame.src;
 for(const href of ['https://foreign.test/project/candidate-engine/?symbol=CAT','#portfolio','../unrecognized/?id=1'])assert.equal(child.click(link(href)),false);
 assert.equal(b.elements.frame.src,before);
 assert.equal(child.click(link('../candidate-engine/?symbol=CAT',{target:'_self'})),true);
 assert.equal(b.ctx.history.pushed.length,1);
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


test('saved unavailable modules recover to Today with an explicit status instead of opening a retired page',()=>{const b=boot('?module=macro-dashboard%2F');assert.equal(b.elements.pageName.textContent,'Astăzi');assert.equal(b.elements.routeNotice.hidden,false);assert.match(b.elements.routeNotice.textContent,/nu mai este disponibilă/);});

test('primary risk navigation canonicalizes old Governor and capital aliases',()=>{const b=boot();b.send({ttOpen:'governor/'});assert.equal(b.elements.pageName.textContent,'Risc & capital');assert.match(b.elements.frame.src,/#desk$/);b.send({ttOpen:'equity/'});assert.equal(b.elements.pageName.textContent,'Mișcări de capital');assert.match(b.elements.frame.src,/#capital$/);});

test('retired modules never replace the active frame or expose a search destination',()=>{const b=boot();for(const route of b.ctx.TTAppRoutes.retired){const before=b.elements.frame.src;b.send({ttOpenModule:route});assert.equal(b.elements.frame.src,before);}b.elements.search.value='MFX';b.elements.search.oninput();assert.match(b.elements.palette.innerHTML,/Niciun rezultat/);});
test('paginile vii: întoarcerea la o pagină deschisă nu o reîncarcă și o parchează pe cealaltă',()=>{
 const b=boot(),today=b.elements.frame;loadChildDocument(b);assert.equal(today._ttLoaded,true);
 b.send({ttOpenModule:'holdings/'});const hold=b.elements.frame;assert.notEqual(hold,today);assert.match(hold.src,/holdings\/\?app=/);assert.equal(today.classList.contains('parked'),true);assert.equal(today.inert,true);
 b.send({ttOpenModule:'today/'});assert.equal(b.elements.frame,today);assert.equal(today._ttLoaded,true,'fără reîncărcare');assert.equal(today.classList.contains('parked'),false);assert.equal(hold.classList.contains('parked'),true);
});
test('paginile vii: peste limită iese cea mai veche pagină, Astăzi rămâne',()=>{
 const b=boot(),today=b.elements.frame;const open=u=>{b.send({ttOpenModule:u});return b.elements.frame;};
 const hold=open('holdings/');open('journal/');open('scanner-verdicts/');open('health/');
 assert.equal(hold.removed,true,'Portofoliul, cea mai veche, a ieșit');assert.notEqual(today.removed,true,'Astăzi rămâne');
 assert.equal(b.elements.__frames.filter(f=>!f.removed).length,4);
});
test('paginile vii: o predare cu aceeași adresă reîncarcă pagina (planul nu rămâne cu analiza veche)',()=>{
 const b=boot(),go=()=>b.send({ttOpenModule:'smart-trade-long/',ttQuery:'symbol=CAT&mode=reversal'});
 go();loadChildDocument(b);assert.equal(b.elements.frame._ttLoaded,true);
 b.send({ttOpenModule:'today/'});go();assert.equal(b.elements.frame._ttLoaded,false,'aceeași interogare ⇒ reîncărcare');
});
test('paginile vii: pagina află când e parcată și când revine',()=>{
 const b=boot();loadChildDocument(b);b.messages.child.length=0;
 b.send({ttOpenModule:'holdings/'});assert.ok(b.messages.child.some(m=>m.data.ttShellVisible===false));
 b.messages.child.length=0;b.send({ttOpenModule:'today/'});assert.ok(b.messages.child.some(m=>m.data.ttShellVisible===true));
});
test('paginile vii: răspunsul conectorului ajunge la Astăzi și când e parcată',()=>{
 const b=boot();loadChildDocument(b);b.send({ttOpenModule:'holdings/'});b.messages.child.length=0;
 b.events.message({origin:b.ctx.location.origin,source:b.elements.brokerFrame.contentWindow,data:{ttBrokerRefresh:{state:'ready'}}});
 assert.ok(b.messages.child.some(m=>m.data.ttBrokerRefresh&&m.data.ttBrokerRefresh.state==='ready'));
});
