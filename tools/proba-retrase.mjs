// PROBA PAGINILOR RETRASE (22.09.2026)
//
// Marius a scos din suita jurnalul/retrospectiva, laboratoarele si cele tehnice.
// Paginile raman pe disc; `nav.js` ascunde linkurile catre ele din restul suitei.
//
// Garda de aici NU se multumeste sa numere „0 linkuri vizibile" - un zero poate
// insemna si ca n-avea ce ascunde. Injecteaza un link catre o pagina retrasa,
// exact cum l-ar desena pagina la o actiune, si cere sa fie ascuns; apoi injecteaza
// unul normal si cere sa RAMANA vizibil, ca sa nu treaca o garda care ascunde tot.
//
//   node tools/proba-retrase.mjs

import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
const EDGE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port=9400+Math.floor(Math.random()*90);
const profil=`C:/Users/Cimin/AppData/Local/Temp/tt-ret-${port}`;
const b=spawn(EDGE,['--headless=new','--disable-gpu',`--remote-debugging-port=${port}`,`--user-data-dir=${profil}`,'--window-size=1440,1200','--no-first-run','about:blank'],{stdio:'ignore'});
const w=(ms)=>new Promise(r=>setTimeout(r,ms));
let t; for(let i=0;i<60&&!t;i++){try{t=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(x=>x.type==='page');}catch{} if(!t)await w(250);}
const ws=new WebSocket(t.webSocketDebuggerUrl); let id=0; const m=new Map();
const s=(me,pa={})=>new Promise(r=>{const n=++id;m.set(n,r);ws.send(JSON.stringify({id:n,method:me,params:pa}));});
ws.onmessage=e=>{const d=JSON.parse(e.data); if(d.id&&m.has(d.id)){m.get(d.id)(d.result);m.delete(d.id);}};
await new Promise(r=>{ws.onopen=r;}); await s('Page.enable'); await s('Runtime.enable');
const ev=async(x)=>(await s('Runtime.evaluate',{expression:x,returnByValue:true}))?.result?.value;
const RET=/journal\/|portfolio\/|equity\/|governor\/|weekly\/|shadow-book\/|postmortem\/|markov-lab\/|factor-lab\/|mfx-screener\/|hub-demo\/|shell\/|proxy\//;
await s('Page.navigate',{url:'http://127.0.0.1:8777/nasdaq-scanner/'}); await w(7000);
// PROBA PRIN STRICARE: injectez eu un link catre o pagina retrasa, exact cum l-ar
// desena pagina la o actiune, si cer sa fie ascuns. Fara asta, un „0 vizibile" nu
// dovedeste nimic - poate doar ca n-avea ce ascunde.
const r1 = await ev(`(() => {
  const a = document.createElement('a');
  a.href = '../journal/?sym=AAPL#exec';
  a.textContent = 'Trimite in Journal';
  a.id = 'proba-retras';
  document.body.appendChild(a);
  return 'injectat';
})()`);
await w(900);
const r2 = await ev(`(() => {
  const a = document.getElementById('proba-retras');
  if (!a) return 'linkul a disparut din DOM';
  const st = getComputedStyle(a);
  return { ascuns: a.hidden === true, display: st.display, marcat: a.dataset.ttRetras || '(nemarcat)' };
})()`);
console.log('  link injectat catre ../journal/?sym=AAPL#exec ->', JSON.stringify(r2));

// si un link care NU e retras trebuie sa ramana vizibil
await ev(`(() => { const a=document.createElement('a'); a.href='../watchlist-monitor/'; a.id='proba-ok'; a.textContent='Watchlist'; document.body.appendChild(a); })()`);
await w(900);
console.log('  link normal catre ../watchlist-monitor/ ->', JSON.stringify(await ev(`(() => { const a=document.getElementById('proba-ok'); return { ascuns: a.hidden === true, display: getComputedStyle(a).display }; })()`)));

ws.close(); b.kill(); await w(300); try{rmSync(profil,{recursive:true,force:true});}catch{} process.exit(0);
