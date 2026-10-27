# Proba în timp a Reguli V1 — protocol scris ÎNAINTE de date

Scris pe 18.10.2026, înaintea primei zile din jurnal (cererea lui Marius: „FĂ TOT”, propunerea (1): să aflăm cinstit dacă Reguli V1 ajută).
Orice schimbare a acestui protocol sau a regulilor V1 **repornește proba de la zero** (jurnalul ține versiunea motorului; evaluarea folosește
doar zilele cu versiunea de acum).

## Ce se notează
- Un robot GitHub (`.github/workflows/v1-proba.yml`) rulează în fiecare zi lucrătoare, după închiderea pieței din SUA.
- Universul e **înghețat**: cele 85 de acțiuni din lista Core a Premarket Scanner (67 SUA + 18 Europa), copiate în `lib/v1-proba.mjs`.
- Motorul: `lib/independent-scanner.js`, versiunea din jurnal (azi `experimental-1.0.0`), cu reperul regional SPY / EXSA.DE
  (rezervă IVV / ^STOXX / ^STOXX50E când Yahoo nu are închiderea).
- Pentru fiecare acțiune: verdictul, câte verificări din 8 trec, data sesiunii EOD și reperul folosit.

## Ce se măsoară
- Randamentul în exces = randamentul acțiunii pe următoarele **k sesiuni** ale ei minus randamentul reperului pe aceleași date.
- Grupul **SUS** = 6, 7 sau 8 verificări trecute din 8. Grupul **JOS** = 5 sau mai puțin. Neverificabilele nu intră.
- **Ipoteza principală:** pe k = 20 sesiuni, grupul SUS are randament în exces mai mare decât grupul JOS.
- **Ipoteza secundară:** același lucru pe k = 5 sesiuni. Descriptiv (fără verdict): grupul „îndeplinește regulile” (8 din 8).

## Cum se judecă (fixat acum)
- Se folosesc doar **perioade care nu se suprapun**: o zi de start, apoi următoarea zi din jurnal aflată la cel puțin k sesiuni după ea.
  Zilele vecine ar număra aceeași mișcare de mai multe ori (lecția din 16–17.10: testul pe zile suprapuse dădea 9–12% „dovezi” false).
- Într-o perioadă, diferența = media excesului grupului SUS − media excesului grupului JOS; perioada contează doar dacă fiecare grup are
  cel puțin 3 acțiuni cu rezultat. Diferențele exact 0 nu intră.
- **Testul semnelor**, unilateral: p = probabilitatea ca, fără niciun avantaj, cel puțin atâtea perioade din n să iasă pozitive.
  Mărimea testului e verificată prin simulare pe prețuri aleatorii (`tools/v1-proba.test.mjs`): sub 5% „dovezi” false.
- **Minimum 8 perioade** pentru orice verdict (≈ 2 luni la k = 5, ≈ 8 luni la k = 20).

## Verdictele (fixate acum)
- **„Încă nu se poate spune”** — mai puțin de 8 perioade. Pagina arată câte sunt din câte trebuie.
- **„Reguli V1 ajută”** — cel puțin 8 perioade, media diferenței > 0 și p ≤ 0,05.
- **„Nu s-a văzut un avantaj”** — cel puțin 8 perioade, dar condiția de mai sus nu e îndeplinită.
  Asta NU înseamnă „s-a dovedit că nu ajută”: înseamnă că datele nu arată un avantaj.

## Ce NU face proba
- Nu există un backtest V1 cu care să comparăm; comparația e doar cu reperul pieței.
- Nu ține cont de costuri, spread sau de momentul exact al intrării (prețuri de închidere EOD).
- Nu schimbă nimic din ce face aplicația: doar adună dovezi.

## Protocolul v2 — o singură judecată, puterea scrisă înainte (27.10.2026, I-741 / I-743)
*(27.10.2026: înlocuit parțial de § „Revizia independentă din 27.10.2026” de mai jos — acolo sunt regulile în vigoare.)*
Scris pe **27.10.2026**, înaintea oricărei zile notate sub v2. Proba v1 (`v1-proba-1`, versiunea `experimental-1.0.0`) avea 2 zile în
jurnal (16.10 și 23.10) și **niciun verdict** (0 / 8 perioade la 20 de sesiuni, 1 / 8 la 5). **Proba repornește ca `v1-proba-2`**: zilele
v1 rămân în `scanner-verdicts/generated/v1-jurnal.json` sub versiunea veche — nu se șterg, nu se rescriu și nu intră în v2.

**De ce** (auditul F din 27.10.2026, verificat pe cod și prin simulare):
1. Verdictul se recalcula la fiecare perioadă nouă după a 8-a — un test secvențial fără corecție: „ajută” fals ≈ 15 % în primul an la 5 sesiuni.
2. Puterea la 8 perioade era mică: un avantaj real de +1 % pe perioadă era văzut doar în 15,5 % din lumi la 20 de sesiuni (39,0 % la 5).
   „Nu s-a văzut un avantaj” era rezultatul aproape sigur, oricare ar fi fost adevărul.
3. „Versiunea” probei era un șir constant: o schimbare a celor 8 verificări fără urcarea șirului nu repornea proba.
4. Acțiunile fără serie (delistate, preluate) ieșeau tăcut din medii.

**Ce rămâne exact ca în v1:** universul înghețat de 85, motorul (`lib/independent-scanner.js`), reperele, ipoteza principală (20 de sesiuni)
și cea secundară (5), grupurile SUS (6–8 verificări) / JOS (≤ 5), măsura (excesul față de reper), perioadele care nu se suprapun, minimum
3 acțiuni pe grup, testul semnelor unilateral, α = 0,05.

**Ce se schimbă (fixat acum):**
- **O singură judecată, la exact N perioade** (eșantion fix): **N = 16 la 5 sesiuni, N = 60 la 20 de sesiuni**. Verdictul se calculează o
  dată, pe primele N perioade, și rămâne. Perioadele de după apar doar ca monitorizare (`monitorizare` în fișier: câte, câte pozitive, media),
  fără alt verdict.
- **De ce 16 și 60 — puterea, simulată înainte** (`tools/proba-putere.mjs`, cifrele în `docs/proba-putere-2026-10-27.json`): 2000 de lumi
  sintetice cu o înregistrare în FIECARE sesiune (ca jurnalul), grupurile din jurnalul real (65 verificate, 16 SUS), abaterea zilnică 2,2 %
  (aleasă ca diferența SUS − JOS pe 20 de sesiuni să aibă ≈ 3,4 %, cât s-a măsurat pe Top Long în 2022–2026), +x % pe perioadă pentru grupul
  SUS, aceleași funcții ca robotul, mulberry32, sămânța 27102026. Regula: **cel mai mic N din grilă la care +1 %/perioadă e văzut în ≥ 50 %
  din lumi, pentru ambele probe care împart evaluatorul** (Reguli V1 și Top Long).

  | Orizont | N | „ajută” fals (H0) | +0,5 %/perioadă | +1 %/perioadă |
  |---|---|---|---|---|
  | 5 sesiuni | 8 (v1) | 3,8 % | 14,8 % | 39,0 % |
  | 5 sesiuni | **16** | 3,8 % | 24,8 % | **66,8 %** (Top Long: 52,6 %) |
  | 20 de sesiuni | 8 (v1) | 2,8 % | 6,7 % | 15,5 % |
  | 20 de sesiuni | 48 | 2,9 % | 17,8 % | 49,95 % — sub prag |
  | 20 de sesiuni | **60** | 4,8 % | 26,2 % | **66,4 %** (Top Long: 54,6 %) |

  Spus cinstit: +1 % pe 5 sesiuni e un avantaj uriaș (≈ +0,2 % pe zi); la 20 de sesiuni +1 % pe perioadă ≈ +13 % pe an peste reper.
  Un avantaj de +0,5 % pe perioadă e văzut doar într-un sfert din cazuri chiar și la N cerut. „Nu s-a văzut un avantaj” rămâne cel mai
  probabil rezultat și **nu înseamnă „s-a dovedit că nu”**.
- **Mărimea testului, simulată înainte** (`node tools/proba-putere.mjs --marime`, 20.000 de lumi): cu perioade independente, „ajută” fals
  = coada binomială exactă, 3,7 % la N = 16 și 4,6 % la N = 60. Testul semnelor presupune însă perioade independente; dacă diferențele au
  persistență (autocorelare ρ între perioade vecine), mărimea urcă: ρ = 0,1 ⇒ 5,0 % / 5,5 %; ρ = 0,2 ⇒ 6,3 % / 7,0 %; ρ = 0,3 ⇒ 7,7 % / 8,6 %.
  **Regula de citire (fixată acum):** la judecată se calculează autocorelarea de ordinul 1 a celor N diferențe (`persistenta`); de la
  **0,2** în sus, un „ajută” se scrie **„cu rezerve”** (`rezerve` în fișier). Verdictul nu se schimbă; rezerva se spune în clar.
- **Delistate:** fără date la 10 sesiuni după orizont (calendarul SPY), acțiunea iese la ultima închidere cunoscută (marcată `oprit`); fără
  serie sau fără ziua notată în serie, rândul e „nejudecat”, cu motivul, și se numără (`descriptiv.nejudecate`). Clasificatorul face la fel.
- **Versiunea = amprenta regulilor, nu un șir:** `v1-` + SHA-256 pe (a) regulile V1 — închiderea tranzitivă din `lib/independent-scanner.js`
  pornind de la `evaluate` și `benchmarkSource` (fără `LABELS`, `rule`, `VERSION`, `DEFAULT_UNIVERSE`: texte de afișaj) și (b) evaluatorul
  din `lib/v1-proba.mjs` (`FUNCTII_EVALUATOR` + pragurile de mai sus). CRLF = LF. **Amprenta la pornirea v2:** rândul de jos din tabelul
  „Amprentele v2” de la sfârșitul documentului (tabel care doar crește). Garda din suită (`tools/probe-amprente.test.mjs`) pică dacă amprenta de azi diferă de cea scrisă aici;
  garda din fluxul robotului (`tools/v1-proba.test.mjs`) oprește notarea dacă diferă de cea din fișierul probei — o regulă schimbată fără
  protocol nou nu poate reporni proba pe tăcute.
- **Când poate veni primul verdict** (calendarul NYSE din `lib/exchange-calendar.js`; robotul o recalculează zilnic în `primulVerdict`):
  5 sesiuni — optimist ~**23.02.2027**, realist ~**mai 2027** dacă robotul pierde zile în ritmul din 16–27.10 (2 notate din 8);
  20 de sesiuni — optimist ~**iunie 2031**, realist ~2032 (dincolo de calendarul oficial, datele sunt aproximative).

**Verdictele v2 (fixate acum):**
- **„Încă nu se poate spune”** — mai puțin de N perioade. Pagina arată câte sunt din câte trebuie (16 / 60).
- **„Reguli V1 ajută”** — la exact N perioade: media diferenței > 0 și p ≤ 0,05 (testul semnelor); „cu rezerve” dacă persistența ≥ 0,2.
- **„Nu s-a văzut un avantaj”** — altfel. NU înseamnă „s-a dovedit că nu ajută”.

**Ce ar scurta proba (decizia LUI; fiecare variantă = o probă nouă, scrisă înainte):** un univers mai mare (mai multe acțiuni pe grup ⇒
abaterea perioadei scade), orizontul de 5 sesiuni ca principal, sau un efect minim mai mare declarat dinainte. Încercarea intră în
`docs/cercetare/registru.md` (§ 2).

## Revizia independentă din 27.10.2026 — reparațiile, scrise ÎNAINTEA primei zile v2 (regulile în vigoare)
Scris pe **27.10.2026**, după revizia independentă a lotului F („nu se publică până la reparații”). Nicio zi v2 nu e notată (jurnalul are doar
16.10 și 23.10, sub versiunea veche) ⇒ nimic nu se pierde și nu e o repornire. Unde secțiunea „Protocolul v2” de mai sus spune altceva, e în
vigoare ce scrie aici.

- **Prețurile acoperă toată proba (🔴1).** Robotul aducea 2 ani de prețuri (scannerul, reperele și SPY pe `'2y'`) ⇒ la 20 de sesiuni judecata
  nu putea veni niciodată (cel mult 25 de perioade), iar la 5 se refăcea pe o fereastră alunecătoare. Acum (`planReluare` în
  `tools/v1-jurnal.mjs`) toate simbolurile zilelor versiunii + SPY se reiau pe un interval care acoperă prima zi a probei + orizontul (2y ⇒ 5y ⇒
  10y, regula Top Long din 19.10, mutată în `lib/proba-contract.mjs`); test: `tools/v1-jurnal-serii.test.mjs`.
- **Perioadele și judecata se îngheață (🔴2).** O perioadă (start + k sesiuni) se îngheață când s-au scurs orizontul **+ cele 10 sesiuni de
  așteptare** — atunci fiecare acțiune e definitivă (randament, ieșire la ultima închidere sau „nejudecată”). Perioada, cu randamentele ei, se
  scrie o singură dată în `scanner-verdicts/generated/v1-inghetat.jsonl` (JSONL, fișier care doar crește; garda `tools/probe-inghetat.test.mjs`, în suită și în fluxul robotului).
  Judecata se scrie o singură dată, în noaptea în care se îngheață a N-a perioadă; cea scrisă are întâietate, iar o recalculare care ar ieși
  altfel apare doar ca `abatereJudecata`. Evaluarea de noapte citește fișierul, nu recalculează perioadele din Yahoo: o acțiune delistată, o
  serie scurtă sau o noapte cu SPY pe 6 luni nu mai pot schimba nimic după înghețare (testat: 0 schimbări în 40 de lumi × 3 cazuri; revizia
  măsurase 1,2–6,1 % cu codul vechi). **Data judecății = ziua înghețării celei de-a N-a perioade** (închiderea ei + 10 sesiuni).
- **Rularea de rezervă de dimineață (🟡9, 🟡10).** Prima notare a unei zile rămâne (`adauga` nu mai înlocuiește ziua deja notată), pasul
  robotului primește `DOAR_LIPSA` (și Premarket, nu doar V1), iar seriile de evaluare se taie la ziua notată (la 10:15 UTC bursele UE sunt
  deschise, bara de azi e intraday). Garda „doar crește” pe jurnale: `tools/probe-amprente-acoperire.test.mjs`.
- **Puterea, cu abaterea MĂSURATĂ (🟡6).** Abaterea presupusă de lotul F (3,4 % pe 20 de sesiuni, 2,2 %/zi) era prea mică. Calibrarea mea:
  motoarele ADEVĂRATE (`candidate-engine/engine.js`, `lib/independent-scanner.js`) rulate ca roboții probei pe fiecare zi din 01.11.2022 –
  23.10.2026 (998 de zile), pe universul Core85 înghețat (inclusiv acțiunile volatile care lipseau din datele reviziei: MARA, RIOT, CIFR, APLD,
  LCID, ENPH…), prețuri Yahoo pe 5 ani, toate fazele, perioade care nu se suprapun, exact `perioadeDin` — **s-a citit doar abaterea; media
  diferențelor nu s-a tipărit și nu s-a folosit** (proba e pe zile noi). Puterea de mai jos e din lumile sintetice ale depozitului cu abaterea
  măsurată (`node tools/proba-putere.mjs --proba v1 --k 5 --sigmaPerioada 0.024 --verificate 81 --sus 28`, 2000 de lumi, mulberry32;
  `docs/proba-putere-2026-10-27.json`, cheia `revizie`).

  | | Reguli V1 |
  |---|---|
  | abaterea pe perioadă, 5 sesiuni / 20 de sesiuni (motorul real) | **2,40 %** / **4,86 %** (revizia: Core 1,7–3,4 % / 4,3–7 %) |
  | autocorelarea perioadelor ρ₁ (5 / 20) | −0,04 / −0,03 |
  | grupurile medii (SUS / JOS) | 28 / 53 |
  | puterea la +1 %/perioadă, 5 sesiuni, pe grilă | 16: 32,6 % · 20: 28,1 % · 24: 40,8 % · **30: 54,9 %** · 36: 54,3 % · 40: 61,1 % · 48: 63,8 % · 60: 80,0 % |
  | **la N = 30**: „ajută” fals / +0,5 % / +1 % | **4,3 % / 22,4 % / 54,9 %** |
  | la N = 30, pe forma REALĂ a diferențelor (exact binomial) / normala cu aceeași abatere | 72 % / 56,1 % la +1 % |
  | la N = 30 cu abaterea pesimistă a reviziei (3,4 %, selecție de tip momentum) | ~35 % la +1 % |
  | 20 de sesiuni, la 60 de perioade (doar monitorizare) | +1 % văzut în 32,0 % (de aceea nu mai e verdict) |

  Puterea testului semnelor nu crește monoton cu N (pragul binomial sare din 2 în 2), de aceea grila are și 20 / 24. **Mărimea la N = 30**
  (20.000 de lumi, `revizie.marime`): perioade independente **4,9 %** (coada binomială exactă 4,94 %); cu persistență ρ = 0,1 ⇒ 6,0 %,
  ρ = 0,2 ⇒ 7,7 %, ρ = 0,3 ⇒ 9,2 %. Persistența măsurată pe istoric e ~0 (−0,04), deci mărimea reală e cea fără persistență. Regula
  „cu rezerve” (ρ̂ ≥ 0,2) rămâne; spus cinstit, ρ̂ ≥ 0,2 iese și din zgomot în **9,4 %** din cazuri la 30 de perioade (simulare, 20.000 de
  lumi) — o rezervă e un semnal de verificat, nu o dovadă de persistență. Un „ajută” cu rezerve **nu ridică plafonul** desk-ului (🟡11,
  politica F § 2).
- **Decizia de protocol (a) — IPOTEZĂ declarată, ușor de schimbat până la prima zi v2 notată; motivul: recomandarea reviziei independente din
  27.10.2026.** **Verdictul principal e pe orizontul de 5 sesiuni, la exact N = 30 de perioade** (cel mai mic N din grilă la care +1 %/perioadă
  e văzut în ≥ 50 % din lumi, cu abaterea măsurată). **Orizontul de 20 de sesiuni rămâne monitorizare, cu bilanț, fără verdict** (`necesare:
  null`, `verdict: "monitorizare"` în fișier; perioadele lui se îngheață și se numără la fel): la 60 de perioade verdictul ar fi venit pe
  ~22.08.2031, cu puterea 32,0 %. Spus cinstit: 5 sesiuni răspund la „ajută pe o săptămână?”, nu la „ajută planul de 20 de zile?”.
  „Nu s-a văzut un avantaj” rămâne rezultatul cel mai probabil dacă avantajul e mic și **nu înseamnă „s-a dovedit că nu”**.
- **Primul verdict posibil:** 30 de perioade de 5 sesiuni de la prima zi v2 (28.10.2026) + 10 sesiuni până la înghețarea ultimei ⇒ optimist
  ~**21.06.2027** dacă prima zi v2 e 28.10.2026 (25.06.2027 dacă e 03.11; revizia F2, 🔵9: data veche, 17.06, era numărată de la 27.10), pe calendarul oficial NYSE, cu cele 10 sesiuni de așteptare dinaintea înghețului; realist mai târziu, cu cât pierde robotul zile (`primulVerdict.realist` în fișier). Dincolo de
  2027, sărbătorile NYSE se calculează după regulile bursei (🔵12), nu se mai numără doar zilele lucrătoare.
- **Dacă LUI îi alege altfel (tot înaintea primei zile v2):** (b) **20 de sesiuni principal** ⇒ în `lib/v1-proba.mjs` `principal: 20` și
  `perioadeCerute: { 5: 30, 20: N20 }` (cu regula de mai sus N20 > 120, ~9,5 ani; cu 60 de perioade puterea e 32,0 % ⇒ de scris cinstit
  „sub 50 %”), `PROTOCOL.putere.rezultate[20]` din `revizie.probe.*.k20`, același lucru în `lib/premarket-proba.mjs`; testele care fixează
  principalul (`tools/v1-proba.test.mjs`, `tools/premarket-proba.test.mjs`) și un rând nou în tabelul amprentelor. (c) **t pe mediile
  perioadelor** (≈ +50 % eficiență) ⇒ un judecător nou în `judeca`, cu mărimea simulată pe forma reală a diferențelor înainte (necodat).
  Ambele orizonturi cu verdict ⇒ corecție Holm între ele, scrisă înainte.
- **Amprenta (🟡7).** Evaluatorul acoperă acum și înregistrarea zilei (`inregistrare`, cu codurile `COD` în reguli) și `adauga`, plus funcțiile
  înghețului. Tabelul „Amprentele v2” de la sfârșit are rândurile, cu motivul fiecăruia (toate înaintea primei zile v2).


## Amprentele v2 (tabel care doar crește; rândul de jos e cel în vigoare)
Scris pe 27.10.2026 (revizia independentă a lotului F, 🔵17: o singură linie se putea rescrie fără urmă). Fiecare rând nou se adaugă
dedesubt, cu motivul; un rând vechi nu se șterge și nu se rescrie (garda: `tools/probe-amprente.test.mjs`). Un rând nou după prima zi
v2 notată înseamnă o regulă nouă ⇒ o probă nouă, scrisă înainte (nu un rând aici).

| Data | Amprenta | Ce s-a schimbat | Zile v2 notate atunci |
|---|---|---|---|
| 27.10.2026 | `v1-2a71899d9bf5` | protocolul v2 (lotul F; evaluatorul `238115b9d45e`) | 0 |
| 27.10.2026 | `v1-e7e7526efd5a` | revizia F 🔴2: perioadele și judecata înghețate în `v1-inghetat.jsonl` (evaluatorul citește fișierul) | 0 |
| 27.10.2026 | `v1-e78c757c68c7` | revizia F 🟡7 / 🟡9: evaluatorul acoperă și `inregistrare` (cu `COD`) și `adauga`; prima notare a unei zile rămâne | 0 |
| 27.10.2026 | `v1-bec732f9281a` | revizia F, decizia (a): principal 5 sesiuni la N = 30, 20 de sesiuni doar monitorizare; textul rezervei la N = 30 (evaluatorul `7fc3524ca5ba`) | 0 |
| 28.10.2026 | `v1-cf90f3811a5c` | revizia F2 🟡3: versiunea acoperă și funcțiile din `lib/daily-series.js` chemate de reguli (`DailySeries.read`, garda sesiunilor neînchise, și `DailySeries.date`); evaluatorul e închiderea calculată din sursă (intră și `ziValida`, `baraValida` — filtrul barelor mutat din robot —, `COD`, `INDEX`) plus înregistrarea judecății din contract; ρ din textul rezervei cu o zecimală (🔵15). Calendarul bursei, scannerul întreg, contractul și robotul se notează pe zi (`d`), fără repornire (evaluatorul `c4b973eb9617`) | 0 |
