# Audit final — Crypto Radar v100.305 + Busola 1.88.1 (05.11.2026, seara)

Cererea: „refă audit la final din toate unghiurile și pe Radar și pe Busola; dacă crezi că poți îmbunătăți sau ai idei noi să-mi spui”.

Doar citire. Patru auditori independenți:
- **Radar · ecran**: Edge headless pe serverul de pe VPS, 10 pagini × 412 / 768 / 1440 / 2560;
- **Radar · colector și alerte**: jurnalele de pe VPS, 7 zile;
- **Radar · server, securitate și statistică**: simulări de mărime cu modulele reale;
- **Busola 1.88.1, final**: datele vii, simulări, pagina publicată.

Fiecare 🔴 de mai jos l-am verificat eu în cod sau pe date, nu doar raportat. Scripturile și pozele auditorilor sunt în scratchpad-ul sesiunii (`audit2-*`).

## Pe scurt

- **Busola:** 1 🔴. Nu vine din schimbările de azi, ci din bilanțul pazei din 16.10. Din schimbările de azi ies doar 🟡.
- **Radar:** 6 🔴, toate cuvinte sau cifre pe ecran și pe Discord care spun altceva decât e adevărat:
  - ce să pornești cu frâna trasă;
  - Trade-ul zilei (de două ori);
  - prețurile monedelor mici;
  - raportul câștig/pierdere;
  - evaluările care tac.
- **Curat:**
  - serverul Radarului: toate cele 18 rute cer cheia, comparată în timp constant, fără CORS, fără secrete în `public/`;
  - nicio excepție JS, nicio depășire pe lățime, niciun NaN, pe ambele aplicații;
  - un singur colector, un singur workerd;
  - Discord fără eșecuri; nicio blocare de IP la Pionex;
  - măsurarea Busolei: 7 min în loc de 13–15, 65 de cereri Pionex în loc de ~690.

## 🔴 Critice (verificate)

| # | Unde | Ce minte | Dovada |
|---|---|---|---|
| 1 | Radar, Acasă „💡 Ce aș cumpăra azi” (`acasa-ecran.js:192-206`), antetul Sugestii (`asezare-paznic.js:483`) | „Boți: STX, LIT sau CC” chiar sub „Frâna zilei… n-aș mai porni boți azi” și „N-aș porni boți grid noi până nu se liniștește” | `acasaCumpar` verifică doar pauza de sezon; frâna și verdictul pieței lipsesc |
| 2 | Radar, Trade-ul zilei (`trade-zilei.js:73-106`) | Seara, „Azi se mișcă mai mult ca ieri: 7%”, deși ziua s-a mișcat deja mai mult (7,1% față de 6,8% ieri) | `p3` se socotește doar din ieri și alaltăieri; ce s-a făcut azi (`panaAcum`) nu intră |
| 3 | Radar, Trade-ul zilei (`trade-zilei-ecran.js:53`, `trade-zilei.js:105`) | „Grid azi ±X … cuprinde ziua în trei din patru cazuri” și „pas … la zece grile pe parte” | Banda e centrată pe prețul de ACUM, cu lățimea = p75 a range-ului ZILEI. Măsurat pe 11.247 de zile-monedă, ziua stă în bandă în 43% (00:05 UTC) / 52% (05:05) / 67% (12:05). Pasul = lățimea/10, deci 5 grile pe parte. Garda `proba-v100298:67` fixează fraza, nu adevărul ei |
| 4 | Radar, Trade-ul zilei + Discord (`tzPret`, `tura-trade-zilei.mjs`) | PEPE: „Grid 0,000005 – 0,000005” | 6 zecimale fixe sub 0,01 |
| 5 | Radar, scorul sezonului (`scor-sezon.js:85/157`) | „o pierdere = 0,3 câștiguri” | `raport` = câștigul mediu ÷ pierderea medie = 0,33, deci o pierdere ≈ 3,0 câștiguri. Cifra e inversată |
| 6 | Radar, colector (`colector.mjs:2012`, `bot-orders.js:257`) | Evaluarea botului închis, „Seara pe scurt”, oglinda și profitul tac cât nu rulează niciun bot | Pionex dă lista goală ca „nulă”, iar tura se amână la nesfârșit. Pe VPS: 510 „evaluari amanate”; XMR (închis la 11:19) neevaluat; „Seara” din 04.11 n-a plecat |
| 7 | Busola, bilanțul pazei (`jurnalPaza.ts:127-150`) → Radar (fișa de grid „pe date noi: dovedit”, titlul de dimineață „boți pe agitație dovedită”) | „dovedit” (−2,5 pp [−4,3; −1,0]) | Bootstrap pe MONEDE (70 de monede, aceleași 27 de zile). Pe zile iese −0,9 pp [−2,2; +0,5] ⇒ **n-am aflat** (refăcut independent de doi auditori). Încalcă regula „dovezile pe zile” |

## 🟡 Abateri serioase

**Statistică**
- `Reveniri.dovada` („mai bine / mai slab”, în titlul de dimineață și în Sugestii): 14–15% fals cu factor comun de piață.
- `Verdicte.calibrare` / `comparaPeZi` (poarta gridului, poarta T212): 22–41% fals când etichetele persistă. Azi n-are efect: puține verdicte.
- Testul nou din Busola (I-811): ~5% fals pe 4h și 1h, dar **15–21% pe 15m când alegerea e legată de câteva monede**. Azi totul e „n-am aflat”.
- Busola, „prea devreme” se socotește pe zile, dar testul folosește momente rărite. Exemplu: 1z judecat pe 4 momente, cu ecranul scriind „30 zile”.
- Busola, proba „Acum” (judecata pe 14.12): pragul long a urcat cu funding-ul la mijlocul probei (43,5% ⇒ 45,6%), fără repornire anunțată.

**Ecran**
- Busola „Acum”: „✓ Piața: obișnuită” lângă „mai calmă (din opțiuni)”. `verificaIntrarea` și `verificaBotul` primesc starea fără opțiuni, deci I-814 a rămas neterminat. Eu n-am observat asta în poza de la „gata”.
- Radar pe telefon:
  - fișa de Grid: verdictul la 1.110 px, iar „aș alege LARG” deși media e −0,9 USDT;
  - Futures: conținutul de la 630 px;
  - Alerte: 1.413 rânduri, 245.000 px.
- Range Filter: „SEMNAL SELL” roșu sub „nedovedit”.
- Comportament înghețat la zero boți; „Aștept botul…” fără capăt.
- Convenții (încă de la 23.10): două zecimale, punct, minus ASCII, fără separator de mii, cuvinte în engleză. Busola „-1.84%” (`scor.ts`).

**Alerte (Radar, ~180 de mesaje pe zi, 47% alerte de 1%)**
- Treptele T212 de 1% se retrimit la deschiderea SUA: 61 de dubluri. Vin și noaptea: 70.
- „Critic” e diluat: 32 din 60 sunt „−15% de la maxim”, în fiecare zi de bursă.
- Etichete care oscilează: „Crypto liniște ⇄ mișcare” de 9 ori; 43% din alertele boților se întorc în ≤ 15 min.
- Textele paznicului Radarului trimit la „PC-ul de acasă / .bat”. E același tipar ca alarma Busolei de azi.
- 1.188 de erori HTTP 500 în 15 h (03.11) fără nicio alertă; tura „cazuri” moartă din 04.11.

**Fiabilitate**
- Paznicul din Worker-ul Busolei nu-și dă semn de viață. Dacă dispare cron-ul `*/30`, nu mai anunță nimeni.
- Lansatorul Radarului nu reface Functions la pull; `wrangler.log` nu se rotește.
- ~10.000 de cereri Pionex pe zi de pe IP-ul VPS-ului.

## Ce NU s-a probat
- Un S24 real, iOS, ecranul cu boții deschiși (azi niciun bot).
- Mesajul real de pe Discord al paznicului din Worker (a rulat `ok`, dar n-a avut ce anunța).
- Mărimea testelor pe modelele 🧠/🌳 ale Radarului; P3 „DOVEDIT” fără rerulare.
- Configurarea Tailscale (Funnel vs serve) pe VPS.
- Rularea Busolei de la 23:05 (coada futures pe 4h).

## Ideile
I-824 … I-839 în `docs/ideas/backlog.md`, cu mini-spec-uri.
