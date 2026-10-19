// I-704 (19.10.2026): un IndexedDB minimal pentru testele din Node — doar ce folosește lib/data.js
// (open + upgrade, un depozit cu cheie externă și un index pe `t`, get/put/delete/clear, cursor de chei pe index).
// `baza` (Map) trăiește în afara paginii ⇒ două încărcări ale lui data.js văd aceleași date, ca după un F5.
const mic = (fn) => setTimeout(fn, 0);

export function idbFals({ baza = new Map(), picaLaDeschidere = false, atarnaLaDeschidere = false } = {}) {
  const jurnal = { deschideri: 0, get: 0, put: 0 };
  function depozit(nume) {
    if (!baza.has(nume)) baza.set(nume, { date: new Map(), indexuri: {} });
    return baza.get(nume);
  }
  function cerere(fn) {
    const r = { result: undefined, error: null, onsuccess: null, onerror: null };
    mic(() => { try { r.result = fn(r); r.onsuccess && r.onsuccess({ target: r }); } catch (e) { r.error = e; r.onerror && r.onerror({ target: r }); } });
    return r;
  }
  function objectStore(nume) {
    const d = depozit(nume);
    return {
      get: (k) => { jurnal.get++; return cerere(() => (d.date.has(k) ? structuredClone(d.date.get(k)) : undefined)); },
      put: (v, k) => { jurnal.put++; return cerere(() => { d.date.set(k, structuredClone(v)); return k; }); },
      delete: (k) => cerere(() => { d.date.delete(k); }),
      clear: () => cerere(() => { d.date.clear(); }),
      createIndex: (n, keyPath) => { d.indexuri[n] = keyPath; return {}; },
      index: (n) => ({
        openKeyCursor: (interval) => {
          const kp = d.indexuri[n];
          const chei = [...d.date].filter(([, v]) => !interval || v[kp] <= interval.upper).map(([k]) => k);
          let i = 0; const r = { result: null, onsuccess: null, onerror: null };
          const pas = () => mic(() => { r.result = i < chei.length ? { primaryKey: chei[i], continue: () => { i++; pas(); } } : null; r.onsuccess && r.onsuccess({ target: r }); });
          pas(); return r;
        },
      }),
    };
  }
  const db = {
    objectStoreNames: { contains: (n) => baza.has(n) },
    createObjectStore: (n) => { depozit(n); return objectStore(n); },
    transaction: (n) => { const tx = { oncomplete: null, onerror: null, onabort: null, objectStore: () => objectStore(Array.isArray(n) ? n[0] : n) }; setTimeout(() => tx.oncomplete && tx.oncomplete(), 5); return tx; },
    close: () => {},
  };
  const indexedDB = {
    open: () => {
      jurnal.deschideri++;
      const r = { result: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
      if (atarnaLaDeschidere) return r;
      mic(() => {
        if (picaLaDeschidere) { r.error = new Error('mod privat'); r.onerror && r.onerror({ target: r }); return; }
        r.result = db;
        if (!baza.size && r.onupgradeneeded) r.onupgradeneeded({ target: r });
        r.onsuccess && r.onsuccess({ target: r });
      });
      return r;
    },
  };
  const IDBKeyRange = { upperBound: (x) => ({ upper: x }) };
  return { indexedDB, IDBKeyRange, baza, jurnal };
}
