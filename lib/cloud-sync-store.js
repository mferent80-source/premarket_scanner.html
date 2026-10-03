(function(g){'use strict';
const DB='tt-cloud-private-v1';
async function transaction(mode,fn){const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('Stocare privată indisponibilă.'));});try{return await new Promise((resolve,reject)=>{const tx=db.transaction('records',mode),r=fn(tx.objectStore('records'));let value;r.onsuccess=()=>value=r.result;tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(Error('Stocarea privată a eșuat.'));});}finally{db.close();}}
async function put(id,value){const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']),iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(value)));return transaction('readwrite',s=>s.put({key,iv,cipher},id));}
async function get(id){const r=await transaction('readonly',s=>s.get(id));if(!r)return null;return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:r.iv},r.key,r.cipher)));}
async function remove(id){return transaction('readwrite',s=>s.delete(id));}
g.TTCloudStore={put,get,remove};
})(window);
