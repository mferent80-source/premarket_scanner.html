// ═══════════════════════════════════════════════════════════════════
// DECK RELAY CU MEMORIE — Cloudflare Worker pentru familia de deck-uri Pine
// (JMA, PPST, ZLTOP, LCD, TPL etc. — dialectul standard deck/ver/event/ticker/tf).
// Worker-ul e AGNOSTIC de familie: orice payload cu deck+ticker+tf+event se
// stocheaza — un deck nou (ex. TPL, 2026-08-03) intra fara nicio modificare aici.
//
// CE FACE:
//   1. PRIMESTE webhook-urile TradingView (POST cu JSON-ul alertei).
//   2. STOCHEAZA in KV ultimul payload per deck:ticker:tf (+ PING-ul separat) —
//      memoria care lipsea relay-ului vechi; deblocheaza dashboard-ul de
//      familie (pagina PWA care arata FLIP LA / marja live pe toate simbolurile).
//   3. FORWARDEAZA payload-ul mai departe la relay-ul VECHI (cel care trimite
//      pe Telegram), daca FORWARD_URL e setat — lant, zero risc: relay-ul vechi
//      ramane neatins, doar isi primeste traficul printr-o statie in plus.
//   4. SERVESTE datele: GET /latest → ultimele payload-uri (pt. pagina PWA).
//
// SETUP (o singura data, ~10 minute):
//   1. dash.cloudflare.com → Workers & Pages → Create Worker → nume `deck-relay`
//      → Deploy → Edit code → lipeste TOT fisierul asta → Deploy.
//   2. KV: Workers & Pages → KV → Create namespace → nume `DECK_KV`.
//      In worker: Settings → Bindings → Add → KV Namespace →
//        Variable name: DECK_KV   ·   KV namespace: DECK_KV   → Deploy.
//   3. (optional, recomandat) Settings → Variables and Secrets:
//        FORWARD_URL  (Secret) = URL-ul relay-ului VECHI de Telegram.
//                     Fara el, worker-ul doar stocheaza (nu mai ajunge nimic
//                     pe Telegram — seteaza-l daca vrei lantul complet!).
//        WRITE_TOKEN  (Secret) = parola de scriere. Daca e setata, webhook-ul
//                     TV trebuie sa aiba ?t=<token> in URL.
//        READ_TOKEN   (Secret) = parola de citire pt GET /latest (analog).
//   4. In TradingView, la alerta "Any alert() function call":
//        Webhook URL:  https://deck-relay.<cont>.workers.dev/?t=<WRITE_TOKEN>
//      (inlocuieste URL-ul vechi; relay-ul vechi primeste tot, prin FORWARD_URL).
//
// CITIRE (pt. viitoarea pagina de familie sau curl):
//   GET /latest?t=<READ_TOKEN>            → toate intrarile (max 100)
//   GET /latest?deck=JMA&t=<READ_TOKEN>   → doar deck-ul JMA
//   Raspuns: [{key, event, deck, ticker, tf, ver, received_at, ...payload}]
//
// CHEI KV:  <deck>:<ticker>:<tf>:last  = ultimul event non-PING
//           <deck>:<ticker>:<tf>:ping  = ultimul PING (setarile alertei)
//   TTL 7 zile — un simbol care nu mai trimite nimic dispare singur din lista.
//
// Securitate: scrierea/citirea pe token (daca secretii sunt setati, comparati
// in timp constant); CORS permis DOAR pentru GitHub Pages-ul suitei.
//
// STAREA PAGINII ALERTE (27.10.2026, I-756) — /alerte/stare, vezi mai jos.
//   5. Settings → Variables and Secrets, doua secrete noi, apoi Deploy:
//        GH_ALERTE_TOKEN (Secret) = token GitHub fine-grained: Only select repositories →
//                     premarket_scanner.html, Permissions → Contents: Read and write.
//        ALERTE_CHEIE  (Secret) = o cheie aleatoare de cel putin 32 de caractere; aceeasi
//                     se pune o data in pagina Alerte (⋯ → 🔑 Cheia releului).
//      Tokenul vechi din browser (gh_repo_token) se revoca pe GitHub dupa trecere.
// ═══════════════════════════════════════════════════════════════════
const ALLOW_ORIGIN = 'https://mferent80-source.github.io';
const KV_TTL_SEC = 7 * 24 * 3600; // 7 zile — intrarile stale expira singure
const LIST_MAX = 100;

// 27.10.2026 (audit E B4): CORS doar pentru GitHub Pages-ul suitei (localhost scos: nu mai e nevoie de el, iar tokenele de mai jos
// se compară în timp constant, nu cu `!==`).
function corsHeaders(origin) {
  const ok = !origin || origin === ALLOW_ORIGIN;
  return {
    'Access-Control-Allow-Origin': ok ? (origin || '*') : ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Alerte-Cheie',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

async function egal(a, b) {
  const h = async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s))));
  const [x, y] = await Promise.all([h(a), h(b)]);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

// ── 27.10.2026 (I-756, audit E Y3): starea paginii Alerte pe GitHub PRIN releu ─────────────────────────────────────────
// Înainte pagina ținea în localStorage un token GitHub cu scriere pe TOT depozitul: un XSS putea comite în main, iar GitHub Pages
// publica orice pagină a aplicației (inclusiv cea cu seiful Trading 212). Acum tokenul (secretul GH_ALERTE_TOKEN: fine-grained, doar
// depozitul premarket_scanner.html, Contents: Read and write) stă AICI, iar releul scrie DOAR tools/alerts.json și tools/news-watch.json,
// cu schema verificată și unirea făcută pe server: istoricul `triggered` rămâne, `seen` / `eventSeen` se unesc cu ce a acumulat robotul,
// `_meta` rămâne al robotului. Poarta: Origin-ul suitei + antetul X-Alerte-Cheie = ALERTE_CHEIE (secret, ≥ 32 de caractere, comparat în
// timp constant). În browser rămâne doar cheia asta, care nu poate atinge nimic în afară de cele două fișiere.
//   GET  /alerte/stare?fisier=alerts|news-watch   → conținutul proaspăt (fără întârzierea GitHub Pages)
//   POST /alerte/stare  {fisier, continut}         → commit pe main, cu o reîncercare la 409 (robotul tocmai a comis)
const REPO = 'mferent80-source/premarket_scanner.html', FISIERE = { alerts: 'tools/alerts.json', 'news-watch': 'tools/news-watch.json' };
const MAX_CORP = 786432, /* 27.10 (revizia lotului 2): News ~175 KB azi, crește ⇒ 768 KB, sub 1 MB (limita API-ului GitHub pentru conținut) */ SEEN_CAP = 300, EVENT_SEEN_CAP = 80;
const DOC = { alerts: 'Lista de simboluri urmărite din pagina /alerts/ (fără praguri din v116), scrisă prin releul deck-relay.', 'news-watch': 'News Watch pro desk — big filter, digest, quiet hours, earnings pre-pack, EU map. Gestionat din /alerts/.' };
function b64(s) { const b = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(bin); }
function deb64(s) { return new TextDecoder().decode(Uint8Array.from(atob(String(s || '').replace(/\s/g, '')), (c) => c.charCodeAt(0))); }
const obiect = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const primitiv = (v) => v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 300);
const sir = (v, n = 300) => typeof v === 'string' && v.length <= n;
const siruri = (v, max) => Array.isArray(v) && v.length <= max && v.every((x) => sir(x));
function valid(fisier, c) {
  if (!obiect(c)) return false;
  if (fisier === 'alerts') return Array.isArray(c.alerts) && c.alerts.length <= 500 && c.alerts.every((a) => obiect(a) && typeof a.symbol === 'string' && /^[A-Za-z0-9.^=_-]{1,24}$/.test(a.symbol) && Object.values(a).every(primitiv));
  return Array.isArray(c.watches) && c.watches.length <= 200 && (c.settings === undefined || (obiect(c.settings) && JSON.stringify(c.settings).length <= 4000))
    && c.watches.every((w) => obiect(w) && sir(w.id, 64) && sir(w.symbol, 24) && Object.entries(w).every(([k, v]) =>
      k === 'seen' ? siruri(v, 2000) : k === 'eventSeen' ? siruri(v, 1000) : k === 'keywords' || k === 'sources' ? siruri(v, 50)
        : k === 'nextEarnings' ? v === null || (obiect(v) && Object.values(v).every(primitiv)) : primitiv(v)));
}
function unire(fisier, local, remote) {
  if (fisier === 'alerts') return { _doc: (remote && sir(remote._doc, 1000) && remote._doc) || DOC.alerts, alerts: local.alerts, triggered: remote && Array.isArray(remote.triggered) ? remote.triggered : [] };
  const rw = new Map((remote && Array.isArray(remote.watches) ? remote.watches : []).filter((w) => obiect(w) && w.id).map((w) => [w.id, w]));
  const uniti = (a, b, cap) => [...new Set([...(a || []), ...(Array.isArray(b) ? b : [])])].slice(-cap);
  const watches = local.watches.map((w) => {
    const r = rw.get(w.id), n = { ...w, seen: uniti(w.seen, r && r.seen, SEEN_CAP), eventSeen: uniti(w.eventSeen, r && r.eventSeen, EVENT_SEEN_CAP) };
    if (r && !n.lastCheck && r.lastCheck) n.lastCheck = r.lastCheck;
    if (r && !n.nextEarnings && r.nextEarnings) n.nextEarnings = r.nextEarnings;
    return n;
  });
  return { _doc: DOC['news-watch'], version: 2, settings: local.settings || (remote && remote.settings) || {}, _meta: remote && obiect(remote._meta) ? remote._meta : {}, watches };
}
export async function alerteStare(req, env, upstream = fetch) {
  const h = { 'Access-Control-Allow-Origin': ALLOW_ORIGIN, 'Vary': 'Origin', 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  const raspuns = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: h });
  if (req.headers.get('Origin') !== ALLOW_ORIGIN) return raspuns({ error: 'origine_interzisa' }, 403);
  if (!env.GH_ALERTE_TOKEN || !env.ALERTE_CHEIE || String(env.ALERTE_CHEIE).length < 32) return raspuns({ error: 'releu_neconfigurat' }, 503);
  if (!(await egal(req.headers.get('X-Alerte-Cheie') || '', env.ALERTE_CHEIE))) return raspuns({ error: 'cheie_gresita' }, 403);
  const gh = (path, init = {}) => upstream('https://api.github.com/repos/' + REPO + '/contents/' + path + (init.method ? '' : '?ref=main'), {
    ...init, signal: AbortSignal.timeout(15000),
    headers: { Authorization: 'Bearer ' + env.GH_ALERTE_TOKEN, Accept: 'application/vnd.github+json', 'User-Agent': 'deck-relay-alerte', 'X-GitHub-Api-Version': '2022-11-28', ...(init.body ? { 'Content-Type': 'application/json' } : {}) } });
  async function citeste(path) {
    const r = await gh(path); if (r.status === 404) return { sha: null, continut: null };
    if (!r.ok) throw Object.assign(Error('github'), { status: r.status });
    const j = await r.json(); return { sha: j.sha, continut: JSON.parse(deb64(j.content)) };
  }
  try {
    if (req.method === 'GET') {
      const f = new URL(req.url).searchParams.get('fisier'); if (!Object.hasOwn(FISIERE, f)) return raspuns({ error: 'fisier_necunoscut' }, 400);
      const x = await citeste(FISIERE[f]); return x.continut === null ? raspuns({ error: 'fisier_lipsa' }, 404) : raspuns({ ok: true, fisier: f, continut: x.continut });
    }
    if (req.method !== 'POST') return raspuns({ error: 'metoda_nepermisa' }, 405);
    if (!/^application\/json\b/.test(req.headers.get('Content-Type') || '')) return raspuns({ error: 'corp_invalid' }, 415);
    const text = await req.text(); if (text.length > MAX_CORP) return raspuns({ error: 'corp_prea_mare' }, 413);
    let corp; try { corp = JSON.parse(text); } catch (_) { return raspuns({ error: 'corp_invalid' }, 400); }
    const f = corp && corp.fisier; if (!Object.hasOwn(FISIERE, f) || !valid(f, corp.continut)) return raspuns({ error: 'schema_invalida' }, 400);
    for (let incercare = 0; incercare < 2; incercare++) {
      const x = await citeste(FISIERE[f]), out = unire(f, corp.continut, x.continut), n = f === 'alerts' ? out.alerts.length : out.watches.length;
      const p = await gh(FISIERE[f], { method: 'PUT', body: JSON.stringify({ message: `chore(${f}): sync din /alerts/ prin releu (${n} ${f === 'alerts' ? 'simboluri' : 'watches'})`, content: b64(JSON.stringify(out, null, 2) + '\n'), branch: 'main', ...(x.sha ? { sha: x.sha } : {}) }) });
      if (p.status === 409) continue;
      if (!p.ok) return raspuns({ error: 'github_' + p.status }, 502);
      let j = {}; try { j = await p.json(); } catch (_) { j = {}; }
      return raspuns({ ok: true, fisier: f, commit: String((j.commit && j.commit.sha) || '').slice(0, 7), n, continut: out });
    }
    return raspuns({ error: 'conflict' }, 409);
  } catch (e) { return raspuns({ error: e && e.status ? 'github_' + e.status : 'github_indisponibil' }, 502); }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (url.pathname === '/alerte/stare') return alerteStare(req, env);

    // ── POST / — webhook-ul TradingView ──────────────────────────────
    // (TradingView nu poate pune antete: tokenul rămâne în ?t=, dar se compară în timp constant)
    if (req.method === 'POST') {
      if (env.WRITE_TOKEN && !(await egal(url.searchParams.get('t') || '', env.WRITE_TOKEN)))
        return json({ error: 'token gresit' }, 403, origin);

      let payload;
      try { payload = await req.json(); }
      catch { return json({ error: 'body-ul nu e JSON' }, 400, origin); }

      // dialect: deck + (ticker|symbol) + tf + event
      // Pine emite de obicei "symbol"; PATH uneori "ticker" — acceptam ambele (audit fix)
      const body = payload && typeof payload === 'object' ? { ...payload } : {};
      const deck = body.deck;
      const ticker = body.ticker || body.symbol;
      const tf = body.tf;
      const event = body.event;
      if (ticker && !body.ticker) body.ticker = ticker;
      if (ticker && !body.symbol) body.symbol = ticker;

      // I-322: journal_tag din event (overwrite pe allowlist — nu lasa client sa minta event-ul)
      const tagMap = {
        AVWAP_RECLAIM: 'value_reclaim',
        AVWAP_LOST: 'value_lost',
        AVWAP_ALIGN: 'value_align',
        SOURCE_FLIP: 'source_flip',
        SLEV_PDH_BREAK: 'pdh_break',
        SLEV_PDH_LOST: 'pdh_lost',
        SLEV_PDL_BREAK: 'pdl_break',
        SLEV_PDL_RECLAIM: 'pdl_reclaim',
        SLEV_OPEN_UP: 'open_up',
        SLEV_OPEN_DN: 'open_dn',
        VP_VA_RECLAIM: 'va_reclaim',
        VP_VA_LOST: 'va_lost',
        VP_POC_CROSS: 'poc_cross',
        VP_CHASE: 'vp_chase',
        VP_VALUE_OK: 'value_ok',
      };
      if (event && tagMap[event]) body.journal_tag = tagMap[event];

      // I-323: soft-mute pe mute_hint SAU z_ema/z_abs >= z_mute
      const zMute = Number(body.z_mute != null ? body.z_mute : (env.Z_MUTE || 2));
      const zAbs = Number(body.z_abs != null ? body.z_abs : (body.z_ema != null ? body.z_ema : NaN));
      const muteHint = body.mute_hint === 1 || body.mute_hint === true || body.mute_hint === '1';
      const softByZ = Number.isFinite(zAbs) && Number.isFinite(zMute) && Math.abs(zAbs) >= zMute;
      const forwardSoft = muteHint || softByZ || body.forward_soft === true || body.forward_soft === 1 || body.forward_soft === '1';
      if (forwardSoft) body.forward_soft = true;

      let stored = false;
      if (env.DECK_KV && deck && ticker && tf && event) {
        const key = `${deck}:${ticker}:${tf}:${event === 'PING' ? 'ping' : 'last'}`;
        await env.DECK_KV.put(key, JSON.stringify({ ...body, received_at: new Date().toISOString() }), { expirationTtl: KV_TTL_SEC });
        stored = true;
      }
      payload = body;

      let forwarded = null;
      if (env.FORWARD_URL && !forwardSoft) {
        try {
          const r = await fetch(env.FORWARD_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          forwarded = r.status;
        } catch (e) { forwarded = 'error: ' + (e && e.message); }
      } else if (forwardSoft) {
        forwarded = 'skipped_soft';
      }
      return json({ stored, forwarded, journal_tag: body.journal_tag || null, ticker }, 200, origin);
    }

    // ── GET /latest — ultimele payload-uri (pt. pagina de familie) ───
    if (req.method === 'GET' && url.pathname === '/latest') {
      if (env.READ_TOKEN && !(await egal(url.searchParams.get('t') || '', env.READ_TOKEN)))
        return json({ error: 'token gresit' }, 403, origin);
      if (!env.DECK_KV) return json({ error: 'KV nebindat (vezi SETUP pasul 2)' }, 500, origin);

      const deck = url.searchParams.get('deck');
      const prefix = deck ? `${deck}:` : '';
      const list = await env.DECK_KV.list({ prefix, limit: LIST_MAX });
      const out = [];
      for (const k of list.keys) {
        const v = await env.DECK_KV.get(k.name);
        if (v) { try { out.push({ key: k.name, ...JSON.parse(v) }); } catch { /* intrare corupta — sarita */ } }
      }
      return json(out, 200, origin);
    }

    return json({ error: 'foloseste POST / (webhook TV) sau GET /latest' }, 404, origin);
  },
};
