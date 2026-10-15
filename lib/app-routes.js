/* Canonical navigation for the active workspace. No market/account state. */
(function(g){
  'use strict';
  const primary=[
    {u:'today/',n:'Astăzi',i:'today'},
    {u:'scanner-verdicts/',n:'Piață',i:'market'},
    {u:'holdings/',n:'Portofoliu',i:'portfolio'},
    {u:'journal/#exec',n:'Jurnal',i:'journal'},
    {u:'journal/#desk',n:'Risc & capital',i:'risk'}
  ];
  const workspace=[{u:'app/tools/',n:'Instrumente',i:'tools'},{u:'health/',n:'Health',i:'status',description:'Spațiul local, sincronizarea, importul Trading 212, P&L-ul realizat și serviciile suitei.'},{u:'app/settings/',n:'Setări',i:'settings'}];
  const modules=[
    {u:'candidate-engine/',n:'Long & Reversal',i:'market',description:'Premarket Scanner · motorul original, cu regulile păstrate.'},
    {u:'europe-stocks/',n:'Acțiuni Europa',i:'market',description:'Universul și analiza acțiunilor europene.'},
    {u:'desk/',n:'Planuri',i:'plan',description:'Scenariu, intrare, stop și verificări înaintea unui plan.'},
    {u:'journal/#capital',n:'Mișcări de capital',i:'capital',description:'Fluxuri, repere și evoluția capitalului.'},
    {u:'journal/#setup',n:'Drafturi',i:'journal',description:'Scenarii în pregătire, separate de execuțiile reale.'},
    {u:'journal/#portfolio',n:'Portofoliu · risc',i:'risk',description:'Expunerea planurilor și concentrarea riscului.'},
    {u:'broker/',n:'Trading 212 Invest',i:'sync',description:'Conectarea și verificarea datelor contului Invest.'},
    {u:'shadow-book/',n:'Shadow',i:'journal',description:'Urmărire separată pentru scenarii și poziții shadow.'},
    {u:'alerts/',n:'Alerte',i:'alerts',description:'Radar și notificări în modulul activ de alerte.'},
    {u:'app/coach/',n:'Coach',i:'help',description:'Ghidul fluxului de lucru și al limitărilor.'},
    {u:'app/status/',n:'Starea datelor',i:'status',description:'Verificarea surselor, sesiunilor și datelor disponibile.'},
    {u:'app/sync/',n:'Cont & sincronizare',i:'sync',description:'Cont, backup, sincronizare și conflicte.'}
  ];
  const groups=[{name:'PRINCIPAL',items:primary},{name:'SPAȚIU DE LUCRU',items:workspace},{name:'MODULE ACTIVE',hidden:true,items:modules}];
  const all=groups.flatMap(group=>group.items.map(item=>Object.freeze({...item,group:group.name})));
  const active=new Set(all.map(x=>x.u));
  const aliases=Object.freeze({'':'today/','app/':'today/','journal/':'journal/#exec','governor/':'journal/#desk','equity/':'journal/#capital','portfolio/':'journal/#portfolio','command-center/':'today/','shell/':'today/','hub-clasic/':'today/','guide/':'app/coach/','smart-trade-long/':'desk/'});
  const retired=Object.freeze(['market-events/','earnings-hub/','macro-dashboard/','sector-rotation/','watchlist-monitor/','nasdaq-scanner/','mfx-screener/','factor-lab/','markov-lab/','weekly/','postmortem/','pump-radar/','router/','cockpit/']);
  const unavailable=new Set(retired);
  let root;
  try{
    const src=g.document?.currentScript?.src;
    root=new URL('../',src||g.TT_APP_ROOT||g.location.href);
    if(!src&&g.TT_APP_ROOT)root=new URL(g.TT_APP_ROOT,g.location.href);
  }catch(_){root=new URL('https://mferent80-source.github.io/premarket_scanner.html/');}
  function normalized(raw){
    if(typeof raw!=='string'||/[?\\\u0000-\u001f]/.test(raw)||/^[a-z][a-z\d+.-]*:/i.test(raw)||raw.startsWith('//'))return null;
    let s=raw.trim().replace(/^\.\//,'');
    if(s.startsWith('/')||s.includes('../'))return null;
    const at=s.indexOf('#'),hash=at>=0?s.slice(at):'',path=(at>=0?s.slice(0,at):s).replace(/index\.html$/,'');
    const p=path&&!path.endsWith('/')?path+'/':path;
    return p+hash;
  }
  function canonical(raw){const s=normalized(raw);if(s===null)return null;if(active.has(s))return s;if(Object.hasOwn(aliases,s))return aliases[s];return null;}
  function url(route,query=''){
    const c=canonical(route);if(!c)return null;
    const [path,hash]=c.split('#'),x=new URL(path,root);
    if(typeof query==='string'&&query)x.search=new URLSearchParams(query.replace(/^\?+/,'' )).toString();
    if(hash)x.hash=hash;
    return x.href;
  }
  function resolve(href,baseURL){
    const empty={kind:'blocked',route:null,query:'',url:null,hash:''};
    if(typeof href!=='string'||!href.trim()||/[\u0000-\u001f]/.test(href))return empty;
    let x;try{x=new URL(href,baseURL||g.location?.href||root.href);}catch(_){return empty;}
    if(!['http:','https:'].includes(x.protocol))return empty;
    if(x.origin!==root.origin)return {...empty,kind:'external',url:x.href};
    if(!x.pathname.startsWith(root.pathname))return {...empty,kind:'unknown',url:x.href};
    let path=x.pathname.slice(root.pathname.length).replace(/index\.html$/,'');if(path&&!path.endsWith('/'))path+='/';
    if(path==='app/'){
      const params=new URLSearchParams(x.search),requested=params.get('module'),route=canonical(requested===null?'today/':requested);
      if(!route)return {...empty,kind:'unavailable',url:x.href};
      params.delete('module');if(requested==='smart-trade-long/')params.set('ticket','1');
      const target=url(route,params.toString());
      return {kind:'active',route,query:params.toString(),url:target,hash:new URL(target).hash};
    }
    const candidate=path+x.hash,exact=canonical(candidate),base=canonical(path),route=exact||(path!=='journal/'?base:null),query=x.search.slice(1);
    if(unavailable.has(path))return {...empty,kind:'unavailable',query,url:x.href,hash:x.hash};
    if(!route)return {...empty,kind:'unknown',query,url:x.href,hash:x.hash};
    const params=new URLSearchParams(query);if(path==='smart-trade-long/')params.set('ticket','1');
    const out=url(route,params.toString());
    const canonicalURL=new URL(out);if(x.hash&&!exact&&path!=='journal/')canonicalURL.hash=x.hash;
    return {kind:'active',route,query:params.toString(),url:canonicalURL.href,hash:canonicalURL.hash};
  }
  function section(raw){const route=canonical(raw);if(!route)return null;
    if(primary.some(x=>x.u===route)||workspace.some(x=>x.u===route))return route;
    if(['candidate-engine/','europe-stocks/'].includes(route))return 'scanner-verdicts/';
    if(['journal/#capital','journal/#portfolio'].includes(route))return 'journal/#desk';
    if(route==='journal/#setup')return 'journal/#exec';
    if(route==='app/sync/')return 'app/settings/';
    return 'app/tools/';
  }
  groups.forEach(group=>{group.items.forEach(Object.freeze);Object.freeze(group.items);Object.freeze(group);});
  g.TTAppRoutes=Object.freeze({root:root.href,home:new URL('app/?module=today%2F',root).href,groups:Object.freeze(groups),all:Object.freeze(all),retired,aliases,canonical,resolve,url,section});
})(typeof window!=='undefined'?window:globalThis);
