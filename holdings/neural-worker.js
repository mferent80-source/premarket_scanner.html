'use strict';
importScripts('../lib/holdings-neural.js?v=holdings-mlp-v3','../lib/holdings-neural-evaluation.js?v=walk-forward-v1');
self.onmessage=function(event){
 const {id,bars,now}=event.data||{};
 try{const data=HoldingsNeural.dataset(bars,now),result=HoldingsNeuralEvaluation.evaluate(data.rows,data.latest,{progress:progress=>self.postMessage({id,progress})});if(!HoldingsNeural.valid(result))throw Error('Modelul produs nu a trecut verificarea numerică.');self.postMessage({id,result});}
 catch(error){self.postMessage({id,error:error.message||'Antrenarea nu a putut fi finalizată.'});}
};
