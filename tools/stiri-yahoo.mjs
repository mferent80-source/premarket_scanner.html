// 13.11.2026 (auditul Discordului): știrile acțiunilor listate în afara SUA vin din Yahoo RSS - Finnhub company-news le refuza (403,
// planul gratuit), la fiecare rulare, de la ~07.10. Aceeași sursă ca știrile pe acțiune din Crypto Radar (functions/api/stiri.js).
// Articolele ies în forma Finnhub, ca restul robotului (headline, summary, url, datetime în secunde, source, id). Probat în stiri-yahoo.test.mjs.

// sufixul bursei Yahoo (ASM.AS, ABB.ST, DSY.PA, RHM.DE, BARC.L…); clasele americane (BRK.B, BF.B) au o singură literă și rămân pe Finnhub
export const inAfaraSUA = (sym) => /\.[A-Z]{2,4}$/.test(String(sym || '').trim().toUpperCase()) || /\.L$/.test(String(sym || '').trim().toUpperCase());

export const urlYahoo = (sym) => `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(sym)}&region=US&lang=en-US`;

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function text(s) {
  let t = String(s || '').replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1');
  t = t.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m));
  return t.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
const camp = (item, tag) => { const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(item); return m ? text(m[1]) : ''; };

export function articoleDinRss(xml) {
  const out = [];
  for (const m of String(xml || '').matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const it = m[1], headline = camp(it, 'title'); if (!headline) continue;
    const url = camp(it, 'link'), t = Date.parse(camp(it, 'pubDate'));
    out.push({ headline, summary: camp(it, 'description'), url, datetime: Number.isFinite(t) ? Math.floor(t / 1000) : 0, source: 'Yahoo Finance', id: camp(it, 'guid') || url });
  }
  return out;
}
