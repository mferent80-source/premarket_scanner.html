/* 19.10.2026 (I-713): un singur aparat citește Trading 212. Celălalt nu mai cere T212 la 60 s din pagina ascunsă a contului:
   primește instantaneul prin sincronizare (tt_trading212_portfolio_v1, cel mai nou fetchedAt câștigă).
   Setarea stă DOAR pe aparat (tt_t212_reader_v1, nu e în cheile sincronizate). Implicit DA — ca până acum.
   Regula (decide):
   - aparatul ales (DA) citește mereu;
   - pagina contului deschisă pe ecran citește oricum (ai cerut-o tu);
   - pe aparatul cu NU: dacă ultima citire venită de pe celălalt aparat are sub 15 minute, nu citește;
     altfel PREIA singur (aparatul ales e închis), dar abia la 90 s după pornire/revenire, ca sincronizarea să aducă întâi ce e nou;
     după preluare citirea lui e cea mai nouă ⇒ continuă; când aparatul ales scrie din nou ceva mai nou ⇒ se oprește. */
(function (g) {
  'use strict';
  const KEY = 'tt_t212_reader_v1', OWN = 'tt_t212_reader_own_v1', SNAPSHOT = 'tt_trading212_portfolio_v1';
  // 27.10.2026 (auditul A [7]): toleranța la ceasul decalat între aparate urcă de la 5 la 15 minute (un telefon cu 6 min în urmă vedea citirea PC-ului
  // „din viitor”, o ignora și citea și el)
  const MIN = 60000, TAKEOVER_MS = 15 * MIN, SETTLE_MS = 90000, FUTURE_MS = 15 * MIN;
  /* 27.10.2026 (I-748, auditul A [8]): cine a citit Trading 212 și când, pe aparat — cheia SINCRONIZATĂ tt_t212_cititori_v1 ({aparat: {la, env}}), scrisă
     la o citire reușită cel mult o dată la 2 minute. Două aparate cu citiri ale aceluiași mediu în ultimele 5 minute ⇒ „doi cititori” în Setări și Health.
     Numele aparatului (tt_aparat_v1, doar local): „telefon” / „PC” + 6 caractere întâmplătoare, stabil pe dispozitiv. */
  const READERS = 'tt_t212_cititori_v1', DEVICE = 'tt_aparat_v1', READERS_EVERY = 2 * MIN, READERS_WINDOW = 5 * MIN, READERS_KEEP = 30 * 86400000, READERS_MAX = 20;
  function json(storage, key, fallback) { try { const v = JSON.parse(storage.getItem(key) || 'null'); return v === null ? fallback : v; } catch (_) { return fallback; } }
  function setting(storage) { const v = json(storage, KEY, null); return !(v && v.reader === false); }
  function setSetting(storage, on) { storage.setItem(KEY, JSON.stringify({ reader: !!on, at: Date.now() })); }
  function latest(storage, environment = 'live') {
    const data = json(storage, SNAPSHOT, {}); let at = 0;
    if (data && typeof data === 'object' && !Array.isArray(data)) for (const a of Object.values(data)) { if (!a || a.environment !== environment) continue; const t = Date.parse(a.fetchedAt); if (Number.isFinite(t) && t > at) at = t; }
    return at;
  }
  function own(storage, environment = 'live') { const v = json(storage, OWN, {}); const t = Number(v && v[environment]); return Number.isFinite(t) && t > 0 ? t : 0; }
  function markOwn(storage, environment, at) { if (!Number.isFinite(at) || at <= 0) return; const v = json(storage, OWN, {}); const next = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; next[environment || 'live'] = at; try { storage.setItem(OWN, JSON.stringify(next)); } catch (_) {} markReader(storage, environment || 'live', at); }
  function aparat(storage) {
    try { const v = storage.getItem(DEVICE); if (typeof v === 'string' && /^(telefon|PC)-[0-9a-z]{6}$/.test(v)) return v; } catch (_) { /* fără stocare: nume nou, nesalvat */ }
    let ua = ''; try { ua = String((g.navigator && g.navigator.userAgent) || ''); } catch (_) { ua = ''; }
    let sufix = ''; try { const b = new Uint8Array(6); g.crypto.getRandomValues(b); sufix = Array.from(b, (x) => (x % 36).toString(36)).join(''); } catch (_) { sufix = (Date.now() % 2176782336).toString(36).padStart(6, '0').slice(-6); }
    const nume = (/Android|iPhone|iPad|Mobile/i.test(ua) ? 'telefon' : 'PC') + '-' + sufix;
    try { storage.setItem(DEVICE, nume); } catch (_) { /* rămâne doar pentru această pagină */ }
    return nume;
  }
  function readers(storage) { const v = json(storage, READERS, {}); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function markReader(storage, environment, at) {
    try {
      const eu = aparat(storage), v = readers(storage), prev = v[eu], prevAt = prev ? Date.parse(prev.la) : NaN;
      if (Number.isFinite(prevAt) && prev.env === environment && at >= prevAt && at - prevAt < READERS_EVERY) return;
      const next = {};
      for (const [k, x] of Object.entries(v)) { const t = x ? Date.parse(x.la) : NaN; if (k !== eu && Number.isFinite(t) && at - t <= READERS_KEEP && typeof k === 'string' && k && k.length <= 100) next[k] = { la: x.la, env: typeof x.env === 'string' ? x.env.slice(0, 20) : null }; }
      next[eu] = { la: new Date(at).toISOString(), env: environment };
      const pastrate = Object.entries(next).sort((a, b) => Date.parse(b[1].la) - Date.parse(a[1].la)).slice(0, READERS_MAX);
      storage.setItem(READERS, JSON.stringify(Object.fromEntries(pastrate)));
    } catch (_) { /* stocare plină: citirea proprie (OWN) e deja notată */ }
  }
  /** Aparatele care au citit `environment` în ultimele 5 minute; null când e unul singur (sau niciunul). */
  function doiCititori(storage, environment = 'live', now = Date.now()) {
    let eu = null; try { eu = storage.getItem(DEVICE); } catch (_) { eu = null; }
    const lista = Object.entries(readers(storage)).map(([k, x]) => ({ aparat: k, la: x ? Date.parse(x.la) : NaN, env: x && x.env })).filter((x) => x.env === environment && Number.isFinite(x.la) && now - x.la <= READERS_WINDOW && x.la - now <= FUTURE_MS).sort((a, b) => b.la - a.la || a.aparat.localeCompare(b.aparat)).map((x) => ({ ...x, eu: x.aparat === eu }));
    if (lista.length < 2) return null;
    const cand = (x) => x.aparat + ' (' + (x.eu ? 'acesta, ' : '') + ago(Math.max(0, now - x.la)) + ')';
    return { aparate: lista, text: (lista.length === 2 ? 'Două aparate' : lista.length + ' aparate') + ' citesc Trading 212: ' + lista.slice(0, -1).map(cand).join(', ') + ' și ' + cand(lista[lista.length - 1]) + ' — limita de cereri a brokerului se împarte; debifează „Acest aparat citește Trading 212” pe unul dintre ele.' };
  }
  function decide({ reader = true, latestAt = 0, ownAt = 0, now = Date.now(), wokeAt = 0, visible = false } = {}) {
    const valid = latestAt > 0 && latestAt <= now + FUTURE_MS, otherAt = valid && latestAt > ownAt ? latestAt : null;
    const base = { otherAt, latestAt: valid ? latestAt : 0, ageMs: valid ? Math.max(0, now - latestAt) : null };
    if (reader) return { ...base, read: true, reason: 'aparat' };
    if (visible) return { ...base, read: true, reason: 'vizibil' };
    if (otherAt !== null && now - otherAt < TAKEOVER_MS) return { ...base, read: false, reason: 'celalalt' };
    if (otherAt === null && valid && latestAt <= ownAt) return { ...base, read: true, reason: 'preluare' };
    if (now - wokeAt < SETTLE_MS) return { ...base, read: false, reason: 'astept-sincronizarea' };
    return { ...base, read: true, reason: 'preluare' };
  }
  function ago(ms) { const m = Math.round(ms / MIN); return m < 1 ? 'acum câteva secunde' : m < 120 ? 'acum ' + m + ' min' : 'acum ' + Math.round(m / 60) + ' h'; }
  // textul vechimii, la vedere în Setări și pe pagina contului
  function describe(input) {
    const d = decide(input), mine = !(d.latestAt && d.otherAt !== null);
    const from = mine ? ' de pe acest aparat' : input && input.reader === false ? ' de pe celălalt aparat (prin sincronizare)' : ' (sincronizată)';
    const last = d.latestAt ? 'Ultima citire Trading 212' + from + ': ' + ago(d.ageMs) + '.' : 'Nicio citire Trading 212 pe acest aparat încă.';
    if (input && input.reader !== false) return last + ' Acest aparat citește contul.';
    if (d.reason === 'celalalt') return last + ' Citirea o face celălalt aparat; dacă tace peste 15 minute, preiau singur.';
    if (d.reason === 'astept-sincronizarea') return last + ' Aștept sincronizarea înainte să preiau citirea.';
    return last + ' Celălalt aparat nu a mai citit de peste 15 minute ⇒ citesc eu până revine.';
  }
  g.TTT212Reader = { KEY, OWN, READERS, DEVICE, TAKEOVER_MS, SETTLE_MS, setting, setSetting, latest, own, markOwn, decide, describe, aparat, doiCititori };
})(typeof window !== 'undefined' ? window : globalThis);
