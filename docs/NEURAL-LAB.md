# Neural Lab — Analiza deținerilor

Versiune aplicație: **26.10.04.0948**.

Implementare de cercetare, per instrument: o rețea MLP 10 → 12 → 3 antrenată efectiv prin backpropagation în Web Worker. Nu este o regulă de tranzacționare, o probabilitate calibrată de profit sau un model validat pentru utilizare automată.

## Obiectiv și date

Eticheta este schimbarea închiderii după cinci observații zilnice, exprimată în ATR-ul curent. Sub −1 ATR: Declin; peste +1 ATR: Avans; între ele: Mixt. Indicatorii de intrare sunt randamente 5/20/60, distanțe EMA21/50/200, pantă EMA21, RSI14, ATR procentual și volum relativ față de ultimele 20 sesiuni.

Butonul din fila **Rețea neuronală** solicită până la cinci ani OHLC de la fluxul de date existent. Identitatea instrumentului, moneda și sesiunea finală trebuie să coincidă cu analiza EOD verificată. Volumul lipsă, datele nevalide, istoricul insuficient sau un salt zilnic peste 25% blochează antrenarea. Un asemenea salt poate fi eveniment real sau ajustare; modelul nu decide care.

Sunt necesare minimum 510 bare și 300 exemple după warm-up/etichetare, cu minimum 150 exemple de antrenare și 50 în fiecare set ulterior. Fiecare clasă necesită minimum 10 exemple în antrenare și 5 în validare/test. Aceste praguri permit un experiment; nu certifică suficiența statistică.

## Antrenare și evaluare

- Separare cronologică aproximativ 60/20/20; exemplele al căror orizont se suprapune cu următorul set sunt eliminate înainte de antrenare.
- Mediile și deviațiile pentru standardizare sunt calculate exclusiv pe antrenare.
- Rețea tanh + softmax, Adam, regularizare L2 și seed fix. Maximum 180 epoci; oprire după stagnarea validării. Epoca este aleasă pe validare, fără optimizare pe test.
- Două repere: classifier liniar softmax antrenat pe aceleași intrări și frecvențele claselor din antrenare.
- Avantajul în test cere loss cu minimum 0,02 mai mic și acuratețe echilibrată cu minimum 2 puncte procentuale mai bună decât **ambele** repere. În caz contrar este afișat „Fără avantaj demonstrat”. Acesta nu este un test de semnificație statistică.
- Distribuția softmax rămâne necalibrată. Un avantaj pe un singur interval este marcat fragil; nu produce un semnal confirmat, nu activează Governor și nu schimbă planuri, jurnal, stopuri sau ordine.
- Intrări la peste 6 deviații standard de domeniul antrenării blochează interpretarea. Modelul expiră după 30 minute ori schimbarea sesiunii EOD, simbolului sau monedei. Modelele v1 rămân salvate, dar cer reantrenare pentru protocolul v2.

## Verificări ale livrării

**458 de teste JavaScript trec**, inclusiv 22 pentru mecanismul neuronal și integrarea lui: eliminarea contaminării temporale, normalizare exclusiv pe antrenare, învățarea unei relații neliniare fictive, blocarea istoricului invalid, integritatea ponderilor/procentelor, expirare, anulare și schimbarea contului. Alte verificări acoperă ferestrele în expansiune, excluderea etichetelor peste granițele testelor, agregarea corectă pe clase, intervalele blocate și integritatea verdictului de robustețe. Rezultatul fictiv de învățare nu constituie performanță verificată pe instrumente reale.


## Protocol v2: trei ferestre în timp

Pentru minimum 600 exemple etichetate, protocolul folosește trei prefixe fixe ale istoricului: 64%, 80%, 100%. Fiecare este separat aproximativ 60/20/20 în antrenare, validare și test. Antrenarea crește, epoca este aleasă numai pe validarea ferestrei, iar regulile, seed-ul și bugetul de 180 epoci rămân fixe. Ferestrele nu sunt alese după rezultate.

Etichetele al căror orizont atinge următorul set sau următoarea fereastră sunt eliminate. Ferestrele de test nu împart orizonturi de rezultat. Controlul suplimentar selectează următorul exemplu numai dacă începe după încheierea etichetei celui precedent. Aceasta elimină suprapunerea, nu garantează independența statistică. Acuratețea echilibrată agregată se calculează din totalurile claselor, fără a media arbitrar scorurile ferestrelor.

„Avantaj repetat” necesită toate cele trei ferestre evaluate cu avantaj, avantaj pe agregarea zilnică și avantaj pe controlul fără suprapunere, cu minimum 50 orizonturi și minimum 5 exemple în fiecare clasă. Intervalele blocate nu sunt eliminate din verdict. Istoricul insuficient păstrează testul recent, cu robustețe neconfirmată. Timeout-ul Workerului este de 180 secunde; jobul rămâne anulabil.

## Experiment public — 4 octombrie 2026

Istoric Yahoo Finance, prin fluxul public existent: **1.255 bare per instrument**, sesiune finală **2 octombrie 2026**, identitate, monedă și program verificate de DailySeries. MSFT, JPM, XOM și SPY au fost alese înaintea evaluării, fără folosirea contului brokerului. OHLCV și ajustările nu sunt certificate independent; acesta este un eșantion nereprezentativ.

| Instrument | Ferestre cu avantaj | Loss rețea / liniar / frecvențe, test recent | Orizonturi fără suprapunere | Verdict |
|---|---:|---|---:|---|
| MSFT | 0/3 | 1,061 / 1,073 / 1,056 | 102 | Fără robustețe demonstrată |
| JPM | 0/3 | 0,986 / 1,021 / 0,995 | 102 | Fără robustețe demonstrată |
| XOM | 0/3 | 1,138 / 1,133 / 1,081 | 102 | Fără robustețe demonstrată |
| SPY | 0/3 | 1,067 / 1,079 / 1,029 | 102 | Fără robustețe demonstrată |

Un loss mai mic este mai bun; pragul de avantaj include și acuratețea echilibrată față de ambele repere. De exemplu, îmbunătățirea loss pentru JPM în testul recent nu este suficientă pentru verdict. Hiperparametrii nu au fost ajustați după citirea rezultatelor acestui experiment.

Raportul este datat și nu reprezintă un scan live. [Pagina de verificare](https://mferent80-source.github.io/premarket_scanner.html/tools/holdings-neural-validation.html), [datele derivate ale raportului](neural-validation-latest.json). Nu publicăm barele brute sau ponderile modelelor de piață.

Reproducere din rădăcina repo-ului: `node tools/holdings-neural-benchmark.mjs docs/neural-validation-latest.json`. Scriptul folosește instrumente publice fixe, nu citește chei sau date de cont, verifică ultima sesiune disponibilă și păstrează erorile în raport. Valorile se pot schimba la revizuirea istoricului de către furnizor.

## Confidențialitate și stocare

Antrenarea are loc pe dispozitiv; Workerul primește numai bare OHLCV, ora și un identificator temporar. Nu primește cheia Trading 212, cantități, cost mediu, sold sau note personale. Cererile de istoric folosesc furnizorii și proxy-urile deja configurate în aplicație.

Modelul și raportul se salvează separat, local, per cont și instrument. Nu sunt sincronizate PC–telefon. Demo-ul folosește exclusiv memorie și date fictive. Schimbarea contului sau ieșirea din demo anulează jobul; o eroare de stocare este afișată. Numai raportul cerut explicit de utilizator este afișat pentru export JSON, prin link direct sau copiere. Descărcarea fișierului nu a fost confirmată în browserul de test; JSON-ul afișat este verificat.

## Limite și pașii următori

Prima versiune nu folosește știri, earnings, fundamentale, breadth, FX sau expunerea brokerului. OHLC și calendarele păstrează limitele providerului existent; ajustările corporate actions nu sunt certificate. Optimizatorul, selecția epocii și evaluarea sunt testate pe relații neliniare fictive. Evaluarea publică descrisă mai jos nu a demonstrat avantaj repetat pe cele patru instrumente; nu avem profitabilitate verificată. Testele algoritmului și demo-ul fictiv verifică mecanismul, nu randamentul financiar.

Pentru trecerea la un model validat: istoric cu ajustări și proveniență verificabile; extinderea evaluărilor walk-forward pe perioade și instrumente suplimentare; blocuri de observații independente și incertitudine; calibrare; comparații cu modele suplimentare; evaluare separată cu costuri și slippage. Nu se aleg hiperparametri repetat după citirea aceluiași test.

Surse de metodologie: [MLP și backpropagation — documentația scikit-learn](https://scikit-learn.org/stable/modules/neural_networks_supervised.html), [Separare temporală și gap — TimeSeriesSplit](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html). Implementarea din aplicație este JavaScript propriu, fără dependență de scikit-learn.

Demo: https://mferent80-source.github.io/premarket_scanner.html/tools/holdings-neural-demo.html
