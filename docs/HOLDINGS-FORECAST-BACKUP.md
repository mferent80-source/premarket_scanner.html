# Backup și restaurare a estimărilor

În **Analiza deținerilor → Modele AI → Predicții vs. realitate → Backup și restaurare** se poate restaura registrul unei dețineri. Aceasta este o etapă a backup-ului selectiv din audit; nu activează sincronizarea cloud și nu restaurează jurnalul, planurile sau contul brokerului.

## Utilizare

1. **Exportă registrul** și descarcă JSON-ul. Fișierul include tickerul, listingul, moneda, tipul datelor, estimările originale, rezultatele, versiunile și manifestul cu numărul de înregistrări per model și orizont. Nu include identificatorul contului, chei, cantități, sold sau ponderile antrenate.
2. În deținerea corespunzătoare, deschide **Restaurează backup** și alege fișierul. Citirea și previzualizarea nu scriu în registru.
3. Verifică numărul de înregistrări noi, duplicate și conflicte. Selectează modelele și orizonturile dorite; GARCH 5 și 20 sunt separate. **Restaurează selecția** adaugă doar estimările noi selectate.
4. **Verifică rezultatele** solicită sursa publică. Rezultatele importate rămân excluse din scoruri până la reverificare. Datele originale ale rezultatului se păstrează pentru detectarea revizuirilor.
5. **Anulează ultima restaurare** elimină numai estimările adăugate prin acea operațiune. Păstrează estimările locale anterioare și cele salvate ulterior, inclusiv verificările lor. Copia dinaintea anulării rămâne în arhivă.

Restaurarea se face în contul activ și în registrul listingului selectat. Exportul nu identifică contul de origine. Pentru transfer manual PC–telefon trebuie selectată aceeași deținere, cu același ticker broker, listing, monedă și tip de date. Exporturile anterioare fără manifest/ticker rămân compatibile când listingul, moneda și tipul corespund. Un fișier demo nu poate intra în registrul real.

## Protecția istoricului

- ID-ul prospectiv și prima estimare nu sunt schimbate. Duplicatele păstrează varianta locală și nu importă verificări mai recente din fișier.
- Un ID identic cu altă estimare, proveniență, dată de captură sau rezultat de închidere devine conflict și este omis. Diferențele de ordine a câmpurilor JSON și de dată a reverificării aceluiași rezultat nu sunt conflicte.
- Registrul local și arhiva sunt comparate din nou cu starea de la previzualizare. O schimbare de cont, listing sau monedă închide dialogul; un răspuns întârziat al citirii fișierului este ignorat.
- Copia exactă a registrului anterior este arhivată înainte de scriere. Un eșec al arhivării blochează restaurarea. Un eșec al scrierii registrului nu raportează succes și păstrează copia anterioară.
- Arhiva este cumulativă: restaurările și anulările succesive nu înlocuiesc copiile anterioare. Anularea funcționează după reîncărcare și după verificări sau estimări noi. Dacă originalul unei estimări restaurate a fost modificat, anularea este blocată.
- **Exportă arhiva restaurărilor** descarcă copiile anterioare și operațiunile. Arhiva este un fișier de recuperare/audit; selectorul de restaurare acceptă exportul registrului, nu arhiva întreagă. Câmpul `before` din fiecare operațiune conține registrul exact anterior, iar `added` păstrează estimările adăugate.

Nicio arhivă sau înregistrare existentă nu este ștearsă automat. Fișierele invalide și registrele/arhivele ilizibile sunt refuzate. Registrele valide sunt limitate la 500 înregistrări și 1,5 milioane de caractere; fișierul de intrare și arhiva la 8 MB, arhiva la 100 operațiuni. Selectarea unui subset poate respecta limita registrului. Epuizarea cotei browserului blochează operațiunea fără a declara o salvare reușită.

Verificările de concurență sunt optimiste. `localStorage` nu oferă o tranzacție atomică între taburi pentru arhivă și registru; nu se pretinde garantarea atomicității globale. Copia prealabilă și verificările imediat înaintea scrierii reduc riscul, fără să îl elimine complet.

## Interpretare

Manifestul verifică structura, numărul de rânduri, versiunile și orizonturile. Nu este semnătură criptografică. Un fișier sau o stocare locală modificată nu poate demonstra că predicția a fost făcută înaintea rezultatului. Reverificarea confirmă observațiile publice, nu autenticitatea momentului salvării.

HMM și Isolation rămân context descriptiv. GARCH, cuantilele, direcțiile și abținerile verdictului folosesc în continuare regulile și separarea orizonturilor din [HOLDINGS-FORECAST.md](HOLDINGS-FORECAST.md).

## Verificare

`tools/holdings-forecast-backup.test.mjs` verifică manifestul, formatul anterior, identitatea, duplicate/conflicte, selectarea orizonturilor, excluderea rezultatelor importate, cote, arhivarea înaintea scrierii, schimbări concurente, păstrarea copiilor și anularea selectivă după reîncărcare.

`tools/holdings-forecast-backup-ui.test.mjs` verifică handler-ele de citire/previzualizare/selecție/restaurare/anulare, schimbări de cont/listing, fișiere întârziate, starea modificată după previzualizare, exportul arhivei și ordinea încărcării modulelor.
