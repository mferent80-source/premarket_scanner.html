/* 27.10.2026 (I-757) — kill switch-ul: „Oprește tot” din pagina contului. Anulează TOATE ordinele în așteptare din Trading 212 prin releu
   (POST /api/trading212/orders/cancel-all, confirmarea OPRESC-TOT), scrie starea de oprire în tt_governor_oprire_v1 (Governor ⇒ HALTED cât e activ;
   re-armarea o face DOAR Governor, cu motiv — lotul C) și emite evenimentul `tt-oprire` pe window (Astăzi, Planuri reîmprospătează).
   Închis la eroare: oprirea se scrie ÎNAINTE de orice apel; dacă releul nu răspunde sau refuză, starea rămâne „OPRIT”, ordinele neanulate sunt la
   vedere și textul spune să le anulezi din aplicația Trading 212. Cheia folosită e cea CU ordine din seif (I-764); fără ea, conexiunea salvată.
   Procedura „când apăs” și proba lunară pe demo: docs/politica-adaugiri-E.md (⇒ politica de risc). */
(function (g) {
  'use strict';
  const KEY = 'tt_governor_oprire_v1', EVENT = 'tt-oprire', CONFIRM = 'OPRESC-TOT', TIMEOUT_MS = 25000, fin = Number.isFinite;
  const F2 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sym = (t) => String(t || '').replace(/_US_EQ$|_[A-Z]{2}_EQ$|_EQ$/, '');
  function aparat() { const ua = (g.navigator && g.navigator.userAgent) || ''; return /Android|iPhone|iPad|Mobile/i.test(ua) ? 'telefon' : /Windows/i.test(ua) ? 'PC' : ua ? 'alt aparat' : 'test'; }
  function storage() { return g.localStorage; }
  function mesaj(out) {
    const e = out && out.error;
    switch (e) {
      case 'broker_permission_missing': return 'Cheia Trading 212 de pe acest aparat nu are voie să anuleze ordine: în Trading 212 → Settings → API → bifează „Orders: Execute” pe cheia cu ordine și pune-o aici. Până atunci anulează ordinele manual, din aplicația Trading 212.';
      case 'broker_credentials_invalid': case 'broker_credentials_required': return 'Cheia Trading 212 de pe acest aparat nu mai e acceptată. Anulează ordinele manual, din aplicația Trading 212, și pune cheia din nou.';
      case 'rate_limited': return 'Limita Trading 212: încearcă din nou peste ' + (out.retryAfter || 60) + ' de secunde sau anulează ordinele manual, din aplicația Trading 212.';
      case 'order_not_found': return 'Ordinul nu mai există la Trading 212 (executat sau anulat deja).';
      case 'origin_forbidden': return 'Releul acceptă anulări doar din aplicația publicată.';
      case 'fara-conexiune': return 'Nicio conexiune Trading 212 salvată pe acest aparat: ordinele NU au fost anulate. Anulează-le manual, din aplicația Trading 212.';
      case 'timeout': case 'retea': case 'broker_timeout': case 'broker_network_error': case 'broker_unavailable': return 'Nu am primit confirmarea de la Trading 212: anulările sunt neconfirmate. Deschide aplicația Trading 212 și anulează manual ordinele rămase în așteptare.';
      default: return 'Anularea nu a putut fi confirmată (' + (e || 'eroare') + '). Verifică și anulează manual, din aplicația Trading 212.';
    }
  }
  async function config() {
    const r = await g.fetch(new URL('../app/trading212-config.json', g.location.href), { cache: 'no-store' }); if (!r.ok) throw Error('Configurația releului nu se poate citi.');
    const c = await r.json(); if (!c || c.enabled !== true || c.directCredentials !== true || !/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.workers\.dev$/.test(c.endpoint || '')) throw Error('Releul Trading 212 nu e configurat pentru ordine.');
    return c;
  }
  /** Cheia cu ordine (I-764) sau, dacă lipsește, conexiunea salvată (o singură cheie, ca până acum). */
  async function cheie() {
    const V = g.T212Vault; if (!V) return null;
    let o = null; try { o = V.readOrdine ? await V.readOrdine() : null; } catch (_) { o = null; }
    if (o) return o;
    try { return await V.read(); } catch (_) { return null; }
  }
  async function cerere(path, { method, body }) {
    let c, v;
    try { c = await config(); } catch (e) { return { ok: false, error: 'config', mesaj: (e && e.message) || 'Configurația lipsește.' }; }
    v = await cheie(); if (!v) return { ok: false, error: 'fara-conexiune', mesaj: mesaj({ error: 'fara-conexiune' }) };
    let r, expirat = false; const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const ceas = typeof setTimeout === 'function' ? setTimeout(() => { expirat = true; try { ctl && ctl.abort(); } catch (_) { /* fără anulare */ } }, TIMEOUT_MS) : null;
    let out = {};
    try {
      try {
        r = await g.fetch(c.endpoint + path, { method, cache: 'no-store', credentials: 'omit', redirect: 'error', signal: ctl ? ctl.signal : undefined,
          headers: { Authorization: 'Basic ' + btoa(v.key + ':' + v.secret), 'X-T212-Environment': v.environment, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      } catch (e) { return { ok: false, error: expirat ? 'timeout' : 'retea', mesaj: mesaj({ error: expirat ? 'timeout' : 'retea' }) + ' (' + ((e && e.message) || 'rețea') + ')' }; }
      try { out = await r.json(); } catch (_) { out = { error: expirat ? 'timeout' : 'broker_unavailable' }; }
    } finally { if (ceas !== null) clearTimeout(ceas); }
    if (r.ok && out && out.source === 'Trading 212' && out.data) return { ok: true, data: out.data, environment: out.environment };
    return { ok: false, error: out.error || 'necunoscut', mesaj: mesaj(out), retryAfter: out.retryAfter };
  }
  /** Starea cheii, validată; null când lipsește sau e stricată. */
  function citeste(s = storage()) {
    try { const v = JSON.parse(s.getItem(KEY) || 'null'); if (!v || typeof v !== 'object' || typeof v.activ !== 'boolean' || !fin(Date.parse(v.la))) return null; return { ...v, ordineAnulate: Array.isArray(v.ordineAnulate) ? v.ordineAnulate : [] }; } catch (_) { return null; }
  }
  /** Forma contractului tt_governor_oprire_v1 din plan (+ esuate / complet / eroare, informative). */
  function stare({ motiv, aparat: ap, la, ordineAnulate = [], esuate = [], complet = true, eroare = null, activ = true } = {}) {
    return { activ, la, motiv: String(motiv || 'fără motiv scris').slice(0, 200), aparat: ap, ordineAnulate: ordineAnulate.map((o) => ({ id: o.id ?? null, ticker: o.ticker ?? null, stopPrice: fin(o.stopPrice) ? o.stopPrice : null })), rearmatLa: null, rearmatMotiv: null, esuate: esuate.map((o) => ({ id: o.id ?? null, ticker: o.ticker ?? null, stopPrice: fin(o.stopPrice) ? o.stopPrice : null, error: o.error || null })), complet: !!complet, eroare: eroare ? String(eroare).slice(0, 200) : null };
  }
  /** Scrie starea și emite `tt-oprire` cu EXACT ce s-a scris (o copie: un ascultător care o modifică nu atinge ce întoarce opreste). */
  function scrie(s, st) {
    const t = JSON.stringify(st), detail = JSON.parse(t);
    s.setItem(KEY, t);
    try { g.dispatchEvent(new CustomEvent(EVENT, { detail })); } catch (_) { /* fără evenimente în medii fără window */ }
    return JSON.parse(t);
  }
  /** „Oprește tot”: scrie oprirea, anulează ordinele prin releu, scrie rezultatul, emite evenimentul. */
  async function opreste({ motiv, storage: s = storage(), now = Date.now() } = {}) {
    const la = new Date(now).toISOString(), ap = aparat();
    let st = stare({ motiv, aparat: ap, la, complet: false, eroare: 'în curs' });
    s.setItem(KEY, JSON.stringify(st)); // întâi oprirea — orice s-ar întâmpla cu releul, Governor rămâne HALTED
    const r = await cerere('/api/trading212/orders/cancel-all', { method: 'POST', body: { confirm: CONFIRM } });
    if (r.ok) {
      const d = r.data, anulate = Array.isArray(d.anulate) ? d.anulate : [], esuate = Array.isArray(d.esuate) ? d.esuate : [], complet = d.complet === true && esuate.length === 0;
      st = scrie(s, stare({ motiv, aparat: ap, la, ordineAnulate: anulate, esuate, complet, eroare: complet ? null : 'unele ordine nu s-au putut anula' }));
      return complet ? { ok: true, stare: st, mesaj: anulate.length ? anulate.length + ' ordine anulate în Trading 212.' : 'Niciun ordin în așteptare de anulat. Oprirea e scrisă.' }
        : { ok: false, stare: st, mesaj: 'Oprirea e scrisă, dar ' + esuate.length + ' ordine nu s-au putut anula (' + esuate.map((o) => sym(o.ticker)).join(', ') + '). Anulează-le manual, din aplicația Trading 212.' };
    }
    st = scrie(s, stare({ motiv, aparat: ap, la, complet: false, eroare: r.error === 'fara-conexiune' ? 'nicio conexiune Trading 212 pe acest aparat' : r.mesaj }));
    return { ok: false, stare: st, mesaj: r.mesaj, error: r.error };
  }
  /** Anulează un singur ordin (id numeric din ordinele în așteptare). */
  async function anuleazaOrdin(id) {
    if (!/^\d{1,20}$/.test(String(id || ''))) return { ok: false, error: 'invalid_id', mesaj: 'Ordinul nu are un id valid; anulează-l din aplicația Trading 212.' };
    const r = await cerere('/api/trading212/orders/' + id, { method: 'DELETE' });
    return r.ok ? { ok: true, data: r.data, mesaj: 'Ordinul ' + id + ' a fost anulat.' } : r;
  }
  function text(st) {
    if (!st) return 'Nu e oprit.';
    const la = new Date(st.la).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    if (!st.activ) return 'Nu e oprit — re-armat' + (st.rearmatLa ? ' la ' + new Date(st.rearmatLa).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '') + (st.rearmatMotiv ? ' (' + st.rearmatMotiv + ')' : '') + '. Ultima oprire: ' + la + ', ' + st.motiv + '.';
    const n = st.ordineAnulate.length, lista = n ? ' (' + st.ordineAnulate.map((o) => sym(o.ticker) + (fin(o.stopPrice) ? ' @ ' + F2.format(o.stopPrice) : '')).join(', ') + ')' : '';
    const rest = st.complet === false ? ' · ' + (st.esuate && st.esuate.length ? st.esuate.length + ' ordine nu s-au putut anula (' + st.esuate.map((o) => sym(o.ticker)).join(', ') + ') — anulează-le din aplicația Trading 212' : 'anulările sunt neconfirmate' + (st.eroare ? ': ' + st.eroare : '') + ' — verifică în aplicația Trading 212') : '';
    return 'OPRIT din ' + la + ' (' + st.aparat + ') · motiv: ' + st.motiv + ' · ' + n + (n === 1 ? ' ordin anulat' : ' ordine anulate') + lista + rest + '. Planurile noi stau pe loc până la re-armare din Governor (Jurnal → Risc & capital), cu motiv scris.';
  }
  g.TTOprire = { KEY, EVENT, CONFIRM, TIMEOUT_MS, citeste, stare, opreste, anuleazaOrdin, text, mesaj, aparat };
})(typeof window !== 'undefined' ? window : globalThis);
