// suite-sessions.js — sesiune NYSE unică cu sărbători + half-days (SES.*) — I-208
// Sursa unică pentru „e piața deschisă?" — înainte existau 4 implementări paralele
// (hub-market ×2, hub-gappers, router), TOATE fără calendar de sărbători: pe
// 4 iulie hub-ul arăta „🟢 RTH" și gappers scana un premarket inexistent.
// Vocabular canonic: 'pre' | 'rth' | 'after' | 'closed' | 'weekend' | 'holiday'.
// Consumatorii cu vocabular legacy ('open') mapează la ei; SES nu se adaptează.
(function(global){
  'use strict';

  // Sărbători NYSE (închis complet) — de întreținut anual; expired() semnalează
  const HOLIDAYS = {
    '2026-01-01': 'New Year’s Day',
    '2026-01-19': 'MLK Day',
    '2026-02-16': 'Presidents’ Day',
    '2026-04-03': 'Good Friday',
    '2026-05-25': 'Memorial Day',
    '2026-06-19': 'Juneteenth',
    '2026-07-03': 'Independence Day (observat)',
    '2026-09-07': 'Labor Day',
    '2026-11-26': 'Thanksgiving',
    '2026-12-25': 'Christmas',
    '2027-01-01': 'New Year’s Day',
    '2027-01-18': 'MLK Day',
    '2027-02-15': 'Presidents’ Day',
    '2027-03-26': 'Good Friday',
    '2027-05-31': 'Memorial Day',
    '2027-06-18': 'Juneteenth (observat)',
    '2027-07-05': 'Independence Day (observat)',
    '2027-09-06': 'Labor Day',
    '2027-11-25': 'Thanksgiving',
    '2027-12-24': 'Christmas (observat)'
  };
  // Half-days (close 13:00 ET, after-hours scurt)
  const HALF_DAYS = {
    '2026-11-27': 'Black Friday',
    '2026-12-24': 'Christmas Eve',
    '2027-11-26': 'Black Friday'
  };
  const LAST_KNOWN = '2027-12-31';

  function etParts(){
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', hour12: false,
      weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    }).formatToParts(new Date()).map(x => [x.type, x.value]));
    return {
      weekday: p.weekday,
      dateET: p.year + '-' + p.month + '-' + p.day,
      mins: ((+p.hour) % 24) * 60 + (+p.minute)
    };
  }

  function isHoliday(dateET){ return HOLIDAYS[dateET] || null; }
  function isHalfDay(dateET){ return HALF_DAYS[dateET] || null; }
  function expired(){
    try { return etParts().dateET > LAST_KNOWN; } catch (e) { return false; }
  }

  // starea canonică a sesiunii NYSE, holiday/half-day aware
  function info(){
    try {
      const p = etParts();
      const weekend = p.weekday === 'Sat' || p.weekday === 'Sun';
      if (weekend) return { state: 'weekend', label: 'Weekend', holidayName: null, halfDay: false, mins: p.mins, weekday: p.weekday, dateET: p.dateET };
      const hol = isHoliday(p.dateET);
      if (hol) return { state: 'holiday', label: '🎌 Închis — ' + hol, holidayName: hol, halfDay: false, mins: p.mins, weekday: p.weekday, dateET: p.dateET };
      const half = isHalfDay(p.dateET);
      const closeMin = half ? 780 : 960;   // 13:00 la half-day, altfel 16:00
      const afterEnd = half ? 1020 : 1200; // AH scurt la half-day (~17:00)
      let state = 'closed', label = 'Închis';
      if (p.mins >= 240 && p.mins < 570){ state = 'pre'; label = 'Pre-market'; }
      else if (p.mins >= 570 && p.mins < closeMin){ state = 'rth'; label = half ? 'RTH (half-day, close 13:00 ET)' : 'RTH'; }
      else if (p.mins >= closeMin && p.mins < afterEnd){ state = 'after'; label = 'After-hours'; }
      return { state, label, holidayName: null, halfDay: !!half, mins: p.mins, weekday: p.weekday, dateET: p.dateET };
    } catch (e) {
      // eroare Intl → conservator ÎNCHIS (nu „rth" fals care etichetează
      // closes vechi drept „% azi")
      return { state: 'closed', label: 'Închis (?)', holidayName: null, halfDay: false, mins: 0, weekday: '?', dateET: '' };
    }
  }

  global.SES = { info, isHoliday, isHalfDay, expired, HOLIDAYS, HALF_DAYS, LAST_KNOWN };
})(typeof window !== 'undefined' ? window : global);
