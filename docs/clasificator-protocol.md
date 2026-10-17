# Clasificator Long / Hold / Short — protocolul probei înainte (I-673)

Înghețat pe **17.10.2026**, înaintea primului vot încheiat al motorului în probă (primul rezultat posibil: 23.10.2026). Regulile de mai jos sunt cele din cod (`tools/clasificator-jurnal.mjs`); garda `tools/clasificator-inghet.test.mjs` pică dacă diferă. O schimbare de regulă se scrie **întâi aici** (data, motivul) și e permisă doar cât proba nu are rezultate; după aceea, o regulă nouă înseamnă o probă nouă.

## Ipoteza

- **H1 (ținte):** votul motorului (media calibrată a Boosting, Random Forest și SVM) dă probabilități Long / Hold / Short mai bune decât **ambele** repere — frecvențele claselor din antrenare și momentum — cu o eroare (log loss) mai mică cu **≥0,02**, pe zile care nu existau la antrenare. Separat la 5 sesiuni (±1 ATR) și la 20 de sesiuni (±2 ATR).
- **H1 (clasamente):** primele 10 acțiuni după probabilitatea „Long” bat media universului din aceeași zi, după costuri.
- **H0:** nu le bat. Pe istoric, H0 a câștigat de fiecare dată (vezi registrul încercărilor) — proba înainte e ultima verificare, nu o confirmare așteptată.

## Ce se notează

- **Motorul în probă:** `holdings-clf-v5` ([registrul versiunilor](clasificator-versiuni.md), amprentele fișierului și ale rezultatelor). Doar el e judecat; o zi notată cu altă versiune rămâne istoric. Un motor nou rulează alături (motorul al doilea, `tools/motoare/`), fără să atingă proba.
- **Universul:** ~600 de acțiuni US după capitalizare (`univers-sua.json`) + scannerul (US_CORE); jurnalul notează toate acțiunile clasificate în noaptea aceea.
- **Notarea:** robotul de noapte (GitHub Actions) notează votul zilei în `candidate-engine/generated/clasificator-jurnal/<motor>/voturi-AAAA-LL.jsonl`. **Prima notare a fiecărei acțiuni rămâne**; o rulare ulterioară din aceeași zi poate doar adăuga acțiunile care lipseau (linie de completare, cu ora ei). O notare contează doar dacă a fost făcută **înainte de deschiderea sesiunii următoare** (calendarul oficial NYSE; garda cere extinderea calendarului cu 180 de zile înainte). Robotul nu notează cu un motor a cărui amprentă de fișiere nu e în registru.
- **Rezultatele:** în noaptea în care se încheie orizontul, robotul notează rezultatul fiecărui vot în `rezultate-AAAA-LL.jsonl` (clasa reală, banii după cost). Toate mărimile sunt relative, deci un split nu schimbă rezultatul (raportul de preț rămâne ca urmă). Fără date după orizont + 10 sesiuni: acțiunea delistată iese la ultima închidere cunoscută; fără serie deloc, votul e „nejudecat”, cu motiv. Peste 5% nejudecate ⇒ verdictul are rezerve, scris în clar.
- **Fișierele doar cresc:** nicio linie nu se schimbă sau se șterge (gardă în workflow, I-669).
- **Costuri:** dus-întors = FX Trading 212 0,3% + spread după lichiditate (0,05% / 0,1% / 0,3% / 0,8% după volumul mediu în dolari pe 20 de zile).

## Testul

- **Zilele verificate** se împart în **8 perioade egale, consecutive**, cu **h−1 zile lăsate deoparte între ele** (orizonturile a două perioade nu se suprapun); o zi = media acțiunilor ei; testul t pe cele 8 medii, **7 grade de libertate**. În simulare (zile suprapuse ca în jurnal, cu și fără persistență) respinge 4,8–5,4% la 5% nominal.
- **Eșantion fix:** verdictul se dă **o singură dată**, pe primele 180 (5 sesiuni) / 252 (20 de sesiuni) zile verificate. Zilele de după apar doar descriptiv („după verdict”), ca recalcularea zilnică să nu umfle eroarea.
- **Unilateral**, față de fiecare reper; „ține” = câștig mediu ≥0,02 față de **ambele** și p < α față de fiecare.
- **α = 0,05, Holm pe cele 2 ținte** (amândouă la 0,025; dacă una ține, cealaltă se rejudecă la 0,05) și **separat Holm pe cele 2 clasamente**.
- **Verdict la 180 de zile verificate** la 5 sesiuni (~9 luni) și la **252** la 20 (~1 an) — la fel pentru clasamente și pentru feliile pe regim. Până atunci: „în probă”.
- **Pe regim** (SPY peste / sub media de 200 de zile, știută la vot; SPY se reia dacă bara lui întârzie): același test, Holm pe cele 2 felii, ordonate după p-ul care decide (cel mai mare dintre cele două repere).
- **Clasamentul:** doar zile cu ≥20 de acțiuni verificate; „ordonează” = diferența medie > 0 cu p < α.
- **Banii** (Long cu marjă ≥0,1 între primele două probabilități, intrare la deschiderea zilei următoare, stop la 1 ATR) sunt raportați, nu judecați.

## Puterea (I-671)

[Calculul complet](clasificator-putere-2026-10.md) (512 acțiuni). Efectul minim detectabil (putere 80%) cu testul ales: **0,007** la 5 sesiuni după 180 de zile; **0,016** la 20 de sesiuni după 252 de zile (cu o posibilă subestimare a varianței de ~20%, până la ~0,02). Clasamentele văd doar un avantaj de ~0,6% (5 sesiuni) / ~1,2% (20) pe tranzacție.

## Registrul încercărilor (toate, și cele picate)

| # | Data | Încercarea | Rezultatul |
|---|---|---|---|
| 1 | 16.10 | Clasificatorul pe fiecare acțiune (4 modele: Boosting, Random Forest, SVM, vot), walk-forward pe 3 ferestre, Holm pe 4 modele | Fără avantaj confirmat pe acțiunile scannerului; stări „fără avantaj” / „neconcludent” |
| 2 | 16.10 | Ablația indicatorilor noi: 5 variante (18 indicatori, doar cei 10 vechi, fără MACD, fără SMA, fără suport / rezistență) — [raport](clasificator-ablatie-2026-10-16.md) | Niciun câștig vizibil; nicio variantă „experimentală” |
| 3 | 16.10 | Contextul pieței (SPY) ca indicatori în plus — [raport](clasificator-context-2026-10-16.md) | Niciun câștig |
| 4 | 16.10 | Modelul comun pe tot universul (150 de acțiuni, aceleași zile), dovada pe zile | Fără avantaj (0/3 ferestre, p 0,34) |
| 5 | 16.10 | A doua țintă: 20 de sesiuni, ±2 ATR (scrisă dinainte) | Intră în proba înainte |
| 6 | 16.10 | Clasamentele pe vot (5 și 20 de sesiuni) | Intră în proba înainte |
| 7 | 16.10 | Motorul v2 → v5 (bani, calibrare, cost după lichiditate) | v5 în probă; v4 are o zi notată, doar istoric |
| 8 | 17.10 | Puterea pe partea de test (52, apoi 512 acțiuni) | Votul mai slab decât frecvențele (−0,015 / −0,022 pe 512); doar varianța a fost folosită |
| 9 | 17.10 | Testul pe zile suprapuse: Newey-West (decalaj h și 2h), Hansen-Hodrick, medii pe 6–12 perioade, cu și fără pauze — simulare sub H0 | Doar mediile pe perioade cu pauze țin 5%; ales: 8 perioade, pauze h−1 |

Proba înainte a fost aleasă înaintea oricărei date înainte; încercările de mai sus sunt pe istoric și nu se adună la familia testelor înainte (4 teste: 2 ținte + 2 clasamente, corectate ca mai sus). Ele spun însă cât de probabil e un „ține”: puțin.

## Istoria protocolului

- **16.10.2026** — prima formă: verdict după 30 de zile **separate** (6 sesiuni între ele la 5 sesiuni, 21 la 20), test pe zilele separate.
- **17.10.2026** — revizuit înaintea primului vot încheiat, din cauza puterii (I-671): toate zilele + Newey-West, minime 180 / 252; regulile de integritate (motorul în probă, notarea la timp, rezultatele înghețate, nejudecatele, fișierele care doar cresc).
- **17.10.2026** (a doua revizie, aceeași zi, tot fără niciun rezultat) — revizia de cod a arătat, iar simularea noastră a confirmat, că Newey-West cu decalaj = orizontul respinge în 8,8% (5 sesiuni) și 11,8% (20) din cazuri la 5% nominal ⇒ înlocuit cu testul pe 8 perioade cu pauze (4,8–5,4%); verdictul pe eșantion fix (180 / 252 de zile, puterea recalculată pe 512 acțiuni); completarea unei zile notate parțial; feliile ordonate după p-ul care decide.

## Regulile (legate de cod)

<!-- reguli -->
```json
{
  "PROBA": "holdings-clf-v5",
  "PRAG": {
    "zileMinime": 180,
    "zileMinime20": 252,
    "grupe": 8,
    "castig": 0.02,
    "alfa": 0.05,
    "marja": 0.1,
    "top": 10,
    "minimZi": 20,
    "asteptare": 10,
    "rezerva": 0.05
  }
}
```
