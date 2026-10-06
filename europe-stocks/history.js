// Prospective EOD observations, isolated from the real trade journal.
(function(g){
  'use strict';
  const KEY='tt_europe_signals_v1',SCHEMA=1,LIMIT=1500;
  const day=(t,zone)=>g.DailySeries.date(t,zone);
  const category=c=>['growth','earlyLong','reversal','earlyReversal'].includes(c);
  const family=c=>c==='growth'||c==='earlyLong'?'momentum':'reversal';
  const early=c=>c==='earlyLong'||c==='earlyReversal';
  function empty(){return {schema:SCHEMA,entries:[]};}
  function read(storage,universe){
    try{
      const raw=storage.getItem(KEY);if(!raw)return {document:empty(),error:null};
      const doc=JSON.parse(raw);
      if(doc?.schema!==SCHEMA||!Array.isArray(doc.entries)||doc.entries.length>LIMIT)throw Error('Format de istoric incompatibil.');
      const ids=new Set();
      for(const e of doc.entries){
        const i=universe.describe(e.symbol);
        if(!i||i.isin!==e.isin||!category(e.category)||!category(e.currentCategory)||!/^\d{4}-\d{2}-\d{2}$/.test(e.firstDate)||!/^\d{4}-\d{2}-\d{2}$/.test(e.lastDate)||e.lastDate<e.firstDate||!Number.isFinite(e.firstPrice)||e.firstPrice<=0||!Number.isFinite(e.firstStop)||e.firstStop<=0||!Number.isFinite(e.support)||e.support<=0||!Number.isFinite(e.createdAt)||typeof e.active!=='boolean'||typeof e.id!=='string'||ids.has(e.id)||!Array.isArray(e.transitions)||typeof e.outcomes!=='object'||!e.outcomes)throw Error('Identitate sau date invalide în istoricul semnalelor.');
        for(const n of [5,10,20]){const o=e.outcomes[n];if(o&&(!Number.isFinite(o.pct)||!/^\d{4}-\d{2}-\d{2}$/.test(o.date)||o.date<=e.firstDate))throw Error('Randament istoric invalid.');}
        if(e.transitions.some(t=>!category(t.category)||!/^\d{4}-\d{2}-\d{2}$/.test(t.date)||t.date<e.firstDate))throw Error('Tranziție invalidă.');
        ids.add(e.id);
      }
      return {document:doc,error:null};
    }catch(error){return {document:empty(),error:'Istoricul existent nu poate fi citit și nu va fi suprascris: '+error.message};}
  }
  function update(document,observations,now=Date.now()){
    const next=JSON.parse(JSON.stringify(document)),changes=new Map();
    for(const observation of observations){
      const {instrument,series,candidate}=observation;
      const bars=series.bars.map(b=>({...b,date:day(b.t,series.timezone)}));
      const currentDate=series.asOf;
      for(const e of next.entries.filter(x=>x.isin===instrument.isin)){
        if(currentDate<e.lastDate)continue; // never rewind an observation on a stale scan
        const at=bars.findIndex(b=>b.date===e.firstDate);
        if(at>=0){
          const first=bars[at];
          // A changed historical close (split/adjustment/revision) needs review.
          if(Math.abs(first.c/e.firstPrice-1)>.01){e.review='Prețul istoric a fost revizuit; randamentele sunt suspendate.';e.outcomes={};}
          if(!e.review){
            const forward=bars.slice(at+1);
            for(const n of [5,10,20])if(forward.length>=n&&!e.outcomes[n])e.outcomes[n]={pct:(forward[n-1].c/e.firstPrice-1)*100,date:forward[n-1].date};
            if(e.active){const broken=forward.find(b=>b.date>e.lastDate&&b.c<=e.support);if(broken){e.active=false;e.status='INVALIDATED';e.endDate=broken.date;e.lastDate=broken.date;changes.set(e.isin,'Invalidat');}}
          }
        }
        if(e.active&&currentDate>=e.lastDate){
          if(!candidate||family(candidate.category)!==family(e.currentCategory)){e.active=false;e.status='LEFT';e.endDate=currentDate;e.lastDate=currentDate;changes.set(e.isin,'Ieșit din criterii');}
          else if(candidate.category!==e.currentCategory){
            const confirmation=early(e.currentCategory)&&!early(candidate.category);
            e.currentCategory=candidate.category;e.transitions.push({category:candidate.category,date:currentDate});
            if(confirmation){e.confirmedAt=currentDate;changes.set(e.isin,'Early → confirmat');}
          }
          if(e.active){e.lastDate=currentDate;e.lastPrice=series.bars.at(-1).c;}
        }
      }
      if(candidate&&candidate.plan?.stop>0&&candidate.plan?.support>0){
        const existing=next.entries.find(e=>e.isin===instrument.isin&&e.active&&family(e.currentCategory)===family(candidate.category));
        const already=next.entries.some(e=>e.isin===instrument.isin&&e.lastDate>=currentDate&&e.endDate===currentDate);
        if(!existing&&!already){
          const id=instrument.isin+':'+currentDate+':'+candidate.category;
          if(!next.entries.some(e=>e.id===id)){
            next.entries.push({id,symbol:instrument.symbol,isin:instrument.isin,name:instrument.name,market:instrument.market,sector:instrument.sector,currency:series.currency,category:candidate.category,currentCategory:candidate.category,
              firstDate:currentDate,lastDate:currentDate,firstPrice:candidate.price,lastPrice:candidate.price,firstStop:candidate.plan.stop,support:candidate.plan.support,
              createdAt:now,policy:candidate.plan.version,active:true,status:'ACTIVE',transitions:[{date:currentDate,category:candidate.category}],outcomes:{}});
            changes.set(instrument.isin,'Nou în această sesiune');
          }
        }
      }
    }
    // Keep active episodes; evict oldest closed observations first when bounded.
    next.entries.sort((a,b)=>b.firstDate.localeCompare(a.firstDate)||b.createdAt-a.createdAt);
    if(next.entries.length>LIMIT){const active=next.entries.filter(e=>e.active),closed=next.entries.filter(e=>!e.active);next.entries=[...active,...closed.slice(0,Math.max(0,LIMIT-active.length))].slice(0,LIMIT);}
    return {document:next,changes};
  }
  function save(storage,document){try{storage.setItem(KEY,JSON.stringify(document));return null;}catch(_){return 'Istoricul nu a putut fi salvat local; observațiile curente rămân în această sesiune.';}}
  async function record(storage,universe,observations,now=Date.now(),locks=null,pending=null){
    function write(){
      // Read under the shared lock, after the scan finishes. A second tab may
      // have recorded another market while this tab was fetching its bars.
      const latest=read(storage,universe);
      if(latest.error)return {document:pending||latest.document,error:latest.error};
      const ids=new Set(latest.document.entries.map(e=>e.id));
      if(pending)latest.document.entries.push(...pending.entries.filter(e=>!ids.has(e.id)));
      const result=update(latest.document,observations,now);
      return {...result,error:save(storage,result.document)};
    }
    return locks?.request?locks.request(KEY,write):write();
  }
  function badge(document,candidate){
    const e=document.entries.find(e=>e.isin===candidate.isin&&e.active);
    if(!e)return null;
    if(e.confirmedAt===candidate.sourceDate)return 'Early → confirmat';
    if(e.firstDate===candidate.sourceDate)return 'Nou în această sesiune';
    return 'Urmărit din '+e.firstDate;
  }
  function stats(entries){
    return ['growth','earlyLong','reversal','earlyReversal'].map(category=>{
      const matching=entries.filter(e=>e.category===category&&!e.review);
      const outcomes={};for(const n of [5,10,20]){const rows=matching.filter(e=>e.outcomes[n]);outcomes[n]={n:rows.length,mean:rows.length?rows.reduce((s,e)=>s+e.outcomes[n].pct,0)/rows.length:null};}
      return {category,count:matching.length,outcomes};
    });
  }
  g.EuropeHistory={KEY,SCHEMA,LIMIT,empty,read,update,save,record,badge,stats};
})(typeof window!=='undefined'?window:globalThis);
