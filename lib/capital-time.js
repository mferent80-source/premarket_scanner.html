// capital-time.js — timp ET partajat capital (CT.*) — I-145
(function(global){
  'use strict';

  function etDay(ts){
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' })
        .format(ts ? new Date(ts) : new Date());
    } catch (e) {
      return new Date(ts || Date.now()).toISOString().slice(0, 10);
    }
  }

  function weekStartDay(ts){
    const et = etDay(ts);
    const d = new Date(et + 'T12:00:00');
    const dow = d.getDay() || 7;
    d.setDate(d.getDate() - (dow - 1));
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
    } catch (e) {
      return d.toISOString().slice(0, 10);
    }
  }

  function weekStartMs(ts){
    const start = weekStartDay(ts);
    try { return new Date(start + 'T00:00:00-05:00').getTime(); }
    catch (e) { return new Date(start + 'T12:00:00').getTime(); }
  }

  function isCurrentWeekEt(closeTs){
    if (!closeTs) return false;
    return etDay(closeTs) >= weekStartDay();
  }

  function isoWeekKey(ts){
    const start = weekStartDay(ts);
    const d = new Date(start + 'T12:00:00');
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = x.getDay() || 7;
    x.setDate(x.getDate() + 4 - day);
    const y = x.getFullYear();
    const w = Math.floor((x - new Date(y, 0, 1)) / 604800000) + 1;
    return y + '-W' + String(w).padStart(2, '0');
  }

  global.CT = { etDay, weekStartDay, weekStartMs, isCurrentWeekEt, isoWeekKey };
})(typeof window !== 'undefined' ? window : globalThis);