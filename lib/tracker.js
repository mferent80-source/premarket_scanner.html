// tracker.js — Trade Plans (trade_plans_v1) cu sync live către Journal (TT.*)
// Sursa operațională pentru FAB Hub; Journal = sursa de adevăr pentru Portfolio/Capital.
(function(global){
  'use strict';
  const KEY = 'trade_plans_v1';

  function all(){
    try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch(e){ return []; }
  }
  function save(arr){
    try {
      localStorage.setItem(KEY, JSON.stringify(arr));
      if (global.CD && typeof CD.notifyChange === 'function') CD.notifyChange();
      return true;
    } catch(e){ return false; }
  }

  function calcPnL(t){
    const e = parseFloat(t.entry), exit = parseFloat(t.exit), size = parseFloat(t.size) || 0;
    if (!e || !exit || !size) return 0;
    const gross = t.dir === 'short' ? (e - exit) * size : (exit - e) * size;
    return gross - (parseFloat(t.fees) || 0);
  }

  function add(plan){
    const arr = all();
    arr.unshift(plan);
    save(arr);
    if (global.JR && typeof JR.syncPlan === 'function') JR.syncPlan(plan);
    return plan;
  }

  function update(id, patch){
    const arr = all();
    const i = arr.findIndex(x => x && x.id === id);
    if (i < 0) return null;
    const next = Object.assign({}, arr[i], patch, { id });
    arr[i] = next;
    save(arr);
    if (global.JR && typeof JR.syncPlan === 'function') JR.syncPlan(next);
    return next;
  }

  function remove(id){
    const arr = all();
    if (!arr.some(x => x && x.id === id)) return false;
    save(arr.filter(x => x && x.id !== id));
    if (global.JR && typeof JR.unsyncPlan === 'function') JR.unsyncPlan(id);
    return true;
  }

  function close(id, status, exit, fees){
    const t = all().find(x => x && x.id === id);
    if (!t) return null;
    const feeN = parseFloat(fees) || 0;
    return update(id, {
      exit, status, closed: Date.now(), fees: feeN,
      pnl: calcPnL(Object.assign({}, t, { exit, fees: feeN }))
    });
  }

  global.TT = { all, save, add, update, remove, close, calcPnL, KEY };
})(typeof window !== 'undefined' ? window : globalThis);