/* 27.10.2026 (I-759, partea client) — reconcilierea aplicație ↔ Trading 212 după fiecare citire completă a brokerului din pagina contului
   (RTS 6 art. 17(3) / FINRA 15-09: „position / cash break”). Trei verificări:
   · poziții — jurnalul execuțiilor când e parcurs integral (+ ajustările acceptate de tine: split, transfer), altfel BAZA (ultima stare reconciliată
     curat) + execuțiile de după ea; fără jurnal sau fără bază ⇒ „neverificat”, nu diferențe inventate;
   · numerar — sumarul trebuie să se închidă (numerar + rezervat + în Pies + valoarea pozițiilor ≈ valoarea contului, toleranță 0,5 %), iar numerarul
     bazei nu se schimbă fără execuție, dividend sau mișcare de bani după ea;
   · ordine — STOP-ul trimis din aplicație trebuie să fie la broker (sau explicat de o vânzare ori de o anulare din aplicație); nicio vânzare în
     așteptare fără poziție.
   Rezultatul (contract: lotul C ⇒ CAUTION cât ok=false, cu lista; lotul A ⇒ Health): tt_reconciliere_v1 = {la, scope, ok, diferente:[{tip, ticker,
   app, broker, text, cheie}], verificat, deConfirmat, acceptat?}. O diferență care poate veni dintr-o execuție încă necitită (jurnalul recitit
   ÎNAINTEA citirii brokerului) stă la „deConfirmat” până la prima recitire a jurnalului de după ea sau 15 minute — apoi intră la diferențe. Cele din
   aceeași citire a brokerului (sumarul care nu se închide) sunt diferențe pe loc.
   Baza (tt_reconciliere_baza_v1, pe cont) înaintează doar după o reconciliere curată sau după „Am verificat — acceptă” cu motiv scris.
   Cifrele de bani se arată cu o zecimală, prețurile la ban, cantitățile exact; valorile salvate rămân exacte. Pur: nimic din rețea aici. */
(function (g) {
  'use strict';
  const KEY = 'tt_reconciliere_v1', BAZA = 'tt_reconciliere_baza_v1', fin = Number.isFinite, EPS = 1e-6;
  const TOL_SUMAR = 0.005, TOL_NUMERAR = 0.001, TIMING_MS = 15 * 60000, ANULATE_MS = 7 * 86400000, TOLERANTA_EXECUTIE_MS = 60000;
  const F1 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const F2 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const FQ = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 8 });
  const sym = (t) => String(t || '').replace(/_US_EQ$|_[A-Z]{2}_EQ$|_EQ$/, '');
  const r8 = (v) => Math.round(v * 1e8) / 1e8, ban = (v) => Math.round(v * 100) / 100;
  const ts = (v) => { const t = typeof v === 'number' ? v : Date.parse(v); return fin(t) ? t : null; };
  const ora = (t) => { const v = ts(t); return v === null ? '—' : new Date(v).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };
  const obiect = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  function cantitati(positions) {
    const m = new Map();
    for (const p of positions || []) if (p && typeof p.ticker === 'string' && p.ticker && fin(p.quantity)) m.set(p.ticker, (m.get(p.ticker) || 0) + p.quantity);
    return m;
  }
  /** Execuțiile utilizabile (BUY / SELL cu cantitate și dată); vânzarea scade. */
  function executii(items) { return (items || []).filter((f) => f && typeof f.ticker === 'string' && (f.side === 'BUY' || f.side === 'SELL') && fin(f.quantity) && f.quantity !== 0 && ts(f.date) !== null); }
  const semn = (f) => (f.side === 'SELL' ? -Math.abs(f.quantity) : Math.abs(f.quantity));
  /** Numerarul total (disponibil + rezervat pentru ordine + în Pies); null fără disponibil. */
  const numerar = (s) => (obiect(s) && fin(s.available) ? s.available + (fin(s.reserved) ? s.reserved : 0) + (fin(s.inPies) ? s.inPies : 0) : null);
  function miscari(cash) {
    const out = [];
    for (const k of ['dividends', 'transactions']) for (const x of (cash && cash[k] && Array.isArray(cash[k].items) ? cash[k].items : [])) { const t = x ? ts(x.date) : null; if (t !== null) out.push(t); }
    return out;
  }

  /** Comparația pură: copiile aplicației vs ce tocmai a spus Trading 212. Toate diferențele, fără stare între citiri. */
  function compara({ scope, broker = {}, copii = {}, now = Date.now() } = {}) {
    const dif = [], verificat = { pozitii: 'fara', numerar: false, ordine: false };
    const b = obiect(broker) ? broker : {}, c = obiect(copii) ? copii : {};
    const bp = Array.isArray(b.positions) ? b.positions : null, bq = bp ? cantitati(bp) : null;
    const jurnal = obiect(c.fills) && Array.isArray(c.fills.items) ? c.fills : null, fills = jurnal ? executii(jurnal.items) : [];
    const snap = obiect(c.snapshot) && Array.isArray(c.snapshot.positions) && ts(c.snapshot.fetchedAt) !== null ? c.snapshot : null, snapAt = snap ? ts(snap.fetchedAt) : null;
    const aj = obiect(c.ajustari) ? c.ajustari : {};
    // 1. Pozițiile
    if (bq && jurnal && jurnal.complete === true) {
      verificat.pozitii = 'jurnal';
      const net = new Map();
      for (const x of fills) net.set(x.ticker, (net.get(x.ticker) || 0) + semn(x));
      const cuExecutii = new Set(net.keys());
      for (const [t, d] of Object.entries(aj)) if (fin(d)) net.set(t, (net.get(t) || 0) + d);
      for (const t of [...new Set([...net.keys(), ...bq.keys()])].sort()) {
        const a = r8(net.get(t) || 0), q = r8(bq.get(t) || 0);
        if (Math.abs(a - q) <= EPS) continue;
        dif.push({ tip: 'pozitie', ticker: t, app: a, broker: q, cheie: 'pozitie:' + t, sigur: false,
          text: q <= EPS ? `${sym(t)}: jurnalul execuțiilor dă ${FQ.format(a)} acțiuni, Trading 212 nu mai are poziția (o vânzare sau un transfer lipsește din jurnal?).`
            : !cuExecutii.has(t) && !fin(aj[t]) ? `${sym(t)}: Trading 212 are ${FQ.format(q)} acțiuni, dar jurnalul nu are nicio execuție pe ea (transfer, split sau execuție lipsă?).`
              : `${sym(t)}: jurnalul execuțiilor dă ${FQ.format(a)} acțiuni, Trading 212 are ${FQ.format(q)} (split, transfer sau execuție lipsă?).` });
      }
    } else if (bq && snap && jurnal) {
      verificat.pozitii = 'copie';
      const sq = cantitati(snap.positions), delta = new Map();
      for (const x of fills) if (ts(x.date) > snapAt) delta.set(x.ticker, (delta.get(x.ticker) || 0) + semn(x));
      for (const t of [...new Set([...sq.keys(), ...bq.keys(), ...delta.keys()])].sort()) {
        const s0 = r8(sq.get(t) || 0), asteptat = r8(s0 + (delta.get(t) || 0)), q = r8(bq.get(t) || 0);
        if (Math.abs(asteptat - q) <= EPS) continue;
        dif.push({ tip: 'pozitie', ticker: t, app: s0, broker: q, cheie: 'pozitie:' + t, sigur: false,
          text: `${sym(t)}: copia reconciliată din ${ora(snapAt)} avea ${FQ.format(s0)} acțiuni${delta.has(t) ? `, cu execuțiile de după ar fi ${FQ.format(asteptat)}` : ''}; Trading 212 are ${FQ.format(q)} și nicio execuție cunoscută nu explică diferența.` });
      }
    }
    // 2. Numerarul
    const s = obiect(b.summary) ? b.summary : null, cur = s && typeof s.currency === 'string' ? ' ' + s.currency : '';
    if (s && bp && fin(s.totalValue) && fin(s.available) && bp.every((p) => p && fin(p.value) && (!p.currency || !s.currency || p.currency === s.currency))) {
      verificat.numerar = true;
      const val = bp.reduce((a, p) => a + p.value, 0), app = numerar(s) + val, d = s.totalValue - app - (fin(c.abatereSumar) ? c.abatereSumar : 0);
      if (Math.abs(d) > Math.max(1, TOL_SUMAR * Math.abs(s.totalValue)))
        dif.push({ tip: 'numerar', ticker: null, app: ban(app), broker: s.totalValue, cheie: 'numerar:sumar', sigur: true,
          text: `Sumarul Trading 212 nu se închide: numerar ${F1.format(numerar(s))} + pozițiile ${F1.format(val)} = ${F1.format(app)}${cur}, iar valoarea contului e ${F1.format(s.totalValue)}${cur} (diferență ${F1.format(Math.abs(s.totalValue - app))}).` });
    }
    const c0 = snap ? numerar(snap.summary) : null, c1 = s ? numerar(s) : null;
    if (c0 !== null && c1 !== null && jurnal && (!snap.summary.currency || !s.currency || snap.summary.currency === s.currency)
      && Math.abs(c1 - c0) > Math.max(1, TOL_NUMERAR * Math.abs(fin(s.totalValue) ? s.totalValue : c1))
      && !fills.some((x) => ts(x.date) > snapAt) && !miscari(c.cash).some((t) => t > snapAt))
      dif.push({ tip: 'numerar', ticker: null, app: ban(c0), broker: ban(c1), cheie: 'numerar:copie', sigur: false,
        text: `Numerarul s-a schimbat de la ${F1.format(c0)} la ${F1.format(c1)}${cur} fără execuție, dividend sau mișcare de bani cunoscută după copia reconciliată din ${ora(snapAt)}.` });
    // 3. Ordinele
    const bo = Array.isArray(b.orders) ? b.orders : null, co = obiect(c.ordine) && Array.isArray(c.ordine.items) ? c.ordine : null, anulate = new Set((c.anulate || []).map(String));
    if (bo && co) {
      verificat.ordine = true;
      for (const o of co.items) {
        if (!o || !o.trimisDinApp || typeof o.ticker !== 'string') continue;
        const id = o.id != null && o.id !== '' ? String(o.id) : null;
        const laBroker = bo.some((x) => x && (id && x.id != null ? String(x.id) === id : x.ticker === o.ticker && fin(o.stopPrice) && fin(x.stopPrice) && Math.abs(x.stopPrice - o.stopPrice) < 1e-6));
        if (laBroker || (id && anulate.has(id))) continue;
        const dela = ts(o.la) ?? ts(co.fetchedAt) ?? 0;
        if (fills.some((x) => x.ticker === o.ticker && x.side === 'SELL' && ts(x.date) >= dela - TOLERANTA_EXECUTIE_MS)) continue; // stopul s-a executat
        dif.push({ tip: 'ordin', ticker: o.ticker, app: fin(o.stopPrice) ? o.stopPrice : null, broker: null, cheie: 'ordin:app:' + (id || o.ticker + '@' + o.stopPrice), sigur: false,
          text: `${sym(o.ticker)}: ordinul STOP de vânzare trimis din aplicație${fin(o.stopPrice) ? ' (' + F2.format(o.stopPrice) + ')' : ''} nu e la Trading 212 și nicio vânzare sau anulare din aplicație nu-l explică — verifică în aplicația Trading 212.` });
      }
    }
    if (bo && bq) for (const x of bo) {
      if (!x || typeof x.ticker !== 'string' || x.side !== 'SELL' || (bq.get(x.ticker) || 0) > EPS) continue;
      const pret = fin(x.stopPrice) ? x.stopPrice : fin(x.limitPrice) ? x.limitPrice : null;
      dif.push({ tip: 'ordin', ticker: x.ticker, app: null, broker: pret, cheie: 'ordin:fara-pozitie:' + (x.id != null ? x.id : x.ticker + '@' + pret), sigur: false,
        text: `${sym(x.ticker)}: ordin de vânzare în așteptare la Trading 212 fără poziție${pret !== null ? ' (' + F2.format(pret) + ')' : ''} — un ordin rămas? Anulează-l din aplicația Trading 212 sau din „Oprește tot”.` });
    }
    // JSON curat: exact forma care se scrie în cheie (fără undefined / NaN)
    return JSON.parse(JSON.stringify({ la: new Date(now).toISOString(), scope: String(scope || ''), ok: dif.length === 0, diferente: dif, verificat }));
  }

  // localStorage sau un Map (get/set) — testele și alte pagini pot da oricare
  const ia = (s, k) => (typeof s.getItem === 'function' ? s.getItem(k) : s.get(k)), pune = (s, k, v) => (typeof s.setItem === 'function' ? s.setItem(k, v) : s.set(k, v));
  function citeste(storage = g.localStorage) {
    try { const r = JSON.parse(ia(storage, KEY) || 'null'); return obiect(r) && typeof r.ok === 'boolean' && ts(r.la) !== null && Array.isArray(r.diferente) ? r : null; } catch (_) { return null; }
  }
  function salveaza(storage, r) { pune(storage, KEY, JSON.stringify(r)); return r; }
  const goala = () => ({ snapshot: null, ordineApp: [], ajustari: {}, abatereSumar: null, vazute: {}, anulate: [], ultima: null, acceptat: null });
  function citesteBaza(storage, scope) {
    try {
      const d = JSON.parse(storage.getItem(BAZA) || '{}'), x = obiect(d) ? d[scope] : null;
      if (!obiect(x)) return null;
      return { snapshot: obiect(x.snapshot) ? x.snapshot : null, ordineApp: Array.isArray(x.ordineApp) ? x.ordineApp : [], ajustari: obiect(x.ajustari) ? x.ajustari : {}, abatereSumar: fin(x.abatereSumar) ? x.abatereSumar : null,
        vazute: obiect(x.vazute) ? x.vazute : {}, anulate: Array.isArray(x.anulate) ? x.anulate : [], ultima: obiect(x.ultima) ? x.ultima : null, acceptat: obiect(x.acceptat) ? x.acceptat : null };
    } catch (_) { return null; }
  }
  function scrieBaza(storage, scope, x) {
    let d = {}; try { d = JSON.parse(storage.getItem(BAZA) || '{}'); if (!obiect(d)) d = {}; } catch (_) { d = {}; }
    d[scope] = x; storage.setItem(BAZA, JSON.stringify(d));
  }
  const stareBroker = (broker) => ({ summary: obiect(broker.summary) ? broker.summary : null, positions: (Array.isArray(broker.positions) ? broker.positions : []).filter((p) => p && typeof p.ticker === 'string').map((p) => ({ ticker: p.ticker, quantity: p.quantity })), fetchedAt: broker.la });

  /** Reconcilierea cu stare, chemată de pagina contului după fiecare citire completă (sumar + poziții). Scrie tt_reconciliere_v1 și baza. */
  function ruleaza({ storage = g.localStorage, scope, broker = {}, fills = null, cash = null, ordineCopie = null, now = Date.now() } = {}) {
    if (!scope || !storage || !obiect(broker)) return null;
    const x = citesteBaza(storage, scope) || goala(), brokerAt = ts(broker.la) ?? now;
    x.anulate = x.anulate.filter((a) => a && now - (ts(a.la) ?? 0) < ANULATE_MS);
    // STOP-urile trimise din aplicație intră în urmărire (copia ordinelor e rescrisă la fiecare citire: fără asta, un ordin respins după trimitere s-ar pierde)
    for (const o of (obiect(ordineCopie) && Array.isArray(ordineCopie.items) ? ordineCopie.items : [])) {
      if (!o || !o.trimisDinApp || typeof o.ticker !== 'string') continue;
      const id = o.id != null && o.id !== '' ? String(o.id) : null;
      if (!x.ordineApp.some((v) => (id && v.id != null ? String(v.id) === id : v.ticker === o.ticker && v.stopPrice === o.stopPrice)))
        x.ordineApp.push({ id, ticker: o.ticker, type: o.type || 'STOP', side: 'SELL', quantity: fin(o.quantity) ? o.quantity : null, stopPrice: fin(o.stopPrice) ? o.stopPrice : null, trimisDinApp: true, la: ordineCopie.fetchedAt || new Date(now).toISOString() });
    }
    const r = compara({ scope, broker, copii: { snapshot: x.snapshot, fills, ordine: { items: x.ordineApp, fetchedAt: new Date(now).toISOString() }, cash, ajustari: x.ajustari, abatereSumar: x.abatereSumar, anulate: x.anulate.map((a) => a.id) }, now });
    const h = obiect(fills) ? ts(fills.fetchedAt) : null, vazute = {}, confirmate = [], deConfirmat = [];
    for (const d of r.diferente) {
      const prima = fin(x.vazute[d.cheie]) ? x.vazute[d.cheie] : brokerAt; vazute[d.cheie] = prima;
      (d.sigur || (h !== null && h > prima) || now - prima >= TIMING_MS ? confirmate : deConfirmat).push(d);
    }
    const out = { ...r, ok: confirmate.length === 0, diferente: confirmate, deConfirmat, ...(x.acceptat ? { acceptat: x.acceptat } : {}) };
    salveaza(storage, out);
    x.ultima = stareBroker(broker); x.vazute = vazute;
    if (!r.diferente.some((d) => d.tip === 'pozitie' || d.tip === 'numerar')) x.snapshot = stareBroker(broker); // baza înaintează doar curată
    const ramase = new Set(r.diferente.filter((d) => d.tip === 'ordin').map((d) => d.cheie));
    x.ordineApp = x.ordineApp.filter((o) => ramase.has('ordin:app:' + (o.id != null ? String(o.id) : o.ticker + '@' + o.stopPrice)));
    scrieBaza(storage, scope, x);
    return JSON.parse(JSON.stringify(out));
  }

  /** „Am verificat în Trading 212 — acceptă”: cu motiv scris, starea brokerului devine baza; în jurnalul complet diferența rămâne ca ajustare. */
  function accepta({ storage = g.localStorage, scope, motiv, now = Date.now() } = {}) {
    const m = String(motiv || '').trim();
    if (m.length < 3) return { ok: false, mesaj: 'Scrie pe scurt ce ai verificat în Trading 212 (cel puțin 3 caractere).' };
    const x = scope ? citesteBaza(storage, scope) : null, r = citeste(storage);
    if (!x || !x.ultima || !r || r.scope !== scope) return { ok: false, mesaj: 'Nicio reconciliere de acceptat pentru acest cont.' };
    const toate = [...r.diferente, ...(Array.isArray(r.deConfirmat) ? r.deConfirmat : [])];
    for (const d of toate) {
      if (d.tip === 'pozitie' && r.verificat && r.verificat.pozitii === 'jurnal' && fin(d.app) && fin(d.broker)) x.ajustari[d.ticker] = r8((fin(x.ajustari[d.ticker]) ? x.ajustari[d.ticker] : 0) + d.broker - d.app);
      if (d.cheie === 'numerar:sumar' && fin(d.app) && fin(d.broker)) x.abatereSumar = ban(d.broker - d.app);
    }
    x.snapshot = x.ultima; x.ordineApp = []; x.vazute = {};
    x.acceptat = { la: new Date(now).toISOString(), motiv: m.slice(0, 200), diferente: toate.length };
    scrieBaza(storage, scope, x);
    const out = { ...r, la: new Date(now).toISOString(), ok: true, diferente: [], deConfirmat: [], acceptat: x.acceptat };
    salveaza(storage, out);
    return { ok: true, stare: JSON.parse(JSON.stringify(out)) };
  }
  /** Ordinele anulate din aplicație („Oprește tot”, anularea unui ordin) — explică dispariția lor de la broker timp de 7 zile. */
  function anulat({ storage = g.localStorage, scope, ids = [], now = Date.now() } = {}) {
    if (!scope || !storage) return null;
    const x = citesteBaza(storage, scope) || goala(), la = new Date(now).toISOString();
    for (const id of ids) if (id != null && id !== '' && !x.anulate.some((a) => String(a.id) === String(id))) x.anulate.push({ id: String(id), la });
    scrieBaza(storage, scope, x); return x.anulate.length;
  }

  function plural(n) { return n === 1 ? '1 diferență' : n % 100 >= 1 && n % 100 <= 19 ? n + ' diferențe' : n + ' de diferențe'; }
  /** Panoul din pagina contului (esc obligatoriu pe orice text). */
  function html(r, esc) {
    const e = typeof esc === 'function' ? esc : (v) => String(v);
    if (!r) return '<p>Nicio reconciliere încă: se face după prima citire completă a brokerului pe acest aparat.</p>';
    const v = r.verificat || {}, n = (r.diferente || []).length, asteapta = Array.isArray(r.deConfirmat) ? r.deConfirmat : [];
    const poz = v.pozitii === 'jurnal' ? 'poziții: din jurnalul execuțiilor' : v.pozitii === 'copie' ? 'poziții: din copia reconciliată + execuțiile de după' : 'poziții: neverificat (fără jurnal complet sau fără copie reconciliată)';
    const num = v.numerar ? 'numerar: verificat' : 'numerar: neverificat (sumar lipsă sau o poziție fără valoare)';
    const ord = v.ordine ? 'ordine: verificate' : 'ordine: neverificat (ordinele în așteptare necitite)';
    const lista = (xs) => '<ul>' + xs.map((d) => '<li>' + e(d.text) + '</li>').join('') + '</ul>';
    return (n ? `<p class="reconciliere-rau" role="alert"><b>${e(plural(n))}</b> între aplicație și Trading 212 · ${e(ora(r.la))} · Governor stă pe prudență până le rezolvi.</p>${lista(r.diferente)}`
      : `<p class="reconciliere-ok"><b>Fără diferențe</b> între copiile aplicației și Trading 212 · ${e(ora(r.la))}</p>`)
      + (asteapta.length ? `<p class="note">De confirmat la recitirea execuțiilor (cel mult 15 minute) — poate fi o execuție încă necitită:</p>${lista(asteapta)}` : '')
      + `<p class="note">${e(poz)} · ${e(num)} · ${e(ord)}</p>`
      + (r.acceptat ? `<p class="note">Ultima acceptare: ${e(ora(r.acceptat.la))} — ${e(r.acceptat.motiv)}</p>` : '');
  }
  g.TTReconciliere = { KEY, BAZA, TIMING_MS, compara, ruleaza, accepta, anulat, citeste, salveaza, citesteBaza, html };
})(typeof window !== 'undefined' ? window : globalThis);
