# Politica de risc — adăugirile lotului B (Astăzi, Portofoliu) · 27.10.2026

> Paragrafele de mai jos intră în `docs/politica-de-risc.md` (coordonatorul le unește). Rândurile de tabel se adaugă în § 2, sub rândul „Stopul la broker (I-723)”; nota despre „versiune validată” intră în § 4 sau ca rând în § 2; schimbările se trec în § 6.

## § 2 — rânduri noi

| Prag | Valoarea | Unde se aplică | Ce oprește | Motivul |
|---|---|---|---|---|
| Collar de preț la ordinul STOP (I-758) | stopul între **0,5 % și 25 % sub prețul de acum** din copia contului; în afara intervalului doar cu **bifa de confirmare** din fereastră | `T212Orders.verifica` (Astăzi, „Pune ordinul în Trading 212”) | ordinul nu pleacă fără bifă; peste preț ⇒ refuz | Sub 0,5 % o oscilație obișnuită execută stopul; peste 25 % e aproape sigur o cifră greșită (controale pre-ordin 15c3-5 / RTS 6 art. 15). |
| Mărimea ordinului STOP (I-758) | **cantitatea ≤ poziția** din copia contului de pe acest aparat | `T212Orders.verifica` | refuz înainte de POST | Nu se poate vinde ce nu deții; releul verifică din nou la broker (cantitatea disponibilă). |
| Dublura ordinului STOP (I-758) | **același ordin** (acțiune + cantitate + stop) plecat de pe acest aparat în ultimele **2 minute** (jurnalul local `tt_t212_ordine_trimise_v1`, 24 h) **sau** un ordin STOP de vânzare deja în copia ordinelor | `T212Orders.verifica`, `pune()` | refuz înainte de POST; un refuz ferm al releului șterge notarea, un timeout o păstrează | Timeout + reîncercare nu mai pot trimite de două ori; copia necitită nu blochează (releul verifică la broker) și se spune în fereastră. |
| Gardă obligatorie la trimitere (I-758) | `pune()` refuză fără `garda` (poziția + copia ordinelor + jurnalul) | `T212Orders.pune` | nimic nu pleacă fără controale | Închis la eroare: un apel care sare peste verificări nu trimite. |

## § 4 — „versiune validată” a combinației Neural + Boosting (I-750)

- „**Validată**” se spune doar când candidatul trece pragul descriptiv (log-loss cu ≥ 0,02 și Brier cu ≥ 0,01 sub frecvențele claselor, nu mai slab decât componentele) **și** testul de mărime: testul de permutare pe semne (exact, 2^20 configurații) pe cele 20 de diferențe de log-loss față de frecvențele claselor, unilateral, **p < 0,05**. Altfel e „**candidată**”: probabilitățile rămân vizibile, dar verdictul cumulat nu primește titlul „probabilități validate” și nu folosește combinația ca direcție.
- Grila de 12 combinații (pondere × temperatură) se alege pe blocul de calibrare, nu pe test; testul e o singură comparație dinainte stabilită, deci nu cere corecție Holm. Dacă vreodată alegerea s-ar face pe test, se trece la n ≥ 50 cu Holm pe 12.
- Mărimea testului a fost verificată prin simulare sub H0 înainte de punere în funcțiune (`tools/holdings-learning-permutare.test.mjs`): rata de respingeri falsă ≈ 5 %.

## § 6 — istoric

- 27.10.2026 (lot B): controalele pre-ordin la stopul real (collar 0,5–25 %, cantitate ≤ poziție, dublură în 2 minute / în copie, gardă obligatorie); „validată” doar după testul de permutare; pragurile de vechime ale analizelor pe sesiune + amprentă (fără „30 de minute”); pragul de concentrare pe toate paginile din `tt_governor_cfg_v1.maxInstrumentPct` (implicit 20 %).
