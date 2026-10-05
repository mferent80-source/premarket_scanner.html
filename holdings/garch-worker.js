'use strict';
importScripts('../lib/holdings-garch.js?v=holdings-garch-v1');
self.onmessage=function(event){
 const {id,bars,now}=event.data||{};
 try{const result=HoldingsGarch.evaluate(HoldingsGarch.dataset(bars,now),{now,progress:p=>self.postMessage({id,progress:p})});if(!HoldingsGarch.valid(result,now))throw Error('Raportul GARCH nu trece verificarea numerică.');self.postMessage({id,result});}
 catch(e){self.postMessage({id,error:e.message||'Volatilitatea nu a putut fi estimată.'});}
};
