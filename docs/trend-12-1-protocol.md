# Proba în timp „Trend 12 luni” — protocolul (regulile din 14.10.2026, adunate și completate pe 27.10.2026)

Până azi regulile acestei probe stăteau doar în cod (`tools/trend-12-1-lib.mjs`, `bilant`) și în auditul din 14.10.2026
(`docs/AUDIT-PROBA-TREND-SCOR-2026-10-14.md`); registrul cercetării trimitea greșit la protocolul Top Long. Documentul de față le scrie
la un loc. Secțiunea „Ce s-a schimbat pe 27.10.2026” e scrisă **înaintea primei ferestre închise** (bilanțul din 24.10.2026: 9 zile în
istoric, 0 zile cu rezultat la 20 de zile, 0 ferestre).

## Ce se notează (din 13.10.2026)
- Robotul `tools/trend-12-1.mjs` (zilnic) notează în `candidate-engine/generated/trend-12-1-istoric.jsonl`: ziua, regimul (SPY peste media
  pe 200 de zile), primele 20 din clasamentul 12-1 (randamentul pe lunile 2–12, ultima lună sărită) și **universul clasat în ziua aceea**.
- Bilanțul (`tools/trend-12-1-bilant.mjs`, săptămânal) ia prețurile de la Yahoo și scrie `candidate-engine/generated/trend-12-1-bilant.json`.

## Ce se măsoară și cum se judecă (fixat pe 14.10.2026)
- Pentru fiecare zi din istoric cu 20 de zile de bursă după ea: randamentul primelor 20 de la deschiderea zilei următoare la închiderea
  zilei 20, minus SPY pe aceleași date, minus costul 0,3 % — și același lucru pentru universul zilei (nulul B: alte acțiuni, aceleași zile).
- Observațiile independente = **ferestrele de 20 de zile care nu se suprapun** (pe calendarul SPY); diferența top − univers pe fiecare.
- **„Probat față de alte acțiuni”:** cel puțin **12 ferestre** și **t > 3,2**; **„picat”:** t < −3,2; altfel „în probă”. Verdictul se
  recalculează la fiecare bilanț (priviri repetate) — pragul 3,2 a fost ales tocmai pentru asta: în lumea fără avantaj (seria reală cu
  media scoasă, asimetria și cozile păstrate), privită săptămânal de la 12 la 63 de ferestre, „probat” fals 3,5 % în 3 ani și 4,3 % în 5.
- **Alarma de abatere** (scrisă înainte, 14.10): media ferestrelor sub −3,0 % după 3, −1,8 % după 6, −1,2 % după 9, −0,9 % după 12 —
  de revăzut, nu verdict.

## Ce s-a schimbat pe 27.10.2026 (auditul F; înaintea primei ferestre)
- **Delistate / preluate:** înainte ieșeau tăcut din medii. Acum, o acțiune fără date la **10 sesiuni după orizont** (`ASTEPTARE`) iese
  la **ultima închidere cunoscută**, față de SPY pe aceleași date (marcată în `oprite`); fără serie sau fără ziua intrării, rândul e
  „nejudecat”, cu motivul, și se numără (`nejudecate`). Aceeași regulă ca la Clasificator și la Reguli V1 / Top Long (v2).
- **Mărimea și puterea, simulate în depozit** (`marimePutereTrend` din `tools/trend-12-1-lib.mjs`, testul din
  `tools/trend-12-1-robot.test.mjs`; 4000 de lumi, mulberry32, abaterea pe fereastră din istorie 3,51 %, privire după fiecare fereastră
  nouă de la 12):

  | Lumea | „probat” până la 12 ferestre (~1 an) | 36 (~3 ani) | 60 (~5 ani) |
  |---|---|---|---|
  | fără avantaj, ferestre gaussiene | 0,4 % | 1,2 % | 1,5 % |
  | fără avantaj, forma ferestrelor reale (asimetrie −1,3) | 1,6 % | 5,0 % | 5,7 % |
  | +0,5 %/fereastră | 1,5 % | 5,1 % | 7,9 % |
  | +1 %/fereastră | 4,1 % | 17,2 % | 30,0 % |
  | +1 %/fereastră, forma reală | 9,5 % | 30,9 % | 43,9 % |

  Spus cinstit: mărimea testului depinde de forma ferestrelor — 1,5 % dacă ar fi gaussiene, 5,7 % în 5 ani cu asimetria ferestrelor
  reale (aproximată aici; calibrarea din 14.10 pe ferestrele reale a dat 4,3 %). Pragul rămâne 3,2 (ales pe seria reală, înaintea datelor).
  Puterea e mică: în primul an „în probă” e rezultatul aproape sigur, oricare ar fi adevărul; ce poate veni mai devreme e doar alarma.
- **Amprenta judecătorului: `jt-f0cc2da31fb4`** = SHA pe `bilant`, `ferestreNesuprapuse`, `pragAbatere`, `interval`, `rnd` și pe
  pragurile (`T_PRAG`, `PRAG_ABATERE`, `ASTEPTARE`); bilanțul o scrie în fișier (`judecator`), garda `tools/probe-amprente.test.mjs` pică
  dacă codul de azi dă alta. O schimbare a judecătorului = protocol nou, scris înainte.
- **Câmpurile pentru panouri (lotul D):** `putere` (tabelul de mai sus, unitatea „% pe fereastră”), `primulVerdict` (12 ferestre de 20 de
  zile de la 13.10.2026 ⇒ optimist ~**28.09.2027**, realist după zilele pierdute) și `judecata` cu `unic: false` — verdictul e
  secvențial prin construcție, nu o judecată unică.

## Ce NU face proba
- Nu ține cont de raportări, de stop sau de ținta planului (Desk nu construiește plan pe Trend); judecă doar lista față de alte acțiuni.
- Lista de azi e a supraviețuitorilor (universul de acum, nu cel din trecut); instantaneul datat al universului există din 19.10.2026
  (`candidate-engine/generated/univers-sua-istoric/`), pentru o probă viitoare fără părtinirea supraviețuitorilor.
