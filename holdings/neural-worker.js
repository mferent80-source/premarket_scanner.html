'use strict';
importScripts('../lib/holdings-neural.js?v=boost-comparison-v1','../lib/holdings-neural-evaluation.js?v=boost-comparison-v1','../lib/holdings-boosting.js?v=holdings-gbt-v1','../lib/holdings-model-comparison.js?v=holdings-comparison-v1');
self.onmessage=function(event){
 const {id,bars,now}=event.data||{};
 try{const data=HoldingsNeural.dataset(bars,now),result=HoldingsNeuralEvaluation.evaluate(data.rows,data.latest,{progress:progress=>self.postMessage({id,progress})});result.comparison=HoldingsModelComparison.evaluate(data.rows,data.latest,result,{progress:progress=>self.postMessage({id,progress})});if(!HoldingsNeural.valid(result))throw Error('Modelul produs nu a trecut verificarea numerică.');self.postMessage({id,result});}
 catch(error){self.postMessage({id,error:error.message||'Antrenarea nu a putut fi finalizată.'});}
};
