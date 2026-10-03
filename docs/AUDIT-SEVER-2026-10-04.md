# Audit sever — Trading Tools — 4 octombrie 2026

Verdict: aplicația are funcții utile de analiză și registre păstrate separat, dar bugetul real al contului Invest nu este încă reconciliat. Un verdict verde în Governor nu certifică expunerea brokerului. Problemele de pierdere de istoric și de matematică financiară găsite în această rundă au primit corecții și teste; activarea cloud rămâne amânată.

Versiune livrată: **26.10.04.0113**. Auditul examinează versiunea din Git, regulile executabile și interfața publicată. „Reparat” înseamnă corecție demonstrată în scenariile de regresie descrise. Nu certifică securitatea absolută, profitabilitatea sau comportamentul unui cont autentic la care browserul de audit nu are acces.

## Defecte confirmate și corectate

| Gravitate | Defect reprodus | Corecție |
|---|---|---|
| P0 — istoric | Desk tăia registrul la 30 de planuri; drafturile Setup la 100. Salvarea ulterioară elimina rânduri mai vechi | Registrele se păstrează integral. Coada are „Mai multe planuri” și export JSON al întregului registru |
| P0 — migrare | Tracker putea goli sursa fără Journal, după import respins sau suprascrie arhiva anterioară | Arhivă cumulativă înainte de import; rândurile respinse rămân în sursă. Flag de finalizare numai după import complet |
| P1 — sizing | Media intervalului de intrare subestima pierderea la capătul superior | Sizing la intrarea maximă, stop sub întregul interval, țintă deasupra lui; verificare comună pentru UI și salvare |
| P1 — capital | Setup Builder dimensiona numai după stop; poziția putea depăși capitalul. Prefill creștea o fracție la minimum o unitate | Limită atât după risc, cât și după capital; rotunjire în jos. Prefill păstrează cantitatea calculată |
| P1 — buget | Simulările deschise nu rezervau risc/capital. Trigger accepta plan vechi sau risc inițial prea mare pentru verdictul nou | Expunerea Shadow reduce sizing-ul; trigger cere candidat actual, niveluri și interval compatibile, buget curent și loc disponibil |
| P1 — indicator | Media variațiilor dintre închideri era etichetată ATR | ATR Wilder din OHLC verificate. Seriile doar cu închideri nu primesc ATR; dimensionarea cere monedă USD și sesiune EOD verificabile |
| P1 — jurnal | Exit/stop/fees malformate puteau deveni câmpuri lipsă; stop negativ, țintă greșită, date viitoare și stare contradictorie puteau fi acceptate | Validare înainte de conversie, normalizare la update, verificarea direcției nivelurilor și a cronologiei. P&L invalid rămâne necalculabil |
| P1 — Governor | P&L zilnic urmărea și data deschiderii; săptămâna putea include profit din viitor. Configurațiile invalide nu erau respinse | P&L realizat după data închiderii; fereastră săptămânală limitată până la prezent. Trade-uri noi numărate la deschidere. Configurație/jurnal neverificate → HALTED |
| P1 — persistență | Tracker/syncPlan puteau raporta succes după eșecul salvării. Un observer care arunca eroare putea raporta jurnal salvat ca eșuat | Rezultatul persistenței este verificat; notificarea UI are loc separat, după scriere |
| P1 — teze | Salvarea unei teze folosea copia din memorie și putea suprascrie alte note sau un registru ilizibil | Citire și verificare înainte de scriere; conturile sunt păstrate. Editare concurentă a aceleiași teze produce conflict explicit. Eșecul stocării păstrează nota inițială |
| P1 — interacțiune | O salvare aflată în coadă putea folosi simbolul/capitalul sau prețurile editate după click | Comanda capturează valorile la apăsare; controalele sunt dezactivate până la terminare. Test de regresie pentru salvare amânată |
| P1 — rezultate | Închiderea Shadow folosea intrarea planificată, fără costuri, și admitea tranzitii repetate | Intrare simulată explicită, costuri USD, tranziții validate și recomputarea rezultatului. Rezultatele contradictorii sunt excluse, rândurile rămân păstrate |
| P2 — interpretare | Simulările erau numite „LIVE”; cinci rezultate puteau afișa „edge pozitiv” | Etichete pentru simulări, rezultate descriptive și explicații privind acoperirea |
| P2 — mobil/accesibilitate | Coada era un tabel de peste 1000 px; ticketul avea dialog improvizat și probleme de spațiu vertical | Carduri pe telefon, controale de 44 px, dialog nativ, scroll în ticket și focus returnat la închidere |
| P2 — publicare | Fiecare schimbare UI pornea un scan Breadth complet | Push-urile UI păstrează verificările și deploy-ul, dar nu pornesc scanul complet; cronul și declanșarea manuală îl păstrează |

Registrele vechi deteriorate nu sunt șterse și nu sunt inventate valori pentru a le „repara”. Unele pot deveni NEVERIFICAT și pot bloca risc nou până la corectarea datelor. Corecțiile nu reconstruiesc automat rândurile eliminate de versiuni anterioare; eventualele copii/arhive trebuie restaurate separat.

## Audit pe toate direcțiile

| Direcție | Concluzie severă | Prioritate rămasă |
|---|---|---|
| Date de piață | EOD și prospețimea sunt verificate conservator; provider neconfirmat sau lipsă de date blochează sizing-ul | P1: calendar complet de burse, sărbători/half-days, corporate actions și cotații intraday cu identitate verificată |
| Risc financiar | Journal, Desk Shadow și fills T212 sunt registre distincte. Limitarea internă a Shadow nu reprezintă cash disponibil la broker | P1: reconcilierea pozițiilor, loturilor și fluxurilor înainte de bugetul real de risc în moneda contului |
| Trading 212 | Clientul și releul au teste pentru GET-only, autorizare, CORS, paginare, timeout și schimbare de cont | P1: identitate stabilă de cont independentă de rotația cheii; test autentic al costurilor și FX pe Workerul publicat |
| Securitate | Cheia broker este criptată local, dar codul care rulează pe aceeași origine o poate accesa prin aplicație | P1: izolare de origine și politici de script. Pagini vechi ascunse în navigare nu creează o graniță de securitate |
| Confidențialitate | Demo-ul folosește memorie separată, fără modificarea jurnalului, cheilor sau planurilor reale | P2: furnizorii de date și exporturile personale necesită controale de minimizare și retenție; auditul nu inspectează istoricul integral de secrete |
| Salvare și concurență | Se păstrează arhivele, se resping registrele malformate și se verifică erorile de scriere | P1: backup restaurabil și tranzacții comune. Web Locks protejează planurile când browserul le oferă; fallback-ul localStorage nu garantează atomicitate între toate taburile |
| UI/UX | Coada mobilă și stările de blocare devin mai clare; deținerile compacte și drafturile existente sunt păstrate | P2: stil unitar în Journal/Desk și eliminarea badge-urilor interne vechi; review accesibilitate complet cu cititor de ecran |
| Performanță | Coada randată este limitată fără pierderea registrului; solicitările broker au limite și anulare | P2: randare doar pentru deținerea selectată, măsurată pe 100+ poziții, și retenție explicită pentru istoricul personal acumulat |
| PWA | Shell-ul, badge/update și accesul online au verificări automate | P2: verificare pe telefon fizic pentru instalare, suspendare, reluare, quota și tastatură virtuală. Browserul suspendat nu execută autosync |
| Rapoarte și modele | Scorurile sunt descriptive; rezultatele Shadow sunt verificate matematic, dar rămân simulări | P1: costuri/slippage, rezultate pe regim, intervale de incertitudine și validare în afara eșantionului; cinci trades nu dovedesc edge |
| Market Breadth | Joburile programate actualizează EOD; declanșarea completă la deschidere este încă `enabled:false`, fără endpoint | P1: configurarea releului de scan. Încărcarea raportului la deschidere nu echivalează cu rularea scanului complet |
| PC–telefon | Modelul de conflicte/backup are teste; configurația online rămâne dezactivată | P1 înainte de activare: restaurare server, revocare dispozitive, conflict și identitate de cont demonstrate pe două dispozitive |
| Mentenanță | Calculul planurilor și salvarea tezelor sunt extrase în module testabile | P2: separarea logicii inline și contracte de date versionate; scanul și deploy-ul împart încă aceeași coadă de workflow |

## Dovezi de verificare

- Cele **11 scenarii noi pentru Journal/Governor/Tracker au eșuat pe codul inițial**, apoi au trecut după corecții. Cazurile includ pierdere de sursă, date viitoare, costuri malformate, stare contradictorie și salvare eșuată.
- **432 teste Node/JavaScript trec** în runda completă, inclusiv 36 de teste noi pentru integritatea financiară, planuri, dimensionare și teze.
- **7 teste Market Breadth trec**. **8 teste ale suitei Breadth și 22 verificări core trec**. Verificarea publică este consemnată după publicare.
- Demo-ul utilizează chiar pagina Desk, cu FICTIV-A/FICTIV-B și storage în memorie. Are variante desktop și 360 px; nu scrie date simulate în registrele utilizatorului.

## Idei prioritizate, cu criterii de acceptare

1. **Centru de reconciliere Invest.** Pentru fiecare ticker: cantitate broker vs loturi FIFO, diferență explicată, transfer/split/istoric lipsă separat. Verde numai după acoperire verificată.
2. **Buget real de risc.** Moneda contului, poziții acoperite/neacoperite, stop și scenariu de gap, cash și limite personale. Un stop lipsă nu devine risc zero.
3. **Fișă de identitate și date.** Broker/ISIN/listare/monedă, data EOD, ultima citire broker, benchmark și evenimente verificate într-un singur loc.
4. **Istoric al deciziilor cu versiuni.** Plan original, modificări motivate, revizuire scadentă și rezultat separate. O modificare de stop nu rescrie riscul inițial.
5. **Backup verificabil și restaurare selectivă.** Export separat pe registre, manifest cu număr de rânduri/versiuni, import preview și detectarea duplicatelor. Restaurarea păstrează arhiva și poate fi anulată.
6. **Raport de proces pe regim.** Respectarea planului, abaterea de la intrare, costuri, modificări de stop și rata de acoperire. Randamentul ajustat la depuneri numai cu evaluări suficiente.
7. **Revizuire prioritară, fără zgomot.** Cauză, sursă, gravitate, termen, amânare și rezolvare; aceeași condiție nu generează continuu alerte noi.
8. **Sincronizare PC–telefon la final.** Activare după reconciliere și demonstrarea conflictelor/restore/revocării, conform ordinii alese de utilizator.

Aplicație: https://mferent80-source.github.io/premarket_scanner.html/app/

Demo desktop/mobil: https://mferent80-source.github.io/premarket_scanner.html/tools/plans-audit-demo.html
