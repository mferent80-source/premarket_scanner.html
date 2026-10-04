# Model Lab — Isolation Forest

Implementare JavaScript proprie, holdings-isolation-v1. Detector descriptiv per instrument, independent de Neural, Gradient Boosting și HMM. Nu generează ordine, nu modifică stopuri, planuri sau Governor și nu votează în verdictul clasificatorilor.

## Date și obiectiv

Șase intrări cauzale: randament pe 1 și 5 sesiuni, distanță față de EMA21, ATR / preț, volum curent / media celor 20 sesiuni precedente și gap open / close precedent. Warm-up 199 bare; sunt incluse și ultimele cinci sesiuni fără etichete viitoare de clasificare. Folosim calculul comun de indicatori, fără etichetele sale.

Fluxul verificat OHLCV și validările existente sunt păstrate: 510–2000 bare, ordine cronologică, valori finite, volum pozitiv, sesiuni încheiate, salturi de închidere sub 25%. În aplicație sunt obligatorii aceeași identitate, monedă și EOD ca analiza deținerii. Detectorul nu include știri, earnings, fundamentale, breadth, FX sau expunerea contului.

## Protocol fix

- Trei păduri, fiecare cu 64 arbori; seeds 4102026, 4102027, 4102028. Eșantioane de 128 observații din antrenare, fără înlocuire; adâncime maximă 7.
- Fiecare nod alege uniform un indicator care variază în nod, apoi un prag uniform între extreme. Partiționare < prag / >= prag; nodurile constante se termină. Nu folosește clasa sau randamentul viitor.
- Lungime de traseu: numărul separărilor plus c(n) pentru observațiile rămase în frunză. c(n)=2H(n−1)−2(n−1)/n, cu suma armonică exactă; c(0)=c(1)=0. Scor pozitiv 2^(−E[h]/c(128)); mai mare înseamnă izolare mai rapidă. Convenția semnului diferă de score_samples scikit-learn.
- 60% antrenare, 20% referință, 20% test. Minime 180 / 50 / 50 observații. Arborii sunt fixați din antrenare. Cuantila empirică 95%, nearest rank, a scorurilor de referință fixează pragul fiecărei păduri și al mediei celor trei scoruri. Numai scorurile strict peste prag sunt marcate.
- Hiperparametrii și regula de prag au fost fixați înaintea experimentului public. Testul nu alege arbori, seeds, indicatori sau praguri. Referința nu este etichetată și nu certifică rata de alarme false.
- Trei prefixe fixe 64/80/100% când există minimum 600 observații; același protocol în fiecare. Testele sunt disjuncte. Indicatorii și perioadele de antrenare folosesc trecut suprapus și nu sunt independente statistic.

Nu necesită standardizare pentru separările uniforme pe o singură axă; transformările afine pozitive păstrează traseele. Sensibilitatea la corelații, orientarea axelor și contaminarea istoricului rămâne. Valorile în afara domeniului de antrenare pot avea scoruri saturate; detectorul nu cuantifică severitatea economică a unei mișcări.

## Interpretare

O interpretare clară cere minimum trei indicatori variabili și variație a scorurilor în referință. „Anomalie de revizuit” cere scorul agregat peste prag și toate cele trei păduri peste pragurile proprii. „În tiparul modelului” cere agregatul și toate pădurile sub prag; nu confirmă siguranța deținerii. Restul rămâne rezultat de graniță.

Medianele, intervalele și pozițiile empirice ale indicatorilor sunt calculate numai din antrenare. Deviațiile sunt ordonate după distanța față de mediană, împărțită la maximul dintre IQR/1,349, 10% din deviația standard și 0,000001. Nu sunt importanțe ale indicatorilor în arbori și nu stabilesc cauze. Calendarul earnings și știrile se verifică în modulele dedicate.

Cronologia afișează ultimele 60 sesiuni din test, recalculată cu parametri fixați înaintea lor. Nu este un jurnal de alerte live; reantrenarea poate revizui marcajele. Raportul păstrează rata depășirilor, media scorurilor, sesiunile cu interpretări de graniță și sesiunile cu indicatori în afara intervalului învățat. Fără etichete externe, nu raportăm acuratețe, precizie, recall sau alarme false.

## Experiment public — 4 octombrie 2026

MSFT, JPM, XOM și SPY, alese înaintea preluării. Yahoo Finance OHLCV, fără date de broker. Toate cele patru au fost disponibile la această rulare, cu EOD **2 octombrie 2026**, 1.255 bare, 1.056 observații și 516 observații în cele trei teste.

| Instrument | Depășiri / sesiuni testate | Rată de depășire | Interpretări de graniță | Prag recent |
|---|---:|---:|---:|---:|
| MSFT | 44 / 516 | 8,53% | 24 | 0,591 |
| JPM | 20 / 516 | 3,88% | 8 | 0,608 |
| XOM | 49 / 516 | 9,50% | 40 | 0,548 |
| SPY | 38 / 516 | 7,36% | 19 | 0,619 |

151 depășiri din 2.064 sesiuni instrument, pe istoric deja examinat pentru celelalte modele. Aceste numere descriu detectorul, fără adevăr de referință pentru anomalie și fără holdout prospectiv nou. Nu demonstrează avantaj de tranzacționare. Schimbările de regim pot produce multe depășiri; ajustările furnizorului nu sunt certificate independent.

[Raport public](https://mferent80-source.github.io/premarket_scanner.html/tools/holdings-isolation-validation.html) · [JSON derivat](isolation-validation-latest.json). Raportul public elimină arborii, vectorii de indicatori, profilurile detaliate și scorurile curente. Include perioade și metrici agregate, fără portofoliu sau chei.

Reproducere: node tools/holdings-isolation-benchmark.mjs docs/isolation-validation-latest.json. Opțiunea --retry-blocked păstrează intrările evaluate și reia numai cele indisponibile; nu a fost necesară în acest experiment.

## Integrare și verificări

Analiza deținerilor → Modele AI → Detectează anomalii. Buton, Worker, rezultat și anulare separate. Cele trei joburi de modele nu rulează simultan. Schimbarea contului, instrumentului, monedei sau EOD anulează detectorul și ignoră rezultatele întârziate. Demo-ul rulează în memorie după Neural / Boosting și HMM.

Demo Isolation are un scenariu fictiv propriu: numai ultima sesiune primește volum ×7 și interval high/low mărit la ±4,5% față de close. Acest istoric este distinct de cel al Neural / HMM și este etichetat explicit. Nu reprezintă piața sau deținerile utilizatorului.

Workerul primește exclusiv bare, ora și un ID temporar. Cheia Trading 212, soldul, cantitățile, costurile, execuțiile și notele nu intră în model. Rezultatul este salvat local per cont/ticker și expiră la 30 minute sau alt EOD. Erorile de stocare sunt vizibile; modelul anterior este păstrat la eșec. Sincronizarea PC–telefon rămâne neactivată. Exportul JSON se deschide numai la cerere.

Validarea locală verifică structura tuturor arborilor, profilurile, pragurile din referință și recalculează scorurile, voturile, explicațiile și metricile testului din parametrii și indicatorii salvați. Verifică agregarea celor trei ferestre. Aceasta certifică consistența internă, nu autenticitatea furnizorului sau reconstruirea pădurilor din bare brute. Modelele compacte ale ferestrelor vechi nu sunt păstrate pentru replay.

17 teste noi acoperă corecția traseelor, cauzalitatea indicatorilor, reproductibilitatea și invarianta afină, izolarea observațiilor extreme, separarea testului de arbori/prag, istorii constante, rezultate alterate, ferestre disjuncte, confidențialitatea Workerului, anulare, cont/EOD și excluderea reciprocă a joburilor. Verificarea completă a aplicației: 508 teste.

Metodologie primară: [Liu, Ting, Zhou — Isolation Forest, 2008](https://cs.nju.edu.cn/zhouzh/zhouzh.files/publication/icdm08b.pdf), [documentația scikit-learn](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html). Implementarea este proprie și nu folosește scikit-learn.
