# Inventarul modelelor și gărzilor — Decision App

> GENERAT de `node tools/inventar-garzi.mjs` din cod (nu se editează de mână). I-760 / SR 11-7: fiecare gardă cu testul care o declanșează; `tools/inventar-garzi.test.mjs` e roșu dacă o gardă nouă n-are test sau dacă documentul nu mai e la zi. Rularea trimestrială: `node tools/inventar-garzi.mjs --ruleaza` (scrie data și rezultatul).

**60 gărzi** · 60 cu test care le declanșează · 0 fără test.

## Modele

| Model | Fișier | Protocol | Stare / limite de folosire |
|---|---|---|---|
| Verdictul pieței (favorabil / neutru / prudent / defensiv) | `lib/market-verdict.js` | `docs/verdict-piata-protocol.md` | regulă de prudență aleasă de el (18.10), nu avantaj dovedit |
| Proba premarket Top Long | `lib/premarket-proba.mjs` | `docs/premarket-proba-protocol.md` | în probă — judecata și puterea în protocol |
| Proba Reguli V1 | `lib/v1-proba.mjs` | `docs/v1-proba-protocol.md` | în probă |
| Umbra stopului Reversal | `lib/reversal-umbra.mjs` | `docs/reversal-stop-umbra-protocol.md` | în probă |
| Clasificatorul Long / Hold / Short | `lib/holdings-classifier.js` | `docs/clasificator-protocol.md` | în probă — versiunile în docs/clasificator-versiuni.md |
| Căldura portofoliului + corelația | `lib/caldura-portofoliu.js` | `docs/politica-de-risc.md` | prag prudent, nu optim |
| Bootstrap pe blocuri „Cât de sigur” (Raport) | `lib/journal-report.js` | `docs/politica-de-risc.md` | mulberry32, sămânță fixă; verdict doar de la n ≥ 30 |
| Detectoarele de comportament (Raport, I-761) | `lib/journal-report.js` | `docs/politica-adaugiri-C.md` | convenții deterministe, nu avantaj dovedit |

## Gărzi · Governor (jurnal manual + verdictul comun) (`lib/governor.js`, 25)

| # | Efect | Motivul (bucățile fixe) | Testul care o declanșează |
|---|---|---|---|
| 1 | HALTED | Limite Governor invalide: …, | `tools/garzi-declansare.test.mjs` · gardă «governor · Limite Governor invalide» — o limită negativă nu dă TRADE |
| 2 | HALTED | Jurnal neverificat: … rânduri invalide, … ID-uri duplicate…, stocare ilizibilă | `tools/garzi-declansare.test.mjs` · gardă «governor · Jurnal neverificat» — ID-uri duplicate în jurnal |
| 3 | CAUTION | Capital necunoscut: bugetele manuale sunt pe valoarea de pornire (…ro-RO… $) — scrie capitalul în Risc & capital sau conectează Trading 212 | `tools/garzi-declansare.test.mjs` · gardă «governor · Capital necunoscut» — bugetele pe valoarea de pornire se spun |
| 4 | HALTED | Pierdere zilnică … ≥ buget … (−…%) | `tools/garzi-declansare.test.mjs` · gardă «governor · Pierdere zilnică» — −300 $ azi față de bugetul de 200 $ |
| 5 | CAUTION | Buget zilnic consumat …% | `tools/garzi-declansare.test.mjs` · gardă «governor · Buget zilnic consumat» — 80 % din bugetul zilei |
| 6 | HALTED | Pierdere săptămână … ≥ buget … (−…%) | `tools/garzi-declansare.test.mjs` · gardă «governor · Pierdere săptămână» — −350 $ marți față de bugetul de 300 $ |
| 7 | CAUTION | Buget săptămână consumat …% | `tools/garzi-declansare.test.mjs` · gardă «governor · Buget săptămână consumat» — 80 % din bugetul săptămânii |
| 8 | HALTED | Trade-uri azi: …/… — max trade-uri/zi atins | `tools/garzi-declansare.test.mjs` · gardă «governor · max trade-uri/zi atins» — a 5-a intrare de azi |
| 9 | CAUTION | Trade-uri azi: …/… — ultimul permis | `tools/garzi-declansare.test.mjs` · gardă «governor · ultimul permis» — a 4-a intrare de azi |
| 10 | HALTED | Poziții deschise: …/… — max atins | `tools/garzi-declansare.test.mjs` · gardă «governor · Poziții deschise» — 4 poziții deschise |
| 11 | HALTED | pierderi consecutive — cooldown activ | `tools/garzi-declansare.test.mjs` · gardă «governor · cooldown activ» — 3 pierderi la rând în 48 h |
| 12 | HALTED | Drawdown rolling nu poate fi verificat | `tools/garzi-declansare.test.mjs` · gardă «governor · Drawdown rolling nu poate fi verificat» — curba aruncă eroare |
| 13 | HALTED | Drawdown rolling invalid | `tools/garzi-declansare.test.mjs` · gardă «governor · Drawdown rolling invalid» — DD nenumeric |
| 14 | HALTED | DD rolling …% ≥ prag …% | `tools/garzi-declansare.test.mjs` · gardă «governor · % ≥ prag» — DD rolling 12 % peste pragul de 10 % |
| 15 | CAUTION | DD rolling …% — aproape de prag | `tools/garzi-declansare.test.mjs` · gardă «governor · aproape de prag» — DD rolling 8 % (≥ 75 % din prag) |
| 16 | HALTED | execuții cu monedă/FX incomplete — bugetul USD nu poate fi verificat | `tools/garzi-declansare.test.mjs` · gardă «governor · monedă/FX incomplete» — o execuție în EUR fără curs |
| 17 | după contul Trading 212 | motivele contului Trading 212 („Invest: …”) | `lib/trading212-capital.js` · fiecare gardă a contului, mai jos |
| 18 | HALTED | Limita lunară depășită: … în …, limita … — fără intrări noi până pe … (regula ta, scrisă dinainte) | `tools/garzi-declansare.test.mjs` · gardă «governor · Limita lunară depășită» — −600 € față de limita de 500 € |
| 19 | CAUTION | Limita lunară: … % consumat (… din … în …) | `tools/garzi-declansare.test.mjs` · gardă «governor · % consumat» — 80 % din limita lunară |
| 20 | CAUTION | Limita lunară e pusă (…), dar rezultatul lunii nu e citit din execuții pe acest aparat — sincronizează contul sau deschide Jurnal → Raport | `tools/garzi-declansare.test.mjs` · gardă «governor · rezultatul lunii nu e citit» — limita pusă, luna necitită |
| 21 | CAUTION | Limita lunară: rezultatul lunii e din … (mai vechi de 3 zile) — sincronizează contul | `tools/garzi-declansare.test.mjs` · gardă «governor · mai vechi de 3 zile» — rezultatul lunii citit acum 4 zile |
| 22 | HALTED | Oprire de urgență („Oprește tot”) activă din … pe …: … — … ordine anulate; fără intrări noi până la re-armare din formularul Governor, cu motiv | `tools/garzi-declansare.test.mjs` · gardă «governor · Oprire de urgență» — „Oprește tot” activ |
| 23 | CAUTION | Reconciliere: … față de Trading 212 (…): | `tools/garzi-declansare.test.mjs` · gardă «governor · Reconciliere:» — o diferență față de broker, fără broker citit pe aparat |
| 24 | NEVERIFICAT | Jurnalul manual e gol și Trading 212 nu e conectat — limitele nu pot fi verificate | `tools/garzi-declansare.test.mjs` · gardă «governor · Jurnalul manual e gol» — nimic de verificat |
| 25 | notă | Invest: bugetul în … nu are curs BCE verificat — „Buget rămas” vine doar din jurnalul manual | `tools/garzi-declansare.test.mjs` · gardă «governor · nu are curs BCE verificat» — bugetul brokerului în EUR fără curs (notă, verdictul rămâne) |

## Gărzi · Contul Trading 212 (T212Capital) (`lib/trading212-capital.js`, 35)

| # | Efect | Motivul (bucățile fixe) | Testul care o declanșează |
|---|---|---|---|
| 1 | HALTED | Snapshot Invest cu timp invalid. Reia sincronizarea. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Snapshot Invest cu timp invalid» — citirea e din viitor |
| 2 | HALTED | Copia contului are … min (citită de celălalt aparat, prin sincronizare); acest aparat nu citește Trading 212 — dacă celălalt tace peste 15 minute, preia singur  | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Copia contului are» — aparatul pasiv cu o copie de 16 min<br>`tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Snapshot Invest expirat» — aparatul care citește, copie de 8 min |
| 3 | HALTED | Capitalul, soldul disponibil sau investițiile nu sunt complete în aceeași monedă. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · nu sunt complete în aceeași monedă» — sold negativ |
| 4 | HALTED | Lista completă a pozițiilor nu este disponibilă. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Lista completă a pozițiilor» — pozițiile lipsesc |
| 5 | HALTED | Limitele contului sunt invalide. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Limitele contului sunt invalide» — poziții maxime fracționare |
| 6 | HALTED | Poziție invalidă sau duplicată. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Poziție invalidă sau duplicată» — aceeași poziție de două ori |
| 7 | HALTED | Cantitate zero cu valoare neverificată. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Cantitate zero cu valoare neverificată» — 0 acțiuni cu valoare |
| 8 | HALTED | Preț, valoare sau monedă neverificată: …. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Preț, valoare sau monedă neverificată» — poziția în altă monedă decât contul |
| 9 | HALTED | Valoarea poziției nu se reconciliază: …. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Valoarea poziției nu se reconciliază» — valoarea nu e cantitate × preț |
| 10 | CAUTION | : …preț la/sub stopul documentat.…stopul salvat e de la o poziție anterioară (pus înainte de deschiderea celei de acum).…stop sau conversie neverificată. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · stop sau conversie neverificată» — poziție fără stop documentat |
| 11 | HALTED | Stopul documentat a fost atins: ….… Stopul e de peste două ori prețul de acum: dacă a fost un split, stopul e în prețurile vechi — refă-l în Portofoliu; dacă nu | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Stopul documentat a fost atins» — stopul peste preț |
| 12 | HALTED | Agregatele nu sunt calculabile. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Agregatele nu sunt calculabile» — valori care depășesc numerele finite |
| 13 | HALTED | Pozițiile nu corespund investițiilor raportate; acoperire parțială. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Pozițiile nu corespund investițiilor raportate» — investițiile raportate ≠ suma pozițiilor |
| 14 | HALTED | Soldul și investițiile depășesc capitalul raportat. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Soldul și investițiile depășesc capitalul raportat» — sold + investiții > total |
| 15 | HALTED | Istoricul complet și actual în moneda contului este necesar pentru bugetele de pierdere. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Istoricul complet și actual» — istoric incomplet |
| 16 | HALTED | Există execuții cu dată invalidă sau viitoare; bugetul nu poate fi confirmat. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · dată invalidă sau viitoare» — o execuție din viitor |
| 17 | HALTED | Există vânzări fără P&L raportat; bugetul de pierdere rămâne neverificat. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · vânzări fără P&L raportat» — vânzare fără rezultat |
| 18 | HALTED | Există execuții cu monedă de cont neverificată. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · monedă de cont neverificată» — execuție în USD pe un cont EUR |
| 19 | HALTED | Bugetele nu sunt calculabile. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Bugetele nu sunt calculabile» — rezultate care depășesc numerele finite |
| 20 | HALTED | Bugetul de pierdere zilnic este epuizat la valoarea de piață: contul e cu … sub reperul din …ro-RO…2-digit…2-digit… (fluxurile scoase), chiar fără vânzări. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Bugetul de pierdere zilnic este epuizat la valoarea de piață» — contul −300 € față de ieri,  |
| 21 | CAUTION | Cel puțin 75% din bugetul zilnic e consumat la valoarea de piață (… față de reperul de ieri). | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · 75% din bugetul zilnic e consumat la valoarea de piață» — −160 € față de ieri |
| 22 | HALTED | Bugetul de pierdere săptămânal este epuizat la valoarea de piață (… față de închiderea săptămânii trecute). | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Bugetul de pierdere săptămânal este epuizat la valoarea de piață» — −400 € față de vinerea t |
| 23 | CAUTION | Cel puțin 75% din bugetul săptămânal e consumat la valoarea de piață. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · 75% din bugetul săptămânal e consumat la valoarea de piață» — −240 € față de vinerea trecută |
| 24 | HALTED | Riscul total până la stop nu este acoperit pentru toate pozițiile și ordinele rezervate. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Riscul total până la stop nu este acoperit» — ordine rezervate |
| 25 | HALTED | Limita de poziții reale este atinsă: …/…. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Limita de poziții reale este atinsă» — limita 1, o poziție |
| 26 | HALTED | Nu există sold disponibil pentru investiții. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Nu există sold disponibil» — sold zero |
| 27 | HALTED | Bugetul de pierdere zilnic sau săptămânal este epuizat. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Bugetul de pierdere zilnic sau săptămânal este epuizat» — −250 € realizat azi |
| 28 | HALTED | Bugetul total până la stop este epuizat. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Bugetul total până la stop este epuizat» — riscul la stop = 5 % din cont |
| 29 | HALTED | Limita intrărilor BUY de astăzi este atinsă. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Limita intrărilor BUY» — a 5-a cumpărare de azi |
| 30 | CAUTION | A …-a cumpărare de azi: următoarea e ultima permisă (politica: CAUTION la penultima). | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · următoarea e ultima permisă» — a 4-a cumpărare de azi |
| 31 | HALTED | Cooldown: … ordine de ieșire consecutive cu pierdere. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · ordine de ieșire consecutive cu pierdere» — 3 ieșiri pe pierdere |
| 32 | CAUTION | Concentrare peste limita de …% pe instrument. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Concentrare peste limita» — 10 % pe un instrument față de limita de 5 % |
| 33 | CAUTION | Riscul la stop folosește FX estimat din valoarea poziției / (cantitate × preț), fără costuri sau gap. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · FX estimat din valoarea poziției» — acțiune în USD pe un cont EUR |
| 34 | CAUTION | Reconciliere: …diferență…diferențe… față de Trading 212 (…fără detalii | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · Reconciliere:» — o diferență față de broker |
| 35 | CAUTION | Cel puțin 75% dintr-un buget de pierdere este consumat. | `tools/garzi-declansare.test.mjs` · gardă «trading212-capital · 75% dintr-un buget de pierdere este consumat» — −160 € realizat azi |

## Ultima validare (rularea testelor de declanșare)

2026-10-27: 1 din 1 fișiere de test trecute.
