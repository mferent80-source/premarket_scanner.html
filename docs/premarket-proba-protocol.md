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
  lui din `lib/v1-proba.mjs` + `evalueaza` de aici). **Amprenta la pornirea v2: `pm-0dc4d07a4a73`** (rescrisă pe 27.10.2026, înaintea
  oricărei zile v2, după lipirea lotului D: `pm-f9f254159993` ⇒ `pm-0dc4d07a4a73`, doar textul din `earningsInfo` / `gardaEarnings`;
  penalizarea, `blocked` și ramurile în care garda e nevidă au rămas identice). Garda din suită
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
