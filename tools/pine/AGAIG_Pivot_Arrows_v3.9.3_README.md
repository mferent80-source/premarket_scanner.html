# AGAIG Pivot Arrows v3.9.3 — README

Indicator Pine v6 de detecție pivoturi (BUY/SELL) cu trei moduri de semnal,
adaptat pentru **trade rapid intraday** (15 / 30 / 60 min).

## Nou în v3.9.3 — Audit fixes (corectitudine)
Patch de corectitudine după un audit sever. Comportamentul de bază e neschimbat;
se repară edge-case-uri și se curăță câteva defaulturi.

- **🔴 FIX major-swing dublu.** O bară care era **simultan** swing high și swing low
  putea stampila un BUY și un SELL la **același preț/aceeași bară** (cele două direcții
  împărțeau un singur `majorBar`/`majorPrice`). Acum BUY și SELL au ancore separate.
- **🟡 FIX filtre context în Confirmed.** Filtrele **Sesiune** și **Volum** se evaluează
  acum pe **bara pivotului** (nu pe bara de confirmare de mai târziu), ca un turn să fie
  judecat pe propria bară. Se aplică în Confirmed (non-major) + Confirmed+Potential.
  *Notă:* major-swing are ancora variabilă în timp → acolo filtrul rămâne la confirmare.
  Early evaluează bara live → neschimbat.
- **🔵 FIX referință calitate (Early).** Un **reversal estompat** (heads-up, fără calitate)
  nu mai consumă referința Min-Swing / Min-Bars, ca să nu suprime următorul semnal real.
- **🔵 Polish.** `Pivot Length` minim = 2 (1 degenera detectorul); `confThr` tratează ATR
  `na` la cold start explicit; **Mode Tag / Leader / Reversal markers acum default OFF**
  (vizualele de chart pornesc ascunse — dashboard-ul rămâne ON). Le reactivezi din inputs.

## Nou în v3.9.2 — Reversal markers (Early)
Sub `Early / Fast Mode` → **Reversal markers (Early)** (default OFF din v3.9.3). După un semnal,
dacă momentum-ul Early se întoarce **contrar** ultimei direcții afișate, apare imediat
un marker — **chiar dacă** filtrul Min Swing / Min Bars l-ar fi tăiat — ca să nu ratezi
nicio întoarcere. Semnalele de calitate rămân pline; reversările care n-au trecut filtrul
apar **estompate** (heads-up: fără alertă, fără leader, nu mișcă „State"). ⚠ Respectă
gate-ul — pentru reversări **contra-trend** trebuie `Gate Action = Color only` (sau gate
oprit). Doar în modul Early.

## Nou în v3.9.1 — Gate Action (Block / Color only)
Sub `Trend Gate (HTF)` → **Gate Action**:
- **Block counter-trend** (default) — semnalele contra-trend sunt ascunse complet.
- **Color only (show faded)** — semnalele contra-trend se afișează **estompate**
  (avertisment), nu se ascund. Cele aliniate cu trendul HTF rămân normale. Faded =
  **nu** trimite alertă, **nu** trage leader și **nu** mișcă „State" din dashboard
  (heads-up, nu apelul de trend). Util pt scalp pe ambele direcții, văzând clar ce e
  aliniat. Se aplică la **Confirmed + Early**; **Confirmed + Potential** rămâne mereu
  pe Block (acolo estomparea înseamnă deja „Potential").

## Ce e nou în v3.9.0 (pachet Intraday / Fast)

1. **HTF Trend Gate** — filtrul principal anti-whipsaw. Un EMA pe timeframe
   superior dă biasul de trend: lasă să treacă **doar BUY în up-trend** și
   **doar SELL în down-trend**. Aliniază fiecare semnal cu trendul mare.
   - **Non-repaint:** biasul e citit din **ultima bară HTF închisă**
     (`close[1]` + `EMA[1]`, `lookahead_off`) → nu se redesenează în bara HTF
     în formare. Costul onest: până la o bară HTF de lag.
   - **Auto HTF:** 15m→60, 30m→120, 60m→240, altfel Daily. Sau manual.
   - Default **ON**.
2. **Preset „Intraday"** — auto-tunează după timeframe-ul chart-ului:
   | TF chart | Pivot Length | ATR filtre | Min bars |
   |----------|--------------|------------|----------|
   | ≤ 15m    | 3            | 0.8        | 1        |
   | 30m      | 4            | 1.0        | 2        |
   | ≥ 60m    | 5            | 1.2        | 3        |
3. **Context Filters (opționale, OFF by default):**
   - **Session Filter** — semnale doar în fereastra activă (ex. `0930-1600`).
   - **Volume Confirmation** — semnal doar dacă volumul ≥ `Volume Multiple` ×
     media. Volumul `na` (forex/indici) = **pass**, niciodată block.
4. **Dashboard** — rând nou **„Trend"** cu starea gate-ului (Up/Down + HTF),
   ca să vezi DE CE un semnal a trecut sau a fost tăiat.
5. **Defaults pentru viteză:** Signal Mode = **Early (repaints)**,
   Asset Preset = **Intraday**. Se schimbă oricând din inputs.

## Cele trei moduri de semnal

- **Confirmed** — pivot clasic, așteaptă barele de confirmare. Non-repaint, lent.
- **Early (repaints)** — fire pe bara în formare (reversal de momentum).
  Rapid, dar **repaintează intrabar** până închide bara (lag de confirmare zero,
  NU lag-0 ca procesare de semnal). „Ignore Last Bar" ascunde semnalul live.
- **Confirmed + Potential** — Potential faded imediat + stamp Confirmed când
  pivotul se validează; alternanță strictă Buy→Sell→Buy.

## Cum se folosește (recomandat pentru trade rapid)

1. Pune indicatorul pe chart 15m / 30m / 60m.
2. Lasă defaults: **Early + Intraday + Gate ON**.
3. Citește dashboard-ul: rândul **Trend** îți arată direcția HTF permisă.
   Tranzacționează în direcția trendului — gate-ul deja taie contra-trend.
4. Opțional, pe acțiuni US activează **Session Filter** `0930-1600` și/sau
   **Volume Confirmation** ca să mai cureți semnalele.
5. Pentru alerte: există BUY / SELL / POTENTIAL BUY / POTENTIAL SELL, aliniate
   cu ce vezi pe chart (gate-ul se aplică și alertelor).

## Avertismente oneste

- **Early repaintează** — inerent. Gate-ul reduce semnalele false, dar nu
  elimină repaint-ul live. Pentru intrări „pe ferm", confirmă pe bară închisă.
- Gate-ul cu `[1]` introduce **până la o bară HTF de lag** pe bias — deliberat,
  pentru stabilitate (anti-repaint). E un compromis, nu un bug.
- Lângă EMA-ul HTF biasul poate oscila (price ≈ EMA). Crește `HTF EMA Length`
  dacă vrei un trend mai lat/mai stabil.

## Suprapuneri cu suita ta

Logica „gate trend confirmat" din v3.9.0 se suprapune conceptual cu filtrele
tale de trend din Multi-Symbol / nasdaq-scanner. Aici e self-contained în Pine
(EMA HTF), nu folosește același cod — e o lentilă separată, nu un dublu.
