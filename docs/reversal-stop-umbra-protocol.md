# Stopul Early Reversal „în umbră” (I-716) — protocol scris ÎNAINTE de date

Scris pe **19.10.2026**, înaintea primei zile din jurnalul umbrei (`scanner-verdicts/generated/reversal-umbra-jurnal.json`).
Motivul (auditul de cod Long & Reversal, 19.10.2026): pe datele de azi 7 din 8 stopuri Early Reversal stau cu 2–6 % PESTE minimul
bazei (RTX +5,6 %, UNH +6,5 %) ⇒ o revenire normală la minim scoate poziția. Schimbarea direct în `analyze` ar reporni proba Top Long
și n-ar fi testată ⇒ se judecă întâi „în umbră”, fără niciun efect pe aplicație.
Orice schimbare a acestui protocol sau a regulilor care aleg lista Early Reversal **repornește umbra de la zero**: jurnalul ține
amprenta (SHA-256) funcțiilor `reversalScore`, `analyze`, `capSectors`, `rankResults` din `candidate-engine/engine.js`; evaluarea
folosește doar zilele cu amprenta de acum. Codul: `lib/reversal-umbra.mjs` (`PROTOCOL.id = 'reversal-umbra-1'`).

## Ipoteza (una singură)
- **Stopul de azi (A):** `preț − 1,25 × ATR14` — exact `stop` din planul motorului.
- **Stopul sub bază (B):** `minimul pe 60 de zile − 0,25 × ATR14` — minimul e cel pe care motorul îl calculează deja
  (`min60` din `analyze`, citit înapoi din `metricB` = revenirea din minim: `minim = preț / (1 + metricB / 100)`), ATR-ul e `atr` al
  candidatului.
- **Ipoteza:** pe candidații Early Reversal, planul cu stopul B are un **R mediu pe tranzacție mai mare** decât planul cu stopul A.
- Unilateral: întrebarea e doar „B e mai bun?”. Nu se caută și alte variante (alt multiplu de ATR, altă fereastră) — fiecare încercare
  în plus ar crește șansa unei „dovezi” false.

## Ce se notează (zilnic, în același robot ca proba Top Long)
- Robotul `tools/premarket-jurnal.mjs`, după scanarea Top Long (aceeași rulare, același motor, aceleași bare; nicio cerere în plus la
  scanare), citește lista **Early Reversal din ziua respectivă** (`state.reversal`: candidații eligibili, plafonați pe sector, cum îi
  vede omul în pagină) și notează pentru fiecare: simbolul, data EOD, prețul de intrare, ATR14, minimul bazei, stopul A, stopul B,
  scorul și starea. Nimic nu se recalculează altfel decât în motor; `analyze` rămâne neatins.
- Jurnal SEPARAT: `scanner-verdicts/generated/reversal-umbra-jurnal.json`; evaluarea în `reversal-umbra-proba.json`.
- Dacă umbra pică (o eroare a ei), ziua Top Long se salvează oricum.

## Cum se măsoară o tranzacție (fixat acum)
- **Intrarea = închiderea EOD a zilei semnalului** (prețul candidatului) — aceeași convenție ca proba Top Long și prețul de la care
  motorul își calculează stopul. Intrarea reală (a doua zi) nu e modelată; e aceeași pentru A și B, deci nu favorizează niciun stop.
- Pentru fiecare stop separat: riscul `R = intrare − stop`, ținta = `intrare + 2R`, cel mult **20 de sesiuni** ale acțiunii după ziua
  semnalului. Sesiune cu sesiune, pe barele zilnice:
  - deschiderea ≤ stop ⇒ ieșire la deschidere (gap peste stop, R sub −1); deschiderea ≥ țintă ⇒ ieșire la deschidere;
  - minimul ≤ stop ⇒ ieșire la stop; maximul ≥ țintă ⇒ ieșire la țintă; **stop și țintă în aceeași bară ⇒ STOPUL** (prudent);
  - fără stop/țintă în 20 de sesiuni ⇒ ieșire la închiderea sesiunii 20.
- Rezultatul în R = `(ieșire − intrare) / R`, fără costuri. O tranzacție intră în evaluare doar când are toate cele 20 de sesiuni după
  ea (altfel stopurile rapide ar fi numărate înaintea celor lente).
- **Măsura principală:** pe zi, `D = media(R_B) − media(R_A)` pe candidații zilei. **Descriptiv:** R mediu A și B, rata de stop A și B
  (cât la sută se termină pe stop), numărul de tranzacții.

## Cum se judecă (fixat acum)
- Doar **perioade care nu se suprapun** (k = 20 de sesiuni, calendarul SPY): prima zi cu rezultat, apoi prima zi din jurnal aflată la
  ≥ 20 de sesiuni după precedenta (aceeași funcție `starturi` ca probele V1 și Top Long). O perioadă contează cu **cel puțin 1**
  tranzacție cu rezultat.
- **Minimum 8 perioade** pentru orice verdict (≈ 8 luni).
- **Testul: t unilateral pe diferențele D ale perioadelor, prag t > 3,0** (nu testul semnelor). De ce, măsurat ÎNAINTE de date prin
  simulare pe prețuri aleatorii fără avantaj (mulberry32, sămânță fixă, drum intrazilnic în 40 de pași, `tools/reversal-umbra.test.mjs`):
  - Fără avantaj (R mediu 0 pentru ambele stopuri), diferența `R_B − R_A` e ASIMETRICĂ: mediana e pozitivă — fără diferențele
    exact 0 (ambele stopuri lovite: −1 R și −1 R), o perioadă iese pozitivă în 55–60 % din cazuri, nu 50 %. Testul semnelor (cel din
    probele V1 / Top Long) dă „dovezi” false în 3,4 % la 8 perioade, dar 8–10 % la 24 și 12,5 % la 48 — cu cât umbra merge mai mult,
    cu atât minte mai des. Respins.
  - Testul t obișnuit (prag 1,895) dă 8,6 % false la 8 perioade (asimetria la puține perioade) și ~18 % cu priviri repetate. Respins.
  - **t > 3,0, cu verdictul recalculat după fiecare perioadă nouă de la 8 la 36 (≈ 3 ani):** „dovezi” false în 2,4–4,0 % (sub 5 %);
    la un număr fix de perioade sub 1 %. Testul din suită (300 de lumi, priviri de la 8 la 24): 4,0 %, iar testul semnelor la 24 de
    perioade 10,0 %.
- **Puterea, spusă cinstit:** dacă stopul B ar aduce în medie +0,3 R pe tranzacție, verdictul „ajută” iese în ~11 % din cazuri la 8
  perioade și ~27 % la 36. Umbra poate prinde doar un avantaj mare; „nu s-a văzut un avantaj” va fi rezultatul cel mai probabil
  și NU înseamnă că stopul sub bază e rău.

## Verdictele (fixate acum)
- **„Încă nu se poate spune”** (`astept`) — mai puțin de 8 perioade.
- **„Stopul sub bază ajută”** (`baza-ajuta`) — cel puțin 8 perioade, media D > 0 și t > 3,0.
- **„Nu s-a văzut un avantaj”** (`fara-avantaj`) — altfel. NU înseamnă „s-a dovedit că nu ajută”.
- Abia după „Stopul sub bază ajută” stopul se poate muta în motor — și atunci proba Top Long repornește (amprenta `analyze` se
  schimbă), cu protocolul ei rescris înainte.

## Ce NU face umbra
- Nu schimbă nimic în aplicație: nici stopul, nici ținta, nici lista; e doar un jurnal în plus.
- Nu ține cont de costuri (un stop mai larg înseamnă o poziție mai mică la același risc, deci costul în R e mai mic — asta ar favoriza
  ușor stopul B; nu intră în măsură), spread, gap-ul de a doua zi la intrare sau dimensiunea poziției.
- Nu judecă lista Early Reversal (dacă are avantaj) și nici ținta de 2R — doar care stop e mai bun pe aceleași intrări.
- Nu caută alt multiplu de ATR sau altă fereastră a bazei; o variantă nouă = protocol nou, scris înainte, cu umbra pornită de la zero.

## Amprenta judecătorului și câmpurile pentru panouri (27.10.2026, I-743 / I-744 — umbra NU repornește)
Scris pe **27.10.2026**, cu umbra la 1 zi în jurnal (23.10, amprenta listei `ru-1965691ef15a`) și 0 perioade. **Regulile de mai sus nu se
schimbă** (ipoteza, stopurile, măsura, perioadele, t > 3,0, minimum 8): se îngheață doar, în plus, codul care le aplică.
- **Amprenta judecătorului: `ju-0916cb874187`** = SHA pe funcțiile din `lib/reversal-umbra.mjs` care măsoară și judecă (`rezultat`,
  `tranzactii`, `medie`, `tStat`, `evalueaza`, `starturi` din `lib/v1-proba.mjs`) și pe pragurile din `PROTOCOL`. Robotul o scrie în
  `reversal-umbra-proba.json` (`judecator`); garda `tools/probe-amprente.test.mjs` pică dacă codul de azi dă alta. O schimbare a
  judecătorului = protocol nou, cu umbra pornită de la zero (cum scrie sus).
- **Câmpurile pentru panouri:** `putere` (cea scrisă pe 19.10: +0,3 R pe tranzacție ⇒ ~11 % la 8 perioade, ~27 % la 36; unitatea e R,
  nu %), `primulVerdict` (8 perioade de 20 de sesiuni pe calendarul NYSE: optimist ~**15.06.2027**, realist după zilele pierdute) și
  `judecata` cu `unic: false` — verdictul umbrei e **secvențial** prin construcție (recalculat după fiecare perioadă, cu pragul t > 3,0
  ales tocmai pentru privirile repetate), nu o judecată unică.
