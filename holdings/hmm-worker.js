'use strict';
importScripts('../lib/holdings-neural.js?v=hmm-observations-v1','../lib/holdings-hmm.js?v=holdings-hmm-v1');
self.onmessage=function(event){const {id,bars,now}=event.data||{};try{const rows=HoldingsHMM.dataset(bars,now),result=HoldingsHMM.evaluate(rows,{progress:progress=>self.postMessage({id,progress})});if(!HoldingsHMM.valid(result))throw Error('Rezultatul HMM nu poate fi verificat.');self.postMessage({id,result});}catch(error){self.postMessage({id,error:error.message||'Regimul HMM nu a putut fi analizat.'});}};
