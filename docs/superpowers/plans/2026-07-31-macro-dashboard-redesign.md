# Macro Dashboard v234 „Ziarul de dimineață" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign total `macro-dashboard/index.html` (taburi → ziar scrollabil cu brief AI hero + cockpit stil Market Breadth) + brief narativ user-friendly auto-generat + migrare `claude-opus-4-8` → `claude-opus-5` în toată suita.

**Architecture:** Single-file PWA page (HTML+CSS+JS inline, ~6500 linii). Redesign = restructurare HTML/CSS cu păstrarea TUTUROR id-urilor și funcțiilor JS existente (render targets neschimbate); logica nouă = 3 blocuri JS noi (cockpit, parser brief, colapsare secțiuni) + prompt rescris. Migrarea de model = find/replace mecanic pe 12 fișiere.

**Tech Stack:** Vanilla JS, fără build. Verificare: `node --check` pe JS-ul extras + grep-uri + smoke manual în browser.

**Spec:** `docs/superpowers/specs/2026-07-31-macro-dashboard-redesign-design.md` — citește-l ÎNTÂI. Demo vizual aprobat: `.superpowers/brainstorm/245-1785513508/content/demo-full-page-v3.html` (deschide-l în browser ca referință de design).

## Global Constraints

- Română în UI și comentarii; fără ghilimele curbate în stringuri JS noi dacă pot crea probleme de escapare.
- Toate id-urile DOM existente RĂMÂN (JS-ul existent randează în ele). Nu redenumi funcții existente.
- Versionare: macro v233→**v234**; `sw-app.js` `CACHE_VERSION` `tt-v716-2026-07-30`→**`tt-v717-2026-07-31`** (dacă un hook l-a bumpuit deja azi, doar verifică data); badge-uri pagini atinse de model swap: nasdaq-scanner v129→v130, pump-radar v122→v123, earnings-hub v141→v142, market-events v263→v264, sector-rotation v169→v170, markov-lab v3.11→v3.12, guide v4→v5, smart-trade-long v41→v42, watchlist-monitor v161→v162. Hub `index.html` NU are badge numeric (badge-ul lui arată versiunea suitei) — doar textul.
- Git: commit-uri separate per task, push direct după fiecare (regula casei). Mesaje convenționale.
- Costurile din textele UI („$0.05–0.10 / analiză") NU se modifică — doar numele modelului.
- JS syntax check după FIECARE task pe macro-dashboard:
  ```bash
  cd /c/Users/Cimin/premarket_scanner && python - <<'EOF'
  import re
  s = open('macro-dashboard/index.html', encoding='utf-8').read()
  scripts = re.findall(r'<script>(.*?)</script>', s, re.S)
  open('/tmp/md_check.js','w',encoding='utf-8').write('\n;\n'.join(scripts))
  EOF
  node --check /tmp/md_check.js && echo SYNTAX-OK
  ```

---

### Task 1: Migrare model `claude-opus-4-8` → `claude-opus-5` (toată suita, FĂRĂ redesign)

**Files:**
- Modify: `lib/ai.js:13`, `index.html`, `guide/index.html`, `nasdaq-scanner/index.html`, `pump-radar/index.html`, `earnings-hub/index.html`, `market-events/index.html`, `sector-rotation/index.html`, `markov-lab/index.html`, `smart-trade-long/index.html`, `watchlist-monitor/index.html`, `macro-dashboard/index.html`, `sw-app.js`

**Interfaces:**
- Produces: modelul `claude-opus-5` folosit de toate apelurile AI; textele UI spun „Opus 5".

- [ ] **Step 1: Înlocuire globală (bash, din rădăcina repo)**

```bash
cd /c/Users/Cimin/premarket_scanner
FILES="lib/ai.js index.html guide/index.html nasdaq-scanner/index.html pump-radar/index.html earnings-hub/index.html market-events/index.html sector-rotation/index.html markov-lab/index.html smart-trade-long/index.html watchlist-monitor/index.html macro-dashboard/index.html"
perl -pi -e "s/claude-opus-4-8/claude-opus-5/g; s/opus-4-8/opus-5/g; s/opus-4\.8/opus-5/g; s/Opus 4\.8/Opus 5/g; s/opus 4\.8/Opus 5/g" $FILES
```

- [ ] **Step 2: Verifică zero rămășițe**

```bash
grep -rn -i "opus.4.8\|opus-4-8" --include="*.html" --include="*.js" . | grep -v worktree | grep -v ".superpowers"
```
Expected: niciun rezultat. (Textele gen „claude-opus-4-8 streaming" din changelog-urile guide au fost și ele actualizate — descriu feature-uri curente, nu istorie.)

- [ ] **Step 3: Bump badge-uri pe paginile atinse** (valorile din Global Constraints; formatul EXACT al fiecăreia — caută `ver-badge`/`class="ver"` în fiecare fișier și incrementează doar numărul). macro-dashboard NU se bumpuiește aici (o face Task 6 la v234).

- [ ] **Step 4: Bump `sw-app.js` CACHE_VERSION** la `tt-v717-2026-07-31` (citește întâi valoarea curentă — hook-ul de auto-bump poate s-o fi schimbat).

- [ ] **Step 5: Syntax check + commit + push**

```bash
node --check lib/ai.js && cd /c/Users/Cimin/premarket_scanner && git add -u && git commit -m "feat(suite): migrare model claude-opus-5 (fost opus-4-8) + bump badges" && git push
```

---

### Task 2: macro-dashboard — CSS nou + restructurare HTML (schelet ziar)

**Files:**
- Modify: `macro-dashboard/index.html` — blocul `<style>` (~linii 40–980) și `<body>` HTML (~linii 996–1240)

**Interfaces:**
- Consumes: id-urile existente (`statsStrip`, `tile-*`, `commandCenter`, `cc-*`, `freezeBanner`, `calTable`, `calBody`, `macroNewsList`/`cryptoNewsList` (verifică numele reale ale containerelor news prin grep `id="` în tab-macroNews/tab-cryptoNews), `briefBody`, `briefMeta`, `briefDate`, `briefStatus`, `briefGenBtn`, `briefRerunBtn`, `briefArchiveBtn`, `briefBigEvents`, containerele oportunități + watchlist din tab-urile lor).
- Produces: noile elemente: `#cockpit` (cu `#ckSemaphore`, `#ckGauge`, `#ckKpis`), `#heroBrief` (cu `#briefHeadline`, `#briefStandfirst`, `#briefVerdict`), secțiuni `#sec-calendar`, `#sec-macroNews`, `#sec-cryptoNews`, `#sec-opportunities`, `#sec-watchlist`, fiecare cu `.sec-body` și buton `.sec-more`.

**Reguli de restructurare (ordinea nouă a body-ului):**
1. `.macro-wrap` devine `max-width:1560px`.
2. Header-ul existent (h1 + toolbar + pills + butoane) → **topbar sticky** (păstrează TOATE butoanele și id-urile; adaugă clasa `topbar-sticky`).
3. `freezeBanner` rămâne imediat sub topbar.
4. **Cockpit NOU** (`#cockpit`): grid 3 coloane — semafor `#ckSemaphore`, gauge `#ckGauge` (svg gol, populat de JS în Task 3), `#ckKpis` (gol, populat de JS). Fold-urile vechi „🎛 Command Center" și „📊 Indicatori live" și „🔥 Evenimente 24h" SE ELIMINĂ ca elemente vizibile, DAR: `statsStrip` + `commandCenter` se mută într-un `<div id="legacyData" style="display:none">` (JS-ul existent continuă să scrie în ele — sursa de date pentru cockpit; zero modificări în fetch/render-ele lor). Conținutul „Evenimente 24h" (id-urile lui) se mută tot în `#legacyData`.
5. **Hero brief** (`#heroBrief`): meta-linie (`briefDate`, `briefStatus`, `briefRerunBtn`, `briefArchiveBtn`; `briefGenBtn` rămâne dar ascuns — auto-gen îl face inutil, îl păstrăm pt fallback fără cheie) + `#briefHeadline` (h1) + `#briefStandfirst` + `briefBigEvents` + `briefMeta` (ascuns cu `display:none` — înlocuit de KPI cockpit, dar id-ul rămâne pt compat) + `briefBody` (aici randează formatBriefText reperele) + `#briefVerdict` (gol, populat în Task 4).
6. **Secțiunile**: conținutul din `tab-calendar` → `<section id="sec-calendar" class="sec s-cal collapsed">`, idem `tab-macroNews`→`s-news`, `tab-cryptoNews`→`s-crypto`, `tab-opportunities`→`s-op`, `tab-watchmacro`→`s-wl` (ordinea: calendar, macroNews, cryptoNews, opportunities, watchlist). Fiecare primește header `<div class="sec-head"><h2>…</h2><span class="cnt" id="secCnt-…"></span><button class="ghost-sm sec-more" data-sec="…">arată tot ↓</button></div>` și wrapper `.sec-body` în jurul conținutului vechi (id-urile interioare NEATINSE). Filter-bar-ul calendarului intră în `.sec-body` (vizibil doar expandat).
   **De-scope conștient vs spec §2.4:** chips-urile bull/bear din mockup NU se implementează — tabelul existent afișează deja consensus/prev/actual pe coloane (aceeași informație, zero cod nou). Dacă userul le vrea totuși, revin ca idee separată.
7. **Tab bar-ul (liniile ~1067–1073) SE ȘTERGE.** Clasele `tab-content`/`active` se scot de pe containerele mutate.

**CSS nou (se adaugă la finalul `<style>`; folosește variabilele EXISTENTE ale paginii — verifică cu grep `--panel2`, `--acc-1` etc. numele reale înainte):** copiază blocurile `.topbar/.cockpit/.semaphore/.gauge*/.kpis/.kpi/.hero/.headline/.standfirst/.repere/.rep/.verdict/.v-cell/section+.sec-head/.newsgrid/.opgrid/.chip` din demo-ul aprobat `demo-full-page-v3.html`, adaptând culorile hard-codate la variabilele paginii (`#4ade80`→`var(--bull-s)`, `#f87171`→`var(--bear-s)`, `#facc15`→`var(--warn)`, gradientele accent→`var(--acc-1)/var(--acc-2)`). Plus colapsarea:

```css
/* Secțiuni condensate: colapsat = max-height + fade; expandat = tot */
.sec.collapsed .sec-body { max-height:340px; overflow:hidden; position:relative; }
.sec.collapsed .sec-body::after { content:""; position:absolute; inset:auto 0 0 0; height:70px;
  background:linear-gradient(transparent, var(--bg, #0b1020)); pointer-events:none; }
.sec .sec-more.open { color:var(--acc-1); }
```

CSS-ul taburilor (`.tab-btn`, `.tab-content`, media queries aferente) SE ȘTERGE. `brief-empty`, `brief-body`, `brief-section-h`, `brief-section-followup` RĂMÂN (folosite de renderele existente).

- [ ] **Step 1:** Aplică restructurarea HTML conform regulilor 1–7 (folosește Edit pe blocuri; NU regenera fișierul de la zero).
- [ ] **Step 2:** Adaugă CSS-ul nou + șterge CSS-ul taburilor.
- [ ] **Step 3:** Rulează syntax-check-ul din Global Constraints → SYNTAX-OK; deschide pagina în browser (`start macro-dashboard/index.html` sau prin http) → consola FĂRĂ erori JS la load (erorile de `switchTab` la click nu pot apărea — butoanele au dispărut; dacă `switchTab` e apelat la init, vezi Task 5 care îl elimină — pentru acest task e acceptabil un guard temporar: definește `function switchTab(){}` stub dacă init-ul crapă).
- [ ] **Step 4:** Commit: `git add macro-dashboard/index.html && git commit -m "feat(macro): schelet ziar v234 — topbar sticky, cockpit, hero, sectiuni (WIP 1/4)" && git push`

---

### Task 3: JS cockpit — semafor + gauge + KPI cu delte

**Files:**
- Modify: `macro-dashboard/index.html` — bloc JS nou după `// ============ RISK DASHBOARD` (după definirea `RISK_STATE`), apelat din punctele unde se termină `updateRiskDashboard`/refresh-ul tiles (grep `RISK_STATE =` linia ~5803 și finalul funcției care o setează; adaugă `renderCockpit()` acolo + după refresh-ul stat tiles).

**Interfaces:**
- Consumes: `RISK_STATE` (`{label, composite, color, vixScore…}`), `getRegimeTrend(dateET)`, `getNYDateHour()`, `getStatTileVal(id)` (valorile din tiles ascunse), `$(id)` helper.
- Produces: `renderCockpit()` — idempotent, apelabil oricând; cheia LS `md_kpi_snapshot` = `{date:'YYYY-MM-DD', vals:{vix,dxy,teny,btc,fng}}`.

- [ ] **Step 1: Scrie blocul**

```js
// ============ COCKPIT (v234 — semafor + gauge apetit risc + KPI delte) ============
function kpiSnapshot() {
  const today = getNYDateHour().date;
  let snap = null;
  try { snap = JSON.parse(localStorage.getItem('md_kpi_snapshot') || 'null'); } catch (e) {}
  const vals = {
    vix: getStatTileVal('tile-vix'), dxy: getStatTileVal('tile-dxy'),
    teny: getStatTileVal('tile-10y'), btc: getStatTileVal('tile-btc'),
    fng: getStatTileVal('tile-fng')
  };
  if (!snap || snap.date !== today) {
    // prima încărcare a zilei → valorile de acum devin referința de „ieri" pt mâine
    if (Object.values(vals).some(v => v != null)) {
      const prev = snap; // snapshot-ul zilei precedente (dacă există)
      try { localStorage.setItem('md_kpi_snapshot', JSON.stringify({ date: today, vals })); } catch (e) {}
      return { vals, prev: prev ? prev.vals : null };
    }
    return { vals, prev: null };
  }
  return { vals, prev: null, sameDay: snap.vals }; // delta intra-zi față de primul load
}

function fmtDelta(cur, ref, dec, invert) {
  if (cur == null || ref == null) return '';
  const d = cur - ref;
  if (!isFinite(d) || d === 0) return '<span class="kd">→ 0</span>';
  const up = d > 0;
  const good = invert ? !up : up; // VIX/DXY/10Y sus = rău
  return `<span class="kd ${good ? 'up' : 'dn'}">${up ? '▲' : '▼'} ${up ? '+' : ''}${d.toFixed(dec)}</span>`;
}

function renderCockpit() {
  const sem = $('ckSemaphore'), kpis = $('ckKpis'), gauge = $('ckGauge');
  if (!sem || !kpis || !gauge) return;
  // --- semafor din RISK_STATE
  if (RISK_STATE && RISK_STATE.label) {
    const trend = getRegimeTrend(getNYDateHour().date); // null sau {prevLabel, delta} — vezi implementarea existentă
    const s = RISK_STATE.composite, sign = s >= 0 ? '+' : '';
    let trendStr = '';
    if (trend && typeof trend.delta === 'number') {
      const dir = trend.delta > 0 ? '<span class="up">↑ ameliorare</span>' : trend.delta < 0 ? '<span class="dn">↓ deteriorare</span>' : '→ stabil';
      trendStr = ` · ieri ${escHtml(trend.prevLabel || '—')} ${dir}`;
    }
    const advice = { 'RISK-ON': 'Mediu favorabil — sizing normal, urmează trendul.',
      'MIXED': 'Selectiv — poziții mai mici, stopuri strânse.',
      'RISK-OFF': 'Redu expunerea, cash-heavy, fără poziții noi agresive azi.',
      'STRESS': 'Stai deoparte — capital preservation, nu e ziua ta.' }[RISK_STATE.label] || '';
    sem.innerHTML = `<div class="sicon" style="color:${RISK_STATE.color};text-shadow:0 0 18px ${RISK_STATE.color}">◆</div>
      <div><div class="slabel">REGIM DE RISC</div>
      <div class="sstance" style="color:${RISK_STATE.color}">${escHtml(RISK_STATE.label)}</div>
      <div class="ssub">scor <b>${sign}${s}</b>${trendStr} · ${escHtml(advice)}</div></div>`;
  } else {
    sem.innerHTML = `<div class="sicon" style="color:var(--t3)">◆</div><div><div class="slabel">REGIM DE RISC</div><div class="sstance" style="color:var(--t3)">—</div><div class="ssub">se calculează…</div></div>`;
  }
  // --- gauge apetit de risc: composite [-10..+10] → [0..100]%
  const pct = RISK_STATE ? Math.max(0, Math.min(100, Math.round((RISK_STATE.composite + 10) * 5))) : 50;
  const col = RISK_STATE ? RISK_STATE.color : 'var(--t3)';
  const ang = Math.PI * pct / 100; // 0..π de la stânga
  const x = 90 - 70 * Math.cos(ang), y = 92 - 70 * Math.sin(ang);
  const large = pct > 50 ? 1 : 0;
  gauge.innerHTML = `<path d="M 20 92 A 70 70 0 1 1 160 92" fill="none" stroke="rgba(255,255,255,.09)" stroke-width="12" stroke-linecap="round"/>
    <path d="M 20 92 A 70 70 0 ${large} 1 ${x.toFixed(1)} ${y.toFixed(1)}" fill="none" stroke="${col}" stroke-width="12" stroke-linecap="round"/>
    <text x="90" y="84" text-anchor="middle" class="gv">${pct}%</text>
    <text x="90" y="103" text-anchor="middle" class="gl">apetit de risc${RISK_STATE ? '' : ' (estimare)'}</text>`;
  // --- KPI tiles cu delta față de referință (ieri sau primul load al zilei)
  const { vals, prev, sameDay } = kpiSnapshot();
  const ref = prev || sameDay || {};
  const sev = (v, warnAt, badAt, invert) => v == null ? '' : (invert ? (v >= badAt ? 'k-bad' : v >= warnAt ? 'k-warn' : 'k-good') : (v <= badAt ? 'k-bad' : v <= warnAt ? 'k-warn' : 'k-good'));
  const tiles = [
    { l:'VIX', v:vals.vix, r:ref.vix, dec:1, cls:sev(vals.vix, 18, 25, true), invert:true },
    { l:'DXY', v:vals.dxy, r:ref.dxy, dec:1, cls:'', invert:true },
    { l:'10Y', v:vals.teny, r:ref.teny, dec:2, cls:'', invert:true, suf:'%' },
    { l:'BTC', v:vals.btc, r:ref.btc, dec:0, cls:'', invert:false, fmt: v => v >= 1000 ? (v/1000).toFixed(1) + 'k' : String(v) },
    { l:'Fear&Greed', v:vals.fng, r:ref.fng, dec:0, cls:sev(vals.fng, 40, 25, false), invert:false }
  ];
  kpis.innerHTML = tiles.map(t => {
    const disp = t.v == null ? '—' : (t.fmt ? t.fmt(t.v) : t.v.toFixed(t.dec)) + (t.suf || '');
    return `<div class="kpi ${t.cls}"><div class="kv">${disp}</div><div class="kl">${t.l}</div>${fmtDelta(t.v, t.r, t.dec, t.invert)}</div>`;
  }).join('') +
  // Danger + Curbă — păstrează funcțiile Command Center ca tiles clickabile
  `<div class="kpi" onclick="drillDanger()" style="cursor:pointer" title="Danger Score — click pt detalii"><div class="kv" id="ckDanger">${($('cc-danger')?.querySelector('.cc-value')?.textContent) || '—'}</div><div class="kl">Danger</div></div>
   <div class="kpi" onclick="drillCurve()" style="cursor:pointer" title="Curba 10Y-3M — click pt detalii"><div class="kv" id="ckCurve">${($('cc-curve')?.querySelector('.cc-value')?.textContent) || '—'}</div><div class="kl">Curbă 10Y-3M</div></div>`;
}
```

**ATENȚIE la `getRegimeTrend`:** citește ÎNTÂI implementarea reală (linia ~4837) și adaptează câmpurile folosite (`prevLabel`, `delta`) la ce întoarce efectiv — NU inventa.
**ATENȚIE la `getStatTileVal`:** verifică (linia ~2623 usage) că întoarce număr sau null; adaptează dacă întoarce string.

- [ ] **Step 2:** Cheamă `renderCockpit()` la finalul funcției care setează `RISK_STATE` (~5803) și la finalul refresh-ului de stat tiles (funcția care populează `tile-*` — grep `updateStatTiles\|renderStatTiles\|loadTiles`), plus o dată în init.
- [ ] **Step 3:** Syntax check → SYNTAX-OK. Smoke în browser: cockpit populat după load (semafor + gauge + KPIs), `md_kpi_snapshot` apare în LS, click pe Danger/Curbă deschide drill-urile.
- [ ] **Step 4:** Commit: `feat(macro): cockpit — semafor regim + gauge apetit risc + KPI delte (WIP 2/4)` + push.

---

### Task 4: Brief narativ — prompt nou + parser + hero render + auto-gen

**Files:**
- Modify: `macro-dashboard/index.html` — `AI_SYSTEM_BRIEF` (~4680), `generateBrief` (~4980), `renderBrief` (~5142), `renderBriefEmpty` (~5165), `shouldAutoGenerateBrief` (~5191), `initBriefTab` (~5199), init flow (~6600+)

**Interfaces:**
- Consumes: `buildBriefContext()` NEATINS; `callAnthropicStream(system, prompt, onChunk, maxTokens)`; `formatBriefText(text)`; cache LS `md_brief_cache`/`md_brief_archive` (compat înapoi).
- Produces: obiect brief extins `{dateET, generatedAt, text, headline, standfirst, verdict:{stocks,crypto,risc}|null, ctx}`; funcția `parseBriefOutput(full)`.

- [ ] **Step 1: Înlocuiește COMPLET textul `AI_SYSTEM_BRIEF` cu:**

```js
const AI_SYSTEM_BRIEF = `Esti un analist de piata care ii explica dimineata unui prieten inteligent (trader retail pe Nasdaq + crypto) CE SE INTAMPLA si DE CE — ca un editorial de ziar financiar, nu ca un desk note tehnic.

TON: clar, direct, uman. Zero jargon neexplicat — daca folosesti un termen tehnic (yields, hawkish, ETF outflows), explica-l scurt in paranteza. Zero disclaimere, zero umplutura. Povestea din spatele cifrelor conteaza: geopolitica, deciziile bancilor centrale, schimbarile de sentiment — leaga-le cauzal ("X s-a intamplat, DE ACEEA Y scade").

REGIMUL DE RISC e DEJA CALCULAT ("REGIM DE RISC (oficial)"). FOLOSESTE-L, nu-l recalcula, nu scrie MARKET_MOOD. Trendul lui (ieri→azi) e material pentru sectiunea de schimbari de regim.

ORE: converteste TOATE orele la ora Romaniei (ET + 7h; ex. 08:30 ET = "15:30 ora ta"). NU folosi "ET" in text.

FARA Entry/SL/TP, fara tabele de praguri. Nivelurile importante se spun narativ ("sub $180 corectia accelereaza", "BTC tine greu zona 115k") si DOAR din "NIVELURI TEHNICE LIVE" — zero cifre inventate. Daca nu ai un nivel, nu-l scrie.

STRUCTURA OBLIGATORIE a raspunsului (exact in ordinea asta):
Linia 1: un HEADLINE de ziar, max 90 caractere, fara markdown, fara doua puncte la inceput — carligul zilei.
Linia 2: STANDFIRST — 1-2 propozitii care rezuma povestea si miza zilei.
Apoi EXACT 4 sectiuni cu headinguri markdown FIXE (nu le reformula):
## 🌍 Ce s-a intamplat peste noapte
Geopolitica si pietele externe: negocieri, conflicte, decizii, Asia/Europa, moves overnight. Ce fapte NOI au aparut si pe cine lovesc.
## ⚡ Ce misca piata azi
Evenimentele si earnings-urile de AZI (din context), cu ora Romaniei si ce inseamna o citire buna/proasta — narativ, nu tabel. Watchlist-ul userului are prioritate cand e atins.
## 🔮 Schimbari de regim
Regimul oficial + trendul lui, explicat pe intelesul omului: ce s-a schimbat fata de ieri si DE CE (compara cu TEZA DE IERI daca exista — daca biasul s-a schimbat, spune explicit ce fapt nou l-a schimbat; daca nu, "teza de ieri se mentine").
## 👁 La ce sa fii atent
2-4 lucruri concrete de urmarit (watchlist prioritar, niveluri narative, catalisti), inclusiv UN risc principal care ar rasturna povestea zilei.
Ultima linie, EXACT formatul (o singura linie, nimic dupa ea):
VERDICT: STOCKS <LONG|SHORT|NEUTRAL|DEFENSIV> · CRYPTO <LONG|SHORT|NEUTRAL|DEFENSIV> · RISC <agresiv|normal|redus|cash-heavy>

LUNGIME: 500-700 cuvinte total. Romana 100% (tickere si termeni consacrati raman in original), tickere bold **AAPL**, paragrafe curgatoare (nu bullets).`;
```

- [ ] **Step 2: Adaugă `parseBriefOutput` lângă `generateBrief`:**

```js
// v234: desparte headline / standfirst / corp / verdict din output-ul AI
function parseBriefOutput(full) {
  const lines = full.trim().split('\n');
  let headline = '', standfirst = '', verdict = null;
  let bodyStart = 0;
  if (lines[0] && !lines[0].startsWith('#') && !/^VERDICT:/i.test(lines[0])) { headline = lines[0].replace(/^\*+|\*+$/g, '').trim(); bodyStart = 1; }
  // standfirst = liniile pana la primul heading ##
  const sf = [];
  while (bodyStart < lines.length && !lines[bodyStart].startsWith('##')) {
    if (lines[bodyStart].trim()) sf.push(lines[bodyStart].trim());
    bodyStart++;
  }
  standfirst = sf.join(' ');
  let body = lines.slice(bodyStart);
  const vIdx = body.findIndex(l => /^\s*VERDICT:/i.test(l));
  if (vIdx >= 0) {
    const m = body[vIdx].match(/VERDICT:\s*STOCKS\s+([A-ZĂÂÎȘȚa-z-]+)\s*·\s*CRYPTO\s+([A-ZĂÂÎȘȚa-z-]+)\s*·\s*RISC\s+([a-zA-Z-]+)/i);
    if (m) verdict = { stocks: m[1].toUpperCase(), crypto: m[2].toUpperCase(), risc: m[3].toLowerCase() };
    body = body.slice(0, vIdx);
  }
  return { headline, standfirst, text: body.join('\n').trim(), verdict };
}
```

- [ ] **Step 3: În `generateBrief`:** după `const full = await callAnthropicStream(...)` ȘTERGE parse-ul MARKET_MOOD (nu mai există) și construiește:

```js
    const parsed = parseBriefOutput(full);
    const brief = {
      dateET: nyt.date, generatedAt: Date.now(),
      text: parsed.text, headline: parsed.headline, standfirst: parsed.standfirst,
      verdict: parsed.verdict, mood: null,
      ctx: { eventsCount: ctx.eventsCount, hiCount: ctx.hiCount, tiles: ctx.tilesList, bigEvents: ctx.bigEvents }
    };
```
`maxTokens` 2200→**2600**. Prompt-ul user (contextul) rămâne identic, DOAR ultima linie devine: `Genereaza editorialul de dimineata conform structurii (headline + standfirst + 4 sectiuni + VERDICT, 500-700 cuvinte).`
Arhiva: `getPrevThesis` folosește `tldr` — verifică implementarea (~4807) și fă fallback: `tldr: brief.headline || vechiul tldr`.

- [ ] **Step 4: În `renderBrief`:** populează `#briefHeadline` cu `brief.headline` (fallback: prima linie din text), `#briefStandfirst` cu standfirst (ascunde dacă gol), `briefBody` cu `formatBriefText(brief.text)` (neschimbat — headingurile ## devin `.brief-section-h` clickabile = drill-down existent), `#briefVerdict`:

```js
  const v = brief.verdict, vEl = $('briefVerdict');
  if (vEl) {
    if (v) {
      const dirIcon = d => d === 'LONG' ? '↗' : d === 'SHORT' || d === 'DEFENSIV' ? '↘' : '→';
      const dirCls = d => d === 'LONG' ? 'v-good' : d === 'SHORT' || d === 'DEFENSIV' ? 'v-bad' : 'v-warn';
      vEl.style.display = '';
      vEl.innerHTML = `<div class="v-cell ${dirCls(v.stocks)}"><div class="lb">STOCKS</div><div class="val">${dirIcon(v.stocks)} ${escHtml(v.stocks)}</div></div>
        <div class="v-cell ${dirCls(v.crypto)}"><div class="lb">CRYPTO</div><div class="val">${dirIcon(v.crypto)} ${escHtml(v.crypto)}</div></div>
        <div class="v-cell ${v.risc === 'agresiv' || v.risc === 'normal' ? 'v-good' : 'v-bad'}"><div class="lb">RISC</div><div class="val">${escHtml(v.risc.toUpperCase())}</div></div>`;
    } else { vEl.style.display = 'none'; }
  }
```
(CSS: `.v-good{...bull}` `.v-bad{...bear}` `.v-warn{...warn}` — adaugă la CSS-ul verdictului din Task 2 dacă nu există.)

- [ ] **Step 5: Auto-gen fără gate:** `shouldAutoGenerateBrief` devine: `return !(loadBriefCache()?.dateET === getNYDateHour().date);`. În init: după `initBriefTab()` (care afișează instant cache-ul, chiar vechi), dacă `shouldAutoGenerateBrief()` → `generateBrief()`. Șterge `updateBriefNextTime` + referințele (nu mai există fereastră). `renderBriefEmpty` — text nou: „Se generează automat la prima deschidere a zilei. Adaugă cheia Anthropic în ⚙ Setări pentru brief." + buton care deschide setările dacă nu e cheie.

- [ ] **Step 6:** Syntax check → SYNTAX-OK. Smoke: cu cheie API validă, la load se generează briefu' (o singură dată/zi), headline+standfirst+verdict card apar, click pe heading secțiune → follow-up AI funcționează, 📜 arhiva se deschide, ↻ Rerun regenerează.
- [ ] **Step 7:** Commit: `feat(macro): brief narativ v234 — prompt editorial, headline+verdict parsat, auto-gen la load (WIP 3/4)` + push.

---

### Task 5: Secțiuni condensate + curățare taburi + lazy-load la deschidere

**Files:**
- Modify: `macro-dashboard/index.html` — `switchTab` (~5214), init listeners (~6634), bloc nou `initSections`

**Interfaces:**
- Consumes: secțiunile din Task 2 (`.sec`, `.sec-more`, `data-sec`), funcțiile existente `fetchMacroNews`, `fetchCryptoNews`, `_newsLoadedAt`, `NEWS_CACHE_TTL`.
- Produces: `initSections()`; taburile complet eliminate din JS.

- [ ] **Step 1:** ȘTERGE funcția `switchTab` + listener-ul `.tab-btn` din init + orice apel `switchTab(...)` (grep `switchTab` → zero rezultate după). Logica de lazy-load din `switchTab` (news fetch la deschiderea tabului) se mută în init: la load, după calendarul principal, cheamă direct `fetchMacroNews()` și `fetchCryptoNews()` (secțiunile sunt acum vizibile pe pagină; TTL-urile existente previn refetch).

- [ ] **Step 2: Adaugă și apelează în init:**

```js
// ============ SECTIUNI ZIAR (v234 — colapsare cu „arata tot") ============
function initSections() {
  document.querySelectorAll('.sec-more').forEach(btn => btn.addEventListener('click', () => {
    const sec = btn.closest('.sec');
    const open = sec.classList.toggle('collapsed') === false;
    btn.textContent = open ? 'restrânge ↑' : 'arată tot ↓';
    btn.classList.toggle('open', open);
  }));
}
```

- [ ] **Step 3:** Contoare secțiuni: unde renderele existente știu numărul (calendar `filterCount`, news length, op-badge), oglindește-l în `#secCnt-…` (un rând per render, ex. la finalul render-ului de calendar: `const c=$('secCnt-calendar'); if(c) c.textContent = \`\${shown} evenimente\`;` — identifică variabila reală de count în fiecare render înainte).
- [ ] **Step 4:** Syntax check → SYNTAX-OK. Smoke: toate cele 5 secțiuni vizibile și populate la load, colapsate la 340px cu fade, „arată tot" expandează/restrânge, filter/search calendar funcționează expandat, click pe news → AI expand, click ticker watchlist → modal.
- [ ] **Step 5:** Commit: `feat(macro): sectiuni ziar condensate + eliminare taburi (WIP 4/4)` + push.

---

### Task 6: Ghid, versionare finală, verificare completă

**Files:**
- Modify: `macro-dashboard/index.html` (ghid + badge v234), `sw-app.js` (doar dacă data s-a schimbat), `index.html` hub (textul cardului macro dacă descrie taburi)

- [ ] **Step 1:** Actualizează conținutul ghidului 📖 din pagină (liniile ~1260–1440): descrie noua structură (ziar, cockpit, brief narativ cu 4 repere + verdict, secțiuni cu „arată tot", auto-gen 1/zi), șterge referirile la taburi și la desk note/Entry-SL-TP. Actualizează și meta description (linia 8) + `brief-empty` texte rămase.
- [ ] **Step 2:** Bump badge macro: `v233` → `v234` (linia ~999, id `verBadge`). Verifică hub `index.html` — cardul macro-dashboard: actualizează descrierea dacă menționează taburi/brief tehnic.
- [ ] **Step 3:** Verificare finală completă:

```bash
cd /c/Users/Cimin/premarket_scanner
grep -rn -i "opus.4.8\|opus-4-8" --include="*.html" --include="*.js" . | grep -v worktree | grep -v ".superpowers"   # zero
grep -n "switchTab\|tab-btn\|tab-content" macro-dashboard/index.html    # zero
grep -n "08:00 ET" macro-dashboard/index.html                            # zero (gate eliminat)
```
Syntax check → SYNTAX-OK. Smoke final în browser: load complet fără erori în consolă, brief generat, cockpit viu, toate secțiunile, setări/alerte/arhivă funcționale, responsive la 900px (DevTools).
- [ ] **Step 4:** Commit final: `feat(macro): redesign ziar de dimineata v234 — ghid + versionare finala` + push. Raportează hash-urile tuturor commit-urilor.
