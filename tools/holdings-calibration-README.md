# Calibrarea combinației AI

Raport experimental pe estimările originale din **Predicții vs. realitate**, afișat în registru și în dialogul Verdict AI. Nu schimbă regulile din `HoldingsVerdict`, nu votează prețul și nu produce o probabilitate de profit.

## Date și compatibilitate

Estimările Neural și Boosting noi păstrează opțional `estimate.probabilities`, trei valori în ordinea Declin / Mixt / Avans. Vectorul trebuie să fie finit, între 0 și 1, cu sumă 1 în toleranța 1e-6 și argmax egal cu clasa păstrată. Sunt probabilitățile modelului la estimare, inclusiv ajustarea sa internă existentă. Registrul rămâne `holdings-forecast-v1`; câmpul este opțional și nu se adaugă retroactiv. Prima estimare pe model / EOD rămâne imuabilă. Exportul și restaurarea păstrează vectorul și tratează modificarea lui drept conflict.

Construim perechi Neural / Boosting numai pentru același cont, instrument, monedă și tip de date. Cele două surse trebuie să aibă exact aceleași timp, EOD, fus, închidere, oră de închidere și ATR. Cerem verificare `resolved`, rezultat și toate cele cinci închideri identice. Estimările fără probabilități, incomplete, în așteptare, neverificabile sau incompatibile se numără separat. Orizonturile care se ating sau se suprapun se exclud înainte de împărțire. Clasele observate folosesc ±1 ATR inițial la +5 sesiuni.

## Protocolul experimentului v1

Ordine după origine; prima jumătate calibrează, a doua testează. Cerem minimum 40 perechi separate, minimum 20 și câte 4 observații din fiecare clasă în fiecare jumătate. Nu echilibrăm, amestecăm sau selectăm exemple folosind etichetele testului. Toate rezultatele calibrării se încheie înainte de prima origine de test.

Selectăm ponderea Neural din `{0.5, 0.25, 0.75}` și temperatura din `{1, 1.5, 2, 3}` prin log loss numai pe calibrare. Aplicăm temperatura la media ponderată a probabilităților: `softmax(log(p) / T)`, cu plafon numeric 1e-12. Egalitățile păstrează prima configurație. [Guo et al., ICML 2017](https://proceedings.mlr.press/v70/guo17a.html) descriu ajustarea prin temperatură; alegerea grilei, ponderilor, împărțirii și marjelor sunt specifice acestui experiment.

Pe aceleași observații de test raportăm log loss, Brier multiclasă (suma erorilor celor trei clase, fără împărțire la 3), acuratețe, acuratețe echilibrată și matrice de confuzie. Repere: Neural, Boosting, media 50/50 păstrată și frecvențele claselor calibrării cu o pseudo-observație pe clasă. Eticheta „Avantaj observat pe test” cere log loss cu peste 0.02 și Brier cu peste 0.01 mai mici decât fiecare reper. Marjele sunt descriptive; nu reprezintă semnificație statistică, confirmare de calibrare perfectă sau validare pentru tranzacționare.

La adăugarea observațiilor împărțirea se recalculează. Evaluarea este retrospectivă pe estimări păstrate prospectiv; combinația nu este un nou model urmărit prospectiv. Versiunile Neural / Boosting sunt verificate; reantrenarea în aceeași versiune poate schimba distribuția probabilităților. Registrul acceptă acum până la 20.000 estimări pe instrument, cu IndexedDB și migrare care păstrează copiile vechi. Nu șterge istoricul pentru a face loc. Checkpoint-urile operaționale sunt documentate separat în holdings-learning-README.md.

## Demo și verificare

Butonul „Simulează calibrarea · date fictive” există doar în modul demo. Creează 40 perechi ilustrative în memoria demo, fără `localStorage` real. Estimările și ATR fictiv sunt construite inclusiv din închideri viitoare demo pentru a ilustra clasele și erorile; nu sunt predicții reale. Nu înlocuiește estimări existente și nu poate contribui la evaluarea unui cont real.

```sh
node --test tools/holdings-calibration.test.mjs tools/holdings-forecast*.test.mjs tools/holdings-verdict-ui.test.mjs
node --test tools/*.test.mjs tools/*.test.cjs
```

Testele schimbă toate etichetele de test și verifică faptul că parametrii, priorul și scorul calibrării rămân identice. Mai verifică formulele pe un reper analitic, eliminarea suprapunerilor, incompatibilitățile surselor, păstrarea istoricului vechi, restaurarea probabilităților și izolarea demo / cont.
