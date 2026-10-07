(function(g){'use strict';const reports=new Map();function key(x){return [x.symbol,x.currency,x.asOf,x.kind,x.historyKey].join('|');}
g.TTDecisionBridge={save(model){if(!model||!g.TTDecisionVerdict?.compatibleModel(model,{...model},Date.now()))return false;reports.set(key(model),structuredClone(model));g.dispatchEvent(new CustomEvent('tt-decision-ai-updated'));return true;},find(source){const model=source&&reports.get(key(source));return g.TTDecisionVerdict?.compatibleModel(model,source,Date.now())?structuredClone(model):null;},clear(){reports.clear();}};
})(window);
