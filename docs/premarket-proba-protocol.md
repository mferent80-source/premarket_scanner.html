# Proba în timp a Premarket Scanner (Top Long) — protocol scris ÎNAINTE de date

Scris pe 18.10.2026, înaintea primei zile din jurnal (Marius: „fă audit la Premarket Scanner” → „rezolvă toate”; din audit:
scorurile Premarket nu erau în nicio probă în timp). Aceeași metodă ca proba Reguli V1 (`docs/v1-proba-protocol.md`).
Orice schimbare a regulilor de clasament Premarket sau a acestui protocol **repornește proba de la zero**: versiunea din jurnal e
amprenta (SHA-256) codului care decide clasamentul (`momentumScore`, `analyze`, `capSectors`, `benchmarkReturns`, `rankResults`
din `candidate-engine/engine.js`); evaluarea folosește doar zilele cu amprenta de acum.

## Ipoteza (una singură, ca să nu înmulțim încercările)
- **Principală:** acțiunile din **Top Long** al Premarket Scanner (primele 10 după scorul de momentum, cel mult 2 pe sector, doar cele
  „eligibile”) au, pe următoarele **20 de sesiuni**, un randament peste reper mai mare decât restul acțiunilor verificate din universul
  Core în aceeași zi.
- **Secundară:** același lucru pe **5 sesiuni**.
- **Doar descriptiv, fără verdict:** Early Reversal (notat în jurnal, nejudecat). Un al doilea test ar dubla șansa unei „dovezi” false.

## Ce se notează
- Robotul `tools/premarket-jurnal.mjs`, în același flux zilnic ca proba V1 (`.github/workflows/v1-proba.yml`), după închiderea SUA.
- Universul e **înghețat**: cele 85 de acțiuni Core (aceeași listă ca proba V1, `lib/v1-proba.mjs`).
- Motorul e **exact codul paginii** (`candidate-engine/engine.js`), rulat în robot, cu aceste diferențe față de telefon, fixate acum:
  - Governor = TRADE (proba judecă clasamentul tehnic, nu limitele contului);
  - fără calendarul de raportări (cheia Finnhub nu e în robot) ⇒ aceeași penalizare „neverificat” pentru toate acțiunile;
  - sectoarele din harta de bază a aplicației (`lib/early-long.js`), fără completarea de la Yahoo;
  - fără watchlist.
- Pentru fiecare acțiune verificată: dacă e în Top Long, scorul, data sesiunii EOD, reperul (SPY / IVV pentru SUA, ^STOXX / ^STOXX50E
  pentru Europa) și dacă e în Early Reversal.

## Cum se judecă (identic cu proba V1)
- Randamentul în exces = randamentul acțiunii pe următoarele k sesiuni ale ei − randamentul reperului pe aceleași date.
- Grupul **SUS** = în Top Long. Grupul **JOS** = verificate, dar nu în Top Long.
- Doar **perioade care nu se suprapun**; o perioadă contează doar cu cel puțin 3 acțiuni cu rezultat în fiecare grup.
- **Testul semnelor**, unilateral, pe diferența medie SUS − JOS a fiecărei perioade. Mărimea testului e verificată prin simulare pe
  prețuri aleatorii (`tools/premarket-proba.test.mjs`): sub 5% „dovezi” false.
- **Minimum 8 perioade** pentru orice verdict.

## Verdictele
- **„Încă nu se poate spune”** — mai puțin de 8 perioade.
- **„Top Long ajută”** — cel puțin 8 perioade, media diferenței > 0 și p ≤ 0,05.
- **„Nu s-a văzut un avantaj”** — altfel. NU înseamnă „s-a dovedit că nu ajută”.

## Ce NU face proba
- Nu ține cont de costuri, spread sau intrarea reală (prețuri de închidere EOD); nu judecă stopul și ținta de 2R.
- Nu schimbă nimic în aplicație: doar adună dovezi.

## Anexa A — monitorizare: bilanțul săptămânal și alarma de abatere (scrisă pe 19.10.2026, I-717)
Scrisă pe 19.10.2026, când proba avea 2 zile în jurnal și **nicio perioadă închisă** (deci înainte de orice rezultat).
**Anexa NU schimbă proba:** ipoteza, universul, motorul, măsura, testul semnelor, minimul de 8 perioade și verdictele de mai sus rămân
exact cele din 18.10.2026; amprenta probei rămâne `pm-cb956aef5680`, deci proba NU repornește. Anexa doar arată proba din mers.
- **Bilanțul:** sâmbăta (`.github/workflows/premarket-bilant.yml`, `tools/premarket-bilant.mjs`), un mesaj pe Discord:
  „Top Long în probă · N/8 · media SUS − JOS până acum ±x % · nimic de hotărât încă” (plus orizontul secundar de 5 sesiuni).
  Cifrele sunt cele scrise zilnic de robot în `premarket-proba.json`; bilanțul nu calculează nimic altfel. Se trimite **doar când s-a
  închis o perioadă nouă** față de ultimul mesaj trimis; după 8 perioade, în locul lui „nimic de hotărât încă” apare verdictul probei.
- **Alarma de abatere** (doar pe orizontul principal, 20 de sesiuni, de la 3 perioade): media diferențelor SUS − JOS sub
  **prag(k) = −1,645 × 3,4 % / √k** ⇒ −3,2 % după 3 perioade, −2,8 % după 4, −2,5 % după 5, −2,3 % după 6, −2,0 % după 8,
  −1,9 % după 9, −1,6 % după 12.
- **De ce acest prag:** aceeași idee ca alarma Trend (percentila 5 a mediei pe k perioade sub un avantaj de referință), dar
  referința e **0**, nu un avantaj din istorie: Top Long n-are unul (cercetarea din 19.10.2026, H1: −0,4 % față de restul acțiunilor
  la 20 de sesiuni, 2022–2026). Abaterea pe perioadă, 3,4 %, e cea măsurată tot acolo (47 de ferestre de 20 de sesiuni care nu se
  suprapun). Sub prag, chiar și un avantaj zero devine improbabil (5 %, unilateral, la acea privire).
- **Cât de des sună fără motiv** (simulare, mulberry32, sămânță fixă, priviri după fiecare perioadă de la 3 la 8): 11,7 % dacă Top
  Long n-are niciun avantaj, 6,5 % cu un avantaj de +0,5 % pe perioadă, 20,5 % cu −0,5 %. Universul Core (85) poate fi mai volatil
  decât cel din cercetare (200) ⇒ alarma poate suna ceva mai des. De aceea e **o alarmă de revăzut, nu un verdict**: nu oprește proba,
  nu schimbă regulile și nu e un semnal de cumpărare sau de vânzare.

## La următoarea repornire (scris pe 19.10.2026, I-720 — NU se aplică probei de acum)
Proba de acum (`premarket-proba-1`) judecă **fără calendarul de raportări**, cum scrie mai sus („Ce se notează”), și rămâne așa până la
capăt. Ce s-a pregătit pentru o repornire planificată (una care oricum ar avea alt motiv — ex. stopul Early Reversal, dacă umbra din
`docs/reversal-stop-umbra-protocol.md` dă verdictul „ajută”):
- **Capacitatea există, dar e OPRITĂ:** `PROTOCOL.calendar === false` în `lib/premarket-proba.mjs`; robotul (`calendarPentruProba` din
  `tools/premarket-jurnal.mjs`) nu face nicio cerere cât timp comutatorul e oprit. Testul `tools/premarket-calendar.test.mjs` fixează
  că e oprit pentru `premarket-proba-1`. Secretul `FINNHUB_API_KEY` ajunge la pasul robotului, dar nu e citit.
- **La repornire:** o probă nouă (`id` nou, ex. `premarket-proba-2`), cu protocolul rescris ÎNAINTE de date, pune `calendar: true`.
  Atunci robotul citește calendarul Finnhub pe 14 zile (aceleași tickere ca garda paginii) și motorul îl folosește exact ca pagina ⇒
  proba judecă același clasament pe care îl vede omul (penalizarea de raportări pe fiecare acțiune, nu „neverificat” pentru toate).
- **Închis la eroare:** cu comutatorul pornit, fără cheie sau cu un răspuns care nu e calendar, robotul se oprește (fluxul reîncearcă
  și anunță pe Discord) — o zi judecată fără calendar ar amesteca regulile probei.
- Pornirea comutatorului fără o probă nouă e interzisă: ar schimba ce se judecă la mijlocul probei.

## Protocolul v2 — o singură judecată, puterea scrisă înainte (27.10.2026, I-741 / I-743)
*(27.10.2026: înlocuit parțial de § „Revizia independentă din 27.10.2026” de mai jos — acolo sunt regulile în vigoare.)*
Scris pe **27.10.2026**, înaintea oricărei zile notate sub v2. Proba `premarket-proba-1` (amprenta `pm-cb956aef5680`) avea 2 zile în
jurnal (16.10 și 23.10) și **niciun verdict** (0 / 8 perioade la 20 de sesiuni, 1 / 8 la 5). **Proba repornește ca `premarket-proba-2`**:
zilele ei rămân în `scanner-verdicts/generated/premarket-jurnal.json` sub amprenta veche — nu se șterg, nu se rescriu, nu intră în v2.
Evaluatorul e comun cu Reguli V1, deci motivele și regulile noi sunt aceleași ca în `docs/v1-proba-protocol.md` § „Protocolul v2”:
verdictul recalculat la fiecare perioadă nouă (≈ 15 % „ajută” fals în primul an la 5 sesiuni), puterea mică la 8 perioade (12,2 % la
+1 %/perioadă pe 20 de sesiuni, 30,3 % pe 5), acțiunile delistate ieșite tăcut din medii — plus amprenta care nu acoperea tot motorul.

**Ce rămâne exact ca în v1:** ipoteza (Top Long față de restul verificate, aceeași zi), universul Core înghețat, motorul paginii rulat în
robot cu Governor = TRADE, fără raportări, cu harta de sectoare de bază, fără watchlist; măsura, perioadele care nu se suprapun, minimum 3
pe grup, testul semnelor unilateral, α = 0,05; Early Reversal doar descriptiv.

**Ce se schimbă (fixat acum):**
- **O singură judecată, la exact N perioade: N = 16 la 5 sesiuni, N = 60 la 20 de sesiuni** (eșantion fix, apoi doar monitorizare).
- **Puterea Top Long, simulată înainte** (aceeași metodă ca la V1; grupurile din jurnalul real: 66 verificate, 10 în top; abaterea pe
  perioadă sub H0 3,4 % la 20 de sesiuni — cea din Anexa A): la N = 16 (5 sesiuni) „ajută” fals 3,4 %, +0,5 %/perioadă 18,8 %, **+1 % 52,6 %**;
  la N = 60 (20 de sesiuni) fals 3,5 %, +0,5 % 20,2 %, **+1 % 54,6 %**. La 8 perioade: 30,3 % și 12,2 %. Grila întreagă: `docs/proba-putere-2026-10-27.json`.
- **Mărimea cu persistență și regula de citire:** ca la V1 (3,7 % / 4,6 % cu perioade independente; ρ = 0,2 ⇒ 6,3 % / 7,0 %); de la
  persistența 0,2 un „ajută” se scrie „cu rezerve”.
- **Delistate:** ieșire la ultima închidere după orizont + 10 sesiuni; fără serie ⇒ „nejudecat”, cu motiv, numărat.
- **Versiunea acoperă tot ce decide Top Long:** `pm-` + SHA pe (a) cele 5 funcții de mai sus (textul motorului care rulează), (b) toate
  ajutoarele de sus din `candidate-engine/engine.js` folosite de ele, tranzitiv (azi: `BENCHMARKS`, `EU_CORE`, `avgDollarVol`, `clamp`,
  `closes`, `daysSinceLow`, `earningsInfo`, `gardaEarnings`, `highs`, `lastValue`, `lows`, `mean`, `pct`, `regionOf`, `retAt`, `safeNum`,
  `volumes`, `zileNY` — auditul F găsise 17 neamprentate), fără afișaj: `fmt`, `signed`, `procente`, `fapteCandidat`, `sparkValues`, `$`,
  `state` (containerul paginii) și `reversalScore` (decide doar lista Early Reversal, are amprenta umbrei); (c) evaluatorul comun (amprenta
  lui din `lib/v1-proba.mjs` + `evalueaza` de aici). **Amprenta la pornirea v2:** rândul de jos din tabelul „Amprentele v2” de la
  sfârșitul documentului (tabel care doar crește). Garda din suită
  (`tools/probe-amprente.test.mjs`) pică dacă diferă de cea scrisă aici; garda din fluxul robotului (`tools/top-long-proba.test.mjs`) oprește
  notarea dacă diferă de cea din fișierul probei.
- **Dependențele notate pe zi (`d`)** acoperă acum și `lib/me-early-bird.js`, `lib/decision-verdict.js` și **tot** `candidate-engine/engine.js`:
  nu repornesc proba, dar orice schimbare din motor rămâne la vedere, cu ziua ei (`dependinte` în fișier).
- **Comutatorul calendarului rămâne OPRIT în `premarket-proba-2`** (`PROTOCOL.calendar === false`). Secțiunea de mai sus („La următoarea
  repornire”) pregătise pornirea lui la o repornire care oricum ar avea alt motiv; repornirea de azi e una, dar comutatorul NU se pornește,
  cu motivul scris acum: (1) repornirea e cerută de regula de judecată, nu de clasament — proba trebuie să judece același clasament ca v1,
  ca diferența dintre v1 și v2 să fie doar judecata; (2) robotul tocmai pierduse 5 din 7 sesiuni, iar cheia `FINNHUB_API_KEY` din Actions
  nu e verificată — calendarul e „închis la eroare”, deci o cheie lipsă ar opri zilnic pasul Premarket și, odată cu el, umbra stopului
  (același pas). Pornirea rămâne pregătită pentru o probă `premarket-proba-3`, cu protocolul scris înainte — **decizia LUI**, după ce robotul
  merge curat ≥ 20 de sesiuni și cheia e verificată.
- **Când poate veni primul verdict:** 5 sesiuni — optimist ~**23.02.2027**, realist ~**mai 2027**; 20 de sesiuni — optimist ~**iunie 2031**,
  realist ~2032 (aproximativ dincolo de calendarul oficial). Fișierul robotului le recalculează zilnic (`primulVerdict`).
- **Plafonul de risc (I-709) rămâne 0,25 %** până la un „Top Long ajută” la judecata unică — adică, cel devreme, cel puțin până în 2027
  pe orizontul secundar și 2031 pe cel principal (desk citește verdictul orizontului principal).

**Verdictele v2:** „Încă nu se poate spune” (sub N perioade) · „Top Long ajută” (la exact N: media > 0 și p ≤ 0,05; „cu rezerve” dacă
persistența ≥ 0,2) · „Nu s-a văzut un avantaj” (altfel — NU „s-a dovedit că nu ajută”).

**Anexa A sub v2 (monitorizare, nu verdict):** bilanțul și alarma rămân cum sunt scrise (pragul −1,645 × 3,4 % / √k, de la 3 perioade,
doar orizontul principal); „după 8 perioade” devine „după N perioade” (bilanțul citește `necesare` din fișier). Privirile continuă însă
peste 8: alarma sună fără motiv în 11,6 % din lumile fără avantaj până la 8 perioade, **16,2 % până la 16 și 24,8 % până la 60**
(simulare, 20.000 de lumi, mulberry32); cu −0,5 %/perioadă sună în 56,5 % până la 60. E o alarmă de revăzut, nu un semnal.

## Revizia independentă din 27.10.2026 — reparațiile, scrise ÎNAINTEA primei zile v2 (regulile în vigoare)
Scris pe **27.10.2026**, după revizia independentă a lotului F („nu se publică până la reparații”). Nicio zi v2 nu e notată (jurnalul are doar
16.10 și 23.10, sub `pm-cb956aef5680`) ⇒ nimic nu se pierde și nu e o repornire. Unde secțiunea „Protocolul v2” de mai sus spune altceva, e în
vigoare ce scrie aici. Evaluatorul e comun cu Reguli V1 (`docs/v1-proba-protocol.md`, aceeași secțiune).

- **Ordinea lipirii (🟡5).** Lotul D (`candidate-engine/engine.js`) s-a lipit întâi; amprenta s-a recalculat pe codul lipit și s-a scris
  înaintea primei zile v2 (`pm-f9f254159993` ⇒ `pm-0dc4d07a4a73`: doar textul din `earningsInfo` / `gardaEarnings`; penalizarea, `blocked` și
  ramurile în care garda e nevidă au rămas identice). Garda din fluxul robotului (`tools/top-long-proba.test.mjs`) compară acum amprenta de azi
  și cu cea din tabelul de mai jos cât timp fișierul probei e încă al probei precedente — o lipire după protocol oprește robotul înainte de v2.
- **Prețurile:** robotul Top Long reia deja totul pe intervalul probei (19.10); acum doar zilele versiunii de acum și seriile tăiate la ziua
  notată (🟡10).
- **Perioadele și judecata se îngheață (🔴2).** O perioadă (start + k sesiuni) se îngheață când s-au scurs orizontul **+ cele 10 sesiuni de
  așteptare** — atunci fiecare acțiune e definitivă (randament, ieșire la ultima închidere sau „nejudecată”). Perioada, cu randamentele ei, se
  scrie o singură dată în `scanner-verdicts/generated/premarket-inghetat.jsonl` (JSONL, fișier care doar crește; garda `tools/probe-inghetat.test.mjs`, în suită și în fluxul robotului).
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
  măsurată (`node tools/proba-putere.mjs --proba toplong --k 5 --sigmaPerioada 0.0227 --verificate 85 --sus 10`, 2000 de lumi, mulberry32;
  `docs/proba-putere-2026-10-27.json`, cheia `revizie`).

  | | Top Long |
  |---|---|
  | abaterea pe perioadă, 5 sesiuni / 20 de sesiuni (motorul real) | **2,27 %** / **4,89 %** (revizia: Core 1,7–3,4 % / 4,3–7 %) |
  | autocorelarea perioadelor ρ₁ (5 / 20) | 0,02 / −0,09 |
  | grupurile medii (SUS / JOS) | 10 / 75 |
  | puterea la +1 %/perioadă, 5 sesiuni, pe grilă | 16: 34,0 % · 20: 29,1 % · 24: 42,1 % · **30: 59,3 %** · 36: 59,5 % · 40: 67,0 % · 48: 69,7 % · 60: 83,3 % |
  | **la N = 30**: „ajută” fals / +0,5 % / +1 % | **3,9 % / 23,9 % / 59,3 %** |
  | la N = 30, pe forma REALĂ a diferențelor (exact binomial) / normala cu aceeași abatere | 69 % / 60,1 % la +1 % |
  | la N = 30 cu abaterea pesimistă a reviziei (3,4 %, selecție de tip momentum) | 35,5 % la +1 % |
  | 20 de sesiuni, la 60 de perioade (doar monitorizare) | +1 % văzut în 29,6 % (de aceea nu mai e verdict) |

  Puterea testului semnelor nu crește monoton cu N (pragul binomial sare din 2 în 2), de aceea grila are și 20 / 24. **Mărimea la N = 30**
  (20.000 de lumi, `revizie.marime`): perioade independente **4,9 %** (coada binomială exactă 4,94 %); cu persistență ρ = 0,1 ⇒ 6,0 %,
  ρ = 0,2 ⇒ 7,7 %, ρ = 0,3 ⇒ 9,2 %. Persistența măsurată pe istoric e ~0 (0,02), deci mărimea reală e cea fără persistență. Regula
  „cu rezerve” (ρ̂ ≥ 0,2) rămâne; spus cinstit, ρ̂ ≥ 0,2 iese și din zgomot în **9,4 %** din cazuri la 30 de perioade (simulare, 20.000 de
  lumi) — o rezervă e un semnal de verificat, nu o dovadă de persistență. Un „ajută” cu rezerve **nu ridică plafonul** desk-ului (🟡11,
  politica F § 2).
- **Decizia de protocol (a) — IPOTEZĂ declarată, ușor de schimbat până la prima zi v2 notată; motivul: recomandarea reviziei independente din
  27.10.2026.** **Verdictul principal e pe orizontul de 5 sesiuni, la exact N = 30 de perioade** (cel mai mic N din grilă la care +1 %/perioadă
  e văzut în ≥ 50 % din lumi, cu abaterea măsurată). **Orizontul de 20 de sesiuni rămâne monitorizare, cu bilanț, fără verdict** (`necesare:
  null`, `verdict: "monitorizare"` în fișier; perioadele lui se îngheață și se numără la fel): la 60 de perioade verdictul ar fi venit pe
  ~22.08.2031, cu puterea 29,6 %. Spus cinstit: 5 sesiuni răspund la „ajută pe o săptămână?”, nu la „ajută planul de 20 de zile?”.
  „Nu s-a văzut un avantaj” rămâne rezultatul cel mai probabil dacă avantajul e mic și **nu înseamnă „s-a dovedit că nu”**.
- **Primul verdict posibil:** 30 de perioade de 5 sesiuni de la prima zi v2 (28.10.2026) + 10 sesiuni până la înghețarea ultimei ⇒ optimist
  ~**17.06.2027** (calendarul oficial NYSE); realist mai târziu, cu cât pierde robotul zile (`primulVerdict.realist` în fișier). Dincolo de
  2027, sărbătorile NYSE se calculează după regulile bursei (🔵12), nu se mai numără doar zilele lucrătoare.
- **Dacă LUI îi alege altfel (tot înaintea primei zile v2):** (b) **20 de sesiuni principal** ⇒ în `lib/v1-proba.mjs` `principal: 20` și
  `perioadeCerute: { 5: 30, 20: N20 }` (cu regula de mai sus N20 > 120, ~9,5 ani; cu 60 de perioade puterea e 29,6 % ⇒ de scris cinstit
  „sub 50 %”), `PROTOCOL.putere.rezultate[20]` din `revizie.probe.*.k20`, același lucru în `lib/premarket-proba.mjs`; testele care fixează
  principalul (`tools/v1-proba.test.mjs`, `tools/premarket-proba.test.mjs`) și un rând nou în tabelul amprentelor. (c) **t pe mediile
  perioadelor** (≈ +50 % eficiență) ⇒ un judecător nou în `judeca`, cu mărimea simulată pe forma reală a diferențelor înainte (necodat).
  Ambele orizonturi cu verdict ⇒ corecție Holm între ele, scrisă înainte.
- **Versiunea acoperă ce decide Top Long (🟡7) — afirmația „tot” din v2 era prea mare.** Pe lângă cele 5 funcții, ajutoarele lor și
  evaluator, intră acum: funcțiile din biblioteci **apelate** de codul Top Long, aflate din textul motorului (nu dintr-o listă scrisă de mână) —
  `TI.calcEMA`, `TI.calcRSI`, `TI.calcATR` din `lib/indicators.js` (decid scorul și `eligible`) și `EL.sectorOf` cu harta `SECTOR_SEED` din
  `lib/early-long.js` (decide `capSectors`; `CFG` exclus — robotul pornește cu stocarea goală) —, cu închiderea lor tranzitivă; `inregistrare`
  (codul „în Top Long”), `adauga`, perioadele cerute și orizontul principal. `lib/daily-series.js`, `lib/exchange-calendar.js` și restul
  motorului rămân în amprenta dependențelor notată pe zi (`d`): se văd, dar nu repornesc proba. Test: `tools/probe-amprente-acoperire.test.mjs`.
- **Plafonul (I-709) rămâne 0,25 %** până la un „Top Long ajută” fără rezerve la judecata unică — cel devreme ~17.06.2027.
- **Anexa A** (alarma bilanțului, −1,645 × 3,4 % / √k) e scrisă pentru perioade de 20 de sesiuni și rămâne pe orizontul de 20 (monitorizare).
  Spus cinstit (revizia, 🔵13): cu abaterea reală (4,9 %) alarma sună fără motiv mai des decât scrie Anexa (revizia: 39–63 % până la 60 de
  perioade); e o alarmă de revăzut, nu un verdict — pragul nu s-a schimbat aici (decizia LUI).


## Amprentele v2 (tabel care doar crește; rândul de jos e cel în vigoare)
Scris pe 27.10.2026 (revizia independentă a lotului F, 🔵17: o singură linie se putea rescrie fără urmă). Fiecare rând nou se adaugă
dedesubt, cu motivul; un rând vechi nu se șterge și nu se rescrie (garda: `tools/probe-amprente.test.mjs`). Un rând nou după prima zi
v2 notată înseamnă o regulă nouă ⇒ o probă nouă, scrisă înainte (nu un rând aici).

| Data | Amprenta | Ce s-a schimbat | Zile v2 notate atunci |
|---|---|---|---|
| 27.10.2026 | `pm-f9f254159993` | protocolul v2 (lotul F) | 0 |
| 27.10.2026 | `pm-0dc4d07a4a73` | lipirea lotului D: doar textul din `earningsInfo` / `gardaEarnings` (penalizarea, `blocked` și ramurile în care garda e nevidă, identice) | 0 |
| 27.10.2026 | `pm-55900c0f3060` | revizia F 🔴2: perioadele și judecata înghețate în `premarket-inghetat.jsonl` (evaluatorul comun citește fișierul) | 0 |
| 27.10.2026 | `pm-8184f0aef323` | revizia F 🟡7 / 🟡9: versiunea acoperă și indicatorii apelați (`TI.calcEMA`, `TI.calcRSI`, `TI.calcATR` din `lib/indicators.js`), harta de sectoare (`EL.sectorOf` din `lib/early-long.js`, fără `CFG`), `inregistrare`, `adauga`, perioadele cerute și orizontul principal; prima notare a unei zile rămâne | 0 |
| 27.10.2026 | `pm-20f73dff32f3` | revizia F, decizia (a): principal 5 sesiuni la N = 30 (puterea Top Long, abaterea măsurată 2,27 %), 20 de sesiuni doar monitorizare | 0 |
