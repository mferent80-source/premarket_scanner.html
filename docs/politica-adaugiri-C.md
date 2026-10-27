# Adăugiri la politica de risc — lotul C (Jurnal, capital, Governor, Raport) · 27.10.2026

> Paragrafele de mai jos se unesc de coordonator în `docs/politica-de-risc.md` (secțiunile indicate). Pragurile sunt **convenții de prudență scrise înainte de date**, nu avantaj dovedit: „nu s-a dovedit” ≠ „s-a dovedit că nu”.

## § 2 · Fusul fiecărei limite (I-751)

- **Ziua, săptămâna și luna** limitelor (pierderea zilei / săptămânii, tranzacțiile pe zi, limita lunară, cooldown-ul, „Azi” din Închise, curba de capital) se socotesc pe **un singur ceas: New York** (`CT.ziNY` / `CT.lunaNY`). O vânzare la 19:30 NY pe 31 aparține lunii în care s-a făcut, nu celei următoare.
- **Raportul săptămânal** (I-710) e singura excepție de fus: săptămâna ISO pe ora României; pleacă **luni de la 09:00 (ora României)** de pe aparatul care citește Trading 212; aparatul care nu citește (I-713) trimite abia **de la 12:00**, dacă marcajul săptămânii nu a venit prin sincronizare.

## § 2 · DD rolling în moneda contului (I-751)

- Curba de capital și **DD rolling se calculează în moneda contului** (EUR pentru contul Trading 212 în EUR): snapshot-ul automat ține suma locală și cursul BCE; ce e doar în USD (snapshot pus de mână, execuții manuale, mișcări puse de mână) intră la cursul celui mai apropiat snapshot automat. **USD doar la afișare**, la un singur curs (cel verificat azi, altfel al ultimului snapshot). Cursul EUR/USD nu mai produce DD fals și nu mai maschează o scădere reală.
- Curba veche (doar USD) s-a migrat **o singură dată**, cu copie locală (`tt_equity_snapshots_v1_copie_usd`, `tt_equity_events_v1_copie_usd`), din notele snapshot-urilor automate. Cu aceasta, frâna pe DD rolling (`ddRollingOn`) poate fi repornită fără HALT fals din curs.

## § 3 · Schimbarea limitelor: override guvernat (I-760)

- **Strângerea** unei limite intră **imediat**. **Relaxarea** (prag mai mare de pierdere / DD / tranzacții / poziții / cooldown / concentrare / risc la stop / căldură, alunecare estimată mai mică, frâna DD oprită) intră **abia peste 24 de ore**, cere **motiv scris** și **expirare între 1 și 90 de zile**; după expirare limita revine singură la valoarea strictă. O strângere pe aceeași limită anulează relaxarea programată.
- Jurnalul limitelor notează și programarea (stare, când intră, când expiră, motivul); Governor spune relaxările programate / active în motive, fără să-și schimbe verdictul din cauza lor.

## § 3 · Oprirea de urgență și reconcilierea (contractele cu lotul E)

- Cât `tt_governor_oprire_v1.activ` e adevărat, Governor e **HALTED** cu ora, aparatul, motivul și ordinele anulate. **Re-armarea** se face doar din formularul Governor, cu **motiv obligatoriu**; istoria rămâne scrisă; 24 h după re-armare motivul ei apare ca notă.
- `tt_reconciliere_v1` cu `ok = false` ⇒ **CAUTION** cu lista diferențelor (pe calea brokerului prin T212Capital, altfel direct în Governor).

## § 3 · Registrul de incidente (I-760)

- Orice incident (ce a mers prost, când, impactul, cauza, ce s-a schimbat) se notează în Jurnal → Risc & capital → „Registrul de incidente” și se copiază în `docs/incidente.md`. Un incident rămâne **deschis** până are o măsură scrisă. Fișa zilei primește un rând cu incidentele noi și cele deschise.
- **Inventarul gărzilor** (`docs/inventar-modele.md`) e generat din cod; fiecare gardă are testul care o declanșează; rularea de validare se face **trimestrial** (`node tools/inventar-garzi.mjs --ruleaza`), iar suita e roșie dacă o gardă nouă n-are test.

## § 4 · Tiparele de comportament și Tiltmeter (I-761)

- Raportul arată patru tipare, calculate **mecanic** din ordinele Trading 212 (nu din etichete puse de mână): **răzbunare** = o cumpărare la mai puțin de **30 de minute** după o ieșire pe pierdere; **mărime crescută după 2 pierderi** = după două ieșiri pe pierdere la rând, o cumpărare mai mare de **1,25 × mediana ultimelor 5 cumpărări** (în moneda contului); **pierdere peste stop** = R sub **−1,25** față de stopul **planului** (analiza salvată sau stopul pus la intrare — nu stopul pus ulterior în Portofoliu); **din frig** = prima cumpărare a fiecărei zile New York.
- Pentru fiecare: n, R mediu față de restul, numărul pe ultimele **4 săptămâni** și un buton care filtrează tot raportul la tranzacțiile lui. **Sub 10 cazuri** cifrele se arată cu „prea puține cazuri” — nu se trage nicio concluzie.
- **Tiltmeter**: trei note pe zi (somn, concentrare, stres; 1–5), salvate în setările Jurnalului (sincronizate), puse lângă R-ul zilei (suma R a ieșirilor din ziua New York); comparația „jos (1–2)” față de „sus (4–5)” apare pe zilele cu tranzacții. Sub 10 zile: „prea puține zile”.
- Pragurile sunt **convenții de prudență scrise înainte**, nu avantaj dovedit; un tipar care nu „costă” încă nu e dovada că nu costă.

## § 4 · MAE / MFE din barele intraday (I-762)

- Pentru tranzacțiile închise din SUA, Raportul calculează **la cerere** (butonul din panou) cât a mers prețul împotriva ta (**MAE**) și în favoarea ta (**MFE**) între intrare și ieșire, din barele Yahoo de **1 minut** (intrarea în ultimele 7 zile) sau **5 minute** (până la 60 de zile); rezultatul rămâne pe aparat (`tt_journal_mae_v1`), deci se calculează **la închidere**, nu retroactiv.
- Intră doar barele aflate **integral** în fereastra deținerii, plus prețurile tale de intrare și ieșire (fără prețurile de dinainte de cumpărare sau de după vânzare). Prețurile Yahoo care nu se potrivesc cu ale tale (split, altă bursă) ⇒ „nepotrivit”, fără cifre.
- „Cea mai bună ieșire” (maximul din fereastră) se vede **doar după**: arată spațiul pe care l-a avut prețul, nu o regulă care putea fi urmată. Sub 10 tranzacții calculate: prea puține ca să spună ceva.

## § 4 · Ziua, ratatele, heatmap-ul și bifele planului (I-763, partea Jurnal)

- **Etichetele zilei** (regim: trend / lateral / volatil / zi cu știri; stare: odihnit / obosit / grăbit / bolnav; emoție: calm / FOMO / frică / frustrare / prea sigur) se pun pe ziua New York și stau în setările sincronizate ale Jurnalului; Raportul arată, pe fiecare etichetă, câte zile, câte tranzacții închise, rezultatul și R mediu. Descriptiv, nu cauzal.
- **Tranzacțiile ratate**: simbolul, ziua, motivul („Governor HALTED”, „fără plan”…) și, opțional, prețul de atunci; Raportul citește barele zilnice și arată ce a făcut prețul în **cel mult 5 sesiuni** după (față de prețul tău sau, fără el, de închiderea zilei). O ratată care a urcat nu înseamnă că regula a greșit: regula se judecă pe toate, nu pe una.
- **Heatmap-ul zi × oră** (intrările din SUA, ora New York) arată media rezultatului și numărul de tranzacții pe celulă; culorile vin din token-urile Raportului (divergent: câștig / pierdere, mijloc neutru), cu valoarea scrisă în celulă și liniuță pe pierderi. O celulă cu câteva tranzacții nu e un obicei.
- **Bifele planului** (`plan.bife`, scrise de tichetul Planuri): Disciplina arată „n/m reguli respectate” pe intrările legate de un plan cu bife; o regulă nebifată nu e încălcare de Governor, e disciplina ta, la vedere.
