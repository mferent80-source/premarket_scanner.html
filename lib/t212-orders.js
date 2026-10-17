/* 18.10.2026 (Marius, „fă tot”) — ordinul de stop REAL în Trading 212, din fereastra „Pune stopul acum” de pe Astăzi.
   Releul (tools/trading212-worker.mjs, ruta /api/trading212/stop-order) e singura scriere și verifică din nou totul pe server: doar VÂNZARE,
   cel mult cât deții, stopul sub prețul de acum și nu sub jumătatea lui, fără a doua vânzare în așteptare pe aceeași acțiune.
   Cheia vine din seiful conexiunii de pe acest dispozitiv (T212Vault). Fără permisiunea „Orders: Execute” pe cheie, Trading 212 refuză
   și pagina spune exact ce lipsește. Fiecare ordin pleacă doar după confirmarea din pagină. */
(function (g) {
  'use strict';
  const fin = Number.isFinite, CONFIRM = 'PUN-STOPUL';
  const F2 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), F0 = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }), FQ = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 8 });
  const sym = (t) => String(t || '').replace(/_US_EQ$|_[A-Z]{2}_EQ$|_EQ$/, '');
  const NETRIMIS = ' Ordinul NU a fost trimis.';
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
      default: return 'Ordinul nu a putut fi confirmat (' + (e || 'eroare') + '). Verifică în Trading 212 înainte să încerci din nou.';
    }
  }
  async function config() {
    const r = await fetch(new URL('../app/trading212-config.json', g.location.href), { cache: 'no-store' }); if (!r.ok) throw Error('Configurația releului nu se poate citi.');
    const c = await r.json(); if (!c || c.enabled !== true || c.directCredentials !== true || !/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.workers\.dev$/.test(c.endpoint || '')) throw Error('Releul Trading 212 nu e configurat pentru ordine.');
    return c;
  }
  /** Se poate trimite de pe acest dispozitiv? (releu configurat + conexiune salvată în seif). Permisiunea pe cheie se află abia la trimitere. */
  async function disponibil() {
    try { await config(); const v = g.T212Vault ? await g.T212Vault.read() : null; if (!v) return { ok: false, motiv: 'Ca să pui stopul direct în Trading 212, salvează conexiunea pe acest dispozitiv (Cont & sincronizare → Trading 212 → „Ține minte conexiunea”).' }; return { ok: true, environment: v.environment }; }
    catch (e) { return { ok: false, motiv: (e && e.message) || 'Ordinele directe nu sunt disponibile.' }; }
  }
  /** Rezumatul din fereastra de confirmare: cantitatea întreagă a poziției, stopul și pierderea de la prețul de acum (moneda acțiunii + lei). */
  function rezumat(poz, stop, acum) {
    const qty = fin(poz && poz.quantity) && poz.quantity > 0 ? poz.quantity : null, cur = fin(acum) && acum > 0 ? acum : fin(poz && poz.currentPrice) && poz.currentPrice > 0 ? poz.currentPrice : null;
    if (!qty || !(fin(stop) && stop > 0)) return null;
    const pierdere = cur && stop < cur ? (cur - stop) * qty : null, lei = cur && stop < cur && fin(poz.value) && poz.value > 0 ? poz.value * (1 - stop / cur) : null;
    return { ticker: poz.ticker, simbol: sym(poz.ticker), qty, stop, acum: cur, pierdere, lei, peste: !!(cur && stop >= cur) };
  }
  function confirmareHtml(r, moneda, esc, trimite) {
    if (!r) return '';
    const m = esc(moneda || '');
    return `<div class="stop-t212-confirm" role="alertdialog" aria-labelledby="t212c-${esc(r.simbol)}"><b id="t212c-${esc(r.simbol)}">Ordin REAL în Trading 212</b>` +
      `<p>Vinde <b>${FQ.format(r.qty)} ${esc(r.simbol)}</b> dacă prețul coboară la <b>${F2.format(r.stop)} ${m}</b> (ordin STOP, rămâne activ până îl anulezi).` +
      (r.pierdere != null ? ` Dacă se atinge, pierzi de la prețul de acum (${F2.format(r.acum)} ${m}) cam <b>${F2.format(r.pierdere)} ${m}</b>${r.lei != null ? ' ≈ <b>' + F0.format(r.lei) + ' lei</b>' : ''}.` : '') +
      (r.peste ? ' <em>Stopul e peste prețul de acum: Trading 212 l-ar executa imediat — releul îl va refuza.</em>' : '') +
      ` La o cădere bruscă (gap), vânzarea se poate face sub stop.</p>` +
      `<div class="stop-t212-btns"><button type="button" class="stop-t212-da" data-stop-t212-da${trimite ? ' disabled' : ''}>${trimite ? 'Se trimite…' : 'Da, trimite ordinul'}</button><button type="button" class="stop-t212-nu" data-stop-t212-nu${trimite ? ' disabled' : ''}>Renunță</button></div></div>`;
  }
  /** Trimite ordinul. Întoarce { ok:true, data } sau { ok:false, error, mesaj }. */
  async function pune({ ticker, quantity, stopPrice }) {
    let c, v;
    try { c = await config(); v = g.T212Vault ? await g.T212Vault.read() : null; } catch (e) { return { ok: false, error: 'config', mesaj: (e && e.message) || 'Configurația lipsește.' + NETRIMIS }; }
    if (!v) return { ok: false, error: 'fara-conexiune', mesaj: 'Conexiunea Trading 212 nu e salvată pe acest dispozitiv.' + NETRIMIS };
    let r;
    try {
      r = await fetch(c.endpoint + '/api/trading212/stop-order', { method: 'POST', cache: 'no-store', credentials: 'omit', redirect: 'error',
        headers: { Authorization: 'Basic ' + btoa(v.key + ':' + v.secret), 'X-T212-Environment': v.environment, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, quantity, stopPrice, confirm: CONFIRM }) });
    } catch (_) { return { ok: false, error: 'retea', mesaj: mesaj({ error: 'retea' }) }; }
    let out = {}; try { out = await r.json(); } catch (_) { out = { error: 'broker_unavailable' }; }
    if (r.ok && out && out.source === 'Trading 212' && out.data && out.data.ticker === ticker) return { ok: true, data: out.data, environment: out.environment };
    return { ok: false, error: out.error || 'necunoscut', mesaj: mesaj(out) };
  }
  g.T212Orders = { CONFIRM, disponibil, pune, rezumat, confirmareHtml, mesaj };
})(typeof window !== 'undefined' ? window : globalThis);
