# Istoricul sintezelor — v1

Versiunea aplicației: **26.10.04.1646**.

Acces: Analiza deținerilor → o deținere → Modele AI → Sinteza modelelor → Ce s-a schimbat?

„Păstrează sinteza” salvează explicit o sinteză cu minimum un rezultat actual, după terminarea antrenării. Nu se fac salvări la actualizarea interfeței, la fiecare minut sau automat după antrenare. Alegerea unei sinteze în „Istoric și comparație” reconstruiește comparația față de analiza afișată.

## Separare și retenție

- Cheile locale includ contul, simbolul de piață, moneda și tipul piață/demo. O schimbare de cont sau instrument nu reutilizează identitatea capturată la legarea butoanelor.
- Datele reale folosesc localStorage. Demo folosește numai memorie și dispare la reîncărcare. Niciun istoric demo nu este copiat în istoricul contului.
- Se păstrează cele mai recente 20 de sinteze per identitate. La salvarea celei de-a 21-a, cea mai veche este înlocuită. Sintezele care diferă doar prin ora regenerării interfeței nu produc duplicate; o nouă antrenare poate produce o înregistrare distinctă chiar pe aceeași sesiune.
- Jurnalul, planurile, brokerul și setările existente nu sunt modificate. Sincronizarea între dispozitive nu este activată de această funcție. Ștergerea datelor browserului poate elimina istoricul local.

## Conținut și validare

Formatul `holdings-lab-history-v1` păstrează ora salvării și proiecția compactă a `holdings-lab-summary-v1`: identitatea instrumentului, sesiunea EOD, disponibilitatea, stările și textele modelelor, datele antrenării și versiunile. Isolation păstrează scorul, pragul și voturile pentru proveniență; acestea nu sunt afișate ca diferență de risc.

Proiecția nu include identificatorul contului, cantități, sold, chei API, ponderi, arbori sau OHLCV. Contul separă cheia locală; nu apare în conținutul sintezei. Nu se face niciun apel de rețea pentru salvare sau comparație. Istoricul nu este un format pentru importuri și nu autentifică sursa prețurilor sau modificările manuale în localStorage.

Înregistrările cu identitate diferită, date imposibile/viitoare, versiuni sau stări neacceptate, disponibilitate inconsistentă ori ordine coruptă sunt excluse. Un istoric existent care nu poate fi citit/verificat nu este suprascris. Eșecul scrierii este afișat și nu este raportat ca salvare reușită. Istoricul are o limită de 256.000 caractere per cheie; textul și schema sunt limitate individual.

Un rezultat trebuie să fi fost disponibil la generarea sintezei (maximum 30 minute de la antrenare). Înregistrarea istorică poate rămâne vizibilă mai târziu, cu datele ei originale, fără a redeveni rezultat actual. Salvarea și comparația cer o sinteză curentă; antrenarea în curs blochează salvarea/comparația. Nu se compară o analiză mai veche ca și când ar fi ulterioară sintezei alese.

## Semnificația diferențelor

Comparația are patru rânduri: Neural, Boosting, HMM și Isolation. Distinge schimbarea stării/interpretării de schimbarea disponibilității și de reantrenarea fără schimbarea stării. Disponibilitatea 4/4 nu înseamnă patru confirmări de tranzacționare.

Aceeași sesiune EOD este etichetată „reanalizare, fără o sesiune nouă de piață”. Sesiunile diferite sunt datate explicit. Schimbările descriu rezultatele salvate, nu o tranzacție, un randament sau confirmarea unui reversal. Numele regimurilor HMM se pot relabela la reantrenare. Scorurile și pragurile Isolation depind de antrenare, nu măsoară riscul și nu se compară direct între două antrenări.

## Verificare

20 de teste noi acoperă separarea identităților, proiecția fără date private, duplicatele, limitele, imutabilitatea, ceasul/datele, disponibilitatea, scenariile de corupere și quota, interpretarea reantrenării și comportamentul UI la schimbarea contului. Algoritmii și rapoartele publice existente rămân neschimbate.

Verificare automată: 542 de teste trecute în suita completă, inclusiv cele 20 de teste noi de istoric.
