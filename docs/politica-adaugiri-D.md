# Adăugiri la politica de risc — lotul D (Planuri, scanner, Piață, Shadow) · 27.10.2026

Paragrafe de lipit în `docs/politica-de-risc.md` de coordonator (lotul D nu editează politica direct). Toate sunt **reguli de prudență,
nu avantaje dovedite**; ce nu se poate verifica blochează sau se spune (principiul 2, „închis la eroare”).

## § 2 — rânduri noi / modificate în tabelul pragurilor

| Prag | Valoarea | Unde se aplică | Ce oprește | Motivul |
|---|---|---|---|---|
| Risc pe plan (rând modificat) | **0,5 % din capital**, **0,25 %** la CAUTION / piață defensivă (breadth) / **Top Long în probă / Early Reversal** (I-742) | Planuri `allowedRisk` (`TTProbaTopLong.cap`) | mărimea poziției | Early Reversal a picat pe istoric (14.10, 19.10: fără avantaj) și nu e în nicio probă în timp ⇒ riscul pe un semnal nedovedit nu mai e dublul celui pe alt semnal nedovedit. Eticheta „în probă · nejudecat” stă lângă stare, în tichet și în plan. Stopul lui se judecă „în umbră” (`docs/reversal-stop-umbra-protocol.md`). Dacă EL alege altfel, decizia se scrie aici cu motivul. |
| Corelație neverificată (I-753) | o poziție deschisă fără serie zilnică citită ⇒ **„corelație neverificată cu X” + riscul planului ×0,75** | `TTCaldura.evalueazaGrup` (`MULT_NEVERIFICAT`), Planuri | mărimea; eroarea la calcul ⇒ **fără plan nou**, reîncercat după 30 s; seria simbolului NOU lipsă cu ≥ 2 poziții ⇒ blocat (ca înainte) | O pereche care nu se poate verifica nu mai trece tăcut ca „necorelată”. Se înmulțește cu ×0,75 al pieței (ex. 0,25 % × 0,75 × 0,75 = 0,14 %). |
| Modulele-gardă (I-753) | **verdictul pieței** (`lib/market-verdict.js`), **căldura și corelația** (`lib/caldura-portofoliu.js`), **prețul de acum** (`lib/pret-viu.js`) declarate în Planuri (`GARZI`) | Planuri, `garziComune` | lipsa unuia (404, cache vechi, eroare de sintaxă) ⇒ **tichetul blocat** cu numele modulului | O gardă care nu s-a încărcat dispărea tăcut din drum. Proba Top Long are deja rezerva ei (plafonul rămâne fără modul); ideea proprie își verifică singură calculatorul. Demo-ul fictiv nu le cere. |
| Prețul de acum sub stop (I-752) | **SUB stop ⇒ salvarea refuzată** și pentru candidatul scannerului (înainte: doar text) | Planuri `ticketSizing` (`TTPretViu.verifica`) | fără plan | Un plan al cărui stop e deja depășit nu mai e valabil. |
| ADV necunoscut (I-752) | sub 20 de sesiuni încheiate cu volum sau volum lipsă ⇒ **fără plan** la ideea proprie | `TTIdeeProprie.pregateste` | fără plan | Lichiditatea care nu se poate măsura nu e „trece”. ATR-ul și ADV-ul se calculează pe sesiuni ÎNCHEIATE (`DailySeries.read`), ca scannerul; seria fără identitate ⇒ seria brută, cu nota la vedere. |
| Expirarea planului (I-752) | un plan **PLANNED** neexecutat expiră la a **2 sesiuni** SUA după ziua creării (calendarul SUA când e încărcat, altfel zile lucrătoare) | `TradePlans.expira` / `expirat`, Planuri | anulat cu motivul („expirat: 2 sesiuni fără SIMULEAZĂ…”); expirat ⇒ fără SIMULEAZĂ și fără RESTABILEȘTE | Stopul 1,25 ATR și zona de intrare se recalculează zilnic din scanare; planul vechi nu mai corespunde. Două sesiuni lasă ziua creării și pe următoarea pentru intrare. |
| SIMULEAZĂ (I-752) | **aceleași gărzi ca la salvare** (`garziComune`: oprirea, modulele, Governor, piața, pozițiile, contul, bugetele, căldura, corelația) pe registrul fără planul simulat | Planuri, butonul SIMULEAZĂ | refuzat cu motivul dacă mărimea planului nu mai încape | Un plan salvat dimineața nu se mai declanșează după-amiaza peste o căldură sau o corelație schimbată între timp. |
| Oprirea de urgență | `tt_governor_oprire_v1` cu `activ:true` (scris de butonul „Oprește tot”, lotul E) | Planuri (citire): Guardrail „OPRIT”, tichet, SIMULEAZĂ; redesenat la evenimentul `tt-oprire` și la schimbarea cheii | **fără plan nou și fără SIMULEAZĂ** până la re-armarea din Governor (cu motiv, lotul C); starea ilizibilă ⇒ OPRIT (închis la eroare) | Butonul de urgență trebuie să oprească și ce se pregătește, nu doar ordinele. Textul arată motivul, ora și aparatul. |
| Bifele disciplinei (I-763) | 4 bife ale LUI în tichet (plan scris înainte, stop la broker imediat, nu după pierdere, nu peste mărimea din tichet), salvate în plan ca `bife:[{id,text,da}]` | Planuri (tichet) → `TradePlans.create` / `validate`; Raportul (lotul C) le numără | nimic — nu blochează | Disciplina proprie devine măsurabilă („n/m reguli respectate”), fără să devină încă o gardă automată. |

## § 1 / § 2 — precizare la „Risc pe plan”
- Riscul se afișează cu explicația lui, nu cu patru zecimale: „0,25 % × 0,75 (piața prudentă) = 0,19 %”. Procentele de risc rămân cu două
  zecimale (ca valorile din politică: 0,25 %, 0,5 %); restul cifrelor noi din tichet cu una (R:R „2,0R · net 1,9R (cu costul)”).
- R:R net (cu costul dus-întors de 0,3 % în riscul pe acțiune) stă alături de cel brut; pragul ≥ 1,5 R rămâne pe cel brut, ca până acum.

## Shadow (evaluarea semnalelor blocate, I-754) — notă la § 5 „Revizuirea”
- Un **split** între semnal și ieșire (Yahoo `events=div,splits`) face evaluarea **neverificabilă**: semnalul nu intră în statistici
  (nici în „vs base”) și nu se mai cere; motivul stă în registru și în tabelul Shadow Book. Dividendul doar se notează (OHLC-ul nu e ajustat).
- Pentru un semnal venit în ședință, stopul se verifică și pe restul zilei semnalului (varianta mai proastă: ieșire la stop).
- Poarta de capital din Shadow Book se estimează la riscul unui plan (0,5 % din cont), nu la 1 %.

## § 6 — rând în istoricul schimbărilor

| Data | Ce | De la → la | De ce | Unde |
|---|---|---|---|---|
| 2026-10-27 | Early Reversal plafonat la 0,25 % (I-742); corelație neverificată ×0,75 + modulele-gardă (I-753); preț sub stop / ADV necunoscut ⇒ fără plan, expirarea PLANNED la 2 sesiuni, gărzile re-rulate la SIMULEAZĂ (I-752); OPRIT din `tt_governor_oprire_v1`; bifele disciplinei (I-763); Shadow neverificabil la split (I-754) | 0,5 % → 0,25 %; trece → ×0,75 / blocat; fără termen → 2 sesiuni | auditul D din 27.10: lanțul planului avea capete deschise la eroare | `lib/desk-proba.js`, `lib/caldura-portofoliu.js`, `lib/trade-plans.js`, `lib/idee-proprie.js`, `lib/shadow.js`, `desk/index.html` |
