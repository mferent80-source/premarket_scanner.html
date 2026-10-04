'use strict';
importScripts('../lib/holdings-neural.js?v=hmm-observations-v1','../lib/holdings-isolation.js?v=holdings-isolation-v1');
self.onmessage=function(event){const {id,bars,now}=event.data||{};try{const rows=HoldingsIsolation.dataset(bars,now),result=HoldingsIsolation.evaluate(rows,{progress:p=>self.postMessage({id,progress:p})});if(!HoldingsIsolation.valid(result))throw Error('Rezultatul Isolation Forest nu poate fi verificat.');self.postMessage({id,result});}catch(error){self.postMessage({id,error:error.message||'Anomaliile nu au putut fi analizate.'});}};
