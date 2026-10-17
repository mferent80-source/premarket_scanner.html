# Clasificator — poate proba înainte să vadă ce caută? (I-671, 17.10.2026)

Calculat **înaintea primului rezultat** al motorului în probă (`holdings-clf-v5`: o singură zi notată, 16.10; primul vot se încheie pe 23.10).
Unealta: `node tools/clasificator-putere.mjs --cache <serii> --max 600 --now 2026-10-16T22:00:00Z`; cifrele brute: [clasificator-putere-2026-10.json](clasificator-putere-2026-10.json).

## Cum

- **540 de acțiuni** din universul robotului (serii Yahoo de 5 ani), **512 cu rezultat** (28 refuzate de regula „salt zilnic peste 25%”). 68 dintre serii au fost citite pe 16.10 la 14:30 UTC (ultima bară parțială — atinge doar ultimele ~5 zile din 211, neglijabil pentru varianță).
- Pe fiecare: motorul (același fișier ca pagina) se antrenează pe partea veche a istoricului și votează zi de zi pe partea de test (~211 sesiuni, până în 10.2026). Nimic din test nu intră în antrenare.
- O zi = media acțiunilor ei (aceeași regulă ca jurnalul); doar zile cu ≥20 de acțiuni.
- Se folosește **doar varianța** câștigului zilnic (cât de mult variază de la o zi la alta), nu media — pragurile nu se aleg după rezultat.
- Efectul minim detectabil (EMD) = cel mai mic câștig pe care testul ales îl vede cu putere 80%, unilateral, α = 0,025 (Holm pe cele 2 ținte): EMD ≈ (t₀,₉₇₅ + t₀,₈ cu 7 grade de libertate) × abaterea pe termen lung / √(zile folosite).

## Testul ales și de ce

Prima formă a revizuirii (Newey-West pe toate zilele, decalaj = orizontul) a fost **respinsă** după revizia de cod: în simulare (zile suprapuse ca în jurnal), la 5% nominal respingea în **8,8%** din cazuri la ținta de 5 și **11,8%** la ținta de 20 — un „ține” fals de aproape două ori prea des. Testul ales: **8 perioade egale, cu h−1 zile lăsate deoparte între ele, test t pe cele 8 medii** — în aceeași simulare **4,7–5,5%** la 5% nominal (și 2,0–2,8% la 2,5%), cu și fără persistență, la 180 / 252 / 504 de zile. Verdictul se dă o singură dată (eșantion fix).

## Rezultate (512 acțiuni)

| Ținta | Față de | Abaterea pe termen lung | EMD (testul ales) | la |
|---|---|---|---|---|
| 5 sesiuni | frecvențe | 0,027 | **0,007** | 180 de zile (152 folosite) |
| 5 sesiuni | momentum | 0,190 | 0,050 | 180 de zile |
| 5 sesiuni | clasament (% pe tranzacție) | 2,36 | 0,62% | 180 de zile |
| 20 de sesiuni | frecvențe | 0,055 | **0,016** | 252 de zile (119 folosite) |
| 20 de sesiuni | momentum | 0,222 | 0,066 | 252 de zile |
| 20 de sesiuni | clasament (% pe tranzacție) | 3,87 | 1,16% | 252 de zile |

Pe partea de test, votul a ieșit în medie **mai slab** decât frecvențele claselor (−0,015 la 5 sesiuni, −0,022 la 20) și mult mai bun decât momentum (+0,46): momentum e un reper slab (pune 80% pe o singură clasă), deci reperul care contează e cel al frecvențelor.

## Ce înseamnă

1. **Ținta de 5 sesiuni:** la 180 de zile (~9 luni) proba vede un câștig de 0,007 — de aproape 3 ori sub pragul de 0,02. Dacă votul chiar câștigă 0,02, proba îl vede aproape sigur.
2. **Ținta de 20 de sesiuni:** la 252 de zile (~1 an) EMD 0,016, sub prag. Abaterea pe termen lung e estimată pe 211 zile și poate fi subestimată cu ~20% ⇒ EMD real până la ~0,02: putere în jur de 80% pentru un câștig de exact 0,02. Regula veche (30 de zile separate la 21 de sesiuni) ar fi cerut ~2,5 ani.
3. **Clasamentele** văd doar un avantaj mare: ~0,6% pe tranzacție de 5 zile peste media universului (după costuri), ~1,2% la 20 de sesiuni. Un „nu ordonează” nu exclude un avantaj mai mic.
4. **Prima estimare (52 de acțiuni)** dădea abateri de 1,5–2,5 ori mai mari: o zi cu 52 de acțiuni e mult mai zgomotoasă decât una cu ~500. Proba reală are ~500 de acțiuni pe zi, deci cifrele de mai sus sunt cele relevante.

## Decizia (17.10.2026, înaintea oricărui rezultat)

- Testul: **8 perioade, pauze de h−1 zile, t cu 7 grade de libertate**, unilateral.
- **Verdict o singură dată**, pe primele **180** de zile verificate (5 sesiuni) și **252** (20 de sesiuni); zilele de după sunt descriptive.
- Pragul de câștig (0,02), α (0,05 cu Holm pe ținte și separat pe clasamente) și reperele rămân neschimbate.
- Ipoteza de lucru e varianța din istoric; varianța înainte poate fi alta. Nu se schimbă nimic după ce apare primul rezultat (garda din `tools/clasificator-inghet.test.mjs` verifică asta).

Regulile intră în [protocol](clasificator-protocol.md).
