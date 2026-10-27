/* 17.10.2026 (I-692) — limita de pierdere pe lună care oprește, nu doar arată: rezultatul lunii (vânzările Trading 212 cu rezultat,
   luna calendaristică în ora României) față de limita pusă de tine. 20.10.2026 (I-721): Governor o citește (GV.monthlyState) — depășită ⇒ HALTED
   pentru planuri noi, ≥ 75 % / necitită ⇒ CAUTION; nu blochează brokerul (nu trimite ordine), e regula ta scrisă dinainte, aplicată în aplicație.
   Limita stă în „Setările jurnalului” (tt_journal_settings_v1), cheie sincronizată între dispozitive. Rezultatul lunii e calculat pe fiecare
   dispozitiv din execuțiile lui ⇒ cheie LOCALĂ (tt_journal_luna_t212_v1), nesincronizată — scris în setări, ar fi creat conflicte de sincronizare
   la fiecare rescriere (revizia 17.10). Îl recalculează pagina contului (broker/) după fiecare sincronizare, Jurnalul și Planurile; Astăzi îl citește. */
(function (g) {
  'use strict';
  const fin = Number.isFinite, K_SET = 'tt_journal_settings_v1', K_VECHI = 'tt_journal_limita_luna_v1', K_LUNA = 'tt_journal_luna_t212_v1', DAY = 86400000;
  /* 27.10.2026 (I-751, audit C 🔵 12): luna pe sesiunea NEW YORK (CT.lunaNY), ca ziua și săptămâna din Governor — o vânzare la 19:00 NY pe 31 nu mai sare în luna următoare */
  const F_NY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }), lunaDe = (t) => (g.CT && typeof g.CT.lunaNY === 'function' ? g.CT.lunaNY(t) : F_NY.format(t).slice(0, 7));
  const F_N1 = new Intl.NumberFormat('ro-RO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), LEI = { RON: 'lei', EUR: '€', USD: '$', GBP: '£' };
  const bani = (v, m) => (v < 0 ? '−' : '') + F_N1.format(Math.abs(v)) + ' ' + (LEI[m] || m || '');
  function setari(storage = g.localStorage) { try { const v = JSON.parse(storage.getItem(K_SET) || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (_) { return {}; } }
  /** Scrie câmpuri în setările jurnalului păstrând restul (aceeași regulă ca JR.saveSettings). */
  function scrie(patch, storage = g.localStorage) {
    if (storage === g.localStorage && g.JR && typeof g.JR.saveSettings === 'function') return g.JR.saveSettings(patch);
    try { storage.setItem(K_SET, JSON.stringify({ ...setari(storage), ...patch })); return true; } catch (_) { return false; }
  }
  function limita(storage = g.localStorage) {
    let v = Number(setari(storage).limitaLuna);
    if (!(v > 0)) { try { const o = Number(storage.getItem(K_VECHI)); if (o > 0) { v = o; scrie({ limitaLuna: o }, storage); storage.removeItem(K_VECHI); } } catch (_) { /* fără cheia veche */ } }
    return v > 0 ? v : null;
  }
  function puneLimita(v, storage = g.localStorage) { return scrie({ limitaLuna: Number(v) > 0 ? Number(v) : null }, storage); }
  /** Rezultatul lunii curente din execuții (forma registrului Trading 212). */
  function dinExecutii(items, { moneda = null, now = Date.now() } = {}) {
    const luna = lunaDe(now), vanzari = (items || []).filter((x) => x && (x.type == null || x.type === 'TRADE') && x.side === 'SELL' && fin(x.realized) && /^[A-Z]{3}$/.test(x.currency || ''));
    if (!moneda) { const n = new Map(); for (const x of vanzari) n.set(x.currency, (n.get(x.currency) || 0) + 1); moneda = [...n].sort((a, b) => b[1] - a[1])[0]?.[0] || null; }
    const xs = vanzari.filter((x) => x.currency === moneda && fin(Date.parse(x.date)) && lunaDe(Date.parse(x.date)) === luna);
    return { luna, rez: Math.round(xs.reduce((a, x) => a + x.realized, 0) * 100) / 100, n: xs.length, moneda, la: now };
  }
  function citesteLuna(storage = g.localStorage) { try { const v = JSON.parse(storage.getItem(K_LUNA) || 'null'); return v && typeof v === 'object' ? v : null; } catch (_) { return null; } }
  function salveazaLuna(st, storage = g.localStorage) { const v = citesteLuna(storage); if (v && v.luna === st.luna && v.rez === st.rez && v.n === st.n && st.la - v.la < 3600000) return true; try { storage.setItem(K_LUNA, JSON.stringify(st)); return true; } catch (_) { return false; } }
  /** Din registrul paginii (T212FillsStore + snapshot), dacă pagina le are. */
  async function reimprospateaza({ now = Date.now() } = {}) {
    const S = g.T212FillsStore, P = g.T212Performance; if (!S || !P || typeof P.read !== 'function') return null;
    try { await S.ready(); const rep = P.read(); if (!rep || !Array.isArray(rep.rows) || !rep.rows.length) return null; const st = dinExecutii(rep.rows, { moneda: rep.currency || null, now }); salveazaLuna(st); return st; } catch (_) { return null; }
  }
  function stare({ storage = g.localStorage, now = Date.now() } = {}) {
    const lim = limita(storage), l = citesteLuna(storage);
    if (!lim) return { stare: 'nesetat', limita: null };
    if (!l || l.luna !== lunaDe(now) || !fin(l.rez)) return { stare: 'neverificat', limita: lim, luna: lunaDe(now) };
    const folosit = l.rez < 0 ? (-l.rez / lim) * 100 : 0;
    return { ...l, limita: lim, folosit, vechi: now - l.la > 3 * DAY, stare: folosit >= 100 ? 'depasit' : folosit >= 75 ? 'aproape' : 'ok' };
  }
  /** Textul pentru Astăzi / Planuri / Governor; null când nu e nimic de spus (ok sau nesetat). */
  function text(st, now = Date.now()) {
    if (!st || st.stare === 'nesetat' || st.stare === 'ok') return null;
    const luna = new Date(Date.parse((st.luna || lunaDe(now)) + '-15T12:00:00Z')).toLocaleDateString('ro-RO', { month: 'long', timeZone: 'UTC' });
    const urm = new Date(Date.UTC(+(st.luna || lunaDe(now)).slice(0, 4), +(st.luna || lunaDe(now)).slice(5, 7), 1)).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', timeZone: 'UTC' });
    const cand = st.vechi ? ` (rezultatul din ${new Date(st.la).toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit' })}; sincronizează contul)` : '';
    if (st.stare === 'neverificat') return { grav: 1, text: 'Limita lunară e pusă, dar rezultatul lunii încă nu e citit din execuții: deschide Jurnal → Raport sau sincronizează contul.' };
    if (st.stare === 'depasit') return { grav: 4, text: `⛔ Limita lunară e depășită: ${bani(st.rez, st.moneda)} în ${luna}, limita ${bani(st.limita, st.moneda)}. Pauză de la intrări noi până pe ${urm} — regula ta, scrisă dinainte.${cand}` };
    return { grav: 3, text: `⚠ Ai pierdut ${bani(-st.rez, st.moneda)} din ${bani(st.limita, st.moneda)} în ${luna} (${F_N1.format(st.folosit)}% din limita lunară). Mai ai ${bani(st.limita + st.rez, st.moneda)} până la ea.${cand}` };
  }
  g.MonthlyLimit = { K_SET, K_LUNA, setari, scrie, limita, puneLimita, dinExecutii, citesteLuna, salveazaLuna, reimprospateaza, stare, text, lunaDe };
})(typeof window !== 'undefined' ? window : globalThis);
