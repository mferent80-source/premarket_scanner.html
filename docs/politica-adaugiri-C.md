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
