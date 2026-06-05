// ═══════════════════════════════════════════════════════════════════
// notifications.js — Notificări browser partajate (NT.*). Înlocuiește ~6-11 copii.
// Stare în localStorage 'notif_enabled' ('1'/'0'); respectă permisiunea browserului.
//
// Folosire: <script src="../lib/notifications.js"></script>
//   await NT.enable(); if (NT.isOn()) NT.show('Titlu', { body: '...' });
// ═══════════════════════════════════════════════════════════════════
(function(global){
  'use strict';
  const KEY = 'notif_enabled';
  const supported = ('Notification' in global);

  function _granted(){ return supported && Notification.permission === 'granted'; }
  function isOn(){
    try { return localStorage.getItem(KEY) === '1' && _granted(); } catch(e){ return false; }
  }
  function _set(v){ try { localStorage.setItem(KEY, v ? '1' : '0'); } catch(e){} }

  // enable — cere permisiunea dacă e nevoie, pornește notificările. Întoarce true dacă active.
  async function enable(){
    if(!supported) return false;
    if(Notification.permission !== 'granted'){
      const p = await Notification.requestPermission();
      if(p !== 'granted'){ _set(false); return false; }
    }
    _set(true); return true;
  }
  function disable(){ _set(false); }
  // toggle — comută; cere permisiune la prima pornire. Întoarce starea nouă.
  async function toggle(){ return isOn() ? (disable(), false) : enable(); }

  // show — afișează o notificare DOAR dacă e activată + permisă.
  function show(title, opts){
    if(!isOn()) return null;
    try { return new Notification(title, opts || {}); } catch(e){ return null; }
  }

  global.NT = { isOn, enable, disable, toggle, show, supported, KEY };
})(typeof window !== 'undefined' ? window : globalThis);
