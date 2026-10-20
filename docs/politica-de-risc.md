# Politica de risc — Decision App (Trading Tools)

**Versiunea 1 · 20.10.2026 (I-728).** Documentul unic al pragurilor de risc din aplicație: ce limitează fiecare, de ce are valoarea pe care o are,
cine o poate schimba și cum rămâne scrisă schimbarea. Până acum pragurile stăteau în patru locuri (codul Governor, filtrul de piață, protocoalele
probelor, căldura portofoliului); de aici încolo acest fișier e referința, iar codul o aplică. Orice schimbare de prag se face **întâi aici**, apoi în
cod, cu un rând în „Istoricul schimbărilor” de mai jos.

## 1. Principii

1. **Regula scrisă dinainte leagă.** O limită care doar avertizează nu e o limită: Governor dă `HALTED` (fără planuri noi) sau `CAUTION` (risc redus),
   iar Planuri și Drafturi moștenesc verdictul. Nicio limită nu trimite ordine la broker — aplicația oprește *intrările noi*, nu lichidează.
2. **Închis la eroare.** Ce nu se poate verifica (cont nesincronizat, calendar de rezultate necitit, stop fără monedă, curs lipsă) blochează, nu trece.
3. **Pragurile sunt prudente, nu optime.** Niciunul nu e un avantaj dovedit; sunt alegeri de supraviețuire. Se judecă față de propriile rezultate
   (§ 4) și se revizuiesc la termen (§ 5), nu „pe moment”.
4. **Două surse peste una.** Prețul contului față de a doua sursă (Yahoo), stopul documentat față de ordinul de la broker, pierderea realizată față
   de cea la valoarea de piață: când sursele nu se potrivesc, aplicația o spune, nu alege tăcut.

## 2. Pragurile și motivul fiecăruia

| Prag | Valoarea | Unde se aplică | Ce oprește | Motivul |
|---|---|---|---|---|
| Pierdere maximă pe zi | **2 % din cont** | `GV` (`maxLossPctDay`), `T212Capital` | HALTED la atingere; CAUTION de la 75 % | O zi proastă nu trebuie să devină o săptămână proastă; 2 % lasă 50 de zile ca astea până la −63 %. |
| Pierderea zilei se măsoară | **realizat ȘI la valoarea de piață** (I-722) | `T212Capital.mtm` | bugetul rămas = minimul celor două | Pozițiile deschise care pierd consumă bugetul chiar fără vânzare. |
| Pierdere maximă pe săptămână | **3 % din cont** | `GV` (`maxLossPctWeek`), `T212Capital` | HALTED la atingere; CAUTION de la 75 % | Frâna pe serie: trei zile la limită nu se mai înlănțuie. |
| Limita lunară de pierdere | **suma pusă de tine** în Setările jurnalului (I-692) | `GV.monthlyState` (I-721) | HALTED până pe 1 a lunii următoare; CAUTION de la 75 % sau când rezultatul lunii e necitit / mai vechi de 3 zile | Regula ta, scrisă dinainte, în moneda contului. |
| Scădere maximă de la vârf (DD rolling) | **10 %** | `GV` (`maxDdPctRolling`), curba de capital | HALTED la atingere; CAUTION de la 7,5 % | Peste 10 % revenirea cere > 11 % câștig; se judecă față de dd95 pe blocuri (§ 4). |
| Pierderi consecutive (cooldown) | **3 în 48 h** | `GV` (`cooldownAfterLosses`), `T212Capital` | HALTED cât ține fereastra | Oprește „răzbunarea”; fereastra de 48 h nu lasă frâna activă la nesfârșit. |
| Tranzacții pe zi | **5** | `GV` (`maxTradesDay`) | CAUTION la a 4-a, HALTED la a 5-a (I-733) | Frecvența mare = costuri și decizii obosite. |
| Poziții deschise | **4** (reale + Shadow) | `GV` (`maxOpenPositions`), Planuri | HALTED la atingere | Atenția împărțită la mai multe nume scade calitatea fiecăreia. |
| Risc pe plan | **0,5 % din capital**, **0,25 %** la CAUTION / piață defensivă (breadth) / Top Long în probă | Planuri `allowedRisk` | mărimea poziției | Riscul pe tranzacție mic ține scăderile mici; probele în timp nu primesc riscul întreg. |
| Verdictul pieței (robotul zilnic) | favorabil / neutru **×1**; prudent **×0,75**; defensiv **fără plan nou**; lipsă sau > 4 zile **×0,75, fără GO** (I-727) | Drafturi și Planuri, aceeași regulă (`MarketVerdict.regula`) | mărimea sau planul | Regulă de prudență aleasă pe 18.10.2026, nu avantaj dovedit (`docs/setup-filtru-piata.md`). |
| Concentrare pe instrument | **20 % din cont** | `T212Capital` (`maxInstrumentPct`), Planuri | CAUTION; dimensionarea nu depășește | O singură poziție nu mută tot contul. |
| Risc total până la stopuri (reale) | **5 % din cont** | `T212Capital` (`maxTotalStopPct`) | HALTED când bugetul e epuizat | Suma riscurilor deschise are și ea un plafon. |
| Căldura portofoliului | **4 % din cont** (reale + Shadow + planul nou) (I-719) | `TTCaldura`, Planuri | fără plan nou peste plafon; poziție fără stop valabil ⇒ risc necunoscut ⇒ blocat | Riscul necunoscut nu e zero. |
| Corelație | **r ≥ 0,7 pe 90 de zile ⇒ cel mult 2 poziții** în același grup (I-719) | `TTCaldura.grup`, Planuri | fără plan nou pentru a 3-a | Trei nume corelate = un singur pariu. |
| Stopul | **obligatoriu**, pus / schimbat **după deschiderea poziției** (StopSetter.stopValabil); recomandat −5 % sau 2 × ATR(14) între 3 % și 8 % | Astăzi, Portofoliu, Risc & capital | fără stop valabil ⇒ risc necunoscut ⇒ blocat | Un stop de la o poziție veche nu acoperă poziția nouă. |
| Stopul **la broker** (I-723) | ordin STOP de vânzare în așteptare la Trading 212 | Astăzi („doar pe hârtie”), Planuri, pagina contului | avertizare severă; eticheta în căldură | Un stop „în minte” nu execută nimic în lipsa ta. |
| Rezultate financiare | **fereastra de 14 zile** blochează planul; calendar necitit ⇒ blocat | scanner, idee proprie | fără plan | Planul ține zile, ar traversa raportarea. |
| Lichiditate | **ADV ≥ 3 M $** (20 de sesiuni) | scanner, idee proprie (I-733) | fără plan | Sub asta spreadul și alunecarea mănâncă planul. |
| Raport risc / randament | **≥ 1,5 R** la intrarea maximă (țintă ≥ 2 R cerută în analiză) | `TradePlans.size` | fără plan | Cu 58 % stopuri pe regula 1,25 ATR / 2R (măsurat pe 4 ani), sub 1,5 R speranța e negativă. |
| Costul de schimb | **0,3 % dus-întors** când contul nu e în moneda acțiunii | `TradePlans` | intră în riscul pe acțiune | Costul e pierdere sigură, intră în R. |
| Alunecarea la intrare | **media ultimelor 10 intrări ≤ 0,1 R** (I-729) | Raport | avertizare | Separă regula proastă de execuția proastă. |

## 3. Cine schimbă și cum

- Pragurile din tabel se schimbă **doar de tine**, din Jurnal → Risc & capital (formularul Governor) sau din acest document pentru cele din cod.
- Fiecare schimbare din formular rămâne scrisă automat în **jurnalul limitelor** (`tt_governor_limite_jurnal_v1`, I-728): ora, aparatul, cheia, de la → la.
  Jurnalul e append-only și se vede sub formular (ultimele 10).
- O limită **ridicată** în mijlocul unei serii proaste e exact ce politica interzice: schimbarea se face la revizuire (§ 5), nu când frâna e activă.
  Dacă totuși o faci, rândul din jurnal rămâne, iar Raportul (Disciplina, I-726) va arăta intrările făcute sub limita nouă.
- Capitalul de referință (`accountSize`) nu e o limită: vine din contul Trading 212 și se actualizează singur; nu intră în jurnalul limitelor.

## 4. Pragurile față de propriile rezultate (I-730)

Raportul din Jurnal (secțiunea „Cât de sigur e rezultatul tău”) trage 2.000 de lumi din propriile tranzacții, și simplu, și **pe blocuri de 5**
(seriile de pierderi se păstrează), pe următoarele 50 de tranzacții:

- **dd95 pe blocuri** (scăderea în 5 % cele mai rele lumi) față de **plafonul DD de 10 %**: dacă dd95 e peste plafon, plafonul te oprește din
  ghinion normal, fără să fi greșit — asta e **pragul de revizuire**: fie plafonul urcă (cu rândul în jurnal), fie riscul pe plan scade.
- **seria de pierderi la 95 %** față de **cooldown-ul de 3**: dacă în 95 % din lumi ajungi la 3 pierderi la rând din zgomot, cooldown-ul se va
  declanșa des fără vină; revizuirea alege între 4 și a lăsa 3 ca frână conștientă.
- **Stresul istoric** (Portofoliu · risc): cele mai proaste 5 ferestre de 5 sesiuni ale SPY din 10 ani × beta pozițiilor de acum (1 an și 6 luni,
  interval) față de bugetul săptămânii și plafonul DD. Estimare liniară, fără corelațiile din panică — mai degrabă optimistă.

Sub 30 de tranzacții cozile sunt zgomot: se citesc, nu se acționează pe ele.

## 5. Revizuirea

- **Trimestrial** (prima săptămână din ianuarie, aprilie, iulie, octombrie) sau **după 30 de tranzacții noi**: tabelul din § 2 față de § 4 și față de
  Raport (disciplina, alunecarea, planul față de execuție). Schimbările se scriu în § 6 și în cod în aceeași livrare.
- **Nu se revizuiește** cât Governor e HALTED pe o limită de pierdere.
- Probele în timp (Top Long, Trend 12 luni, verdictul pieței, Reguli V1, stopul Reversal în umbră) au protocoalele lor cu praguri scrise înainte
  (`docs/*-protocol.md`); verdictul lor poate schimba doar riscul pe plan al motorului respectiv, nu limitele contului.

## 6. Istoricul schimbărilor

| Data | Ce | De la → la | De ce | Unde |
|---|---|---|---|---|
| 2026-10-14 | `maxLossPctWeek`, `maxInstrumentPct`, `maxTotalStopPct` intră în Governor + contul real | — → 3 % / 20 % / 5 % | controlul capitalului real (Trading 212), nu doar jurnalul manual | `lib/governor.js`, `lib/trading212-capital.js` |
| 2026-10-17 | Limita lunară de pierdere (I-692) | — → suma ta | regula ta scrisă dinainte; informativă la început | `lib/monthly-limit.js` |
| 2026-10-18 | Filtrul de piață = verdictul robotului (A) | Danger Score → verdict (×1 / ×0,75 / ×0,5 fără GO / neverificat ×0,75) | sursa veche retrasă; regulă de prudență aleasă de tine | `docs/setup-filtru-piata.md` |
| 2026-10-19 | Căldura portofoliului 4 % + corelație 0,7 / max 2 (I-719); costul de schimb 0,3 % (audit L&R) | — → 4 % / 0,7 / 2 / 0,3 % | riscul deschis însumat are plafon; costul e pierdere sigură | `lib/caldura-portofoliu.js`, `lib/trade-plans.js` |
| 2026-10-20 | Limita lunară **leagă** (I-721); MTM în bugete (I-722); verdictul pieței o regulă și în Planuri (I-727); CAUTION la a 4-a tranzacție (I-733); stopul la broker (I-723); ADV în idee proprie (I-733); alunecarea ≤ 0,1 R (I-729); pragul de revizuire dd95 / serie95 (I-730) | informativ → HALTED / CAUTION etc. | auditul instituțional 20.10: regulile scrise nu legau toate | acest document + `lib/governor.js`, `lib/trading212-capital.js`, `desk/index.html`, `lib/journal-report.js` |
