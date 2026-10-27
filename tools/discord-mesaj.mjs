// discord-mesaj.mjs — canalul botului de știri: Discord, prin webhook (11.10.2026).
// Marius: „aș vrea să se ducă tot pe Discord” — același canal ca alertele Crypto Radar.
// Mesajele botului sunt scrise în HTML-ul Telegram; aici devin markdown Discord.
// Webhook-ul vine din secretul DISCORD_WEBHOOK (repo → Settings → Secrets → Actions).

const LIMITA = 1900; // Discord primește cel mult 2000 de caractere în `content`

export function esteWebhookDiscord(url) {
  return /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(String(url || '').trim());
}

function entitati(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

export function htmlLaDiscord(html) {
  let s = String(html || '');
  const linkuri = []; // adresele se pun deoparte: `<https://…>` ar fi șters de curățarea etichetelor
  s = s.replace(/<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, u, t) => {
    linkuri.push(entitati(u));
    return `[${t}](\u0000${linkuri.length - 1}\u0000)`;
  });
  s = s.replace(/<\/?b>/gi, '**').replace(/<\/?strong>/gi, '**');
  s = s.replace(/<\/?i>/gi, '*').replace(/<\/?em>/gi, '*');
  s = s.replace(/<\/?code>/gi, '`');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = entitati(s);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<${linkuri[+i]}>`);
}

export function bucatiDiscord(text) {
  const bucati = [];
  let rest = String(text || '');
  while (rest.length > LIMITA) {
    let taie = rest.lastIndexOf('\n', LIMITA);
    if (taie < LIMITA * 0.5) taie = LIMITA;
    bucati.push(rest.slice(0, taie));
    rest = rest.slice(taie).replace(/^\n/, '');
  }
  if (rest) bucati.push(rest);
  return bucati;
}

// 27.10.2026 (I-764): rezumatele scrise de robot (știri, rezultate, digest) poartă eticheta — nimeni nu le-a citit înainte să plece.
export const ETICHETA_NEVERIFICAT = 'generat automat · neverificat de om';

// deps: { webhook, fetch, pauzaMs, jurnal, eticheta }. Întoarce true doar dacă Discord a primit toate bucățile.
// `eticheta` (text) se pune o singură dată, ca sub-text (-# …) la capătul ultimei bucăți.
export async function trimiteDiscord(html, d = {}) {
  const jurnal = d.jurnal || console.log;
  if (!esteWebhookDiscord(d.webhook)) {
    jurnal('⚠ DISCORD_WEBHOOK lipsă sau cu formă greșită — nesent:\n' + String(html || '').slice(0, 400));
    return false;
  }
  const f = d.fetch || fetch;
  let ok = true;
  const bucati = bucatiDiscord(htmlLaDiscord(html));
  if (d.eticheta) {
    const sub = '-# ' + String(d.eticheta).slice(0, 200), ultima = bucati.pop() || '';
    if (ultima.length + sub.length + 1 <= LIMITA) bucati.push((ultima ? ultima + '\n' : '') + sub); else bucati.push(ultima, sub);
  }
  for (const parte of bucati) {
    try {
      const r = await f(String(d.webhook).trim() + '?wait=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'Alerts · știri',
          allowed_mentions: { parse: [] }, // niciun @everyone / @here din textul unei știri
          content: parte
        }),
        signal: AbortSignal.timeout(12000)
      });
      if (!r.ok) { jurnal('⚠ Discord HTTP ' + r.status + ': ' + String(await r.text()).slice(0, 200)); ok = false; }
    } catch (e) {
      jurnal('⚠ Discord: ' + e.message);
      ok = false;
    }
    const p = d.pauzaMs == null ? 600 : d.pauzaMs;
    if (p) await new Promise(r => setTimeout(r, p));
  }
  return ok;
}
