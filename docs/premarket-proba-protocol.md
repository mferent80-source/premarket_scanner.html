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
