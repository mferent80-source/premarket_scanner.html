(function(g){
'use strict';
const finite=Number.isFinite;
function brief(m,previous){
 if(!previous||previous.asOf>=m.asOf)return {baseline:false,changes:[],alerts:[],message:'Prima analiză verificată. Comparația devine disponibilă după o sesiune nouă.'};
 const changes=[];for(const [k,label] of [['short','Trend scurt'],['medium','Trend mediu'],['long','Trend lung']])if(previous[k]&&previous[k]!==m[k])changes.push(label+': '+previous[k]+' → '+m[k]);
 const delta=finite(previous.price)&&previous.price>0?(m.price/previous.price-1)*100:null;
 const alerts=[];if(previous.medium==='Ascendent'&&m.medium!=='Ascendent')alerts.push('Structura ascendentă medie s-a pierdut. Reevaluează teza.');
 if(finite(previous.support)&&m.price<previous.support)alerts.push('Închidere sub suportul analizei precedente.');
 if(finite(previous.resistance)&&m.price>previous.resistance)alerts.push('Închidere peste rezistența precedentă; verifică volumul înainte de concluzie.');
 if(finite(m.rvol)&&m.rvol>=1.5)alerts.push('Volum neobișnuit: cel puțin 1,5× media de 20 sesiuni.');
 if(finite(m.rs20)&&finite(previous.rs20)&&previous.rs20>=0&&m.rs20<0)alerts.push('Forța relativă a trecut sub benchmark.');
 return {baseline:true,from:previous.asOf,to:m.asOf,delta,changes,alerts,message:changes.length?'Structura tehnică s-a schimbat.':'Trendurile au rămas în aceeași categorie.'};
}
function quality(m){const checks=[['Sesiune EOD verificată',!!m?.asOf],['EMA21 și EMA50',finite(m?.ema21)&&finite(m?.ema50)],['Istoric EMA200',finite(m?.ema200)],['RSI și ATR',finite(m?.rsi)&&finite(m?.atr)&&m.atr>0],['Volum verificat',finite(m?.rvol)],['Benchmark aliniat',finite(m?.rs20)]];return {checks,score:Math.round(checks.filter(x=>x[1]).length/checks.length*100)};}
function structure(m){const checks=[['Preț peste EMA21',m.price>m.ema21],['Preț peste EMA50',m.price>m.ema50],['EMA21 peste EMA50',m.ema21>m.ema50],['Preț peste EMA200',finite(m.ema200)?m.price>m.ema200:null],['RS20 pozitiv',finite(m.rs20)?m.rs20>0:null],['Volum ≥ 1×',finite(m.rvol)?m.rvol>=1:null]];const known=checks.filter(x=>x[1]!==null);return {checks,score:known.length?Math.round(known.filter(x=>x[1]).length/known.length*100):null,coverage:known.length+'/'+checks.length};}
function correlation(a,b){const right=new Map((b?.bars||[]).map(x=>[x.t,x.c])),pairs=(a?.bars||[]).filter(x=>right.has(x.t)).map(x=>[x.c,right.get(x.t)]),x=[],y=[];for(let i=1;i<pairs.length;i++){if(pairs[i-1].every(v=>v>0)&&pairs[i].every(v=>v>0)){x.push(pairs[i][0]/pairs[i-1][0]-1);y.push(pairs[i][1]/pairs[i-1][1]-1);}}if(x.length<20)return null;const mean=v=>v.reduce((s,n)=>s+n,0)/v.length,mx=mean(x),my=mean(y),vx=x.reduce((s,n)=>s+(n-mx)**2,0),vy=y.reduce((s,n)=>s+(n-my)**2,0);return vx&&vy?{value:x.reduce((s,n,i)=>s+(n-mx)*(y[i]-my),0)/Math.sqrt(vx*vy),sessions:x.length}:null;}
function risk(positions,total,currency,models,notes,now=Date.now()){
 const rows=positions.map(p=>{const n=notes[p.ticker]||{},weight=finite(p.value)&&p.currency===currency&&total>0?p.value/total*100:null,stop=Number(n.stop),price=p.currentPrice,valid=finite(p.quantity)&&p.quantity>0&&finite(stop)&&stop>0&&finite(price)&&stop<price&&p.instrumentCurrency===currency;return {ticker:p.ticker,weight,sector:n.sector||'Neclasificat',instrumentCurrency:p.instrumentCurrency||'Neverificată',stopRisk:valid?(price-stop)*p.quantity:null,earnings:n.earnings&&/^\d{4}-\d{2}-\d{2}$/.test(n.earnings)?n.earnings:null};});
 const sectors={},currencies={};for(const r of rows)if(r.weight!==null){sectors[r.sector]=(sectors[r.sector]||0)+r.weight;currencies[r.instrumentCurrency]=(currencies[r.instrumentCurrency]||0)+r.weight;}
 const correlated=[];for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){const a=models[rows[i].ticker],b=models[rows[j].ticker];if(!a||!b||a.asOf!==b.asOf)continue;const c=correlation(a,b);if(c&&c.value>=.7)correlated.push({a:rows[i].ticker,b:rows[j].ticker,...c});}
 const earnings=rows.filter(r=>r.earnings).map(r=>({...r,days:Math.floor((Date.parse(r.earnings+'T00:00:00Z')-Date.parse(new Date(now).toISOString().slice(0,10)+'T00:00:00Z'))/86400000)})).filter(r=>r.days>=0&&r.days<=7);
 return {rows,sectors,currencies,correlated,earnings,knownStopRisk:rows.reduce((s,r)=>s+(r.stopRisk||0),0),stopCoverage:rows.filter(r=>r.stopRisk!==null).length,weightCoverage:rows.filter(r=>r.weight!==null).length};
}
g.HoldingsIntelligence={brief,quality,structure,correlation,risk};
})(typeof window!=='undefined'?window:globalThis);
