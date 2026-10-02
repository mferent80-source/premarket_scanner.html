/* Shared, dated EOD contract. Uptrend participation is not % above SMA50. */
(function (root) {
  'use strict';
  function nyDate(now) { return new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now)); }
  function age(iso, now) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return 999;
    var today=nyDate(now), d=new Date(iso+'T00:00:00Z'), end=new Date(today+'T00:00:00Z'), n=0;
    if (!isFinite(d.getTime()) || d.toISOString().slice(0,10)!==iso || iso>today) return 999;
    while(d<end && n<31){d.setUTCDate(d.getUTCDate()+1);if(d.getUTCDay()!==0 && d.getUTCDay()!==6)n++;}
    return n;
  }
  function source(s, now) {
    s=s||{};var n=age(s.asOf,now), state=s.fetchStatus!=='OK'?'ERROR':n<=1?'FRESH':n===2?'AGED':'STALE';
    return Object.assign({},s,{ageDays:n,freshness:state,usable:state==='FRESH'||state==='AGED'});
  }
  function view(raw, now) {
    now=now==null?Date.now():now;
    if(!raw||raw.schemaVersion!==1||!raw.sources)throw Error('Contract Breadth invalid');
    var u=source(raw.sources.uptrend,now),originalSp=source(raw.sources.sp500,now),sampleSp=source(raw.sources.sp500Price,now),sp=sampleSp.usable?sampleSp:originalSp,m=u.market||{},ratio=m.ratio;
    var valid=u.usable&&typeof ratio==='number'&&isFinite(ratio)&&ratio>=0&&ratio<=1&&m.total>0;
    var stance=!valid?'NEVERIFICAT':ratio<.10 || (m.trend==='down'&&ratio<.20)?'RISK-OFF':ratio<.25||m.trend==='down'?'PRUDENȚĂ':'SELECTIV';
    var sectors=(u.sectors||[]).map(function(s){var status=source({asOf:s.date,fetchStatus:u.fetchStatus},now);return Object.assign({},s,status);});
    var full=raw.full||{},engine=full.engine||{},engineData=engine.data||{},master=engine.master||{};
    var keys=Object.keys(engineData),fullValid=full.status!=='ERROR'&&keys.length>0&&keys.every(function(k){return source(Object.assign({fetchStatus:'OK'},(full.sources||{})[k],{asOf:engineData[k].data_date}),now).usable;});
    ['ideas','confirmation','market_timing','intermarket'].forEach(function(k){var s=(full.sources||{})[k];if(s&&s.usable&&!source(s,now).usable)fullValid=false;});
    var engineFresh=fullValid&&typeof master.stance==='string'&&master.stance!=='NEVERIFICAT';
    if(engineFresh)stance=master.stance;
    var originalIdeas=source((full.sources||{}).ideas,now).usable?full.ideas||{}:{};
    var early=originalIdeas.early_buy||[],contra=originalIdeas.contrarian||[];
    return {raw:raw,checkedAt:full.checkedAt||raw.checkedAt,uptrend:u,sp500:sp,originalSp:originalSp,sectors:sectors,date:u.asOf||'indisponibil',full:full,engineFresh:engineFresh,originalIdeas:originalIdeas,
      ageDays:u.ageDays,freshness:u.freshness,stale:!valid&&!engineFresh,error:!m.date&&!engineFresh,stance:stance,score:engineFresh?master.score:'',
      index:valid?ratio*100:null,exposure:engineFresh?master.net_ceiling:null,nhnl:originalIdeas.nh_nl||'',early:early,contrarian:contra,
      action:engineFresh?master.action+' Acoperire: '+keys.length+'/4 surse breadth. '+master.confidence:valid?'Participare uptrend '+(ratio*100).toFixed(1)+'% ('+m.count+'/'+m.total+'). '+
      (stance==='SELECTIV'?'Validează separat fiecare setup.':'Participare redusă: setup-uri selective, risc redus.'):'Sursa uptrend nu este utilizabilă; exclusă din decizie.',
      partial:full.status==='PARTIAL'||!sp.usable||sectors.filter(function(s){return s.usable&&s.date===u.asOf;}).length<11};
  }
  async function load(url){var r=await fetch(url+(url.indexOf('?')>=0?'&':'?')+'v='+Math.floor(Date.now()/300000),{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return view(await r.json());}
  var api={age:age,source:source,view:view,load:load};root.TTBreadth=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
