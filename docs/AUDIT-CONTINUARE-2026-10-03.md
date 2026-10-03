# Trading Tools — audit transversal, continuare din 3 octombrie 2026

Versiune livrată: **26.10.03.2316**. Acest raport continuă auditul anterior și verifică implementarea actuală a aplicației. Nu repetă drept lucrări noi funcțiile deja livrate: layout compact al deținerilor, grafice, regimuri EOD, calendar, scenarii, planuri și rapoarte.

**Verdict:** principalele fluxuri au regresii automate și protecții mai bune după reparațiile de mai jos. Aplicația este utilă pentru cercetare, monitorizare și jurnal. Nu poate fi considerată încă un control complet al riscului contului Trading 212: Governor folosește jurnalul manual. Această limită este acum vizibilă în Decision Desk.

## Probleme reproduse și reparate

| Prioritate | Problemă și consecință | Comportament după reparație |
|---|---|---|
| P1 | După un snapshot parțial al contului B, Holdings putea afișa pozițiile contului A, în timp ce Coach și Portofoliu selectau B | Un selector comun și un marcaj al contului activ sunt folosite în Holdings, Portofoliu, jurnal, Coach și Health. Pozițiile lipsă rămân lipsă; nu se selectează alt cont pentru a umple pagina |
| P1 | Răspunsul parțial suprascria ultima copie completă a soldului/pozițiilor | Copia completă a aceluiași scope este păstrată separat, cu ora ei. Nu este introdusă în calculele actuale și nu primește timestamp-ul răspunsului parțial |
| P1 | Clientul accepta orice mediu live/demo și un timestamp parsabil, fără a cere mediul solicitat și prospețime | Sunt respinse răspunsurile pentru alt mediu, mai vechi de 5 minute, cu peste 60 secunde în viitor și cu structuri sau valori numerice incompatibile. Cererea din browser are un termen de 25 secunde, suplimentar termenului Workerului |
| P1 | O deconectare în timpul calculului hash-ului putea fi urmată de reluarea conexiunii vechi | Operația verifică identitatea sesiunii după etapele asincrone. Cererile sunt anulate imediat la ștergerea conexiunii |
| P1 | O salvare aflată încă în criptare putea scrie cheia după comanda de ștergere | Generarea cheii, criptarea și operațiile IndexedDB sunt serializate. Browserul folosește și Web Locks când sunt disponibile. O salvare anterioară nu anulează comanda ulterioară de ștergere |
| P1 | Importul execuțiilor se oprea când întâlnea un fill cunoscut, deși mai exista cursor | Importul urmează toate paginile. După o parcurgere completă, o nouă verificare poate începe după 5 minute, cât timp aplicația este activă; limitele API rămân respectate |
| P1 | Execuțiile incompatibile erau excluse, dar ultima pagină putea certifica totuși istoricul complet | Importul păstrează acoperirea parțială dacă există execuții respinse. Ordinele identificate fără execuție sunt separate de execuțiile deteriorate. Valorile numerice sub formă de text și datele din viitor nu sunt acceptate ca fills valide |
| P1 | Alertele din Control puteau compara stopul în moneda instrumentului cu EOD în altă monedă | Alertarea cere aceeași monedă; GBp este normalizat la GBX. O monedă necunoscută nu declanșează comparația |
| P2 | Condițiile tehnice salvate pentru un simbol puteau fi evaluate pe noul simbol asociat | Condițiile care au simbol/monedă documentate rămân neverificate când asocierea diferă. Reconfirmarea tezei este necesară |
| P2 | Health trata un timestamp viitor drept scanare recentă de 0 minute și un snapshot parțial drept recent fără avertisment | Timestamp-urile incompatibile sunt marcate invalid; snapshot-ul broker parțial este marcat explicit |
| P2 | Datele vechi incompatibile din jurnal puteau rămâne certificate; execuțiile viitoare puteau intra în FIFO | Arhiva este păstrată, dar acoperirea nu este completă până la corectare. FIFO exclude fills fără ticker și fills din viitor |
| P2 | Decision Desk descria contextul daily drept „live”, scorul euristic ca procent de încredere și riscul local fără acoperire explicită | Etichete pentru sesiuni încheiate, scor context /100 și explicație permanentă privind jurnalul manual folosit de Governor |

Arhivele conturilor, jurnalul, planurile și setările nu sunt șterse. Schimbarea unei chei API poate crea în continuare un scope nou; marcajul activ previne amestecarea lui cu arhivele.

## Acoperirea auditului

| Direcție | Ce a fost verificat | Limită rămasă |
|---|---|---|
| Date și logică financiară | Contract EOD, indicatori, monede, planuri, prospețime, snapshot-uri, selecție de cont, FIFO și acoperire import | Calendar bursier complet, FX verificat și ajustările tuturor corporate actions nu sunt implementate integral |
| Trading 212 | Client, timeout, schimbare de sesiune, cheie persistentă, paginare, deduplicare și separare live/demo | Verificările contului autentic nu au fost efectuate în browserul agentului; acesta nu are cheia utilizatorului |
| Securitate | Autorizare și CORS ale releului în teste, GET-only, rute permise, redirecturi oprite, erori fără conținut privat, criptare și ștergere locală | Criptarea locală nu izolează cheia de codul care rulează pe aceeași origine. Aceasta este o limită de arhitectură, nu dovada unui atac |
| Confidențialitate | Scanare limitată la tipare cunoscute de credențiale în 344 fișiere text urmărite de Git; niciun rezultat | Nu este un secret scanner exhaustiv și nu verifică istoricul integral Git |
| UI și accesibilitate | Navigare, stări fără date, taburi, filtre, selecție persistentă, drafturi și demo separat | Audit vizual la dimensiune de telefon; instalarea și suspendarea aplicației pe un telefon fizic nu sunt demonstrate |
| Performanță | Limite API, solicitări paralele controlate, cozi, intervale și scripturi/active locale | Toate cardurile deținerilor sunt încă reconstruite la unele actualizări; portofoliile mari au nevoie de randare incrementală |
| PWA și versiuni | Cache numai pentru shell, stare offline explicită, badge/update și potrivirea versiunii cu metadatele | Modul offline nu oferă date financiare actuale; procesele automate din browser se opresc când sistemul suspendă aplicația |
| Cloud PC–telefon | Suitele de reconciliere, conflicte, proprietar cont, criptare și backup local | Activarea online rămâne amânată conform deciziei utilizatorului. Niciun Google/D1 nu a fost activat prin acest audit |
| Publicare și mentenanță | Regresii JS/Python, rezolvarea activelor din zece pagini și verificarea scripturilor inline | Workflow-ul de publicare UI execută încă scanarea Breadth; separarea lor ar reduce timpul și riscul de deploy |

## Validare

- **395 teste JavaScript/Node trec**, inclusiv scenarii de concurență, pagini următoare după fill cunoscut, răspunsuri broker greșite, monede incompatibile și date istorice deteriorate.
- **7 teste Market Breadth**, **8 teste ale suitei Breadth** și **22 verificări core Breadth** trec.
- `git diff --check` fără erori. Un test verifică egalitatea versiunii din HTML, badge, script și `version.json`.
- Versiunea 26.10.03.2316 este confirmată în browserul public. Health arată 8/8 fișiere accesibile și starea cloud neactivată; jurnalul execuțiilor este vizibil; brokerul, graficele și rapoartele se încarcă. Meniul mobil „Mai multe” deschide toate modulele și ajunge la dețineri pe 360 px. Verificările folosesc demo cu date fictive, fără autentificarea unui cont broker real.
- Publicarea GitHub Pages și fluxul Breadth au încheiat cu succes. Nu au fost observate erori ale aplicației în consola verificată; erorile extensiei browserului au fost excluse explicit.

Aceste verificări nu certifică profitabilitatea, execuția unei intrări live, convenția fiscală a brokerului sau securitatea absolută a aplicației.

## Probleme deschise, ordonate după impact

1. **P1 — Bugetul real de risc.** Jurnalul manual, fills broker și Shadow sunt registre diferite. Governor nu trebuie tratat ca buget verificat al contului Invest. Integrarea cere asociere și deduplicare, nu însumarea registrelor. Expunerea, cash-ul și P&L pe monede trebuie reconciliate înainte de calcul.
2. **P1 — Identitatea contului și a instrumentului.** Scope-ul derivă din cheia API. Rotația cheii nu identifică sigur același cont. Sunt necesare o identitate stabilă verificată și o asociere explicită broker/ISIN/simbol/listare/monedă.
3. **P1 — Surse calendar/FX/intraday.** O serie EOD validă nu certifică un trigger live. Calendarul de sărbători/half-days, conversia FX și quote/volum intraday necesită surse și contracte separate; datele lipsă nu sunt completate automat.
4. **P1 — Izolarea credențialelor.** IndexedDB și cheia AES aparțin originii GitHub Pages, pe care există și pagini vechi. Ascunderea legăturilor nu izolează originea. Pentru protecție mai puternică, conexiunea broker trebuie izolată prin origine/serviciu și politici de script adecvate. Nu se promite protecție împotriva unui cod compromis de aceeași origine.
5. **P2 — Istoric și costuri.** Convenția tuturor costurilor/FX din Workerul publicat nu a fost verificată cu cont real. Transferurile, spliturile, pozițiile vechi și istoricul disponibil doar parțial pot împiedica reconcilierea FIFO. Câmpurile brute, gross, cash difference și net fiscal trebuie să rămână distincte.
6. **P2 — Întreținere și performanță.** Logică inline în pagini mari, randări complete, stări distribuite și cuplarea scanării cu deploy-ul. Nu există încă o măsurare de performanță pe un portofoliu real mare.
7. **P2 — Calibrarea scorurilor.** Scorurile sunt descriptive. Pragul vizual de cinci trades nu este un eșantion robust pentru afirmarea unui edge. Sunt necesare rezultate pe regim, costuri, intervale de incertitudine și validare în afara eșantionului.
8. **P2 — Sincronizare la final.** Înainte de activare: revocarea tuturor dispozitivelor, restaurare server verificată, conflicte de chei și test efectiv PC–telefon. Configurația cloud rămâne dezactivată.

9. **P1 — Scanare Breadth la deschidere.** Verificarea interfeței publicate și `app/breadth-daily-config.json` confirmă că declanșarea completă la deschidere este dezactivată (`enabled:false`, endpoint gol). Raportul EOD se încarcă și joburile GitHub îl actualizează; acestea nu echivalează cu rularea completă, o dată pe zi, la deschiderea aplicației. Lipsesc activarea/configurarea releului de declanșare. Nu s-a cerut un token utilizatorului și nu a fost introdus un token în frontend.
10. **P2 — Coerență vizuală între module.** Jurnalul afișează încă badge-uri interne `tt-v854`, inclusiv unul duplicat, deși badge-ul aplicației este actual. Stilul și densitatea jurnalului trebuie aliniate cu deținerile, păstrând funcțiile și datele.

## Idei noi și criterii de acceptare

| Ordine | Îmbunătățire | Ce ar trebui să poată verifica utilizatorul |
|---|---|---|
| 1 | **Centru de reconciliere a contului**: comparație între pozițiile broker, loturile jurnalului, cash și registrele manuale | Diferență de cantitate explicată pe ticker; transfer/split/istoric lipsă separat; fără alertă „tot sincronizat” când există diferențe |
| 2 | **Buget de risc în moneda contului** alimentat numai din surse reconciliate | Risc utilizat/disponibil, acoperire a pozițiilor, scenariu de gap, limite personale și motivul exact al blocării unui plan |
| 3 | **Fișă unică a datelor fiecărei dețineri**, accesibilă din ticker | Listare/ISIN, moneda prețului, sursa și data EOD, ultima citire broker, benchmark aliniat și evenimente verificate; un conflict devine vizibil imediat |
| 4 | **Raport „Ce s-a schimbat cu adevărat”** cu diferențe materiale | Numai schimbări față de observația anterioară: cantitate, regim confirmat, teză, calendar și stop. Actualizările identice nu produc alerte noi |
| 5 | **Istoric de decizie înainte/după**, cu repere înghețate la salvare | Utilizatorul poate compara planul original cu rezultatul, fără ca indicatorii recalculați ulterior să rescrie motivul deciziei |
| 6 | **Prioritate de revizuire cu termen**, nu mai multe notificări identice | Coada arată cauza, gravitatea, sursa și următoarea dată de revizuire. „Am văzut”, amânare și rezolvare au efect clar asupra alertelor |
| 7 | **Randare numai pentru deținerea selectată și actualizări pe diferențe** | Schimbarea între 100 de dețineri păstrează drafturile, focusul și scroll-ul; timpul se măsoară înainte/după pe același set de date |
| 8 | **Raport săptămânal de proces**, separat de profitul de piață | Respectarea stopului/planului, expunerea, sursele neverificate și tipurile de greșeli; randamentul contului exclude depuneri/retrageri numai când acestea sunt acoperite |
| 9 | **Release cu rollback și verificare publică automată** | UI se publică independent de scan, badge-ul este verificat după deploy, iar revenirea păstrează jurnalul și setările |
| 10 | **Sincronizare PC–telefon**, după stabilizarea registrelor | Același cont, aceleași planuri și ipoteze; conflict simulat și restaurare demonstrate pe două dispozitive, cu revocare disponibilă |

Direcția recomandată este reconcilierea contului și bugetul de risc real. Mai mulți indicatori sau predicții nu rezolvă diferențele dintre registre și monede. Layout-ul compact actual poate rămâne baza acestor îmbunătățiri.
