/* 27.10.2026 (I-760): registrul de incidente — ce a mers prost, când, impactul, cauza și ce s-a schimbat după. Un incident rămâne DESCHIS până
   are măsura scrisă (închiderea o cere). Fișa zilei primește un rând (randFisa): incidentele noi ale zilei New York și cele deschise. Fiecare
   incident se copiază în docs/incidente.md (markdown). Stă în tt_journal_incidente_v1 (pe aparat; sincronizarea și rândul din fișa de pe server
   le leagă lotul A: cheia în KEYS cu unire pe id, iar fisaZilei adaugă JournalIncidente.randFisa). Pur; testat în tools/journal-incidente.test.mjs. */
(function (g) {
  'use strict';
  var KEY = 'tt_journal_incidente_v1', MAX = 500, GRAV = ['mic', 'mediu', 'mare'];
  var fin = Number.isFinite;
  var text = function (v, max) { return String(v == null ? '' : v).trim().slice(0, max || 2000); };
  function ziNY(t) {
    if (g.CT && typeof g.CT.ziNY === 'function') { try { return g.CT.ziNY(t); } catch (e) { /* mai jos */ } }
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(t)); } catch (e) { return new Date(t).toISOString().slice(0, 10); }
  }
  function citeste(storage) {
    try { var a = JSON.parse((storage || g.localStorage).getItem(KEY) || '[]'); return Array.isArray(a) ? a.filter(function (x) { return x && typeof x.id === 'string' && fin(Date.parse(x.la)); }) : []; }
    catch (e) { return []; }
  }
  function scrie(storage, lista) { try { (storage || g.localStorage).setItem(KEY, JSON.stringify(lista.slice(-MAX))); return true; } catch (e) { return false; } }
  function valideaza(x, now) {
    var erori = [], la = Date.parse(x && x.la);
    now = fin(now) ? now : Date.now();
    if (text(x && x.titlu).length < 5) erori.push('Titlul are cel puțin 5 caractere.');
    if (text(x && x.ce).length < 10) erori.push('Ce s-a întâmplat: cel puțin 10 caractere.');
    if (!fin(la)) erori.push('Data incidentului lipsește sau nu e o dată.');
    else if (la > now + 60000) erori.push('Data incidentului e în viitor.');
    if (GRAV.indexOf(x && x.gravitate) < 0) erori.push('Gravitate: mic, mediu sau mare.');
    if (x && x.stare === 'inchis' && text(x.masura).length < 5) erori.push('Un incident închis are măsura scrisă (ce s-a schimbat).');
    return { ok: !erori.length, erori: erori };
  }
  function adauga(storage, x, opts) {
    opts = opts || {};
    var now = fin(opts.now) ? opts.now : Date.now(), v = valideaza(x, now);
    if (!v.ok) return v;
    var inchis = x.stare === 'inchis';
    var inc = { id: 'inc_' + now + '_' + Math.random().toString(36).slice(2, 8), la: new Date(Date.parse(x.la)).toISOString(), titlu: text(x.titlu, 120), gravitate: x.gravitate,
      ce: text(x.ce), impact: text(x.impact, 500), cauza: text(x.cauza, 1000), masura: text(x.masura, 1000), legatura: text(x.legatura, 300),
      stare: inchis ? 'inchis' : 'deschis', notatLa: now, inchisLa: inchis ? now : null, aparat: text(opts.aparat, 40) || null, actualizatLa: now };
    var lista = citeste(storage); lista.push(inc);
    return scrie(storage, lista) ? { ok: true, incident: inc } : { ok: false, erori: ['Registrul nu a putut fi scris pe acest aparat.'] };
  }
  function inchide(storage, id, masura, opts) {
    opts = opts || {};
    var now = fin(opts.now) ? opts.now : Date.now(), m = text(masura, 1000), lista = citeste(storage), inc = null;
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) inc = lista[i];
    if (!inc) return { ok: false, erori: ['Incidentul nu mai există.'] };
    if (m.length < 5) return { ok: false, erori: ['Închiderea cere măsura scrisă (ce s-a schimbat).'] };
    inc.masura = m; inc.stare = 'inchis'; inc.inchisLa = now; inc.actualizatLa = now;
    return scrie(storage, lista) ? { ok: true, incident: inc } : { ok: false, erori: ['Registrul nu a putut fi scris pe acest aparat.'] };
  }
  function deschise(lista) { return (lista || []).filter(function (x) { return x && x.stare !== 'inchis'; }); }
  function zz(t) { var d = ziNY(t); return d.slice(8, 10) + '.' + d.slice(5, 7); }
  /** Rândul din fișa zilei (ziua New York). */
  function randFisa(lista, zi) {
    lista = lista || [];
    var noi = lista.filter(function (x) { return x && ziNY(Date.parse(x.la)) === zi; }), desc = deschise(lista).slice().sort(function (a, b) { return Date.parse(a.la) - Date.parse(b.la); });
    var partea1 = noi.length ? noi.length + (noi.length === 1 ? ' nou azi (' : ' noi azi (') + noi.map(function (x) { return x.titlu; }).join('; ') + ')' : 'niciunul nou azi';
    var partea2 = desc.length ? desc.length + (desc.length === 1 ? ' deschis' : ' deschise') + ', cel mai vechi din ' + zz(Date.parse(desc[0].la)) : 'niciunul deschis';
    return 'Incidente: ' + partea1 + (noi.length ? ' · ' : ', ') + partea2 + '.';
  }
  var linie = function (v) { return text(v).replace(/\s*\r?\n\s*/g, ' / '); };
  /** Copia pentru docs/incidente.md. */
  function markdown(x) {
    return '### ' + ziNY(Date.parse(x.la)) + ' · ' + linie(x.titlu) + ' · gravitate ' + x.gravitate + '\n' +
      '- **Ce s-a întâmplat:** ' + linie(x.ce) + '\n' +
      '- **Impact:** ' + (linie(x.impact) || '—') + '\n' +
      '- **Cauza:** ' + (linie(x.cauza) || 'necunoscută încă') + '\n' +
      '- **Ce s-a schimbat:** ' + (x.stare === 'inchis' ? linie(x.masura) : 'deschis — măsura nescrisă') + '\n' +
      (x.legatura ? '- **Legătura:** ' + linie(x.legatura) + '\n' : '') +
      '- **Stare:** ' + (x.stare === 'inchis' ? 'închis' : 'deschis') + (x.aparat ? ' · notat pe ' + linie(x.aparat) : '') + '\n';
  }
  g.JournalIncidente = { KEY: KEY, GRAV: GRAV, citeste: citeste, valideaza: valideaza, adauga: adauga, inchide: inchide, deschise: deschise, randFisa: randFisa, markdown: markdown };
})(typeof window !== 'undefined' ? window : globalThis);
