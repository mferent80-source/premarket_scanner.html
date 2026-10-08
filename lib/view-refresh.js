(function(g){'use strict';
// A burst of storage/progress events updates the view once. Editing and hidden
// pages keep their DOM until focus leaves or the page becomes visible again.
function create({render,blocked=()=>false,delay=250,setTimer=setTimeout,clearTimer=clearTimeout}){
 let pending=false,timer=null;
 function flush(){if(timer!==null){clearTimer(timer);timer=null;}if(!pending||blocked())return false;pending=false;render();return true;}
 function request(){pending=true;if(timer===null)timer=setTimer(()=>{timer=null;flush();},delay);}
 return {request,flush,pending:()=>pending,cancel(){if(timer!==null)clearTimer(timer);timer=null;pending=false;}};
}
function patchList(host,items,key,markup){
 const existing=new Map([...host.children].filter(x=>x.dataset.viewKey).map(x=>[x.dataset.viewKey,x]));
 const wanted=[];
 for(const item of items){const id=String(key(item)),html=markup(item);let node=existing.get(id);
  if(!node||node._viewMarkup!==html){
   const opened=new Map(node?[...node.querySelectorAll('details')].map((d,i)=>[(d.querySelector(':scope > summary')?.textContent||'')+'|'+i,d.open]):[]);
   const template=document.createElement('template');template.innerHTML=html;const next=template.content.firstElementChild;
   if(!next)continue;next.dataset.viewKey=id;next._viewMarkup=html;
   next.querySelectorAll('details').forEach((d,i)=>{const k=(d.querySelector(':scope > summary')?.textContent||'')+'|'+i;if(opened.has(k))d.open=opened.get(k);});
   if(node)node.replaceWith(next);node=next;
  }wanted.push(node);
 }
 const keep=new Set(wanted);for(const node of [...host.children])if(!keep.has(node))node.remove();
 wanted.forEach((node,i)=>{if(host.children[i]!==node)host.insertBefore(node,host.children[i]||null);});
}
g.ViewRefresh={create,patchList};
})(typeof window!=='undefined'?window:globalThis);
