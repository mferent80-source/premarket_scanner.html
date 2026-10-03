import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
function setup(standalone=false){
 const handlers={},button={hidden:false,addEventListener(_,fn){this.click=fn}},help={open:false,showModal(){this.open=true},close(){this.open=false},addEventListener(){}},menu={open:true,close(){this.open=false}},close={};
 const document={querySelectorAll:()=>[button],getElementById:id=>({installHelp:help,mobileMenu:menu,closeInstallHelp:close}[id])};
 vm.runInNewContext(readFileSync('app/install.js','utf8'),{document,window:{matchMedia:()=>({matches:standalone}),addEventListener:(n,fn)=>handlers[n]=fn},navigator:{},console});
 return {handlers,button,help,menu};
}
test('installation help remains available without native prompt',async()=>{const s=setup();await s.button.click();assert.equal(s.menu.open,false);assert.equal(s.help.open,true)});
test('browser prompt is invoked once from a click',async()=>{const s=setup();let calls=0,prevented=false;s.handlers.beforeinstallprompt({preventDefault(){prevented=true},async prompt(){calls++},userChoice:Promise.resolve({outcome:'dismissed'})});assert.equal(calls,0);await s.button.click();assert.equal(calls,1);assert.equal(prevented,true);await s.button.click();assert.equal(calls,1);assert.equal(s.help.open,true)});
test('installed app hides install controls',()=>{assert.equal(setup(true).button.hidden,true);const s=setup();s.handlers.appinstalled();assert.equal(s.button.hidden,true)});
test('manifest icons resolve to real PNG dimensions',()=>{const m=JSON.parse(readFileSync('app/manifest.webmanifest'));assert.equal(m.display,'standalone');assert.equal(m.start_url,'./');for(const size of [192,512]){const icon=m.icons.find(i=>i.sizes===`${size}x${size}`);const b=readFileSync(`app/${icon.src}`);assert.equal(b.readUInt32BE(16),size);assert.equal(b.readUInt32BE(20),size)}});
