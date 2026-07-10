# Spec: Macro Rail în Journal → Desk

**Data:** 2026-07-10  
**Status:** aprobat de user (A + Desk + context-only)  
**Backlog:** I-159  
**Versiune suită la implementare:** tt-v592+

## 1. Problema

Dimineața, traderul sare între **Hub** (snapshot), **Macro Dashboard** (calculează regim + danger) și **Journal → Desk** (verdict Governor TRADE/HALT). Desk-ul arată disciplina (buget, PnL azi, cooldown) dar **nu arată contextul macro live** care justifică sizing-ul și timing-ul intrărilor.

`hub-brief.js` citește deja cache-ul Macro (`md_risk_regime`, `md_danger_daily`, `md_regime_daily`, `md_wl_suggestions`) — dar doar pe hub. Journal Desk folosește regimul la **închiderea execuțiilor** (scorecard pe regim), nu la momentul deciziei.

## 2. Decizii aprobate

| Decizie | Alegere |
|---------|---------|
| Abordare | **A — Macro Rail** în Journal (nu embed, nu mutare totală în hub) |
| Plasare | **Tab Desk** — între `desk-deck` și scorecard |
| Governor | **Context only** — regim/danger **nu** modifică verdictul TRADE/HALT/CAUTION automat în v1 |
| Macro Dashboard | Rămâne pagina de **deep dive** + singura sursă de **calcul** regim/danger |

## 3. Obiectiv

Secțiune nouă **Macro Rail** pe Journal → Desk care afișează context macro acționabil lângă verdictul Governor, fără duplicarea monolitului `macro-dashboard/index.html` (~6900 linii).

**Succes:** utilizatorul deschide Journal → Desk și vede regim, danger, evenimente azi și linia „→ AZI: …" fără să deschidă Macro — dacă cache-ul e proaspăt. Dacă cache-ul lipsește, mesaj clar + link Macro.

## 4. Layout UI

```
┌─ desk-deck (existent, neschimbat) ───────────┐
│ TRADE/HALT · buget · strip · execuții azi    │
└──────────────────────────────────────────────┘
┌─ desk-macro-rail (NOU) ──────────────────────┐
│ [bar compact: regim · danger · piață]        │
│ [↻ Reîmprospătează] [Macro deep dive →]      │
│ <details open> Acțiune azi                     │
│ <details> Calendar (max 3 evenimente)          │
└──────────────────────────────────────────────┘
┌─ desk-scorecard + leak + DD (existent) ──────┘
```

### 4.1 Bar compact (mereu vizibil)

- **Regim:** label colorat (aceeași mapare ca `pbRenderHero`: RISK-ON/LEAN verde, NEUTRAL, CAUTIOUS portocaliu, RISK-OFF/STRESS roșu) + streak din `md_regime_daily` dacă ≥2 zile consecutive cu același label.
- **Danger:** scor `/100` + bandă sizing (`CALM 1x` … `PERICULOS 0.25-0.5x`) — aceleași praguri ca hub Brief.
- **Piață (opțional, best-effort):** one-liner SPY/QQQ/VIX dacă `window.__hubMkt` există (user a deschis hub în sesiune) sau fetch ușor la refresh manual; dacă lipsesc date → omit, nu spinner.

### 4.2 Panou „Acțiune azi" (`<details open>`)

Reutilizează logica din `pbRenderHero` sub-rând acțional:

- sizing multiplier din danger
- „fără intrări noi ±15min" înainte de primul eveniment high-impact azi (NFP/CPI/FOMC din calendar hardcodat sincron cu Macro)

Text explicit: **informativ** — nu blochează formularul de execuție.

### 4.3 Panou „Calendar azi" (`<details>` collapsed default)

- Max **3** evenimente în fereastra azi + următoarele 24h (filtru identic `pbHardcodedEvents` + eventual cache Finnhub dacă cheia există și nu e în cooldown 403).
- Coloane: oră ET/RO, eveniment, impact, countdown T-min/T-h.
- Notă footer: NFP/CPI/FOMC = date oficiale 2026; rest estimativ.

### 4.4 Stări goale / stale

| Stare | UI |
|-------|-----|
| `md_risk_regime` absent sau `ts` > 6h | „Regim n/a — deschide Macro →" |
| `md_danger_daily` absent sau `dateET` ≠ azi ET | „Danger n/a — deschide Macro →" |
| Ambele OK | bar complet |

Badge „📦 stale" când datele sunt din zi anterioară (aceeași logică ca `pbLoadDanger`).

### 4.5 Acțiuni

- **↻ Reîmprospătează** — re-citește `localStorage` + re-render rail (nu recalculează regim; pentru recalcul userul deschide Macro).
- **Macro deep dive →** — link `../macro-dashboard/` (tab nou sau același, consistent cu restul suitei).

## 5. Arhitectură

### 5.1 Modul nou: `lib/macro-context.js`

API read-only exportat pe `window.MC` (sau ES module pattern consistent cu `lib/governor.js`):

| Funcție | Return | Sursă |
|---------|--------|-------|
| `MC.todayET()` | `YYYY-MM-DD` | timezone America/New_York |
| `MC.regime()` | `{ label, composite, ts, stale, streak }` | `md_risk_regime`, `md_regime_daily` |
| `MC.danger()` | `{ score, band, mult, dateET, stale }` | `md_danger_daily` |
| `MC.eventsToday({ limit })` | `[{ d, hm, event, impact, tilMs }]` | calendar hardcodat 2026 (extras din hub-brief) |
| `MC.actionLine()` | `{ sizing, noEntryWindow, phrases[] }` | derivat din danger + events |
| `MC.marketTone()` | `{ tone, cls }` sau null | `window.__hubMkt` dacă prezent |
| `MC.isFresh()` | boolean | regim ts < 6h AND danger dateET = azi |

**Regulă:** o singură sursă pentru calendar hardcodat — `macro-context.js` devine canonical; `hub-brief.js` importă/refolosește `MC.eventsToday` / helper calendar (refactor mic hub, fără schimbare vizuală hub).

Macro Dashboard **nu** se refactorizează în v1 — rămâne writer pe `localStorage`; doar readers se unifică.

### 5.2 Renderer Journal: `lib/desk-macro-rail.js` (sau funcții în `journal/index.html` dacă <80 linii)

- `renderMacroRail()` — apelează `MC.*`, scrie în `#deskMacroRail`
- Apelat din `renderDesk()` și la click pe ↻
- `setInterval` existent 60s pe `renderDesk` acoperă și rail-ul

### 5.3 Fișiere atinse

| Fișier | Schimbare |
|--------|-----------|
| `lib/macro-context.js` | **nou** — citire cache + calendar + action line |
| `lib/desk-macro-rail.js` | **nou** (preferat) — render DOM |
| `lib/capital-ui.css` | stiluri `.desk-macro-rail`, `.dmr-bar`, `.dmr-chip` |
| `journal/index.html` | markup secțiune + script tags + hook în `renderDesk` |
| `lib/hub-brief.js` | refactor mic: calendar hardcodat → `MC` (opțional în același PR, recomandat) |
| `sw-app.js` / `suite-version.js` | bump versiune tt-v592 |

**Nu se ating:** `macro-dashboard/index.html` (writer), `lib/governor.js` (verdict neschimbat).

## 6. Ce rămâne în Macro Dashboard

- Calcul regim composite + scriere `md_risk_regime`
- Danger Score zilnic + `md_danger_daily`
- Setup Builder, heatmap, știri, AI brief complet, API keys, mood theming
- Hub Brief + Router — consumatori secundari ai aceluiași cache

Cardul Macro din hub poate primi subtitlu „Deep dive" în iterare viitoare — **out of scope** v1.

## 7. Governor — explicit out of scope v1

Variantele B (soft gate CAUTION) și C (hard HALT) sunt **respinse** pentru v1. Rail-ul nu adaugă intrări în `deskReasons` și nu apelează `GV` cu override.

**Iterație viitoare (I-160+):** dacă userul cere, soft gate cu toggle în Governor settings.

## 8. Error handling

- `JSON.parse` pe localStorage în try/catch — fallback la stări goale, fără throw.
- Lipsă `window.MC` → rail ascuns sau mesaj „modul indisponibil" (nu blochează Desk).
- Finnhub economic calendar: dacă 403 sau fără cheie → fallback hardcodat (ca hub).

## 9. Testare manuală (verification-before-completion)

1. Deschide Macro → așteaptă regim+danger → deschide Journal Desk → bar complet.
2. Șterge `md_risk_regime` din DevTools → rail arată n/a + link Macro.
3. Zi cu NFP/CPI în calendar → panou Acțiune arată fereastră ±15min.
4. Resize mobil 720px → rail stack fără overflow orizontal.
5. Governor TRADE/HALT **neschimbat** când regim = RISK-OFF (confirmare context-only).
6. Hub Brief încă funcționează după refactor calendar (dacă făcut).

## 10. Estimare

**Efort:** M (2–3 PR-uri mici sau un PR)  
**Prioritate:** P1 — închide golul workflow dimineață post I-158 hub cleanup.