# Monitorizarea modelelor pe portofoliu

În **Analiza deținerilor → Rapoarte**, monitorul proiectează registrele locale ale deținerilor actuale. Nu citește contul brokerului și nu include valoarea poziției, cantități, sold, chei API sau identificatorul contului în export.

## Utilizare

- Alege unul dintre cele cinci modele și filtrează starea, tickerul sau ordinea. Numărătorile rezultatelor și verificărilor restante privesc modelul ales, pe toate deținerile; filtrele schimbă numai lista vizibilă. Filtrul **Verificare restantă** include și instrumentele care au simultan un semnal de revizuire sau o eroare de rețea.
- **Vezi registrul** deschide instrumentul exact în **Modele AI → Predicții vs. realitate**. Dacă filtrele listei deținerilor îl ascund, se resetează filtrele. Notele și planurile nu sunt reconstruite.
- **Verifică portofoliul** procesează toate registrele eligibile în serie, inclusiv cele ascunse de filtre. Rămâne disponibil și dacă modelul selectat nu are estimări, dar alte modele au registre. Oprirea anulează cererile următoare; cererea în curs poate termina. Verificările individuale deja pornite sunt omise, fără cereri duplicate.
- Deschiderea filei Rapoarte solicită verificarea automată. Modulul individual limitează încercările la una per instrument și EOD așteptat în vizita curentă; butonul permite reîncercarea. EOD-ul este stabilit din programul bursei salvat în registru, chiar dacă analiza curentă este veche sau lipsește. Nu rulează când aplicația este închisă.
- **Exportă raportul** exportă toate deținerile și rezultatele celor cinci modele, fără observațiile brute, filtrele text introduse sau informații private despre cont. Data generării este distinctă de EOD-ul fiecărui instrument.

## Interpretare

Rezultatele rămân separate pe instrument și model. Nu există acuratețe, scor de încredere sau probabilitate de câștig pentru întregul portofoliu. Orizonturile de acțiuni diferite pot fi corelate și nu sunt cumulate drept observații independente.

- Fără estimări: modelul ales nu are înregistrări eligibile.
- În așteptare: există estimări, dar nu încă rezultate finalizate la +5 sesiuni.
- Verificare restantă: există o sesiune EOD așteptată mai nouă decât cea a ultimei verificări. Raportul istoric și predicțiile originale se păstrează. Pentru o estimare încă neverificată se compară sesiunea de origine cu EOD-ul așteptat; o estimare din EOD-ul curent rămâne normal în așteptare.
- Eșantion mic: mai puțin de 20 orizonturi separate finalizate.
- De revizuit: rezultate neverificabile, lipsa avantajului față de reper, acoperire slabă, degradare descriptivă, anomalie Isolation sau context HMM neconcludent.
- Date de verificat: identitate sau registru incompatibil, ori ultima cerere eșuată. Un eșec de rețea păstrează rezultatele istorice și le marchează separat.
- Context descriptiv: HMM și Isolation nu dobândesc acuratețe predictivă.
- Monitorizare: suficiente observații pentru pragurile descriptive și nicio regulă declanșată. Nu confirmă profitabilitatea sau validitatea statistică.

Pragurile și protocolul rămân în [HOLDINGS-FORECAST.md](HOLDINGS-FORECAST.md). Moneda instrumentului se verifică separat de moneda portofelului; moneda portofelului nu completează o identitate lipsă. Schimbarea contului oprește coada precedentă, iar schimbarea listingului, monedei sau eliminarea unei poziții împiedică cererile cu identitate depășită.

**EOD așteptat** este sesiunea încheiată stabilită din fusul și ora închiderii bursei, cu marja de 15 minute a protocolului existent. **EOD verificat** este cea mai veche sesiune a ultimelor verificări păstrate pentru modelul selectat. Acestea sunt distincte de EOD-ul analizei curente și de data ultimei estimări. Recalcularea la deschiderea raportului funcționează și după reîncărcare, fără a depinde de starea temporară a cererilor. Weekendul și o sesiune încă neîncheiată nu creează restanțe noi. Calendarul complet al sărbătorilor nu este implementat; o verificare nereușită păstrează raportul istoric și regulile de excludere existente.

## Demo și verificare

`tools/holdings-forecast-monitor-demo.html` oferă Desktop și Telefon, cu trei dețineri fictive și 24 orizonturi ilustrative per model și instrument. Registrele demo sunt în memorie și nu scriu în stocarea contului real. Reîncărcarea simulării nu dublează estimările.

Testele acoperă separarea rezultatelor, identități incompatibile, observații în așteptare, coruperea registrelor, filtre, export, coadă în serie, oprire, schimbarea contului, eliminarea/redenumirea pozițiilor, monedă listing vs. portofel și navigarea către instrumentul filtrat. Suita completă: `node --test tools/*.test.mjs tools/*.test.cjs`.

Datele rămân locale pe acest dispozitiv. Sincronizarea PC–telefon este o etapă separată. Registrele pozițiilor vândute sunt păstrate, dar nu intră în lista deținerilor actuale.
