/* 18.10.2026 (Marius, „fă tot”) — ordinul de stop REAL în Trading 212, din fereastra „Pune stopul acum” de pe Astăzi.
   Releul (tools/trading212-worker.mjs, ruta /api/trading212/stop-order) e singura scriere și verifică din nou totul pe server: doar VÂNZARE,
   cel mult cât deții, stopul sub prețul de acum și nu sub jumătatea lui, fără a doua vânzare în așteptare pe aceeași acțiune.
   Cheia vine din seiful conexiunii de pe acest dispozitiv (T212Vault). Fără permisiunea „Orders: Execute” pe cheie, Trading 212 refuză
   și pagina spune exact ce lipsește. Fiecare ordin pleacă doar după confirmarea din pagină.
   27.10.2026 (I-758, controale pre-ordin 15c3-5 / RTS 6 art. 15): ÎNAINTE de POST, pe acest aparat — collar de preț (stopul între 0,5 % și 25 % sub
   prețul de acum; în afara lui doar cu confirmare explicită), cantitatea ≤ poziția din copia contului, refuz la dublură (același ordin plecat în
   ultimele 2 minute — jurnalul local tt_t212_ordine_trimise_v1 — sau un ordin STOP de vânzare deja în copia ordinelor). `pune()` fără gardă refuză. */
(function (g) {
  'use strict';
  const fin = Number.isFinite, CONFIRM = 'PUN-STOPUL';
  // 19.10.2026 (I-711): trimiterea are un termen; fără răspuns în 25 s nu știm dacă ordinul a ajuns ⇒ verificare în T212, fără retrimitere
  const TIMEOUT_MS = 25000;
  // I-758: limitele (docs/politica-de-risc.md § 2): collar 0,5–25 % sub prețul de acum; dublura = același ticker + cantitate + stop în 2 minute; jurnalul ține 24 h
  const COLLAR = Object.freeze({ minPct: 0.5, maxPct: 25 }), DUBLURA_MS = 2 * 60000, K_TRIMISE = 'tt_t212_ordine_trimise_v1', JURNAL_MS = 24 * 3600000, STOP_RE = /STOP/i;
  const F2 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), F0 = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }), FQ = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 8 }), F1 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const sym = (t) => String(t || '').replace(/_US_EQ$|_[A-Z]{2}_EQ$|_EQ$/, '');
  const NETRIMIS = ' Ordinul NU a fost trimis.';
  const ora = (t) => { try { return new Date(t).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch (_) { return '?'; } };
  /* Jurnalul local al trimiterilor (doar pe acest aparat): [{ ticker, quantity, stopPrice, la }], curățat la 24 h. Se scrie ÎNAINTE de POST, ca un
     timeout + reîncercare să nu trimită de două ori; refuzul ferm al releului (ordinul sigur n-a plecat) îl șterge. */
  const acelasi = (a, b) => a && b && a.ticker === b.ticker && Math.abs(Number(a.quantity) - Number(b.quantity)) < 1e-9 && Math.abs(Number(a.stopPrice) - Number(b.stopPrice)) < 1e-9;
  function jurnal(storage, now) { let l = []; try { l = JSON.parse(storage.getItem(K_TRIMISE) || '[]'); if (!Array.isArray(l)) l = []; } catch (_) { l = []; } return l.filter((x) => x && fin(Date.parse(x.la)) && now - Date.parse(x.la) <= JURNAL_MS); }
  function scrie(storage, l) { try { storage.setItem(K_TRIMISE, JSON.stringify(l)); } catch (_) { /* fără jurnal: releul verifică dublura la broker */ } }
  function noteazaTrimis(storage, ordin, now = Date.now()) { if (!storage || !ordin) return; scrie(storage, jurnal(storage, now).concat([{ ticker: ordin.ticker, quantity: ordin.quantity, stopPrice: ordin.stopPrice, la: new Date(now).toISOString() }])); }
  function scoateTrimis(storage, ordin, now = Date.now()) { if (!storage || !ordin) return; scrie(storage, jurnal(storage, now).filter((x) => !acelasi(x, ordin))); }
  function trimisRecent(storage, ordin, now = Date.now()) { if (!storage || !ordin) return null; return jurnal(storage, now).find((x) => acelasi(x, ordin) && now - Date.parse(x.la) <= DUBLURA_MS) || null; }
  /** Un ordin STOP de VÂNZARE pe ticker în copia ordinelor (lista T212Pending.read().items sau rezultatul T212Pending.stare); null = copia necitită. */
  function inCopie(pending, ticker) {
    if (pending == null) return null;
    if (Array.isArray(pending)) { const o = pending.find((x) => x && x.ticker === ticker && STOP_RE.test(x.type || '') && x.side !== 'BUY' && Number(x.stopPrice) > 0); return o ? { stopPrice: Number(o.stopPrice), quantity: fin(o.quantity) ? Math.abs(o.quantity) : null } : false; }
    if (pending.pozitii && typeof pending.pozitii.get === 'function') { if (pending.citit === false) return null; const v = pending.pozitii.get(ticker); return v && (v.stare === 'da' || v.stare === 'partial') ? { stopPrice: v.ordin && v.ordin.stopPrice > 0 ? v.ordin.stopPrice : null, quantity: v.ordin ? v.ordin.quantity : null } : false; }
    return null;
  }
  /** I-758: controalele pre-ordin, pure. { ok:true, pct, inAfara } sau { ok:false, cod, mesaj, trebuieConfirmat? }. `pct` = cât de jos e stopul față de prețul de acum, în %. */
  function verifica(ordin, { poz = null, acum = null, pending = null, confirmatInAfara = false, storage = null, now = Date.now() } = {}) {
    const ticker = ordin && typeof ordin.ticker === 'string' ? ordin.ticker : '', quantity = ordin ? Number(ordin.quantity) : NaN, stopPrice = ordin ? Number(ordin.stopPrice) : NaN;
    if (!ticker || !(fin(quantity) && quantity > 0) || !(fin(stopPrice) && stopPrice > 0)) return { ok: false, cod: 'invalid', mesaj: 'Cererea nu e completă (acțiune, stop sau cantitate lipsă).' + NETRIMIS };
    if (!poz || poz.ticker !== ticker || !(fin(poz.quantity) && poz.quantity > 0)) return { ok: false, cod: 'pozitie-necunoscuta', mesaj: 'Poziția ' + sym(ticker) + ' nu e în copia contului de pe acest aparat; sincronizează contul (Cont & sincronizare) înainte de ordin.' + NETRIMIS };
    if (quantity > poz.quantity * (1 + 1e-9)) return { ok: false, cod: 'cantitate', mesaj: 'Cantitatea cerută (' + FQ.format(quantity) + ') e peste poziția din copia contului (' + FQ.format(poz.quantity) + ' ' + sym(ticker) + ').' + NETRIMIS };
    const cur = fin(acum) && acum > 0 ? acum : fin(poz.currentPrice) && poz.currentPrice > 0 ? poz.currentPrice : null;
    if (!cur) return { ok: false, cod: 'pret-necunoscut', mesaj: 'Prețul de acum pentru ' + sym(ticker) + ' nu e cunoscut; nu pot verifica distanța stopului. Sincronizează contul.' + NETRIMIS };
    if (stopPrice >= cur) return { ok: false, cod: 'stop-peste-pret', mesaj: 'Stopul (' + F2.format(stopPrice) + ') e la sau peste prețul de acum (' + F2.format(cur) + '): s-ar vinde imediat. Pune-l sub preț.' + NETRIMIS };
    const pct = (1 - stopPrice / cur) * 100, inAfara = pct < COLLAR.minPct || pct > COLLAR.maxPct;
    const c = inCopie(pending, ticker);
    if (c) return { ok: false, cod: 'duplicat-copie', mesaj: 'În copia ordinelor există deja un ordin STOP de vânzare pe ' + sym(ticker) + (c.stopPrice ? ' (stop ' + F2.format(c.stopPrice) + ')' : '') + '. Nu pun un al doilea; dacă vrei alt stop, anulează-l întâi în Trading 212.' + NETRIMIS };
    const r = trimisRecent(storage, { ticker, quantity, stopPrice }, now);
    if (r) return { ok: false, cod: 'duplicat-recent', mesaj: 'Același ordin a plecat de pe acest aparat acum ' + Math.max(1, Math.round((now - Date.parse(r.la)) / 1000)) + ' s (' + ora(r.la) + '). Dacă n-ai primit confirmarea, verifică în Trading 212 (Ordine în așteptare) înainte să-l retrimiți.' + NETRIMIS };
    if (inAfara && !confirmatInAfara) return { ok: false, cod: 'collar', trebuieConfirmat: true, pct, mesaj: 'Stopul e la ' + F1.format(pct) + ' % sub prețul de acum (' + F2.format(cur) + '), în afara intervalului obișnuit 0,5–25 %' + (pct < COLLAR.minPct ? ' — atât de aproape, o oscilație obișnuită îl execută' : ' — atât de departe, probabil o cifră greșită') + '. Bifează confirmarea dacă e intenționat.' + NETRIMIS };
    return { ok: true, pct, inAfara, cur, copiaNecitita: c === null };
  }
  function mesaj(out) {
    const e = out && out.error, cur = out && out.currentPrice;
    switch (e) {
      case 'broker_permission_missing': return 'Cheia Trading 212 nu are voie să plaseze ordine. În Trading 212: Settings → API → cheia ta → bifează „Orders: Execute” (sau fă o cheie nouă cu ea), apoi pune-o din nou în Cont & sincronizare → Trading 212.' + NETRIMIS;
      case 'broker_credentials_invalid': case 'broker_credentials_required': return 'Cheia Trading 212 de pe acest dispozitiv nu mai e acceptată. Pune-o din nou în Cont & sincronizare → Trading 212.' + NETRIMIS;
      case 'quantity_exceeds_position': return 'În Trading 212 ai disponibile doar ' + (fin(out.owned) ? out.owned : '—') + ' acțiuni (restul pot fi blocate în alte ordine sau în Pies).' + NETRIMIS;
      case 'stop_not_below_price': return 'Stopul trebuie să fie sub prețul de acum din Trading 212' + (fin(cur) ? ' (' + F2.format(cur) + ')' : '') + ': altfel s-ar vinde imediat.' + NETRIMIS;
      case 'stop_too_far': return 'Stopul e sub jumătate din prețul de acum' + (fin(cur) ? ' (' + F2.format(cur) + ')' : '') + ' — probabil o cifră greșită.' + NETRIMIS;
      case 'sell_order_exists': return 'Ai deja o vânzare în așteptare pe acțiunea asta în Trading 212' + (fin(out.stopPrice) ? ' (stop ' + F2.format(out.stopPrice) + ')' : '') + '. Nu pun un al doilea ordin.' + NETRIMIS;
      case 'position_not_found': return 'Trading 212 nu mai arată poziția asta (poate a fost vândută).' + NETRIMIS;
      case 'rate_limited': return 'Limita Trading 212: încearcă din nou peste ' + (out.retryAfter || 60) + ' de secunde.' + NETRIMIS;
      case 'broker_rejected': return 'Trading 212 a refuzat ordinul' + (out.detail ? ': ' + out.detail : '') + '.' + NETRIMIS;
      case 'invalid_order': case 'invalid_body': return 'Cererea nu e completă (stop sau cantitate lipsă).' + NETRIMIS;
      case 'origin_forbidden': return 'Releul acceptă ordine doar din aplicația publicată.' + NETRIMIS;
      // un POST fără răspuns NU înseamnă că ordinul n-a plecat
      case 'broker_timeout': case 'broker_network_error': case 'retea': case 'broker_unavailable': return 'Nu am primit confirmarea de la Trading 212. Ordinul s-ar putea să fi plecat: verifică în aplicația Trading 212 (Ordine în așteptare) ÎNAINTE să încerci din nou.';
      case 'timeout': return 'Niciun răspuns în ' + Math.round(TIMEOUT_MS / 1000) + ' de secunde: nu știm dacă ordinul a ajuns. Verifică în aplicația Trading 212 (Ordine în așteptare) ÎNAINTE să încerci din nou; nu l-am retrimis.';
      default: return 'Ordinul nu a putut fi confirmat (' + (e || 'eroare') + '). Verifică în Trading 212 înainte să încerci din nou.';
    }
  }
  async function config() {
    const r = await fetch(new URL('../app/trading212-config.json', g.location.href), { cache: 'no-store' }); if (!r.ok) throw Error('Configurația releului nu se poate citi.');
    const c = await r.json(); if (!c || c.enabled !== true || c.directCredentials !== true || !/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.workers\.dev$/.test(c.endpoint || '')) throw Error('Releul Trading 212 nu e configurat pentru ordine.');
    return c;
  }
  /** 27.10.2026 (lotul 2, I-764): cheia CU ORDINE de pe acest aparat, dacă e pusă; altfel conexiunea salvată (o singură cheie, ca până acum) — aceeași alegere ca la „Oprește tot”. */
  async function cheie() {
    const V = g.T212Vault; if (!V) return null;
    let o = null; try { o = typeof V.readOrdine === 'function' ? await V.readOrdine() : null; } catch (_) { o = null; }
    return o || (await V.read());
  }
  /** Se poate trimite de pe acest dispozitiv? (releu configurat + conexiune salvată în seif). Permisiunea pe cheie se află abia la trimitere. */
  async function disponibil() {
    try { await config(); const v = await cheie(); if (!v) return { ok: false, motiv: 'Ca să pui stopul direct în Trading 212, salvează conexiunea pe acest dispozitiv (Cont & sincronizare → Trading 212 → „Ține minte conexiunea”).' }; return { ok: true, environment: v.environment }; }
    catch (e) { return { ok: false, motiv: (e && e.message) || 'Ordinele directe nu sunt disponibile.' }; }
  }
  /** Rezumatul din fereastra de confirmare: cantitatea întreagă a poziției, stopul și pierderea de la prețul de acum (moneda acțiunii + moneda contului). */
  /* 19.10.2026 (I-711): a doua sumă e în moneda CONTULUI (valoarea poziției din T212 e în moneda contului), nu „lei” mereu.
     `lei` rămâne numele câmpului (compatibilitate), `monedaCont` spune moneda; necunoscută ⇒ suma nu se afișează. */
  function rezumat(poz, stop, acum, monedaCont = null) {
    const qty = fin(poz && poz.quantity) && poz.quantity > 0 ? poz.quantity : null, cur = fin(acum) && acum > 0 ? acum : fin(poz && poz.currentPrice) && poz.currentPrice > 0 ? poz.currentPrice : null;
    if (!qty || !(fin(stop) && stop > 0)) return null;
    const pierdere = cur && stop < cur ? (cur - stop) * qty : null, lei = cur && stop < cur && fin(poz.value) && poz.value > 0 ? poz.value * (1 - stop / cur) : null;
    const mc = [monedaCont, poz && poz.currency].find((x) => typeof x === 'string' && /^[A-Z]{3}$/.test(x)) || null;
    return { ticker: poz.ticker, simbol: sym(poz.ticker), qty, stop, acum: cur, pierdere, lei: mc ? lei : null, monedaCont: mc, peste: !!(cur && stop >= cur) };
  }
  function confirmareHtml(r, moneda, esc, trimite) {
    if (!r) return '';
    const m = esc(moneda || '');
    return `<div class="stop-t212-confirm" role="alertdialog" aria-labelledby="t212c-${esc(r.simbol)}"><b id="t212c-${esc(r.simbol)}">Ordin REAL în Trading 212</b>` +
      `<p>Vinde <b>${FQ.format(r.qty)} ${esc(r.simbol)}</b> dacă prețul coboară la <b>${F2.format(r.stop)} ${m}</b> (ordin STOP, rămâne activ până îl anulezi).` +
      (r.pierdere != null ? ` Dacă se atinge, pierzi de la prețul de acum (${F2.format(r.acum)} ${m}) cam <b>${F2.format(r.pierdere)} ${m}</b>${r.lei != null && r.monedaCont ? ' ≈ <b>' + F0.format(r.lei) + ' ' + esc(r.monedaCont) + '</b>' : ''}.` : '') +
      (r.peste ? ' <em>Stopul e peste prețul de acum: Trading 212 l-ar executa imediat — releul îl va refuza.</em>' : '') +
      ` La o cădere bruscă (gap), vânzarea se poate face sub stop.</p>` +
      /* I-758: în afara collarului 0,5–25 % ordinul pleacă doar cu bifa; copia ordinelor necitită ⇒ se spune (dublura o verifică doar releul, la broker) */
      (r.collar && fin(r.collar.pct) ? `<label class="stop-t212-collar"><input type="checkbox" data-stop-t212-collar${trimite ? ' disabled' : ''}> Confirm: stopul e la <b>${F1.format(r.collar.pct)} %</b> sub prețul de acum, în afara intervalului obișnuit 0,5–25 % — e intenționat.</label>` : '') +
      (r.copiaNecitita ? `<p class="stop-t212-nota">Copia ordinelor nu e citită pe acest aparat: dublura se verifică doar la broker, prin releu.</p>` : '') +
      `<div class="stop-t212-btns"><button type="button" class="stop-t212-da" data-stop-t212-da${trimite ? ' disabled' : ''}>${trimite ? 'Se trimite…' : 'Da, trimite ordinul'}</button><button type="button" class="stop-t212-nu" data-stop-t212-nu${trimite ? ' disabled' : ''}>Renunță</button></div></div>`;
  }
  // refuzurile ferme ale releului: ordinul sigur NU a plecat ⇒ notarea din jurnalul trimiterilor se șterge (se poate reîncerca după corectare)
  const REFUZ_FERM = new Set(['broker_permission_missing', 'broker_credentials_invalid', 'broker_credentials_required', 'quantity_exceeds_position', 'stop_not_below_price', 'stop_too_far', 'sell_order_exists', 'position_not_found', 'rate_limited', 'broker_rejected', 'invalid_order', 'invalid_body', 'origin_forbidden']);
  /** Trimite ordinul. Întoarce { ok:true, data } sau { ok:false, error, mesaj }. O singură cerere, cu termen (I-711).
      I-758: `garda` = { poz, acum, pending, confirmatInAfara, storage } e OBLIGATORIE — fără ea nu pleacă nimic (închis la eroare). */
  async function pune({ ticker, quantity, stopPrice }, { timeoutMs = TIMEOUT_MS, garda = null, now = Date.now() } = {}) {
    if (!garda || typeof garda !== 'object') return { ok: false, error: 'garda-lipsa', mesaj: 'Controalele pre-ordin lipsesc (poziția din copia contului și copia ordinelor); nu trimit.' + NETRIMIS };
    const storage = garda.storage || g.localStorage || null, ordin = { ticker, quantity, stopPrice };
    const ver = verifica(ordin, { ...garda, storage, now });
    if (!ver.ok) return { ok: false, error: ver.cod, mesaj: ver.mesaj, verificare: ver };
    let c, v;
    try { c = await config(); v = await cheie(); } catch (e) { return { ok: false, error: 'config', mesaj: (e && e.message) || 'Configurația lipsește.' + NETRIMIS }; }
    if (!v) return { ok: false, error: 'fara-conexiune', mesaj: 'Conexiunea Trading 212 nu e salvată pe acest dispozitiv.' + NETRIMIS };
    noteazaTrimis(storage, ordin, now); // înainte de POST: un timeout urmat de o reîncercare în 2 minute e refuzat
    let r, expirat = false; const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const ceas = typeof setTimeout === 'function' ? setTimeout(() => { expirat = true; try { ctl && ctl.abort(); } catch (_) { /* fără anulare */ } }, timeoutMs) : null;
    let out = {};
    try {
      try {
        r = await fetch(c.endpoint + '/api/trading212/stop-order', { method: 'POST', cache: 'no-store', credentials: 'omit', redirect: 'error', signal: ctl ? ctl.signal : undefined,
          headers: { Authorization: 'Basic ' + btoa(v.key + ':' + v.secret), 'X-T212-Environment': v.environment, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker, quantity, stopPrice, confirm: CONFIRM }) });
      } catch (_) { return expirat ? { ok: false, error: 'timeout', mesaj: mesaj({ error: 'timeout' }) } : { ok: false, error: 'retea', mesaj: mesaj({ error: 'retea' }) }; }
      try { out = await r.json(); } catch (_) { out = { error: expirat ? 'timeout' : 'broker_unavailable' }; }
    } finally { if (ceas !== null) clearTimeout(ceas); }
    if (r.ok && out && out.source === 'Trading 212' && out.data && out.data.ticker === ticker) return { ok: true, data: out.data, environment: out.environment, verificare: ver };
    if (out && REFUZ_FERM.has(out.error)) scoateTrimis(storage, ordin, now);
    return { ok: false, error: out.error || 'necunoscut', mesaj: mesaj(out) };
  }
  g.T212Orders = { CONFIRM, TIMEOUT_MS, COLLAR, DUBLURA_MS, K_TRIMISE, disponibil, pune, rezumat, confirmareHtml, mesaj, verifica, noteazaTrimis, scoateTrimis, trimisRecent };
})(typeof window !== 'undefined' ? window : globalThis);
