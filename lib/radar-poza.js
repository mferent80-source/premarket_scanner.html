// radar-poza.js — poza colectorului Crypto Radar, citita din worker-ul Paznicului cu cheia de citire (v116, 27.09.2026).
// Cheia si adresa stau in browser (localStorage); ultima poza se tine in browser ca sa ai ceva pe ecran si cand worker-ul tace.
// In probele de ecran, window.__probaPoza tine loc de retea (nicio cerere, nicio cheie).
var RadarPoza = (function () {
  'use strict';
  var K_CHEIE = 'radar_cheie', K_PAROLA = 'radar_parola', K_URL = 'radar_url', K_POZA = 'radar_poza', K_ETAG = 'radar_etag';
  var URL_IMPLICIT = 'https://paznic-radar.mferent80.workers.dev';   // adresa publica a worker-ului; se poate schimba din caseta cheii
  var MIN = 60000, TACE = 15 * MIN, OPRIT = 60 * MIN, CITIRE_MS = 5 * MIN;
  function proba() { try { return typeof window !== 'undefined' && window.__probaPoza ? window.__probaPoza : null; } catch (e) { return null; } }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else scrie(k, v); } catch (e) {} return null; }
  // v142: stocarea plină (cache-ul de prețuri o umplea) nu mai oprește poza în liniște - îi cerem cache-ului să facă loc și mai încercăm o dată
  function scrie(k, v) {
    try { localStorage.setItem(k, v); } catch (e) {
      var D = typeof window !== 'undefined' && window.D; if (!D || typeof D.cacheTrim !== 'function') throw e;
      D.cacheTrim(1500000, k.length + String(v).length); localStorage.setItem(k, v);
    }
  }
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
  // v142: adresa se vede pe ecran DOAR când nu e cea obișnuită (altfel: '')
  function adresaAltfel() { var u = url(); return u === URL_IMPLICIT ? '' : u; }
  function cache() { try { return JSON.parse(ls(K_POZA) || 'null'); } catch (e) { return null; } }
  function prospetime(poza, acum) {
    if (!poza || !(poza.la > 0)) return { stare: 'lipsa', minute: null, text: 'nicio poză încă' };
    var m = Math.max(0, Math.round((acum - poza.la) / MIN)), mr = minutRo(acum);
    // el, 01.10: noaptea (23:00–08:00) colectorul nu urcă nimic - nu e „tace / oprit”; nici în primele 10 minute după 08:00
    if (mr >= 23 * 60 || mr < 8 * 60 + 10) return { stare: 'noapte', minute: m, text: 'pauză de noapte (23:00–08:00) · ultima poză acum ' + (m < 120 ? m + ' min' : Math.round(m / 60) + ' h') };
    if (acum - poza.la < TACE) return { stare: 'viu', minute: m, text: 'poza de acum ' + m + ' min' };
    if (acum - poza.la < OPRIT) return { stare: 'tace', minute: m, text: 'Radarul tace de ' + m + ' min' };
    return { stare: 'oprit', minute: m, text: 'Radarul e oprit de ' + (m < 120 ? m + ' min' : Math.round(m / 60) + ' h') };
  }
  // el, 01.10: ritmul pe ore (ora României), același cu al colectorului: 08–16 la 3 min, 16–17 la 30 s, 17–23 la 1,5 min, 23–08 nimic
  // (noaptea colectorul nu urcă nimic - cota KV de pe Cloudflare); null = nu citește.
  function minutRo(acum) {
    try { var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(acum)), h = 0, m = 0;
      for (var i = 0; i < p.length; i++) { if (p[i].type === 'hour') h = Number(p[i].value); if (p[i].type === 'minute') m = Number(p[i].value); } return h * 60 + m; } catch (e) { return 12 * 60; }
  }
  function citireMs(acum) { var m = minutRo(acum || Date.now()); return m >= 23 * 60 || m < 8 * 60 ? null : m < 16 * 60 ? 3 * MIN : m < 17 * 60 ? 30000 : 90000; }
  var st = { la: 0, inLucru: false, ultima: null };
  async function citeste(o) {
    o = o || {};
    if (proba()) return { poza: proba(), sursa: 'proba', eroare: null, status: 200 };
    if (!cheie()) return { poza: cache(), sursa: cache() ? 'cache' : null, eroare: 'fara cheie', status: 0 };
    var acum = o.acum || Date.now(), cm = citireMs(acum), nimic = st.ultima || { poza: cache(), sursa: cache() ? 'cache' : null, eroare: null, status: 0 };
    if (st.inLucru) return nimic;
    if (cm === null && cache()) return nimic;   // noaptea nu citește (nici la revenirea pe pagină); fără nicio poză - o citire
    if (cm !== null && !o.fortat && acum - st.la < cm) return nimic;
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
  // v144 (el, 07.10: „la dețineri să pot adăuga și manual cu preț în euro și USD”): cererile Salt de pe pagina alerts pleacă la worker
  // (/salt-cereri); colectorul le aplică pe lista Salt din Radar și răspunde în poză (saltCereri). Până atunci stau „în așteptare”
  // în browserul ăsta, cel mult 2 zile.
  // revizia v144 (I5): cererile cu răspuns se țin 1 zi de la răspuns, cele fără răspuns 2 zile de la trimitere
  var K_SALT = 'radar_salt_astept', SALT_TINE = 2 * 86400000, SALT_RASP_TINE = 86400000;
  function saltTine(x, acum) { return !!x && (x.stare ? acum - (x.raspLa || x.la) < SALT_RASP_TINE : acum - x.la < SALT_TINE); }
  function saltInAsteptare() { try { var l = JSON.parse(ls(K_SALT) || '[]'), acum = Date.now(); return Array.isArray(l) ? l.filter(function (x) { return saltTine(x, acum); }) : []; } catch (e) { return []; } }
  // revizia v144 (I5): după o repornire a colectorului poza vine cu saltCereri gol - răspunsul văzut o dată se scrie aici,
  // ca cererea să nu reapară „în așteptare”; se scrie doar când s-a schimbat ceva
  function saltNoteazaRaspunsuri(saltCereri) {
    var r = {}; (Array.isArray(saltCereri) ? saltCereri : []).forEach(function (c) { if (c && c.id && (c.stare === 'ok' || c.stare === 'respins')) r[c.id] = c; });
    var l = saltInAsteptare(), schimbat = false;
    l.forEach(function (x) { var c = r[x.id]; if (c && (x.stare !== c.stare || x.motiv !== c.motiv)) { x.stare = c.stare; x.motiv = String(c.motiv || ''); x.raspLa = Date.now(); schimbat = true; } });
    if (schimbat) ls(K_SALT, JSON.stringify(l));
    return l;
  }
  async function saltCerere(c) {
    if (proba()) return { ok: true, id: 'proba' };
    if (!cheie()) return { ok: false, eroare: 'pune întâi cheia de citire' };
    try {
      var r = await fetch(url() + '/salt-cereri', { method: 'POST', headers: { authorization: 'Bearer ' + cheie(), 'content-type': 'application/json' }, body: JSON.stringify(c) });
      var j = await r.json().catch(function () { return {}; });
      if (!r.ok) return { ok: false, eroare: 'worker: HTTP ' + r.status + (j && j.error ? ' · ' + j.error : '') };   // revizia v144 (M10): codul în față
      var l = saltInAsteptare(); l.push({ id: j.id, simbol: c.simbol || c.isin, op: c.op, la: Date.now() }); ls(K_SALT, JSON.stringify(l.slice(-20)));
      return { ok: true, id: j.id };
    } catch (e) { return { ok: false, eroare: 'worker-ul nu răspunde (' + (e && e.message || e) + ')' }; }
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
    o = o || {}; cheieDinUrl(); var f = function (fortat) { if (document.hidden) return; citeste({ fortat: !!fortat, vizibil: !!fortat }).then(function (r) { if (o.laSchimbare) o.laSchimbare(r); }); };
    f(false); clearInterval(timer); timer = setInterval(function () { f(false); }, 30000);   // 16–17 se citește la 30 s
    document.addEventListener('visibilitychange', function () { if (!document.hidden) f(true); });
  }
  return { cheie: cheie, puneCheie: puneCheie, parolaRadar: parolaRadar, puneParolaRadar: puneParolaRadar, cheieDinUrl: cheieDinUrl, url: url, puneUrl: puneUrl, adresaAltfel: adresaAltfel, citeste: citeste, citireMs: citireMs, prospetime: prospetime, trimiteSimboluri: trimiteSimboluri, porneste: porneste, cache: cache, saltCerere: saltCerere, saltInAsteptare: saltInAsteptare, saltNoteazaRaspunsuri: saltNoteazaRaspunsuri };
})();
if (typeof window !== 'undefined') window.RadarPoza = RadarPoza;
