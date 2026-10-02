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
    var u=source(raw.sources.uptrend,now),sp=source(raw.sources.sp500,now),m=u.market||{},ratio=m.ratio;
    var valid=u.usable&&typeof ratio==='number'&&isFinite(ratio)&&ratio>=0&&ratio<=1&&m.total>0;
    var stance=!valid?'NEVERIFICAT':ratio<.10 || (m.trend==='down'&&ratio<.20)?'RISK-OFF':ratio<.25||m.trend==='down'?'PRUDENȚĂ':'SELECTIV';
    var sectors=(u.sectors||[]).map(function(s){var status=source({asOf:s.date,fetchStatus:u.fetchStatus},now);return Object.assign({},s,status);});
    return {raw:raw,checkedAt:raw.checkedAt,uptrend:u,sp500:sp,sectors:sectors,date:u.asOf||'indisponibil',
      ageDays:u.ageDays,freshness:u.freshness,stale:!valid,error:!m.date,stance:stance,score:'',
      index:valid?ratio*100:null,exposure:null,nhnl:'',early:[],contrarian:[],
      action:valid?'Participare uptrend '+(ratio*100).toFixed(1)+'% ('+m.count+'/'+m.total+'). '+
      (stance==='SELECTIV'?'Validează separat fiecare setup.':'Participare redusă: setup-uri selective, risc redus.'):'Sursa uptrend nu este utilizabilă; exclusă din decizie.',
      partial:!sp.usable||sectors.filter(function(s){return s.usable&&s.date===u.asOf;}).length<11};
  }
  async function load(url){var r=await fetch(url+(url.indexOf('?')>=0?'&':'?')+'v='+Math.floor(Date.now()/300000),{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);return view(await r.json());}
  var api={age:age,source:source,view:view,load:load};root.TTBreadth=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
