/* 17.10.2026 — stopul pus la fiecare poziție: fereastra de pe Astăzi pentru pozițiile Trading 212 fără stop.
   Două variante, alese cu o atingere: −5% de la prețul mediu de intrare (regula lui, implicită) și „după agitația acțiunii”
   = 2 × ATR(14) zilnic raportat la preț, între 3% și 8%; plus alt preț scris de mână și ținta (opțional).
   Stopul se salvează în tezele Portofoliului (HoldingsNotes, cheia sincronizată tt_holdings_theses_v1, cu istoric și oră) ⇒
   îl vede Portofoliul, alerta „fără stop” dispare, iar Raportul din Jurnal îl ia ca stop LA INTRARE (pus în primele 24 h). */
(function (g) {
  'use strict';
  const fin = Number.isFinite;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const F2 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), F1 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const sym = (t) => /^([A-Z][A-Z0-9.-]{0,23})_US_EQ$/.exec(t || '')?.[1] || (t || '').replace(/_[A-Z]{2}_EQ$/, '');
  const symYahoo = (t) => /^([A-Z][A-Z0-9.-]{0,23})_US_EQ$/.exec(t || '')?.[1]?.replace('.', '-') || null;
  const PCT_FIX = 5, ATR_X = 2, MIN = 3, MAX = 8;
  /** ATR(14) simplu din bare zilnice {h,l,c}, în % din ultima închidere. */
  function atrPct(bars, n = 14) {
    const b = (bars || []).filter((x) => fin(x?.h) && fin(x?.l) && fin(x?.c) && x.c > 0); if (b.length < n + 1) return null;
    let s = 0; for (let i = b.length - n; i < b.length; i++) { const p = b[i - 1].c; s += Math.max(b[i].h - b[i].l, Math.abs(b[i].h - p), Math.abs(b[i].l - p)); }
    return (s / n / b.at(-1).c) * 100;
  }
  /** Variantele de stop pentru o poziție (prețuri în moneda acțiunii). */
  /* 18.10 (el, cu poza: WDC −20%, AVGO −17% ⇒ stopul de la intrare stătea PESTE prețul de acum): poziția deja sub −5% de la intrare primește
     stopul de la PREȚUL DE ACUM (oprește pierderea de aici încolo); pozițiile noi / cele care n-au scăzut 5% — de la intrare, ca înainte. */
  function baza(intrare, acum) { return fin(acum) && acum > 0 && fin(intrare) && intrare > 0 && acum <= intrare * (1 - PCT_FIX / 100) ? { pret: acum, de: 'de la prețul de acum', dinAcum: true } : { pret: intrare, de: 'de la intrare', dinAcum: false }; }
  function propuneri({ intrare, acum = null, atr = null }) {
    if (!fin(intrare) || intrare <= 0) return [];
    const b = baza(intrare, acum), out = [{ id: 'fix', titlu: `−${PCT_FIX}% ${b.de}`, pct: PCT_FIX, stop: b.pret * (1 - PCT_FIX / 100), implicit: true, dinAcum: b.dinAcum }];
    if (fin(atr) && atr > 0) { const pct = Math.min(MAX, Math.max(MIN, ATR_X * atr)); out.push({ id: 'atr', titlu: `după agitația acțiunii (2 × ATR ${F1.format(atr)}%) ${b.de}`, pct, stop: b.pret * (1 - pct / 100), limitat: ATR_X * atr < MIN ? 'min' : ATR_X * atr > MAX ? 'max' : null, dinAcum: b.dinAcum }); }
    for (const o of out) o.subPret = fin(acum) && acum <= o.stop;
    return out;
  }
  /** 18.10 (el: „apare avertizarea, nu văd valorile de stop loss”): copia contului de pe telefon poate veni fără prețul mediu / prețul de acum.
      Intrarea se ESTIMEAZĂ din valoarea și profitul poziției (cost = valoare − profit ⇒ intrare = acum × cost / valoare; cursul valutar
      neajustat), prețul de acum vine din ultima închidere; moneda acțiunilor din SUA = USD. Ce lipsește se spune pe ecran, nu se ascunde. */
  function moneda(p) { return p.instrumentCurrency || (/_US_EQ$/.test(p.ticker || '') ? 'USD' : null); }
  function preturi(p, ultim = null) {
    const acum = fin(p.currentPrice) && p.currentPrice > 0 ? p.currentPrice : fin(ultim) && ultim > 0 ? ultim : null;
    let intrare = fin(p.averagePrice) && p.averagePrice > 0 ? p.averagePrice : null, estimat = false;
    if (!intrare && acum && fin(p.value) && p.value > 0 && fin(p.unrealized)) { const cost = p.value - p.unrealized; if (cost > 0) { intrare = (acum * cost) / p.value; estimat = true; } }
    return { intrare, acum, estimat, acumDinBare: !(fin(p.currentPrice) && p.currentPrice > 0) && !!acum };
  }
  /** Pozițiile din copia contului fără stop pus în Portofoliu. stops = Set de tickere (TodayAttention.stopuri). */
  function faraStop(snapshot, stops) { return ((snapshot && snapshot.positions) || []).filter((p) => p && typeof p.ticker === 'string' && fin(p.quantity) && p.quantity > 0 && !(stops && stops.has(p.ticker))); }
  function render(pozitii, { atr = {}, alese = {}, stare = '', ultim = {} } = {}) {
    if (!pozitii.length) return '';
    return `<section class="stop-panel" aria-labelledby="stopPanelT"><h2 id="stopPanelT">⛔ Pune stopul acum</h2><p class="stop-sub" role="status">${pozitii.length === 1 ? 'O poziție nu are stop.' : pozitii.length + ' poziții nu au stop.'} Fără stop, pierderea nu are limită. Alege varianta; se salvează în Portofoliu.${stare ? ' ' + esc(stare) : ''}</p>` +
      pozitii.map((p) => {
        const s = symYahoo(p.ticker), px = preturi(p, s ? ultim[s] : null), pr = propuneri({ intrare: px.intrare, acum: px.acum, atr: s ? atr[s] : null }), m = moneda(p) || '', ales = alese[p.ticker] || 'fix';
        const jos = pr[0]?.dinAcum && px.intrare && px.acum ? `<p class="stop-jos">Poziția e deja ${F1.format((px.acum / px.intrare - 1) * 100).replace('-', '−')}% de la intrare: stopul se pune sub prețul de acum, ca să nu pierzi mai mult de aici încolo.</p>` : '';
        const lipsa = pr.length ? jos : `<p class="stop-lipsa">Nu pot calcula stopul: copia contului nu are prețul de intrare${px.acum ? '' : ' și nici prețul de acum'} pentru ${esc(sym(p.ticker))}${s && !(s in ultim) ? ' (se citește ultimul preț…)' : ''}. Scrie stopul de mână mai jos sau sincronizează contul (Cont &amp; sincronizare).</p>`;
        return `<article class="stop-poz" data-stop-ticker="${esc(p.ticker)}"><header><b>${esc(sym(p.ticker))}</b><span>intrare ${px.intrare ? F2.format(px.intrare) : '—'}${px.estimat ? ' (estimat)' : ''} ${esc(m)} · acum ${px.acum ? F2.format(px.acum) : '—'}${px.acumDinBare ? ' (ultima închidere)' : ''}</span></header>` + lipsa +
          `<div class="stop-var" role="radiogroup" aria-label="Stopul pentru ${esc(sym(p.ticker))}">` +
          pr.map((o) => `<button type="button" role="radio" aria-checked="${ales === o.id}" data-stop-var="${o.id}" data-stop-pret="${o.stop.toFixed(4)}"><b>${F2.format(o.stop)} ${esc(m)}</b><span>${esc(o.titlu)} · −${F1.format(o.pct)}%${o.limitat === 'min' ? ' (minimum 3%)' : o.limitat === 'max' ? ' (maximum 8%)' : ''}</span>${o.subPret ? '<em>prețul e deja sub acest stop</em>' : ''}</button>`).join('') +
          (s && !(s in atr) ? '<span class="stop-wait">se calculează agitația…</span>' : '') + '</div>' +
          `<div class="stop-row"><label>Alt stop <input type="number" inputmode="decimal" step="0.01" min="0" data-stop-alt placeholder="${pr[0] ? pr[0].stop.toFixed(2) : ''}"></label><label>Țintă (opțional) <input type="number" inputmode="decimal" step="0.01" min="0" data-stop-tinta></label><button type="button" class="stop-save" data-stop-save>Salvează stopul</button></div></article>`;
      }).join('') + '</section>';
  }
  /** Salvează în tezele Portofoliului. Întoarce mesajul de eroare sau null. */
  function salveaza({ scope, poz, stop, tinta = null, storage = g.localStorage }) {
    const N = g.HoldingsNotes; if (!N) return 'Modulul Portofoliului nu e încărcat; reîncarcă pagina.';
    if (!fin(stop) || stop <= 0) return 'Stopul trebuie să fie un preț pozitiv.';
    const ref = fin(poz.averagePrice) && poz.averagePrice > 0 ? poz.averagePrice : fin(poz.currentPrice) && poz.currentPrice > 0 ? poz.currentPrice : null;
    if (ref && stop >= ref * 1.5) return 'Stopul e mult peste prețul de intrare; verifică cifra.';
    if (fin(poz.currentPrice) && poz.currentPrice > 0 && stop >= poz.currentPrice) return 'Stopul e peste prețul de acum (' + F2.format(poz.currentPrice) + '): s-ar executa imediat. Pune-l sub preț.';
    if (tinta != null && (!fin(tinta) || tinta <= stop)) return 'Ținta trebuie să fie peste stop.';
    const m = moneda(poz); if (!m) return 'Moneda acțiunii nu e confirmată în copia contului; pune stopul din Portofoliu.';
    try { N.save(storage, (scope ? scope + '|' : '') + poz.ticker, { stop: +stop.toFixed(4), stopCurrency: m, ...(tinta != null ? { targetPrice: +tinta.toFixed(4), targetCurrency: m } : {}) }); return null; } catch (e) { return e.message || 'Stopul nu s-a putut salva.'; }
  }
  /** Istoricul stopurilor din teze (pentru Raport): ticker → [{ at, stop, tinta }] crescător. */
  function istoric(theses, scope) {
    const out = {}; if (!theses || typeof theses !== 'object') return out;
    for (const [k, v] of Object.entries(theses)) { const i = k.indexOf('|'), s = i >= 0 ? k.slice(0, i) : null, tk = i >= 0 ? k.slice(i + 1) : k; if (scope && s && s !== scope) continue;
      let prec = null; for (const h of (Array.isArray(v?.history) ? v.history : []).slice().sort((a, b) => Date.parse(a?.at) - Date.parse(b?.at))) { const at = Date.parse(h?.at), st = Number(h?.stop); if (!fin(at)) continue; if (st > 0 && st !== prec) (out[tk] = out[tk] || []).push({ at, stop: st, tinta: Number(h.targetPrice) > 0 ? Number(h.targetPrice) : null }); prec = st > 0 ? st : null; } }
    for (const k of Object.keys(out)) out[k].sort((a, b) => a.at - b.at);
    return out;
  }
  /* 17.10 (el: „avertizare și pe Discord, o dată la 15 min până se pune stop loss”): lista tickerelor CU stop pleacă la worker-ul Paznicului
     (POST /stopuri, cheia de citire a Alertelor din acest browser); worker-ul compară cu pozițiile din poza colectorului de acasă și trimite
     alarma pe Discord la :00 :15 :30 :45 cât rămâne vreo poziție fără stop. Se trimite doar la schimbare (sau o dată la 6 ore). */
  const URL_PAZNIC = 'https://paznic-radar.mferent80.workers.dev', K_TRIMIS = 'tt_stopuri_trimise_v1';
  /* revizia 18.10 (critic): stopul rămas în teza unei poziții VÂNDUTE acoperea poziția nouă pe același ticker ⇒ alarma tăcea exact la „trade nou fără stop”.
     Acum stopul contează doar dacă a fost pus / schimbat DUPĂ deschiderea poziției de acum (openedAt din copia contului; −1 h toleranță). */
  function stopLa(t) { if (!t || !(Number(t.stop) > 0)) return null; let la = null, prec = null; for (const h of (Array.isArray(t.history) ? t.history : []).slice().sort((a, b) => Date.parse(a?.at) - Date.parse(b?.at))) { const st = Number(h?.stop), at = Date.parse(h?.at); if (st > 0 && st !== prec && fin(at)) la = at; prec = st > 0 ? st : null; } return la ?? (fin(Date.parse(t.updatedAt)) ? Date.parse(t.updatedAt) : null); }
  function stopuriValide(theses, scope, positions) {
    const out = new Set(); if (!theses || typeof theses !== 'object') return out;
    for (const p of positions || []) { if (!p || typeof p.ticker !== 'string') continue; const t = theses[(scope ? scope + '|' : '') + p.ticker] || theses[p.ticker]; if (!t || !(Number(t.stop) > 0)) continue;
      const deschisa = Date.parse(p.openedAt), la = stopLa(t); if (!fin(deschisa) || (la != null && la >= deschisa - 3600000)) out.add(p.ticker); }
    return out;
  }
  /* revizia 18.10: stopurile puse ÎN AFARA aplicației — ordinul de stop din Trading 212 (stopT212) și stopul fix din planul Radarului — din poza colectorului. */
  function stopuriExterne(poza) { const out = new Set(); for (const p of (poza && Array.isArray(poza.t212) ? poza.t212 : [])) if (p && p.t212 && (Number(p.stopT212) > 0 || Number(p.plan?.stopFix) > 0)) out.add(p.t212); return out; }
  function cuStop(theses, scope, positions = null) {
    if (Array.isArray(positions)) return [...stopuriValide(theses, scope, positions)].sort();
    const out = new Set(); if (!theses || typeof theses !== 'object') return []; for (const [k, v] of Object.entries(theses)) { const i = k.indexOf('|'), s = i >= 0 ? k.slice(0, i) : null, tk = i >= 0 ? k.slice(i + 1) : k; if ((!scope || !s || s === scope) && Number(v?.stop) > 0) out.add(tk); } return [...out].sort();
  }
  async function trimiteLista({ storage = g.localStorage, fetchImpl = g.fetch, now = Date.now(), fortat = false, reincercat = false, asteapta = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
    let cheie = '', url = URL_PAZNIC, th = {}, scope = null, pozitii = null;
    try { cheie = String(storage.getItem('radar_cheie') || '').trim(); const u = String(storage.getItem('radar_url') || '').trim(); if (/^https:\/\/[^\s/?#]+\.[^\s/?#]+/i.test(u)) url = u.replace(/\/+$/, ''); th = JSON.parse(storage.getItem('tt_holdings_theses_v1') || '{}'); const sn = g.T212Snapshot?.read?.('live'); scope = sn?.[0] || null; pozitii = Array.isArray(sn?.[1]?.positions) ? sn[1].positions : null; } catch (_) { return { stare: 'eroare' }; }
    if (!cheie) return { stare: 'fara-cheie' };
    const lista = cuStop(th, scope, pozitii); let vechi = null;
    // revizia 18.10: o listă GOALĂ pleacă doar după o acțiune a ta (fortat) — un dispozitiv încă nesincronizat nu golește lista bună de pe worker
    if (!lista.length && !fortat) return { stare: 'gol-nesigur', n: 0 }; try { vechi = JSON.parse(storage.getItem(K_TRIMIS) || 'null'); } catch (_) { vechi = null; }
    if (!fortat && vechi && JSON.stringify(vechi.lista) === JSON.stringify(lista) && now - vechi.la < 6 * 3600000) return { stare: 'neschimbat', n: lista.length };
    try { const r = await fetchImpl(url + '/stopuri', { method: 'POST', headers: { authorization: 'Bearer ' + cheie, 'content-type': 'application/json' }, body: JSON.stringify({ cuStop: lista }), cache: 'no-store' });
      if (r.ok) { try { storage.setItem(K_TRIMIS, JSON.stringify({ lista, la: now })); } catch (_) { /* se retrimite data viitoare */ } return { stare: 'trimis', n: lista.length }; }
      if (r.status === 429 && !reincercat) { await asteapta(6000); return trimiteLista({ storage, fetchImpl, now: now + 6000, fortat: true, reincercat: true, asteapta }); } // revizia 18.10: „prea des” ⇒ încă o dată după 6 s
      return { stare: r.status === 401 ? 'cheie-gresita' : 'refuzat', cod: r.status }; } catch (_) { return { stare: 'retea' }; }
  }
  g.StopSetter = { PCT_FIX, ATR_X, MIN, MAX, atrPct, baza, propuneri, preturi, moneda, faraStop, render, salveaza, istoric, symYahoo, cuStop, trimiteLista, stopLa, stopuriValide, stopuriExterne };
})(typeof window !== 'undefined' ? window : globalThis);
