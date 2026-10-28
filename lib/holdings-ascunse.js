/* 28.10.2026 (I-765, I-766) — „de ce nu văd TE în Portofoliu, l-am cumpărat aseară?”: poziția era în date, dar ascunsă de filtrul ținut minte pe aparat
   („De revizuit · tehnic și plan” sau „Schimbate de la ultima vizită”), iar lista tăcea. Aici, PUR (fără DOM, fără rețea):
   - recente(): care poziții sunt NOI — întâi din execuțiile Trading 212 (prima cumpărare în ultimele 7 zile și nicio execuție mai veche),
     apoi din istoricul zilnic al pozițiilor (absentă din toate citirile mai vechi de 7 zile), apoi din reperul vizitei (prima dată văzută);
     când nicio sursă nu poate spune, poziția NU e declarată nouă (nu inventăm);
   - ascunse(): pozițiile noi care nu sunt în lista afișată, cu filtrele active care le pot ascunde;
   - markup(): rândul „TE · poziție nouă (cumpărată 27.10) · ascunsă de filtrul «…» · Arată”;
   - cumparari(): ordinele de CUMPĂRARE în așteptare (I-723 le citește doar pentru stop) — un ordin pus după 22:00 nu e poziție până la execuție,
     deci Portofoliul spune „ordin de cumpărare în așteptare”, nu tace. */
(function (g) {
  'use strict';
  const fin = Number.isFinite, ZILE = 7, ZI = 86400000, MAX_AGE = 6 * 3600000;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FMT_ZI = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit' });
  const FMT_ORA = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const ziua = (t) => (fin(t) ? FMT_ZI.format(new Date(t)) : null);
  const ora = (t) => (fin(t) ? FMT_ORA.format(new Date(t)) : null);
  const nr = (v) => (fin(v) ? v.toLocaleString('ro-RO', { maximumFractionDigits: 4 }) : null);
  /* etichetele filtrelor, exact cum le vede EL în pagină (holdings/index.html, selectul „Stare tehnică” și bifele) */
  const FILTRE = Object.freeze({
    state: Object.freeze({ review: 'De revizuit · tehnic și plan', stop: 'Aproape de stop / stop atins', up: 'Trend ascendent', down: 'Trend descendent', attention: 'Semnale tehnice de atenție', missing: 'Analiză lipsă / expirată' }),
    favorites: 'Doar favorite', changes: 'Schimbate de la ultima vizită',
  });
  const tickerBun = (t) => typeof t === 'string' && t.length > 0 && t.length <= 64;

  /** Din execuții: data primei CUMPĂRĂRI dacă e în fereastră și nu există nicio execuție mai veche pe ticker; `null` = nu e nouă; `undefined` = execuțiile nu spun (nicio execuție pe ticker). */
  function dinExecutii(ticker, fills, now, zile) {
    if (!Array.isArray(fills)) return undefined;
    let primaCumparare = null, areVechi = false, are = false;
    for (const f of fills) {
      if (!f || f.ticker !== ticker) continue;
      const t = Date.parse(f.date); if (!fin(t) || t > now + 60000) continue;
      are = true;
      if (now - t > zile * ZI) { areVechi = true; break; }
      if (f.side === 'BUY' && (primaCumparare === null || t < primaCumparare)) primaCumparare = t;
    }
    if (!are) return undefined;
    if (areVechi || primaCumparare === null) return null;
    return primaCumparare;
  }
  /** Din istoricul zilnic al pozițiilor (T212Daily): absentă din toate citirile mai vechi de `zile` ⇒ nouă, cu prima zi în care apare. `undefined` când istoricul nu acoperă fereastra. */
  function dinIstoric(ticker, istoric, scope, now, zile) {
    const a = istoric && istoric.version === 1 && istoric.accounts ? istoric.accounts[scope] : null;
    const days = a && Array.isArray(a.days) ? a.days.filter((d) => d && fin(Date.parse(d.at)) && Date.parse(d.at) <= now + 60000 && Array.isArray(d.positions)) : [];
    const vechi = days.filter((d) => now - Date.parse(d.at) > zile * ZI);
    if (!vechi.length) return undefined;
    if (vechi.some((d) => d.positions.some((p) => p && p.ticker === ticker))) return null;
    const prima = days.filter((d) => d.positions.some((p) => p && p.ticker === ticker)).map((d) => Date.parse(d.at)).sort((x, y) => x - y)[0];
    return fin(prima) ? prima : -1;
  }
  /**
   * Pozițiile noi: Map ticker → { de: ms | null, sursa: 'executii' | 'istoric' | 'vizita' }.
   * `fills` = execuțiile contului (T212FillsStore … accounts[scope].items), `istoric` = T212Daily.read(...), `noi` = Set cu tickerele „prima dată văzute” din reperul vizitei.
   */
  function recente({ positions = [], fills = null, istoric = null, scope = null, noi = null, now = Date.now(), zile = ZILE } = {}) {
    const out = new Map();
    for (const p of positions || []) {
      if (!p || !tickerBun(p.ticker) || out.has(p.ticker)) continue;
      const e = dinExecutii(p.ticker, fills, now, zile);
      if (e !== undefined) { if (e !== null) out.set(p.ticker, { de: e, sursa: 'executii' }); continue; }
      const i = dinIstoric(p.ticker, istoric, scope, now, zile);
      if (i !== undefined) { if (i !== null) out.set(p.ticker, { de: i >= 0 ? i : null, sursa: 'istoric' }); continue; }
      if (noi && typeof noi.has === 'function' && noi.has(p.ticker)) out.set(p.ticker, { de: null, sursa: 'vizita' });
    }
    return out;
  }
  /** Filtrele active care pot ascunde o poziție, ca etichete pentru om. */
  function filtre({ state = 'all', favorites = false, changes = false, query = '' } = {}) {
    const f = [];
    if (typeof state === 'string' && FILTRE.state[state]) f.push('«' + FILTRE.state[state] + '»');
    if (favorites === true) f.push('«' + FILTRE.favorites + '»');
    if (changes === true) f.push('«' + FILTRE.changes + '»');
    const q = typeof query === 'string' ? query.trim() : '';
    if (q) f.push('căutarea „' + q.slice(0, 40) + '”');
    return f;
  }
  /** Pozițiile noi care NU sunt în lista afișată (vizibile = Set de tickere), cu filtrele active. Fără filtre active nu există nimic de spus. */
  function ascunse({ positions = [], vizibile, recente: rec, filtre: f = [] } = {}) {
    if (!Array.isArray(f) || !f.length || !rec || typeof rec.get !== 'function') return [];
    const v = vizibile && typeof vizibile.has === 'function' ? vizibile : new Set();
    const out = [];
    for (const p of positions || []) {
      if (!p || !rec.has(p.ticker) || v.has(p.ticker)) continue;
      const r = rec.get(p.ticker);
      out.push({ ticker: p.ticker, de: r.de, sursa: r.sursa, filtre: f.slice() });
    }
    return out;
  }
  function motiv(r) {
    if (r.sursa === 'executii') return 'poziție nouă' + (fin(r.de) ? ' (cumpărată ' + ziua(r.de) + ')' : '');
    if (r.sursa === 'istoric') return 'poziție nouă' + (fin(r.de) ? ' (prima citire ' + ziua(r.de) + ')' : ' (nu era în citirile de săptămâna trecută)');
    return 'poziție nouă față de vizita precedentă';
  }
  /** Rândurile pentru pagină; `symbol(ticker)` dă simbolul de piață (TE), altfel tickerul. */
  function markup(rows, { symbol = (t) => t } = {}) {
    if (!Array.isArray(rows) || !rows.length) return '';
    return rows.map((r) => {
      const s = symbol(r.ticker) || r.ticker, f = r.filtre.length === 1 ? 'de filtrul ' + r.filtre[0] : 'de filtrele ' + r.filtre.join(', ');
      return '<p class="ascuns-rand"><b>' + esc(s) + '</b> · ' + esc(motiv(r)) + ' · ascunsă ' + esc(f) + ' <button type="button" data-arata-ascuns="' + esc(r.ticker) + '" aria-label="Arată ' + esc(s) + ' (scoate filtrele)">Arată</button></p>';
    }).join('');
  }
  /** Ordinele de CUMPĂRARE în așteptare din copia locală (T212Pending.read). `stare`: 'necitit' (nicio citire pe acest aparat), 'vechi' (> 6 h), 'ok'. */
  function cumparari({ pending = null, positions = [], now = Date.now() } = {}) {
    const la = pending && fin(Date.parse(pending.fetchedAt)) ? Date.parse(pending.fetchedAt) : null;
    if (!pending || !Array.isArray(pending.items) || la === null) return { stare: 'necitit', la: null, rows: [] };
    const detinute = new Set((positions || []).map((p) => p && p.ticker));
    const rows = pending.items.filter((o) => o && o.side === 'BUY' && tickerBun(o.ticker)).map((o) => ({
      ticker: o.ticker, quantity: fin(o.quantity) ? Math.abs(o.quantity) : null, type: typeof o.type === 'string' ? o.type : null,
      limitPrice: fin(o.limitPrice) ? o.limitPrice : null, stopPrice: fin(o.stopPrice) ? o.stopPrice : null,
      createdAt: fin(Date.parse(o.createdAt)) ? Date.parse(o.createdAt) : null, inPortofoliu: detinute.has(o.ticker),
    }));
    return { stare: now - la > MAX_AGE ? 'vechi' : 'ok', la, rows };
  }
  /** Rândul „Ordine de cumpărare în așteptare” — gol când nu există niciunul la o citire proaspătă (nu zgomot pe fiecare deschidere). */
  function markupCumparari(r, { symbol = (t) => t } = {}) {
    if (!r || r.stare === 'necitit' || !r.rows.length) return '';
    const lista = r.rows.map((o) => {
      const s = symbol(o.ticker) || o.ticker, parti = [esc(s), o.quantity !== null ? esc(nr(o.quantity)) + ' buc.' : null, o.type ? esc(o.type) : null,
        o.limitPrice !== null ? 'limită ' + esc(nr(o.limitPrice)) : null, o.stopPrice !== null ? 'stop ' + esc(nr(o.stopPrice)) : null,
        o.createdAt !== null ? 'pus ' + esc(ora(o.createdAt)) : null, o.inPortofoliu ? 'completează poziția' : 'nu e încă poziție'].filter(Boolean);
      return '<li>' + parti.join(' · ') + '</li>';
    }).join('');
    return '<b>' + r.rows.length + (r.rows.length === 1 ? ' ordin de cumpărare în așteptare' : ' ordine de cumpărare în așteptare') + '</b> — devine poziție doar la execuție (Trading 212 execută în ședința de bursă). <ul>' + lista + '</ul><small>Ordinele citite la ' + esc(ora(r.la)) + (r.stare === 'vechi' ? ' · citire veche (peste 6 h), sincronizează contul' : '') + '.</small> <button type="button" data-open-broker>Cont · broker →</button>';
  }
  g.HoldingsAscunse = { ZILE, MAX_AGE, FILTRE, recente, filtre, ascunse, markup, cumparari, markupCumparari };
})(typeof window !== 'undefined' ? window : globalThis);
