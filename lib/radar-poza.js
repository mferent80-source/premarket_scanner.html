// radar-poza.js — poza colectorului Crypto Radar, citita din worker-ul Paznicului cu cheia de citire (v116, 27.09.2026).
// Cheia si adresa stau in browser (localStorage); ultima poza se tine in browser ca sa ai ceva pe ecran si cand worker-ul tace.
// In probele de ecran, window.__probaPoza tine loc de retea (nicio cerere, nicio cheie).
var RadarPoza = (function () {
  'use strict';
  var K_CHEIE = 'radar_cheie', K_PAROLA = 'radar_parola', K_URL = 'radar_url', K_POZA = 'radar_poza', K_ETAG = 'radar_etag';
  var URL_IMPLICIT = 'https://paznic-radar.mferent80.workers.dev';   // adresa publica a worker-ului; se poate schimba din caseta cheii
  var MIN = 60000, TACE = 15 * MIN, OPRIT = 60 * MIN, CITIRE_MS = 5 * MIN;
  function proba() { try { return typeof window !== 'undefined' && window.__probaPoza ? window.__probaPoza : null; } catch (e) { return null; } }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} return null; }
  function cheie() { if (proba()) return 'proba'; return ls(K_CHEIE) || ''; }
  function puneCheie(c) { ls(K_CHEIE, String(c || '').trim() || null); }
  // v126 (el, 28.09: „când dau clic Deschide în Radar îmi dă erori”): parola RADARULUI (APP_API_TOKEN), ținută doar în browserul ăsta;
  // butoanele o duc în Radar DUPĂ # (nu pleacă la niciun server) - tunelul are adresă nouă la fiecare pornire, deci acolo n-o are
  function parolaRadar() { return ls(K_PAROLA) || ''; }
  function puneParolaRadar(p) { ls(K_PAROLA, String(p || '').trim() || null); }
  // v141 (el, 29.09: „nu încarcă T212 și botul pe PC”): managerul de parole din Edge a pus „1000” în câmpul adresei ->
  // fetch pe alerts/1000/poza = 404. Adresa se ia DOAR dacă e https://…; altfel (și ce s-a salvat deja stricat) = cea implicită
  function eAdresa(u) { return /^https:\/\/[^\s/?#]+\.[^\s/?#]+/i.test(String(u || '').trim()); }
  function url() { var u = ls(K_URL); return (eAdresa(u) ? u.trim() : URL_IMPLICIT).replace(/\/+$/, ''); }
  function puneUrl(u) { u = String(u || '').trim(); ls(K_URL, eAdresa(u) ? u : null); }
  function cache() { try { return JSON.parse(ls(K_POZA) || 'null'); } catch (e) { return null; } }
  function prospetime(poza, acum) {
    if (!poza || !(poza.la > 0)) return { stare: 'lipsa', minute: null, text: 'nicio poză încă' };
    var m = Math.max(0, Math.round((acum - poza.la) / MIN));
    if (acum - poza.la < TACE) return { stare: 'viu', minute: m, text: 'poza de acum ' + m + ' min' };
    if (acum - poza.la < OPRIT) return { stare: 'tace', minute: m, text: 'Radarul tace de ' + m + ' min' };
    return { stare: 'oprit', minute: m, text: 'Radarul e oprit de ' + (m < 120 ? m + ' min' : Math.round(m / 60) + ' h') };
  }
  var st = { la: 0, inLucru: false, ultima: null };
  async function citeste(o) {
    o = o || {};
    if (proba()) return { poza: proba(), sursa: 'proba', eroare: null, status: 200 };
    if (!cheie()) return { poza: cache(), sursa: cache() ? 'cache' : null, eroare: 'fara cheie', status: 0 };
    if (st.inLucru || (!o.fortat && Date.now() - st.la < CITIRE_MS)) return st.ultima || { poza: cache(), sursa: cache() ? 'cache' : null, eroare: null, status: 0 };
    st.inLucru = true;
    try {
      var h = { authorization: 'Bearer ' + cheie() }, et = ls(K_ETAG); if (et && cache()) h['if-none-match'] = et;
      var r = await fetch(url() + '/poza', { headers: h, cache: 'no-store' });
      if (r.status === 304) st.ultima = { poza: cache(), sursa: 'retea', eroare: null, status: 304 };
      else if (r.ok) { var p = await r.json(); ls(K_POZA, JSON.stringify(p)); ls(K_ETAG, r.headers.get('etag') || null); st.ultima = { poza: p, sursa: 'retea', eroare: null, status: 200 }; }
      else st.ultima = { poza: cache(), sursa: cache() ? 'cache' : null, eroare: r.status === 401 ? 'cheia nu e bună' : r.status === 404 ? 'nicio poză încă (colectorul n-a trimis)' : 'worker: HTTP ' + r.status, status: r.status };
    } catch (e) { st.ultima = { poza: cache(), sursa: cache() ? 'cache' : null, eroare: 'Radarul nu răspunde (' + (e && e.message || e) + ')', status: -1 }; }
    st.la = Date.now(); st.inLucru = false; return st.ultima;
  }
  async function trimiteSimboluri(lista) {
    if (proba() || !cheie()) return false;
    try { var r = await fetch(url() + '/simboluri', { method: 'POST', headers: { authorization: 'Bearer ' + cheie(), 'content-type': 'application/json' }, body: JSON.stringify({ simboluri: lista }) }); return r.ok; } catch (e) { return false; }
  }
  // cheia dintr-un link (…/alerts/#cheie=… sau ?cheie=…): se salveaza o data in browser si dispare din adresa
  // (istoricul browserului n-o tine). Asa se pune de pe telefon dintr-o singura atingere.
  function cheieDinUrl() {
    try {
      if (typeof location === 'undefined') return null;
      var h = String(location.href || ''), m = /[?&#]cheie=([A-Za-z0-9_-]{16,})/.exec(h), pr = /[?&#]parola=([^&#]+)/.exec(h); if (!m && !pr) return null;
      if (m) puneCheie(m[1]);
      if (pr) { try { puneParolaRadar(decodeURIComponent(pr[1])); } catch (e) {} }
      var u = h.replace(/([?&#])cheie=[A-Za-z0-9_-]+&?/, '$1').replace(/([?&#])parola=[^&#]+&?/, '$1').replace(/[?#&]+$/, '');
      if (typeof history !== 'undefined' && history.replaceState) history.replaceState(null, '', u);
      return m ? m[1] : '';
    } catch (e) { return null; }
  }
  var timer = null;
  function porneste(o) {   // laSchimbare(rezultat) e chemat dupa fiecare citire
    o = o || {}; cheieDinUrl(); var f = function (fortat) { if (document.hidden) return; citeste({ fortat: !!fortat }).then(function (r) { if (o.laSchimbare) o.laSchimbare(r); }); };
    f(false); clearInterval(timer); timer = setInterval(function () { f(false); }, MIN);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) f(true); });
  }
  return { cheie: cheie, puneCheie: puneCheie, parolaRadar: parolaRadar, puneParolaRadar: puneParolaRadar, cheieDinUrl: cheieDinUrl, url: url, puneUrl: puneUrl, citeste: citeste, prospetime: prospetime, trimiteSimboluri: trimiteSimboluri, porneste: porneste, cache: cache };
})();
if (typeof window !== 'undefined') window.RadarPoza = RadarPoza;
