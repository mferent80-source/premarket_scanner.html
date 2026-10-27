# Adăugiri la politica de risc — lotul A (carcasă, sincronizare, Health, Setări) · 27.10.2026

Coordonatorul le unește în `docs/politica-de-risc.md` (rândurile de tabel în § 2, restul în § 1 / § 5, plus o linie în § 6 Istoricul schimbărilor).

## § 2 — rânduri noi / completări în tabelul pragurilor

| Regula | Pragul | Unde | Ce face | De ce |
|---|---|---|---|---|
| Stopul **la broker** pe server (I-749) | fișa zilei numără pozițiile **fără ORDIN de stop întreg** la Trading 212 (ordinele în așteptare citite prin releu, doar GET, o dată pe zi după închiderea NYSE) | `lib/cloud-monitor.mjs` (fișa zilei: inbox + Discord) | „N poziții fără ORDIN de stop la broker”, cu „stop doar pe hârtie” și „ordin doar pentru o parte” numite; ordinele necitite ⇒ motivul + „stopuri documentate, neverificate la broker” | Un stop scris doar în teză nu execută nimic în lipsa ta; alerta trebuie să ajungă și pe telefon, nu doar pe PC. |
| Căldura din fișa zilei | până la **stopul care execută**: ordinul de stop întreg de la broker; altfel stopul documentat valabil; fără niciunul ⇒ **NECUNOSCUTĂ** | `fisaZilei` | nu adună parțial | Închis la eroare: o poziție fără stop face căldura necunoscută, nu mai mică. |
| Definiția stopului pe server | aceeași cu aplicația: `StopSetter.stopValabil` (pus / schimbat după deschiderea poziției de acum, −1 h toleranță) | copie în `lib/cloud-monitor.mjs`, test de echivalență `tools/cloud-monitor-stop.test.mjs` | stopul rămas în teza unei poziții vândute nu mai acoperă poziția nouă nici în alertele de pe server | A treia definiție a stopului (fără `openedAt`) dispare. |
| Zilele fără bursă | fișa zilei doar în zilele de tranzacționare NYSE; în zilele scurte după 13:05 New York | `dupaInchidere` (copia `ExchangeCalendar.markets.US`, testată) | fără fișă de sărbători | O fișă „a zilei” într-o zi fără bursă e zgomot. |
| Doi cititori Trading 212 (I-748) | două aparate cu citiri ale aceluiași cont în ultimele **5 minute** | Setări, Health (cheia sincronizată `tt_t212_cititori_v1`) | avertisment cu aparatele și vechimea | Limita de cereri a brokerului se împarte; regula „un singur cititor” (I-713) devine verificabilă. Toleranța la ceasul decalat între aparate: **15 min**. |

## § 1 — principii (completare la „Închis la eroare”)

- **Proba de ecran după publicare (I-747).** După fiecare publicare cu o versiune nouă, proba de ecran (`tools/proba-ecran-decizie.mjs`, Chrome headless în GitHub Actions) deschide paginile Decision App de două ori; rezultatul stă în `health/generated/proba-ecran.json` și în Health. Roșu ⇒ Discord. Dacă site-ul nu servește versiunea din depozit în 10 minute, proba e **roșie** (nu verde pe versiunea veche).
- **Securitatea sincronizării la vedere (I-748).** Allowlist-ul Google (`GOOGLE_ALLOWED_SUB`) lipsă ⇒ **roșu** în Cont & sincronizare și în Health (orice cont Google ar putea folosi serviciul ca stocare); sesiunile active și ultimul login se văd acolo.
- **Secretele nu stau în cache-ul persistat (I-746).** Copia locală a contului (IndexedDB, `records:<cont>`) nu ține valoarea conexiunii Trading 212 și nici cheia / parola Radarului — doar revizia și ora; valoarea se recitește din cont. Cache-ul se șterge la deconectare și la ștergerea conexiunii.
- **Health doar citește** oprirea de urgență (`tt_governor_oprire_v1`) și reconcilierea cu brokerul (`tt_reconciliere_v1`): o formă necunoscută se spune ca „nu pot verifica”, nu ca verde; re-armarea rămâne doar în formularul Governor, cu motiv.

## § 6 — linia pentru istoric

| 2026-10-27 | Lotul A: fișa zilei cu ordinele brokerului și o singură definiție a stopului pe server (I-749); proba de ecran automată după publicare (I-747); securitatea sincronizării și „doi cititori” la vedere (I-748); secretele în afara cache-ului persistat (I-746) | lotul A, auditul 27.10 |
