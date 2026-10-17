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
