# Verdict comun, trend și explicație AI

Toate cele 13 destinații din meniul aplicației (11 documente, inclusiv cele trei taburi Jurnal) au un rezumat cu verdict, dovezi și verificările următoare.

În Desk, Long & Reversal, Europa, Breadth și Analiza deținerilor, concluzia și următorul pas sunt vizibile înainte de detalii. Verdictul distinge evaluarea trendului de permisiunea de a construi un plan: un trend ascendent poate rămâne în monitorizare sau poate avea risc blocat. Reperele de plan folosesc numai nivelurile calculate, iar un nivel de confirmare structurală este etichetat astfel numai când scannerul îl furnizează. Invalidarea și depășirea zonei de intrare sunt explicate separat. Lipsa selecției, lipsa datelor, o scanare expirată și filtrele fără rezultate au explicații distincte.

Desk păstrează candidatul de monitorizare cu scorul cel mai mare când nu există candidați confirmabili; tickerul solicitat explicit nu este înlocuit. Selectarea unui rând actualizează imediat verdictul și permisiunea butonului de plan. Analiza deținerilor oferă acces direct la fluxul existent pentru cele șase modele. Acțiunile de reanaliză folosesc comenzile native ale paginilor.

`lib/decision-verdict.js` separă datele sursă, structura tehnică, permisiunea de risc și modelele AI. EMA21 și EMA50 includ panta pe cinci sesiuni; EMA200 este necunoscută când istoricul este insuficient. Ora scanării nu înlocuiește sesiunea încheiată a bursei. Cache-urile fără trend calculat cu politica actuală cer reanalizare.

Pentru o intrare, datele sunt verificate în sesiunea corectă, analiza are maximum treizeci de minute, Governor permite risc, setup-ul este confirmat și nivelurile oferă cel puțin 2R la limita superioară a intrării. Long cere trend scurt și mediu aliniat, RS verificat și volum cel puțin la media precedentelor sesiuni. Extensia peste două ATR, datele lipsă și contradicțiile mențin candidatul în monitorizare. Reversal early nu permite plan. Ținta US de 2R este calculată, nu o rezistență confirmată.

EU păstrează planul structural, rezistența și calculatorul în moneda instrumentului. Un plan nativ confirmat poate fi evaluat pe pagina Europa; prețurile EUR, GBP sau CHF nu intră în bugetul USD din Desk. Calendarul necunoscut cere verificare, iar raportarea în următoarea zi blochează planul din verdictul comun.

Cele șase modele din Analiza deținerilor păstrează validările existente. Un rezumat poate fi reutilizat între pagini numai cu aceeași identitate, monedă, sesiune, tip de date și aceleași ultime șaizeci de bare OHLCV. Rezumatele sunt păstrate doar în memoria sesiunii și expiră după treizeci de minute. Istoricul complet rămâne verificat de motorul original al modelelor; semnătura scurtă permite asocierea rapoartelor provenite din ferestre de istoric diferite. Modelele pot fi corelate. Acoperirea și scorul tehnic nu sunt probabilități ale profitului.

Explicația Anthropic este opțională și pornește numai după apăsarea explicită a butonului de trimitere. Payload-ul conține numai simbolul, indicatorii publici, sesiunea, codul verdictului și dovezile permise. Nu conține sold, cantitate, registru, note, limite financiare personale sau credențiale Trading 212. API-ul folosește cheia Anthropic configurată pe dispozitiv și modelul existent, cu opțiune de schimbare. Nu sincronizează cheia externă și nu trimite automat date la navigare.

Breadth permite explicația fără un simbol individual când raportul public este utilizabil. Trimite numai dovezile permise despre participare, trend, sectoare și sesiune; paginile de cont nu primesc această excepție. Lipsa cheii API și lipsa unui raport local compatibil sunt afișate în afara detaliilor. Verdictul tehnic funcționează fără apelul extern.

Răspunsul trebuie să fie JSON complet, să păstreze identificatorul snapshot-ului și codul verdictului și să citeze numai dovezi și pași existenți. Proza nu acceptă cifre, prețuri sau URL-uri noi. Răspunsurile trunchiate și cele pentru un context schimbat sunt respinse; schimbarea instrumentului sau închiderea paginii anulează cererea. Explicația este etichetată separat și nu modifică rezultatul determinist.

Breadth oferă context de piață, deținerile cer revizuirea tezei, Shadow raportează simulări descriptive, iar paginile broker, cloud și status raportează starea propriilor date. Niciuna dintre aceste evaluări nu generează automat ordine.

Validare: `node --test tools/*.test.mjs tools/*.test.cjs`. Testele noi acoperă surse vechi și viitoare, alinierea trendului, riscul, zona de intrare, moneda, compatibilitatea modelelor, datele excluse din payload, răspunsurile API incomplete, păstrarea formularului AI și anularea rezultatelor pentru alt instrument. Apelurile Anthropic sunt simulate în teste; verificarea unei chei reale și a unui răspuns real necesită un apel explicit în aplicație.
