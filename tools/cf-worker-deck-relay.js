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
// Securitate: scrierea/citirea pe token (daca secretii sunt setati); CORS
// permis DOAR pentru GitHub Pages-ul suitei + localhost (dev).
// ═══════════════════════════════════════════════════════════════════
const ALLOW_ORIGIN = 'https://mferent80-source.github.io';
const KV_TTL_SEC = 7 * 24 * 3600; // 7 zile — intrarile stale expira singure
const LIST_MAX = 100;

function corsHeaders(origin) {
  const ok = !origin || origin === ALLOW_ORIGIN || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': ok ? (origin || '*') : ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) });

    // ── POST / — webhook-ul TradingView ──────────────────────────────
    if (req.method === 'POST') {
      if (env.WRITE_TOKEN && url.searchParams.get('t') !== env.WRITE_TOKEN)
        return json({ error: 'token gresit' }, 403, origin);

      let payload;
      try { payload = await req.json(); }
      catch { return json({ error: 'body-ul nu e JSON' }, 400, origin); }

      // dialectul de familie cere minim deck+ticker+tf+event; ce nu-l are
      // (alerte straine) se forwardeaza dar nu se stocheaza
      // I-322: normalizeaza journal_tag din payload sau din event (AVWAP/SLEV/FLIP)
      const body = payload && typeof payload === 'object' ? { ...payload } : {};
      if (!body.journal_tag && body.event && typeof body.event === 'string') {
        const map = {
          AVWAP_RECLAIM: 'value_reclaim',
          AVWAP_LOST: 'value_lost',
          AVWAP_ALIGN: 'value_align',
          SOURCE_FLIP: 'source_flip',
          SLEV_PDH_BREAK: 'pdh_break',
          SLEV_PDH_LOST: 'pdh_lost',
          SLEV_PDL_BREAK: 'pdl_break',
          SLEV_PDL_RECLAIM: 'pdl_reclaim',
        };
        if (map[body.event]) body.journal_tag = map[body.event];
      }
      // I-323 light: daca payload are mute_hint=1 sau z_abs >= z_mute, marcheaza forward_soft
      // (relay-ul vechi Telegram poate ignora; stocarea KV pastreaza tot)
      if (body.mute_hint === 1 || body.mute_hint === true || body.mute_hint === '1') {
        body.forward_soft = true;
      }
      const { deck, ticker, tf, event } = body;
      let stored = false;
      if (env.DECK_KV && deck && ticker && tf && event) {
        const key = `${deck}:${ticker}:${tf}:${event === 'PING' ? 'ping' : 'last'}`;
        await env.DECK_KV.put(key, JSON.stringify({ ...body, received_at: new Date().toISOString() }), { expirationTtl: KV_TTL_SEC });
        stored = true;
      }
      // rebind payload for forward
      payload = body;

      // lantul spre relay-ul vechi (Telegram) — best-effort; skip daca forward_soft (I-323)
      let forwarded = null;
      if (env.FORWARD_URL && !body.forward_soft) {
        try {
          const r = await fetch(env.FORWARD_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          forwarded = r.status;
        } catch (e) { forwarded = 'error: ' + (e && e.message); }
      } else if (body.forward_soft) {
        forwarded = 'skipped_soft';
      }
      return json({ stored, forwarded, journal_tag: body.journal_tag || null }, 200, origin);
    }

    // ── GET /latest — ultimele payload-uri (pt. pagina de familie) ───
    if (req.method === 'GET' && url.pathname === '/latest') {
      if (env.READ_TOKEN && url.searchParams.get('t') !== env.READ_TOKEN)
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
