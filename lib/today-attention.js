/* 17.10.2026 (I-683) — „Ce necesită atenție” pe pozițiile reale, pagina Astăzi. Reguli simple, scrise aici, în ordinea gravității:
   3 · poziție fără stop pus (doar dacă stopurile au putut fi citite — altfel „nu știu”, nu „fără stop”);
   3 · raportează rezultate în ≤ 3 zile;
   2 · pierdere ≥ 10% de la intrare și prețul sub media de 50 de zile (sau pierdere ≥ 15% oricum);
   2 · o singură poziție ≥ 25% din cont;
   1 · un grup de poziții care se mișcă împreună (corelație ≥ 0,7 pe 90 de zile) ≥ 35% din cont (I-687);
   1 · mișcarea de ieri a poziției ≥ 2× mișcarea tipică a pieței (VIX / √252);
   4 · (I-723, 20.10) stop documentat în Portofoliu, dar FĂRĂ ordin STOP de vânzare la Trading 212 („doar pe hârtie”) — doar dacă ordinele s-au citit pe acest aparat;
   3 · (I-731, 20.10) split după ce ai pus stopul (stopul e în prețuri vechi); 2 · prețul Trading 212 față de închiderea Yahoo diferă cu peste 1 % (în afara orelor de tranzacționare).
   Pur: pagina dă pozițiile, stopurile, rezultatele, seriile și grupurile. */
(function (g) {
  'use strict';
  const fin = Number.isFinite;
  const num = (v, d = 1) => (fin(v) ? v.toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const symbolOf = (p) => (p && typeof p.symbol === 'string' ? p.symbol : /^([A-Z][A-Z0-9.-]{0,23})_US_EQ$/.exec(p?.ticker || '')?.[1] || null);
  const nume = (p) => symbolOf(p) || String(p?.name || p?.ticker || '').slice(0, 24);
  const F_NY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  /** În afara orelor de tranzacționare la New York (09:30–16:00, luni–vineri) — doar atunci închiderea Yahoo e comparabilă cu prețul T212. */
  function inAfaraOrelor(now) { try { const p = Object.fromEntries(F_NY.formatToParts(new Date(now)).map((q) => [q.type, q.value])), m = Number(p.hour) * 60 + Number(p.minute); return ['Sat', 'Sun'].includes(p.weekday) || m < 570 || m >= 960; } catch (_) { return false; } }
  const PRAG_SURSE = 1; // % — abaterea peste care cele două surse de preț nu se mai potrivesc
  function alerte({ positions = [], stops = null, earnings = null, serii = null, grupuri = null, miscare = null, ordineBroker = null, stopuriLa = null, contLa = null, now = Date.now() } = {}) {
    const out = [], poz = positions.filter((p) => p && fin(p.value) && p.value > 0);
    for (const p of poz) {
      const s = symbolOf(p), n = nume(p);
      const ob = ordineBroker && ordineBroker.citit && ordineBroker.pozitii ? ordineBroker.pozitii.get(p.ticker) || null : null; // I-723: ordinul de la broker, dacă s-a citit
      if (stops && !stops.has(p.ticker)) out.push(ob && ob.stare === 'da' ? { grav: 4, sever: true, ticker: p.ticker, text: `⛔ ${n}: la broker există un ordin STOP${ob.ordin && ob.ordin.stopPrice > 0 ? ' la ' + num(ob.ordin.stopPrice, 2) : ''}, dar în Portofoliu nu e notat — notează-l și aici (mai jos), altfel riscul contului nu se poate calcula.` } : { grav: 5, sever: true, ticker: p.ticker, text: `⛔ ${n}: fără stop pus în Portofoliu — pierderea nu are limită. Pune-l acum (mai jos: −5% sau după agitația acțiunii); dacă l-ai pus la Trading 212, notează-l și aici.` }); // 17.10: avertizare severă, mereu prima
      else if (stops && stops.has(p.ticker) && ob && ob.stare === 'nu') out.push({ grav: 4, sever: true, ticker: p.ticker, text: `⛔ ${n}: stopul e doar pe hârtie — notat în Portofoliu, dar fără ordin STOP de vânzare în așteptare la Trading 212. În lipsa ta nu execută nimic: pune ordinul (mai jos, „Pune ordinul în Trading 212”) sau notează dacă l-ai pus altfel.` });
      const e = earnings && s ? earnings.find((x) => x.symbol === s) : null, zile = e ? Math.round((Date.parse(e.date + 'T12:00:00Z') - now) / 86400000) : null;
      if (e && zile >= 0 && zile <= 3) out.push({ grav: 3, ticker: p.ticker, text: `${n} raportează rezultatele ${zile === 0 ? 'azi' : zile === 1 ? 'mâine' : 'peste ' + zile + ' zile'} (${e.date.slice(8, 10)}.${e.date.slice(5, 7)}): mișcarea poate sări peste stop.` });
      const cost = p.value - (fin(p.unrealized) ? p.unrealized : 0), pierd = fin(p.unrealized) && cost > 0 ? (p.unrealized / cost) * 100 : null;
      const c = s && serii?.[s] ? serii[s].map((b) => b.c).filter(fin) : [], m50 = c.length >= 50 ? c.slice(-50).reduce((a, b) => a + b, 0) / 50 : null, sub = fin(m50) && c.at(-1) < m50;
      if (fin(pierd) && (pierd <= -15 || (pierd <= -10 && sub))) out.push({ grav: 2, ticker: p.ticker, text: `${n}: ${pierd < 0 ? '−' : '+'}${num(Math.abs(pierd))}% de la intrare` + (sub ? ', sub media de 50 de zile' : '') + '. Regula ta de ieșire se aplică?' });
      if (fin(p.weight) && p.weight >= 25) out.push({ grav: 2, ticker: p.ticker, text: `${n} e ${num(p.weight, 0)}% din cont: o zi rea pe ea mută tot contul.` });
      if (fin(miscare) && c.length >= 2) { const zi = (c.at(-1) / c.at(-2) - 1) * 100; if (Math.abs(zi) >= 2 * miscare) out.push({ grav: 1, ticker: p.ticker, text: `${n} s-a mișcat ${zi > 0 ? '+' : '−'}${num(Math.abs(zi))}% în ultima sesiune — peste dublul mișcării tipice a pieței (±${num(miscare)}%).` }); }
      // I-731: a doua sursă de preț — închiderea Yahoo față de prețul T212, doar în afara orelor și doar dacă contul a fost citit după închiderea acelei sesiuni
      const bars = s && serii?.[s] ? serii[s] : null, ultim = bars && bars.length ? bars[bars.length - 1] : null;
      if (ultim && fin(ultim.c) && ultim.c > 0 && fin(ultim.t) && fin(p.currentPrice) && p.currentPrice > 0 && (p.instrumentCurrency == null || p.instrumentCurrency === 'USD') && inAfaraOrelor(now) && now - ultim.t < 4 * 86400000 && fin(contLa) && contLa > ultim.t + 6 * 3600000) {
        const dif = (p.currentPrice / ultim.c - 1) * 100;
        if (Math.abs(dif) > PRAG_SURSE) out.push({ grav: 2, ticker: p.ticker, text: `${n}: prețul din Trading 212 (${num(p.currentPrice, 2)}) diferă de închiderea Yahoo (${num(ultim.c, 2)}) cu ${num(Math.abs(dif))}% — datele nu se potrivesc între surse; verifică înainte de decizie.` });
      }
      // I-731: split după ce ai pus stopul ⇒ stopul e în prețuri de dinainte de split
      const sl = stopuriLa && typeof stopuriLa.get === 'function' ? stopuriLa.get(p.ticker) : null, ev = bars && bars.meta && Array.isArray(bars.meta.corporateEvents) ? bars.meta.corporateEvents : [];
      if (sl && fin(sl.la)) { const sp = ev.find((e) => e && /split/i.test(e.type || '') && fin(e.at) && e.at > sl.la && e.at <= now); if (sp) out.push({ grav: 3, ticker: p.ticker, text: `${n}: split ${fin(sp.numerator) && fin(sp.denominator) ? sp.numerator + ':' + sp.denominator + ' ' : ''}pe ${new Date(sp.at).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' })}, după ce ai pus stopul (${num(sl.stop, 2)}) — stopul e în prețuri de dinainte de split: refă-l.` }); }
    }
    for (const gr of grupuri || []) if (fin(gr.pondere) && gr.pondere >= 35) out.push({ grav: 1, ticker: null, text: `${gr.simboluri.join(', ')} se mișcă împreună (corelație ${num(gr.corelatie, 2)} pe 90 de zile): un singur pariu de ${num(gr.pondere, 0)}% din cont.` });
    // Fără niciun stop pus: un singur rând, nu câte unul pe poziție (altfel acoperă celelalte semnale).
    const fara = out.filter((x) => /fără stop pus/.test(x.text));
    if (fara.length > 1 && fara.length === poz.length) { const rest = out.filter((x) => !fara.includes(x)); rest.push({ grav: 5, sever: true, ticker: null, text: `⛔ Niciuna dintre cele ${poz.length} poziții nu are stop pus în Portofoliu: riscul total al contului nu e cunoscut și pierderea nu are limită. Pune stopurile acum, mai jos.` }); return rest.sort((a, b) => b.grav - a.grav); }
    return out.sort((a, b) => b.grav - a.grav);
  }
  /** Stopurile puse acum (Portofoliu → tezele pozițiilor): Set de tickere; null dacă nu se pot citi (atunci nu se spune „fără stop”). */
  function stopuri(scope, storage = g.localStorage) { try { const t = JSON.parse(storage.getItem('tt_holdings_theses_v1') || '{}'), out = new Set(); for (const [k, v] of Object.entries(t)) { const i = k.indexOf('|'), s = i >= 0 ? k.slice(0, i) : null, tk = i >= 0 ? k.slice(i + 1) : k; if ((!scope || !s || s === scope) && fin(Number(v?.stop)) && Number(v.stop) > 0) out.add(tk); } return out; } catch (_) { return null; } }
  g.TodayAttention = { alerte, stopuri, symbolOf, inAfaraOrelor, PRAG_SURSE };
})(typeof window !== 'undefined' ? window : globalThis);
