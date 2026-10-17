# Clasificator — poate proba înainte să vadă ce caută? (I-671, 17.10.2026)

Calculat **înaintea primului rezultat** al motorului în probă (`holdings-clf-v5`: o singură zi notată, 16.10, niciun vot încheiat).
Unealta: `node tools/clasificator-putere.mjs --cache <serii> --now 2026-10-16T22:00:00Z`; cifrele brute: [clasificator-putere-2026-10.json](clasificator-putere-2026-10.json).

## Cum

- 68 de acțiuni din universul scannerului (serii Yahoo citite pe 16.10 la 14:30 UTC, deci cu ultima bară parțială — atinge doar ultimele ~5 zile din 211, neglijabil pentru varianță), **52 cu rezultat** (16 refuzate de regula „salt zilnic peste 25%”).
- Pe fiecare: motorul (același fișier ca pagina) se antrenează pe partea veche a istoricului și votează zi de zi pe partea de test (~211 sesiuni, până în 10.2026). Nimic din test nu intră în antrenare.
- O zi = media acțiunilor ei (aceeași regulă ca jurnalul); doar zile cu ≥20 de acțiuni.
- Mărimea măsurată = cât de mult variază de la o zi la alta câștigul votului față de reper (abaterea standard). **Nu** se folosește media istorică pentru a alege praguri — doar varianța.
- Efectul minim detectabil (EMD) = cel mai mic câștig pe care testul îl vede cu putere 80%, unilateral, α = 0,025 (Holm pe cele 2 ținte).

## Rezultate

| Ținta | Față de | Zile separate (sd) | EMD cu 30 de zile separate | Toate zilele (sd pe termen lung) | EMD pe toate zilele | la |
|---|---|---|---|---|---|---|
| 5 sesiuni | frecvențe | 36 (0,031) | **0,016** | 211 (0,041) | **0,009** | 180 de zile |
| 5 sesiuni | momentum | 36 (0,183) | 0,094 | 211 (0,296) | 0,062 | 180 de zile |
| 5 sesiuni | clasament (% pe tranzacție) | 36 (1,35) | 0,69% | 211 (2,38) | 0,50% | 180 de zile |
| 20 de sesiuni | frecvențe | 10 (0,060) | **0,030** | 208 (0,138) | **0,024** | 252 de zile |
| 20 de sesiuni | momentum | 10 (0,205) | 0,105 | 208 (0,339) | 0,060 | 252 de zile |
| 20 de sesiuni | clasament (% pe tranzacție) | 10 (2,33) | 1,19% | 208 (4,99) | 0,88% | 252 de zile |

Pe partea de test, votul a ieșit în medie **mai slab** decât frecvențele claselor (−0,019 la 5 sesiuni, −0,021 la 20) și mult mai bun decât momentum (+0,48): momentum e un reper slab (pune 80% pe o singură clasă), deci reperul care contează e cel al frecvențelor.

## Ce înseamnă

1. **Ținta de 5 sesiuni, regula veche** (30 de zile separate la 6 sesiuni = ~180 de sesiuni, ~9 luni): EMD 0,016 sub pragul de 0,02 ⇒ proba putea vedea pragul. Dar arunca 5 zile din 6.
2. **Toate zilele, cu eroarea Newey-West** (zilele suprapuse corelate se plătesc prin eroare mai mare): în aceleași ~180 de sesiuni EMD scade la 0,009. Mai multă putere, același timp.
3. **Ținta de 20 de sesiuni, regula veche**: 30 de zile separate la 21 de sesiuni = **~630 de sesiuni (~2,5 ani)**, iar EMD 0,030 e peste pragul de 0,02 ⇒ proba nu putea vedea pragul. Pe toate zilele, la 252 de sesiuni (~1 an), EMD 0,024: tot puțin peste prag (putere ~64% pentru un câștig de exact 0,02). Pentru putere 80% la 0,02 ar trebui ~370 de sesiuni.
4. **Clasamentele** pot vedea doar un avantaj mare: ~0,5% pe tranzacție de 5 zile peste media universului (după costuri) la 180 de zile; ~0,9% la 20 de sesiuni.

## Decizia (17.10.2026, înaintea oricărui rezultat)

- Testul trece pe **toate zilele verificate**, cu eroarea Newey-West (ponderi Bartlett, decalaj = orizontul: 5, respectiv 20), corecție pentru eșantion mic.
- Verdict după **≥180 de zile verificate** la ținta de 5 sesiuni și **≥252** la ținta de 20 (aceleași minime pentru clasamente și pentru feliile pe regim).
- Pragul de câștig (0,02), α (0,05 cu Holm pe ținte și separat pe clasamente) și reperele rămân neschimbate.
- Limita scrisă: la ținta de 20, un câștig de exact 0,02 are ~64% șanse să fie văzut în primul an; un „nu ține” la 20 de sesiuni cântărește mai puțin decât unul la 5.
- Ipoteza de lucru e varianța din istoric; varianța înainte poate fi alta. Nu se schimbă nimic după ce apar rezultate.

Regulile intră în [protocol](clasificator-protocol.md) și sunt legate de cod printr-o gardă (`tools/clasificator-inghet.test.mjs`).
