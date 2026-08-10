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
