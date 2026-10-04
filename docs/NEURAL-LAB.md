# Neural Lab — Analiza deținerilor

Versiune aplicație: **26.10.04.0911**.

Primă implementare de cercetare, per instrument: o rețea MLP 10 → 12 → 3 antrenată efectiv prin backpropagation în Web Worker. Nu este o regulă de tranzacționare, o probabilitate calibrată de profit sau un model validat pentru utilizare automată.

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
- Distribuția softmax rămâne necalibrată. Un avantaj pe un singur interval nu produce un semnal confirmat, nu activează Governor și nu schimbă planuri, jurnal, stopuri sau ordine.
- Intrări la peste 6 deviații standard de domeniul antrenării blochează interpretarea. Modelul expiră după 30 minute ori schimbarea sesiunii EOD, simbolului sau monedei.

## Verificări ale livrării

**451 de teste JavaScript trec**, inclusiv 15 pentru mecanismul neuronal și integrarea lui: eliminarea contaminării temporale, normalizare exclusiv pe antrenare, învățarea unei relații neliniare fictive, blocarea istoricului invalid, integritatea ponderilor/procentelor, expirare, anulare și schimbarea contului. Rezultatul fictiv de învățare nu constituie performanță verificată pe instrumente reale.

## Confidențialitate și stocare

Antrenarea are loc pe dispozitiv; Workerul primește numai bare OHLCV, ora și un identificator temporar. Nu primește cheia Trading 212, cantități, cost mediu, sold sau note personale. Cererile de istoric folosesc furnizorii și proxy-urile deja configurate în aplicație.

Modelul și raportul se salvează separat, local, per cont și instrument. Nu sunt sincronizate PC–telefon. Demo-ul folosește exclusiv memorie și date fictive. Schimbarea contului sau ieșirea din demo anulează jobul; o eroare de stocare este afișată. Numai raportul cerut explicit de utilizator este exportat ca JSON.

## Limite și pașii următori

Prima versiune nu folosește știri, earnings, fundamentale, breadth, FX sau expunerea brokerului. OHLC și calendarele păstrează limitele providerului existent; ajustările corporate actions nu sunt certificate. Optimizatorul, selecția epocii și evaluarea sunt testate pe relații neliniare fictive. Nu avem un rezultat de performanță pe piața reală demonstrat în această livrare. Testele algoritmului și demo-ul fictiv verifică mecanismul, nu randamentul financiar.

Pentru trecerea la un model validat: istoric cu ajustări și proveniență verificabile; evaluări walk-forward pe mai multe perioade/instrumente; blocuri de observații independente și incertitudine; calibrare; comparații cu modele suplimentare; evaluare separată cu costuri și slippage. Nu se aleg hiperparametri repetat după citirea aceluiași test.

Surse de metodologie: [MLP și backpropagation — documentația scikit-learn](https://scikit-learn.org/stable/modules/neural_networks_supervised.html), [Separare temporală și gap — TimeSeriesSplit](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html). Implementarea din aplicație este JavaScript propriu, fără dependență de scikit-learn.

Demo: https://mferent80-source.github.io/premarket_scanner.html/tools/holdings-neural-demo.html
