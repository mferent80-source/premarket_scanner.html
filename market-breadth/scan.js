/* Explicit GitHub authorization; token is held only in this call, never persisted. */
(function(root){
  'use strict';
  var api='https://api.github.com/repos/mferent80-source/premarket_scanner.html';
  var workflow='https://github.com/mferent80-source/premarket_scanner.html/actions/workflows/pages.yml';
  async function dispatch(token,id,fetcher){
    if(!token||!token.trim())throw Error('Autorizarea GitHub este necesară pentru pornirea scanării.');
    if(!/^[a-zA-Z0-9-]{8,80}$/.test(id))throw Error('Identificator de scanare invalid');
    var r=await (fetcher||fetch)(api+'/actions/workflows/pages.yml/dispatches',{method:'POST',headers:{'Accept':'application/vnd.github+json','Authorization':'Bearer '+token.trim(),'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify({ref:'main',inputs:{request_id:id}})});
    if(!r.ok)throw Error(r.status===401?'Autorizare invalidă (401).':r.status===403?'Acces refuzat (403). Tokenul necesită Actions: write pentru acest repository.':r.status===422?'Workflow-ul nu a acceptat cererea (422).':'GitHub nu a pornit scanarea (HTTP '+r.status+').');
    return id;
  }
  var exported={dispatch:dispatch,workflow:workflow,api:api};root.TTBreadthScan=exported;
  if(typeof module!=='undefined'&&module.exports)module.exports=exported;
  if(typeof document==='undefined')return;
  var dialog=document.getElementById('scanDialog'),button=document.getElementById('scanFull'),start=document.getElementById('startScan'),status=document.getElementById('scanStatus'),input=document.getElementById('scanToken'),pending=false;
  function say(s){status.textContent=s;}
  function cancel(){input.value='';dialog.close();}
  button.onclick=function(){dialog.showModal();};
  document.getElementById('cancelScan').onclick=cancel;
  dialog.addEventListener('cancel',function(){input.value='';});
  async function poll(id,began){
    var deadline=Date.now()+25*60000,found=null;
    while(Date.now()<deadline){
      try{
        var r=await fetch('generated/run-status.json?v='+Date.now(),{cache:'no-store'});
        var snapshot=r.ok?await r.json():null;
        if(snapshot&&snapshot.requestId===id){
          if(snapshot.status==='ERROR')throw Error('Generatorul nu a putut verifica datele. Vezi detaliile rulării.');
          say('Scanare publicată: '+snapshot.status+' · '+new Date(snapshot.finishedAt).toLocaleString('ro-RO')+'. Datele EOD se încarcă acum.');
          document.getElementById('refresh').click();
          var frame=document.querySelector('#completeBody iframe');if(frame)frame.src='generated/report.html?v='+Date.now();
          return;
        }
        var runs=await fetch(api+'/actions/workflows/pages.yml/runs?event=workflow_dispatch&per_page=20',{cache:'no-store',headers:{Accept:'application/vnd.github+json'}});
        if(runs.ok){var list=(await runs.json()).workflow_runs||[];found=list.find(function(x){return x.display_title.indexOf(id)>=0&&Date.parse(x.created_at)>=began-60000;});}
        if(found){
          if(found.status==='completed'&&found.conclusion!=='success')throw Error('Scanarea GitHub s-a încheiat cu '+found.conclusion+'. Deschide rularea pentru detalii.');
          say(found.status==='completed'?'Calcule terminate; aștept publicarea datelor…':found.status==='queued'?'Scanare în coadă pe GitHub…':'Scanare în curs: cotații, sectoare, timing și raport…');
        }else say('Cerere acceptată; aștept pornirea scanării pe GitHub…');
      }catch(e){if(/Generatorul|s-a încheiat/.test(e.message))throw e;say('Verificarea progresului este temporar indisponibilă. Scanarea poate continua pe GitHub.');}
      await new Promise(function(resolve){setTimeout(resolve,30000);});
    }
    say('Rularea depășește timpul de monitorizare. Verifică progresul pe GitHub și reîncarcă datele după publicare.');
  }
  start.onclick=async function(){
    if(pending)return;
    var token=input.value;input.value='';
    if(!token.trim()){say('Deschide GitHub → Run workflow → Run workflow. După finalizare, apasă Reîncarcă datele.');return;}
    pending=true;start.disabled=true;button.disabled=true;
    var id='scan-'+crypto.randomUUID(),began=Date.now();
    try{say('Pornesc scanarea…');await dispatch(token,id);token='';dialog.close();await poll(id,began);}
    catch(e){say(e.message);}
    finally{token='';pending=false;start.disabled=false;button.disabled=false;}
  };
})(typeof window!=='undefined'?window:globalThis);
