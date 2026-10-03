import {test} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
async function setup(version){const label={},button={hidden:true,addEventListener:(n,f)=>button.click=f};let replaced=null;const c={URL,Date,document:{documentElement:{dataset:{appVersion:'26.10.03.1400'}},querySelectorAll:q=>q==='[data-version]'?[label]:[button],addEventListener:()=>{}},window:{addEventListener:()=>{}},location:{href:'https://example.test/app/',replace:u=>replaced=u},navigator:{},fetch:async()=>({ok:true,json:async()=>({version})}),setInterval:()=>{}};vm.createContext(c);vm.runInContext(readFileSync('app/version.js','utf8'),c);await new Promise(resolve=>setImmediate(resolve));return {label,button,replaced:()=>replaced};}
test('current version remains visible without showing an update',async()=>{const s=await setup('26.10.03.1400');assert.equal(s.label.textContent,'v26.10.03.1400');assert.equal(s.button.hidden,true);});
test('new release shows update and reloads a cache-busted app URL',async()=>{const s=await setup('26.10.03.1500');assert.equal(s.button.hidden,false);await s.button.click();assert.match(s.replaced(),/v=26.10.03.1500/);});

test('published version metadata, initial badge and script cache key stay identical',()=>{
 const version=JSON.parse(readFileSync('app/version.json','utf8')).version,html=readFileSync('app/index.html','utf8');
 assert.ok(html.includes('data-app-version="'+version+'"'));assert.ok(html.includes('<span data-version>v'+version+'</span>'));assert.ok(html.includes('version.js?v='+version+'"'));
});
