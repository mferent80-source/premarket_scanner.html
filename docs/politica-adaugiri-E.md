# Adăugiri la politica de risc — lotul E (broker, Alerte, roboți) · 27.10.2026

> Pentru coordonator: paragrafele de mai jos se unesc în `docs/politica-de-risc.md` (secțiunile indicate). Codul care le aplică e deja în
> ramura lotului E: `lib/trading212-oprire.js` (I-757), `lib/trading212-reconciliere.js` (I-759), `lib/trading212-vault.js` + pagina
> contului (I-764), `tools/discord-mesaj.mjs` (eticheta). Governor-ul care citește cheile (HALTED / CAUTION) e la lotul C.

## § 1 Principii — completare la principiul 1

„Nicio limită nu trimite ordine la broker” rămâne adevărat: **nicio limită automată** nu pune, nu anulează și nu lichidează. Singura
excepție e **„Oprește tot”**, apăsat de tine, cu două confirmări: anulează ordinele în așteptare din Trading 212. Nu vinde poziții.

## § 2 Rânduri noi în tabelul pragurilor

| Prag | Valoarea | Unde se aplică | Ce oprește | Motivul |
|---|---|---|---|---|
| Oprirea de urgență („Oprește tot”, I-757) | **manuală**, a doua confirmare obligatorie; motivul se scrie | pagina contului (`TTOprire`) → releul Trading 212 (`POST orders/cancel-all`, `DELETE orders/{id}`, doar din originea suitei, cheia doar în antet) | anulează TOATE ordinele în așteptare; Governor **HALTED** cât `tt_governor_oprire_v1.activ` (re-armare doar din Governor, cu motiv) | Un incident (ordin greșit, bug, cheie scursă) se oprește în secunde, nu când ajungi la broker (MiFID II RTS 6 art. 12, SEC 15c3-5). |
| Reconcilierea cu brokerul (I-759) | după **fiecare citire completă** a contului; diferență confirmată ⇒ **CAUTION** cu lista | pagina contului (`TTReconciliere`) → `tt_reconciliere_v1` → Governor / Health | prudență cât sunt diferențe; ieșirea doar prin rezolvare sau acceptare **cu motiv scris** | Copiile aplicației (poziții, numerar, ordine) sunt verificate, nu presupuse (RTS 6 art. 17(3), FINRA 15-09). |
| Toleranțele reconcilierii | cantități **1e-6**; sumarul contului **0,5 %** (cel puțin 1 unitate); numerarul față de baza reconciliată **0,1 %** (cel puțin 1) | `TTReconciliere.compara` | sub toleranță nu e diferență | Rotunjirea și citirile la momente ușor diferite nu sunt „break”-uri. |
| Cheile Trading 212 (I-764) | **două**: doar-citire (sincronizare, telefon, monitorul de pe server) + **cu ordine doar pe aparatul activ** | seiful (`T212Vault`: `connection` / `ordine`) | cheia cu ordine nu intră în codul de transfer, nu urcă în cont, se șterge odată cu conexiunea | O cheie scursă dintr-un cititor nu poate pune și nu poate anula ordine. |
| Plafonul automatizărilor (I-764) | **0 % azi**: nicio automatizare nu are voie să pună sau să anuleze ordine | această politică | — | Un robot care tranzacționează primește buget izolat ÎNAINTE de prima rulare, nu după primul incident. |
| Textele generate | eticheta **„generat automat · neverificat de om”** pe orice rezumat trimis automat (robotul de știri; Alerte când trimite în locul robotului) | `tools/discord-mesaj.mjs`, `alerts/index.html` | — | Un rezumat automat nu e o verificare; eticheta o spune la fiecare mesaj. |

## „Oprește tot” — procedura „când apăs” (nouă, după § 3)

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

## Reconcilierea — cum se citește (după procedura de mai sus)

- **Ce se compară:** pozițiile (jurnalul execuțiilor când e parcurs integral, plus ajustările acceptate; altfel ultima stare reconciliată
  curat plus execuțiile de după ea), numerarul (sumarul trebuie să se închidă; numerarul nu se schimbă fără execuție, dividend sau mișcare
  de bani), ordinele (STOP-ul trimis din aplicație trebuie să fie la broker sau explicat de o vânzare ori de o anulare din aplicație;
  nicio vânzare în așteptare fără poziție). Fără jurnal sau fără bază: „neverificat”, spus pe ecran, nu „fără diferențe”.
- **Diferență de moment:** o diferență care poate veni dintr-o execuție încă necitită stă la „de confirmat” până la prima recitire a
  jurnalului de după ea sau **15 minute**; apoi devine diferență (CAUTION). Sumarul care nu se închide e diferență pe loc.
- **Acceptarea** („Am verificat · acceptă starea brokerului”) cere motiv scris (split, transfer, ordin anulat de tine în Trading 212) și rămâne
  la vedere; în jurnalul complet diferența acceptată devine ajustare pe acel simbol. Nu se acceptă o diferență neînțeleasă.

## Cheile și automatizările (I-764)

- Restricția pe IP din Trading 212 nu se poate folosi: releul și monitorul rulează pe Cloudflare, fără IP fix. Protecția rămâne separarea
  permisiunilor: cititorii au doar cheia doar-citire.
- La orice suspiciune, ambele chei se rotesc (pasul 4 al procedurii).
- **Plafonul automatizărilor rămâne 0 %** până la o schimbare scrisă aici. O automatizare care pune sau anulează ordine intră doar după:
  plafon de capital scris în § 2 (punctul de pornire propus: cel mult **10 % din valoarea contului** în pozițiile ei și **risc ≤ 0,25 % pe ordin**,
  de confirmat de tine), cheie separată cu ordine doar pentru ea, „Oprește tot” care o oprește, și cel puțin 30 de zile pe contul demo.

## § 6 Istoricul schimbărilor — rândul nou

| Data | Ce | De la → la | De ce | Unde |
|---|---|---|---|---|
| 2026-10-27 | „Oprește tot” (I-757); reconcilierea cu brokerul (I-759); două chei Trading 212, plafonul automatizărilor, eticheta „neverificat de om” (I-764) | — → manual, două confirmări / CAUTION la diferență confirmată / 0 % | auditul instituțional 27.10 (RTS 6 art. 12 și 17(3), 15c3-5, FINRA 15-09) | `lib/trading212-oprire.js`, `lib/trading212-reconciliere.js`, `lib/trading212-vault.js`, `tools/discord-mesaj.mjs` |
