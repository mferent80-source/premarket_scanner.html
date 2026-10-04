'use strict';
importScripts('../lib/holdings-neural.js?v=hmm-observations-v1','../lib/holdings-quantile.js?v=holdings-quantile-v1');
self.onmessage=function(event){const {id,bars,now}=event.data||{};try{const result=HoldingsQuantile.evaluate(HoldingsQuantile.dataset(bars,now),{progress:p=>self.postMessage({id,progress:p})});if(!HoldingsQuantile.valid(result))throw Error('Raportul cuantilelor nu poate fi verificat.');self.postMessage({id,result});}catch(e){self.postMessage({id,error:e.message||'Intervalul nu a putut fi estimat.'});}};
