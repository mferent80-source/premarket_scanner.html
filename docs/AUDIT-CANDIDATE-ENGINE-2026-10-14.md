# Audit Candidate Engine („Long & Reversal”, scannerul Decision Desk) — 14.10.2026

**Verdict: NU. Deciziile de cumpărare nu se pot baza pe el ca semnal.** Zilele în care dă „actionable” sau 🔥 FIRE pe momentum sunt
sistematic MAI PROASTE decât zile la întâmplare pe aceleași acțiuni și decât alte acțiuni în aceleași zile. Reversal pare să câștige
puțin pe planul 2R, dar câștigul vine din ZILELE de revenire ale pieței, nu din acțiunile alese: orice grup de acțiuni bătute dă același
rezultat. Nici opusul semnalelor nu e un avantaj. Ce rămâne bun: lista e de acțiuni lichide, cu trend, și planul are stop și țintă
explicite — e o listă de urmărit, nu un buton de cumpărat.

Pagina a fost repornită azi (tt-v872) pentru că e scannerul Decision Desk; oprirea din 12.10 (tt-v869) o prinsese pe lista „opresc
toate 6”, deși Decision App e aplicație separată. Codul ei nu s-a schimbat (index.html din 09.10, engine.js neatins).

## Metoda

- Funcțiile REALE din `candidate-engine/engine.js` (`momentumScore`, `reversalScore`, ajutoarele), `trend()` din `lib/decision-verdict.js`,
  indicatorii din `lib/indicators.js`, Early Bird din `lib/me-early-bird.js`, rulate într-un `vm` — nu o copie rescrisă.
  Regulile „actionable” sunt cele din `analyze()`: preț ≥ 5 $, ≥ 3 mil. $/zi, extensie ≤ 8 %, ziua < +10 %, scor ≥ 68, trend aliniat,
  RS20 ≥ 0, RVOL ≥ 1 (momentum); scădere ≤ −20 %, revenire 2–30 %, Early Bird confirmat și nevestejit, scor ≥ 50 (reversal).
- Universul: cele 67 de acțiuni US_CORE din motor (lista de azi — de aceea nulurile sunt generoase), 5 ani de bare zilnice Yahoo,
  982 de zile de bursă (12.10.2022 … 11.09.2026). Earnings necunoscut în trecut ⇒ fără penalizare (cel mai bun caz pentru semnal).
- Intrarea la deschiderea zilei următoare, cost 0,3 %. Măsuri: 10 și 20 de zile peste SPY; planul paginii (stop = preț − 1,25 ATR,
  țintă = intrare + 2 × risc, cel mult 20 de zile).
- DOUĂ nuluri, cum cere regula de la scanerele pe acțiuni: aceleași acțiuni în alte zile și alte acțiuni în aceleași zile, câte 1.000 de
  extrageri (mulberry32), plus bootstrap PE ZILE (semnalele din aceeași zi nu sunt independente). p pe ambele părți: „mai bun” și „mai prost”.
- Întrebarea simetrică: grupul OGLINDĂ al momentumului (aceleași filtre de bază, trend întors, RS < 0, RVOL ≥ 1).

## Rezultate (20 de zile peste SPY, cost inclus; o zecimală)

| Semnal | Semnale | Semnalul | Aceleași acțiuni, alte zile | Alte acțiuni, aceleași zile | p „mai prost” |
|---|---|---|---|---|---|
| Momentum actionable | 4.665 (5,1 pe zi) | ≈ 0 % | +0,9 % | +0,7 % | 0,000 / 0,000 |
| Momentum 🔥 FIRE (scor ≥ 80, RVOL ≥ 1,15) | 1.872 | −0,1 % | +0,9 % | +0,6 % | 0,000 / 0,009 |
| Reversal actionable | 4.353 | −0,3 % | −0,2 % | +0,8 % | 0,465 / 0,000 |
| Oglinda momentumului | 4.169 | ≈ 0 % | −0,3 % | +1,1 % | 0,980 / 0,000 |

Planul paginii (1,25 ATR / 2R, ≤ 20 zile):

| Semnal | Planul | Aceleași acțiuni, alte zile | Alte acțiuni, aceleași zile | Reușite | Stop atins | Media în R | 2022–23 / 2024–26 |
|---|---|---|---|---|---|---|---|
| Momentum actionable | +0,2 % | +0,5 % (p mai prost 0,000) | +0,3 % (0,062) | 39 % | 59 % | +0,11 | +0,3 % / +0,1 % |
| Momentum 🔥 FIRE | ≈ 0 % | +0,5 % (0,004) | +0,3 % (0,052) | 37 % | 60 % | +0,05 | ≈ 0 % / +0,1 % |
| Reversal actionable | +0,5 % | +0,2 % (p mai bun 0,017) | +0,6 % (0,854) | 39 % | 58 % | +0,13 | +1,3 % / +0,1 % |
| Oglinda momentumului | +0,4 % | +0,2 % (p mai bun 0,029) | +0,7 % (p mai prost 0,021) | 39 % | 58 % | +0,10 | +1,0 % / +0,1 % |

Pe ani (momentum actionable, 20 z peste SPY): 2022 +1,1 % (194) · 2023 −0,4 % · 2024 −0,3 % · 2025 +0,4 % · 2026 +0,1 %.
Reversal: 2022 −1,8 % · 2023 +1,5 % · 2024 −1,9 % · 2025 +0,3 % · 2026 −0,2 % — semnul se schimbă de la an la an.

## Ce înseamnă

1. **Momentum alege zilele proaste.** Scorul răsplătește forța pe 5–20 de zile, volumul și ziua pozitivă — exact orizontul la care
   acțiunile volatile se întorc în următoarele 2–4 săptămâni. Cu cât scorul e mai mare (FIRE), cu atât e mai rău. Planul 2R reușește
   în 39 % din cazuri și lovește stopul în 59 %: media +0,11 R e zgomot, și tot sub intrările la întâmplare.
2. **Reversal nu alege acțiunile, alege zilele.** Bate aceleași acțiuni în alte zile, dar NU alte acțiuni în aceleași zile — adică în
   zilele lui toată piața revine. Oglinda momentumului (orice acțiune bătută, fără Early Bird) dă același +0,4 %. Jumătățile
   +1,3 % → +0,1 %: ce era, s-a dus.
3. **Simetria nu ajută:** nici vânzarea momentumului, nici cumpărarea oglinzii nu bat ambele nuluri.
4. **Nulurile sunt umflate** de lista de azi (supraviețuitorii: NVDA, PLTR…), dar semnalul se măsoară pe aceeași listă, deci comparația
   e dreaptă; cifrele absolute (≈ 0 %) nu sunt nici ele un avantaj.

## Codul (trecerea 1 — corectitudine; trecerea 2 — convenții)

🔴 Niciun bug funcțional găsit. Verificat: fără privire în viitor (bare zilnice EOD; `DailySeries.read` refuză sesiunea neîncheiată și
scanarea de „date stale”); RVOL = volumul zilei / media celor 20 de zile DINAINTE; RS20 cere ca indicele să aibă aceeași dată de
închidere, altfel simbolul pur și simplu nu e actionable; Governor și earnings blochează planul, nu lista; cache-ul de 30 min cu
respingerea timpului din viitor; plafon 2 pe sector în Top 10; escapare HTML; scanarea nu suprascrie rezultatele vechi la eroare.

🟡 1. **Blocarea la earnings trăiește doar cu cheia Finnhub** (`localStorage` `finnhub_api_key` / `fh_key`). Fără ea: fiecare scor −5 și
blocarea „earnings ≤ 1 zi” e OPRITĂ (rândul scrie „earnings neverificat”). Pagina Nasdaq Scanner, unde se punea cheia, e oprită din
12.10 și NICIO pagină rămasă n-are câmp pentru ea (Health doar o arată). Până apare un câmp, se pune din consola browserului, pe orice
pagină a suitei: `FH_KEY.set('cheia')` (`lib/finnhub-key.js` o scrie în ambele chei din `localStorage`).
🟡 2. Ținta = intrare + 2 × risc, mecanică (motivul o spune: „nu rezistență confirmată”); stopul la 1,25 ATR e atins în 59 % din planuri.
🟡 3. Pragurile 68 / 80 / 50 n-au nicio justificare în afara eșantionului; cel mai sus (FIRE) e cel mai prost.
🔵 4. US_CORE = 67 de nume alese de mână (câștigătorii de azi) ⇒ și pe viu scanează doar ce e faimos acum.
🔵 5. Acțiunile EU primesc mereu „earnings EU neverificat” (−5) și RS față de STOXX50E.
Convenții: cod al Decision App (versiune în `app/version.js`, fără badge al suitei) — nu se atinge (regula din 12.10); nimic de reparat.

## Ce aș face eu

- Îl păstrez ca listă de urmărit (acțiuni lichide, în trend, cu plan scris), NU ca semnal: starea ARMED / FIRE nu înseamnă „cumpără”.
- Cumpărarea o iau din Radar: Poarta (planul lui cu riscul contului) + regimul pieței (lățimea US) — nu din scorul scannerului.
- Dacă vrem un semnal adevărat aici: orizont de 3–12 luni cu luna din urmă sărită (efectul documentat al momentumului), nu 5–20 de
  zile; și orice prag trece ÎNTÂI pe ambele nuluri și pe ambele jumătăți înainte să ajungă în pagină.
- Cheia Finnhub pusă, ca blocarea la earnings să existe.

## Unde sunt scripturile

- `E:\Backup-Claude\premarket-suite\audit-candidate-engine-2026-10-14\` — `ce_audit_1410.mjs` (auditul extins) + rezultatul,
  `ce_backtest_1210.mjs` (auditul din 12.10, aceleași cifre re-rulate azi), `poza_ce.mjs` (proba în Edge) + pozele.
- Datele: cache-ul Yahoo de 5 ani al sesiunii din 12.10 (`yahoo-zilnic.json`, 20 MB, în scratchpad-ul acelei sesiuni).
