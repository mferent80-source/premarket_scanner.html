# Model Lab — Regimuri HMM

Implementare JavaScript proprie, `holdings-hmm-v1`. Model descriptiv per instrument, separat de clasificatorii Neural / Gradient Boosting. Nu generează ordine, nu votează în verdictul lor și nu modifică planuri, stopuri sau Governor.

## Date și obiectiv

Trei intrări cauzale din fluxul OHLCV verificat: randament pe cinci sesiuni, distanța închiderii față de EMA21 și ATR / preț. Warm-up de 199 observații, același calcul de indicatori ca Neural; sunt incluse și cele mai recente cinci observații care încă nu au etichete viitoare pentru clasificare. HMM nu folosește etichetele de preț.

Aceleași validări OHLCV și limite de 510–2000 bare: ordine, volum pozitiv, observații încheiate și salturi zilnice sub 25%. În aplicație, istoricul trebuie să aibă aceeași identitate, monedă și EOD ca analiza deținerii. Minime: 180 exemple de antrenare, 50 validare și 50 test. Regimurile pot fi descrise și când clasele necesare unui clasificator nu sunt disponibile; antrenarea HMM este independentă.

HMM cu trei stări, emisii Gaussiene diagonale, distribuție inițială uniformă. Cele trei stări nu sunt impuse ca bull / bear / lateral: etichetele se obțin din mediile învățate. Randament 5 > +0,05% și distanță EMA21 > +0,5%: Ascendent; ambele sub pragurile negative: Deteriorare; altfel Consolidare / tranziție. Etichetele se pot repeta, nu sunt validate de regimuri externe și nu indică o cauză economică. Volatilitate ridicată înseamnă ATR / preț mediu peste 1,25× media antrenării. IDs se ordonează după media distanței EMA21.

## Antrenare și filtrare

- Normalizare numai pe antrenare; deviație minimă 0,0001.
- Baum–Welch: forward–backward și statistici gamma / xi numai pe antrenare. Emisii actualizate prin medii și varianțe ponderate, varianță minimă 0,05 în coordonate normalizate. Tranziții cu pseudocont 0,1 pentru fiecare celulă și 2 suplimentar pe diagonală. Această regularizare nu garantează creșterea monotonă a likelihood-ului nepenalizat.
- Trei inițializări deterministe, din cuantile fixe ale randamentului de antrenare: 15/50/85%, 25/55/80%, 10/40/90%. Maximum 80 iterații fiecare, evaluare la fiecare cinci iterații; oprire după 20 iterații fără îmbunătățire, cel mai devreme la 30. Validarea alege inițializarea și iterația; testul nu schimbă parametrii. Configurația a fost fixată înaintea experimentului public și nu a fost modificată după rezultate.
- Testul folosește filtrare forward, pornind din filtrul sfârșitului validării. Indicatorul pentru fiecare sesiune depinde numai de observațiile până la acea sesiune, cu modelul fix. Nu folosim Viterbi sau netezire cu viitorul pentru cronologia de test.
- O pauză de peste șapte zile calendaristice începe o nouă secvență, atât în antrenare cât și în filtrare. Nu legăm artificial tranzițiile peste gol.
- Minimum 600 observații pentru trei prefixe fixe, 64/80/100%; fiecare are separare 60/20/20. Testele sunt disjuncte. Indicatorii folosesc însă trecut suprapus și rămân corelați. În lipsa istoricului, păstrăm numai testul recent.

## Ce înseamnă rezultatul

Distribuția între stări reprezintă posteriorul acestui model, nu încrederea verificată în piață sau probabilitatea unui profit. Corelațiile dintre indicatori, distribuțiile simplificate și schimbarea regimurilor pot supraestima concentrația. Semantica nu are etichete externe de verificare.

Interpretarea cere toate stările cu minimum max(20, 5% din antrenare) observații efective, separare minimă 0,5 între mediile standardizate și intrări actuale la cel mult șase deviații standard. O stare se stabilizează după trei observații consecutive cu posterior ≥0,65; aceasta este o convenție a modelului, nu confirmarea unui setup. Un rezultat slab sau în afara domeniului rămâne neconcludent.

Indicatorul de schimbare pentru următoarea observație este Σ posterior(k) × (1 − A[k,k]). Acesta descrie tranzițiile modelului, nu o frecvență calibrată pe piață. Cronologia afișează ultimele 60 observații din test; schimbările stabilizate sunt recalculări istorice, nu alerte înregistrate la acel moment. Reantrenarea poate modifica stările.

NLL / observație măsoară densitatea predictivă a indicatorilor înaintea actualizării posteriorului pentru acea observație. Poate fi negativ; mai mic este mai bun. Nu este loss de clasificare, nu se compară cu metricile Neural / Boosting și nu verifică randamentul, costuri, știri sau earnings.

Repere: aceleași emisii învățate fără tranziții, cu ponderile din antrenare, și o singură Gaussiană diagonală din antrenare. Criteriul descriptiv cere NLL cu minimum 0,02 mai mic decât ambele, în toate cele trei ferestre și în agregarea ponderată cu numărul observațiilor. Nu este un test de semnificație statistică și nu certifică predicția financiară.

## Experiment public — 4 octombrie 2026

MSFT, JPM, XOM și SPY, alese înaintea rulării, din fluxul public Yahoo Finance; fără chei sau date de broker. Sesiune finală verificată pentru cele trei instrumente disponibile: **2 octombrie 2026**; 1.255 bare, 1.056 observații, 516 în testele agregate. SPY a rămas indisponibil după preluare și o singură reîncercare a intrărilor blocate; nu este completat cu date vechi.

| Instrument | NLL HMM agregat | Emisii fără tranziții | Gaussiană unică | Ferestre mai bune |
|---|---:|---:|---:|---:|
| MSFT | 4.294 | 4.947 | 5.203 | 3/3 |
| JPM | 3.564 | 4.089 | 4.381 | 3/3 |
| XOM | 3.595 | 4.226 | 4.420 | 3/3 |
| SPY | Indisponibil | — | — | — |

Structura temporală descrie mai bine indicatorii pe aceste trei instrumente. Nu demonstrează profitabilitate, validarea semantică a regimurilor sau un avantaj prospectiv. Istoricul fusese deja examinat pentru alte modele; eșantionul de patru instrumente nu reprezintă toate piețele. Ajustările furnizorului nu sunt certificate independent.

[Raport public](https://mferent80-source.github.io/premarket_scanner.html/tools/holdings-hmm-validation.html) · [Date derivate JSON](hmm-validation-latest.json). Nu publicăm bare brute, modele de cont, chei sau portofoliul. Parametrii HMM de piață rămân locali; raportul public conține metrici și profiluri derivate.

Reproducere: `node tools/holdings-hmm-benchmark.mjs docs/hmm-validation-latest.json`. Pentru o singură reîncercare a intrărilor blocate: adaugă `--retry-blocked`. Intrările deja evaluate sunt păstrate; providerul poate revizui istoricul.

## Integrare, confidențialitate și verificări

Analiza deținerilor → Modele AI → Analizează regimul HMM. Buton, Worker și rezultat separate de Neural / Boosting. HMM și clasificatorii nu rulează simultan; anularea, schimbarea contului, instrumentului sau EOD opresc Workerul și ignoră rezultatele întârziate. Demo-ul antrenează HMM după clasificatori, numai în memorie, pe date fictive.

Workerul primește exclusiv bare, ora și un ID temporar. Nu primește cheia Trading 212, cantități, sold, cost mediu, note sau istoricul execuțiilor. Modelul este salvat local per cont / ticker și expiră după 30 minute, altă sesiune sau altă identitate. Erorile de stocare sunt vizibile; modelul anterior nu este șters la o analiză eșuată. Sincronizarea PC–telefon rămâne neactivată. Exportul JSON este disponibil numai la cererea utilizatorului.

491 teste JavaScript verificate, dintre care 17 pentru HMM și integrarea lui: comparație cu enumerarea exactă a traseelor ascunse, statistici forward–backward, indicatori cauzali, invarianta filtrului la adăugarea viitorului, izolarea testului de selecție, învățare pe stări fictive, resetare la gol, stări colapsate, integritatea metricilor și posteriorilor, ferestre disjuncte, anulare, identitate EOD și erori de stocare. Scorurile recente HMM și reperele sunt recalculate din observațiile de test și parametrii salvați, nu doar acceptate din JSON.

Metodologie: [hmmlearn — HMM, Baum–Welch și limitările inițializării](https://hmmlearn.readthedocs.io/en/stable/tutorial.html). Implementarea este proprie și nu folosește biblioteca hmmlearn.

Modelul descriptiv de anomalii este documentat separat în [Isolation Forest](ISOLATION-LAB.md); nu modifică verdictul de mai sus.

Corecție de consistență EOD (5 octombrie 2026): în rularea pe piață, un raport salvat nu mai este utilizabil dacă închiderea EOD a fost corectată. Schimbarea prețului în același cont, instrument și aceeași zi anulează și Workerul activ; mesajele întârziate sunt ignorate. În analiza manuală, o închidere diferită sau nenumerică este respinsă înainte de pornirea Workerului.
