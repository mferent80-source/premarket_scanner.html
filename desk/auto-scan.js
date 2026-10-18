/* 18.10.2026 (el: „optimizăm pagina Planuri” → „fă A”): Planuri pornește singură scanarea Premarket când copia (ce_results_v2) lipsește
   sau are peste 30 de minute. Dacă aplicația scanează deja în fundal (ttBackgroundScan din app/index.html), o așteaptă; altfel pornește
   un cadru ascuns candidate-engine/?fundal=1 (o scanare, fără ceasul de 5 minute). Pagina se reîncarcă singură din evenimentul
   `storage` pe ce_results_ (desk/index.html). Nimic în demo, pe o pagină ascunsă sau fără rețea. */
(function (g) {
  'use strict';
  var KEY = 'ce_results_v2', FRESH = 30 * 60000, TIMEOUT = 6 * 60000;
  function savedAt(storage) { try { var c = JSON.parse(storage.getItem(KEY) || 'null'), t = c && Number(c.updatedAt); return t > 0 ? t : 0; } catch (_) { return 0; } }
  function shellRunning() { try { return !!(g.parent && g.parent !== g && g.parent.ttBackgroundScan && g.parent.ttBackgroundScan.state().running); } catch (_) { return false; } }
  function create(o) {
    var storage = o.storage, every = o.setInterval || g.setInterval.bind(g), stop = o.clearInterval || g.clearInterval.bind(g);
    var run = null, lastFail = 0;   // după o scanare căzută, următoarea încercare singură abia peste 5 minute (fără buclă la 30 s)
    function say(s) { if (o.onState) o.onState(s); }
    function finish(faza, motiv) {
      if (!run) return; if (faza === 'eroare') lastFail = Date.now(); stop(run.timer); if (run.frame && run.frame.remove) run.frame.remove(); run = null; say({ faza: faza, motiv: motiv || '' });
    }
    function open() {
      var doc = g.document, f = doc.createElement('iframe');
      f.hidden = true; f.tabIndex = -1; f.title = 'Premarket Scanner · scanare pornită de Planuri';
      if (f.setAttribute) f.setAttribute('aria-hidden', 'true');
      f.src = '../candidate-engine/?fundal=1'; doc.body.appendChild(f); run.frame = f; run.mode = 'own';
    }
    function tick() {
      if (!run) return;
      if (savedAt(storage) >= run.start) return finish('gata');
      if (Date.now() - run.start > TIMEOUT) return finish('eroare', 'Premarket Scanner nu a terminat în 6 minute.');
      if (run.mode === 'shell' && !shellRunning()) open();
      var progres = '';
      if (run.frame) { try { var d = run.frame.contentDocument, el = d && d.getElementById('ctxScanned'); progres = el ? String(el.textContent || '').trim() : ''; } catch (_) {} }
      say({ faza: run.mode === 'shell' ? 'astept' : 'scanez', progres: progres });
    }
    function start(fortat) {
      if (run || o.demo) return false;
      if (!fortat && lastFail && Date.now() - lastFail < 5 * 60000) return false;
      var doc = g.document; if (!doc || doc.hidden || (g.navigator && g.navigator.onLine === false)) return false;
      if (Date.now() - savedAt(storage) < FRESH) return false;
      run = { start: Date.now(), frame: null, mode: 'shell', timer: null };
      if (!shellRunning()) open();
      run.timer = every(tick, 1500);
      say({ faza: run.mode === 'shell' ? 'astept' : 'scanez', progres: '' });
      return true;
    }
    return { start: start, running: function () { return !!run; } };
  }
  g.TTDeskAutoScan = { create: create, savedAt: savedAt, FRESH: FRESH };
})(typeof window !== 'undefined' ? window : globalThis);
