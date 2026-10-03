/* First app opening per Bucharest day; no browser token and no scan interval. */
(function(root){
  'use strict';
  var KEY='tt_breadth_daily_open_v1';
  function day(now){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));}
  function read(storage){try{return JSON.parse(storage.getItem(KEY)||'null');}catch(_){return null;}}
  function save(storage,s){try{storage.setItem(KEY,JSON.stringify(s));}catch(_){}return s;}
  function message(s){
    if(!s||s.status==='disabled')return 'Scanarea completă la deschidere nu este activată încă. Raportul publicat se încarcă normal.';
    if(s.status==='queued'||s.status==='requesting')return 'Breadth: scanare zilnică solicitată. Aștept publicarea rezultatului; data EOD rămâne cea a surselor.';
    if(s.status==='complete')return 'Breadth: scanarea de azi este publicată'+(s.result==='PARTIAL'?' · surse parțiale.':'.');
    if(s.status==='waiting')return 'Breadth: scanare solicitată; rezultatul nu este încă publicat.';
    return 'Breadth: pornirea scanării nu a putut fi confirmată. Poți folosi Run workflow pe GitHub; raportul existent își păstrează data.';
  }
  async function requestDaily(options){
    var config=options.config,storage=options.storage,now=options.now==null?Date.now():options.now,today=day(now);
    if(!config||config.enabled!==true)return {status:'disabled',day:today};
    var url=new URL(config.endpoint);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('Endpoint Breadth invalid');
    var previous=read(storage);
    if(previous&&previous.day===today)return previous;
    // Cross-tab Web Locks are applied by start(); the server also deduplicates globally.
    save(storage,{day:today,status:'requesting'});
    var s;
    try{var r=await options.fetch(url.href,{method:'POST',mode:'cors',credentials:'omit',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});s=await r.json();
      if(s.day!==today||s.requestId!=='open-'+today||['queued','requesting','failed','unknown'].indexOf(s.status)<0)throw Error('Răspuns server invalid');
    }catch(_){s={day:today,status:'unknown',reason:'dispatch_not_verified'};}
    return save(storage,s);
  }
  var api={KEY:KEY,day:day,read:read,message:message,requestDaily:requestDaily};root.TTBreadthDaily=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(!root.document)return;
  function notify(s){root.document.dispatchEvent(new CustomEvent('tt-breadth-daily',{detail:s}));var frame=root.document.getElementById('frame');if(frame&&frame.contentWindow)frame.contentWindow.postMessage({ttBreadthDaily:s},root.location.origin);}
  async function poll(s){
    if(['queued','requesting','waiting'].indexOf(s.status)<0)return;
    var end=Date.now()+45*60000;
    async function check(){
      try{var r=await fetch('../market-breadth/generated/run-status.json?v='+Date.now(),{cache:'no-store'});if(r.ok){var result=await r.json();if(result.requestId===s.requestId&&['OK','PARTIAL','ERROR'].indexOf(result.status)>=0){s.status=result.status==='ERROR'?'failed':'complete';s.result=result.status;save(localStorage,s);notify(s);var frame=document.getElementById('frame');if(frame&&frame.contentWindow)frame.contentWindow.postMessage({ttBreadthUpdated:true},location.origin);return;}}}catch(_){}
      if(Date.now()<end)root.setTimeout(check,30000);else{s.status='waiting';save(localStorage,s);notify(s);}
    }
    check();
  }
  api.start=async function(){
    var s;
    try{var r=await fetch('breadth-daily-config.json?v='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('config');var config=await r.json();
      var action=function(){return requestDaily({config:config,storage:localStorage,fetch:fetch});};
      s=root.navigator.locks?await root.navigator.locks.request('tt-breadth-daily-open',action):await action();
    }catch(_){s={status:'unavailable',day:day(Date.now())};}
    api.state=s;notify(s);poll(s);
  };
})(typeof window!=='undefined'?window:globalThis);
