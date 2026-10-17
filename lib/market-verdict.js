/* 17.10.2026 — Verdictul pieței (pagina Astăzi): un rezumat după reguli fixe, scrise aici, din datele pe care pagina le are deja
   (SPY / QQQ / VIX / dobânda pe 10 ani, lățimea pieței, sectoarele, regimul macro, calendarul, știrile, pozițiile).
   Descrie contextul; NU e o predicție și nu e un semnal de cumpărare — nicio regulă de aici nu e probată ca avantaj
   (proba înainte: I-677, robotul de noapte). compute(input) e pur (testabil); render(v) întoarce HTML. Orice sursă lipsă e spusă.
   Aceeași bibliotecă rulează și în robotul de noapte (tools/verdict-piata-robot.mjs), deci verdictul de pe telefon și cel notat
   noaptea vin din aceleași reguli.
   17.10 (I-676..I-681): regimul macro calculat singur (lib/macro-regime.js), structura VIX și mișcarea așteptată, creditul,
   maximele / minimele noi, expirarea opțiunilor, marile companii, futures, beta portofoliului, ieri → azi și proba verdictului.
   Ipotezele noi (VIX9D > VIX3M = stres imediat; HYG/IEF cu peste 1% sub media de 50 = credit slab) intră în indicatorii existenți
   ca reguli scrise dinainte (docs/verdict-piata-protocol.md); scala și pragurile verdictului rămân cele aprobate. */
(function (g) {
  'use strict';
  const finite = Number.isFinite, esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (v, d = 1) => (finite(v) ? v.toLocaleString('ro-RO', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
  const LABELS = [{ min: 3, id: 'favorabil', text: 'Favorabil', tone: 'ok' }, { min: 0, id: 'neutru', text: 'Neutru', tone: 'info' }, { min: -2, id: 'prudent', text: 'Prudent', tone: 'warn' }, { min: -Infinity, id: 'defensiv', text: 'Defensiv', tone: 'bad' }];
  const DEFENSIVE = new Set(['Utilities', 'Consumer Defensive', 'Healthcare', 'Real Estate']);
  const CYCLICAL = new Set(['Technology', 'Consumer Cyclical', 'Industrials', 'Financial', 'Financial Services', 'Communication Services', 'Basic Materials', 'Energy']);
  const SECT_RO = { Technology: 'tehnologie', 'Consumer Cyclical': 'consum ciclic', Industrials: 'industrie', Financial: 'financiar', 'Financial Services': 'financiar', 'Communication Services': 'comunicații', 'Basic Materials': 'materiale', Energy: 'energie', Utilities: 'utilități', 'Consumer Defensive': 'consum de bază', Healthcare: 'sănătate', 'Real Estate': 'imobiliare' };
  const EVENT_RO = { 'FOMC Rate Decision': 'Fed — decizia de dobândă', 'FOMC Press Conference': 'Fed — conferința de presă', 'Non-Farm Payrolls + Unemployment Rate': 'Locurile de muncă (NFP) și șomajul', 'CPI YoY + Core CPI': 'Inflația (CPI)', 'PPI YoY': 'Prețurile producției (PPI)', 'Initial Jobless Claims': 'Cererile de șomaj', 'Retail Sales MoM': 'Vânzările cu amănuntul', 'ISM Manufacturing PMI': 'Industria (ISM)' };
  /** Seriile în plus (I-679 / I-680 / I-681 și regimul macro): VIX pe 9 zile și pe 3 luni, credit, dolar, BTC, futures. */
  const EXTRA = ['^VIX9D', '^VIX3M', 'HYG', 'IEF', 'DX-Y.NYB', 'BTC-USD', 'ES=F', 'NQ=F'];
  // Linkurile știrilor: doar https, fără nume / parolă în adresă (la fel ca renderNews din Astăzi); altfel titlul rămâne text.
  const safeURL = (u) => { try { const x = new URL(String(u || '')); return x.protocol === 'https:' && !x.username && !x.password ? x.href : null; } catch (_) { return null; } };
  const sma = (xs, n) => (xs.length >= n ? xs.slice(-n).reduce((a, b) => a + b, 0) / n : null);
  const closesOf = (bars) => (Array.isArray(bars) ? bars.map((b) => b.c ?? b.value).filter(finite) : []);
  /** Simbolul de bursă al unei poziții Trading 212 (AAPL_US_EQ → AAPL); celelalte piețe nu au încă simbol Yahoo sigur. */
  const symbolOf = (p) => (p && typeof p.symbol === 'string' ? p.symbol : /^([A-Z][A-Z0-9.-]{0,23})_US_EQ$/.exec(p?.ticker || '')?.[1] || null);

  /* Fiecare indicator: { id, name, value, reading, score (−2..+1) sau null = necitit, fapt (rezumat), why (frază pentru verdict) }. */
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
  /** Din motorul Market Breadth: maximele / minimele noi, zilele de distribuție, companiile mici (rânduri descriptive, I-680). */
  function semneMotor(scorecard) {
    const rows = Array.isArray(scorecard) ? scorecard.filter((r) => Array.isArray(r) && typeof r[0] === 'string') : [], find = (re) => rows.find((r) => re.test(r[0]));
    const nh = find(/new highs/i), dist = find(/distribution/i), small = find(/small/i), out = [];
    if (nh && typeof nh[2] === 'string') { const m = /(\d+)\D+(\d+)/.exec(nh[2]); if (m) out.push(`maxime noi ${m[1]}, minime noi ${m[2]}`); }
    if (dist && typeof dist[2] === 'string') { const m = /max\s*(\d+)\s*dist/i.exec(dist[2]); if (m) out.push(`${m[1]} zile de distribuție`); }
    if (small && finite(small[1])) out.push(small[1] < 0 ? 'companiile mici rămân în urmă' : small[1] > 0 ? 'companiile mici conduc' : 'companiile mici țin pasul');
    return out;
  }
  function participare(b, motor) {
    if (!b || !finite(b.above50)) return { id: 'participare', name: 'Participarea', value: '—', reading: b?.state === 'loading' ? 'Se citește lățimea pieței…' : 'Lățimea pieței nu e confirmată acum.', score: null };
    const pts = (b.points || []).filter((p) => finite(p.value)), prev = pts.length > 10 ? pts[pts.length - 11].value : null, dir = finite(prev) ? b.above50 - prev : null;
    const sc = b.above50 >= 60 ? 1 : b.above50 <= 40 ? -1 : 0, cum = dir === null ? '' : Math.abs(dir) < 3 ? ', stabilă față de acum două săptămâni' : dir > 0 ? `, în creștere (acum două săptămâni: ${num(prev, 0)}%)` : `, în scădere (acum două săptămâni: ${num(prev, 0)}%)`;
    const extra = [finite(b.above200) ? `${num(b.above200, 0)}% peste media de 200 de zile` : null, ...semneMotor(motor)].filter(Boolean);
    return { id: 'participare', name: 'Participarea', value: num(b.above50, 0) + '%', reading: `${num(b.above50, 0)}% din acțiunile S&P 500 sunt peste media lor de 50 de zile${cum}.` + (extra.length ? ' ' + cap(extra.join('; ')) + '.' : ''), note: 'S&P 500 peste media de 50 de zile', score: sc, dir,
      fapt: dir !== null && Math.abs(dir) >= 3 ? `participarea ${dir > 0 ? 'revine' : 'scade'}: ${num(prev, 0)}% → ${num(b.above50, 0)}% în două săptămâni` : `participarea la ${num(b.above50, 0)}%`,
      why: sc > 0 ? 'majoritatea acțiunilor participă' : sc < 0 ? `participarea e slabă (${num(b.above50, 0)}%)` : 'participarea e la jumătate' };
  }
  function volatilitate(items, x) {
    const m = items.find((y) => y.symbol === '^VIX'); if (!m || m.state !== 'ready' || !finite(m.price)) return { id: 'vix', name: 'Volatilitatea (VIX)', value: '—', reading: 'VIX nu e confirmat acum.', score: null };
    // regulă: un salt de peste 15% într-o singură sesiune e semnal de stres chiar dacă nivelul e încă normal
    // I-679 (ipoteză scrisă dinainte): VIX pe 9 zile peste VIX pe 3 luni = protecția imediată e mai scumpă = stres imediat
    const v = m.price, salt = finite(m.changePct) && m.changePct >= 15, v9 = closesOf(x?.serii?.['^VIX9D']).at(-1), v3 = closesOf(x?.serii?.['^VIX3M']).at(-1), inv = finite(v9) && finite(v3) && v9 > v3;
    const nivel = v < 16 ? 1 : v <= 22 ? 0 : v <= 30 ? -1 : -2, sc = salt || inv ? Math.min(nivel, -1) : nivel, cuv = v < 16 ? 'calmă' : v <= 22 ? 'normală' : v <= 30 ? 'ridicată' : 'de panică';
    const misc = v / Math.sqrt(252), str = finite(v9) && finite(v3) ? ` Structura: VIX pe 9 zile ${num(v9, 1)}, pe 3 luni ${num(v3, 1)}` + (inv ? ' — inversată: protecția pe termen scurt e mai scumpă, stres imediat.' : ` — normală (raport ${num(v9 / v3, 2)}).`) : '';
    return { id: 'vix', name: 'Volatilitatea (VIX)', value: num(v, 1), note: `mișcare tipică ±${num(misc, 1)}% / zi`, reading: `Volatilitatea așteptată e ${cuv}` + (finite(m.changePct) ? ` (${m.changePct >= 0 ? '+' : ''}${num(m.changePct)}% în ultima sesiune)` : '') + (salt ? ' — un salt de peste 15% într-o zi arată stres care începe.' : '.') + str + ` Pe S&P, VIX înseamnă o mișcare tipică de ±${num(misc, 1)}% pe zi.`, score: sc, miscare: misc, inversata: inv,
      fapt: (salt ? `VIX ${cuv === 'normală' ? 'încă normal' : cuv} (${num(v, 0)}), dar a sărit cu ${num(m.changePct, 0)}% într-o zi` : `VIX ${cuv === 'calmă' ? 'calm' : cuv === 'normală' ? 'normal' : cuv === 'ridicată' ? 'ridicat' : 'la panică'} (${num(v, 0)})`) + (inv ? ', cu structura inversată' : ''),
      why: inv ? 'structura VIX s-a inversat (stres imediat)' : salt ? `VIX a sărit cu ${num(m.changePct, 0)}% într-o zi` : sc > 0 ? 'VIX e calm' : sc < 0 ? `VIX e ${cuv === 'de panică' ? 'la nivel de panică' : 'ridicat'} (${num(v, 1)})` : 'VIX e normal' };
  }
  function dobanda(items, x) {
    const m = items.find((y) => y.symbol === '^TNX'), closes = (m?.points || []).map((p) => p.value).filter(finite);
    if (!m || m.state !== 'ready' || closes.length < 22) return { id: 'dobanda', name: 'Dobânzi și credit', value: '—', reading: 'Randamentul pe 10 ani nu e confirmat acum.', score: null };
    const bp = (closes.at(-1) - closes.at(-22)) * 100, scD = bp > 25 ? -1 : bp < -25 ? 1 : 0;
    // I-680 (ipoteză scrisă dinainte): HYG / IEF cu peste 1% sub media de 50 de zile = creditul slăbește (de obicei înaintea acțiunilor)
    const h = closesOf(x?.serii?.HYG), f = closesOf(x?.serii?.IEF), n = Math.min(h.length, f.length), ratio = n >= 50 ? h.slice(-n).map((v, i) => v / f.slice(-n)[i]) : null, r50 = ratio ? sma(ratio, 50) : null, dev = r50 ? (ratio.at(-1) / r50 - 1) * 100 : null;
    const slab = finite(dev) && dev < -1, sc = slab ? Math.min(scD, -1) : scD;
    const credit = finite(dev) ? ` Creditul (obligațiuni riscante față de cele de stat): ${dev >= 0 ? '+' : '−'}${num(Math.abs(dev), 1)}% față de media de 50 de zile — ` + (slab ? 'slăbește, semn de avertizare.' : dev > 1 ? 'puternic.' : 'liniștit.') : '';
    return { id: 'dobanda', name: 'Dobânzi și credit', value: num(closes.at(-1), 2) + '%', note: 'dobânda pe 10 ani', reading: `${bp >= 0 ? '+' : '−'}${num(Math.abs(bp), 0)} puncte de bază în ultima lună (21 de sesiuni) — ` + (scD < 0 ? 'urcă repede, apasă pe acțiuni.' : scD > 0 ? 'coboară, ajută acțiunile.' : 'fără mișcare mare.') + credit, score: sc, credit: dev,
      fapt: `dobânda pe 10 ani ${scD < 0 ? 'urcă repede' : scD > 0 ? 'coboară' : 'stabilă'} (${num(closes.at(-1), 1)}%)` + (slab ? ', iar creditul slăbește' : ''),
      why: slab ? 'creditul slăbește' : sc < 0 ? 'dobânzile urcă repede' : sc > 0 ? 'dobânzile coboară' : 'dobânzile stau pe loc' };
  }
  /** Regimul macro: rezultatul MacroRegime.scor (calculat singur) sau, ca rezervă, forma veche md_risk_regime. */
  function regimMacro(r) {
    if (r && r.treapta && r.treapta.cod) {
      if (r.partial || r.treapta.cod === 'partial') return { id: 'macro', name: 'Regimul macro', value: '—', reading: `Date parțiale: doar ${r.valide} din 5 semnale citite (VIX, dobânda, dolarul, BTC–S&P, frica crypto).`, score: null };
      const c = r.treapta.cod, sc = c === 'riskon' || c === 'inclinat' ? 1 : c === 'neutru' ? 0 : c === 'prudent' ? -1 : -2;
      const semne = (r.semne || []).filter((s) => s.ok).map((s) => ({ vix: 'VIX', dobanda: 'dobânda', dolar: 'dolarul', btcSp: 'BTC–S&P', frica: 'frica crypto' }[s.cod] + ' ' + s.text));
      return { id: 'macro', name: 'Regimul macro', value: cap(r.treapta.text.replace(/ \(.*\)/, '')), note: `scor ${r.scor > 0 ? '+' : r.scor < 0 ? '−' : ''}${Math.abs(r.scor)}`, reading: `Același scor ca în Crypto Radar (5 semnale): ${semne.join(', ')}.`, score: sc,
        fapt: `regimul macro ${r.treapta.text.replace(/ \(.*\)/, '')}`, why: sc > 0 ? 'regimul macro e favorabil' : sc < 0 ? `regimul macro e ${r.treapta.text.replace(/ \(.*\)/, '')}` : 'regimul macro e neutru' };
    }
    if (r && r.label && r.fresh) {
      const L = String(r.label).toUpperCase(), sc = /RISK[- ]?ON/.test(L) ? 1 : /RISK[- ]?OFF/.test(L) ? -1 : 0;
      return { id: 'macro', name: 'Regimul macro', value: String(r.label).slice(0, 24), reading: 'Ultima citire a vechiului Macro Dashboard.', score: sc, fapt: `regimul macro ${String(r.label).toLowerCase()}`, why: sc > 0 ? 'regimul macro e favorabil' : sc < 0 ? 'regimul macro e defensiv' : 'regimul macro e neutru' };
    }
    return { id: 'macro', name: 'Regimul macro', value: '—', reading: 'Se calculează din VIX, dobândă, dolar, BTC și frica crypto…', score: null };
  }
  function sectoare(list) {
    const xs = (list || []).filter((s) => s && typeof s.name === 'string' && finite(s.ratio)).sort((a, b) => b.ratio - a.ratio);
    if (xs.length < 5) return { id: 'sectoare', name: 'Sectoarele care conduc', value: '—', reading: 'Sectoarele nu sunt citite acum.', score: null };
    const top = xs.slice(0, 3), def = top.filter((s) => DEFENSIVE.has(s.name)).length, cyc = top.filter((s) => CYCLICAL.has(s.name)).length, sc = def >= 2 ? -1 : cyc === 3 ? 1 : 0;
    const nume = top.map((s) => SECT_RO[s.name] || s.name);
    return { id: 'sectoare', name: 'Sectoarele care conduc', value: nume[0], reading: `Conduc: ${nume.join(', ')} (${top.map((s) => num(s.ratio * 100, 0) + '%').join(' / ')} din acțiuni în trend). ` + (sc < 0 ? 'Rotație spre sectoarele defensive.' : sc > 0 ? 'Conduc sectoarele ciclice.' : 'Conducere amestecată.'), score: sc, top: top.map((s) => s.name),
      fapt: `conduc ${nume.join(', ')}` + (sc < 0 ? ' (defensive)' : ''),
      why: sc < 0 ? 'sectoarele defensive conduc' : sc > 0 ? 'conduc sectoarele ciclice' : 'conducerea pe sectoare e amestecată' };
  }
  /** I-681: expirarea lunară a opțiunilor (a treia vineri); martie / iunie / septembrie / decembrie = quad witching. Din reguli, nu din calendar. */
  function expirari(now, zile = 30) {
    const out = [], d0 = new Date(now);
    for (let k = 0; k < 3; k++) {
      const y = d0.getUTCFullYear(), mo = d0.getUTCMonth() + k, first = new Date(Date.UTC(y, mo, 1)), fri = 1 + ((5 - first.getUTCDay() + 7) % 7) + 14, t = Date.UTC(y, mo, fri, 20, 0);
      const luna = new Date(t).getUTCMonth(), q = [2, 5, 8, 11].includes(luna);
      if (t >= now - 12 * 3600000 && t <= now + zile * 86400000) out.push({ t, ce: q ? 'Expirarea trimestrială a opțiunilor (quad witching)' : 'Expirarea lunară a opțiunilor', tip: 'opex', impact: q ? 'high' : 'med' });
    }
    return out;
  }
  /* Evenimentele din următoarele 7 zile: calendarul macro (high + med), expirările, rezultatele pozițiilor și ale marilor companii. */
  function ceVine(events, earnings, mari, now) {
    const end = now + 7 * 86400000, out = [];
    for (const e of events || []) { const t = e.d instanceof Date ? e.d.getTime() : Date.parse(e.d); if (finite(t) && t >= now - 30 * 60000 && t <= end && (e.impact === 'high' || e.impact === 'med')) out.push({ t, ce: EVENT_RO[e.event] || e.event, tip: 'macro', impact: e.impact, approx: !!e.approx }); }
    for (const x of expirari(now, 7)) out.push(x);
    const mele = new Set();
    for (const x of earnings || []) { const t = Date.parse(x.date + 'T12:00:00Z'); if (finite(t) && t >= now - 86400000 && t <= end) { mele.add(x.symbol); out.push({ t, ce: `Rezultatele ${x.symbol} (poziția ta)`, tip: 'rezultate', impact: 'high', simbol: x.symbol, approx: false }); } }
    // I-681: marile companii din S&P (robotul de noapte, calendarul Nasdaq) — mută indicele, nu doar pozițiile
    const pe = new Map();
    for (const x of mari || []) { if (mele.has(x.symbol)) continue; const t = Date.parse(x.date + 'T12:00:00Z'); if (finite(t) && t >= now - 86400000 && t <= end) { if (!pe.has(x.date)) pe.set(x.date, { t, syms: [] }); pe.get(x.date).syms.push(x.symbol); } }
    for (const [, x] of pe) out.push({ t: x.t, ce: `Rezultate mari: ${x.syms.slice(0, 5).join(', ')}${x.syms.length > 5 ? ' și alții' : ''}`, tip: 'rezultate', impact: 'high', approx: false });
    // „Fed — conferința” imediat după decizie: un singur rând
    return out.sort((a, b) => a.t - b.t).filter((x, i, a) => !(x.ce.startsWith('Fed — conferința') && a[i - 1]?.ce.startsWith('Fed — decizia')));
  }
  function maiDeparte(events, now) {
    const a = now + 7 * 86400000, b = now + 30 * 86400000, out = [];
    for (const e of events || []) { const t = e.d instanceof Date ? e.d.getTime() : Date.parse(e.d); if (finite(t) && t > a && t <= b && e.impact === 'high' && e.event !== 'FOMC Press Conference') out.push({ t, ce: EVENT_RO[e.event] || e.event }); }
    for (const x of expirari(now, 30)) if (x.t > a && x.impact === 'high') out.push({ t: x.t, ce: 'Quad witching' });
    return out.sort((x, y) => x.t - y.t).slice(0, 3);
  }
  /** I-681: futures S&P / Nasdaq (ultima cotație față de închiderea precedentă) — doar ca informație, înainte de deschidere. */
  function futures(x, now) {
    // doar înainte de deschidere (04:00–09:30 la New York, luni–vineri): altfel ultima bară e mișcarea unei sesiuni trecute, nu „acum”
    let ok = false; try { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now)).map((q) => [q.type, q.value])), m = Number(p.hour) * 60 + Number(p.minute); ok = !['Sat', 'Sun'].includes(p.weekday) && m >= 240 && m < 570; } catch (_) { ok = false; }
    if (!ok) return null;
    const f = (s) => { const c = closesOf(x?.serii?.[s]); return c.length >= 2 ? (c.at(-1) / c.at(-2) - 1) * 100 : null; };
    const es = f('ES=F'), nq = f('NQ=F'); return finite(es) || finite(nq) ? { es, nq, la: x?.la || null } : null;
  }
  /** I-678: beta portofoliului față de SPY, pe randamente zilnice (un an), ponderat cu valoarea pozițiilor US citite. */
  function beta(seriiPozitii, spyPoints, positions, total, currency) {
    const spy = new Map((spyPoints || []).map((p) => [new Date(p.at ?? p.t).toISOString().slice(0, 10), p.value ?? p.c])), rows = [];
    for (const p of positions || []) {
      const s = symbolOf(p), bars = s && seriiPozitii?.[s]; if (!bars || !finite(p.value) || p.value <= 0) continue;
      const al = bars.map((b) => [new Date(b.t).toISOString().slice(0, 10), b.c]).filter(([d, c]) => spy.has(d) && finite(c) && c > 0).slice(-253);
      const a = [], m = []; for (let i = 1; i < al.length; i++) { a.push(al[i][1] / al[i - 1][1] - 1); m.push(spy.get(al[i][0]) / spy.get(al[i - 1][0]) - 1); }
      if (a.length < 60) continue;
      const ma = a.reduce((x, y) => x + y, 0) / a.length, mm = m.reduce((x, y) => x + y, 0) / m.length; let cov = 0, vm = 0; for (let i = 0; i < a.length; i++) { cov += (a[i] - ma) * (m[i] - mm); vm += (m[i] - mm) ** 2; }
      if (vm > 0) rows.push({ s, value: p.value, b: cov / vm });
    }
    const acoperit = rows.reduce((x, r) => x + r.value, 0); if (!rows.length || acoperit <= 0) return null;
    const b = rows.reduce((x, r) => x + r.b * r.value, 0) / acoperit;
    return { beta: b, poz: rows.length, din: (positions || []).length, acoperit, pierdere2: acoperit * b * 0.02, moneda: currency || null, top: rows.sort((x, y) => y.b * y.value - x.b * x.value).slice(0, 2).map((r) => r.s) };
  }
  function compute({ market = {}, sectors = null, raport = null, regime = null, extra = null, events = [], earnings = [], news = [], positions = [], expunere = null, robot = null, now = Date.now() } = {}) {
    const items = market.items || [], sect = raport?.sectors || sectors, rg = regime || robot?.regim || null;
    const ind = [trend(items), participare(market.breadth, raport?.scorecard), volatilitate(items, extra), dobanda(items, extra), regimMacro(rg), sectoare(sect)];
    const citite = ind.filter((x) => x.score !== null), score = citite.reduce((a, x) => a + x.score, 0);
    const label = citite.length >= 3 ? LABELS.find((l) => score >= l.min) : { id: 'necunoscut', text: 'Neconfirmat', tone: 'idle' };
    const neg = citite.filter((x) => x.score < 0).sort((a, b) => a.score - b.score).map((x) => x.why), poz = citite.filter((x) => x.score > 0).map((x) => x.why);
    let fraza;
    if (label.id === 'necunoscut') fraza = 'Prea puține surse citite acum ca să rezum piața; verifică conexiunea și reîncarcă.';
    else if (label.id === 'favorabil' || label.id === 'neutru') fraza = (poz.length ? cap(poz.slice(0, 2).join(' și ')) : 'Nimic nu iese în evidență') + (neg.length ? `; de urmărit: ${neg.slice(0, 2).join(', ')}.` : '.');
    else fraza = cap(neg.slice(0, 2).join(' și ')) + (poz.length ? `; în favoare: ${poz.slice(0, 2).join(', ')}.` : '.');
    const rezumat = citite.map((x) => x.fapt).filter(Boolean), departe = maiDeparte(events, now);
    const vine = ceVine(events, earnings, robot?.rezultateMari, now), curand = vine.find((x) => x.impact === 'high' && x.t - now < 2 * 86400000);
    const risc = { favorabil: 'Planuri noi cu riscul obișnuit; selectiv, ca mereu.', neutru: 'Planuri noi cu riscul obișnuit, doar cele mai curate.', prudent: 'Planuri noi cu jumătate din riscul obișnuit.', defensiv: 'Fără planuri noi; protejează ce ai deschis.', necunoscut: 'Până se confirmă sursele, fără planuri noi.' }[label.id];
    const simb = new Set(positions.map(symbolOf).filter(Boolean)), expuse = vine.filter((x) => x.simbol && simb.has(x.simbol)).map((x) => x.simbol);
    const pentruTine = [risc];
    // I-678: cât te costă o zi rea, din beta portofoliului
    if (expunere && finite(expunere.beta)) pentruTine.push(`Portofoliul tău se mișcă de ~${num(expunere.beta, 1)}× S&P: o zi de −2% pe S&P ≈ −${num(expunere.pierdere2, 0)}${expunere.moneda ? ' ' + expunere.moneda : ''} la tine (beta pe un an, pe ${expunere.poz} din ${expunere.din} poziții).`);
    if (curand) pentruTine.push(`${curand.ce} vine ${ziua(curand.t, now)}: o intrare nouă chiar înainte poate prinde mișcarea evenimentului.`);
    if (expuse.length) pentruTine.push(`Raportează în următoarele 7 zile: ${[...new Set(expuse)].join(', ')} — din pozițiile tale.`);
    else if (simb.size) pentruTine.push('Niciuna dintre pozițiile tale nu raportează în următoarele 7 zile' + (earnings ? '.' : ' (calendarul rezultatelor nu e citit pe acest dispozitiv).'));
    // Contextul: 2 titluri despre piață (SPY / QQQ), cele mai noi; restul știrilor rămân în panoul „Știri & evenimente” (fără repetiție).
    const recente = (news || []).filter((x) => x && typeof x.title === 'string' && x.title).sort((a, b) => (Date.parse(b.publishedAt) || 0) - (Date.parse(a.publishedAt) || 0));
    const titluri = recente.filter((x) => !x.symbol || x.symbol === 'SPY' || x.symbol === 'QQQ').slice(0, 2), altele = Math.max(0, recente.length - titluri.length);
    const asOf = items.find((x) => x.symbol === 'SPY')?.asOf || market.breadth?.asOf || null;
    // I-676: ieri → azi din istoricul robotului (ultima zi notată înaintea celei de azi)
    const ieri = robot?.istoric ? robot.istoric.filter((x) => x && x.asOf && (!asOf || x.asOf < asOf)).at(-1) || null : null;
    const schimbate = ieri && ieri.indicatori ? ind.filter((x) => x.score !== null && finite(ieri.indicatori[x.id]) && ieri.indicatori[x.id] !== x.score).map((x) => x.name + (x.score > ieri.indicatori[x.id] ? ' ↑' : ' ↓')) : [];
    let zile = 1; if (robot?.istoric) for (let k = robot.istoric.length - 1; k >= 0; k--) { const x = robot.istoric[k]; if (asOf && x.asOf >= asOf) continue; if (x.label === label.id) zile++; else break; }
    return { label, score, maxim: citite.length, citite: citite.length, fraza, altele, rezumat: rezumat.length ? cap(rezumat.join('; ')) + '.' : '', departe, indicatori: ind, ceVine: vine, titluri, pentruTine, futures: futures(extra, now),
      ieri: ieri ? { label: ieri.label, score: ieri.score, asOf: ieri.asOf, schimbate } : null, zile: robot?.istoric ? zile : null, proba: robot?.proba || null, breadthStance: market.breadth?.stance || null, asOf };
  }
  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
  function ziua(t, now) { const d = Math.round((new Date(t).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400000); return d <= 0 ? 'azi' : d === 1 ? 'mâine' : `peste ${d} zile`; }
  const ZILE = ['dum', 'lun', 'mar', 'mie', 'joi', 'vin', 'sâm'], TXT = { favorabil: 'Favorabil', neutru: 'Neutru', prudent: 'Prudent', defensiv: 'Defensiv', necunoscut: 'Neconfirmat' };
  function render(v, now = Date.now()) {
    const trepte = ['defensiv', 'prudent', 'neutru', 'favorabil'], plaje = { defensiv: [-6, -3], prudent: [-2, -1], neutru: [0, 2], favorabil: [3, 6] }, i = trepte.indexOf(v.label.id), pl = plaje[v.label.id];
    // marcajul stă ÎN treapta activă (niciodată pe graniță), mai aproape de vecina spre care trage scorul
    const pos = i < 0 ? 0.5 : (i + 0.15 + 0.7 * Math.max(0, Math.min(1, (v.score - pl[0]) / (pl[1] - pl[0] || 1)))) / 4;
    const dot = (s) => (s === null ? 'idle' : s > 0 ? 'ok' : s < 0 ? (s <= -2 ? 'bad' : 'warn') : 'info');
    const ora = (t) => new Date(t).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Bucharest' });
    const data = (t) => { const d = new Date(t); return ZILE[d.getDay()] + ' ' + String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0'); };
    const zi = v.asOf ? new Date(v.asOf + 'T12:00:00Z') : null, sgn = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x);
    const ieri = v.ieri ? '<p class="mv-delta">' + (v.ieri.label === v.label.id ? `La fel ca în sesiunea precedentă (${esc(TXT[v.ieri.label] || v.ieri.label)}, scor ${sgn(v.ieri.score)})` + (v.zile > 1 ? ` · de ${v.zile} sesiuni la rând` : '') : `Sesiunea precedentă: <b>${esc(TXT[v.ieri.label] || v.ieri.label)}</b> (scor ${sgn(v.ieri.score)}) → azi <b>${esc(v.label.text)}</b>`) + (v.ieri.schimbate.length ? ' · s-au mutat: ' + esc(v.ieri.schimbate.join(', ')) : '') + '.</p>' : '';
    const fut = v.futures ? '<p class="mv-fut">Futures acum: S&P <b>' + esc(finite(v.futures.es) ? (v.futures.es >= 0 ? '+' : '') + num(v.futures.es) + '%' : '—') + '</b> · Nasdaq <b>' + esc(finite(v.futures.nq) ? (v.futures.nq >= 0 ? '+' : '') + num(v.futures.nq) + '%' : '—') + '</b>' + (v.futures.la ? ' <small>(citit la ' + esc(ora(v.futures.la)) + ')</small>' : '') + '</p>' : '';
    const proba = v.proba && typeof v.proba.mesaj === 'string' ? ' ' + esc(v.proba.mesaj) : ' Regula nu e încă probată pe zile noi.';
    return '<header class="mv-head"><div><span class="eyebrow">Verdictul pieței' + (zi ? ' · după sesiunea din ' + esc(zi.toLocaleDateString('ro-RO', { weekday: 'long', day: '2-digit', month: '2-digit' })) : '') + '</span>' +
      '<h2 class="mv-verdict mv-' + esc(v.label.tone) + '"><span class="mv-word">' + esc(v.label.text) + '.</span> ' + esc(v.fraza) + '</h2>' + (v.rezumat ? '<p class="mv-summary">' + esc(v.rezumat) + '</p>' : '') + ieri + '</div>' +
      '<div class="mv-scale" role="img" aria-label="Verdict ' + esc(v.label.text) + ', scor ' + v.score + ' din ' + v.citite + ' indicatori citiți"><div class="mv-track">' + trepte.map((t) => '<span class="mv-step mv-' + t + (t === v.label.id ? ' on' : '') + '"></span>').join('') + (v.label.id !== 'necunoscut' ? '<i class="mv-mark" style="left:' + (pos * 100).toFixed(1) + '%"></i>' : '') + '</div>' +
      '<div class="mv-steps">' + ['Defensiv', 'Prudent', 'Neutru', 'Favorabil'].map((t) => '<span>' + t + '</span>').join('') + '</div><p class="mv-score">Scor ' + sgn(v.score) + ' · ' + v.citite + ' din 6 indicatori citiți</p></div></header>' +
      '<div class="mv-body"><section class="mv-why" aria-label="De ce"><h3>De ce</h3><ul>' + v.indicatori.map((x) => '<li class="mv-ind"><i class="mv-dot ' + dot(x.score) + '" aria-hidden="true"></i><span class="mv-name">' + esc(x.name) + '</span><b class="mv-val">' + esc(x.value) + (x.note && x.value !== '—' ? '<small>' + esc(x.note) + '</small>' : '') + '</b><span class="mv-read">' + esc(x.reading) + '</span></li>').join('') + '</ul></section>' +
      '<section class="mv-next" aria-label="Ce vine"><h3>Ce vine · 7 zile</h3>' + fut + (v.ceVine.length ? '<ol>' + v.ceVine.slice(0, 8).map((x) => '<li class="mv-ev ' + (x.impact === 'high' ? 'hi' : '') + '"><time datetime="' + new Date(x.t).toISOString() + '"><b>' + esc(data(x.t)) + '</b>' + (x.tip === 'macro' ? ' ' + esc(ora(x.t)) : '') + '</time><span>' + esc(x.ce) + (x.approx ? ' <small title="Dată estimată din calendar, neconfirmată">~</small>' : '') + '</span><em>' + esc(ziua(x.t, now)) + '</em></li>').join('') + '</ol>' : '<p class="mv-empty">Niciun eveniment important în următoarele 7 zile.</p>') + (v.departe.length ? '<p class="mv-later">Mai departe: ' + v.departe.map((x) => esc(x.ce) + ' <b>' + esc(data(x.t).slice(-5)) + '</b>').join(' · ') + '</p>' : '') + '</section>' +
      '<section class="mv-news" aria-label="Context"><h3>Context</h3>' + (v.titluri.length ? '<ul>' + v.titluri.map((x) => '<li><span class="mv-sym">' + esc(x.symbol || 'Piață') + '</span>' + (safeURL(x.url) ? '<a href="' + esc(safeURL(x.url)) + '" target="_blank" rel="noopener noreferrer">' + esc(x.title) + '</a>' : '<span>' + esc(x.title) + '</span>') + '<small>' + esc(x.publisher || '') + '</small></li>').join('') + '</ul>' : '<p class="mv-empty">Știrile nu sunt încă citite.</p>') + (v.altele ? '<a class="mv-more" href="#newsTitle">Toate știrile, mai jos (' + v.altele + ' în plus)</a>' : '') + '</section>' +
      '<section class="mv-you" aria-label="Pentru tine"><h3>Pentru tine</h3><ul>' + v.pentruTine.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul></section></div>' +
      '<footer class="mv-foot">Rezumat după reguli fixe, din datele de mai sus; descrie contextul, nu prezice și nu e semnal de cumpărare.' + proba + ' Regula finală pentru risc rămâne la Governor.' + (v.breadthStance ? ' Motorul Market Breadth: ' + esc(v.breadthStance) + '.' : '') + '</footer>';
  }
  /* ---------- citirile (pagina nu face cereri de rețea direct; robotul le dă adaptoarele lui) ---------- */
  const getJSON = (url, fetchImpl) => (typeof fetchImpl === 'function' ? fetchImpl(url, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null));
  /** Raportul breadth: sectoarele (uptrend) și rândurile motorului (maxime / minime noi, distribuție, companii mici). */
  function raportBreadth(url = '../market-breadth/data/latest.json', fetchImpl = g.fetch) { return getJSON(url + '?v=' + Math.floor(Date.now() / 300000), fetchImpl).then((j) => (j ? { sectors: j?.sources?.uptrend?.sectors || null, scorecard: j?.full?.engine?.master?.scorecard || null } : null)); }
  function sectors(url, fetchImpl) { return raportBreadth(url, fetchImpl).then((r) => r?.sectors || null); }
  /** Seriile în plus + Fear & Greed. fetchStock(simbol, opțiuni) întoarce bare {t, c} (lib/data.js D.fetchStock în pagină). */
  async function extraData({ fetchStock = g.D?.fetchStock, fetchImpl = g.fetch, now = Date.now() } = {}) {
    const serii = {}, erori = [];
    await Promise.allSettled(EXTRA.map(async (s) => { try { const b = await fetchStock(s, { range: '1y', interval: '1d', ttl: 30 * 60000 }); if (Array.isArray(b) && b.length) serii[s] = b.map((x) => ({ t: x.t, c: x.c })).filter((x) => finite(x.t) && finite(x.c) && x.c > 0); else erori.push(s); } catch (_) { erori.push(s); } }));
    const fg = g.MacroRegime?.fgDin?.(await getJSON('https://api.alternative.me/fng/?limit=1', fetchImpl)) || null;
    return { serii, fg, la: now, erori };
  }
  /** Regimul macro calculat singur (MacroRegime.scor) din seriile pieței + cele în plus. */
  function regimDin(market, x) {
    if (!g.MacroRegime) return null; const pts = (s) => (market?.items || []).find((y) => y.symbol === s)?.points?.map((p) => ({ t: p.at, c: p.value })) || [];
    return g.MacroRegime.scor({ vix: pts('^VIX'), tnx: pts('^TNX'), spy: pts('SPY'), dxy: x?.serii?.['DX-Y.NYB'] || [], btc: x?.serii?.['BTC-USD'] || [], fg: x?.fg || null });
  }
  /** I-678: seriile pozițiilor US (cele mai mari 8 după valoare) și beta portofoliului. */
  async function expunere({ positions = [], total = null, currency = null, spyPoints = [], fetchStock = g.D?.fetchStock } = {}) {
    if (typeof fetchStock !== 'function') return null; const top = positions.filter((p) => symbolOf(p) && finite(p.value) && p.value > 0).sort((a, b) => b.value - a.value).slice(0, 8), serii = {};
    await Promise.allSettled(top.map(async (p) => { const s = symbolOf(p); try { const b = await fetchStock(s, { range: '1y', interval: '1d', ttl: 6 * 3600000 }); if (Array.isArray(b)) serii[s] = b.map((x) => ({ t: x.t, c: x.c })); } catch (_) { /* poziția rămâne în afara calculului */ } }));
    return beta(serii, spyPoints, positions, total, currency);
  }
  /** I-676: fișierul robotului de noapte (verdictul notat, istoricul, marile companii, proba). */
  function robotFile(url = '../candidate-engine/generated/verdict-piata.json', fetchImpl = g.fetch) { return getJSON(url + '?v=' + Math.floor(Date.now() / 600000), fetchImpl).then((j) => (j && j.version === 'verdict-piata-v1' ? j : null)); }
  g.MarketVerdict = { compute, render, sectors, raportBreadth, extraData, regimDin, expunere, robotFile, beta, expirari, symbolOf, safeURL, LABELS, EXTRA };
})(typeof window !== 'undefined' ? window : globalThis);
