/* Plasa de siguranță a spațiului local (15.10.2026). Spațiul local (~5 milioane de caractere ≈ „10 MB” în Chrome) e comun cu toate
   aplicațiile de pe mferent80-source.github.io. Peste prag (implicit 80%), se șterg DOAR cache-urile care se refac singure — aceeași
   regulă ca butonul „🧨 Curăță tot cache-ul regenerabil” din Health (health/index.html, isDeepCandidate). Datele nu se ating. */
(function(g){
'use strict';
const LIMIT=5*1024*1024;
function usage(storage=g.localStorage){
 let chars=0,keys=0;
 for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k===null)continue;chars+=k.length+(storage.getItem(k)||'').length;keys++;}
 return {chars,keys,ratio:chars/LIMIT};
}
function regenerable(k,now=Date.now()){
 if(typeof k!=='string')return false;
 const m=/^salt_eb2_(\d{4}-\d{2}-\d{2})$/.exec(k);
 if(m)return m[1]<new Date(now-2*864e5).toISOString().slice(0,10);
 return k.indexOf('ttd:')===0||/^ce_eb_cache/.test(k)||k==='wl_hist_cache'||/^(stl|pump_radar)_ticker_cache_v1$/.test(k);
}
function clean(storage=g.localStorage,{threshold=0.8,now=Date.now()}={}){
 const before=usage(storage);if(before.ratio<threshold)return {cleaned:0,freed:0,before,after:before};
 const keys=[];for(let i=0;i<storage.length;i++){const k=storage.key(i);if(regenerable(k,now))keys.push(k);}
 let freed=0,cleaned=0;for(const k of keys){const v=storage.getItem(k)||'';try{storage.removeItem(k);freed+=k.length+v.length;cleaned++;}catch{}}
 return {cleaned,freed,before,after:usage(storage)};
}
g.TTStorageHygiene={LIMIT,usage,regenerable,clean};
if(typeof module!=='undefined'&&module.exports)module.exports=g.TTStorageHygiene;
})(typeof window!=='undefined'?window:globalThis);
