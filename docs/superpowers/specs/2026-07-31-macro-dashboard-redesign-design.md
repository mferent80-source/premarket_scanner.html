# Macro Dashboard v234 — „Ziarul de dimineață" (redesign total + brief narativ + Opus 5)

**Data:** 2026-07-31 · **Pagina:** `macro-dashboard/index.html` (v233 → v234) · **Demo aprobat:** `.superpowers/brainstorm/245-1785513508/content/demo-full-page-v3.html`

## 1. Scop

Trei schimbări într-o livrare:
1. **Redesign total UI**: dispare structura pe taburi; pagina devine un „ziar de dimineață" — o singură coloană scrollabilă cu brief-ul AI ca hero, lățime 1560px, cockpit stil Market Breadth Terminal.
2. **Brief nou, user-friendly**: narativ (geopolitică, schimbări de regim, evenimente), nu desk note tehnic. Auto-generat la deschidere, max 1/zi.
3. **Migrare model**: `claude-opus-4-8` → `claude-opus-5` în TOATĂ suita (cod + texte UI).

## 2. Structura paginii (de sus în jos)

Toate în stil **Terminal glow** (paleta dark navy existentă a suitei: glass panels, accente gradient albastru→verde, mono pe cifre, `tabular-nums`). Mood-theming existent (`body[data-mood]`) se păstrează și colorează fundal/accente după regim.

### 2.1 Topbar sticky
Logo 🌍 Macro + ver-badge (v234, colorat după mood — existent) + data/ora + dreapta: 🔔 alerte, ⚙ setări, 🧭 nav suită. `position:sticky`, fundal blur (`backdrop-filter`), border-bottom subtil.

### 2.2 Cockpit (nou — împrumutat din Market Breadth Terminal)
Grid 3 coloane (`minmax(340px,1.3fr) auto 2.2fr`), panou glass:
- **Semafor**: ◆ mare colorat după regim + label „REGIM DE RISC" + stance-ul mare (RISK-ON/MIXED/RISK-OFF/STRESS) + sub-linie: `scor ±N · ieri X ↑/↓ trend · recomandare scurtă`. Sursa: `RISK_STATE` existent (compozit VIX+10Y+ρ+F&G+DXY) + snapshot-ul de ieri (existent).
- **Gauge SVG semicircular** „apetit de risc %": arc 180°, mapare liniară scor compozit [−10..+10] → [0..100%]; culoarea arcului = culoarea regimului. Static (fără librării), regenerat la fiecare refresh de date.
- **KPI tiles** (6): VIX, DXY, 10Y, BTC, F&G, ρ BTC·NDX — valoare mare + label mono uppercase + delta ▲/▼ față de ieri, tile colorat după severitate (k-good/k-warn/k-bad). Sursa: tiles-urile existente + snapshot zilnic pentru delte (nou: reține valorile la primul load al zilei, cheie LS `md_kpi_snapshot`).

### 2.3 Hero: AI Daily Brief
Panou hero cu gradient albastru + shadow mare:
- **Meta-linie** mono discretă: `✅ generat azi HH:MM · claude-opus-5 · Ns` + dreapta: `↻ Rerun` și `📜 Arhiva 7 zile` (funcțiile existente).
- **Headline** 34px gradient (albastru→verde) — AI-ul îl generează (prima linie a brief-ului).
- **Standfirst** — subtitlu de ziar 1-2 propoziții (a doua linie generată).
- **4 repere pe grid 2 coloane** (desktop; 1 col pe mobil), fiecare cu heading fix: `🌍 CE S-A ÎNTÂMPLAT PESTE NOAPTE`, `⚡ CE MIȘCĂ PIAȚA AZI`, `🔮 SCHIMBĂRI DE REGIM`, `👁 LA CE SĂ FII ATENT`. Click pe heading → **drill-down AI existent** (`drillBriefSection`), hover arată „⤵ detaliază". Tickerele **bold** → **ticker auto-link existent** (modal chart).
- **Verdict card** — 3 celule colorate: STOCKS (direcție) · CRYPTO (direcție) · RISC (nivel). Parsat din ultima linie a brief-ului (vezi §3). Nu e vot nou — e concluzia AI ancorată pe regimul oficial.
- **Empty/error states**: fără cheie Anthropic → empty-state cu buton spre setări (restul paginii funcționează); eroare API → stil error existent.

### 2.4 Secțiuni condensate (coloană unică, sub hero)
Fiecare `<section>` glass cu **border-top 3px colorat** (stil scard din breadth) + header (titlu, contor mono, buton `arată tot ↓` care expandează inline). Ordinea:
1. **📅 Azi & mâine** (albastru) — evenimentele high/med de azi + mâine, orele convertite la **ora României**, bulină impact, chips bull/bear derivate din consensus/prev (NU din brief; afișate doar unde există date); separator „— MÂINE —". „Arată tot" → calendarul complet existent (săptămâna). Result detection existent rămâne.
2. **📰 Macro news** (violet) — top 8, grid `auto-fit minmax(360px,1fr)`; sentiment 🔴🟡🟢; click → AI inline expand existent. „Arată tot" → lista completă.
3. **₿ Crypto news** (portocaliu) — idem, top 8.
4. **💡 Oportunități** (verde) — carduri `auto-fit minmax(320px,1fr)`: simbol + stele + motivație scurtă. Logica existentă de oportunități rămâne; op-badge-ul din tab devine contorul secțiunii.
5. **👁 Watchlist** (teal) — chips simbol + Δ%; click → modal stock existent.

### 2.5 Responsive
Sub 900px: cockpit → 1 coloană, repere → 1 coloană, news → 1 coloană, verdict → vertical, chips praguri ascunse. Min-height 40px pe butoane (touch, regulă existentă).

## 3. Brief-ul nou — prompt `AI_SYSTEM_BRIEF` rescris

- **Persona**: analist care explică piața unui prieten inteligent — NU desk strategist. Ton clar, direct, zero jargon neexplicat (termenii tehnici se explică în paranteză scurtă), zero disclaimere.
- **Accent**: știri geopolitice care influențează bursa, schimbări de regim, evenimente — povestea din spatele cifrelor. `ctx.geoList` (existent) urcă în fața promptului.
- **Structură obligatorie a output-ului**:
  1. Linia 1: **headline** de ziar (max ~90 caractere, fără markdown).
  2. Linia 2: **standfirst** (1-2 propoziții).
  3. Exact 4 secțiuni cu headingurile FIXE: `## 🌍 Ce s-a întâmplat peste noapte`, `## ⚡ Ce mișcă piața azi`, `## 🔮 Schimbări de regim`, `## 👁 La ce să fii atent` — paragrafe curgătoare (nu bullets), tickere **bold**.
  4. Ultima linie, parsabilă: `VERDICT: STOCKS <LONG|SHORT|NEUTRAL|DEFENSIV> · CRYPTO <...> · RISC <agresiv|normal|redus|cash-heavy>`.
- **Reguli păstrate din promptul vechi**: regimul oficial e sursă unică (nu-l recalculează, fără MARKET_MOOD), good-news-=-bad-news, continuitate cu teza de ieri (în secțiunea 🔮), watchlist prioritizat (în secțiunea 👁), zero cifre inventate.
- **Reguli noi**: toate orele în **ora României** („15:30 ora ta"), NU ET; fără Entry/SL/TP și fără praguri-tabel în text — pragurile simple se spun narativ („sub $180 corecția accelerează"). Excepție: pentru chips-urile bull/bear din calendar, AI-ul NU e sursa — rămân din consensus (praguri afișate doar dacă există în date).
- **Lungime**: ~500–700 cuvinte; `max_tokens` 2600.
- **Parsare în JS**: headline = linia 1; standfirst = linia 2; secțiuni după headinguri; VERDICT cu regex tolerant — dacă lipsește/neparsabil, cardul verdict nu se afișează (fără crash), restul brief-ului se randează normal.
- Cache/arhivă: obiectul `brief` din LS primește câmpuri noi (`headline`, `standfirst`, `verdict`), `text` rămâne pentru compat cu arhiva veche; arhiva 7 zile + teza de ieri (TL;DR ieri → devine headline-ul de ieri) + `snapshotRegimeDaily` — păstrate.

## 4. Auto-generare la deschidere

- **Dispare** gate-ul 08:00 ET (`shouldAutoGenerateBrief` simplificat): la load, dacă nu există brief cu `dateET` = ziua ET curentă → generează imediat.
- Cache pe zi (12h existent devine simplu „o dată pe zi ET") → cost ~1 generare/zi (~$0.10–0.15).
- `↻ Rerun` forțează regenerarea (ex. după PCE/CPI la 15:30 ora RO).
- Brief-ul de ieri se afișează instant (stale marker) în timp ce se generează cel nou — nu ecran gol.

## 5. Migrare Opus 4.8 → Opus 5 (toată suita)

- `claude-opus-4-8` → `claude-opus-5` în: `lib/ai.js` (DEFAULT_MODEL), `macro-dashboard`, `nasdaq-scanner`, `pump-radar`, `earnings-hub`, `market-events`, `sector-rotation`, `markov-lab` (+ orice alt hit la grep final).
- Texte UI: „Opus 4.8" / „opus-4.8" / „opus-4-8" → „Opus 5" / „claude-opus-5" în butoane, ai-meta, descrieri costuri, `guide/index.html` (registrul de features descrie starea curentă → se actualizează), `index.html` hub.
- Grep final de verificare: zero apariții `opus-4-8` / `opus 4.8` (case-insensitive) în afara changelog-urilor istorice din comentarii, dacă există.

## 6. Ce dispare / ce se păstrează

**Dispare:** taburile + `switchTab` + CSS-ul lor; desk note-ul tehnic (promptul vechi); gate-ul 08:00 ET; empty-state-ul vechi al brief-ului; secțiunea Ghid pe tab (devine link/modal din ⚙ — conținutul ghidului se actualizează la noua structură).

**Se păstrează (re-găzduit, logică neatinsă):** `buildBriefContext` integral, drill-down secțiuni, ticker auto-link + modal stock, arhiva 7 zile, teza de ieri, snapshot regim, result detection, alerte + 🔔, toate fetch-urile (Finnhub/Yahoo/alternative.me/Reddit) și cache-urile cu TTL-urile lor, mood theming, `AI.stream`/`callAnthropicStream`, cheile din setări.

## 7. Versionare & git

- `macro-dashboard`: ver-badge **v234**; ghidul intern al paginii actualizat la noua structură.
- Fiecare pagină atinsă de migrarea de model: bump badge propriu (formatul EI, citit din fișier).
- `sw-app.js`: un singur bump `CACHE_VERSION` (`tt-vNNN-2026-07-31`, NNN = curent+1, citit din fișier la implementare).
- Commit-uri separate (regula pachetelor): (1) `feat(macro): redesign ziar v234` (2) `feat(suite): migrare claude-opus-5` — fiecare cu push direct.
- `.gitignore`: adaugă `.superpowers/`.

## 8. Edge cases

- **Fără cheie Anthropic**: hero empty-state cu CTA spre setări; cockpit + secțiuni funcționează (nu depind de AI).
- **VERDICT neparsabil**: cardul nu se randează; log în consolă; restul brief-ului OK.
- **Fără date pentru delte KPI** (prima zi): tiles fără delta.
- **Regim indisponibil** (`RISK_STATE` null): semafor gri „—", gauge la 50% cu label „estimare", brief-ul primește nota existentă de fallback.
- **Brief vechi în LS format v233** (fără headline/standfirst): randare fallback pe `text` cu `formatBriefText` existent.
