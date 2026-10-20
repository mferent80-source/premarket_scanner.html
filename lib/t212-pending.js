/* 20.10.2026 (I-723): ordinele în așteptare din Trading 212 (DOAR citire, ruta `orders-pending` a releului) — ca „are stop” să însemne ORDIN la broker,
   nu doar stop scris în teze (un stop „în minte” nu execută nimic în lipsa ta). Pagina contului le citește după fiecare sincronizare și le ține LOCAL
   (tt_trading212_orders_pending_v1 — pe alt aparat starea e „necitit”, nu „fără”). Astăzi: rândul sever „stop doar pe hârtie” pe pozițiile cu stop
   documentat fără ordin STOP de vânzare la broker; Planuri: eticheta în căldura portofoliului; pagina contului: „stop la broker DA / NU / necitit”.
   Stopul văzut de colectorul Radarului (StopSetter.stopuriExterne) contează tot ca ordin real. Pur: nimic din rețea aici. */
(function (g) {
  'use strict';
  const KEY = 'tt_trading212_orders_pending_v1', fin = Number.isFinite, MAX_AGE = 6 * 3600000, STOP = /STOP/i;
  function valid(items) {
    return Array.isArray(items) && items.length <= 500 && items.every((o) => o && typeof o === 'object' && typeof o.ticker === 'string' && o.ticker.length > 0 && o.ticker.length <= 64
      && (o.quantity == null || fin(o.quantity)) && (o.stopPrice == null || fin(o.stopPrice)) && (o.limitPrice == null || fin(o.limitPrice)) && (o.type == null || typeof o.type === 'string') && (o.side == null || ['BUY', 'SELL'].includes(o.side)));
  }
  function read(storage, scope) { try { const d = JSON.parse(storage.getItem(KEY) || '{}'), a = d && typeof d === 'object' ? d[scope] : null; return a && valid(a.items) && fin(Date.parse(a.fetchedAt)) ? a : null; } catch (_) { return null; } }
  function save(storage, scope, environment, items, fetchedAt) {
    if (!scope || !valid(items) || !fin(Date.parse(fetchedAt))) throw Error('Ordinele în așteptare au o formă neașteptată; copia veche rămâne.');
    let d = {}; try { d = JSON.parse(storage.getItem(KEY) || '{}'); if (!d || typeof d !== 'object' || Array.isArray(d)) d = {}; } catch (_) { d = {}; }
    d[scope] = { environment, items, fetchedAt }; storage.setItem(KEY, JSON.stringify(d)); return d[scope];
  }
  /** Ordinele STOP de VÂNZARE pe ticker (stopul cel mai mic când sunt mai multe). */
  function ordineStop(items) {
    const m = new Map();
    for (const o of items || []) { if (!o || !STOP.test(o.type || '') || o.side === 'BUY' || !(o.stopPrice > 0)) continue; const v = m.get(o.ticker); if (!v || o.stopPrice < v.stopPrice) m.set(o.ticker, { stopPrice: o.stopPrice, quantity: fin(o.quantity) ? Math.abs(o.quantity) : null, type: o.type, id: o.id ?? null }); }
    return m;
  }
  /** Starea pe poziții: da (ordin STOP la broker sau stop văzut de Radar) / nu (fără ordin) / necitit (ordinele nu s-au citit pe acest aparat sau sunt mai vechi de 6 h). */
  function stare({ scope, positions = [], storage = g.localStorage, externe = null, now = Date.now() } = {}) {
    const a = scope && storage ? read(storage, scope) : null, vechi = !a || now - Date.parse(a.fetchedAt) > MAX_AGE, m = a ? ordineStop(a.items) : new Map(), out = new Map();
    for (const p of positions || []) {
      if (!p || typeof p.ticker !== 'string') continue;
      const o = m.get(p.ticker) || null, ext = !!(externe && typeof externe.has === 'function' && externe.has(p.ticker));
      const partial = !!(o && fin(o.quantity) && fin(p.quantity) && p.quantity > 0 && o.quantity < p.quantity * 0.999); // revizia 20.10: ordinul pentru o parte din poziție nu e „DA” întreg
      out.set(p.ticker, ext ? { stare: 'da', sursa: 'radar', ordin: o } : vechi ? { stare: 'necitit', ordin: null } : o ? { stare: partial ? 'partial' : 'da', sursa: 'broker', ordin: o } : { stare: 'nu', ordin: null });
    }
    return { citit: !vechi, la: a ? a.fetchedAt : null, n: a ? a.items.length : null, pozitii: out };
  }
  /** Tickerele cu stop documentat în aplicație (Set) dar FĂRĂ ordin la broker; null când ordinele nu s-au citit. */
  function peHartie(st, documentate) { if (!st || !st.citit) return null; const out = []; for (const [t, v] of st.pozitii) if (documentate && documentate.has(t) && v.stare === 'nu') out.push(t); return out; }
  /** Textul scurt pentru pagina contului. */
  function text(v, moneda) { if (!v || v.stare === 'necitit') return 'necitit (sincronizează pe acest aparat)'; if (v.stare === 'partial') return 'PARȚIAL · ordin STOP' + (v.ordin && v.ordin.stopPrice > 0 ? ' la ' + v.ordin.stopPrice + (moneda ? ' ' + moneda : '') : '') + ' doar pentru ' + (v.ordin ? v.ordin.quantity : '?') + ' acțiuni'; if (v.stare === 'da') return 'DA' + (v.ordin && v.ordin.stopPrice > 0 ? ' · ' + v.ordin.stopPrice + (moneda ? ' ' + moneda : '') + (v.ordin.quantity ? ' × ' + v.ordin.quantity : '') : v.sursa === 'radar' ? ' (văzut de Radar)' : ''); return 'NU — niciun ordin STOP de vânzare în așteptare'; }
  g.T212Pending = { KEY, MAX_AGE, valid, read, save, ordineStop, stare, peHartie, text };
})(typeof window !== 'undefined' ? window : globalThis);
