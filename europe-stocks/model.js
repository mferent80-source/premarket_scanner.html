// Daily European screening. Scores rank technical evidence; they are not probabilities.
(function (g) {
  'use strict';
  const categories = {
    growth: {name:'În creștere',mode:'momentum',description:'Trend aliniat EMA21 / EMA50, randament pozitiv și forță relativă față de indicele bursei.'},
    earlyLong: {name:'Early Long',mode:'momentum',description:'Pullback în stabilizare, aproape de EMA21, cu RSI în urcare; trendul complet încă nu este confirmat.'},
    reversal: {name:'Reversal',mode:'reversal',description:'Scădere de cel puțin 20% față de maximul disponibil și structură de revenire confirmată.'},
    earlyReversal: {name:'Early Reversal',mode:'reversal',description:'Scădere de cel puțin 20%, stabilizare timpurie și mișcare încă aproape de bază.'}
  };
  // Native-currency screening policy, not exchange rates or a currency conversion.
  const liquidity = {EUR:3000000,GBP:2500000,CHF:3000000,DKK:22000000,SEK:30000000};
  function mean(a) { return a.reduce((s,n)=>s+n,0)/a.length; }
  function pct(a,b) { return a>0 ? (b/a-1)*100 : null; }
  function ret(c,n) { return c.length>n ? pct(c[c.length-1-n],c[c.length-1]) : null; }
  function last(a) { return Array.isArray(a)?a[a.length-1]:a; }
  function clamp(n) { return Math.round(Math.min(100,Math.max(0,n))); }
  function normalize(source,instrument) {
    if (!source || !Array.isArray(source.bars) || source.bars.length<80) throw Error('Istoric insuficient: minimum 80 sesiuni încheiate.');
    const scale=source.currency==='GBX'?0.01:1;
    const currency=source.currency==='GBX'?'GBP':source.currency;
    if (currency!==instrument.currency) throw Error('Moneda sursei nu corespunde listării europene.');
    const bars=source.bars.map(b=>({...b,o:b.o*scale,h:b.h*scale,l:b.l*scale,c:b.c*scale}));
    if (bars.some(b=>![b.o,b.h,b.l,b.c,b.v].every(Number.isFinite)||b.c<=0||b.v<0)) throw Error('Prețuri sau volume invalide.');
    return {...source,bars,currency,normalizedPence:scale!==1};
  }
  function analyze(instrument,source) {
    source=normalize(source,instrument);
    const bars=source.bars,c=bars.map(b=>b.c),h=bars.map(b=>b.h),l=bars.map(b=>b.l),v=bars.map(b=>b.v);
    const price=last(c),ema21=last(g.TI.calcEMA(c,21)),ema50=last(g.TI.calcEMA(c,50));
    const rsi=last(g.TI.calcRSI(c,14)),atr=last(g.TI.calcATR(h,l,c,14));
    if (![price,ema21,ema50,rsi,atr].every(Number.isFinite)||atr<=0) throw Error('Indicatori incompleți.');
    const avgVolume=mean(v.slice(-21,-1)),turnover=mean(bars.slice(-20).map(b=>b.c*b.v));
    const rvol=avgVolume>0?last(v)/avgVolume:0;
    const ret5=ret(c,5),ret20=ret(c,20),dayChg=ret(c,1),ext=pct(ema21,price);
    const drawdown=pct(Math.max(...h.slice(-252)),price),bounce=pct(Math.min(...l.slice(-60)),price);
    const eb=g.MEB.computeEarlyBird({closes:c,highs:h,lows:l,vols:v},4,null);
    const volumeOk=avgVolume>0&&last(v)>0&&turnover>=liquidity[source.currency];
    return {instrument,source,bars,price,ema21,ema50,rsi,atr,rvol,ret5,ret20,dayChg,ext,drawdown,bounce,turnover,eb,volumeOk,
      summary:{symbol:instrument.symbol,isin:instrument.isin,market:instrument.market,sector:instrument.sector,sourceDate:source.asOf,price,ema21,ema50,dayChg,ret20}};
  }
  function candidate(analysis,benchmark,governor,now=Date.now()) {
    const {instrument,source,bars,price,ema21,ema50,rsi,atr,rvol,ret5,ret20,dayChg,ext,drawdown,bounce,turnover,eb,volumeOk}=analysis;
    const aligned=benchmark?.symbol===instrument.benchmark && benchmark.asOf===source.asOf && Number.isFinite(benchmark.ret20);
    const rs=aligned?ret20-benchmark.ret20:null;
    const grown=price>ema21&&ema21>ema50&&ret20>0&&rsi>=50&&rsi<=72&&ext<=6&&rs!==null&&rs>=0;
    const healthy=eb && !eb.isWilting && !eb.isRanBlocked && !eb.expired;
    const early=healthy&&eb.isEarly&&Math.abs(dayChg)<=3;
    const confirmed=healthy&&eb.isConfirmed&&ext<=4;
    const deep=drawdown<=-20;
    const bit=(label,max,met)=>({label,max,points:met?max:0});
    const growthParts=[bit('Preț peste EMA21',15,price>ema21),bit('EMA21 peste EMA50',15,ema21>ema50),bit('Randament 5 sesiuni pozitiv',10,ret5>0),bit('Randament 20 sesiuni pozitiv',10,ret20>0),bit('Forță relativă pozitivă',12,rs!==null&&rs>=0),bit('Volum peste medie',10,rvol>=1.1),bit('RSI între 50 și 68',10,rsi>=50&&rsi<=68),bit('Extensie între −1% și 4%',10,ext>=-1&&ext<=4),bit('Lichiditate verificată',8,volumeOk)];
    const reversalParts=[bit('Scădere de minimum 20%',18,deep),bit('Scădere de minimum 35%',6,drawdown<=-35),{label:'Structură Early / confirmată',max:24,points:early?24:confirmed?20:0},bit('Minim în urcare',12,eb?.signals?.higherLow),bit('Stabilizare',10,eb?.signals?.stabilized),bit('RSI în urcare',10,eb?.signals?.rsiRising),bit('Activare volum',8,eb?.signals?.volWake),bit('Aproape de EMA21',7,eb?.signals?.nearEma),bit('Lichiditate verificată',10,volumeOk)];
    const total=parts=>clamp(parts.reduce((s,p)=>s+p.points,0)-5);
    const growthScore=total(growthParts),reversalScore=total(reversalParts);
    let category=null;
    if (deep&&early&&bounce>=1&&bounce<=15&&reversalScore>=45) category='earlyReversal';
    else if (deep&&confirmed&&bounce>=2&&bounce<=30&&reversalScore>=45) category='reversal';
    else if (!deep&&early&&ema21>=ema50*.97&&ret20>-10) category='earlyLong';
    else if (grown&&growthScore>=55) category='growth';
    if (!category||!volumeOk||Math.abs(dayChg)>=10) return null;
    const guardOk=!!governor&&['TRADE','CAUTION'].includes(governor.verdict);
    const earlyCategory=category==='earlyLong'||category==='earlyReversal';
    const reasons=[];
    if (!aligned) reasons.push('Indicele nu are o sesiune comparabilă; RS neverificat.');
    if (!guardOk) reasons.push('Governor '+(governor?.verdict||'indisponibil')+'; planul rămâne blocat.');
    if (earlyCategory) reasons.push('Semnal early de monitorizare; așteaptă confirmarea structurii.');
    const plan=g.EuropeDecision.structure(bars,atr,category);
    if(plan.state==='EXTENDED')reasons.push('Preț extins față de pragul structural; zona de intrare a fost depășită.');
    if(plan.rr!==null&&plan.rr<2)reasons.push('Rezistența următoare oferă mai puțin de 2R față de limita zonei de intrare.');
    if(plan.target===null)reasons.push('Nu există o rezistență confirmată deasupra zonei de intrare în istoricul analizat.');
    const state=!guardOk?'BLOCKED':!aligned?'WATCH':earlyCategory?'EARLY':'ARMED';
    return {
      symbol:instrument.symbol,name:instrument.name,sector:instrument.sector,market:instrument.market,
      exchange:instrument.exchange,country:instrument.country,
      isin:instrument.isin,jurisdiction:instrument.jurisdiction,sourcePage:instrument.page,
      region:'EU',currency:source.currency,normalizedPence:source.normalizedPence,
      category,mode:categories[category].mode,state,actionable:false,
      score:categories[category].mode==='momentum'?growthScore:reversalScore,
      scoreParts:categories[category].mode==='momentum'?growthParts:reversalParts,scoreAdjustment:-5,
      price,ema21,ema50,rsi,atr,rvol,rs,ret5,ret20,dayChg,drawdown,bounce,ext,turnover,
      minTurnover:liquidity[source.currency],benchmark:instrument.benchmark,index:instrument.index,
      plan,entryLow:plan.entryLow,entryHigh:plan.entryHigh,stop:plan.stop,target:plan.target,
      sourceDate:source.asOf,sourceTimezone:source.timezone,sourceCloseMinutes:source.closeMinutes,ts:now,
      spark:bars.map(b=>b.c).slice(-45),chart:bars.slice(-90).map((b,i,a)=>({t:b.t,c:b.c,ema21:last(g.TI.calcEMA(bars.slice(0,bars.length-a.length+i+1).map(v=>v.c),21)),ema50:last(g.TI.calcEMA(bars.slice(0,bars.length-a.length+i+1).map(v=>v.c),50))})),signals:eb?.signals||{},governor:governor||null,
      reason:(earlyCategory?g.MEB.ebSignalText(eb):categories[category].description),checks:reasons,
      // The existing plan budget is USD-only. Do not pass native European prices into it.
      planNote:'Plan condițional pe sesiuni încheiate, în '+source.currency+'. Calculatorul Europa folosește cursuri de referință BCE; planul USD din Decision Desk rămâne separat.'
    };
  }
  function build(instrument,source,benchmark,governor,now=Date.now()) {return candidate(analyze(instrument,source),benchmark,governor,now);}
  function rank(items,category,sort='score') {
    const counts={};
    const order=sort==='rs'?(a,b)=>(b.rs??-Infinity)-(a.rs??-Infinity):sort==='volume'?(a,b)=>b.rvol-a.rvol:sort==='trigger'?(a,b)=>Math.abs(a.plan?.distancePct??Infinity)-Math.abs(b.plan?.distancePct??Infinity):(a,b)=>b.score-a.score;
    return items.filter(x=>x.category===category).sort((a,b)=>order(a,b)||b.score-a.score||a.symbol.localeCompare(b.symbol))
      .filter(x=>{const sector=x.sector||'Necunoscut';if((counts[sector]||0)>=3)return false;counts[sector]=(counts[sector]||0)+1;return true;}).slice(0,10);
  }
  g.EuropeModel={categories,liquidity,normalize,analyze,candidate,build,rank};
})(typeof window!=='undefined'?window:globalThis);
