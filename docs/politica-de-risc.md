# Politica de risc — Decision App (Trading Tools)

**Versiunea 2 · 27.10.2026** (v1: 20.10.2026, I-728; v2: lotul 2 al auditului din 27.10 — „Oprește tot”, reconcilierea, override-ul guvernat, controalele pre-ordin, gărzile Planurilor, tiparele de comportament). Documentul unic al pragurilor de risc din aplicație: ce limitează fiecare, de ce are valoarea pe care o are,
cine o poate schimba și cum rămâne scrisă schimbarea. Până acum pragurile stăteau în patru locuri (codul Governor, filtrul de piață, protocoalele
probelor, căldura portofoliului); de aici încolo acest fișier e referința, iar codul o aplică. Orice schimbare de prag se face **întâi aici**, apoi în
cod, cu un rând în „Istoricul schimbărilor” de mai jos.

## 1. Principii

1. **Regula scrisă dinainte leagă.** O limită care doar avertizează nu e o limită: Governor dă `HALTED` (fără planuri noi) sau `CAUTION` (risc redus),
   iar Planuri și Drafturi moștenesc verdictul. Nicio limită nu trimite ordine la broker — aplicația oprește *intrările noi*, nu lichidează.
2. **Închis la eroare.** Ce nu se poate verifica (cont nesincronizat, calendar de rezultate necitit, stop fără monedă, curs lipsă) blochează, nu trece.
3. **Pragurile sunt prudente, nu optime.** Niciunul nu e un avantaj dovedit; sunt alegeri de supraviețuire. Se judecă față de propriile rezultate
   (§ 4) și se revizuiesc la termen (§ 5), nu „pe moment”.
4. **Două surse peste una.** Prețul contului față de a doua sursă (Yahoo), stopul documentat față de ordinul de la broker, pierderea realizată față
   de cea la valoarea de piață: când sursele nu se potrivesc, aplicația o spune, nu alege tăcut.

### Completări 27.10.2026

„Nicio limită nu trimite ordine la broker” rămâne adevărat: **nicio limită automată** nu pune, nu anulează și nu lichidează. Singura
excepție e **„Oprește tot”**, apăsat de tine, cu două confirmări: anulează ordinele în așteptare din Trading 212. Nu vinde poziții.

- **Proba de ecran după publicare (I-747).** După fiecare publicare cu o versiune nouă, proba de ecran (`tools/proba-ecran-decizie.mjs`, Chrome headless în GitHub Actions) deschide paginile Decision App de două ori; rezultatul stă în `health/generated/proba-ecran.json` și în Health. Roșu ⇒ Discord. Dacă site-ul nu servește versiunea din depozit în 10 minute, proba e **roșie** (nu verde pe versiunea veche).
- **Securitatea sincronizării la vedere (I-748).** Allowlist-ul Google (`GOOGLE_ALLOWED_SUB`) lipsă ⇒ **roșu** în Cont & sincronizare și în Health (orice cont Google ar putea folosi serviciul ca stocare); sesiunile active și ultimul login se văd acolo.
- **Secretele nu stau în cache-ul persistat (I-746).** Copia locală a contului (IndexedDB, `records:<cont>`) nu ține valoarea conexiunii Trading 212 și nici cheia / parola Radarului — doar revizia și ora; valoarea se recitește din cont. Cache-ul se șterge la deconectare și la ștergerea conexiunii.
- **Health doar citește** oprirea de urgență (`tt_governor_oprire_v1`) și reconcilierea cu brokerul (`tt_reconciliere_v1`): o formă necunoscută se spune ca „nu pot verifica”, nu ca verde; re-armarea rămâne doar în formularul Governor, cu motiv.

## 2. Pragurile și motivul fiecăruia

| Prag | Valoarea | Unde se aplică | Ce oprește | Motivul |
|---|---|---|---|---|
| Pierdere maximă pe zi | **2 % din cont** | `GV` (`maxLossPctDay`), `T212Capital` | HALTED la atingere; CAUTION de la 75 % | O zi proastă nu trebuie să devină o săptămână proastă; 2 % lasă 50 de zile ca astea până la −63 %. |
| Pierderea zilei se măsoară | **realizat ȘI la valoarea de piață** (I-722) | `T212Capital.mtm` | bugetul rămas = minimul celor două | Pozițiile deschise care pierd consumă bugetul chiar fără vânzare. |
| Pierdere maximă pe săptămână | **3 % din cont** | `GV` (`maxLossPctWeek`), `T212Capital` | HALTED la atingere; CAUTION de la 75 % | Frâna pe serie: trei zile la limită nu se mai înlănțuie. |
| Limita lunară de pierdere | **suma pusă de tine** în Setările jurnalului (I-692) | `GV.monthlyState` (I-721) | HALTED până pe 1 a lunii următoare; CAUTION de la 75 % sau când rezultatul lunii e necitit / mai vechi de 3 zile | Regula ta, scrisă dinainte, în moneda contului. |
| Scădere maximă de la vârf (DD rolling) | **10 %** | `GV` (`maxDdPctRolling`), curba de capital | HALTED la atingere; CAUTION de la 7,5 % | Peste 10 % revenirea cere > 11 % câștig; se judecă față de dd95 pe blocuri (§ 4). |
| Pierderi consecutive (cooldown) | **3 în 48 h** | `GV` (`cooldownAfterLosses`), `T212Capital` | HALTED cât ține fereastra | Oprește „răzbunarea”; fereastra de 48 h nu lasă frâna activă la nesfârșit. |
| Tranzacții pe zi | **5** | `GV` (`maxTradesDay`) | CAUTION la a 4-a, HALTED la a 5-a (I-733) | Frecvența mare = costuri și decizii obosite. |
| Poziții deschise | **4** (reale + Shadow) | `GV` (`maxOpenPositions`), Planuri | HALTED la atingere | Atenția împărțită la mai multe nume scade calitatea fiecăreia. |
| Risc pe plan | **0,5 % din capital**, **0,25 %** la CAUTION / piață defensivă (breadth) / **Top Long în probă / Early Reversal** (I-742) | Planuri `allowedRisk` (`TTProbaTopLong.cap`) | mărimea poziției | Early Reversal a picat pe istoric (14.10, 19.10: fără avantaj) și nu e în nicio probă în timp ⇒ riscul pe un semnal nedovedit nu mai e dublul celui pe alt semnal nedovedit. Eticheta „în probă · nejudecat” stă lângă stare, în tichet și în plan. Stopul lui se judecă „în umbră” (`docs/reversal-stop-umbra-protocol.md`). Dacă EL alege altfel, decizia se scrie aici cu motivul. |
| Verdictul pieței (robotul zilnic) | favorabil / neutru **×1**; prudent **×0,75**; defensiv **fără plan nou**; lipsă sau > 4 zile **×0,75, fără GO** (I-727) | Drafturi și Planuri, aceeași regulă (`MarketVerdict.regula`) | mărimea sau planul | Regulă de prudență aleasă pe 18.10.2026, nu avantaj dovedit (`docs/setup-filtru-piata.md`). |
| Concentrare pe instrument | **20 % din cont** | `T212Capital` (`maxInstrumentPct`), Planuri | CAUTION; dimensionarea nu depășește | O singură poziție nu mută tot contul. |
| Risc total până la stopuri (reale) | **5 % din cont** | `T212Capital` (`maxTotalStopPct`) | HALTED când bugetul e epuizat | Suma riscurilor deschise are și ea un plafon. |
| Căldura portofoliului | **4 % din cont** (reale + Shadow + planul nou) (I-719) | `TTCaldura`, Planuri | fără plan nou peste plafon; poziție fără stop valabil ⇒ risc necunoscut ⇒ blocat | Riscul necunoscut nu e zero. |
| Corelație | **r ≥ 0,7 pe 90 de zile ⇒ cel mult 2 poziții** în același grup (I-719) | `TTCaldura.grup`, Planuri | fără plan nou pentru a 3-a | Trei nume corelate = un singur pariu. |
| Stopul | **obligatoriu**, pus / schimbat **după deschiderea poziției** (StopSetter.stopValabil); recomandat −5 % sau 2 × ATR(14) între 3 % și 8 % | Astăzi, Portofoliu, Risc & capital | fără stop valabil ⇒ risc necunoscut ⇒ blocat | Un stop de la o poziție veche nu acoperă poziția nouă. |
| Stopul **la broker** (I-723) | ordin STOP de vânzare în așteptare la Trading 212 | Astăzi („doar pe hârtie”), Planuri, pagina contului | avertizare severă; eticheta în căldură | Un stop „în minte” nu execută nimic în lipsa ta. |
| Rezultate financiare | **fereastra de 14 zile** blochează planul; calendar necitit ⇒ blocat | scanner, idee proprie | fără plan | Planul ține zile, ar traversa raportarea. |
| Lichiditate | **ADV ≥ 3 M $** (20 de sesiuni) | scanner, idee proprie (I-733) | fără plan | Sub asta spreadul și alunecarea mănâncă planul. |
| Raport risc / randament | **≥ 1,5 R** la intrarea maximă (țintă ≥ 2 R cerută în analiză) | `TradePlans.size` | fără plan | Cu 58 % stopuri pe regula 1,25 ATR / 2R (măsurat pe 4 ani), sub 1,5 R speranța e negativă. |
| Costul de schimb | **0,3 % dus-întors** când contul nu e în moneda acțiunii | `TradePlans` | intră în riscul pe acțiune | Costul e pierdere sigură, intră în R. |
| Alunecarea la intrare | **media ultimelor 10 intrări ≤ 0,1 R** (I-729) | Raport | avertizare | Separă regula proastă de execuția proastă. |
| Stopul **la broker** pe server (I-749) | fișa zilei numără pozițiile **fără ORDIN de stop întreg** la Trading 212 (ordinele în așteptare citite prin releu, doar GET, o dată pe zi după închiderea NYSE) | `lib/cloud-monitor.mjs` (fișa zilei: inbox + Discord) | „N poziții fără ORDIN de stop la broker”, cu „stop doar pe hârtie” și „ordin doar pentru o parte” numite; ordinele necitite ⇒ motivul + „stopuri documentate, neverificate la broker” | Un stop scris doar în teză nu execută nimic în lipsa ta; alerta trebuie să ajungă și pe telefon, nu doar pe PC. |
| Căldura din fișa zilei | până la **stopul care execută**: ordinul de stop întreg de la broker; altfel stopul documentat valabil; fără niciunul ⇒ **NECUNOSCUTĂ** | `fisaZilei` | nu adună parțial | Închis la eroare: o poziție fără stop face căldura necunoscută, nu mai mică. |
| Definiția stopului pe server | aceeași cu aplicația: `StopSetter.stopValabil` (pus / schimbat după deschiderea poziției de acum, −1 h toleranță) | copie în `lib/cloud-monitor.mjs`, test de echivalență `tools/cloud-monitor-stop.test.mjs` | stopul rămas în teza unei poziții vândute nu mai acoperă poziția nouă nici în alertele de pe server | A treia definiție a stopului (fără `openedAt`) dispare. |
| Zilele fără bursă | fișa zilei doar în zilele de tranzacționare NYSE; în zilele scurte după 13:05 New York | `dupaInchidere` (copia `ExchangeCalendar.markets.US`, testată) | fără fișă de sărbători | O fișă „a zilei” într-o zi fără bursă e zgomot. |
| Doi cititori Trading 212 (I-748) | două aparate cu citiri ale aceluiași cont în ultimele **5 minute** | Setări, Health (cheia sincronizată `tt_t212_cititori_v1`) | avertisment cu aparatele și vechimea | Limita de cereri a brokerului se împarte; regula „un singur cititor” (I-713) devine verificabilă. Toleranța la ceasul decalat între aparate: **15 min**. |
| Collar de preț la ordinul STOP (I-758) | stopul între **0,5 % și 25 % sub prețul de acum** din copia contului; în afara intervalului doar cu **bifa de confirmare** din fereastră | `T212Orders.verifica` (Astăzi, „Pune ordinul în Trading 212”) | ordinul nu pleacă fără bifă; peste preț ⇒ refuz | Sub 0,5 % o oscilație obișnuită execută stopul; peste 25 % e aproape sigur o cifră greșită (controale pre-ordin 15c3-5 / RTS 6 art. 15). |
| Mărimea ordinului STOP (I-758) | **cantitatea ≤ poziția** din copia contului de pe acest aparat | `T212Orders.verifica` | refuz înainte de POST | Nu se poate vinde ce nu deții; releul verifică din nou la broker (cantitatea disponibilă). |
| Dublura ordinului STOP (I-758) | **același ordin** (acțiune + cantitate + stop) plecat de pe acest aparat în ultimele **2 minute** (jurnalul local `tt_t212_ordine_trimise_v1`, 24 h) **sau** un ordin STOP de vânzare deja în copia ordinelor | `T212Orders.verifica`, `pune()` | refuz înainte de POST; un refuz ferm al releului șterge notarea, un timeout o păstrează | Timeout + reîncercare nu mai pot trimite de două ori; copia necitită nu blochează (releul verifică la broker) și se spune în fereastră. |
| Concentrare pe instrument (audit B 🟡 [6]) | **limita din Governor** `tt_governor_cfg_v1.maxInstrumentPct` (implicit **20 %**; invalidă ⇒ 20 %), aceeași pe toate paginile — o singură citire, `HoldingsConcentrare.prag`, păzită la echivalență cu `Governor.cfg()` | Astăzi („Ce necesită atenție”), Portofoliu (Control, riscul portofoliului, cardul poziției), T212Capital (prin cfg) | alertă / prioritate de revizuire, nu blocare (blocarea rămâne în Governor / capital) | Înainte: 25 % pe Astăzi, 20 % fix în Portofoliu ⇒ aceeași poziție era „concentrată” într-o pagină și nu în cealaltă. |
| Gardă obligatorie la trimitere (I-758) | `pune()` refuză fără `garda` (poziția + copia ordinelor + jurnalul) | `T212Orders.pune` | nimic nu pleacă fără controale | Închis la eroare: un apel care sare peste verificări nu trimite. |
| Corelație neverificată (I-753) | o poziție deschisă fără serie zilnică citită ⇒ **„corelație neverificată cu X” + riscul planului ×0,75** | `TTCaldura.evalueazaGrup` (`MULT_NEVERIFICAT`), Planuri | mărimea; eroarea la calcul ⇒ **fără plan nou**, reîncercat după 30 s; seria simbolului NOU lipsă cu ≥ 2 poziții ⇒ blocat (ca înainte) | O pereche care nu se poate verifica nu mai trece tăcut ca „necorelată”. Se înmulțește cu ×0,75 al pieței (ex. 0,25 % × 0,75 × 0,75 = 0,14 %). |
| Modulele-gardă (I-753) | **verdictul pieței** (`lib/market-verdict.js`), **căldura și corelația** (`lib/caldura-portofoliu.js`), **prețul de acum** (`lib/pret-viu.js`) declarate în Planuri (`GARZI`) | Planuri, `garziComune` | lipsa unuia (404, cache vechi, eroare de sintaxă) ⇒ **tichetul blocat** cu numele modulului | O gardă care nu s-a încărcat dispărea tăcut din drum. Proba Top Long are deja rezerva ei (plafonul rămâne fără modul); ideea proprie își verifică singură calculatorul. Demo-ul fictiv nu le cere. |
| Prețul de acum sub stop (I-752) | **SUB stop ⇒ salvarea refuzată** și pentru candidatul scannerului (înainte: doar text) | Planuri `ticketSizing` (`TTPretViu.verifica`) | fără plan | Un plan al cărui stop e deja depășit nu mai e valabil. |
| ADV necunoscut (I-752) | sub 20 de sesiuni încheiate cu volum sau volum lipsă ⇒ **fără plan** la ideea proprie | `TTIdeeProprie.pregateste` | fără plan | Lichiditatea care nu se poate măsura nu e „trece”. ATR-ul și ADV-ul se calculează pe sesiuni ÎNCHEIATE (`DailySeries.read`), ca scannerul; seria fără identitate ⇒ seria brută, cu nota la vedere. |
| Expirarea planului (I-752) | un plan **PLANNED** neexecutat expiră la a **2 sesiuni** SUA după ziua creării (calendarul SUA când e încărcat, altfel zile lucrătoare) | `TradePlans.expira` / `expirat`, Planuri | anulat cu motivul („expirat: 2 sesiuni fără SIMULEAZĂ…”); expirat ⇒ fără SIMULEAZĂ și fără RESTABILEȘTE | Stopul 1,25 ATR și zona de intrare se recalculează zilnic din scanare; planul vechi nu mai corespunde. Două sesiuni lasă ziua creării și pe următoarea pentru intrare. |
| SIMULEAZĂ (I-752) | **aceleași gărzi ca la salvare** (`garziComune`: oprirea, modulele, Governor, piața, pozițiile, contul, bugetele, căldura, corelația) pe registrul fără planul simulat | Planuri, butonul SIMULEAZĂ | refuzat cu motivul dacă mărimea planului nu mai încape | Un plan salvat dimineața nu se mai declanșează după-amiaza peste o căldură sau o corelație schimbată între timp. |
| Oprirea de urgență | `tt_governor_oprire_v1` cu `activ:true` (scris de butonul „Oprește tot”, lotul E) | Planuri (citire): Guardrail „OPRIT”, tichet, SIMULEAZĂ; redesenat la evenimentul `tt-oprire` și la schimbarea cheii | **fără plan nou și fără SIMULEAZĂ** până la re-armarea din Governor (cu motiv, lotul C); starea ilizibilă ⇒ OPRIT (închis la eroare) | Butonul de urgență trebuie să oprească și ce se pregătește, nu doar ordinele. Textul arată motivul, ora și aparatul. |
| Bifele disciplinei (I-763) | 4 bife ale LUI în tichet (plan scris înainte, stop la broker imediat, nu după pierdere, nu peste mărimea din tichet), salvate în plan ca `bife:[{id,text,da}]` | Planuri (tichet) → `TradePlans.create` / `validate`; Raportul (lotul C) le numără | nimic — nu blochează | Disciplina proprie devine măsurabilă („n/m reguli respectate”), fără să devină încă o gardă automată. |
| Oprirea de urgență („Oprește tot”, I-757) | **manuală**, a doua confirmare obligatorie; motivul se scrie | pagina contului (`TTOprire`) → releul Trading 212 (`POST orders/cancel-all`, `DELETE orders/{id}`, doar din originea suitei, cheia doar în antet) | anulează TOATE ordinele în așteptare; Governor **HALTED** cât `tt_governor_oprire_v1.activ` (re-armare doar din Governor, cu motiv) | Un incident (ordin greșit, bug, cheie scursă) se oprește în secunde, nu când ajungi la broker (MiFID II RTS 6 art. 12, SEC 15c3-5). |
| Reconcilierea cu brokerul (I-759) | după **fiecare citire completă** a contului; diferență confirmată ⇒ **CAUTION** cu lista | pagina contului (`TTReconciliere`) → `tt_reconciliere_v1` → Governor / Health | prudență cât sunt diferențe; ieșirea doar prin rezolvare sau acceptare **cu motiv scris** | Copiile aplicației (poziții, numerar, ordine) sunt verificate, nu presupuse (RTS 6 art. 17(3), FINRA 15-09). |
| Toleranțele reconcilierii | cantități **1e-6**; sumarul contului **0,5 %** (cel puțin 1 unitate); numerarul față de baza reconciliată **0,1 %** (cel puțin 1) | `TTReconciliere.compara` | sub toleranță nu e diferență | Rotunjirea și citirile la momente ușor diferite nu sunt „break”-uri. |
| Cheile Trading 212 (I-764) | **două**: doar-citire (sincronizare, telefon, monitorul de pe server) + **cu ordine doar pe aparatul activ** | seiful (`T212Vault`: `connection` / `ordine`) | cheia cu ordine nu intră în codul de transfer, nu urcă în cont, se șterge odată cu conexiunea | O cheie scursă dintr-un cititor nu poate pune și nu poate anula ordine. |
| Plafonul automatizărilor (I-764) | **0 % azi**: nicio automatizare nu are voie să pună sau să anuleze ordine | această politică | — | Un robot care tranzacționează primește buget izolat ÎNAINTE de prima rulare, nu după primul incident. |
| Textele generate | eticheta **„generat automat · neverificat de om”** pe orice rezumat trimis automat (robotul de știri; Alerte când trimite în locul robotului) | `tools/discord-mesaj.mjs`, `alerts/index.html` | — | Un rezumat automat nu e o verificare; eticheta o spune la fiecare mesaj. |

### Precizări 27.10.2026

#### Fusul fiecărei limite (I-751)

- **Ziua, săptămâna și luna** limitelor (pierderea zilei / săptămânii, tranzacțiile pe zi, limita lunară, cooldown-ul, „Azi” din Închise, curba de capital) se socotesc pe **un singur ceas: New York** (`CT.ziNY` / `CT.lunaNY`). O vânzare la 19:30 NY pe 31 aparține lunii în care s-a făcut, nu celei următoare.
- **Raportul săptămânal** (I-710) e singura excepție de fus: săptămâna ISO pe ora României; pleacă **luni de la 09:00 (ora României)** de pe aparatul care citește Trading 212; aparatul care nu citește (I-713) trimite abia **de la 12:00**, dacă marcajul săptămânii nu a venit prin sincronizare.

#### DD rolling în moneda contului (I-751)

- Curba de capital și **DD rolling se calculează în moneda contului** (EUR pentru contul Trading 212 în EUR): snapshot-ul automat ține suma locală și cursul BCE; ce e doar în USD (snapshot pus de mână, execuții manuale, mișcări puse de mână) intră la cursul celui mai apropiat snapshot automat. **USD doar la afișare**, la un singur curs (cel verificat azi, altfel al ultimului snapshot). Cursul EUR/USD nu mai produce DD fals și nu mai maschează o scădere reală.
- Curba veche (doar USD) s-a migrat **o singură dată**, cu copie locală (`tt_equity_snapshots_v1_copie_usd`, `tt_equity_events_v1_copie_usd`), din notele snapshot-urilor automate. Cu aceasta, frâna pe DD rolling (`ddRollingOn`) poate fi repornită fără HALT fals din curs.

#### Pragul raportului risc / randament

- **Singurul prag de politică** pentru raportul risc / randament e **1,5 R** la intrarea maximă (Planuri, `lib/trade-plans.js`). În Drafturi, „R:R structural” (de la intrare până la maximul de 20 de zile) e un **filtru de calitate a setup-ului**, nu pragul de risc: sub 1 ⇒ SKIP, între 1 și 2 ⇒ avertisment „marginal”. Cele două măsoară lucruri diferite și rămân așa.

#### Ce înseamnă „are stop”

- **Stop valabil acum** = stopul pus sau schimbat după deschiderea poziției de acum (− 1 h): o singură definiție (`StopSetter.stopValabil`) pentru Astăzi, Portofoliu, Risc & capital și „Intrări cu stop pus (acum)” din bilanțul săptămânii (când pozițiile sunt citite).
- **Stop la intrare** (Raport, rezultatul în R) = stopul pus între − 1 h și + 24 h de la intrare, înainte de ieșire: măsoară disciplina de la intrare, nu protecția de acum.

#### Cum se afișează riscul pe plan

- Riscul se afișează cu explicația lui, nu cu patru zecimale: „0,25 % × 0,75 (piața prudentă) = 0,19 %”. Procentele de risc rămân cu două
  zecimale (ca valorile din politică: 0,25 %, 0,5 %); restul cifrelor noi din tichet cu una (R:R „2,0R · net 1,9R (cu costul)”).
- R:R net (cu costul dus-întors de 0,3 % în riscul pe acțiune) stă alături de cel brut; pragul ≥ 1,5 R rămâne pe cel brut, ca până acum.

## 3. Cine schimbă și cum

- Pragurile din tabel se schimbă **doar de tine**, din Jurnal → Risc & capital (formularul Governor) sau din acest document pentru cele din cod.
- Fiecare schimbare din formular rămâne scrisă automat în **jurnalul limitelor** (`tt_governor_limite_jurnal_v1`, I-728): ora, aparatul, cheia, de la → la.
  Jurnalul e append-only și se vede sub formular (ultimele 10).
- O limită **ridicată** în mijlocul unei serii proaste e exact ce politica interzice: schimbarea se face la revizuire (§ 5), nu când frâna e activă.
  Dacă totuși o faci, rândul din jurnal rămâne, iar Raportul (Disciplina, I-726) va arăta intrările făcute sub limita nouă.
- Capitalul de referință (`accountSize`) nu e o limită: vine din contul Trading 212 și se actualizează singur; nu intră în jurnalul limitelor.

### Override guvernat (I-760)

- **Strângerea** unei limite intră **imediat**. **Relaxarea** (prag mai mare de pierdere / DD / tranzacții / poziții / cooldown / concentrare / risc la stop / căldură, alunecare estimată mai mică, frâna DD oprită) intră **abia peste 24 de ore**, cere **motiv scris** și **expirare între 1 și 90 de zile**; după expirare limita revine singură la valoarea strictă. O strângere pe aceeași limită anulează relaxarea programată.
- Jurnalul limitelor notează și programarea (stare, când intră, când expiră, motivul); Governor spune relaxările programate / active în motive, fără să-și schimbe verdictul din cauza lor.

### Oprirea de urgență și reconcilierea în Governor

- Cât `tt_governor_oprire_v1.activ` e adevărat, Governor e **HALTED** cu ora, aparatul, motivul și ordinele anulate. **Re-armarea** se face doar din formularul Governor, cu **motiv obligatoriu**; istoria rămâne scrisă; 24 h după re-armare motivul ei apare ca notă.
- `tt_reconciliere_v1` cu `ok = false` ⇒ **CAUTION** cu lista diferențelor (pe calea brokerului prin T212Capital, altfel direct în Governor).

### Registrul de incidente și inventarul gărzilor (I-760)

- Orice incident (ce a mers prost, când, impactul, cauza, ce s-a schimbat) se notează în Jurnal → Risc & capital → „Registrul de incidente” și se copiază în `docs/incidente.md`. Un incident rămâne **deschis** până are o măsură scrisă. Fișa zilei primește un rând cu incidentele noi și cele deschise.
- **Inventarul gărzilor** (`docs/inventar-modele.md`) e generat din cod; fiecare gardă are testul care o declanșează; rularea de validare se face **trimestrial** (`node tools/inventar-garzi.mjs --ruleaza`), iar suita e roșie dacă o gardă nouă n-are test.

### „Oprește tot” — procedura „când apăs” (I-757)

**Cine:** tu. **Când apeși** (oricare):
- un ordin greșit e la broker sau pe cale să plece (preț, cantitate, simbol);
- aplicația sau releul fac ceva ce nu recunoști (ordine necunoscute, dubluri, stopuri mutate);
- pierzi controlul: aparat pierdut, cheie posibil scursă, conexiune căzută în mijlocul unui ordin;
- o limită de pierdere e atinsă și vrei să nu mai rămână nimic în așteptare.

**Când NU apeși:** la o scădere normală de piață. „Oprește tot” anulează **și stopurile de protecție**: pozițiile rămân deschise și neprotejate.

**Pașii:**
1. Pagina contului → ⛔ **Oprește tot** → scrie motivul → **Da, anulează tot acum**.
2. Citește rezultatul. „N ordine anulate” cu lista = gata. Ordine „nu s-au putut anula” sau „neconfirmat” ⇒ deschide aplicația Trading 212 →
   ordinele în așteptare și anulează-le manual.
3. Verifică în aplicația Trading 212 că lista de ordine în așteptare e goală.
4. Cheie posibil scursă ⇒ Trading 212 → Settings → API: șterge AMBELE chei, creează altele, pune-le din nou (citire în conexiune, ordine pe aparat).
5. Decide pentru fiecare poziție rămasă fără stop: o închizi manual sau pui stopul din nou (Astăzi) după ce cauza e rezolvată.
6. Scrie incidentul în registrul incidentelor (lotul C): ora, cauza, ce s-a anulat, ce ai făcut după.
7. Re-armarea: **doar din Governor** (Jurnal → Risc & capital), cu motiv scris, după ce cauza e înțeleasă. Cu cauza necunoscută, nu în aceeași zi.

**Proba lunară, pe contul DEMO, cronometrată:**
- **Când:** prima zi lucrătoare a lunii, în orele de piață SUA, cca 10 minute.
- **Pregătire:** pe un aparat, conexiunea pe contul **Demo** (Setări conexiune → Cont: Demo) și cheia demo cu „Orders: Execute” ca cheie cu ordine.
  În Trading 212 demo pune două ordine în așteptare: un STOP de vânzare pe o poziție și o LIMITĂ de cumpărare departe de preț.
- **Proba:** cronometrul pornește la prima apăsare pe „Oprește tot” și se oprește când pagina arată rezultatul.
- **Trece doar dacă:** (a) ambele ordine apar la „anulate”; (b) în Trading 212 demo nu mai e niciun ordin în așteptare; (c) pagina arată OPRIT
  cu motivul, iar Governor e HALTED; (d) durata e de **cel mult 30 de secunde**. Orice criteriu ratat = incident „oprire nefuncțională”,
  reparat înainte de următoarea zi de tranzacționare cu bani reali.
- **După:** re-armează Governor cu motivul „probă lunară”, revino la conexiunea Invest, scrie data, durata și criteriile în registrul incidentelor.

### Reconcilierea — cum se citește (I-759)

- **Ce se compară:** pozițiile (jurnalul execuțiilor când e parcurs integral, plus ajustările acceptate; altfel ultima stare reconciliată
  curat plus execuțiile de după ea), numerarul (sumarul trebuie să se închidă; numerarul nu se schimbă fără execuție, dividend sau mișcare
  de bani), ordinele (STOP-ul trimis din aplicație trebuie să fie la broker sau explicat de o vânzare ori de o anulare din aplicație;
  nicio vânzare în așteptare fără poziție). Fără jurnal sau fără bază: „neverificat”, spus pe ecran, nu „fără diferențe”.
- **Diferență de moment:** o diferență care poate veni dintr-o execuție încă necitită stă la „de confirmat” până la prima recitire a
  jurnalului de după ea sau **15 minute**; apoi devine diferență (CAUTION). Sumarul care nu se închide e diferență pe loc.
- **Acceptarea** („Am verificat · acceptă starea brokerului”) cere motiv scris (split, transfer, ordin anulat de tine în Trading 212) și rămâne
  la vedere; în jurnalul complet diferența acceptată devine ajustare pe acel simbol. Nu se acceptă o diferență neînțeleasă.

### Cheile și automatizările (I-764)

- Restricția pe IP din Trading 212 nu se poate folosi: releul și monitorul rulează pe Cloudflare, fără IP fix. Protecția rămâne separarea
  permisiunilor: cititorii au doar cheia doar-citire.
- La orice suspiciune, ambele chei se rotesc (pasul 4 al procedurii).
- **Plafonul automatizărilor rămâne 0 %** până la o schimbare scrisă aici. O automatizare care pune sau anulează ordine intră doar după:
  plafon de capital scris în § 2 (punctul de pornire propus: cel mult **10 % din valoarea contului** în pozițiile ei și **risc ≤ 0,25 % pe ordin**,
  de confirmat de tine), cheie separată cu ordine doar pentru ea, „Oprește tot” care o oprește, și cel puțin 30 de zile pe contul demo.

## 4. Pragurile față de propriile rezultate (I-730)

Raportul din Jurnal (secțiunea „Cât de sigur e rezultatul tău”) trage 2.000 de lumi din propriile tranzacții, și simplu, și **pe blocuri de 5**
(seriile de pierderi se păstrează), pe următoarele 50 de tranzacții:

- **dd95 pe blocuri** (scăderea în 5 % cele mai rele lumi) față de **plafonul DD de 10 %**: dacă dd95 e peste plafon, plafonul te oprește din
  ghinion normal, fără să fi greșit — asta e **pragul de revizuire**: fie plafonul urcă (cu rândul în jurnal), fie riscul pe plan scade.
- **seria obișnuită de pierderi la rând** (mediana lumilor; percentila 95 e „în 5 % din lumi”, nu „în 95 %”) față de **cooldown-ul de 3**: dacă
  seria obișnuită din simplu zgomot ajunge la 3, cooldown-ul se va declanșa des fără vină; revizuirea alege între 4 și a lăsa 3 ca frână conștientă.
  (Corectat 27.10.2026, audit: formularea veche inversa percentila; verdictul ✓ / ⛔ din Raport se dă doar de la 30 de tranzacții.)
- **Stresul istoric** (Portofoliu · risc): cele mai proaste 5 ferestre de 5 sesiuni ale SPY din 10 ani × beta pozițiilor de acum (1 an și 6 luni,
  interval) față de bugetul săptămânii și plafonul DD. Estimare liniară, fără corelațiile din panică — mai degrabă optimistă.

Sub 30 de tranzacții cozile sunt zgomot: se citesc, nu se acționează pe ele.

### „Versiune validată” a combinației Neural + Boosting (I-750)

- „**Validată**” se spune doar când candidatul trece pragul descriptiv (log-loss cu ≥ 0,02 și Brier cu ≥ 0,01 sub frecvențele claselor, nu mai slab decât componentele) **și** testul de mărime: testul de permutare pe semne (exact, 2^20 configurații) pe cele 20 de diferențe de log-loss față de frecvențele claselor, unilateral, **p < 0,05**. Altfel e „**candidată**”: probabilitățile rămân vizibile, dar verdictul cumulat nu primește titlul „probabilități validate” și nu folosește combinația ca direcție.
- Grila de 12 combinații (pondere × temperatură) se alege pe blocul de calibrare, nu pe test; testul e o singură comparație dinainte stabilită, deci nu cere corecție Holm. Dacă vreodată alegerea s-ar face pe test, se trece la n ≥ 50 cu Holm pe 12.
- Mărimea testului a fost verificată prin simulare sub H0 înainte de punere în funcțiune, pe drumul real (20 de rânduri de calibrare aleg ponderea și temperatura, reperul = frecvențele din calibrare, poarta descriptivă + permutarea pe cele 20 de test): **1,1 %** validări false pe grila largă (4342 de lumi fără avantaj), **4,4 %** chiar pe limita H0 la încrederi brute extreme (3740 de lumi), celula cea mai rea **6,6 %** (încredere brută 0,999, acuratețe 0,61). Poarta descriptivă singură valida fals **36–47 %** din aceleași lumi. Diferențele de log-loss sunt asimetrice, deci testul (exact doar sub simetrie) poate trece puțin peste 5 % în colțul extrem; garda din `tools/holdings-learning-permutare.test.mjs` ține celula aceea sub 10 % și poarta singură peste 30 %.

### Tiparele de comportament și Tiltmeter (I-761)

- Raportul arată patru tipare, calculate **mecanic** din ordinele Trading 212 (nu din etichete puse de mână): **răzbunare** = o cumpărare la mai puțin de **30 de minute** după o ieșire pe pierdere; **mărime crescută după 2 pierderi** = după două ieșiri pe pierdere la rând, o cumpărare mai mare de **1,25 × mediana ultimelor 5 cumpărări** (în moneda contului); **pierdere peste stop** = R sub **−1,25** față de stopul **planului** (analiza salvată sau stopul pus la intrare — nu stopul pus ulterior în Portofoliu); **din frig** = prima cumpărare a fiecărei zile New York.
- Pentru fiecare: n, R mediu față de restul, numărul pe ultimele **4 săptămâni** și un buton care filtrează tot raportul la tranzacțiile lui. **Sub 10 cazuri** cifrele se arată cu „prea puține cazuri” — nu se trage nicio concluzie.
- **Tiltmeter**: trei note pe zi (somn, concentrare, stres; 1–5), salvate în setările Jurnalului (sincronizate), puse lângă R-ul zilei (suma R a ieșirilor din ziua New York); comparația „jos (1–2)” față de „sus (4–5)” apare pe zilele cu tranzacții. Sub 10 zile: „prea puține zile”.
- Pragurile sunt **convenții de prudență scrise înainte**, nu avantaj dovedit; un tipar care nu „costă” încă nu e dovada că nu costă.

### MAE / MFE din barele intraday (I-762)

- Pentru tranzacțiile închise din SUA, Raportul calculează **la cerere** (butonul din panou) cât a mers prețul împotriva ta (**MAE**) și în favoarea ta (**MFE**) între intrare și ieșire, din barele Yahoo de **1 minut** (intrarea în ultimele 7 zile) sau **5 minute** (până la 60 de zile); rezultatul rămâne pe aparat (`tt_journal_mae_v1`), deci se calculează **la închidere**, nu retroactiv.
- Intră doar barele aflate **integral** în fereastra deținerii, plus prețurile tale de intrare și ieșire (fără prețurile de dinainte de cumpărare sau de după vânzare). Prețurile Yahoo care nu se potrivesc cu ale tale (split, altă bursă) ⇒ „nepotrivit”, fără cifre.
- „Cea mai bună ieșire” (maximul din fereastră) se vede **doar după**: arată spațiul pe care l-a avut prețul, nu o regulă care putea fi urmată. Sub 10 tranzacții calculate: prea puține ca să spună ceva.

### Ziua, ratatele, heatmap-ul și bifele planului (I-763)

- **Etichetele zilei** (regim: trend / lateral / volatil / zi cu știri; stare: odihnit / obosit / grăbit / bolnav; emoție: calm / FOMO / frică / frustrare / prea sigur) se pun pe ziua New York și stau în setările sincronizate ale Jurnalului; Raportul arată, pe fiecare etichetă, câte zile, câte tranzacții închise, rezultatul și R mediu. Descriptiv, nu cauzal.
- **Tranzacțiile ratate**: simbolul, ziua, motivul („Governor HALTED”, „fără plan”…) și, opțional, prețul de atunci; Raportul citește barele zilnice și arată ce a făcut prețul în **cel mult 5 sesiuni** după (față de prețul tău sau, fără el, de închiderea zilei). O ratată care a urcat nu înseamnă că regula a greșit: regula se judecă pe toate, nu pe una.
- **Heatmap-ul zi × oră** (intrările din SUA, ora New York) arată media rezultatului și numărul de tranzacții pe celulă; culorile vin din token-urile Raportului (divergent: câștig / pierdere, mijloc neutru), cu valoarea scrisă în celulă și liniuță pe pierderi. O celulă cu câteva tranzacții nu e un obicei.
- **Bifele planului** (`plan.bife`, scrise de tichetul Planuri): Disciplina arată „n/m reguli respectate” pe intrările legate de un plan cu bife; o regulă nebifată nu e încălcare de Governor, e disciplina ta, la vedere.

## 5. Revizuirea

- **Trimestrial** (prima săptămână din ianuarie, aprilie, iulie, octombrie) sau **după 30 de tranzacții noi**: tabelul din § 2 față de § 4 și față de
  Raport (disciplina, alunecarea, planul față de execuție). Schimbările se scriu în § 6 și în cod în aceeași livrare.
- **Nu se revizuiește** cât Governor e HALTED pe o limită de pierdere.
- Probele în timp (Top Long, Trend 12 luni, verdictul pieței, Reguli V1, stopul Reversal în umbră) au protocoalele lor cu praguri scrise înainte
  (`docs/*-protocol.md`); verdictul lor poate schimba doar riscul pe plan al motorului respectiv, nu limitele contului.

- **Shadow** (evaluarea semnalelor blocate, I-754):
  - Un **split** între semnal și ieșire (Yahoo `events=div,splits`) face evaluarea **neverificabilă**: semnalul nu intră în statistici
    (nici în „vs base”) și nu se mai cere; motivul stă în registru și în tabelul Shadow Book. Dividendul doar se notează (OHLC-ul nu e ajustat).
  - Pentru un semnal venit în ședință, stopul se verifică și pe restul zilei semnalului (varianta mai proastă: ieșire la stop).
  - Poarta de capital din Shadow Book se estimează la riscul unui plan (0,5 % din cont), nu la 1 %.

## 6. Istoricul schimbărilor

| Data | Ce | De la → la | De ce | Unde |
|---|---|---|---|---|
| 2026-10-14 | `maxLossPctWeek`, `maxInstrumentPct`, `maxTotalStopPct` intră în Governor + contul real | — → 3 % / 20 % / 5 % | controlul capitalului real (Trading 212), nu doar jurnalul manual | `lib/governor.js`, `lib/trading212-capital.js` |
| 2026-10-17 | Limita lunară de pierdere (I-692) | — → suma ta | regula ta scrisă dinainte; informativă la început | `lib/monthly-limit.js` |
| 2026-10-18 | Filtrul de piață = verdictul robotului (A) | Danger Score → verdict (×1 / ×0,75 / ×0,5 fără GO / neverificat ×0,75) | sursa veche retrasă; regulă de prudență aleasă de tine | `docs/setup-filtru-piata.md` |
| 2026-10-19 | Căldura portofoliului 4 % + corelație 0,7 / max 2 (I-719); costul de schimb 0,3 % (audit L&R) | — → 4 % / 0,7 / 2 / 0,3 % | riscul deschis însumat are plafon; costul e pierdere sigură | `lib/caldura-portofoliu.js`, `lib/trade-plans.js` |
| 2026-10-20 | Limita lunară **leagă** (I-721); MTM în bugete (I-722); verdictul pieței o regulă și în Planuri (I-727); CAUTION la a 4-a tranzacție (I-733); stopul la broker (I-723); ADV în idee proprie (I-733); alunecarea ≤ 0,1 R (I-729); pragul de revizuire dd95 / serie95 (I-730) | informativ → HALTED / CAUTION etc. | auditul instituțional 20.10: regulile scrise nu legau toate | acest document + `lib/governor.js`, `lib/trading212-capital.js`, `desk/index.html`, `lib/journal-report.js` |
| 2026-10-27 | Lotul A: fișa zilei cu ordinele brokerului și o singură definiție a stopului pe server (I-749); proba de ecran automată după publicare (I-747); securitatea sincronizării și „doi cititori” la vedere (I-748); secretele în afara cache-ului persistat (I-746) | — → fișa numără ordinele; proba la fiecare publicare | auditul A din 27.10 | `lib/cloud-monitor.mjs`, `.github/workflows/proba-ecran.yml`, `app/cloud-sync.js` |
| 2026-10-27 | Lotul B: collar 0,5–25 %, cantitate ≤ poziție, dublură în 2 minute la ordinul STOP (I-758); „validată” doar după testul de permutare (I-750); concentrarea pe toate paginile din Governor (20 %); a doua sursă de preț pe bara închisă | — → controale pre-ordin; 25 % (Astăzi) → 20 % | auditul B din 27.10 | `lib/t212-orders.js`, `lib/holdings-learning.js`, `lib/holdings-concentrare.js` |
| 2026-10-27 | Lotul C: un singur ceas New York; DD în moneda contului (I-751); override guvernat — relaxarea peste 24 h, cu motiv și expirare (I-760); registrul de incidente și inventarul gărzilor (I-760); tiparele de comportament, MAE / MFE, ziua, ratatele, bifele (I-761…I-763); OPRIT ⇒ HALTED, reconcilierea ⇒ CAUTION | relaxare imediată → peste 24 h; USD → moneda contului | auditul C din 27.10 | `lib/governor.js`, `lib/equity.js`, `lib/journal-*.js` |
| 2026-10-27 | Early Reversal plafonat la 0,25 % (I-742); corelație neverificată ×0,75 + modulele-gardă (I-753); preț sub stop / ADV necunoscut ⇒ fără plan, expirarea PLANNED la 2 sesiuni, gărzile re-rulate la SIMULEAZĂ (I-752); OPRIT din `tt_governor_oprire_v1`; bifele disciplinei (I-763); Shadow neverificabil la split (I-754) | 0,5 % → 0,25 %; trece → ×0,75 / blocat; fără termen → 2 sesiuni | auditul D din 27.10: lanțul planului avea capete deschise la eroare | `lib/desk-proba.js`, `lib/caldura-portofoliu.js`, `lib/trade-plans.js`, `lib/idee-proprie.js`, `lib/shadow.js`, `desk/index.html` |
| 2026-10-27 | „Oprește tot” (I-757); reconcilierea cu brokerul (I-759); două chei Trading 212, plafonul automatizărilor, eticheta „neverificat de om” (I-764) | — → manual, două confirmări / CAUTION la diferență confirmată / 0 % | auditul instituțional 27.10 (RTS 6 art. 12 și 17(3), 15c3-5, FINRA 15-09) | `lib/trading212-oprire.js`, `lib/trading212-reconciliere.js`, `lib/trading212-vault.js`, `tools/discord-mesaj.mjs` |
