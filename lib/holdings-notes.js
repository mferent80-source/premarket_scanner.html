(function(g){'use strict';
const KEY='tt_holdings_theses_v1',object=x=>x&&typeof x==='object'&&!Array.isArray(x),validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
/* 19.10.2026 (I-713, punctul 6): istoricul creștea fără limită pe cheia sincronizată. Rămân ultimele MAX versiuni întregi; din cele mai
   vechi doar reperul (stop / țintă și monedele lor) la fiecare schimbare — StopSetter.istoric / stopLa și traseul deciziei citesc același lucru. */
const MAX=50,stare=h=>[Number(h?.stop)>0?Number(h.stop):null,h?.stopCurrency||null,Number(h?.targetPrice)>0?Number(h.targetPrice):null,h?.targetCurrency||null].join('|');
function compact(history){if(history.length<=MAX)return history;const old=history.slice(0,-MAX),out=[];let prev=null;for(const h of old){const s=stare(h);if(s!==prev)out.push({at:h.at,stop:h.stop,stopCurrency:h.stopCurrency,targetPrice:h.targetPrice,targetCurrency:h.targetCurrency,compact:true});prev=s;}return [...out,...history.slice(-MAX)];}
function change(old,patch,at=new Date().toISOString()){
 if(!object(old)||!object(patch)||(old.history!=null&&!Array.isArray(old.history)))throw Error('Istoricul tezei este incompatibil; datele sunt păstrate.');
 if(patch.stop!=null&&patch.stop!==''&&(!['number','string'].includes(typeof patch.stop)||!Number.isFinite(Number(patch.stop))||Number(patch.stop)<=0))throw Error('Stopul de reevaluare trebuie pozitiv sau gol.');
 if(patch.targetPrice!=null&&patch.targetPrice!==''){
  if(!['number','string'].includes(typeof patch.targetPrice)||!Number.isFinite(Number(patch.targetPrice))||Number(patch.targetPrice)<=0)throw Error('Ținta de reevaluare trebuie pozitivă sau goală.');
  if(typeof patch.targetCurrency!=='string'||!(/^[A-Z]{3}$/.test(patch.targetCurrency)||patch.targetCurrency==='GBp'))throw Error('Confirmă moneda instrumentului înainte de salvarea țintei.');
 }
 if(patch.stopAlertPct!=null&&patch.stopAlertPct!==''&&(!['number','string'].includes(typeof patch.stopAlertPct)||!Number.isFinite(Number(patch.stopAlertPct))||Number(patch.stopAlertPct)<.5||Number(patch.stopAlertPct)>20))throw Error('Zona de alertă trebuie între 0,5% și 20% peste stop.');
 if(patch.earnings&&!validDate(patch.earnings))throw Error('Data earnings este invalidă.');
 if(patch.plan){for(const k of ['hold','reduce','invalidate'])if(typeof patch.plan[k]!=='string'||patch.plan[k].length>2000)throw Error('Textul planului trebuie să aibă maximum 2000 de caractere.');if(patch.plan.review&&!validDate(patch.plan.review))throw Error('Data revizuirii este invalidă.');}
 const updated={...old,...patch,initialText:old.initialText||old.text||patch.text||'',updatedAt:at};
 updated.history=compact([...(old.history||[]),{at,text:updated.text||'',stop:updated.stop,stopCurrency:updated.stopCurrency,targetPrice:updated.targetPrice,targetCurrency:updated.targetCurrency,criteria:updated.criteria,fundamental:updated.fundamental,calendar:updated.calendar,plan:updated.plan}]);return updated;
}
function save(storage,id,patch,expected){
 const raw=storage.getItem(KEY),all=JSON.parse(raw??'{}');
 if(!object(all)||['__proto__','constructor','prototype'].includes(id))throw Error('Registrul tezelor este ilizibil; exportă datele înainte de reparare.');
 const old=all[id]||{};if(expected!==undefined&&JSON.stringify(old)!==JSON.stringify(expected))throw Error('Teza a fost modificată în altă pagină. Reîncarcă înainte de salvare.');
 const next={...all,[id]:change(old,patch)};
 if(storage.getItem(KEY)!==raw)throw Error('Registrul s-a modificat. Reîncearcă.');
 storage.setItem(KEY,JSON.stringify(next));return next;
}
g.HoldingsNotes={KEY,MAX,change,save,compact};
})(typeof window!=='undefined'?window:globalThis);
