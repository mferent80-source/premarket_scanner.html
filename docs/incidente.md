# Registrul de incidente — Decision App

> I-760 (27.10.2026). Un incident = ceva care a mers prost în aplicație, în roboți sau în felul de lucru: **ce s-a întâmplat, când, impactul, cauza, ce s-a schimbat după**. Se notează în Jurnal → Risc & capital → „📒 Registrul de incidente” (rămâne **deschis** până are măsura scrisă), apoi butonul „Copiază pentru docs/incidente.md” dă textul de lipit aici, cel mai nou sus. Fișa zilei primește un rând cu incidentele noi și cele deschise. Politica: `docs/politica-de-risc.md` § 3 (adăugirile lotului C).
>
> Gravitate: **mic** (incomod, fără date sau bani pierduți) · **mediu** (o probă / un ecran a mințit sau a tăcut, fără bani) · **mare** (date pierdute, o gardă de risc ocolită, bani expuși).

## Incidente

### 2026-10-28 · Portofoliul ascundea tăcut o poziție nouă sub filtrul ținut minte · gravitate mediu
- **Ce s-a întâmplat:** TE, cumpărată pe 27.10 seara, s-a văzut în Portofoliu la prima deschidere și apoi n-a mai apărut; pagina nu spunea de ce.
- **Impact:** o poziție reală părea lipsă din aplicație (fără bani pierduți); timp pierdut căutând cauza în sincronizare și la broker.
- **Cauza:** filtrul listei se ține minte pe aparat (`tt_holdings_filters_v1`): „De revizuit · tehnic și plan” arată doar pozițiile care cer revizuire, iar „Schimbate de la ultima vizită” marchează o poziție nouă doar la prima deschidere; sub oricare din ele poziția nouă ieșea din listă fără nicio urmă.
- **Ce s-a schimbat:** sub „X / Y dețineri afișate” apare „TE · poziție nouă (cumpărată 27.10) · ascunsă de filtrul «…» · Arată”, cu noutatea luată din execuțiile contului, apoi din istoricul zilnic, apoi din reperul vizitei (I-765); ordinele de cumpărare în așteptare se spun și în Portofoliu, nu doar în Cont · broker (I-766); `lib/holdings-ascunse.js`, `tools/holdings-ascunse.test.mjs`.
- **Stare:** închis.

### 2026-10-27 · Robotul probei V1 pierduse 5 din 7 sesiuni fără alarmă · gravitate mare
- **Ce s-a întâmplat:** robotul care notează proba Reguli V1 / Top Long / umbra Reversal nu a scris 5 din ultimele 7 sesiuni; nimic nu a anunțat lipsa.
- **Impact:** 5 sesiuni lipsă din probele în timp (eșantionul probei mai mic, judecata amânată).
- **Cauza:** o singură încercare pe zi, fără mesaj la eșec și fără rulare de rezervă.
- **Ce s-a schimbat:** reîncercare după 3 minute, mesaj pe Discord cu motivul, rulare de rezervă dimineața (10:15 UTC, `DOAR_LIPSA=1` notează doar ziua lipsă) — commit `d0cee8ed`.
- **Stare:** închis.

### 2026-10-27 · Restaurarea copiei locale ștergea registrele absente din copie · gravitate mare
- **Ce s-a întâmplat:** la restaurarea unei copii locale, registrele care nu existau în copie erau șterse, iar ștergerea pleca în cont și pe celălalt aparat.
- **Impact:** risc de pierdere a registrelor pe ambele aparate (descoperit în auditul din 27.10, înainte de o pierdere raportată).
- **Cauza:** restaurarea trata „lipsă din copie” ca „de șters”.
- **Ce s-a schimbat:** restaurarea nu mai șterge registrele absente și numește ce a rămas neatins (`app/cloud-sync.js`) — commit `d0cee8ed`.
- **Stare:** închis.

### 2026-10-27 · Robotul Clasificatorului oprit de garda I-669 (ieșire de peste 1 MB) · gravitate mediu
- **Ce s-a întâmplat:** la 09:18 robotul a picat: garda I-669 citea jurnalul de voturi cu `git show` fără `maxBuffer`, iar jurnalul trecuse de 1 MB.
- **Impact:** clasificarea zilei nu s-a scris până la reparație.
- **Cauza:** `execFileSync` are implicit un buffer de 1 MiB.
- **Ce s-a schimbat:** `maxBuffer` 256 MB (și în robotul verdictului pieței); capcana e scrisă în regulile agenților — commit `d0cee8ed`.
- **Stare:** închis.

### 2026-10-27 · Panoul „De ce este în top” nu se mai scria (comentariu care înghițea codul) · gravitate mediu
- **Ce s-a întâmplat:** pentru Top Long / Reversal panoul cu motivele nu apărea: un comentariu `//` pus la mijlocul unui rând transforma restul rândului în comentariu.
- **Impact:** motivele clasamentului lipseau de pe ecran (deciziile se luau fără ele).
- **Cauza:** cod lipit pe același rând după un comentariu de linie.
- **Ce s-a schimbat:** panoul reparat + gardă pe tot depozitul: `tools/comentariu-la-mijloc.test.mjs` — commit `d0cee8ed`.
- **Stare:** închis.

### 2026-10-27 · Poarta de teste nu a pornit pentru reparațiile auditului · gravitate mic
- **Ce s-a întâmplat:** mesajul commitului `d0cee8ed` cita marcajul de sărit al CI, deci suita nu a rulat pe CI pentru el.
- **Impact:** reparațiile auditului au stat câteva minute pe ramura principală fără poarta de teste pe server (suita locală trecuse).
- **Cauza:** marcajul de sărit e recunoscut oriunde în mesaj, și când e doar pomenit.
- **Ce s-a schimbat:** poarta pornită separat (`46eb0d29`); regula „fără cuvintele de sărit al CI în mesaje” e în planul agenților.
- **Stare:** închis.
