/* 17.10.2026 — Verdictul pieței (pagina Astăzi): un rezumat după reguli fixe, scrise aici, din datele pe care pagina le are deja
   (SPY / QQQ / VIX / dobânda pe 10 ani, lățimea pieței, sectoarele, regimul macro, calendarul, știrile, pozițiile).
   Descrie contextul; NU e o predicție și nu e un semnal de cumpărare — nicio regulă de aici nu e probată ca avantaj.
   compute(input) e pur (testabil); render(v) întoarce HTML. Orice sursă lipsă e spusă, nu ghicită. */
(function (g) {
  'use strict';
  const finite = Number.isFinite, esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v, d = 1) => (finite(v) ? v.toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const LABELS = [{ min: 3, id: 'favorabil', text: 'Favorabil', tone: 'ok' }, { min: 0, id: 'neutru', text: 'Neutru', tone: 'info' }, { min: -2, id: 'prudent', text: 'Prudent', tone: 'warn' }, { min: -Infinity, id: 'defensiv', text: 'Defensiv', tone: 'bad' }];
  const DEFENSIVE = new Set(['Utilities', 'Consumer Defensive', 'Healthcare', 'Real Estate']);
  const CYCLICAL = new Set(['Technology', 'Consumer Cyclical', 'Industrials', 'Financial', 'Financial Services', 'Communication Services', 'Basic Materials', 'Energy']);
  const SECT_RO = { Technology: 'tehnologie', 'Consumer Cyclical': 'consum ciclic', Industrials: 'industrie', Financial: 'financiar', 'Financial Services': 'financiar', 'Communication Services': 'comunicații', 'Basic Materials': 'materiale', Energy: 'energie', Utilities: 'utilități', 'Consumer Defensive': 'consum de bază', Healthcare: 'sănătate', 'Real Estate': 'imobiliare' };
  const EVENT_RO = { 'FOMC Rate Decision': 'Fed — decizia de dobândă', 'FOMC Press Conference': 'Fed — conferința de presă', 'Non-Farm Payrolls + Unemployment Rate': 'Locurile de muncă (NFP) și șomajul', 'CPI YoY + Core CPI': 'Inflația (CPI)', 'PPI YoY': 'Prețurile producției (PPI)', 'Initial Jobless Claims': 'Cererile de șomaj', 'Retail Sales MoM': 'Vânzările cu amănuntul', 'ISM Manufacturing PMI': 'Industria (ISM)' };
  // Linkurile știrilor: doar https, fără nume / parolă în adresă (la fel ca renderNews din Astăzi); altfel titlul rămâne text.
  const safeURL = (u) => { try { const x = new URL(String(u || '')); return x.protocol === 'https:' && !x.username && !x.password ? x.href : null; } catch (_) { return null; } };
  const sma = (xs, n) => (xs.length >= n ? xs.slice(-n).reduce((a, b) => a + b, 0) / n : null);

  /* Fiecare indicator: { id, name, value, reading, score (−2..+1) sau null = necitit, why (frază scurtă pentru verdict) }. */
  function trend(items) {
    const one = (sym) => {
      const m = items.find((x) => x.symbol === sym); if (!m || m.state !== 'ready' || !finite(m.price)) return null;
      const closes = (m.points || []).map((p) => p.value).filter(finite), s50 = m.indicators?.sma50 ?? sma(closes, 50), s200 = sma(closes, 200);
      if (!finite(s50) || !finite(s200)) return null;
      const a50 = m.price > s50, a200 = m.price > s200;
      return { sym, a50, a200, s: a50 && a200 ? 1 : !a50 && !a200 ? -1 : 0, d200: (m.price / s200 - 1) * 100 };
    };
    const xs = ['SPY', 'QQQ'].map(one).filter(Boolean);
    if (!xs.length) return { id: 'trend', name: 'Trendul (SPY, QQQ)', value: '—', reading: 'Seriile SPY / QQQ nu sunt confirmate acum.', score: null };
    const sc = Math.round(xs.reduce((a, x) => a + x.s, 0) / xs.length), where = (x) => x.a50 && x.a200 ? 'peste mediile de 50 și 200 de zile' : !x.a50 && !x.a200 ? 'sub mediile de 50 și 200 de zile' : x.a200 ? 'sub media de 50, peste cea de 200' : 'peste media de 50, sub cea de 200';
    return { id: 'trend', name: 'Trendul (SPY, QQQ)', value: xs.map((x) => x.sym + ' ' + (x.d200 >= 0 ? '+' : '') + num(x.d200) + '%').join(' · '), reading: xs.map((x) => x.sym + ' ' + where(x)).join('; ') + '.', note: 'față de media de 200 de zile', score: sc,
      fapt: xs.length === 2 && xs[0].a50 === xs[1].a50 && xs[0].a200 === xs[1].a200 ? 'SPY și QQQ ' + where(xs[0]) : xs.map((x) => x.sym + ' ' + where(x)).join(', '),
      why: sc > 0 ? 'indicii sunt în trend' : sc < 0 ? 'indicii au ieșit din trend' : 'trendul indicilor e amestecat' };
  }
  function participare(b) {
    if (!b || !finite(b.above50)) return { id: 'participare', name: 'Participarea', value: '—', reading: b?.state === 'loading' ? 'Se citește lățimea pieței…' : 'Lățimea pieței nu e confirmată acum.', score: null };
    const pts = (b.points || []).filter((p) => finite(p.value)), prev = pts.length > 10 ? pts[pts.length - 11].value : null, dir = finite(prev) ? b.above50 - prev : null;
    const sc = b.above50 >= 60 ? 1 : b.above50 <= 40 ? -1 : 0, cum = dir === null ? '' : Math.abs(dir) < 3 ? ', stabilă față de acum două săptămâni' : dir > 0 ? `, în creștere (acum două săptămâni: ${num(prev, 0)}%)` : `, în scădere (acum două săptămâni: ${num(prev, 0)}%)`;
    return { id: 'participare', name: 'Participarea', value: num(b.above50, 0) + '%', reading: `${num(b.above50, 0)}% din acțiunile S&P 500 sunt peste media lor de 50 de zile${cum}.`, note: 'S&P 500 peste media de 50 de zile', score: sc, dir,
      fapt: dir !== null && Math.abs(dir) >= 3 ? `participarea ${dir > 0 ? 'revine' : 'scade'}: ${num(prev, 0)}% → ${num(b.above50, 0)}% în două săptămâni` : `participarea la ${num(b.above50, 0)}%`,
      why: sc > 0 ? 'majoritatea acțiunilor participă' : sc < 0 ? `participarea e slabă (${num(b.above50, 0)}%)` : 'participarea e la jumătate' };
  }
  function volatilitate(items) {
    const m = items.find((x) => x.symbol === '^VIX'); if (!m || m.state !== 'ready' || !finite(m.price)) return { id: 'vix', name: 'Volatilitatea (VIX)', value: '—', reading: 'VIX nu e confirmat acum.', score: null };
    // regulă: un salt de peste 15% într-o singură sesiune e semnal de stres chiar dacă nivelul e încă normal
    const v = m.price, salt = finite(m.changePct) && m.changePct >= 15, nivel = v < 16 ? 1 : v <= 22 ? 0 : v <= 30 ? -1 : -2, sc = salt ? Math.min(nivel, -1) : nivel, cuv = v < 16 ? 'calmă' : v <= 22 ? 'normală' : v <= 30 ? 'ridicată' : 'de panică';
    return { id: 'vix', name: 'Volatilitatea (VIX)', value: num(v, 1), reading: `Volatilitatea așteptată e ${cuv}` + (finite(m.changePct) ? ` (${m.changePct >= 0 ? '+' : ''}${num(m.changePct)}% în ultima sesiune)` : '') + (salt ? ' — un salt de peste 15% într-o zi arată stres care începe.' : '.'), score: sc,
      fapt: salt ? `VIX ${cuv === 'normală' ? 'încă normal' : cuv} (${num(v, 0)}), dar a sărit cu ${num(m.changePct, 0)}% într-o zi` : `VIX ${cuv === 'calmă' ? 'calm' : cuv === 'normală' ? 'normal' : cuv === 'ridicată' ? 'ridicat' : 'la panică'} (${num(v, 0)})`,
      why: salt ? `VIX a sărit cu ${num(m.changePct, 0)}% într-o zi` : sc > 0 ? 'VIX e calm' : sc < 0 ? `VIX e ${cuv === 'de panică' ? 'la nivel de panică' : 'ridicat'} (${num(v, 1)})` : 'VIX e normal' };
  }
  function dobanda(items) {
    const m = items.find((x) => x.symbol === '^TNX'), closes = (m?.points || []).map((p) => p.value).filter(finite);
    if (!m || m.state !== 'ready' || closes.length < 21) return { id: 'dobanda', name: 'Dobânda pe 10 ani', value: '—', reading: 'Randamentul pe 10 ani nu e confirmat acum.', score: null };
    const bp = (closes.at(-1) - closes.at(-21)) * 100, sc = bp > 25 ? -1 : bp < -25 ? 1 : 0;
    return { id: 'dobanda', name: 'Dobânda pe 10 ani', value: num(closes.at(-1), 2) + '%', reading: `${bp >= 0 ? '+' : ''}${num(bp, 0)} puncte de bază în ultima lună — ` + (sc < 0 ? 'urcă repede, apasă pe acțiuni.' : sc > 0 ? 'coboară, ajută acțiunile.' : 'fără mișcare mare.'), score: sc,
      fapt: `dobânda pe 10 ani ${sc < 0 ? 'urcă repede' : sc > 0 ? 'coboară' : 'stabilă'} (${num(closes.at(-1), 1)}%)`,
      why: sc < 0 ? 'dobânzile urcă repede' : sc > 0 ? 'dobânzile coboară' : 'dobânzile stau pe loc' };
  }
  function regimMacro(r) {
    if (!r || !r.label || !r.fresh) return { id: 'macro', name: 'Regimul macro', value: '—', reading: 'Necitit pe acest dispozitiv: deschide o dată Macro Dashboard ca să-l calculeze.', score: null };
    const L = String(r.label).toUpperCase(), sc = /RISK[- ]?ON/.test(L) ? 1 : /RISK[- ]?OFF/.test(L) ? -1 : 0;
    return { id: 'macro', name: 'Regimul macro', value: String(r.label).slice(0, 24), reading: 'Din Macro Dashboard' + (finite(r.composite) ? ` (scor compus ${num(r.composite, 0)})` : '') + '.', score: sc,
      fapt: `regimul macro ${String(r.label).toLowerCase()}`,
      why: sc > 0 ? 'regimul macro e favorabil' : sc < 0 ? 'regimul macro e defensiv' : 'regimul macro e neutru' };
  }
  function sectoare(list) {
    const xs = (list || []).filter((s) => s && typeof s.name === 'string' && finite(s.ratio)).sort((a, b) => b.ratio - a.ratio);
    if (xs.length < 5) return { id: 'sectoare', name: 'Sectoarele care conduc', value: '—', reading: 'Sectoarele nu sunt citite acum.', score: null };
    const top = xs.slice(0, 3), def = top.filter((s) => DEFENSIVE.has(s.name)).length, cyc = top.filter((s) => CYCLICAL.has(s.name)).length, sc = def >= 2 ? -1 : cyc === 3 ? 1 : 0;
    const nume = top.map((s) => SECT_RO[s.name] || s.name);
    return { id: 'sectoare', name: 'Sectoarele care conduc', value: nume[0], reading: `Conduc: ${nume.join(', ')} (${top.map((s) => num(s.ratio * 100, 0) + '%').join(' / ')} din acțiuni în trend). ` + (sc < 0 ? 'Rotație spre sectoarele defensive.' : sc > 0 ? 'Conduc sectoarele ciclice.' : 'Conducere amestecată.'), score: sc,
      fapt: `conduc ${nume.join(', ')}` + (sc < 0 ? ' (defensive)' : ''),
      why: sc < 0 ? 'sectoarele defensive conduc' : sc > 0 ? 'conduc sectoarele ciclice' : 'conducerea pe sectoare e amestecată' };
  }
  /* Evenimentele din următoarele 7 zile: calendarul macro (high + med) și rezultatele trimestriale ale pozițiilor. */
  function ceVine(events, earnings, now) {
    const end = now + 7 * 86400000, out = [];
    for (const e of events || []) { const t = e.d instanceof Date ? e.d.getTime() : Date.parse(e.d); if (finite(t) && t >= now - 30 * 60000 && t <= end && (e.impact === 'high' || e.impact === 'med')) out.push({ t, ce: EVENT_RO[e.event] || e.event, tip: 'macro', impact: e.impact, approx: !!e.approx }); }
    for (const x of earnings || []) { const t = Date.parse(x.date + 'T21:00:00Z'); if (finite(t) && t >= now - 86400000 && t <= end) out.push({ t, ce: `Rezultatele ${x.symbol}`, tip: 'rezultate', impact: 'high', simbol: x.symbol, approx: false }); }
    // „Fed — conferința” imediat după decizie: un singur rând
    return out.sort((a, b) => a.t - b.t).filter((x, i, a) => !(x.ce.startsWith('Fed — conferința') && a[i - 1]?.ce.startsWith('Fed — decizia')));
  }
  function maiDeparte(events, now) {
    const a = now + 7 * 86400000, b = now + 30 * 86400000, out = [];
    for (const e of events || []) { const t = e.d instanceof Date ? e.d.getTime() : Date.parse(e.d); if (finite(t) && t > a && t <= b && e.impact === 'high' && e.event !== 'FOMC Press Conference') out.push({ t, ce: EVENT_RO[e.event] || e.event }); }
    return out.sort((x, y) => x.t - y.t).slice(0, 3);
  }
  function compute({ market = {}, sectors = null, regime = null, events = [], earnings = [], news = [], positions = [], now = Date.now() } = {}) {
    const items = market.items || [], ind = [trend(items), participare(market.breadth), volatilitate(items), dobanda(items), regimMacro(regime), sectoare(sectors)];
    const citite = ind.filter((x) => x.score !== null), score = citite.reduce((a, x) => a + x.score, 0);
    const label = citite.length >= 3 ? LABELS.find((l) => score >= l.min) : { id: 'necunoscut', text: 'Neconfirmat', tone: 'idle' };
    const neg = citite.filter((x) => x.score < 0).sort((a, b) => a.score - b.score).map((x) => x.why), poz = citite.filter((x) => x.score > 0).map((x) => x.why);
    let fraza;
    if (label.id === 'necunoscut') fraza = 'Prea puține surse citite acum ca să rezum piața; verifică conexiunea și reîncarcă.';
    else if (label.id === 'favorabil' || label.id === 'neutru') fraza = (poz.length ? cap(poz.slice(0, 2).join(' și ')) : 'Nimic nu iese în evidență') + (neg.length ? `; de urmărit: ${neg.slice(0, 2).join(', ')}.` : '.');
    else fraza = cap(neg.slice(0, 2).join(' și ')) + (poz.length ? `; în favoare: ${poz.slice(0, 2).join(', ')}.` : '.');
    const rezumat = citite.map((x) => x.fapt).filter(Boolean), departe = maiDeparte(events, now);
    const vine = ceVine(events, earnings, now), curand = vine.find((x) => x.impact === 'high' && x.t - now < 2 * 86400000);
    const risc = { favorabil: 'Planuri noi cu riscul obișnuit; selectiv, ca mereu.', neutru: 'Planuri noi cu riscul obișnuit, doar cele mai curate.', prudent: 'Planuri noi cu jumătate din riscul obișnuit.', defensiv: 'Fără planuri noi; protejează ce ai deschis.', necunoscut: 'Până se confirmă sursele, fără planuri noi.' }[label.id];
    const simb = new Set(positions.map((p) => p.symbol)), expuse = vine.filter((x) => x.simbol && simb.has(x.simbol)).map((x) => x.simbol);
    const pentruTine = [risc];
    if (curand) pentruTine.push(`${curand.ce} vine ${ziua(curand.t, now)}: o intrare nouă chiar înainte poate prinde mișcarea evenimentului.`);
    if (expuse.length) pentruTine.push(`Raportează în următoarele 7 zile: ${[...new Set(expuse)].join(', ')} — din pozițiile tale.`);
    else if (positions.length) pentruTine.push('Niciuna dintre pozițiile tale nu raportează în următoarele 7 zile' + (earnings ? '.' : ' (calendarul rezultatelor nu e citit pe acest dispozitiv).'));
    const titluri = (news || []).filter((x) => x && typeof x.title === 'string' && x.title).sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0)).slice(0, 4);
    return { label, score, maxim: citite.length, citite: citite.length, fraza, rezumat: rezumat.length ? cap(rezumat.join('; ')) + '.' : '', departe, indicatori: ind, ceVine: vine, titluri, pentruTine, breadthStance: market.breadth?.stance || null, asOf: items.find((x) => x.symbol === 'SPY')?.asOf || market.breadth?.asOf || null };
  }
  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
  function ziua(t, now) { const d = Math.round((new Date(t).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400000); return d <= 0 ? 'azi' : d === 1 ? 'mâine' : `peste ${d} zile`; }
  const ZILE = ['dum', 'lun', 'mar', 'mie', 'joi', 'vin', 'sâm'];
  function render(v, now = Date.now()) {
    const trepte = ['defensiv', 'prudent', 'neutru', 'favorabil'], plaje = { defensiv: [-6, -3], prudent: [-2, -1], neutru: [0, 2], favorabil: [3, 6] }, i = trepte.indexOf(v.label.id), pl = plaje[v.label.id];
    // marcajul stă ÎN treapta activă (niciodată pe graniță), mai aproape de vecina spre care trage scorul
    const pos = i < 0 ? 0.5 : (i + 0.15 + 0.7 * Math.max(0, Math.min(1, (v.score - pl[0]) / (pl[1] - pl[0] || 1)))) / 4;
    const dot = (s) => (s === null ? 'idle' : s > 0 ? 'ok' : s < 0 ? (s <= -2 ? 'bad' : 'warn') : 'info');
    const ora = (t) => new Date(t).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' });
    const data = (t) => { const d = new Date(t); return ZILE[d.getDay()] + ' ' + String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0'); };
    const zi = v.asOf ? new Date(v.asOf + 'T12:00:00Z') : null;
    return '<header class="mv-head"><div><span class="eyebrow">Verdictul pieței' + (zi ? ' · după sesiunea din ' + esc(zi.toLocaleDateString('ro-RO', { weekday: 'long', day: '2-digit', month: '2-digit' })) : '') + '</span>' +
      '<h2 class="mv-verdict mv-' + esc(v.label.tone) + '"><span class="mv-word">' + esc(v.label.text) + '.</span> ' + esc(v.fraza) + '</h2>' + (v.rezumat ? '<p class="mv-summary">' + esc(v.rezumat) + '</p>' : '') + '</div>' +
      '<div class="mv-scale" role="img" aria-label="Verdict ' + esc(v.label.text) + ', scor ' + v.score + ' din ' + v.citite + ' indicatori citiți"><div class="mv-track">' + trepte.map((t) => '<span class="mv-step mv-' + t + (t === v.label.id ? ' on' : '') + '"></span>').join('') + (v.label.id !== 'necunoscut' ? '<i class="mv-mark" style="left:' + (pos * 100).toFixed(1) + '%"></i>' : '') + '</div>' +
      '<div class="mv-steps">' + ['Defensiv', 'Prudent', 'Neutru', 'Favorabil'].map((t) => '<span>' + t + '</span>').join('') + '</div><p class="mv-score">Scor ' + (v.score > 0 ? '+' : v.score < 0 ? '−' : '') + Math.abs(v.score) + ' · ' + v.citite + ' din 6 indicatori citiți</p></div></header>' +
      '<div class="mv-body"><section class="mv-why" aria-label="De ce"><h3>De ce</h3><ul>' + v.indicatori.map((x) => '<li class="mv-ind"><i class="mv-dot ' + dot(x.score) + '" aria-hidden="true"></i><span class="mv-name">' + esc(x.name) + '</span><b class="mv-val">' + esc(x.value) + (x.note && x.value !== '—' ? '<small>' + esc(x.note) + '</small>' : '') + '</b><span class="mv-read">' + esc(x.reading) + '</span></li>').join('') + '</ul></section>' +
      '<section class="mv-next" aria-label="Ce vine"><h3>Ce vine · 7 zile</h3>' + (v.ceVine.length ? '<ol>' + v.ceVine.slice(0, 7).map((x) => '<li class="mv-ev ' + (x.impact === 'high' ? 'hi' : '') + '"><time datetime="' + new Date(x.t).toISOString() + '"><b>' + esc(data(x.t)) + '</b>' + (x.tip === 'macro' ? ' ' + esc(ora(x.t)) : '') + '</time><span>' + esc(x.ce) + (x.approx ? ' <small title="Dată estimată din calendar, neconfirmată">~</small>' : '') + '</span><em>' + esc(ziua(x.t, now)) + '</em></li>').join('') + '</ol>' : '<p class="mv-empty">Niciun eveniment important în următoarele 7 zile.</p>') + (v.departe.length ? '<p class="mv-later">Mai departe: ' + v.departe.map((x) => esc(x.ce) + ' <b>' + esc(data(x.t).slice(-5)) + '</b>').join(' · ') + '</p>' : '') + '</section>' +
      '<section class="mv-news" aria-label="Context"><h3>Context</h3>' + (v.titluri.length ? '<ul>' + v.titluri.map((x) => '<li><span class="mv-sym">' + esc(x.symbol || 'Piață') + '</span>' + (safeURL(x.url) ? '<a href="' + esc(safeURL(x.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(x.title) + '</a>' : '<span>' + esc(x.title) + '</span>') + '<small>' + esc(x.publisher || '') + '</small></li>').join('') + '</ul>' : '<p class="mv-empty">Știrile nu sunt încă citite.</p>') + '</section>' +
      '<section class="mv-you" aria-label="Pentru tine"><h3>Pentru tine</h3><ul>' + v.pentruTine.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul></section></div>' +
      '<footer class="mv-foot">Rezumat după reguli fixe, din datele de mai jos; descrie contextul, nu prezice și nu e semnal de cumpărare. Regula finală pentru risc rămâne la Governor.' + (v.breadthStance ? ' Motorul Market Breadth: ' + esc(v.breadthStance) + '.' : '') + '</footer>';
  }
  g.MarketVerdict = { compute, render, safeURL, LABELS };
})(typeof window !== 'undefined' ? window : globalThis);
