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
  const MIN = 60000, TAKEOVER_MS = 15 * MIN, SETTLE_MS = 90000, FUTURE_MS = 5 * MIN;
  function json(storage, key, fallback) { try { const v = JSON.parse(storage.getItem(key) || 'null'); return v === null ? fallback : v; } catch (_) { return fallback; } }
  function setting(storage) { const v = json(storage, KEY, null); return !(v && v.reader === false); }
  function setSetting(storage, on) { storage.setItem(KEY, JSON.stringify({ reader: !!on, at: Date.now() })); }
  function latest(storage, environment = 'live') {
    const data = json(storage, SNAPSHOT, {}); let at = 0;
    if (data && typeof data === 'object' && !Array.isArray(data)) for (const a of Object.values(data)) { if (!a || a.environment !== environment) continue; const t = Date.parse(a.fetchedAt); if (Number.isFinite(t) && t > at) at = t; }
    return at;
  }
  function own(storage, environment = 'live') { const v = json(storage, OWN, {}); const t = Number(v && v[environment]); return Number.isFinite(t) && t > 0 ? t : 0; }
  function markOwn(storage, environment, at) { if (!Number.isFinite(at) || at <= 0) return; const v = json(storage, OWN, {}); const next = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; next[environment || 'live'] = at; try { storage.setItem(OWN, JSON.stringify(next)); } catch (_) {} }
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
  g.TTT212Reader = { KEY, OWN, TAKEOVER_MS, SETTLE_MS, setting, setSetting, latest, own, markOwn, decide, describe };
})(typeof window !== 'undefined' ? window : globalThis);
