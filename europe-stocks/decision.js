// Pure, causal analysis: only completed bars and already confirmed pivots.
(function(g){
  'use strict';
  const VERSION='eu-structure-1';
  function pivots(bars,key,low){
    const found=[];
    for(let i=2;i<bars.length-2;i++){
      const v=bars[i][key],near=[bars[i-2][key],bars[i-1][key],bars[i+1][key],bars[i+2][key]];
      if(near.every(n=>low?v<=n:v>=n)&&near.some(n=>low?v<n:v>n))found.push({price:v,t:bars[i].t,index:i});
    }
    return found;
  }
  function structure(bars,atr,category){
    const price=bars.at(-1)?.c;
    if(bars.length<20||!Number.isFinite(atr)||atr<=0)return {state:'INVALID',reason:'Structură insuficientă.',version:VERSION};
    const recent=bars.slice(-61),lows=pivots(recent,'l',true),highs=pivots(bars.slice(-120),'h',false);
    const rangeHigh=Math.max(...bars.slice(-11,-1).map(b=>b.h));
    const trigger=rangeHigh+atr*.05,entryHigh=trigger+atr*.5;
    const pivot=lows.filter(p=>p.price<price&&p.price<trigger).at(-1);
    const support=pivot?.price??Math.min(...bars.slice(-10).map(b=>b.l));
    const stop=support-atr*.25;
    const resistance=highs.map(p=>p.price).filter(n=>n>entryHigh).sort((a,b)=>a-b)[0]??null;
    const target=resistance,rr=target!==null?(target-entryHigh)/(entryHigh-stop):null;
    const valid=Number.isFinite(stop)&&stop>0&&stop<trigger&&support<price;
    const state=!valid?'INVALID':price>entryHigh?'EXTENDED':price>=trigger?'CONFIRMED':'WAIT';
    return {version:VERSION,state,trigger,entryLow:trigger,entryHigh,support,stop,resistance,target,rr,
      supportKind:pivot?'pivot':'window',supportDate:pivot?.t??null,distancePct:(trigger/price-1)*100,
      reason:!valid?'Nivelurile nu definesc un plan long valid.':state==='EXTENDED'?'Prețul este peste zona de intrare; așteaptă o bază nouă.':state==='CONFIRMED'?'Închiderea a depășit maximul celor 10 sesiuni anterioare, cu tampon de 0,05 ATR.':'Așteaptă o închidere peste maximul celor 10 sesiuni anterioare, cu tampon de 0,05 ATR.',
      invalidation:'O închidere sub suport invalidează structura; stopul include un tampon de 0,25 ATR.',
      early:category==='earlyLong'||category==='earlyReversal'};
  }
  function breadth(rows,total){
    const dates=new Map();for(const r of rows)dates.set(r.sourceDate,(dates.get(r.sourceDate)||0)+1);
    const asOf=[...dates].sort((a,b)=>b[1]-a[1]||b[0].localeCompare(a[0]))[0]?.[0]||null;
    const coherent=rows.filter(r=>r.sourceDate===asOf);
    function group(items){
      const n=items.length;
      return {count:n,above50:n?items.filter(r=>r.price>r.ema50).length/n*100:null,
        above21:n?items.filter(r=>r.price>r.ema21).length/n*100:null,
        advancing:n?items.filter(r=>r.dayChg>0).length/n*100:null,
        ret20:n?items.reduce((s,r)=>s+r.ret20,0)/n:null};
    }
    function groups(key){
      const buckets=new Map();for(const r of coherent){const k=r[key]||'Necunoscut';if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(r);}
      return [...buckets].map(([name,items])=>({name,...group(items)})).sort((a,b)=>(b.above50-a.above50)||(b.ret20-a.ret20)||a.name.localeCompare(b.name));
    }
    const summary=group(coherent),coverage=total?coherent.length/total*100:0;
    const regime=!coherent.length?'UNAVAILABLE':coverage<80?'PARTIAL':summary.above50>=60&&summary.advancing>=50?'FAVORABLE':summary.above50<40?'DEFENSIVE':'MIXED';
    return {asOf,total,verified:rows.length,excludedDates:rows.length-coherent.length,coverage,regime,...summary,markets:groups('market'),sectors:groups('sector')};
  }
  function calculateRisk(input,plan,rate){
    const num=v=>typeof v==='number'||typeof v==='string'&&v.trim()!==''?Number(v):NaN;
    const budget=num(input.budget),limit=num(input.loss),entry=num(input.entry),fees=num(input.fees),step=input.fractional===true?.001:1;
    const stop=plan?.stop,fx=rate?.rate;
    if(![budget,limit,entry,fees,stop,fx].every(Number.isFinite)||budget<=0||limit<=0||limit>budget||fees<0||fees>=limit||fees>=budget||stop<=0||entry<=stop||fx<=0)return {ok:false,reason:'Completează bugetul, riscul și costurile; intrarea trebuie să fie peste stop. Riscul nu poate depăși bugetul.'};
    const unitNotional=entry*fx,unitRisk=(entry-stop)*fx;
    const available=Math.min((budget-fees)/unitNotional,(limit-fees)/unitRisk);
    if(!Number.isFinite(available)||available<=0||available>1e12)return {ok:false,reason:'Cantitatea calculată nu poate fi reprezentată în siguranță.'};
    let quantity=Math.floor(available/step)*step;
    quantity=Number(quantity.toFixed(3));
    // Round down and recheck; floating point must never increase the risk limit.
    while(quantity>0&&(quantity*unitNotional+fees>budget+1e-8||quantity*unitRisk+fees>limit+1e-8))quantity=Number((quantity-step).toFixed(3));
    if(quantity<=0)return {ok:false,reason:'Bugetul sau riscul nu permite cantitatea minimă selectată.'};
    const notional=quantity*unitNotional,risk=quantity*unitRisk+fees;
    const reward=Number.isFinite(plan.target)&&plan.target>entry?quantity*(plan.target-entry)*fx-fees:null;
    return {ok:true,quantity,notional,total:notional+fees,risk,reward,rr:reward!==null?reward/risk:null,
      budget,loss:limit,fees,entry,stop,rate:fx,step,currency:input.currency};
  }
  g.EuropeDecision={VERSION,pivots,structure,breadth,calculateRisk};
})(typeof window!=='undefined'?window:globalThis);
