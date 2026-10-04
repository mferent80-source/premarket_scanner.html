# Ferestre de analiză a modelelor — v1

Acces: Analiza deținerilor → Modele AI → Sinteza modelelor → „Vezi analiza” din cardul modelului.

Fereastra afișează numele complet și analiza fiecărui model. Filele Neural (MLP), Gradient Boosting, HMM și Isolation Forest permit comutarea fără închiderea ferestrei. „Analiza completă în pagină” duce la panoul existent, cu grafice, metodologie, antrenare și raport JSON. „Actualizează fereastra” reconstruiește rezultatele curente. Escape și „Închide” închid fereastra; focusul revine la butonul care a deschis-o, dacă identitatea instrumentului este aceeași.

## Conținut

- **Rețea neuronală · ansamblu MLP**: interpretarea curentă, loss pe test, acuratețe echilibrată istorică, ferestre cu avantaj, distanță față de antrenare și cei zece indicatori EOD.
- **Gradient Boosting · arbori de decizie**: interpretarea, testul istoric, ferestrele cu avantaj, rundele selectate și indicatorii folosiți în împărțirile arborilor. Ponderile descriu antrenarea, nu cauze ale mișcării prețului.
- **Hidden Markov Model · regimuri**: contextul și limitele lui, cele trei NLL pe test, observațiile concentrate consecutive, trend/EMA21/ATR, separarea stărilor și indicatorul de schimbare în model.
- **Isolation Forest · anomalii**: interpretarea, scorul și pragul, acordul pădurilor, indicatorii în afara intervalului și deviațiile descriptive față de mediană. Depășirile din test nu sunt acuratețe sau alarme false verificate.

## Identitate, prospețime și confidențialitate

Proiecția `holdings-model-analysis-v1` consumă numai inspecțiile interne validate de fiecare model și sinteza curentă; nu este un format pentru importuri. Verifică disponibilitatea cardului, identitatea simbol/monedă/EOD/piață-demo, versiunea sursei și data antrenării. Rezultatele expirate, viitoare sau incompatibile nu afișează metrice vechi. Valorile numerice lipsă apar ca indisponibile, fără conversia lui null în zero.

La deschidere, schimbarea filei, actualizare și reîmprospătarea panoului Modele AI, rezultatele sunt reconstruite. Schimbarea contului, poziției, simbolului, monedei sau sesiunii închide fereastra. O antrenare în curs este etichetată, iar un rezultat anterior disponibil rămâne separat de aceasta. Fereastra nu citește cantități, sold, chei API ori identificatorul contului și nu trimite date în rețea. Parametrii modelelor nu sunt incluși în proiecție.

Acuratețea privește etichetele istorice, nu tranzacții. NLL HMM și loss-ul clasificatorilor au semnificații distincte. Scorul Isolation nu este un indicator de risc. Niciun model nu produce o probabilitate de profit în această fereastră. Demo folosește date fictive, iar Isolation are propriul scenariu separat.

## Verificare

12 teste noi acoperă proiecțiile celor patru modele, indisponibilitatea, identitatea și vechimea, metricele lipsă, lipsa câmpurilor private, interpretările blocate, deschiderea/comutarea și închiderea la schimbări de context. Algoritmii și rapoartele publice anterioare nu sunt modificate.

Verificare automată: 554 de teste trecute în suita completă.
