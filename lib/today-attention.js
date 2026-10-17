/* 17.10.2026 (I-683) — „Ce necesită atenție” pe pozițiile reale, pagina Astăzi. Reguli simple, scrise aici, în ordinea gravității:
   3 · poziție fără stop pus (doar dacă stopurile au putut fi citite — altfel „nu știu”, nu „fără stop”);
   3 · raportează rezultate în ≤ 3 zile;
   2 · pierdere ≥ 10% de la intrare și prețul sub media de 50 de zile (sau pierdere ≥ 15% oricum);
   2 · o singură poziție ≥ 25% din cont;
   1 · un grup de poziții care se mișcă împreună (corelație ≥ 0,7 pe 90 de zile) ≥ 35% din cont (I-687);
   1 · mișcarea de ieri a poziției ≥ 2× mișcarea tipică a pieței (VIX / √252).
   Pur: pagina dă pozițiile, stopurile, rezultatele, seriile și grupurile. */
(function (g) {
  'use strict';
  const fin = Number.isFinite;
  const num = (v, d = 1) => (fin(v) ? v.toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const symbolOf = (p) => (p && typeof p.symbol === 'string' ? p.symbol : /^([A-Z][A-Z0-9.-]{0,23})_US_EQ$/.exec(p?.ticker || '')?.[1] || null);
  const nume = (p) => symbolOf(p) || String(p?.name || p?.ticker || '').slice(0, 24);
  function alerte({ positions = [], stops = null, earnings = null, serii = null, grupuri = null, miscare = null, now = Date.now() } = {}) {
    const out = [], poz = positions.filter((p) => p && fin(p.value) && p.value > 0);
    for (const p of poz) {
      const s = symbolOf(p), n = nume(p);
      if (stops && !stops.has(p.ticker)) out.push({ grav: 3, ticker: p.ticker, text: `${n}: fără stop pus. Pune stopul în Portofoliu ca riscul poziției să fie cunoscut.` });
      const e = earnings && s ? earnings.find((x) => x.symbol === s) : null, zile = e ? Math.round((Date.parse(e.date + 'T12:00:00Z') - now) / 86400000) : null;
      if (e && zile >= 0 && zile <= 3) out.push({ grav: 3, ticker: p.ticker, text: `${n} raportează rezultatele ${zile === 0 ? 'azi' : zile === 1 ? 'mâine' : 'peste ' + zile + ' zile'} (${e.date.slice(8, 10)}.${e.date.slice(5, 7)}): mișcarea poate sări peste stop.` });
      const cost = p.value - (fin(p.unrealized) ? p.unrealized : 0), pierd = fin(p.unrealized) && cost > 0 ? (p.unrealized / cost) * 100 : null;
      const c = s && serii?.[s] ? serii[s].map((b) => b.c).filter(fin) : [], m50 = c.length >= 50 ? c.slice(-50).reduce((a, b) => a + b, 0) / 50 : null, sub = fin(m50) && c.at(-1) < m50;
      if (fin(pierd) && (pierd <= -15 || (pierd <= -10 && sub))) out.push({ grav: 2, ticker: p.ticker, text: `${n}: ${pierd < 0 ? '−' : '+'}${num(Math.abs(pierd))}% de la intrare` + (sub ? ', sub media de 50 de zile' : '') + '. Regula ta de ieșire se aplică?' });
      if (fin(p.weight) && p.weight >= 25) out.push({ grav: 2, ticker: p.ticker, text: `${n} e ${num(p.weight, 0)}% din cont: o zi rea pe ea mută tot contul.` });
      if (fin(miscare) && c.length >= 2) { const zi = (c.at(-1) / c.at(-2) - 1) * 100; if (Math.abs(zi) >= 2 * miscare) out.push({ grav: 1, ticker: p.ticker, text: `${n} s-a mișcat ${zi > 0 ? '+' : '−'}${num(Math.abs(zi))}% în ultima sesiune — peste dublul mișcării tipice a pieței (±${num(miscare)}%).` }); }
    }
    for (const gr of grupuri || []) if (fin(gr.pondere) && gr.pondere >= 35) out.push({ grav: 1, ticker: null, text: `${gr.simboluri.join(', ')} se mișcă împreună (corelație ${num(gr.corelatie, 2)} pe 90 de zile): un singur pariu de ${num(gr.pondere, 0)}% din cont.` });
    // Fără niciun stop pus: un singur rând, nu câte unul pe poziție (altfel acoperă celelalte semnale).
    const fara = out.filter((x) => /fără stop pus/.test(x.text));
    if (fara.length > 1 && fara.length === poz.length) { const rest = out.filter((x) => !fara.includes(x)); rest.push({ grav: 3, ticker: null, text: `Niciuna dintre cele ${poz.length} poziții nu are stop pus în Portofoliu: riscul total al contului nu e cunoscut.` }); return rest.sort((a, b) => b.grav - a.grav); }
    return out.sort((a, b) => b.grav - a.grav);
  }
  /** Stopurile puse acum (Portofoliu → tezele pozițiilor): Set de tickere; null dacă nu se pot citi (atunci nu se spune „fără stop”). */
  function stopuri(scope, storage = g.localStorage) { try { const t = JSON.parse(storage.getItem('tt_holdings_theses_v1') || '{}'), out = new Set(); for (const [k, v] of Object.entries(t)) { const i = k.indexOf('|'), s = i >= 0 ? k.slice(0, i) : null, tk = i >= 0 ? k.slice(i + 1) : k; if ((!scope || !s || s === scope) && fin(Number(v?.stop)) && Number(v.stop) > 0) out.add(tk); } return out; } catch (_) { return null; } }
  g.TodayAttention = { alerte, stopuri, symbolOf };
})(typeof window !== 'undefined' ? window : globalThis);
