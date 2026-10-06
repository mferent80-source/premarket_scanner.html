# Strategia AI simulată

`holdings-strategy-v1` urmărește decizii noi, nu reconstruiește tranzacții din teste istorice. Este disponibilă în Analiza deținerilor → Modele AI → Strategie simulată și în Shadow Book. Nu trimite ordine și nu utilizează soldul sau cantitatea deținerii.

Secțiunea separată [Risc în cont](ai-account-risk.md) verifică estimativ suplimentarea de 1.000 USD față de snapshot-ul Invest, stopurile manuale și limitele utilizatorului. Păstrează prima verificare la deciziile noi și afișează separat datele citite acum. Această verificare nu modifică politica fixă sau rezultatele simulării.

Captura pornește numai după salvarea unei estimări originale a Verdictului final, cu 6/6 rapoarte actuale verificate. Reanalizarea aceleiași sesiuni, restaurarea unui registru și schimbarea costurilor nu adaugă o decizie retrospectivă. Rămâne în vigoare cutoff-ul conservator al registrului predicțiilor: după începutul următoarei zile lucrătoare în fusul bursei, o estimare nouă pentru EOD-ul anterior este refuzată. O strategie se fixează în cel mult 60 de secunde de la captură, înaintea deschiderii utilizate ca intrare.

Regula inițială, pentru instrumente USD / New York / închidere regulată la 16:00:

- Verdict cu direcție pozitivă: cumpărare simulată la următoarea deschidere zilnică. Verdict negativ, mixt sau fără direcție: fără poziție, dar decizia rămâne în registru.
- Alocare ipotetică fixă de 1.000 USD, unități fracționare, fără compunere. ATR absolut = închiderea inițială × ATR procentual inițial.
- Stop la deschiderea de intrare minus 1 ATR; țintă la deschidere plus 2 ATR. În lipsa unui nivel atins, ieșire la închiderea celei de-a cincea sesiuni.
- Gap sub stop: deschiderea mai nefavorabilă. Gap peste țintă: ținta, conservator. Stop și țintă în aceeași bară: stop primul, cu ambiguitatea afișată.
- Rezultatul intră în comparație numai după toate cele 5 sesiuni, inclusiv dacă poziția ar fi ieșit mai devreme.

Costul procentual pe fiecare sens este jumătate din spreadul complet + slippage + comision + FX, aplicat valorii intrării și ieșirii. Valorile implicite (spread 0,10%, slippage 0,05%, comision/FX zero) sunt ipoteze neconfirmate, nu tarife ale brokerului. Nu sunt modelate comisioane fixe/minime, taxe, finanțare, dividende sau lichiditate intraday. Setările sunt pe cont, instrument, monedă și tipul datelor. Modificările se aplică deciziilor viitoare, cu politici distincte în raport.

Reperul pasiv folosește aceeași intrare, aceeași alocare și aceleași costuri, cu ieșire la închiderea sesiunii 5. Abținerile au zero în strategie și păstrează acest reper. Totalurile principale selectează cronologic orizonturi care nu se ating și nu se suprapun, separat pe instrument și politică. Curba este suma rezultatelor în USD, nu un randament compus sau un portofoliu finanțat. Scăderea maximă se referă la această curbă.

Verificarea reutilizează sursa OHLC a registrului Predicții vs. realitate, fără altă cerere de cotații. Rulează cât timp pagina deținerilor este vizibilă și la cerere. Shadow citește rezultatele păstrate; nu verifică autonom cotațiile. Pentru o deținere eliminată, istoricul rămâne vizibil în Shadow, dar verificarea automată din pagina deținerilor se oprește. Acest registru nu este sincronizat în cloud sau inclus în restaurarea registrului predicțiilor; are export JSON propriu.

Revizuirea închiderii de origine, a traseului OHLC sau a verdictului original exclude rezultatul și păstrează prima copie. O sursă neactuală, altă monedă/listare, sesiuni neîncheiate, goluri mari și salturi peste 25% blochează verificarea. Calendarul folosește convenția conservatoare existentă a zilelor lucrătoare; unele sărbători pot amâna verificarea. Ajustările mici și barele omise pot rămâne nedetectate.

Registrul și directorul instrumentelor folosesc aceeași bază IndexedDB ca predicțiile, într-o tranzacție comună. Copiile vechi rămân păstrate. Conflictele între pagini reunesc deciziile și păstrează prima politică pe origine. O tranzacție nereușită este marcată ca disponibilă numai în sesiune și permite exportul. Exportul nu include identificatorul contului, cantități reale sau chei API.

Exemplul din `tools/holdings-strategy-demo.html` folosește 12 verdicte inventate și prețuri fictive, prin același cod de captură și verificare. Nu este performanța modelelor antrenate. Profitul simulat sau validarea probabilităților nu certifică pregătirea pentru bani reali.
