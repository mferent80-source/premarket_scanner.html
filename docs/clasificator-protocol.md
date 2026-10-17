# Clasificator Long / Hold / Short — protocolul probei înainte (I-673)

Înghețat pe **17.10.2026**, înaintea primului vot încheiat al motorului în probă. Regulile de mai jos sunt cele din cod (`tools/clasificator-jurnal.mjs`); garda `tools/clasificator-inghet.test.mjs` pică dacă diferă. O schimbare de regulă se scrie **întâi aici** (data, motivul) și e permisă doar cât proba nu are rezultate; după aceea, o regulă nouă înseamnă o probă nouă.

## Ipoteza

- **H1 (ținte):** votul motorului (media calibrată a Boosting, Random Forest și SVM) dă probabilități Long / Hold / Short mai bune decât **ambele** repere — frecvențele claselor din antrenare și momentum — cu o eroare (log loss) mai mică cu **≥0,02**, pe zile care nu existau la antrenare. Separat la 5 sesiuni (±1 ATR) și la 20 de sesiuni (±2 ATR).
- **H1 (clasamente):** primele 10 acțiuni după probabilitatea „Long” bat media universului din aceeași zi, după costuri.
- **H0:** nu le bat. Pe istoric, H0 a câștigat de fiecare dată (vezi registrul încercărilor) — proba înainte e ultima verificare, nu o confirmare așteptată.

## Ce se notează

- **Motorul în probă:** `holdings-clf-v5` ([registrul versiunilor](clasificator-versiuni.md), amprentele fișierului și ale rezultatelor). Doar el e judecat; o zi notată cu altă versiune rămâne istoric. Un motor nou rulează alături (motorul al doilea, `tools/motoare/`), fără să atingă proba.
- **Universul:** ~600 de acțiuni US după capitalizare (`univers-sua.json`) + scannerul (US_CORE); jurnalul notează toate acțiunile clasificate în noaptea aceea.
- **Notarea:** robotul de noapte (GitHub Actions) notează votul zilei în `candidate-engine/generated/clasificator-jurnal/<motor>/voturi-AAAA-LL.jsonl`. **Prima notare a zilei rămâne.** O zi contează doar dacă a fost notată **înainte de deschiderea sesiunii următoare** (calendarul oficial NYSE).
- **Rezultatele:** în noaptea în care se încheie orizontul, robotul notează rezultatul fiecărui vot în `rezultate-AAAA-LL.jsonl` (clasa reală, banii după cost). Toate mărimile sunt relative, deci un split nu schimbă rezultatul (raportul de preț rămâne ca urmă). Fără date după orizont + 10 sesiuni: acțiunea delistată iese la ultima închidere cunoscută; fără serie deloc, votul e „nejudecat”, cu motiv. Peste 5% nejudecate ⇒ verdictul are rezerve, scris în clar.
- **Fișierele doar cresc:** nicio linie nu se schimbă sau se șterge (gardă în workflow, I-669).
- **Costuri:** dus-întors = FX Trading 212 0,3% + spread după lichiditate (0,05% / 0,1% / 0,3% / 0,8% după volumul mediu în dolari pe 20 de zile).

## Testul

- **Toate zilele verificate** intră în test; o zi = media acțiunilor ei. Eroarea ține cont că zilele vecine se suprapun (Newey-West, ponderi Bartlett, decalaj = orizontul).
- **Unilateral**, față de fiecare reper; „ține” = câștig mediu ≥0,02 față de **ambele** și p < α față de fiecare.
- **α = 0,05, Holm pe cele 2 ținte** (amândouă la 0,025; dacă una ține, cealaltă se rejudecă la 0,05) și **separat Holm pe cele 2 clasamente**.
- **Verdict după ≥180 de zile verificate** la 5 sesiuni și **≥252** la 20 (la fel pentru clasamente și pentru feliile pe regim). Până atunci: „în probă”.
- **Pe regim** (SPY peste / sub media de 200 de zile, știută la vot): același test, Holm pe cele 2 felii.
- **Clasamentul:** doar zile cu ≥20 de acțiuni verificate; „ordonează” = diferența medie > 0 cu p < α.
- **Banii** (Long cu marjă ≥0,1 între primele două probabilități, intrare la deschiderea zilei următoare, stop la 1 ATR) sunt raportați, nu judecați.

## Puterea (I-671)

[Calculul complet](clasificator-putere-2026-10.md). Efectul minim detectabil (putere 80%): **0,009** la 5 sesiuni după 180 de zile; **0,024** la 20 de sesiuni după 252 de zile (un câștig de exact 0,02 are ~64% șanse să fie văzut în primul an). Clasamentele văd doar un avantaj de ~0,5% (5 sesiuni) / ~0,9% (20) pe tranzacție.

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
| 8 | 17.10 | Puterea pe partea de test (52 de acțiuni) | Votul mai slab decât frecvențele (−0,019 / −0,021); doar varianța a fost folosită |

Proba înainte a fost aleasă înaintea oricărei date înainte; încercările de mai sus sunt pe istoric și nu se adună la familia testelor înainte (4 teste: 2 ținte + 2 clasamente, corectate ca mai sus). Ele spun însă cât de probabil e un „ține”: puțin.

## Istoria protocolului

- **16.10.2026** — prima formă: verdict după 30 de zile **separate** (6 sesiuni între ele la 5 sesiuni, 21 la 20), test pe zilele separate.
- **17.10.2026** — revizuit înaintea primului vot încheiat, din cauza puterii (I-671): toate zilele + Newey-West, minime 180 / 252; regulile de integritate (motorul în probă, notarea la timp, rezultatele înghețate, nejudecatele, fișierele care doar cresc).

## Regulile (legate de cod)

<!-- reguli -->
```json
{
  "PROBA": "holdings-clf-v5",
  "PRAG": {
    "zileMinime": 180,
    "zileMinime20": 252,
    "decalaj": 5,
    "decalaj20": 20,
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
