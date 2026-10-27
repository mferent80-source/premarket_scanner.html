# Verdictul pieței — regulile și proba înainte (I-676 / I-677)

Scris pe **17.10.2026**, înaintea primei zile notate de robot. Codul: `lib/market-verdict.js` (regulile), `lib/macro-regime.js` (regimul macro, copiat fidel din Crypto Radar), `tools/verdict-piata-robot.mjs` (notarea și proba).

## Ce descrie verdictul

Scala **Defensiv (≤ −3) · Prudent (−2…−1) · Neutru (0…2) · Favorabil (≥ 3)** e suma a 6 indicatori (fiecare −2…+1; necitit = nu se numără; sub 3 citiți = „Neconfirmat”):

| Indicator | Regula |
|---|---|
| Trendul (SPY, QQQ) | +1 peste mediile de 50 și 200 de zile, −1 sub amândouă, altfel 0 (media celor două, rotunjită simetric: ±0,5 ⇒ ±1) |
| Participarea | % S&P 500 peste media de 50 de zile: ≥ 60 → +1, ≤ 40 → −1 |
| Volatilitatea (VIX) | < 16 → +1, ≤ 22 → 0, ≤ 30 → −1, peste → −2; **salt ≥ 15% într-o zi** sau **VIX pe 9 zile peste VIX pe 3 luni** (ipoteză, I-679) ⇒ cel mult −1 |
| Dobânzi și credit | dobânda pe 10 ani pe 21 de sesiuni: > +25 pb → −1, < −25 pb → +1; **HYG / IEF cu peste 1% sub media de 50 de zile** (ipoteză, I-680) ⇒ cel mult −1 |
| Regimul macro | treptele Crypto Radar (5 semnale): risk-on / înclinat → +1, neutru → 0, prudent → −1, risk-off / stres → −2; date parțiale = necitit |
| Sectoarele care conduc | 2 din primele 3 defensive → −1; toate 3 ciclice → +1 |

Informații fără scor: mișcarea tipică pe zi din VIX (±VIX/√252), maximele / minimele noi, zilele de distribuție, companiile mici, expirarea opțiunilor (a treia vineri; quad witching în martie / iunie / septembrie / decembrie), rezultatele celor mai mari 15 companii (calendarul Nasdaq), futures doar între 04:00 și 09:30 la New York, beta portofoliului (I-678).

## Notarea (I-676)

Robotul de noapte (`.github/workflows/verdict-piata.yml`) calculează verdictul cu aceleași reguli și notează o linie pe sesiune în `candidate-engine/generated/verdict-piata-istoric.jsonl`. **Prima notare a zilei rămâne**, fișierul doar crește (gardă), iar o linie contează la probă doar dacă a fost notată **înainte de deschiderea sesiunii următoare**.

## Proba (I-677)

- **Ipoteza:** după zilele „Prudent / Defensiv”, S&P (SPY) are o cădere maximă mai mare în următoarele **5 sesiuni** decât după zilele „Neutru / Favorabil”. (Scala servește la dozarea riscului; asta trebuie să facă.)
- **Măsura:** căderea maximă a închiderii SPY față de închiderea zilei verdictului, în următoarele 5 sesiuni; randamentul pe 5 sesiuni e raportat, nu judecat.
- **Zile separate:** se păstrează doar zilele la cel puțin 5 sesiuni una de alta (orizonturile nu se suprapun).
- **Testul:** Welch unilateral pe căderi (grupul „redus” mai negativ), **α = 0,05**. *(Înlocuit pe 27.10.2026 — § „Revizia independentă” de la sfârșit: permutarea pe episoade de etichetă; apoi pe 28.10.2026 de rotație — § „Revizia F2”.)*
- **Verdict:** abia după **≥ 20 de zile separate în fiecare grup**; până atunci „în probă” (scris pe panou). „Ajută” = căderea medie mai mare în grupul „redus” și p < 0,05; altfel „nu ajută” — verdictul rămâne descriere, nu avertizare.
- **Mărimea testului, verificată prin simulare înainte de livrare** (date fără niciun efect, 2000 de repetări): 4,0% „ajută” fals cu etichete aleatoare, 4,3% cu etichete care persistă (α nominal 5%).
- Regulile de mai sus nu se schimbă după ce apar rezultate; o regulă nouă înseamnă o probă nouă, de la zero.

## Schimbări

- **17.10.2026 (revizia independentă, înainte de orice rezultat al probei):** media trendului se rotunjește simetric (`Math.round(−0,5)` dădea 0, iar `Math.round(0,5)` dădea 1 — favoriza „Favorabil”); raportul HYG / IEF se calculează pe zilele comune (aliniat pe dată). Istoricul avea 1–2 notări; nu se rescrie.
- **27.10.2026 (auditul F, I-743; scris înaintea oricărui verdict: 7 zile notate, 1 zi separată „redus” și 0 „normal”):**
  - **Versiunea regulii pe fiecare linie.** Liniile noi din `verdict-piata-istoric.jsonl` poartă `regula: "v2.1"` (regula din `docs/setup-filtru-piata.md`, versiunea 2.1). Liniile vechi nu se rescriu (fișierul doar crește); o linie fără `regula` contează ca v2.1 doar dacă a fost notată după revizia de mai sus (17.10.2026, 13:06 UTC). **16.10 (notat la 10:25 UTC, „Defensiv”, −3) a fost notat sub regula dinaintea reviziei ⇒ rămâne în istoric, dar nu intră în probă** — „o regulă nouă înseamnă o probă nouă” se aplică și aici. Fișierul probei arată liniile excluse (`proba.excluse`). Efectul azi: singura zi „redus” iese, proba are 0 „redus” și 1 „normal”.
  - **Judecata o singură dată (eșantion fix).** Verdictul se dă **o singură dată**, pe zilele separate de până în ziua în care ambele grupuri ajung **prima dată** la 20; zilele de după sunt doar monitorizare (`proba.monitorizare`), fără alt verdict. De ce: regula de până azi rejudeca în fiecare noapte după 20 / 20 — simularea (20.000 de lumi, mulberry32, etichete independente de viitor, SPY cu pași N(0; 1 %)) dă „ajută” fals în **8,6–14,4 %** din lumi cu rejudecarea zilnică, față de **3,8–5,3 %** la eșantion fix (30 % zile „redus” cu persistență, respectiv 50 % fără). Mărimea „4,0 / 4,3 %” de mai sus era a eșantionului fix.
  - **Mărimea și puterea, simulate înainte, în depozit** (`rataAjuta` / `lumeVerdict` din `tools/verdict-piata-robot.mjs`, testul `tools/verdict-piata-robot.test.mjs`, 2000 de lumi, 30 % zile „redus”, persistența 0,8): „ajută” fals **4,0 %**; o cădere maximă **în plus de 0,5 puncte procentuale** după zilele „redus” e văzută în **14,3 %** din cazuri, una de **1 punct** în **34,9 %**. Proba vede doar o diferență mare; „nu ajută” va fi rezultatul cel mai probabil și nu înseamnă „s-a dovedit că nu”.
  - **Amprenta judecătorului (auditul F, înlocuită pe 27.10.2026 de revizie — vezi mai jos) `jv-0612f187c9e9`** (funcțiile `deRegula`, `welch`, `proba`, `tcdf` + pragurile); robotul o scrie în `verdict-piata.json` (`judecator`), garda `tools/probe-amprente.test.mjs` pică dacă codul de azi dă alta. Regula verdictului (`lib/market-verdict.js`) NU e amprentată (scorurile și textele stau în aceleași funcții): o schimbare de scor cere `REGULA` nouă (`v2.2`) și o linie aici.
  - **Primul verdict posibil:** când ambele grupuri au câte 20 de zile separate — cu 30 % zile „redus”, ~**23.02.2028**; cu 20 %, ~**11.10.2028** (aproximativ, dincolo de calendarul oficial NYSE). Robotul o recalculează în fiecare noapte (`primulVerdict`), din ponderea văzută și din sesiunile pierdute.

## Revizia independentă din 27.10.2026 (🔴4) — testul de permutare pe episoade, scris înaintea primei zile „redus” măsurate
**Starea la scriere:** sub regula v2.1 sunt notate 6 zile (19–26.10); una singură e „redus” (23.10, „Prudent”), iar căderea ei pe 5 sesiuni
se închide abia pe 30.10 ⇒ nicio zi „redus” măsurată, nicio judecată. Motivul: **recomandarea reviziei independente din 27.10** — Welch
tratează zilele separate ca independente; cu SPY cu volatilitate în ciorchini (cum e în realitate) și etichete persistente, „ajută” fals
urcă peste 5 % (revizia: 5,7–7,7 %).

**Testul (fixat acum):** permutarea pe **episoade de etichetă**. Un episod = un bloc de zile separate **consecutive** cu aceeași etichetă
(zilele dintr-un episod au aceeași piață, deci nu sunt independente). Episoadele rămân întregi; se permută doar **care** episoade sunt
„redus”, cu numărul lor fixat. Statistica e **studentizată** (t-ul Welch pe zile: diferența mediilor căderilor / eroarea ei); p unilateral
= partea aranjamentelor cu statistica ≤ cea observată — exact când aranjamentele sunt ≤ 4000, altfel 4000 de trageri mulberry32 cu sămânța
`17102026`, p = (1 + #) / (1 + 4000). **„Ajută” = căderea medie mai mare în grupul „redus” și p ≤ 0,05**, pe același eșantion fix (primul
20 / 20 de zile separate), judecat o singură dată. Welch rămâne doar în `monitorizare.ajutaOricand` — ce ar fi spus regula veche,
rejudecată în fiecare noapte (informativ, fără verdict).

**De ce studentizată, nu diferența simplă a mediilor:** episoadele „redus”, mai rare, sunt mai scurte; permutările le dau grupuri mai mari
decât cel observat ⇒ o distribuție prea îngustă și „ajută” fals până la 6,8 %. Mărimea sub H0 (scratchpad `verdict-marime.mjs`, 4000 de lumi
pe celulă, B = 4000, mulberry32; etichete independente de viitor; „sta” = probabilitatea de a păstra eticheta de ieri; GARCH(1,1) α 0,10,
β 0,88, cozi t5 = lumea reviziei), „ajută” fals la α nominal 5 %:

| SPY | sta | % zile „redus” | Welch (regula veche) | permutare, diferența mediilor | **permutare, studentizată (aleasă)** |
|---|---|---|---|---|---|
| i.i.d. | 0,8 | 30 | 3,5 % | 6,8 % | **4,5 %** |
| i.i.d. | 0,8 | 50 | 5,2 % | 5,2 % | **5,1 %** |
| i.i.d. | 0,9 | 30 | 3,8 % | 6,6 % | **4,1 %** |
| i.i.d. | 0,9 | 50 | 5,4 % | 4,8 % | **4,6 %** |
| i.i.d. | 0,95 | 30 | 4,2 % | 4,4 % | **2,9 %** |
| i.i.d. | 0,95 | 50 | 4,9 % | 3,8 % | **3,3 %** |
| GARCH | 0,8 | 30 | 3,5 % | 5,8 % | **2,4 %** |
| GARCH | 0,8 | 50 | 5,2 % | 3,9 % | **4,0 %** |
| GARCH | 0,9 | 30 | 4,7 % | 5,5 % | **2,6 %** |
| GARCH | 0,9 | 50 | 7,1 % | 4,1 % | **3,9 %** |
| GARCH | 0,95 | 30 | 5,5 % | 3,9 % | **1,8 %** |
| GARCH | 0,95 | 50 | 7,6 % | 2,5 % | **2,5 %** |

Cu volatilitate în ciorchini, testul ales rămâne **≤ 4,0 %** în toate celulele; cel mai rău caz i.i.d. (5,1 %, etichete aproape
independente, test aproape exact) e în banda de zgomot a simulării (± 0,3 pp). Testul din depozit
(`tools/verdict-piata-permutare.test.mjs`) reface cazul cel mai rău al reviziei (GARCH, sta 0,95, 50 %) pe 800 de lumi.

**Puterea** (aceeași lume ca în § „Schimbări”: `rataAjuta`, 2000 de lumi, SPY i.i.d., 30 % zile „redus”, sta 0,8): mărimea **4,1 %**;
o cădere maximă în plus de **0,5 pp** după zilele „redus” e văzută în **13,6 %** din cazuri, de **1 pp** în **33,5 %** (Welch: 14,3 % /
34,9 %) — robustețea costă aproape nimic. „Nu ajută” rămâne rezultatul cel mai probabil și nu înseamnă „s-a dovedit că nu”.

**Amprenta judecătorului (revizia F, înlocuită pe 28.10.2026 de revizia F2 — vezi mai jos) `jv-ef4eca49d1b8`** (înlocuiește `jv-0612f187c9e9`, înaintea oricărei zile „redus” măsurate; `jv-df4d0878840f`
a fost pasul intermediar fără tabelul de mai jos): SHA pe `deRegula`, `welch`, `proba`, `tcdf`, `episoade`, `permutareEpisoade` + pragurile
(`PROBA` cu `test: 'permutare-episoade'`, `permutari: 4000`, `samanta`) + lista `AMPRENTE_V21`.

**Dacă se alege altă variantă (decizia LUI, tot înaintea primei zile „redus” măsurate, 30.10):** (b) Welch cu prag mai strict ⇒ în
`proba` judecata înapoi pe `welch(A, B)` cu `p < 0,03` (`PROBA.alfa` 0,03, `test: 'welch-0,03'`), tabelul de mai sus arată că la sta 0,95
pragul tot nu ajunge (de recalibrat pe GARCH); (c) Welch cu „cu rezerve” ⇒ judecata pe Welch la 0,05 și un câmp `rezerve` scris la
„ajută”. Oricare: amprenta nouă aici, testele de mărime refăcute.

## Revizia F2 din 28.10.2026 (🟡2, 🟡4) — rotația în locul permutării și judecata înghețată, scrise înaintea primei zile „redus” măsurate
**Starea la scriere:** aceeași ca la revizia F: o singură zi „redus” notată (23.10), iar căderea ei pe 5 sesiuni se închide pe 30.10 ⇒
nicio zi „redus” măsurată, nicio judecată. Motivul: **revizia independentă F2 din 28.10**. Permutarea pe episoade avea mărimea bună, dar
la etichete persistente rămâneau prea puține episoade. La persistența 0,98, în 70 % din lumi p-ul minim posibil trecea de 0,05, deci
„nu ajută” ieșea prin construcție. Puterea la +1 pp cădea de la 39,4 % (persistența 0,5) la 10,8 % (0,98).

**Testul (fixat acum): rotația (decalaj circular)** pe zilele separate ale eșantionului fix, în ordinea lor în timp. Etichetele rămân pe
loc, iar șirul căderilor se rotește cu fiecare decalaj 0..n−1. Așa rămân întregi și ciorchinii volatilității SPY, și persistența
etichetelor. Statistica e t-ul Welch pe zile (studentizat). p unilateral = partea decalajelor cu statistica ≤ cea observată, decalajul 0
inclus, deci p minim 1/n. **„Ajută” = căderea medie mai mare în grupul „redus” și p ≤ 0,05**, pe același eșantion fix (primul 20 / 20 de
zile separate), judecat o singură dată. Permutarea pe episoade rămâne în cod doar pentru comparație.

**Mărimea și puterea**, prin funcția reală `proba` (scratchpad `sim-rotatie-f2.mjs`, 4000 de lumi pe celulă, mulberry32, generatorul
reviziei F2; eroarea standard sub 0,8 pp în fiecare celulă):

| Lume | Persistența etichetelor | % zile „redus” | „Ajută” (rotația) |
|---|---|---|---|
| H0, GARCH(0,10; 0,88), cozi t5 | 0,8 | 30 | 4,2 % |
| H0, GARCH(0,10; 0,88) | 0,95 | 30 | 4,6 % |
| H0, GARCH(0,10; 0,88) | 0,98 | 50 | 4,8 % |
| H0, GARCH(0,05; 0,94) | 0,95 | 50 | 4,7 % |
| H0, GJR(0,05; 0,88; γ 0,12) | 0,9 | 50 | 4,8 % |
| H0, GARCH, eticheta „sub media de 50 de zile” | — | — | 0,3 % |
| H0, i.i.d. | 0,9 | 50 | 4,2 % |
| H1, +1 pp de cădere după zilele „redus” | 0,8 | 30 | 35,5 % |
| H1, +1 pp | 0,95 | 30 | 34,8 % |
| H1, +1 pp | 0,98 | 50 | 30,9 % |
| H1, GARCH, „redus” = volatilitatea pe 20 de zile peste mediană (efectul real −0,47 pp) | — | 50 | 9,1 % |

Pe lumea din § „Schimbări” (`rataAjuta`, 2000 de lumi): mărimea 4,0 %, puterea 14,7 % la +0,5 pp și 34,2 % la +1 pp (`PUTERE` în cod).
Rotația are aceeași mărime ca permutarea și nu-și pierde puterea când etichetele sunt persistente. Un efect de volatilitate de ~0,5 pp
rămâne greu de văzut pentru orice test valid, cu ~67 de zile separate.

**Limita cunoscută:** pe date perfect periodice (etichete care alternează la fiecare zi separată și un SPY în blocuri egale), o rotație cu
pas par reface aceeași potrivire, deci p iese 0,5. Etichetele pieței nu alternează așa. Cazul construit din teste a fost înlocuit cu o lume
neperiodică.

**Mesajul la „nu ajută”** spune acum puterea: înseamnă „nu s-a dovedit”, nu „s-a dovedit că nu”, iar o cădere în plus de 1 pp ar fi fost
văzută în ~34,2 % din cazuri. Textul vechi („tratează-l ca descriere, nu ca avertizare”) putea muta, prin text, o decizie de risc (×0,75
la „Prudent”).

**Înghețul (🟡4):** zilele separate închise (ziua, grupul, căderea, randamentul, orizontul `h`) și judecata se scriu în
`candidate-engine/generated/verdict-piata-inghetat.jsonl`, un fișier care doar crește. Robotul îl citește în fiecare noapte: zilele
înghețate nu se mai recalculează din SPY, iar judecata, odată scrisă, nu se mai schimbă (o noapte fără SPY o ștergea înainte în 300 din
300 de lumi). Zilele sunt legate de regulă (`v2.1`) și de orizont, nu de judecător; judecata e legată de amprenta judecătorului. Dacă
judecata scrisă nu se mai potrivește cu zilele înghețate, fișierul probei arată `abatereJudecata`. Fluxul salvează fișierul separat
(`tools/git-add-existente.mjs`).

**Amprenta judecătorului: `jv-6871a59f149e`** (înlocuiește `jv-ef4eca49d1b8`, înaintea oricărei zile „redus” măsurate): SHA pe `deRegula`,
`welch`, `proba`, `tcdf`, `rotatie` + pragurile (`PROBA` cu `test: 'rotatie'`), `REGULA`, `REVIZIE`. Lista `AMPRENTE_V21` a ieșit din
amprentă: ea decide doar ce regulă poartă o linie nouă, nu cum se judecă, iar un rând nou acolo nu mai schimbă judecătorul.

**Decizia LUI, până pe 30.10:** e aplicată varianta (a), rotația, recomandată de revizie. Varianta (b) ar fi permutarea pe episoade cu un
rezultat nou, „fără putere”, când p-ul minim posibil trece de α sau episoadele sunt sub 10. Pentru (b): în `proba`, `rotatie(fix)` înapoi
pe `permutareEpisoade(fix)`, verdictul `fara-putere`, `PROBA.test: 'permutare-episoade'`, testele de mărime refăcute și o amprentă nouă aici.

## Amprentele regulii v2.1 (revizia independentă din 27.10.2026, 🟡8; tabel care doar crește)
`REGULA = 'v2.1'` era scrisă de mână: o schimbare în `lib/market-verdict.js` / `lib/macro-regime.js` nota mai departe sub v2.1. Acum
robotul calculează **amprenta regulii din conținut** (`amprentaRegulii`: SHA pe închiderea lui `compute` + `regimDin` din
`lib/market-verdict.js` — fără `render`, `regula()` pentru Drafturi, `robotFile` — și pe tot `lib/macro-regime.js`; CRLF = LF; din 28.10.2026, revizia F2, și pe `item` și `breadthDin` din robot). O linie nouă
poartă `regula: "v2.1"` doar dacă amprenta de azi e în tabelul de mai jos (`AMPRENTE_V21` în cod); altfel poartă amprenta ca regulă
(`regula: "rv-…"`) și rămâne în afara probei. Fiecare linie nouă poartă și `amprentaRegula`. Garda: `tools/verdict-piata-amprenta.test.mjs`
(pică dacă amprenta de azi nu e în tabel). La o schimbare: dacă eticheta NU se schimbă ⇒ rând nou aici, cu motivul; dacă se schimbă ⇒
regula v2.2, probă nouă, scrisă înainte.

Rândurile de mai jos sunt reconstruite din istoricul git (aceeași funcție pe fișierele de atunci), cu motivul pentru care fiecare
schimbare nu atinge eticheta:

| De la | Amprenta | Ce s-a schimbat în fișiere | De ce rămâne v2.1 |
|---|---|---|---|
| 17.10.2026 13:06 UTC (`264e74af`, revizia) | `rv-62c4d5d5f014` | regula v2.1 (`docs/setup-filtru-piata.md`) | referința |
| 19.10.2026 (`d0b1443a`, I-701) | `rv-2d9c18951701` | rândul „Dată rezultate necunoscută” în „pentru tine” | text de afișaj, nu intră în scor |
| 20.10.2026 (`14c00a09`, I-727 / I-731) | `rv-3ae2d077258b` | seriile portofoliului își păstrează `meta`; `regula()` pentru Drafturi | beta / corelațiile sunt informative; `regula()` aplică eticheta, n-o calculează |
| 27.10.2026 (`d0cee8ed`, auditul A–E) | `rv-3e18543febee` | Fear & Greed în afara 0–100 ⇒ semn invalid (macro); textul riscului la „Prudent” (×0,75) | API-ul alternative.me dă doar 0–100 (nicio zi cu efect); textul nu intră în scor |
| 28.10.2026 (revizia F2, 🟡3) | `rv-9e8358a5273b` | amprenta acoperă și funcțiile robotului care pregătesc piața pentru `compute`: `item` (doar sesiuni încheiate, media de 50 de zile) și `breadthDin` (lățimea pieței) | doar acoperire: codul lor nu s-a schimbat, eticheta iese la fel |
