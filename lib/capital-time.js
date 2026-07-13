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
    // miezul nopții ET al zilei de start, DST-aware (era -05:00 fix → 1h greșit
    // vara → trade-uri luni 00-01 ET excluse din săptămână); încearcă ambele
    // offseturi și validează round-trip că ora ET a instantului e 00:00
    for (const off of ['-04:00', '-05:00']){
      const d = new Date(start + 'T00:00:00' + off);
      try {
        const hh = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
        if (hh === '00:00') return d.getTime();
      } catch (e) { return d.getTime(); }
    }
    return new Date(start + 'T00:00:00-05:00').getTime();
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