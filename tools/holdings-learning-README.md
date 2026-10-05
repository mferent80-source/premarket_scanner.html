# Probabilități și învățare în timp

Modelele individuale păstrează rolurile lor: Neural și Gradient Boosting estimează clasele Declin/Mixt/Avans la +5 sesiuni față de ±1 ATR inițial; cuantilele verifică mediana și intervalul; HMM descrie regimul; Isolation descrie anomaliile; GARCH estimează volatilitatea la 5/20 sesiuni. Aceste probabilități nu sunt probabilități de profit.

## Stocare și migrare

Registrul v1 acceptă până la 20.000 înregistrări și 40.000.000 caractere pe instrument/cont/monedă/tip de date. `HoldingsForecastStorage` folosește IndexedDB și o copie în memorie pentru interfața sincronă. Încărcarea este așteptată înaintea capturii, verificării și antrenării gestionate. Copiile localStorage existente sunt citite și păstrate; migrarea nu șterge date.

O scriere devine permanentă numai la `transaction.oncomplete`. Refuzul/expirarea/abortul păstrează estimările disponibile în sesiune, cu mesaj explicit de export. Scrierile din alte pagini se îmbină atomic pe ID; primul forecast permanent nu poate fi înlocuit. Backup-ul și registrul se scriu într-o singură tranzacție. Anularea restaurării detectează schimbările concurente și nu șterge observațiile noi. Backup: maximum 64 MiB. Nu există trunchiere automată.

Rezultatele deja rezolvate înaintea începutului seriei publice actuale rămân în istoric. Această păstrare cere o sursă actuală verificabilă ca identitate, monedă, fus, sesiune și moment de recuperare; nu pretinde reverificarea unor bare care nu mai sunt în fereastra recuperată.

## Checkpoint-uri probabilistice

`HoldingsCalibration` rămâne un experiment retrospectiv separat. `HoldingsLearning` construiește versiuni operaționale fixe pe aceleași perechi prospectiv păstrate și verificate. Estimările restaurate, marcate prin `restoredAt`, nu activează învățarea operațională: verificarea prețului nu autentifică momentul estimării. Demo rămâne separat și explicit fictiv.

- Prima evaluare: minimum 40 orizonturi separate; ultimele 20 testează, observațiile precedente (maximum 100) calibrează.
- Minimum 4 rezultate din fiecare clasă în fiecare bloc. Ultimul rezultat din calibrare precede prima origine din test; nu echilibrăm sau mutăm etichetele de test.
- Grila Neural 50/25/75%, temperaturi 1/1,5/2/3; selecția minimizează exclusiv log loss pe calibrare.
- Pe test, candidatul trebuie să depășească priorul claselor calculat exclusiv din calibrare: log loss cu peste 0,02 și Brier cu peste 0,01. Nu poate fi mai slab decât cea mai bună componentă cu mai mult de 0,01 pe fiecare scor.
- Pentru înlocuirea unei versiuni active: 20 origini noi după ultimul rezultat evaluat, capturate după adoptarea/evaluarea anterioară. Candidatul trebuie să depășească și versiunea activă pe exact același bloc, cu marjele 0,02/0,01.
- Checkpoint-urile păstrează originile, dovezile, parametrii și scorurile. Orice modificare a dovezilor suspendă folosirea versiunii. Nu schimbăm parametrii după etichetele blocului de test. Istoricul reține până la 200 evaluări, fără ștergerea celor existente.
- După 20 rezultate noi, pierderea avantajului față de prior suspendă direcția. Pragurile de decizie sunt politici fixe: probabilitatea clasei dominante ≥45%, diferență față de următoarea clasă ≥10 pp. Nu sunt praguri optimizate pe test sau intervale de încredere statistice.

Fără checkpoint eligibil se afișează media 50/50 exploratorie și rezultatele individuale; verdictul se abține. Un checkpoint eligibil poate contribui la direcție chiar dacă componentele nu au separat avantaj istoric repetat. Nu trece peste rapoarte lipsă, surse incompatibile, drift/dezacord neuronal, anomalii sau cuantile/HMM incompatibile. GARCH rămâne context. Probabilitățile și ID-ul checkpoint-ului sunt păstrate în prima înregistrare a verdictului; log loss și Brier includ și abținerile care au probabilități.

## Reantrenare

Verificarea automată rulează o dată pe minut numai când pagina este vizibilă și există dețineri. Un EOD nou pornește aceiași workeri existenți, secvențial, pe un singur istoric comun. Un EOD finalizat se reutilizează; eșecurile au pauză de 15 minute, iar cererea manuală poate relua. O schimbare de cont, instrument sau închidere anulează lucrarea anterioară. Analiza manuală preia prioritatea și marchează sesiunea completă pentru a evita reantrenarea dublă.

Acesta este un circuit de reantrenare pe istoric actualizat și de validare a combinației pe rezultate observate. Nu este actualizare incrementală a ponderilor MLP după fiecare tranzacție și nu rulează cu pagina închisă. Nimic nu transmite ordine la broker. Modelele și registrele rămân în browser.

Metoda de ajustare prin temperatură: [Guo și col., ICML 2017](https://proceedings.mlr.press/v70/guo17a.html). Grila, marjele, limitele și protocolul temporal sunt reguli ale aplicației, fără pretenție de semnificație statistică.
