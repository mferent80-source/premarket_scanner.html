import {createRequire} from 'node:module';
const S=createRequire(import.meta.url)('../lib/trade-evidence-schema.js'),NOW=Date.now()-10000;
export function analysis(id='a',extra={}){return {version:S.VERSION,simulation:false,id,scope:'live-account',ticker:'AAPL_US_EQ',symbol:'AAPL',currency:'USD',createdAt:NOW,expiresAt:NOW+1800000,baselineAt:NOW-1000,baselineQuantity:0,mode:'momentum',entryLow:100,entryHigh:102,stop:95,target:116,source:{symbol:'AAPL',currency:'USD',asOf:'2026-10-07',kind:'market',historyKey:'ohlcv60:abc',checkedAt:NOW-100},verdict:{code:'PLAN',title:'Plan verificabil',snapshotId:'decision:abc'},models:S.IDS.map(id=>({id,name:id,available:false,eligible:false,direction:null,state:null})),...extra};}
export const ledger=(...entries)=>({version:S.VERSION,entries});
